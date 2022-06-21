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

function startStopScan() {
  console.log("Starting/stopping scan...");
  chrome.storage.local.get("scan", (res) => {
    console.log(res.scan);
    if (!res.scan.inProgress || res.scan.inProgress == false) {
      console.log("Starting scan...");
      deleteCookies();
      const scan = {
        'inProgress': true,
        'warningsDisallowed': []
      };
      chrome.storage.local.set({ scan });
      startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
      setContent();
    } else {
      console.log("Stopping scan...");
      res.scan.inProgress = false;
      chrome.storage.local.set({"scan": res.scan});
      clearInterval(intervalID);
      contentDiv.innerHTML = `<p>Scan summary here...</p>`;
      startStopBtn.innerHTML = '<i class="fa-solid fa-radar"></i> Start Scan';
    }
  });
}

function setContent() {
  contentDiv.innerHTML = `
      <p class="text-center">Auditing <i>example.com</i>...</p>
      <div class="box box-cmp">
        <div class="d-flex justify-content-between">
          <div><b>CMP</b></div>
          <div><i>Cookiebot</i></div>
        </div>
        <div class="d-flex justify-content-between">
          <div><b>Consent given</b></div>
          <div><i>Necessary only</i></div>
        </div>
      </div>
      <div id="warnings"></div>`;
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
    console.log(cmpName);
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
  chrome.runtime.sendMessage("get_warnings", function (cookies) {
    chrome.storage.local.get("scan", (res) => {
      for (let i in cookies) {
        if (!res.scan.warningsDisallowed.some(e => e.name === cookies[i].name)){
          res.scan.warningsDisallowed.push(cookies[i]);
        }
      }
      chrome.storage.local.set({"scan": res.scan });
    });
  });
}

function showCookieWarnings() {
  chrome.storage.local.get("scan", (res) => {
    console.log('received warnings:' + res.scan.warningsDisallowed);
    const warningDiv = document.getElementById("warnings");
    warningDiv.innerHTML = "";
    for (let i in res.scan.warningsDisallowed) {
      let elWarning = document.createElement("div");
      elWarning.innerHTML = `
        <div class="box box-cookies" style="margin-bottom: 5px">
        <p class=" title-line tip-line"><i class="fa-solid fa-circle-exclamation"></i> <b>Potentially disallowed cookie</b></p>
        <p class="tip-line"><i>${res.scan.warningsDisallowed[i].name}</i> was classified as <i>${classIndexToString(res.scan.warningsDisallowed[i].current_label)}</i></p>
      </div>`;
      warningDiv.appendChild(elWarning);
    }
  });
}

// Setup extension DOM
var intervalID;
console.log("Check if scan in progress..");
chrome.storage.local.get("scan", (res) => {
  if (res.scan.inProgress == true) {
    console.log("yes");
    setContent();
    startStopBtn.innerHTML = '<i class="fa-solid fa-stop"></i> Stop Scan';
    intervalID = window.setInterval(() => {
      updateCookieWarnings();
      showCookieWarnings();
    }, 3000);
  } else {
    console.log("no");
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
