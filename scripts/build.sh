#!/usr/bin/env bash
#
# Baut eine installierbare .xpi aus dem Quellverzeichnis.
#
# N9: Die alte Anleitung fuehrte nur zum temporaeren Laden ueber
# about:debugging - dabei ist das Add-on nach jedem Thunderbird-Neustart weg
# und bei ausgehaengter SSD kaputt. Eine gepackte .xpi loest beides.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

VERSION="$(python3 -c 'import json;print(json.load(open("manifest.json"))["version"])')"
OUT="dist/kimi-ai-mail-assistant-${VERSION}.xpi"

echo "==> Pruefungen"
node scripts/validate.mjs
node --test test/*.test.js

PAYLOAD=(manifest.json background.js lib styles popup options icons _locales README.md PRIVACY.md)

# zip warnt bei fehlenden Dateien nur und laeuft weiter - das hat schon einmal
# eine .xpi ohne PRIVACY.md erzeugt. Deshalb vorher hart pruefen.
for entry in "${PAYLOAD[@]}"; do
  [[ -e "$entry" ]] || { echo "FEHLER: ${entry} fehlt" >&2; exit 1; }
done

echo "==> Paketiere ${OUT}"
mkdir -p dist
rm -f "$OUT"

# Nur die Laufzeitdateien wandern ins Paket - keine Tests, kein dist, kein Git.
zip -q -r -X "$OUT" "${PAYLOAD[@]}" -x '*.DS_Store'

echo "==> Fertig: ${OUT} ($(du -h "$OUT" | cut -f1))"
echo
echo "Installation in Thunderbird:"
echo "  Extras > Add-ons und Themes > Zahnrad > 'Add-on aus Datei installieren...'"
echo "  Datei: ${ROOT}/${OUT}"
