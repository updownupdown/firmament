// Settings, and the forms for a place on the Earth (in Where) and a date (in
// When). The layer lists here also feed the View panel (viewbar.ts), which owns
// everything about what the sky shows.

import { DEG } from '../astro/math.ts';
import { fetchText } from '../data/load.ts';
import { JD_MAX, JD_MIN } from '../sim/clock.ts';
import { MONTHS, formatLatLon, formatYear, formatZone, jdFromLocal, localTime } from '../sim/format.ts';
import { PLACES, searchPlaces } from '../sim/places.ts';
import type { LayerFlags } from '../sim/scene.ts';
import type { Site } from '../sim/universe.ts';
import { h, fill, icon, toggle } from './dom.ts';
import type { App } from '../app.ts';
import type { Panel, Shell } from './shell.ts';

// ------------------------------------------------------------------ layers and settings

/** A layer as a tile: [layer, label, icon, what it is]. */
export type LayerTile = [keyof LayerFlags, string, string, string];

export const LAYER_GROUPS: { title: string; note?: string; items: LayerTile[] }[] = [
  { title: 'On the sky', items: [
    ['lines', 'Figures', 'figures', 'Constellation figures'],
    ['constellationLabels', 'Constellations', 'names', 'Constellation names'],
    ['starLabels', 'Star names', 'starname', 'Names of bright stars'],
    ['planetLabels', 'Planets', 'planet', 'Names of the planets and the Moon'],
    ['dsos', 'Deep sky', 'galaxy', 'Galaxies, clusters and nebulae'],
    ['milkyWay', 'Milky Way', 'milkyway', 'The glow of our galaxy'],
    ['skyOrbits', 'Orbits', 'skyorbit', 'The planets\' and the Moon\'s orbits, as seen from where you stand'],
    ['boundaries', 'Borders', 'bounds', 'The official borders between constellations'],
  ] },
  { title: 'Guides', items: [
    ['gridAltAz', 'Altitude', 'dome', 'Altitude and direction grid'],
    ['gridEquatorial', 'Equator', 'globe', 'Equatorial grid: right ascension and declination'],
    ['ecliptic', 'Ecliptic', 'ecliptic', 'The path the Sun follows through the year'],
    ['gridGalactic', 'Galactic', 'galactic', 'Galactic grid, centred on the Milky Way\'s core'],
    ['cardinals', 'Compass', 'compass', 'North, east, south and west on the horizon'],
  ] },
  { title: 'Air and ground', items: [
    ['atmosphere', 'Atmosphere', 'air', 'Daylight, twilight and haze near the horizon'],
    ['ground', 'Ground', 'ground', 'The ground below the horizon'],
  ] },
  { title: 'Space view', items: [
    ['orbits', 'Orbits', 'orbit', 'Orbit lines in Space view'],
    ['smallBodies', 'Belts', 'belt', 'The asteroid belt, Kuiper belt and Oort cloud in Space view'],
    ['compressed', 'Compressed', 'squeeze', 'Squeeze distances and sizes so planets show as discs'],
  ] },
];

export const BORTLE = ['', 'Pristine dark site', 'Truly dark site', 'Rural sky', 'Rural edge', 'Suburban sky', 'Bright suburb', 'Suburb to city', 'City sky', 'Inner city'];

