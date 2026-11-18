// The slingshot lab: Voyager 2's trip to Jupiter in Space view. Choose which
// side of Jupiter to pass and how close; Space view draws the path in and the
// path out, and Fly it runs time through the flyby. Physics in learn/slingshot.ts.

import type { Vec3 } from '../astro/math.ts';
import { JUPITER } from '../learn/flyby.ts';
import { type Slingshot, VOYAGER2, slingshot, slingshotPath, slingshotPosition } from '../learn/slingshot.ts';
import { trip, tripPath } from '../learn/trip.ts';
import { formatDate } from '../sim/format.ts';
import { h, fill, icon } from './dom.ts';
import { palette } from './plot-kit.ts';
import { spaceLab } from './space-lab.ts';
import type { Shell } from './shell.ts';

/** Days after the flyby to draw and to fly. */
const AFTER = 365.25 * 8;
const FLIGHT_SECONDS = 16;

function rgb(css: string): Vec3 {
  const m = /^#([0-9a-f]{6})$/i.exec(css.trim());
  if (!m) return [1, 1, 1];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export interface SlingshotLab { open(): void }

export function slingshotLab(shell: Shell): SlingshotLab {
  const app = shell.app;
  const eph = app.universe.eph;
  const approach = trip(eph, 'jupiter', VOYAGER2.launch, VOYAGER2.flyby - VOYAGER2.launch)!;
  let behind = true;
  let flying = false;
  let s: Slingshot = slingshot(eph, approach, VOYAGER2.radii, behind);

  /** Closest approach in Jupiter radii: 1.1 to 30, spread evenly in ratio along the slider. */
  const slider = h('input', { class: 'plot-slider', type: 'range', min: '0', max: '1000', step: '1', 'aria-label': 'Closest approach to Jupiter' });
  const toRadii = () => 1.1 * Math.pow(30 / 1.1, Number(slider.value) / 1000);
  const fromRadii = (r: number) => String(Math.round((Math.log(r / 1.1) / Math.log(30 / 1.1)) * 1000));
  slider.value = fromRadii(VOYAGER2.radii);
  const sides = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which side of Jupiter' });
  const readout = h('div', { class: 'trip-readout', 'aria-live': 'polite' });
  const flyButton = h('button', { class: 'pill-button primary', type: 'button', onclick: () => (flying ? stop() : fly()) });
  const voyager = h('button', { class: 'pill-button', type: 'button', onclick: () => {
    behind = true; slider.value = fromRadii(VOYAGER2.radii); update();
  } }, 'Voyager 2\'s pass');

  const lab = spaceLab(shell, {
    title: 'Slingshot',
    children: [
      h('p', { class: 'hint' }, `Voyager 2 left the Earth on ${formatDate(VOYAGER2.launch, { tz: 'UTC', lon: 0 })} and reached Jupiter in July 1979. Choose how it passes.`),
      sides,
      h('label', { class: 'trip-slider' }, h('span', { class: 'hint' }, 'Closest approach'), slider),
      h('div', { class: 'button-row' }, flyButton, voyager),
      readout,
    ],
    onClose: () => { if (flying) stop(); },
  });

  const renderSides = () => fill(sides, [true, false].map((b) => h('button', {
    type: 'button', 'aria-pressed': String(b === behind), onclick: () => { behind = b; update(); },
  }, b ? 'Behind Jupiter' : 'In front of Jupiter')));

  const render = () => {
    flyButton.replaceChildren(icon(flying ? 'pause' : 'rocket', 16), flying ? 'Stop' : 'Fly it');
    const km = Math.round((s.radii * JUPITER.radius) / 1000) * 1000;
    fill(readout,
      h('dl', { class: 'facts' },
        h('div', { class: 'fact' }, h('dt', null, 'Closest'), h('dd', null, `${s.radii.toFixed(1)} Jupiter radii`)),
        h('div', { class: 'fact' }, h('dt', null, 'Turned by'), h('dd', null, `${Math.round((s.turn * 180) / Math.PI)}°`)),
        h('div', { class: 'fact' }, h('dt', null, 'Speed before'), h('dd', null, `${s.before.toFixed(1)} km/s`)),
        h('div', { class: 'fact' }, h('dt', null, 'Speed after'), h('dd', null, `${s.after.toFixed(1)} km/s`))),
      h('p', { class: `concept-feedback ${s.escapes ? 'good' : ''}` },
        s.escapes
          ? `Faster than the ${s.escape.toFixed(1)} km/s needed to escape the Sun from here: it leaves the Solar System.`
          : `Short of the ${s.escape.toFixed(1)} km/s needed to escape the Sun from here: it stays in orbit and falls back.`),
      h('p', { class: 'hint' }, `Speeds are around the Sun. Closest approach ${km.toLocaleString('en')} km from Jupiter's centre.`));
  };

  const overlay = () => {
    const p = palette(lab.el);
    const t = s;
    app.space.overlay = {
      paths: [
        { points: tripPath(approach), color: rgb(p.accent), alpha: 0.5 },
        { points: slingshotPath(t, AFTER), color: rgb(t.escapes ? p.good : p.accent), alpha: 0.9 },
      ],
      markers: [
        { id: 'craft', pos: (jd) => slingshotPosition(t, jd), color: rgb(p.accent), radiusPx: 3.5, label: (jd) => (jd > approach.launch + 2 ? 'Voyager 2' : undefined) },
      ],
    };
    app.invalidate();
  };

  const update = () => {
    s = slingshot(eph, approach, toRadii(), behind);
    renderSides();
    render();
    overlay();
  };
  slider.addEventListener('input', update);

  const fly = () => {
    const jd = app.universe.frame.jdTT;
    if (jd >= VOYAGER2.flyby + AFTER - 1 || jd < approach.launch) app.setTime(approach.launch);
    flying = true;
    app.setRate(((VOYAGER2.flyby + AFTER - approach.launch) * 86400) / FLIGHT_SECONDS);
    render();
  };
  const stop = () => { flying = false; app.setRate(1, true); render(); };
  app.on('frame', () => {
    if (!lab.isOpen || !flying || app.universe.frame.jdTT < VOYAGER2.flyby + AFTER) return;
    stop();
  });

  return {
    open() {
      lab.open(9);
      app.setTime(VOYAGER2.flyby);
      update();
    },
  };
}
