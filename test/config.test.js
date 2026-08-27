"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { Config } = require("./helpers");

test("validateBaseUrl akzeptiert die beiden erlaubten Hosts", () => {
  for (const url of ["https://api.moonshot.cn/v1", "https://api.moonshot.ai/v1"]) {
    const result = Config.validateBaseUrl(url);
    assert.equal(result.ok, true, url);
    assert.equal(result.url, url);
  }
});

test("validateBaseUrl entfernt nachlaufende Slashes", () => {
  const result = Config.validateBaseUrl("https://api.moonshot.cn/v1///");
  assert.equal(result.ok, true);
  assert.equal(result.url, "https://api.moonshot.cn/v1");
});

test("H2: Suffix-Angriff auf den Host wird abgewiesen", () => {
  // Genau dieser Fall kam durch die alte startsWith("https://")-Pruefung.
  const result = Config.validateBaseUrl("https://api.moonshot.cn.angreifer.de/v1");
  assert.equal(result.ok, false);
  assert.equal(result.reason, "errUrlHostNotAllowed");
});

test("H2: weitere unzulaessige URLs", () => {
  const cases = [
    ["", "errUrlEmpty"],
    ["nicht mal eine url", "errUrlMalformed"],
    ["http://api.moonshot.cn/v1", "errUrlNotHttps"],
    ["https://evil.example.com/v1", "errUrlHostNotAllowed"],
    ["https://user:pass@api.moonshot.cn/v1", "errUrlHasCredentials"]
  ];
  for (const [input, expected] of cases) {
    const result = Config.validateBaseUrl(input);
    assert.equal(result.ok, false, input);
    assert.equal(result.reason, expected, input);
  }
});

test("isPlausibleModelId laesst gueltige IDs zu und weist Unsinn ab", () => {
  // Keine Allowlist mehr: welche IDs gueltig sind, bestimmt der Anbieter.
  // Geprueft wird nur, dass die ID nichts Gefaehrliches enthaelt.
  for (const id of ["kimi-k3", "kimi-k2.7-code-highspeed", "moonshot-v1-128k", "kimi-k2.5"]) {
    assert.equal(Config.isPlausibleModelId(id), true, id);
  }
  for (const id of ["", " ", "a", "modell mit leerzeichen", "../etc/passwd", '{"x":1}', undefined, 42]) {
    assert.equal(Config.isPlausibleModelId(id), false, String(id));
  }
});

test("contextTokensFor leitet das Kontextfenster aus der Modell-ID ab", () => {
  assert.equal(Config.contextTokensFor("kimi-k3"), 1000000);
  assert.equal(Config.contextTokensFor("kimi-k3-turbo"), 1000000);
  assert.equal(Config.contextTokensFor("kimi-k2.6"), 256000);
  assert.equal(Config.contextTokensFor("kimi-k2.7-code-highspeed"), 256000);
  assert.equal(Config.contextTokensFor("moonshot-v1-32k"), 32 * 1024);
});

test("contextTokensFor faellt bei unbekannten IDs konservativ zurueck", () => {
  // Zu frueh kuerzen kostet Kontext, zu spaet kuerzen laesst den Request
  // an einem API-Fehler scheitern - der Rueckfall ist deshalb vorsichtig.
  assert.equal(Config.contextTokensFor("voellig-neues-modell"), Config.DEFAULT_CONTEXT_TOKENS);
  assert.equal(Config.contextTokensFor(undefined), Config.DEFAULT_CONTEXT_TOKENS);
});

