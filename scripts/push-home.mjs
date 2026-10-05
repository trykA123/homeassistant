#!/usr/bin/env node
// Push config/dashboards/home-harbour.yaml to the live dashboard `home-harbour`.
//
// Usage:  node scripts/push-home.mjs             # push the YAML
//         node scripts/push-home.mjs --rollback  # push the 2026-10-04 JSON backup
//
// Needs: HOME_ASSISTANT_TOKEN in .env, the `homeassistant` container running, Node >= 22.
import { readFileSync } from "node:fs";
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

const URL_PATH = "home-harbour";
const rollback = process.argv.includes("--rollback");

const loadConfig = () =>
  rollback
    ? JSON.parse(readFileSync(join(root, "config/dashboards/home-harbour.backup-2026-10-04.json"), "utf8"))
    : JSON.parse(
        execFileSync("docker", [
          "exec", "homeassistant", "python3", "-c",
          "import sys,json,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))",
          "/config/dashboards/home-harbour.yaml",
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

ws.onmessage = (ev) => {
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
  if (!existing.some((d) => d.url_path === URL_PATH)) throw new Error(`dashboard ${URL_PATH} not found`);
  await send({ type: "lovelace/config/save", url_path: URL_PATH, config: loadConfig() });
  console.log(`${rollback ? "rolled back" : "pushed"}  /${URL_PATH}`);
  await send({ type: "call_service", domain: "frontend", service: "reload_themes", service_data: {} });
  console.log("themes reloaded");
}
