#!/usr/bin/env node
// Bundle stage-card/src/*.js into config/www/stage/stage-card.js (one file, so the ?v= tag busts every module).
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ORDER = ["stage-model.js", "stage-chart.js", "stage-styles.js", "stage-gestures.js", "stage-views.js", "stage-card.js"];

const strip = (code, file) =>
  `// ${file}\n` +
  code
    .replace(/^import [^;]+;\n/gm, "")
    .replace(/^export (const|function|class|async function) /gm, "$1 ");

const body = ORDER.map((f) => strip(readFileSync(join(root, "stage-card/src", f), "utf8"), f)).join("\n");
const bundle = `(() => {\n${body}\n})();\n`;
writeFileSync(join(root, "config/www/stage/stage-card.js"), bundle);
const hash = createHash("sha256").update(bundle).digest("hex").slice(0, 10);
writeFileSync(join(root, "config/www/stage/version.txt"), hash);
console.log(`built     config/www/stage/stage-card.js (${hash})`);
