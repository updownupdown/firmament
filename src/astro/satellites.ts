// Moons beyond Jupiter's four: Mars's two, Jupiter's Amalthea, Thebe, Himalia and
// Elara, Saturn's eight classical moons plus Janus, Epimetheus and Phoebe, Uranus's
// five plus Puck, Triton, Proteus and Nereid, and Charon, Nix and Hydra. Each follows mean orbital elements in its
// planet's equatorial plane (node measured from where that plane crosses the
// J2000 equator), with the node and pericentre turning steadily and, for the
// moons locked in resonances, one swing of the mean longitude.
//
// The Mars, Saturn and Uranus elements were fitted to PyEphem 4.2 (its BDL
// tables for 2000–2038, as published by the Bureau des Longitudes, for Mars and
// Uranus; TASS-like theory for Saturn) by least squares over those years; the
// fit's RMS error is noted per moon. Triton's come from Jacobson (2009) by way
// of Stellarium's ssystem_major.ini, and Charon's from Brozović et al. (2015). The
// rest were fitted to JPL Horizons state vectors (scripts/fit_horizons.py) and
// checked against Horizons positions for 2025–26 (satellites.test.ts).
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
  /**
   * For Pluto's small moons, which circle the Pluto–Charon barycentre: Charon's share of the pair's
   * mass. The elements are about the barycentre; Pluto's own wobble around it is added back.
   */
  bary?: number;
  /**
   * Janus and Epimetheus trade orbits every four years. [extra mean motion (degrees per day) the
   * moon has after a swap, the Julian date of that swap, days between swaps]: the motion alternates
   * between the fitted one and the fitted one plus this, switching at each swap.
   */
  swap?: [number, number, number];
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
  hyperion: { a: 1473823.6, e: 0.096038, i: 1.0490, node: 253.5460, nodeRate: -1.19650, peri: 36.1123, periRate: 3.14889, L: 289.84626, n: 16.91986806, lib: [-9.1410, 0.5621346, 282.630] }, // RMS 15.97% of a; e, ϖ, L and n then tuned to Horizons for 2025–26 (4″ RMS)
  iapetus: { a: 3561440.4, e: 0.028475, i: 15.7504, node: 253.7342, nodeRate: -0.01832, peri: 241.2306, periRate: 0.09385, L: 89.91483, n: 4.53795871 }, // RMS 0.22% of a
  miranda: { a: 129207.8, e: 0.000872, i: 179.3765, node: 350.4946, nodeRate: -3.15866, peri: 97.1008, periRate: 2.28155, L: 129.78771, n: 254.67339939 }, // RMS 5.94% of a
  ariel: { a: 190778.2, e: 0.000050, i: 179.9474, node: 318.3650, nodeRate: 0.00159, peri: 55.9722, periRate: -0.24730, L: 299.84271, n: 142.83566095 }, // RMS 0.73% of a
  umbriel: { a: 265799.3, e: 0.000214, i: 179.9199, node: 253.0250, nodeRate: 0.00227, peri: 39.4967, periRate: -48.77914, L: 217.40091, n: 86.86889766 }, // RMS 0.86% of a
  titania: { a: 435910.0, e: 0.000051, i: 179.9490, node: 10.8995, nodeRate: -0.00530, peri: 176.0722, periRate: 0.04442, L: 123.40628, n: 41.35140202 }, // RMS 0.51% of a
  oberon: { a: 583088.2, e: 0.000056, i: 179.8102, node: 321.1723, nodeRate: 0.54505, peri: 12.2736, periRate: -97.50319, L: 94.96024, n: 26.74246694 }, // RMS 0.41% of a
  triton: { a: 354764.97, e: 0.000022, i: 156.8142, node: 182.2457, nodeRate: 0.523, peri: 287.0336, periRate: 0, L: 251.42431, n: 61.25524825 },
  charon: { a: 19596, e: 0.00005, i: 0, node: 0, nodeRate: 0, peri: 189.9, periRate: 0, L: 304.18136, n: 56.36272545 },
  // Fitted to JPL Horizons state vectors (2025 Jan–Mar; 2020–2030 for the far irregular moons) with
  // scripts/fit_horizons.py.
  amalthea: { a: 181365.6, e: 0.003314, i: 0.3746, node: 348.3903, nodeRate: -917.50805, peri: 113.9229, periRate: 917.59158, L: 53.57595, n: 722.63172150 }, // Horizons fit, RMS 0.00% of a
  thebe: { a: 221888.1, e: 0.017604, i: 1.0683, node: 323.7600, nodeRate: -450.90242, peri: 7.4259, periRate: 452.36280, L: 189.09990, n: 533.70027089 }, // Horizons fit, RMS 0.01% of a
  himalia: { a: 11449101.0, e: 0.149680, i: 28.1156, node: 75.0283, nodeRate: -1.30461, peri: 49.6266, periRate: 1.19267, L: 105.65506, n: 1.43665575 }, // Horizons fit, RMS 3.33% of a
  elara: { a: 11718127.2, e: 0.201566, i: 30.1439, node: 122.0227, nodeRate: -1.29359, peri: 257.6583, periRate: 1.83351, L: 230.75578, n: 1.38650649 }, // Horizons fit, RMS 4.17% of a
  janus: { a: 151440.8, e: 0.006851, i: 0.1634, node: 324.9983, nodeRate: -753.88607, peri: 212.8436, periRate: 748.32324, L: 162.21383, n: 518.34677410, swap: [-0.11, 2461062, 1461] }, // Horizons fit, RMS 0.00% of a
  epimetheus: { a: 151489.9, e: 0.009587, i: 0.3523, node: 213.8607, nodeRate: -747.94700, peri: 272.7289, periRate: 750.34128, L: 43.73914, n: 518.09426201, swap: [0.39, 2461062, 1461] }, // Horizons fit, RMS 0.01% of a
  phoebe: { a: 12945049.9, e: 0.168639, i: 152.4720, node: 54.1797, nodeRate: 0.03872, peri: 359.7998, periRate: -0.76359, L: 23.88079, n: 0.65458814 }, // Horizons fit, RMS 1.08% of a
  puck: { a: 86006.5, e: 0.009034, i: 178.9508, node: 80.5445, nodeRate: 93.13365, peri: 267.1039, periRate: 279.15492, L: 251.17061, n: 473.05418419 }, // Horizons fit, RMS 0.00% of a
  proteus: { a: 117647.0, e: 0.000488, i: 1.0751, node: 16.2045, nodeRate: -0.21650, peri: 34.3604, periRate: 27.45504, L: 274.13764, n: 320.76563172 }, // Horizons fit, RMS 0.00% of a
  nereid: { a: 5513866.8, e: 0.745608, i: 28.4275, node: 215.2538, nodeRate: -0.00344, peri: 233.2533, periRate: -0.02387, L: 88.70424, n: 0.99973446 }, // Horizons fit, RMS 0.10% of a
  nix: { a: 48691.2, e: 0.002008, i: 0.0951, node: 287.3504, nodeRate: -11.46969, peri: 100.3468, periRate: 71.10695, L: 89.01812, n: 14.48450667, bary: 0.10861 }, // Horizons fit, RMS 0.23% of a
  hydra: { a: 64721.7, e: 0.005573, i: 0.1955, node: 41.7002, nodeRate: -37.26656, peri: 30.5191, periRate: 20.37276, L: 231.14776, n: 9.42378298, bary: 0.10861 }, // Horizons fit, RMS 0.11% of a
};
// ELEMENTS-END

