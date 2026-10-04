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
    lastLevel: level || 50,
    unavailable: stateObj.state === 'unavailable',
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

const appName = (appId) => APP_NAMES[appId] ?? appId ?? '';

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
  --deck: oklch(13% .008 60 / .6);
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
.stage { position: relative; height: 100dvh; overflow: hidden; background: #000; isolation: isolate; }

.chrome { position: absolute; inset: 0 0 auto; z-index: var(--z-chrome); padding: calc(env(safe-area-inset-top) + 18px) var(--space-5) var(--space-3); background: linear-gradient(180deg, oklch(0% 0 0 / .5), transparent); }
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
.hero { padding-top: clamp(132px, 27cqh, 260px); }
.eyebrow { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 var(--space-3); border-radius: var(--r-full); background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3); font-size: var(--fs-12); font-weight: 500; }
.chip ha-icon { --mdc-icon-size: 15px; }
.chip.warn { color: var(--warm); }
h1 { margin: var(--space-3) 0 var(--space-1); font-size: var(--fs-52); line-height: .98; font-weight: 600; letter-spacing: -.035em; }
.status { font-size: var(--fs-16); color: var(--ink-2); }

.strip { display: flex; gap: var(--space-2); margin: var(--space-5) calc(var(--space-5) * -1) 0; padding: 0 var(--space-5); overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: var(--space-5); scrollbar-width: none; }
.tile { position: relative; flex: 0 0 136px; height: 128px; scroll-snap-align: start; padding: var(--space-3) var(--space-3) var(--space-4); border-radius: var(--r-m); display: flex; flex-direction: column; justify-content: space-between; text-align: left; overflow: hidden; background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(20px) saturate(1.4); -webkit-backdrop-filter: blur(20px) saturate(1.4); transition: background var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out), transform var(--dur-fast) var(--ease-out); touch-action: pan-x pan-y; user-select: none; -webkit-user-select: none; }
.tile:active { transform: scale(.97); }
.tile[aria-pressed="true"] { background: oklch(93% .045 82 / .9); color: var(--warm-ink); border-color: transparent; }
.tile[data-unavailable] { opacity: .5; }
.tile .top { display: flex; justify-content: space-between; align-items: flex-start; }
.tile .ic { width: 36px; height: 36px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); }
.tile[aria-pressed="true"] .ic { background: oklch(80% .12 75); }
.tile .val { font-size: var(--fs-13); font-weight: 600; }
.tile b { display: block; font-size: var(--fs-14); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .lvl { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-2); height: 3px; border-radius: 3px; background: oklch(0% 0 0 / .12); overflow: hidden; }
.tile .lvl i { display: block; height: 100%; width: calc(var(--v) * 1%); background: currentColor; opacity: .55; border-radius: 3px; transition: width var(--dur-ui) var(--ease-out); }
.tile.dimming { transform: scale(.98); }
.tile.dimming .lvl { height: 6px; }
.hint { margin: var(--space-3) 0 0; font-size: var(--fs-12); color: var(--ink-3); }

.deck { position: relative; margin: var(--space-5) calc(var(--space-5) * -1) 0; padding: var(--space-2) var(--space-5) calc(env(safe-area-inset-bottom) + 96px); border-radius: var(--r-l) var(--r-l) 0 0; background: var(--deck); border-top: 1px solid var(--glass-line); backdrop-filter: blur(32px) saturate(1.5); -webkit-backdrop-filter: blur(32px) saturate(1.5); box-shadow: 0 -24px 48px oklch(0% 0 0 / .4), inset 0 1px 0 oklch(100% 0 0 / .08); min-height: 60cqh; }
.deck::before { content: ""; display: block; width: 36px; height: 4px; border-radius: 4px; background: var(--ink-3); opacity: .5; margin: 0 auto var(--space-2); }
.sec { padding-block: var(--space-5); }
.sec + .sec { border-top: 1px solid oklch(100% 0 0 / .08); }
.sec h2 { margin: 0 0 var(--space-3); font-size: var(--fs-12); letter-spacing: .16em; text-transform: uppercase; font-weight: 600; color: var(--ink-3); }
.scenes { display: flex; gap: var(--space-2); margin-inline: calc(var(--space-5) * -1); padding-inline: var(--space-5); overflow-x: auto; scrollbar-width: none; }
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
.np { position: relative; overflow: hidden; min-height: 132px; display: flex; align-items: flex-end; background: linear-gradient(135deg, oklch(30% .05 40), oklch(18% .03 280)); }
.np img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.np::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, oklch(10% .01 60 / .9), oklch(10% .01 60 / .5) 60%, transparent); }
.np .in { position: relative; z-index: 1; width: 100%; }
.np .app { font-size: var(--fs-11); letter-spacing: .16em; text-transform: uppercase; color: var(--warm); font-weight: 600; }
.np b { display: block; font-size: var(--fs-20); margin: 2px 0 var(--space-3); }
.np-actions { display: flex; gap: var(--space-2); }

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

