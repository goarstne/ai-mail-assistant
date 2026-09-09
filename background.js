/**
 * Hintergrundskript.
 *
 * H4: Der API-Aufruf und das Erzeugen der Antwort liefen frueher im Popup.
 * Popups einer `message_display_action` werden geschlossen, sobald sie den
 * Fokus verlieren - ein Klick ins Hauptfenster waehrend der laufenden Anfrage
 * zerstoerte das Dokument, brach `fetch` ab und die Antwort war ohne jede
 * Meldung verloren. Der komplette Ablauf liegt deshalb jetzt hier: Das Popup
 * schickt nur noch einen Auftrag und darf danach sterben.
 */
"use strict";

const { validateBaseUrl, loadSettings, mailCharBudget } = globalThis.MailAssistantConfig;
const MailText = globalThis.MailAssistantMailText;

/** Fehler mit i18n-Schluessel statt fertiger Meldung (N6). */
class AssistantError extends Error {
  constructor(messageKey, substitution) {
    super(messageKey);
    this.messageKey = messageKey;
    this.substitution = substitution;
  }
}

function t(key, substitution) {
  return browser.i18n.getMessage(key, substitution) || key;
}

/** Baut die Fehlerantwort fuer das Popup - bereits lokalisiert. */
function toErrorResponse(err) {
  if (err instanceof AssistantError) {
    return { ok: false, error: t(err.messageKey, err.substitution) };
  }
  if (err && err.name === "AbortError") {
    return { ok: false, error: t("errTimeout") };
  }
  return { ok: false, error: (err && err.message) || t("errUnknown") };
}

/**
 * M5: Netzwerkaufruf mit Timeout.
 *
 * Ohne `AbortController` dreht der Spinner bei einem haengenden Endpunkt
 * endlos, und das Hintergrundskript haelt die Verbindung unbegrenzt offen.
 */
async function callChatCompletions(settings, messages) {
  const cfg = globalThis.MailAssistantConfig;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(settings.baseUrl + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + settings.apiKey
      },
      body: JSON.stringify(cfg.buildRequestBody(settings.model, messages, settings.provider, settings.modelMetadata[settings.model])),
      redirect: "error",
      signal: controller.signal
    });
    const data = await response.json().catch((err) => {
      if (err && err.name === "AbortError") throw err;
      return null;
    });
    // OpenRouter can also report a generation error inside an HTTP 200 body.
    if (!response.ok || (data && data.error)) {
      const detail = String((data && data.error && data.error.message) || response.statusText || "");
      const status = !response.ok ? response.status : Number(data.error.code) || response.status;
      if (status === 401 || status === 403) throw new AssistantError("errUnauthorized", detail);
      if (status === 402) throw new AssistantError("errCredits", detail);
      if (status === 429) throw new AssistantError("errRateLimited", detail);
      throw new AssistantError("errApi", [String(status), detail]);
    }
    const choice = data && Array.isArray(data.choices) && data.choices[0];
    if (choice && choice.finish_reason === "length") throw new AssistantError("errReplyTruncated");
    const content = choice && choice.message && choice.message.content;
    const reply = typeof content === "string" ? content.trim() : "";
    if (!reply) throw new AssistantError("errEmptyReply");
    return reply;
  } catch (err) {
    if (err instanceof AssistantError || (err && err.name === "AbortError")) throw err;
    throw new AssistantError("errNetwork", String((err && err.message) || err));
  } finally {
    // Covers the response body as well as the initial response headers.
    clearTimeout(timer);
  }
}

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[m]);
}

/**
 * B2: Antwort in den Verfassen-Tab schreiben - getrennt nach Nur-Text und HTML.
 *
 * Frueher wurde immer `body` (HTML) gesetzt. Ist das Konto auf Nur-Text
 * eingestellt - bei vielen Nutzern der Standard -, ist `details.body`
 * `undefined`: `setComposeDetails` scheitert, und die Verkettung
 * `"..." + details.body` schrieb dem Nutzer woertlich `undefined` in die Mail.
 */
async function writeIntoCompose(composeTabId, replyText) {
  const details = await browser.compose.getComposeDetails(composeTabId);

  if (details.isPlainText) {
    const existing = details.plainTextBody || "";
    await browser.compose.setComposeDetails(composeTabId, {
      plainTextBody: replyText + "\n\n" + existing
    });
  } else {
    const safeHtml = escapeHtml(replyText).replace(/\n/g, "<br>");
    const existing = details.body || "";
    await browser.compose.setComposeDetails(composeTabId, {
      body: "<div>" + safeHtml + "</div><br><br>" + existing
    });
  }
  return composeTabId;
}