const m = (id: string, name: string, parent: MoonParent, radiusKm: number, color: [number, number, number], mag0: number, period: number): MoonInfo =>
  ({ id, name, parent, radiusKm, color, mag0, period, elements: E[id] });

/** Every moon besides our own, in order out from the Sun and then from the planet. */
export const MOONS: MoonInfo[] = [
  m('phobos', 'Phobos', 'mars', 11.1, [0.55, 0.5, 0.46], 11.4, 0.31891),
  m('deimos', 'Deimos', 'mars', 6.2, [0.6, 0.55, 0.5], 12.45, 1.26244),
  m('amalthea', 'Amalthea', 'jupiter', 83.5, [0.75, 0.45, 0.35], 14.1, 0.498179),
  m('thebe', 'Thebe', 'jupiter', 49.3, [0.6, 0.5, 0.45], 16.0, 0.674536),
  ...GALILEAN.map((g, k) => ({
    id: g.id, name: g.name, parent: 'jupiter' as const, radiusKm: g.radiusKm, color: g.color,
    mag0: [5.02, 5.29, 4.61, 5.65][k], period: [1.769138, 3.551181, 7.154553, 16.689018][k],
  })),
  m('himalia', 'Himalia', 'jupiter', 85, [0.6, 0.58, 0.55], 14.6, 250.56),
  m('elara', 'Elara', 'jupiter', 43, [0.6, 0.58, 0.55], 16.3, 259.64),
  m('epimetheus', 'Epimetheus', 'saturn', 58.1, [0.8, 0.78, 0.75], 15.6, 0.694333),
  m('janus', 'Janus', 'saturn', 89.5, [0.8, 0.78, 0.75], 14.4, 0.694660),
  m('mimas', 'Mimas', 'saturn', 198.2, [0.8, 0.8, 0.78], 12.9, 0.942422),
  m('enceladus', 'Enceladus', 'saturn', 252.1, [0.97, 0.98, 1], 11.7, 1.370218),
  m('tethys', 'Tethys', 'saturn', 531.1, [0.9, 0.9, 0.88], 10.2, 1.887802),
  m('dione', 'Dione', 'saturn', 561.4, [0.85, 0.84, 0.82], 10.4, 2.736915),
  m('rhea', 'Rhea', 'saturn', 763.8, [0.82, 0.8, 0.78], 9.7, 4.5175),
  m('titan', 'Titan', 'saturn', 2574.7, [0.92, 0.7, 0.38], 8.3, 15.945421),
  m('hyperion', 'Hyperion', 'saturn', 135, [0.75, 0.68, 0.6], 14.2, 21.276609),
  m('iapetus', 'Iapetus', 'saturn', 734.5, [0.6, 0.56, 0.5], 11.1, 79.330183),
  m('phoebe', 'Phoebe', 'saturn', 106.5, [0.4, 0.38, 0.36], 16.4, 550.31),
  m('puck', 'Puck', 'uranus', 81, [0.5, 0.5, 0.5], 19.7, 0.761833),
  m('miranda', 'Miranda', 'uranus', 235.8, [0.75, 0.75, 0.75], 16.5, 1.413479),
  m('ariel', 'Ariel', 'uranus', 578.9, [0.8, 0.8, 0.8], 14.4, 2.520379),
  m('umbriel', 'Umbriel', 'uranus', 584.7, [0.55, 0.55, 0.55], 15.1, 4.144177),
  m('titania', 'Titania', 'uranus', 788.9, [0.72, 0.7, 0.68], 13.9, 8.705872),
  m('oberon', 'Oberon', 'uranus', 761.4, [0.7, 0.66, 0.64], 14.1, 13.463239),
  m('proteus', 'Proteus', 'neptune', 210, [0.45, 0.45, 0.45], 19.7, 1.122315),
  m('triton', 'Triton', 'neptune', 1353.4, [0.92, 0.86, 0.84], 13.5, 5.876854),
  m('nereid', 'Nereid', 'neptune', 170, [0.6, 0.6, 0.6], 19.2, 360.13),
  m('charon', 'Charon', 'pluto', 606, [0.68, 0.66, 0.64], 16.8, 6.387221),
  m('nix', 'Nix', 'pluto', 24, [0.85, 0.85, 0.85], 23.4, 24.8546),
  m('hydra', 'Hydra', 'pluto', 25, [0.85, 0.85, 0.85], 23.0, 38.2018),
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
  if (el.swap) {
    const [dn, at, P] = el.swap;
    const x = jdTT - at, m = ((x % (2 * P)) + 2 * P) % (2 * P);
    L += dn * DEG * (P * Math.floor(x / (2 * P)) + Math.min(m, P));
  }
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
  const v: Vec3 = [
    bx[0] * X + by[0] * Y + bz[0] * Z,
    bx[1] * X + by[1] * Y + bz[1] * Z,
    bx[2] * X + by[2] * Y + bz[2] * Z,
  ];
  if (el.bary) {
    // From the barycentre to Pluto is -bary × (Pluto to Charon), so add that back.
    const c = moonOffset(MOONS.find((x) => x.id === 'charon')!, jdTT);
    for (let k = 0; k < 3; k++) v[k] += el.bary * c[k];
  }
  return v;
}
