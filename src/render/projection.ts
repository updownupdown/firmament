// The sky camera: a stereographic projection of the local sky, mirrored
// exactly by the vertex shaders (see shaders.ts). No DOM or WebGL here, so
// labels, picking and tests can use it anywhere.

import { DEG, type Mat3, type Vec3, apply, clamp, transpose } from '../astro/math.ts';

export const MIN_FOV = 0.05 * DEG;
export const MAX_FOV = 150 * DEG;

/**
 * Atmospheric refraction for a true altitude (radians): how far the sky is lifted.
 * Sæmundsson's formula, faded out smoothly below the horizon so the mapping
 * stays continuous. The shaders use the same expression.
 */
export function skyRefraction(alt: number): number {
  const d = alt / DEG;
  const hd = Math.max(d, -1.9);
  const arcmin = Math.max(0, 1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG));
  const t = clamp((d + 8) / 6.1, 0, 1);
  return (arcmin / 60) * DEG * t * t * (3 - 2 * t);
}

/** Lift a horizon-frame unit vector by refraction. */
export function refractVector(h: Vec3): Vec3 {
  const alt = Math.asin(clamp(h[2], -1, 1));
  const c = Math.cos(alt);
  if (c < 1e-6) return h;
  const a2 = alt + skyRefraction(alt);
  const k = Math.cos(a2) / c;
  return [h[0] * k, h[1] * k, Math.sin(a2)];
}

/** Undo refraction: apparent horizon-frame vector → true. */
export function unrefractVector(h: Vec3): Vec3 {
  const app = Math.asin(clamp(h[2], -1, 1));
  const c = Math.cos(app);
  if (c < 1e-6) return h;
  let t = app;
  for (let i = 0; i < 8; i++) t = app - skyRefraction(t);
  const k = Math.cos(t) / c;
  return [h[0] * k, h[1] * k, Math.sin(t)];
}

/** Horizon frame (x south, y east, z up) → camera frame (x right, y up, looking along −z). */
export function viewMatrix(az: number, alt: number): Mat3 {
  const ca = Math.cos(alt), sa = Math.sin(alt), cz = Math.cos(az), sz = Math.sin(az);
  const fwd: Vec3 = [-ca * cz, ca * sz, sa];
  const up: Vec3 = [sa * cz, -sa * sz, ca];
  const right: Vec3 = [sz, cz, 0];
  return [right[0], right[1], right[2], up[0], up[1], up[2], -fwd[0], -fwd[1], -fwd[2]];
}

export interface Projected {
  x: number;
  y: number;
  /** Inside the canvas. */
  onScreen: boolean;
}

export class SkyProjection {
  /** Where the camera points: azimuth from north through east, and altitude (radians). */
  az = 180 * DEG;
  alt = 25 * DEG;
  /** Field of view across the shorter side of the canvas (radians). */
  fov = 90 * DEG;
  /** Canvas size in CSS pixels. */
  width = 1;
  height = 1;
  refraction = true;
  /**
   * The lens: 0.5 is the stereographic projection used on the ground, 1 the
   * perspective (gnomonic) projection of Space view. In between, a point θ
   * from the centre lands tan(lens·θ)/lens from it, so lifting off can blend
   * one into the other with the stars sliding smoothly.
   */
  lens = 0.5;

  view: Mat3 = viewMatrix(this.az, this.alt);
  private viewT: Mat3 = transpose(this.view);
  /** CSS pixels per unit of the stereographic plane. */
  scale = 1;

  /** Call after changing az, alt, fov or the size. */
  update(): void {
    this.alt = clamp(this.alt, -90 * DEG, 90 * DEG);
    this.fov = clamp(this.fov, MIN_FOV, MAX_FOV);
    this.az = ((this.az % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    this.view = viewMatrix(this.az, this.alt);
    this.viewT = transpose(this.view);
    this.lens = clamp(this.lens, 0.5, 1);
    this.scale = Math.min(this.width, this.height) / 2 / (Math.tan(this.lens * this.fov / 2) / this.lens);
  }

  /** Angle on the sky covered by one CSS pixel at the centre of the view. */
  get pixelAngle(): number {
    return 1 / this.scale;
  }

  /** Project a camera-frame unit vector. Null when it is too close to straight behind. */
  projectCamera(c: Vec3): Projected | null {
    if (this.lens > 0.5) {
      const s = Math.hypot(c[0], c[1]);
      const th = Math.atan2(s, -c[2]);
      if (th * this.lens > 1.45) return null;
      const k = s > 1e-12 ? (Math.tan(this.lens * th) / this.lens / s) * this.scale : this.scale;
      const x = this.width / 2 + c[0] * k, y = this.height / 2 - c[1] * k;
      return { x, y, onScreen: x >= 0 && x <= this.width && y >= 0 && y <= this.height };
    }
    if (c[2] > 0.98) return null;
    const k = (2 / (1 - c[2])) * this.scale;
    const x = this.width / 2 + c[0] * k;
    const y = this.height / 2 - c[1] * k;
    return { x, y, onScreen: x >= 0 && x <= this.width && y >= 0 && y <= this.height };
  }

  /** Project a true (unrefracted) horizon-frame unit vector to CSS pixels. */
  project(h: Vec3): Projected | null {
    return this.projectCamera(apply(this.view, this.refraction ? refractVector(h) : h));
  }

  /** The true horizon-frame direction under a CSS pixel. */
  unproject(x: number, y: number): Vec3 {
    const px = (x - this.width / 2) / this.scale;
    const py = (this.height / 2 - y) / this.scale;
    let c: Vec3;
    if (this.lens > 0.5) {
      const r = Math.hypot(px, py);
      const th = Math.atan(this.lens * r) / this.lens;
      const k = r > 1e-12 ? Math.sin(th) / r : 1;
      c = [px * k, py * k, -Math.cos(th)];
    } else {
      const r2 = px * px + py * py;
      c = [(4 * px) / (r2 + 4), (4 * py) / (r2 + 4), (r2 - 4) / (r2 + 4)];
    }
    const h = apply(this.viewT, c);
    return this.refraction ? unrefractVector(h) : h;
  }

  /** Camera-frame direction → horizon frame (no refraction). */
  cameraToHorizon(c: Vec3): Vec3 {
    return apply(this.viewT, c);
  }

  /**
   * The screen-right and screen-up directions at a camera-frame point, as
   * camera-frame vectors. The projection is conformal, so these are orthonormal;
   * sphere impostors use them to orient lighting and surface features.
   */
  tangentBasis(c: Vec3): { right: Vec3; up: Vec3 } {
    // Minimal rotation taking the view axis (0, 0, −1) to c, applied to x and y.
    const k = 1 - c[2];
    if (k < 1e-9) return { right: [1, 0, 0], up: [0, 1, 0] };
    return {
      right: [1 - (c[0] * c[0]) / k, -(c[0] * c[1]) / k, c[0]],
      up: [-(c[0] * c[1]) / k, 1 - (c[1] * c[1]) / k, c[1]],
    };
  }
}
