/**
 * Gemeinsame Popup-Bausteine.
 *
 * Es gibt zwei Popups - eines an der Nachrichtenanzeige, eines im
 * Verfassen-Fenster. Sie teilen sich Ladeanzeige, Fehlerausgabe und die
 * Zustimmungssperre; ohne diese Datei wuerde jede Aenderung daran zweimal
 * gepflegt und die beiden Fassungen liefen auseinander.
 *
 * Erwartete Element-IDs im Markup: consentGate, mainUi, openOptionsBtn,
 * loading, error, generateBtn, userPrompt.
 */
"use strict";

(function (global) {
  const $ = (id) => document.getElementById(id);

  let busy = false;
  const isBusy = () => busy;

  function showLoading(active) {
    busy = active;
    $("loading").classList.toggle("hidden", !active);
    $("generateBtn").disabled = active;

    // Ein Klick auf einen Vorschlag erzeugt sofort - also muessen sie
    // waehrenddessen gesperrt sein, sonst loest ein zweiter Klick einen
    // zweiten Modellaufruf und ein zweites Verfassen-Fenster aus.
    const suggestBtn = $("suggestBtn");
    if (suggestBtn) suggestBtn.disabled = active;
    document.querySelectorAll(".suggestion").forEach((el) => {
      el.disabled = active;
    });
  }

  function showError(message) {
    const box = $("error");
    box.textContent = message;
    box.classList.remove("hidden");
  }

  function hideError() {
    $("error").classList.add("hidden");
  }

  function disableMainUi() {
    $("generateBtn").disabled = true;
    $("userPrompt").disabled = true;
  }

  /** Verdrahtet den Knopf, der zur Optionsseite fuehrt. */
  function wireOptionsButton() {
    $("openOptionsBtn").addEventListener("click", () => {
      browser.runtime.openOptionsPage();
      window.close();
    });
  }

  /**
   * H3: Ohne Zustimmung und ohne Key bleibt die Oberflaeche gesperrt.
   * @returns {Promise<boolean>} ob weitergearbeitet werden darf
   */
  async function enforceConsent(translate) {
    const settings = await global.KimiConfig.loadSettings(browser.storage);
    if (settings.consentGiven && settings.apiKey) return true;

    $("consentGate").classList.remove("hidden");
    $("mainUi").classList.add("hidden");
    $("consentGate").querySelector("p").textContent = settings.consentGiven
      ? translate("errNoApiKey")
      : translate("consentRequired");
    return false;
  }

  /**
   * Zeichnet die Vorschlagsliste.
   *
   * Alle Texte gehen ueber `textContent` ins DOM. Das ist hier kein
   * Formalismus: die Vorschlaege stammen von einem Modell, das eine fremde
   * E-Mail gelesen hat - ihr Wortlaut ist mittelbar vom Absender beeinflussbar.
   *
   * @param {Array<{title: string, description: string, instruction: string}>} suggestions
   * @param {(suggestion: object, element: HTMLElement) => void} onSelect
   */
  function renderSuggestions(suggestions, onSelect) {
    const list = $("suggestionList");
    list.replaceChildren();
    list.setAttribute("role", "group");

    suggestions.forEach((suggestion) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "suggestion";
      // Ohne das liest eine Sprachausgabe nur "Schaltflaeche": der Name wird
      // aus verschachtelten Spans nicht zuverlaessig gebildet.
      item.setAttribute("aria-label", suggestion.title + ": " + suggestion.description);

      const title = document.createElement("span");
      title.className = "suggestion-title";
      title.textContent = suggestion.title;

      const description = document.createElement("span");
      description.className = "suggestion-desc";
      description.textContent = suggestion.description;

      item.append(title, description);
      item.addEventListener("click", () => {
        list.querySelectorAll(".suggestion").forEach((el) => el.classList.remove("selected"));
        item.classList.add("selected");
        onSelect(suggestion, item);
      });
      list.append(item);
    });
  }

  /**
   * Schaltet den Vorschlagsbereich um.
   * @param {"off"|"idle"|"loading"|"ready"|"hint"} state
   * @param {string} [message] Text fuer die Hinweiszeile unter dem Bereich
   */
  function setSuggestionState(state, message) {
    const panel = $("suggestionPanel");
    panel.classList.toggle("hidden", state === "off");
    $("suggestionLoading").classList.toggle("hidden", state !== "loading");
    $("suggestionList").classList.toggle("hidden", state !== "ready");
    $("suggestionIntro").classList.toggle("hidden", state !== "ready");
    $("suggestionHint").classList.toggle("hidden", !message);
    if (message) $("suggestionHint").textContent = message;
    $("suggestBtn").disabled = state === "loading" || busy;
  }

  /**
   * Holt die Vorschlaege im Hintergrundskript und zeichnet sie.
   *
   * Bewusst ohne `throw`: Vorschlaege sind eine Zugabe. Schlaegt der Aufruf
   * fehl, bleibt die Erweiterung ueber das Eingabefeld vollstaendig benutzbar,
   * und der Grund steht als Hinweis unter dem Bereich.
   */
  async function loadSuggestions(context, translate, onSelect) {
    setSuggestionState("loading");
    try {
      const result = await browser.runtime.sendMessage({ type: "suggestReplies", context });
      if (result && result.ok && Array.isArray(result.suggestions) && result.suggestions.length > 0) {
        renderSuggestions(result.suggestions, onSelect);
        setSuggestionState("ready");
        return;
      }
      setSuggestionState("error", (result && result.error) || translate("errSuggestNone"));
    } catch (err) {
      setSuggestionState("error", (err && err.message) || translate("errUnknown"));
    }
  }

  global.KimiUi = {
    loadSuggestions,
    renderSuggestions,
    setSuggestionState,
    $,
    isBusy,
    showLoading,
    showError,
    hideError,
    disableMainUi,
    wireOptionsButton,
    enforceConsent
  };
})(globalThis);
