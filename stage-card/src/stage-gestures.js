const LIVE_EVERY_MS = 250;
const clamp = (v) => Math.max(1, Math.min(100, Math.round(v)));

export function attachFaders(root, { onPreview, onSend }) {
  let drag = null;

  const valueAt = (el, clientX) => {
    const box = el.getBoundingClientRect();
    return clamp(((clientX - box.left) / box.width) * 100);
  };

  root.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-slider]');
    if (!el) return;
    drag = { el, key: el.dataset.slider, x: e.clientX, moved: false, sentAt: 0, value: null };
    el.setPointerCapture(e.pointerId);
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag) return;
    if (!drag.moved && Math.abs(e.clientX - drag.x) < 4) return;
    drag.moved = true;
    drag.el.classList.add('drag');
    drag.value = valueAt(drag.el, e.clientX);
    onPreview(drag.el, drag.key, drag.value);
    const now = performance.now();
    if (now - drag.sentAt > LIVE_EVERY_MS) { drag.sentAt = now; onSend(drag.key, drag.value, false); }
  });

  const finish = (cancelled) => {
    if (!drag) return;
    const { el, key, moved, x } = drag;
    const value = drag.value ?? valueAt(el, x);
    drag = null;
    el.classList.remove('drag');
    if (cancelled) return;
    if (!moved) onPreview(el, key, value);
    onSend(key, value, true);
  };
  root.addEventListener('pointerup', () => finish(false));
  root.addEventListener('pointercancel', () => finish(true));

  return { isActive: () => drag != null };
}
