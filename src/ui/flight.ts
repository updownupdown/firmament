// Interstellar flight: a card at the top says where you are heading, how far
// you are from the Sun and from the destination, and when you arrive; a card
// above the toolbar picks the speed, from half light speed (where the view
// follows special relativity: stars crowd ahead and turn blue) up to ten
// million times light speed (make-believe, so the stars simply stream past).

import { type App, FLIGHT_SPEEDS, MAX_TRIP_PC } from '../app.ts';
import { norm, sub } from '../astro/math.ts';
import { LY_PER_PC, SECONDS_PER_YEAR } from '../astro/relativity.ts';
import { galacticCentre } from '../sim/galaxy.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { type MenuItem, picker } from './menu.ts';

/** Named stars worth flying to, nearest first (all within about 100 light years). */
const DESTINATIONS = [
  'star:71683', // Alpha Centauri
  'star:87937', // Barnard's Star
  'star:32349', // Sirius
  'star:16537', // Epsilon Eridani
  'star:8102', // Tau Ceti
  'star:37279', // Procyon
  'star:97649', // Altair
  'star:113368', // Fomalhaut
  'star:91262', // Vega
  'star:37826', // Pollux
  'star:69673', // Arcturus
  'star:24608', // Capella
  'star:36850', // Castor
  'star:21421', // Aldebaran
  'star:49669', // Regulus
];

export function speedLabel(c: number): string {
  if (c < 1) return `${c}c`;
  if (c >= 1e9) return `${(c / 1e9).toLocaleString('en')} billion c`;
  if (c >= 1e6) return `${(c / 1e6).toLocaleString('en')} million c`;
  return `${c.toLocaleString('en')}c`;
}

function lightYears(pc: number): string {
  const ly = pc * LY_PER_PC;
  return ly < 0.1 ? `${Math.round(ly * 63241)} AU` : ly < 10 ? `${ly.toFixed(1)} ly` : `${Math.round(ly)} ly`;
}

/** How fast that is in light years, in words: "1 ly every 32 s", "317 ly a second". */
function paceOf(c: number): string {
  if (c < 1) return 'Real relativity';
  const lyPerSecond = c / SECONDS_PER_YEAR;
  if (lyPerSecond >= 1) return `${Math.round(lyPerSecond).toLocaleString('en')} light years a second`;
  return `1 light year every ${duration(1 / lyPerSecond)}`;
}

