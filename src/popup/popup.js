/**
 * popup.js
 * --------
 * Everything relating to the extension popup frontend is handled here. Most of the code is for rendering the current scan.
 * Unfortunately Chrome MV3 doesn't allow us to split this code into multiple files.
 */

let contentDiv = document.getElementById("content");

/**
 * A scan is always in one of these 4 stages.
 * - "initial": not yet started (scan can also be undefined in this stage),
 * - "necessary": started and just checking if non-essential cookies are being set by the website,
 * - "all": checking all cookie violations, a consent notice has been found if the scan is in this stage,
 * - "finished": the summary is being displayed
 */
const SCANSTAGE = ["initial", "necessary", "all", "finished"];

/**
 * These fixes are displayed on the summary according to what needs to be fixed.
 */
const FIXES = {
  "nonessential": `You must receive users' consent before you use any cookies except strictly necessary cookies. <a href="https://www.cookieaudit.app#consent" class="learn" target="_blank">Learn more</a>`,
  "undeclared": `You must declare and provide information about each cookie before consent is received. <a href="https://www.cookieaudit.app#declaration" class="learn" target="_blank">Learn more</a>`,
  "wrongcat": `We classified some cookies differently than you, make sure you put each cookie in the correct category. <a href="https://www.cookieaudit.app#categories" class="learn" target="_blank">Learn more</a>`,
  "wrongexpiry-time": `The expiration time of some cookies is much higher than declared. Lower the expiry date on the cookie or correct the declaration. <a href="https://www.cookieaudit.app#expiry" class="learn" target="_blank">Learn more</a>`,
  "wrongexpiry-session": `You declared some cookies as session-cookies but set them to be persistent.`,
  "noreject": `Add a "Reject" button to the initial consent popup. <a href="https://www.cookieaudit.app#noreject" class="learn" target="_blank">Learn more</a>`,
  "preselected": `Make sure non-essential categories are not preselected in the consent popup. <a href="https://www.cookieaudit.app#preselected" class="learn" target="_blank">Learn more</a>`,
}

/**
 * Retrieve Url of the active tab.
 * @returns {String} Url.
 */
async function getURL() {
  let queryOptions = {active: true, lastFocusedWindow: true};
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  if (!tab || !tab.url) {
    return undefined;
  }
  return tab.url;
}

/**
 * The next functions are handlers for when the user clicks one of the buttons on the popup.
 * This function is called when a user clicks the start button. It creates a new empty scan object and stores it in the chrome storage.
 */
async function startScan() {
  const url = await getURL();
  if (!url) {
    console.log('Open a website before starting a scan');
    return;
  }

  console.log("Starting scan...");
  try {
    chrome.runtime.sendMessage("clear_cookies", function (res) {
      console.log(`cleared cookies: ${res}`);
    });
  } catch (err) {
    console.error("error clearing cookies");
    return;
  }
  const scan = {
    'stage': SCANSTAGE[1],
    'scanStart': Date.now(),
    'scanEnd': null,
    'cmp': null,
    'url': url,
    'nonnecessary': [],
    'wrongcat': [],
    'undeclared': [],
    'multideclared': [],
    'wrongexpiry': [],
    'consentNotice': null,
    'advanced': false,
    'cmpWarnings': []
  };
  chrome.storage.local.set({"scan": scan});

  chrome.runtime.sendMessage("start_scan", function (res) {
    console.log(res);
  });

  setContent(SCANSTAGE[1]);

  window.close();
}

/**
 * This function is called when the user clicks on the stop button. Sets the appropriate fields in the scan object
 * and calls setContent to display the summary.
 */
function stopScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3]) {
      console.error("No scan in progress");
    } else {
      console.log("Stopping scan...");
      res.scan.stage = SCANSTAGE[3];
      res.scan.scanEnd = Date.now();
      chrome.storage.local.set({"scan": res.scan});
      chrome.runtime.sendMessage("stop_scan", function (res) {
        console.log(res);
      });
      clearInterval(intervalID);
      setContent(SCANSTAGE[3]);
      renderSummary();
    }
  });
}

/**
 * Called when user clicks the advanced scan button. Changes the scan object and calls clear_cookies in the background script.
 */
function advancedScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || res.scan.stage !== SCANSTAGE[1]) {
      console.log("Can start advanced scan from this stage");
    }
    console.log("Starting advanced scan");
    res.scan.stage = SCANSTAGE[2];
    res.scan.advanced = true;
    chrome.storage.local.set({"scan": res.scan});

    chrome.runtime.sendMessage("clear_cookies", function (res) {
      console.log(`cleared cookies: ${res}`);
    });

    chrome.runtime.sendMessage("start_advanced", function (res) {
      console.log(`started advanced: ${res}`);
    });

    setContent(SCANSTAGE[2]);
    renderScan();
  });
}

/**
 * Called when user clicks the discard button on the summary.
 */
function discardScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || !res.scan.stage === SCANSTAGE[3]) {
      console.error("No scan finished");
    } else {
      res.scan.stage = SCANSTAGE[0];
      chrome.storage.local.set({"scan": res.scan});
      setContent(SCANSTAGE[0]);
    }
  });
}

/**
 * Set the basic html structure of the extension during a scan, depending on the current scan stage.
 * There are lots of empty divs which are populated in the renderScan and renderSummary functions.
 */
function setContent(stage) {
  switch (stage) {
    // "initial" or scan undefined
    case SCANSTAGE[0]:
      contentDiv.innerHTML = `
        <div class="section-start">
          <button id="startScan" class="btn btn-primary btn-main btn-start"><i class="fa-solid fa-play"></i> Start Scan</button>
        </div>
        <div class="section-tips">
          <div class="header-tips">
            <i class="fa-regular fa-lightbulb"></i> Tips
          </div>
          <ul class="ul-tips">
              <li>Open the target website</li>
              <li>Close all other tabs before starting a scan</li>
              <li>If the website uses OneTrust or Cookiebot, you will be able to conduct an advanced scan</li>
              <li>All your cookies will be deleted!</li>
            </ul>   
        </div>
        <div class="section-disclaimer">
        </div>
      `;
      document.getElementById("content").style.backgroundColor = '#f2f5f7';
      document.getElementById("startScan").addEventListener("click", function () {
        startScan();
      });
      break;
    // standard scan
    case SCANSTAGE[1]:
      contentDiv.innerHTML = `
        <div class="box task-box">
          <p class="task-p"><i class="fa-solid fa-arrow-right"></i> Reload the page and <strong>reject all non-essential cookies</strong>. Then navigate around the website.</p>
        </div>
        <div class="box">
          <div class="d-flex justify-content-between">
            <div><b>URL</b></div>
            <div id="scanurl"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>CMP</b></div>
            <div id="cmpdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Choices</b></div>
            <div id="choicesdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Consent notice</b></div>
            <div id="noticediv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Cookies Total</b></div>
            <div id="totaldiv"><i>Unknown</i></div>
          </div>
        </div>
        <div class="accordion accordion-flush analysis-accordion" id="accordionWarnings">
          <div class="accordion-item" id="warnings">
            <h2 class="accordion-header" id="headingOne">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                <span class="badge rounded-pill count-pill" id="warnings-pill">0</span> Non-essential cookies
              </button>
            </h2>
            <div id="collapseOne" class="accordion-collapse collapse" aria-labelledby="headingOne" data-bs-parent="#accordionWarnings">
              <div class="accordion-body" id="warnings-body">
                No warnings
              </div>
            </div>
          </div>
        </div>
        <div class="section-buttons">
          <button id="advancedScan" class="btn btn-warning btn-main btn-sm btn-advanced" disabled><i class="fa-solid fa-binoculars"></i> Advanced Scan</button>
          <button id="stopScan" class="btn btn-danger btn-main btn-stop"><i class="fa-solid fa-stop"></i> Stop Scan</button>
        </div>`;
      document.getElementById("advancedScan").addEventListener("click", function () {
        advancedScan();
      });
      document.getElementById("stopScan").addEventListener("click", function () {
        stopScan();
      });
      break;
    // advanced scan
    case SCANSTAGE[2]:
      contentDiv.innerHTML = `
        <div class="box task-box">
          <p class="task-p"><i class="fa-solid fa-arrow-right"></i> Reload the page again and <strong>allow all cookies</strong> this time. Navigate around the site once more.</p>
        </div>
        <div class="box">
          <div class="d-flex justify-content-between">
            <div><b>URL</b></div>
            <div id="scanurl"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>CMP</b></div>
            <div id="cmpdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Choices</b></div>
            <div id="choicesdiv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Consent notice</b></div>
            <div id="noticediv"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Cookies Total</b></div>
            <div id="totaldiv"><i>Unknown</i></div>
          </div>
        </div>
 
        <div class="accordion accordion-flush analysis-accordion" id="accordionWarnings">
          <div class="accordion-item" id="warnings">
            <h2 class="accordion-header" id="headingOne">
              <button class="accordion-button collapsed accordion-nonnecessary" type="button" data-bs-toggle="collapse" data-bs-target="#collapseOne" aria-expanded="false" aria-controls="collapseOne">
                <span class="badge rounded-pill count-pill count-pill-nonnecessary" id="warnings-pill">0</span> Non-essential cookies
              </button>
            </h2>
            <div id="collapseOne" class="accordion-collapse collapse" aria-labelledby="headingOne" data-bs-parent="#accordionWarnings">
              <div class="accordion-body" id="warnings-body">
                No warnings
              </div>
            </div>
          </div>
        </div>
        <div class="accordion accordion-flush analysis-accordion" id="accordionUndeclared">
          <div class="accordion-item" id="undeclared">
            <h2 class="accordion-header" id="headingTwo">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseTwo" aria-expanded="false" aria-controls="collapseTwo">
                <span class="badge rounded-pill count-pill" id="undeclared-pill">0</span> Undeclared cookies
              </button>
            </h2>
            <div id="collapseTwo" class="accordion-collapse collapse" aria-labelledby="headingTwo" data-bs-parent="#accordionUndeclared">
              <div class="accordion-body" id="undeclared-body">
                No undeclared cookies
              </div>
            </div>
          </div>
        </div>
        <div class="accordion accordion-flush analysis-accordion" id="accordionWrongcat"> 
          <div class="accordion-item" id="wrongcat">
            <h2 class="accordion-header" id="headingThree">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseThree" aria-expanded="false" aria-controls="collapseThree">
                <span class="badge rounded-pill count-pill" id="wrongcat-pill">0</span> Wrongly categorized cookies
              </button>
            </h2>
            <div id="collapseThree" class="accordion-collapse collapse" aria-labelledby="headingThree" data-bs-parent="#accordionWrongcat">
              <div class="accordion-body" id="wrongcat-body">
                No wrongly categorized cookies
              </div>
            </div>
          </div>
        </div>
        <div class="accordion accordion-flush analysis-accordion" id="accordionExpiry" hidden> 
          <div class="accordion-item" id="wrongexpiry">
            <h2 class="accordion-header" id="headingThree">
              <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#collapseFour" aria-expanded="false" aria-controls="collapseFour">
                <span class="badge rounded-pill count-pill" id="wrongexpiry-pill">0</span> Expiration time is too long
              </button>
            </h2>
            <div id="collapseFour" class="accordion-collapse collapse" aria-labelledby="headingFour" data-bs-parent="#accordionExpiry">
              <div class="accordion-body" id="wrongexpiry-body">
                No cookies with expiry too long
              </div>
            </div>
          </div>
        </div>
        <div class="section-buttons">
          <button id="stopScan" class="btn btn-danger btn-main btn-stop"><i class="fa-solid fa-stop"></i> Stop Scan</button>
        </div>`;
      document.getElementById("stopScan").addEventListener("click", function () {
        stopScan();
      });
      break;
    // summary
    case SCANSTAGE[3]:
      if (!contentDiv) {
        break;
      }
      contentDiv.innerHTML = `
        <h1 class="display-5 display-top">Site info</h1>
        <div class="box-summary">
          <div class="d-flex justify-content-between">
            <div><b>URL</b></div>
            <div id="summary-url"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Audit Type</b></div>
            <div id="summary-type"><i>Unknown</i></div>
          </div>
          <div class="d-flex justify-content-between">
            <div><b>Consent Notice</b></div>
            <div id="summary-notice"><i>Unknown</i></div>
          </div>
        </div>
        <div class="box" id="siteInfoBox">
          <p><i class="fa-solid fa-circle-info"></i> If the website uses OneTrust or Cookiebot you can run an advanced scan to check if all cookies are declared in the consent notice.</p>
        </div>
        
        <h1 class="display-5">CMP</h1>
        <div class="box-summary">
          <div class="d-flex justify-content-between">
            <div><b>CMP</b></div>
            <div id="summary-cmp"><i>Unknown</i></div>
          </div>
        </div>
        <div class="container">
            <div class="row" id="summary-cmp-warnings"></div>
        </div>
        
        <h1 class="display-5">Non-essential cookies</h1>
        <div class="container text-left">
            <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-4" id="summary-nonnecessary"></div>
        </div>
        <div class="box" id="nonnecessaryBox">
          <p><i class="fa-solid fa-circle-info"></i> These cookies were set even though the user hasn't yet chosen to allow all cookies.</p>
        </div>
        
        <div id="section-advanced">
          <h1 class="display-5">Undeclared cookies</h1>
          <div class="container">
              <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-4" id="summary-undeclared"></div>
          </div>
          <div class="box" id="undeclaredBox">
            <p><i class="fa-solid fa-circle-info"></i> These cookies weren't declared in the consent notice.</p>
          </div>
        
          <h1 class="display-5">Wrongly categorized</h1>
          <div class="container">
              <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-4" id="summary-wrongcat"></div>
          </div>
          <div class="box" id="wrongcatBox">
            <p><i class="fa-solid fa-circle-info"></i> We classified these cookies differently than what they were declared as in the consent notice.</p>
          </div>
  
          <h1 class="display-5">Wrong expiration time</h1>
          <div class="container">
              <div class="row row-cols-1 row-cols-sm-2 row-cols-lg-4" id="summary-wrongexpiry"></div>
          </div>
          <div class="box" id="wrongexpiryBox">
              <p><i class="fa-solid fa-circle-info"></i> The expiration time of these cookies is at least 1.5 times higher than declared in the consent notice.</p>
          </div>
        </div>
 
        <div class="section-tips section-fixes">
          <div class="header-tips">
            <i class="fa-solid fa-screwdriver-wrench"></i> Fixes
          </div>
          <p class="summary-p" id="fixesBox">We suggest following fixes for the scanned website:</p>
          <ul class="ul-tips" id="summary-fixes"></ul>   
        </div>
        `;

      // If we export a summary (opening it in a new window) the summary will be re-rendered. We don't want to include the buttons
      // at the end of the summary. To check if this function is called from the new popup window, we included a empty div with ID summary-popup in this HTML.
      if (document.getElementById("summary-popup")) {
        break;
      }

      contentDiv.innerHTML += `<div class="section-buttons">
          <p id="logStored" class="stored-p" hidden><i class="fa-solid fa-circle-check"></i> Successfully sent log!</p>
          <a id="storeLog" class="link-store"><i class="fa-solid fa-paper-plane"></i> Send log to research group</a>
          <button id="openSummary" class="btn btn-primary btn-main btn-export"><i class="fa-solid fa-file-export"></i> Export Summary</button>
          <button id="discardScan" class="btn btn-danger btn-main btn-stop"><i class="fa-solid fa-door-open"></i> Discard Scan</button>
        </div>`;

      document.getElementById("storeLog").addEventListener("click", function () {
        chrome.runtime.sendMessage("store_log");
        this.hidden = true;
        document.getElementById("logStored").hidden = false;
      })
      document.getElementById("discardScan").addEventListener("click", function () {
        discardScan();
      });
      document.getElementById("openSummary").addEventListener("click", function () {
        try {
          const panelWindowInfo = chrome.windows.create({
            url: chrome.runtime.getURL("popup/summary.html"),
            type: "popup",
            height: 800,
            width: 1200,
          }, (c) => {
            console.log(c);
            // renderSummary();
            // document.getElementById("openSummary").hidden = true;
          });
        } catch (error) {
          console.log(error);
        }
      });
      break;
  }
}

