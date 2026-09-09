/**
 * Erzeugt eine Vorschau der Oberflaeche fuer die Entwicklung.
 *
 * Die Popups laufen sonst nur in Thunderbird - jede Aenderung am Layout
 * erforderte Paketieren, Neuinstallieren, Klicken. Hier werden dieselben
 * HTML- und CSS-Dateien mit einem gestubbten `browser`-Objekt im Browser
 * geoeffnet. Einzige Quelle bleibt das echte Markup: hier wird nur kopiert
 * und ein Skript vorangestellt, nichts nachgebaut.
 *
 * Aufruf: npm run preview   ->   .preview/ (nicht Teil des Pakets)
 */
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, ".preview");

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// Vollstaendig kopieren - CSS und Skripte der Ansichten liegen in denselben
// Verzeichnissen wie ihr Markup; das HTML wird weiter unten ueberschrieben.
for (const dir of ["lib", "styles", "icons", "popup", "options"]) {
  cpSync(join(ROOT, dir), join(OUT, dir), { recursive: true });
}

const messages = JSON.parse(readFileSync(join(ROOT, "_locales/de/messages.json"), "utf8"));
const messagesEn = JSON.parse(readFileSync(join(ROOT, "_locales/en/messages.json"), "utf8"));

const stub = `/* Automatisch erzeugt von scripts/preview.mjs - nicht bearbeiten. */
const CATALOGS = {
  de: ${JSON.stringify(messages, null, 2)},
  en: ${JSON.stringify(messagesEn, null, 2)}
};

/*
 * Beispieldaten - frei erfunden.
 *
 * Bewusst keine echte Korrespondenz: die Vorschau landet in den Screenshots
 * des oeffentlichen Repositorys.
 */
const SAMPLE_SUGGESTIONS = [
  {
    title: "Angebot annehmen",
    description: "Den Wartungsvertrag zum genannten Preis bestätigen und um die Vertragsunterlagen bitten.",
    instruction: "Nimm das Angebot an und bitte um die Vertragsunterlagen."
  },
  {
    title: "Nachverhandeln",
    description: "Auf die längere Laufzeit eingehen, aber einen Nachlass auf den Stundensatz vorschlagen.",
    instruction: "Signalisiere Interesse und schlage einen Nachlass auf den Stundensatz vor."
  },
  {
    title: "Rückfrage stellen",
    description: "Klären, was genau die Reaktionszeit von vier Stunden abdeckt und ob sie auch am Wochenende gilt.",
    instruction: "Frage nach, was die Reaktionszeit abdeckt und ob sie am Wochenende gilt."
  },
  {
    title: "Frist verlängern",
    description: "Um eine Woche mehr Bedenkzeit bitten, weil die Abstimmung intern noch läuft.",
    instruction: "Bitte höflich um eine Woche mehr Bedenkzeit."
  }
];

/*
 * Zustandsschalter ueber die Adresszeile.
 *
 * Zustimmungssperre, Ladeanzeige und Fehlerausgabe bekommt man im normalen
 * Betrieb kaum zu Gesicht - genau die brauchen aber denselben Feinschliff wie
 * der Regelfall. Beispiele:
 *   ?consent=0        Zustimmung fehlt  ->  Sperre
 *   ?key=0            kein API-Key      ->  Sperre mit anderem Text
 *   ?suggest=fail     Vorschlaege scheitern
 *   ?suggest=slow     Vorschlaege laden 30 s  ->  Ladeanzeige in Ruhe ansehen
 *   ?suggest=off      automatisches Laden aus ->  Hinweiszeile
 *   ?body=empty       Nachricht ohne lesbaren Textteil
 *   ?reply=fail       Erzeugen schlaegt fehl  ->  Fehlerkasten
 */
const FLAGS = new URLSearchParams(location.search);

// ?lang=de|en - waehlt den Sprachkatalog. Fuer Aufnahmen beider Sprachfassungen.
const MESSAGES = CATALOGS[FLAGS.get("lang")] || CATALOGS.de;

// ?theme=light|dark - fuer Aufnahmen, ohne die Systemeinstellung zu aendern.
if (FLAGS.has("theme")) {
  document.documentElement.dataset.theme = FLAGS.get("theme");
}

// ?measure=1 - scripts/shots.mjs liest die Inhaltshoehe aus dem DOM, um die
// Aufnahme passgenau zu schneiden statt sie zu raten.
if (FLAGS.get("measure") === "1") {
  window.addEventListener("load", () => {
    setTimeout(() => {
      document.documentElement.setAttribute("data-measured-height", String(document.body.scrollHeight));
    }, 1200);
  });
}

const SAMPLE_BY_LANG = {
  de: {
    author: "Anna Berger <a.berger@musterfirma.example>",
    subject: "Angebot Wartungsvertrag – Rückmeldung bis Freitag",
    body: "Guten Tag,\\n\\nanbei unser Angebot für den Wartungsvertrag: 2.400 EUR jährlich bei 24 Monaten Laufzeit, Reaktionszeit vier Stunden, Stundensatz 95 EUR für Arbeiten außerhalb des Vertrags.\\n\\nWir bräuchten Ihre Rückmeldung bis Freitag.\\n\\nMit freundlichen Grüßen\\nAnna Berger",
    subjectCompose: "Re: Angebot Wartungsvertrag",
    suggestions: SAMPLE_SUGGESTIONS
  },
  en: {
    author: "Anna Berger <a.berger@example-corp.example>",
    subject: "Maintenance contract quote – reply needed by Friday",
    body: "Hello,\\n\\nplease find our quote for the maintenance contract: EUR 2,400 per year on a 24-month term, four-hour response time, EUR 95 per hour for work outside the contract.\\n\\nWe would need your reply by Friday.\\n\\nKind regards\\nAnna Berger",
    subjectCompose: "Re: Maintenance contract quote",
    suggestions: [
      {
        title: "Accept the quote",
        description: "Confirm the maintenance contract at the stated price and ask for the paperwork.",
        instruction: "Accept the quote and ask for the contract documents."
      },
      {
        title: "Negotiate",
        description: "Agree to the longer term but propose a discount on the hourly rate.",
        instruction: "Show interest and propose a discount on the hourly rate."
      },
      {
        title: "Ask a question",
        description: "Clarify what the four-hour response time covers and whether it applies at weekends.",
        instruction: "Ask what the response time covers and whether it applies at weekends."
      },
      {
        title: "Ask for more time",
        description: "Request one more week to decide because the internal review is still running.",
        instruction: "Politely ask for one more week to decide."
      }
    ]
  }
};

const SAMPLE_MAIL = SAMPLE_BY_LANG[FLAGS.get("lang")] || SAMPLE_BY_LANG.de;

const store = {
  apiKey: FLAGS.get("key") === "0" ? "" : "sk-vorschau-nur-zur-ansicht",
  baseUrl: "https://api.moonshot.ai/v1",
  model: "kimi-k3",
  consentGiven: FLAGS.get("consent") !== "0",
  autoSuggest: FLAGS.get("suggest") !== "off",
  modelCache: ["kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6", "moonshot-v1-8k"]
};

if (FLAGS.get("provider") === "openrouter") {
  store.provider = "openrouter";
  store.providers = { openrouter: {
    apiKey: store.apiKey, consentGiven: store.consentGiven,
    model: "moonshotai/kimi-k2.5",
    modelCache: ["openrouter/auto", "moonshotai/kimi-k2.5"],
    modelMetadata: { "moonshotai/kimi-k2.5": { contextTokens: 262144, maxCompletionTokens: 8000 } }
  } };
}

// Preview interactions never contact a real API or use a real key.
globalThis.fetch = async (url) => ({
  ok: true, status: 200,
  json: async () => ({ data: url.includes("openrouter.ai")
    ? [{ id: "openrouter/auto" }, { id: "moonshotai/kimi-k2.5", context_length: 262144, architecture: { output_modalities: ["text"] } }]
    : [{ id: "kimi-k3" }, { id: "moonshot-v1-8k" }] })
});

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

globalThis.browser = {
  i18n: {
    getMessage(key, subs) {
      const entry = MESSAGES[key];
      if (!entry) return "";
      const list = subs === undefined ? [] : [].concat(subs);
      return entry.message.replace(/\\$([A-Z_]+)\\$/g, (whole, name) => {
        const placeholder = (entry.placeholders || {})[name.toLowerCase()];
        if (!placeholder) return whole;
        const index = Number(String(placeholder.content).replace("$", "")) - 1;
        return list[index] === undefined ? whole : list[index];
      });
    }
  },
  storage: {
    local: {
      async get(defaults) { return { ...defaults, ...store }; },
      async set(values) { Object.assign(store, values); },
      async remove(keys) { for (const key of keys) delete store[key]; }
    }
  },
  tabs: { async query() { return [{ id: 1 }]; } },
  permissions: { async contains() { return true; }, async request() { return true; } },
  runtime: {
    openOptionsPage() { window.location.href = "../options/options.html"; },
    async sendMessage(request) {
      if (request.type === "suggestReplies") {
        await delay(FLAGS.get("suggest") === "slow" ? 30000 : 700);
        if (FLAGS.get("suggest") === "fail") {
          return { ok: false, error: MESSAGES.errSuggestUnparsable.message };
        }
        return { ok: true, suggestions: SAMPLE_MAIL.suggestions };
      }
      await delay(1500);
      if (FLAGS.get("reply") === "fail") {
        return { ok: false, error: MESSAGES.errUnauthorized.message.replace("$DETAIL$", "invalid api key") };
      }
      window.alert("Vorschau: hier würde die Antwort erzeugt.\\n\\nAnweisung:\\n" + request.userPrompt);
      return { ok: true };
    }
  },
  messageDisplay: {
    async getDisplayedMessages() {
      return [{
        id: 42,
        author: SAMPLE_MAIL.author,
        subject: SAMPLE_MAIL.subject
      }];
    }
  },
  messages: {
    async getFull() {
      if (FLAGS.get("body") === "empty") {
        return { contentType: "multipart/mixed", parts: [{ contentType: "image/png", body: "iVBOR" }] };
      }
      return {
        contentType: "multipart/alternative",
        parts: [{
          contentType: "text/plain",
          body: SAMPLE_MAIL.body || "Guten Tag,\\n\\nanbei unser Angebot für den Wartungsvertrag: 2.400 EUR jährlich bei 24 Monaten Laufzeit, Reaktionszeit vier Stunden, Stundensatz 95 EUR für Arbeiten außerhalb des Vertrags.\\n\\nWir bräuchten Ihre Rückmeldung bis Freitag, damit wir den Termin für die Erstinstallation halten können.\\n\\nMit freundlichen Grüßen\\nAnna Berger"
        }]
      };
    }
  },
  compose: {
    async getComposeDetails() {
      return {
        isPlainText: false,
        subject: SAMPLE_MAIL.subjectCompose,
        to: [SAMPLE_MAIL.author.replace(/^.*</, "").replace(">", "")],
        body: "<blockquote>Guten Tag, anbei unser Angebot für den Wartungsvertrag …</blockquote>",
        relatedMessageId: null
      };
    }
  }
};
`;

