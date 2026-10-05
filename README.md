# Home Assistant

Home Assistant stack for the homelab. Runs as its own compose project. Home Assistant
uses host networking for Bluetooth and mDNS; Mosquitto joins `proxy-network`.

## Layout

```
docker-compose.yml     home-assistant + mosquitto
config/                bind-mounted to /config in the container (tracked in git)
  configuration.yaml   main config; secrets live in secrets.yaml
  custom_components/   pinned Xiaomi Home integration (v0.4.7)
  home-controls.yaml   read-only computer power and movie controls dashboard
  automations/         one automation per file, merged into a list
  packages/            optional per-feature config bundles
mosquitto/config/      broker config; passwd file is git-ignored
scripts/               bootstrap and config-check helpers
```

## First run

```bash
./scripts/bootstrap.sh     # creates .env, config/secrets.yaml, MQTT passwd
docker compose up -d
```

Home Assistant listens on port 8123 on the host. LAN clients use
<http://192.168.1.220:8123>; TrueHL's Caddy publishes
<https://home.erzago.duckdns.org> for remote access.

The stack assumes `proxy-network` already exists (created by the TrueHL stack):

```bash
docker network create proxy-network   # only if it does not exist yet
```

## Link to TrueHL

The Caddy container reaches Home Assistant through the `proxy-network` gateway.
The vhost lives in `TrueHL/core/Caddyfile`:

```caddyfile
home.erzago.duckdns.org {
	import security_headers
	reverse_proxy 172.18.0.1:8123
}
```

It deliberately does **not** `import zenauth`. Home Assistant authenticates its
own users, and the companion app, webhooks and REST clients use long-lived
bearer tokens rather than the SSO cookie. Behind `forward_auth` those calls get
a 302 to an HTML login page instead of JSON — the same failure TrueHL documents
for Bon's `/api/*`.

Apply a Caddyfile change with:

```bash
docker exec caddy caddy validate --config /etc/caddy/Caddyfile
docker exec caddy caddy reload --config /etc/caddy/Caddyfile
```

## Changing config

1. Edit files under `config/`.
2. `./scripts/check-config.sh` — validates YAML in a throwaway container.
3. `docker compose up -d --no-deps --build --force-recreate homeassistant`.

## Xiaomi Home

`config/custom_components/xiaomi_home` is copied from the official
[`XiaoMi/ha_xiaomi_home` v0.4.7 tag](https://github.com/XiaoMi/ha_xiaomi_home/releases/tag/v0.4.7)
(commit `001af5384a66dddb6e45f60bbeee6e536c236af4`). After deploying it, add
**Xiaomi Home** under Settings > Devices & services and complete Xiaomi OAuth in
the browser. Choose the Xiaomi Home region and devices to import. Do not put the
Xiaomi password in `.env` or share it with an operator.

Without a Xiaomi central hub, device control normally uses Xiaomi Cloud. OAuth
tokens are stored by the integration in Home Assistant's private `.storage/` data.

Xiaomi's OAuth callback is fixed to `http://homeassistant.local:8123`. If Xiaomi
finishes authorization but the browser cannot reach that name, keep the complete
`/api/webhook/...` path and query string and replace only that origin with
`http://192.168.1.220:8123` while on home Wi-Fi. This is the workaround in
[Xiaomi's integration wiki](https://github.com/XiaoMi/ha_xiaomi_home/wiki/OAuth-2.0-login-when-Home-Assistant-URL-is-not-homeassistant.local:8123).

## Movie Time

`script.movie_time` sets the Govee strip to a dim warm color immediately,
wakes the Philips TV through the paired Android TV Remote integration, waits
for its screen to come on, and launches Wholphin. If the TV does not wake,
the script restores the strip's previous state and creates a Home Assistant
notification. This wake path does not show a Cast splash screen.
The script is exposed through the existing Home Assistant Lights HomeKit bridge;
create a **Movie Time** scene in Apple Home that turns on the script accessory to
use the exact “Hey Siri, Movie Time” phrase. The computer plug is never part of
the script or HomeKit bridge. Its energy sensors appear in the Home Controls
dashboard without a power toggle.

## Notes

- Secrets (`.env`, `config/secrets.yaml`, `mosquitto/config/passwd`) are git-ignored.
  Example files with the same names plus `.example` are tracked.
- Runtime state (`.storage/`, the SQLite DB, logs) is git-ignored — it is machine
  state, not configuration. Back it up separately.
- The `homeassistant` service uses `network_mode: host` for Bluetooth and mDNS.
  LAN access is limited to the home subnet by UFW and `/etc/nftables.conf`.