async function insertReply(messageId, replyText) {
  const composeTab = await browser.compose.beginReply(messageId, "replyToSender");
  return writeIntoCompose(composeTab.id, replyText);
}

/**
 * Der komplette Ablauf: Einstellungen pruefen, Prompt bauen, API rufen,
 * Antwort einfuegen. Laeuft vollstaendig im Hintergrund und ueberlebt das
 * Schliessen des Popups.
 */
/** Gemeinsame Vorpruefung beider Ablaeufe. */
async function prepareSettings() {
  const settings = await loadSettings(browser.storage);

  // H3: Ohne ausdrueckliche Zustimmung werden keine Mailinhalte uebertragen.
  if (!settings.consentGiven) throw new AssistantError("errNoConsent");
  if (!settings.apiKey) throw new AssistantError("errNoApiKey");

  // H2: Zweite Pruefung im Hintergrund - die Optionsseite ist nicht die
  // einzige moegliche Quelle des gespeicherten Wertes.
  const urlCheck = validateBaseUrl(settings.baseUrl, settings.provider);
  if (!urlCheck.ok) throw new AssistantError(urlCheck.reason);
  settings.baseUrl = urlCheck.url;

  /*
   * In Manifest V3 sind `host_permissions` nicht automatisch erteilt - der
   * Nutzer muss sie freigeben. Fehlt die Freigabe, scheitert `fetch` mit einem
   * generischen Netzwerkfehler, der wie ein Serverausfall aussieht. Deshalb
   * vorher explizit pruefen und eine Meldung liefern, die den Weg nennt.
   */
  const originPattern = new URL(settings.baseUrl).origin + "/*";
  const hasHostPermission = await browser.permissions.contains({ origins: [originPattern] });
  if (!hasHostPermission) throw new AssistantError("errHostPermissionMissing", originPattern);

  return settings;
}

/** Prueft und kuerzt die Nutzeranweisung. */
function normalizePrompt(raw) {
  const userPrompt = String(raw || "").trim();
  if (!userPrompt) throw new AssistantError("errNoPrompt");
  return MailText.truncate(userPrompt, globalThis.MailAssistantConfig.MAX_PROMPT_CHARS).text;
}

/** Antwort auf die angezeigte Nachricht. */
async function generateReply(request) {
  const settings = await prepareSettings();
  const userPrompt = normalizePrompt(request.userPrompt);

  const cfg = globalThis.MailAssistantConfig;
  // M4: Kuerzung an genau einer Stelle, abhaengig vom Kontextfenster des Modells.
  const budget = mailCharBudget(settings.model, settings.provider, settings.modelMetadata[settings.model]);
  const mailBody = MailText.truncate(request.mail.body || "", budget);

  const userMessage = MailText.buildUserMessage({
    author: MailText.truncate(request.mail.author || "", cfg.MAX_AUTHOR_CHARS).text,
    subject: MailText.truncate(request.mail.subject || "", cfg.MAX_SUBJECT_CHARS).text,
    body: mailBody.text,
    truncated: mailBody.truncated,
    userPrompt,
    // H1: Nonce pro Request, damit ein Blockende nicht erratbar ist.
    nonce: MailText.createNonce(crypto)
  });

  const replyText = await callChatCompletions(settings, [
    { role: "system", content: MailText.SYSTEM_INSTRUCTION },
    { role: "user", content: userMessage }
  ]);

  await insertReply(request.messageId, replyText);
  return { ok: true, truncated: mailBody.truncated };
}

/**
 * Text fuer eine E-Mail, die der Nutzer gerade verfasst.
 *
 * Unterschied zum Antwort-Ablauf: es gibt bereits einen Verfassen-Tab, in den
 * geschrieben wird, und der Kontext ist der Entwurf statt einer angezeigten
 * Nachricht.
 */
