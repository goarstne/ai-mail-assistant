/**
 * Popup der message_display_action.
 *
 * Zustaendig nur noch fuer: Mail lesen, Text extrahieren (dafuer braucht es das
 * DOM des Popups), Auftrag an das Hintergrundskript schicken. Der Netzwerk-
 * aufruf und das Einfuegen der Antwort liegen in background.js, damit das
 * Schliessen des Popups den Vorgang nicht mehr abbricht (H4).
 */
"use strict";

const { translate, applyToDocument } = globalThis.KimiI18n;
const MailText = globalThis.KimiMailText;
const Ui = globalThis.KimiUi;
const $ = Ui.$;

/** @type {{id: number, author: string, subject: string} | null} */
let currentMessage = null;
let extractedBody = "";

/**
 * Ermittelt den Kopf der angezeigten Nachricht.
 *
 * `messageDisplay.getDisplayedMessage()` (Singular) gibt es in aktuellen
 * Thunderbird-Versionen nicht mehr - der Aufruf scheiterte mit
 * "is not a function". Massgeblich ist `getDisplayedMessages()` (Plural).
 * Die Singular-Variante bleibt als Rueckfall fuer aeltere Versionen stehen.
 */
async function getDisplayedHeader(tabId) {
  const api = browser.messageDisplay;

  if (typeof api.getDisplayedMessages === "function") {
    return MailText.firstMessage(await api.getDisplayedMessages(tabId));
  }
  if (typeof api.getDisplayedMessage === "function") {
    return MailText.firstMessage(await api.getDisplayedMessage(tabId));
  }
  throw new Error(translate("errApiUnavailable"));
}

/** Liest die aktuell angezeigte Nachricht und bereitet ihren Text auf. */
async function loadDisplayedMessage() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error(translate("errNoTab"));

  const header = await getDisplayedHeader(tabs[0].id);
  if (!header) {
    $("subject").textContent = translate("noMessageSelected");
    Ui.disableMainUi();
    return;
  }

  currentMessage = { id: header.id, author: header.author || "", subject: header.subject || "" };
  $("subject").textContent = currentMessage.subject || translate("noSubject");
  $("author").textContent = currentMessage.author || translate("unknownAuthor");

  const fullMessage = await browser.messages.getFull(header.id);
  // M1-M3: contentType-basierte Auswahl, Anhaenge werden uebersprungen,
  // Blockgrenzen bleiben als Zeilenumbrueche erhalten.
  const extracted = MailText.extractMailText(fullMessage, new DOMParser());
  extractedBody = extracted.text;

  if (extracted.source === "none" || extractedBody === "") {
    // Kein lesbarer Textteil (z. B. reine Bildmail oder verschluesselte Nachricht).
    $("extractionNote").textContent = translate("noticeNoBody");
    $("extractionNote").classList.remove("hidden");
    Ui.disableMainUi();
  }
}

/**
 * Ein Klick auf einen Vorschlag erzeugt die Antwort direkt.
 *
 * Die Anweisung wandert trotzdem ins Eingabefeld - so ist nachvollziehbar,
 * womit erzeugt wurde, und nach einem Fehlschlag laesst sie sich anpassen und
 * erneut abschicken, statt verloren zu sein.
 */
function applySuggestion(suggestion) {
  $("userPrompt").value = suggestion.instruction;
  Ui.hideError();
  generate(suggestion.instruction);
}

/** Kontext fuer die Vorschlaege: dieselbe Nachricht, die auch beantwortet wird. */
function suggestionContext() {
  return {
    author: currentMessage.author,
    subject: currentMessage.subject,
    body: extractedBody
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  applyToDocument();
  Ui.wireOptionsButton();

  $("suggestBtn").addEventListener("click", () => {
    if (currentMessage) Ui.loadSuggestions(suggestionContext(), translate, applySuggestion);
  });

  try {
    const consentOk = await Ui.enforceConsent(translate);
    await loadDisplayedMessage();
    if (!consentOk) {
      Ui.disableMainUi();
      return;
    }

    // Vorschlaege nur, wenn es auch Inhalt gibt, ueber den sich etwas sagen laesst.
    if (currentMessage && extractedBody) {
      Ui.setSuggestionState("idle");
      const { autoSuggest } = await globalThis.KimiConfig.loadSettings(browser.storage);
      if (autoSuggest) {
        Ui.loadSuggestions(suggestionContext(), translate, applySuggestion);
      } else {
        Ui.setSuggestionState("hint", translate("suggestManualHint"));
      }
    }
  } catch (err) {
    Ui.showError(translate("errReadMail", String(err && err.message)));
    Ui.disableMainUi();
  }
});

async function generate(instruction) {
  if (Ui.isBusy()) return; // Doppelklick-Schutz zusaetzlich zum disabled-Attribut.

  const userPrompt = String(instruction || "").trim();
  if (!userPrompt) {
    Ui.showError(translate("errNoPrompt"));
    return;
  }
  if (!currentMessage) {
    Ui.showError(translate("noMessageSelected"));
    return;
  }

  Ui.hideError();
  Ui.showLoading(true);

  try {
    // Der Auftrag laeuft im Hintergrundskript zu Ende, auch wenn dieses Popup
    // waehrenddessen den Fokus verliert und geschlossen wird.
    const result = await browser.runtime.sendMessage({
      type: "generateReply",
      messageId: currentMessage.id,
      userPrompt,
      mail: {
        author: currentMessage.author,
        subject: currentMessage.subject,
        body: extractedBody
      }
    });

    if (result && result.ok) {
      window.close();
      return;
    }
    Ui.showError((result && result.error) || translate("errUnknown"));
  } catch (err) {
    Ui.showError((err && err.message) || translate("errUnknown"));
  } finally {
    Ui.showLoading(false);
  }
}

$("generateBtn").addEventListener("click", () => generate($("userPrompt").value));
