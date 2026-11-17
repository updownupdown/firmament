// The "what if?" sandbox: the planets from above, moved by gravity alone, with
// a heavier Jupiter or a passing star to pick.

import type { App } from '../app.ts';
import { PLANETS, Sandbox, type WhatIf } from '../journeys/sandbox.ts';
import { fill, h, icon, iconButton } from './dom.ts';
import { type PlotView, palette, prepare } from './plot-kit.ts';

export type SandboxControls = 'none' | 'jupiter' | 'star';

const NAMES: Record<string, string> = {
  sun: 'Sun', mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', star: 'Star',
};
/** Half the width of the view (AU), and simulated years per real second at that size. */
const ZOOMS = [
  { label: 'Inner', span: 2.2, years: 1 },
  { label: 'To Jupiter', span: 6.5, years: 4 },
  { label: 'All', span: 36, years: 25 },
];
const JUPITER_MASS = [1, 10, 100, 1000];
const STAR_CLOSEST = [100, 30, 10, 3, 1];
const TRAIL = 240;

export function sandboxPlot(app: App, controls: SandboxControls): PlotView {
  const canvas = h('canvas', { class: 'plot-canvas plot-still', role: 'img', 'aria-label': 'The Sun and the planets seen from above, moving under gravity.' });
  const readout = h('p', { class: 'plot-readout', 'aria-live': 'polite' });
  const choose = h('div', { class: 'segmented', role: 'group' });
  const zoomRow = h('div', { class: 'segmented', role: 'group', 'aria-label': 'How much to show' });
  let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const play = iconButton(playing ? 'pause' : 'play', playing ? 'Pause' : 'Play', () => setPlaying(!playing));
  const restart = iconButton('reset', 'Start again', () => reset());
  const bar = h('div', { class: 'plot-bar' }, play, restart, zoomRow);
  const el = h('div', { class: 'plot' }, canvas, ...(controls === 'none' ? [] : [choose]), bar, readout);

  let zoom = 2;
  let jupiter = controls === 'jupiter' ? 100 : 1;
  let closest = controls === 'star' ? 10 : 100;
  let sb: Sandbox;
  const trails = new Map<string, Float32Array>();
  let trailAt = 0, trailCount = 0;
  let lost: string[] = [];

  const whatIf = (): WhatIf => ({
    jupiter,
    star: controls === 'star' ? { mass: 1, closest, kms: 20, from: 160 } : undefined,
  });
  const reset = () => {
    sb = new Sandbox(app.universe.eph, app.universe.frame.jdTT, whatIf());
    trails.clear(); trailAt = 0; trailCount = 0; lost = [];
    for (const p of sb.sim.particles) trails.set(p.id, new Float32Array(TRAIL * 2));
    sample();
    words();
    draw();
  };
  const sample = () => {
    // Trails are kept relative to the Sun, which a passing star can drag away.
    const sun = sb.get('sun')!;
    for (const p of sb.sim.particles) {
      const t = trails.get(p.id)!;
      t[trailAt * 2] = p.x - sun.x; t[trailAt * 2 + 1] = p.y - sun.y;
    }
    trailAt = (trailAt + 1) % TRAIL;
    trailCount = Math.min(TRAIL, trailCount + 1);
  };
  const words = () => {
    const years = Math.floor(sb.days / 365.25);
    const gone = PLANETS.filter((id) => !sb.bound(id) && sb.distance(id) > 3);
    if (gone.join() !== lost.join()) lost = gone;
    const list = (ids: string[]) => ids.map((id) => NAMES[id]).join(', ').replace(/, ([^,]*)$/, ' and $1');
    const fate = lost.length === 0 ? 'All eight planets still go round the Sun.' : `${list(lost)} ${lost.length > 1 ? 'have' : 'has'} been thrown out of the solar system.`;
    readout.textContent = `Year ${years}. ${fate}`;
  };

  const draw = () => {
    const ready = prepare(canvas);
    if (!ready) return;
    const { g, w, h: hgt } = ready;
    const c = palette(el);
    const sun = sb.get('sun')!;
    const k = Math.min(w, hgt) / 2 / ZOOMS[zoom].span;
    const px = (x: number, y: number): [number, number] => [w / 2 + x * k, hgt / 2 - y * k];
    const colour = (id: string) => id === 'sun' || id === 'star' ? c.sun : id === 'earth' ? c.earth : id === 'mars' ? c.mars : id === 'jupiter' ? c.accent : c.text;
    g.font = `11px ${c.font}`;
    // Trails, oldest first.
    for (const [id, t] of trails) {
      if (id === 'sun') continue;
      g.beginPath();
      for (let n = 0; n < trailCount; n++) {
        const i = (trailAt - trailCount + n + TRAIL) % TRAIL;
        const q = px(t[i * 2], t[i * 2 + 1]);
        if (n) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
      }
      g.strokeStyle = colour(id); g.globalAlpha = 0.45; g.lineWidth = 1; g.stroke(); g.globalAlpha = 1;
    }
    for (const p of sb.sim.particles) {
      const q = px(p.x - sun.x, p.y - sun.y);
      if (q[0] < -20 || q[0] > w + 20 || q[1] < -20 || q[1] > hgt + 20) continue;
      const r = p.id === 'sun' || p.id === 'star' ? 5 : p.id === 'jupiter' ? 2.5 + Math.log10(jupiter) : 2.5;
      g.fillStyle = colour(p.id); g.beginPath(); g.arc(q[0], q[1], r, 0, Math.PI * 2); g.fill();
      // Name the bodies big enough to tell apart at this zoom.
      const reach = Math.hypot(p.x - sun.x, p.y - sun.y);
      if (p.id !== 'sun' && (reach > ZOOMS[zoom].span * 0.12 || p.id === 'star')) {
        g.fillStyle = c.faint; g.textAlign = 'left'; g.fillText(NAMES[p.id], q[0] + 6, q[1] - 5);
      }
    }
    g.fillStyle = c.faint; g.textAlign = 'right';
    g.fillText(`${ZOOMS[zoom].span * 2 >= 10 ? Math.round(ZOOMS[zoom].span * 2) : (ZOOMS[zoom].span * 2).toFixed(1)} AU across`, w - 8, hgt - 8);
  };

  // ------------------------------------------------------------ controls
  const fillChoices = () => {
    if (controls === 'jupiter') {
      choose.setAttribute('aria-label', 'Jupiter\'s mass');
      choose.replaceChildren(...JUPITER_MASS.map((m) => h('button', {
        type: 'button', 'aria-pressed': String(m === jupiter), onclick: () => { jupiter = m; fillChoices(); reset(); },
      }, m === 1 ? 'Real' : `×${m.toLocaleString('en')}`)));
    } else if (controls === 'star') {
      choose.setAttribute('aria-label', 'How close the star comes');
      choose.replaceChildren(...STAR_CLOSEST.map((d) => h('button', {
        type: 'button', 'aria-pressed': String(d === closest), onclick: () => { closest = d; fillChoices(); reset(); },
      }, `${d} AU`)));
    }
    zoomRow.replaceChildren(...ZOOMS.map((z, i) => h('button', {
      type: 'button', 'aria-pressed': String(i === zoom), onclick: () => { zoom = i; fillChoices(); draw(); },
    }, z.label)));
  };
  const setPlaying = (on: boolean) => {
    playing = on;
    fill(play, icon(on ? 'pause' : 'play'));
    play.setAttribute('aria-label', on ? 'Pause' : 'Play'); play.title = on ? 'Pause' : 'Play';
    if (on) loop();
  };

  // ------------------------------------------------------------ animation
  let last = 0, shown = false, frame = 0;
  const loop = () => {
    cancelAnimationFrame(frame);
    last = 0;
    const tick = (now: number) => {
      if (!el.isConnected) { if (shown) return; frame = requestAnimationFrame(tick); return; }
      shown = true;
      if (!playing) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (dt > 0) {
        sb.advance(ZOOMS[zoom].years * 365.25 * dt);
        sample();
        words();
        draw();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  };

  fillChoices();
  reset();
  if (playing) loop();
  new ResizeObserver(() => draw()).observe(canvas);
  // Nothing hidden to reveal: everything is on show.
  return { el, onAttempt: null, reveal() { draw(); } };
}
