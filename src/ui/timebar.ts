// Time lives in the top chip: place, date and time with play/pause beside
// them. Tapping the chip opens the time panel below it: direction, speed, a
// "go to" date and time, shortcuts, Now, and the way to change place.

import type { App } from '../app.ts';
import { RATE_STEPS, describeRate } from '../sim/clock.ts';
import { jdNow } from '../astro/time.ts';
import { calendarNote, formatDate, formatTime, formatYear, jdFromLocal, localTime } from '../sim/format.ts';
import { h, fill, icon, iconButton } from './dom.ts';

const SPEED_NAMES: Record<number, string> = {
  1: 'Real time',
  60: '1 minute a second',
  600: '10 minutes a second',
  3600: '1 hour a second',
  86400: '1 day a second',
  [7 * 86400]: '1 week a second',
  [30 * 86400]: '1 month a second',
  [365.25 * 86400]: '1 year a second',
  [100 * 365.25 * 86400]: '1 century a second',
};

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** A panel that opens from its button and closes on Escape or a tap elsewhere. */
function popover(button: HTMLButtonElement, panel: HTMLElement, onOpen?: () => void) {
  panel.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  button.setAttribute('aria-haspopup', 'true');
  const close = (focusButton = false) => {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('pointerdown', outside, true);
    document.removeEventListener('keydown', key, true);
    if (focusButton) button.focus();
  };
  const outside = (e: Event) => {
    const t = e.target as Node;
    if (!panel.contains(t) && !button.contains(t)) close();
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(true); }
  };
  const open = () => {
    onOpen?.();
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('pointerdown', outside, true);
    document.addEventListener('keydown', key, true);
    (panel.querySelector('.menu-item[aria-pressed="true"], input, button') as HTMLElement | null)?.focus();
  };
  button.addEventListener('click', () => (panel.hidden ? open() : close()));
  return { close, open };
}

