# CookieAudit

**This is still a very early version! It may contain bugs and features are still missing.**

CookieAudit will analyze a website while you navigate through it. It checks the consent popups' compliance with common Data Protection Regulations.

CookieAudit is built on CookieBlock. CookieBlock is a browser extension that is able to categorize cookies into different purposes ("Necessary", "Functionality", "Analytics" and "Advertising") using machine-learning technology. CookieAudit uses these capabilities to provide a developer, or really any curious mind, a tool for analyzing cookie-related behaviour of any website.

This extension has been built by members of the Information Security Group of the Computer Science Department at ETH Zürich, and was developed as part of the semester thesis "Extension for Auditing Consent Popups’ GDPR Compliance". 

## Download links

Currently CookieAudit is only available for chrome:

- [Chrome extension](https://chrome.google.com/webstore/detail/cookieaudit/hoheefgkoickpgelfgijnjnifcpkmbnc)

## Build locally

Instead of downloading the extension from the chrome extension store you can also build it locally. To do so follow these steps:

1. Clone this repository
2. Open Chrome and go to  `Window > Extensions`
3. Enable `Developer mode` on the top right
4. Click `Load unpacked`
5. Go to the cloned repository folder and select the folder `src/`
6. The CookieAudit extension should now be in the extensions bar of your Chrome browser

## How to use this extension

1. Close all tabs (opening up a private browsing window could also help)
2. Open up the URL you want to scan
3. Accept necessary cookies only and browse the website. Explore as many subpages and functionality as possible to increase the scan accuracy.

The extension lists all cookies which were set by the website but weren't classified as necessary.

4. (Optional) If the extension was able to read the consent notice (currently only Cookiebot and Onetrust are supported) you can start an advanced scan. Navigate around the website for a second time.

The extension will additionally list undeclared cookies (not present in the consent notice) as well as cookies it classified differently compared to the consent notice.

5. End the scan

The extension will present you with a printable report listing all findings. **This will be implemented soon**.

## Repository contents

- `mockup/` contains just an early version on how the extension might look
- `src/` source code for the CookieAudit extension
    - `assets/` contains bootstrap css+js and fontawesome icons used in the popup
    - `background/` does cookie classification and analysis
    - `content/` is injected into the user page, searches for the consent notice
    - `ext_data/` all external data required to perform the feature extraction and class label prediction
    - `modules/`
        - `cmp.js` tries to detect user submitted cookie preferences. Cookiebot and Onetrust is currently supported.
    - `popup/` contains all code for the UI and handles all state of the scan.