function duration(s: number): string {
  if (s < 60) return `${Math.max(1, Math.round(s))} s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400 * 2) return `${Math.round(s / 3600)} h`;
  const days = s / 86400;
  if (days < 365) return `${Math.round(days)} days`;
  const years = days / 365.25;
  return years < 100 ? `${years.toFixed(1)} years` : `${Math.round(years).toLocaleString('en')} years`;
}

export function flightHud(app: App, onClose: () => void): HTMLElement[] {
  const cap = h('span', { class: 'flight-cap' }, 'Interstellar flight');
  const fromSun = h('b');
  const toLabel = h('span', { class: 'hint' }, 'To go');
  const toGo = h('b');
  const eta = h('b');
  const note = h('p', { class: 'flight-note', role: 'status' });
  const heading = picker({
    label: 'Heading', items: [], className: 'flight-heading',
    onPick: (v) => app.setFlightHeading(v),
  });
  const top = h('section', { class: 'flight-top glass chrome', hidden: true, 'aria-label': 'Interstellar flight' },
    h('div', { class: 'flight-row' }, cap, heading.el, iconButton('close', 'End the flight and go home', onClose, 'flight-close')),
    h('div', { class: 'flight-stats' },
      h('div', null, h('span', { class: 'hint' }, 'From the Sun'), fromSun),
      h('div', null, toLabel, toGo),
      h('div', null, h('span', { class: 'hint' }, 'Arrive in'), eta)),
    note);

  // Speed: rewind and fast-forward step down and up the ladder; play and pause in between.
  let last = FLIGHT_SPEEDS.indexOf(1e6);
  const readout = h('b', { class: 'flight-speed' });
  const pace = h('span', { class: 'flight-pace' });
  const step = (d: number) => {
    const fl = app.flight;
    if (!fl) return;
    const i = fl.speed > 0 ? FLIGHT_SPEEDS.indexOf(fl.speed) : last;
    last = Math.min(FLIGHT_SPEEDS.length - 1, Math.max(0, (i < 0 ? last : i) + d));
    app.setFlightSpeed(FLIGHT_SPEEDS[last]);
  };
  const slower = iconButton('slower', 'Slower', () => step(-1), 'flight-step');
  const faster = iconButton('faster', 'Faster', () => step(1), 'flight-step');
  const playButton = iconButton('pause', 'Stop', () => {
    const fl = app.flight;
    if (!fl) return;
    if (fl.speed > 0) { last = Math.max(0, FLIGHT_SPEEDS.indexOf(fl.speed)); app.setFlightSpeed(0); } else app.setFlightSpeed(FLIGHT_SPEEDS[last]);
  }, 'flight-play');
  // The ladder as dots under the readout, so you can see where you are on it.
  const ladder = h('span', { class: 'flight-ladder', 'aria-hidden': 'true' }, FLIGHT_SPEEDS.map((c) => h('i', { class: c < 1 ? 'real' : '' })));
  const speedRow = h('div', { class: 'flight-speeds', role: 'group', 'aria-label': 'Speed' },
    playButton, slower, h('div', { class: 'flight-readout', 'aria-live': 'polite' }, readout, pace, ladder), faster);
  const hint = h('p', { class: 'hint flight-hint' });
  const bottom = h('section', { class: 'flight-bottom glass chrome', hidden: true, 'aria-label': 'Flight speed' }, speedRow, hint);

  let headingKey = '';
  const destinations = (): MenuItem[] => {
    const at = app.universe.voyage ?? [0, 0, 0];
    const stars = DESTINATIONS.filter((ref) => app.canFlyTo(ref)).map((ref) => {
      const o = app.universe.resolve(ref)!;
      const pc = app.universe.stars.dist[o.starIndex!];
      const pos = app.universe.stars.at(o.starIndex!, app.universe.years).dir.map((x) => x * pc);
      return { value: ref, label: o.name, detail: lightYears(norm(sub(pos as [number, number, number], at))), pc };
    });
    return [
      { value: 'sun', label: 'Back to the Sun', detail: lightYears(norm(at)) },
      { value: 'galaxy', label: 'The galactic centre', detail: lightYears(norm(sub(galacticCentre(), at))) },
      { value: 'look', label: 'Where I’m looking' },
      ...stars.map(({ value, label, detail }) => ({ value, label, detail })),
    ];
  };

  const sync = () => {
    const fl = app.flight;
    const on = !!fl;
    top.hidden = bottom.hidden = !on;
    if (on) document.documentElement.dataset.flight = '';
    else delete document.documentElement.dataset.flight;
    if (!fl) return;
    const at = app.universe.voyage ?? [0, 0, 0];
    fromSun.textContent = lightYears(norm(at));
    const left = fl.target ? norm(sub(fl.target, at)) : null;
    toLabel.textContent = fl.target ? `To ${fl.name.replace(/^the galactic /, '').replace(/^the /, '')}` : 'Heading';
    toGo.textContent = left !== null ? lightYears(left) : 'Straight on';
    const t = app.flightEta();
    eta.textContent = !fl.target ? '—' : left !== null && left < 1e-6 ? 'Here' : t === null ? 'Stopped' : duration(t);
    note.textContent = fl.note;
    note.hidden = !fl.note;
    const i = fl.speed > 0 ? FLIGHT_SPEEDS.indexOf(fl.speed) : last;
    if (fl.speed > 0 && i >= 0) last = i;
    readout.textContent = fl.speed > 0 ? speedLabel(fl.speed) : 'Stopped';
    pace.textContent = fl.speed > 0 ? paceOf(fl.speed) : `Play for ${speedLabel(FLIGHT_SPEEDS[last])}`;
    ladder.querySelectorAll('i').forEach((dot, k) => dot.classList.toggle('on', k === last && fl.speed > 0));
    fill(playButton, icon(fl.speed > 0 ? 'pause' : 'play', 20));
    playButton.setAttribute('aria-label', fl.speed > 0 ? 'Stop' : 'Go');
    slower.disabled = fl.speed > 0 && last === 0;
    faster.disabled = last === FLIGHT_SPEEDS.length - 1 && fl.speed > 0;
    const beyond = norm(at) > MAX_TRIP_PC;
    hint.textContent = fl.speed === 0 ? 'Below light speed you see real relativity; faster than light is make-believe.'
      : fl.speed < 1 ? 'Real relativity: the stars crowd toward where you’re heading and turn blue; behind you they redden and fade. At this speed the trip itself takes years.'
        : beyond ? 'Make-believe speed. Out here the stars are a model of the galaxy: our catalog of real stars only reaches about 100 light years.'
          : 'Faster than light is make-believe, so the stars simply stream past at their true distances.';
    const key = `${fl.ref ?? fl.name}`;
    const value = fl.choice;
    if (key !== headingKey) { headingKey = key; heading.setItems(destinations()); }
    heading.value = value;
  };
  // Distances in the heading menu change as you fly: refresh them now and then.
  app.on('second', () => { if (app.flight && !heading.isOpen) heading.setItems(destinations()); });
  let synced = 0;
  app.on('frame', () => {
    const now = performance.now();
    if (app.flight && now - synced > 150) { synced = now; sync(); }
  });
  app.on('mode', sync);
  sync();
  return [top, bottom];
}
