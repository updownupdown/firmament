// The star trails banner: how long the exposure has run, a button to save the
// picture, and one to stop. The stacking itself is in the sky renderer.

import type { App } from '../app.ts';
import { formatDate } from '../sim/format.ts';
import { h, iconButton, swipeToDismiss } from './dom.ts';

/** "45 min", "2 h 10 min", "1 day 3 h". */
export function exposureText(days: number): string {
  const min = Math.round(Math.abs(days) * 1440);
  if (min < 60) return `${min} min`;
  if (min < 1440) {
    const hr = Math.floor(min / 60), m = min % 60;
    return m ? `${hr} h ${m} min` : `${hr} h`;
  }
  const d = Math.floor(min / 1440), hr = Math.round((min % 1440) / 60);
  return `${d} day${d === 1 ? '' : 's'}${hr ? ` ${hr} h` : ''}`;
}

export function trailsBanner(app: App): HTMLElement {
  const text = h('p', { class: 'measure-text', role: 'status', 'aria-live': 'polite' });
  const save = h('button', {
    type: 'button', class: 'pill-button',
    onclick: () => {
      const day = formatDate(app.clock.jdUT, app.site).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
      app.saveImage(`star-trails-${day}.png`);
    },
  }, 'Save picture');
  const banner = h('div', { class: 'measure-banner trails-banner glass chrome', hidden: true },
    text, save, iconButton('close', 'Stop star trails', () => app.stopTrails()));
  swipeToDismiss(banner, () => app.stopTrails());

  const sync = () => {
    const t = app.trails;
    banner.hidden = !t;
    document.documentElement.dataset.trails = String(!!t);
    if (t) text.textContent = `Star trails · ${exposureText(app.clock.jdUT - t.since)} exposure`;
  };
  app.on('trails', sync);
  app.on('second', () => { if (app.trails) sync(); });
  sync();
  return banner;
}
