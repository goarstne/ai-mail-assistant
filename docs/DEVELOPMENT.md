# Entwicklung

AI Mail Assistant ist eine Thunderbird-MailExtension ohne Laufzeitabhängigkeiten.
Installation und Bedienung stehen im [README](../README.md).

## Voraussetzungen und Build

Node.js 18+, `zip` und `python3`; Thunderbird 128+ für den Anwendungstest.
Ein API-Key wird nur für Live-Anfragen benötigt, nicht für Tests oder Build.

```bash
npm run check
npm run build
```

Der Build prüft Manifest, Dateiverweise, Element-IDs, Übersetzungen und Tests und
packt `dist/ai-mail-assistant-<version>.xpi`. Entwicklungsdateien und Tests sind
nicht im Paket. `npm install` installiert ESLint für `npm run lint`.

Die interne Add-on-ID `kimi-mail-assistant@local.extension` bleibt trotz
Umbenennung unverändert. Thunderbird erkennt die XPI dadurch als Update und
behält den Erweiterungsspeicher. Die Versionsnummern in `manifest.json` und
`package.json` müssen übereinstimmen.

## Aufbau

| Datei | Aufgabe |
|---|---|
| `manifest.json` | MV3, stabile Add-on-ID, Berechtigungen |
| `background.js` | Generierungsaufträge, API-Aufruf, Fehlermeldungen, Einfügen in Entwürfe |
| `lib/config.js` | Anbieter, Endpunktprüfung, Modelle, Speicherformat und Migration |
| `lib/mailtext.js` | MIME-Auswahl, Textbegrenzung, Prompt-Aufbau, Vorschlagsparser |
| `lib/ui.js`, `lib/i18n.js` | Gemeinsame Oberfläche und Übersetzungen |
| `options/` | Anbieterauswahl, Zugangsdaten, Zustimmung und Modellkatalog |
| `popup/` | Nachrichten- und Verfassen-Popup |
| `_locales/` | Deutsch und Englisch |

Die Bibliotheken sind klassische Skripte mit `globalThis.MailAssistant…`-Namespaces.
Die Popups schicken Aufträge an das Hintergrundskript, damit Generierungen beim
Schließen eines Popups weiterlaufen. Es wird ausschließlich ein Entwurf erstellt
oder ergänzt; die Erweiterung ruft keine API zum Mailversand auf.

## Anbieter und Speicherformat

`PROVIDERS` enthält drei feste Kontoprofile:

- `moonshot`: `https://api.moonshot.ai/v1`
- `moonshot-cn`: `https://api.moonshot.cn/v1`
- `openrouter`: `https://openrouter.ai/api/v1`

Keys, Zustimmung, Modell und Modellkatalog sind pro Profil getrennt. Die URLs
sind in der Oberfläche nur lesbar. Die Validierung akzeptiert ausschließlich den
zum Profil passenden, vollständigen Endpunkt. Zusätzliche Ports, Pfade,
Zugangsdaten und URL-Parameter werden abgewiesen. Beide Fetch-Pfade verwenden
`redirect: "error"`.

```text
provider: aktiver Profilname
providers:
  <Profilname>:
    apiKey
    consentGiven
    model
    modelCache: Modell-IDs
    modelMetadata: pro Modell contextTokens und maxCompletionTokens
autoSuggest: globale Einstellung
```

`loadProviderState()` liest 1.x-Einstellungen in das Profil des ursprünglichen
Endpunkts ein, ohne etwas zu schreiben. Ein fremder/ungültiger alter Endpunkt
übernimmt weder Key noch Zustimmung. `saveProviderSettings()` speichert die
vollständigen Profile und entfernt erst danach die alten Felder. Ein bereits
vorhandener `providers`-Speicher wird niemals aus alten Keys wieder aufgefüllt.

Die Optionsseite hält Änderungen beim Wechsel des Anbieters im Arbeitsspeicher.
**Speichern** aktiviert und speichert das aktuelle Profil. Der Modellkatalog
wird ebenfalls erst dann dauerhaft gespeichert. **Key löschen** wirkt sofort
auf das ausgewählte Profil, unabhängig von einer ungültigen ungespeicherten
Modell-ID. Ein Widerruf der Zustimmung muss auch mit vorhandenem Key und ohne
neue Host-Freigabe speicherbar sein.

MV3-Hostrechte werden vor Netzwerkaufrufen geprüft. `permissions.request()` muss
im Klick-Handler vor dem ersten anderen `await` stehen, damit die Nutzergeste
nicht verloren geht. Die Oberfläche sperrt während Speichern/Laden sämtliche
bearbeitbaren Felder, damit ein später eintreffender Katalog nicht einem anderen
Profil zugeordnet wird.