/**
 * Translate a label from the classifier into the corresponding purpose string.
 * This function is also declared in the globals.js but because we're not allowed to import files in popup.js we need to also put it here.
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
      document.getElementById("warnings-pill").innerText = res.scan.nonnecessary.length;
    }
    for (let i in res.scan.nonnecessary) {
      let elWarning = document.createElement("div");
      elWarning.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class="title-line tip-line"><b>${res.scan.nonnecessary[i].name}</b></p>
          <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.nonnecessary[i].domain}</p>
          <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.nonnecessary[i].current_label)}</p>
        </div>`;
      warningDiv.appendChild(elWarning);
    }

    // render cmp info
    if (res.scan.cmp) {
      document.getElementById("cmpdiv").innerHTML = res.scan.cmp.name;
      if (res.scan.cmp.choices) {
        if (res.scan.cmp.choices.length > 3) {
          document.getElementById("choicesdiv").innerHTML = "All";
        } else {
          document.getElementById("choicesdiv").innerHTML = res.scan.cmp.choices;
        }
      }
    }

    // render url
    if (res.scan.url) {
      document.getElementById("scanurl").innerHTML = res.scan.url;
    } else {
      document.getElementById("scanurl").innerHTML = "unknown";
    }

    // render consent notice
    if (res.scan.consentNotice) {
      document.getElementById("noticediv").innerHTML = "Found";
      if (res.scan.stage === SCANSTAGE[1]) {
        document.getElementById("advancedScan").disabled = false;
      }
    } else {
      document.getElementById("noticediv").innerHTML = "Not found";
    }

    // render total cookies
    if (res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2]) {
      chrome.runtime.sendMessage("total_cookies", function (res) {
        document.getElementById("totaldiv").innerHTML = res;
      });
    }

    // advanced scan
    if (res.scan.stage === SCANSTAGE[2]) {
      // render undeclared
      const undeclaredDiv = document.getElementById("undeclared-body");
      undeclaredDiv.innerHTML = "";
      if (res.scan.undeclared.length > 0) {
        document.getElementById("undeclared-pill").innerText = res.scan.undeclared.length;
      }
      for (let i in res.scan.undeclared) {
        let elUndeclared = document.createElement("div");
        elUndeclared.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class="title-line tip-line"><b>${res.scan.undeclared[i].name}</b></p>
          <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.undeclared[i].domain}</p>
          <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.undeclared[i].current_label)}</p>
        </div>`;
        undeclaredDiv.appendChild(elUndeclared);
      }

      // render wrong category
      const wrongcatDiv = document.getElementById("wrongcat-body");
      wrongcatDiv.innerHTML = "";
      if (res.scan.wrongcat.length > 0) {
        document.getElementById("wrongcat-pill").innerText = res.scan.wrongcat.length;
      }
      for (let i in res.scan.wrongcat) {
        let elWrongcat = document.createElement("div");
        elWrongcat.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class="title-line tip-line"><b>${res.scan.wrongcat[i].cookie.name}</b></p>
          <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.wrongcat[i].cookie.domain}</p>
          <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.wrongcat[i].cookie.current_label)} <i>but declared as ${res.scan.wrongcat[i].consent_label}</i></p>
        </div>`;
        wrongcatDiv.appendChild(elWrongcat);
      }

      // render wrong expiry
      const wrongexpiryDiv = document.getElementById("wrongexpiry-body");
      wrongexpiryDiv.innerHTML = "";
      if (res.scan.wrongexpiry.length > 0) {
        document.getElementById("accordionExpiry").hidden = false;
        document.getElementById("wrongexpiry-pill").innerText = res.scan.wrongexpiry.length;
      }
      for (let i in res.scan.wrongexpiry) {
        let elWrongexpiry = document.createElement("div");
        let expiryText = '';
        if (res.scan.wrongexpiry[i].consent_expiry === "session") {
          expiryText = 'Declared as session cookie but set as non-session';
        } else if (res.scan.wrongexpiry[i].consent_expiry === "nosession") {
          expiryText = 'Declared as non-session cookie but set as session';
        } else {
          expiryText = 'Expiry is much larger than declared';
        }
        elWrongexpiry.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
          <p class="title-line tip-line"><b>${res.scan.wrongexpiry[i].cookie.name}</b></p>
          <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.wrongexpiry[i].cookie.domain}</p>
          <p class="tip-line"><i class="fa-solid fa-clock"></i> ${expiryText}</p>
        </div>`;
        wrongexpiryDiv.appendChild(elWrongexpiry);
      }
    }
  });
}

/**
 * Render all information in the summary. For cleaner code we could merge this with the renderScan function because
 * there are lots of overlaps.
 */
