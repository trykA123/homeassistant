(() => {
// stage-model.js
const APP_NAMES = {
  'com.github.damontecres.wholphin': 'Wholphin',
  'org.moonfin.androidtv': 'Moonfin',
  'org.jellyfin.androidtv': 'Jellyfin',
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.leanbitlab.ltvL': 'Home screen',
  'com.leanbitlab.ltvL.a3': 'Home screen',
};

const isOn = (stateObj) => stateObj?.state === 'on';

const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

function lightCapabilities(attributes) {
  const modes = attributes.supported_color_modes ?? [];
  return {
    color: modes.some((m) => COLOR_MODES.includes(m)),
    temperature: modes.includes('color_temp'),
    dimmable: modes.some((m) => m !== 'onoff'),
    minKelvin: attributes.min_color_temp_kelvin ?? 2200,
    maxKelvin: attributes.max_color_temp_kelvin ?? 6500,
  };
}

const kelvinToPercent = (k, min, max) => Math.round(((k - min) / (max - min)) * 100);
const percentToKelvin = (p, min, max) => Math.round((min + (p / 100) * (max - min)) / 50) * 50;

function lightView(stateObj, pending) {
  const id = stateObj.entity_id;
  const brightness = stateObj.attributes.brightness;
  const level = pending ?? (brightness ? Math.max(1, Math.round((brightness / 255) * 100)) : 0);
  const on = pending != null ? pending > 0 : isOn(stateObj);
  return {
    id,
    name: stateObj.attributes.friendly_name ?? id,
    on,
    level: on ? level : 0,
    hasLevel: brightness != null || pending != null,
    lastLevel: level || 50,
    unavailable: stateObj.state === 'unavailable',
    rgb: stateObj.attributes.rgb_color ?? null,
    kelvin: stateObj.attributes.color_temp_kelvin ?? null,
    caps: lightCapabilities(stateObj.attributes),
  };
}

function roomLight(lights) {
  if (lights.length === 0) return { lux: 0.9, warmth: 0 };
  const total = lights.reduce((sum, light) => sum + light.level, 0) / (lights.length * 100);
  const lit = Math.min(1, total * 2.2);
  return { lux: +(0.58 + lit * 0.5).toFixed(3), warmth: +Math.min(1, total * 2.5).toFixed(3) };
}

function roomStatus({ lights, tvOn, fan }) {
  const lit = lights.filter((light) => light.on).length;
  const parts = [lit ? `${lit} of ${lights.length} lights on` : lights.length ? 'Lights off' : ''];
  if (tvOn) parts.push('TV playing');
  if (fan?.on) parts.push(`fan ${fan.level}%`);
  return parts.filter(Boolean).join(' · ') || 'All quiet';
}

const appName = (appId) => APP_NAMES[appId] ?? '';

function formatNumber(value, digits = 1) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.0+$/, '') : '—';
}

function serviceForScene(entityId) {
  const domain = entityId.split('.')[0];
  return domain === 'script' ? ['script', 'turn_on'] : ['scene', 'turn_on'];
}

function seriesFromHistory(points, now = Date.now(), hours = 24) {
  const start = now - hours * 3600_000;
  return points
    .map((p) => ({ t: p.lu ? p.lu * 1000 : Date.parse(p.last_updated ?? p.last_changed), v: Number.parseFloat(p.s ?? p.state) }))
    .filter((p) => Number.isFinite(p.v) && p.t >= start)
    .sort((a, b) => a.t - b.t);
}

function bucketSeries(series, { now = Date.now(), hours = 24, buckets = 96 } = {}) {
  const start = now - hours * 3600_000;
  const step = (hours * 3600_000) / buckets;
  const out = [];
  let i = 0;
  let last = series.length && series[0].t <= start ? series[0].v : null;
  for (let b = 0; b < buckets; b++) {
    const end = start + (b + 1) * step;
    let sum = 0;
    let count = 0;
    while (i < series.length && series[i].t < end) {
      sum += series[i].v;
      count += 1;
      last = series[i].v;
      i += 1;
    }
    out.push({ t: end, v: count ? sum / count : last });
  }
  return out;
}

const SWATCHES = [
  { name: 'Candle', kelvin: 2200 },
  { name: 'Warm', kelvin: 2700 },
  { name: 'Neutral', kelvin: 4000 },
  { name: 'Daylight', kelvin: 6000 },
  { name: 'Amber', rgb: [255, 150, 40] },
  { name: 'Coral', rgb: [255, 90, 80] },
  { name: 'Rose', rgb: [255, 70, 140] },
  { name: 'Violet', rgb: [140, 80, 255] },
  { name: 'Blue', rgb: [50, 110, 255] },
  { name: 'Cyan', rgb: [30, 200, 255] },
  { name: 'Mint', rgb: [40, 230, 160] },
  { name: 'Green', rgb: [90, 220, 60] },
];

function swatchCss(swatch) {
  if (swatch.rgb) return `rgb(${swatch.rgb.join(' ')})`;
  const t = (swatch.kelvin - 2200) / 3800;
  return `oklch(${88 + t * 8}% ${0.12 - t * 0.11} ${70 + t * 160})`;
}

function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function swatchServiceData(swatch, light) {
  if (swatch.rgb) return light.caps.color ? { rgb_color: swatch.rgb } : null;
  if (light.caps.temperature) return { color_temp_kelvin: Math.min(light.caps.maxKelvin, Math.max(light.caps.minKelvin, swatch.kelvin)) };
  return null;
}

// stage-morph.js
const sameKind = (a, b) =>
  a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.getAttribute('data-key') === b.getAttribute('data-key'));

function patchAttributes(from, to) {
  for (const { name } of [...from.attributes]) if (!to.hasAttribute(name)) from.removeAttribute(name);
  for (const { name, value } of [...to.attributes]) if (from.getAttribute(name) !== value) from.setAttribute(name, value);
}

function patchChildren(parent, next) {
  const current = [...parent.childNodes];
  const wanted = [...next.childNodes];
  wanted.forEach((node, i) => {
    const old = current[i];
    if (!old) { parent.appendChild(node); return; }
    if (!sameKind(old, node)) { parent.replaceChild(node, old); return; }
    if (old.nodeType !== 1) { if (old.nodeValue !== node.nodeValue) old.nodeValue = node.nodeValue; return; }
    patchAttributes(old, node);
    if (!old.hasAttribute('data-morph-skip')) patchChildren(old, node);
  });
  for (let i = current.length - 1; i >= wanted.length; i--) current[i].remove();
}

function morph(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  patchChildren(target, template.content);
}

// stage-chart.js
const H = 150;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

const niceMax = (v) => {
  if (!(v > 0)) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10, 20].map((m) => m * mag).find((m) => m >= v);
};
const hourLabel = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

