#!/usr/bin/env node
// Push the prototype dashboards in config/dashboards/prototypes/*.yaml to Home Assistant
// as storage-mode (UI) dashboards. No restart and no configuration.yaml change.
//
// Usage:  node scripts/push-dashboards.mjs            # push all prototypes
//         node scripts/push-dashboards.mjs paper      # push one
//         node scripts/push-dashboards.mjs --remove   # delete all prototype dashboards
//
// Needs: HOME_ASSISTANT_TOKEN in .env, the `homeassistant` container running (its
// Python parses the YAML), and Node >= 22 (built-in WebSocket).
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = Object.fromEntries(
  readFileSync(join(root, ".env"), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "")]),
);
const TOKEN = env.HOME_ASSISTANT_TOKEN;
const URL = (env.HA_URL || "http://127.0.0.1:8123").replace(/^http/, "ws") + "/api/websocket";
if (!TOKEN) throw new Error("HOME_ASSISTANT_TOKEN missing in .env");

// Dashboard metadata. url_path must contain a hyphen.
const META = {
  atelier: { url_path: "proto-atelier", title: "Atelier · Studio", icon: "mdi:palette-swatch" },
  deck: { url_path: "proto-deck", title: "Deck · Console", icon: "mdi:tune-vertical" },
  spatial: { url_path: "proto-spatial", title: "Spatial · Canvas", icon: "mdi:floor-plan" },
  aurora: { url_path: "proto-aurora", title: "Aurora · Flow", icon: "mdi:weather-night" },
  bento: { url_path: "proto-bento", title: "Bento · Today", icon: "mdi:view-dashboard-variant" },
  ritual: { url_path: "proto-ritual", title: "Ritual · Day", icon: "mdi:timeline-clock" },
  paper: { url_path: "proto-paper", title: "Proto · Paper", icon: "mdi:tablet" },
  thumb: { url_path: "proto-thumb", title: "Proto · Thumb", icon: "mdi:cellphone" },
  pulse: { url_path: "proto-pulse", title: "Proto · Pulse", icon: "mdi:pulse" },
};

const args = process.argv.slice(2);
const remove = args.includes("--remove");
const only = args.filter((a) => !a.startsWith("--"));
const dir = join(root, "config/dashboards/prototypes");
const names = readdirSync(dir)
  .filter((f) => f.endsWith(".yaml"))
  .map((f) => f.replace(/\.yaml$/, ""))
  .filter((n) => META[n] && (only.length === 0 || only.includes(n)));

const yamlToJson = (name) =>
  JSON.parse(
    execFileSync("docker", [
      "exec", "homeassistant", "python3", "-c",
      "import sys,json,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))",
      `/config/dashboards/prototypes/${name}.yaml`,
    ]).toString(),
  );

const ws = new WebSocket(URL);
let id = 0;
const pending = new Map();
const send = (msg) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, ...msg }));
  });

ws.onmessage = async (ev) => {
  const m = JSON.parse(ev.data);
  if (m.type === "auth_required") return ws.send(JSON.stringify({ type: "auth", access_token: TOKEN }));
  if (m.type === "auth_invalid") throw new Error("auth_invalid: check the token");
  if (m.type === "auth_ok") return run().then(() => ws.close(), (e) => { console.error(e.message || e); process.exitCode = 1; ws.close(); });
  const p = pending.get(m.id);
  if (!p) return;
  pending.delete(m.id);
  m.success ? p.resolve(m.result) : p.reject(new Error(`${m.error?.code}: ${m.error?.message}`));
};

async function run() {
  const existing = await send({ type: "lovelace/dashboards/list" });
  for (const name of names) {
    const meta = META[name];
    const found = existing.find((d) => d.url_path === meta.url_path);
    if (remove) {
      if (found) await send({ type: "lovelace/dashboards/delete", dashboard_id: found.id });
      console.log(`removed  /${meta.url_path}`);
      continue;
    }
    if (!found) {
      await send({ type: "lovelace/dashboards/create", ...meta, mode: "storage", show_in_sidebar: true, require_admin: false });
    }
    await send({ type: "lovelace/config/save", url_path: meta.url_path, config: yamlToJson(name) });
    console.log(`pushed   /${meta.url_path}`);
  }
  if (!remove) {
    await send({ type: "call_service", domain: "frontend", service: "reload_themes", service_data: {} });
    console.log("themes reloaded");
  }
}
