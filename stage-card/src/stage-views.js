import { lightView, roomLight, roomStatus, appName, formatNumber, isOn } from './stage-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const icon = (name) => `<ha-icon icon="${esc(name)}"></ha-icon>`;
const st = (ctx, id) => (id ? ctx.hass.states[id] : undefined);
const num = (ctx, id, digits) => formatNumber(st(ctx, id)?.state, digits);

export function roomLights(ctx, room) {
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

export function pageHtml(ctx, room) {
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

export function chromeHtml(ctx, page) {
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

export function sheetHtml(ctx, sheet) {
  if (!sheet) return '';
  const room = ctx.config.rooms.find((r) => r.id === sheet);
  const body = sheet === 'tv' ? tvSheet(ctx) : room ? roomSheet(ctx, room) : '';
  return `<div class="scrim" data-act="sheet"></div><section class="sheet" role="dialog" aria-label="Controls"><div class="grip"></div>${body}</section>`;
}