@keyframes up { from { transform: translateY(105%); } }
@keyframes fade { from { opacity: 0; } }
@media (min-width: 900px) {
  .content { margin-left: clamp(24px, 6vw, 96px); width: min(100%, 720px); }
  .strip { flex-wrap: wrap; overflow-x: visible; margin-inline: 0; padding-inline: 0; }
  .hero { padding-top: clamp(132px, 30cqh, 300px); }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;

// stage-gestures.js
const HOLD_MS = 480;
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

function startMode(g, dx, dy) {
  if (g.isFader && Math.abs(dx) > 4) return 'dim';
  if (!g.isFader && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) return 'dim';
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return 'scroll';
  return null;
}

function attachGestures(root, { levelOf, onLive, onCommit, onHold, onTap }) {
  let g = null;
  let swallowClick = false;

  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-slider], [data-dim]');
    if (!el) return;
    const isFader = el.hasAttribute('data-slider');
    const id = isFader ? el.dataset.slider : el.dataset.dim;
    g = { el, id, isFader, x: e.clientX, y: e.clientY, start: levelOf(id), mode: null, pointer: e.pointerId, value: null };
    if (!isFader) g.hold = setTimeout(() => { if (g && !g.mode) { g.mode = 'hold'; swallowClick = true; onHold(id); } }, HOLD_MS);
  });

  root.addEventListener('pointermove', (e) => {
    if (!g || g.mode === 'hold' || g.mode === 'scroll') return;
    const dx = e.clientX - g.x;
    if (!g.mode) {
      g.mode = startMode(g, dx, e.clientY - g.y);
      if (!g.mode) return;
      clearTimeout(g.hold);
      if (g.mode === 'scroll') return;
      g.el.setPointerCapture(g.pointer);
      g.el.classList.add(g.isFader ? 'drag' : 'dimming');
    }
    const box = g.el.getBoundingClientRect();
    g.value = clamp(g.isFader ? ((e.clientX - box.left) / box.width) * 100 : g.start + dx / 2.2);
    onLive(g.el, g.id, g.value);
  });

  const end = (cancelled) => {
    if (!g) return;
    clearTimeout(g.hold);
    const { mode, isFader, id, value, el } = g;
    g = null;
    el.classList.remove('drag', 'dimming');
    if (cancelled) return;
    if (mode === 'dim' && value != null) { swallowClick = true; onCommit(id, value); }
    else if (isFader && !mode) { swallowClick = true; onTap(id); }
  };
  root.addEventListener('pointerup', () => end(false));
  root.addEventListener('pointercancel', () => end(true));
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-dim]')) e.preventDefault(); });

  return {
    consumeClick() {
      const was = swallowClick;
      swallowClick = false;
      return was;
    },
    isActive: () => g != null,
  };
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
  return { on: isOn(s), app: appName(app), title: s?.attributes.media_title, picture: s?.attributes.entity_picture };
}

const tile = (l) => `<button class="tile" data-act="toggle-light" data-arg="${l.id}" data-dim="${l.id}" aria-pressed="${l.on}" ${l.unavailable ? 'data-unavailable' : ''} style="--v:${l.level}">
  <span class="top"><span class="ic">${icon(l.icon)}</span><span class="val num">${l.unavailable ? 'Offline' : l.on ? `${l.level}%` : 'Off'}</span></span>
  <span><b>${esc(l.name)}</b></span><span class="lvl"><i></i></span></button>`;

const deviceTile = ({ act, arg = '', ic, name, value, on }) => `<button class="tile" data-act="${act}" data-arg="${arg}" aria-pressed="${on}" style="--v:0">
  <span class="top"><span class="ic">${icon(ic)}</span><span class="val">${esc(value)}</span></span><span><b>${esc(name)}</b></span></button>`;

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
  return `<section class="sec"><h2>Scenes</h2><div class="scenes">${scenes.map((s) => `<button class="scene" data-act="scene" data-arg="${s.entity}" aria-pressed="${ctx.activeScene === s.entity}"><i style="--sw:${esc(s.swatch ?? 'var(--glass-hi)')}"></i>${esc(s.name)}</button>`).join('')}</div></section>`;
}

