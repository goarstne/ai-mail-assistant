/**
 * Optionsseite: API-Key, Basis-URL, Modell und die Datenschutz-Zustimmung.
 */
"use strict";

const Config = globalThis.KimiConfig;
const { translate, applyToDocument } = globalThis.KimiI18n;

const $ = (id) => document.getElementById(id);

/** Merkt sich, ob die Seite fuer eine Ersteinrichtung geoeffnet wurde. */
let setupIncomplete = false;

function setStatus(message, kind) {
  const status = $("status");
  status.textContent = message;
  status.classList.remove("hidden", "ok", "error");
  status.classList.add(kind);
  if (kind === "ok") {
    setTimeout(() => status.classList.add("hidden"), 3000);
  }
}

function setBusy(busy) {
  $("save").disabled = busy;
  $("refreshModels").disabled = busy;
}

/**
 * MV3 erteilt `host_permissions` nicht automatisch.
 *
 * `permissions.request()` muss die ERSTE asynchrone Operation im Klick-Handler
 * sein - nach dem ersten `await` gilt die Nutzergeste als verbraucht und der
 * Aufruf scheitert mit "may only be called from a user input handler".
 * Genau daran ist die erste Fassung gescheitert, die vorher die Einstellungen
 * gespeichert hat.
 */
function requestHostPermission(baseUrl) {
  const originPattern = new URL(baseUrl).origin + "/*";
  return browser.permissions.request({ origins: [originPattern] }).then((granted) => ({
    granted,
    originPattern
  }));
}

/** "1M" statt "1000K" - eine Million Token als vierstellige K-Zahl liest sich schlecht. */
function formatContextWindow(model) {
  const tokens = Config.contextTokensFor(model);
  return tokens >= 1000000
    ? Math.round(tokens / 1000000) + "M"
    : Math.round(tokens / 1000) + "K";
}

/** Fuellt das Modell-Auswahlfeld; `selected` bleibt auch dann waehlbar, wenn es nicht in der Liste steht. */
function renderModelOptions(models, selected) {
  const select = $("model");
  const unique = [...new Set([...models, selected].filter(Boolean))];
  select.replaceChildren(
    ...unique.map((id) => {
      const option = document.createElement("option");
      option.value = id;
      // Kontextfenster mit anzeigen - es bestimmt, wie viel Mailtext uebrig bleibt.
      option.textContent = translate("modelOption", [id, formatContextWindow(id)]);
      return option;
    })
  );
  select.value = selected;
}

/**
 * Holt die tatsaechlich verfuegbaren Modelle vom Anbieter.
 *
 * Eine fest verdrahtete Liste veraltet mit jedem Release - deshalb fragt die
 * Optionsseite `/v1/models` direkt. Schlaegt das fehl, bleibt die
 * Rueckfallliste aus lib/config.js stehen; die Erweiterung ist dann weiter
 * benutzbar, nur eben ohne die neuesten IDs.
 */
async function fetchModels(baseUrl, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(baseUrl + "/models", {
      headers: { Authorization: "Bearer " + apiKey },
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.json().catch(() => ({}));
      throw new Error(
        (detail && detail.error && detail.error.message) || response.statusText || String(response.status)
      );
    }
    const data = await response.json();
    const ids = (Array.isArray(data && data.data) ? data.data : [])
      .map((entry) => entry && entry.id)
      .filter(Config.isPlausibleModelId)
      .sort();
    if (ids.length === 0) throw new Error(translate("errModelsEmpty"));
    return ids;
  } finally {
    clearTimeout(timer);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  applyToDocument();

  // H2: Die erlaubten Hosts sichtbar machen, damit die Ablehnung einer
  // fremden URL nicht als willkuerlich erscheint.
  $("baseUrlHint").textContent = translate("hintBaseUrl", Config.ALLOWED_API_HOSTS.join(", "));

  const settings = await Config.loadSettings(browser.storage);
  $("apiKey").value = settings.apiKey;
  $("baseUrl").value = settings.baseUrl;
  $("consentGiven").checked = settings.consentGiven;

  // Beim ersten Oeffnen fuehrt der Hinweis durch die drei noetigen Schritte;
  // danach verschwindet er und macht Platz.
  setupIncomplete = !settings.apiKey || !settings.consentGiven;
  if (setupIncomplete) {
    $("firstRun").classList.remove("hidden");
    $("apiKey").focus();
  }
  $("autoSuggest").checked = settings.autoSuggest;

  // Zuletzt von der API gemeldete Liste, sonst die Rueckfallliste.
  const { modelCache } = await browser.storage.local.get({ modelCache: [] });
  const models = Array.isArray(modelCache) && modelCache.length > 0 ? modelCache : Config.FALLBACK_MODELS;
  renderModelOptions(models, settings.model);
});

