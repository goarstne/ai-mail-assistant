# Datenschutzhinweis / Privacy notice

Stand / Updated: 2026-09-09 · Version 1.8.0

## Deutsch

AI Mail Assistant verarbeitet Mailinhalte über den in den Einstellungen gewählten
KI-Dienst. Beim Upgrade von Kimi AI Mail Assistant gilt eine vorhandene Zustimmung
weiterhin nur für den bisherigen Moonshot-Endpunkt. Für OpenRouter und für den
jeweils anderen Moonshot-Endpunkt sind ein eigener Key und eine eigene Zustimmung
nötig. Thunderbird muss den Zugriff auf den jeweiligen Host ebenfalls erlauben.

### Wann und welche Daten übertragen werden

| Aktion | Übertragene Daten |
|---|---|
| Antwortvorschläge anfordern, auch automatisch beim Öffnen des Popups | Absender (bis 200 Zeichen), Betreff (bis 300 Zeichen), Text der angezeigten oder ursprünglichen Mail (abhängig vom Kontextbudget gekürzt) |
| Antwort generieren | Dieselben Daten sowie deine Anweisung (bis 2000 Zeichen) |
| Text im Verfassen-Fenster generieren | Bei einer Antwort die ursprüngliche Mail; sonst Empfänger (bis 200 Zeichen), Betreff, Entwurfstext und Anweisung |
| „Verfügbare Modelle laden“ | API-Key; keine Mailinhalte |

Jede API-Anfrage enthält den Key des gewählten Dienstes als Bearer-Header.
Generierungsanfragen enthalten außerdem Modell-ID und Systemanweisungen.
Netzwerkbedingt sieht der angesprochene Dienst unter anderem deine IP-Adresse.
Anhänge werden nicht ausgewertet. Die Erweiterung überträgt nicht pauschal das
Postfach oder Kontoeinstellungen. Automatische Vorschläge lassen sich abschalten.

### Empfänger

- **Kimi / Moonshot AI international:** `https://api.moonshot.ai/v1`
- **Kimi / Moonshot AI China:** `https://api.moonshot.cn/v1`
- **OpenRouter:** `https://openrouter.ai/api/v1`; OpenRouter leitet die Anfrage an
  einen Modellanbieter weiter. Bei `openrouter/auto` wählt OpenRouter auch das
  Modell. Routing, Verarbeitung und Speicherung richten sich nach dem Modell,
  den beteiligten Anbietern und deinen OpenRouter-Einstellungen.

Die Erweiterung erlaubt nur diese festen API-Endpunkte und folgt keinen
HTTP-Weiterleitungen. Das verhindert nicht die serverseitige Weiterleitung durch
OpenRouter. Sie enthält keine eigene Telemetrie oder Analytics. Es gelten die
Datenschutzbedingungen der jeweiligen Dienste; die Erweiterung macht keine Zusage
über deren Speicherfristen, Training oder Verarbeitungsstandorte. Hinweise dazu:
[OpenRouter privacy](https://openrouter.ai/privacy) und
[OpenRouter privacy settings](https://openrouter.ai/settings/privacy).

Mailinhalte können personenbezogene oder vertrauliche Angaben anderer Personen
enthalten. Nutze die Übertragung nur, wenn du zur Weitergabe berechtigt bist.

### Lokale Speicherung und Widerruf

In `browser.storage.local` werden unverschlüsselt gespeichert:

- `provider`: aktuell ausgewählter Dienst.
- `providers`: je Dienst API-Key, Modell-ID, Zustimmung, Modellliste und
  Kontext-/Ausgabelimits aus dem Katalog.
- `autoSuggest`: ob beim Öffnen des Popups automatisch Vorschläge erzeugt werden.

Die Daten sind Bestandteil von Profil-Backups. Beim ersten Speichern nach dem
Update werden alte 1.x-Einstellungen in die Anbieterprofile übernommen und die
alten Speicherfelder einschließlich der bisherigen Key-Kopie entfernt.

Zum Widerrufen den Anbieter wählen, den Zustimmungshaken entfernen und speichern.
Der gespeicherte Key kann dabei erhalten bleiben. **„Key löschen“** entfernt den
Key des ausgewählten Anbieters und widerruft dessen Zustimmung sofort. Andere
Anbieterprofile bleiben erhalten. Um alle Keys zu entfernen, wiederhole dies für
jeden eingerichteten Anbieter. Bereits gestartete Anfragen und bereits an einen
Dienst übertragene Daten werden durch einen Widerruf nicht zurückgerufen.

## English

AI Mail Assistant sends email content through the AI service selected in settings.
Existing Kimi consent and credentials remain associated with their original
Moonshot endpoint when upgrading. OpenRouter and the other Moonshot endpoint
require their own key, consent and Thunderbird host permission.

### Transmission

Reply suggestions send the sender, subject and message body. This also happens
when opening the popup if automatic suggestions are enabled. Generating a reply
adds your instruction. When composing, the original message is used for replies
when available; otherwise recipients, subject, draft text and your instruction
are used. Sender/recipients are limited to 200 characters, subject to 300 and
instruction to 2000. Message and draft text are limited according to the model's
context budget. Attachments are not read.

Every API request sends the selected service's key in a Bearer header; generation
requests also include the model ID and system instructions. The service can see
network information such as your IP address. Loading the model catalog is a
separate button action and sends an API key, **no email content**.

The direct endpoints are `api.moonshot.ai`, `api.moonshot.cn` or `openrouter.ai`
as listed above. **OpenRouter forwards requests to upstream model providers**;
`openrouter/auto` also delegates model selection. Their handling of the data
depends on the services, model and account settings. The extension makes no
promise about provider retention, training use or processing locations. Only
share information you are entitled to disclose.

### Storage and withdrawal

The extension stores the active provider, automatic-suggestion preference, and
separate provider profiles containing keys, consent, selected models and catalog
metadata in unencrypted Thunderbird local extension storage. Profile backups
include this data. Saving after an upgrade migrates legacy settings and removes
the obsolete key copy after the new profiles have been stored.

Select a provider, untick consent and save to stop future generation requests for
that provider. “Delete key” immediately removes that provider's key and withdraws
its consent. Other provider profiles remain intact. Repeat for all providers to
remove all keys. Withdrawal cannot recall a request already in progress or data
already transmitted. Automatic suggestions can be disabled separately.

The extension has no telemetry or analytics and refuses HTTP redirects. This does
not prevent OpenRouter's server-side routing to upstream providers.
