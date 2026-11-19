// The Moon phase calendar: a month of Moons as they really look, with each
// night's dark sky with the Moon down, then the chosen day in detail and the
// month's phases, perigee and apogee, and eclipses. A modal over whatever is
// open, reached from Tonight, the Moon's focus card and its Atlas page.

import { DEG } from '../astro/math.ts';
import { MONTHS, WEEKDAYS, formatDate, formatDuration, formatTime, localTime } from '../sim/format.ts';
import {
  type MoonDay, type MoonMonth, EVENING_HOUR, darkestStretch, moonMonth, moonMonthSpan, sizeVsMean,
} from '../sim/mooncal.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { moonPicture } from './moonpic.ts';
import type { Shell } from './shell.ts';

export interface MoonCalendar {
  el: HTMLElement;
  readonly open: boolean;
  show(jd?: number): void;
  close(): void;
}

const QUARTER = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter'];
const QUARTER_SHORT = ['New', '1st qtr', 'Full', 'Last qtr'];
const km = (x: number) => `${Math.round(x / 100) * 100 > 0 ? (Math.round(x / 100) * 100).toLocaleString('en-US') : '0'} km`;

export function moonCalendar(shell: Shell, onToggle: (open: boolean) => void): MoonCalendar {
  const app = shell.app;
  const style = () => ({ hour12: app.store.data.settings.hour12 });
  const time = (jd: number | null) => (jd === null ? '–' : formatTime(jd, app.site, style()));

  const title = h('h2', { class: 'modal-title', id: 'moon-cal-title', tabindex: '-1' }, 'Moon calendar');
  const monthLabel = h('span', { class: 'mcal-month' });
  const thisMonth = h('button', { class: 'chip-button', type: 'button', onclick: () => go(now()) }, 'This month');
  const grid = h('div', { class: 'mcal-grid', role: 'grid' });
  const detail = h('div', { class: 'mcal-detail' });
  const summary = h('div', { class: 'mcal-summary' });
  const legend = h('p', { class: 'hint mcal-legend' });
  const body = h('div', { class: 'modal-body' },
    h('div', { class: 'mcal-nav' },
      iconButton('back', 'Previous month', () => step(-1), 'mcal-step'),
      monthLabel,
      iconButton('forward', 'Next month', () => step(1), 'mcal-step'),
      thisMonth),
    grid, legend, detail, summary);
  const dialog = h('section', { class: 'modal glass mcal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'moon-cal-title' },
    h('header', { class: 'modal-head' }, h('span', { class: 'modal-glyph' }, icon('moon', 20)), title, iconButton('close', 'Close', () => api.close(), 'modal-close')),
    body);
  const el = h('div', { class: 'modal-scrim', hidden: true }, dialog);
  el.addEventListener('pointerdown', (e) => { if (e.target === el) api.close(); });
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); api.close(); }
  });

  let isOpen = false;
  let year = 0, month = 0, selected = 1;
  let data: MoonMonth | null = null;
  let token = 0;
  const cache = new Map<string, MoonMonth>();
  let lastFocus: HTMLElement | null = null;

  const now = () => {
    const lt = localTime(app.clock.jdUT, app.site);
    return { year: lt.year, month: lt.month, day: lt.day };
  };
  const go = (d: { year: number; month: number; day?: number }) => {
    year = d.year; month = d.month;
    selected = d.day ?? 1;
    load();
  };
  const step = (n: number) => {
    let m = month + n, y = year;
    if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
    const today = now();
    go({ year: y, month: m, day: today.year === y && today.month === m ? today.day : 1 });
  };

  const load = () => {
    const site = app.site;
    const key = `${year}-${month}|${site.lat}|${site.lon}|${site.tz}`;
    monthLabel.textContent = `${MONTHS[month - 1]} ${year}`;
    const today = now();
    thisMonth.hidden = today.year === year && today.month === month;
    const hit = cache.get(key);
    if (hit) { data = hit; render(); return; }
    data = null;
    fill(grid, h('p', { class: 'hint mcal-loading' }, 'Working out the month…'));
    fill(detail); fill(summary); fill(legend);
    const mine = ++token;
    const [a, b] = moonMonthSpan(site, year, month);
    const y = year, m = month;
    app.events.range(a, b).catch(() => []).then((events) => {
      if (mine !== token) return;
      // Let the "working" line paint before the sums.
      setTimeout(() => {
        if (mine !== token) return;
        const result = moonMonth(app.universe, y, m, events);
        cache.set(key, result);
        if (cache.size > 12) cache.delete(cache.keys().next().value as string);
        data = result;
        render();
      }, 16);
    });
  };

  // ------------------------------------------------------------ the grid

  const cell = (d: MoonDay, m: MoonMonth, today: ReturnType<typeof now>) => {
    const isToday = today.year === d.year && today.month === d.month && today.day === d.day;
    const bar = h('i', { class: 'mcal-bar' });
    bar.style.width = `${m.maxDark > 0 ? Math.round((d.night.moonlessHours / m.maxDark) * 100) : 0}%`;
    const marks = [
      d.eclipses.length ? h('span', { class: 'mcal-mark eclipse', title: d.eclipses[0].title }, icon('eclipse', 12)) : null,
      d.size === 'super' ? h('span', { class: 'mcal-mark super', title: 'Supermoon' }, 'S') : null,
      d.size === 'micro' ? h('span', { class: 'mcal-mark micro', title: 'Micromoon' }, 'm') : null,
    ];
    const label = `${WEEKDAYS[d.weekday]} ${d.day}: ${d.phaseName}, ${Math.round(d.illum * 100)}% lit${d.quarter ? `, ${QUARTER[d.quarter.q]} at ${time(d.quarter.t)}` : ''}`;
    return h('button', {
      class: `mcal-cell${isToday ? ' today' : ''}${d.day === selected ? ' selected' : ''}${d.quarter ? ' quarter' : ''}`,
      type: 'button', role: 'gridcell', 'aria-label': label, 'aria-selected': String(d.day === selected),
      onclick: () => { selected = d.day; render(); },
    },
    h('span', { class: 'mcal-day' }, String(d.day), marks),
    moonPicture(d.face, 30),
    h('span', { class: 'mcal-phase' }, d.quarter ? QUARTER_SHORT[d.quarter.q] : `${Math.round(d.illum * 100)}%`),
    h('span', { class: 'mcal-track', title: `${formatDuration(d.night.moonlessHours / 24)} of dark sky with the Moon down` }, bar));
  };

  // ------------------------------------------------------------ the chosen day

  const librationText = (d: MoonDay) => {
    const lon = d.face.libLon / DEG, lat = d.face.libLat / DEG;
    const parts = [
      Math.abs(lon) >= 0.5 ? `${Math.abs(lon).toFixed(1)}° ${lon > 0 ? 'toward Mare Crisium (east limb)' : 'toward Oceanus Procellarum (west limb)'}` : null,
      Math.abs(lat) >= 0.5 ? `${Math.abs(lat).toFixed(1)}° toward the ${lat > 0 ? 'north' : 'south'} pole` : null,
    ].filter(Boolean);
    return parts.length ? parts.join(', ') : 'Facing us squarely';
  };

  const nightText = (d: MoonDay) => {
    const n = d.night;
    if (n.darkHours < 0.1) return 'No full darkness: the Sun stays less than 18° down.';
    if (n.moonlessHours < 0.25) return `None: the Moon is up through all ${formatDuration(n.darkHours / 24)} of darkness.`;
    const spans = n.moonless.map(([a, b]) => `${time(a)} – ${time(b)}`).join(', ');
    return n.moonlessHours > n.darkHours - 0.25 ? `${spans}: all ${formatDuration(n.darkHours / 24)} of darkness.` : `${spans} (${formatDuration(n.moonlessHours / 24)})`;
  };

  const fact = (label: string, value: string) => h('div', { class: 'fact' }, h('dt', null, label), h('dd', null, value));

  const renderDetail = (m: MoonMonth) => {
    const d = m.days[selected - 1];
    if (!d) { fill(detail); return; }
    const site = app.site;
    const showMe = () => {
      api.close();
      shell.show({ time: { jd: d.night.moonBest }, rate: 1, select: 'moon', camera: { look: 'moon', fov: 30 } });
    };
    const ecl = d.eclipses.map((e) => {
      const info = m.eclipses.find((x) => x.event === e);
      return h('p', { class: 'mcal-eclipse' }, icon('eclipse', 16), `${e.title} at ${time(e.t)}. `,
        info?.upHere ? `Visible from ${site.name}.` : `${e.kind === 'lunar-eclipse' ? 'The Moon' : 'The Sun'} is down at ${site.name} then.`);
    });
    fill(detail, h('section', { class: 'card mcal-day-card' },
      h('div', { class: 'mcal-day-head' },
        moonPicture(d.face, 104, `The Moon on ${d.day} ${MONTHS[d.month - 1]}`),
        h('div', { class: 'mcal-day-text' },
          h('span', { class: 'card-label' }, formatDate(d.jd, site, { weekday: true, long: true, noYear: true })),
          h('span', { class: 'tile-value' }, `${d.phaseName}`),
          h('span', { class: 'mcal-sub' }, `${Math.round(d.illum * 100)}% lit · ${d.age.toFixed(1)} days old`),
          d.quarter ? h('span', { class: 'mcal-sub strong' }, `${QUARTER[d.quarter.q]} at ${time(d.quarter.t)}`) : null,
          d.size === 'super' ? h('span', { class: 'mcal-sub strong' }, 'A supermoon: a full Moon near perigee') : null,
          d.size === 'micro' ? h('span', { class: 'mcal-sub' }, 'A micromoon: a full Moon near apogee') : null)),
      ecl,
      h('dl', { class: 'facts' },
        fact('Moonrise', time(d.rise)),
        fact('Moonset', time(d.set)),
        fact('Distance', `${km(d.face.distKm)}`),
        fact('Size', `${sizeVsMean(d.face.distKm) >= 0 ? '+' : '−'}${Math.abs(sizeVsMean(d.face.distKm)).toFixed(1)}% vs. average`),
        d.apsis ? fact(d.apsis.kind === 'perigee' ? 'Perigee' : 'Apogee', `${time(d.apsis.t)}, ${km(d.apsis.km)}`) : null),
      h('div', { class: 'mcal-lines' },
        h('div', null, h('span', { class: 'card-label' }, 'Dark sky with the Moon down'), h('p', null, nightText(d))),
        h('div', null, h('span', { class: 'card-label' }, 'Libration'), h('p', null, librationText(d)),
          h('p', { class: 'hint' }, 'The Moon rocks as it orbits, so we see a little past one edge or another: up to 8° east or west and 7° north or south. Features near the tipped edge are easier to see.'))),
      h('div', { class: 'button-row' },
        h('button', { class: 'pill-button primary', type: 'button', onclick: showMe }, icon('sky', 16), 'Show in the sky'))));
  };

  // ------------------------------------------------------------ the month

  const renderSummary = (m: MoonMonth) => {
    const site = app.site;
    const when = (jd: number) => `${formatDate(jd, site, { weekday: true, noYear: true })}, ${time(jd)}`;
    const dayOf = (jd: number) => localTime(jd, site).day;
    const row = (text: string, sub: string, jd: number) => h('li', null, h('button', {
      class: 'row', type: 'button', onclick: () => { selected = dayOf(jd); render(); detail.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
    }, h('span', { class: 'row-text' }, text), h('span', { class: 'row-when' }, sub)));
    const rows: { t: number; el: HTMLElement }[] = [
      ...m.quarters.map((q) => ({ t: q.t, el: row(QUARTER[q.q] + (q.q === 2 && q.km < 360_000 ? ' (supermoon)' : ''), when(q.t), q.t) })),
      ...m.apsides.map((a) => ({ t: a.t, el: row(`${a.kind === 'perigee' ? 'Perigee, closest' : 'Apogee, farthest'}: ${km(a.km)}`, when(a.t), a.t) })),
      ...m.eclipses.map((e) => ({ t: e.event.t, el: row(`${e.event.title}${e.upHere ? '' : ' (not seen here)'}`, when(e.event.t), e.event.t) })),
    ].sort((a, b) => a.t - b.t);
    const stretch = darkestStretch(m);
    fill(summary,
      h('section', { class: 'card list' }, h('h3', { class: 'card-label' }, `${MONTHS[m.month - 1]} at a glance`),
        h('ul', { class: 'rows', role: 'list' }, rows.map((r) => r.el)),
        stretch ? h('p', { class: 'mcal-best' }, icon('star', 16),
          stretch[0] === stretch[1] ? `Darkest night: the ${ordinal(stretch[0])}.` : `Darkest nights: the ${ordinal(stretch[0])} to the ${ordinal(stretch[1])}.`,
          ' Best for the Milky Way, galaxies and meteors.') : null));
  };

  const render = () => {
    const m = data;
    if (!m) return;
    const today = now();
    const lead = m.days[0].weekday;
    fill(grid,
      WEEKDAYS.map((w) => h('span', { class: 'mcal-weekday', 'aria-hidden': 'true' }, w.slice(0, 1))),
      Array.from({ length: lead }, () => h('span', { class: 'mcal-pad' })),
      m.days.map((d) => cell(d, m, today)));
    const up = app.site.lat < 0 ? 'south' : 'north';
    fill(legend, `Each Moon is drawn as it looks at ${formatClockHour()} with ${up} at the top, as from the ${up === 'north' ? 'northern' : 'southern'} hemisphere. The bar under it is that night's dark sky with the Moon down.`);
    renderDetail(m);
    renderSummary(m);
  };

  const formatClockHour = () => (style().hour12 ? `${EVENING_HOUR % 12} pm` : `${EVENING_HOUR}:00`);

  const api: MoonCalendar = {
    el,
    get open() { return isOpen; },
    show(jd?: number) {
      const lt = localTime(jd ?? app.clock.jdUT, app.site);
      if (!isOpen) {
        lastFocus = document.activeElement as HTMLElement | null;
        isOpen = true;
        el.hidden = false;
        onToggle(true);
      }
      go({ year: lt.year, month: lt.month, day: lt.day });
      title.focus({ preventScroll: true });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      el.hidden = true;
      token++;
      onToggle(false);
      if (lastFocus?.isConnected) lastFocus.focus({ preventScroll: true });
    },
  };
  // A new place or day changes every number.
  app.on('site', () => { if (isOpen) load(); });
  app.on('settings', () => { if (isOpen && data) render(); });
  return api;
}

function ordinal(n: number): string {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${s}`;
}
