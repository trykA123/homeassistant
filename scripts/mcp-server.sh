#!/usr/bin/env bash
# Launch Home Assistant MCP server using credentials from .env
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [[ -f "$REPO_ROOT/.env" ]]; then
  # shellcheck disable=SC1091
  source "$REPO_ROOT/.env"
fi

export HA_URL="${HA_URL:-http://127.0.0.1:8123}"
export HA_TOKEN="${HOME_ASSISTANT_TOKEN:-}"

if [[ -z "$HA_TOKEN" ]]; then
  echo "Error: HOME_ASSISTANT_TOKEN is not set in .env" >&2
  exit 1
fi

exec npx -y @jarahkon/hass-mcp-server
