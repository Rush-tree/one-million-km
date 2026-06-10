#!/bin/bash
# Richtet einen lokalen Cron-Job ein, der stündlich git pull macht
# und damit strava-data.json aktuell hält.
# Ausführen: bash sync-setup.sh

REPO_DIR="$(cd "$(dirname "$0")" && pwd)"
LOG_FILE="$REPO_DIR/sync.log"
CRON_CMD="0 * * * * cd \"$REPO_DIR\" && git pull --ff-only origin main >> \"$LOG_FILE\" 2>&1"

echo "Repo-Pfad: $REPO_DIR"
echo "Log:       $LOG_FILE"
echo ""

# Prüfen ob der Job bereits existiert
if crontab -l 2>/dev/null | grep -qF "$REPO_DIR"; then
  echo "Cron-Job existiert bereits — keine Änderung."
  crontab -l 2>/dev/null | grep "$REPO_DIR"
else
  # Bestehende Crontab laden und Zeile anhängen
  (crontab -l 2>/dev/null; echo "$CRON_CMD") | crontab -
  echo "Cron-Job eingerichtet: stündlich git pull in $REPO_DIR"
  echo ""
  echo "Aktueller Crontab:"
  crontab -l
fi
