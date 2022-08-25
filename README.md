# CookieAudit

**This is still a very early version! It may contain bugs and features are still missing.**

CookieAudit will analyze a website while you navigate through it. It checks the consent popups' compliance with common Data Protection Regulations.

CookieAudit is built on CookieBlock. CookieBlock is a browser extension that is able to categorize cookies into different purposes ("Necessary", "Functionality", "Analytics" and "Advertising") using machine-learning technology. CookieAudit uses these capabilities to provide a developer, or really any curious mind, a tool for analyzing cookie-related behaviour of any website.

This extension has been built by members of the Information Security Group of the Computer Science Department at ETH Zürich, and was developed as part of the semester thesis "Extension for Auditing Consent Popups’ GDPR Compliance". 

## Download links

Currently CookieAudit is only available for chrome:

- [Chrome extension](https://chrome.google.com/webstore/detail/cookieaudit/hoheefgkoickpgelfgijnjnifcpkmbnc)

## Roadmap

- [ ] Check for cookies not declared in the consent notice
- [ ] Check if all declared cookies are classified
- [ ] Check if retention period for all cookies is set correctly
- [ ] Clean and exportable report