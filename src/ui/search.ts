// Search: an overlay over the sky, opened from the search button (or `/`).
// Only here does the field take focus, so the keyboard shows when it is
// wanted and not when the Atlas opens. Picking an object turns the sky to it;
// the book on its row, or anything that is a page rather than a place in the
// sky (a concept, a category, a shower, a sky culture), opens the Atlas.

import { searchExtras } from '../atlas/catalog.ts';
import { CONCEPTS } from '../atlas/concepts.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import type { Shell } from './shell.ts';

export interface SearchOverlay {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

interface Hit { ref: string; name: string; subtitle: string }

/** A few good first searches, shown before anything is typed. */
const SUGGESTIONS = ['moon', 'jupiter', 'saturn', 'con:western:Ori', 'dso:M31', 'dso:M45', 'star:32349', 'region:kuiper'];

export function searchOverlay(shell: Shell, onToggle: (open: boolean) => void): SearchOverlay {
  const app = shell.app;
  const u = app.universe;
  const input = h('input', {
    class: 'field search-field', type: 'search', placeholder: 'Mars, Vega, Orion, M31, Perseids…', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: false, 'aria-label': 'Search', enterkeyhint: 'search',
  });
  const results = h('div', { class: 'search-results' });
  const el = h('section', { class: 'search glass chrome', hidden: true, role: 'search', 'aria-label': 'Search' },
    h('div', { class: 'search-head' },
      iconButton('back', 'Close search', () => overlay.close(), 'search-close'),
      h('label', { class: 'search-box' }, icon('search', 18), input)),
    results);
  let isOpen = false;

  /** A page in the Atlas rather than a place in the sky. */
  const isPage = (ref: string) => /^(shower|culture|category|concept):/.test(ref);

  const choose = (hit: Hit) => {
    overlay.close();
    if (hit.ref.startsWith('category:')) shell.openAtlas({ category: hit.ref.slice(9) });
    else if (hit.ref.startsWith('concept:')) shell.openAtlas({ concept: hit.ref.slice(8) });
    else if (isPage(hit.ref)) shell.openAtlas({ ref: hit.ref });
    else shell.showObject(hit.ref);
  };

  const upTag = (ref: string) => {
    if (isPage(ref)) return null;
    const o = u.resolve(ref);
    if (!o || o.constellation) return null;
    if (o.region) return h('span', { class: 'tag' }, 'Space view');
    // Up or down only means something standing on the ground.
    if (app.mode === 'space') return null;
    const up = u.horizontal(o.dir).altApparent > 0;
    return h('span', { class: `tag${up ? ' up' : ''}` }, up ? 'Up now' : 'Below horizon');
  };

  const row = (hit: Hit) => h('li', { class: 'search-row' },
    h('button', { class: 'result', type: 'button', onclick: () => choose(hit) },
      h('span', { class: 'result-main' }, h('span', { class: 'result-name' }, hit.name), h('span', { class: 'result-sub' }, hit.subtitle)),
      upTag(hit.ref)),
    isPage(hit.ref) || hit.ref.startsWith('tyc:') ? null
      : iconButton('book', `Read about ${hit.name} in the Atlas`, () => { overlay.close(); shell.openAtlas({ ref: hit.ref }); }, 'search-read'));

  const find = (q: string): Hit[] => {
    const lq = q.toLowerCase();
    const concepts = lq.length < 3 ? [] : CONCEPTS.filter((c) => c.title.toLowerCase().includes(lq) || c.summary.toLowerCase().includes(lq))
      .map((c) => ({ ref: `concept:${c.id}`, name: c.title, subtitle: `Concept · ${c.group}` }));
    const hits = u.search(q, 24).map((x) => ({ ref: x.ref, name: x.name, subtitle: x.subtitle }));
    const all = [...searchExtras(u, q), ...concepts, ...hits];
    // A thing called exactly what was typed comes first: "Mars" is the planet before the pages about it.
    const exact = (x: Hit) => (x.name.toLowerCase() === lq ? 0 : 1);
    return all.map((x, i) => ({ x, i })).sort((a, b) => exact(a.x) - exact(b.x) || a.i - b.i).map(({ x }) => x);
  };

  const render = () => {
    const q = input.value.trim();
    if (!q) {
      const picks = SUGGESTIONS.map((ref) => u.resolve(ref)).filter((o) => !!o).map((o) => ({ ref: o.ref, name: o.name, subtitle: o.subtitle }));
      fill(results,
        h('p', { class: 'search-hint' }, 'Find a planet, a star, a constellation, a galaxy, a meteor shower or an idea.'),
        h('h3', { class: 'section-title' }, 'Try'),
        h('ul', { class: 'result-list', role: 'list' }, picks.map(row)));
      return;
    }
    const all = find(q);
    fill(results, all.length
      ? h('ul', { class: 'result-list', role: 'list' }, all.map(row))
      : h('p', { class: 'search-hint' }, `Nothing found for “${q}”. Try a planet, a star, a constellation, or a number like M13.`));
  };

  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); overlay.close(); return; }
    if (e.key !== 'Enter') return;
    const first = find(input.value.trim())[0];
    if (first) choose(first);
  });
  // Scrolling the results puts the keyboard away so more of them show.
  results.addEventListener('touchstart', () => input.blur(), { passive: true });

  const overlay: SearchOverlay = {
    el,
    get open() { return isOpen; },
    show() {
      if (!isOpen) {
        isOpen = true;
        el.hidden = false;
        document.documentElement.dataset.search = '';
        onToggle(true);
      }
      render();
      input.focus({ preventScroll: true });
      input.select();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      el.hidden = true;
      input.blur();
      delete document.documentElement.dataset.search;
      onToggle(false);
    },
  };
  return overlay;
}
