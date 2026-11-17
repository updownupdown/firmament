// Boot: show a loading state, fetch the core data, then hand over to the App
// and the shell. A scene in the URL hash decides the first view.

import './app.css';
import { App } from './app.ts';
import { loadCore } from './data/load.ts';
import { decodeScene } from './sim/scene.ts';
import { Store, browserStorage } from './sim/store.ts';
import { h } from './ui/dom.ts';
import { Shell } from './ui/shell.ts';
import { watchForUpdates } from './ui/update.ts';

async function boot(): Promise<void> {
  const canvas = h('canvas', { id: 'sky', tabindex: '0', role: 'img', 'aria-label': 'The sky. Drag to look around, pinch or scroll to zoom, tap an object to learn about it.' });
  const labels = h('div', { id: 'labels', 'aria-hidden': 'true' });
  const ui = h('div', { id: 'ui' });
  const bar = h('span', { class: 'loading-bar' }, h('span'));
  const message = h('p', { class: 'loading-text', role: 'status' }, 'Gathering the stars…');
  const loading = h('div', { class: 'loading' }, h('img', { class: 'loading-logo', src: 'icon.svg', alt: '', width: '72', height: '72' }), h('h1', null, 'Firmament'), bar, message);
  document.body.append(canvas, labels, ui, loading);

  const fail = (text: string, retry: boolean) => {
    bar.hidden = true;
    message.textContent = text;
    if (retry) loading.append(h('button', { class: 'pill-button primary', type: 'button', onclick: () => location.reload() }, 'Try again'));
  };

  let core;
  try {
    core = await loadCore((f) => { (bar.firstElementChild as HTMLElement).style.width = `${Math.round(f * 100)}%`; });
  } catch (e) {
    console.error(e);
    fail('The star catalogs could not be loaded. Check your connection and try again.', true);
    return;
  }

  let app: App;
  try {
    app = new App(core, new Store(browserStorage()), canvas, labels);
  } catch (e) {
    console.error(e);
    fail('Firmament needs WebGL 2 to draw the sky, and this browser or device does not offer it.', false);
    return;
  }

  const shell = new Shell(app, ui);
  ui.append(watchForUpdates());
  const fromHash = () => {
    const scene = decodeScene(location.hash);
    if (Object.keys(scene).length) app.apply(scene);
  };
  fromHash();
  addEventListener('hashchange', fromHash);
  app.on('frame', () => {
    if (document.documentElement.dataset.ready) return;
    document.documentElement.dataset.ready = 'true';
    loading.remove();
    if (app.store.markSeen('welcome') && !location.hash) {
      shell.toast(`This is the sky over ${app.site.name} right now. Tap the place to change it.`);
    }
  });
  app.start();

  // Offline support: only where service workers are allowed (https, or localhost while testing).
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* the app works without it */ });
  }
}

boot().catch((e) => {
  console.error(e);
  document.body.textContent = 'Something went wrong while starting Firmament. Reloading the page may help.';
});
