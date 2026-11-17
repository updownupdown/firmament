// Workshop charts for journeys: small top-down drawings of the solar system
// that the player works on directly. The geometry lives in journeys/orbits.ts;
// this file only draws and listens.

import type { App } from '../app.ts';
import type { Ephemeris } from '../astro/ephemeris.ts';
import { MARS_YEAR, type MarsFix, type Point, marsFix, orbitPath, planTransfer } from '../journeys/orbits.ts';
import { formatDate } from '../sim/format.ts';
import { h } from './dom.ts';

const UTC = { name: 'UTC', lat: 0, lon: 0, height: 0, tz: 'UTC' };
const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

interface Chart {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** CSS pixels across. */
  size: number;
  /** Chart position (AU) to CSS pixels, and back. */
  px(p: Point): Point;
  au(x: number, y: number): Point;
  clear(): void;
  path(points: Point[], color: string, width?: number, dash?: number[]): void;
  dot(p: Point, r: number, color: string, hollow?: boolean): void;
  label(p: Point, text: string, color: string, dx?: number, dy?: number): void;
}

/** A square canvas showing ±`extent` AU around the Sun, north of the ecliptic up, as seen from above. */
function chart(extent: number, label: string): Chart {
  const size = Math.min(320, Math.max(220, window.innerWidth - 110), Math.max(220, window.innerHeight - 520));
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const canvas = h('canvas', { class: 'workshop-chart', width: String(size * dpr), height: String(size * dpr), role: 'img', 'aria-label': label });
  canvas.style.width = canvas.style.height = `${size}px`;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const k = size / (2 * extent);
  const px = (p: Point): Point => [size / 2 + p[0] * k, size / 2 - p[1] * k];
  return {
    canvas, ctx, size, px,
    au: (x, y) => [(x - size / 2) / k, (size / 2 - y) / k],
    clear: () => ctx.clearRect(0, 0, size, size),
    path(points, color, width = 1.5, dash = []) {
      ctx.beginPath();
      points.forEach((p, i) => { const [x, y] = px(p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]);
    },
    dot(p, r, color, hollow = false) {
      const [x, y] = px(p);
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
      if (hollow) { ctx.strokeStyle = color; ctx.lineWidth = 1.5; ctx.stroke(); } else { ctx.fillStyle = color; ctx.fill(); }
    },
    label(p, text, color, dx = 8, dy = 4) {
      const [x, y] = px(p);
      ctx.font = `12px ${token('--font') || 'sans-serif'}`;
      ctx.fillStyle = color;
      const w = ctx.measureText(text).width;
      // Keep labels inside the chart: flip to the left of the point when there is no room on the right.
      const left = x + dx + w > size - 2 ? x - dx - w : x + dx;
      ctx.fillText(text, Math.max(2, left), Math.min(Math.max(12, y + dy), size - 4));
    },
  };
}

function colors() {
  return {
    text: token('--color-text'), muted: token('--color-text-muted'), faint: token('--color-border-strong'),
    accent: token('--color-accent'), warn: token('--color-warn'), good: token('--color-good'),
  };
}

function drawSunAndEarthOrbit(c: Chart, eph: Ephemeris, jd: number, col: ReturnType<typeof colors>): void {
  c.path(orbitPath(eph, 'earth', jd, 365.25), col.faint, 1);
  c.dot([0, 0], 5, col.warn);
}

const dist = (p: Point) => Math.hypot(p[0], p[1]);

/** The points Kepler has found so far, with the true orbit behind them once there are enough. */
export function marsOrbitFigure(app: App, nights: number[], showOrbit: boolean): HTMLElement {
  const eph = app.universe.eph;
  const c = chart(1.95, 'The Sun, the Earth\'s orbit, and the places found for Mars.');
  const col = colors();
  drawSunAndEarthOrbit(c, eph, nights[0], col);
  if (showOrbit) c.path(orbitPath(eph, 'mars', nights[0], MARS_YEAR), col.accent, 1.5);
  for (const jd of nights) {
    const m = marsFix(eph, jd).mars;
    c.path([[0, 0], m], col.faint, 1, [3, 4]);
    c.dot(m, 4.5, col.good);
    c.label(m, dist(m).toFixed(2), col.text);
  }
  return h('div', { class: 'workshop' }, c.canvas,
    h('p', { class: 'hint' }, 'Distances from the Sun, with the Earth\'s distance as 1.'));
}

/** Mark where two lines of sight to Mars cross. */
export function marsFixWidget(app: App, jd: number, earlier: number[], solved: boolean, onAnswer: (value: string) => void): HTMLElement {
  const eph = app.universe.eph;
  const fix: MarsFix = marsFix(eph, jd);
  const c = chart(1.95, 'Chart of the Sun and the Earth\'s orbit with two lines of sight to Mars. Tap where they cross, or move the mark with the arrow keys.');
  const col = colors();
  let mark: Point | null = solved ? fix.mars : null;
  const check = h('button', { class: 'pill-button', type: 'button', disabled: true, onclick: () => { if (mark) onAnswer(`${mark[0]},${mark[1]}`); } }, 'Check');
  const far = (s: MarsFix['a']): Point => [s.earth[0] + Math.cos(s.lon) * 5, s.earth[1] + Math.sin(s.lon) * 5];
  const day = (t: number) => formatDate(t, UTC);

  const draw = () => {
    c.clear();
    drawSunAndEarthOrbit(c, eph, jd, col);
    for (const t of earlier) {
      const m = marsFix(eph, t).mars;
      c.dot(m, 4, col.good);
      c.label(m, dist(m).toFixed(2), col.muted);
    }
    c.path([fix.a.earth, far(fix.a)], col.accent, 1.5);
    c.path([fix.b.earth, far(fix.b)], col.warn, 1.5);
    c.dot(fix.a.earth, 4.5, col.accent);
    c.dot(fix.b.earth, 4.5, col.warn);
    c.label(fix.a.earth, day(fix.a.jd), col.accent, 8, 16);
    c.label(fix.b.earth, day(fix.b.jd), col.warn, 8, 16);
    if (mark) {
      c.dot(mark, solved ? 5 : 8, solved ? col.good : col.text, !solved);
      if (solved) c.label(mark, `Mars, ${dist(mark).toFixed(2)}`, col.text);
    }
  };
  const place = (p: Point) => {
    if (solved) return;
    mark = [Math.max(-1.9, Math.min(1.9, p[0])), Math.max(-1.9, Math.min(1.9, p[1]))];
    check.disabled = false;
    draw();
  };
  const fromEvent = (e: PointerEvent) => {
    const r = c.canvas.getBoundingClientRect();
    place(c.au(e.clientX - r.left, e.clientY - r.top));
  };
  if (!solved) {
    c.canvas.tabIndex = 0;
    c.canvas.addEventListener('pointerdown', (e) => { c.canvas.setPointerCapture(e.pointerId); fromEvent(e); });
    c.canvas.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') fromEvent(e); });
    c.canvas.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.1 : 0.02;
      const d: Record<string, Point> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
      const move = d[e.key];
      if (!move) return;
      e.preventDefault();
      const from = mark ?? [0, 1.5];
      place([from[0] + move[0], from[1] + move[1]]);
    });
  }
  draw();
  return h('div', { class: 'workshop' }, c.canvas,
    h('p', { class: 'hint' }, `The Earth on two nights 687 days apart. Each line points to where Mars stood in the sky.`),
    solved ? null : check);
}