test("Der Default zeigt auf die internationale Plattform (platform.kimi.ai)", () => {
  assert.equal(Config.DEFAULTS.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(Config.validateBaseUrl(Config.DEFAULTS.baseUrl).ok, true);
  assert.equal(Config.DEFAULTS.model, "kimi-k3");
  assert.ok(Config.FALLBACK_MODELS.includes("kimi-k3"));
});

test("loadSettings ersetzt unbrauchbare gespeicherte Werte", async () => {
  const fakeStorage = {
    local: {
      get: async () => ({ apiKey: "  sk-x  ", baseUrl: "https://api.moonshot.ai/v1/", model: "boes es", consentGiven: "ja" })
    }
  };
  const settings = await Config.loadSettings(fakeStorage);
  assert.equal(settings.apiKey, "sk-x");
  assert.equal(settings.baseUrl, "https://api.moonshot.ai/v1");
  assert.equal(settings.model, Config.DEFAULTS.model, "unbrauchbare Modell-ID faellt auf den Default zurueck");
  assert.equal(settings.consentGiven, false, "Zustimmung nur bei striktem true");
});

// --- Modellabhaengige Request-Parameter ------------------------------------

test("moonshot-v1 bekommt Sampling-Parameter und max_tokens", () => {
  const body = Config.buildRequestBody("moonshot-v1-32k", [{ role: "user", content: "x" }]);
  assert.equal(body.temperature, Config.TEMPERATURE);
  assert.equal(body.max_tokens, Config.COMPLETION_TOKENS_SAMPLING);
  assert.equal("max_completion_tokens" in body, false);
  assert.equal("reasoning_effort" in body, false);
});

test("kimi-k3 bekommt kein temperature - genau das ergab HTTP 400", () => {
  // "invalid temperature: only 1 is allowed for this model"
  const body = Config.buildRequestBody("kimi-k3", [{ role: "user", content: "x" }]);
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
  assert.equal(body.max_completion_tokens, Config.COMPLETION_TOKENS_REASONING);
  assert.equal(body.reasoning_effort, Config.REASONING_EFFORT);
});

test("kimi-k2.x bekommt weder temperature noch reasoning_effort", () => {
  for (const model of ["kimi-k2.6", "kimi-k2.7-code-highspeed", "kimi-k2.5"]) {
    const body = Config.buildRequestBody(model, []);
    assert.equal("temperature" in body, false, model);
    assert.equal("reasoning_effort" in body, false, model);
    assert.equal(body.max_completion_tokens, Config.COMPLETION_TOKENS_REASONING, model);
  }
});

test("Unbekannte Modelle bekommen die restriktivere Variante", () => {
  const body = Config.buildRequestBody("voellig-neues-modell", []);
  assert.equal("temperature" in body, false);
  assert.equal("max_tokens" in body, false);
  assert.ok(body.max_completion_tokens > 0);
});

test("Das Antwortbudget ist bei Reasoning-Modellen groesser", () => {
  assert.ok(Config.completionTokensFor("kimi-k3") > Config.completionTokensFor("moonshot-v1-8k"));
});

// --- Bisher ungetestete Bausteine ------------------------------------------
// Diese Funktionen waren exportiert, aber weder in der Laufzeit noch in Tests
// benutzt. Sie kodieren echte Regeln, also werden sie geprüft statt versteckt.

test("supportsSamplingParams trennt moonshot-v1 von den kimi-Modellen", () => {
  assert.equal(Config.supportsSamplingParams("moonshot-v1-8k"), true);
  assert.equal(Config.supportsSamplingParams("MOONSHOT-V1-8K"), true, "Groß-/Kleinschreibung");
  for (const model of ["kimi-k3", "kimi-k2.6", "neues-modell", "", undefined]) {
    assert.equal(Config.supportsSamplingParams(model), false, String(model));
  }
});

test("isReasoningModel erkennt nur die k3-Reihe", () => {
  assert.equal(Config.isReasoningModel("kimi-k3"), true);
  assert.equal(Config.isReasoningModel("kimi-k3-mini"), true);
  assert.equal(Config.isReasoningModel("kimi-k2.7-code-highspeed"), false);
  assert.equal(Config.isReasoningModel(undefined), false);
});

test("normalizeBaseUrl entfernt Leerraum und nachlaufende Slashes", () => {
  assert.equal(Config.normalizeBaseUrl("  https://api.moonshot.ai/v1///  "), "https://api.moonshot.ai/v1");
  assert.equal(Config.normalizeBaseUrl(null), "");
});
