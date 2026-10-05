import { lightView, roomLight, roomStatus, appName, formatNumber, isOn } from './stage-model.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const icon = (name) => `<ha-icon icon="${esc(name)}"></ha-icon>`;
const st = (ctx, id) => (id ? ctx.hass.states[id] : undefined);
const num = (ctx, id, digits) => formatNumber(st(ctx, id)?.state, digits);

export { esc, icon, st, tvView };

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
  return { on: isOn(s), app: appName(app), title: s?.attributes.media_title };
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
  const swatch = (s) => `<i style="--sw:${esc(s?.swatch ?? 'var(--glass-hi)')}"></i>`;
  const options = ctx.scenesOpen ? `<div class="menu-list" role="listbox" aria-label="Scenes">${scenes.map((s) => `<button class="menu-item" role="option" data-act="scene" data-arg="${s.entity}" aria-selected="${s === active}">${swatch(s)}<span class="grow">${esc(s.name)}</span>${s === active ? icon('mdi:check') : ''}</button>`).join('')}</div>` : '';
  return `<section class="sec"><h2>Scene</h2>
    <button class="select" data-act="scenes-menu" aria-haspopup="listbox" aria-expanded="${!!ctx.scenesOpen}">${swatch(active)}<span class="grow"><b>${esc(active?.name ?? 'Choose a scene')}</b>${active ? '<span class="muted">Last used</span>' : ''}</span>${icon(ctx.scenesOpen ? 'mdi:chevron-up' : 'mdi:chevron-down')}</button>${options}</section>`;
}

export function lastUsedScene(ctx, scenes) {
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
    <span class="np-badge">${icon(home ? 'mdi:television' : 'mdi:play-circle-outline')}</span>
    <span class="grow"><b>${esc(tv.title || (home ? 'Home screen' : tv.app))}</b><span class="muted">${esc(home ? 'TV is on' : `${tv.app} on TV`)}</span></span>
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
  return `<section class="page" data-key="${esc(room.id)}" aria-label="${esc(room.name)}" style="--lux:${light.lux};--warmth:${light.warmth}">
    <div class="photo"><img src="${esc(room.photo)}" alt="" ${pos}></div>
    <div class="content">
      <div class="hero"><div class="eyebrow">${chips(ctx, room)}</div><h1>${esc(room.name)}</h1><div class="status">${esc(roomStatus({ lights, tvOn: tv?.on, fan }))}</div></div>
      <div class="strip">${tiles}</div>
      <div class="strip-foot"><p class="hint">Icon switches · card opens colour</p>${lights.length > 1 ? `<button class="pill-btn" data-act="sheet" data-arg="room:${room.id}">${icon('mdi:palette-outline')} All lights</button>` : ''}</div>
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
  return `<div class="chrome" data-key="chrome"><div class="bar"><span class="mark"><button class="menu" data-act="menu" aria-label="Open menu">${icon('mdi:menu')}</button>${esc(ctx.config.title ?? 'Home')}</span>
    <span class="who"><span class="dot ${home ? '' : 'away'}"></span>${esc(person?.attributes.friendly_name ?? '')} ${home ? 'is home' : 'is away'} · <span class="num">${time}</span></span></div>
    <nav class="tabs" aria-label="Rooms">${tabs}<span class="ink-bar"></span></nav></div>`;
}
