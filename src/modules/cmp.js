/**
 * cmp.js
 * ------
 * We try to detect the CMP here by looking at the cookies. We also parse the contents of cookies which hold information
 * about the selected choices by the user.
 */

export const analyzeCMP = function (cookie) {
  var choices;
  switch (cookie.name) {
    case "OptanonConsent":
      choices = getOnetrustChoices(cookie.variable_data[0].value);
      return {
        'name': 'OneTrust',
        'choices': choices
      };
    case "CookieConsent":
      choices = getCookiebotChoices(cookie.variable_data[0].value);
      return {
        'name': 'Cookiebot',
        'choices': choices
      };
    default:
      return null;
  }
}

/**
 * Parse the choices from the onetrust cookie value.
 * @param value
 * @returns {null|[]} Array with all allowed categories
 */
const getOnetrustChoices = function (value) {
  if (!value || !value.includes("group")) {
    return null;
  }
  const groups = decodeURIComponent(value.split("groups=")[1].split("&")[0]);
  const categories = groups.split(",");
  if (categories.length < 4) return null;
  var choices = [];
  for (let i = 0; i < 4; i++) {
    const cat = categories[i].split(":");
    switch (cat[0]) {
      case "C0001":
      case "1":
        if (cat[1] == 1){
          choices.push("Necessary");
        }
        break;
      case "C0002":
      case "2":
        if (cat[1] == 1){
          choices.push("Performance");
        }
        break;
      case "C0003":
      case "3":
        if (cat[1] == 1){
          choices.push("Functional");
        }
        break;
      case "C0004":
      case "4":
        if (cat[1] == 1){
          choices.push("Targeting");
        }
        break;
    }
  }
  return choices;
}

/**
 * Parse the choices from the cookiebot cookie value.
 * @param value
 * @returns {null|[]} Array with all allowed categories
 */
const getCookiebotChoices = function (value) {
  if (!value) {
    return null;
  }
  const groups = decodeURIComponent(value).split(",");
  if (groups.length < 4) {
    console.log("not enough groups: ", groups);
    return null;
  }
  var choices = [];
  for (let i = 1; i < 5; i++) {
    const cat = groups[i].split(':');
    if (cat[1] === 'true') {
      choices.push(cat[0]);
    }
  }
  return choices;
}