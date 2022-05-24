import { escapeString, datetimeToExpiry, urlToUniformDomain, classIndexToString } from "/modules/globals.js";
import { extractFeatures } from "/modules/extractor.js";
import { predictClass } from "/modules/predictor.js";
import { analyzeCMP } from "/modules/cmp.js";

var historyDB = undefined;
const openDBRequest = indexedDB.open("CookieDB", 1);

const UPDATE_LIMIT = 10;
const MINTIME = 120000;
// const PAUSE = false;


// executed if the database is new or needs to be updated
openDBRequest.onupgradeneeded = function (event) {
  let objectStore = event.target.result.createObjectStore("cookies");
  objectStore.createIndex("name", "name", { unique: false });
  objectStore.createIndex("domain", "domain", { unique: false });
  objectStore.createIndex("path", "path", { unique: false });
  objectStore.createIndex("label", "current_label", { unique: false });
  console.info("Upgraded the CookieDB.");
};

// success will be called after upgradeneeded
openDBRequest.onsuccess = function (ev1) {
  console.info("Successfully connected to CookieDB.");
  historyDB = ev1.target.result;
  historyDB.onerror = function (ev2) {
    console.error("Database error: " + ev2.target.errorCode);
  };
};

// if the connection failed
openDBRequest.onerror = function (event) {
  console.error(
    `Failed to open CookieDB with error code: ${event.target.errorCode}`
  );
};

const constructKeyFromCookie = function (cookieDat) {
  return `${cookieDat.name};${urlToUniformDomain(cookieDat.domain)};${
    cookieDat.path
  }`;
};

const createFEInput = function (cookie) {
  return {
    name: escapeString(cookie.name),
    domain: escapeString(cookie.domain),
    path: escapeString(cookie.path),
    current_label: -1,
    label_ts: 0,
    storeId: escapeString(cookie.storeId),
    variable_data: [
      {
        host_only: cookie.hostOnly,
        http_only: cookie.httpOnly,
        secure: cookie.secure,
        session: cookie.session,
        expirationDate: cookie.expirationDate,
        expiry: datetimeToExpiry(cookie),
        value: escapeString(cookie.value),
        same_site: escapeString(cookie.sameSite),
        timestamp: Date.now(),
      },
    ],
  };
};

/**
 * Updates the existing feature extraction object with data from the new cookie.
 * Specifically, the variable data attribute will have the new cookie's data appended to it.
 * If the update limit is reached, the oldest update will be removed.
 * @param  {Object} storedFEInput   Feature Extraction input, previously constructed.
 * @param  {Object} rawCookie       New cookie data, untransformed.
 * @return {Promise<object>}        The existing cookie object, updated with new data.
 */
const updateFEInput = async function(storedFEInput, rawCookie) {
    let updateArray = storedFEInput["variable_data"];

    let updateStruct = {
        "host_only": rawCookie.hostOnly,
        "http_only": rawCookie.httpOnly,
        "secure": rawCookie.secure,
        "session": rawCookie.session,
        "expiry": datetimeToExpiry(rawCookie),
        "value": escapeString(rawCookie.value),
        "same_site": escapeString(rawCookie.sameSite),
        "timestamp": Date.now()
    };

    // remove head if limit reached
    if (updateArray.length >= UPDATE_LIMIT)
        updateArray.shift();

    updateArray.push(updateStruct);
    console.assert(updateArray.length > 1, "Error: Performed an update without appending to the cookie?");
    console.assert(updateArray.length <= UPDATE_LIMIT, "Error: cookie update limit still exceeded!");

    return storedFEInput;
};

/**
 * Insert serialized cookie into IndexedDB storage via a transaction.
 * @param {Object} serializedCookie Cookie to insert into storage.
 */
// const insertCookieIntoStorage = function (cookie) {
//   if (historyDB !== undefined) {
//     let putRequest = historyDB
//       .transaction("cookies", "readwrite")
//       .objectStore("cookies")
//       .put(cookie, cookie.name);
//     putRequest.onerror = function (event) {
//       console.error(
//         `Failed to insert cookie (${cookie.name}) into IndexedDB storage: ${event.target.errorCode}`
//       );
//     };
//   } else {
//     console.error(
//       "Could not insert cookie because database connection is closed!"
//     );
//   }
// };

/**
 * Insert serialized cookie into IndexedDB storage via a transaction.
 * @param {Object} serializedCookie Cookie to insert into storage.
 */
const insertCookieIntoStorage = function(serializedCookie) {
    if (historyDB !== undefined) {
        let ckey = constructKeyFromCookie(serializedCookie);
        let putRequest = historyDB.transaction("cookies", "readwrite").objectStore("cookies").put(serializedCookie, ckey);
        putRequest.onerror = function(event) {
            console.error(`Failed to insert cookie (${ckey}) into IndexedDB storage: ${event.target.errorCode}`);
        }
    } else {
        console.error("Could not insert cookie because database connection is closed!");
    }
}


const clearCookies = function () {
  // First we delete the cookies from the browser
  var removeCookie = function (cookie) {
    var url =
      "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
    chrome.cookies.remove({ url: url, name: cookie.name });
  };

  chrome.cookies.getAll({}, function (all_cookies) {
    var count = all_cookies.length;
    for (var i = 0; i < count; i++) {
      removeCookie(all_cookies[i]);
    }
  });

  // Second, we also clear the historyDB
  if (historyDB !== undefined) {
    return new Promise((resolve) => {
      let trans = historyDB.transaction(["cookies"], "readwrite");
      trans.oncomplete = () => {
        resolve();
      };

      let store = trans.objectStore("cookies");
      store.clear();
    });
  } else {
    console.error(
      "Could not clear cookies because database connection is closed!"
    );
  }
};

