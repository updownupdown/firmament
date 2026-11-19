// The View panel, opened from View in the toolbar: it sits just above the
// toolbar with the sky in view above, so each switch shows what it changes.
// Tabs group the switches (Looks first, for newcomers); switches are tiles in
// rows of four, and the tabs that need more than on/off carry their control
// below (light pollution under Ground, the sky culture in its own tab).
// Settings holds everything that is not about what the sky shows.

import { picker } from './menu.ts';
import type { App } from '../app.ts';
import { LOOKS, currentLook, lookLayers } from '../sim/looks.ts';
import type { LayerFlags } from '../sim/scene.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { BORTLE, LAYER_GROUPS, type LayerTile } from './panels.ts';
import { LINE_STYLES, lineStyle } from '../render/linestyle.ts';

const css = (c: [number, number, number]) => `rgb(${c.map((x) => Math.round(x * 255)).join(' ')})`;

export interface ViewBar {
  el: HTMLElement;
  readonly open: boolean;
  show(): void;
  close(): void;
}

type Tab = { id: string; label: string; items: LayerTile[] | 'looks' | 'culture'; extra?: 'bortle' | 'lines' };

const LOOK_ICONS: Record<string, string> = { eye: 'eye', stargazer: 'figures', planets: 'planet', chart: 'bounds', navigator: 'compass' };

const group = (title: string) => LAYER_GROUPS.find((g) => g.title === title)?.items ?? [];

/** Tabs for the sky from the ground, and for Space view. */
function tabsFor(mode: string): Tab[] {
  if (mode === 'space') {
    const milky = group('On the sky').filter(([k]) => k === 'milkyWay' || k === 'planetLabels');
    return [{ id: 'space', label: 'Space view', items: [...group('Space view'), ...milky], extra: 'lines' }];
  }
  return [
    { id: 'looks', label: 'Looks', items: 'looks' },
    { id: 'sky', label: 'Sky', items: group('On the sky'), extra: 'lines' },
    { id: 'guides', label: 'Guides', items: group('Guides') },
    { id: 'ground', label: 'Ground', items: group('Air and ground'), extra: 'bortle' },
    { id: 'culture', label: 'Culture', items: 'culture' },
  ];
}

export function viewBar(app: App, opts: { onToggle: (open: boolean) => void }): ViewBar {
  const tabRow = h('div', { class: 'vb-tabs', role: 'tablist', 'aria-label': 'Groups' });
  const body = h('div', { class: 'vb-body', role: 'group' });
  const el = h('section', { class: 'view-bar glass chrome', hidden: true, 'aria-labelledby': 'view-title' },
    h('header', { class: 'panel-head' }, h('h2', { class: 'panel-title', id: 'view-title' }, 'View'), iconButton('close', 'Close', () => bar.close(), 'panel-close')),
    tabRow,
    body);

  let isOpen = false;
  let tab = 'looks';
  let tabs: Tab[] = [];

  const tile = (glyph: string, label: string, pressed: boolean, onclick: () => void, title?: string) =>
    h('button', { class: 'vb-tile', type: 'button', 'aria-pressed': String(pressed), title, onclick }, icon(glyph, 20), h('span', null, label));

  const looks = () => {
    const layers = app.layers;
    const now = currentLook(layers);
    return [
      h('div', { class: 'vb-grid' }, LOOKS.map((l) => tile(LOOK_ICONS[l.id] ?? 'sky', l.name, now?.id === l.id, () => {
        for (const [k, on] of Object.entries(lookLayers(l)) as [keyof LayerFlags, boolean][]) {
          if (app.layers[k] !== on) app.setLayer(k, on);
        }
      }, l.hint))),
      h('p', { class: 'vb-note' }, now ? now.hint : 'Your own mix. Pick a look to start again from one.'),
    ];
  };

  const bortle = () => {
    const s = app.store.data.settings;
    const text = h('span', { class: 'value' }, BORTLE[s.bortle]);
    const slider = h('input', {
      type: 'range', min: '1', max: '9', step: '1', value: String(s.bortle), class: 'slider bortle-slider', 'aria-label': 'Light pollution',
      oninput: () => { app.setBortle(Number(slider.value)); text.textContent = BORTLE[app.store.data.settings.bortle]; },
    });
    return h('div', { class: 'vb-control' },
      h('div', { class: 'control-head' }, h('span', null, 'Light pollution'), text),
      h('div', { class: 'slider-row' }, h('span', { class: 'hint' }, 'Dark'), slider, h('span', { class: 'hint' }, 'City')));
  };

  const lines = () => {
    const now = lineStyle(app.store.data.settings.lineStyle);
    return h('div', { class: 'vb-control' },
      h('div', { class: 'control-head' }, h('span', null, 'Line colours'), h('span', { class: 'value' }, now.hint)),
      h('div', { class: 'segmented line-styles', role: 'group', 'aria-label': 'Line colours' }, LINE_STYLES.map((st) => h('button', {
        type: 'button', 'aria-pressed': String(st.id === now.id), title: st.hint,
        onclick: () => app.updateSettings((x) => { x.lineStyle = st.id; }),
      }, h('span', { class: 'swatch', style: `--a: ${css(st.figure ?? [0.62, 0.71, 1])}; --b: ${css(st.orbit ?? [0.62, 0.71, 1])}` }), st.name))));
  };

  const culture = () => {
    const s = app.store.data.settings;
    const current = app.universe.culture;
    const select = picker({
      label: 'Sky culture', className: 'wide', value: s.culture,
      items: app.universe.cultureIndex.map((c) => ({ value: c.id, label: c.name, detail: c.region })),
      onPick: (v) => app.setCulture(v),
    });
    return h('div', { class: 'vb-control' },
      h('div', { class: 'control-head' }, h('span', null, 'Whose sky: the figures and names drawn')),
      select.el,
      current && current.id === s.culture && current.intro ? h('p', { class: 'vb-note clamp' }, current.intro) : null);
  };

  const render = () => {
    tabs = tabsFor(app.mode);
    if (!tabs.some((t) => t.id === tab)) tab = tabs[0].id;
    fill(tabRow, tabs.length > 1 ? tabs.map((t) => h('button', {
      type: 'button', role: 'tab', 'aria-selected': String(t.id === tab),
      onclick: () => { tab = t.id; render(); },
    }, t.label)) : h('span', { class: 'vb-tab-title' }, tabs[0].label));
    const current = tabs.find((t) => t.id === tab)!;
    const layers = app.layers;
    const focused = (document.activeElement as HTMLElement | null)?.closest?.('.vb-tile')?.textContent;
    fill(body,
      current.items === 'looks' ? looks()
        : current.items === 'culture' ? culture()
        : h('div', { class: 'vb-grid' }, current.items.map(([k, label, glyph, hint]) => tile(glyph, label, layers[k], () => app.setLayer(k, !app.layers[k]), hint))),
      current.extra === 'bortle' ? bortle() : current.extra === 'lines' ? lines() : null);
    // Rebuilding must not lose the keyboard's place.
    if (focused) ([...body.querySelectorAll('.vb-tile')] as HTMLElement[]).find((c) => c.textContent === focused)?.focus();
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
  // A slider being dragged is not rebuilt under the finger.
  app.on('settings', () => { if (isOpen && !(document.activeElement as HTMLElement | null)?.matches?.('.bortle-slider, select')) render(); });
  app.on('mode', () => { if (isOpen) render(); });
  app.on('data', () => { if (isOpen && tab === 'culture') render(); });
  return bar;
}
