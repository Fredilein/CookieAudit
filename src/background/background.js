/**
 * background.js
 * -------------
 * Handle all incoming cookies. Store them in the chrome storage, classify them and do some additional analysis.
 */

import {
  escapeString,
  datetimeToExpiry,
  urlToUniformDomain,
  classIndexToString,
  classStringToIndex
} from "/modules/globals.js";
import {extractFeatures} from "/modules/extractor.js";
import {predictClass} from "/modules/predictor.js";
import {analyzeCMP} from "/modules/cmp.js";
import {db} from "/modules/db.js";

const SCANSTAGE = ["initial", "necessary", "all", "finished"];

const NOCHECK_EXPIRY = ["OptanonConsent", "OptanonAlertBoxClosed", "CookieConsent"];

const UPDATE_LIMIT = 10;
const MINTIME = 120000;

/**
 * chrome.storage works asynchronously, to prevent race conditions we need to lock the storage ourselves. This is done here.
 */
const storage = (() => {
  let mutex = Promise.resolve();
  const API = chrome.storage.local;
  const mutexExec = (method, data) => {
    mutex = Promise.resolve(mutex)
        .then(() => method(data))
        .then(result => {
          mutex = null;
          return result;
        });
    return mutex;
  };
  const syncGet = data => new Promise(resolve => API.get(data, resolve));
  const syncSet = data => new Promise(resolve => API.set(data, resolve));
  return {
    read: data => mutexExec(syncGet, data),
    write: data => mutexExec(syncSet, data),
  };
})();


/**
 * Construct a string formatted key that uniquely identifies the given cookie object.
 * @param {Object}    cookieDat Stores the cookie data, expects attributes name, domain and path.
 * @returns {String}  string representing the cookie's key
 */
const constructKeyFromCookie = function (cookieDat) {
  return `${cookieDat.name};${urlToUniformDomain(cookieDat.domain)};${
      cookieDat.path
  }`;
};

