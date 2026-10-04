export const styles = `
:host {
  --space-1: 4px; --space-2: 8px; --space-3: 12px; --space-4: 16px; --space-5: 24px; --space-6: 32px;
  --r-s: 14px; --r-m: 22px; --r-l: 30px; --r-full: 999px;
  --fs-11: .6875rem; --fs-12: .75rem; --fs-13: .8125rem; --fs-14: .875rem; --fs-16: 1rem; --fs-20: 1.25rem; --fs-52: 3.25rem;
  --ease-out: cubic-bezier(.23, 1, .32, 1);
  --ease-io: cubic-bezier(.65, 0, .35, 1);
  --dur-fast: 160ms; --dur-ui: 260ms; --dur-light: 900ms;
  --z-chrome: 10; --z-sheet: 30;
  --ink: oklch(98% .004 80);
  --ink-2: oklch(98% .004 80 / .8);
  --ink-3: oklch(98% .004 80 / .62);
  --glass: oklch(22% .01 60 / .42);
  --glass-hi: oklch(100% 0 0 / .14);
  --glass-line: oklch(100% 0 0 / .16);
  --deck: oklch(13% .008 60 / .6);
  --deck-card: oklch(100% 0 0 / .06);
  --warm: oklch(88% .085 78);
  --warm-ink: oklch(24% .035 60);
  --chart: oklch(86% .1 75);
  --ok: oklch(80% .14 150);
  --sheet-bg: oklch(16% .008 60 / .9);
  display: block;
  font-family: "Inter Variable", Inter, system-ui, sans-serif;
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; border: 0; background: none; padding: 0; cursor: pointer; -webkit-tap-highlight-color: transparent; }
button:focus-visible, [role="slider"]:focus-visible { outline: 2px solid var(--ink); outline-offset: 3px; }
ha-icon { --mdc-icon-size: 22px; display: inline-flex; }
.num { font-variant-numeric: tabular-nums; }
.stage { position: relative; height: 100dvh; overflow: hidden; background: #000; isolation: isolate; }

.chrome { position: absolute; inset: 0 0 auto; z-index: var(--z-chrome); padding: calc(env(safe-area-inset-top) + 18px) var(--space-5) var(--space-3); background: linear-gradient(180deg, oklch(0% 0 0 / .5), transparent); }
.chrome::before { content: ""; position: absolute; inset: 0; z-index: -1; background: oklch(12% .008 60 / .7); backdrop-filter: blur(24px) saturate(1.4); -webkit-backdrop-filter: blur(24px) saturate(1.4); border-bottom: 1px solid var(--glass-line); opacity: 0; transition: opacity var(--dur-ui) var(--ease-out); }
.chrome.solid::before { opacity: 1; }
.bar { display: flex; align-items: center; justify-content: space-between; gap: var(--space-3); }
.mark { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-13); font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
.menu { width: 32px; height: 32px; margin-left: -6px; border-radius: var(--r-full); display: grid; place-items: center; }
.who { display: flex; align-items: center; gap: var(--space-2); font-size: var(--fs-13); color: var(--ink-2); white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: var(--r-full); background: var(--ok); box-shadow: 0 0 0 3px oklch(80% .14 150 / .25); }
.dot.away { background: var(--ink-3); box-shadow: none; }
.tabs { position: relative; display: flex; gap: var(--space-5); margin-top: var(--space-4); }
.tab { padding-block: var(--space-2); font-size: var(--fs-14); font-weight: 500; color: var(--ink-3); transition: color var(--dur-ui) var(--ease-out); white-space: nowrap; }
.tab[aria-current] { color: var(--ink); }
.tab sup { font-size: var(--fs-11); margin-left: 2px; color: var(--warm); }
.ink-bar { position: absolute; left: 0; bottom: -1px; height: 2px; border-radius: 2px; background: var(--ink); transition: transform var(--dur-ui) var(--ease-out), width var(--dur-ui) var(--ease-out); }

.pager { position: absolute; inset: 0; display: flex; overflow-x: auto; overflow-y: hidden; scroll-snap-type: x mandatory; scrollbar-width: none; overscroll-behavior-x: contain; }
.pager::-webkit-scrollbar, .page::-webkit-scrollbar, .strip::-webkit-scrollbar, .scenes::-webkit-scrollbar { display: none; }
.page { position: relative; flex: 0 0 100%; height: 100%; overflow-y: auto; overflow-x: hidden; scroll-snap-align: start; scroll-snap-stop: always; scrollbar-width: none; container-type: size; }
.photo { position: sticky; top: 0; height: 100cqh; margin-bottom: -100cqh; overflow: hidden; }
.photo img { width: 100%; height: 100%; object-fit: cover; display: block; transform: scale(1.04); filter: brightness(var(--lux, 1)) saturate(calc(.7 + var(--lux, 1) * .3)); transition: filter var(--dur-light) var(--ease-io); }
.photo::before { content: ""; position: absolute; inset: 0; z-index: 1; background: radial-gradient(70% 45% at 50% 42%, oklch(80% .12 70 / calc(var(--warmth, 0) * .32)), transparent 70%); mix-blend-mode: soft-light; }
.photo::after { content: ""; position: absolute; inset: 0; z-index: 2; background: linear-gradient(180deg, oklch(0% 0 0 / .45) 0%, transparent 22%, transparent 38%, oklch(0% 0 0 / .35) 55%, oklch(8% .006 60 / .9) 80%, oklch(8% .006 60 / .96) 100%); }
.content { position: relative; z-index: 3; width: min(100%, 560px); padding: 0 var(--space-5); }
.hero { padding-top: clamp(132px, 27cqh, 260px); }
.eyebrow { display: flex; flex-wrap: wrap; gap: var(--space-2); }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 var(--space-3); border-radius: var(--r-full); background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(14px) saturate(1.3); -webkit-backdrop-filter: blur(14px) saturate(1.3); font-size: var(--fs-12); font-weight: 500; }
.chip ha-icon { --mdc-icon-size: 15px; }
.chip.warn { color: var(--warm); }
h1 { margin: var(--space-3) 0 var(--space-1); font-size: var(--fs-52); line-height: .98; font-weight: 600; letter-spacing: -.035em; }
.status { font-size: var(--fs-16); color: var(--ink-2); }

.strip { display: flex; gap: var(--space-2); margin: var(--space-5) calc(var(--space-5) * -1) 0; padding: 0 var(--space-5); overflow-x: auto; scroll-snap-type: x mandatory; scroll-padding-inline: var(--space-5); scrollbar-width: none; }
.tile { position: relative; flex: 0 0 136px; height: 128px; scroll-snap-align: start; padding: var(--space-3) var(--space-3) var(--space-4); border-radius: var(--r-m); display: flex; flex-direction: column; justify-content: space-between; text-align: left; overflow: hidden; background: var(--glass); border: 1px solid var(--glass-line); backdrop-filter: blur(20px) saturate(1.4); -webkit-backdrop-filter: blur(20px) saturate(1.4); transition: background var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out), transform var(--dur-fast) var(--ease-out); touch-action: pan-x pan-y; user-select: none; -webkit-user-select: none; }
.tile:active { transform: scale(.97); }
.tile[aria-pressed="true"] { background: oklch(93% .045 82 / .9); color: var(--warm-ink); border-color: transparent; }
.tile[data-unavailable] { opacity: .5; }
.tile .top { display: flex; justify-content: space-between; align-items: flex-start; }
.tile .ic { width: 36px; height: 36px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); }
.tile[aria-pressed="true"] .ic { background: oklch(80% .12 75); }
.tile .val { font-size: var(--fs-13); font-weight: 600; }
.tile b { display: block; font-size: var(--fs-14); font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile .lvl { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-2); height: 3px; border-radius: 3px; background: oklch(0% 0 0 / .12); overflow: hidden; }
.tile .lvl i { display: block; height: 100%; width: calc(var(--v) * 1%); background: currentColor; opacity: .55; border-radius: 3px; transition: width var(--dur-ui) var(--ease-out); }
.tile.dimming { transform: scale(.98); }
.tile.dimming .lvl { height: 6px; }
.hint { margin: var(--space-3) 0 0; font-size: var(--fs-12); color: var(--ink-3); }

.deck { position: relative; margin: var(--space-5) calc(var(--space-5) * -1) 0; padding: var(--space-2) var(--space-5) calc(env(safe-area-inset-bottom) + 96px); border-radius: var(--r-l) var(--r-l) 0 0; background: var(--deck); border-top: 1px solid var(--glass-line); backdrop-filter: blur(32px) saturate(1.5); -webkit-backdrop-filter: blur(32px) saturate(1.5); box-shadow: 0 -24px 48px oklch(0% 0 0 / .4), inset 0 1px 0 oklch(100% 0 0 / .08); min-height: 60cqh; }
.deck::before { content: ""; display: block; width: 36px; height: 4px; border-radius: 4px; background: var(--ink-3); opacity: .5; margin: 0 auto var(--space-2); }
.sec { padding-block: var(--space-5); }
.sec + .sec { border-top: 1px solid oklch(100% 0 0 / .08); }
.sec h2 { margin: 0 0 var(--space-3); font-size: var(--fs-12); letter-spacing: .16em; text-transform: uppercase; font-weight: 600; color: var(--ink-3); }
.scenes { display: flex; gap: var(--space-2); margin-inline: calc(var(--space-5) * -1); padding-inline: var(--space-5); overflow-x: auto; scrollbar-width: none; }
.scene { flex: none; display: flex; align-items: center; gap: var(--space-2); height: 44px; padding: 0 var(--space-4) 0 6px; border-radius: var(--r-full); border: 1px solid var(--glass-line); background: var(--deck-card); font-size: var(--fs-14); font-weight: 500; transition: background var(--dur-ui) var(--ease-out), color var(--dur-ui) var(--ease-out); }
.scene i { width: 32px; height: 32px; border-radius: var(--r-full); background: var(--sw); }
.scene[aria-pressed="true"] { background: var(--ink); color: oklch(15% .01 60); }
.card { display: block; width: 100%; text-align: left; border-radius: var(--r-m); padding: var(--space-4); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .08); }
.card + .card { margin-top: var(--space-2); }
.row { display: flex; align-items: center; gap: var(--space-3); }
.grow { flex: 1; min-width: 0; }
.muted { color: var(--ink-3); font-size: var(--fs-13); }
.pill-btn { flex: none; height: 36px; padding: 0 var(--space-4); border-radius: var(--r-full); background: var(--glass-hi); border: 1px solid var(--glass-line); font-size: var(--fs-13); font-weight: 600; display: inline-flex; align-items: center; gap: 6px; }
.pill-btn.solid { background: var(--ink); color: oklch(15% .01 60); border-color: transparent; }
.pill-btn ha-icon { --mdc-icon-size: 18px; }
.np { position: relative; overflow: hidden; min-height: 132px; display: flex; align-items: flex-end; background: linear-gradient(135deg, oklch(30% .05 40), oklch(18% .03 280)); }
.np img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.np::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, oklch(10% .01 60 / .9), oklch(10% .01 60 / .5) 60%, transparent); }
.np .in { position: relative; z-index: 1; width: 100%; }
.np .app { font-size: var(--fs-11); letter-spacing: .16em; text-transform: uppercase; color: var(--warm); font-weight: 600; }
.np b { display: block; font-size: var(--fs-20); margin: 2px 0 var(--space-3); }
.np-actions { display: flex; gap: var(--space-2); }

.stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-2); }
.stat { border-radius: var(--r-s); padding: var(--space-3); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .06); }
.stat b { display: block; font-size: var(--fs-20); font-weight: 600; letter-spacing: -.01em; }
.stat span { font-size: var(--fs-12); color: var(--ink-3); }
.chart-card { position: relative; margin-block: var(--space-2); padding: var(--space-3) var(--space-3) var(--space-2); border-radius: var(--r-m); background: var(--deck-card); border: 1px solid oklch(100% 0 0 / .06); }
.chart-head { display: flex; justify-content: space-between; align-items: baseline; padding-inline: var(--space-1); font-size: var(--fs-13); color: var(--ink-2); }
.chart-head b { color: var(--ink); font-weight: 600; }
.chart-slot { min-height: 150px; }
.chart { display: block; width: 100%; height: auto; margin-top: var(--space-2); touch-action: pan-y; }
.chart .grid { stroke: oklch(100% 0 0 / .1); stroke-width: 1; }
.chart .tick { fill: var(--ink-3); font-size: 11px; font-family: inherit; font-variant-numeric: tabular-nums; }
.chart .series { fill: none; stroke: var(--chart); stroke-width: 2; stroke-linejoin: round; stroke-linecap: round; }
.chart .now, .chart .cross-dot { fill: var(--chart); stroke: oklch(13% .008 60); stroke-width: 2; }
.chart .cross-line { stroke: var(--ink-3); stroke-width: 1; stroke-dasharray: 3 3; }
.chart-slot { position: relative; }
.chart-tip { position: absolute; top: 0; transform: translateX(-50%); padding: 4px 8px; border-radius: 8px; background: oklch(20% .01 60 / .95); border: 1px solid var(--glass-line); font-size: var(--fs-12); white-space: nowrap; pointer-events: none; color: var(--ink-2); }
.chart-tip b { color: var(--ink); }
.chart-empty { padding: var(--space-5); text-align: center; color: var(--ink-3); font-size: var(--fs-13); }

.scrim { position: absolute; inset: 0; z-index: var(--z-sheet); background: oklch(0% 0 0 / .4); animation: fade var(--dur-ui) var(--ease-out) both; }
.sheet { position: absolute; left: var(--space-2); right: var(--space-2); bottom: calc(env(safe-area-inset-bottom) + var(--space-2)); z-index: calc(var(--z-sheet) + 1); max-width: 520px; margin-inline: auto; max-height: 82%; overflow-y: auto; border-radius: var(--r-l); padding: var(--space-3) var(--space-5) var(--space-5); background: var(--sheet-bg); border: 1px solid var(--glass-line); backdrop-filter: blur(30px) saturate(1.4); -webkit-backdrop-filter: blur(30px) saturate(1.4); animation: up var(--dur-ui) var(--ease-out) both; }
.grip { width: 36px; height: 4px; border-radius: 4px; background: var(--ink-3); margin: 0 auto var(--space-4); }
.sheet header { display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-4); }
.sheet h3 { margin: 0; font-size: var(--fs-20); font-weight: 600; }
.x { width: 36px; height: 36px; border-radius: var(--r-full); display: grid; place-items: center; background: var(--glass-hi); }
.fader { position: relative; height: 64px; border-radius: var(--r-m); background: oklch(100% 0 0 / .08); overflow: hidden; touch-action: none; margin-bottom: var(--space-2); cursor: ew-resize; }
.fader .f { position: absolute; inset: 0 auto 0 0; width: calc(var(--v) * 1%); background: linear-gradient(90deg, oklch(80% .1 75 / .8), oklch(92% .07 85)); transition: width var(--dur-fast) var(--ease-out), opacity var(--dur-ui) var(--ease-out); }
.fader.drag .f { transition: none; }
.fader.off .f { opacity: .15; }
.fader .l { position: absolute; inset: 0; display: flex; align-items: center; justify-content: space-between; padding-inline: var(--space-4); font-weight: 600; font-size: var(--fs-14); }
.fader:not(.off) .l { color: var(--warm-ink); }
.remote { display: grid; grid-template-columns: repeat(3, 64px); justify-content: center; gap: var(--space-3) var(--space-6); margin-block: var(--space-4); }
.rk { width: 64px; height: 64px; border-radius: var(--r-full); display: grid; place-items: center; background: oklch(100% 0 0 / .09); transition: transform var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out); }
.rk:active { transform: scale(.92); background: oklch(100% 0 0 / .18); }
.rk.ok { background: var(--warm); color: var(--warm-ink); font-weight: 700; }
.apps { display: flex; flex-wrap: wrap; gap: var(--space-2); }

@keyframes up { from { transform: translateY(105%); } }
@keyframes fade { from { opacity: 0; } }
@media (min-width: 900px) {
  .content { margin-left: clamp(24px, 6vw, 96px); width: min(100%, 720px); }
  .strip { flex-wrap: wrap; overflow-x: visible; margin-inline: 0; padding-inline: 0; }
  .hero { padding-top: clamp(132px, 30cqh, 300px); }
}
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { animation: none !important; transition: none !important; } }
`;
