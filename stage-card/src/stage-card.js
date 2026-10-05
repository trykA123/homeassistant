import { styles } from './stage-styles.js';
import { pageHtml, chromeHtml } from './stage-views.js';
import { sheetHtml } from './stage-sheets.js';
import { attachFaders } from './stage-gestures.js';
import { attachChartHover, chartSvg } from './stage-chart.js';
import { morph } from './stage-morph.js';
import { serviceForScene, seriesFromHistory, bucketSeries, roomLight, lightView } from './stage-model.js';
import { roomOf, faderText, faderCall, colorCalls, selectedLights } from './stage-lights.js';

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
