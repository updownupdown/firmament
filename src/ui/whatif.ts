// What if? in Space view: the Sun and the eight planets started from where
// they really are, then moved by gravity alone, with a heavier Jupiter or a
// passing star. The real planets are hidden while it runs and a "What if"
// badge says this is an imagined Solar System. Physics in learn/sandbox.ts.

import { EPS_J2000 } from '../astro/frames.ts';
import type { Vec3 } from '../astro/math.ts';
import { PLANETS, Sandbox, type WhatIf } from '../learn/sandbox.ts';
import { type SpaceOverlay } from '../render/space.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { spaceLab } from './space-lab.ts';
import type { Shell } from './shell.ts';

const cosE = Math.cos(EPS_J2000), sinE = Math.sin(EPS_J2000);
const toEq = (x: number, y: number, z: number): Vec3 => [x, cosE * y - sinE * z, sinE * y + cosE * z];

const NAMES: Record<string, string> = {
  mercury: 'Mercury', venus: 'Venus', earth: 'Earth', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune', star: 'Passing star',
};
/** How far out to frame (AU), and simulated years per real second at that size. */
const ZOOMS = [
  { label: 'Inner', reach: 2, years: 1 },
  { label: 'To Jupiter', reach: 6, years: 4 },
  { label: 'All', reach: 32, years: 25 },
];
const JUPITER_MASS = [1, 10, 100, 1000];
const STAR_CLOSEST = [0, 100, 10, 3, 1];
const TRAIL = 200;

export interface WhatIfLab { open(): void }

export function whatIfLab(shell: Shell): WhatIfLab {
  const app = shell.app;
  let jupiter = 1, closest = 0, zoom = 2;
  let playing = false;
  let sb: Sandbox | null = null;
  let start = 0;
  const trails = new Map<string, Vec3[]>();
  let lost: string[] = [];
  let frameId = 0;

  const massRow = h('div', { class: 'segmented trip-choices', role: 'group', 'aria-label': 'Jupiter\'s mass' });
  const starRow = h('div', { class: 'segmented trip-choices', role: 'group', 'aria-label': 'A passing star' });
  const zoomRow = h('div', { class: 'segmented trip-choices', role: 'group', 'aria-label': 'How much to show' });
  const play = iconButton('pause', 'Pause', () => setPlaying(!playing));
  const restart = iconButton('reset', 'Start again', () => reset());
  const readout = h('p', { class: 'trip-readout', 'aria-live': 'polite' });

  const lab = spaceLab(shell, {
    title: 'What if?',
    badge: 'What if',
    children: [
      h('p', { class: 'hint' }, 'The planets from where they are today, then gravity alone. Change something and watch.'),
      h('span', { class: 'card-label' }, 'Jupiter\'s mass'), massRow,
      h('span', { class: 'card-label' }, 'A Sun-like star passing at 20 km/s'), starRow,
      h('div', { class: 'plot-bar' }, play, restart, zoomRow),
      readout,
    ],
    onClose: () => { setPlaying(false); sb = null; },
  });

  const choices = () => {
    fill(massRow, JUPITER_MASS.map((m) => h('button', {
      type: 'button', 'aria-pressed': String(m === jupiter), onclick: () => { jupiter = m; choices(); reset(); },
    }, m === 1 ? 'As it is' : `×${m.toLocaleString('en')}`)));
    fill(starRow, STAR_CLOSEST.map((d) => h('button', {
      type: 'button', 'aria-pressed': String(d === closest), onclick: () => { closest = d; choices(); reset(); },
    }, d === 0 ? 'None' : `${d} AU`)));
    fill(zoomRow, ZOOMS.map((z, i) => h('button', {
      type: 'button', 'aria-pressed': String(i === zoom), onclick: () => { zoom = i; choices(); lab.frame(z.reach); },
    }, z.label)));
  };

  const whatIf = (): WhatIf => ({ jupiter, star: closest ? { mass: 1, closest, kms: 20, from: 160 } : undefined });

  const sample = () => {
    if (!sb) return;
    const sun = sb.get('sun')!;
    for (const p of sb.sim.particles) {
      if (p.id === 'sun') continue;
      const t = trails.get(p.id) ?? [];
      // Relative to the Sun, which a passing star can drag about.
      t.push(toEq(p.x - sun.x, p.y - sun.y, p.z - sun.z));
      if (t.length > TRAIL) t.shift();
      trails.set(p.id, t);
    }
    for (const id of PLANETS) if (!lost.includes(id) && !sb.bound(id)) lost.push(id);
  };

  const colours = new Map(app.space.bodies.map((b) => [b.id, b.color as Vec3]));
  const draw = () => {
    if (!sb) return;
    const overlay: SpaceOverlay = { hideBodies: true, paths: [], markers: [] };
    for (const [id, t] of trails) {
      const c = colours.get(id) ?? [1, 0.95, 0.8];
      overlay.paths.push({ points: t, color: c, alpha: 0.55, along: true });
      overlay.markers.push({ id, pos: t[t.length - 1], color: c, radiusPx: id === 'star' ? 4.5 : id === 'jupiter' || id === 'saturn' ? 3.5 : 2.6, label: NAMES[id] });
    }
    app.space.overlay = overlay;
    app.invalidate();
    const years = sb.days / 365.25;
    const words = lost.length
      ? `${lost.map((id) => NAMES[id]).join(', ')} ${lost.length === 1 ? 'has' : 'have'} been flung out of the Solar System.`
      : jupiter === 1 && !closest ? 'Every planet keeps to its orbit, as in the real Solar System.' : 'All eight planets still go round the Sun.';
    fill(readout, h('strong', null, `Year ${Math.floor(years).toLocaleString('en')}. `), words);
  };

  const reset = () => {
    sb = new Sandbox(app.universe.eph, start, whatIf());
    trails.clear();
    lost = [];
    sample();
    draw();
    setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  };

  const setPlaying = (on: boolean) => {
    playing = on;
    fill(play, icon(on ? 'pause' : 'play'));
    play.setAttribute('aria-label', on ? 'Pause' : 'Play');
    cancelAnimationFrame(frameId);
    if (!on) return;
    let last = 0;
    const tick = (now: number) => {
      if (!playing || !sb || !lab.isOpen) return;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
      last = now;
      if (dt > 0) {
        // Trails sample often enough to stay smooth at every zoom.
        const days = ZOOMS[zoom].years * 365.25 * dt;
        const steps = Math.max(1, Math.round(days / (ZOOMS[zoom].years * 6)));
        for (let i = 0; i < steps; i++) { sb.advance(days / steps); sample(); }
        draw();
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
  };

  return {
    open() {
      lab.open(ZOOMS[zoom].reach);
      start = app.universe.frame.jdTT;
      choices();
      reset();
    },
  };
}
