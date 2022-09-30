/**
 * banner.js
 * ---------
 * Analyzes the cookie banner. To detect such a banner on our website we use easylist.
 * - Checks if a reject button is present on the initial banner
 * - Checks if non-essential cookie categories are preselected
 */

const generalUrl =
  "https://raw.githubusercontent.com/easylist/easylist/master/easylist_cookie/easylist_cookie_general_hide.txt";

/**
 * Keywords for buttons and categories.
 * MV3 doesn't allow us to import from other files here, that's why it is defined in this file even though it adds some clutter.
 */
const BUTTONS_ACCEPT = ["akzeptieren", "zulassen", "accept", "allow", "allow all"];
const BUTTONS_REJECT = ["ablehnen", "deny", "necessary", "essential"];
const BUTTONS_SETTINGS = ["zwecke anzeigen", "preferänzen", "einstellungen", "settings", "preferences", "personalise", "verwalten", "anpassen", "zwecke"];

NONESSENTIAL_KEYWORDS = ["leistung", "funktionell", "marketing", "functional", "analytical", "advertising", "social"];

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
};

/*
 * Use easylist to find a selector which is potentially a cookie popup (of any kind)
 */
const getCMP = function (easylist) {
  let selectors = [];
  for (l in easylist) {
    const selector = document.querySelector(easylist[l]);
    if (selector) {
      selectors.push(selector);
    }
  }
  return selectors;
};

/**
 * Searches buttons on a potential popup banner
 * @param selector HTML selector which potentially is a banner
 * @returns {{settings: <button>, reject: <button>, accept: <button>}}
 */
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

/**
 * Searches all checkboxes and tries to find its corresponding label
 * @param popup potential popup banner
 * @returns {boolean} true if any non-essential category is preselected, false otherwise
 */
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

/**
 * Find nearest label to checkbox. Recursively search up <iter> steps to the parent element
 * @param element checkbox
 * @param iter how far above in the html tree we want to search
 * @returns {string|undefined} the first text string that is found
 */
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
 * Finds all large z indices to find the banner which lies on top of the page
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
};

/**
 * Store a warning in the scan object
 * @param warning
 */
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

/**
 * Entry point for the banner script
 */
const handler = setTimeout(async () => {
  // We store the easylist in storage.local to avoid downloading it on every page load
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