writeFileSync(join(OUT, "stub.js"), stub);

const PAGES = [
  ["popup/popup.html", "Popup an der Nachrichtenanzeige"],
  ["popup/compose.html", "Popup im Verfassen-Fenster"],
  ["options/options.html", "Optionsseite"]
];

for (const [page] of PAGES) {
  const html = readFileSync(join(ROOT, page), "utf8")
    // Der Stub muss vor jedem anderen Skript laufen.
    .replace('<script src="../lib/config.js"></script>', '<script src="../stub.js"></script>\n  <script src="../lib/config.js"></script>')
    // <title>__MSG_x__</title> wird sonst woertlich im Reiter angezeigt.
    .replace(/<title>__MSG_([A-Za-z0-9_]+)__<\/title>/, (whole, key) => `<title>${messages[key].message}</title>`);
  writeFileSync(join(OUT, page), html);
}

// Kopfbild fuer das README - eigene Seite, damit scripts/shots.mjs sie wie
// jede andere Ansicht aufnehmen kann.
const banner = `<!DOCTYPE html>
<html lang="de" data-theme="dark"><head><meta charset="utf-8"><title>AI Mail Assistant</title>
<link rel="stylesheet" href="styles/base.css">
<style>
  body { margin: 0; width: 1280px; height: 440px; display: flex; align-items: center;
         background: radial-gradient(1100px 460px at 18% 12%, #1d3a5c 0%, #16181f 58%, #101116 100%);
         color: #eceff3; overflow: hidden; }
  .wrap { padding: 0 76px; width: 100%; }
  .top { display: flex; align-items: center; gap: 20px; margin-bottom: 22px; }
  .top img { width: 62px; height: 62px; }
  h1 { margin: 0; font-size: 46px; letter-spacing: -0.8px; font-weight: 700; }
  .sub { margin: 0 0 30px 0; font-size: 20px; line-height: 1.45; color: #a9b4c2; max-width: 760px; }
  .sub strong { color: #eceff3; font-weight: 600; }
  .chips { display: flex; flex-wrap: wrap; gap: 10px; max-width: 900px; }
  .chip { border: 1px solid #35506e; background: rgba(74,163,255,0.10); color: #9cc7f5;
          border-radius: 999px; padding: 7px 15px; font-size: 14.5px; font-weight: 500; }
  .foot { position: absolute; right: 76px; bottom: 34px; font-size: 13px; color: #6d7889; text-align: right; line-height: 1.6; }
</style></head>
<body>
  <div class="wrap">
    <div class="top">
      <img src="icons/icon.svg" alt="">
      <h1>AI Mail Assistant</h1>
    </div>
    <p class="sub">Antworten auf E-Mails in Thunderbird — mit <strong>Themenvorschlägen</strong>,
      die sagen, <em>was</em> in der Antwort stünde, bevor sie geschrieben wird.</p>
    <div class="chips">
      <span class="chip">Manifest V3</span>
      <span class="chip">Antwortvorschläge als Themen</span>
      <span class="chip">Verfassen-Fenster</span>
      <span class="chip">Antwortet in der Sprache der Mail</span>
      <span class="chip">Prompt-Injection-Schutz</span>
      <span class="chip">Host-Allowlist</span>
      <span class="chip">Zustimmungspflicht</span>
      <span class="chip">93 Tests</span>
    </div>
  </div>
  <div class="foot">Thunderbird 128+<br>OpenRouter · Kimi / Moonshot AI</div>
</body></html>
`;
writeFileSync(join(OUT, "banner.html"), banner);