## API und Modelle

Kimi verwendet weiterhin modellabhängige Parameter: `moonshot-v1` bekommt
`temperature` und `max_tokens`, Kimi K2/K3 `max_completion_tokens`, K3 zusätzlich
`reasoning_effort: "low"`.

OpenRouter verwendet `POST /api/v1/chat/completions`, Bearer-Authentifizierung,
`model`, `messages` und das normalisierte `max_completion_tokens`. Es werden keine
Kimi-spezifischen Sampling- oder Reasoning-Parameter auf fremde Modelle übertragen.
Referenz: [Chat completions](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request).

`GET {baseUrl}/models` lädt die Modellliste. OpenRouter-IDs erlauben einen
Anbieterpräfix und einen optionalen Variantensuffix wie `:free`. Reine Bild-,
Audio- und Embedding-Modelle werden über `architecture.output_modalities`
ausgefiltert, sofern der Katalog die Modalitäten liefert. Die Optionsseite bietet
ein Eingabefeld mit Datalist, sodass auch eine manuelle ID möglich ist.

`context_length` und `top_provider.max_completion_tokens` aus dem Katalog werden
validiert und gespeichert. Bei OpenRouter bleibt das Ausgabelimit unter einem
Viertel des Kontextfensters, maximal 8000 Token und höchstens dem Kataloglimit.
Unbekannte Router-Modelle verwenden 8192 Token Kontext statt einer Schätzung aus
dem Modellnamen. Mailtext wird nach Abzug von Ausgabe- und Promptbudget begrenzt.
Referenz: [Models](https://openrouter.ai/docs/guides/overview/models).

Der Chat-Timeout beträgt 60 Sekunden und umfasst auch das Lesen des Response-
Bodys. Der Modellkatalog hat einen eigenen 20-Sekunden-Timeout. HTTP 402 und
Fehlerobjekte in HTTP-200-Antworten werden explizit behandelt. Bei
`finish_reason: "length"` wird kein unvollständiger Text eingefügt.

## Testabdeckung

93 Node-Tests prüfen unter anderem:

- MIME-Auswahl, Prompt-Maskierung, Nonces und Vorschlagsparser.
- Alte Kimi-Einstellungen, Anbietertrennung, Key-Löschung und Widerruf.
- Modell-IDs, feste Endpunkte, Kontext- und Ausgabelimits.
- Options-Handler, Host-Freigaben und Modellkatalog mit simuliertem DOM.
- Hintergrundabläufe für Antworten, Entwürfe und Vorschläge mit simulierten
  Thunderbird- und Fetch-APIs; einschließlich Fehlern und Timeout beim Body-Lesen.

Das ersetzt keinen vollständigen Live-Test mit Thunderbird und einem echten
Anbieterkonto. Der frühere Audit in [AUDIT.md](AUDIT.md) dokumentiert den Stand
vor der OpenRouter-Integration.

### Manuelle Prüfung für 1.8.0

- Über ein vorhandenes 1.7.0-Profil aktualisieren: genau ein Add-on, gleicher
  Speicher, bestehende Kimi-Konfiguration weiterhin ausgewählt.
- OpenRouter wählen: kein übernommener Kimi-Key und keine übernommene Zustimmung.
- Modellkatalog laden, Modell auswählen und speichern; Host-Freigabe bestätigen.
- Mit erfundener Testkorrespondenz Vorschläge, Antwort und Entwurfstext erzeugen.
- Kimi international und China separat prüfen; Schlüssel bleiben beim Endpunkt.
- Zustimmung widerrufen und Key löschen; bei fehlender Zustimmung keine
  Generierungsanfrage. Fehlende oder abgelehnte Hostrechte verständlich melden.
- Helle/dunkle Darstellung, Deutsch/Englisch, Tastaturbedienung und Datalist in
  Thunderbird prüfen.

## Vorschau und Screenshots

```bash
npm run preview
npm run shots
```

`.preview/` enthält dieselben HTML-/CSS-Dateien wie das Paket, mit einem
`browser`-Stub und synthetischen Daten. Fetch wird simuliert; Vorschau-Klicks
kontaktieren keinen echten Anbieter. `?provider=openrouter` zeigt die
OpenRouter-Einrichtung. Weitere Parameter: `lang=de|en`, `theme=light|dark`,
`key=0`, `consent=0`, `suggest=off|slow|fail`, `body=empty`, `reply=fail`.

`shots` benötigt Chrome/Chromium und aktualisiert die Screenshots im Repository.
