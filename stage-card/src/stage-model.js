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