const index = `<!DOCTYPE html>
<html lang="de"><head><meta charset="utf-8"><title>AI Mail Assistant - Oberflächenvorschau</title>
<link rel="stylesheet" href="styles/base.css">
<style>
  body { padding: 24px; }
  main { max-width: 1180px; margin: 0 auto; }
  h1 { font-size: 20px; margin: 0 0 6px 0; }
  .lead { color: var(--muted); margin: 0 0 24px 0; }
  .grid { display: flex; gap: 20px; align-items: flex-start; flex-wrap: wrap; }
  figure { margin: 0; }
  figcaption { font-weight: 600; margin-bottom: 8px; font-size: 13px; }
  iframe { border: 1px solid var(--border); border-radius: 8px; background: var(--surface-raised); }
  .states { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-bottom: 18px;
            padding: 10px 14px; background: var(--surface); border-radius: 8px; font-size: 12.5px; }
  .states a { color: var(--accent); }
</style></head>
<body><main>
  <h1>Oberflächenvorschau</h1>
  <p class="lead">Dieselben Dateien wie im Add-on, mit gestubbtem <code>browser</code>-Objekt.
  Nur für die Entwicklung — nicht Teil des Pakets.</p>
  <nav class="states">
    <strong>Zustände:</strong>
${[
  ["popup/popup.html", "Regelfall"],
  ["options/options.html?provider=openrouter", "OpenRouter-Einstellungen"],
  ["popup/popup.html?consent=0", "Zustimmung fehlt"],
  ["popup/popup.html?key=0", "Kein API-Key"],
  ["popup/popup.html?suggest=slow", "Vorschläge laden"],
  ["popup/popup.html?suggest=fail", "Vorschläge scheitern"],
  ["popup/popup.html?suggest=off", "Automatik aus"],
  ["popup/popup.html?body=empty", "Kein Textteil"],
  ["popup/popup.html?reply=fail", "Erzeugen scheitert"]
].map(([href, label]) => `    <a href="${href}" target="viewport">${label}</a>`).join("\n")}
  </nav>
  <div class="grid">
${PAGES.map(([page, label], i) => `    <figure>
      <figcaption>${label}</figcaption>
      <iframe name="${page.startsWith("popup/popup") ? "viewport" : "f" + i}" src="${page}" width="${page.startsWith("popup") ? 412 : 680}" height="${page.startsWith("popup") ? 640 : 900}" title="${label}"></iframe>
    </figure>`).join("\n")}
  </div>
</main></body></html>
`;
writeFileSync(join(OUT, "index.html"), index);

console.log("Vorschau erzeugt: .preview/index.html");
