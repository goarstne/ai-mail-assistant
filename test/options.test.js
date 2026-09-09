"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { Config, memoryStorage } = require("./helpers");

async function harness({ permission = true, fetcher } = {}) {
  const elements = {};
  const html = readFileSync(join(__dirname, "../options/options.html"), "utf8");
  function element() {
    return { value: "", checked: false, disabled: false, textContent: "", children: [], handlers: {},
      classList: { add() {}, remove() {}, toggle() {} }, focus() {},
      replaceChildren(...items) { this.children = items; },
      addEventListener(event, fn) { this.handlers[event] = fn; }
    };
  }
  for (const [, id] of html.matchAll(/id="([^"]+)"/g)) elements[id] = element();
  const storage = memoryStorage({ apiKey: "kimi-test-key", consentGiven: true, model: "kimi-k2.5" });
  const events = [];
  const requests = [];
  const originalGet = storage.local.get;
  storage.local.get = async (...args) => { events.push("storage"); return originalGet(...args); };
  let initialize;
  const context = vm.createContext({
    MailAssistantConfig: Config,
    MailAssistantI18n: { translate: (key) => key, applyToDocument() {} },
    document: { getElementById: (id) => elements[id], createElement: element, addEventListener: (_, fn) => { initialize = fn; } },
    URL, AbortController, setTimeout: () => 1, clearTimeout() {},
    fetch: async (url, options) => { requests.push({ url, ...options }); return fetcher ? fetcher(url, options) : {
      ok: true, status: 200, json: async () => ({ data: [
        { id: "provider/text-model:free", context_length: 4096, top_provider: { max_completion_tokens: 768 }, architecture: { output_modalities: ["text"] } },
        { id: "provider/image-only", architecture: { output_modalities: ["image"] } },
        { id: "../invalid" }
      ] })
    }; },
    browser: { storage, permissions: { request: async (value) => { events.push("permission"); requests.push({ permission: value }); return permission; } } }
  });
  vm.runInContext(readFileSync(join(__dirname, "../options/options.js"), "utf8"), context);
  await initialize();
  events.length = 0;
  return { context, elements, storage, events, requests,
    async select(id) { elements.provider.value = id; await elements.provider.handlers.change(); },
    async click(id) { await elements[id].handlers.click(); }
  };
}

test("switching providers isolates keys, consent and model lists", async () => {
  const h = await harness();
  assert.equal(h.elements.apiKey.value, "kimi-test-key");
  await h.select("openrouter");
  assert.equal(h.elements.apiKey.value, "");
  assert.equal(h.elements.consentGiven.checked, false);
  assert.equal(h.elements.baseUrl.value, "https://openrouter.ai/api/v1");
  assert.equal(h.elements.model.value, "openrouter/auto");
  assert.equal(h.elements.modelOptions.children.length, 1);
  assert.equal(h.elements.privacyBody.textContent, "privacyOpenRouter");
  h.elements.apiKey.value = "unsaved-router-key";
  await h.select("moonshot");
  assert.equal(h.elements.apiKey.value, "kimi-test-key");
  await h.select("openrouter");
  assert.equal(h.elements.apiKey.value, "unsaved-router-key");
  assert.equal(h.storage.data.apiKey, "kimi-test-key", "switching alone does not persist the active provider");
});

test("Save requests the correct host permission before any storage await", async () => {
  const h = await harness();
  await h.select("openrouter");
  h.elements.apiKey.value = "router-test-key";
  h.elements.consentGiven.checked = true;
  await h.click("save");
  assert.equal(h.events[0], "permission");
  assert.equal(h.requests[0].permission.origins[0], "https://openrouter.ai/*");
  assert.equal((await Config.loadSettings(h.storage)).apiKey, "router-test-key");
  assert.equal(h.storage.data.providers.moonshot.apiKey, "kimi-test-key");
});

test("revoking consent with a stored key saves without permission requests", async () => {
  const h = await harness();
  h.elements.consentGiven.checked = false;
  await h.click("save");
  assert.equal(h.events.includes("permission"), false);
  const saved = await Config.loadSettings(h.storage);
  assert.equal(saved.apiKey, "kimi-test-key");
  assert.equal(saved.consentGiven, false);
});

test("model discovery filters non-text models and saves metadata only on Save", async () => {
  const h = await harness();
  await h.select("openrouter");
  h.elements.apiKey.value = "router-test-key";
  await h.click("refreshModels");
  assert.equal(h.events[0], "permission");
  assert.equal(h.requests[1].url, "https://openrouter.ai/api/v1/models");
  assert.equal(h.requests[1].headers.Authorization, "Bearer router-test-key");
  assert.equal(h.requests[1].redirect, "error");
  assert.deepEqual(h.elements.modelOptions.children.map((o) => o.value), ["provider/text-model:free", "openrouter/auto"]);
  assert.equal(h.storage.data.providers, undefined);
  h.elements.model.value = "provider/text-model:free";
  h.elements.consentGiven.checked = true;
  await h.click("save");
  const saved = await Config.loadSettings(h.storage);
  assert.equal(saved.modelMetadata[saved.model].contextTokens, 4096);
  assert.equal(saved.modelMetadata[saved.model].maxCompletionTokens, 768);
});

test("declined host permission prevents catalog fetch", async () => {
  const h = await harness({ permission: false });
  await h.select("openrouter");
  h.elements.apiKey.value = "router-test-key";
  await h.click("refreshModels");
  assert.equal(h.requests.length, 1);
  assert.equal(h.elements.status.textContent, "errPermissionDenied");
  assert.equal(h.elements.provider.disabled, false);
});

test("an empty catalog leaves the selected model and key intact", async () => {
  const h = await harness({ fetcher: async () => ({ ok: true, json: async () => ({ data: [] }) }) });
  await h.click("refreshModels");
  assert.equal(h.elements.model.value, "kimi-k2.5");
  assert.equal(h.elements.apiKey.value, "kimi-test-key");
  assert.equal(h.elements.status.textContent, "errModelsFailed");
});

test("Delete key works even with an invalid unsaved model", async () => {
  const h = await harness();
  h.elements.model.value = "not a model";
  await h.click("clear");
  assert.equal(h.elements.apiKey.value, "");
  assert.equal(h.elements.consentGiven.checked, false);
  assert.equal((await Config.loadSettings(h.storage)).apiKey, "");
  assert.equal(h.events.includes("permission"), false);
});
