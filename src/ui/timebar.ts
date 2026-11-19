// When: the chip at the top right says the date and time, with a small glyph
// for whether time is live, running or stopped (not a button). Tapping it opens
// the When panel over the chips, with no title: the date once, then tonight from
// noon to noon with twilight behind the Moon and the bright planets; zoomed out,
// a month or a year with its events. Drag the strip to scrub, step to the same
// time on the next night, month or year, and from one row: zoom, jump to a
// moment, play, and pick a speed (our own menus). While time runs the panel
// shrinks to one slim bar with a mini strip; tap it open again. The toolbar
// stays in view below it.

import type { App } from '../app.ts';
import { makeFrame, observeBody } from '../astro/ephemeris.ts';
import { jdNow } from '../astro/time.ts';
import type { AstroEvent } from '../astro/events.ts';
import { RATE_STEPS, describeRate } from '../sim/clock.ts';
import { dateForm } from './panels.ts';
import { MONTHS_SHORT, calendarNote, formatDate, formatTime, formatYear, localTime } from '../sim/format.ts';
import { addMonths, monthOf } from '../sim/events.ts';
import { type TimelineWindow, type TimelineZoom, BRIGHT_PLANETS, nightMoments, nightSpan, planetName, shiftSameTime, timelineWindow, upSpans, withClockOf } from '../sim/timeline.ts';
import { type Tonight, tonight } from '../sim/tonight.ts';
import { earthSite } from '../sim/universe.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { type MenuItem, picker } from './menu.ts';

