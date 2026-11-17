// The observing log: what you have seen, checked against the simulated sky.

import type { App } from '../app.ts';
import type { AstroEvent } from '../astro/events.ts';
import { DEG } from '../astro/math.ts';
import { addMonths, monthOf } from '../sim/events.ts';
import { formatDate, formatTime } from '../sim/format.ts';
import type { Scene } from '../sim/scene.ts';
import { EVENT_GOALS, type EventCheck, type EventGoal, checkEvent, checkSighting, countsFromHere, eventWindow } from '../sim/sightings.ts';
import type { LogEntry } from '../sim/store.ts';
import { MOON_PHASE_NAMES, moonElongation, moonPhaseName } from '../sim/tonight.ts';
import type { SkyObject } from '../sim/universe.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import type { Panel, Shell } from './shell.ts';

/** Record the selected object as seen now. Returns a message for the player. */
export function logSighting(app: App, obj: SkyObject): string {
  const check = checkSighting(app.universe, obj);
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

/** Record an event as seen now. Returns a message for the player. */
export function logEvent(app: App, check: EventCheck): string {
  if (app.store.data.log.some((e) => e.ref === check.ref && Math.abs(e.jdUT - app.clock.jdUT) < 2)) {
    return `${check.name} is already in your log.`;
  }
  app.store.addLog({ ref: check.ref, name: check.name, jdUT: app.clock.jdUT, site: app.site, verified: check.ok, alt: check.alt / DEG });
  return check.ok ? `Logged: ${check.name}.` : `Logged, but unconfirmed. ${check.reason}`;
}

/** What to select for an event, if it has a body to point at. */
function eventSubject(e: { kind?: string; bodies?: string[]; ref?: string }): string | undefined {
  if (e.kind === 'lunar-eclipse' || e.ref?.startsWith('event:lunar-eclipse')) return 'moon';
  if (e.kind === 'solar-eclipse' || e.ref?.startsWith('event:solar-eclipse')) return 'sun';
  return e.bodies?.find((b) => b !== 'moon') ?? e.bodies?.[0];
}

/** The sky at an event's best moment from here. */
function eventScene(e: AstroEvent, check: EventCheck): Scene {
  const subject = eventSubject(e);
  return {
    time: { jd: check.best }, rate: 1, select: subject,
    camera: check.look ? { look: { az: check.look.az / DEG, alt: check.look.alt / DEG }, fov: 100 }
      : subject ? { look: subject, fov: e.kind === 'conjunction' ? 30 : 20 } : undefined,
  };
}

/** How many months ahead "show me the next one" will look. */
const SEARCH_MONTHS = 72;

/** The next event after the clock's instant that counts toward a goal from here. */
async function nextEvent(app: App, goal: EventGoal, cancelled: () => boolean): Promise<{ event: AstroEvent; check: EventCheck } | null> {
  const start = app.clock.jdUT - 0.2;
  let month = monthOf(start);
  for (let i = 0; i < SEARCH_MONTHS && !cancelled(); i++, month = addMonths(month, 1)) {
    for (const event of await app.events.month(month)) {
      if (event.t < start) continue;
      const check = countsFromHere(app.universe, event, goal);
      if (check) return { event, check };
    }
  }
  return null;
}

interface Checklist {
  title: string;
  items: { ref: string; name: string; show?: string; goal?: EventGoal }[];
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
  // Events near the clock's instant, refetched when the day changes.
  let near: AstroEvent[] = [];
  let nearKey = '';
  let search = 0;

  const loadNear = () => {
    const jd = app.clock.jdUT;
    const key = String(Math.floor(jd * 4));
    if (key === nearKey) return;
    nearKey = key;
    app.events.range(jd - 2, jd + 2).then((list) => {
      if (nearKey !== key) return;
      near = list;
      if (el.isConnected) refresh();
    }).catch(() => { /* the checklist still works without it */ });
  };

  const showNext = (goal: EventGoal) => {
    const mine = ++search;
    const label = goal.ref.includes('shower') ? goal.name : goal.name.toLowerCase();
    shell.toast(`Looking for the next ${label}…`);
    nextEvent(app, goal, () => search !== mine).then((found) => {
      if (search !== mine) return;
      if (!found) {
        shell.toast(`No ${label} can be seen from ${app.site.name} in the next ${SEARCH_MONTHS / 12} years.`);
        return;
      }
      shell.show(eventScene(found.event, found.check));
      shell.toast(`${found.check.name}: ${formatDate(found.check.best, app.site)}, ${formatTime(found.check.best, app.site, { hour12: app.store.data.settings.hour12 })}`);
    }).catch(() => { if (search === mine) shell.toast('Could not work out the events ahead.'); });
  };

  const refresh = () => {
    loadNear();
    const log = app.store.data.log;
    const seen = new Set(log.map((e) => e.ref));
    const lists = checklists(app);
    lists.splice(2, 0, { title: 'Sky events', items: EVENT_GOALS.map((g) => ({ ref: g.ref, name: g.name, goal: g })) });

    // What is happening around the clock's instant that could be logged from here.
    const jd = app.clock.jdUT;
    const happening = near.filter((e) => Math.abs(e.t - jd) <= eventWindow(e))
      .map((e) => ({ e, check: checkEvent(app.universe, e, jd) }))
      .filter((x): x is { e: AstroEvent; check: EventCheck } => x.check !== null);
    const nowCard = happening.length ? h('section', { class: 'card list' }, h('h3', { class: 'card-label' }, 'Happening now'),
      h('ul', { class: 'rows', role: 'list' }, happening.map(({ e, check }) => {
        const logged = log.some((l) => l.ref === check.ref && Math.abs(l.jdUT - jd) < 2);
        return h('li', { class: 'event-row' },
          h('button', { class: 'row', type: 'button', title: 'Show its best moment from here', onclick: () => shell.show(eventScene(e, check)) },
            h('span', { class: 'row-text' }, check.name),
            h('span', { class: 'row-detail' }, check.ok ? 'Visible now' : check.reason)),
          h('button', {
            class: `pill-button primary${logged ? ' done' : ''}`, type: 'button', disabled: logged,
            onclick: () => { shell.toast(logEvent(app, check)); refresh(); },
          }, logged ? 'Seen' : 'I saw it'));
      }))) : null;
    const total = lists.reduce((n, l) => n + l.items.filter((i) => seen.has(i.ref)).length, 0);

    const sections = lists.map((list) => {
      const done = list.items.filter((i) => seen.has(i.ref)).length;
      const body = h('div', { class: 'check-grid', hidden: !open.has(list.title) },
        list.items.map((item) => h('button', {
          class: `check-item${seen.has(item.ref) ? ' done' : ''}`, type: 'button',
          title: seen.has(item.ref) ? `${item.name}: seen` : `${item.name}: show me`,
          onclick: () => {
            if (item.goal) showNext(item.goal);
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
          const target = e.ref.startsWith('moon:') ? 'moon' : e.ref.startsWith('event:') ? eventSubject(e) : e.ref;
          shell.show({ time: { jd: e.jdUT }, rate: 0, site: e.site, select: target, camera: target ? { look: target } : undefined });
        },
      },
      h('span', { class: 'log-name' }, e.name, e.verified ? null : h('span', { class: 'tag' }, 'unconfirmed')),
      h('span', { class: 'log-when' }, `${formatDate(e.jdUT, e.site)} · ${formatTime(e.jdUT, e.site, { hour12: app.store.data.settings.hour12 })} · ${e.site.name}`)),
      iconButton('trash', `Remove ${e.name} from the log`, () => { app.store.removeLog(e.id); refresh(); }));

    fill(el,
      h('p', { class: 'lede' }, total === 0
        ? 'Tap anything in the sky, then “I saw it”. Each sighting is checked against where the object really was.'
        : `${total} of ${lists.reduce((n, l) => n + l.items.length, 0)} collected.`),
      nowCard,
      sections,
      log.length ? h('section', { class: 'card' }, h('h3', { class: 'card-label' }, 'Sightings'), h('ul', { class: 'log-list' }, log.slice(0, 200).map(entry))) : null);
  };
  app.on('time', () => { if (el.isConnected) refresh(); });
  return { title: 'Log', el, refresh };
}
