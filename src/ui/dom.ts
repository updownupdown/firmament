// Tiny DOM helpers: the UI is plain elements, no framework.

export type Child = Node | string | number | null | undefined | false;
type Props = Record<string, unknown>;

/** Create an element. Props: `class`, `text`, `on<event>` handlers, `dataset`, anything else as an attribute. */
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = String(value);
    else if (key === 'text') el.textContent = String(value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2).toLowerCase(), value as EventListener);
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key in el && typeof value !== 'string') (el as unknown as Props)[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  append(el, children);
  return el;
}

export function append(el: Element, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
}

/** Replace an element's children. */
export function fill(el: Element, ...children: (Child | Child[])[]): void {
  el.replaceChildren();
  append(el, children);
}

const ICONS: Record<string, string> = {
  sun: '<circle cx="10" cy="10" r="3.6"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/>',
  comet: '<circle cx="14" cy="6" r="2.4"/><path d="M12.2 7.8L3.5 16.5M12.6 4.6L6 6.5M15.4 8.4L13.5 15"/>',
  cluster: '<circle cx="10" cy="7" r="1.3"/><circle cx="6.5" cy="11" r="1.3"/><circle cx="13.5" cy="11.5" r="1.3"/><circle cx="9.5" cy="14.5" r="1.3"/><circle cx="14" cy="5" r="0.9"/><circle cx="5" cy="6" r="0.9"/>',
  nebula: '<path d="M4 12c-1.5-3 1-6.5 4-5.5 1-2.5 5-2.5 6 0 3 .5 3.5 4.5 1 6 0 2.5-3.5 3.5-5.5 2-2 1.5-5 .5-5.5-2.5z"/>',
  meteor: '<path d="M16.5 3.5L7 13M13 3.5L5.5 11M16.5 7L9 14.5"/><circle cx="5" cy="15" r="1.8"/>',
  search: '<circle cx="9" cy="9" r="5.5"/><path d="M13 13l4 4"/>',
  sliders: '<path d="M3 6h8M15 6h2M3 14h2M9 14h8"/><circle cx="13" cy="6" r="2"/><circle cx="7" cy="14" r="2"/>',
  play: '<path d="M6 4l10 6-10 6z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="5" y="4" width="3.5" height="12" rx="1" fill="currentColor" stroke="none"/><rect x="11.5" y="4" width="3.5" height="12" rx="1" fill="currentColor" stroke="none"/>',
  close: '<path d="M5 5l10 10M15 5L5 15"/>',
  locate: '<circle cx="10" cy="10" r="5"/><path d="M10 2v3M10 15v3M2 10h3M15 10h3"/>',
  share: '<path d="M10 13V3M6.5 6.5L10 3l3.5 3.5M4 11v5h12v-5"/>',
  check: '<path d="M4 10.5l4 4 8-9"/>',
  target: '<circle cx="10" cy="10" r="6.5"/><circle cx="10" cy="10" r="1.5" fill="currentColor"/>',
  back: '<path d="M12 5l-5 5 5 5"/>',
  forward: '<path d="M8 5l5 5-5 5"/>',
  slower: '<path d="M10 5l-6 5 6 5zM17 5l-6 5 6 5z" fill="currentColor" stroke="none"/>',
  faster: '<path d="M10 5l6 5-6 5zM3 5l6 5-6 5z" fill="currentColor" stroke="none"/>',
  eye: '<path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10z"/><circle cx="10" cy="10" r="2.2"/>',
  info: '<circle cx="10" cy="10" r="7"/><path d="M10 9v5M10 6.2v.3"/>',
  trash: '<path d="M4 6h12M8 6V4h4v2M6 6l.7 10h6.6L14 6"/>',
  moon: '<path d="M16 12.2A6.5 6.5 0 0 1 7.8 4a6.5 6.5 0 1 0 8.2 8.2z"/>',
  book: '<path d="M3 4.5c2.6-.9 4.8-.5 7 .9 2.2-1.4 4.4-1.8 7-.9V16c-2.6-.9-4.8-.5-7 .9-2.2-1.4-4.4-1.8-7-.9z"/><path d="M10 5.4V17"/>',
  sky: '<path d="M2.5 16c2.4-1.5 4.9-2.3 7.5-2.3s5.1.8 7.5 2.3"/><path d="M10 3l1 2.4 2.4 1-2.4 1L10 9.8l-1-2.4-2.4-1 2.4-1z"/>',
  orbit: '<circle cx="10" cy="10" r="2.6"/><ellipse cx="10" cy="10" rx="8" ry="3.4" transform="rotate(-24 10 10)"/>',
  horizon: '<path d="M2 14h16"/><path d="M5.5 14a4.5 4.5 0 0 1 9 0"/><path d="M10 5v1.5M4.3 7.8l1 1M15.7 7.8l-1 1"/>',
  download: '<path d="M10 3v10M6.5 9.5L10 13l3.5-3.5M4 16h12"/>',
  up: '<path d="M5 12.5l5-5 5 5"/>',
  calendar: '<rect x="3" y="4.5" width="14" height="12.5" rx="2.5"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4"/>',
  phone: '<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M9 15h2"/>',
  figures: '<path d="M3 15l4-6 5 3 5-7" /><circle cx="3" cy="15" r="1.3" fill="currentColor"/><circle cx="7" cy="9" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="17" cy="5" r="1.3" fill="currentColor"/>',
  names: '<path d="M3 15l4-10 4 10M4.5 11.5h5M13 9.5c1-1 4-1 4 1.5V15m0-2.5c-3 0-4.5.5-4.5 1.6 0 1.6 3 1.6 4.5-.3"/>',
  star: '<path d="M10 2.8l2.1 4.6 5 .5-3.8 3.4 1.1 4.9L10 13.7l-4.4 2.5 1.1-4.9L2.9 7.9l5-.5z"/>',
  starname: '<path d="M7 3.5l1.2 2.7 2.8.3-2.1 1.9.6 2.8L7 9.8 4.5 11.2l.6-2.8L3 6.5l2.8-.3z" fill="currentColor" stroke="none"/><path d="M11 14h6M3 17h14"/>',
  planet: '<circle cx="10" cy="10" r="4.5"/><path d="M3.5 13.5c-1.5 1.6.5 2.4 4 1.6 3.4-.8 7.6-3.1 9-5 1.2-1.6.4-2.4-1.4-2.2"/>',
  galaxy: '<ellipse cx="10" cy="10" rx="7.5" ry="3.2" transform="rotate(-25 10 10)"/><circle cx="10" cy="10" r="1.6" fill="currentColor" stroke="none"/>',
  milkyway: '<path d="M2 14c3-1 5-4 8-5s5-2 8-5"/><path d="M2 17c4-1 6-3 9-4s5-2 7-4" opacity=".55"/><circle cx="6" cy="6" r=".8" fill="currentColor"/><circle cx="14" cy="15" r=".8" fill="currentColor"/>',
  skyorbit: '<ellipse cx="10" cy="10" rx="7.5" ry="4.5" stroke-dasharray="2.2 2.2"/><circle cx="10" cy="10" r="1.8" fill="currentColor" stroke="none"/><circle cx="17.3" cy="9" r="1.4" fill="currentColor" stroke="none"/>',
  bounds: '<path d="M3 4h6v5h8v7H6v-6H3z" stroke-dasharray="2 2"/>',
  dome: '<path d="M2 16h16M3.5 16a6.5 6.5 0 0 1 13 0M7 16a3 3 0 0 1 6 0M10 9.5V16"/>',
  globe: '<circle cx="10" cy="10" r="7"/><ellipse cx="10" cy="10" rx="3" ry="7"/><path d="M3 10h14"/>',
  ecliptic: '<circle cx="10" cy="10" r="2.6"/><path d="M2 14l16-8"/><path d="M10 4v1M10 15v1M4 10h1M15 10h1"/>',
  galactic: '<path d="M10 10c0-2 2-3.5 4-2.5s2 4.5-1 6-7.5 0-8-4 3-7 7-7"/>',
  compass: '<circle cx="10" cy="10" r="7"/><path d="M10 5l2 5-2 5-2-5z" fill="currentColor" stroke="none"/>',
  ground: '<path d="M2 16l5-7 3.5 4 2.5-3 5 6z"/>',
  air: '<path d="M2 15h16"/><path d="M5.5 15a4.5 4.5 0 0 1 9 0"/><path d="M3 11.5c2-1 3 1 5 0M12 6.5c2-1 3 1 5 0"/>',
  squeeze: '<path d="M2.5 10h5M12.5 10h5M5.5 7l2.5 3-2.5 3M14.5 7L12 10l2.5 3"/>',
  reset: '<path d="M4.5 9.5a5.5 5.5 0 1 0 1.7-4"/><path d="M5.5 2.5v3.5H9"/>',
  belt: '<circle cx="10" cy="10" r="1.8"/><ellipse cx="10" cy="10" rx="7.5" ry="3.2" stroke-dasharray="1.2 2"/>',
  ruler: '<path d="M3 14.5L14.5 3l2.5 2.5L5.5 17z"/><path d="M6.5 11.5l1.5 1.5M9 9l1.5 1.5M11.5 6.5L13 8"/>',
};

