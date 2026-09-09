"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { Config } = require("./helpers");

const { memoryStorage } = require("./helpers");

test("OpenRouter endpoint and namespaced model variants are accepted", () => {
  assert.equal(Config.validateBaseUrl("https://openrouter.ai/api/v1/", "openrouter").ok, true);
  for (const id of ["openrouter/auto", "moonshotai/kimi-k2.5", "meta-llama/llama-3.3-70b-instruct:free", "anthropic/claude-sonnet-4.5"]) {
    assert.equal(Config.validModelForProvider(id, "openrouter"), true, id);
    assert.equal(Config.validModelForProvider(id, "moonshot"), false, id);
  }
  assert.equal(Config.validModelForProvider("kimi-k3", "openrouter"), false);
});

test("URL validation rejects cross-provider endpoints and redirect tricks", () => {
  for (const url of [
    "https://openrouter.ai.evil.example/api/v1", "https://openrouter.ai:8443/api/v1",
    "https://openrouter.ai/api/v1?redirect=https://evil.example", "https://openrouter.ai/api/v1#fragment",
    "https://openrouter.ai/other", "https://key@openrouter.ai/api/v1",
    "http://openrouter.ai/api/v1", "https://openrouter.ai/api/v1/../v1"
  ]) assert.equal(Config.validateBaseUrl(url, "openrouter").ok, false, url);
  assert.equal(Config.validateBaseUrl(Config.PROVIDERS.moonshot.baseUrl, "openrouter").reason, "errProviderMismatch");
  assert.equal(Config.validateBaseUrl(Config.PROVIDERS.openrouter.baseUrl, "moonshot").ok, false);
});

test("malformed router IDs remain rejected", () => {
  for (const id of ["../evil", "provider/../evil", "provider//model", "/model", "provider/model/extra", "provider/model:free:more", "provider/model?x=1", "provider/model\n", "provider/" + "a".repeat(201)]) {
    assert.equal(Config.isPlausibleModelId(id), false, id);
  }
});

test("legacy settings migrate exclusively to their original endpoint", async () => {
  for (const provider of ["moonshot", "moonshot-cn"]) {
    const storage = memoryStorage({ apiKey: "  legacy-key  ", baseUrl: Config.PROVIDERS[provider].baseUrl, model: "moonshot-v1-32k", consentGiven: true, modelCache: ["moonshot-v1-32k"], autoSuggest: false });
    const state = await Config.loadProviderState(storage);
    assert.equal(state.provider, provider);
    assert.equal(state.profiles[provider].apiKey, "legacy-key");
    assert.equal(state.profiles[provider].consentGiven, true);
    for (const other of Object.keys(Config.PROVIDERS).filter((id) => id !== provider)) {
      assert.equal(state.profiles[other].apiKey, "");
      assert.equal(state.profiles[other].consentGiven, false);
      assert.deepEqual(state.profiles[other].modelCache, []);
    }
    assert.equal((await Config.loadSettings(storage)).autoSuggest, false);
  }
});

test("an unrecognized legacy endpoint cannot donate its key or consent", async () => {
  const storage = memoryStorage({ apiKey: "foreign-key", consentGiven: true, baseUrl: "https://evil.example/v1" });
  const settings = await Config.loadSettings(storage);
  assert.equal(settings.apiKey, "");
  assert.equal(settings.consentGiven, false);
});

test("saving OpenRouter preserves Kimi and deletes the legacy key copy", async () => {
  const storage = memoryStorage({ apiKey: "kimi-key", consentGiven: true, model: "kimi-k2.5" });
  const state = await Config.loadProviderState(storage);
  await Config.saveProviderSettings(storage, "openrouter", { ...state.profiles.openrouter, apiKey: "router-key", model: "anthropic/claude-sonnet-4.5", consentGiven: true }, false);
  const router = await Config.loadSettings(storage);
  assert.equal(router.provider, "openrouter");
  assert.equal(router.apiKey, "router-key");
  assert.equal(router.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(Object.hasOwn(storage.data, "apiKey"), false);
  const migrated = await Config.loadProviderState(storage);
  assert.equal(migrated.profiles.moonshot.apiKey, "kimi-key");
  assert.equal(migrated.profiles.moonshot.model, "kimi-k2.5");
  assert.equal(migrated.profiles.moonshot.consentGiven, true);
  await Config.saveProviderSettings(storage, "moonshot", migrated.profiles.moonshot, false);
  assert.equal((await Config.loadSettings(storage)).apiKey, "kimi-key");
  assert.equal(storage.data.providers.openrouter.apiKey, "router-key");
});

test("revoking consent and deleting one key do not affect another provider", async () => {
  const storage = memoryStorage({ apiKey: "kimi-key", consentGiven: true });
  const state = await Config.loadProviderState(storage);
  await Config.saveProviderSettings(storage, "openrouter", { ...state.profiles.openrouter, apiKey: "router-key", consentGiven: true }, true);
  await Config.saveProviderSettings(storage, "openrouter", { ...state.profiles.openrouter, apiKey: "router-key", consentGiven: false }, true);
  assert.equal((await Config.loadSettings(storage)).consentGiven, false);
  assert.equal((await Config.loadSettings(storage)).apiKey, "router-key");
  await Config.saveProviderSettings(storage, "openrouter", { ...state.profiles.openrouter, apiKey: "", consentGiven: false }, true);
  assert.equal((await Config.loadSettings(storage)).apiKey, "");
  assert.equal(storage.data.providers.moonshot.apiKey, "kimi-key");
});

test("partial migration failure leaves the legacy key recoverable", async () => {
  const storage = memoryStorage({ apiKey: "kimi-key", consentGiven: true });
  storage.local.set = async () => { throw new Error("disk full"); };
  await assert.rejects(Config.saveProviderSettings(storage, "moonshot", {}, true), /disk full/);
  assert.equal(storage.data.apiKey, "kimi-key");
});

test("new provider storage never resurrects stale legacy credentials", async () => {
  const storage = memoryStorage({ provider: "openrouter", providers: {}, apiKey: "old-key", consentGiven: true, baseUrl: "https://openrouter.ai/api/v1" });
  const settings = await Config.loadSettings(storage);
  assert.equal(settings.apiKey, "");
  assert.equal(settings.consentGiven, false);
  assert.equal(settings.model, "openrouter/auto");
});

test("router request parameters and context budget use catalog limits", () => {
  const metadata = { contextTokens: 4096, maxCompletionTokens: 512 };
  const body = Config.buildRequestBody("moonshotai/kimi-k2.5", [], "openrouter", metadata);
  assert.equal(body.max_completion_tokens, 512);
  assert.equal("temperature" in body, false);
  assert.equal("reasoning_effort" in body, false);
  assert.equal(Config.mailCharBudget(body.model, "openrouter", metadata), (4096 - 512 - 1200) * 3);
  assert.equal(Config.contextTokensFor("provider/huge-999k", "openrouter"), 8192);
  assert.equal(Config.completionTokensFor("openrouter/auto", "openrouter"), 2048);
});

test("invalid catalog limits cannot expand the context budget", () => {
  for (const contextTokens of [null, -1, 0, "1000000", Infinity, 1.2, 128]) {
    assert.equal(Config.contextTokensFor("provider/model", "openrouter", { contextTokens }), 8192);
  }
  assert.equal(Config.mailCharBudget("provider/model", "openrouter", { contextTokens: 2048 }), 1008);
});
