// The trip planner: a card over Space view with a porkchop plot (what a trip
// costs by launch date and flight time). Tap the plot to choose a trip; Space
// view draws its path, and "Fly it" runs time from launch to arrival with the
// spacecraft on its way. The physics is in learn/trip.ts.

import { jdFromCalendar } from '../astro/time.ts';
import type { Vec3 } from '../astro/math.ts';
import {
  type Porkchop, TRIP_TARGETS, type Trip, type TripTarget, cellAt, launchWindows, porkchop, trip, tripPath, tripPosition,
} from '../learn/trip.ts';
import type { SpaceOverlay } from '../render/space.ts';
import { formatDate } from '../sim/format.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { spaceLab } from './space-lab.ts';
import { palette, prepare } from './plot-kit.ts';
import type { Shell } from './shell.ts';

/** Perseverance: launched 30 July 2020, landed on Mars 18 February 2021. */
export const PERSEVERANCE = { launch: jdFromCalendar(2020, 7, 30, 11, 50), arrive: jdFromCalendar(2021, 2, 18, 20, 55) };

/** Seconds a whole trip takes to play. */
const FLIGHT_SECONDS = 12;

export interface TripPlanner {
  open(target?: TripTarget): void;
  close(): void;
  readonly isOpen: boolean;
}

function rgb(css: string): Vec3 {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (m) { const n = parseInt(m[1], 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; }
  const r = /rgba?\(([^)]+)\)/.exec(css);
  if (r) { const [a, b, c] = r[1].split(',').map(Number); return [a / 255, b / 255, c / 255]; }
  return [1, 1, 1];
}

