// Moons beyond Jupiter's four: Mars's two, Saturn's eight classical moons,
// Uranus's five, Triton and Charon. Each follows mean orbital elements in its
// planet's equatorial plane (node measured from where that plane crosses the
// J2000 equator), with the node and pericentre turning steadily and, for the
// moons locked in resonances, one swing of the mean longitude.
//
// The Mars, Saturn and Uranus elements were fitted to PyEphem 4.2 (its BDL
// tables for 2000–2038, as published by the Bureau des Longitudes, for Mars and
// Uranus; TASS-like theory for Saturn) by least squares over those years; the
// fit's RMS error is noted per moon. Triton's come from Jacobson (2009) by way
// of Stellarium's ssystem_major.ini, and Charon's from Brozović et al. (2015).
// Accuracy: within about a hundredth of an orbit for 2000–2040, drifting slowly
// outside; good for drawing, not for timing an occultation.

import { DEG, type Vec3, fromSpherical } from './math.ts';
import { BODIES } from './bodies.ts';
import { GALILEAN } from './galilean.ts';

export type MoonParent = 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune' | 'pluto';

export interface MoonElements {
  /** Semi-major axis, km. */
  a: number;
  e: number;
  /** Inclination to the parent's equator, degrees. */
  i: number;
  /** Ascending node and longitude of pericentre at J2000 (degrees) and their rates (degrees per year). */
  node: number; nodeRate: number;
  peri: number; periRate: number;
  /** Mean longitude at J2000 (degrees) and mean motion (degrees per day). */
  L: number; n: number;
  /** Secular acceleration of the mean longitude, degrees per day squared (Phobos spirals in). */
  q?: number;
  /** A libration of the mean longitude: amplitude (degrees), rate (degrees per day), phase at J2000 (degrees). */
  lib?: [number, number, number];
}

export interface MoonInfo {
  id: string;
  name: string;
  parent: MoonParent;
  radiusKm: number;
  color: [number, number, number];
  /** Mean magnitude at the parent's mean opposition. */
  mag0: number;
  /** Sidereal period, days. */
  period: number;
  /** Absent for the Galilean moons, which have their own theory. */
  elements?: MoonElements;
}

