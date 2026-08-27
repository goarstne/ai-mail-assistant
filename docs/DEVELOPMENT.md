# Entwicklung

Technische Dokumentation zum Kimi AI Mail Assistant. Überblick, Installation
und Funktionsumfang stehen im [README](../README.md); der Code-Audit mit der
manuellen Testcheckliste in [AUDIT.md](AUDIT.md).

## Voraussetzungen

- Thunderbird **128 oder neuer** (Manifest V3)
- Ein API-Key von Moonshot AI (`sk-…`)
- Für Entwicklung und Build: Node.js 18+, `zip`, `python3`

## Installation

```bash
npm run build
```

Das Skript prüft Manifest, i18n-Schlüssel und Tests und legt anschließend
`dist/kimi-ai-mail-assistant-<version>.xpi` an.

In Thunderbird: **Extras → Add-ons und Themes → Zahnrad → „Add-on aus Datei
installieren…"** und die `.xpi` auswählen.

Nach der Installation öffnet sich die Einrichtungsseite von selbst — auch beim
Aktualisieren einer vorhandenen Version, solange Key oder Zustimmung fehlen.
Ist bereits alles eingerichtet, bleibt sie weg.

Dort in drei Schritten: Datenschutzhinweis bestätigen, API-Key eintragen,
speichern. Thunderbird fragt beim Speichern einmalig nach der Freigabe für den
API-Zugriff. Vorher bleibt die Oberfläche gesperrt.

<details>
<summary>Alternative: temporär laden (nur für Entwicklung)</summary>

**Extras → Add-ons und Themes → Zahnrad → Add-ons debuggen → „Temporäres Add-on
laden…"** und `manifest.json` auswählen. Nach jedem Thunderbird-Neustart
verschwindet das Add-on wieder, und bei ausgehängtem Datenträger ist es kaputt —
für den Alltag deshalb die `.xpi` benutzen.
</details>

## Benutzung

1. Eine E-Mail anzeigen.
2. In der Nachrichtenanzeige auf **„Mit Kimi AI antworten"** klicken.
3. Anweisung eingeben, z. B. *„Bedanke dich höflich für das Angebot und sage zu."*
4. **„Antwort generieren und einfügen"** — es öffnet sich ein Verfassen-Fenster
   mit der Antwort über dem zitierten Original.

Das Popup darf dabei geschlossen werden: der Vorgang läuft im Hintergrundskript
weiter und öffnet das Verfassen-Fenster auch dann.

## Antwortvorschläge

Beim Öffnen des Popups schlägt das Modell drei bis vier Antwortrichtungen vor —
jede mit einem Titel und einem Satz, der beschreibt, was in dieser Antwort
stehen würde. **Ein Klick erzeugt die Antwort sofort.** Die verwendete Anweisung
landet trotzdem im Eingabefeld: so ist nachvollziehbar, womit erzeugt wurde, und
nach einem Fehlschlag lässt sie sich anpassen und erneut abschicken.

Wer selbst formulieren will, schreibt direkt ins Eingabefeld und benutzt den
Knopf darunter.

Das kostet einen zusätzlichen Modellaufruf pro Öffnen. Wer meist selbst
formuliert, schaltet in den Einstellungen **„Antwortvorschläge automatisch
laden"** ab und fordert sie bei Bedarf über „Neu laden" an.

Schlägt der Aufruf fehl oder liefert das Modell nichts Verwertbares, erscheint
ein Hinweis — die Erweiterung bleibt über das Eingabefeld vollständig benutzbar.

## Im Verfassen-Fenster

Neben der Antwort auf eine angezeigte Mail gibt es die Schaltfläche **„Text mit
Kimi AI schreiben"** in der Werkzeugleiste des Verfassen-Fensters. Sie schreibt
Text in den Entwurf, den du gerade offen hast — für eine neue Mail genauso wie
für eine Antwort, die du schon angefangen hast.

Als Kontext dient bei einer Antwort die ursprüngliche Nachricht (über
`relatedMessageId` sauber gelesen, nicht das Zitat im Entwurf), sonst der
bisherige Entwurfstext. Ist der Entwurf leer, wird das dem Modell gesagt.

## Aufbau

