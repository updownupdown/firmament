// The Moon as a picture and through a night: which way its face is turned and
// lit for a given observer (for drawing it), its libration and distance, and a
// fast pass over one night of Sun and Moon altitudes (dark hours, moonrise and
// moonset, the hours of dark sky with the Moon down).

import { AU_KM, DEG, type Vec3, add, apply, cross, dot, fromSpherical, norm, normalize, scale, sub } from './math.ts';
import { gast } from './frames.ts';
import { type EarthSite, type Ephemeris, type Frame, makeFrame, observeBody } from './ephemeris.ts';
import { J2000 } from './time.ts';

/** The Moon's mean distance (km), for "how big it looks" comparisons. */
export const MOON_MEAN_KM = 384_400;

/** Which way is up in a picture of the Moon. */
export type MoonUp = 'north' | 'south' | 'zenith';

export interface MoonFace {
  /**
   * Picture frame: x to the right, y up, z toward the observer. `sun` is the
   * direction from the Moon to the Sun; `pole` and `prime` are the Moon's
   * north pole and the direction of its prime meridian.
   */
  sun: Vec3;
  pole: Vec3;
  prime: Vec3;
  illum: number;
  /** Sun–Moon–observer angle, radians. */
  phase: number;
  /** Distance from the observer, km. */
  distKm: number;
  /** Angular radius, radians. */
  radius: number;
  /** Selenographic longitude (east positive) and latitude of the point facing the observer: the libration. */
  libLon: number;
  libLat: number;
}

/** The Moon's face as the observer in `f` sees it, with `up` at the top of the picture. */
export function moonFace(eph: Ephemeris, f: Frame, up: MoonUp = 'north'): MoonFace {
  const m = observeBody(eph, f, 'moon');
  const z = scale(m.dir, -1);
  // Row 3 of a J2000 → frame matrix is that frame's z axis written in J2000.
  const row3 = (mat: number[]): Vec3 => [mat[6], mat[7], mat[8]];
  let ref = up === 'zenith' ? row3(f.j2000ToHorizon) : row3(f.j2000ToDate);
  if (up === 'south') ref = scale(ref, -1);
  let y = sub(ref, scale(z, dot(ref, z)));
  // Straight overhead (or at the pole) any up will do.
  if (norm(y) < 1e-6) y = sub(row3(f.j2000ToDate), scale(z, dot(row3(f.j2000ToDate), z)));
  y = normalize(y);
  const x = cross(y, z);
  const pic = (v: Vec3): Vec3 => [dot(v, x), dot(v, y), dot(v, z)];
  const { pole, prime } = lunarOrientation(f.jdTT);
  const east = cross(pole, prime);
  return {
    sun: pic(m.sunDir), pole: pic(pole), prime: pic(prime),
    illum: m.illum, phase: m.phase, distKm: m.dist * AU_KM, radius: m.radius,
    libLon: Math.atan2(dot(z, east), dot(z, prime)), libLat: Math.asin(Math.max(-1, Math.min(1, dot(z, pole)))),
  };
}

/**
 * The Moon's north pole and prime meridian (J2000 unit vectors) from the IAU
 * 2009 model with its periodic terms (Archinal et al. 2011). The terms move the
 * pole by up to 4°, which is most of the latitude libration.
 */
export function lunarOrientation(jdTT: number): { pole: Vec3; prime: Vec3 } {
  const d = jdTT - J2000, T = d / 36525;
  const E = [
    125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d, 176.625 + 13.3407154 * d,
    357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d, 134.963 + 13.0649930 * d, 276.617 + 0.3287146 * d,
    34.226 + 1.7484877 * d, 15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
    25.053 + 12.9590088 * d,
  ].map((x) => x * DEG);
  const s = E.map(Math.sin), c = E.map(Math.cos);
  const ra = 269.9949 + 0.0031 * T - 3.8787 * s[0] - 0.1204 * s[1] + 0.0700 * s[2] - 0.0172 * s[3]
    + 0.0072 * s[5] - 0.0052 * s[9] + 0.0043 * s[12];
  const dec = 66.5392 + 0.0130 * T + 1.5419 * c[0] + 0.0239 * c[1] - 0.0278 * c[2] + 0.0068 * c[3]
    - 0.0029 * c[5] + 0.0009 * c[6] + 0.0008 * c[9] - 0.0009 * c[12];
  const w = 38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.5610 * s[0] + 0.1208 * s[1] - 0.0642 * s[2]
    + 0.0158 * s[3] + 0.0252 * s[4] - 0.0066 * s[5] - 0.0047 * s[6] - 0.0046 * s[7] + 0.0028 * s[8]
    + 0.0052 * s[9] + 0.0040 * s[10] + 0.0019 * s[11] - 0.0044 * s[12];
  const pole = fromSpherical(ra * DEG, dec * DEG);
  const node = normalize(cross([0, 0, 1], pole));
  const wr = w * DEG;
  return { pole, prime: add(scale(node, Math.cos(wr)), scale(cross(pole, node), Math.sin(wr))) };
}

