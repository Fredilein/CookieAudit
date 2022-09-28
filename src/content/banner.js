const generalUrl =
  "https://raw.githubusercontent.com/easylist/easylist/master/easylist_cookie/easylist_cookie_general_hide.txt";

const BUTTONS_ACCEPT = ["akzeptieren", "zulassen", "accept", "allow", "allow all"];
const BUTTONS_REJECT = ["ablehnen", "deny", "necessary", "essential"];
const BUTTONS_SETTINGS = ["zwecke anzeigen", "preferänzen", "einstellungen", "settings", "preferences", "personalise", "verwalten", "anpassen", "zwecke"];

NONESSENTIAL_KEYWORDS = ["leistung", "funktionell", "marketing", "functional", "analytical", "advertising"];

if (typeof SCANSTAGE === 'undefined') {
  const SCANSTAGE = ["initial", "necessary", "all", "finished"];
}

/*
 * Load easylist from github
 */
const fetchEasylist = async function () {
  let res = await fetch(generalUrl);
  return handleEasylist(await res.text());
};

/*
 * Parse easylist
 */
const handleEasylist = function (data) {
  var easylist = [".t-consentPrompt"];
  const lines = data.split("\n");
  for (l in lines) {
    if (lines[l].slice(0, 2) === "##") {
      easylist.push(lines[l].slice(2));
    }
  }
  return easylist;
  // getCMP();
};

/*
 * Use easylist to find a selector which is potentially a cookie popup (of any kind)
 */
const getCMP = function (easylist) {
  let selectors = [];
  for (l in easylist) {
    const selector = document.querySelector(easylist[l]);
    if (selector) {
      console.log("[banner.js] Found following selector: ", selector);
      selectors.push(selector);
      // analyzeCMP(selector);
    }
  }
  return selectors;
};

/*
 * Analyze potential cookie popup and open finergrained preferences if available
 */
const analyzeCMP = function (selector) {
  const buttons = selector.querySelectorAll("Button");
  console.log("[#] Found following buttons:");
  buttons.forEach((btn) => {
    console.log(btn.innerHTML);
    // TODO: Craft a list here:
    if (btn.innerHTML.toLowerCase().includes("preferences") || btn.innerHTML.toLowerCase().includes("settings") || btn.innerHTML.toLowerCase().includes("einstellungen") || btn.innerHTML.toLowerCase().includes("personalise") || btn.innerHTML.toLowerCase().includes("verwalten") || btn.innerHTML.toLowerCase().includes("anpassen") || btn.innerHTML.toLowerCase().includes("zwecke")) {
      btn.click();
      console.log("[#] Clicked button ", btn.innerHTML);
      console.log("[#] Greater z index:");
      const greaterZ = greaterZIndex(selector);
      setTimeout(() => findCookieClasses(greaterZ[greaterZ.length - 1]), 1000);
    }
  });
};

const searchButtons = function (selector) {
  const buttons = selector.querySelectorAll("Button");
  const relevantButtons = {
    "accept": null,
    "reject": null,
    "settings": null
  };
  buttons.forEach((btn) => {
    // TODO: check part of button name
    if (BUTTONS_ACCEPT.includes(btn.innerHTML.toLowerCase())) {
      relevantButtons.accept = btn;
    } else if (BUTTONS_REJECT.includes(btn.innerHTML.toLowerCase())) {
      relevantButtons.reject = btn;
    } else if (BUTTONS_SETTINGS.includes(btn.innerHTML.toLowerCase())) {
      relevantButtons.settings = btn;
    }
  });
  return relevantButtons;
}

/*
 * Search for checkboxes in popup and see if a sibling has a label
 * TODO: Check if a label is in further relatives of the checkbox
 */
