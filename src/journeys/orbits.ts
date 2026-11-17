// The geometry behind the two workshop journeys: Kepler's triangulation of
// Mars, and planning a flight there. Everything is in the plane of the
// ecliptic (J2000), in astronomical units, with x toward the equinox. No DOM.

import type { Ephemeris } from '../astro/ephemeris.ts';
import { EQ_TO_ECL_J2000 } from '../astro/frames.ts';
import { GM_SUN, lambert, propagate } from '../astro/kepler.ts';
import { AU_KM, type Vec3, apply, norm, scale, sub } from '../astro/math.ts';

export type Point = [number, number];

/** Heliocentric position in ecliptic coordinates, AU. */
export function helioEcliptic(eph: Ephemeris, id: string, jdTT: number): Vec3 {
  return apply(EQ_TO_ECL_J2000, eph.helio(id, jdTT));
}

// ------------------------------------------------------------------ Kepler's Mars

/** Mars's sidereal year in days: after this long it is back at the same point of its orbit. */
export const MARS_YEAR = 686.98;

export interface Sighting {
  jd: number;
  /** Where the Earth was. */
  earth: Point;
  /** Ecliptic longitude of Mars as seen from the Earth, radians. */
  lon: number;
}

export interface MarsFix {
  a: Sighting;
  b: Sighting;
  /** Where Mars really was (the answer). */
  mars: Point;
}

function sighting(eph: Ephemeris, jd: number): Sighting {
  const e = helioEcliptic(eph, 'earth', jd), m = helioEcliptic(eph, 'mars', jd);
  return { jd, earth: [e[0], e[1]], lon: Math.atan2(m[1] - e[1], m[0] - e[0]) };
}

/** Two sightings of Mars one Mars year apart: the planet is in the same place, the Earth is not. */
export function marsFix(eph: Ephemeris, jd: number): MarsFix {
  const m = helioEcliptic(eph, 'mars', jd);
  return { a: sighting(eph, jd), b: sighting(eph, jd + MARS_YEAR), mars: [m[0], m[1]] };
}

/** Where two lines of sight cross, or null if they are parallel or cross behind an observer. */
export function crossing(a: Sighting, b: Sighting): Point | null {
  const ax = Math.cos(a.lon), ay = Math.sin(a.lon), bx = Math.cos(b.lon), by = Math.sin(b.lon);
  const det = ax * by - ay * bx;
  if (Math.abs(det) < 1e-9) return null;
  const dx = b.earth[0] - a.earth[0], dy = b.earth[1] - a.earth[1];
  const s = (dx * by - dy * bx) / det, t = (dx * ay - dy * ax) / det;
  if (s <= 0 || t <= 0) return null;
  return [a.earth[0] + ax * s, a.earth[1] + ay * s];
}

/** The angle at which the two lines of sight meet, radians (0 = parallel, useless). */
export function crossingAngle(fix: MarsFix): number {
  const d = Math.abs(fix.a.lon - fix.b.lon) % Math.PI;
  return Math.min(d, Math.PI - d);
}

/** A closed orbit as points, for drawing. */
export function orbitPath(eph: Ephemeris, id: string, jd: number, periodDays: number, n = 120): Point[] {
  const out: Point[] = [];
  for (let k = 0; k <= n; k++) {
    const p = helioEcliptic(eph, id, jd + (periodDays * k) / n);
    out.push([p[0], p[1]]);
  }
  return out;
}

// ------------------------------------------------------------------ flying to Mars

const KM_S = AU_KM / 86400; // 1 AU/day in km/s

export interface Transfer {
  /** Speed to add on leaving the Earth, and to shed on reaching Mars, km/s (relative to each planet). */
  departV: number;
  arriveV: number;
  /** The coasting path from the Earth at launch to Mars at arrival. */
  path: Point[];
  earth: Point;
  mars: Point;
  /** Where Mars is at launch, to show how far ahead one has to aim. */
  marsAtLaunch: Point;
}

function velocity(eph: Ephemeris, id: string, jd: number): Vec3 {
  const h = 0.01;
  return scale(sub(eph.helio(id, jd + h), eph.helio(id, jd - h)), 1 / (2 * h));
}

/** The coasting orbit that leaves the Earth on `jdDepart` and meets Mars `days` later. */
export function planTransfer(eph: Ephemeris, jdDepart: number, days: number): Transfer | null {
  const r1 = eph.helio('earth', jdDepart), r2 = eph.helio('mars', jdDepart + days);
  const sol = lambert(r1, r2, days, GM_SUN, true);
  if (!sol) return null;
  const departV = norm(sub(sol.v1, velocity(eph, 'earth', jdDepart))) * KM_S;
  const arriveV = norm(sub(sol.v2, velocity(eph, 'mars', jdDepart + days))) * KM_S;
  if (!Number.isFinite(departV) || !Number.isFinite(arriveV)) return null;
  const path: Point[] = [];
  const steps = 48;
  for (let k = 0; k <= steps; k++) {
    const p = apply(EQ_TO_ECL_J2000, propagate({ r: r1, v: sol.v1 }, (days * k) / steps).r);
    path.push([p[0], p[1]]);
  }
  const xy = (v: Vec3): Point => { const e = apply(EQ_TO_ECL_J2000, v); return [e[0], e[1]]; };
  return { departV, arriveV, path, earth: xy(r1), mars: xy(r2), marsAtLaunch: xy(eph.helio('mars', jdDepart)) };
}
