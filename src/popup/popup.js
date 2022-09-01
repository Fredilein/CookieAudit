let popup = document.getElementById("popup");
let cmpDiv = document.getElementById("cmp");
let cookieTable = document.getElementById("cookieTableBody");
let contentDiv = document.getElementById("content");
let startStopBtn = document.getElementById("startStopScan");
let usageDiv = document.getElementById("usageinfo");

const SCANSTAGE = ["initial", "necessary", "all", "finished"];

function deleteCookies() {
  chrome.runtime.sendMessage("clear_cookies", function (_) {
    // showCookieResult();
  });
}

/**
 * Retrieve Url of the active tab.
 * @returns {Promise<string>} Url.
 */
async function getURL() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab.url;
}

/**
 * Handles setup of a scan as well as everything after the scan.
 * TODO: Split into multiple functions for less confusion
 * @returns {Promise<void>}
 */
async function startStopScan() {
  const url = await getURL();
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3]) {
      console.log("Starting scan...");
      deleteCookies();
      const scan = {
        'stage': SCANSTAGE[1],
        'cmp': null,
        'url': url,
        'warnings': [],
        'consentNotice': null
      };
      chrome.storage.local.set({ scan });

      startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
      setContent();

      // TODO: Not sure if good UX but fixes the update problem for now
      window.close();
    } else {
      console.log("Stopping scan...");
      res.scan.stage = SCANSTAGE[3];
      chrome.storage.local.set({"scan": res.scan});
      clearInterval(intervalID);
      showSummary();
    }
  });
}

/**
 * Sets the basic html strcture of the extension during a scan.
 * The content of these divs is changed upon receiving information while scanning.
 */
function setContent() {
  contentDiv.innerHTML = `
      <p class="text-center">Auditing <i id="scanurl">...</i></p>
      <div class="box box-cmp">
        <div class="d-flex justify-content-between">
          <div><b>CMP</b></div>
          <div id="cmpdiv"><i>Unknown</i></div>
        </div>
        <div class="d-flex justify-content-between">
          <div><b>Consent given</b></div>
          <div id="choicesdiv"><i>Unknown (assume neccessary)</i></div>
        </div>
      </div>
  <div id="warnings"></div>`;
}

function showSummary() {
  chrome.storage.local.get("scan", (res) => {
    contentDiv.innerHTML = `
        <div id="summary">
          <div id="summary-url"></div>
          <h4>CMP</h4>
          <div id="summary-cmp"></div>
          <div class="alert alert-info" role="alert">
            Info on how we rate this CMP will be here soon.
          </div>
          <br/>
          <h4>Disallowed cookies set</h4>
          <div id="summary-warnings"></div>
          <div class="alert alert-info" role="alert">
            Info on how to fix this will be here soon.
          </div>
        </div>`;
    // Display warnings
    const summaryWarningsDiv = document.getElementById("summary-warnings");
    summaryWarningsDiv.innerHTML = "";
    if (res.scan.warnings.length > 0) {
      for (let i in res.scan.warnings) {
        let elWarning = document.createElement("div");
        elWarning.innerHTML = `
              <p>${res.scan.warnings[i].name} <i>(${classIndexToString(res.scan.warnings[i].current_label)})</i></p>`;
        summaryWarningsDiv.appendChild(elWarning);
      }
    } else {
      summaryWarningsDiv.innerHTML = "No cookie violations detected";
    }
    // Display cmp info
    if (res.scan.cmp) {
      document.getElementById("summary-cmp").innerHTML = res.scan.cmp.name;
    }
    // Display url
    if (res.scan.cmp) {
      document.getElementById("summary-url").innerHTML = "<h3>" + res.scan.url + "</h3>";
    }
    startStopBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Scan';
  });
}

/**
 * Translate a label from the classifier into the corresponding purpose string.
 * @param idx         Label
 * @returns {string}  Cookie purpose string
 */
const classIndexToString = (idx) => {
  switch (idx) {
    case -1:
      return "Unknown";
    case 0:
      return "Necessary";
    case 1:
      return "Functionality";
    case 2:
      return "Analytical";
    case 3:
      return "Advertising";
    case 4:
      return "Uncategorized";
    case 5:
      return "Social Media";
    default:
      return "Invalid Category Index";
  }
};

/**
 * Display all information collected by the background script during a scan.
 */
function renderScan() {
  chrome.storage.local.get("scan", (res) => {
    // render warnings
    const warningDiv = document.getElementById("warnings");
    warningDiv.innerHTML = "";
    for (let i in res.scan.warnings) {
      let elWarning = document.createElement("div");
      elWarning.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
        <p class=" title-line tip-line"><i class="fa-solid fa-circle-exclamation"></i> <b>Potentially disallowed cookie</b></p>
        <p class="tip-line"><i>${res.scan.warnings[i].name}</i> was classified as <i>${classIndexToString(res.scan.warnings[i].current_label)}</i></p>
      </div>`;
      warningDiv.appendChild(elWarning);
    }
    // render cmp info
    if (res.scan.cmp) {
      document.getElementById("cmpdiv").innerHTML = res.scan.cmp.name;
      if (res.scan.cmp.choices) {
        document.getElementById("choicesdiv").innerHTML = res.scan.cmp.choices;
      }
    }
    // render url
    if (res.scan.url) {
      document.getElementById("scanurl").innerHTML = res.scan.url;
    } else {
      document.getElementById("scanurl").innerHTML = "unknown";
    }
  });
}

// Setup extension DOM
var intervalID;
chrome.storage.local.get("scan", (res) => {
  if (res.scan && res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2]) {
    usageDiv.innerHTML = '';
    setContent();
    renderScan();
    startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
    intervalID = window.setInterval(() => {
      renderScan();
    }, 3000);
  }
});

// onclick events are not allowed, therefore we have to addEventListener to buttons.
document.addEventListener("DOMContentLoaded", function () {
  startStopBtn.addEventListener("click", function () {
    startStopScan();
  });
});
