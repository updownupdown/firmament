// The solar system from above, drawn on a 2D canvas from the geometry in
// learn/orbits.ts: Kepler's triangulation, Mars's orbit from fixes, and the
// Mars transfer. Each reports a "miss" (AU for a tap, degrees for a launch date).

import type { Plot } from '../learn/tasks.ts';
import { type MarsFix, type Transfer, type Vec2, MARS_YEAR, eclipticXY, hohmann, marsFix, marsTrack, transferPoint } from '../learn/orbits.ts';
import { formatDate } from '../sim/format.ts';
import type { App } from '../app.ts';
import { h } from './dom.ts';
import { type PlotView, palette, prepare } from './plot-kit.ts';

const AU_SPAN = 1.85;

/** The solar system from above: Kepler's triangulation and the Mars transfer. */
export function orbitPlot(app: App, plot: Extract<Plot, { kind: 'triangulate' | 'mars-orbit' | 'transfer' }>): PlotView {
  const canvas = h('canvas', { class: 'plot-canvas', role: 'img' });
  const readout = h('p', { class: 'plot-readout', 'aria-live': 'polite' });
  const el = h('div', { class: 'plot' }, canvas, readout);
  const eph = app.universe.eph;
  const ut = (jd: number) => formatDate(jd, app.site);
  let revealed = false;
  let tapped: Vec2 | null = null;
  let picked: MarsFix | null = null;

  // ------------------------------------------------------------ geometry
  let fix: MarsFix | null = null, track: MarsFix[] = [], transfer: Transfer | null = null;
  let earthOrbit: Vec2[] = [], marsOrbit: Vec2[] = [];
  const ring = (id: 'earth' | 'mars', jd: number, days: number) => {
    const out: Vec2[] = [];
    for (let k = 0; k <= 120; k++) {
      const t = jd + (days * k) / 120;
      out.push(eclipticXY(id === 'earth' ? eph.earth(t) : eph.helio('mars', t)));
    }
    return out;
  };
  if (plot.kind === 'triangulate') {
    fix = marsFix(eph, plot.jd);
    earthOrbit = ring('earth', plot.jd, 365.25);
    canvas.setAttribute('aria-label', 'The Sun, the Earth\'s orbit, two positions of the Earth and two sight lines toward Mars.');
  } else if (plot.kind === 'mars-orbit') {
    track = marsTrack(eph, plot.jd0, plot.count);
    earthOrbit = ring('earth', plot.jd0, 365.25);
    marsOrbit = ring('mars', plot.jd0, MARS_YEAR);
    canvas.setAttribute('aria-label', `The Sun, the Earth's orbit and ${track.length} positions of Mars found by triangulation.`);
  } else {
    earthOrbit = ring('earth', plot.start, 365.25);
    marsOrbit = ring('mars', plot.start, MARS_YEAR);
    canvas.setAttribute('aria-label', 'The Sun, the orbits of the Earth and Mars, and a transfer path between them.');
  }

  // ------------------------------------------------------------ drawing
  let scale = 1, cx = 0, cy = 0;
  const toPx = (p: Vec2): Vec2 => [cx + p[0] * scale, cy - p[1] * scale];
  const fromPx = (x: number, y: number): Vec2 => [(x - cx) / scale, (cy - y) / scale];

  const draw = () => {
    const ready = prepare(canvas);
    if (!ready) return;
    const { g, w, h: hgt } = ready;
    const c = palette(el);
    scale = Math.min(w, hgt) / 2 / AU_SPAN;
    cx = w / 2; cy = hgt / 2;

    const path = (pts: Vec2[], color: string, width = 1, dash: number[] = []) => {
      g.beginPath();
      pts.forEach((p, i) => { const q = toPx(p); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); });
      g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.stroke(); g.setLineDash([]);
    };
    const dot = (p: Vec2, r: number, color: string, ring = false) => {
      const q = toPx(p);
      g.beginPath(); g.arc(q[0], q[1], r, 0, Math.PI * 2);
      if (ring) { g.strokeStyle = color; g.lineWidth = 1.5; g.stroke(); } else { g.fillStyle = color; g.fill(); }
    };
    const label = (p: Vec2, text: string, color = c.text, dx = 8, dy = -8) => {
      const q = toPx(p);
      g.font = `12px ${c.font}`; g.fillStyle = color;
      // Keep the words inside the canvas: flip to the other side of the point if they would spill.
      const width = g.measureText(text).width;
      let right = dx < 0;
      if (right && q[0] + dx - width < 2) right = false;
      else if (!right && q[0] + dx + width > w - 2) right = true;
      g.textAlign = right ? 'right' : 'left';
      g.fillText(text, q[0] + (right ? -Math.abs(dx) : Math.abs(dx)), q[1] + dy);
    };
    const sight = (from: Vec2, dir: Vec2) => path([from, [from[0] + dir[0] * 4, from[1] + dir[1] * 4]], c.sight, 1.2);

    path(earthOrbit, c.orbit, 1, [4, 4]);
    if (plot.kind === 'transfer') path(marsOrbit, c.orbit, 1, [4, 4]);
    dot([0, 0], 6, c.sun);

    if (fix) {
      sight(fix.earth1, fix.look1); sight(fix.earth2, fix.look2);
      dot(fix.earth1, 4.5, c.earth); dot(fix.earth2, 4.5, c.earth);
      label(fix.earth1, ut(fix.jd1)); label(fix.earth2, ut(fix.jd2));
      if (tapped && !revealed) dot(tapped, 6, c.faint, true);
      if (revealed) { dot(fix.mars, 5, c.mars); label(fix.mars, 'Mars', c.mars); }
    }
    if (track.length) {
      // Once the shape is the point, show the true orbit through the fixes.
      if (revealed) path(marsOrbit, c.mars, 1, [2, 4]);
      if (picked) {
        path([picked.earth1, picked.mars], c.sight, 1); path([picked.earth2, picked.mars], c.sight, 1);
        dot(picked.earth1, 3.5, c.earth); dot(picked.earth2, 3.5, c.earth);
      }
      for (const f of track) dot(f.mars, 4, c.mars);
      if (picked) dot(picked.mars, 8, c.mars, true);
      label([AU_SPAN * 0.98, -AU_SPAN * 0.98], 'Seen from above the ecliptic', c.faint, -4, 0);
    }
    if (transfer) {
      const t = transfer;
      const arc: Vec2[] = [];
      for (let k = 0; k <= 60; k++) arc.push(transferPoint(t, k / 60));
      path(arc, c.text, 1.5, [5, 4]);
      dot(t.earthAtLaunch, 4.5, c.earth); label(t.earthAtLaunch, 'Earth at launch');
      dot(t.meet, 7, c.text, true);
      dot(t.marsAtArrival, 4.5, c.mars); label(t.marsAtArrival, 'Mars on arrival', c.mars, -8, 16);
    }
  };

  // ------------------------------------------------------------ interaction
  const pointer = (e: PointerEvent): Vec2 => {
    const r = canvas.getBoundingClientRect();
    return fromPx(e.clientX - r.left, e.clientY - r.top);
  };
  const view: PlotView = {
    el, onAttempt: null,
    reveal() { revealed = true; draw(); },
  };

  if (plot.kind === 'triangulate') {
    readout.textContent = 'Tap the diagram where the lines cross.';
    canvas.addEventListener('pointerup', (e) => {
      if (!fix) return;
      tapped = pointer(e);
      draw();
      view.onAttempt?.(Math.hypot(tapped[0] - fix.mars[0], tapped[1] - fix.mars[1]));
    });
  } else if (plot.kind === 'mars-orbit') {
    readout.textContent = 'Tap a red point to read its distance from the Sun.';
    canvas.addEventListener('pointerup', (e) => {
      const p = pointer(e);
      let best: MarsFix | null = null, bestD = 16 / scale;
      for (const f of track) {
        const d = Math.hypot(f.mars[0] - p[0], f.mars[1] - p[1]);
        if (d < bestD) { bestD = d; best = f; }
      }
      if (!best) return;
      picked = best;
      readout.textContent = `This point is ${Math.hypot(best.mars[0], best.mars[1]).toFixed(2)} AU from the Sun. Seen ${ut(best.jd1)} and ${ut(best.jd2)}.`;
      draw();
    });
  } else {
    const slider = h('input', {
      class: 'plot-slider', type: 'range', min: '0', max: String(Math.round(plot.to - plot.from)), step: '1',
      value: String(Math.round(plot.start - plot.from)), 'aria-label': 'Launch date',
    });
    const update = (attempt: boolean) => {
      const jd = plot.from + Number(slider.value);
      transfer = hohmann(eph, jd);
      const miss = transfer.missDeg;
      const where = Math.abs(miss) < 2 ? 'Mars is there to meet it' : miss > 0 ? `Mars is ${Math.round(miss)}° past the meeting point` : `Mars is ${Math.round(-miss)}° short of the meeting point`;
      readout.textContent = `Launch ${ut(jd)} · ${Math.round(transfer.days)} days to arrive on ${ut(transfer.arrive)} · ${where}.`;
      slider.setAttribute('aria-valuetext', ut(jd));
      draw();
      if (attempt) view.onAttempt?.(miss);
    };
    slider.addEventListener('input', () => update(true));
    el.insertBefore(slider, readout);
    update(false);
  }

  new ResizeObserver(() => draw()).observe(canvas);
  return view;
}
