# CookieAudit src/

This folder includes all code for the CookieAudit extension.
To publish the extension on the Chrome store, create a zip from this folder and upload it.

## Overview

### `assets/`
All css/js/fonts which are coming from external sources are in this directory.
- `css/` includes the minified fontawesome css file. Used for all icons throughout the extension.
- `js/` includes the minified bootstrap js file. Used for the dropdown animations.
- `webfonts/` includes fontawesome icons.

### `background/`
The background script acts like a back-end environment. What this script does:
- implement handler which is called whenever there is an update to the chrome cookies
- store new cookies in chrome.storage.local and update these for each cookie update by a website
- delete cookies in the browser + storage when a new scan is started
- call the classification code for new/updated cookies
- analyze cookies for potential violations
- send a POST request to the database to store logs

Some considerations:
- indexedDB, which has been used in CookieBlock, didn't work well with the new manifest.
It is replaced with chrome.storage.local. Because chrome.storage.local works asynchronously we have to prevent race-conditions
ourselves. To do this, we defined our own storage function which locks the database.

### `content/`
These javascript files are injected directly into the website a user is browsing. They can be extended in the future to provide
more accurate consent banner analysis as well as more CMPs where we can do an advanced scan.
- `banner.js` analyzes a cookie popup. It tries to detect such a popup by comparing HTML elements 
with [easylist](https://github.com/easylist/easylist/blob/master/easylist_cookie/easylist_cookie_general_hide.txt).
Currently, we try to determine if there is a reject button on the initial popup and if only the essentials cookie category is preselected.
This is done by comparing keywords. The keywords are also defined in this file and could be extended (even with other languages) in the future.
- `consentNotice.js` parses consent notices, currently for Cookiebot and OneTrust. It then creates a universal cookieNotice object which
is used in an advanced scan to detect violations involving the consent notice, such as undeclared cookies. To add support for more CMPs, this file can be extended in the future.

### `ext_data/`
Contains all external data required to perform the feature extraction and class label prediction
- `model/` includes extracted CART prediction tree forests, one for each class of cookies.
- `resources/` used with the feature extraction.
- `features.json` defines how the feature extraction operates, and which individual feature are enabled.

### `logo/`
Contains the CookieAudit logo in different sizes and formats.

### `modules/`
Contains scripts that handle certain aspects of the feature extraction and prediction as well as cmp analysis.
- `third_party/` code libraries used for prediction
- `cmp.js` contains code which tries to find CMP information and user choices in cookies.
- `db.js` contains connection information to the database.

### `popup/`
Everything relating to the popup window of the extension is in this folder. 
- `popup.html` consist only of the outermost HTML code.
- `popup.js` does all the rendering and handling of button presses.
- `summary.html` is also just the outermost HTML code with a special div. It's used to render the exported summary view.

Considerations:
- Under MV3 it's not possible to import files in `popup.js`. That's one reason why this file is a bit cluttered.

## Violations

Currently CookieAudit is able to detect the following violations for all CMPs:

- Non-essential cookies set
- Missing "reject" button on initial CMP popup (if banner is detected and keywords match)
- Pre-selected non-essential cookie categories (if banner is detected and keywords match)

If the website uses either Cookiebot or OneTrust additional violations can be detected:

- Undeclared cookies
- Cookies in a potentially wrong category
- Cookies that have an expiration time set greater than declared in the consent notice
- Cookies that are set as persistent but declared as session-cookies and vice versa

> More information on the different violations and its justifiications can be found on [cookieaudit.app](cookieaudit.app).

## Report
When a scan is finished, a report is generated. This report lists all problems found during the scan as well as some instructions on how to fix them. These instructions also include a link to the external cookieaudit.app website where you can find more information about the problems detected.

If you wish to print the report (or store it as a PDF file) you can click "Export Summary" and right-click on the popup.

You can also send the log to our research group. The report contains no identifying information about you but rather just all the violations, the consent notice (if found) as well as the start/end date of the scan.

## Notes
### Communication
In MV3 the scripts have to communicate either via message passing or by manipulating stored values in storage.local. Both of it is partly employed
in this extension. Events such as the starting/stopping a scan is communicated via a message from `popup.js` to `background.js`.
For handling everything relating to the state of a scan, we store a scan object in storage.local which is generally written by `background.js`
and read by `popup.js`.

### Data
The most important object is the `scan` object which stores all information regarding the state of a scan. The scan object looks as follows:
```
{
    "stage": <String>,
    "scanStart": <Date>,
    "scanEnd": <Date>,
    "advanced": <Boolean>,
    "cmp": <Object>,
    "consentNotice": <Object>,
    "url": <String>,
    "nonnecessary": <Cookies[]>,
    "wrongcat": <Cookies[]>,
    "undeclared": <Cookies[]>,
    "multideclared": <Cookies[]>,
    "wrongexpiry": <Cookies[]>,
    "cmpWarnings": <String[]>
  }
```
- `stage` is one of `"initial", "necessary", "all", "finished"`
- `scanStart`, `scanEnd` is a date
- `advanced` stores if the user conducted an advanced scan
- `cmp` consists of `cmp.name <String>` and `cmp.choices <String[]>` and is set in `cmp.js`.
- `consentNotice` is an object declared in `content/consentNotice.js`
- `url` is the URL which was in the active tab when the scan started
- `cmpWarnings` is an array of strings set in `content/banner.js`
- the other fields hold an array of cookies which present a violation

### Stages of a scan
- `initial`: The scan wasn't started yet and the starting-screen is displayed. The scan object might not exist at this point.
- `necessary`: The cookie banner is analyze and all cookies which are classified as non-essentials are stored in `scan.nonnecessary`.
- `all`: This stage can only be reached if a cookie notice was found. We check all violations which require the consent notice to be detected.
- `finished`: In this stage the summary is displayed.