export function icon(name: string, size = 20): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 20 20');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ICONS[name] ?? '';
  return svg;
}

/** A round icon-only button with an accessible name. */
export function iconButton(name: string, label: string, onClick: () => void, extraClass = ''): HTMLButtonElement {
  return h('button', { class: `icon-button ${extraClass}`.trim(), type: 'button', 'aria-label': label, title: label, onclick: onClick }, icon(name));
}

/** Lumen, the optional guide: a soft point of light. Decorative; the name beside it says who is speaking. */
export function lumenGlyph(): HTMLSpanElement {
  return h('span', { class: 'lumen-glyph', 'aria-hidden': 'true' });
}

/** A labelled on/off switch. */
export function toggle(label: string, checked: boolean, onChange: (on: boolean) => void, hint?: string): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'toggle' },
    h('span', { class: 'toggle-text' }, h('span', null, label), hint ? h('span', { class: 'hint' }, hint) : null),
    input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }));
}

/**
 * Lets a notice be flicked away sideways (or up, for one at the top of the
 * screen). Taps on its buttons still work: a drag only starts after the
 * finger has moved a few pixels. Uses the `translate` property so it composes
 * with whatever `transform` places the element.
 */
export function swipeToDismiss(el: HTMLElement, dismiss: () => void): void {
  let id = -1, x0 = 0, y0 = 0, t0 = 0, dx = 0, dy = 0, dragging = false;
  const reset = () => {
    el.style.transition = '';
    el.style.translate = '';
    el.style.opacity = '';
  };
  el.style.touchAction = 'pan-y';
  el.addEventListener('pointerdown', (e) => {
    if (id !== -1) return;
    id = e.pointerId; x0 = e.clientX; y0 = e.clientY; t0 = e.timeStamp; dx = dy = 0; dragging = false;
  });
  el.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    dx = e.clientX - x0;
    dy = Math.min(0, e.clientY - y0);
    if (!dragging && Math.hypot(dx, dy) > 8) {
      dragging = true;
      el.setPointerCapture(id);
      el.style.transition = 'none';
    }
    if (!dragging) return;
    const along = Math.abs(dx) > Math.abs(dy) ? dx : 0, up = along ? 0 : dy;
    el.style.translate = `${along}px ${up}px`;
    el.style.opacity = String(Math.max(0.2, 1 - Math.hypot(along, up) / 220));
  });
  const end = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = -1;
    if (!dragging) return;
    const dist = Math.max(Math.abs(dx), -dy), speed = dist / Math.max(1, e.timeStamp - t0);
    if (dist > 90 || (dist > 30 && speed > 0.5)) {
      el.style.transition = 'opacity var(--duration) var(--ease)';
      el.style.opacity = '0';
      setTimeout(() => { dismiss(); reset(); }, 120);
    } else {
      el.style.transition = 'translate var(--duration) var(--ease), opacity var(--duration) var(--ease)';
      el.style.translate = '';
      el.style.opacity = '';
    }
    // A drag is not a tap on whatever button it began on.
    const eat = (c: Event) => { c.stopPropagation(); c.preventDefault(); };
    el.addEventListener('click', eat, { capture: true, once: true });
    setTimeout(() => el.removeEventListener('click', eat, { capture: true }), 400);
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);
}
