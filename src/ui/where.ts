// Where: the chip at the top left says where you are and what kind of view
// that is ("Sky from Earth · Toronto", "Space view · Orbiting Mars"). Tapping
// it opens the Where panel over the chips, with no title: one search box for a
// city, a planet or a star, and four places in a short list: on the ground in
// a city, Earth with no ground or air, the Solar System, and interstellar
// flight. Standing on the Moon or Mars is on their Atlas pages ("Stand on it").

import type { App } from '../app.ts';
import { formatLatLon } from '../sim/format.ts';
import { searchPlaces } from '../sim/places.ts';
import type { Site } from '../sim/universe.ts';
import { h, fill, icon, iconButton } from './dom.ts';

export interface WhereInfo {
  /** The kind of view: "Sky from Earth", "Space view"… */
  kind: string;
  /** The place: "Toronto", "Orbiting Mars"… */
  label: string;
  glyph: string;
  /** Standing at home on the Earth. */
  home: boolean;
}

/** At home, with the ground and the air both turned off: Earth's place in space. */
export function groundless(app: App): boolean {
  return app.mode === 'sky' && !app.universe.away && !app.layers.ground && !app.layers.atmosphere;
}

export function whereInfo(app: App): WhereInfo {
  const v = app.viewpoint();
  const away = app.universe.away;
  if (app.mode === 'space') return { kind: 'Space view', label: v.label, glyph: 'orbit', home: false };
  if (app.flight) return { kind: 'Interstellar flight', label: v.label, glyph: 'rocket', home: false };
  if (away?.world === 'star') return { kind: 'Star travel', label: v.label, glyph: 'star', home: false };
  if (away) return { kind: away.world === 'moon' ? 'Sky from the Moon' : 'Sky from Mars', label: away.name, glyph: 'flag', home: false };
  if (groundless(app)) return { kind: 'Earth, no ground', label: app.site.name, glyph: 'globe', home: true };
  return { kind: 'Sky from Earth', label: app.site.name, glyph: 'globe', home: true };
}

/** The Where chip. */
export function whereChip(app: App, onOpen: () => void): HTMLElement {
  const glyph = h('span', { class: 'chip-glyph' });
  const cap = h('span', { class: 'chip-cap' });
  const value = h('span', { class: 'chip-value' });
  const el = h('button', { class: 'chip glass where-chip chrome', type: 'button', 'aria-expanded': 'false', onclick: onOpen }, glyph, h('span', { class: 'chip-text' }, cap, value));
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
  for (const e of ['mode', 'site', 'frame', 'settings'] as const) app.on(e, sync);
  sync();
  return el;
}

export interface WhereBar {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

/** Planets and stars the search box can take you to, beside cities. */
const PLACE_KINDS = new Set(['planet', 'star', 'moon', 'sun', 'dwarf']);

/** The Where panel: search, then four places. */
export function whereBar(app: App, opts: { onToggle: (open: boolean) => void; chip: () => HTMLElement | null }): WhereBar {
  let isOpen = false;
  const input = h('input', {
    class: 'field where-search', type: 'search', placeholder: 'City, planet or star', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': 'Find a city, planet or star',
  });
  const status = h('p', { class: 'hint where-status', role: 'status', hidden: true });
  const results = h('ul', { class: 'where-results', role: 'list' });
  const places = h('div', { class: 'where-places' });
  const coords = h('div', { class: 'where-coords', hidden: true });

  /** Move, with the panel out of the way so the move is seen. */
  const go = (run: () => void) => { bar.close(); run(); };
  const showStatus = (text: string) => { status.textContent = text; status.hidden = !text; };

  const toGround = (site?: Site) => go(() => {
    if (site) app.setSite(site);
    if (!app.layers.ground) app.setLayer('ground', true);
    if (!app.layers.atmosphere) app.setLayer('atmosphere', true);
    app.land();
  });
  const toGroundless = () => go(() => {
    app.land(() => {
      app.setLayer('ground', false);
      app.setLayer('atmosphere', false);
    });
  });

  const locate = iconButton('locate', 'Use my location', () => {
    if (!navigator.geolocation) { showStatus('This browser cannot share a location.'); return; }
    showStatus('Finding you…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      showStatus('');
      toGround({ name: 'My location', lat: Number(pos.coords.latitude.toFixed(3)), lon: Number(pos.coords.longitude.toFixed(3)), height: Math.max(0, Math.round(pos.coords.altitude ?? 0)), tz });
    }, () => showStatus('Location was not shared. Search for a city instead.'), { maximumAge: 600000, timeout: 15000 });
  }, 'outlined where-locate');

  const row = (glyph: string, name: string, sub: string, onclick: () => void, current: boolean, extra?: HTMLElement) =>
    h('button', { class: `where-row${current ? ' current' : ''}`, type: 'button', onclick, 'aria-current': current ? 'location' : undefined },
      h('span', { class: 'where-glyph' }, icon(glyph, 18)),
      h('span', { class: 'where-row-text' }, h('span', { class: 'where-row-name' }, name, extra ?? null), h('span', { class: 'where-row-sub' }, sub)),
      icon(current ? 'check' : 'forward', 16));

