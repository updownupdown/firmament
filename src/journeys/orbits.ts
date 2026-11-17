// Geometry for the two orbit journeys, worked on the ecliptic plane seen from
// above (ecliptic north up, x toward the March equinox, AU). Pure functions,
// so the journeys' answers can be checked in tests against the ephemeris.

import type { Ephemeris } from '../astro/ephemeris.ts';
import { EPS_J2000 } from '../astro/frames.ts';
import { GM_SUN, lambert } from '../astro/kepler.ts';
import type { Vec3 } from '../astro/math.ts';

export type Vec2 = [number, number];

/** Mars's sidereal period, days: after this it is back at the same point of its orbit. */
export const MARS_YEAR = 686.98;

const cosE = Math.cos(EPS_J2000), sinE = Math.sin(EPS_J2000);

/** A J2000 equatorial vector, projected onto the ecliptic plane. */
export function eclipticXY(v: Vec3): Vec2 {
  return [v[0], cosE * v[1] + sinE * v[2]];
}

const sub2 = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const len2 = (a: Vec2) => Math.hypot(a[0], a[1]);
const unit2 = (a: Vec2): Vec2 => { const l = len2(a); return [a[0] / l, a[1] / l]; };

/** Where the lines p1 + s·d1 and p2 + u·d2 cross, or null if they are parallel. */
export function crossing(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): Vec2 | null {
  const det = d1[0] * d2[1] - d1[1] * d2[0];
  if (Math.abs(det) < 1e-9) return null;
  const w = sub2(p2, p1);
  const s = (w[0] * d2[1] - w[1] * d2[0]) / det;
  return [p1[0] + s * d1[0], p1[1] + s * d1[1]];
}

export interface MarsFix {
  /** The two sightings, one Martian year apart. */
  jd1: number;
  jd2: number;
  earth1: Vec2;
  earth2: Vec2;
  /** Directions from the Earth to Mars on each date (unit vectors). */
  look1: Vec2;
  look2: Vec2;
  /** Where the two sight lines cross: Mars, found without knowing its distance. */
  mars: Vec2;
}

/**
 * Kepler's trick: Mars is at the same place in its orbit on two dates one
 * Martian year apart, but the Earth is not. Two sightings from two known
 * points of the Earth's orbit pin Mars down.
 */
export function marsFix(eph: Ephemeris, jdTT: number): MarsFix | null {
  const jd2 = jdTT + MARS_YEAR;
  const earth1 = eclipticXY(eph.earth(jdTT)), earth2 = eclipticXY(eph.earth(jd2));
  const look1 = unit2(sub2(eclipticXY(eph.helio('mars', jdTT)), earth1));
  const look2 = unit2(sub2(eclipticXY(eph.helio('mars', jd2)), earth2));
  const mars = crossing(earth1, look1, earth2, look2);
  // Nearly parallel sight lines make a poor fix; Kepler skipped those pairs too.
  const sinAngle = Math.abs(look1[0] * look2[1] - look1[1] * look2[0]);
  if (!mars || sinAngle < 0.15) return null;
  return { jd1: jdTT, jd2, earth1, earth2, look1, look2, mars };
}

/** `count` fixes spread evenly through one Martian year from `jd0`, nudged past dates with poor geometry. */
export function marsTrack(eph: Ephemeris, jd0: number, count: number): MarsFix[] {
  const out: MarsFix[] = [];
  const gap = MARS_YEAR / count;
  for (let k = 0; k < count; k++) {
    for (let nudge = 0; nudge < gap / 2; nudge += 4) {
      const f = marsFix(eph, jd0 + k * gap + nudge);
      if (f) { out.push(f); break; }
    }
  }
  return out;
}

export interface Transfer {
  launch: number;
  /** Days from the Earth to Mars's orbit on a half ellipse that just touches both. */
  days: number;
  arrive: number;
  earthAtLaunch: Vec2;
  /** Where the half ellipse meets Mars's orbit, opposite the launch point. */
  meet: Vec2;
  marsAtLaunch: Vec2;
  marsAtArrival: Vec2;
  /** Angle from the meeting point to Mars on arrival, degrees: positive means Mars is ahead. */
  missDeg: number;
  /** Semi-major axis and eccentricity of the transfer ellipse. */
  a: number;
  e: number;
}

