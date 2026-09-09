/** Provider-specific setup. Keys, consent and model lists never cross endpoints. */
"use strict";

const Config = globalThis.MailAssistantConfig;
const { translate, applyToDocument } = globalThis.MailAssistantI18n;
const $ = (id) => document.getElementById(id);
let state;
let currentProvider;
let setupIncomplete = false;
let statusTimer;

function setStatus(message, kind) {
  clearTimeout(statusTimer);
  const status = $("status");
  status.textContent = message;
  status.classList.remove("hidden", "ok", "error");
  status.classList.add(kind);
  if (kind === "ok") statusTimer = setTimeout(() => status.classList.add("hidden"), 5000);
}

function setBusy(busy) {
  for (const id of ["save", "refreshModels", "clear", "provider", "apiKey", "model", "consentGiven", "autoSuggest"]) {
    $(id).disabled = busy;
  }
}

// Must be the FIRST async operation in a click handler to preserve the user gesture.
function requestHostPermission(baseUrl) {
  const originPattern = new URL(baseUrl).origin + "/*";
  return browser.permissions.request({ origins: [originPattern] }).then((granted) => ({ granted, originPattern }));
}

function renderModelOptions(profile) {
  const spec = Config.PROVIDERS[currentProvider];
  const models = profile.modelCache.length ? profile.modelCache : spec.models;
  const unique = [...new Set([...models, profile.model].filter(Boolean))];
  $("modelOptions").replaceChildren(...unique.map((id) => {
    const option = document.createElement("option");
    option.value = id;
    const metadata = profile.modelMetadata[id];
    // Only label router limits if the catalog actually supplied them.
    if (currentProvider !== "openrouter" || (metadata && metadata.contextTokens)) {
      const tokens = Config.contextTokensFor(id, currentProvider, metadata);
      const context = tokens >= 1000000 ? Math.round(tokens / 1000000) + "M" : Math.round(tokens / 1000) + "K";
      option.label = translate("modelOption", [id, context]);
    }
    return option;
  }));
}

function captureProfile() {
  return {
    ...state.profiles[currentProvider],
    apiKey: $("apiKey").value.trim(),
    model: $("model").value.trim(),
    consentGiven: $("consentGiven").checked
  };
}

function showProvider(provider) {
  currentProvider = provider;
  const spec = Config.PROVIDERS[provider];
  const profile = state.profiles[provider];
  $("provider").value = provider;
  $("apiKey").value = profile.apiKey;
  $("baseUrl").value = spec.baseUrl;
  $("model").value = profile.model;
  $("consentGiven").checked = profile.consentGiven;
  $("privacyBody").textContent = provider === "openrouter" ? translate("privacyOpenRouter") : translate("privacyBody");
  $("consentLabel").textContent = translate("consentLabel", spec.name);
  const keyPlatform = provider === "openrouter" ? "openrouter.ai/keys" : provider === "moonshot-cn" ? "platform.moonshot.cn" : "platform.kimi.ai";
  $("apiKeyHint").textContent = translate("hintApiKey", keyPlatform);
  $("baseUrlHint").textContent = translate("hintBaseUrl", new URL(spec.baseUrl).hostname);
  setupIncomplete = !profile.apiKey || !profile.consentGiven;
  $("firstRun").classList.toggle("hidden", !setupIncomplete);
  renderModelOptions(profile);
}

async function fetchModels(baseUrl, apiKey, provider) {
  const checked = Config.validateBaseUrl(baseUrl, provider);
  if (!checked.ok) throw new Error(translate(checked.reason));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(checked.url + "/models", {
      headers: { Authorization: "Bearer " + apiKey },
      redirect: "error",
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || (data && data.error)) {
      throw new Error((data && data.error && data.error.message) || response.statusText || String(response.status));
    }
    const modelCache = [];
    const modelMetadata = {};
    for (const entry of (Array.isArray(data && data.data) ? data.data : [])) {
      if (!entry || !Config.validModelForProvider(entry.id, provider)) continue;
      // Exclude image-only, audio-only and embedding endpoints from mail drafting.
      if (provider === "openrouter" && entry.architecture && Array.isArray(entry.architecture.output_modalities) && !entry.architecture.output_modalities.includes("text")) continue;
      modelCache.push(entry.id);
      modelMetadata[entry.id] = {
        contextTokens: entry.context_length,
        maxCompletionTokens: entry.top_provider && entry.top_provider.max_completion_tokens
      };
    }
    if (!modelCache.length) throw new Error(translate("errModelsEmpty"));
    return { modelCache: [...new Set(modelCache)].sort(), modelMetadata: Config.sanitizeModelMetadata(modelMetadata) };
  } finally {
    clearTimeout(timer);
  }
}

