let contentDiv = document.getElementById("content");

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
async function startScan() {
  const url = await getURL();
  // chrome.storage.local.get("scan", (res) => {
  //   if (!res) {
  //     console.error(`Connection to local storage failed: ${res}`);
  //   }

    // if (!res.scan || !res.scan.stage || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3]) {
      console.log("Starting scan...");
      try {
        chrome.runtime.sendMessage("clear_cookies", function (res) {
          console.log(`cleared cookies: ${res}`);
        });
      } catch(err) {
        console.error("error clearing cookies");
        return;
      }
      const scan = {
        'stage': SCANSTAGE[1],
        'cmp': null,
        'url': url,
        'nonnecessary': [],
        'wrongcat': [],
        'undeclared': [],
        'consentNotice': null,
        'advanced': false
      };
      chrome.storage.local.set({ scan });

      chrome.runtime.sendMessage("start_scan", function (res) {
        console.log(res);
      });

      setContent(SCANSTAGE[1]);

      // TODO: Not sure if good UX but fixes the update problem for now
      window.close();
    // } else {
    //   console.error("Can't start scan.");
    // }
  // });
}

function stopScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.stage || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3]) {
      console.error("No scan in progress");
    } else {
      console.log("Stopping scan...");
      res.scan.stage = SCANSTAGE[3];
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
 * Sets the basic html strcture of the extension during a scan.
 * The content of these divs is changed upon receiving information while scanning.
 */
function setContent(stage) {
  switch (stage) {
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
              <li>Close all tabs before starting a scan</li>
              <li>Don't open any other website</li>
              <li>All your cookies will be deleted!</li>
            </ul>   
        </div>
        <div class="section-disclaimer">
            This extension is still under developement. It contains bugs!
        </div>
      `;
      document.getElementById("content").style.backgroundColor = '#f2f5f7';
      document.getElementById("startScan").addEventListener("click", function () {
        startScan();
      });
      break;
    case SCANSTAGE[1]:
      contentDiv.innerHTML = `
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
                <span class="badge rounded-pill count-pill" id="warnings-pill">0</span> Non-necessary cookies
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
          <button id="advancedScan" class="btn btn-warning btn-main btn-sm btn-advanced"><i class="fa-solid fa-binoculars"></i> Advanced Scan</button>
          <button id="stopScan" class="btn btn-danger btn-main btn-stop"><i class="fa-solid fa-stop"></i> Stop Scan</button>
        </div>`;
      document.getElementById("advancedScan").addEventListener("click", function () {
        advancedScan();
      });
      document.getElementById("stopScan").addEventListener("click", function () {
        stopScan();
      });
      break;
    case SCANSTAGE[2]:
      contentDiv.innerHTML = `
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
                <span class="badge rounded-pill count-pill count-pill-nonnecessary" id="warnings-pill">0</span> Non-necessary cookies
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
        <div class="section-buttons">
          <button id="stopScan" class="btn btn-danger btn-main btn-stop"><i class="fa-solid fa-stop"></i> Stop Scan</button>
        </div>`;
      document.getElementById("stopScan").addEventListener("click", function () {
        stopScan();
      });
      break;
    case SCANSTAGE[3]:
      // contentDiv.innerHTML = `
      //   <div id="summary">
      //     <div id="summary-url"></div>
      //     <h4>CMP</h4>
      //     <div id="summary-cmp"></div>
      //     <div class="alert alert-info" role="alert">
      //       Info on how we rate this CMP will be here soon.
      //     </div>
      //     <br/>
      //     <h4>Disallowed cookies set</h4>
      //     <div id="summary-warnings"></div>
      //     <div class="alert alert-info" role="alert">
      //       Info on how to fix this will be here soon.
      //     </div>
      //   </div>`;
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
          <div class="box">
            <p><i class="fa-solid fa-circle-info"></i> Run an advanced scan to check if all cookies are declared in the consent notice.</p>
          </div>
          
          <h1 class="display-5">CMP</h1>
          <div class="box-summary">
            <div class="d-flex justify-content-between">
              <div><b>CMP</b></div>
              <div id="summary-cmp"><i>Unknown</i></div>
            </div>
            <div class="d-flex justify-content-between">
              <div><b>Choices</b></div>
              <div id="summary-choices"><i>Unknown</i></div>
            </div>
          </div>
          <div class="box">
            <p><i class="fa-solid fa-circle-info"></i> We give our opinion on this CMP here soon.</p>
          </div>
          
          <h1 class="display-5">Non-necessary cookies</h1>
          <div id="summary-nonnecessary"></div>
          <div class="box">
            <p><i class="fa-solid fa-circle-info"></i> These cookies were set even though the user hasn't yet chosen to allow all cookies.</p>
          </div>
          
          <h1 class="display-5">Undeclared cookies</h1>
          <div id="summary-undeclared"></div>
          <div class="box">
            <p><i class="fa-solid fa-circle-info"></i> These cookies weren't declared in the consent notice.</p>
          </div>
          
          <h1 class="display-5">Wrongly categorized</h1>
          <div id="summary-wrongcat"></div>
          <div class="box">
            <p><i class="fa-solid fa-circle-info"></i> We classified these cookies differently than what they were declared as in the consent notice.</p>
          </div>
`;
      break;
  }
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

    if (res.scan.consentNotice) {
      document.getElementById("noticediv").innerHTML = "Found";
    } else {
      document.getElementById("noticediv").innerHTML = "Not found";
    }

    chrome.runtime.sendMessage("total_cookies", function (res) {
      document.getElementById("totaldiv").innerHTML = res;
    });

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
    }
  });
}

function renderSummary() {
  chrome.storage.local.get("scan", (res) => {
    // Display warnings
    const summaryWarningsDiv = document.getElementById("summary-nonnecessary");
    summaryWarningsDiv.innerHTML = "";
    if (res.scan.nonnecessary.length > 0) {
      for (let i in res.scan.nonnecessary) {
        let elWarning = document.createElement("div");
        elWarning.innerHTML = `
              <div class="box box-cookies box-warnings-summary" style="margin-bottom: 5px">
                <p class="title-line tip-line"><b>${res.scan.nonnecessary[i].name}</b></p>
                <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.nonnecessary[i].domain}</p>
                <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.nonnecessary[i].current_label)}</p>
              </div>`;
        summaryWarningsDiv.appendChild(elWarning);
      }
    } else {
      summaryWarningsDiv.innerHTML = "<p class='summary-p'>No cookie violations detected</p>";
    }
    // Display cmp info
    if (res.scan.cmp) {
      document.getElementById("summary-cmp").innerHTML = res.scan.cmp.name;
    }
    // Display url
    if (res.scan.url) {
      document.getElementById("summary-url").innerHTML = res.scan.url;
    }

    // Display advanced
    if (res.scan.advanced) {
      document.getElementById("summary-type").innerHTML = "Advanced";
    } else {
      document.getElementById("summary-type").innerHTML = "Standard";
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
    }

    // Display wrongcat
    const summaryWrongcatDiv = document.getElementById("summary-wrongcat");
    summaryWrongcatDiv.innerHTML = "";
    if (res.scan.wrongcat.length > 0) {
      for (let i in res.scan.wrongcat) {
        let elWrongcat = document.createElement("div");
        elWrongcat.innerHTML = `
          <div class="box box-cookies box-warnings-summary" style="margin-bottom: 5px">
            <p class="title-line tip-line"><b>${res.scan.wrongcat[i].cookie.name}</b></p>
            <p class="tip-line"><i class="fa-solid fa-link"></i> ${res.scan.wrongcat[i].cookie.domain}</p>
            <p class="tip-line"><i class="fa-solid fa-tag"></i> ${classIndexToString(res.scan.wrongcat[i].cookie.current_label)} <i>but declared as ${classIndexToString(res.scan.wrongcat[i].consent_label)}</i></p>
          </div>`;
        summaryWrongcatDiv.appendChild(elWrongcat);
      }
    } else {
      summaryWrongcatDiv.innerHTML = "<p class='summary-p'>No wrongly categorized cookies detected</p>";
    }
  });
}

// Setup extension DOM
var intervalID;
chrome.storage.local.get("scan", (res) => {
  if (res.scan && (res.scan.stage && res.scan.stage === SCANSTAGE[1] || res.scan.stage === SCANSTAGE[2])) {
    setContent(res.scan.stage);
    renderScan();
    intervalID = window.setInterval(() => {
      try {
        chrome.runtime.sendMessage("analyze_cookies", function (res) {
          renderScan();
        });
      } catch(err) {
        console.error("error analyzing cookies")
      }
      // renderScan();
    }, 2000);
  } else {
    setContent(SCANSTAGE[0]);
  }
});