export function settingsPanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel view-panel' });
  const credits = h('div', { class: 'credits', hidden: true });
  let creditsLoaded = false;

  const loadCredits = () => {
    credits.hidden = !credits.hidden;
    if (creditsLoaded) return;
    creditsLoaded = true;
    credits.textContent = 'Loading…';
    fetchText('ATTRIBUTION.md').then((md) => fill(credits, renderAttribution(md)))
      .catch(() => { credits.textContent = 'The credits could not be loaded. They are in data/ATTRIBUTION.md.'; creditsLoaded = false; });
  };

  const section = (title: string, ...body: (HTMLElement | null)[]) =>
    h('section', { class: 'view-section' }, h('h3', { class: 'section-title' }, title), ...body);
  const action = (glyph: string, label: string, onclick: () => void, extra: Record<string, string> = {}) =>
    h('button', { class: 'action-row', type: 'button', onclick, ...extra }, icon(glyph, 18), h('span', null, label), icon('forward', 16));

  const refresh = () => {
    // Rebuilding the panel must not lose the keyboard's place.
    const focused = (document.activeElement as HTMLElement | null)?.closest?.('.toggle')?.textContent;
    queueMicrotask(() => { if (focused) ([...el.querySelectorAll('.toggle')] as HTMLElement[]).find((t) => t.textContent === focused)?.querySelector('input')?.focus(); });
    const s = app.store.data.settings;
    const install = installButton(shell);
    fill(el,
      h('p', { class: 'lede' }, 'What the sky shows (layers, looks, light pollution and sky culture) is under View.'),
      section('Comfort',
        h('div', { class: 'control-card' },
          toggle('Night vision', s.nightVision, (on) => app.updateSettings((x) => { x.nightVision = on; }), 'A dim red screen that keeps your eyes dark-adapted'),
          toggle('12-hour clock', s.hour12, (on) => app.updateSettings((x) => { x.hour12 = on; })),
          toggle('Reduce motion', s.reducedMotion, (on) => app.updateSettings((x) => { x.reducedMotion = on; }), 'Jump between views instead of gliding'))),
      section('More',
        h('div', { class: 'control-card rows' },
          action('share', 'Copy a link to this view', () => share(shell)),
          action('eye', 'Just the sky', () => { shell.closeSheet(); app.setStill(true); }),
          install,
          action('info', 'Credits and data sources', loadCredits, { 'aria-expanded': String(!credits.hidden) })),
        credits));
  };
  return { title: 'Settings', el, refresh };
}

// Installing as an app: Chrome and Edge offer a prompt we can trigger; Safari
// needs the Share menu. Nothing is shown once the app is installed.
interface InstallPrompt extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }
let installPrompt: InstallPrompt | null = null;
addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installPrompt = e as InstallPrompt; });
addEventListener('appinstalled', () => { installPrompt = null; });

function installButton(shell: Shell): HTMLElement | null {
  const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  if (standalone) return null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  if (!installPrompt && !ios) return null;
  return h('button', {
    class: 'action-row', type: 'button',
    onclick: async () => {
      if (installPrompt) {
        const p = installPrompt;
        installPrompt = null;
        await p.prompt();
        const choice = await p.userChoice;
        if (choice.outcome === 'accepted') shell.toast('Firmament is installed. It works offline too.');
        shell.panels.settings.refresh();
      } else {
        shell.toast('In Safari, tap Share, then “Add to Home Screen”.');
      }
    },
  }, icon('download', 18), h('span', null, 'Install as an app'), icon('forward', 16));
}

export function share(shell: Shell): void {
  const url = shell.app.shareUrl();
  history.replaceState(history.state, '', url);
  const done = () => shell.toast('Link copied. It opens this exact sky.');
  const failed = () => shell.toast('The link is in the address bar, ready to copy.');
  if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).then(done, failed);
  else failed();
}

