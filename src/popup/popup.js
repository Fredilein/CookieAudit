let popup = document.getElementById("popup");
let cmpDiv = document.getElementById("cmp");
let cookieTable = document.getElementById("cookieTableBody");

// get currelty open tab to analyze DOM and get cookies
chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  if (!Array.isArray(tabs)) {
    return;
  }
  let url = new URL(tabs[0].url);
  url = url.hostname.replace(/www/gi, "");

  //   // run content scipt for DOM access
  let activeTab = tabs[0].id;
  activeTab.executeScript;
  chrome.scripting.executeScript(
    {
      target: { tabId: activeTab },
      func: analyzePage,
      args: [url],
    },
    showCMPResult
  );
});

function deleteCookies() {
  chrome.runtime.sendMessage("clear_cookies", function (_) {
    showCookieResult();
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
    console.log(cmpName);
    cmpDiv.innerHTML = "<strong>CMP:</strong> " + cmpName;
  });
}

// list cookies
function showCookieResult() {
  chrome.runtime.sendMessage("get_cookies", function (cookies) {
    cookieTable.innerHTML = "";
    for (i in cookies) {
      let elCookie = document.createElement("tr");
      elCookie.innerHTML =
        "<td>" +
        cookies[i].name +
        "</td><td>" +
        cookies[i].domain +
        "</td>";
      cookieTable.appendChild(elCookie);
    }
  });
}

// update cookies every 4 seconds
var intervalID = window.setInterval(showCookieResult, 4000);

// onclick events are not allowed, therefore we have to addEventListener to buttons etc.
document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("delete");
  btn.addEventListener("click", function () {
    deleteCookies();
  });
});
