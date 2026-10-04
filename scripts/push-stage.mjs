#!/usr/bin/env node
// Push config/dashboards/home-stage.yaml to the dashboard `home-stage` and register the Stage card.
//
// Usage:  node scripts/build-stage.mjs && node scripts/push-stage.mjs   # bundle, then create/update dashboard + resource
//         node scripts/push-stage.mjs --remove   # delete the dashboard (the resource stays)
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

const DASHBOARD = { url_path: "home-stage", title: "Stage", icon: "mdi:home-lightbulb-outline", mode: "storage", show_in_sidebar: true, require_admin: false };
const RESOURCE = "/local/stage/stage-card.js";
const remove = process.argv.includes("--remove");

const version = () => readFileSync(join(root, "config/www/stage/version.txt"), "utf8").trim();

const loadConfig = () =>
  JSON.parse(
    execFileSync("docker", [
      "exec", "homeassistant", "python3", "-c",
      "import sys,json,yaml;print(json.dumps(yaml.safe_load(open(sys.argv[1]))))",
      "/config/dashboards/home-stage.yaml",
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

async function ensureResource() {
  const url = `${RESOURCE}?v=${version()}`;
  const resources = await send({ type: "lovelace/resources" });
  const found = resources.find((r) => r.url.split("?")[0] === RESOURCE);
  if (found) await send({ type: "lovelace/resources/update", resource_id: found.id, res_type: "module", url });
  else await send({ type: "lovelace/resources/create", res_type: "module", url });
  console.log(`resource  ${url}`);
}

async function run() {
  const existing = await send({ type: "lovelace/dashboards/list" });
  const found = existing.find((d) => d.url_path === DASHBOARD.url_path);
  if (remove) {
    if (found) await send({ type: "lovelace/dashboards/delete", dashboard_id: found.id });
    console.log(`removed   /${DASHBOARD.url_path}`);
    return;
  }
  await ensureResource();
  if (!found) await send({ type: "lovelace/dashboards/create", ...DASHBOARD });
  await send({ type: "lovelace/config/save", url_path: DASHBOARD.url_path, config: loadConfig() });
  console.log(`pushed    /${DASHBOARD.url_path}`);
}
