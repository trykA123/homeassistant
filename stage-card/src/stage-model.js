export const APP_NAMES = {
  'com.github.damontecres.wholphin': 'Wholphin',
  'org.moonfin.androidtv': 'Moonfin',
  'org.jellyfin.androidtv': 'Jellyfin',
  'com.google.android.youtube.tv': 'YouTube',
  'com.google.android.youtube.tvmusic': 'YouTube Music',
  'com.leanbitlab.ltvL': 'Home screen',
  'com.leanbitlab.ltvL.a3': 'Home screen',
};

export const isOn = (stateObj) => stateObj?.state === 'on';

const COLOR_MODES = ['hs', 'rgb', 'rgbw', 'rgbww', 'xy'];

export function lightCapabilities(attributes) {
  const modes = attributes.supported_color_modes ?? [];
  return {
    color: modes.some((m) => COLOR_MODES.includes(m)),
    temperature: modes.includes('color_temp'),
    dimmable: modes.some((m) => m !== 'onoff'),
    minKelvin: attributes.min_color_temp_kelvin ?? 2200,
    maxKelvin: attributes.max_color_temp_kelvin ?? 6500,
  };
}

export const kelvinToPercent = (k, min, max) => Math.round(((k - min) / (max - min)) * 100);
export const percentToKelvin = (p, min, max) => Math.round((min + (p / 100) * (max - min)) / 50) * 50;

export function lightView(stateObj, pending) {
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
    rgb: stateObj.attributes.rgb_color ?? null,
    kelvin: stateObj.attributes.color_temp_kelvin ?? null,
    caps: lightCapabilities(stateObj.attributes),
  };
}

export function roomLight(lights) {
  if (lights.length === 0) return { lux: 0.9, warmth: 0 };
  const total = lights.reduce((sum, light) => sum + light.level, 0) / (lights.length * 100);
  const lit = Math.min(1, total * 2.2);
  return { lux: +(0.58 + lit * 0.5).toFixed(3), warmth: +Math.min(1, total * 2.5).toFixed(3) };
}

export function roomStatus({ lights, tvOn, fan }) {
  const lit = lights.filter((light) => light.on).length;
  const parts = [lit ? `${lit} of ${lights.length} lights on` : lights.length ? 'Lights off' : ''];
  if (tvOn) parts.push('TV playing');
  if (fan?.on) parts.push(`fan ${fan.level}%`);
  return parts.filter(Boolean).join(' · ') || 'All quiet';
}

export const appName = (appId) => APP_NAMES[appId] ?? appId ?? '';

export function formatNumber(value, digits = 1) {
  const n = Number.parseFloat(value);
  return Number.isFinite(n) ? n.toFixed(digits).replace(/\.0+$/, '') : '—';
}

export function serviceForScene(entityId) {
  const domain = entityId.split('.')[0];
  return domain === 'script' ? ['script', 'turn_on'] : ['scene', 'turn_on'];
}

export function seriesFromHistory(points, now = Date.now(), hours = 24) {
  const start = now - hours * 3600_000;
  return points
    .map((p) => ({ t: p.lu ? p.lu * 1000 : Date.parse(p.last_updated ?? p.last_changed), v: Number.parseFloat(p.s ?? p.state) }))
    .filter((p) => Number.isFinite(p.v) && p.t >= start)
    .sort((a, b) => a.t - b.t);
}

export function bucketSeries(series, { now = Date.now(), hours = 24, buckets = 96 } = {}) {
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

export const SWATCHES = [
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

export function swatchCss(swatch) {
  if (swatch.rgb) return `rgb(${swatch.rgb.join(' ')})`;
  const t = (swatch.kelvin - 2200) / 3800;
  return `oklch(${88 + t * 8}% ${0.12 - t * 0.11} ${70 + t * 160})`;
}

export function hexToRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!m) throw new Error(`not a #rrggbb colour: ${hex}`);
  const n = Number.parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function swatchServiceData(swatch, light) {
  if (swatch.rgb) return light.caps.color ? { rgb_color: swatch.rgb } : null;
  if (light.caps.temperature) return { color_temp_kelvin: Math.min(light.caps.maxKelvin, Math.max(light.caps.minKelvin, swatch.kelvin)) };
  return null;
}
