/**
 * Gemeinsame Konfiguration und Validierung.
 *
 * Wird von background.js, popup.js und options.js geladen und haengt sich an
 * globalThis, damit alle drei Kontexte dieselben Konstanten und dieselbe
 * URL-Validierung benutzen (frueher war beides dupliziert und divergent).
 */
"use strict";

(function (global) {
  /**
   * H2: Allowlist statt blosser https-Pruefung.
   *
   * `startsWith("https://")` liess Hosts wie `https://api.moonshot.cn.angreifer.de`
   * durch. An eine solche URL gingen API-Key (Bearer-Header) UND der komplette
   * Mailinhalt. Es wird deshalb der geparste `hostname` exakt gegen diese Liste
   * geprueft - Suffix-Vergleiche waeren erneut umgehbar.
   */
  const ALLOWED_API_HOSTS = Object.freeze([
    "api.moonshot.ai", // internationale Plattform (platform.kimi.ai) - Default
    "api.moonshot.cn"  // Plattform China - eigene Accounts, eigene Keys
  ]);

  /**
   * Rueckfallliste, falls `/v1/models` nicht erreichbar ist.
   *
   * Die massgebliche Liste kommt zur Laufzeit von der API (siehe
   * `fetchModels()` in options.js) - eine fest verdrahtete Liste veraltet mit
   * jedem Modellrelease und war bereits einmal Ursache dafuer, dass aktuelle
   * Modelle nicht auswaehlbar waren.
   */
  const FALLBACK_MODELS = Object.freeze([
    "kimi-k3",
    "kimi-k2.7-code-highspeed",
    "kimi-k2.6",
    "kimi-k2.5",
    "moonshot-v1-128k",
    "moonshot-v1-32k",
    "moonshot-v1-8k"
  ]);

  const DEFAULT_CONTEXT_TOKENS = 128000;

  /**
   * Kontextfenster in Token - Grundlage fuer das Zeichenbudget (M4/M5).
   *
   * Da Modell-IDs jetzt von der API kommen, kann die Zuordnung nicht mehr
   * vollstaendig sein. Sie wird deshalb aus der ID abgeleitet, mit einem
   * bewusst konservativen Rueckfall: zu frueh kuerzen kostet Kontext, zu spaet
   * kuerzen laesst den Request an einem API-Fehler scheitern.
   */
  function contextTokensFor(model) {
    const id = String(model || "").toLowerCase();

    if (/^kimi-k3/.test(id)) return 1000000;
    if (/^kimi-k2\.[5-9]/.test(id)) return 256000;

    const moonshot = id.match(/^moonshot-v1-(\d+)k/);
    if (moonshot) return Number(moonshot[1]) * 1024;

    const generic = id.match(/(\d+)k(?:$|-)/);
    if (generic) return Number(generic[1]) * 1024;

    return DEFAULT_CONTEXT_TOKENS;
  }

  const DEFAULTS = Object.freeze({
    apiKey: "",
    baseUrl: "https://api.moonshot.ai/v1",
    model: "kimi-k3",
    /** H3: erst nach ausdruecklicher Zustimmung wird irgendetwas versendet. */
    consentGiven: false,
    /**
     * Antwortvorschlaege beim Oeffnen des Popups automatisch laden.
     *
     * Abschaltbar, weil jedes Oeffnen sonst einen Modellaufruf kostet - auch
     * dann, wenn der Nutzer ohnehin selbst formulieren wollte.
     */
    autoSuggest: true
  });

  /** Mehr als vier Vorschlaege sind im Popup nicht mehr ueberschaubar. */
  const MAX_SUGGESTIONS = 4;

  /**
   * M5: Obergrenze fuer die Antwort, damit das Kontextfenster nicht platzt.
   *
   * Reasoning-Modelle verbrauchen einen Teil davon fuer den Denkvorgang, bevor
   * das erste Zeichen der Antwort kommt - mit 1500 waere die Mail abgeschnitten.
   */
  const COMPLETION_TOKENS_SAMPLING = 1500;
  const COMPLETION_TOKENS_REASONING = 8000;

  /**
   * `reasoning_effort` fuer kimi-k3. Der Anbieter-Default ist "max"; fuer eine
   * E-Mail-Antwort ist das unnoetig langsam und teuer.
   */
  const REASONING_EFFORT = "low";
  /** M5: ohne Timeout dreht der Spinner bei haengendem Endpunkt endlos. */
  const REQUEST_TIMEOUT_MS = 60000;
  /** Nur die moonshot-v1-Reihe akzeptiert Sampling-Parameter. */
  const TEMPERATURE = 0.5;

  /**
   * Unterstuetzt das Modell `temperature` und die uebrigen Sampling-Parameter?
   *
   * kimi-k3 lehnt `temperature` mit HTTP 400 ab ("only 1 is allowed for this
   * model"), ebenso k2.6 und k2.7-code. Ein pauschal mitgesendetes
   * `temperature: 0.5` machte die Erweiterung mit jedem aktuellen Modell
   * unbenutzbar.
   */
  function supportsSamplingParams(model) {
    return /^moonshot-v1/.test(String(model || "").toLowerCase());
  }

  function isReasoningModel(model) {
    return /^kimi-k3/.test(String(model || "").toLowerCase());
  }

  /** Antwortbudget in Token - bei Reasoning-Modellen groesser, siehe oben. */
  function completionTokensFor(model) {
    return supportsSamplingParams(model) ? COMPLETION_TOKENS_SAMPLING : COMPLETION_TOKENS_REASONING;
  }

  /**
   * Baut den Request-Body passend zum Modell.
   *
   * Die Parameter unterscheiden sich deutlich:
   *   moonshot-v1  - temperature, top_p, ...; `max_tokens`
   *   kimi-k2.x    - keine Sampling-Parameter; `max_completion_tokens`
   *   kimi-k3      - zusaetzlich `reasoning_effort`
   * Fuer unbekannte IDs gilt die restriktivere Variante: `max_completion_tokens`
   * ohne Sampling-Parameter. `max_tokens` ist ohnehin als veraltet markiert.
   */
  function buildRequestBody(model, messages) {
    const body = { model, messages };

    if (supportsSamplingParams(model)) {
      body.temperature = TEMPERATURE;
      body.max_tokens = COMPLETION_TOKENS_SAMPLING;
      return body;
    }

    body.max_completion_tokens = COMPLETION_TOKENS_REASONING;
    if (isReasoningModel(model)) body.reasoning_effort = REASONING_EFFORT;
    return body;
  }

  /** M4: Betreff wird gekappt, damit er das Zeichenbudget nicht auffrisst. */
  const MAX_SUBJECT_CHARS = 300;
  const MAX_AUTHOR_CHARS = 200;
  const MAX_PROMPT_CHARS = 2000;

  /**
   * M4/M5: Zeichenbudget fuer den Mailtext, abgeleitet vom Modell.
   *
   * Grobe Faustregel fuer Deutsch/Englisch: ~3 Zeichen pro Token. Von den
   * verfuegbaren Token gehen Antwort-Budget und ein Sicherheitspuffer fuer
   * System-Prompt, Betreff, Absender und Nutzeranweisung ab.
   */
  function mailCharBudget(model) {
    const contextTokens = contextTokensFor(model);
    const overheadTokens = completionTokensFor(model) + 1200;
    const usableTokens = Math.max(1000, contextTokens - overheadTokens);
    return Math.min(60000, usableTokens * 3);
  }

  /** Entfernt nachlaufende Slashes, damit `${base}/chat/completions` nie `//` erzeugt. */
  function normalizeBaseUrl(raw) {
    return String(raw || "").trim().replace(/\/+$/, "");
  }

  /**
   * Validiert die API-Basis-URL.
   *
   * @returns {{ok: true, url: string} | {ok: false, reason: string}}
   *          `reason` ist ein i18n-Schluessel, keine fertige Meldung, damit
   *          Popup und Optionen dieselbe Ursache unterschiedlich darstellen koennen.
   */
  function validateBaseUrl(raw) {
    const normalized = normalizeBaseUrl(raw);
    if (!normalized) return { ok: false, reason: "errUrlEmpty" };

    let parsed;
    try {
      parsed = new URL(normalized);
    } catch {
      return { ok: false, reason: "errUrlMalformed" };
    }
    if (parsed.protocol !== "https:") return { ok: false, reason: "errUrlNotHttps" };
    if (!ALLOWED_API_HOSTS.includes(parsed.hostname)) return { ok: false, reason: "errUrlHostNotAllowed" };
    // Credentials in der URL wuerden den Key an einen Proxy weiterreichen.
    if (parsed.username || parsed.password) return { ok: false, reason: "errUrlHasCredentials" };

    return { ok: true, url: normalized };
  }

  /**
   * Plausibilitaetspruefung einer Modell-ID.
   *
   * Eine Allowlist waere hier falsch: die gueltigen IDs bestimmt der Anbieter,
   * und der Nutzer kann nur waehlen, was `/v1/models` fuer seinen Account
   * zurueckgibt. Geprueft wird deshalb nur, dass die ID nichts enthaelt, was in
   * einem JSON-Body oder in einer Fehlermeldung Schaden anrichtet.
   */
  function isPlausibleModelId(model) {
    return typeof model === "string" && /^[A-Za-z0-9][A-Za-z0-9._-]{1,63}$/.test(model);
  }

  /** Liest die Einstellungen und ersetzt unbrauchbare Werte durch die Defaults. */
  async function loadSettings(storage) {
    const stored = await storage.local.get(DEFAULTS);
    return {
      apiKey: String(stored.apiKey || "").trim(),
      baseUrl: normalizeBaseUrl(stored.baseUrl) || DEFAULTS.baseUrl,
      model: isPlausibleModelId(stored.model) ? stored.model : DEFAULTS.model,
      consentGiven: stored.consentGiven === true,
      autoSuggest: stored.autoSuggest !== false
    };
  }

  global.KimiConfig = {
    ALLOWED_API_HOSTS,
    FALLBACK_MODELS,
    DEFAULT_CONTEXT_TOKENS,
    contextTokensFor,
    DEFAULTS,
    MAX_SUGGESTIONS,
    COMPLETION_TOKENS_SAMPLING,
    COMPLETION_TOKENS_REASONING,
    REASONING_EFFORT,
    REQUEST_TIMEOUT_MS,
    TEMPERATURE,
    supportsSamplingParams,
    isReasoningModel,
    completionTokensFor,
    buildRequestBody,
    MAX_SUBJECT_CHARS,
    MAX_AUTHOR_CHARS,
    MAX_PROMPT_CHARS,
    mailCharBudget,
    normalizeBaseUrl,
    validateBaseUrl,
    isPlausibleModelId,
    loadSettings
  };
})(globalThis);
