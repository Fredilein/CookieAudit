let popup = document.getElementById("popup");
let cmpDiv = document.getElementById("cmp");
let cookieTable = document.getElementById("cookieTableBody");
let contentDiv = document.getElementById("content");
let startStopBtn = document.getElementById("startStopScan");
let advancedBtn = document.getElementById("advancedScan");
let usageDiv = document.getElementById("usageinfo");

const SCANSTAGE = ["initial", "necessary", "all", "finished"];

function deleteCookies() {
  chrome.runtime.sendMessage("clear_cookies", function (res) {
    console.log(res);
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
        'nonnecessary': [],
        'wrongcat': [],
        'undeclared': [],
        'consentNotice': null
      };
      chrome.storage.local.set({ scan });

      startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
      setContent(SCANSTAGE[1]);

      // TODO: Not sure if good UX but fixes the update problem for now
      window.close();
    } else {
      console.log("Stopping scan...");
      res.scan.stage = SCANSTAGE[3];
      chrome.storage.local.set({"scan": res.scan});
      clearInterval(intervalID);
      setContent(SCANSTAGE[3]);
    }
  });
}

function advancedScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || res.scan.stage !== SCANSTAGE[1]) {
      console.log("Can start advanced scan from this stage");
    }
    console.log("Starting advanced scan");
    res.scan.stage = SCANSTAGE[2];
    chrome.storage.local.set({"scan": res.scan});
    deleteCookies();

    setContent(SCANSTAGE[2]);
    renderScan();
  });
}

/**
 * Sets the basic html strcture of the extension during a scan.
 * The content of these divs is changed upon receiving information while scanning.
 */