/** Choose a launch day and flight time, and see the coasting orbit and what it costs. */
export function transferWidget(app: App, from: number, window: number, budget: number, accepted: string, onAnswer: (value: string) => void): HTMLElement {
  const eph = app.universe.eph;
  const c = chart(1.85, 'Chart of the Sun, the orbits of the Earth and Mars, and the spacecraft\'s path between them.');
  const col = colors();
  const earthOrbit = orbitPath(eph, 'earth', from, 365.25), marsOrbit = orbitPath(eph, 'mars', from, MARS_YEAR);
  // Once a flight has been accepted the chart keeps showing it.
  const solved = accepted !== '';
  const [doneJd, doneDays] = accepted.split(',').map(Number);
  const launch = h('input', { type: 'range', min: '0', max: String(window), step: '2', value: solved ? String(doneJd - from) : '40', disabled: solved, 'aria-label': 'Launch day' });
  const flight = h('input', { type: 'range', min: '120', max: '400', step: '4', value: solved ? String(doneDays) : '180', disabled: solved, 'aria-label': 'Flight time in days' });
  const when = h('span', { class: 'workshop-value' });
  const long = h('span', { class: 'workshop-value' });
  const cost = h('p', { class: 'workshop-cost', role: 'status', 'aria-live': 'polite' });
  const go = h('button', { class: 'pill-button primary', type: 'button', disabled: solved, onclick: () => onAnswer(`${from + Number(launch.value)},${flight.value}`) }, 'Launch');

  const draw = () => {
    const jd = from + Number(launch.value), days = Number(flight.value);
    const plan = planTransfer(eph, jd, days);
    when.textContent = formatDate(jd, UTC);
    long.textContent = `${days} days`;
    c.clear();
    c.path(earthOrbit, col.faint, 1);
    c.path(marsOrbit, col.faint, 1);
    c.dot([0, 0], 5, col.warn);
    if (!plan) { cost.textContent = 'No path for that choice.'; return; }
    const total = plan.departV + plan.arriveV;
    const ok = total <= budget;
    c.path(plan.path, ok ? col.good : col.text, 2);
    c.dot(plan.marsAtLaunch, 4.5, col.warn, true);
    c.dot(plan.earth, 4.5, col.accent);
    c.dot(plan.mars, 4.5, col.warn);
    c.label(plan.earth, 'Earth at launch', col.accent);
    c.label(plan.marsAtLaunch, 'Mars at launch', col.muted);
    c.label(plan.mars, `Mars, ${formatDate(jd + days, UTC)}`, col.warn, 8, 16);
    cost.textContent = `Needs ${total.toFixed(1)} km/s: ${plan.departV.toFixed(1)} to leave, ${plan.arriveV.toFixed(1)} to stop. The rocket has ${budget.toFixed(1)}.`;
    cost.className = `workshop-cost${ok ? ' good' : ' bad'}`;
  };
  launch.addEventListener('input', draw);
  flight.addEventListener('input', draw);
  draw();
  return h('div', { class: 'workshop' }, c.canvas,
    h('label', { class: 'workshop-slider' }, h('span', null, 'Launch'), launch, when),
    h('label', { class: 'workshop-slider' }, h('span', null, 'Flight'), flight, long),
    cost, solved ? null : go);
}
