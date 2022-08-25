let popup = document.getElementById("popup");
let cmpDiv = document.getElementById("cmp");
let cookieTable = document.getElementById("cookieTableBody");
let contentDiv = document.getElementById("content");
let startStopBtn = document.getElementById("startStopScan");

function deleteCookies() {
  chrome.runtime.sendMessage("clear_cookies", function (_) {
    // showCookieResult();
  });
}

async function getURL() {
  let queryOptions = { active: true, lastFocusedWindow: true };
  // `tab` will either be a `tabs.Tab` instance or `undefined`.
  let [tab] = await chrome.tabs.query(queryOptions);
  return tab.url;
}

async function startStopScan() {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || !res.scan.inProgress || res.scan.inProgress == false) {
      console.log("Starting scan...");
      deleteCookies();
      const scan = {
        'inProgress': true,
        'cmp': null,
        'warnings': []
      };
      chrome.storage.local.set({ scan });
      startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
      setContent();
      // TODO: Not sure if good UX but fixes the update problem for now
      window.close();
    } else {
      console.log("Stopping scan...");
      res.scan.inProgress = false;
      chrome.storage.local.set({"scan": res.scan});
      clearInterval(intervalID);
      // contentDiv.innerHTML = `<p>Scan summary here...</p>`;
      // TODO: Move to own function
      contentDiv.innerHTML = `
        <div id="summary">
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
      if (res.scan.cmp) {
        document.getElementById("summary-cmp").innerHTML = res.scan.cmp.name;
      }
      startStopBtn.innerHTML = '<i class="fa-solid fa-play"></i> Start Scan';
    }
  });
}

function setContent() {
  chrome.tabs.query({
    active: true,
    lastFocusedWindow: true
  }, function(tabs) {
      // and use that tab to fill in out title and url
      var tab = tabs[0];
      const prettyUrl = (tab) ? tab.url.replace(/(^\w+:|^)\/\//, '') : 'unknown URL';
      contentDiv.innerHTML = `
          <p class="text-center">Auditing <i id="scanurl">${prettyUrl}</i></p>
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
  });
}

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

function updateCookieWarnings() {
  chrome.runtime.sendMessage("get_analysis", function (analysis) {
    chrome.storage.local.get("scan", (res) => {
      for (let i in analysis.warnings) {
        // add all new warnings to scan object
        if (!res.scan.warnings.some(e => e.name === analysis.warnings[i].name)){
          res.scan.warnings.push(analysis.warnings[i]);
        }
      }
      // update CMP if not already in scan object
      if (analysis.cmp && !res.scan.cmp) {
        res.scan.cmp = analysis.cmp;
      }
      // update CMP choices if not already in scan object
      if (analysis.cmp && analysis.cmp.choices && !res.scan.cmp.choices) {
        res.scan.cmp.choices = analysis.cmp.choices;
      }
      chrome.storage.local.set({"scan": res.scan });
      showCookieWarnings();
    });
  });
}

function showCookieWarnings() {
  chrome.storage.local.get("scan", (res) => {
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
    if (res.scan.cmp) {
      document.getElementById("cmpdiv").innerHTML = res.scan.cmp.name;
      if (res.scan.cmp.choices) {
        document.getElementById("choicesdiv").innerHTML = res.scan.cmp.choices;
      }
    }
  });
}

// Setup extension DOM
var intervalID;
chrome.storage.local.get("scan", (res) => {
  if (res.scan.inProgress == true) {
    setContent();
    updateCookieWarnings();
    // showCookieWarnings();
    startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
    intervalID = window.setInterval(() => {
      updateCookieWarnings();
      // showCookieWarnings();
    }, 3000);
  }
});

// onclick events are not allowed, therefore we have to addEventListener to buttons etc.
document.addEventListener("DOMContentLoaded", function () {
  startStopBtn.addEventListener("click", function () {
    startStopScan();
  });
});