function setContent(stage) {
  switch (stage) {
    case SCANSTAGE[1]:
      contentDiv.innerHTML = `
        <div class="box box-cmp">
          <div class="d-flex justify-content-between">
            <div><b>URL</b></div>
            <div id="scanurl"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>CMP</b></div>
            <div id="cmpdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Consent given</b></div>
            <div id="choicesdiv"><i>Unknown (assume necessary)</i></div>
          </div>
        </div>
        <div class="accordion analysis-accordion" id="accordionExample">
          <div class="accordion-item" id="warnings" hidden>
            <h2 class="accordion-header" id="headingOne">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                Non-necessary cookies <span class="badge bg-primary rounded-pill count-pill" id="warnings-pill">0</span>
              </button>
            </h2>
            <div id="collapseOne" class="accordion-collapse collapse" aria-labelledby="headingOne" data-bs-parent="#accordionExample">
              <div class="accordion-body" id="warnings-body">
                No warnings
              </div>
            </div>
          </div>
        </div>`;
      advancedBtn.hidden = false;
      break;
    case SCANSTAGE[2]:
      contentDiv.innerHTML = `
        <div class="box box-cmp">
          <div class="d-flex justify-content-between">
            <div><b>URL</b></div>
            <div id="scanurl"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>CMP</b></div>
            <div id="cmpdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Consent given</b></div>
            <div id="choicesdiv"><i>Unknown (assume necessary)</i></div>
          </div>
        </div>
 
        <div class="accordion analysis-accordion" id="accordionExample">
          <div class="accordion-item" id="warnings" hidden>
            <h2 class="accordion-header" id="headingOne">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                Non-necessary cookies <span class="badge bg-primary rounded-pill count-pill" id="warnings-pill">0</span>
              </button>
            </h2>
            <div id="collapseOne" class="accordion-collapse collapse" aria-labelledby="headingOne" data-bs-parent="#accordionExample">
              <div class="accordion-body" id="warnings-body">
                No warnings
              </div>
            </div>
          </div>
          <div class="accordion-item" id="undeclared" hidden>
            <h2 class="accordion-header" id="headingTwo">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
                Undeclared cookies <span class="badge bg-primary rounded-pill count-pill" id="undeclared-pill">0</span>
              </button>
            </h2>
            <div id="collapseTwo" class="accordion-collapse collapse" aria-labelledby="headingTwo" data-bs-parent="#accordionExample">
              <div class="accordion-body" id="undeclared-body">
                No undeclared cookies
              </div>
            </div>
          </div>
          <div class="accordion-item" id="wrongcat" hidden>
            <h2 class="accordion-header" id="headingThree">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
                Wrongly categorized cookies <span class="badge bg-primary rounded-pill count-pill" id="wrongcat-pill">0</span>
              </button>
            </h2>
            <div id="collapseThree" class="accordion-collapse collapse" aria-labelledby="headingThree" data-bs-parent="#accordionExample">
              <div class="accordion-body" id="wrongcat-body">
                No wrongly categorized cookies
              </div>
            </div>
          </div>
        </div>`;
      advancedBtn.hidden = true;
      break;
    case SCANSTAGE[3]:
      advancedBtn.hidden = true;
      showSummary();
      break;
  }
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
    if (res.scan.nonnecessary.length > 0) {
      for (let i in res.scan.nonnecessary) {
        let elWarning = document.createElement("div");
        elWarning.innerHTML = `
              <p>${res.scan.nonnecessary[i].name} <i>(${classIndexToString(res.scan.nonnecessary[i].current_label)})</i></p>`;
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
    if (res.scan.url) {
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
    const warningDiv = document.getElementById("warnings-body");
    warningDiv.innerHTML = "";
    if (res.scan.nonnecessary.length > 0) {
      document.getElementById("warnings").hidden = false;
      document.getElementById("warnings-pill").innerText = res.scan.nonnecessary.length;
    }
    for (let i in res.scan.nonnecessary) {
      let elWarning = document.createElement("div");
      elWarning.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
        <p class=" title-line tip-line"><i class="fa-solid fa-circle-exclamation"></i> <b>Potentially disallowed cookie</b></p>
        <p class="tip-line"><i>${res.scan.nonnecessary[i].name}</i> was classified as <i>${classIndexToString(res.scan.nonnecessary[i].current_label)}</i></p>
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

    if (res.scan.stage === SCANSTAGE[2]) {
      const undeclaredDiv = document.getElementById("undeclared-body");
      undeclaredDiv.innerHTML = "";
      if (res.scan.undeclared.length > 0) {
        document.getElementById("undeclared").hidden = false;
        document.getElementById("undeclared-pill").innerText = res.scan.undeclared.length;
      }
      for (let i in res.scan.undeclared) {
        let elUndeclared = document.createElement("div");
        elUndeclared.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class=" title-line tip-line"><i class="fa-solid fa-circle-exclamation"></i> <b>Undeclared cookie</b></p>
          <p class="tip-line"><i>${res.scan.undeclared[i].name}</i> is not declared in the consent notice</p>
        </div>`;
        undeclaredDiv.appendChild(elUndeclared);
      }

      const wrongcatDiv = document.getElementById("wrongcat-body");
      wrongcatDiv.innerHTML = "";
      if (res.scan.wrongcat.length > 0) {
        document.getElementById("wrongcat").hidden = false;
        document.getElementById("wrongcat-pill").innerText = res.scan.wrongcat.length;
      }
      for (let i in res.scan.wrongcat) {
        let elWrongcat = document.createElement("div");
        elWrongcat.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class=" title-line tip-line"><i class="fa-solid fa-circle-exclamation"></i> <b>Potentially wrong cookie category</b></p>
          <p class="tip-line"><i>${res.scan.wrongcat[i].cookie.name}</i> is classified as ${res.scan.wrongcat[i].cookie.current_label}. ${classIndexToString(res.scan.wrongcat[i].consent_label)} in consent notice</p>
        </div>`;
        wrongcatDiv.appendChild(elWrongcat);
      }
    }
  });
}

// Setup extension DOM
var intervalID;
chrome.storage.local.get("scan", (res) => {
  if (res.scan && res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2]) {
    usageDiv.innerHTML = '';
    setContent(res.scan.stage);
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
  advancedBtn.addEventListener("click", function () {
    advancedScan();
  });
});
