// Time lives in the top chip: place, date and time with play/pause beside
// them. Tapping the chip turns the bottom bar into the timeline: tonight from
// noon to noon with twilight, the Moon and the bright planets, and the night's
// moments to jump to; zoomed out, a month or a year with its events. Drag the
// strip to scrub, step to the same time on the next night, month or year, and
// play. The sky stays in view above it.

import type { App } from '../app.ts';
import { makeFrame, observeBody } from '../astro/ephemeris.ts';
import { jdNow } from '../astro/time.ts';
import type { AstroEvent } from '../astro/events.ts';
import { RATE_STEPS, describeRate } from '../sim/clock.ts';
import { MONTHS_SHORT, calendarNote, formatDate, formatTime, formatYear, localTime } from '../sim/format.ts';
import { addMonths, monthOf } from '../sim/events.ts';
import { type TimelineWindow, type TimelineZoom, BRIGHT_PLANETS, nightMoments, nightSpan, planetName, shiftSameTime, timelineWindow, upSpans, withClockOf } from '../sim/timeline.ts';
import { type Tonight, tonight } from '../sim/tonight.ts';
import { earthSite } from '../sim/universe.ts';
import { h, fill, icon, iconButton } from './dom.ts';

export interface TimeBar {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

const ZOOMS: [TimelineZoom, string][] = [['night', 'Night'], ['month', 'Month'], ['year', 'Year']];
const STEP_UNIT: Record<TimelineZoom, 'day' | 'month' | 'year'> = { night: 'day', month: 'month', year: 'year' };
/** Month and year play steps the date at the same clock time: days per step, and ms between steps. */
const STEPPING: Record<'month' | 'year', [number, number]> = { month: [1, 350], year: [3, 110] };
const NIGHT_RATE = 3600;

/** The chip and the time bar. Opening the bar is the shell's call, so it can put the dock away. */
export function timeChip(app: App, opts: { openPlace: () => void; onToggle: (open: boolean) => void }): { chip: HTMLElement; bar: TimeBar } {
  const style = () => ({ hour12: app.store.data.settings.hour12 });
  const site = () => app.site;
  const timeOf = (jd: number) => formatTime(jd, site(), style());

  // ------------------------------------------------------------ the chip
  const place = h('span', { class: 'chip-place' });
  const when = h('span', { class: 'chip-when' });
  const note = h('span', { class: 'chip-note' });
  const opener = h('button', { class: 'chip-open', type: 'button', 'aria-label': 'Time', 'aria-expanded': 'false' },
    h('span', { class: 'chip-main' }, place, when), note);
  const togglePlay = () => {
    stopStepping();
    app.setRate(app.clock.rate, !app.clock.paused);
  };
  const playPause = iconButton('pause', 'Pause time', togglePlay, 'chip-play');

  // ------------------------------------------------------------ the bar's parts
  const titleText = h('span');
  const title = h('span', { class: 'tl-title' }, titleText, icon('calendar', 14));
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
  const moments = h('div', { class: 'tl-moments', role: 'list' });
  const zoomButtons = ZOOMS.map(([z, label]) => h('button', { type: 'button', onclick: () => setZoom(z) }, label));
  const playButton = iconButton('play', '', () => play(), 'tl-play');
  const speedButton = h('button', { class: 'tl-speed', type: 'button', 'aria-expanded': 'false', onclick: () => toggleSpeeds() });
  const speeds = h('div', { class: 'tl-speeds', hidden: true, role: 'group', 'aria-label': 'Speed of time' });
  const nowButton = h('button', { class: 'pill-button primary tl-now-button', type: 'button', onclick: () => { stopStepping(); app.goToNow(); } }, 'Now');
  const el = h('section', { class: 'time-bar glass chrome', hidden: true, 'aria-label': 'Time' },
    h('header', { class: 'tl-header' }, prev,
      h('button', { class: 'tl-heading', type: 'button', title: 'Go to a date, or change place', onclick: () => opts.openPlace() }, title, subtitle),
      next),
    strip,
    moments,
    speeds,
    h('div', { class: 'tl-footer' },
      playButton,
      h('div', { class: 'tl-zoom', role: 'group', 'aria-label': 'Zoom' }, zoomButtons),
      speedButton,
      h('span', { class: 'tl-spacer' }),
      nowButton,
      iconButton('close', 'Close the timeline', () => bar.close(), 'tl-icon')));

  // ------------------------------------------------------------ state
  let isOpen = false;
  let zoom: TimelineZoom = 'night';
  let win: TimelineWindow | null = null;
  let winKey = '';
  let night: Tonight | null = null;
  let nightKey = '';
  let events: AstroEvent[] = [];
  let stepTimer = 0;
  /** While the night plays: pause on reaching this instant (sunrise, or the end of the strip). */
  let stopAt: number | null = null;

  const span = () => (win ? win.end - win.start : 1);
  const xOf = (jd: number) => win ? Math.min(100, Math.max(0, ((jd - win.start) / span()) * 100)) : 0;

  // ------------------------------------------------------------ building the strip for a window
  const siteKey = () => `${site().lat},${site().lon},${site().tz}`;
  const ensureWindow = (force = false) => {
    const jd = app.clock.jdUT;
    if (!force && win && win.zoom === zoom && jd >= win.start && jd < win.end && winKey === siteKey()) return;
    win = timelineWindow(zoom, jd, site());
    winKey = siteKey();
    build();
  };

  const tick = (x: number, text: string, major = false) =>
    h('span', { class: major ? 'tl-tick major' : 'tl-tick', style: `left:${x}%` }, h('span', null, text));

  const build = () => {
    if (!win) return;
    fill(lanes);
    fill(ticks);
    fill(moments);
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
    strip.style.height = `${34 + bodies.length * 11 + 18}px`;
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
    fill(moments, nightMoments(n, w.start, w.end).map((m) => momentChip(m.label, timeOf(m.t), m.t, m.body)));
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
      fill(moments, events.map((e) => momentChip(e.title, formatDate(e.t, s, { noYear: true }), e.t, e.bodies[0] ?? 'sun')));
      if (pending > 0) moments.append(h('span', { class: 'tl-empty' }, 'Finding more…'));
      else if (!events.length) moments.append(h('span', { class: 'tl-empty' }, zoom === 'month' ? 'No major events this month.' : 'No major events this year.'));
    };
    for (const k of months) {
      app.events.month(k).then(show).catch(() => {
        if (win === forWindow) fill(moments, h('span', { class: 'tl-empty' }, 'Events could not be worked out.'));
      });
    }
    moments.append(h('span', { class: 'tl-empty' }, 'Finding events…'));
  };