// ELEMENTS-BEGIN (fitted as described above with scripts/fit_moons.py; semi-major axes scaled to
// JPL's mean values, since PyEphem gives offsets in its own planet radii)
const E: Record<string, MoonElements> = {
  phobos: { a: 9378.8, e: 0.008639, i: 1.5736, node: 10.0675, nodeRate: -0.08993, peri: 276.8758, periRate: -1.53649, L: 215.49037, n: 1128.84476793, q: 8.5757e-09 }, // RMS 3.06% of a
  deimos: { a: 23465.9, e: 0.009152, i: 2.0265, node: 6.8074, nodeRate: -3.49520, peri: 142.9271, periRate: -0.06933, L: 258.80855, n: 285.16195106 }, // RMS 1.82% of a
  mimas: { a: 185487.1, e: 0.000145, i: 0.0222, node: 41.8403, nodeRate: 0.25347, peri: 253.8007, periRate: -9.00400, L: 166.46093, n: 381.99747873, lib: [-57.2942, 0.0129204, 336.847] }, // RMS 3.63% of a
  enceladus: { a: 238158.2, e: 0.000118, i: 0.0156, node: 42.3583, nodeRate: -2.64379, peri: 249.1190, periRate: 5.24522, L: 182.38283, n: 262.73186563, lib: [0.2021, 0.2549302, 309.597] }, // RMS 0.83% of a
  tethys: { a: 294863.0, e: 0.000022, i: 0.0371, node: 192.0529, nodeRate: 7.79732, peri: 234.0277, periRate: -3.56004, L: 188.19942, n: 190.69795539, lib: [1.9163, 0.0141992, 322.519] }, // RMS 1.36% of a
  dione: { a: 377599.1, e: 0.000299, i: 0.0157, node: 37.5147, nodeRate: -3.16260, peri: 313.5643, periRate: 7.27730, L: 176.90855, n: 131.53493562 }, // RMS 0.37% of a
  rhea: { a: 527298.5, e: 0.000036, i: 0.0327, node: 265.5182, nodeRate: 22.60941, peri: 58.8409, periRate: 73.31285, L: 52.17380, n: 79.69004802 }, // RMS 0.45% of a
  titan: { a: 1221870.0, e: 0.028722, i: 0.4020, node: 244.5225, nodeRate: 0.26262, peri: 203.9685, periRate: 0.51803, L: 7.58417, n: 22.57697728 }, // RMS 0.08% of a
  hyperion: { a: 1473823.6, e: 0.031594, i: 1.0490, node: 253.5460, nodeRate: -1.19650, peri: 162.7790, periRate: 3.14889, L: 289.17959, n: 16.91989028, lib: [-9.1410, 0.5621346, 282.630] }, // RMS 15.97% of a
  iapetus: { a: 3561440.4, e: 0.028475, i: 15.7504, node: 253.7342, nodeRate: -0.01832, peri: 241.2306, periRate: 0.09385, L: 89.91483, n: 4.53795871 }, // RMS 0.22% of a
  miranda: { a: 129207.8, e: 0.000872, i: 179.3765, node: 350.4946, nodeRate: -3.15866, peri: 97.1008, periRate: 2.28155, L: 129.78771, n: 254.67339939 }, // RMS 5.94% of a
  ariel: { a: 190778.2, e: 0.000050, i: 179.9474, node: 318.3650, nodeRate: 0.00159, peri: 55.9722, periRate: -0.24730, L: 299.84271, n: 142.83566095 }, // RMS 0.73% of a
  umbriel: { a: 265799.3, e: 0.000214, i: 179.9199, node: 253.0250, nodeRate: 0.00227, peri: 39.4967, periRate: -48.77914, L: 217.40091, n: 86.86889766 }, // RMS 0.86% of a
  titania: { a: 435910.0, e: 0.000051, i: 179.9490, node: 10.8995, nodeRate: -0.00530, peri: 176.0722, periRate: 0.04442, L: 123.40628, n: 41.35140202 }, // RMS 0.51% of a
  oberon: { a: 583088.2, e: 0.000056, i: 179.8102, node: 321.1723, nodeRate: 0.54505, peri: 12.2736, periRate: -97.50319, L: 94.96024, n: 26.74246694 }, // RMS 0.41% of a
  triton: { a: 354764.97, e: 0.000022, i: 156.8142, node: 182.2457, nodeRate: 0.523, peri: 287.0336, periRate: 0, L: 251.42431, n: 61.25524825 },
  charon: { a: 19596, e: 0.00005, i: 0, node: 0, nodeRate: 0, peri: 189.9, periRate: 0, L: 304.18136, n: 56.36272545 },
};
// ELEMENTS-END

const m = (id: string, name: string, parent: MoonParent, radiusKm: number, color: [number, number, number], mag0: number, period: number): MoonInfo =>
  ({ id, name, parent, radiusKm, color, mag0, period, elements: E[id] });

/** Every moon besides our own, in order out from the Sun and then from the planet. */
export const MOONS: MoonInfo[] = [
  m('phobos', 'Phobos', 'mars', 11.1, [0.55, 0.5, 0.46], 11.4, 0.31891),
  m('deimos', 'Deimos', 'mars', 6.2, [0.6, 0.55, 0.5], 12.45, 1.26244),
  ...GALILEAN.map((g, k) => ({
    id: g.id, name: g.name, parent: 'jupiter' as const, radiusKm: g.radiusKm, color: g.color,
    mag0: [5.02, 5.29, 4.61, 5.65][k], period: [1.769138, 3.551181, 7.154553, 16.689018][k],
  })),
  m('mimas', 'Mimas', 'saturn', 198.2, [0.8, 0.8, 0.78], 12.9, 0.942422),
  m('enceladus', 'Enceladus', 'saturn', 252.1, [0.97, 0.98, 1], 11.7, 1.370218),
  m('tethys', 'Tethys', 'saturn', 531.1, [0.9, 0.9, 0.88], 10.2, 1.887802),
  m('dione', 'Dione', 'saturn', 561.4, [0.85, 0.84, 0.82], 10.4, 2.736915),
  m('rhea', 'Rhea', 'saturn', 763.8, [0.82, 0.8, 0.78], 9.7, 4.5175),
  m('titan', 'Titan', 'saturn', 2574.7, [0.92, 0.7, 0.38], 8.3, 15.945421),
  m('hyperion', 'Hyperion', 'saturn', 135, [0.75, 0.68, 0.6], 14.2, 21.276609),
  m('iapetus', 'Iapetus', 'saturn', 734.5, [0.6, 0.56, 0.5], 11.1, 79.330183),
  m('miranda', 'Miranda', 'uranus', 235.8, [0.75, 0.75, 0.75], 16.5, 1.413479),
  m('ariel', 'Ariel', 'uranus', 578.9, [0.8, 0.8, 0.8], 14.4, 2.520379),
  m('umbriel', 'Umbriel', 'uranus', 584.7, [0.55, 0.55, 0.55], 15.1, 4.144177),
  m('titania', 'Titania', 'uranus', 788.9, [0.72, 0.7, 0.68], 13.9, 8.705872),
  m('oberon', 'Oberon', 'uranus', 761.4, [0.7, 0.66, 0.64], 14.1, 13.463239),
  m('triton', 'Triton', 'neptune', 1353.4, [0.92, 0.86, 0.84], 13.5, 5.876854),
  m('charon', 'Charon', 'pluto', 606, [0.68, 0.66, 0.64], 16.8, 6.387221),
];

