// How dark the sky is and how faint we can see: the Sun's and Moon's light,
// twilight, eclipses, light pollution and the zoom. Pure maths over the
// Universe, shared by the renderer, labels and picking.

import { type EarthShadow, earthShadowAt } from '../astro/events.ts';
import { DEG, type Vec3, angleBetween, apply, clamp, scale } from '../astro/math.ts';
import type { Universe } from '../sim/universe.ts';
import { refractVector } from './projection.ts';

/** What the sky is like right now; labels and the UI read this too. */
export interface SkyConditions {
  /** Apparent direction of the Sun and Moon in the horizon frame. */
  sunDir: Vec3;
  moonDir: Vec3;
  /** Geometric altitude of the Sun, radians. */
  sunAlt: number;
  /** Altitude that sets sky brightness: the Sun's, pulled down during a deep eclipse. */
  sunAltEffective: number;
  /** Fraction of the Sun's disk not covered by the Moon. */
  sunVisible: number;
  moonLight: number;
  /** The Earth's shadow, when the Moon is in or near it. */
  shadow: EarthShadow | null;
  /** Faintest magnitude drawn, and the same before the zoom gain. */
  limitMag: number;
  nakedEyeLimit: number;
  /** Magnitudes lost per airmass. */
  extinction: number;
}

/** Fraction of a disk of radius r1 left uncovered by a disk of radius r2 whose centre is d away. */
export function uncoveredFraction(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 1;
  if (d <= Math.abs(r1 - r2)) return r2 >= r1 ? 0 : 1 - (r2 * r2) / (r1 * r1);
  const a = Math.acos(clamp((d * d + r1 * r1 - r2 * r2) / (2 * d * r1), -1, 1));
  const b = Math.acos(clamp((d * d + r2 * r2 - r1 * r1) / (2 * d * r2), -1, 1));
  const overlap = r1 * r1 * (a - Math.sin(2 * a) / 2) + r2 * r2 * (b - Math.sin(2 * b) / 2);
  return clamp(1 - overlap / (Math.PI * r1 * r1), 0, 1);
}

function interp(x: number, table: [number, number][]): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

// Faintest star visible against the sky for a Sun altitude in degrees.
const TWILIGHT_LIMIT: [number, number][] = [[-18, 9], [-15, 7.2], [-12, 6.0], [-9, 4.6], [-6, 3.0], [-3, 1.0], [0, -1.2], [3, -2.8], [6, -3.8]];

/** Sky brightness, limiting magnitude and friends for the Universe's current frame. */
export function skyConditions(u: Universe, opts: { bortle: number; atmosphere: boolean; fov: number }): SkyConditions {
  const m = u.frame.j2000ToHorizon;
  const sun = u.bodies.get('sun')!, moon = u.bodies.get('moon')!;
  const sunTrue = apply(m, sun.dir), moonTrue = apply(m, moon.dir);
  const sunDir = opts.atmosphere ? refractVector(sunTrue) : sunTrue;
  const moonDir = opts.atmosphere ? refractVector(moonTrue) : moonTrue;
  const sunAlt = Math.asin(clamp(sunTrue[2], -1, 1));
  const sunVisible = uncoveredFraction(sun.radius, moon.radius, angleBetween(sun.dir, moon.dir));
  // In the last tenth of an eclipse the sky falls to deep twilight.
  const t = clamp(sunVisible / 0.1, 0, 1);
  const deep = -5.5 * DEG;
  const sunAltEffective = sunAlt > deep ? deep + (sunAlt - deep) * t * t * (3 - 2 * t) : sunAlt;

  const moonUp = clamp(moonTrue[2] * 3, 0, 1);
  // Near the point opposite the Sun, the Moon may be in the Earth's shadow.
  const shadow = angleBetween(moon.dir, scale(sun.dir, -1)) < 3 * DEG ? earthShadowAt(u.eph, u.frame.jdUT) : null;
  const eclipsed = shadow && shadow.separation < shadow.penumbra + shadow.moonRadius ? shadow : null;
  const moonLight = Math.pow(moon.illum, 1.6) * moonUp * (eclipsed ? 0.03 + 0.97 * eclipsed.uncovered : 1);
  const zoomGain = clamp(1.7 * Math.log2((70 * DEG) / opts.fov), -0.6, 6.5);
  let nakedEyeLimit: number;
  if (opts.atmosphere) {
    const dark = 7.6 - (clamp(opts.bortle, 1, 9) - 1) * 0.5 - 1.7 * moonLight;
    nakedEyeLimit = Math.min(dark, interp(sunAltEffective / DEG, TWILIGHT_LIMIT));
  } else {
    nakedEyeLimit = 6.8;
  }
  return {
    sunDir, moonDir, sunAlt, sunAltEffective, sunVisible, moonLight, shadow: eclipsed,
    nakedEyeLimit, limitMag: nakedEyeLimit + zoomGain,
    extinction: opts.atmosphere ? 0.16 + 0.012 * (opts.bortle - 1) : 0,
  };
}

/** Faintest deep-sky object marked: only showpieces when zoomed out, more as the field narrows. */
export function dsoLimit(c: SkyConditions, fov: number): number {
  return Math.min(c.limitMag + 2.5, 4.6 + clamp(2.6 * Math.log2((100 * DEG) / fov), -1, 8));
}

/** Brightness lost to the air at an altitude, as a factor 0..1. */
export function airDimming(sinAlt: number, k: number): number {
  if (k <= 0) return 1;
  const s = Math.max(sinAlt, 0);
  const airmass = 1 / (s + 0.025 * Math.exp(-11 * s));
  return Math.pow(10, -0.4 * k * (airmass - 1));
}
