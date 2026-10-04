const H = 150;
const PAD = { top: 12, right: 8, bottom: 22, left: 34 };

const niceMax = (v) => {
  if (!(v > 0)) return 10;
  const mag = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10, 20].map((m) => m * mag).find((m) => m >= v);
};
const hourLabel = (t) => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

export function chartGeometry(points, W = 320) {
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

export function chartSvg(points, { unit = 'W', width = 320 } = {}) {
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

export function attachChartHover(root, points, { unit = 'W', width = 320 } = {}) {
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