function renderSummary() {
  chrome.storage.local.get("scan", (res) => {
    let fixes = [];
    // Display warnings
    const summaryWarningsDiv = document.getElementById("summary-nonnecessary");
    summaryWarningsDiv.innerHTML = "";
    if (res.scan.nonnecessary.length > 0) {
      fixes.push(FIXES["nonessential"]);
      for (let i in res.scan.nonnecessary) {
        let elWarning = document.createElement("div");
        elWarning.innerHTML = `
              <div class="col box box-cookies box-warnings-summary" style="margin-bottom: 5px">
                <p class="title-line tip-line"><b>${res.scan.nonnecessary[i].name}</b></p>
                <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.nonnecessary[i].domain}</p>
                <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.nonnecessary[i].current_label)}</p>
              </div>`;
        summaryWarningsDiv.appendChild(elWarning);
      }
    } else {
      summaryWarningsDiv.innerHTML = "<p class='summary-p'>No cookie violations detected</p>";
      document.getElementById("nonnecessaryBox").hidden = true;
    }
    // Display cmp info
    if (res.scan.cmp) {
      document.getElementById("summary-cmp").innerHTML = res.scan.cmp.name;
    }

    const summaryCmpWarnings = document.getElementById("summary-cmp-warnings");
    summaryCmpWarnings.innerHTML = "";
    if (res.scan.cmpWarnings.length > 0) {
      for (let warning of res.scan.cmpWarnings) {
        let elCmpWarning = document.createElement("div");
        switch (warning) {
          case "noreject":
            fixes.push(FIXES["noreject"]);
            elCmpWarning.innerHTML = `
                <div class="box box-cmp-warnings">
                    <p class="task-p"><i class="fa-solid fa-triangle-exclamation"></i> No reject button on initial popup</p>
                </div>`;
            summaryCmpWarnings.appendChild(elCmpWarning);
            break;
          case "preselected":
            fixes.push(FIXES["preselected"]);
            elCmpWarning.innerHTML = `
                <div class="box box-cmp-warnings">
                    <p class="task-p"><i class="fa-solid fa-triangle-exclamation"></i> Non-essential cookie settings are preselected</p>
                </div>`;
            summaryCmpWarnings.appendChild(elCmpWarning);
            break;
        }
      }
    }

    // Display url
    if (res.scan.url) {
      document.getElementById("summary-url").innerHTML = res.scan.url;
    }

    // Display advanced
    if (res.scan.advanced) {
      document.getElementById("summary-type").innerHTML = "Advanced";
      document.getElementById("siteInfoBox").hidden = true;
    } else {
      document.getElementById("summary-type").innerHTML = "Standard";
      document.getElementById("section-advanced").hidden = true;
    }

    if (res.scan.consentNotice) {
      document.getElementById("summary-notice").innerHTML = "Found";
    } else {
      document.getElementById("summary-notice").innerHTML = "Not found";
    }

    // Display undeclared
    const summaryUndeclaredDiv = document.getElementById("summary-undeclared");
    summaryUndeclaredDiv.innerHTML = "";
    if (res.scan.undeclared.length > 0) {
      fixes.push(FIXES["undeclared"]);
      for (let i in res.scan.undeclared) {
        let elUndeclared = document.createElement("div");
        elUndeclared.innerHTML = `
          <div class="box box-cookies box-warnings-summary" style="margin-bottom: 5px">
            <p class="title-line tip-line"><b>${res.scan.undeclared[i].name}</b></p>
            <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.undeclared[i].domain}</p>
            <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.undeclared[i].current_label)}</p>
          </div>`;
        summaryUndeclaredDiv.appendChild(elUndeclared);
      }
    } else {
      summaryUndeclaredDiv.innerHTML = "<p class='summary-p'>No undeclared cookies detected</p>";
      document.getElementById("undeclaredBox").hidden = true;
    }

    // Display wrongcat
    const summaryWrongcatDiv = document.getElementById("summary-wrongcat");
    summaryWrongcatDiv.innerHTML = "";
    if (res.scan.wrongcat.length > 0) {
      fixes.push(FIXES["wrongcat"]);
      for (let i in res.scan.wrongcat) {
        let elWrongcat = document.createElement("div");
        elWrongcat.innerHTML = `
          <div class="box box-cookies box-warnings-summary" style="margin-bottom: 5px">
            <p class="title-line tip-line"><b>${res.scan.wrongcat[i].cookie.name}</b></p>
            <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.wrongcat[i].cookie.domain}</p>
            <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.wrongcat[i].cookie.current_label)} <i>but declared as ${res.scan.wrongcat[i].consent_label}</i></p>
          </div>`;
        summaryWrongcatDiv.appendChild(elWrongcat);
      }
    } else {
      summaryWrongcatDiv.innerHTML = "<p class='summary-p'>No wrongly categorized cookies detected</p>";
      document.getElementById("wrongcatBox").hidden = true;
    }

    // Display wrongexpiration
    const summaryWrongexpiryDiv = document.getElementById("summary-wrongexpiry");
    summaryWrongexpiryDiv.innerHTML = "";
    let expiryFix = false;
    let sessionFix = false;
    if (res.scan.wrongexpiry.length > 0) {
      for (let i in res.scan.wrongexpiry) {
        let elWrongexpiry = document.createElement("div");
        let expiryText = '';
        if (res.scan.wrongexpiry[i].consent_expiry === "session") {
          expiryText = 'Declared as session cookie but set as persistent';
          if (!sessionFix) {
            fixes.push(FIXES["wrongexpiry-session"]);
            sessionFix = true;
          }
        } else if (res.scan.wrongexpiry[i].consent_expiry === "nosession") {
          expiryText = 'Declared as persistent cookie but set as session';
        } else {
          expiryText = 'Expiry is much larger than declared';
          if (!expiryFix) {
            fixes.push(FIXES["wrongexpiry-time"]);
            expiryFix = true;
          }
        }
        elWrongexpiry.innerHTML = `
          <div class="box box-cookies box-warnings-summary" style="margin-bottom: 5px">
            <p class="title-line tip-line"><b>${res.scan.wrongexpiry[i].cookie.name}</b></p>
            <p class="tip-line"><i class="fa-solid fa-clock"></i> ${expiryText}</p>
          </div>`;
        summaryWrongexpiryDiv.appendChild(elWrongexpiry);
      }
    } else {
      summaryWrongexpiryDiv.innerHTML = "<p class='summary-p'>No cookies with wrong expiration times detected</p>";
      document.getElementById("wrongexpiryBox").hidden = true;
    }

    // Display fixes
    const summaryFixes = document.getElementById("summary-fixes");
    if (fixes.length > 0) {
      summaryFixes.innerHTML = "";
      for (let fix of fixes) {
        let elFix = document.createElement("li");
        elFix.innerHTML = fix;
        summaryFixes.appendChild(elFix);
      }
    } else {
      summaryFixes.innerHTML = "No fix necessary!";
      document.getElementById("fixesBox").hidden = true;
    }
  });
}

/**
 * Entry point of popup.js This is called whenever the extension popup is opened.
 */
var intervalID;
chrome.storage.local.get("scan", (res) => {
  if (res.scan && (res.scan.stage && res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2])) {
    setContent(res.scan.stage);
    renderScan();
    // We update the contents of the popup window every 3 seconds
    intervalID = window.setInterval(() => {
      try {
        chrome.runtime.sendMessage("analyze_cookies", function (res) {
          renderScan();
        });
      } catch (err) {
        console.error("error analyzing cookies");
      }
      // renderScan();
    }, 3000);
  } else if (res.scan && res.scan.stage && res.scan.stage === SCANSTAGE[3]) {
    setContent(SCANSTAGE[3]);
    renderSummary();
  } else {
    setContent(SCANSTAGE[0]);
  }
});