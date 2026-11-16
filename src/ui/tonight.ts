// Tonight: what the coming night holds from here, with one thing picked out
// to go and look at.

import type { AstroEvent } from '../astro/events.ts';
import { compassWord, describeSkyPosition, formatDate, formatRelativeDay, formatTime } from '../sim/format.ts';
import type { Scene } from '../sim/scene.ts';
import { type Tonight, type TonightBody, tonight } from '../sim/tonight.ts';
import { h, fill } from './dom.ts';
import { blurb } from './facts.ts';
import type { Panel, Shell } from './shell.ts';

interface Prompt {
  text: string;
  scene: Scene;
}

export function tonightPanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel tonight-panel' });
  let key = '';
  let data: Tonight | null = null;
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
        : `${name(p.id)} is up tonight: look to the ${compassWord(p.bestAz)} ${whenText}.`;
      const extra = blurb(app.universe.resolve(p.id)!) ?? '';
      out.push({ text: `${lead} ${extra}`.trim(), scene: lookAt(p.id, p.best) });
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

  const render = () => {
    const t = data;
    if (!t) return;
    const site = app.site;
    const list = prompts(t);
    // One prompt a day, the same all day; big events always win.
    const dayNumber = Math.floor(t.anchor);
    const prompt = list.length ? (list[0].scene.time && (events ?? []).some((e) => e.importance >= 2 && Math.abs(e.t - t.anchor - 0.5) < 0.75) ? list[0] : list[dayNumber % list.length]) : null;

    const tw = t.twilight;
    const darkTitle = t.darkness === 'dark' && t.darkFrom !== null && t.darkUntil !== null ? `${time(t.darkFrom)} – ${time(t.darkUntil)}`
      : t.darkness === 'polar-night' ? 'All day' : t.darkness === 'twilight' ? 'Twilight all night' : 'No night';
    const darkSub = tw.sunset !== null ? `Sunset ${time(tw.sunset)}`
      : t.darkness === 'day' ? 'The Sun does not set' : 'The Sun does not rise';
    const m = t.moon;
    // An evening Moon is already up at sunset, so its setting is the news; otherwise its rising.
    const risesInNight = m.rise !== null && (tw.sunset === null || m.rise > tw.sunset);
    const moonSub = [m.phaseName, risesInNight ? `rises ${time(m.rise)}` : m.set !== null ? `sets ${time(m.set)}` : ''].filter(Boolean).join(' · ');

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
      prompt ? h('section', { class: 'card prompt' }, h('p', null, prompt.text),
        h('button', { class: 'pill-button primary', type: 'button', onclick: () => shell.show(prompt.scene) }, 'Show me')) : null,
      h('div', { class: 'tiles' },
        h('section', { class: 'card tile' }, h('span', { class: 'card-label' }, 'Dark sky'), h('span', { class: 'tile-value' }, darkTitle), h('span', { class: 'hint' }, darkSub)),
        h('button', { class: 'card tile', type: 'button', onclick: () => shell.show(lookAt('moon', m.visible ? m.best : null, 30)) },
          h('span', { class: 'card-label' }, 'Moon'), h('span', { class: 'tile-value' }, `${Math.round(m.illum * 100)}% lit`), h('span', { class: 'hint' }, moonSub))),
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
    }
    const ek = String(Math.floor(jd));
    if (ek !== eventsKey) {
      eventsKey = ek;
      events = null;
      app.events.range(jd - 1, jd + 50).then((list) => {
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