/** Moons with mean elements (all but the Galilean four). */
export const ELEMENT_MOONS = MOONS.filter((x) => x.elements);

export const moonInfo = (id: string): MoonInfo | undefined => MOONS.find((x) => x.id === id);

/** Mean distances of the planets from the Sun and from us at opposition (AU), for moon magnitudes. */
export const OPPOSITION: Record<MoonParent, [number, number]> = {
  mars: [1.524, 0.524], jupiter: [5.2, 4.2], saturn: [9.54, 8.54], uranus: [19.19, 18.19], neptune: [30.07, 29.07], pluto: [39.5, 38.5],
};

/** A moon's magnitude at `r` AU from the Sun and `delta` AU from the observer. */
export function moonMagnitude(info: MoonInfo, r: number, delta: number): number {
  const [r0, d0] = OPPOSITION[info.parent];
  return info.mag0 + 5 * Math.log10((r * delta) / (r0 * d0));
}

const basisCache = new Map<MoonParent, [Vec3, Vec3, Vec3]>();
/** The parent's equator: x toward its ascending node on the J2000 equator, z its north pole. */
function equatorBasis(parent: MoonParent): [Vec3, Vec3, Vec3] {
  let b = basisCache.get(parent);
  if (!b) {
    const p = BODIES[parent];
    const z = fromSpherical(p.poleRa, p.poleDec);
    const xl = Math.hypot(z[0], z[1]);
    const x: Vec3 = [-z[1] / xl, z[0] / xl, 0];
    const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
    b = [x, y, z];
    basisCache.set(parent, b);
  }
  return b;
}

/** Position of a moon relative to its planet's centre, km, J2000 equatorial frame. */
export function moonOffset(info: MoonInfo, jdTT: number): Vec3 {
  const el = info.elements;
  if (!el) throw new Error(`${info.id} has no mean elements`);
  const t = jdTT - 2451545.0, yr = t / 365.25;
  const O = (el.node + el.nodeRate * yr) * DEG;
  const w = (el.peri + el.periRate * yr) * DEG;
  let L = (el.L + el.n * t + (el.q ?? 0) * t * t) * DEG;
  if (el.lib) L += el.lib[0] * DEG * Math.sin((el.lib[1] * t + el.lib[2]) * DEG);
  const M = L - w;
  let E = M;
  for (let k = 0; k < 6; k++) E -= (E - el.e * Math.sin(E) - M) / (1 - el.e * Math.cos(E));
  const xv = el.a * (Math.cos(E) - el.e), yv = el.a * Math.sqrt(1 - el.e * el.e) * Math.sin(E);
  const om = w - O, ci = Math.cos(el.i * DEG), si = Math.sin(el.i * DEG);
  const co = Math.cos(O), so = Math.sin(O), cw = Math.cos(om), sw = Math.sin(om);
  const X = (co * cw - so * sw * ci) * xv + (-co * sw - so * cw * ci) * yv;
  const Y = (so * cw + co * sw * ci) * xv + (-so * sw + co * cw * ci) * yv;
  const Z = sw * si * xv + cw * si * yv;
  const [bx, by, bz] = equatorBasis(info.parent);
  return [
    bx[0] * X + by[0] * Y + bz[0] * Z,
    bx[1] * X + by[1] * Y + bz[1] * Z,
    bx[2] * X + by[2] * Y + bz[2] * Z,
  ];
}
