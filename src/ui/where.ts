// Where: the chip at the top left says where you are and what kind of view
// that is ("Sky from Earth · Toronto", "Space view · Orbiting Mars"). Tapping
// it opens the Where panel, the one place to move: home, any city on the Earth,
// the surface of the Moon or Mars, Space view over the Solar System or around a
// planet, and the nearest stars. Every section says which view it leads to.

import type { App } from '../app.ts';
import type { Site } from '../sim/universe.ts';
import { h, fill, icon } from './dom.ts';
import { placeForm } from './panels.ts';
import type { Panel, Shell } from './shell.ts';

export interface WhereInfo {
  /** The kind of view: "Sky from Earth", "Space view"… */
  kind: string;
  /** The place: "Toronto", "Orbiting Mars"… */
  label: string;
  glyph: string;
  /** Standing at home on the Earth. */
  home: boolean;
}

export function whereInfo(app: App): WhereInfo {
  const v = app.viewpoint();
  const away = app.universe.away;
  if (app.mode === 'space') return { kind: 'Space view', label: v.label, glyph: 'orbit', home: false };
  if (away?.world === 'star') return { kind: 'Star travel', label: v.label, glyph: 'star', home: false };
  if (away) return { kind: away.world === 'moon' ? 'Sky from the Moon' : 'Sky from Mars', label: away.name, glyph: 'flag', home: false };
  return { kind: 'Sky from Earth', label: app.site.name, glyph: 'globe', home: true };
}

/** The Where chip. */
export function whereChip(app: App, onOpen: () => void): HTMLElement {
  const glyph = h('span', { class: 'chip-glyph' });
  const cap = h('span', { class: 'chip-cap' });
  const value = h('span', { class: 'chip-value' });
  const el = h('button', { class: 'chip glass where-chip chrome', type: 'button', onclick: onOpen }, glyph, h('span', { class: 'chip-text' }, cap, value));
  let shown = '';
  const sync = () => {
    const w = whereInfo(app);
    const key = `${w.kind}|${w.label}|${w.glyph}`;
    if (key === shown) return;
    shown = key;
    fill(glyph, icon(w.glyph, 20));
    cap.textContent = w.kind;
    value.textContent = w.label;
    el.setAttribute('aria-label', `Where: ${w.label}, ${w.kind.toLowerCase()}. Go somewhere else.`);
  };
  for (const e of ['mode', 'site', 'frame'] as const) app.on(e, sync);
  sync();
  return el;
}

/** Stars near enough to fly to, as a short list to start from. */
const NEAR_STARS: [string, string, string?][] = [
  ['star:71683', 'See the Sun as a star in Cassiopeia', 'Alpha Centauri'],
  ['star:32349', 'The brightest star in our sky'],
  ['star:37279', 'A white star with a white dwarf companion'],
  ['star:91262', 'Summer\'s blue-white star, 25 light years out'],
];

const SPACE_BODIES = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

export function wherePanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel where-panel' });
  /** Do something that moves the view, with the sheet out of the way so the move is seen. */
  const go = (run: () => void) => { shell.closeSheet(); run(); };
  const place = placeForm(app, (site: Site) => {
    app.setSite(site);
    go(() => app.land());
  });

  const section = (title: string, badge: string, ...body: (HTMLElement | null)[]) =>
    h('section', { class: 'where-section' },
      h('header', { class: 'where-head' }, h('h3', { class: 'section-title' }, title), h('span', { class: 'where-badge' }, badge)),
      ...body);
  const row = (dot: string, name: string, sub: string, onclick: () => void, current = false) =>
    h('button', { class: `where-row${current ? ' current' : ''}`, type: 'button', onclick, 'aria-current': current ? 'location' : undefined },
      h('span', { class: 'where-dot', style: `--dot: var(--sys-${dot}, var(--sys-small))` }),
      h('span', { class: 'where-row-text' }, h('span', { class: 'where-row-name' }, name), h('span', { class: 'where-row-sub' }, sub)),
      current ? h('span', { class: 'where-here' }, 'You are here') : icon('forward', 16));

  const refresh = () => {
    const w = whereInfo(app);
    const away = app.universe.away;
    const v = app.viewpoint();
    const space = app.mode === 'space';
    const bodyName = (id: string) => (id === 'earth' ? 'Earth' : app.universe.resolve(id)?.name ?? id);
    const stars = NEAR_STARS.filter(([ref]) => app.canFlyTo(ref));

    const here = h('section', { class: 'where-current' },
      h('span', { class: 'where-current-glyph' }, icon(w.glyph, 22)),
      h('div', { class: 'where-current-text' },
        h('span', { class: 'card-label' }, `You are here · ${w.kind}`),
        h('span', { class: 'where-current-name' }, space ? w.label : away ? `${w.label}, ${away.world === 'star' ? 'among the stars' : away.world === 'moon' ? 'the Moon' : 'Mars'}` : `${app.site.name}, Earth`)),
      w.home ? null : h('button', { class: 'pill-button primary', type: 'button', onclick: () => go(() => app.land()) }, icon('globe', 16), `Home to ${app.site.name}`));

    const scale = space ? h('div', { class: 'segmented where-scale', role: 'group', 'aria-label': 'Scale' },
      h('button', { type: 'button', 'aria-pressed': String(!app.layers.compressed), onclick: () => { app.setLayer('compressed', false); refresh(); } }, 'True scale'),
      h('button', { type: 'button', 'aria-pressed': String(app.layers.compressed), onclick: () => { app.setLayer('compressed', true); refresh(); } }, 'Compressed')) : null;

    fill(el,
      here,
      section('On the Earth', 'Sky view', place.el),
      section('On other worlds', 'Sky view',
        row('moon', 'The Moon', 'Tranquility Base · the Earth hangs in a black sky', () => go(() => app.standOn('moon')), away?.world === 'moon'),
        row('mars', 'Mars', 'Jezero Crater · a butterscotch sky, a small Sun', () => go(() => app.standOn('mars')), away?.world === 'mars')),
      section('In space', 'Space view',
        row('sun', 'Above the Solar System', 'Every planet on its orbit', () => go(() => app.flyToObject('sun')), space && v.body === 'sun'),
        h('div', { class: 'where-bodies' }, SPACE_BODIES.filter((id) => app.canFlyTo(id)).map((id) =>
          h('button', { class: 'where-body', type: 'button', 'aria-current': space && v.body === id ? 'location' : undefined, onclick: () => go(() => app.flyToObject(id)) },
            h('span', { class: 'where-dot', style: `--dot: var(--sys-${id})` }), bodyName(id)))),
        scale),
      stars.length ? section('Among the stars', 'Star travel',
        ...stars.map(([ref, sub, name]) => row('sun', name ?? bodyName(ref), sub, () => go(() => app.flyToObject(ref)), away?.world === 'star' && away.ref === ref)),
        h('p', { class: 'hint' }, 'Any star within about 100 light years can be visited: tap it in the sky, then Fly to it from its menu.')) : null);
    place.refresh();
  };
  return { title: 'Where', el, refresh };
}
