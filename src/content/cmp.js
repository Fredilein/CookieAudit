const generalUrl =
  "https://raw.githubusercontent.com/easylist/easylist/master/easylist_cookie/easylist_cookie_general_hide.txt";

var easylist = [".t-consentPrompt"]; // For testing because not in easylist

/*
 * Load easylist from github
 */
const fetchEasylist = async function () {
  let res = await fetch(generalUrl);
  handleEasylist(await res.text());
};

/*
 * Parse easylist
 */
const handleEasylist = function (data) {
  lines = data.split("\n");
  for (l in lines) {
    if (lines[l].slice(0, 2) == "##") {
      easylist.push(lines[l].slice(2));
    }
  }
  getCMP();
};

/*
 * Use easylist to find a selector which is potentially a cookie popup (of any kind)
 */
const getCMP = function () {
  for (l in easylist) {
    var selector = document.querySelector(easylist[l]);
    if (selector) {
      console.log("[#] Found following selector: ", selector);
      analyzeCMP(selector);
    }
  }
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
    if (btn.innerHTML.toLowerCase().includes("preferences") || btn.innerHTML.toLowerCase().includes("settings")) {
      btn.click();
      console.log("[#] Clicked button ", btn.innerHTML);
      console.log("[#] Greater z index:");
      const greaterZ = greaterZIndex(selector);
      findCookieClasses(greaterZ[greaterZ.length - 1]);
    }
  });
};

/*
 * Search for checkboxes in popup and see if a sibling has a label
 * TODO: Check if a label is in further relatives of the checkbox
 */
const findCookieClasses = function (popup) {
  const checkboxes = popup.querySelectorAll("input[type=checkbox]");
  console.log("[#] Checkboxes:");
  for (const c of checkboxes) {
    const text = Array.from(c.parentElement.children).find(el => el.textContent);
    if (text) console.log(text.textContent);
  }
};


const getZIndex = function (e) {
  var z = window.getComputedStyle(e).getPropertyValue("z-index");
  return z;
};

/*
 * Finds all large z indices
 * TODO: argument selector not used because:
 * TODO: Currently a popup never returns a larger z-index even though chromedevtool says otherwise...
 */
const greaterZIndex = function (selector) {
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

fetchEasylist();