/** The chip, and its panel, which must sit outside the chip: glass blur would trap a fixed panel inside it. */
export function timeChip(app: App, openPlace: () => void): { chip: HTMLElement; panel: HTMLElement } {
  // ------------------------------------------------------------ the chip
  const place = h('span', { class: 'chip-place' });
  const when = h('span', { class: 'chip-when' });
  const note = h('span', { class: 'chip-note' });
  const opener = h('button', { class: 'chip-open', type: 'button', 'aria-label': 'Time and place' },
    h('span', { class: 'chip-main' }, place, when), note);
  const playPause = iconButton('pause', 'Pause time', () => app.setRate(app.clock.rate, !app.clock.paused), 'chip-play');

  // ------------------------------------------------------------ the panel
  const now = h('button', { class: 'pill-button primary now-button', type: 'button', onclick: () => { app.goToNow(); panel.close(true); } }, 'Now');
  const direction = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Direction' });
  const speeds = h('div', { class: 'speed-grid', role: 'group', 'aria-label': 'Speed of time' });
  const setDirection = (sign: number) => app.setRate(Math.abs(app.clock.rate) * sign, false);
  const renderSpeed = () => {
    const c = app.clock, sign = c.rate < 0 ? -1 : 1;
    fill(direction,
      h('button', { type: 'button', 'aria-pressed': String(sign < 0), onclick: () => { setDirection(-1); renderSpeed(); } }, icon('back', 16), 'Backward'),
      h('button', { type: 'button', 'aria-pressed': String(sign > 0), onclick: () => { setDirection(1); renderSpeed(); } }, 'Forward', icon('forward', 16)));
    fill(speeds, RATE_STEPS.map((r) => h('button', {
      class: 'chip-button', type: 'button', 'aria-pressed': String(!c.paused && Math.abs(c.rate) === r),
      title: SPEED_NAMES[r] ?? describeRate(r),
      onclick: () => { app.setRate(r * sign, false); renderSpeed(); },
    }, describeRate(r))));
  };

  const dateInput = h('input', { class: 'field', type: 'date', 'aria-label': 'Date' });
  const timeInput = h('input', { class: 'field', type: 'time', 'aria-label': 'Time' });
  const goTo = (jd: number) => { app.setTime(jd); panel.close(true); };
  const go = () => {
    const [y, m, d] = dateInput.value.split('-').map(Number);
    const [hh, mm] = (timeInput.value || '00:00').split(':').map(Number);
    if (!y || !m || !d) { dateInput.focus(); return; }
    goTo(jdFromLocal(app.site, y, m, d, hh || 0, mm || 0));
  };
  const shift = (days: number) => () => goTo(app.clock.jdUT + days);
  const tonight = () => {
    const lt = localTime(app.clock.jdUT, app.site);
    goTo(jdFromLocal(app.site, lt.year, lt.month, lt.day, 21, 0));
  };
  const sheet = h('section', { class: 'time-panel glass', role: 'dialog', 'aria-label': 'Time and place' },
    h('div', { class: 'time-panel-head' }, h('h2', { class: 'time-panel-title' }, 'Time'), now),
    direction,
    speeds,
    h('form', { class: 'time-go', onsubmit: (e: Event) => { e.preventDefault(); go(); } },
      h('div', { class: 'jump-fields' }, dateInput, timeInput),
      h('button', { class: 'pill-button', type: 'submit' }, 'Go')),
    h('div', { class: 'chips' },
      h('button', { class: 'chip-button', type: 'button', onclick: tonight }, 'Tonight, 9 pm'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(-1 / 24) }, '− 1 hour'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(1 / 24) }, '+ 1 hour'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(-1) }, '− 1 day'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(1) }, '+ 1 day'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(365.25) }, '+ 1 year')),
    h('button', { class: 'link-button', type: 'button', onclick: () => { panel.close(); openPlace(); } }, 'Change place, or go to any year from 100,000 BC'));
  const panel = popover(opener, sheet, () => {
    renderSpeed();
    const lt = localTime(app.clock.jdUT, app.site);
    // Date inputs only take years 1 to 9999; outside that, leave the field empty.
    dateInput.value = lt.year >= 1 && lt.year <= 9999 ? `${pad(lt.year, 4)}-${pad(lt.month)}-${pad(lt.day)}` : '';
    dateInput.placeholder = formatYear(lt.year);
    timeInput.value = `${pad(lt.hour)}:${pad(lt.minute)}`;
  });

  // ------------------------------------------------------------ keeping it current
  const update = () => {
    const c = app.clock, jd = c.jdUT, site = app.site;
    place.textContent = site.name;
    // This year needs no year; any other does, and then the weekday makes way for it.
    const thisYear = localTime(jd, site).year === localTime(jdNow(), site).year;
    when.textContent = `${formatDate(jd, site, { weekday: thisYear, noYear: thisYear })} · ${formatTime(jd, site, { hour12: app.store.data.settings.hour12 })}`;
    const pace = c.paused ? 'Paused' : c.rate === 1 ? '' : describeRate(c.rate);
    const parts = [pace, app.clock.accuracy.label, calendarNote(jd, site)].filter(Boolean);
    note.textContent = parts.join(' · ');
    note.hidden = parts.length === 0;
    note.classList.toggle('only-pace', !!pace && parts.length === 1);
    fill(playPause, icon(c.paused ? 'play' : 'pause'));
    const label = c.paused ? 'Run time' : 'Pause time';
    playPause.setAttribute('aria-label', label);
    playPause.title = label;
    now.hidden = c.live;
  };
  for (const e of ['second', 'time', 'site', 'settings'] as const) app.on(e, update);
  let lastText = 0;
  app.on('frame', () => {
    // While time is racing, keep the readout current without rebuilding it every frame.
    const t = performance.now();
    if (t - lastText > 120) { lastText = t; update(); }
  });
  update();

  return { chip: h('div', { class: 'chip glass' }, opener, playPause), panel: sheet };
}
