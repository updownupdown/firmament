// Moving the sky camera: dragging, pinching, the wheel, keys, inertia and
// eased flights to a target.

import { DEG, clamp, wrapPi } from '../astro/math.ts';
import { MAX_FOV, MIN_FOV, type SkyProjection } from './projection.ts';

export interface CameraTarget {
  az?: number;
  alt?: number;
  fov?: number;
}

interface Flight {
  from: Required<CameraTarget>;
  to: Required<CameraTarget>;
  t: number;
  duration: number;
}

export class SkyCamera {
  readonly projection: SkyProjection;
  /** When set, called every frame for the direction to keep centred (radians), or null to stop. */
  track: (() => { az: number; alt: number } | null) | null = null;
  reducedMotion = false;
  /** True while a finger or the mouse is holding the sky. */
  held = false;
  private flight: Flight | null = null;
  private velAz = 0;
  private velAlt = 0;

  constructor(projection: SkyProjection) {
    this.projection = projection;
  }

  get moving(): boolean {
    return this.flight !== null || this.track !== null || Math.abs(this.velAz) + Math.abs(this.velAlt) > 1e-5;
  }

  /** Ease to a new direction and field of view. */
  flyTo(target: CameraTarget, duration = 1.1): void {
    const p = this.projection;
    const to = { az: target.az ?? p.az, alt: target.alt ?? p.alt, fov: target.fov ?? p.fov };
    this.velAz = this.velAlt = 0;
    if (this.reducedMotion || duration <= 0) {
      p.az = to.az; p.alt = to.alt; p.fov = to.fov;
      this.flight = null;
      return;
    }
    this.flight = { from: { az: p.az, alt: p.alt, fov: p.fov }, to, t: 0, duration };
  }

  /** Drag by a number of CSS pixels: the sky follows the finger. */
  drag(dx: number, dy: number, dt: number): void {
    const p = this.projection;
    this.flight = null;
    this.track = null;
    const dAz = (-dx * p.pixelAngle) / Math.max(Math.cos(p.alt), 0.2);
    const dAlt = dy * p.pixelAngle;
    p.az += dAz;
    p.alt = clamp(p.alt + dAlt, -90 * DEG, 90 * DEG);
    if (dt > 0) {
      // Smoothed velocity for the glide after release.
      const k = 0.5;
      this.velAz = this.velAz * (1 - k) + (dAz / dt) * k;
      this.velAlt = this.velAlt * (1 - k) + (dAlt / dt) * k;
    }
  }

  release(): void {
    this.held = false;
    if (this.reducedMotion) this.velAz = this.velAlt = 0;
  }

  /** Zoom by a factor (>1 zooms in), keeping the sky under (x, y) in place when given. */
  zoom(factor: number, x?: number, y?: number): void {
    const p = this.projection;
    this.flight = null;
    const before = x !== undefined && y !== undefined ? p.unproject(x, y) : null;
    p.fov = clamp(p.fov / factor, MIN_FOV, MAX_FOV);
    p.update();
    if (before && x !== undefined && y !== undefined && !this.track) {
      // Nudge the view so the same point of sky stays under the pointer.
      const after = p.unproject(x, y);
      const azB = Math.atan2(before[1], -before[0]), azA = Math.atan2(after[1], -after[0]);
      const altB = Math.asin(clamp(before[2], -1, 1)), altA = Math.asin(clamp(after[2], -1, 1));
      if (Math.abs(altB) < 80 * DEG && Math.abs(p.alt) < 80 * DEG) p.az += wrapPi(azB - azA);
      p.alt = clamp(p.alt + (altB - altA), -90 * DEG, 90 * DEG);
      p.update();
    }
  }

  /** Advance animations. Returns true if the view changed. */
  key(key: string): boolean {
    const p = this.projection;
    const step = p.fov * 0.12;
    const moves: Record<string, CameraTarget> = {
      ArrowLeft: { az: p.az - step / Math.max(Math.cos(p.alt), 0.2) },
      ArrowRight: { az: p.az + step / Math.max(Math.cos(p.alt), 0.2) },
      ArrowUp: { alt: clamp(p.alt + step, -90 * DEG, 90 * DEG) },
      ArrowDown: { alt: clamp(p.alt - step, -90 * DEG, 90 * DEG) },
      '+': { fov: clamp(p.fov / 1.4, MIN_FOV, MAX_FOV) },
      '=': { fov: clamp(p.fov / 1.4, MIN_FOV, MAX_FOV) },
      '-': { fov: clamp(p.fov * 1.4, MIN_FOV, MAX_FOV) },
    };
    const m = moves[key];
    if (!m) return false;
    this.track = null;
    this.flyTo(m, 0.25);
    return true;
  }

