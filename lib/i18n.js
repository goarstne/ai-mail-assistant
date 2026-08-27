/**
 * N6: Uebersetzt Markup ueber `data-i18n`-Attribute.
 *
 * Die Oberflaechentexte waren zuvor deutsch hart codiert. `_locales/` ist fuer
 * ein AMO-Listing ohnehin noetig und macht die Strings an einer Stelle pflegbar.
 *
 * Unterstuetzte Attribute:
 *   data-i18n              -> textContent
 *   data-i18n-placeholder  -> placeholder
 *   data-i18n-title        -> title
 */
"use strict";

(function (global) {
  const ATTRIBUTE_MAP = {
    "data-i18n-placeholder": "placeholder",
    "data-i18n-title": "title",
    "data-i18n-aria-label": "aria-label"
  };

  function translate(key, substitutions) {
    return browser.i18n.getMessage(key, substitutions) || key;
  }

  function applyToDocument(root) {
    const scope = root || document;

    scope.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = translate(el.getAttribute("data-i18n"));
    });

    for (const [dataAttr, target] of Object.entries(ATTRIBUTE_MAP)) {
      scope.querySelectorAll("[" + dataAttr + "]").forEach((el) => {
        el.setAttribute(target, translate(el.getAttribute(dataAttr)));
      });
    }

    if (document.title.startsWith("__MSG_")) {
      document.title = translate(document.title.slice(6, -2));
    }
  }

  global.KimiI18n = { translate, applyToDocument };
})(globalThis);