$("save").addEventListener("click", async () => {
  const apiKey = $("apiKey").value.trim();
  const model = $("model").value;
  const consentGiven = $("consentGiven").checked;
  const autoSuggest = $("autoSuggest").checked;

  // Alles Synchrone zuerst - danach darf nichts mehr vor permissions.request().
  const urlCheck = Config.validateBaseUrl($("baseUrl").value);
  if (!urlCheck.ok) {
    setStatus(translate(urlCheck.reason), "error");
    $("baseUrl").focus();
    return;
  }
  if (!Config.isPlausibleModelId(model)) {
    setStatus(translate("errUnsupportedModel"), "error");
    return;
  }
  if (apiKey && !consentGiven) {
    setStatus(translate("errConsentMissing"), "error");
    $("consentGiven").focus();
    return;
  }

  setBusy(true);
  try {
    // ERSTE asynchrone Operation - siehe requestHostPermission().
    const { granted, originPattern } = await requestHostPermission(urlCheck.url);

    // Speichern in jedem Fall: die Einstellungen sind gueltig, auch wenn die
    // Freigabe abgelehnt wurde.
    await browser.storage.local.set({ apiKey, baseUrl: urlCheck.url, model, consentGiven, autoSuggest });
    $("baseUrl").value = urlCheck.url;

    if (!granted) {
      setStatus(translate("errPermissionDenied", originPattern), "error");
      return;
    }

    // Nach der Ersteinrichtung sagen, wo es weitergeht - sonst bleibt der
    // Nutzer auf einer Seite stehen, die nur "gespeichert" meldet.
    const justCompleted = setupIncomplete && apiKey && consentGiven;
    if (justCompleted) {
      setupIncomplete = false;
      $("firstRun").classList.add("hidden");
    }
    setStatus(translate(justCompleted ? "statusSetupComplete" : "statusSaved"), "ok");
  } catch (err) {
    setStatus(translate("errSaveFailed", String(err && err.message)), "error");
  } finally {
    setBusy(false);
  }
});

$("refreshModels").addEventListener("click", async () => {
  const apiKey = $("apiKey").value.trim();
  const urlCheck = Config.validateBaseUrl($("baseUrl").value);

  if (!urlCheck.ok) {
    setStatus(translate(urlCheck.reason), "error");
    return;
  }
  if (!apiKey) {
    setStatus(translate("errNoApiKey"), "error");
    $("apiKey").focus();
    return;
  }

  setBusy(true);
  try {
    // Auch hier muss die Freigabe vor jedem anderen await angefragt werden.
    const { granted, originPattern } = await requestHostPermission(urlCheck.url);
    if (!granted) {
      setStatus(translate("errPermissionDenied", originPattern), "error");
      return;
    }

    const models = await fetchModels(urlCheck.url, apiKey);
    await browser.storage.local.set({ modelCache: models });
    renderModelOptions(models, models.includes($("model").value) ? $("model").value : models[0]);
    setStatus(translate("statusModelsLoaded", String(models.length)), "ok");
  } catch (err) {
    const reason = err && err.name === "AbortError" ? translate("errTimeout") : String(err && err.message);
    setStatus(translate("errModelsFailed", reason), "error");
  } finally {
    setBusy(false);
  }
});

/** M8: Ausdruecklicher Weg, den Key wieder aus storage.local zu entfernen. */
$("clear").addEventListener("click", async () => {
  await browser.storage.local.set({ apiKey: "", consentGiven: false });
  $("apiKey").value = "";
  $("consentGiven").checked = false;
  setStatus(translate("statusCleared"), "ok");
});