export function tripPlanner(shell: Shell): TripPlanner {
  const app = shell.app;
  const eph = app.universe.eph;
  let target: TripTarget = 'mars';
  let pc: Porkchop | null = null;
  let sel: Trip | null = null;
  let flying = false;
  let busy = 0;

  const canvas = h('canvas', { class: 'plot-canvas trip-plot', role: 'img', 'aria-label': 'Porkchop plot: what a trip costs by launch date and flight time. Tap to choose a trip.' });
  const title = h('span', { class: 'trip-window' });
  const readout = h('div', { class: 'trip-readout', 'aria-live': 'polite' });
  const targets = h('div', { class: 'segmented trip-targets', role: 'group', 'aria-label': 'Destination' });
  const flyButton = h('button', { class: 'pill-button primary', type: 'button', onclick: () => (flying ? stopFlying() : fly()) });
  const cheapest = h('button', { class: 'pill-button', type: 'button', onclick: () => { if (pc) choose(pc.best); } }, icon('target', 16), 'Cheapest');
  const percy = h('button', { class: 'pill-button', type: 'button', hidden: true, onclick: () => {
    const t = trip(eph, 'mars', PERSEVERANCE.launch, PERSEVERANCE.arrive - PERSEVERANCE.launch);
    if (t) choose(t);
  } }, 'Perseverance');
  const lab = spaceLab(shell, {
    title: 'Trip planner',
    children: [
      targets,
      h('div', { class: 'trip-nav' },
        iconButton('back', 'Earlier launch window', () => step(-1)), title, iconButton('forward', 'Later launch window', () => step(1))),
      canvas,
      h('p', { class: 'hint trip-key' }, 'Brighter is cheaper. Across: launch date. Up: days in flight.'),
      h('div', { class: 'button-row' }, flyButton, cheapest, percy),
      readout,
    ],
    onClose: () => { busy++; if (flying) stopFlying(); },
  });
  const el = lab.el;

  // ------------------------------------------------------------ choosing

  const date = (jd: number) => formatDate(jd, app.site);

  const renderTargets = () => fill(targets, (Object.keys(TRIP_TARGETS) as TripTarget[]).map((t) => h('button', {
    type: 'button', 'aria-pressed': String(t === target),
    onclick: () => { if (t !== target) { target = t; renderTargets(); lab.frame(REACH[t]); goToWindowNear(app.universe.frame.jdTT); } },
  }, TRIP_TARGETS[t].name)));

  const renderReadout = () => {
    flyButton.replaceChildren(icon(flying ? 'pause' : 'rocket', 16), flying ? 'Stop' : 'Fly it');
    flyButton.disabled = !sel;
    if (!pc) { fill(readout, h('p', { class: 'hint' }, 'Working out the launch windows…')); return; }
    if (!sel) { fill(readout); return; }
    const name = TRIP_TARGETS[sel.target].name;
    const extra = Math.round((sel.total / pc.best.total - 1) * 100);
    const verdict = sel.total - pc.best.total < 0.02 ? 'The cheapest trip in this window.'
      : extra < 2 ? 'Within a whisker of the cheapest in this window.' : `${extra}% more than the cheapest in this window.`;
    fill(readout,
      h('dl', { class: 'facts' },
        h('div', { class: 'fact' }, h('dt', null, 'Launch'), h('dd', null, date(sel.launch))),
        h('div', { class: 'fact' }, h('dt', null, `Reach ${name}`), h('dd', null, date(sel.arrive))),
        h('div', { class: 'fact' }, h('dt', null, 'In flight'), h('dd', null, `${Math.round(sel.days)} days`)),
        h('div', { class: 'fact' }, h('dt', null, 'Speed to add'), h('dd', null, `${sel.total.toFixed(1)} km/s`))),
      h('p', { class: 'hint' }, `${sel.depart.toFixed(1)} km/s leaving the Earth and ${sel.arrival.toFixed(1)} km/s to match ${name} on arrival. ${verdict}`));
  };

  const updateOverlay = () => {
    if (!lab.isOpen || !sel) { app.space.overlay = null; app.invalidate(); return; }
    const p = palette(el);
    const t = sel;
    const overlay: SpaceOverlay = {
      paths: [{ points: tripPath(t), color: rgb(p.accent), alpha: 0.9 }],
      markers: [
        { id: 'arrival', pos: eph.helio(t.target, t.arrive), color: rgb(p.mars), radiusPx: 2.5, label: (jd) => (jd < t.arrive - 1 ? `${TRIP_TARGETS[t.target].name} on arrival` : undefined) },
        { id: 'craft', pos: (jd) => tripPosition(t, jd), color: rgb(p.accent), radiusPx: 3.5, label: (jd) => (jd > t.launch && jd < t.arrive ? 'Spacecraft' : undefined) },
      ],
    };
    app.space.overlay = overlay;
    app.invalidate();
  };

  const choose = (t: Trip) => {
    sel = t;
    if (flying) stopFlying();
    app.setTime(t.launch);
    updateOverlay();
    draw();
    renderReadout();
  };

  const fly = () => {
    if (!sel) return;
    if (app.universe.frame.jdTT >= sel.arrive - 0.5) app.setTime(sel.launch);
    flying = true;
    app.setRate((sel.days * 86400) / FLIGHT_SECONDS);
    renderReadout();
  };
  const stopFlying = () => {
    flying = false;
    app.setRate(1, true);
    renderReadout();
  };

  /** Build the porkchop around a launch date, recentred on its cheapest trip. */
  const build = (centre: number) => {
    const span = TRIP_TARGETS[target].span;
    let p = porkchop(eph, target, centre - span, centre + span);
    if (Math.abs(p.best.launch - centre) > span / 3) p = porkchop(eph, target, p.best.launch - span, p.best.launch + span);
    return p;
  };

  /** Show the first window on or after `jd` (or the one in progress). */
  const goToWindowNear = (jd: number) => {
    const run = ++busy;
    pc = null; sel = null;
    title.textContent = TRIP_TARGETS[target].name;
    updateOverlay(); draw(); renderReadout();
    // Let the card paint before the sums.
    setTimeout(() => {
      if (run !== busy) return;
      const info = TRIP_TARGETS[target];
      const w = launchWindows(eph, target, jd - info.span / 2, jd + info.synodic * 1.1)[0];
      show(build(w ? w.launch : jd));
    }, 30);
  };

  const step = (dir: number) => {
    if (!pc) return;
    const run = ++busy;
    const info = TRIP_TARGETS[target];
    const centre = pc.best.launch + dir * info.synodic;
    pc = null; sel = null;
    updateOverlay(); draw(); renderReadout();
    setTimeout(() => { if (run === busy) show(build(centre)); }, 30);
  };

  const show = (p: Porkchop) => {
    pc = p;
    const year = new Date((p.best.launch - 2440587.5) * 864e5).getUTCFullYear();
    title.textContent = `${TRIP_TARGETS[target].name} · ${year} window`;
    percy.hidden = !(target === 'mars' && PERSEVERANCE.launch > p.launch0 && PERSEVERANCE.launch < p.launch1);
    choose(p.best);
  };

  // ------------------------------------------------------------ the plot

  let box = { x: 0, y: 0, w: 1, h: 1 };
  const draw = () => {
    const ready = prepare(canvas);
    if (!ready) return;
    const { g, w, h: hgt } = ready;
    const pal = palette(el);
    g.font = `11px ${pal.font}`;
    box = { x: 36, y: 10, w: w - 42, h: hgt - 30 };
    if (!pc) {
      g.fillStyle = pal.faint; g.textAlign = 'center';
      g.fillText('Working…', w / 2, hgt / 2);
      return;
    }
    const p = pc;
    const cw = box.w / p.nx, ch = box.h / p.ny;
    // Cost as brightness: the cheapest trip is full accent, anything 80% dearer or more is dark.
    const best = p.best.total;
    for (let y = 0; y < p.ny; y++) {
      for (let x = 0; x < p.nx; x++) {
        const c = p.cost[y * p.nx + x];
        if (!Number.isFinite(c)) continue;
        const t = Math.min(1, (c - best) / (best * 0.8));
        const a = Math.pow(1 - t, 2.2);
        if (a < 0.02) continue;
        g.globalAlpha = 0.08 + 0.85 * a;
        g.fillStyle = pal.accent;
        g.fillRect(box.x + x * cw, box.y + box.h - (y + 1) * ch, cw + 0.6, ch + 0.6);
      }
    }
    g.globalAlpha = 1;
    // Axes: months along the bottom, flight days up the side.
    g.fillStyle = pal.faint; g.strokeStyle = pal.faint; g.lineWidth = 1;
    g.textAlign = 'center'; g.textBaseline = 'top';
    let last = -Infinity;
    for (let jd = Math.ceil(p.launch0); jd <= p.launch1; jd += 1) {
      const d = new Date((jd - 2440587.5) * 864e5);
      if (d.getUTCDate() !== 1) continue;
      const x = box.x + ((jd - p.launch0) / (p.launch1 - p.launch0)) * box.w;
      if (x - last < 34) continue;
      last = x;
      g.fillText(d.toLocaleString('en', { month: 'short', timeZone: 'UTC' }), x, box.y + box.h + 5);
      g.globalAlpha = 0.35; g.beginPath(); g.moveTo(x, box.y + box.h); g.lineTo(x, box.y + box.h + 3); g.stroke(); g.globalAlpha = 1;
    }
    g.textAlign = 'right'; g.textBaseline = 'middle';
    const span = p.tof1 - p.tof0;
    const tick = span > 600 ? 200 : span > 200 ? 100 : 50;
    for (let d = Math.ceil(p.tof0 / tick) * tick; d <= p.tof1; d += tick) {
      const y = box.y + box.h - ((d - p.tof0) / span) * box.h;
      g.fillText(`${d}d`, box.x - 5, y);
    }
    const at = (launch: number, days: number): [number, number] => [
      box.x + ((launch - p.launch0) / (p.launch1 - p.launch0)) * box.w,
      box.y + box.h - ((days - p.tof0) / span) * box.h,
    ];
    // Perseverance, where it flew.
    if (!percy.hidden) {
      const [x, y] = at(PERSEVERANCE.launch, PERSEVERANCE.arrive - PERSEVERANCE.launch);
      g.fillStyle = pal.mars; g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      g.textAlign = 'left'; g.fillText('Perseverance', x + 6, y);
    }
    // The cheapest, and the choice.
    const [bx, by] = at(p.best.launch, p.best.days);
    g.strokeStyle = pal.good; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(bx - 4, by); g.lineTo(bx + 4, by); g.moveTo(bx, by - 4); g.lineTo(bx, by + 4); g.stroke();
    if (sel) {
      const [sx, sy] = at(sel.launch, sel.days);
      g.strokeStyle = pal.text; g.lineWidth = 2;
      g.beginPath(); g.arc(sx, sy, 6, 0, Math.PI * 2); g.stroke();
    }
  };

  const pick = (e: PointerEvent) => {
    if (!pc) return;
    const r = canvas.getBoundingClientRect();
    const fx = (e.clientX - r.left - box.x) / box.w, fy = 1 - (e.clientY - r.top - box.y) / box.h;
    if (fx < 0 || fx > 1 || fy < 0 || fy > 1) return;
    const c = cellAt(pc, fx * pc.nx - 0.5, fy * pc.ny - 0.5);
    const t = trip(eph, target, c.launch, c.days);
    if (t) choose(t);
  };
  let dragging = false;
  canvas.addEventListener('pointerdown', (e) => { dragging = true; canvas.setPointerCapture(e.pointerId); pick(e); });
  canvas.addEventListener('pointermove', (e) => { if (dragging) pick(e); });
  canvas.addEventListener('pointerup', () => { dragging = false; });
  canvas.addEventListener('pointercancel', () => { dragging = false; });
  new ResizeObserver(() => draw()).observe(canvas);

  // Stop on arrival.
  app.on('frame', () => {
    if (!lab.isOpen || !sel || !flying || app.universe.frame.jdTT < sel.arrive) return;
    flying = false;
    app.setTime(sel.arrive);
    app.setRate(1, true);
    renderReadout();
    shell.toast(`Arrived at ${TRIP_TARGETS[sel.target].name}, ${Math.round(sel.days)} days after launch.`);
  });
  /** How far out to frame, AU. */
  const REACH: Record<TripTarget, number> = { venus: 1.15, mars: 1.75, jupiter: 5.6 };

  return {
    get isOpen() { return lab.isOpen; },
    open(t) {
      if (t) target = t;
      lab.open(REACH[target]);
      renderTargets();
      goToWindowNear(app.universe.frame.jdTT);
    },
    close: () => lab.close(),
  };
}
