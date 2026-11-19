// Tonight: what the coming night holds from here, with one thing picked out
// to go and look at.

import type { AstroEvent } from '../astro/events.ts';
import { makeFrame } from '../astro/ephemeris.ts';
import { type NightSky, moonFace, nightSky } from '../astro/lunar.ts';
import { compassWord, describeSkyPosition, formatDate, formatDuration, formatRelativeDay, formatTime, localTime } from '../sim/format.ts';
import type { Scene } from '../sim/scene.ts';
import { type Tonight, type TonightBody, tonight } from '../sim/tonight.ts';
import { earthSite } from '../sim/universe.ts';
import { fullMoonName, isBlueMoon } from '../sim/mooncal.ts';
import { h, fill, icon } from './dom.ts';
import { moonPicture } from './moonpic.ts';
import type { Panel, Shell } from './shell.ts';

interface Prompt {
  /** The plain almanac line. */
  text: string;
  scene: Scene;
}

export function tonightPanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel tonight-panel' });
  let key = '';
  let data: Tonight | null = null;
  let sky: NightSky | null = null;
  let events: AstroEvent[] | null = null;
  let eventsKey = '';

  const style = () => ({ hour12: app.store.data.settings.hour12 });
  const time = (jd: number | null) => (jd === null ? '' : formatTime(jd, app.site, style()));
  const name = (id: string) => app.universe.resolve(id)?.name ?? id;

  /** "Best at 21:15, halfway up in the south". */
  const describeBody = (b: TonightBody): string => {
    if (!b.visible || b.best === null) {
      return b.rise === null && b.set === null ? 'Not in the night sky' : 'Lost in the glow near the Sun';
    }
    const where = describeSkyPosition(b.bestAz, b.bestAlt);
    if (b.when === 'evening') return `After sunset, ${where}${b.set ? ` · sets ${time(b.set)}` : ''}`;
    if (b.when === 'morning') return `${b.rise ? `Rises ${time(b.rise)}, ` : 'Before dawn, '}${where} by dawn`;
    return `Best at ${time(b.best)}, ${where}`;
  };

  const lookAt = (id: string, jd: number | null, fov = 60): Scene => ({
    time: jd === null ? undefined : { jd }, rate: 1, select: id, camera: { look: id, fov },
  });

  /** The things worth pointing out tonight, most notable first. */
  const prompts = (t: Tonight): Prompt[] => {
    const out: Prompt[] = [];
    const soon = (events ?? []).filter((e) => e.importance >= 2 && e.t > t.anchor - 0.25 && e.t < t.anchor + 1.25);
    for (const e of soon) {
      out.push({ text: `${e.title}. ${e.detail}`, scene: { time: { jd: e.t }, rate: 1, select: e.bodies[0], camera: e.bodies[0] ? { look: e.bodies[0], fov: 50 } : undefined } });
    }
    const seen = t.planets.filter((p) => p.visible && p.mag < 2).sort((a, b) => a.mag - b.mag);
    for (const p of seen.slice(0, 3)) {
      const whenText = p.when === 'evening' ? 'after dark' : p.when === 'morning' ? 'before dawn' : `around ${time(p.best)}`;
      const lead = p === seen[0]
        ? `${name(p.id)} is the brightest planet in the sky tonight. Look to the ${compassWord(p.bestAz)} ${whenText}.`
        : p.when === 'morning' ? `${name(p.id)} is up before dawn: look to the ${compassWord(p.bestAz)}.`
        : `${name(p.id)} is up tonight: look to the ${compassWord(p.bestAz)} ${whenText}.`;
      out.push({ text: lead, scene: lookAt(p.id, p.best) });
    }
    if (t.moon.visible && t.moon.illum > 0.08 && t.moon.best !== null) {
      const m = t.moon;
      const tail = m.illum > 0.95 ? 'It will wash out the faint stars, but the bright rays around its craters are at their best.'
        : m.illum < 0.5 ? 'Along the line between light and dark, crater shadows are long and sharp in binoculars.'
        : 'Look along the edge of the shadow, where the mountains catch the light.';
      out.push({ text: `The Moon is a ${m.phaseName.toLowerCase().replace(' moon', ' Moon')}, ${Math.round(m.illum * 100)}% lit. ${tail}`, scene: lookAt('moon', m.best, 30) });
    }
    const c = t.constellations[0];
    if (c && t.darkness !== 'day') {
      const mid = t.darkFrom !== null && t.darkUntil !== null ? (t.darkFrom + t.darkUntil) / 2 : t.anchor + 0.5;
      out.push({ text: `${c.name} rides high in the middle of the night, ${describeSkyPosition(c.az, c.alt)}. Trace its figure, then see what surrounds it.`, scene: { time: { jd: mid }, rate: 1, select: c.ref, camera: { look: c.ref, fov: 70 } } });
    }
    return out;
  };

  const promptCard = (prompt: Prompt) => h('section', { class: 'card prompt' }, h('p', null, prompt.text),
    h('button', { class: 'pill-button primary', type: 'button', onclick: () => shell.show(prompt.scene) }, 'Show me'));

  // ------------------------------------------------------------ dark sky: the night as a band

  /** "18:00", or "6 pm" on a 12-hour clock: short labels for the band's hours. */
  const hourLabel = (hour: number) => style().hour12 ? `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'am' : 'pm'}` : `${String(hour).padStart(2, '0')}:00`;

  const darkCard = (t: Tonight) => {
    const tw = t.twilight;
    const ns = sky;
    // The band runs from an hour before sunset to an hour after sunrise, or noon to noon without them.
    const a = tw.sunset !== null && tw.sunrise !== null && tw.sunrise > tw.sunset ? tw.sunset - 1 / 24 : t.anchor;
    const b = tw.sunset !== null && tw.sunrise !== null && tw.sunrise > tw.sunset ? tw.sunrise + 1 / 24 : t.anchor + 1;
    const x = (jd: number) => Math.min(100, Math.max(0, ((jd - a) / (b - a)) * 100));
    const known = ([
      [tw.sunset, 'var(--tl-day)'], [tw.civilDusk, 'var(--tl-civil)'], [tw.nauticalDusk, 'var(--tl-nautical)'], [tw.astroDusk, 'var(--tl-dark)'],
      [tw.astroDawn, 'var(--tl-dark)'], [tw.nauticalDawn, 'var(--tl-nautical)'], [tw.civilDawn, 'var(--tl-civil)'], [tw.sunrise, 'var(--tl-day)'],
    ] as [number | null, string][]).filter((e): e is [number, string] => e[0] !== null).sort((p, q) => p[0] - q[0]);
    const fallback = t.darkness === 'day' ? 'var(--tl-day)' : t.darkness === 'polar-night' ? 'var(--tl-dark)' : 'var(--tl-nautical)';
    const skyBand = h('div', { class: 'nb-sky' });
    skyBand.style.background = known.length
      ? `linear-gradient(90deg, var(--tl-day) 0%, ${known.map(([jd, c]) => `${c} ${x(jd).toFixed(2)}%`).join(', ')}, var(--tl-day) 100%)`
      : fallback;

    // Where the Moon is up, brighter the fuller it is.
    const moonBars: HTMLElement[] = [];
    if (ns) {
      let from = -1;
      for (let i = 0; i <= ns.moonAlt.length; i++) {
        const jd = ns.start + i * ns.step;
        const up = i < ns.moonAlt.length && ns.moonAlt[i] > -0.0145 && jd >= a && jd <= b;
        if (up && from < 0) from = jd;
        if (!up && from >= 0) {
          const bar = h('div', { class: 'nb-moonup' });
          bar.style.left = `${x(from)}%`;
          bar.style.width = `${x(jd) - x(from)}%`;
          bar.style.opacity = String(0.3 + 0.7 * t.moon.illum);
          moonBars.push(bar);
          from = -1;
        }
      }
    }
    const moonless = ns ? ns.moonless.filter(([p, q]) => q > a && p < b) : [];
    const freeBars = moonless.map(([p, q]) => {
      const bar = h('div', { class: 'nb-free' });
      bar.style.left = `${x(p)}%`;
      bar.style.width = `${x(q) - x(p)}%`;
      return bar;
    });

    // Hour ticks: every hour, labelled every two or three.
    const ticks: HTMLElement[] = [];
    const span = (b - a) * 24;
    const every = span > 16 ? 4 : span > 10 ? 3 : 2;
    const first = localTime(a, app.site);
    let jd = a + ((60 - first.minute) % 60) / 1440 - first.second / 86400;
    for (; jd < b; jd += 1 / 24) {
      const hour = localTime(jd + 1 / 2880, app.site).hour;
      const tick = h('span', { class: `nb-tick${hour % every === 0 ? ' major' : ''}` }, hour % every === 0 ? hourLabel(hour) : '');
      tick.style.left = `${x(jd)}%`;
      ticks.push(tick);
    }
    const now = app.clock.jdUT;
    const nowMark = now > a && now < b ? h('div', { class: 'nb-now', title: 'Now' }) : null;
    if (nowMark) nowMark.style.left = `${x(now)}%`;

    const darkTitle = t.darkness === 'dark' && t.darkFrom !== null && t.darkUntil !== null
      ? [h('span', null, `${time(t.darkFrom)} –`), ' ', h('span', null, time(t.darkUntil))]
      : t.darkness === 'polar-night' ? 'Dark all day' : t.darkness === 'twilight' ? 'Twilight all night' : 'No night';
    const hours = ns?.darkHours ?? 0;
    const free = ns?.moonlessHours ?? 0;
    const verdict = t.darkness !== 'dark' ? (t.darkness === 'twilight' ? 'The Sun stays less than 18° down, so the sky never gets fully dark.' : t.darkness === 'day' ? 'The Sun does not set.' : '')
      : free < 0.25 ? 'The Moon is up through all the dark hours.'
      : free > hours - 0.25 ? 'No Moon in the dark hours: the best kind of night for faint stars.'
      : `Dark with the Moon down ${moonless.map(([p, q]) => `${time(p)} – ${time(q)}`).join(', ')}.`;
    const facts = [
      tw.sunset !== null ? `Sunset ${time(tw.sunset)}` : null,
      tw.sunrise !== null ? `Sunrise ${time(tw.sunrise)}` : null,
    ].filter(Boolean).join(' · ');

    return h('section', { class: 'card dark-card' },
      h('div', { class: 'dc-head' },
        h('span', { class: 'card-label' }, 'Dark sky'),
        t.darkness === 'dark' ? h('span', { class: 'dc-hours' }, `${formatDuration(hours / 24)} dark`, free > 0.25 && free < hours - 0.25 ? ` · ${formatDuration(free / 24)} without the Moon` : '') : null),
      h('span', { class: 'tile-value' }, darkTitle),
      h('div', { class: 'night-band', role: 'img', 'aria-label': `${facts}. ${verdict}` },
        skyBand, h('div', { class: 'nb-moonrow' }, moonBars, freeBars), nowMark),
      h('div', { class: 'nb-ticks', 'aria-hidden': 'true' }, ticks),
      h('div', { class: 'nb-legend', 'aria-hidden': 'true' },
        h('span', null, h('i', { class: 'sw sw-twilight' }), 'Twilight'),
        h('span', null, h('i', { class: 'sw sw-dark' }), 'Dark'),
        h('span', null, h('i', { class: 'sw sw-moon' }), 'Moon up'),
        h('span', null, h('i', { class: 'sw sw-free' }), 'Dark, no Moon')),
      h('p', { class: 'dc-verdict' }, verdict),
      facts ? h('p', { class: 'hint' }, facts) : null);
  };

  // ------------------------------------------------------------ the Moon, as it looks tonight

  const moonCard = (t: Tonight) => {
    const m = t.moon;
    const site = app.site;
    const when = m.best ?? t.anchor + 0.5;
    const face = moonFace(app.universe.eph, makeFrame(app.universe.eph, when, earthSite(site)), 'zenith');
    const riseSet = ([['rises', m.rise], ['sets', m.set]] as [string, number | null][])
      .filter((e): e is [string, number] => e[1] !== null);
    riseSet.sort((p, q) => p[1] - q[1]);
    const riseText = riseSet.length
      ? riseSet.map(([w, jd]) => `${w} ${time(jd)}`).join(' · ').replace(/^./, (c) => c.toUpperCase())
      : m.visible ? 'Up all night' : 'Not up tonight';
    const lastNew = (events ?? []).filter((e) => e.kind === 'moon-phase' && e.data?.phase === 0 && e.t <= when).pop();
    const age = lastNew ? when - lastNew.t : null;
    const next = (events ?? []).find((e) => e.kind === 'moon-phase' && e.t > app.clock.jdUT);
    const nextName = next && next.data?.phase === 2 ? fullMoonName(app.universe.eph, site, next.t).name : null;
    const nextBlue = next && nextName ? isBlueMoon(site, next.t, (events ?? []).filter((e) => e.kind === 'moon-phase' && e.data?.phase === 2).map((e) => e.t)) : false;
    const nextText = next ? `${nextName ? `${nextBlue ? 'Blue Moon, the ' : 'The '}${nextName}` : next.title} ${Math.abs(next.t - app.clock.jdUT) < 13 ? formatRelativeDay(next.t, app.clock.jdUT, site) : `on ${formatDate(next.t, site, { weekday: true, noYear: true })}`}, ${time(next.t)}` : null;
    const pic = moonPicture(face, 96, `The Moon ${Math.round(m.illum * 100)}% lit, as it looks at ${time(when)}`);
    return h('section', { class: 'card moon-card' },
      h('div', { class: 'mc-row' },
        h('button', { class: 'moon-pic-button', type: 'button', title: 'Show the Moon in the sky', onclick: () => shell.show(lookAt('moon', m.visible ? m.best : null, 30)) }, pic),
        h('div', { class: 'mc-text' },
          h('span', { class: 'card-label' }, 'Moon'),
          h('span', { class: 'tile-value' }, `${Math.round(m.illum * 100)}% lit`),
          h('span', { class: 'mc-phase' }, age === null ? m.phaseName : `${m.phaseName} · ${Math.max(0, age).toFixed(1)} days old`),
          h('span', { class: 'hint' }, riseText),
          nextText ? h('span', { class: 'hint' }, nextText) : null)),
      h('p', { class: 'hint mc-note' }, `As it looks${m.visible ? ` at ${time(when)}` : ''}, with the top toward the sky overhead.`),
      h('div', { class: 'button-row' },
        h('button', { class: 'pill-button', type: 'button', onclick: () => shell.show(lookAt('moon', m.visible ? m.best : null, 30)) }, icon('sky', 16), 'Show me'),
        h('button', { class: 'pill-button', type: 'button', onclick: () => shell.openMoonCalendar() }, icon('calendar', 16), 'Moon calendar')));
  };

  const render = () => {
    const t = data;
    if (!t) return;
    const site = app.site;
    const list = prompts(t);
    // One prompt a day, the same all day; big events always win.
    const dayNumber = Math.floor(t.anchor);
    const prompt = list.length ? (list[0].scene.time && (events ?? []).some((e) => e.importance >= 2 && Math.abs(e.t - t.anchor - 0.5) < 0.75) ? list[0] : list[dayNumber % list.length]) : null;

    const m = t.moon;
    const row = (b: TonightBody) => h('li', null, h('button', {
      class: `row${b.visible ? '' : ' dim'}`, type: 'button',
      onclick: () => shell.show(lookAt(b.id, b.visible ? b.best : null, 50)),
    }, h('span', { class: 'row-name' }, name(b.id)), h('span', { class: 'row-detail' }, describeBody(b))));

    const upcoming = (events ?? []).filter((e) => e.t > app.clock.jdUT - 0.1 && e.importance >= 1).slice(0, 7);
    const eventRow = (e: AstroEvent) => h('li', null, h('button', {
      class: 'row', type: 'button', title: e.detail,
      onclick: () => shell.show({ time: { jd: e.t }, rate: 1, select: e.bodies[0], camera: e.bodies[0] ? { look: e.bodies[0], fov: 50 } : undefined }),
    }, h('span', { class: 'row-text' }, e.title), h('span', { class: 'row-when' },
      Math.abs(e.t - app.clock.jdUT) < 13 ? formatRelativeDay(e.t, app.clock.jdUT, site) : formatDate(e.t, site, { noYear: true }))));

    fill(el,
      h('p', { class: 'lede' }, `${site.name} · ${formatDate(t.anchor, site, { weekday: true, long: true, noYear: true })}`),
      prompt ? promptCard(prompt) : null,
      darkCard(t),
      moonCard(t),
      h('section', { class: 'card list' }, h('h3', { class: 'card-label' }, 'Planets'), h('ul', { class: 'rows', role: 'list' },
        [...t.planets].sort((a, b) => Number(b.visible) - Number(a.visible) || (a.best ?? 0) - (b.best ?? 0)).map(row))),
      t.constellations.length ? h('section', { class: 'card' }, h('h3', { class: 'card-label' }, 'Constellations overhead'),
        h('div', { class: 'chips' }, t.constellations.map((c) => h('button', {
          class: 'chip-button', type: 'button',
          onclick: () => shell.show({ select: c.ref, camera: { look: c.ref, fov: 70 } }),
        }, c.name)))) : null,
      h('section', { class: 'card list' }, h('h3', { class: 'card-label' }, 'Coming up'),
        events === null ? h('p', { class: 'hint' }, 'Working out the weeks ahead…')
          : upcoming.length ? h('ul', { class: 'rows', role: 'list' }, upcoming.map(eventRow))
          : h('p', { class: 'hint' }, 'Nothing notable in the next few weeks.')));
  };

  const refresh = () => {
    const site = app.site;
    const jd = app.clock.jdUT;
    const k = `${Math.floor(jd * 24)}|${site.lat}|${site.lon}|${site.tz}|${app.universe.cultureId}`;
    if (k !== key) {
      key = k;
      data = tonight(app.universe, jd);
      sky = nightSky(app.universe.eph, earthSite(site), data.anchor);
    }
    const ek = String(Math.floor(jd));
    if (ek !== eventsKey) {
      eventsKey = ek;
      events = null;
      app.events.range(jd - 31, jd + 50).then((list) => {
        if (eventsKey !== ek) return;
        events = list.sort((a, b) => a.t - b.t);
        if (el.isConnected) render();
      }).catch(() => { if (eventsKey === ek) { events = []; if (el.isConnected) render(); } });
    }
    render();
  };
  // Keep up if the clock is moved while the sheet is open.
  app.on('time', () => { if (el.isConnected) refresh(); });
  return { title: 'Tonight', el, refresh };
}
