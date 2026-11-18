// The trip planner: transfers from the Earth to another planet worked out with
// Lambert's problem between the planets' real positions, and the porkchop plot
// of their cost against launch date and flight time. No DOM.

import type { Ephemeris } from '../astro/ephemeris.ts';
import { EPS_J2000 } from '../astro/frames.ts';
import { type State, lambert, propagate } from '../astro/kepler.ts';
import { AU_KM, type Vec3 } from '../astro/math.ts';
import type { PlanetName } from '../astro/vsop87.ts';

export type TripTarget = 'venus' | 'mars' | 'jupiter';

export interface TargetInfo {
  name: string;
  /** Flight times the porkchop spans, days. */
  tof: [number, number];
  /** Launch dates the porkchop spans around a window, days either side. */
  span: number;
  /** Days between windows, roughly (the synodic period). */
  synodic: number;
}

export const TRIP_TARGETS: Record<TripTarget, TargetInfo> = {
  venus: { name: 'Venus', tof: [80, 220], span: 70, synodic: 584 },
  mars: { name: 'Mars', tof: [120, 400], span: 100, synodic: 780 },
  jupiter: { name: 'Jupiter', tof: [450, 1300], span: 90, synodic: 399 },
};

const cosE = Math.cos(EPS_J2000), sinE = Math.sin(EPS_J2000);
const toEcl = (v: Vec3): Vec3 => [v[0], cosE * v[1] + sinE * v[2], -sinE * v[1] + cosE * v[2]];
const toEq = (v: Vec3): Vec3 => [v[0], cosE * v[1] - sinE * v[2], sinE * v[1] + cosE * v[2]];
const KMS = AU_KM / 86400;
const len = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export interface Trip {
  target: TripTarget;
  /** Launch and arrival, TT Julian dates. */
  launch: number;
  arrive: number;
  days: number;
  /** Speed beyond the Earth's pull on leaving, and beyond the target's on arriving, km/s. */
  depart: number;
  arrival: number;
  /** depart + arrival: what the porkchop plots. */
  total: number;
  /** The spacecraft just after leaving, heliocentric ecliptic J2000 (AU, AU/day). */
  start: State;
}

/** The transfer that leaves the Earth at `launch` and reaches the target `days` later, or null. */
export function trip(eph: Ephemeris, target: TripTarget, launch: number, days: number): Trip | null {
  const arrive = launch + days;
  const r1 = toEcl(eph.earth(launch)), r2 = toEcl(eph.helio(target, arrive));
  const sol = lambert(r1, r2, days);
  if (!sol) return null;
  const ve = toEcl(eph.earthVelocity(launch));
  const vt = toEcl(eph.vsop.velocity(target as PlanetName, arrive));
  const depart = len(sol.v1, ve) * KMS, arrival = len(sol.v2, vt) * KMS;
  if (!Number.isFinite(depart) || !Number.isFinite(arrival)) return null;
  return { target, launch, arrive, days, depart, arrival, total: depart + arrival, start: { r: r1, v: sol.v1 } };
}

/** Where the spacecraft is at `jd` (clamped to the trip), heliocentric J2000 equatorial AU. */
export function tripPosition(t: Trip, jd: number): Vec3 {
  const dt = Math.min(Math.max(jd, t.launch), t.arrive) - t.launch;
  return toEq(propagate(t.start, dt).r);
}

/** The whole path, `n` points from launch to arrival, J2000 equatorial AU. */
export function tripPath(t: Trip, n = 120): Vec3[] {
  return Array.from({ length: n }, (_, i) => toEq(propagate(t.start, (t.days * i) / (n - 1)).r));
}

export interface Porkchop {
  target: TripTarget;
  launch0: number;
  launch1: number;
  tof0: number;
  tof1: number;
  nx: number;
  ny: number;
  /** total km/s by cell, row y (flight time) then column x (launch date); Infinity where there is no solution. */
  cost: Float64Array;
  best: Trip;
}

/** Launch date and flight time at the centre of a cell. */
export function cellAt(p: Porkchop, x: number, y: number): { launch: number; days: number } {
  return {
    launch: p.launch0 + ((x + 0.5) / p.nx) * (p.launch1 - p.launch0),
    days: p.tof0 + ((y + 0.5) / p.ny) * (p.tof1 - p.tof0),
  };
}

export function porkchop(eph: Ephemeris, target: TripTarget, launch0: number, launch1: number, nx = 44, ny = 36): Porkchop {
  const [tof0, tof1] = TRIP_TARGETS[target].tof;
  const cost = new Float64Array(nx * ny).fill(Infinity);
  let best: Trip | null = null;
  const p = { target, launch0, launch1, tof0, tof1, nx, ny, cost } as Omit<Porkchop, 'best'>;
  for (let y = 0; y < ny; y++) {
    for (let x = 0; x < nx; x++) {
      const c = cellAt(p as Porkchop, x, y);
      const t = trip(eph, target, c.launch, c.days);
      if (!t) continue;
      cost[y * nx + x] = t.total;
      if (!best || t.total < best.total) best = t;
    }
  }
  return { ...p, best: refine(eph, best!) };
}

/** Polish a trip by walking launch date and flight time downhill. */
export function refine(eph: Ephemeris, t: Trip): Trip {
  let best = t;
  for (const step of [8, 4, 2, 1, 0.5]) {
    let moved = true;
    while (moved) {
      moved = false;
      for (const [dl, dd] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
        const c = trip(eph, t.target, best.launch + dl, best.days + dd);
        if (c && c.total < best.total) { best = c; moved = true; }
      }
    }
  }
  return best;
}

/**
 * The cheapest launch dates between `from` and `to`, one per window: the
 * low points of the cheapest trip by launch date, scanned every few days.
 */
export function launchWindows(eph: Ephemeris, target: TripTarget, from: number, to: number): Trip[] {
  const info = TRIP_TARGETS[target];
  const step = 8;
  const cheapest = (launch: number) => {
    let b: Trip | null = null;
    for (let d = info.tof[0]; d <= info.tof[1]; d += (info.tof[1] - info.tof[0]) / 10) {
      const t = trip(eph, target, launch, d);
      if (t && (!b || t.total < b.total)) b = t;
    }
    return b;
  };
  const scan: (Trip | null)[] = [];
  for (let jd = from - step; jd <= to + step; jd += step) scan.push(cheapest(jd));
  const dips: Trip[] = [];
  for (let i = 1; i < scan.length - 1; i++) {
    const a = scan[i - 1], b = scan[i], c = scan[i + 1];
    if (a && b && c && b.total <= a.total && b.total <= c.total) dips.push(refine(eph, b));
  }
  // Cheapest first, so a window's true low point wins over small wiggles beside it.
  const out: Trip[] = [];
  for (const d of dips.sort((x, y) => x.total - y.total)) {
    if (d.launch >= from && d.launch <= to && !out.some((o) => Math.abs(o.launch - d.launch) < info.synodic / 2)) out.push(d);
  }
  return out.sort((x, y) => x.launch - y.launch);
}
