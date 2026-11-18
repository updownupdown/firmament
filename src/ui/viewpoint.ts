// The viewpoint chip, under the time chip: where the camera is ("Toronto,
// Earth", "Orbiting Mars"). Tapping it offers home, the wide view of the
// Solar System, worlds visited lately, and Look at it / Fly to it /
// Stand on it for what is selected. Every move is one flight (app.ts).

import type { App } from '../app.ts';
import { h, fill, icon } from './dom.ts';

export interface Verb {
  id: 'look' | 'fly' | 'stand';
  label: string;
  glyph: string;
  run: () => void;
}

/** What the camera can do with an object from where it is now. */
export function verbsFor(app: App, ref: string): Verb[] {
  const out: Verb[] = [];
  const region = ref.startsWith('region:');
  const obj = app.universe.resolve(ref);
  // Looking at a belt or cloud from the ground shows nothing: it is seen from outside.
  const underfoot = app.mode === 'sky' && ref === app.universe.world;
  if (!region && obj && !underfoot) out.push({ id: 'look', label: 'Look at it', glyph: 'eye', run: () => app.lookAt(ref) });
  if (app.canFlyTo(ref)) out.push({ id: 'fly', label: 'Fly to it', glyph: 'rocket', run: () => app.flyToObject(ref) });
  if (app.canStandOn(ref)) out.push({ id: 'stand', label: 'Stand on it', glyph: 'globe', run: () => app.standOn(ref) });
  return out;
}

export function viewpointChip(app: App, extra: HTMLElement[] = []): HTMLElement {
  const label = h('span', { class: 'viewpoint-label' });
  const glyph = h('span', { class: 'viewpoint-glyph', 'aria-hidden': 'true' });
  const button = h('button', { class: 'pill-button glass viewpoint-button', type: 'button', 'aria-expanded': 'false', 'aria-haspopup': 'true' }, glyph, label);
  const menu = h('div', { class: 'viewpoint-menu glass', hidden: true, role: 'menu', 'aria-label': 'Go somewhere' });
  const el = h('div', { class: 'viewpoint chrome' }, h('div', { class: 'viewpoint-row' }, button, ...extra), menu);

  /** Worlds circled lately, newest first. */
  const recent: string[] = [];
  let shown = '';

  const item = (glyphName: string, text: string, run: () => void) =>
    h('button', { class: 'viewpoint-item', type: 'button', role: 'menuitem', onclick: () => { close(); run(); } }, icon(glyphName, 18), h('span', null, text));

  const render = () => {
    const v = app.viewpoint();
    const items: HTMLElement[] = [];
    if (v.place !== 'ground' || v.away) items.push(item('globe', `${v.away ? 'Home to' : 'Land in'} ${app.site.name}`, () => app.land()));
    if (v.body !== 'sun' || v.place === 'ground') items.push(item('orbit', 'Fly out over the Solar System', () => app.flyToObject('sun')));
    for (const id of recent) {
      if (id === v.body && v.place === 'orbit') continue;
      const name = app.universe.resolve(id)?.name ?? id;
      items.push(item('rocket', `Orbit ${name}`, () => app.flyToObject(id)));
    }
    const sel = app.selectedObject;
    const verbs = sel ? verbsFor(app, sel.ref) : [];
    if (sel && verbs.length) {
      items.push(h('p', { class: 'viewpoint-section' }, sel.name));
      for (const v of verbs) items.push(item(v.glyph, v.label, v.run));
    }
    fill(menu, items);
  };

  const close = () => {
    menu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
  };
  button.addEventListener('click', () => {
    if (!menu.hidden) { close(); return; }
    render();
    menu.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    (menu.querySelector('button') as HTMLButtonElement | null)?.focus();
  });
  document.addEventListener('pointerdown', (e) => { if (!el.contains(e.target as Node)) close(); });
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); button.focus(); } });

  const sync = () => {
    const v = app.viewpoint();
    if (v.place === 'orbit' && v.body !== 'sun' && recent[0] !== v.body) {
      const i = recent.indexOf(v.body);
      if (i >= 0) recent.splice(i, 1);
      recent.unshift(v.body);
      recent.length = Math.min(recent.length, 3);
    }
    const key = `${v.place}|${v.label}`;
    if (key === shown) return;
    shown = key;
    label.textContent = v.label;
    fill(glyph, icon(v.place === 'ground' ? 'globe' : 'orbit', 16));
    button.title = 'Where you are. Tap to go somewhere else.';
  };
  app.on('mode', sync);
  app.on('site', sync);
  app.on('select', sync);
  app.on('frame', sync);
  sync();
  return el;
}