  tick(dt: number): boolean {
    const p = this.projection;
    let changed = false;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      // If we are following something, fly toward where it is now.
      const live = this.track?.();
      const to = live ? { ...f.to, ...live } : f.to;
      p.az = f.from.az + wrapPi(to.az - f.from.az) * e;
      p.alt = f.from.alt + (to.alt - f.from.alt) * e;
      p.fov = Math.exp(Math.log(f.from.fov) + (Math.log(to.fov) - Math.log(f.from.fov)) * e);
      if (f.t >= 1) this.flight = null;
      changed = true;
    } else if (this.track && !this.held) {
      const t = this.track();
      if (!t) this.track = null;
      else if (Math.abs(wrapPi(t.az - p.az)) + Math.abs(t.alt - p.alt) > 1e-9) {
        p.az = t.az; p.alt = t.alt;
        changed = true;
      }
    }
    if (!this.held && !this.flight && (Math.abs(this.velAz) > 1e-5 || Math.abs(this.velAlt) > 1e-5)) {
      p.az += this.velAz * dt;
      p.alt = clamp(p.alt + this.velAlt * dt, -90 * DEG, 90 * DEG);
      const decay = Math.exp(-dt * 4.5);
      this.velAz *= decay;
      this.velAlt *= decay;
      if (Math.abs(this.velAz) + Math.abs(this.velAlt) < 2e-4) this.velAz = this.velAlt = 0;
      changed = true;
    }
    if (changed) p.update();
    return changed;
  }
}

export interface ControlEvents {
  /** A tap or click that was not a drag, in CSS pixels relative to the element. */
  onTap(x: number, y: number): void;
  /** Anything that changed the view. */
  onChange(): void;
}

/** What the input handlers need from a camera, so Sky and Space can share them. */
export interface Controllable {
  held: boolean;
  drag(dx: number, dy: number, dt: number): void;
  release(): void;
  zoom(factor: number, x?: number, y?: number): void;
  /** Handle a key; true if it did something. */
  key(key: string): boolean;
}

/** Wires pointer, wheel and keyboard input on an element to whichever camera is current. Returns a cleanup function. */
export function attachControls(el: HTMLElement, current: () => Controllable, events: ControlEvents): () => void {
  const pointers = new Map<number, { x: number; y: number }>();
  let moved = 0, downAt = 0, lastT = 0, pinch = 0;
  const local = (e: PointerEvent | WheelEvent) => {
    const r = el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  const down = (e: PointerEvent) => {
    el.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, local(e));
    current().held = true;
    if (pointers.size === 1) { moved = 0; downAt = e.timeStamp; }
    if (pointers.size === 2) pinch = spread();
    lastT = e.timeStamp;
  };
  const move = (e: PointerEvent) => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const now = local(e);
    pointers.set(e.pointerId, now);
    const dt = Math.max(0.001, (e.timeStamp - lastT) / 1000);
    lastT = e.timeStamp;
    if (pointers.size === 1) {
      const dx = now.x - prev.x, dy = now.y - prev.y;
      moved += Math.abs(dx) + Math.abs(dy);
      if (moved > 6) current().drag(dx, dy, dt);
    } else if (pointers.size === 2) {
      moved += 10;
      const s = spread();
      const [a, b] = [...pointers.values()];
      if (pinch > 0 && s > 0) current().zoom(s / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2);
      pinch = s;
    }
    events.onChange();
  };
  const up = (e: PointerEvent) => {
    if (!pointers.delete(e.pointerId)) return;
    if (pointers.size === 0) {
      current().release();
      if (moved <= 6 && e.timeStamp - downAt < 500 && e.type === 'pointerup') {
        const p = local(e);
        events.onTap(p.x, p.y);
      }
    }
    pinch = pointers.size === 2 ? spread() : 0;
    events.onChange();
  };
  const wheel = (e: WheelEvent) => {
    e.preventDefault();
    const p = local(e);
    const delta = e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY;
    current().zoom(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0015)), p.x, p.y);
    events.onChange();
  };
  const key = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!current().key(e.key)) return;
    e.preventDefault();
    events.onChange();
  };
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', up);
  el.addEventListener('wheel', wheel, { passive: false });
  el.addEventListener('keydown', key);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', up);
    el.removeEventListener('wheel', wheel);
    el.removeEventListener('keydown', key);
  };
}
