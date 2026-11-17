// Noticing a new deploy: the page knows its own build (a meta tag the build
// fills in), and now and then asks the server for the latest one. When they
// differ, a quiet banner offers to reload.

import { h, iconButton, swipeToDismiss } from './dom.ts';

const CHECK_EVERY_MS = 15 * 60 * 1000;

/** The build this page was served as, or null in development. */
export function currentBuild(doc: Document = document): string | null {
  const b = doc.querySelector<HTMLMetaElement>('meta[name="firmament-build"]')?.content ?? '';
  return /^[0-9a-f]{6,}$/.test(b) ? b : null;
}

/** True when the server holds a different build from the one running. */
export function isNewBuild(running: string | null, latest: unknown): boolean {
  if (!running || !latest || typeof latest !== 'object') return false;
  const b = (latest as { build?: unknown }).build;
  return typeof b === 'string' && /^[0-9a-f]{6,}$/.test(b) && b !== running;
}

/** Starts watching; returns the banner element to place in the UI. */
export function watchForUpdates(): HTMLElement {
  const banner = h('div', { class: 'update-banner glass chrome', role: 'status', hidden: true },
    h('span', null, 'A new version of Firmament is ready.'),
    h('button', { class: 'pill-button primary', type: 'button', onclick: () => reload() }, 'Reload'),
    iconButton('close', 'Not now', () => { banner.hidden = true; dismissed = true; }));
  const running = currentBuild();
  let dismissed = false, last = 0;
  swipeToDismiss(banner, () => { banner.hidden = true; dismissed = true; });

  const reload = async () => {
    // Let the service worker pick up the new files first, so the reload is not served the old ones.
    try { await (await navigator.serviceWorker?.getRegistration())?.update(); } catch { /* reload anyway */ }
    location.reload();
  };
  const check = async () => {
    if (!running || dismissed || !navigator.onLine) return;
    last = Date.now();
    try {
      const res = await fetch(`version.json?t=${last}`, { cache: 'no-store' });
      if (res.ok && isNewBuild(running, await res.json())) banner.hidden = false;
    } catch { /* offline or blocked: try again later */ }
  };

  setTimeout(check, 20000);
  setInterval(check, CHECK_EVERY_MS);
  // Coming back to the app after a while is the likeliest time a deploy has happened.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - last > 60000) check();
  });
  return banner;
}
