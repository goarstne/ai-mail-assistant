/**
 * Erzeugt die Screenshots fuer README und Repository.
 *
 * Nimmt dieselben Seiten auf, die auch das Add-on ausliefert - ueber die
 * Vorschau aus scripts/preview.mjs mit gestubbtem `browser`-Objekt. Nichts
 * daran ist nachgebaut oder retuschiert.
 *
 * Zweistufig je Bild: erst die Inhaltshoehe aus dem DOM lesen, dann mit genau
 * dieser Fenstergroesse aufnehmen. Sonst haengt unten Leerraum dran oder der
 * Knopf ist abgeschnitten.
 *
 * Aufruf: npm run shots
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, existsSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PREVIEW = join(ROOT, ".preview");
const OUT = join(ROOT, "docs/screenshots");

const CHROME_CANDIDATES = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!chrome) {
  console.error("Kein Chrome/Chromium gefunden. Erwartet an einem von:\n  " + CHROME_CANDIDATES.join("\n  "));
  process.exit(1);
}
if (!existsSync(PREVIEW)) {
  console.error("Vorschau fehlt - zuerst `npm run preview` ausfuehren.");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const BASE_FLAGS = [
  "--headless",
  "--disable-gpu",
  "--no-sandbox",
  "--hide-scrollbars",
  "--force-color-profile=srgb",
  "--disable-lcd-text",
  // Ohne diese meldet sich Chromes Updater/Crash-Reporter zu Wort und der
  // Prozess endet mit einem Fehlercode, obwohl das Bild geschrieben wurde.
  "--disable-crash-reporter",
  "--disable-component-update",
  "--disable-background-networking",
  "--no-first-run",
  "--no-default-browser-check",
  "--virtual-time-budget=4000"
];

/**
 * Chrome endet je nach Installation mit einem Fehlercode, auch wenn die
 * Aufnahme gelungen ist. Deshalb zaehlt hier nicht der Rueckgabewert, sondern
 * ob die Datei danach existiert - das prueft der Aufrufer.
 */
function run(args) {
  try {
    return execFileSync(chrome, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 45000
    });
  } catch (err) {
    return String(err.stdout || "");
  }
}

/** Liest die tatsaechliche Inhaltshoehe der Seite. */
function measureHeight(url, width, fallback) {
  try {
    const dom = run([...BASE_FLAGS, "--dump-dom", `--window-size=${width},${fallback}`, url + "&measure=1"]);
    const match = dom.match(/data-measured-height="(\d+)"/);
    if (match) return Number(match[1]);
  } catch (err) {
    console.warn("  Messung fehlgeschlagen, nehme Rueckfallhoehe:", err.message);
  }
  return fallback;
}

const SHOTS = [
  // Englisch - fuer den oberen, internationalen Teil des README
  { file: "popup-reply-en.png",   page: "popup/popup.html",     query: "lang=en&theme=light", width: 412, fallback: 900 },
  { file: "popup-dark-en.png",    page: "popup/popup.html",     query: "lang=en&theme=dark",  width: 412, fallback: 900 },
  { file: "popup-compose-en.png", page: "popup/compose.html",   query: "lang=en&theme=light", width: 412, fallback: 900 },
  { file: "options-en.png",       page: "options/options.html", query: "lang=en&theme=light", width: 880, fallback: 1200 },
  { file: "options-setup-en.png", page: "options/options.html", query: "lang=en&theme=light&key=0&consent=0", width: 880, fallback: 1300 },

  { file: "options-openrouter-en.png", page: "options/options.html", query: "lang=en&theme=light&provider=openrouter", width: 880, fallback: 1400 },

  // Deutsch
  { file: "popup-reply.png",      page: "popup/popup.html",     query: "lang=de&theme=light", width: 412, fallback: 900 },
  { file: "popup-dark.png",       page: "popup/popup.html",     query: "lang=de&theme=dark",  width: 412, fallback: 900 },
  { file: "popup-compose.png",    page: "popup/compose.html",   query: "lang=de&theme=light", width: 412, fallback: 900 },
  { file: "options.png",          page: "options/options.html", query: "lang=de&theme=light", width: 880, fallback: 1200 },
  { file: "options-setup.png",    page: "options/options.html", query: "lang=de&theme=light&key=0&consent=0", width: 880, fallback: 1300 },

  { file: "options-openrouter.png", page: "options/options.html", query: "lang=de&theme=light&provider=openrouter", width: 880, fallback: 1400 },

  { file: "banner.png",           page: "banner.html",          query: "theme=dark", width: 1280, fallback: 440, fixed: true }
];

for (const shot of SHOTS) {
  const url = `file://${join(PREVIEW, shot.page)}?${shot.query}`;
  const height = shot.fixed ? shot.fallback : measureHeight(url, shot.width, shot.fallback);
  const target = join(OUT, shot.file);

  // Chrome schlaegt vereinzelt fehl, ohne dass sich etwas geaendert haette -
  // ein zweiter Anlauf genuegt in aller Regel.
  let written = false;
  for (let attempt = 1; attempt <= 3 && !written; attempt++) {
    run([...BASE_FLAGS, `--screenshot=${target}`, `--window-size=${shot.width},${height}`, url]);
    written = existsSync(target);
    if (!written && attempt < 3) console.warn(`  ${shot.file}: Anlauf ${attempt} fehlgeschlagen, neuer Versuch`);
  }

  if (!written) {
    console.error(`  FEHLER: ${shot.file} wurde nach drei Anlaeufen nicht geschrieben`);
    process.exitCode = 1;
    continue;
  }
  console.log(`  ${shot.file}  ${shot.width}x${height}  (${Math.round(statSync(target).size / 1024)} KB)`);
}

console.log(`\n${SHOTS.length} Aufnahmen in docs/screenshots/`);