```
manifest.json          MV3-Manifest, Add-on-ID, Berechtigungen
background.js          API-Aufruf, Fehlerbehandlung, Einfügen der Antwort
lib/config.js          Konstanten, Host-Allowlist, URL-Validierung, Settings
lib/mailtext.js        MIME-Auswahl, HTML→Text, Kürzung, Prompt-Aufbau
lib/i18n.js            data-i18n-Attribute im Markup übersetzen
lib/ui.js              Gemeinsame Popup-Bausteine, Vorschlagsdarstellung
styles/base.css        Farben, Abstände, Bedienelemente für alle Ansichten
popup/popup.*          Popup an der Nachrichtenanzeige
popup/compose.*        Popup im Verfassen-Fenster
options/               Einstellungen inkl. Datenschutz-Zustimmung
_locales/{de,en}/      Oberflächentexte
test/                  Unit-Tests (node:test, keine Abhängigkeiten)
scripts/validate.mjs   Manifest-, Datei- und i18n-Konsistenzprüfung
scripts/build.sh       Paketierung zur .xpi
scripts/preview.mjs    Oberflächenvorschau für die Entwicklung
docs/AUDIT.md          Code-Audit und was daraus wurde
```

### Warum die Logik im Hintergrundskript liegt

Popups einer `message_display_action` werden geschlossen, sobald sie den Fokus
verlieren. Läuft der API-Aufruf im Popup, zerstört ein Klick ins Hauptfenster das
Dokument und bricht `fetch` ab — ohne Meldung. Das Popup schickt deshalb nur
einen Auftrag an `background.js` und darf danach sterben.

Die einzige Ausnahme: schlägt der Auftrag fehl, *nachdem* das Popup geschlossen
wurde, sieht niemand die Meldung. Sie steht dann in der Fehlerkonsole
(**Extras → Entwicklerwerkzeuge → Fehlerkonsole**), Präfix
`[Kimi AI Mail Assistant]`.

### Wie der Mailtext in den Prompt kommt

`messages.getFull()` liefert die MIME-Struktur. `lib/mailtext.js` sucht darin
gezielt `text/plain`, ersatzweise `text/html`, und überspringt alles mit
Dateinamen oder `Content-Disposition: attachment`. HTML wird vor dem Parsen um
Zeilenumbrüche an den Blockgrenzen ergänzt, damit `textContent` aus
`<p>Hallo</p><p>Welt</p>` nicht `HalloWelt` macht.

### Wie Prompt Injection abgewehrt wird

Der Mailinhalt ist nicht vertrauenswürdig — jeder kann dir schreiben. Zwei
unabhängige Schranken:

1. **Maskierung.** In Absender, Betreff, Mailtext und Nutzeranweisung werden
   `<` und `>` zu `&lt;`/`&gt;`. Da die Blöcke selbst Winkelklammern benutzen,
   gilt danach: der unvertraute Anteil enthält kein einziges `<` und kann deshalb
   kein Element öffnen oder schließen. Genau das prüft ein Test.
2. **Nonce.** `<email_content id="…">` trägt pro Anfrage eine zufällige Kennung
   aus `crypto.getRandomValues`. Selbst bei einer Lücke in Schranke 1 kennt ein
   Angreifer sie nicht.

Die Regeln im System-Prompt kommen obendrauf — sie sind eine Bitte an das Modell,
kein Mechanismus, und tragen die Absicherung nicht allein.

## Entwicklung

```bash
npm run check
```

Führt `scripts/validate.mjs` (Manifest gültig, referenzierte Dateien vorhanden,
jeder i18n-Schlüssel in allen Sprachen definiert und benutzt) und die Unit-Tests
aus. Einzeln:

```bash
npm test
```

```bash
npm run validate
```

`npm run lint` braucht ein `npm install` vorweg (ESLint ist die einzige
Abhängigkeit; die Erweiterung selbst hat keine).

### Oberfläche ansehen

```bash
npm run preview
```

Erzeugt `.preview/` aus denselben HTML- und CSS-Dateien, die auch das Add-on
benutzt, mit einem gestubbten `browser`-Objekt. Mit einem beliebigen statischen
Server öffnen, z. B. `python3 -m http.server 8731 --directory .preview`.