const findCookieClasses = function (popup) {
  const checkboxes = popup.querySelectorAll("input[type=checkbox]");
  console.log("[#] Checkboxes:");
  console.log(checkboxes);
  for (const c of checkboxes) {
    // if (text) console.log(text.textContent);
    const maybelabel = findTextInElement(c, 5);
    if (maybelabel) {
      if (c.checked) console.log("- [x] ", maybelabel);
      else console.log("- [ ] ", maybelabel);
    } else {
      console.log("[#] Found no label");
    }
  }
};

const nonessentialPreselected = function (popup) {
  const checkboxes = popup.querySelectorAll("input[type=checkbox]");
  for (const c of checkboxes) {
    const maybelabel = findTextInElement(c, 5);
    if (maybelabel) {
      if (c.checked) {
        for (let w of NONESSENTIAL_KEYWORDS) {
          if (maybelabel.toLowerCase().includes(w)) {
            console.log(`Checkbox ${maybelabel} is preselected`);
            return true;
          }
        }
      }
    }
  }
  return false;
}

const findTextInElement = function (element, iter) {
  if (iter == 0) return;
  const text = Array.from(element.parentElement.children).find(el => el.textContent);
  if (!text) {
    return findTextInElement(element.parentElement, iter - 1)
  } else {
    return text.textContent;
  }
}


const getZIndex = function (e) {
  var z = window.getComputedStyle(e).getPropertyValue("z-index");
  return z;
};

/*
 * Finds all large z indices
 * TODO: argument selector not used because:
 * TODO: Currently a popup never returns a larger z-index even though chromedevtool says otherwise...
 */
const greaterZIndex = function () {
  var elements = Array.from(document.querySelectorAll("body *"));
  const cur_z_index = 0;
  var filtered_elements = [];
  elements.forEach(function (element) {
    const z = getZIndex(element);
    if (z && parseInt(z) >= parseInt(cur_z_index)) {
      filtered_elements = filtered_elements.concat(element);
    }
  });

  var results = [];
  for (let e_1 of filtered_elements) {
    var contained_in_another_element = false;
    for (let e_2 of filtered_elements) {
      if (e_1 !== e_2 && e_2.contains(e_1)) {
        contained_in_another_element = true;
      }
    }
    if (contained_in_another_element === false) {
      results = results.concat(e_1);
    }
  }
  return results;
  // return Array.from(document.querySelectorAll('body *'))
  //       .map(a => window.getComputedStyle(a).getPropertyValue('z-index'))
  //       .filter(a => !isNaN(a))
  //       .sort()
  //       .pop();
};

// fetchEasylist();

const setWarning = function (warning) {
  chrome.storage.local.get("scan", (res) => {
    if (res && res.scan && (res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2])) {
      if (!res.scan.cmpWarnings.includes(warning)) {
        res.scan.cmpWarnings.push(warning);
        chrome.storage.local.set({ "scan": res.scan });
      }
    }
  });
}

const handler = setTimeout(async () => {
  chrome.storage.local.get("easylist", async (res) => {
    let easylist;
    if (!res || !res.easylist) {
      easylist = await fetchEasylist();
      console.log(`inserting ${easylist.length} items into easylist`);
      chrome.storage.local.set({"easylist": easylist});
    } else {
      easylist = res.easylist;
    }
    console.log(`checking ${easylist.length} items`);
    const cmps = getCMP(easylist);
    console.log(`found ${cmps.length} selectors`);
    for (let cmp of cmps) {
      const buttons = searchButtons(cmp);
      console.log(buttons);
      if (buttons.accept && buttons.reject) {
        console.log("accept and reject button found");
        return;
      } else if (buttons.accept && !buttons.reject && buttons.settings) {
        console.log("accept button found but no reject button");
        setWarning("noreject");
        buttons.settings.addEventListener("click", function () {
          console.log("clicked settings button");
          const advancedPopups = getCMP(easylist);
          setTimeout(() => {
            for (let p of advancedPopups) {
              if (nonessentialPreselected(p)) {
                setWarning("preselected");
                return;
              }
            }
          }, 2000);
        })
        return;
      }
    }
  });
}, 2000);