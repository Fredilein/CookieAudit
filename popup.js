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

  // get all cookies from that hostname.
  // %TODO 3rd party cookies can't be detected with this method.
  // either try to get [https://stackoverflow.com/a/50099635/6553774] to work with V3
  // or tap into debugging API
  chrome.cookies.getAll(
    {
      domain: url,
    },
    function (cookies) {
      chrome.storage.sync.set({ cookies });
      showCookieResult();
    }
  );

  // run content scipt for DOM access
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
  chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
    if (!Array.isArray(tabs)) {
      return;
    }
    let activeUrl = new URL(tabs[0].url);
    activeUrl = activeUrl.hostname.replace(/www/gi, "");

    chrome.storage.sync.get("cookies", (cookies) => {
      for (cookie in cookies.cookies) {
        var url =
          "http" +
          (cookies.cookies[cookie].secure ? "s" : "") +
          "://" +
          cookies.cookies[cookie].domain +
          cookies.cookies[cookie].path;
        chrome.cookies.remove({ url: url, name: cookies.cookies[cookie].name });
      }
    });
    setTimeout(function() {
      chrome.cookies.getAll(
        {
          domain: activeUrl,
        },
        function (cookies) {
          chrome.storage.sync.set({ cookies });
          showCookieResult();
        }
      );
    }, 500)
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
    //let elCMP = document.createElement("p");
    cmpDiv.innerHTML = "<strong>CMP:</strong> " + cmpName;
    //cmpDiv.appendChild(elCMP);
  });
}

// list cookies
function showCookieResult() {
  chrome.storage.sync.get("cookies", (cookies) => {
    console.log(cookies.cookies);
    cookieTable.innerHTML = "";
    for (cookie in cookies.cookies) {
      let elCookie = document.createElement("tr");
      elCookie.innerHTML =
        "<td>" +
        cookies.cookies[cookie].name +
        "</td><td>" +
        cookies.cookies[cookie].domain +
        "</td>";
      cookieTable.appendChild(elCookie);
    }
  });
}

// onclick events are not allowed, therefore we have to addEventListener to buttons etc.
document.addEventListener("DOMContentLoaded", function () {
  var btn = document.getElementById("delete");
  btn.addEventListener("click", function () {
    deleteCookies();
  });
});
