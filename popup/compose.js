/**
 * Popup der compose_action - Text schreiben, waehrend eine Mail verfasst wird.
 *
 * Gegenstueck zu popup.js: dort wird auf eine angezeigte Nachricht geantwortet,
 * hier existiert bereits ein Verfassen-Tab, in den geschrieben wird. Der
 * Netzwerkaufruf liegt in beiden Faellen im Hintergrundskript (H4).
 */
"use strict";

const { translate, applyToDocument } = globalThis.KimiI18n;
const MailText = globalThis.KimiMailText;
const Ui = globalThis.KimiUi;
const $ = Ui.$;

let composeTabId = null;
let draftContext = { recipients: "", subject: "", body: "" };

/** Formatiert die Empfaengerliste; Eintraege koennen Strings oder Objekte sein. */
function formatRecipients(list) {
  if (!list) return "";
  const entries = Array.isArray(list) ? list : [list];
  return entries
    .map((entry) => (typeof entry === "string" ? entry : (entry && entry.address) || ""))
    .filter(Boolean)
    .join(", ");
}

/**
 * Sammelt den Kontext des Entwurfs.
 *
 * Bevorzugt wird die urspruengliche Nachricht ueber `relatedMessageId` gelesen:
 * bei einer Antwort steht sie sauber strukturiert zur Verfuegung, waehrend der
 * zitierte Text im Entwurf durch die Zitatformatierung verunstaltet ist.
 * Sonst dient der bisherige Entwurfstext als Kontext.
 */
async function loadDraftContext() {
  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tabs.length) throw new Error(translate("errNoTab"));
  composeTabId = tabs[0].id;

  const details = await browser.compose.getComposeDetails(composeTabId);
  draftContext.subject = details.subject || "";
  draftContext.recipients = formatRecipients(details.to);

  $("subject").textContent = draftContext.subject || translate("noSubject");
  $("recipients").textContent = draftContext.recipients || translate("noRecipients");

  if (details.relatedMessageId) {
    const full = await browser.messages.getFull(details.relatedMessageId);
    const extracted = MailText.extractMailText(full, new DOMParser());
    draftContext.body = extracted.text;
    $("contextNote").textContent = translate("noticeContextOriginal");
    return;
  }

  const raw = details.isPlainText
    ? details.plainTextBody || ""
    : MailText.htmlToText(details.body || "", new DOMParser());
  draftContext.body = MailText.collapseWhitespace(raw);

  $("contextNote").textContent = draftContext.body
    ? translate("noticeContextDraft")
    : translate("noticeContextEmpty");
}

/** Wie im Antwort-Popup: der Klick erzeugt direkt, die Anweisung bleibt sichtbar. */
function applySuggestion(suggestion) {
  $("userPrompt").value = suggestion.instruction;
  Ui.hideError();
  generate(suggestion.instruction);
}

function suggestionContext() {
  return {
    author: draftContext.recipients,
    subject: draftContext.subject,
    body: draftContext.body
  };
}

document.addEventListener("DOMContentLoaded", async () => {
  applyToDocument();
  Ui.wireOptionsButton();

  $("suggestBtn").addEventListener("click", () => {
    Ui.loadSuggestions(suggestionContext(), translate, applySuggestion);
  });

  try {
    const consentOk = await Ui.enforceConsent(translate);
    await loadDraftContext();
    if (!consentOk) {
      Ui.disableMainUi();
      return;
    }

    // Ohne Kontext gibt es nichts vorzuschlagen - bei einer leeren neuen Mail
    // bleibt der Bereich deshalb ausgeblendet.
    if (draftContext.body) {
      Ui.setSuggestionState("idle");
      const { autoSuggest } = await globalThis.KimiConfig.loadSettings(browser.storage);
      if (autoSuggest) {
        Ui.loadSuggestions(suggestionContext(), translate, applySuggestion);
      } else {
        Ui.setSuggestionState("hint", translate("suggestManualHint"));
      }
    }
  } catch (err) {
    Ui.showError(translate("errReadDraft", String(err && err.message)));
    Ui.disableMainUi();
  }
});

async function generate(instruction) {
  if (Ui.isBusy()) return;

  const userPrompt = String(instruction || "").trim();
  if (!userPrompt) {
    Ui.showError(translate("errNoPrompt"));
    return;
  }
  if (composeTabId === null) {
    Ui.showError(translate("errNoComposeTab"));
    return;
  }

  Ui.hideError();
  Ui.showLoading(true);

  try {
    const result = await browser.runtime.sendMessage({
      type: "generateComposeText",
      composeTabId,
      userPrompt,
      draft: draftContext
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
