const HOLD_MS = 480;
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

function startMode(g, dx, dy) {
  if (g.isFader && Math.abs(dx) > 4) return 'dim';
  if (!g.isFader && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) return 'dim';
  if (Math.abs(dx) > 10 || Math.abs(dy) > 10) return 'scroll';
  return null;
}

export function attachGestures(root, { levelOf, onLive, onCommit, onHold, onTap }) {
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
