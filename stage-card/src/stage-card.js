import { styles } from './stage-styles.js';
import { pageHtml, chromeHtml, sheetHtml } from './stage-views.js';
import { attachGestures } from './stage-gestures.js';
import { attachChartHover, chartSvg } from './stage-chart.js';
import { serviceForScene, seriesFromHistory, bucketSeries, roomLight, lightView } from './stage-model.js';

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
