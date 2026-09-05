#!/usr/bin/env bash
# First-run setup: copy example files and create the MQTT user.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env
[ -f config/secrets.yaml ] || cp config/secrets.yaml.example config/secrets.yaml

if [ ! -f mosquitto/config/passwd ]; then
  read -rp "MQTT username [homeassistant]: " user
  user="${user:-homeassistant}"
  read -rsp "MQTT password: " pass; echo
  touch mosquitto/config/passwd
  docker run --rm -v "$PWD/mosquitto/config:/mosquitto/config" \
    eclipse-mosquitto:2 mosquitto_passwd -b /mosquitto/config/passwd "$user" "$pass"
  chmod 600 mosquitto/config/passwd
  echo "Set mqtt_username/mqtt_password in config/secrets.yaml to match."
fi

echo "Done. Run: docker compose up -d"