/**
 * A Hohmann transfer from the Earth to Mars, launched on `jdTT`: half an
 * ellipse from the Earth's distance to Mars's, which only works if Mars gets
 * to the far end at the same time as the spacecraft.
 */
export function hohmann(eph: Ephemeris, jdTT: number): Transfer {
  const earthAtLaunch = eclipticXY(eph.earth(jdTT));
  const r1 = len2(earthAtLaunch);
  const dir: Vec2 = [-earthAtLaunch[0] / r1, -earthAtLaunch[1] / r1];
  // Mars's distance from the Sun on arrival; iterate, since the flight time depends on it.
  let r2 = len2(eclipticXY(eph.helio('mars', jdTT + 259)));
  let days = 0;
  for (let k = 0; k < 3; k++) {
    const a = (r1 + r2) / 2;
    days = Math.PI * Math.sqrt(a ** 3 / GM_SUN);
    r2 = len2(eclipticXY(eph.helio('mars', jdTT + days)));
  }
  const a = (r1 + r2) / 2;
  const meet: Vec2 = [dir[0] * r2, dir[1] * r2];
  const marsAtArrival = eclipticXY(eph.helio('mars', jdTT + days));
  let miss = Math.atan2(marsAtArrival[1], marsAtArrival[0]) - Math.atan2(meet[1], meet[0]);
  miss = ((miss / Math.PI + 3) % 2 - 1) * 180;
  return {
    launch: jdTT, days, arrive: jdTT + days, earthAtLaunch, meet,
    marsAtLaunch: eclipticXY(eph.helio('mars', jdTT)), marsAtArrival, missDeg: miss,
    a, e: Math.abs(r2 - r1) / (r1 + r2),
  };
}

/** Point on a transfer ellipse at fraction `f` (0 launch, 1 arrival) of the way round, by angle. */
export function transferPoint(t: Transfer, f: number): Vec2 {
  const r1 = len2(t.earthAtLaunch), r2 = len2(t.meet);
  const theta0 = Math.atan2(t.earthAtLaunch[1], t.earthAtLaunch[0]);
  const nu = Math.PI * f;
  // Conic with perihelion (or aphelion) at the launch point.
  const p = (2 * r1 * r2) / (r1 + r2);
  const e = (r2 - r1) / (r1 + r2);
  const r = p / (1 + e * Math.cos(nu));
  return [r * Math.cos(theta0 + nu), r * Math.sin(theta0 + nu)];
}

/** The first launch day on or after `jd0` (within `span` days) when Mars is waiting at the far end. */
export function nextWindow(eph: Ephemeris, jd0: number, span = 800): number | null {
  let prev = hohmann(eph, jd0).missDeg;
  for (let d = 2; d <= span; d += 2) {
    const m = hohmann(eph, jd0 + d).missDeg;
    // The miss angle falls through zero as the Earth catches up; skip the wrap at ±180°.
    if (prev > 0 && m <= 0 && prev - m < 90) {
      let lo = jd0 + d - 2, hi = jd0 + d;
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (hohmann(eph, mid).missDeg > 0) lo = mid; else hi = mid;
      }
      return (lo + hi) / 2;
    }
    prev = m;
  }
  return null;
}

/**
 * The speed change needed to leave the Earth's orbit on a real trajectory to
 * Mars (Lambert's problem between the actual positions), km/s.
 */
export function departureDv(eph: Ephemeris, launch: number, days: number): number {
  const r1 = eph.earth(launch), r2 = eph.helio('mars', launch + days);
  // Solve in ecliptic coordinates, where prograde means counter-clockwise from ecliptic north.
  const ecl = (v: Vec3): Vec3 => [v[0], cosE * v[1] + sinE * v[2], -sinE * v[1] + cosE * v[2]];
  const sol = lambert(ecl(r1), ecl(r2), days);
  if (!sol) return Infinity;
  const ve = ecl(eph.earthVelocity(launch));
  const AU_PER_DAY_KMS = 149597870.7 / 86400;
  return Math.hypot(sol.v1[0] - ve[0], sol.v1[1] - ve[1], sol.v1[2] - ve[2]) * AU_PER_DAY_KMS;
}
