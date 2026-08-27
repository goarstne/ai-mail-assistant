# Datenschutzhinweis

Stand: 2026-08-27 · Gilt für Version 1.1.0

## Kurzfassung

Diese Erweiterung überträgt beim Erzeugen einer Antwort **Absender, Betreff und
Textinhalt der ausgewählten E-Mail** an einen Server von Moonshot AI. Ohne diese
Übertragung funktioniert die Erweiterung nicht. Sie findet erst statt, nachdem du
in den Einstellungen ausdrücklich zugestimmt hast.

## Welche Daten werden übertragen?

Bei jedem Klick auf „Antwort generieren und einfügen":

| Daten | Herkunft |
|---|---|
| Absenderadresse | Kopfzeile der E-Mail, auf 200 Zeichen gekürzt |
| Betreff | Kopfzeile der E-Mail, auf 300 Zeichen gekürzt |
| Mailtext | `text/plain`, ersatzweise `text/html` in Klartext gewandelt; auf das Zeichenbudget des Modells gekürzt |
| Deine Anweisung | Das Textfeld im Popup, auf 2000 Zeichen gekürzt |
| API-Key | Als `Authorization: Bearer`-Kopfzeile |

**Nicht** übertragen werden: Anhänge, weitere Kopfzeilen (Empfänger, CC, BCC,
Message-ID, Received-Ketten), andere Nachrichten des Postfachs, Kontoeinstellungen.

## An wen?

An `https://api.moonshot.ai` (Standard, gehört zu platform.kimi.ai) oder `https://api.moonshot.cn` — je nachdem, was in
den Einstellungen hinterlegt ist. Andere Ziele sind technisch ausgeschlossen:
`host_permissions` im Manifest erlaubt nur diese beiden Hosts, und die
Basis-URL wird zusätzlich gegen eine Allowlist geprüft (`lib/config.js`).

Was Moonshot AI mit den Daten macht — Speicherdauer, Nutzung zum Training,
Serverstandort — regelt allein deren Datenschutzerklärung. Diese Erweiterung hat
darauf keinen Einfluss und gibt dazu keine Zusage.

## Rechtlicher Hinweis

Die Mails, die du beantwortest, enthalten in aller Regel personenbezogene Daten
**Dritter**, die dir geschrieben haben und die von dieser Übertragung nichts
wissen. Für die Weitergabe an einen Auftragsverarbeiter brauchst du eine
Rechtsgrundlage. Im geschäftlichen Einsatz heißt das üblicherweise: Prüfung durch
die verantwortliche Stelle, Auftragsverarbeitungsvertrag mit dem Anbieter und ein
Eintrag im Verzeichnis von Verarbeitungstätigkeiten. Kläre das, bevor du die
Erweiterung mit echter Korrespondenz benutzt. Dieser Text ist keine Rechtsberatung.

## Was lokal gespeichert wird

In `browser.storage.local` (Thunderbird-Profilverzeichnis, **unverschlüsselt**):

- `apiKey` — dein Moonshot-API-Key
- `baseUrl`, `model` — Einstellungen
- `consentGiven` — ob du zugestimmt hast

Das Profilverzeichnis landet in jedem Profil-Backup und in jeder Zeitmaschine-
Sicherung. Über „Key löschen" in den Einstellungen wird der Key entfernt und die
Zustimmung zurückgezogen. Mit dem Deinstallieren der Erweiterung verschwindet
der Speicher ebenfalls.

Es gibt keine Telemetrie, keine Analytics, keinen Crash-Reporter und keine
Verbindung zu irgendeinem anderen Server als dem oben genannten.

## Zustimmung widerrufen

Einstellungen öffnen → Haken bei der Zustimmung entfernen → Speichern. Oder
„Key löschen", das setzt beides zurück. Danach lehnt das Hintergrundskript jeden
Auftrag mit `errNoConsent` ab, bevor irgendetwas gesendet wird.