function nowPlayingSection(ctx) {
  const tv = tvView(ctx);
  if (!tv.on) return '';
  const art = tv.picture ? `<img src="${esc(tv.picture)}" alt="">` : '';
  return `<section class="sec"><h2>Now playing</h2><div class="card np">${art}<div class="in">
    <span class="app">${esc(tv.app && tv.app !== 'Home screen' ? `${tv.app} · TV` : 'TV')}</span><b>${esc(tv.title || tv.app || 'TV is on')}</b>
    <div class="np-actions"><button class="pill-btn solid" data-act="key" data-arg="MEDIA_PLAY_PAUSE">${icon('mdi:play-pause')} Play/Pause</button><button class="pill-btn" data-act="sheet" data-arg="tv">${icon('mdi:remote-tv')} Remote</button></div></div></div></section>`;
}

function energySection(ctx) {
  const e = ctx.config.energy;
  if (!e) return '';
  const on = isOn(st(ctx, e.switch));
  const unit = st(ctx, e.power)?.attributes.unit_of_measurement ?? 'W';
  return `<section class="sec"><h2>${esc(e.name ?? 'Energy')}</h2>
    <div class="stats"><div class="stat"><b class="num">${num(ctx, e.power)}</b><span>${esc(unit)} now</span></div><div class="stat"><b class="num">${num(ctx, e.today, 2)}</b><span>kWh today</span></div><div class="stat"><b class="num">${num(ctx, e.month_cost, 2)}</b><span>RON this month</span></div></div>
    <div class="chart-card"><div class="chart-head"><span>Power, last 24 h</span><span><b class="num">${num(ctx, e.power)} ${esc(unit)}</b> now</span></div><div class="chart-slot" data-unit="${esc(unit)}"></div></div>
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
  return `<section class="page" aria-label="${esc(room.name)}" style="--lux:${light.lux};--warmth:${light.warmth}">
    <div class="photo"><img src="${esc(room.photo)}" alt="" ${pos}></div>
    <div class="content">
      <div class="hero"><div class="eyebrow">${chips(ctx, room)}</div><h1>${esc(room.name)}</h1><div class="status">${esc(roomStatus({ lights, tvOn: tv?.on, fan }))}</div></div>
      <div class="strip">${tiles}</div>
      <p class="hint">Tap to toggle · drag sideways to dim · hold for all controls</p>
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
  return `<div class="chrome"><div class="bar"><span class="mark"><button class="menu" data-act="menu" aria-label="Open menu">${icon('mdi:menu')}</button>${esc(ctx.config.title ?? 'Home')}</span>
    <span class="who"><span class="dot ${home ? '' : 'away'}"></span>${esc(person?.attributes.friendly_name ?? '')} ${home ? 'is home' : 'is away'} · <span class="num">${time}</span></span></div>
    <nav class="tabs" aria-label="Rooms">${tabs}<span class="ink-bar"></span></nav></div>`;
}

function roomSheet(ctx, room) {
  const faders = roomLights(ctx, room).map((l) => `<div class="fader ${l.on ? '' : 'off'}" data-slider="${l.id}" role="slider" tabindex="0" aria-label="${esc(l.name)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${l.level}" style="--v:${l.on ? l.level : l.lastLevel}">
    <div class="f"></div><div class="l"><span class="row">${icon(l.icon)} ${esc(l.name)}</span><span class="num" data-pct>${l.on ? `${l.level}%` : 'Off'}</span></div></div>`).join('');
  return `<header><h3>${esc(room.name)}</h3><button class="x" data-act="sheet" aria-label="Close">${icon('mdi:close')}</button></header>${faders}`;
}

function tvSheet(ctx) {
  const tv = tvView(ctx);
  const apps = ctx.config.tv?.apps ?? [];
  const key = (code, ic, label, cls = '') => `<button class="rk ${cls}" data-act="key" data-arg="${code}" aria-label="${label}">${ic.startsWith('mdi:') ? icon(ic) : ic}</button>`;
  return `<header><h3>TV</h3><button class="x" data-act="sheet" aria-label="Close">${icon('mdi:close')}</button></header>
    <div class="row"><span class="grow"><b>${esc(tv.on ? tv.title || tv.app || 'On' : 'TV is off')}</b><div class="muted">${esc(tv.on ? tv.app : 'Philips · Ambilight')}</div></span>
    <button class="pill-btn ${tv.on ? 'solid' : ''}" data-act="toggle" data-arg="${ctx.config.tv.entity}">${tv.on ? 'Turn off' : 'Turn on'}</button></div>
    ${tv.on ? `<div class="remote">${key('VOLUME_UP', 'mdi:volume-plus', 'Volume up')}${key('DPAD_UP', 'mdi:chevron-up', 'Up')}${key('BACK', 'mdi:arrow-u-left-top', 'Back')}
      ${key('DPAD_LEFT', 'mdi:chevron-left', 'Left')}${key('DPAD_CENTER', 'OK', 'OK', 'ok')}${key('DPAD_RIGHT', 'mdi:chevron-right', 'Right')}
      ${key('VOLUME_DOWN', 'mdi:volume-minus', 'Volume down')}${key('DPAD_DOWN', 'mdi:chevron-down', 'Down')}${key('HOME', 'mdi:home-outline', 'Home')}</div>
      <div class="apps">${apps.map((a, i) => `<button class="pill-btn ${i ? '' : 'solid'}" data-act="app" data-arg="${esc(a.id)}">${esc(a.name)}</button>`).join('')}</div>` : ''}`;
}