Zustände, die man im Betrieb kaum zu Gesicht bekommt, lassen sich über die
Adresszeile schalten — `?consent=0`, `?key=0`, `?suggest=slow`, `?suggest=fail`,
`?suggest=off`, `?body=empty`, `?reply=fail`. Die Übersichtsseite verlinkt sie.

Das ersetzt keinen Test in Thunderbird: der Stub bildet die APIs nach, nicht ihr
Verhalten. Für Layout, Farben, Zustände und Tastaturbedienung reicht er.

### Testabdeckung

`test/` deckt die reinen Funktionen aus `lib/` ab: URL-Allowlist, Modell- und
Settings-Normalisierung, Request-Parameter je Modell, Zeichenbudget,
MIME-Part-Auswahl, Blockumbrüche, Whitespace, Kürzung, Prompt-Aufbau, das
Einlesen der Vorschläge und die Injection-Invariante. Jeder Export der
`lib/`-Bausteine ist entweder in der Laufzeit benutzt oder hier geprüft.

Nicht abgedeckt: alles, was Thunderbird-APIs oder ein echtes DOM braucht —
`htmlToText` mit echtem `DOMParser`, `insertReply`, der `fetch`-Pfad. Node hat
keinen `DOMParser`, und die Erweiterung soll abhängigkeitsfrei bleiben. Diese
Pfade sind manuell in Thunderbird zu prüfen; die Liste steht in
[AUDIT.md](AUDIT.md#manuelle-tests).

## Modelle

Die Request-Parameter hängen am Modell und werden in `buildRequestBody()`
(`lib/config.js`) gesetzt: `moonshot-v1` bekommt `temperature` und `max_tokens`,
alle anderen `max_completion_tokens`, `kimi-k3` zusätzlich `reasoning_effort`
(auf `low`, weil der Anbieter-Default `max` für eine E-Mail unnötig teuer ist).
Ein pauschal mitgesendetes `temperature` quittiert `kimi-k3` mit HTTP 400.

Die Erweiterung schreibt keine Modellliste fest. In den Einstellungen holt
**„Verfügbare Modelle laden"** die Liste über `GET {baseUrl}/models` — das sind
genau die Modelle, die dein Account freigeschaltet hat. Das Ergebnis wird
zwischengespeichert.

Bis dahin steht eine Rückfallliste zur Verfügung (`kimi-k3`,
`kimi-k2.7-code-highspeed`, `kimi-k2.6`, `kimi-k2.5`, `moonshot-v1-*`);
Standard ist `kimi-k3`.

Das Kontextfenster wird aus der Modell-ID abgeleitet (`lib/config.js`,
`contextTokensFor`) und bestimmt, wie viel Mailtext übertragen wird. Für
unbekannte IDs gilt ein konservativer Rückfall von 128K: zu früh kürzen kostet
Kontext, zu spät kürzen lässt den Request an einem API-Fehler scheitern.

## Sprache der Antwort

Die Antwort wird immer in der Sprache der E-Mail verfasst — auch wenn die
Anweisung deutsch ist und die Mail englisch. Das ist dreifach abgesichert:
als Regel 1 im System-Prompt, als Erinnerung am Ende des Prompts, und dadurch,
dass die Vorschläge ihre Anweisung selbst in der Sprache der E-Mail formulieren.

Die doppelte Nennung ist kein Versehen: eine einmal genannte Vorgabe in der
Mitte eines langen Prompts wird deutlich unzuverlässiger befolgt als eine, die
am Anfang und am Ende steht.

Im Verfassen-Fenster gilt die Sprache des Entwurfs; ist er leer, die der
Anweisung.

## Grenzen

- Ein Modellaufruf pro Klick, kein Streaming — bei langen Antworten dauert es.
- Das Kontextfenster unbekannter Modelle wird geschätzt, nicht abgefragt.
- Anhänge werden nicht gelesen.
- Verschlüsselte Nachrichten liefern keinen Textteil; das Popup sagt das und
  sperrt den Knopf.
- Sehr lange Mails werden gekürzt. Das Modell wird darauf hingewiesen, der
  Nutzer nicht sichtbar.
- Der API-Key liegt unverschlüsselt in `storage.local`. Thunderbird bietet
  Erweiterungen keinen geschützten Schlüsselspeicher an.

## Lizenz

MIT