  const renderPlaces = () => {
    const away = app.universe.away;
    const sky = app.mode === 'sky';
    const onGround = sky && !away && !groundless(app);
    fill(places,
      row('ground', app.site.name, 'On the ground', () => (onGround ? bar.close() : toGround()), onGround),
      row('air', 'Earth, no ground', 'Every star, no horizon or air', () => (groundless(app) ? bar.close() : toGroundless()), groundless(app)),
      row('orbit', 'Solar System', 'Above the planets, or orbit one', () => go(() => app.flyToObject('sun')), app.mode === 'space'),
      row('rocket', 'Interstellar flight', 'Fly through the stars faster than light', () => go(() => app.startFlight()), !!app.flight,
        app.flight ? undefined : h('span', { class: 'where-new' }, 'New')),
      h('button', { class: 'link-button where-coords-link', type: 'button', onclick: () => { coords.hidden = !coords.hidden; if (!coords.hidden) renderCoords(); } }, 'Enter coordinates'),
      coords);
  };

  const renderCoords = () => {
    const lat = h('input', { class: 'field', type: 'number', min: '-90', max: '90', step: 'any', inputmode: 'decimal', 'aria-label': 'Latitude, degrees north', value: String(Number(app.site.lat.toFixed(4))) });
    const lon = h('input', { class: 'field', type: 'number', min: '-180', max: '180', step: 'any', inputmode: 'decimal', 'aria-label': 'Longitude, degrees east', value: String(Number(app.site.lon.toFixed(4))) });
    const use = h('button', { class: 'pill-button', type: 'button', onclick: () => {
      const la = Number(lat.value), lo = Number(lon.value);
      if (lat.value === '' || lon.value === '' || !(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180)) { showStatus('Latitude runs from −90 to 90, longitude from −180 to 180.'); return; }
      showStatus('');
      toGround({ name: formatLatLon(la, lo), lat: la, lon: lo, height: 0, tz: Intl.DateTimeFormat().resolvedOptions().timeZone ?? '' });
    } }, 'Go');
    fill(coords,
      h('label', null, h('span', { class: 'hint' }, 'Latitude'), lat),
      h('label', null, h('span', { class: 'hint' }, 'Longitude'), lon), use);
  };

  const result = (glyph: string, name: string, sub: string, onclick: () => void) =>
    h('li', null, h('button', { class: 'where-row', type: 'button', onclick },
      h('span', { class: 'where-glyph' }, icon(glyph, 18)),
      h('span', { class: 'where-row-text' }, h('span', { class: 'where-row-name' }, name), h('span', { class: 'where-row-sub' }, sub)),
      icon('forward', 16)));

  const search = () => {
    const q = input.value.trim();
    places.hidden = !!q;
    if (!q) { fill(results); showStatus(''); return; }
    const cities = searchPlaces(q, 5).map((p) => result('ground', p.name, `City · ${p.country ?? formatLatLon(p.lat, p.lon)}`,
      () => { input.value = ''; toGround({ name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz }); }));
    const things = app.universe.search(q, 12)
      .filter((hit) => PLACE_KINDS.has(hit.kind) && hit.ref !== 'earth' && app.canFlyTo(hit.ref))
      .slice(0, 4)
      .map((hit) => {
        const star = hit.ref.startsWith('star');
        const o = star ? app.universe.resolve(hit.ref) : null;
        const ly = o?.starIndex !== undefined ? app.universe.stars.dist[o.starIndex] * 3.26156 : 0;
        return result(star ? 'star' : 'orbit', hit.name, star ? `Star · ${Math.round(ly * 10) / 10} light years · fly there` : `${hit.subtitle} · orbit it`,
          () => { input.value = ''; go(() => (star ? (app.flight ? app.setFlightHeading(hit.ref) : app.startFlight(hit.ref)) : app.flyToObject(hit.ref))); });
      });
    fill(results, cities, things);
    showStatus(cities.length || things.length ? '' : 'Nothing by that name. Try a city, a planet, or a star within about 100 light years.');
  };
  input.addEventListener('input', search);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') results.querySelector<HTMLButtonElement>('button')?.click();
  });

  const el = h('section', { class: 'where-bar glass chrome', hidden: true, 'aria-label': 'Where' },
    h('div', { class: 'where-top' }, input, locate, iconButton('close', 'Close', () => bar.close(), 'outlined where-close')),
    status, results, places);

  const bar: WhereBar = {
    el,
    get open() { return isOpen; },
    show() {
      if (isOpen) return;
      isOpen = true;
      input.value = '';
      coords.hidden = true;
      search();
      renderPlaces();
      el.hidden = false;
      opts.chip()?.setAttribute('aria-expanded', 'true');
      opts.onToggle(true);
      // The keyboard only comes up when asked for: focus the list, not the box, on touch screens.
      if (matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      el.hidden = true;
      input.blur();
      showStatus('');
      opts.chip()?.setAttribute('aria-expanded', 'false');
      opts.onToggle(false);
    },
  };
  for (const e of ['mode', 'site', 'settings'] as const) app.on(e, () => { if (isOpen && !input.value) renderPlaces(); });
  return bar;
}
