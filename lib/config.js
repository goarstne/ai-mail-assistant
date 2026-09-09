/** Shared provider configuration, migration and request validation. */
"use strict";

(function (global) {
  const FALLBACK_MODELS = Object.freeze([
    "kimi-k3", "kimi-k2.7-code-highspeed", "kimi-k2.6", "kimi-k2.5",
    "moonshot-v1-128k", "moonshot-v1-32k", "moonshot-v1-8k"
  ]);
  // Separate entries deliberately isolate the international and China accounts.
  const PROVIDERS = Object.freeze({
    moonshot: Object.freeze({ name: "Kimi / Moonshot AI", baseUrl: "https://api.moonshot.ai/v1", model: "kimi-k3", models: FALLBACK_MODELS }),
    "moonshot-cn": Object.freeze({ name: "Kimi / Moonshot AI (China)", baseUrl: "https://api.moonshot.cn/v1", model: "kimi-k3", models: FALLBACK_MODELS }),
    openrouter: Object.freeze({ name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", model: "openrouter/auto", models: Object.freeze(["openrouter/auto"]) })
  });
  const ALLOWED_API_HOSTS = Object.freeze(Object.values(PROVIDERS).map((p) => new URL(p.baseUrl).hostname));
  const DEFAULT_CONTEXT_TOKENS = 128000;
  const OPENROUTER_DEFAULT_CONTEXT_TOKENS = 8192;
  const DEFAULTS = Object.freeze({ apiKey: "", baseUrl: PROVIDERS.moonshot.baseUrl, model: "kimi-k3", consentGiven: false, autoSuggest: true });
  const MAX_SUGGESTIONS = 4;
  const COMPLETION_TOKENS_SAMPLING = 1500;
  const COMPLETION_TOKENS_REASONING = 8000;
  const REASONING_EFFORT = "low";
  const REQUEST_TIMEOUT_MS = 60000;
  const TEMPERATURE = 0.5;
  const MAX_SUBJECT_CHARS = 300;
  const MAX_AUTHOR_CHARS = 200;
  const MAX_PROMPT_CHARS = 2000;

  function isProvider(provider) {
    return Object.hasOwn(PROVIDERS, provider);
  }

  function normalizeBaseUrl(raw) {
    return String(raw || "").trim().replace(/\/+$/, "");
  }

  function validateBaseUrl(raw, provider) {
    const normalized = normalizeBaseUrl(raw);
    if (!normalized) return { ok: false, reason: "errUrlEmpty" };
    let parsed;
    try { parsed = new URL(normalized); } catch { return { ok: false, reason: "errUrlMalformed" }; }
    if (parsed.protocol !== "https:") return { ok: false, reason: "errUrlNotHttps" };
    if (!ALLOWED_API_HOSTS.includes(parsed.hostname)) return { ok: false, reason: "errUrlHostNotAllowed" };
    if (parsed.username || parsed.password) return { ok: false, reason: "errUrlHasCredentials" };
    // Exact endpoints also reject alternate ports, query strings and arbitrary paths.
    const match = Object.entries(PROVIDERS).find(([, spec]) => spec.baseUrl === normalized);
    if (!match) return { ok: false, reason: "errUrlEndpoint" };
    if (provider !== undefined && provider !== match[0]) return { ok: false, reason: "errProviderMismatch" };
    return { ok: true, url: normalized, provider: match[0] };
  }

  function isPlausibleModelId(model) {
    return typeof model === "string" && !/\s/.test(model) && model.length >= 2 && model.length <= 200 &&
      /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)?(?::[A-Za-z0-9][A-Za-z0-9._-]*)?$/.test(model);
  }

  function validModelForProvider(model, provider) {
    return isPlausibleModelId(model) && (provider === "openrouter" ? model.includes("/") : !/[/:]/.test(model));
  }

  function sanitizeModelMetadata(raw) {
    const result = {};
    if (!raw || typeof raw !== "object") return result;
    for (const [id, entry] of Object.entries(raw)) {
      if (!isPlausibleModelId(id) || !entry || typeof entry !== "object") continue;
      const clean = {};
      if (Number.isSafeInteger(entry.contextTokens) && entry.contextTokens >= 2048) clean.contextTokens = entry.contextTokens;
      if (Number.isSafeInteger(entry.maxCompletionTokens) && entry.maxCompletionTokens >= 16) clean.maxCompletionTokens = entry.maxCompletionTokens;
      result[id] = clean;
    }
    return result;
  }

  function contextTokensFor(model, provider = "moonshot", metadata = {}) {
    const known = sanitizeModelMetadata({ [model]: metadata })[model];
    if (known && known.contextTokens) return known.contextTokens;
    // Router model names are not a reliable source of context limits.
    if (provider === "openrouter") return OPENROUTER_DEFAULT_CONTEXT_TOKENS;
    const id = String(model || "").toLowerCase();
    if (/^kimi-k3/.test(id)) return 1000000;
    if (/^kimi-k2\.[5-9]/.test(id)) return 256000;
    const moonshot = id.match(/^moonshot-v1-(\d+)k/);
    if (moonshot) return Number(moonshot[1]) * 1024;
    const generic = id.match(/(\d+)k(?:$|-)/);
    return generic ? Number(generic[1]) * 1024 : DEFAULT_CONTEXT_TOKENS;
  }

  function supportsSamplingParams(model) {
    return /^moonshot-v1/.test(String(model || "").toLowerCase());
  }
  function isReasoningModel(model) {
    return /^kimi-k3/.test(String(model || "").toLowerCase());
  }
  function completionTokensFor(model, provider = "moonshot", metadata = {}) {
    if (provider === "openrouter") {
      const known = sanitizeModelMetadata({ [model]: metadata })[model] || {};
      return Math.min(COMPLETION_TOKENS_REASONING, Math.floor(contextTokensFor(model, provider, metadata) / 4), known.maxCompletionTokens || Infinity);
    }
    return supportsSamplingParams(model) ? COMPLETION_TOKENS_SAMPLING : COMPLETION_TOKENS_REASONING;
  }

  function buildRequestBody(model, messages, provider = "moonshot", metadata = {}) {
    const body = { model, messages };
    if (provider === "openrouter") {
      // OpenRouter normalizes this limit across upstream providers. Leave
      // sampling/reasoning defaults to the selected model, not Kimi heuristics.
      body.max_completion_tokens = completionTokensFor(model, provider, metadata);
      return body;
    }
    if (supportsSamplingParams(model)) {
      body.temperature = TEMPERATURE;
      body.max_tokens = COMPLETION_TOKENS_SAMPLING;
      return body;
    }
    body.max_completion_tokens = COMPLETION_TOKENS_REASONING;
    if (isReasoningModel(model)) body.reasoning_effort = REASONING_EFFORT;
    return body;
  }

  function mailCharBudget(model, provider = "moonshot", metadata = {}) {
    const usableTokens = Math.max(0, contextTokensFor(model, provider, metadata) - completionTokensFor(model, provider, metadata) - 1200);
    return Math.min(60000, usableTokens * 3);
  }

  function normalizeProfile(raw, provider) {
    const spec = PROVIDERS[provider];
    raw = raw && typeof raw === "object" ? raw : {};
    return {
      apiKey: String(raw.apiKey || "").trim(),
      model: validModelForProvider(raw.model, provider) ? raw.model : spec.model,
      consentGiven: raw.consentGiven === true,
      modelCache: Array.isArray(raw.modelCache) ? [...new Set(raw.modelCache.filter((id) => validModelForProvider(id, provider)))] : [],
      modelMetadata: sanitizeModelMetadata(raw.modelMetadata)
    };
  }

  /** Reads legacy 1.x settings without moving a key or consent to another host. */
  async function loadProviderState(storage) {
    const stored = await storage.local.get({ ...DEFAULTS, provider: null, providers: null, modelCache: [] });
    const profiles = {};
    const legacy = validateBaseUrl(stored.baseUrl);
    const hasProfiles = stored.providers !== null && typeof stored.providers === "object";
    for (const provider of Object.keys(PROVIDERS)) {
      const raw = hasProfiles ? stored.providers[provider] : (legacy.ok && legacy.provider === provider ? stored : {});
      profiles[provider] = normalizeProfile(raw, provider);
    }
    const provider = isProvider(stored.provider) ? stored.provider : (!hasProfiles && legacy.ok ? legacy.provider : "moonshot");
    return { provider, profiles, autoSuggest: stored.autoSuggest !== false };
  }

  async function loadSettings(storage) {
    const state = await loadProviderState(storage);
    return { ...state.profiles[state.provider], provider: state.provider, baseUrl: PROVIDERS[state.provider].baseUrl, autoSuggest: state.autoSuggest };
  }

  /** Merge only the current profile, so other settings tabs cannot overwrite other providers. */
  async function saveProviderSettings(storage, provider, profile, autoSuggest) {
    if (!isProvider(provider)) throw new Error("Invalid provider");
    const state = await loadProviderState(storage);
    state.profiles[provider] = normalizeProfile(profile, provider);
    await storage.local.set({ provider, providers: state.profiles, autoSuggest });
    // Delete the obsolete copy of the key only after the complete migration is stored.
    await storage.local.remove(["apiKey", "baseUrl", "model", "consentGiven", "modelCache"]);
  }

  global.MailAssistantConfig = {
    PROVIDERS, ALLOWED_API_HOSTS, FALLBACK_MODELS, DEFAULT_CONTEXT_TOKENS,
    OPENROUTER_DEFAULT_CONTEXT_TOKENS, DEFAULTS, MAX_SUGGESTIONS,
    COMPLETION_TOKENS_SAMPLING, COMPLETION_TOKENS_REASONING, REASONING_EFFORT,
    REQUEST_TIMEOUT_MS, TEMPERATURE, MAX_SUBJECT_CHARS, MAX_AUTHOR_CHARS,
    MAX_PROMPT_CHARS, isProvider, normalizeBaseUrl, validateBaseUrl,
    isPlausibleModelId, validModelForProvider, sanitizeModelMetadata,
    contextTokensFor, supportsSamplingParams, isReasoningModel,
    completionTokensFor, buildRequestBody, mailCharBudget,
    loadProviderState, loadSettings, saveProviderSettings
  };
})(globalThis);
