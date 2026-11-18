// Our own drop-down: a trigger button and a glass list that opens beside it.
// Used everywhere a native <select> would be, so menus look the same on every
// browser. The list lives in <body> with fixed position, so a scrolling panel
// never clips it. It closes on a pick, Escape, a tap outside, or a scroll or
// resize of the page. Arrow keys move through the items.

import { h, fill, icon } from './dom.ts';

export interface MenuItem {
  value: string;
  label: string;
  /** Shown faint on the right: a time, a unit. */
  detail?: string;
}

export interface Picker {
  /** The trigger button, to place in the layout. */
  el: HTMLButtonElement;
  value: string;
  disabled: boolean;
  /** The list is showing. */
  readonly isOpen: boolean;
  setItems(items: MenuItem[], placeholder?: string | null): void;
  close(): void;
}

export interface PickerOptions {
  /** Read by screen readers on the trigger and the list. */
  label: string;
  items: MenuItem[];
  value?: string;
  /** Fixed trigger text (a menu of actions, like "Jump"); otherwise the picked item's label. */
  text?: string;
  /** The trigger text for the picked item, when it should be shorter than the item's label. */
  short?: (item: MenuItem) => string;
  /** Shown in the list when there is nothing to pick. */
  placeholder?: string;
  /** Something above the items, built each time the list opens (a direction switch). */
  header?: () => HTMLElement;
  className?: string;
  onPick: (value: string) => void;
}

let openPicker: Picker | null = null;

export function picker(opts: PickerOptions): Picker {
  let items = opts.items;
  let value = opts.value ?? items[0]?.value ?? '';
  let placeholder = opts.placeholder ?? null;
  const text = h('span', { class: 'picker-text' });
  const chevron = h('span', { class: 'picker-chevron' }, icon('down', 16));
  const el = h('button', {
    class: `picker ${opts.className ?? ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': opts.label,
  }, text, chevron);
  const list = h('div', { class: 'menu-pop', role: 'listbox', 'aria-label': opts.label, hidden: true });

  const syncText = () => {
    const item = items.find((i) => i.value === value);
    text.textContent = opts.text ?? (item ? (opts.short ? opts.short(item) : item.label) : '');
    el.title = opts.text ? opts.label : `${opts.label}: ${item?.label ?? ''}`;
  };

  const buttons = () => [...list.querySelectorAll<HTMLButtonElement>('button')];

  const render = () => {
    fill(list,
      opts.header ? h('div', { class: 'menu-head' }, opts.header()) : null,
      items.length
        ? items.map((item) => h('button', {
          class: 'menu-item', type: 'button', role: 'option', 'aria-selected': String(!opts.text && item.value === value),
          onclick: () => { api.close(); el.focus({ preventScroll: true }); if (item.value !== value || opts.text) { if (!opts.text) value = item.value; syncText(); opts.onPick(item.value); } },
        }, h('span', { class: 'menu-label' }, item.label),
          item.detail ? h('span', { class: 'menu-detail' }, item.detail) : null,
          !opts.text && item.value === value ? icon('check', 16) : null))
        : h('p', { class: 'menu-empty' }, placeholder ?? 'Nothing to show'));
  };

  const place = () => {
    const r = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight, gap = 6, edge = 8;
    list.style.minWidth = `${Math.max(r.width, 200)}px`;
    list.style.maxHeight = '';
    list.style.left = '0px';
    list.style.top = '0px';
    const w = Math.min(list.offsetWidth, vw - 2 * edge);
    const below = vh - r.bottom - gap - edge, above = r.top - gap - edge;
    const down = below >= Math.min(list.scrollHeight, 280) || below >= above;
    list.style.maxHeight = `${Math.max(120, down ? below : above)}px`;
    const height = Math.min(list.scrollHeight, down ? below : above);
    // Line up with the trigger's left edge, or its right edge when that would run off screen.
    const left = Math.max(edge, r.left + w > vw - edge ? Math.min(r.right, vw - edge) - w : r.left);
    list.style.left = `${left}px`;
    list.style.top = `${down ? r.bottom + gap : r.top - gap - height}px`;
  };

  const outside = (e: PointerEvent) => {
    const t = e.target as Node;
    if (!list.contains(t) && !el.contains(t)) api.close();
  };
  const onScroll = (e: Event) => { if (!list.contains(e.target as Node)) api.close(); };

  list.addEventListener('keydown', (e) => {
    const all = buttons();
    const i = all.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); api.close(); el.focus({ preventScroll: true }); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); all[Math.min(all.length - 1, i + 1)]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); all[Math.max(0, i - 1)]?.focus(); }
    else if (e.key === 'Tab') api.close();
  });

  const open = () => {
    if (openPicker && openPicker !== api) openPicker.close();
    openPicker = api;
    render();
    if (!list.isConnected) document.body.append(list);
    list.hidden = false;
    el.setAttribute('aria-expanded', 'true');
    place();
    const sel = list.querySelector<HTMLButtonElement>('[aria-selected="true"]') ?? buttons().find((b) => b.classList.contains('menu-item'));
    sel?.focus({ preventScroll: true });
    sel?.scrollIntoView({ block: 'nearest' });
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('resize', api.close);
    document.addEventListener('scroll', onScroll, true);
  };

  el.addEventListener('click', () => (list.hidden ? open() : api.close()));
  el.addEventListener('keydown', (e) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.hidden) { e.preventDefault(); open(); }
  });

  const api: Picker = {
    el,
    get value() { return value; },
    set value(v: string) { if (v === value) { syncText(); return; } value = v; syncText(); if (!list.hidden) render(); },
    get disabled() { return el.disabled; },
    get isOpen() { return !list.hidden; },
    set disabled(d: boolean) { el.disabled = d; if (d) api.close(); },
    setItems(next, ph) {
      items = next;
      if (ph !== undefined) placeholder = ph;
      if (!opts.text && !items.some((i) => i.value === value) && items.length) value = items[0].value;
      syncText();
      if (!list.hidden) { render(); place(); }
    },
    close() {
      if (list.hidden) return;
      list.hidden = true;
      el.setAttribute('aria-expanded', 'false');
      if (openPicker === api) openPicker = null;
      document.removeEventListener('pointerdown', outside, true);
      window.removeEventListener('resize', api.close);
      document.removeEventListener('scroll', onScroll, true);
    },
  };
  syncText();
  return api;
}
