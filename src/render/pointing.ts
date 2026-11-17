// Phone pointing: hold the phone up and the sky on screen is the sky behind it.
// The direction maths is plain so it can be tested; the class below listens to
// the device's orientation sensors.

import { DEG } from '../astro/math.ts';

/**
 * Where the back of a device points, from its orientation angles in degrees
 * (W3C DeviceOrientation: alpha about the vertical, counter-clockwise from
 * north; beta the front-to-back tilt; gamma the left-to-right tilt).
 * Returns azimuth from north through east and altitude, in radians.
 */
export function pointingDirection(alpha: number, beta: number, gamma: number): { az: number; alt: number } {
  const [e, n, u] = pointingVector(alpha, beta, gamma);
  return { az: Math.atan2(e, n), alt: Math.asin(Math.max(-1, Math.min(1, u))) };
}

/** The same direction as an (east, north, up) unit vector. */
export function pointingVector(alpha: number, beta: number, gamma: number): [number, number, number] {
  const a = alpha * DEG, b = beta * DEG, g = gamma * DEG;
  // The screen's inward normal (0, 0, -1) carried through R = Rz(alpha) Rx(beta) Ry(gamma).
  const x = -Math.sin(g), y = Math.cos(g) * Math.sin(b), z = -Math.cos(g) * Math.cos(b);
  return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z];
}

interface OrientationEventLike {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute?: boolean;
  /** Safari: compass heading of the top of the device, clockwise from north. */
  webkitCompassHeading?: number;
}

type PermissionRequester = { requestPermission?: () => Promise<string> };

export type PointingResult = 'ok' | 'denied' | 'unsupported';

export class Pointing {
  active = false;
  /** Called when a new reading arrives. */
  onChange: (() => void) | null = null;
  private vec: [number, number, number] | null = null;
  private eventName = '';
  private readonly handler = (e: Event) => this.read(e as unknown as OrientationEventLike);

  /** Worth offering: a touch device that reports its orientation. */
  static get supported(): boolean {
    return typeof window !== 'undefined' && 'DeviceOrientationEvent' in window && matchMedia('(pointer: coarse)').matches;
  }

  /** Ask for the sensor. Must be called from a tap: Safari asks for permission here. */
  async request(): Promise<PointingResult> {
    if (!Pointing.supported) return 'unsupported';
    const ctor = (window as unknown as { DeviceOrientationEvent: PermissionRequester }).DeviceOrientationEvent;
    if (typeof ctor.requestPermission === 'function') {
      try {
        if (await ctor.requestPermission() !== 'granted') return 'denied';
      } catch {
        return 'denied';
      }
    }
    return 'ok';
  }

  /** Start listening. Resolves false if no usable reading arrives within two seconds. */
  listen(): Promise<boolean> {
    this.stop();
    this.vec = null;
    // Chrome has a separate event for compass-referenced readings; Safari adds a heading to the plain one.
    this.eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
    window.addEventListener(this.eventName, this.handler);
    this.active = true;
    return new Promise((resolve) => setTimeout(() => {
      if (this.active && !this.vec) this.stop();
      resolve(this.active || this.vec !== null);
    }, 2000));
  }

  stop(): void {
    if (this.eventName) window.removeEventListener(this.eventName, this.handler);
    this.eventName = '';
    this.active = false;
  }

  /** The smoothed direction the phone points, or null before the first reading. */
  direction(): { az: number; alt: number } | null {
    if (!this.active || !this.vec) return null;
    const [e, n, u] = this.vec;
    return { az: Math.atan2(e, n), alt: Math.asin(Math.max(-1, Math.min(1, u))) };
  }

  private read(e: OrientationEventLike): void {
    if (e.beta === null || e.gamma === null) return;
    let alpha = e.alpha;
    if (typeof e.webkitCompassHeading === 'number') alpha = 360 - e.webkitCompassHeading;
    else if (this.eventName === 'deviceorientation' && e.absolute !== true) return; // not referenced to north
    if (alpha === null) return;
    const v = pointingVector(alpha, e.beta, e.gamma);
    // Sensors jitter: ease toward each reading.
    const k = this.vec ? 0.18 : 1;
    const p = this.vec ?? v;
    const m: [number, number, number] = [p[0] + (v[0] - p[0]) * k, p[1] + (v[1] - p[1]) * k, p[2] + (v[2] - p[2]) * k];
    const len = Math.hypot(m[0], m[1], m[2]) || 1;
    this.vec = [m[0] / len, m[1] / len, m[2] / len];
    this.onChange?.();
  }
}
