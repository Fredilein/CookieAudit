# CookieAudit

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

1. Close all tabs
2. Open the URL you want to scan in a new tab
3. Accept necessary cookies only and browse the website. Explore as many subpages and functionality as possible to increase the scan accuracy.

The extension lists all cookies which were set by the website but weren't classified as necessary.

4. (Optional) If the extension was able to read the consent notice (currently only Cookiebot and Onetrust are supported) you can start an advanced scan. This time, accept all cookies and navigate around the website for a second time.

CookieAudi will analyze all cookies this time. It spots different violations such as undeclared cookies and cookies which are in a potentially wrong category.

5. End the scan

The extension will present you with a report listing all findings. To print the report, click "Export Summary", then `right-click > Print...`.

## Repository contents

- `mockup/` contains just an early version on how the extension might look
- `src/` source code for the CookieAudit extension

> A detailed overview of the code in `src/` and how it works can be found in `src/README.md`

## Future work

- **Adding support for more CMPs**. Instructions on how to do so are in `content/consentNotice.js`.
- **Adding support for more languages**. Currently the cookie banner is analyzed with keywords in `banner.js`. Those keywords
could be extended to provide a more accurate analysis.
- **Automatically conduct scans**. Instead of having the user click through a website this could be automated and extended to multiple websites.