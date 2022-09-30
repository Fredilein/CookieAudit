/**
 * consentNotice.js
 * ----------------
 * In this file we parse the consent notice for different CMPs. Currently Cookiebot and OneTrust are implemented.
 * A populated cookieNotice object should look as follows:
    { "Necessary": [],
      "Functionality": [],
      "Analytical": [],
      "Advertising": [],
      "Uncategorized": [] }
 * Each array should be populated with the declared cookies for the corresponding category.
 * Currently we parse the following from each declared cookie:
   { "name": <string>,
     "host": <string>,
     "description": <string>,
     "expiry": <number (in seconds)>,
     "session": <boolean> }
 */

const SCANSTAGE = ["initial", "necessary", "all", "finished"];
const CATEGORIES = ["Necessary", "Functionality", "Analytical", "Advertising", "Uncategorized"];

const KEYWORD_MAPPING = {
  "Necessary": ["mandatory", "essential", "necessary", "required"],
  "Functionality": ["functional", "security", "video", "preference", "secure", "social"],
  "Analytical": ["measurement", "analytic", "anonym", "research", "performance"],
  "Advertising": ["ad selection", "advertising", "advertise", "targeting", "sale of personal data", "marketing", "tracking", "tracker", "fingerprint"],
  "Uncategorized": ["uncategorized", "unknown"]
};

/**
 * Here are the entry points to search for a CMP.
 * If the code for detecting a new CMP is added, also make sure to call this code in this function and store cookieNotice
 * object in the scan object.
 */
const _ = setTimeout(async () => {
  // Just waiting for the document to load isn't enough sometimes, that's why we wait for an additional second
  chrome.storage.local.get("scan", async (res) => {
    if (res && res.scan && (res.scan.consentNotice || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3])) {
      return;
    }
    let consentNotice;
    consentNotice = await searchCookiebot();
    if (consentNotice) {
      console.log("Cookiebot notice:\n", consentNotice);
      res.scan.consentNotice = consentNotice;
      chrome.storage.local.set({"scan": res.scan});
    }
    consentNotice = await searchOnetrust();
    if (consentNotice) {
      console.log("Onetrust notice:\n", consentNotice);
      res.scan.consentNotice = consentNotice;
      chrome.storage.local.set({"scan": res.scan});
    }
  });
}, 1000);

// =====================
// ===== Cookiebot =====
// =====================
async function searchCookiebot() {
  // TODO: Maybe not everywhere the script tag has the id CookieBlock -> Search for cbid in whole DOM
  const el = document.getElementById("Cookiebot");
  if (!el) {
    return null;
  }

  const cbidPattern = new RegExp("[&?]cbid=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");
  const cbidMatches = el.src.match(cbidPattern);
  if (!cbidMatches) {
    return null;
  }

  const cbid = cbidMatches.find((m) => m.length === 36);
  if (!cbid) {
    return null;
  }

  // TODO: Dino doesn't necessarily take the current URL as a referrer.
  console.log(`https://consent.cookiebot.com/${cbid}/cc.js?referer=${document.URL}`);
  // -> We host our own cors-everywhere on heroku to circumvent CORS protection
  let res = await fetch(`https://secure-taiga-11828.herokuapp.com/https://consent.cookiebot.com/${cbid}/cc.js?referer=${document.URL}`);
  if (!res.ok) {
    console.error(`Status ${res.status}: Something went wrong while fetching the CookieBot consent notice`);
    return null;
  }
  const jsContents = await res.text();

  if (jsContents.includes("CookieConsent.setOutOfRegion")) {
    console.error(`Received an out of region error: ${jsContents}`);
    return null;
  } else if (jsContents.includes("cookiedomainwarning='Error")) {
    console.error(`Cookiebot doesn't recognize referer ${document.URL} with cbid ${cbid} as a valid domain.`);
    return null;
  } else if (jsContents.trim().length === 0) {
    console.error(`Empty response`);
    return null;
  }

  const cookiebotPatterns = {
    "Necessary": new RegExp("CookieConsentDialog\\.cookieTableNecessary = (.*);"),
    "Functionality": new RegExp("CookieConsentDialog\\.cookieTablePreference = (.*);"),
    "Analytical": new RegExp("CookieConsentDialog\\.cookieTableStatistics = (.*);"),
    "Advertising": new RegExp("CookieConsentDialog\\.cookieTableAdvertising = (.*);"),
    "Uncategorized": new RegExp("CookieConsentDialog\\.cookieTableUnclassified = (.*);")
  };

  let matches;
  let consentNotice = {
    "Necessary": null,
    "Functionality": null,
    "Analytical": null,
    "Advertising": null,
    "Uncategorized": null
  };
  for (let cat of CATEGORIES) {
    matches = jsContents.match(cookiebotPatterns[cat]);
    if (matches.length < 2) {
      console.error(`Couldn't read matches for ${cat} cookies`);
    }
    consentNotice[cat] = JSON.parse(matches[1]);
  }
  return parseCookieDataCookiebot(consentNotice);
}

function parseCookieDataCookiebot(consentNotice) {
  for (let cat of CATEGORIES) {
    if (!consentNotice[cat]) {
      continue;
    }
    let cookies = [];
    for (let c of consentNotice[cat]) {
      const expiry = parseExpiryCookiebot(c[3]);
      const session = expiry === "session";
      cookies.push({
        "name": c[0],
        "host": c[1],
        "description": c[2],
        "expiry": expiry,
        "session": session
      });
    }
    consentNotice[cat] = cookies;
  }
  return consentNotice
}

