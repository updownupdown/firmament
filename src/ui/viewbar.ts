// View toggles in the bottom bar: one row of chips, grouped by tabs, with the
// sky in view above so each switch shows what it changes. Looks come first
// for newcomers; More opens the full View sheet (culture, light pollution,
// night vision, sharing).

import type { App } from '../app.ts';
import { LOOKS, currentLook, lookLayers } from '../sim/looks.ts';
import type { LayerFlags } from '../sim/scene.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { LAYER_GROUPS, type LayerTile } from './panels.ts';

export interface ViewBar {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

type Tab = { id: string; label: string; items: LayerTile[] | 'looks' };

const LOOK_ICONS: Record<string, string> = { eye: 'eye', stargazer: 'figures', planets: 'planet', chart: 'bounds', navigator: 'compass' };

const group = (title: string) => LAYER_GROUPS.find((g) => g.title === title)?.items ?? [];

/** Tabs for the sky from the ground, and for Space view. */
function tabsFor(mode: string): Tab[] {
  if (mode === 'space') {
    const milky = group('On the sky').filter(([k]) => k === 'milkyWay' || k === 'planetLabels');
    return [{ id: 'space', label: 'Space', items: [...group('Space view'), ...milky] }];
  }
  return [
    { id: 'looks', label: 'Looks', items: 'looks' },
    { id: 'sky', label: 'Sky', items: group('On the sky') },
    { id: 'guides', label: 'Guides', items: group('Guides') },
    { id: 'ground', label: 'Ground', items: group('Air and ground') },
  ];
}

export function viewBar(app: App, opts: { openSettings: () => void; onToggle: (open: boolean) => void }): ViewBar {
  const tabRow = h('div', { class: 'vb-tabs', role: 'tablist', 'aria-label': 'Groups' });
  const row = h('div', { class: 'vb-row', role: 'group' });
  const el = h('section', { class: 'view-bar glass chrome', hidden: true, 'aria-label': 'View' },
    h('div', { class: 'vb-head' }, tabRow, iconButton('close', 'Close', () => bar.close(), 'vb-close')),
    row);

  let isOpen = false;
  let tab = 'looks';
  let tabs: Tab[] = [];

  const chip = (glyph: string, label: string, pressed: boolean, onclick: () => void, title?: string) =>
    h('button', { class: 'vb-chip', type: 'button', 'aria-pressed': String(pressed), title, onclick }, icon(glyph, 18), h('span', null, label));

  const render = () => {
    tabs = tabsFor(app.mode);
    if (!tabs.some((t) => t.id === tab)) tab = tabs[0].id;
    fill(tabRow, tabs.length > 1 ? tabs.map((t) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(t.id === tab),
      onclick: () => { tab = t.id; render(); row.scrollLeft = 0; },
    }, t.label)) : h('span', { class: 'vb-tab-title' }, tabs[0].label));
    const current = tabs.find((t) => t.id === tab)!;
    const layers = app.layers;
    const chips = current.items === 'looks'
      ? (() => {
        const now = currentLook(layers);
        return LOOKS.map((l) => chip(LOOK_ICONS[l.id] ?? 'sky', l.name, now?.id === l.id, () => {
          for (const [k, on] of Object.entries(lookLayers(l)) as [keyof LayerFlags, boolean][]) {
            if (app.layers[k] !== on) app.setLayer(k, on);
          }
        }, l.hint));
      })()
      : current.items.map(([k, label, glyph, hint]) => chip(glyph, label, layers[k], () => app.setLayer(k, !app.layers[k]), hint));
    const focused = (document.activeElement as HTMLElement | null)?.closest?.('.vb-chip')?.textContent;
    const scroll = row.scrollLeft;
    fill(row, chips, h('button', { class: 'vb-chip vb-more', type: 'button', onclick: () => opts.openSettings() }, icon('sliders', 18), h('span', null, 'More')));
    row.scrollLeft = scroll;
    // Rebuilding must not lose the keyboard's place.
    if (focused) ([...row.children] as HTMLElement[]).find((c) => c.textContent === focused)?.focus();
  };

  const bar: ViewBar = {
    el,
    get open() { return isOpen; },
    show() {
      if (isOpen) return;
      isOpen = true;
      el.hidden = false;
      opts.onToggle(true);
      render();
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      el.hidden = true;
      opts.onToggle(false);
    },
  };
  app.on('settings', () => { if (isOpen) render(); });
  app.on('mode', () => { if (isOpen) render(); });
  return bar;
}
