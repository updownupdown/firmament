// A gravity assist at Jupiter in Space view, as a patched conic: the
// spacecraft flies a Lambert transfer from the Earth to Jupiter's real
// position, swings past Jupiter on a hyperbola (an instant turn of its
// velocity relative to Jupiter, by an angle set by how close it passes), and
// carries on around the Sun from there. No DOM.

import type { Ephemeris } from '../astro/ephemeris.ts';
import { EPS_J2000 } from '../astro/frames.ts';
import { GM_SUN, type State, propagate } from '../astro/kepler.ts';
import { AU_KM, type Vec3, add, cross, dot, normalize, scale } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { JUPITER } from './flyby.ts';
import { type Trip, tripPosition } from './trip.ts';

const cosE = Math.cos(EPS_J2000), sinE = Math.sin(EPS_J2000);
const toEcl = (v: Vec3): Vec3 => [v[0], cosE * v[1] + sinE * v[2], -sinE * v[1] + cosE * v[2]];
const toEq = (v: Vec3): Vec3 => [v[0], cosE * v[1] - sinE * v[2], sinE * v[1] + cosE * v[2]];
const KMS = AU_KM / 86400;
const len = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Voyager 2: launched 20 August 1977, closest to Jupiter on 9 July 1979 at about 10 Jupiter radii, on the trailing side. */
export const VOYAGER2 = { launch: jdFromCalendar(1977, 8, 20, 14, 29), flyby: jdFromCalendar(1979, 7, 9, 22, 29), radii: 10.1 };

export interface Slingshot {
  approach: Trip;
  /** Closest approach, Jupiter radii. */
  radii: number;
  behind: boolean;
  /** Heliocentric speed just before and just after, km/s. */
  before: number;
  after: number;
  /** Speed needed to escape the Sun from where the flyby happens, km/s. */
  escape: number;
  escapes: boolean;
  /** How far Jupiter turns the path, radians. */
  turn: number;
  /** Just after the flyby, heliocentric ecliptic J2000 (AU, AU/day). */
  out: State;
}

/** Rotate v about a unit axis k by angle a (Rodrigues). */
function rotate(v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  const kxv = cross(k, v), kv = dot(k, v);
  return [0, 1, 2].map((i) => v[i] * c + kxv[i] * s + k[i] * kv * (1 - c)) as Vec3;
}

export function slingshot(eph: Ephemeris, approach: Trip, radii: number, behind: boolean): Slingshot {
  const at = approach.arrive;
  const r = toEcl(eph.helio('jupiter', at));
  const vJ = toEcl(eph.vsop.velocity('jupiter', at));
  // The spacecraft's velocity arriving: the end of the transfer.
  const end = propagate(approach.start, approach.days);
  const vInf = [end.v[0] - vJ[0], end.v[1] - vJ[1], end.v[2] - vJ[2]] as Vec3;
  const vinfKms = len(vInf) * KMS;
  const e = 1 + (radii * JUPITER.radius * vinfKms * vinfKms) / JUPITER.mu;
  const turn = 2 * Math.asin(1 / e);
  // Turn in the plane nearest the ecliptic: about the axis closest to ecliptic north that is square to v∞.
  const u = normalize(vInf);
  const k = normalize(add([0, 0, 1], scale(u, -u[2])));
  const outs = [1, -1].map((sense) => add(vJ, rotate(vInf, k, sense * turn)));
  // Passing behind Jupiter is the side that speeds the spacecraft up.
  const [fast, slow] = len(outs[0]) >= len(outs[1]) ? [outs[0], outs[1]] : [outs[1], outs[0]];
  const v = behind ? fast : slow;
  const rAU = len(r);
  const escape = Math.sqrt((2 * GM_SUN) / rAU) * KMS;
  const after = len(v) * KMS;
  return {
    approach, radii, behind, before: len(end.v) * KMS, after, escape, escapes: after > escape, turn, out: { r, v },
  };
}

/** Where the spacecraft is at `jd`: on the transfer before the flyby, on its new path after. J2000 equatorial AU. */
export function slingshotPosition(s: Slingshot, jd: number): Vec3 {
  if (jd <= s.approach.arrive) return tripPosition(s.approach, jd);
  return toEq(propagate(s.out, jd - s.approach.arrive).r);
}

/** The path after the flyby, for `days` or until `maxAU` from the Sun. J2000 equatorial AU. */
export function slingshotPath(s: Slingshot, days: number, maxAU = 14, n = 160): Vec3[] {
  const out: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const p = propagate(s.out, (days * i) / (n - 1)).r;
    out.push(toEq(p));
    if (len(p) > maxAU) break;
  }
  return out;
}