  const momentChip = (label: string, at: string, t: number, body: string) =>
    h('button', { class: 'tl-moment', type: 'button', role: 'listitem', dataset: { body }, onclick: () => jump(t) },
      h('span', { class: 'tl-dot-small' }), label, h('b', null, at));

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
    zoomButtons.forEach((b, i) => b.setAttribute('aria-pressed', String(ZOOMS[i][0] === zoom)));
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
    fill(playButton, icon(running ? 'pause' : 'play'));
    playButton.setAttribute('aria-label', running ? 'Pause' : zoom === 'night' ? 'Play the night' : zoom === 'month' ? 'Play night by night' : 'Play the year');
    playButton.title = playButton.getAttribute('aria-label')!;
    speedButton.textContent = !app.clock.paused && app.clock.rate !== 1 ? describeRate(app.clock.rate) : 'Speed';
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

  // ------------------------------------------------------------ speeds (for anyone who wants a rate)
  const renderSpeeds = () => {
    const c = app.clock, sign = c.rate < 0 ? -1 : 1;
    fill(speeds,
      h('button', { class: 'chip-button', type: 'button', 'aria-pressed': String(sign < 0), onclick: () => { stopStepping(); app.setRate(-Math.abs(c.rate), false); renderSpeeds(); } }, icon('back', 14), 'Backward'),
      RATE_STEPS.map((r) => h('button', {
        class: 'chip-button', type: 'button', 'aria-pressed': String(!c.paused && Math.abs(c.rate) === r),
        onclick: () => { stopStepping(); app.setRate(r * sign, false); renderSpeeds(); },
      }, describeRate(r))));
  };
  const toggleSpeeds = () => {
    speeds.hidden = !speeds.hidden;
    speedButton.setAttribute('aria-expanded', String(!speeds.hidden));
    if (!speeds.hidden) renderSpeeds();
  };

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
      speeds.hidden = true;
      speedButton.setAttribute('aria-expanded', 'false');
      opener.setAttribute('aria-expanded', 'false');
      stopStepping();
      opts.onToggle(false);
    },
  };
  opener.addEventListener('click', () => (isOpen ? bar.close() : bar.show()));

  // ------------------------------------------------------------ keeping it current
  const updateChip = () => {
    const c = app.clock, jd = c.jdUT, s = site();
    place.textContent = s.name;
    // This year needs no year; any other does, and then the weekday makes way for it.
    const thisYear = localTime(jd, s).year === localTime(jdNow(), s).year;
    when.textContent = `${formatDate(jd, s, { weekday: thisYear, noYear: thisYear })} · ${timeOf(jd)}`;
    const pace = stepTimer ? (zoom === 'month' ? 'Night by night' : 'Through the year') : c.paused ? 'Paused' : c.rate === 1 ? '' : describeRate(c.rate);
    const parts = [pace, app.clock.accuracy.label, calendarNote(jd, s)].filter(Boolean);
    note.textContent = parts.join(' · ');
    note.hidden = parts.length === 0;
    note.classList.toggle('only-pace', !!pace && parts.length === 1);
    const running = !c.paused || stepTimer !== 0;
    fill(playPause, icon(running ? 'pause' : 'play'));
    const label = running ? 'Pause time' : 'Run time';
    playPause.setAttribute('aria-label', label);
    playPause.title = label;
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
    if (!speeds.hidden) renderSpeeds();
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

  return { chip: h('div', { class: 'chip glass' }, opener, playPause), bar };
}