async function generateComposeText(request) {
  const settings = await prepareSettings();
  const userPrompt = normalizePrompt(request.userPrompt);

  const cfg = globalThis.MailAssistantConfig;
  const budget = mailCharBudget(settings.model, settings.provider, settings.modelMetadata[settings.model]);
  const draft = MailText.truncate(request.draft.body || "", budget);

  const userMessage = MailText.buildComposeMessage({
    recipients: MailText.truncate(request.draft.recipients || "", cfg.MAX_AUTHOR_CHARS).text,
    subject: MailText.truncate(request.draft.subject || "", cfg.MAX_SUBJECT_CHARS).text,
    draft: draft.text,
    truncated: draft.truncated,
    userPrompt,
    nonce: MailText.createNonce(crypto)
  });

  const replyText = await callChatCompletions(settings, [
    { role: "system", content: MailText.SYSTEM_INSTRUCTION_COMPOSE },
    { role: "user", content: userMessage }
  ]);

  await writeIntoCompose(request.composeTabId, replyText);
  return { ok: true, truncated: draft.truncated };
}

/**
 * Antwortvorschlaege zu einer Nachricht.
 *
 * Eigener Modellaufruf mit strukturierter Ausgabe: der Nutzer soll sehen,
 * WORUEBER er antworten kann, bevor er eine Formulierung anfordert. Erzeugt
 * keinen Verfassen-Tab und veraendert nichts - schlaegt der Aufruf fehl,
 * bleibt die Erweiterung ueber das Eingabefeld benutzbar.
 */
async function suggestReplies(request) {
  const settings = await prepareSettings();
  const cfg = globalThis.MailAssistantConfig;

  const budget = mailCharBudget(settings.model, settings.provider, settings.modelMetadata[settings.model]);
  const body = MailText.truncate(request.context.body || "", budget);

  const userMessage = MailText.buildSuggestMessage({
    author: MailText.truncate(request.context.author || "", cfg.MAX_AUTHOR_CHARS).text,
    subject: MailText.truncate(request.context.subject || "", cfg.MAX_SUBJECT_CHARS).text,
    body: body.text,
    truncated: body.truncated,
    nonce: MailText.createNonce(crypto)
  });

  const raw = await callChatCompletions(settings, [
    { role: "system", content: MailText.SYSTEM_INSTRUCTION_SUGGEST },
    { role: "user", content: userMessage }
  ]);

  const suggestions = MailText.parseSuggestions(raw, cfg.MAX_SUGGESTIONS);
  if (suggestions.length === 0) throw new AssistantError("errSuggestUnparsable");

  return { ok: true, suggestions };
}

const HANDLERS = {
  generateReply,
  generateComposeText,
  suggestReplies
};

browser.runtime.onMessage.addListener((request) => {
  const handler = request && HANDLERS[request.type];
  if (!handler) return false;

  // Die Promise wird zurueckgegeben, aber der Ablauf haengt nicht am Popup:
  // stirbt es, laeuft diese Kette hier trotzdem zu Ende.
  return handler(request).catch((err) => {
    // Falls das Popup schon geschlossen ist, sieht der Nutzer die Meldung
    // nicht mehr - dann bleibt die Fehlerkonsole die einzige Spur.
    console.error("[AI Mail Assistant]", err);
    return toErrorResponse(err);
  });
});

/**
 * Oeffnet die Einrichtungsseite.
 *
 * `tabs.create` mit ausdruecklicher URL statt `openOptionsPage()`: letzteres
 * ist waehrend des Installationsvorgangs nicht immer bereit. Der Aufruf bleibt
 * als Rueckfall stehen.
 */
async function openSetupPage() {
  try {
    await browser.tabs.create({ url: browser.runtime.getURL("options/options.html") });
  } catch (err) {
    console.warn("[AI Mail Assistant] tabs.create fehlgeschlagen:", err);
    try {
      await browser.runtime.openOptionsPage();
    } catch (fallbackErr) {
      console.error("[AI Mail Assistant] Einrichtungsseite ging nicht auf:", fallbackErr);
    }
  }
}

browser.runtime.onInstalled.addListener(async (details) => {
  /*
   * H3: Nach der Installation zuerst die Einrichtungsseite - dort steht der
   * Datenschutzhinweis, dem zugestimmt werden muss.
   *
   * Frueher haing das an `reason === "install"`. Beim Installieren einer .xpi
   * ueber eine vorhandene Version meldet Thunderbird aber "update", nicht
   * "install" - die Seite blieb also genau bei der Aktualisierung aus, bei der
   * man sie erwartet. Massgeblich ist deshalb nicht der Anlass, sondern ob die
   * Einrichtung ueberhaupt abgeschlossen ist.
   */
  if (details.reason !== "install" && details.reason !== "update") return;

  const settings = await loadSettings(browser.storage);
  if (settings.apiKey && settings.consentGiven) return;

  await openSetupPage();
});