function sheetHtml(ctx, sheet) {
  if (!sheet) return '';
  const room = ctx.config.rooms.find((r) => r.id === sheet);
  const body = sheet === 'tv' ? tvSheet(ctx) : room ? roomSheet(ctx, room) : '';
  return `<div class="scrim" data-act="sheet"></div><section class="sheet" role="dialog" aria-label="Controls"><div class="grip"></div>${body}</section>`;
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
    this.history = [];
    this.signature = '';
  }

  set hass(hass) {
    this._hass = hass;
    if (!this.shadowRoot) this.mount();
    const sig = this.watched().map((id) => hass.states[id]?.last_updated ?? '').join('|');
    if (sig !== this.signature && !this.gestures.isActive()) {
      this.signature = sig;
      this.render();
    }
    if (Date.now() - (this.historyAt ?? 0) > HISTORY_EVERY_MS) this.loadHistory();
  }

  getCardSize() { return 12; }

  watched() {
    const c = this.config;
    const ids = [c.person, c.weather, c.tv?.entity, c.tv?.app_source, ...(c.scenes ?? []).map((s) => s.entity)];
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
    this.gestures = attachGestures(this.stage, {
      levelOf: (id) => lightView(this._hass.states[id], this.pending[id]).lastLevel,
      onLive: (el, id, value) => this.previewLevel(el, id, value),
      onCommit: (id, value) => this.setLevel(id, value),
      onHold: (id) => { this.sheet = this.config.rooms.find((r) => r.lights?.some((l) => l.entity === id))?.id ?? null; this.render(); },
      onTap: (id) => this.call('light', 'toggle', { entity_id: id }),
    });
    setInterval(() => { if (!this.sheet && !this.gestures.isActive()) this.render(); }, 30_000);
  }

  ctx() {
    return { hass: this._hass, config: this.config, pending: this.pending, activeScene: this.activeScene, history: this.history };
  }

  render() {
    if (!this.stage || !this._hass) return;
    const pager = this.stage.querySelector('.pager');
    const keep = pager ? { left: pager.scrollLeft, tops: [...pager.children].map((p) => p.scrollTop) } : null;
    const ctx = this.ctx();
    this.stage.innerHTML = `<div class="pager">${this.config.rooms.map((r) => pageHtml(ctx, r)).join('')}</div>${chromeHtml(ctx, this.page)}${sheetHtml(ctx, this.sheet)}`;
    const next = this.stage.querySelector('.pager');
    if (keep) { next.scrollLeft = keep.left; [...next.children].forEach((p, i) => { p.scrollTop = keep.tops[i] ?? 0; }); }
    else requestAnimationFrame(() => { next.scrollLeft = this.page * next.clientWidth; });
    next.addEventListener('scroll', () => this.onPagerScroll(), { passive: true });
    [...next.children].forEach((p) => p.addEventListener('scroll', () => this.updateChrome(), { passive: true }));
    requestAnimationFrame(() => { this.drawCharts(); this.updateChrome(); });
  }

  drawCharts() {
    this.stage.querySelectorAll('.chart-slot').forEach((slot) => {
      const opts = { unit: slot.dataset.unit, width: Math.max(240, Math.round(slot.clientWidth)) };
      slot.innerHTML = chartSvg(this.history, opts);
      attachChartHover(slot, this.history, opts);
    });
  }

  onPagerScroll() {
    const pager = this.stage.querySelector('.pager');
    const i = Math.round(pager.scrollLeft / pager.clientWidth);
    if (i !== this.page) { this.page = i; this.stage.querySelectorAll('.tab').forEach((t, j) => t.toggleAttribute('aria-current', j === i)); }
    this.updateChrome();
  }

  updateChrome() {
    const pager = this.stage.querySelector('.pager');
    const tab = this.stage.querySelectorAll('.tab')[this.page];
    const bar = this.stage.querySelector('.ink-bar');
    if (tab && bar) { bar.style.width = `${tab.offsetWidth}px`; bar.style.transform = `translateX(${tab.offsetLeft}px)`; }
    const page = pager?.children[this.page];
    this.stage.querySelector('.chrome')?.classList.toggle('solid', !!page && page.scrollTop > 120);
  }

  goTo(i) {
    this.page = i;
    const pager = this.stage.querySelector('.pager');
    const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
    pager.scrollTo({ left: i * pager.clientWidth, behavior: smooth ? 'smooth' : 'auto' });
    this.onPagerScroll();
  }

  previewLevel(el, id, value) {
    el.style.setProperty('--v', value);
    el.classList.remove('off');
    el.setAttribute('aria-pressed', 'true');
    const label = el.querySelector('[data-pct], .val');
    if (label) label.textContent = `${value}%`;
    const room = this.config.rooms.find((r) => r.lights?.some((l) => l.entity === id));
    const page = el.closest('.page');
    if (!room || !page) return;
    const levels = room.lights.map((l) => (l.entity === id ? { level: value } : lightView(this._hass.states[l.entity], this.pending[l.entity])));
    const light = roomLight(levels);
    page.style.setProperty('--lux', light.lux);
    page.style.setProperty('--warmth', light.warmth);
  }

  setLevel(id, value) {
    this.pending[id] = value;
    setTimeout(() => { delete this.pending[id]; this.render(); }, PENDING_MS);
    this.activeScene = null;
    this.call('light', 'turn_on', { entity_id: id, brightness_pct: value });
    this.render();
  }

  call(domain, service, data) {
    this._hass.callService(domain, service, data).catch((err) => {
      console.error(`stage-card: ${domain}.${service} failed for ${JSON.stringify(data)}`, err);
    });
  }

  runAction(act, arg) {
    const c = this.config;
    const actions = {
      'toggle-light': () => this.call('light', 'toggle', { entity_id: arg }),
      toggle: () => this.call('homeassistant', 'toggle', { entity_id: arg }),
      scene: () => { this.activeScene = arg; const [d, s] = serviceForScene(arg); this.call(d, s, { entity_id: arg }); },
      sheet: () => { this.sheet = arg || null; },
      go: () => this.goTo(+arg),
      key: () => this.call('remote', 'send_command', { entity_id: c.tv.remote, command: arg }),
      app: () => this.call('media_player', 'play_media', { entity_id: c.tv.entity, media_content_type: 'app', media_content_id: arg }),
      vacuum: () => { const s = this._hass.states[c.vacuum.entity]?.state; this.call('vacuum', s === 'cleaning' ? 'return_to_base' : 'start', { entity_id: c.vacuum.entity }); },
      menu: () => this.dispatchEvent(new Event('hass-toggle-menu', { bubbles: true, composed: true })),
    };
    actions[act]?.();
  }

  onClick(e) {
    if (this.gestures.consumeClick()) return;
    const el = e.target.closest('[data-act]');
    if (!el) return;
    this.runAction(el.dataset.act, el.dataset.arg);
    if (!['go', 'menu'].includes(el.dataset.act)) this.render();
  }

  onKey(e) {
    if (e.key === 'Escape' && this.sheet) { this.sheet = null; this.render(); return; }
    const fader = e.target.closest('[data-slider]');
    const step = { ArrowRight: 10, ArrowUp: 10, ArrowLeft: -10, ArrowDown: -10 }[e.key];
    if (!fader || !step) return;
    e.preventDefault();
    const id = fader.dataset.slider;
    const current = lightView(this._hass.states[id], this.pending[id]).level;
    this.setLevel(id, Math.max(1, Math.min(100, current + step)));
    this.stage.querySelector(`[data-slider="${id}"]`)?.focus();
  }

  async loadHistory() {
    const power = this.config.energy?.power;
    if (!power) return;
    this.historyAt = Date.now();
    try {
      const start = new Date(Date.now() - 24 * 3600_000).toISOString();
      const res = await this._hass.callWS({ type: 'history/history_during_period', start_time: start, entity_ids: [power], minimal_response: true, no_attributes: true });
      this.history = bucketSeries(seriesFromHistory(res[power] ?? []));
      this.render();
    } catch (err) {
      console.error(`stage-card: loading 24 h history for ${power} failed`, err);
    }
  }
}

customElements.define('stage-card', StageCard);
window.customCards = window.customCards || [];
window.customCards.push({ type: 'stage-card', name: 'Stage', description: 'Room-as-hero dashboard with photo lighting' });

})();
