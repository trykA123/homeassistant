#!/usr/bin/env bash
# Validate the YAML config without restarting the running instance.
set -euo pipefail
cd "$(dirname "$0")/.."
docker run --rm -v "$PWD/config:/config" \
  ghcr.io/home-assistant/home-assistant:stable \
  python -m homeassistant --config /config --script check_config
