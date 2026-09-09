# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/),
Versionierung nach [SemVer](https://semver.org/lang/de/).

## [1.8.0] — 2026-09-09

### Neu

- OpenRouter als zusätzlicher Anbieter, mit Modellkatalog, suchbarer/manueller
  Modell-ID und Unterstützung für Varianten wie `:free`.
- Separate Keys, Zustimmung und Modelllisten für OpenRouter, Kimi international
  und Kimi China. Alte Kimi-Einstellungen werden dem bisherigen Endpunkt
  zugeordnet und beim Speichern migriert.
- Kontext- und Ausgabelimits aus OpenRouter-Modellmetadaten; konservativer
  Rückfall für unbekannte Modelle.
- Tests für Anbieterwechsel, Migration, Modellkatalog, Hintergrundabläufe,
  Berechtigungen, Guthabenfehler und unvollständige Antworten: insgesamt 93.

### Geändert

- Projekt und Repository heißen jetzt **AI Mail Assistant** / `ai-mail-assistant`.
  Die interne Add-on-ID bleibt für kompatible Updates und bestehende Einstellungen
  unverändert.
- Anbieterbezogene Datenschutztexte, deutsche/englische Oberfläche,
  Dokumentation und Screenshots aktualisiert.
- Feste API-Endpunkte statt frei bearbeitbarer Basis-URL; beide Netzwerkpfade
  verweigern HTTP-Weiterleitungen.

### Behoben

- Widerruf der Zustimmung lässt sich mit gespeichertem API-Key sichern, ohne
  erneut Hostrechte anzufordern.
- Der Chat-Timeout umfasst auch den Response-Body. OpenRouter-Fehler in
  HTTP-200-Antworten und fehlendes Guthaben erhalten verständliche Meldungen.
- Bei erreichtem Ausgabelimit wird kein unvollständiger Text in den Entwurf
  eingefügt.
- ESLint erkennt die Build-Skripte korrekt als ES-Module.

## [1.7.0] — 2026-08-27

Vorbereitung der Veröffentlichung. Keine Änderung am Funktionsumfang der
Erweiterung selbst.

### Neu

- Zweisprachiges README (Englisch zuerst, Deutsch darunter) mit Screenshots,
  vollständiger Funktionsübersicht und einem Abschnitt zu Sicherheit und
  Datenschutz.
- `LICENSE` (MIT) und GitHub-Actions-Workflow: Konsistenzprüfung, Tests und
  Paketbau bei jedem Push.
- `npm run shots` erzeugt die Screenshots aus der Vorschau — dieselben Seiten,
  die auch ausgeliefert werden, nichts nachgebaut oder retuschiert. Elf
  Aufnahmen in Deutsch und Englisch, hell und dunkel, plus Kopfbild.
- Die Vorschau kennt jetzt `?lang=de|en` und `?theme=light|dark`.

### Geändert

- `styles/base.css` unterstützt zusätzlich zur Systemeinstellung eine
  ausdrückliche Wahl über `data-theme`. Nötig, um beide Varianten aufzunehmen,
  ohne das System umzustellen — und die Grundlage dafür, später dem
  Thunderbird-Theme statt dem Betriebssystem zu folgen.
- Das bisherige README ist zu `docs/DEVELOPMENT.md` geworden.

### Behoben

- Die Beispieldaten der Vorschau enthielten einen echten Absender und einen
  echten Vornamen. Beides durch frei erfundene Daten ersetzt — die Vorschau
  landet in den Screenshots des öffentlichen Repositorys.

## [1.6.1] — 2026-08-27

### Behoben

- **Die Einrichtungsseite erschien erst beim zweiten Installieren.** Sie hing an
  `details.reason === "install"`. Beim Installieren einer `.xpi` über eine
  vorhandene Version meldet Thunderbird aber `"update"` — die Seite blieb also
  genau bei der Aktualisierung aus, bei der man sie erwartet. Maßgeblich ist
  jetzt nicht der Anlass, sondern ob die Einrichtung überhaupt abgeschlossen
  ist: fehlt Key oder Zustimmung, geht die Seite auf; ist alles gesetzt, bleibt
  sie weg.
- `tabs.create` mit ausdrücklicher URL statt `openOptionsPage()` — letzteres ist
  während des Installationsvorgangs nicht immer bereit. Der alte Aufruf bleibt
  als Rückfall stehen.

### Neu

- **Einrichtungshinweis mit drei Schritten** beim ersten Öffnen der Seite; das
  Key-Feld bekommt gleich den Fokus. Nach dem Speichern verschwindet der Hinweis
  und die Statusmeldung sagt, wo es weitergeht — statt nur „gespeichert".

### Werkzeuge

- Der Validator versteht jetzt i18n-Schlüssel in Ausdrücken, etwa
  `translate(fertig ? "a" : "b")`. Vorher meldete er sie fälschlich als unbenutzt.

## [1.6.0] — 2026-08-27

Feinschliff an Oberfläche und Code. Keine Änderung am Funktionsumfang.

### Oberfläche

- **Gemeinsames Fundament `styles/base.css`.** Vorher trugen `popup.css` und
  `options.css` je einen eigenen `:root`-Block mit teils abweichenden Werten,
  dazu verstreute Hex-Codes. Farben, Abstandsraster und alle Bedienelemente
  liegen jetzt an einer Stelle; die beiden anderen Dateien enthalten nur noch,
  was ihre Ansicht wirklich unterscheidet.
- **Sichtbarer Tastaturfokus.** Fehlte bislang vollständig — wer mit der Tastatur
  bediente, sah nicht, wo er stand. Jetzt `:focus-visible` mit Akzentring.
- **Gesperrte Felder sehen gesperrt aus.** Bei einer Mail ohne lesbaren Textteil
  wirkte das Eingabefeld weiter benutzbar.
- **Hover und Auswahl sind unterscheidbar.** Beide zeigten fast dieselbe
  Hervorhebung, sodass die Karte unter dem Mauszeiger ausgewählt aussah. Hover
  ändert jetzt nur den Rahmen; die Auswahl trägt zusätzlich einen Balken an der
  linken Kante.
- **Vorschlagskarten haben einen zugänglichen Namen** (`aria-label` aus Titel und
  Beschreibung). Eine Sprachausgabe las vorher nur „Schaltfläche".
- Pfeil auf den Vorschlagskarten als Hinweis, dass der Klick unmittelbar etwas
  auslöst. Symbol in allen drei Kopfzeilen.
- Betreff und Absender fluchten jetzt in einem Raster statt je nach Länge der
  Beschriftung zu verrutschen.
- Kontextfenster wird als „1M" statt „1000K" angezeigt und läuft über i18n.
- Beschriftungen der Eingabefelder in beiden Popups parallel formuliert.

### Behoben

- **Der Datenschutzblock hatte seinen Hintergrund verloren** — Regression aus dem
  CSS-Umbau dieser Version, aufgefallen in der neuen Vorschau.

### Werkzeuge

- **`npm run preview` rendert die Oberfläche im Browser.** Dieselben HTML- und
  CSS-Dateien wie im Add-on, mit gestubbtem `browser`-Objekt. Zustände, die man
  im Betrieb kaum zu Gesicht bekommt, lassen sich über die Adresszeile schalten:
  Zustimmungssperre, fehlender Key, Vorschläge laden/scheitern, Mail ohne
  Textteil, Erzeugen scheitert.
- Alle 13 zuvor ungetesteten Exporte sind jetzt abgedeckt (61 Tests statt 55).
  Kein Export der `lib/`-Bausteine ist mehr ohne Verwendung.
- `.gitignore` ergänzt.

## [1.5.0] — 2026-08-27

### Geändert

- **Die Antwort ist jetzt zuverlässig in der Sprache der E-Mail.** Die Regel
  stand zwar schon im System-Prompt, aber an fünfter Stelle — und wenn die
  Anweisung aus einem Vorschlag deutsch formuliert war, setzte sie sich gegen
  eine englische Mail durch. Jetzt dreifach abgesichert: Regel 1 im
  System-Prompt mit ausdrücklicher Ansage, dass die Sprache der Anweisung
  bedeutungslos ist; eine Erinnerung am Ende des Prompts (Modelle folgen einer
  Vorgabe deutlich zuverlässiger, wenn sie am Anfang *und* am Ende steht); und
  die Vorschläge formulieren ihre Anweisung selbst in der Sprache der E-Mail,
  damit sie nicht gegensteuern.
- Gleiches im Verfassen-Fenster, bezogen auf den Entwurf. Ist der Entwurf leer,
  gilt die Sprache der Anweisung.
- **Ein Klick auf ein Thema erzeugt die Antwort sofort** — der Umweg über das
  Eingabefeld und einen zweiten Klick entfällt. Die Anweisung landet trotzdem
  sichtbar im Feld: so ist nachvollziehbar, womit erzeugt wurde, und nach einem
  Fehlschlag lässt sie sich anpassen und erneut abschicken, statt verloren zu
  sein.
- Während eines laufenden Auftrags sind die Vorschläge gesperrt. Ohne das löst
  ein zweiter Klick einen zweiten Modellaufruf und ein zweites Verfassen-Fenster
  aus.

## [1.4.0] — 2026-08-27

### Neu

- **Antwortvorschläge.** Statt die Anweisung selbst zu formulieren, bekommt man
  drei bis vier Richtungen vorgeschlagen — jede mit einem Satz, der beschreibt,
  *was in dieser Antwort stehen würde* (z. B. „Den Termin am Dienstag bestätigen
  und um die Agenda bitten."). Ein Klick übernimmt die Richtung als Anweisung;
  sie lässt sich vor dem Erzeugen noch ändern.
- Eigener Modellaufruf mit JSON-Ausgabe, `parseSuggestions()` liest sie robust:
  ```json-Blöcke, Prosa davor oder danach, englische statt deutscher Schlüssel,
  fehlende Felder, überlange Werte — zehn Tests decken die Fälle ab. Lässt sich
  nichts Brauchbares finden, gibt es einen Hinweis und die Erweiterung bleibt
  über das Eingabefeld vollständig benutzbar.
- Vorschläge gibt es in beiden Popups. Im Verfassen-Fenster nur, wenn es Kontext
  gibt — bei einer leeren neuen Mail bleibt der Bereich aus.
- Neue Einstellung **„Antwortvorschläge automatisch laden"** (Standard: an).
  Abschaltbar, weil jedes Öffnen des Popups sonst einen Modellaufruf kostet —
  auch dann, wenn man ohnehin selbst formulieren wollte. Abgeschaltet lassen sie
  sich über „Neu laden" anfordern.

### Sicherheit

- Der Vorschlags-Prompt hat denselben Maskierungs- und Nonce-Schutz wie der
  Antwort-Prompt, plus die ausdrückliche Regel, keine Richtung vorzuschlagen,
  die aus einer Anweisung im Mailtext stammt.
- Vorschlagstexte gehen ausschließlich über `textContent` ins DOM. Das ist hier
  kein Formalismus: sie stammen von einem Modell, das eine fremde E-Mail gelesen
  hat, ihr Wortlaut ist also mittelbar vom Absender beeinflussbar.

### Werkzeuge

- `scripts/validate.mjs` gleicht jetzt Element-IDs zwischen Skript und Markup
  ab. Ein `$("tippfehler")` fiel bisher erst zur Laufzeit auf, mitten im Ablauf.

## [1.3.0] — 2026-08-27

### Behoben

- **HTTP 400 „invalid temperature: only 1 is allowed for this model".** Es wurde
  pauschal `temperature: 0.5` mitgesendet. Sampling-Parameter akzeptiert nur die
  `moonshot-v1`-Reihe; `kimi-k3`, `kimi-k2.6` und `kimi-k2.7-code` lehnen sie ab.
  Damit war die Erweiterung mit jedem aktuellen Modell unbenutzbar.
- `max_tokens` ist laut Anbieter zugunsten von `max_completion_tokens` veraltet.
  Der Request-Body wird jetzt in `buildRequestBody()` modellabhängig gebaut:
  `moonshot-v1` bekommt `temperature` + `max_tokens`, alles andere
  `max_completion_tokens`, `kimi-k3` zusätzlich `reasoning_effort`.
  Unbekannte Modell-IDs bekommen die restriktivere Variante.
- Antwortbudget für Reasoning-Modelle von 1500 auf 8000 Token angehoben — der
  Denkvorgang verbraucht einen Teil davon, bevor das erste Zeichen der Antwort
  kommt.
- `reasoning_effort` steht auf `low` statt des Anbieter-Defaults `max`: für eine
  E-Mail-Antwort ist die höchste Stufe unnötig langsam und teuer.

### Neu

- **Die Erweiterung lässt sich jetzt auch im Verfassen-Fenster benutzen**
  (`compose_action`). Anweisung eingeben, Text wird erzeugt und oben in den
  Entwurf gesetzt.
- Als Kontext dient bei einer Antwort die ursprüngliche Nachricht über
  `relatedMessageId` — sauberer als der zitierte Text im Entwurf, der durch die
  Zitatformatierung verunstaltet ist. Sonst der bisherige Entwurfstext; bei
  leerem Entwurf wird das dem Modell ausdrücklich gesagt.
- Der Entwurfstext wird genauso als unvertrauenswürdig behandelt wie eine
  angezeigte Nachricht — er enthält beim Antworten eine fremde E-Mail. Gleicher
  Maskierungs- und Nonce-Schutz, durch drei Tests abgesichert.

### Geändert

- Ladeanzeige, Fehlerausgabe und Zustimmungssperre nach `lib/ui.js` ausgelagert.
  Ohne das würde jede Änderung daran in zwei Popups gepflegt und die beiden
  Fassungen liefen auseinander.

## [1.2.1] — 2026-08-27

### Behoben

- **Popup brach mit „getDisplayedMessage is not a function“ ab.** Die
  Singular-Variante `messageDisplay.getDisplayedMessage()` gibt es in aktuellen
  Thunderbird-Versionen nicht mehr; maßgeblich ist `getDisplayedMessages()`
  (Plural). Beide Varianten werden jetzt per Feature-Erkennung bedient, die
  Singular-Form als Rückfall für ältere Versionen.
- Der Rückgabetyp variiert zusätzlich je nach Version — Array von
  `MessageHeader`, `MessageList`-Objekt mit `.messages`, oder ein einzelner
  Header. `firstMessage()` behandelt alle drei Formen; vier Tests decken das ab.
- Fehlt die API vollständig, erscheint jetzt ein Hinweis auf die
  Versionsanforderung statt eines rohen JavaScript-Fehlers.

## [1.2.0] — 2026-08-27

### Behoben

- **Optionsseite ließ sich nicht speichern.** `permissions.request()` lief nach
  `await browser.storage.local.set(...)` und damit außerhalb der Nutzergeste —
  Thunderbird brach mit *„permissions.request may only be called from a user
  input handler"* ab, und die Einstellungen blieben ungespeichert. Die
  Berechtigungsanfrage ist jetzt die erste asynchrone Operation im
  Klick-Handler. Regression aus 1.1.0.
- Wird die Freigabe abgelehnt, werden die Einstellungen trotzdem gespeichert
  und der Hinweis erscheint separat — vorher ging beides verloren.

### Geändert

- **Modelle kommen jetzt von der API.** Die fest verdrahtete Liste
  (`moonshot-v1-8k/32k/128k`) war veraltet und ließ die aktuellen Kimi-Modelle
  nicht zu. „Verfügbare Modelle laden" fragt `/v1/models` ab und zeigt genau
  das, was der Account freigeschaltet hat; das Ergebnis wird zwischengespeichert.
- Rückfallliste für den Fall, dass die Abfrage scheitert: `kimi-k3`,
  `kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5` und die
  `moonshot-v1`-Reihe. Neuer Default: `kimi-k3`.
- **Kontextfenster wird aus der Modell-ID abgeleitet** statt aus einer Tabelle,
  die mit jedem Release veraltet — mit konservativem Rückfall auf 128K für
  unbekannte IDs. Das Zeichenbudget für den Mailtext hängt daran.
- Modell-Validierung von einer Allowlist auf eine Plausibilitätsprüfung
  umgestellt: welche IDs gültig sind, bestimmt der Anbieter, nicht die
  Erweiterung.
- Das Auswahlfeld zeigt das Kontextfenster mit an, weil es bestimmt, wie viel
  Mailtext übertragen wird.

## [1.1.0] — 2026-08-27

Vollständige Umsetzung der Befunde aus dem Code-Audit (`docs/AUDIT.md`).
Keine Änderung am Funktionsumfang, aber Verhaltensänderungen bei Fehlern,
beim Datenschutz und bei Nur-Text-Konten.

### Behoben — Blocker

- **B1** Add-on-ID (`browser_specific_settings.gecko.id`) und
  `strict_min_version` ergänzt. Ohne ID war nur temporäres Laden möglich,
  keine Signierung, kein AMO-Upload.
- **B2** Nur-Text-Verfassen-Fenster wird korrekt bedient. Vorher wurde immer
  HTML in `body` geschrieben; bei Nur-Text-Konten schlug das fehl oder schrieb
  dem Nutzer wörtlich `undefined` in die Mail.

### Behoben — Sicherheit und Datenschutz

- **H1** Prompt Injection über Delimiter-Ausbruch geschlossen. Mailinhalt,
  Betreff und Absender werden maskiert, die Blöcke tragen einen zufälligen
  Nonce pro Anfrage. Durch Tests abgesichert.
- **H2** Basis-URL wird gegen eine Host-Allowlist geprüft statt nur auf
  `https://`. Vorher passierte `https://api.moonshot.cn.angreifer.de` die
  Prüfung — an eine solche Adresse wären API-Key und Mailinhalt gegangen.
- **H3** Datenschutzhinweis mit ausdrücklicher Zustimmung eingeführt. Ohne
  Zustimmung sendet das Hintergrundskript nichts. `PRIVACY.md` ergänzt.
- **H4** API-Aufruf und Antworterzeugung sind vom Popup ins Hintergrundskript
  gewandert. Vorher brach ein Fokusverlust des Popups die laufende Anfrage
  ohne jede Meldung ab.

### Behoben — Funktion und Robustheit

- **M1** HTML-Mails: Blockgrenzen bleiben als Zeilenumbrüche erhalten.
  `<p>Hallo</p><p>Welt</p>` ergab vorher `HalloWelt`.
- **M2** HTML-Erkennung über `contentType` statt über die Heuristik
  `text.includes("<") && text.includes(">")`. Nur-Text-Mails mit `a < b > c`
  oder `<name@firma.de>` wurden vorher durch den HTML-Parser zerstückelt.
- **M3** MIME-Parts werden nach Typ ausgewählt, Anhänge übersprungen. Vorher
  gewann der erstbeste nicht-leere Part — bei vorangestelltem Anhang oder
  `text/calendar` also der falsche.
- **M4** Kürzung nur noch an einer Stelle, an einer Wortgrenze, abhängig vom
  Kontextfenster des Modells, und dem Modell im Prompt mitgeteilt.
- **M5** `AbortController` mit 60-Sekunden-Timeout und `max_tokens`.
- **M6** `data.choices?.[0]` statt `data.choices[0]?.` — vorher ein TypeError,
  wenn die API ein Fehlerobjekt mit HTTP 200 lieferte.
- **M7** `api.moonshot.ai` zusätzlich in `host_permissions`, damit
  internationale Keys nicht an einem unerklärten CORS-Fehler scheitern.
- **M8** „Key löschen"-Schaltfläche; Speicherort des Keys wird benannt.

### Geändert — Aufräumen

- **N1** Ungenutzte `activeTab`-Berechtigung entfernt.
- **N2** Icon ergänzt (`icons/icon.svg`).
- **N3** `background.js` enthält jetzt die eigentliche Logik statt eines
  einzelnen `console.log`.
- **N4** Einheitliche Statusanzeige in den Optionen statt `alert()`.
- **N5** `<title>` im Popup, `role="status"` / `role="alert"` / `aria-live`,
  Rücksicht auf `prefers-reduced-motion` und `prefers-color-scheme`.
- **N6** Oberflächentexte nach `_locales/` (de, en) ausgelagert.
- **N7** Doppelte URL-Prüfung und -Normalisierung nach `lib/config.js` vereinigt.
- **N8** `package.json`, ESLint-Konfiguration, 27 Unit-Tests,
  Konsistenzprüfung (`scripts/validate.mjs`), Build-Skript.
- **N9** Installationsanleitung über eine gepackte `.xpi` statt über
  temporäres Laden von einem externen Volume.

## [1.0.0] — 2026-08-27

- Erste Fassung: Popup an der Nachrichtenanzeige, Moonshot-Chat-Completions-
  Aufruf, Einfügen der Antwort in eine Reply.