/**
 * Creates a new feature extraction input object from the raw cookie data.
 * @param  {Object} cookie    Raw cookie data as received from the browser.
 * @return {Promise<object>}  Feature Extraction input object.
 */
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
const updateFEInput = async function (storedFEInput, rawCookie) {
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
const insertCookieIntoStorage = async function (serializedCookie) {
  let ckey = constructKeyFromCookie(serializedCookie);

  let {cookies} = await storage.read("cookies");
  cookies[ckey] = serializedCookie;
  await storage.write({cookies});
  return true;
}

/**
 * Remove a cookie from the browser and from historyDB
 */
const clearCookies = async function () {
  // First we delete the cookies from the browser
  var removeCookie = function (cookie) {
    var url =
        "http" + (cookie.secure ? "s" : "") + "://" + cookie.domain + cookie.path;
    chrome.cookies.remove({url: url, name: cookie.name});
  };

  chrome.cookies.getAll({}, function (all_cookies) {
    var count = all_cookies.length;
    console.log(`${count} cookies to remove from chrome`);
    for (var i = 0; i < count; i++) {
      removeCookie(all_cookies[i]);
    }
  });

  if (!chrome.cookies.onChanged.hasListener(cookieListener)) {
    chrome.cookies.onChanged.addListener(cookieListener);
    console.log("added listener");
  } else {
    console.log("already has listener");
  }

  await storage.write({"cookies": {}});
};

/**
 * Retrieve all cookies from IndexedDB storage via a transaction.
 * @returns {Promise<Object>} Array of all cookies.
 */
const getCookiesFromStorage = async function () {
  let {cookies} = await storage.read("cookies");
  return cookies;
}

/**
 * Retrieve serialized cookie from IndexedDB storage via a transaction.
 * @param {Object} cookieDat Raw cookie object that provides name, domain and path.
 * @returns {Promise<Object>} Either the cookie if found, or undefined if not.
 */
const retrieveCookieFromStorage = async function (cookieDat) {
  let ckey = constructKeyFromCookie(cookieDat);
  let {cookies} = await storage.read("cookies");
  if (cookies[ckey]) {
    return cookies[ckey];
  } else {
    return null;
  }
}

/**
 * Handlers for all messages sent to the background script.
 */
chrome.runtime.onMessage.addListener(function (request, _, sendResponse) {
  if (request === "get_cookies") {
    getCookiesFromStorage().then((cookies) => {
      sendResponse(cookies);
    });
  } else if (request === "clear_cookies") {
    console.log("background is clearing cookies...");
    clearCookies();
    sendResponse(true);
  } else if (request === "start_scan") {
    clearCookies();
    if (!chrome.cookies.onChanged.hasListener(cookieListener)) {
      chrome.cookies.onChanged.addListener(cookieListener);
      sendResponse("added listener")
    } else {
      sendResponse("already has listener");
    }
  } else if (request === "stop_scan") {
    if (chrome.cookies.onChanged.hasListener(cookieListener)) {
      sendResponse("removed listener");
    } else {
      sendResponse("no listener attached");
    }
  } else if (request === "start_advanced") {
    if (!chrome.cookies.onChanged.hasListener(cookieListener)) {
      chrome.cookies.onChanged.addListener(cookieListener);
      sendResponse("added listener")
    } else {
      sendResponse("already has listener");
    }
  } else if (request === "analyze_cookies") {
    getCookiesFromStorage().then((cookies) => {
      if (!cookies) {
        sendResponse("no cookies to analyze");
        return true;
      }
      for (let c of Object.keys(cookies)) {
        analyzeCookie(cookies[c]);
      }
      sendResponse("analyzed");
    });
  } else if (request === "total_cookies") {
    getCookiesFromStorage().then((cookies) => {
      sendResponse(Object.keys(cookies).length);
    })
  } else if (request === "store_log") {
    storeLog();
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

  return label;
};

/**
 * This function sets up all the analysis after it received a new cookie.
 * Right now we assume (due to removal of all cookies prior to a scan) that every cookie arrives here
 * AFTER a scan is started.
 * @param cookie  Serialized cookie
 */
const analyzeCookie = function (cookie) {
  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan || res.scan.stage === SCANSTAGE[0] || res.scan.stage === SCANSTAGE[3]) {
      return;
    }

    // getCMP
    const cmp = analyzeCMP(cookie);
    // if (cmp && (!res.scan.cmp || !res.scan.cmp.choices)) {
    if (cmp && (!res.scan.cmp || cmp.choices)) {
      res.scan.cmp = cmp;
    }

    // getWarnings
    if (res.scan.stage === SCANSTAGE[1]) {
      if (cookie.current_label > 0 && !res.scan.nonnecessary.some((c) => c.name === cookie.name)) {
        res.scan.nonnecessary.push(cookie);
      }
    }

    if (res.scan.stage === SCANSTAGE[2]) {
      if (!res.scan.consentNotice) {
        chrome.storage.local.set({"scan": res.scan});
        return;
      }

      const cookieCategories = findCookieCategories(cookie.name, res.scan.consentNotice);

      if (cookieCategories.length === 0 && !res.scan.undeclared.some((c) => c.name === cookie.name)) {
        res.scan.undeclared.push(cookie);
      } else if (cookieCategories.length > 1 && !res.scan.multideclared.some((c) => c.name === cookie.name)) {
        res.scan.multideclared.push(cookie);
      } else if (cookieCategories.length === 1) {
        // cookie is present in exactly one category of the consent notice
        const cat = cookieCategories[0];
        if (classStringToIndex(cat) < cookie.current_label && !res.scan.wrongcat.some((c) => c.cookie.name === cookie.name)) {
          res.scan.wrongcat.push({"cookie": cookie, "consent_label": cat});
        }

        // check expiry
        if (!res.scan.consentNotice[cat]) {
          chrome.storage.local.set({"scan": res.scan});
          return;
        }
        const declaration = res.scan.consentNotice[cat].find((c) => cookie.name.startsWith(c.name.replace(/x+$/, "")))
        if (!declaration || NOCHECK_EXPIRY.includes(declaration.name) || res.scan.wrongexpiry.some((c) => c.cookie.name === cookie.name)) {
          chrome.storage.local.set({"scan": res.scan});
          return;
        }

        if (declaration.session) {
          if (!cookie.variable_data[cookie.variable_data.length - 1].session) {
            res.scan.wrongexpiry.push({"cookie": cookie, "consent_expiry": "session"});
            chrome.storage.local.set({"scan": res.scan});
            return;
          }
        }

        if (cookie.variable_data[cookie.variable_data.length - 1].session) {
          res.scan.wrongexpiry.push({"cookie": cookie, "consent_expiry": "nosession"});
          chrome.storage.local.set({"scan": res.scan});
          return;
        }

        if (Number(cookie.variable_data[cookie.variable_data.length - 1].expiry) > 1.5 * declaration.expiry) {
          res.scan.wrongexpiry.push({"cookie": cookie, "consent_expiry": declaration.expiry});
        }
      }
    }

    chrome.storage.local.set({"scan": res.scan});
  });
}

