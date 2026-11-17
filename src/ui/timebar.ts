// The time bar: play/pause, a speed menu that opens upward, a "go to" date
// and time menu, and Now. Menus are plain popovers anchored above the bar.

import type { App } from '../app.ts';
import { RATE_STEPS, describeRate } from '../sim/clock.ts';
import { formatYear, jdFromLocal, localTime } from '../sim/format.ts';
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

/** A menu that opens above its button and closes on Escape or a tap elsewhere. */
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
  return { close };
}

export function timeBar(app: App, openPlaceTime: () => void): HTMLElement {
  // ------------------------------------------------------------ play / pause
  const playPause = iconButton('pause', 'Pause time', () => app.setRate(app.clock.rate, !app.clock.paused), 'glass');

  // ------------------------------------------------------------ speed menu
  const speedText = h('span', { class: 'speed-text' });
  const speedButton = h('button', { class: 'time-button glass', type: 'button' }, speedText, icon('up', 14));
  const speedMenu = h('div', { class: 'popover glass speed-menu', role: 'dialog', 'aria-label': 'Speed of time' });
  const direction = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Direction' });
  const speedList = h('div', { class: 'menu-list' });
  const speed = popover(speedButton, speedMenu, () => renderSpeed());
  const setDirection = (sign: number) => app.setRate(Math.abs(app.clock.rate) * sign, false);
  const renderSpeed = () => {
    const c = app.clock, sign = c.rate < 0 ? -1 : 1;
    fill(direction,
      h('button', { type: 'button', 'aria-pressed': String(sign < 0), onclick: () => { setDirection(-1); renderSpeed(); } }, icon('back', 16), 'Backward'),
      h('button', { type: 'button', 'aria-pressed': String(sign > 0), onclick: () => { setDirection(1); renderSpeed(); } }, 'Forward', icon('forward', 16)));
    fill(speedList, RATE_STEPS.map((r) => {
      const on = !c.paused && Math.abs(c.rate) === r;
      return h('button', {
        class: 'menu-item', type: 'button', 'aria-pressed': String(on),
        onclick: () => { app.setRate(r * sign, false); speed.close(true); },
      }, h('span', null, SPEED_NAMES[r] ?? describeRate(r)), on ? icon('check', 16) : null);
    }));
  };
  fill(speedMenu, direction, speedList);

  // ------------------------------------------------------------ go-to menu
  const dateInput = h('input', { class: 'field', type: 'date', 'aria-label': 'Date' });
  const timeInput = h('input', { class: 'field', type: 'time', 'aria-label': 'Time' });
  const goTo = (jd: number) => { app.setTime(jd); jump.close(true); };
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
  const jumpButton = h('button', { class: 'time-button glass icon-only', type: 'button', 'aria-label': 'Go to a date and time', title: 'Go to a date and time' }, icon('calendar'));
  const jumpMenu = h('form', { class: 'popover glass jump-menu', 'aria-label': 'Go to a date and time', onsubmit: (e: Event) => { e.preventDefault(); go(); } },
    h('div', { class: 'jump-fields' }, dateInput, timeInput),
    h('button', { class: 'pill-button primary', type: 'submit' }, 'Go'),
    h('div', { class: 'chips' },
      h('button', { class: 'chip-button', type: 'button', onclick: tonight }, 'Tonight, 9 pm'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(-1 / 24) }, '− 1 hour'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(1 / 24) }, '+ 1 hour'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(-1) }, '− 1 day'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(1) }, '+ 1 day'),
      h('button', { class: 'chip-button', type: 'button', onclick: shift(365.25) }, '+ 1 year')),
    h('button', { class: 'link-button', type: 'button', onclick: () => { jump.close(); openPlaceTime(); } }, 'Other places and years, BC to AD 100,000'));
  const jump = popover(jumpButton, jumpMenu, () => {
    const lt = localTime(app.clock.jdUT, app.site);
    // Date inputs only take years 1 to 9999; outside that, leave the field empty.
    dateInput.value = lt.year >= 1 && lt.year <= 9999 ? `${pad(lt.year, 4)}-${pad(lt.month)}-${pad(lt.day)}` : '';
    dateInput.placeholder = formatYear(lt.year);
    timeInput.value = `${pad(lt.hour)}:${pad(lt.minute)}`;
  });

  const now = h('button', { class: 'pill-button glass now-button', type: 'button', onclick: () => app.goToNow() }, 'Now');

  const update = () => {
    const c = app.clock;
    fill(playPause, icon(c.paused ? 'play' : 'pause'));
    playPause.setAttribute('aria-label', c.paused ? 'Run time' : 'Pause time');
    playPause.title = c.paused ? 'Run time' : 'Pause time';
    speedText.textContent = c.paused ? 'Paused' : describeRate(c.rate);
    speedButton.setAttribute('aria-label', `Speed: ${c.paused ? 'paused' : describeRate(c.rate)}. Change speed`);
    speedButton.classList.toggle('reverse', c.rate < 0 && !c.paused);
    now.hidden = c.live;
    if (!speedMenu.hidden) renderSpeed();
  };
  app.on('time', update);
  app.on('second', update);
  update();

  return h('div', { class: 'time-bar chrome' },
    playPause,
    h('div', { class: 'menu-anchor' }, speedButton, speedMenu),
    h('div', { class: 'menu-anchor' }, jumpButton, jumpMenu),
    now);
}
