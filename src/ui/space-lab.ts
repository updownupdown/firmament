// A card over Space view for the sandboxes (trip planner, slingshot, what if).
// It frames the orbits in the sky the card leaves clear (on a phone the card
// covers the lower part, so the view's centre is shifted up into the gap),
// quiets the belts and comets while open, and closes when the view goes back
// to the sky. Only one is open at a time.

import { h, iconButton } from './dom.ts';
import type { Shell } from './shell.ts';

export interface SpaceLab {
  readonly el: HTMLElement;
  readonly isOpen: boolean;
  /** Show the card and switch to Space view, framed to `reach` AU from the Sun. */
  open(reach: number): void;
  close(): void;
  /** Reframe, for a new reach. */
  frame(reach?: number, glide?: boolean): void;
}

let current: SpaceLab | null = null;

export function spaceLab(shell: Shell, opts: { title: string; badge?: string; children: HTMLElement[]; onClose: () => void }): SpaceLab {
  const app = shell.app;
  let open = false;
  let reach = 2;
  /** The small-bodies layer as it was, put back on close. */
  let smallBodies: boolean | null = null;

  const el = h('section', { class: 'trip-card glass chrome', hidden: true, 'aria-label': opts.title },
    h('header', { class: 'card-header' },
      h('div', { class: 'trip-heading' },
        h('h2', { class: 'trip-title' }, opts.title),
        opts.badge ? h('span', { class: 'whatif-badge' }, opts.badge) : null),
      iconButton('close', `Close the ${opts.title.toLowerCase()}`, () => lab.close())),
    ...opts.children);
  shell.root.append(el);

  const frame = (r = reach, glide = true) => {
    reach = r;
    if (!open) return;
    const cam = app.space.camera;
    const vh = innerHeight;
    let free = vh * 0.85;
    cam.shiftY = 0;
    if (matchMedia('(max-width: 899px)').matches) {
      const top = 76, bottom = el.getBoundingClientRect().top;
      free = Math.max(120, bottom - top);
      cam.shiftY = vh / 2 - (top + bottom) / 2;
    }
    cam.yaw = -Math.PI / 2;
    cam.pitch = 78 * Math.PI / 180;
    cam.flyTo((reach / (Math.tan(cam.fovY / 2) * (free / vh))) * 1.08, glide ? 0.8 : 0);
    app.invalidate();
  };
  new ResizeObserver(() => frame(reach, false)).observe(el);
  app.on('mode', () => { if (open && app.mode !== 'space') lab.close(); });

  const lab: SpaceLab = {
    el,
    get isOpen() { return open; },
    open(r) {
      if (current && current !== lab) current.close();
      current = lab;
      shell.closeSheet();
      app.select(null);
      if (!open) shell.back.push('lab', () => lab.close());
      open = true;
      el.hidden = false;
      document.documentElement.dataset.trip = '';
      if (opts.badge) document.documentElement.dataset.whatif = ''; else delete document.documentElement.dataset.whatif;
      smallBodies ??= app.layers.smallBodies;
      app.apply({ rate: 0, camera: { mode: 'space', look: 'sun', dist: 4, orbit: { yaw: -90, pitch: 78 } }, layers: { orbits: true, planetLabels: true, compressed: false, smallBodies: false } });
      reach = r;
      requestAnimationFrame(() => frame(reach, false));
    },
    close() {
      if (!open) return;
      open = false;
      shell.back.dropLast('lab');
      if (current === lab) current = null;
      el.hidden = true;
      app.space.camera.shiftY = 0;
      app.space.overlay = null;
      app.invalidate();
      if (smallBodies !== null) app.apply({ layers: { smallBodies } });
      smallBodies = null;
      delete document.documentElement.dataset.trip;
      delete document.documentElement.dataset.whatif;
      opts.onClose();
    },
    frame,
  };
  return lab;
}
