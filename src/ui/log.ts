// The observing log: what you have seen, checked against the simulated sky.

import type { App } from '../app.ts';
import { DEG } from '../astro/math.ts';
import { formatDate, formatTime } from '../sim/format.ts';
import type { LogEntry } from '../sim/store.ts';
import { MOON_PHASE_NAMES, moonElongation, moonPhaseName } from '../sim/tonight.ts';
import type { SkyObject } from '../sim/universe.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import type { Panel, Shell } from './shell.ts';

/** Could this have been seen, at the clock's instant and place? */
export function checkSighting(app: App, obj: SkyObject): { ok: boolean; reason: string; alt: number } {
  const u = app.universe;
  const hz = u.horizontal(obj.dir);
  const sunAlt = u.horizontal(u.bodies.get('sun')!.dir).alt;
  const alt = hz.altApparent;
  if (alt < 0) return { ok: false, reason: `${obj.name} was below the horizon then.`, alt };
  if (obj.kind === 'moon' || obj.kind === 'sun') return { ok: true, reason: '', alt };
  // Brighter things survive brighter skies.
  const mag = obj.mag ?? 6;
  const needed = mag < -3.5 ? 5 : mag < -1 ? -1 : mag < 1.5 ? -4 : mag < 4 ? -8 : -12;
  if (sunAlt / DEG > needed) return { ok: false, reason: `The sky was too bright to see ${obj.name} then.`, alt };
  return { ok: true, reason: '', alt };
}

/** Record the selected object as seen now. Returns a message for the player. */
export function logSighting(app: App, obj: SkyObject): string {
  const check = checkSighting(app, obj);
  let ref = obj.ref, name = obj.name;
  if (obj.kind === 'moon') {
    const phase = moonPhaseName(moonElongation(app.universe, app.universe.frame));
    ref = `moon:${MOON_PHASE_NAMES.indexOf(phase)}`;
    name = `Moon, ${phase.toLowerCase()}`;
  }
  if (app.store.data.log.some((e) => e.ref === ref && Math.abs(e.jdUT - app.clock.jdUT) < 0.25)) {
    return `${name} is already in your log for this night.`;
  }
  app.store.addLog({ ref, name, jdUT: app.clock.jdUT, site: app.site, verified: check.ok, alt: check.alt / DEG });
  return check.ok ? `Logged: ${name}.` : `Logged, but unconfirmed. ${check.reason}`;
}

interface Checklist {
  title: string;
  items: { ref: string; name: string; show?: string }[];
}

function checklists(app: App): Checklist[] {
  const u = app.universe;
  const planets = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
  const western = u.cultures.get('western');
  return [
    { title: 'Planets', items: planets.map((id) => ({ ref: id, name: u.resolve(id)!.name, show: id })) },
    { title: 'Phases of the Moon', items: MOON_PHASE_NAMES.map((name, i) => ({ ref: `moon:${i}`, name, show: 'moon' })) },
    {
      title: 'Constellations',
      items: (western?.constellations ?? []).filter((c) => !c.asterism && c.iau)
        .map((c) => ({ ref: `con:western:${c.id}`, name: c.native ?? c.name, show: `con:western:${c.id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    },
    {
      title: 'Messier objects',
      items: u.dsos.filter((d) => d.mes).map((d) => ({ ref: `dso:${d.mes}`, name: d.mes!, show: `dso:${d.mes}` }))
        .sort((a, b) => Number(a.name.slice(1)) - Number(b.name.slice(1))),
    },
  ];
}

export function logPanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel log-panel' });
  const open = new Set<string>(['Planets']);

  const refresh = () => {
    const log = app.store.data.log;
    const seen = new Set(log.map((e) => e.ref));
    const lists = checklists(app);
    const total = lists.reduce((n, l) => n + l.items.filter((i) => seen.has(i.ref)).length, 0);

    const sections = lists.map((list) => {
      const done = list.items.filter((i) => seen.has(i.ref)).length;
      const body = h('div', { class: 'check-grid', hidden: !open.has(list.title) },
        list.items.map((item) => h('button', {
          class: `check-item${seen.has(item.ref) ? ' done' : ''}`, type: 'button',
          title: seen.has(item.ref) ? `${item.name}: seen` : `${item.name}: show me`,
          onclick: () => {
            if (!item.show) return;
            shell.show({ select: item.show, camera: { look: item.show, fov: app.framingFov(item.show) * 4 / DEG } });
          },
        }, seen.has(item.ref) ? icon('check', 14) : null, item.name)));
      const header = h('button', {
        class: 'list-header', type: 'button', 'aria-expanded': String(open.has(list.title)),
        onclick: () => {
          if (open.has(list.title)) open.delete(list.title); else open.add(list.title);
          refresh();
        },
      }, h('span', null, list.title), h('span', { class: 'count' }, `${done} of ${list.items.length}`),
      h('span', { class: 'meter', 'aria-hidden': 'true' }, h('span', { style: `width:${(done / Math.max(1, list.items.length)) * 100}%` })));
      return h('section', { class: 'card' }, header, body);
    });

    const entry = (e: LogEntry) => h('li', { class: 'log-entry' },
      h('button', {
        class: 'log-main', type: 'button', title: 'Show the sky at that moment',
        onclick: () => {
          const target = e.ref.startsWith('moon:') ? 'moon' : e.ref;
          shell.show({ time: { jd: e.jdUT }, rate: 0, site: e.site, select: target, camera: { look: target } });
        },
      },
      h('span', { class: 'log-name' }, e.name, e.verified ? null : h('span', { class: 'tag' }, 'unconfirmed')),
      h('span', { class: 'log-when' }, `${formatDate(e.jdUT, e.site)} · ${formatTime(e.jdUT, e.site, { hour12: app.store.data.settings.hour12 })} · ${e.site.name}`)),
      iconButton('trash', `Remove ${e.name} from the log`, () => { app.store.removeLog(e.id); refresh(); }));

    fill(el,
      h('p', { class: 'lede' }, total === 0
        ? 'Tap anything in the sky, then “I saw it”. Each sighting is checked against where the object really was.'
        : `${total} of ${lists.reduce((n, l) => n + l.items.length, 0)} collected.`),
      sections,
      log.length ? h('section', { class: 'card' }, h('h3', { class: 'card-label' }, 'Sightings'), h('ul', { class: 'log-list' }, log.slice(0, 200).map(entry))) : null);
  };
  return { title: 'Log', el, refresh };
}