/**
 * Find all categories of the consent notice where a cookie is present
 * @param cookieName
 * @param consentNotice
 * @returns {[]} Array with all category strings
 */
const findCookieCategories = function (cookieName, consentNotice) {
  let categories = [];
  for (let cat of Object.keys(consentNotice)) {
    if (consentNotice[cat].find((c) => cookieName.startsWith(c.name.replace(/x+$/, "")))) {
      categories.push(cat);
    }
  }
  return categories;
}

/**
 * Store the scan in the database
 */
const storeLog = function () {
  console.log("Storing Log into Database...");

  if (!db) {
    console.log("Database connection info missing!");
    return;
  }

  chrome.storage.local.get("scan", (res) => {
    if (!res || !res.scan) {
      console.log("No scan to export to database");
      return;
    }

    const data = {
      "dataSource": db.dataSource,
      "database": db.database,
      "collection": db.collection,
      "document": res.scan
    }

    // request options
    const options = {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Request-Headers': '*',
        'api-key': db.apiKey
      }
    }

    // send POST request
    fetch(db.url, options)
        .then(res => res.json())
        .then(res => console.log(res));
  });
}

/**
 * Retrieve the cookie and classify it.
 * @param {Object} newCookie Raw cookie object directly from the browser.
 * @param {Object} storeUpdate Whether
 */
const handleCookie = async function (newCookie, storeUpdate, overrideTimeCheck) {

  // First, if consent is given, check if the cookie has already been stored.
  let serializedCookie, storedCookie;
  try {
    storedCookie = await retrieveCookieFromStorage(newCookie)
    if (storedCookie) {
      if (storeUpdate) {
        serializedCookie = await updateFEInput(storedCookie, newCookie);
      } else {
        serializedCookie = storedCookie;
      }
    }
  } catch (err) {
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
    // analyzeCMP(newCookie);
    clabel = await classifyCookie(newCookie, serializedCookie);

    // Update timestamp and label of the stored cookie
    serializedCookie["current_label"] = clabel;
    serializedCookie["label_ts"] = Date.now();
    console.debug("Perform Prediction: Cookie (%s;%s;%s) receives label (%s)", newCookie.name, newCookie.domain, newCookie.path, classIndexToString(clabel));
  } else {
    console.debug("Skip Prediction: Cookie (%s;%s;%s) with label (%s)", newCookie.name, newCookie.domain, newCookie.path, classIndexToString(clabel));
  }

  // If consent is given, store the cookie again.
  const inserted = await insertCookieIntoStorage(serializedCookie);
  if (!inserted) {
    console.error("couldn't insert cookie");
    return;
  }

  analyzeCookie(serializedCookie);
}

/**
 * Listener that is executed any time a cookie is added, updated or removed.
 * @param {Object} changeInfo  Contains the cookie itself, and cause info.
 */
const cookieListener = function (changeInfo) {
  if (!changeInfo.removed) {
    handleCookie(changeInfo.cookie, true, false);
  }
}

chrome.cookies.onChanged.addListener(cookieListener);