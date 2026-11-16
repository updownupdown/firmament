// Jupiter's four Galilean moons (Meeus ch. 44, low-precision method).
// Positions are returned in Jupiter radii, in the J2000 equatorial frame,
// relative to Jupiter's centre, so they can be drawn in either view.

import { DEG, type Vec3, add, cross, dot, fromSpherical, normalize, scale, sub } from './math.ts';
import { BODIES } from './bodies.ts';

export const GALILEAN = [
  { id: 'io', name: 'Io', radiusKm: 1821.6, color: [0.95, 0.85, 0.45] as [number, number, number] },
  { id: 'europa', name: 'Europa', radiusKm: 1560.8, color: [0.9, 0.85, 0.75] as [number, number, number] },
  { id: 'ganymede', name: 'Ganymede', radiusKm: 2634.1, color: [0.7, 0.65, 0.6] as [number, number, number] },
  { id: 'callisto', name: 'Callisto', radiusKm: 2410.3, color: [0.5, 0.45, 0.42] as [number, number, number] },
];

const JUPITER_POLE = fromSpherical(BODIES.jupiter.poleRa, BODIES.jupiter.poleDec);

/**
 * Positions of Io, Europa, Ganymede and Callisto relative to Jupiter, in Jupiter
 * equatorial radii, J2000 frame. `jupiterToEarth` is the direction from Jupiter to
 * the observer (J2000), used to set where each moon's angle is measured from.
 */
export function galileanMoons(jdTT: number, jupiterToEarth: Vec3, distanceAU: number): Vec3[] {
  const d = jdTT - 2451545.0;
  const V = (172.74 + 0.00111588 * d) * DEG;
  const M = (357.529 + 0.9856003 * d) * DEG;
  const N = (20.02 + 0.0830853 * d + 0.329 * Math.sin(V)) * DEG;
  const J = (66.115 + 0.9025179 * d - 0.329 * Math.sin(V)) * DEG;
  const A = (1.915 * Math.sin(M) + 0.02 * Math.sin(2 * M)) * DEG;
  const B = (5.555 * Math.sin(N) + 0.168 * Math.sin(2 * N)) * DEG;
  const K = J + A - B;
  const R = 1.00014 - 0.01671 * Math.cos(M) - 0.00014 * Math.cos(2 * M);
  const r = 5.20872 - 0.25208 * Math.cos(N) - 0.00611 * Math.cos(2 * N);
  const delta = Math.sqrt(r * r + R * R - 2 * r * R * Math.cos(K));
  const psi = Math.asin((R / delta) * Math.sin(K));
  const t = d - distanceAU / 173;
  const base = psi - B;
  let u1 = 163.8069 * DEG + 203.4058646 * DEG * t + base;
  let u2 = 358.414 * DEG + 101.2916335 * DEG * t + base;
  let u3 = 5.7176 * DEG + 50.234518 * DEG * t + base;
  let u4 = 224.8092 * DEG + 21.48798 * DEG * t + base;
  const G = (331.18 + 50.310482 * t) * DEG;
  const H = (87.45 + 21.569231 * t) * DEG;
  const c1 = 0.473 * DEG * Math.sin(2 * (u1 - u2));
  const c2 = 1.065 * DEG * Math.sin(2 * (u2 - u3));
  const c3 = 0.165 * DEG * Math.sin(G);
  const c4 = 0.843 * DEG * Math.sin(H);
  u1 += c1; u2 += c2; u3 += c3; u4 += c4;
  const r1 = 5.9057 - 0.0244 * Math.cos(2 * (u1 - u2));
  const r2 = 9.3966 - 0.0882 * Math.cos(2 * (u2 - u3));
  const r3 = 14.9883 - 0.0216 * Math.cos(G);
  const r4 = 26.3627 - 0.1939 * Math.cos(H);

  // In Jupiter's equatorial plane: e points toward the observer, w is the in-plane
  // direction that appears west on the sky. u = 0 is inferior conjunction (in front).
  const toEarth = normalize(jupiterToEarth);
  const e = normalize(sub(toEarth, scale(JUPITER_POLE, dot(toEarth, JUPITER_POLE))));
  let w = cross(JUPITER_POLE, e);
  // West on the sky, seen from Earth looking at Jupiter, is away from increasing RA.
  const look = scale(toEarth, -1);
  const east = normalize(cross([0, 0, 1], look));
  if (dot(w, east) > 0) w = scale(w, -1);
  const place = (u: number, rr: number): Vec3 => add(scale(e, rr * Math.cos(u)), scale(w, rr * Math.sin(u)));
  return [place(u1, r1), place(u2, r2), place(u3, r3), place(u4, r4)];
}
