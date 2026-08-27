/**
 * Laedt die lib/-Skripte in den Node-Global-Scope.
 *
 * Die Dateien sind klassische Skripte (MV3-Hintergrundskripte sind keine
 * Module) und haengen sich per IIFE an `globalThis`. `new Function` fuehrt sie
 * genau so aus, ohne dass die Erweiterung fuer die Tests umgebaut werden muss.
 */
"use strict";

const { readFileSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..");

function loadLib(relativePath) {
  const code = readFileSync(join(ROOT, relativePath), "utf8");
  new Function(code)();
}

loadLib("lib/config.js");
loadLib("lib/mailtext.js");

module.exports = {
  Config: globalThis.KimiConfig,
  MailText: globalThis.KimiMailText
};
