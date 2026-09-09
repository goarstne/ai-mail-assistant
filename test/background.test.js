"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { readFileSync } = require("node:fs");
const { join } = require("node:path");
const { webcrypto } = require("node:crypto");
const { Config, MailText, memoryStorage } = require("./helpers");

function harness({ consent = true, permission = true, apiKey = "router-test-key", fetcher } = {}) {
  const storage = memoryStorage({ provider: "openrouter", providers: { openrouter: { apiKey, model: "provider/model:free", consentGiven: consent, modelMetadata: { "provider/model:free": { contextTokens: 4096, maxCompletionTokens: 512 } } } } });
  const requests = [];
  const writes = [];
  let listener;
  let timerCallback;
  let timerActive = false;
  const context = vm.createContext({
    MailAssistantConfig: Config, MailAssistantMailText: MailText,
    AbortController, URL, crypto: webcrypto,
    setTimeout(callback) { timerCallback = callback; timerActive = true; return 1; },
    clearTimeout() { timerActive = false; },
    console: { error() {}, warn() {} },
    fetch: async (url, options) => {
      requests.push({ url, ...options, body: JSON.parse(options.body) });
      return fetcher ? fetcher(options, { abort: () => timerCallback(), timerActive: () => timerActive }) : { ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: "stop", message: { content: "Hello from the model." } }] }) };
    },
    browser: {
      storage,
      i18n: { getMessage: (key) => key },
      permissions: { contains: async ({ origins }) => { assert.equal(origins.length, 1); assert.equal(origins[0], "https://openrouter.ai/*"); return permission; } },
      compose: {
        beginReply: async () => ({ id: 88 }),
        getComposeDetails: async () => ({ isPlainText: true, plainTextBody: "Existing draft" }),
        setComposeDetails: async (id, details) => writes.push({ id, details })
      },
      runtime: { onMessage: { addListener(fn) { listener = fn; } }, onInstalled: { addListener() {} } }
    }
  });
  vm.runInContext(readFileSync(join(__dirname, "../background.js"), "utf8"), context);
  return { context, storage, requests, writes, send: (request) => listener(request), timerActive: () => timerActive };
}
const replyRequest = { type: "generateReply", userPrompt: "Accept the invitation.", messageId: 1, mail: { author: "sender@example.test", subject: "Invitation", body: "Join us on Friday." } };

test("reply generation uses OpenRouter endpoint, key and limits, then inserts plain text", async () => {
  const h = harness();
  const result = await h.send(replyRequest);
  assert.equal(result.ok, true);
  assert.equal(h.requests.length, 1);
  assert.equal(h.requests[0].url, "https://openrouter.ai/api/v1/chat/completions");
  assert.equal(h.requests[0].headers.Authorization, "Bearer router-test-key");
  assert.equal(h.requests[0].redirect, "error");
  assert.equal(h.requests[0].body.model, "provider/model:free");
  assert.equal(h.requests[0].body.max_completion_tokens, 512);
  assert.equal(h.writes[0].details.plainTextBody, "Hello from the model.\n\nExisting draft");
  assert.equal(h.timerActive(), false);
});

for (const [name, options, error] of [
  ["consent", { consent: false }, "errNoConsent"],
  ["key", { apiKey: "" }, "errNoApiKey"],
  ["host permission", { permission: false }, "errHostPermissionMissing"]
]) test(`missing ${name} blocks the network and compose writes`, async () => {
  const h = harness(options);
  const result = await h.send(replyRequest);
  assert.equal(result.error, error);
  assert.equal(h.requests.length, 0);
  assert.equal(h.writes.length, 0);
});

for (const [status, data, expected] of [
  [401, { error: { message: "bad key" } }, "errUnauthorized"],
  [402, { error: { message: "no credit" } }, "errCredits"],
  [429, { error: { message: "wait" } }, "errRateLimited"],
  [503, { error: { message: "unavailable" } }, "errApi"],
  [200, { error: { code: 402, message: "no credit" } }, "errCredits"],
  [200, {}, "errEmptyReply"],
  [200, { choices: [{ message: { content: { bad: "object" } } }] }, "errEmptyReply"],
  [200, { choices: [{ finish_reason: "length", message: { content: "Incomplete" } }] }, "errReplyTruncated"]
]) test(`API ${status} ${expected} does not insert unusable text`, async () => {
  const h = harness({ fetcher: async () => ({ status, ok: status === 200, json: async () => data }) });
  const result = await h.send(replyRequest);
  assert.equal(result.error, expected);
  assert.equal(h.writes.length, 0);
});

test("timeout remains active while the response body is being read", async () => {
  const h = harness({ fetcher: async (options, timer) => ({
    ok: true, status: 200,
    json: async () => {
      assert.equal(timer.timerActive(), true);
      timer.abort();
      assert.equal(options.signal.aborted, true);
      throw Object.assign(new Error("aborted"), { name: "AbortError" });
    }
  }) });
  const result = await h.send(replyRequest);
  assert.equal(result.error, "errTimeout");
  assert.equal(h.timerActive(), false);
  assert.equal(h.writes.length, 0);
});

test("OpenRouter supports draft generation and structured reply suggestions", async () => {
  const h = harness();
  const result = await h.send({ type: "generateComposeText", userPrompt: "Write a greeting.", composeTabId: 7, draft: { recipients: "recipient@example.test", subject: "Hello", body: "Draft" } });
  assert.equal(result.ok, true);
  assert.equal(h.writes[0].id, 7);
  const suggestions = harness({ fetcher: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify([{ title: "Accept", description: "Accept the invitation", instruction: "Accept." }]) } }] }) }) });
  const suggested = await suggestions.send({ type: "suggestReplies", context: replyRequest.mail });
  assert.equal(suggested.ok, true);
  assert.equal(suggested.suggestions[0].title, "Accept");
  assert.equal(suggestions.writes.length, 0);
});