/** ATTRIBUTION.md is a short table plus a paragraph; show it as a list with working links. */
function renderAttribution(md: string): Node[] {
  const inline = (text: string): (Node | string)[] => {
    const out: (Node | string)[] = [];
    const re = /\[([^\]]+)\]\((https?:[^)]+)\)|`([^`]+)`/g;
    let last = 0, m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      if (m.index > last) out.push(text.slice(last, m.index));
      out.push(m[1] ? h('a', { href: m[2], target: '_blank', rel: 'noopener' }, m[1]) : h('code', null, m[3]));
      last = re.lastIndex;
    }
    if (last < text.length) out.push(text.slice(last));
    return out;
  };
  const nodes: Node[] = [];
  const rows: Node[] = [];
  let para: string[] = [];
  const flush = () => { if (para.length) nodes.push(h('p', null, inline(para.join(' ')))); para = []; };
  for (const line of md.split('\n')) {
    if (line.startsWith('|')) {
      const cells = line.split('|').slice(1, -1).map((c) => c.trim());
      if (cells[0] === 'File' || /^-+$/.test(cells[0])) continue;
      rows.push(h('li', null, h('span', { class: 'credit-source' }, inline(cells[1])), h('span', { class: 'hint' }, inline(`${cells[2]} · ${cells[0]}`))));
    } else if (line.startsWith('#')) flush();
    else if (line.trim() === '') flush();
    else para.push(line.trim());
  }
  flush();
  return [h('p', null, 'Firmament computes the sky itself from published models. Its catalogs come from:'), h('ul', { class: 'credit-list' }, rows), ...nodes.slice(1)];
}

// ------------------------------------------------------------------ place and time

function nearestZone(lat: number, lon: number): string {
  let best = '', bestD = 4; // degrees, roughly 400 km
  for (const p of PLACES) {
    const d = Math.hypot(p.lat - lat, (p.lon - lon) * Math.cos(lat * DEG));
    if (d < bestD) { bestD = d; best = p.tz; }
  }
  return best;
}

/** Choosing a place on the Earth: city search, recent places, your location, coordinates. */
export function placeForm(app: App, onChosen: (site: Site) => void): { el: HTMLElement; refresh: () => void } {
  const placeInput = h('input', { class: 'field', type: 'search', placeholder: 'Find a city', autocomplete: 'off', 'aria-label': 'Find a city' });
  const placeList = h('ul', { class: 'result-list compact', role: 'list' });
  const placeStatus = h('p', { class: 'hint', role: 'status' });
  const lat = h('input', { class: 'field', type: 'number', min: '-90', max: '90', step: 'any', inputmode: 'decimal', 'aria-label': 'Latitude, degrees north' });
  const lon = h('input', { class: 'field', type: 'number', min: '-180', max: '180', step: 'any', inputmode: 'decimal', 'aria-label': 'Longitude, degrees east' });

  const choose = (site: Site) => { placeInput.value = ''; onChosen(site); renderPlaces(); };
  const placeRow = (s: Site) => h('li', null, h('button', { class: 'result', type: 'button', onclick: () => choose(s) },
    h('span', { class: 'result-main' }, h('span', { class: 'result-name' }, s.name), h('span', { class: 'result-sub' }, s.country ?? formatLatLon(s.lat, s.lon)))));
  const renderPlaces = () => {
    const site = app.site;
    const q = placeInput.value.trim();
    const list: Site[] = q
      ? searchPlaces(q, 8).map((p) => ({ name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz }))
      : app.store.data.recentSites.filter((s) => s.name !== site.name).slice(0, 4);
    fill(placeList, list.map(placeRow));
    placeStatus.textContent = q && !list.length ? 'No city by that name here. You can enter coordinates instead.' : '';
    if (document.activeElement !== lat && document.activeElement !== lon) {
      lat.value = String(Number(site.lat.toFixed(4)));
      lon.value = String(Number(site.lon.toFixed(4)));
    }
  };
  placeInput.addEventListener('input', renderPlaces);

  const locate = h('button', { class: 'pill-button', type: 'button', onclick: () => {
    if (!navigator.geolocation) { placeStatus.textContent = 'This browser cannot share a location.'; return; }
    placeStatus.textContent = 'Finding you…';
    navigator.geolocation.getCurrentPosition((pos) => {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? '';
      choose({ name: 'My location', lat: Number(pos.coords.latitude.toFixed(3)), lon: Number(pos.coords.longitude.toFixed(3)), height: Math.max(0, Math.round(pos.coords.altitude ?? 0)), tz });
      placeStatus.textContent = '';
    }, () => { placeStatus.textContent = 'Location was not shared. Pick a city or enter coordinates instead.'; }, { maximumAge: 600000, timeout: 15000 });
  } }, icon('locate', 18), 'My location');

  const useCoords = h('button', { class: 'pill-button', type: 'button', onclick: () => {
    const la = Number(lat.value), lo = Number(lon.value);
    if (lat.value === '' || lon.value === '' || !(Math.abs(la) <= 90) || !(Math.abs(lo) <= 180)) {
      placeStatus.textContent = 'Latitude runs from −90 to 90 and longitude from −180 to 180 (west is negative).';
      return;
    }
    const tz = nearestZone(la, lo);
    choose({ name: formatLatLon(la, lo), lat: la, lon: lo, height: 0, tz });
    placeStatus.textContent = tz ? '' : 'No time zone is known for that spot, so the clock shows local mean time.';
  } }, 'Go');

  const coords = h('details', { class: 'place-coords' },
    h('summary', { class: 'link-button' }, 'Enter coordinates'),
    h('div', { class: 'coord-row' },
      h('label', null, h('span', { class: 'hint' }, 'Latitude'), lat),
      h('label', null, h('span', { class: 'hint' }, 'Longitude'), lon), useCoords));
  const el = h('div', { class: 'place-form' },
    h('div', { class: 'place-search' }, placeInput, locate),
    placeList, coords, placeStatus);
  return { el, refresh: renderPlaces };
}

/** Typing a date and time: any year, AD or BC, to the clock's limits. */
export function dateForm(app: App): { el: HTMLElement; refresh: () => void } {
  const year = h('input', { class: 'field', type: 'number', min: '1', max: '99000', step: '1', inputmode: 'numeric', 'aria-label': 'Year' });
  const era = h('select', { class: 'field', 'aria-label': 'Era' }, h('option', { value: 'ad' }, 'AD'), h('option', { value: 'bc' }, 'BC'));
  const month = h('select', { class: 'field', 'aria-label': 'Month' }, MONTHS.map((m, i) => h('option', { value: String(i + 1) }, m)));
  const day = h('input', { class: 'field', type: 'number', min: '1', max: '31', step: '1', inputmode: 'numeric', 'aria-label': 'Day' });
  const hour = h('input', { class: 'field', type: 'number', min: '0', max: '23', step: '1', inputmode: 'numeric', 'aria-label': 'Hour, 0 to 23' });
  const minute = h('input', { class: 'field', type: 'number', min: '0', max: '59', step: '1', inputmode: 'numeric', 'aria-label': 'Minute' });
  const timeFields = [year, era, month, day, hour, minute];
  const timeNote = h('p', { class: 'hint' });
  const timeStatus = h('p', { class: 'hint', role: 'status' });

  const renderTime = () => {
    const lt = localTime(app.clock.jdUT, app.site);
    const acc = app.clock.accuracy;
    timeNote.textContent = `${formatYear(lt.year)} · ${formatZone(lt.offset)}${lt.calendar === 'julian' ? ' · Julian calendar' : ''}. ${acc.detail}`;
    if (timeFields.includes(document.activeElement as HTMLInputElement)) return;
    year.value = String(lt.year > 0 ? lt.year : 1 - lt.year);
    era.value = lt.year > 0 ? 'ad' : 'bc';
    month.value = String(lt.month);
    day.value = String(lt.day);
    hour.value = String(lt.hour);
    minute.value = String(lt.minute).padStart(2, '0');
  };
  const applyTime = () => {
    const y = Math.round(Number(year.value));
    if (!(y >= 1)) { timeStatus.textContent = 'Enter a year of 1 or more, and choose AD or BC.'; return; }
    const astroYear = era.value === 'bc' ? 1 - y : y;
    const clampInt = (el: HTMLInputElement, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(Number(el.value)) || lo));
    const jd = jdFromLocal(app.site, astroYear, Number(month.value), clampInt(day, 1, 31), clampInt(hour, 0, 23), clampInt(minute, 0, 59));
    if (jd < JD_MIN || jd > JD_MAX) { timeStatus.textContent = 'Firmament covers 100,000 years either side of the year 2000.'; return; }
    timeStatus.textContent = '';
    // A chosen moment should hold still until the player runs time again.
    app.setRate(app.clock.rate, true);
    app.setTime(jd);
  };
  for (const f of timeFields) f.addEventListener('change', applyTime);

  const el = h('div', { class: 'date-form' },
    h('div', { class: 'date-row' },
      h('label', null, h('span', { class: 'hint' }, 'Day'), day),
      h('label', { class: 'grow2' }, h('span', { class: 'hint' }, 'Month'), month),
      h('label', { class: 'grow2' }, h('span', { class: 'hint' }, 'Year'), year)),
    h('div', { class: 'date-row' },
      h('label', null, h('span', { class: 'hint' }, 'Era'), era),
      h('label', null, h('span', { class: 'hint' }, 'Hour'), hour),
      h('label', null, h('span', { class: 'hint' }, 'Minute'), minute)),
    timeStatus, timeNote);
  return { el, refresh: renderTime };
}
