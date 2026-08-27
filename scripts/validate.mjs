/**
 * Statische Konsistenzpruefungen, die ein Linter nicht abdeckt:
 *   - manifest.json ist valides JSON und referenziert nur vorhandene Dateien
 *   - jeder im Code oder Markup benutzte i18n-Schluessel existiert in ALLEN Locales
 *   - jeder definierte Schluessel wird auch benutzt (findet Karteileichen)
 *
 * Aufruf: npm run validate
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];
const warnings = [];

const read = (p) => readFileSync(join(ROOT, p), "utf8");

// --- Manifest -------------------------------------------------------------
const manifest = JSON.parse(read("manifest.json"));

const referencedFiles = [
  ...manifest.background.scripts,
  manifest.message_display_action.default_popup,
  manifest.message_display_action.default_icon,
  manifest.compose_action.default_popup,
  manifest.compose_action.default_icon,
  manifest.options_ui.page,
  ...Object.values(manifest.icons)
];
for (const file of new Set(referencedFiles)) {
  if (!existsSync(join(ROOT, file))) errors.push(`manifest.json verweist auf fehlende Datei: ${file}`);
}
if (!manifest.browser_specific_settings?.gecko?.id) {
  errors.push("manifest.json: browser_specific_settings.gecko.id fehlt (B1)");
}
if (!manifest.browser_specific_settings?.gecko?.strict_min_version) {
  errors.push("manifest.json: strict_min_version fehlt (B1)");
}

// --- Verweise aus dem Markup ------------------------------------------------
for (const page of ["popup/popup.html", "popup/compose.html", "options/options.html"]) {
  const html = read(page);
  const dir = page.split("/")[0];
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const target = join(ROOT, dir, match[1]);
    if (!existsSync(target)) errors.push(`${page} verweist auf fehlende Datei: ${match[1]}`);
  }
}

// --- Element-IDs: benutzt das Skript nur IDs, die es im Markup auch gibt? ---
// Diese Klasse von Fehler faellt sonst erst zur Laufzeit auf, und dann als
// "null is not an object" mitten im Ablauf.
const ID_USE = /(?:\$\(|getElementById\()\s*["'`]([A-Za-z0-9_-]+)["'`]/g;
const sharedUi = read("lib/ui.js");

for (const [page, script] of [
  ["popup/popup.html", "popup/popup.js"],
  ["popup/compose.html", "popup/compose.js"],
  ["options/options.html", "options/options.js"]
]) {
  const html = read(page);
  const defined = new Set([...html.matchAll(/\bid="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));

  // lib/ui.js laeuft in beiden Popups, also gelten seine IDs dort mit.
  const code = read(script) + (page.startsWith("popup/") ? sharedUi : "");
  for (const match of code.matchAll(ID_USE)) {
    if (!defined.has(match[1])) {
      errors.push(`${script} benutzt Element-ID "${match[1]}", die es in ${page} nicht gibt`);
    }
  }
}

// --- Locales --------------------------------------------------------------
const localeDirs = readdirSync(join(ROOT, "_locales"));
const locales = Object.fromEntries(
  localeDirs.map((l) => [l, JSON.parse(read(join("_locales", l, "messages.json")))])
);
if (!localeDirs.includes(manifest.default_locale)) {
  errors.push(`default_locale "${manifest.default_locale}" hat kein _locales-Verzeichnis`);
}

const allKeys = new Set(Object.keys(locales[manifest.default_locale]));
for (const [locale, messages] of Object.entries(locales)) {
  for (const key of allKeys) {
    if (!messages[key]) errors.push(`_locales/${locale}: Schluessel "${key}" fehlt`);
  }
  for (const key of Object.keys(messages)) {
    if (!allKeys.has(key)) errors.push(`_locales/${locale}: Schluessel "${key}" gibt es nur hier`);
  }
}

// --- Benutzte Schluessel einsammeln ---------------------------------------
const sourceFiles = [
  "background.js",
  "lib/config.js",
  "lib/mailtext.js",
  "lib/i18n.js",
  "lib/ui.js",
  "popup/popup.js",
  "popup/popup.html",
  "popup/compose.js",
  "popup/compose.html",
  "options/options.js",
  "options/options.html",
  "manifest.json"
];

const used = new Set();
const patterns = [
  /\btranslate\(\s*["'`]([A-Za-z0-9_]+)["'`]/g,          // translate("key")
  /\bgetMessage\(\s*["'`]([A-Za-z0-9_]+)["'`]/g,          // browser.i18n.getMessage("key")
  /\bt\(\s*["'`]([A-Za-z0-9_]+)["'`]/g,                   // t("key") in background.js
  /data-i18n(?:-[a-z-]+)?="([A-Za-z0-9_]+)"/g,            // Markup
  /__MSG_([A-Za-z0-9_]+)__/g,                             // manifest / <title>
  /new KimiError\(\s*["'`]([A-Za-z0-9_]+)["'`]/g,         // Fehlerschluessel
  /reason:\s*["'`]([A-Za-z0-9_]+)["'`]/g                  // validateBaseUrl-Gruende
];

// Ein Schluessel kann auch in einem Ausdruck stecken, etwa
// `translate(fertig ? "statusSetupComplete" : "statusSaved")`. Deshalb wird
// zusaetzlich jeder Zeichenkettenliteral innerhalb eines translate()- oder
// t()-Aufrufs eingesammelt.
const CALL_ARGS = /\b(?:translate|getMessage|t)\(([^)]*)\)/g;
const STRING_LITERAL = /["'`]([A-Za-z0-9_]+)["'`]/g;

for (const file of sourceFiles) {
  const content = read(file);
  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) used.add(match[1]);
  }
  for (const call of content.matchAll(CALL_ARGS)) {
    for (const literal of call[1].matchAll(STRING_LITERAL)) used.add(literal[1]);
  }
}

for (const key of used) {
  if (!allKeys.has(key)) errors.push(`i18n-Schluessel "${key}" wird benutzt, ist aber nirgends definiert`);
}
for (const key of allKeys) {
  if (!used.has(key)) warnings.push(`i18n-Schluessel "${key}" ist definiert, wird aber nicht benutzt`);
}

// --- Ergebnis -------------------------------------------------------------
for (const w of warnings) console.warn(`WARN  ${w}`);
for (const e of errors) console.error(`FEHLER ${e}`);

if (errors.length > 0) {
  console.error(`\n${errors.length} Fehler.`);
  process.exit(1);
}
console.log(`OK - ${allKeys.size} i18n-Schluessel in ${localeDirs.length} Sprachen, ${warnings.length} Warnungen.`);
