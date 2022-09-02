// Run search functions for different CMPs from here
// Just waiting for the page to be loaded sometimes isn't enough for fully getting the DOM
// therefore we wait an additional second.
// Just waiting for the document to load isn't enough somehow, that's why we wait for an additional second
const _ = setTimeout(async () => {
  let consentNotice;
  consentNotice = await searchCookiebot();
  if (consentNotice) {
    console.log("Cookiebot notice:\n", consentNotice);
  }
  consentNotice = await searchOnetrust();
  if (consentNotice) {
    console.log("Onetrust notice:\n", consentNotice);
    chrome.storage.local.get("scan", (res) => {
      if (res && res.scan && !res.scan.consentNotice) {
        res.scan.consentNotice = consentNotice;
        chrome.storage.local.set({"scan": res.scan });
      }
    });
  }
}, 1000);

const CATEGORIES = ["Necessary", "Functionality", "Analytical", "Advertising", "Uncategorized"];
const KEYWORD_MAPPING = {
  "Necessary": ["mandatory", "essential", "necessary", "required"],
  "Functionality": ["functional", "security", "video", "preference", "secure", "social"],
  "Analytical": ["measurement", "analytic", "anonym", "research", "performance"],
  "Advertising": ["ad selection", "advertising", "advertise", "targeting", "sale of personal data", "marketing", "tracking", "tracker", "fingerprint"],
  "Uncategorized": ["uncategorized", "unknown"]
};

// We can't move this function to a different file because no imports are allowed outside a module
async function searchCookiebot() {
  // TODO: Maybe not everywhere the script tag has the id CookieBlock -> Search for cbid in whole DOM
  const el = document.getElementById("Cookiebot");
  if (!el) {
    return null;
  }

  // TODO: More patterns (see Dino)
  const pattern1 = new RegExp("[&?]cbid=([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})");

  const cbidMatches = el.src.match(pattern1);
  if (!cbidMatches) {
    return null;
  }

  const cbid = cbidMatches.find((m) => m.length === 36);
  if (!cbid) {
    return null;
  }

  console.log("Found Cookiebot cbid: ", cbid);

  // TODO: Dino doesn't necessarily take the current URL as a referrer.
  console.log(`https://consent.cookiebot.com/${cbid}/cc.js?referer=${document.URL}`);
  // TODO: cors-anywhere is used to circumvent CORS protection. Here just the demo version is used for testing
  // -> Hosting our own cors-anywhere is the only workaround I see
  let res = await fetch(`https://cors-anywhere.herokuapp.com/https://consent.cookiebot.com/${cbid}/cc.js?referer=${document.URL}`);
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
  //console.log("Consent Notice: ", consentNotice);
  return parseCookieDataCookiebot(consentNotice);
}

function parseCookieDataCookiebot(consentNotice) {
  for (let cat of CATEGORIES) {
    if (!consentNotice[cat]) {
      continue;
    }
    let cookies = [];
    for (let c of consentNotice[cat]) {
      cookies.push({
        "name": c[0],
        "host": c[1],
        "description": c[2]
      });
    }
    consentNotice[cat] = cookies;
  }
  return consentNotice
}

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
      cookies.push({
        "name": c.Name,
        "host": c.Host,
        "description": (c.description) ? c.description : null
      });
    }
    consentNotice[cat] = cookies;
  }
  return consentNotice
}