function chartGeometry(points, W = 320) {
  const valid = points.filter((p) => p.v != null);
  if (valid.length < 2) return null;
  const t0 = points[0].t;
  const t1 = points[points.length - 1].t;
  const max = niceMax(Math.max(...valid.map((p) => p.v)));
  const x = (t) => PAD.left + ((t - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v) => PAD.top + (1 - v / max) * (H - PAD.top - PAD.bottom);
  const xy = valid.map((p) => [x(p.t), y(p.v)]);
  const line = xy.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join('');
  const base = y(0);
  const area = `${line}L${xy[xy.length - 1][0].toFixed(1)} ${base}L${xy[0][0].toFixed(1)} ${base}Z`;
  const ticks = [0, max / 2, max].map((v) => ({ v, y: y(v) }));
  const hours = [0.25, 0.5, 0.75].map((f) => t0 + f * (t1 - t0)).map((t) => ({ t, x: x(t), label: hourLabel(t) }));
  const lastPoint = { x: xy[xy.length - 1][0], y: xy[xy.length - 1][1] };
  return { line, area, ticks, hours, lastPoint, x, y, valid, t0, t1, W };
}

function chartSvg(points, { unit = 'W', width = 320 } = {}) {
  const g = chartGeometry(points, width);
  const W = width;
  if (!g) return `<div class="chart-empty">Not enough history yet</div>`;
  const grid = g.ticks.map((t) => `<line x1="${PAD.left}" x2="${W - PAD.right}" y1="${t.y}" y2="${t.y}" class="grid"/>
    <text x="${PAD.left - 6}" y="${t.y + 3.5}" class="tick" text-anchor="end">${Math.round(t.v)}</text>`).join('');
  const xs = g.hours.map((h) => `<text x="${h.x}" y="${H - 6}" class="tick" text-anchor="middle">${h.label}</text>`).join('');
  return `<svg class="chart" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Desk power over the last 24 hours, in ${unit}">
    <defs><linearGradient id="stage-area" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="var(--chart)" stop-opacity=".32"/><stop offset="1" stop-color="var(--chart)" stop-opacity="0"/></linearGradient></defs>
    ${grid}${xs}
    <path d="${g.area}" fill="url(#stage-area)"/>
    <path d="${g.line}" class="series"/>
    <circle cx="${g.lastPoint.x}" cy="${g.lastPoint.y}" r="4.5" class="now"/>
    <g class="cross" style="display:none"><line class="cross-line" y1="${PAD.top}" y2="${H - PAD.bottom}"/><circle r="4.5" class="cross-dot"/></g>
    <rect class="hit" x="${PAD.left}" y="0" width="${W - PAD.left - PAD.right}" height="${H}" fill="transparent"/>
  </svg><div class="chart-tip" hidden></div>`;
}

function attachChartHover(root, points, { unit = 'W', width = 320 } = {}) {
  const svg = root.querySelector('svg.chart');
  const g = chartGeometry(points, width);
  const W = width;
  if (!svg || !g) return;
  const cross = svg.querySelector('.cross');
  const tip = root.querySelector('.chart-tip');
  const show = (clientX) => {
    const box = svg.getBoundingClientRect();
    const vx = ((clientX - box.left) / box.width) * W;
    const t = g.t0 + ((vx - PAD.left) / (W - PAD.left - PAD.right)) * (g.t1 - g.t0);
    const p = g.valid.reduce((a, b) => (Math.abs(b.t - t) < Math.abs(a.t - t) ? b : a));
    const px = g.x(p.t);
    const py = g.y(p.v);
    cross.style.display = '';
    cross.querySelector('.cross-line').setAttribute('x1', px);
    cross.querySelector('.cross-line').setAttribute('x2', px);
    cross.querySelector('.cross-dot').setAttribute('cx', px);
    cross.querySelector('.cross-dot').setAttribute('cy', py);
    tip.hidden = false;
    tip.innerHTML = `<b>${p.v.toFixed(1)} ${unit}</b> ${hourLabel(p.t)}`;
    tip.style.left = `${(px / W) * 100}%`;
  };
  const hide = () => { cross.style.display = 'none'; tip.hidden = true; };
  const hit = svg.querySelector('.hit');
  hit.addEventListener('pointermove', (e) => show(e.clientX));
  hit.addEventListener('pointerdown', (e) => show(e.clientX));
  hit.addEventListener('pointerleave', hide);
  hit.addEventListener('pointercancel', hide);
}

// stage-styles.js
const styles = `
:host {
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --r-s: 14px; --r-m: 22px; --r-l: 30px; --r-full: 999px;
  --fs-11: .6875rem; --fs-12: .75rem; --fs-13: .8125rem; --fs-14: .875rem; --fs-16: 1rem; --fs-20: 1.25rem; --fs-52: 3.25rem;
  --ease-out: cubic-bezier(.23, 1, .32, 1);
  --ease-io: cubic-bezier(.65, 0, .35, 1);
  --dur-fast: 160ms; --dur-ui: 260ms; --dur-light: 900ms;
  --z-chrome: 10; --z-sheet: 30;
  --ink: oklch(98% .004 80);
  --ink-2: oklch(98% .004 80 / .8);
  --ink-3: oklch(98% .004 80 / .62);
  --glass: oklch(22% .01 60 / .42);
  --glass-hi: oklch(100% 0 0 / .14);
  --glass-line: oklch(100% 0 0 / .16);
  --deck: oklch(13% .008 60 / .74);
  --deck-card: oklch(100% 0 0 / .06);
  --warm: oklch(88% .085 78);
  --warm-ink: oklch(24% .035 60);
  --chart: oklch(86% .1 75);
  --ok: oklch(80% .14 150);
  --sheet-bg: oklch(16% .008 60 / .9);
  display: block;
  font-family: "Inter Variable", Inter, system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, [role="slider"]:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
ha-icon { --mdc-icon-size: 22px; display: inline-flex; }
.num { font-variant-numeric: tabular-nums; }
.stage { position: relative; height: var(--stage-h, 100dvh); overflow: hidden; background: #000; isolation: isolate; overscroll-behavior: none; }

.chrome { position: absolute; inset: 0 0 auto; z-index: var(--z-chrome); padding: var(--space-3) var(--space-5) var(--space-3); background: linear-gradient(180deg, oklch(0% 0 0 / .5), transparent); }
.chrome::before { content: ""; position: absolute; inset: 0; z-index: -1; background: oklch(12% .008 60 / .7); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); border-bottom: 1px solid var(--glass-line); opacity: 0; transition: opacity var(--dur-ui) var(--ease-out); }
.chrome.solid::before { opacity: 1; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.mark { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-13); font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
.menu { width: 32px; height: 32px; margin-left: -6px; border-radius: var(--r-full); display: grid; place-items: center; }
.who { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-13); color: var(--ink-2); white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: var(--r-full); background: var(--ok); box-shadow: 0 0 0 3px oklch(80% .14 150 / .25); }
.dot.away { background: var(--ink-3); box-shadow: none; }
.tabs { position: relative; display: flex; gap: var(--space-5); margin-top: var(--space-4); }
.tab { padding-block: var(--space-2); font-size: var(--fs-14); font-weight: 500; color: var(--ink-3); transition: color var(--dur-ui) var(--ease-out); white-space: nowrap; }
.tab[aria-current] { color: var(--ink); }
.tab sup { font-size: var(--fs-11); margin-left: 2px; color: var(--warm); }
.ink-bar { position: absolute; left: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--ink); transition: transform var(--dur-ui) var(--ease-out), width var(--dur-ui) var(--ease-out); }

.pager { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
.pager::-webkit-scrollbar, .page::-webkit-scrollbar, .strip::-webkit-scrollbar, .scenes::-webkit-scrollbar { display: none; }
.page { position: relative; flex: 0 0 100%; height: 100%; overflow-y: auto; overflow-x: hidden; scroll-snap-align: start; scroll-snap-stop: always; scrollbar-width: none; container-type: size; }
.photo { position: sticky; top: 0; height: 100cqh; margin-bottom: -100cqh; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.04); filter: brightness(var(--lux, 1)) saturate(calc(.7 + var(--lux, 1) * .3)); transition: filter var(--dur-light) var(--ease-io); }
.photo::before { content: ""; position: absolute; inset: 0; z-index: 1; background: radial-gradient(70% 45% at 50% 42%, oklch(80% .12 70 / calc(var(--warmth, 0) * .32)), transparent 70%); mix-blend-mode: soft-light; }
.photo::after { content: ""; position: absolute; inset: 0; z-index: 2; background: linear-gradient(180deg, oklch(0% 0 0 / .45) 0%, transparent 22%, transparent 38%, oklch(0% 0 0 / .35) 55%, oklch(8% .006 60 / .9) 80%, oklch(8% .006 60 / .96) 100%); }
.content { position: relative; z-index: 3; width: min(100%, 560px); padding: 0 var(--space-5); }
.hero { padding-top: 124px; }
.eyebrow { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 var(--space-3); border-radius: var(--r-full); background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); font-size: var(--fs-12); font-weight: 500; }
.chip ha-icon { --mdc-icon-size: 15px; }
.chip.warn { color: var(--warm); }
h1 { margin: var(--space-3) 0 var(--space-1); font-size: var(--fs-52); line-height: .98; font-weight: 600; letter-spacing: -.035em; }
.status { font-size: var(--fs-16); color: var(--ink-2); }

.strip { display: flex; gap: var(--space-2); margin: var(--space-5) calc(var(--space-5) * -1) 0; padding: 0 var(--space-5); overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: var(--space-5); scrollbar-width: none; }
.tile { position: relative; flex: 0 0 148px; height: 140px; scroll-snap-align: start; padding: var(--space-3) var(--space-3) var(--space-4); border-radius: var(--r-m); display: flex; flex-direction: column; justify-content: space-between; overflow: hidden;
  background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3);
  transition: background var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out), transform var(--dur-fast) var(--ease-out); user-select: none; -webkit-user-select: none; contain: layout paint; }
.tile:has(.tile-open:active) { transform: scale(.97); }
.tile[data-on="true"] { background: oklch(93% .045 82 / .92); color: var(--warm-ink); border-color: transparent; }
.tile[data-unavailable] { opacity: .5; }
.tile-open { position: absolute; inset: 0; border-radius: inherit; z-index: 0; }
.tile .top, .tile .name, .tile .lvl { position: relative; z-index: 1; pointer-events: none; }
.tile .top { display: flex; justify-content: space-between; align-items: flex-start; }
.tile .ic { pointer-events: auto; width: 52px; height: 52px; margin: -4px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); --mdc-icon-size: 28px; transition: transform var(--dur-fast) var(--ease-out), background var(--dur-ui) var(--ease-out); }
.tile .ic:active { transform: scale(.9); }
.tile[data-on="true"] .ic { background: var(--tint, oklch(80% .12 75)); color: oklch(18% .02 60); box-shadow: 0 0 18px var(--tint, transparent); }
.tile .val { font-size: var(--fs-13); font-weight: 600; }
.tile b { display: block; font-size: var(--fs-14); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .lvl { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-2); height: 3px; border-radius: 3px; background: oklch(0% 0 0 / .12); overflow: hidden; }
.tile .lvl i { display: block; height: 100%; width: calc(var(--v) * 1%); background: currentColor; opacity: .55; border-radius: 3px; transition: width var(--dur-ui) var(--ease-out); }
.tile .mark { position: absolute; right: -14px; bottom: -18px; z-index: 0; pointer-events: none; --mdc-icon-size: 104px; color: currentColor; opacity: .16; transition: opacity var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out); }
.tile[data-on="true"] .mark { color: var(--tint, oklch(70% .13 70)); opacity: .32; }
.strip-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); margin-top: var(--space-3); }
.strip-foot .hint { margin: 0; }
.hint { font-size: var(--fs-12); color: var(--ink-3); }

.deck { position: relative; margin: var(--space-6) calc(var(--space-5) * -1) 0; padding: var(--space-6) var(--space-5) calc(env(safe-area-inset-bottom) + 96px); background: linear-gradient(180deg, transparent, var(--deck) 72px); backdrop-filter: blur(18px) saturate(1.4); -webkit-backdrop-filter: blur(18px) saturate(1.4); -webkit-mask-image: linear-gradient(180deg, transparent, #000 72px); mask-image: linear-gradient(180deg, transparent, #000 72px); min-height: 60cqh; }

.sec { padding-block: var(--space-5); }
.sec + .sec { border-top: 1px solid oklch(100% 0 0 / .08); }
.sec h2 { margin: 0 0 var(--space-3); font-size: var(--fs-12); letter-spacing: .16em; text-transform: uppercase; font-weight: 600; color: var(--ink-3); }
.scenes { display: flex; gap: var(--space-2); margin-inline: calc(var(--space-5) * -1); padding-inline: var(--space-5); overflow-x: auto; scrollbar-width: none; }
.select { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2) var(--space-4) var(--space-2) var(--space-2); border-radius: var(--r-m); border: 1px solid var(--glass-line); background: var(--deck-card); text-align: left; }
.select i, .menu-item i { width: 40px; height: 40px; flex: none; border-radius: var(--r-full); background: var(--sw); }
.select i, .menu-item i { display: grid; place-items: center; color: oklch(99% 0 0); --mdc-icon-size: 22px; filter: drop-shadow(0 1px 2px oklch(0% 0 0 / .35)); }
.menu-item i { --mdc-icon-size: 18px; }
.select b { display: block; font-size: var(--fs-16); font-weight: 600; }
.select .muted { display: block; }
.menu-list { margin-top: var(--space-2); padding: var(--space-1); border-radius: var(--r-m); border: 1px solid var(--glass-line); background: oklch(18% .008 60 / .9); animation: drop var(--dur-ui) var(--ease-out) both; transform-origin: top center; }
.menu-item { width: 100%; display: flex; align-items: center; gap: var(--space-3); padding: var(--space-2); border-radius: var(--r-s); font-size: var(--fs-14); font-weight: 500; text-align: left; transition: background var(--dur-fast) var(--ease-out); }
.menu-item i { width: 32px; height: 32px; }
.menu-item:active, .menu-item[aria-selected="true"] { background: oklch(100% 0 0 / .08); }
@keyframes drop { from { opacity: 0; transform: translateY(-4px) scale(.98); } }
.scene { flex: none; display: flex; align-items: center; gap: var(--space-2); height: 44px; padding: 0 var(--space-4) 0 6px; border-radius: var(--r-full); border: 1px solid var(--glass-line); background: var(--deck-card); font-size: var(--fs-14); font-weight: 500; transition: background var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out); }
.scene i { width: 32px; height: 32px; border-radius: var(--r-full); background: var(--sw); }
.scene[aria-pressed="true"] { background: var(--ink); color: oklch(15% .01 60); }
.card { display: block; width: 100%; text-align: left; border-radius: var(--r-m); padding: var(--space-4); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .08); }
.card + .card { margin-top: var(--space-2); }
.row { display: flex; align-items: center; gap: var(--space-3); }
.grow { flex: 1; min-width: 0; }
.muted { color: var(--ink-3); font-size: var(--fs-13); }
.pill-btn { flex: none; height: 36px; padding: 0 var(--space-4); border-radius: var(--r-full); background: var(--glass-hi); border: 1px solid var(--glass-line); font-size: var(--fs-13); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.pill-btn.solid { background: var(--ink); color: oklch(15% .01 60); border-color: transparent; }
.pill-btn ha-icon { --mdc-icon-size: 18px; }
.np { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border-radius: var(--r-m); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .08); }
.np-badge { width: 48px; height: 64px; flex: none; border-radius: var(--r-s); overflow: hidden; display: grid; place-items: center; background: linear-gradient(135deg, oklch(42% .08 60), oklch(26% .05 300)); color: var(--warm); }
.np-badge img { width: 100%; height: 100%; object-fit: cover; }
.np b { display: block; font-size: var(--fs-16); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.np .muted { display: block; }
.round { width: 44px; height: 44px; flex: none; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); border: 1px solid var(--glass-line); transition: transform var(--dur-fast) var(--ease-out); }
.round:active { transform: scale(.92); }
.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.stat { border-radius: var(--r-s); padding: var(--space-3); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .06); }
.stat b { display: block; font-size: var(--fs-20); font-weight: 600; letter-spacing: -.01em; }
.stat span { font-size: var(--fs-12); color: var(--ink-3); }
.chart-card { position: relative; margin-block: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-2); border-radius: var(--r-m); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .06); }
.chart-head { display: flex; justify-content: space-between; align-items: baseline; padding-inline: var(--space-1); font-size: var(--fs-13); color: var(--ink-2); }
.chart-head b { color: var(--ink); font-weight: 600; }
.chart-slot { min-height: 150px; }
.chart { display: block; width: 100%; height: auto; margin-top: var(--space-2); touch-action: pan-y; }
.chart .grid { stroke: oklch(100% 0 0 / .1); stroke-width: 1; }
.chart .tick { fill: var(--ink-3); font-size: 11px; font-family: inherit; font-variant-numeric: tabular-nums; }
.chart .series { fill: none; stroke: var(--chart); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .now, .chart .cross-dot { fill: var(--chart); stroke: oklch(13% .008 60); stroke-width: 2; }
.chart .cross-line { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 3 3; }
.chart-slot { position: relative; }
.chart-tip { position: absolute; top: 0; transform: translateX(-50%); padding: 4px 8px; border-radius: 8px; background: oklch(20% .01 60 / .95); border: 1px solid var(--glass-line); font-size: var(--fs-12); white-space: nowrap; pointer-events: none; color: var(--ink-2); }
.chart-tip b { color: var(--ink); }
.chart-empty { padding: var(--space-5); text-align: center; color: var(--ink-3); font-size: var(--fs-13); }

.scrim { position: absolute; inset: 0; z-index: var(--z-sheet); background: oklch(0% 0 0 / .4); animation: fade var(--dur-ui) var(--ease-out) both; }
.sheet { position: absolute; left: var(--space-2); right: var(--space-2); bottom: calc(env(safe-area-inset-bottom) + var(--space-2)); z-index: calc(var(--z-sheet) + 1); max-width: 520px; margin-inline: auto; max-height: 82%; overflow-y: auto; border-radius: var(--r-l); padding: var(--space-3) var(--space-5) var(--space-5); background: var(--sheet-bg); border: 1px solid var(--glass-line); backdrop-filter: blur(30px) saturate(1.4); -webkit-backdrop-filter: blur(30px) saturate(1.4); animation: up var(--dur-ui) var(--ease-out) both; }
.grip { width: 36px; height: 4px; border-radius: 4px; background: var(--ink-3); margin: 0 auto var(--space-4); }
.sheet header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.sheet h3 { margin: 0; font-size: var(--fs-20); font-weight: 600; }
.x { width: 36px; height: 36px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); }
.fader { position: relative; height: 64px; border-radius: var(--r-m); background: oklch(100% 0 0 / .08); overflow: hidden; touch-action: none; margin-bottom: var(--space-2); cursor: ew-resize; }
.fader .f { position: absolute; inset: 0 auto 0 0; width: calc(var(--v) * 1%); background: linear-gradient(90deg, oklch(80% .1 75 / .8), oklch(92% .07 85)); transition: width var(--dur-fast) var(--ease-out), opacity var(--dur-ui) var(--ease-out); }
.fader.drag .f { transition: none; }
.fader.off .f { opacity: .15; }
.fader .l { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding-inline: var(--space-4); font-weight: 600; font-size: var(--fs-14); }
.fader:not(.off) .l { color: var(--warm-ink); }
.remote { display: grid; grid-template-columns: repeat(3, 64px); justify-content: center; gap: var(--space-3) var(--space-6); margin-block: var(--space-4); }
.rk { width: 64px; height: 64px; border-radius: var(--r-full); display: grid; place-items: center; background: oklch(100% 0 0 / .09); transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out); }
.rk:active { transform: scale(.92); background: oklch(100% 0 0 / .18); }
.rk.ok { background: var(--warm); color: var(--warm-ink); font-weight: 700; }
.apps { display: flex; flex-wrap: wrap; gap: var(--space-2); }

.sheet h4 { margin: var(--space-5) 0 var(--space-3); font-size: var(--fs-12); letter-spacing: .16em; text-transform: uppercase; font-weight: 600; color: var(--ink-3); }
.sheet .row { display: flex; align-items: center; gap: var(--space-2); }
.row.gap { gap: var(--space-2); margin-top: var(--space-2); }
.fader.kelvin { background: linear-gradient(90deg, oklch(80% .13 65), oklch(95% .02 90) 55%, oklch(85% .06 235)); }
.fader.kelvin .f { background: none; border-right: 3px solid oklch(15% .01 60); border-radius: 0; }
.fader.kelvin .l { color: oklch(18% .02 60); }
.swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(64px, 1fr)); gap: var(--space-2); }
.swatch { position: relative; display: grid; justify-items: center; gap: 6px; padding: var(--space-2) 0; border-radius: var(--r-s); font-size: var(--fs-12); color: var(--ink-2); cursor: pointer; transition: transform var(--dur-fast) var(--ease-out); }
.swatch:active { transform: scale(.94); }
.swatch i { width: 40px; height: 40px; border-radius: var(--r-full); background: var(--sw); box-shadow: inset 0 0 0 1px oklch(100% 0 0 / .2); display: grid; place-items: center; }
.swatch.custom i { background: conic-gradient(oklch(70% .2 0), oklch(70% .2 120), oklch(70% .2 240), oklch(70% .2 360)); color: oklch(98% 0 0); }
.swatch input { position: absolute; inset: 0; opacity: 0; width: 100%; height: 100%; cursor: pointer; }
.chips { display: flex; flex-wrap: wrap; gap: var(--space-2); margin-block: var(--space-3); }
.chip-btn { display: inline-flex; align-items: center; gap: 6px; height: 36px; padding: 0 var(--space-3); border-radius: var(--r-full); border: 1px solid var(--glass-line); background: var(--deck-card); font-size: var(--fs-13); font-weight: 500; }
.chip-btn ha-icon { --mdc-icon-size: 18px; }
.chip-btn[aria-pressed="true"] { background: var(--ink); color: oklch(15% .01 60); border-color: transparent; }
.switch { width: 52px; height: 32px; border-radius: var(--r-full); background: oklch(100% 0 0 / .18); position: relative; flex: none; transition: background var(--dur-fast) var(--ease-out); }
.switch::after { content: ""; position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: var(--r-full); background: oklch(98% 0 0); transition: transform var(--dur-ui) var(--ease-out); }
.switch[aria-checked="true"] { background: var(--warm); }
.switch[aria-checked="true"]::after { transform: translateX(20px); background: var(--warm-ink); }
.link { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-5); font-size: var(--fs-14); color: var(--warm); font-weight: 500; }
@keyframes up { from { transform: translateY(105%); } }
@keyframes fade { from { opacity: 0; } }
@media (min-width: 900px) {
  .content { margin-left: clamp(24px, 6vw, 96px); width: min(100%, 720px); }
  .strip { flex-wrap: wrap; overflow-x: visible; margin-inline: 0; padding-inline: 0; }
  .hero { padding-top: max(150px, 22cqh); }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

// stage-gestures.js
const LIVE_EVERY_MS = 250;
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

function attachFaders(root, { onPreview, onSend }) {
  let drag = null;

  const valueAt = (el, clientX) => {
    const box = el.getBoundingClientRect();
    return clamp(((clientX - box.left) / box.width) * 100);
  };

  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-slider]');
    if (!el) return;
    drag = { el, key: el.dataset.slider, x: e.clientX, moved: false, sentAt: 0, value: null };
    el.setPointerCapture(e.pointerId);
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 4) return;
    drag.moved = true;
    drag.el.classList.add('drag');
    drag.value = valueAt(drag.el, e.clientX);
    onPreview(drag.el, drag.key, drag.value);
    const now = performance.now();
    if (now - drag.sentAt > LIVE_EVERY_MS) { drag.sentAt = now; onSend(drag.key, drag.value, false); }
  });

  const finish = (cancelled) => {
    if (!drag) return;
    const { el, key, moved, x } = drag;
    const value = drag.value ?? valueAt(el, x);
    drag = null;
    el.classList.remove('drag');
    if (cancelled) return;
    if (!moved) onPreview(el, key, value);
    onSend(key, value, true);
  };
  root.addEventListener('pointerup', () => finish(false));
  root.addEventListener('pointercancel', () => finish(true));

  return { isActive: () => drag != null };
}

// stage-views.js

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const icon = (name) => `<ha-icon icon="${esc(name)}"></ha-icon>`;
const st = (ctx, id) => (id ? ctx.hass.states[id] : undefined);
const num = (ctx, id, digits) => formatNumber(st(ctx, id)?.state, digits);


function roomLights(ctx, room) {
  return (room.lights ?? [])
    .filter((l) => st(ctx, l.entity))
    .map((l) => ({ ...lightView(st(ctx, l.entity), ctx.pending[l.entity]), icon: l.icon ?? 'mdi:lightbulb', name: l.name ?? st(ctx, l.entity).attributes.friendly_name }));
}

function fanView(ctx, room) {
  const s = st(ctx, room.fan);
  if (!s) return null;
  return { on: isOn(s), level: s.attributes.percentage ?? 0 };
}

function tvView(ctx) {
  const tv = ctx.config.tv ?? {};
  const s = st(ctx, tv.entity);
  const app = st(ctx, tv.app_source)?.attributes.app_id;
  const np = st(ctx, tv.now_playing);
  const active = np && ['playing', 'paused'].includes(np.state);
  const a = active ? np.attributes : {};
  const episode = a.media_series_title ? [a.media_season != null && `S${a.media_season}`, a.media_episode != null && `E${a.media_episode}`].filter(Boolean).join('') : '';
  return {
    on: isOn(s) || !!active,
    app: active ? 'Wholphin' : appName(app),
    title: active ? (a.media_series_title || a.media_title) : s?.attributes.media_title,
    subtitle: active ? [episode, a.media_series_title ? a.media_title : '', np.state === 'paused' ? 'Paused' : ''].filter(Boolean).join(' · ') : '',
    picture: active ? a.entity_picture : null,
  };
}

const tileTint = (l) => (l.on && l.rgb ? `--tint: rgb(${l.rgb.join(' ')})` : '');

const tile = (l) => `<div class="tile" data-key="${l.id}" data-on="${l.on}" ${l.unavailable ? 'data-unavailable' : ''} style="--v:${l.level};${tileTint(l)}">
  <button class="tile-open" data-act="sheet" data-arg="light:${l.id}" aria-label="${esc(l.name)} settings"></button>
  <span class="top"><button class="ic" data-act="toggle-light" data-arg="${l.id}" aria-pressed="${l.on}" aria-label="Turn ${esc(l.name)} ${l.on ? 'off' : 'on'}">${icon(l.icon)}</button><span class="val num">${l.unavailable ? 'Offline' : !l.on ? 'Off' : l.hasLevel ? `${l.level}%` : 'On'}</span></span>
  <span class="mark" aria-hidden="true">${icon(l.icon)}</span><span class="name"><b>${esc(l.name)}</b></span><span class="lvl"><i></i></span></div>`;

const deviceTile = ({ act, arg = '', ic, name, value, on }) => `<div class="tile" data-key="${act}-${arg}" data-on="${on}" style="--v:0">
  <button class="tile-open" data-act="${act}" data-arg="${arg}" aria-label="${esc(name)}"></button>
  <span class="top"><span class="ic">${icon(ic)}</span><span class="val">${esc(value)}</span></span><span class="mark" aria-hidden="true">${icon(ic)}</span><span class="name"><b>${esc(name)}</b></span></div>`;

function chips(ctx, room) {
  const out = [];
  const w = st(ctx, ctx.config.weather);
  if (room.weather && w) out.push(`<span class="chip">${icon('mdi:weather-sunny')}<span class="num">${formatNumber(w.attributes.temperature)}° outside</span></span>`);
  for (const c of room.chips ?? []) {
    const s = st(ctx, c.entity);
    if (!s) continue;
    const bad = ['unknown', 'unavailable'].includes(s.state);
    out.push(`<span class="chip">${icon(c.icon ?? 'mdi:information-outline')}<span class="num">${bad ? '—' : formatNumber(s.state)} ${esc(s.attributes.unit_of_measurement ?? '')}</span></span>`);
  }
  if (room.offline_note && (room.chips ?? []).some((c) => ['unknown', 'unavailable'].includes(st(ctx, c.entity)?.state))) {
    out.push(`<span class="chip warn">${esc(room.offline_note)}</span>`);
  }
  return out.join('');
}

function scenesSection(ctx) {
  const scenes = ctx.config.scenes ?? [];
  if (!scenes.length) return '';
  const active = scenes.find((s) => s.entity === ctx.activeScene) ?? lastUsedScene(ctx, scenes);
  const swatch = (s) => `<i style="--sw:${esc(s?.swatch ?? 'var(--glass-hi)')}">${s?.icon ? icon(s.icon) : ''}</i>`;
  const options = ctx.scenesOpen ? `<div class="menu-list" role="listbox" aria-label="Scenes">${scenes.map((s) => `<button class="menu-item" role="option" data-act="scene" data-arg="${s.entity}" aria-selected="${s === active}">${swatch(s)}<span class="grow">${esc(s.name)}</span>${s === active ? icon('mdi:check') : ''}</button>`).join('')}</div>` : '';
  return `<section class="sec"><h2>Scene</h2>
    <button class="select" data-act="scenes-menu" aria-haspopup="listbox" aria-expanded="${!!ctx.scenesOpen}">${swatch(active)}<span class="grow"><b>${esc(active?.name ?? 'Choose a scene')}</b>${active ? '<span class="muted">Last used</span>' : ''}</span>${icon(ctx.scenesOpen ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>${options}</section>`;
}

function lastUsedScene(ctx, scenes) {
  const when = (s) => {
    const state = st(ctx, s.entity);
    const t = Date.parse(s.entity.startsWith('script.') ? state?.attributes.last_triggered : state?.state);
    return Number.isFinite(t) ? t : 0;
  };
  const best = scenes.reduce((a, b) => (when(b) > when(a) ? b : a));
  return when(best) ? best : null;
}

function nowPlayingSection(ctx) {
  const tv = tvView(ctx);
  if (!tv.on) return '';
  const home = !tv.app || tv.app === 'Home screen';
  return `<section class="sec"><h2>Now playing</h2><div class="np">
    <span class="np-badge">${tv.picture ? `<img src="${esc(tv.picture)}" alt="">` : icon(home ? 'mdi:television' : 'mdi:play-circle-outline')}</span>
    <span class="grow"><b>${esc(tv.title || (home ? 'Home screen' : tv.app))}</b><span class="muted">${esc(tv.subtitle || (home ? 'TV is on' : `${tv.app} on TV`))}</span></span>
    <button class="round" data-act="key" data-arg="MEDIA_PLAY_PAUSE" aria-label="Play or pause">${icon('mdi:play-pause')}</button>
    <button class="round" data-act="sheet" data-arg="tv" aria-label="Remote">${icon('mdi:remote-tv')}</button></div></section>`;
}

function energySection(ctx) {
  const e = ctx.config.energy;
  if (!e) return '';
  const on = isOn(st(ctx, e.switch));
  const unit = st(ctx, e.power)?.attributes.unit_of_measurement ?? 'W';
  return `<section class="sec"><h2>${esc(e.name ?? 'Energy')}</h2>
    <div class="stats"><div class="stat"><b class="num">${num(ctx, e.power)}</b><span>${esc(unit)} now</span></div><div class="stat"><b class="num">${num(ctx, e.today, 2)}</b><span>kWh today</span></div><div class="stat"><b class="num">${num(ctx, e.month_cost, 2)}</b><span>RON this month</span></div></div>
    <div class="chart-card"><div class="chart-head"><span>Power, last 24 h</span><span><b class="num">${num(ctx, e.power)} ${esc(unit)}</b> now</span></div><div class="chart-slot" data-morph-skip data-unit="${esc(unit)}"></div></div>
    <button class="card row" data-act="toggle" data-arg="${e.switch}">${icon('mdi:power-socket-eu')}<span class="grow"><b>${esc(e.switch_name ?? 'Plug')}</b><div class="muted num">${on ? 'On' : 'Off'} · ${num(ctx, e.today_cost, 2)} RON today</div></span><span class="pill-btn">${on ? 'Turn off' : 'Turn on'}</span></button></section>`;
}

function vacuumSection(ctx) {
  const v = ctx.config.vacuum;
  const s = st(ctx, v?.entity);
  if (!s) return '';
  const docked = ['docked', 'idle', 'paused'].includes(s.state);
  return `<section class="sec"><h2>Cleaning</h2><button class="card row" data-act="vacuum">${icon('mdi:robot-vacuum')}<span class="grow"><b>${esc(s.attributes.friendly_name)}</b>
    <div class="muted num">${esc(s.state[0].toUpperCase() + s.state.slice(1))} · battery ${num(ctx, v.battery, 0)}% · filter ${num(ctx, v.filter, 0)}%</div></span><span class="pill-btn">${docked ? 'Clean' : 'Dock'}</span></button></section>`;
}

const SECTIONS = { scenes: scenesSection, now_playing: nowPlayingSection, energy: energySection, vacuum: vacuumSection };

function pageHtml(ctx, room) {
  const lights = roomLights(ctx, room);
  const fan = fanView(ctx, room);
  const tv = room.tv ? tvView(ctx) : null;
  const light = roomLight(lights);
  const tiles = lights.map(tile).join('')
    + (tv ? deviceTile({ act: 'sheet', arg: 'tv', ic: 'mdi:television', name: 'TV', value: tv.on ? tv.app || 'On' : 'Off', on: tv.on }) : '')
    + (fan ? deviceTile({ act: 'toggle', arg: room.fan, ic: 'mdi:fan', name: 'Fan', value: fan.on ? `${fan.level}%` : 'Off', on: fan.on }) : '');
  const deck = (room.sections ?? ['scenes']).map((k) => SECTIONS[k]?.(ctx) ?? '').join('');
  const pos = room.photo_position ? `style="object-position:${esc(room.photo_position)}"` : '';
  return `<section class="page" data-key="${esc(room.id)}" aria-label="${esc(room.name)}" style="--lux:${light.lux};--warmth:${light.warmth}">
    <div class="photo"><img src="${esc(room.photo)}" alt="" ${pos}></div>
    <div class="content">
      <div class="hero"><div class="eyebrow">${chips(ctx, room)}</div><h1>${esc(room.name)}</h1><div class="status">${esc(roomStatus({ lights, tvOn: tv?.on, fan }))}</div></div>
      <div class="strip">${tiles}</div>
      <div class="strip-foot"><p class="hint">Icon switches · card opens colour</p>${lights.length > 1 ? `<button class="pill-btn" data-act="sheet" data-arg="room:${room.id}">${icon('mdi:palette-outline')} All lights</button>` : ''}</div>
      <div class="deck">${deck}</div>
    </div></section>`;
}

function chromeHtml(ctx, page) {
  const person = st(ctx, ctx.config.person);
  const home = person?.state === 'home';
  const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const tabs = ctx.config.rooms.map((r, i) => {
    const lit = roomLights(ctx, r).filter((l) => l.on).length;
    return `<button class="tab" data-act="go" data-arg="${i}" ${i === page ? 'aria-current="page"' : ''}>${esc(r.name)}${lit ? `<sup class="num">${lit}</sup>` : ''}</button>`;
  }).join('');
  return `<div class="chrome" data-key="chrome"><div class="bar"><span class="mark"><button class="menu" data-act="menu" aria-label="Open menu">${icon('mdi:menu')}</button>${esc(ctx.config.title ?? 'Home')}</span>
    <span class="who"><span class="dot ${home ? '' : 'away'}"></span>${esc(person?.attributes.friendly_name ?? '')} ${home ? 'is home' : 'is away'} · <span class="num">${time}</span></span></div>
    <nav class="tabs" aria-label="Rooms">${tabs}<span class="ink-bar"></span></nav></div>`;
}

// stage-sheets.js

const header = (title, extra = '') => `<header><h3>${esc(title)}</h3><span class="row">${extra}<button class="x" data-act="sheet" aria-label="Close">${icon('mdi:close')}</button></span></header>`;

const fader = ({ key, label, ic, value, shown, text, kind = 'brightness', off = false }) => `<div class="fader ${kind} ${off ? 'off' : ''}" data-key="${key}" data-slider="${key}" role="slider" tabindex="0" aria-label="${esc(label)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}" style="--v:${shown}">
  <div class="f"></div><div class="l"><span class="row">${icon(ic)} ${esc(label)}</span><span class="num" data-pct>${esc(text)}</span></div></div>`;

const swatchRow = (target, light) => `<div class="swatches">${SWATCHES.filter((s) => !light || swatchServiceData(s, light)).map((s, i) => `<button class="swatch" data-act="swatch" data-arg="${target}|${i}" style="--sw:${swatchCss(s)}" aria-label="${esc(s.name)}"><i></i><span>${esc(s.name)}</span></button>`).join('')}
  <label class="swatch custom"><input type="color" data-color="${target}" value="#ff9628" aria-label="Custom colour"><i>${icon('mdi:eyedropper-variant')}</i><span>Custom</span></label></div>`;

function lightSheet(ctx, id) {
  const room = ctx.config.rooms.find((r) => r.lights?.some((l) => l.entity === id));
  const light = room && roomLights(ctx, room).find((l) => l.id === id);
  if (!light) return header('Light') + '<p class="muted">This light is not available.</p>';
  const toggle = `<button class="switch" role="switch" aria-checked="${light.on}" aria-label="Power" data-act="toggle-light" data-arg="${id}"></button>`;
  const effects = st(ctx, id)?.attributes.effect_list ?? [];
  const current = st(ctx, id)?.attributes.effect;
  return `${header(light.name, toggle)}
    ${fader({ key: `brightness:${id}`, label: 'Brightness', ic: 'mdi:brightness-6', value: light.level, shown: light.on ? light.level : light.lastLevel, text: light.on ? `${light.level}%` : 'Off', off: !light.on })}
    ${light.caps.temperature ? fader({ key: `kelvin:${id}`, kind: 'kelvin', label: 'Warmth', ic: 'mdi:thermometer', value: 0, shown: light.kelvin ? kelvinToPercent(light.kelvin, light.caps.minKelvin, light.caps.maxKelvin) : 30, text: light.kelvin ? `${light.kelvin} K` : 'Colour' }) : ''}
    <h4>Colour</h4>${swatchRow(`light:${id}`, light)}
    ${effects.length ? `<h4>Effects</h4><div class="chips">${effects.map((e) => `<button class="chip-btn" data-act="effect" data-arg="${id}|${esc(e)}" aria-pressed="${e === current}">${esc(e)}</button>`).join('')}</div>` : ''}
    <button class="link" data-act="sheet" data-arg="room:${room.id}">${icon('mdi:palette-outline')} Set a colour for all lights in ${esc(room.name.toLowerCase())}</button>`;
}

function roomSheet(ctx, roomId) {
  const room = ctx.config.rooms.find((r) => r.id === roomId);
  if (!room) return header('Room');
  const lights = roomLights(ctx, room);
  const excluded = ctx.excluded[roomId] ?? new Set();
  const chosen = lights.filter((l) => !excluded.has(l.id));
  const avg = chosen.length ? Math.round(chosen.reduce((a, l) => a + (l.on ? l.level : 0), 0) / chosen.length) : 0;
  return `${header(`All lights · ${room.name}`)}
    <p class="muted">Choose which lights follow. Colours apply to every selected light that supports them.</p>
    <div class="chips">${lights.map((l) => `<button class="chip-btn" data-act="include" data-arg="${roomId}|${l.id}" aria-pressed="${!excluded.has(l.id)}">${icon(excluded.has(l.id) ? 'mdi:checkbox-blank-circle-outline' : 'mdi:check-circle')} ${esc(l.name)}</button>`).join('')}</div>
    ${fader({ key: `group:${roomId}`, label: `${chosen.length} selected`, ic: 'mdi:brightness-6', value: avg, shown: avg || 50, text: avg ? `${avg}%` : 'Off', off: !avg })}
    <div class="row gap"><button class="pill-btn" data-act="group-power" data-arg="${roomId}|on">${icon('mdi:lightbulb-on-outline')} All on</button><button class="pill-btn" data-act="group-power" data-arg="${roomId}|off">${icon('mdi:lightbulb-off-outline')} All off</button></div>
    <h4>Colour</h4>${swatchRow(`room:${roomId}`)}`;
}

function tvSheet(ctx) {
  const tv = tvView(ctx);
  const apps = ctx.config.tv?.apps ?? [];
  const key = (code, ic, label, cls = '') => `<button class="rk ${cls}" data-act="key" data-arg="${code}" aria-label="${label}">${ic.startsWith('mdi:') ? icon(ic) : ic}</button>`;
  return `${header('TV')}
    <div class="row"><span class="grow"><b>${esc(tv.on ? tv.title || tv.app || 'On' : 'TV is off')}</b><div class="muted">${esc(tv.on ? tv.app : 'Philips · Ambilight')}</div></span>
    <button class="pill-btn ${tv.on ? 'solid' : ''}" data-act="toggle" data-arg="${ctx.config.tv.entity}">${tv.on ? 'Turn off' : 'Turn on'}</button></div>
    ${tv.on ? `<div class="remote">${key('VOLUME_UP', 'mdi:volume-plus', 'Volume up')}${key('DPAD_UP', 'mdi:chevron-up', 'Up')}${key('BACK', 'mdi:arrow-u-left-top', 'Back')}
      ${key('DPAD_LEFT', 'mdi:chevron-left', 'Left')}${key('DPAD_CENTER', 'OK', 'OK', 'ok')}${key('DPAD_RIGHT', 'mdi:chevron-right', 'Right')}
      ${key('VOLUME_DOWN', 'mdi:volume-minus', 'Volume down')}${key('DPAD_DOWN', 'mdi:chevron-down', 'Down')}${key('HOME', 'mdi:home-outline', 'Home')}</div>
      <div class="apps">${apps.map((a, i) => `<button class="pill-btn ${i ? '' : 'solid'}" data-act="app" data-arg="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>` : ''}`;
}

function sheetHtml(ctx, sheet) {
  if (!sheet) return '';
  const [kind, arg] = sheet.split(':');
  const body = kind === 'tv' ? tvSheet(ctx) : kind === 'light' ? lightSheet(ctx, sheet.slice(6)) : kind === 'room' ? roomSheet(ctx, arg) : '';
  return `<div class="scrim" data-key="scrim" data-act="sheet"></div><section class="sheet" data-key="sheet-${esc(kind)}" role="dialog" aria-label="Controls"><div class="grip"></div>${body}</section>`;
}

// stage-lights.js

function roomOf(config, entityId) {
  return config.rooms.find((r) => r.lights?.some((l) => l.entity === entityId));
}

function selectedLights(config, excluded, roomId) {
  const room = config.rooms.find((r) => r.id === roomId);
  const skip = excluded[roomId] ?? new Set();
  return (room?.lights ?? []).map((l) => l.entity).filter((id) => !skip.has(id));
}

function faderText(kind, value, light) {
  if (kind === 'kelvin') return `${percentToKelvin(value, light.caps.minKelvin, light.caps.maxKelvin)} K`;
  return `${value}%`;
}

function faderCall({ config, excluded, hass }, key, value) {
  const [kind, target] = [key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)];
  if (kind === 'brightness') return { ids: [target], data: { entity_id: target, brightness_pct: value } };
  if (kind === 'group') {
    const ids = selectedLights(config, excluded, target);
    return { ids, data: { entity_id: ids, brightness_pct: value } };
  }
  if (kind === 'kelvin') {
    const light = lightView(hass.states[target]);
    return { ids: [], data: { entity_id: target, color_temp_kelvin: percentToKelvin(value, light.caps.minKelvin, light.caps.maxKelvin) } };
  }
  throw new Error(`stage-card: unknown fader "${key}"`);
}

function targetsOf({ config, excluded }, target) {
  const [kind, id] = [target.slice(0, target.indexOf(':')), target.slice(target.indexOf(':') + 1)];
  return kind === 'room' ? selectedLights(config, excluded, id) : [id];
}

function colorCalls(ctx, target, choice) {
  return targetsOf(ctx, target)
    .map((id) => ({ id, light: lightView(ctx.hass.states[id]) }))
    .map(({ id, light }) => {
      const data = choice.hex ? (light.caps.color ? { rgb_color: hexToRgb(choice.hex) } : null) : swatchServiceData(SWATCHES[choice.swatch], light);
      return data && { entity_id: id, ...data };
    })
    .filter(Boolean);
}

// stage-card.js

const HISTORY_EVERY_MS = 10 * 60_000;
const PENDING_MS = 4000;

class StageCard extends HTMLElement {
  setConfig(config) {
    if (!Array.isArray(config?.rooms) || config.rooms.length === 0) throw new Error('stage-card: "rooms" must list at least one room');
    for (const r of config.rooms) if (!r.id || !r.name || !r.photo) throw new Error(`stage-card: room needs id, name and photo (got ${JSON.stringify(r)})`);
    this.config = config;
    this.page = 0;
    this.sheet = null;
    this.pending = {};
    this.excluded = {};
    this.history = [];
    this.signature = '';
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) this.mount();
    const sig = this.watched().map((id) => hass.states[id]?.last_updated ?? '').join('|');
    if (sig !== this.signature) { this.signature = sig; this.render(); }
    if (Date.now() - (this.historyAt ?? 0) > HISTORY_EVERY_MS) this.loadHistory();
  }

  getCardSize() { return 12; }

  watched() {
    const c = this.config;
    const ids = [c.person, c.weather, c.tv?.entity, c.tv?.app_source, c.tv?.now_playing, ...(c.scenes ?? []).map((s) => s.entity)];
    for (const r of c.rooms) ids.push(...(r.lights ?? []).map((l) => l.entity), r.fan, ...(r.chips ?? []).map((x) => x.entity));
    if (c.energy) ids.push(...Object.values(c.energy));
    if (c.vacuum) ids.push(...Object.values(c.vacuum));
    return ids.filter(Boolean);
  }

  mount() {
    const root = this.attachShadow({ mode: 'open' });
    root.innerHTML = `<style>${styles}</style><div class="stage"></div>`;
    this.stage = root.querySelector('.stage');
    this.stage.addEventListener('click', (e) => this.onClick(e));
    this.stage.addEventListener('keydown', (e) => this.onKey(e));
    this.stage.addEventListener('change', (e) => this.onColorPick(e));
    this.stage.addEventListener('scroll', (e) => this.onScroll(e), { capture: true, passive: true });
    this.faders = attachFaders(this.stage, {
      onPreview: (el, key, value) => this.previewFader(el, key, value),
      onSend: (key, value, final) => this.sendFader(key, value, final),
    });
    setInterval(() => this.render(), 30_000);
    const fit = () => { const top = Math.max(0, this.getBoundingClientRect().top); this.stage.style.setProperty('--stage-h', `${window.innerHeight - top}px`); };
    window.addEventListener('resize', fit);
    requestAnimationFrame(fit);
    new ResizeObserver(() => { fit(); this.drawCharts(true); this.placeInkBar(); }).observe(this);
  }

  ctx() {
    return { hass: this._hass, config: this.config, pending: this.pending, excluded: this.excluded, activeScene: this.activeScene, scenesOpen: this.scenesOpen, history: this.history };
  }

  render() {
    if (!this.stage || !this._hass || this.faders?.isActive()) return;
    const ctx = this.ctx();
    const first = !this.stage.firstChild;
    morph(this.stage, `<div class="pager" data-key="pager">${this.config.rooms.map((r) => pageHtml(ctx, r)).join('')}</div>${chromeHtml(ctx, this.page)}${sheetHtml(ctx, this.sheet)}`);
    if (first) requestAnimationFrame(() => { this.stage.querySelector('.pager').scrollLeft = this.page * this.stage.clientWidth; });
    requestAnimationFrame(() => { this.drawCharts(false); this.placeInkBar(); this.updateChrome(); });
  }

  drawCharts(force) {
    this.stage?.querySelectorAll('.chart-slot').forEach((slot) => {
      const width = Math.max(240, Math.round(slot.clientWidth));
      const key = `${width}|${this.historyAt}|${this.history.length}`;
      if (!force && slot.dataset.drawn === key) return;
      if (!slot.clientWidth) return;
      const opts = { unit: slot.dataset.unit, width };
      slot.innerHTML = chartSvg(this.history, opts);
      slot.dataset.drawn = key;
      attachChartHover(slot, this.history, opts);
    });
  }

  onScroll(e) {
    if (e.target.classList?.contains('pager')) {
      const i = Math.round(e.target.scrollLeft / e.target.clientWidth);
      if (i !== this.page) { this.page = i; this.stage.querySelectorAll('.tab').forEach((t, j) => t.toggleAttribute('aria-current', j === i)); this.placeInkBar(); }
    }
    this.updateChrome();
  }

  placeInkBar() {
    const tab = this.stage?.querySelectorAll('.tab')[this.page];
    const bar = this.stage?.querySelector('.ink-bar');
    if (tab && bar) { bar.style.width = `${tab.offsetWidth}px`; bar.style.transform = `translateX(${tab.offsetLeft}px)`; }
  }

  updateChrome() {
    const page = this.stage.querySelector('.pager')?.children[this.page];
    const solid = !!page && page.scrollTop > 80;
    const chrome = this.stage.querySelector('.chrome');
    if (chrome && chrome.classList.contains('solid') !== solid) chrome.classList.toggle('solid', solid);
  }

  goTo(i) {
    this.page = i;
    const pager = this.stage.querySelector('.pager');
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    this.stage.querySelectorAll('.tab').forEach((t, j) => t.toggleAttribute('aria-current', j === i));
    this.placeInkBar();
  }

  previewFader(el, key, value) {
    el.style.setProperty('--v', value);
    el.classList.remove('off');
    const kind = key.slice(0, key.indexOf(':'));
    const id = key.slice(key.indexOf(':') + 1);
    const light = kind === 'kelvin' ? lightView(this._hass.states[id]) : null;
    const label = el.querySelector('[data-pct]');
    if (label) label.textContent = faderText(kind, value, light);
    if (kind === 'brightness') this.previewRoom(id, value);
  }

  previewRoom(id, value) {
    const room = roomOf(this.config, id);
    const page = room && this.stage.querySelector(`.page[data-key="${room.id}"]`);
    if (!page) return;
    const levels = room.lights.map((l) => (l.entity === id ? { level: value } : lightView(this._hass.states[l.entity], this.pending[l.entity])));
    const light = roomLight(levels);
    page.style.setProperty('--lux', light.lux);
    page.style.setProperty('--warmth', light.warmth);
  }

  sendFader(key, value, final) {
    let call;
    try { call = faderCall(this.ctx(), key, value); } catch (err) { console.error(err); return; }
    for (const id of call.ids) this.pending[id] = value;
    this.activeScene = null;
    this.call('light', 'turn_on', call.data);
    if (!final) return;
    clearTimeout(this.pendingTimer);
    this.pendingTimer = setTimeout(() => { this.pending = {}; this.render(); }, PENDING_MS);
    this.render();
  }

  call(domain, service, data) {
    this._hass.callService(domain, service, data).catch((err) => {
      console.error(`stage-card: ${domain}.${service} failed for ${JSON.stringify(data)}`, err);
    });
  }

  applyColor(target, choice) {
    const calls = colorCalls(this.ctx(), target, choice);
    for (const data of calls) this.call('light', 'turn_on', data);
    this.activeScene = null;
  }

  runAction(act, arg = '') {
    const c = this.config;
    const [a, b] = arg.split('|');
    const actions = {
      'toggle-light': () => this.call('light', 'toggle', { entity_id: arg }),
      toggle: () => this.call('homeassistant', 'toggle', { entity_id: arg }),
      scene: () => { this.activeScene = arg; this.scenesOpen = false; const [d, s] = serviceForScene(arg); this.call(d, s, { entity_id: arg }); },
      'scenes-menu': () => { this.scenesOpen = !this.scenesOpen; },
      sheet: () => { this.sheet = arg || null; },
      go: () => this.goTo(+arg),
      key: () => this.call('remote', 'send_command', { entity_id: c.tv.remote, command: arg }),
      app: () => this.call('media_player', 'play_media', { entity_id: c.tv.entity, media_content_type: 'app', media_content_id: arg }),
      vacuum: () => { const s = this._hass.states[c.vacuum.entity]?.state; this.call('vacuum', s === 'cleaning' ? 'return_to_base' : 'start', { entity_id: c.vacuum.entity }); },
      swatch: () => this.applyColor(a, { swatch: +b }),
      effect: () => this.call('light', 'turn_on', { entity_id: a, effect: b }),
      include: () => { const set = (this.excluded[a] ??= new Set()); set.has(b) ? set.delete(b) : set.add(b); },
      'group-power': () => this.call('light', b === 'on' ? 'turn_on' : 'turn_off', { entity_id: selectedLights(this.config, this.excluded, a) }),
      menu: () => this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true })),
    };
    actions[act]?.();
  }

  onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    this.runAction(el.dataset.act, el.dataset.arg);
    if (!['go', 'menu'].includes(el.dataset.act)) this.render();
  }

  onColorPick(e) {
    const input = e.target.closest('input[data-color]');
    if (input) this.applyColor(input.dataset.color, { hex: input.value });
  }

  onKey(e) {
    if (e.key === 'Escape' && this.sheet) { this.sheet = null; this.render(); return; }
    const fader = e.target.closest('[data-slider]');
    const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10 }[e.key];
    if (!fader || !step) return;
    e.preventDefault();
    const value = Math.max(1, Math.min(100, Number(fader.getAttribute('aria-valuenow') || 0) + step));
    this.previewFader(fader, fader.dataset.slider, value);
    this.sendFader(fader.dataset.slider, value, true);
  }

  async loadHistory() {
    const power = this.config.energy?.power;
    if (!power) return;
    this.historyAt = Date.now();
    try {
      const start = new Date(Date.now() - 24 * 3600_000).toISOString();
      const res = await this._hass.callWS({ type: 'history/history_during_period', start_time: start, entity_ids: [power], minimal_response: true, no_attributes: true });
      this.history = bucketSeries(seriesFromHistory(res[power] ?? []));
      this.drawCharts(true);
    } catch (err) {
      console.error(`stage-card: loading 24 h history for ${power} failed`, err);
    }
  }
}

customElements.define('stage-card', StageCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'stage-card', name: 'Stage', description: 'Room-as-hero dashboard with photo lighting' });

})();
