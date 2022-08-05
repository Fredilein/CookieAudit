let popup = document.getElementById("popup");
let cmpDiv = document.getElementById("cmp");
let cookieTable = document.getElementById("cookieTableBody");
let contentDiv = document.getElementById("content");
let startStopBtn = document.getElementById("startStopScan");

// get currelty open tab to analyze DOM and get cookies
// chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
//   if (!Array.isArray(tabs)) {
//     return;
//   }
//   let url = new URL(tabs[0].url);
//   url = url.hostname.replace(/www/gi, "");

//   //   // run content scipt for DOM access
//   let activeTab = tabs[0].id;
//   activeTab.executeScript;
//   chrome.scripting.executeScript(
//     {
//       target: { tabId: activeTab },
//       func: analyzePage,
//       args: [url],
//     },
//     showCMPResult
//   );
// });

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

// content script which can access the page DOM
function analyzePage(url) {
  // detect CMP and save to extension storage
  let knownCMPs = {
    "consent.cookiebot.com": "cookiebot", // Cookiebot
    "onetrust.com": "OneTrust", // OneTrust
    "cookielaw.org": "OneTrust",
    "blob.core.windows.net": "OneTrust",
    "optanon.blob.core.windows.net": "OneTrust",
    "cookiepro.com": "OneTrust",
    "app.termly.io": "Termly", // Termly
  };
  let detectedCMP = "Unknown CMP";
  let source = document.getElementsByTagName("html")[0].innerHTML;
  for (domain in knownCMPs) {
    if (source.includes(domain)) {
      console.log("Detected CMP:" + knownCMPs[domain]);
      detectedCMP = knownCMPs[domain];
    }
  }
  chrome.storage.sync.set({ detectedCMP });
}

// print detected CMP
function showCMPResult() {
  chrome.storage.sync.get("detectedCMP", (CMP) => {
    cmpName = Object.values(CMP)[0];
    cmpDiv.innerHTML = "<strong>CMP:</strong> " + cmpName;
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

// list cookies
function showCookieResult() {
  chrome.runtime.sendMessage("get_cookies", function (cookies) {
    cookieTable.innerHTML = "";
    for (let i in cookies) {
      let elCookie = document.createElement("tr");
      elCookie.innerHTML =
        "<td>" +
        cookies[i].name +
        "</td><td><i>" +
        cookies[i].domain +
        "</i></td><td>" +
        classIndexToString(cookies[i].current_label) +
        "</td>";
      cookieTable.appendChild(elCookie);
    }
  });
}

function updateCookieWarnings() {
  chrome.runtime.sendMessage("get_analysis", function (analysis) {
    chrome.storage.local.get("scan", (res) => {
      for (let i in analysis.warnings) {
        if (!res.scan.warnings.some(e => e.name === analysis.warnings[i].name)){
          res.scan.warnings.push(analysis.warnings[i]);
        }
      }
      if (analysis.cmp && !res.scan.cmp) {
        res.scan.cmp = analysis.cmp;
      }
      if (analysis.cmp && analysis.cmp.choices && !res.scan.cmp.choices) {
        res.scan.cmp.choices = analysis.cmp.choices;
      }
      chrome.storage.local.set({"scan": res.scan });
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
    showCookieWarnings();
    startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
    intervalID = window.setInterval(() => {
      updateCookieWarnings();
      showCookieWarnings();
    }, 3000);
  }
});

// onclick events are not allowed, therefore we have to addEventListener to buttons etc.
document.addEventListener("DOMContentLoaded", function () {
  // var btn = document.getElementById("delete");
  // btn.addEventListener("click", function () {
  //   deleteCookies();
  // });
  startStopBtn.addEventListener("click", function () {
    startStopScan();
  });
});
