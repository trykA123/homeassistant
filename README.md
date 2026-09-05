# Home Assistant

Home Assistant stack for the homelab. Runs as its own compose project and joins the
existing `proxy-network` so the TrueHL reverse proxy can publish it.

## Layout

```
docker-compose.yml     home-assistant + mosquitto
config/                bind-mounted to /config in the container (tracked in git)
  configuration.yaml   main config; secrets live in secrets.yaml
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

Home Assistant listens on `127.0.0.1:8123` for local access and is published by
TrueHL's Caddy at <https://home.erzago.duckdns.org>.

The stack assumes `proxy-network` already exists (created by the TrueHL stack):

```bash
docker network create proxy-network   # only if it does not exist yet
```

## Link to TrueHL

The stack joins TrueHL's external `proxy-network`, so Caddy reaches the container
by name. The vhost lives in `TrueHL/core/Caddyfile`, section 7:

```caddyfile
home.erzago.duckdns.org {
	import security_headers
	reverse_proxy homeassistant:8123
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
3. `docker compose restart homeassistant`, or use Developer Tools → YAML reload
   for automations, scripts and scenes.

## Notes

- Secrets (`.env`, `config/secrets.yaml`, `mosquitto/config/passwd`) are git-ignored.
  Example files with the same names plus `.example` are tracked.
- Runtime state (`.storage/`, the SQLite DB, logs) is git-ignored — it is machine
  state, not configuration. Back it up separately.
- Bluetooth and mDNS discovery need `network_mode: host` instead of the bridge
  network. If you need that, drop the `networks:` and `ports:` keys on the
  `homeassistant` service and set `network_mode: host`.