export interface TimeBar {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

const ZOOMS: [TimelineZoom, string][] = [['night', 'Night'], ['month', 'Month'], ['year', 'Year']];
/** Speeds in the menu, written out. */
const RATE_NAMES = ['Real time', '1 minute', '10 minutes', '1 hour', '1 day', '1 week', '1 month', '1 year', '1 century'];
const STEP_UNIT: Record<TimelineZoom, 'day' | 'month' | 'year'> = { night: 'day', month: 'month', year: 'year' };
/** Month and year play steps the date at the same clock time: days per step, and ms between steps. */
const STEPPING: Record<'month' | 'year', [number, number]> = { month: [1, 350], year: [3, 110] };
const NIGHT_RATE = 3600;

/** "1 hour per second", "Backward, 1 day per second". */
function longRate(rate: number): string {
  const i = RATE_STEPS.indexOf(Math.abs(rate));
  if (i < 0) return describeRate(rate);
  return `${rate < 0 ? 'Backward, ' : ''}${i === 0 ? 'real time' : `${RATE_NAMES[i]} per second`}`.replace(/^r/, 'R');
}

/** The When chip and its panel. Opening the panel is the shell's call, so it can close whatever else is open. */
export function timeChip(app: App, opts: { onToggle: (open: boolean) => void }): { chip: HTMLElement; bar: TimeBar } {
  const style = () => ({ hour12: app.store.data.settings.hour12 });
  const site = () => app.site;
  const timeOf = (jd: number) => formatTime(jd, site(), style());

  // ------------------------------------------------------------ the chip
  const state = h('span', { class: 'chip-state', 'aria-hidden': 'true' });
  const note = h('span', { class: 'chip-note' });
  const when = h('span', { class: 'chip-value' });
  const opener = h('button', { class: 'chip glass when-chip chrome', type: 'button', 'aria-expanded': 'false' },
    h('span', { class: 'chip-glyph' }, icon('clock', 20)),
    h('span', { class: 'chip-text' }, h('span', { class: 'chip-cap' }, state, note), when));

  // ------------------------------------------------------------ the bar's parts
  const titleText = h('span', { class: 'tl-title' });
  const subtitle = h('span', { class: 'tl-subtitle' });
  const prev = iconButton('back', '', () => step(-1), 'tl-step');
  const next = iconButton('forward', '', () => step(1), 'tl-step');
  const band = h('div', { class: 'tl-band' });
  const lanes = h('div', { class: 'tl-lanes' });
  const ticks = h('div', { class: 'tl-ticks' });
  const nowMark = h('div', { class: 'tl-now', title: 'Now' });
  const headTime = h('span', { class: 'tl-head-time' });
  const head = h('div', { class: 'tl-head' }, headTime);
  const strip = h('div', {
    class: 'tl-strip', role: 'slider', tabindex: '0', 'aria-label': 'Time', 'aria-valuemin': '0', 'aria-valuemax': '100',
  }, band, lanes, ticks, nowMark, head);
  // Moments and events: one menu to jump from.
  const moments = picker({
    label: 'Jump to a moment', text: 'Jump', items: [], className: 'tl-jump',
    onPick: (v) => { const t = Number(v); if (Number.isFinite(t)) jump(t); },
  });
  const zoomPick = picker({
    label: 'Timeline span', items: ZOOMS.map(([z, label]) => ({ value: z, label })), value: 'night', className: 'tl-zoom',
    onPick: (v) => setZoom(v as TimelineZoom),
  });
  const playButton = iconButton('play', '', () => play(), 'tl-play');
  // Speed: one list of paces, and a switch above it for forward or backward.
  let direction = 1;
  const speedItems: MenuItem[] = RATE_STEPS.map((r, i) => ({ value: String(r), label: RATE_NAMES[i] ?? describeRate(r), detail: r === 1 ? undefined : 'per second' }));
  const speed = picker({
    label: 'Speed of time', items: speedItems, value: '1', className: 'tl-speed',
    short: (item) => describeRate(Number(item.value) * direction),
    header: () => {
      const seg = h('div', { class: 'segmented tl-direction', role: 'group', 'aria-label': 'Direction of time' });
      for (const [d, label, glyph] of [[-1, 'Backward', 'slower'], [1, 'Forward', 'faster']] as const) {
        const b = h('button', {
          type: 'button', 'aria-pressed': String(direction === d),
          onclick: () => {
            if (direction === d) return;
            direction = d;
            for (const o of seg.querySelectorAll('button')) o.setAttribute('aria-pressed', String(o === b));
            stopStepping();
            app.setRate(Math.abs(app.clock.rate) * d, app.clock.paused);
            speed.value = speed.value;
          },
        }, d < 0 ? icon(glyph, 14) : null, label, d > 0 ? icon(glyph, 14) : null);
        seg.append(b);
      }
      return seg;
    },
    onPick: (v) => { stopStepping(); app.setRate(Number(v) * direction, false); },
  });
  const nowButton = h('button', { class: 'pill-button tl-now-button', type: 'button', onclick: () => { stopStepping(); app.goToNow(); } }, 'Back to now');
  // The date, written out; tapping it opens the fields to type any date.
  const dateText = h('span', { class: 'tl-date-text' });
  const status = h('span', { class: 'tl-status' });
  const accuracy = h('p', { class: 'hint tl-accuracy' });
  const form = dateForm(app);
  form.el.hidden = true;
  const dateButton = h('button', { class: 'tl-date', type: 'button', 'aria-expanded': 'false', onclick: () => {
    form.el.hidden = !form.el.hidden;
    dateButton.setAttribute('aria-expanded', String(!form.el.hidden));
    if (!form.el.hidden) form.refresh();
  } }, dateText, icon('pencil', 16));
  // While time runs: one slim row (pause, the date and pace, speed, open) over a mini strip.
  const miniPause = iconButton('pause', 'Pause', () => play(), 'tl-play tl-mini-pause');
  const miniDate = h('span', { class: 'tl-mini-date' });
  const miniPace = h('span', { class: 'tl-mini-pace' });
  const miniSpeedSlot = h('span', { class: 'tl-mini-speed' });
  const expandButton = iconButton('down', 'Show the whole timeline', () => { expanded = true; renderHead(); }, 'tl-expand');
  const miniRow = h('div', { class: 'tl-mini-row' }, miniPause, h('div', { class: 'tl-mini-text' }, miniDate, miniPace), miniSpeedSlot, expandButton);
  const speedSlot = h('span', { class: 'tl-speed-slot' }, speed.el);
  const el = h('section', { class: 'time-bar glass chrome', hidden: true, 'aria-label': 'When' },
    miniRow,
    h('header', { class: 'tl-top' },
      h('div', { class: 'tl-when' }, dateButton, status),
      nowButton,
      iconButton('close', 'Close', () => bar.close(), 'panel-close')),
    accuracy,
    form.el,
    h('div', { class: 'tl-header' }, h('div', { class: 'tl-heading' }, titleText, subtitle), prev, next),
    strip,
    h('div', { class: 'tl-footer' }, zoomPick.el, moments.el, h('span', { class: 'grow' }), playButton, speedSlot));

  // ------------------------------------------------------------ state
  let isOpen = false;
  let zoom: TimelineZoom = 'night';
  let win: TimelineWindow | null = null;
  let winKey = '';
  let night: Tonight | null = null;
  let nightKey = '';
  let events: AstroEvent[] = [];
  let stepTimer = 0;
  /** Opened up again by hand while time runs (otherwise the panel is the slim bar). */
  let expanded = false;
  let wasRunning = false;
  /** While the night plays: pause on reaching this instant (sunrise, or the end of the strip). */
  let stopAt: number | null = null;

  const span = () => (win ? win.end - win.start : 1);
  const xOf = (jd: number) => win ? Math.min(100, Math.max(0, ((jd - win.start) / span()) * 100)) : 0;

  // ------------------------------------------------------------ building the strip for a window
  const siteKey = () => `${site().lat},${site().lon},${site().tz}`;
  const ensureWindow = (force = false) => {
    const jd = app.clock.jdUT;
    if (!force && win && win.zoom === zoom && jd >= win.start && jd < win.end && winKey === siteKey()) return;
    // Running fast, time leaves the strip every frame; rebuilding it each time (a night's
    // rise and set times, a month's events) is what made fast play stutter. Rebuild a few
    // times a second at most (a night every 1.5 s), and let the head rest at the strip's edge in between.
    const t = performance.now();
    // A night costs most (rise and set searches for every planet), so it waits longest.
    if (!force && win && !app.clock.paused && t - lastBuild < (zoom === 'night' ? 1500 : 400)) return;
    lastBuild = t;
    win = timelineWindow(zoom, jd, site());
    winKey = siteKey();
    build();
  };
  let lastBuild = 0;

  const tick = (x: number, text: string, major = false) =>
    h('span', { class: major ? 'tl-tick major' : 'tl-tick', style: `left:${x}%` }, h('span', null, text));

  const build = () => {
    if (!win) return;
    fill(lanes);
    fill(ticks);
    fillMoments([]);
    events = [];
    if (zoom === 'night') buildNight();
    else buildCalendar();
    renderHeading();
  };

  const buildNight = () => {
    const w = win!;
    const key = `${w.start.toFixed(5)}|${siteKey()}|${app.universe.cultureId}`;
    if (key !== nightKey) {
      night = tonight(app.universe, w.start + 0.01);
      nightKey = key;
    }
    const n = night!, tw = n.twilight;
    // The band: day, then the twilights, darkness, and back.
    const stops: [number | null, string][] = [
      [tw.sunset, 'var(--tl-day)'], [tw.civilDusk, 'var(--tl-civil)'], [tw.nauticalDusk, 'var(--tl-nautical)'], [tw.astroDusk, 'var(--tl-dark)'],
      [tw.astroDawn, 'var(--tl-dark)'], [tw.nauticalDawn, 'var(--tl-nautical)'], [tw.civilDawn, 'var(--tl-civil)'], [tw.sunrise, 'var(--tl-day)'],
    ];
    const known = stops.filter(([t]) => t !== null && t >= w.start && t <= w.end) as [number, string][];
    const fallback = n.darkness === 'day' ? 'var(--tl-day)' : n.darkness === 'polar-night' ? 'var(--tl-dark)' : 'var(--tl-nautical)';
    band.style.background = known.length
      ? `linear-gradient(90deg, var(--tl-day) 0%, ${known.map(([t, c]) => `${c} ${xOf(t).toFixed(2)}%`).join(', ')}, var(--tl-day) 100%)`
      : fallback;
    // Lanes: the Moon and the bright planets that can be seen tonight.
    const planets = n.planets.filter((p) => p.visible && BRIGHT_PLANETS.includes(p.id));
    const [dusk, dawn] = nightSpan(n, w.start, w.end);
    const bodies = [n.moon, ...planets.sort((a, b) => BRIGHT_PLANETS.indexOf(a.id) - BRIGHT_PLANETS.indexOf(b.id))];
    strip.style.height = `${8 + bodies.length * 14 + 18}px`;
    fill(lanes, bodies.map((b) => {
      const spans = upSpans(b, w.start, w.end)
        .map(([a, c]) => [Math.max(a, dusk), Math.min(c, dawn)] as [number, number]).filter(([a, c]) => c - a > 1 / 72);
      const name = b.id === 'moon' ? 'Moon' : planetName(b.id);
      const longest = spans.reduce((a, s) => (s[1] - s[0] > a[1] - a[0] ? s : a), [0, 0] as [number, number]);
      // The name sits beside its longest run, on whichever side has room.
      const right = xOf(longest[1]) < 72;
      return h('div', { class: 'tl-lane', dataset: { body: b.id } },
        spans.map(([a, c]) => h('span', { class: 'tl-run', style: `left:${xOf(a)}%;width:${xOf(c) - xOf(a)}%` })),
        h('span', { class: 'tl-lane-name', style: right ? `left:calc(${xOf(longest[1])}% + 6px)` : `right:calc(${100 - xOf(longest[0])}% + 6px)` }, name));
    }));
    // Hour ticks every three hours.
    const lt = localTime(w.start, site());
    for (let k = 0; k <= 24; k += 3) {
      const jd = w.start + k / 24;
      if (k === 0 || k === 24) continue;
      const hour = (lt.hour + k) % 24;
      ticks.append(tick(xOf(jd), formatTime(jd, site(), style()).replace(':00', '').replace(/^0(\d)$/, '$1'), hour === 0));
    }
    fillMoments(nightMoments(n, w.start, w.end).map((m) => [m.label, timeOf(m.t), m.t]));
  };

  const buildCalendar = () => {
    const w = win!;
    strip.style.height = '';
    const s = site();
    if (zoom === 'month') {
      // The band: how bright the Moon is each night, at 10 pm.
      const days = Math.round(w.end - w.start);
      const es = earthSite(s);
      const stops: string[] = [];
      for (let d = 0; d < days; d++) {
        const f = makeFrame(app.universe.eph, w.start + d + 22 / 24, es);
        const illum = observeBody(app.universe.eph, f, 'moon').illum;
        stops.push(`color-mix(in srgb, var(--tl-moonlit) ${Math.round(illum * 100)}%, var(--tl-dark)) ${(((d + 0.5) / days) * 100).toFixed(2)}%`);
        const day = d + 1;
        if (day === 1 || day % 5 === 0) ticks.append(tick(xOf(w.start + d + 0.5), String(day), day === 1));
      }
      band.style.background = `linear-gradient(90deg, ${stops.join(', ')})`;
    } else {
      band.style.background = 'linear-gradient(90deg, var(--tl-nautical), var(--tl-dark) 50%, var(--tl-nautical))';
      for (let m = 0; m < 12; m++) {
        const start = shiftSameTime(w.start, s, 'month', m);
        const end = shiftSameTime(w.start, s, 'month', m + 1);
        ticks.append(tick(xOf((start + end) / 2), MONTHS_SHORT[m].slice(0, 1), false));
        if (m > 0) lanes.append(h('span', { class: 'tl-divider', style: `left:${xOf(start)}%` }));
      }
    }
    // Events arrive from the worker; the strip may have moved on by then.
    const forWindow = win;
    // A year is twelve months of work the first time, so show each month as it comes.
    const months = zoom === 'month' ? [monthOf(w.start + 1)] : Array.from({ length: 13 }, (_, k) => addMonths(monthOf(w.start + 1), k - 1));
    const found: AstroEvent[] = [];
    let pending = months.length;
    const show = (list: AstroEvent[]) => {
      if (win !== forWindow || !isOpen) return;
      found.push(...list);
      pending--;
      const min = zoom === 'month' ? 1 : 2;
      events = found.sort((a, b) => a.t - b.t).filter((e) => e.t >= w.start && e.t < w.end && (e.importance >= min || e.kind === 'season' && zoom === 'year'));
      fill(lanes, [...lanes.querySelectorAll<HTMLElement>('.tl-divider')],
        h('div', { class: 'tl-lane tl-events' }, events.map((e) => h('span', { class: `tl-dot imp-${e.importance}`, style: `left:${xOf(e.t)}%`, title: e.title }))));
      fillMoments(events.map((e) => [e.title, formatDate(e.t, s, { noYear: true }), e.t]),
        pending > 0 ? 'Finding more events…' : events.length ? null : zoom === 'month' ? 'No major events this month' : 'No major events this year');
    };
    for (const k of months) {
      app.events.month(k).then(show).catch(() => {
        if (win === forWindow) fillMoments([], 'Events could not be worked out');
      });
    }
    fillMoments([], 'Finding events…');
  };

  /** The jump menu: each moment or event, with its time or date on the right. */
  const fillMoments = (items: [string, string, number][], empty: string | null = null) => {
    moments.setItems(items.map(([label, detail, t]) => ({ value: String(t), label, detail })),
      empty ?? (zoom === 'night' ? 'Nothing to jump to tonight' : 'No events found'));
  };

  // ------------------------------------------------------------ reading it out
  const renderHeading = () => {
    if (!win) return;
    const s = site();
    const now = jdNow();
    if (zoom === 'night') {
      const nowWin = timelineWindow('night', now, s);
      const d = Math.round(win.start - nowWin.start);
      titleText.textContent = d === 0 ? 'Tonight' : d === 1 ? 'Tomorrow night' : d === -1 ? 'Last night' : formatDate(win.start, s, { weekday: true, noYear: true }) + ' night';
      const a = localTime(win.start, s), b = localTime(win.end, s);
      const sameYear = a.year === localTime(now, s).year;
      subtitle.textContent = `${formatDate(win.start, s, { weekday: true, noYear: true })} → ${b.day} ${MONTHS_SHORT[b.month - 1]}${sameYear ? '' : ' ' + formatYear(b.year)}`;
      prev.setAttribute('aria-label', 'Same time, the night before');
      next.setAttribute('aria-label', 'Same time, the next night');
    } else if (zoom === 'month') {
      const lt = localTime(win.start + 1, s);
      titleText.textContent = `${MONTHS_SHORT[lt.month - 1]} ${formatYear(lt.year)}`;
      subtitle.textContent = 'Moonlight each night, and events';
      prev.setAttribute('aria-label', 'Same time, a month earlier');
      next.setAttribute('aria-label', 'Same time, a month later');
    } else {
      titleText.textContent = formatYear(localTime(win.start + 1, s).year);
      subtitle.textContent = 'Seasons and the year’s big events';
      prev.setAttribute('aria-label', 'Same time, a year earlier');
      next.setAttribute('aria-label', 'Same time, a year later');
    }
    prev.title = prev.getAttribute('aria-label')!;
    next.title = next.getAttribute('aria-label')!;
    zoomPick.value = zoom;
  };

  const renderHead = () => {
    if (!win) return;
    const jd = app.clock.jdUT;
    const x = xOf(jd);
    head.style.left = `${x}%`;
    headTime.textContent = zoom === 'night' ? timeOf(jd) : formatDate(jd, site(), { noYear: true });
    // Keep the label inside the strip near the ends.
    headTime.style.transform = `translateX(${x < 10 ? -10 : x > 90 ? -90 : -50}%)`;
    strip.setAttribute('aria-valuenow', x.toFixed(0));
    strip.setAttribute('aria-valuetext', `${formatDate(jd, site(), { weekday: true })}, ${timeOf(jd)}`);
    const now = jdNow();
    nowMark.hidden = !(now >= win.start && now < win.end) || app.clock.live;
    nowMark.style.left = `${xOf(now)}%`;
    nowButton.hidden = app.clock.live;
    const running = stepTimer !== 0 || !app.clock.paused && app.clock.rate !== 1;
    // Starting to run shrinks the panel to its slim bar; stopping opens it again.
    if (running && !wasRunning) expanded = false;
    wasRunning = running;
    const compact = running && !expanded;
    if (el.classList.contains('compact') !== compact) {
      el.classList.toggle('compact', compact);
      (compact ? miniSpeedSlot : speedSlot).append(speed.el);
      speed.close();
      if (compact) { form.el.hidden = true; dateButton.setAttribute('aria-expanded', 'false'); }
    }
    fill(playButton, icon(running ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', running ? 'Pause' : zoom === 'night' ? 'Play the night' : zoom === 'month' ? 'Play night by night' : 'Play the year');
    playButton.title = playButton.getAttribute('aria-label')!;
    if (app.clock.rate !== 0) direction = app.clock.rate < 0 ? -1 : 1;
    speed.value = String(Math.abs(app.clock.rate));
    const thisYear = localTime(jd, site()).year === localTime(jdNow(), site()).year;
    dateText.textContent = `${formatDate(jd, site(), { weekday: true, noYear: thisYear })} · ${timeOf(jd)}`;
    const pace = stepTimer ? (zoom === 'month' ? 'Night by night' : 'Through the year') : running ? longRate(app.clock.rate) : '';
    const cal = calendarNote(jd, site());
    status.textContent = [app.clock.live ? 'Now, in real time' : pace ? `Running · ${pace}` : app.clock.paused ? 'Stopped' : 'Running in real time', cal].filter(Boolean).join(' · ');
    status.classList.toggle('live', app.clock.live);
    if (compact) {
      miniDate.textContent = `${formatDate(jd, site(), { weekday: true, noYear: thisYear })} · ${timeOf(jd)}`;
      miniPace.textContent = pace;
    }
    const acc = app.clock.accuracy;
    accuracy.textContent = acc.level === 'precise' ? '' : acc.detail;
    accuracy.hidden = !accuracy.textContent;
    if (!form.el.hidden) form.refresh();
  };

  // ------------------------------------------------------------ doing things
  const pauseClock = () => { if (!app.clock.paused) app.setRate(app.clock.rate, true); };

  const jump = (t: number) => {
    stopStepping();
    pauseClock();
    app.setTime(t);
  };

  const step = (dir: number) => {
    stopStepping();
    pauseClock();
    app.setTime(shiftSameTime(app.clock.jdUT, site(), STEP_UNIT[zoom], dir));
  };

  const setZoom = (z: TimelineZoom) => {
    if (z === zoom) return;
    stopStepping();
    zoom = z;
    ensureWindow(true);
    renderHead();
  };

  const stopStepping = () => {
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = 0;
    stopAt = null;
  };

  const play = () => {
    const running = stepTimer !== 0 || !app.clock.paused && app.clock.rate !== 1;
    if (running) { stopStepping(); pauseClock(); renderHead(); return; }
    if (zoom === 'night') {
      const jd = app.clock.jdUT;
      const sunrise = night?.twilight.sunrise ?? null;
      stopAt = sunrise !== null && sunrise > jd + 1 / 1440 ? sunrise : win!.end > jd + 1 / 1440 ? win!.end : null;
      app.setRate(NIGHT_RATE, false);
    } else {
      const [days, ms] = STEPPING[zoom];
      pauseClock();
      stepTimer = window.setInterval(() => {
        // Running time some other way ends the stepping.
        if (!app.clock.paused) { stopStepping(); renderHead(); return; }
        app.setTime(shiftSameTime(app.clock.jdUT, site(), 'day', days));
      }, ms);
    }
    renderHead();
  };

  // Dragging the strip: the instant under the finger. Zoomed out, the date
  // under the finger at the same clock time, so the sky doesn't spin.
  const timeAt = (clientX: number) => {
    const r = strip.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const jd = win!.start + f * span();
    if (zoom === 'night') return Math.min(jd, win!.end - 1 / 86400);
    const t = withClockOf(jd, app.clock.jdUT, site());
    return Math.min(Math.max(t, win!.start), win!.end - 1 / 86400);
  };
  let dragging = false;
  strip.addEventListener('pointerdown', (e) => {
    if (!win) return;
    strip.setPointerCapture(e.pointerId);
    dragging = true;
    strip.classList.add('dragging');
    stopStepping();
    pauseClock();
    app.setTime(timeAt(e.clientX));
  });
  strip.addEventListener('pointermove', (e) => { if (dragging) app.setTime(timeAt(e.clientX)); });
  const endDrag = () => { dragging = false; strip.classList.remove('dragging'); };
  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);
  strip.addEventListener('keydown', (e) => {
    const unit = zoom === 'night' ? (e.shiftKey ? 1 / 24 : 10 / 1440) : e.shiftKey ? 7 : 1;
    const d = e.key === 'ArrowRight' ? unit : e.key === 'ArrowLeft' ? -unit : 0;
    if (!d) return;
    e.preventDefault();
    stopStepping();
    pauseClock();
    app.setTime(app.clock.jdUT + d);
  });

  // ------------------------------------------------------------ opening and closing
  const bar: TimeBar = {
    el,
    get open() { return isOpen; },
    show() {
      if (isOpen) return;
      isOpen = true;
      el.hidden = false;
      opener.setAttribute('aria-expanded', 'true');
      opts.onToggle(true);
      ensureWindow(true);
      renderHead();
      strip.focus({ preventScroll: true });
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      el.hidden = true;
      form.el.hidden = true;
      dateButton.setAttribute('aria-expanded', 'false');
      opener.setAttribute('aria-expanded', 'false');
      moments.close(); zoomPick.close(); speed.close();
      stopStepping();
      opts.onToggle(false);
    },
  };
  opener.addEventListener('click', () => (isOpen ? bar.close() : bar.show()));

  // ------------------------------------------------------------ keeping it current
  const updateChip = () => {
    const c = app.clock, jd = c.jdUT, s = site();
    // This year needs no year; any other does. The weekday is in the When panel.
    const thisYear = localTime(jd, s).year === localTime(jdNow(), s).year;
    const text = `${formatDate(jd, s, { noYear: thisYear })} · ${timeOf(jd)}`;
    when.textContent = text;
    // A glyph for the state, not a button: live, running at some pace, or stopped.
    const running = !c.paused || stepTimer !== 0;
    const live = c.live;
    const mode = live ? 'live' : running ? (c.rate < 0 ? 'back' : 'run') : 'stop';
    if (state.dataset.mode !== mode) {
      state.dataset.mode = mode;
      fill(state, mode === 'live' ? null : icon(mode === 'stop' ? 'pause' : mode === 'back' ? 'slower' : 'play', 10));
    }
    const pace = stepTimer ? (zoom === 'month' ? 'Night by night' : 'Through the year') : live ? 'Now' : running ? describeRate(c.rate) : '';
    // The pace, or else the calendar in use (Julian, before 1582). How accurate the sky is shows in the panel.
    const cal = calendarNote(jd, s);
    note.textContent = pace || cal || 'When';
    note.classList.toggle('warn', !pace && !!cal);
    const label = `When: ${text}${live ? ', now' : running ? `, running at ${describeRate(c.rate)}` : ', stopped'}. Open the timeline.`;
    opener.setAttribute('aria-label', label);
  };
  const update = () => {
    updateChip();
    if (!isOpen) return;
    // Playing the night stops at sunrise.
    if (stopAt !== null && !app.clock.paused && app.clock.jdUT >= stopAt) {
      const end = stopAt;
      stopAt = null;
      app.setRate(app.clock.rate, true);
      app.setTime(end);
    }
    ensureWindow();
    renderHead();
  };
  for (const e of ['second', 'time', 'settings'] as const) app.on(e, update);
  app.on('site', () => { if (isOpen) ensureWindow(true); update(); });
  app.on('data', () => { nightKey = ''; if (isOpen && zoom === 'night') ensureWindow(true); });
  let lastText = 0;
  app.on('frame', () => {
    // While time is racing, keep the readout current without rebuilding it every frame.
    const t = performance.now();
    if (t - lastText > 100) { lastText = t; update(); }
  });
  updateChip();

  return { chip: opener, bar };
}
