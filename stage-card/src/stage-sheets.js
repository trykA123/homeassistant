import { esc, icon, st, tvView, roomLights } from './stage-views.js';
import { SWATCHES, swatchCss, kelvinToPercent, swatchServiceData } from './stage-model.js';

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

export function sheetHtml(ctx, sheet) {
  if (!sheet) return '';
  const [kind, arg] = sheet.split(':');
  const body = kind === 'tv' ? tvSheet(ctx) : kind === 'light' ? lightSheet(ctx, sheet.slice(6)) : kind === 'room' ? roomSheet(ctx, arg) : '';
  return `<div class="scrim" data-key="scrim" data-act="sheet"></div><section class="sheet" data-key="sheet-${esc(kind)}" role="dialog" aria-label="Controls"><div class="grip"></div>${body}</section>`;
}