const getCookiesFromStorage = async function () {
  if (historyDB !== undefined) {
    return new Promise((resolve) => {
      let trans = historyDB.transaction(["cookies"], "readonly");
      trans.oncomplete = () => {
        resolve(cookies);
      };

      let store = trans.objectStore("cookies");
      let cookies = [];

      store.openCursor().onsuccess = (e) => {
        let cursor = e.target.result;
        if (cursor) {
          cookies.push(cursor.value);
          cursor.continue();
        }
      };
    });
  } else {
    console.error(
      "Could not insert cookie because database connection is closed!"
    );
  }
};

/**
 * Retrieve serialized cookie from IndexedDB storage via a transaction.
 * @param {Object} cookieDat Raw cookie object that provides name, domain and path.
 * @returns {Promise<Object>} Either the cookie if found, or undefined if not.
 */
const retrieveCookieFromStorage = function(cookieDat) {
    if (historyDB !== undefined) {
        let ckey = constructKeyFromCookie(cookieDat);

        let request = historyDB.transaction("cookies").objectStore("cookies").get(ckey);
        return new Promise((resolve, reject) => {
            request.onerror = function(event) {
                console.error("Failed to retrieve cookie: " + ckey);
                reject(`Error on retrieving cookie (${ckey}) -- Error code ${event.target.errorCode}`);
            };
            request.onsuccess = function(event) {
                resolve(event.target.result);
            };
        });
    } else {
        console.error("Could not retrieve cookie because database connection is closed!");
        return new Promise((resolve, reject) => { reject("Database connection closed."); });
    }
}

chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
  if (request === "get_cookies") {
    getCookiesFromStorage().then((cookies) => {
      // console.log(`sending cookies to frontend`);
      sendResponse(cookies);
    });
  } else if (request === "clear_cookies") {
    console.log("clearing cookies...");
    clearCookies().then((res) => {
      sendResponse(res);
    });
  }
  return true; // Need this to avoid 'message port closed' error
});

/**
 * Using the cookie input, extract features from the cookie and classify it, retrieving a label.
 * @param  {Object} feature_input   Transformed cookie data input, for the feature extraction.
 * @return {Promise<Number>}        Cookie category label as an integer, ranging from [0,3].
 */
const classifyCookie = async function (_, feature_input) {
  // Feature extraction timing
  let features = extractFeatures(feature_input);
  let label = await predictClass(features, 3); // 3 from cblk_pscale default
  console.log("Label: ", label, "(", classIndexToString(label), ")");

  // if (label < 0 && label > 3) {
  //     throw new Error(`Predicted label exceeded valid range: ${label}`);
  // }

  return label;
};

// const handleCookie = function (cookie) {
//   const serializedCookie = createFEInput(cookie);
//   console.log("Cookie: ", cookie.name);
//   const label = classifyCookie(cookie, serializedCookie);
// };

/**
 * Retrieve the cookie, classify it, then apply the policy.
 * @param {Object} newCookie Raw cookie object directly from the browser.
 * @param {Object} storeUpdate Whether
 */
 const handleCookie = async function (newCookie, storeUpdate, overrideTimeCheck){

    // First, if consent is given, check if the cookie has already been stored.
    let serializedCookie, storedCookie;
    try {
        if (storedCookie = await retrieveCookieFromStorage(newCookie)) {
            if (storeUpdate) {
                serializedCookie = await updateFEInput(storedCookie, newCookie);
            } else {
                serializedCookie = storedCookie;
            }
        }
    } catch(err) {
        console.error("Retrieving or updating cookie failed unexpectedly.\nOriginal error: " + err.message);
    }

    // if consent not given, or cookie not present, create a new feature extraction object
    if (serializedCookie === undefined) {
        serializedCookie = createFEInput(newCookie);
    }

    // If cookie recently classified, use previous label.
    let elapsed = Date.now() - serializedCookie["label_ts"];

    let clabel = serializedCookie["current_label"];
    console.assert(clabel !== undefined, "Stored cookie label was undefined!!");

    if (overrideTimeCheck || clabel === -1 || elapsed > MINTIME) {
        analyzeCMP(newCookie);       
        clabel = await classifyCookie(newCookie, serializedCookie);

        // Update timestamp and label of the stored cookie
        serializedCookie["current_label"] = clabel;
        serializedCookie["label_ts"] = Date.now();
        console.debug("Perform Prediction: Cookie (%s;%s;%s) receives label (%s)", newCookie.name, newCookie.domain, newCookie.path, classIndexToString(clabel));
    } else {
        console.debug("Skip Prediction: Cookie (%s;%s;%s) with label (%s)", newCookie.name, newCookie.domain, newCookie.path, classIndexToString(clabel));
    }

    // If removal is paused, don't make the decision.
    // if (PAUSE) {
    //     console.debug(`Pause Mode Removal Skip: Cookie Identifier: ${constructKeyFromCookie(newCookie)} -- Assigned Label: ${classIndexToString(clabel)}`);
    // } else {
    //     makePolicyDecision(newCookie, clabel);
    // }

    // If consent is given, store the cookie again.
    insertCookieIntoStorage(serializedCookie);
}


chrome.cookies.onChanged.addListener((changeInfo) => {
  if (!changeInfo.removed) {
    // insertCookieIntoStorage(changeInfo.cookie);
    handleCookie(changeInfo.cookie, true, false);
  }
});

// chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
//     if (changeInfo.status === 'complete' && /^http/.test(tab.url)) {
//         chrome.scripting.executeScript({
//             target: { tabId: tabId },
//             files: ["../content/cmp.js"]
//         })
//         .then(() => {
//             console.log("INJECTED THE FOREGROUND SCRIPT.");
//         })
//         .catch(err => console.log(err));
//     }
// });
