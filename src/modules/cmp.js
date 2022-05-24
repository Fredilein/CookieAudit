export const analyzeCMP = function (cookie) {
  switch (cookie.name) {
    case "OptanonConsent":
      console.log(cookie.name, " - ", cookie.domain);
      console.log(cookie.value);
    case "eupubconsent-v2":
      console.log(cookie.name, " - ", cookie.domain);
      console.log(cookie.value);
    default:
      return;
  }
}