// ------------------------------------------------------------------ one night

export interface NightSky {
  /** Start of the samples (UT Julian date) and the step between them (days). */
  start: number;
  step: number;
  /** Geometric altitudes, radians: the Sun, and the Moon seen from the site. */
  sunAlt: Float32Array;
  moonAlt: Float32Array;
  /** Moonrise and moonset in the window (upper limb on the horizon), if any. */
  moonRise: number | null;
  moonSet: number | null;
  /** Every moonrise and moonset in the window. */
  moonRises: number[];
  moonSets: number[];
  /** Astronomical darkness (Sun 18° down) in the window. */
  dark: [number, number][];
  /** Darkness with the Moon below the horizon. */
  moonless: [number, number][];
  darkHours: number;
  moonlessHours: number;
  /** When the Moon is highest while the sky is at least a little dark (Sun 6° down), else highest at all. */
  moonBest: number;
}

const H0 = -0.8333 * DEG;

/**
 * Sun and Moon over `span` days from `start` (UT), sampled every `stepMin`
 * minutes. Directions come from full positions every two hours, interpolated;
 * the Earth's turning is applied exactly, so this is quick (a few ms a night)
 * and good to about a minute.
 */
export function nightSky(eph: Ephemeris, site: EarthSite, start: number, span = 1, stepMin = 5): NightSky {
  const nodeStep = 1 / 12;
  const nodes = Math.ceil(span / nodeStep) + 1;
  const f0 = makeFrame(eph, start + span / 2, site);
  const sunDirs: Vec3[] = [], moonDirs: Vec3[] = [];
  for (let k = 0; k < nodes; k++) {
    const f = makeFrame(eph, start + k * nodeStep, site);
    sunDirs.push(apply(f0.j2000ToDate, observeBody(eph, f, 'sun').dir));
    moonDirs.push(apply(f0.j2000ToDate, observeBody(eph, f, 'moon').dir));
  }
  const step = stepMin / 1440;
  const n = Math.round(span / step) + 1;
  const sunAlt = new Float32Array(n), moonAlt = new Float32Array(n);
  const sinLat = Math.sin(site.lat), cosLat = Math.cos(site.lat);
  const dtt = f0.jdTT - f0.jdUT;
  const altOf = (v: Vec3, last: number) =>
    Math.asin(Math.max(-1, Math.min(1, sinLat * v[2] + cosLat * (v[0] * Math.cos(last) + v[1] * Math.sin(last)))));
  const lerpDir = (dirs: Vec3[], s: number): Vec3 => {
    const k = Math.min(dirs.length - 2, Math.floor(s));
    const w = s - k, a = dirs[k], b = dirs[k + 1];
    return normalize([a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w]);
  };
  for (let i = 0; i < n; i++) {
    const t = start + i * step;
    const last = gast(t, t + dtt, f0.nut) + site.lon;
    const s = (i * step) / nodeStep;
    sunAlt[i] = altOf(lerpDir(sunDirs, s), last);
    moonAlt[i] = altOf(lerpDir(moonDirs, s), last);
  }

  // Crossings by linear interpolation between samples.
  const at = (i: number, a: Float32Array, h: number) => start + (i - 1 + (h - a[i - 1]) / (a[i] - a[i - 1])) * step;
  const moonRises: number[] = [], moonSets: number[] = [];
  for (let i = 1; i < n; i++) {
    if (moonAlt[i - 1] <= H0 && moonAlt[i] > H0) moonRises.push(at(i, moonAlt, H0));
    if (moonAlt[i - 1] > H0 && moonAlt[i] <= H0) moonSets.push(at(i, moonAlt, H0));
  }
  const spans = (keep: (i: number) => boolean): [number, number][] => {
    const out: [number, number][] = [];
    let from = -1;
    for (let i = 0; i <= n; i++) {
      const on = i < n && keep(i);
      if (on && from < 0) from = i;
      if (!on && from >= 0) {
        out.push([start + Math.max(0, from - 0.5) * step, start + Math.min(n - 1, i - 0.5) * step]);
        from = -1;
      }
    }
    return out;
  };
  const dark = spans((i) => sunAlt[i] < -18 * DEG);
  const moonless = spans((i) => sunAlt[i] < -18 * DEG && moonAlt[i] < H0);
  const hours = (list: [number, number][]) => list.reduce((s, [a, b]) => s + (b - a), 0) * 24;

  let best = -1, bestDark = -1;
  for (let i = 0; i < n; i++) {
    if (best < 0 || moonAlt[i] > moonAlt[best]) best = i;
    if (sunAlt[i] < -6 * DEG && moonAlt[i] > 0 && (bestDark < 0 || moonAlt[i] > moonAlt[bestDark])) bestDark = i;
  }
  return {
    start, step, sunAlt, moonAlt, moonRise: moonRises[0] ?? null, moonSet: moonSets[0] ?? null, moonRises, moonSets, dark, moonless,
    darkHours: hours(dark), moonlessHours: hours(moonless),
    moonBest: start + (bestDark >= 0 ? bestDark : best) * step,
  };
}