function parseExpiryCookiebot(expiry_str) {
  const second_pattern = new RegExp("(second(s)?|sekunde(n)?)", 'i');
  const minute_pattern = new RegExp("(minute[ns]?)", 'i');
  const hour_pattern = new RegExp("(hour(s)?|stunde(n)?)", 'i');
  const day_pattern = new RegExp("(day(s)?)", 'i');
  const week_pattern = new RegExp("(week(s)?|woche(n)?)", 'i');
  const month_pattern = new RegExp("(month(s)?)", 'i');
  const year_pattern = new RegExp("(year(s)?|jahr(e)?)", 'i');

  if (expiry_str.toLowerCase() === "session") {
    return "session";
  }
  if (expiry_str.toLowerCase() === "persistent" || expiry_str.toLowerCase() === "persistant") {
    return "persistent";
  }

  const expiry = expiry_str.split(' ');
  let count, interval;
  let totalcount = 0;
  if (expiry.length % 2) {
    console.error(`Odd length expiry string: "${expiry_str}"`);
    return;
  }
  for (let i = 0; i < expiry.length / 2; i += 2) {
    count = Number(expiry[i]);
    interval = expiry[i + 1];
    if (interval.match(second_pattern)) {
      totalcount = totalcount + count;
    } else if (interval.match(minute_pattern)) {
      totalcount = totalcount + count * 60;
    } else if (interval.match(hour_pattern)) {
      totalcount = totalcount + count * 3600;
    } else if (interval.match(day_pattern)) {
      totalcount = totalcount + count * 3600 * 24;
    } else if (interval.match(week_pattern)) {
      totalcount = totalcount + count * 3600 * 24 * 7;
    } else if (interval.match(month_pattern)) {
      totalcount = totalcount + count * 3600 * 24 * 30;
    } else if (interval.match(year_pattern)) {
      totalcount = totalcount + count * 3600 * 24 * 365;
    } else {
      console.error(`Unknown date format: ${expiry_str}`);
    }
  }

  return totalcount;
}

// ====================
// ===== OneTrust =====
// ====================
async function searchOnetrust() {
  const el = document.querySelector('script[data-domain-script]');
  if (!el) {
    return null;
  }
  const dd_uuid = el.getAttribute("data-domain-script");

  const possibleDomains = [
    "cdn-apac.onetrust.com",
    "cdnukwest.onetrust.com",
    "cdn.cookielaw.org",
    "optanon.blob.core.windows.net",
    "cookie-cdn.cookiepro.com",
    "cookiepro.blob.core.windows.net"
  ];
  let consentNoticeDomain;
  for (let domain of possibleDomains) {
    if (el.src.includes(domain)) {
      consentNoticeDomain = domain;
      break;
    }
  }
  if (!consentNoticeDomain) {
    return null;
  }
  let res = await fetch(`https://${consentNoticeDomain}/consent/${dd_uuid}/${dd_uuid}.json`);
  if (!res.ok) {
    console.error(`Status ${res.status}: Something went wrong while fetching the OneTrust rulesets`);
    return null;
  }
  const rulesetJson = await res.json();
  let cc_uuid;
  for (let r of rulesetJson["RuleSet"]) {
    // TODO: We currently choose the ruleset for switzerland. Make dynamic
    if (r["Countries"].includes("ch")) {
      cc_uuid = r["Id"];
      break;
    }
  }
  if (!cc_uuid) {
    console.error("No matching ruleset found.");
    return null;
  }
  res = await fetch(`https://${consentNoticeDomain}/consent/${dd_uuid}/${cc_uuid}/en.json`);
  if (!res.ok) {
    console.error(`Status ${res.status}: Something went wrong while fetching the OneTrust consent notice`);
    return null;
  }
  const consentJson = await res.json();
  console.log("Complete OneTrust notice:\n", consentJson);
  const groups = consentJson["DomainData"]["Groups"];
  let consentNotice = {
    "Necessary": [],
    "Functionality": [],
    "Analytical": [],
    "Advertising": [],
    "Uncategorized": []
  };
  for (let group of groups) {
    for (let cat of CATEGORIES) {
      const groupName = group["GroupName"].toLowerCase();
      if (KEYWORD_MAPPING[cat].some((keyword) => groupName.includes(keyword))) {
        consentNotice[cat] = consentNotice[cat].concat(group["FirstPartyCookies"]);
      }
    }
  }
  //console.log("Consent Notice: ", consentNotice);
  return parseCookieDataOnetrust(consentNotice);
}

function parseCookieDataOnetrust(consentNotice) {
  for (let cat of CATEGORIES) {
    if (!consentNotice[cat]) {
      continue;
    }
    let cookies = [];
    for (let c of consentNotice[cat]) {
      const expiry = parseExpiryOnetrust(c.Length);
      cookies.push({
        "name": c.Name,
        "host": c.Host,
        "description": (c.description) ? c.description : null,
        "expiry": expiry,
        "session": c.IsSession
      });
    }
    consentNotice[cat] = cookies;
  }
  return consentNotice
}

function parseExpiryOnetrust(expiry_str) {
  if (expiry_str === "0") {
    return 60;
  } else {
    return Number(expiry_str) * 3600 * 24;
  }
}