setBusy(true);
document.addEventListener("DOMContentLoaded", async () => {
  applyToDocument();
  try {
    state = await Config.loadProviderState(browser.storage);
    $("provider").replaceChildren(...Object.entries(Config.PROVIDERS).map(([id, spec]) => {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = spec.name;
      return option;
    }));
    showProvider(state.provider);
    $("autoSuggest").checked = state.autoSuggest;
    setBusy(false);
  } catch (err) {
    setStatus(translate("errSaveFailed", String(err && err.message)), "error");
  }
});

$("provider").addEventListener("change", () => {
  state.profiles[currentProvider] = captureProfile();
  showProvider($("provider").value);
  $("status").classList.add("hidden");
});

$("save").addEventListener("click", async () => {
  const provider = currentProvider;
  const profile = captureProfile();
  const autoSuggest = $("autoSuggest").checked;
  const urlCheck = Config.validateBaseUrl($("baseUrl").value, provider);
  if (!urlCheck.ok) return setStatus(translate(urlCheck.reason), "error");
  if (!Config.validModelForProvider(profile.model, provider)) {
    $("model").focus();
    return setStatus(translate("errUnsupportedModel"), "error");
  }
  setBusy(true);
  try {
    // Revoking consent or deleting a key must also work without granting permissions.
    const permission = profile.apiKey && profile.consentGiven
      ? await requestHostPermission(urlCheck.url) : { granted: true };
    await Config.saveProviderSettings(browser.storage, provider, profile, autoSuggest);
    state.profiles[provider] = profile;
    if (!permission.granted) return setStatus(translate("errPermissionDenied", permission.originPattern), "error");
    const justCompleted = setupIncomplete && profile.apiKey && profile.consentGiven;
    setupIncomplete = !profile.apiKey || !profile.consentGiven;
    $("firstRun").classList.toggle("hidden", !setupIncomplete);
    setStatus(translate(justCompleted ? "statusSetupComplete" : "statusSaved"), "ok");
  } catch (err) {
    setStatus(translate("errSaveFailed", String(err && err.message)), "error");
  } finally {
    setBusy(false);
  }
});

$("refreshModels").addEventListener("click", async () => {
  const provider = currentProvider;
  const apiKey = $("apiKey").value.trim();
  const urlCheck = Config.validateBaseUrl($("baseUrl").value, provider);
  if (!urlCheck.ok) return setStatus(translate(urlCheck.reason), "error");
  if (!apiKey) {
    $("apiKey").focus();
    return setStatus(translate("errNoApiKey"), "error");
  }
  setBusy(true);
  try {
    const { granted, originPattern } = await requestHostPermission(urlCheck.url);
    if (!granted) return setStatus(translate("errPermissionDenied", originPattern), "error");
    const catalog = await fetchModels(urlCheck.url, apiKey, provider);
    const profile = { ...captureProfile(), ...catalog };
    state.profiles[provider] = profile;
    renderModelOptions(profile);
    // Catalog and unsaved credentials are persisted together only on Save.
    setStatus(translate("statusModelsLoaded", String(catalog.modelCache.length)), "ok");
  } catch (err) {
    const reason = err && err.name === "AbortError" ? translate("errModelsTimeout") : String(err && err.message);
    setStatus(translate("errModelsFailed", reason), "error");
  } finally {
    setBusy(false);
  }
});

$("clear").addEventListener("click", async () => {
  const provider = currentProvider;
  setBusy(true);
  try {
    // Clear the persisted profile even if the unsaved model field is invalid.
    const saved = await Config.loadProviderState(browser.storage);
    const profile = { ...saved.profiles[provider], apiKey: "", consentGiven: false };
    await Config.saveProviderSettings(browser.storage, provider, profile, $("autoSuggest").checked);
    state.profiles[provider] = profile;
    showProvider(provider);
    setStatus(translate("statusCleared"), "ok");
  } catch (err) {
    setStatus(translate("errSaveFailed", String(err && err.message)), "error");
  } finally {
    setBusy(false);
  }
});
