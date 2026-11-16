// Tiny DOM helpers: the UI is plain elements, no framework.

type Child = Node | string | number | null | undefined | false;
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
  orbit: '<circle cx="10" cy="10" r="2.6"/><ellipse cx="10" cy="10" rx="8" ry="3.4" transform="rotate(-24 10 10)"/>',
  horizon: '<path d="M2 14h16"/><path d="M5.5 14a4.5 4.5 0 0 1 9 0"/><path d="M10 5v1.5M4.3 7.8l1 1M15.7 7.8l-1 1"/>',
  phone: '<rect x="6" y="2.5" width="8" height="15" rx="2"/><path d="M9 15h2"/>',
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

/** A labelled on/off switch. */
export function toggle(label: string, checked: boolean, onChange: (on: boolean) => void, hint?: string): HTMLLabelElement {
  const input = h('input', { type: 'checkbox', role: 'switch', checked, onchange: () => onChange(input.checked) });
  return h('label', { class: 'toggle' },
    h('span', { class: 'toggle-text' }, h('span', null, label), hint ? h('span', { class: 'hint' }, hint) : null),
    input, h('span', { class: 'toggle-track', 'aria-hidden': 'true' }));
}
