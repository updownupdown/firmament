// Two-body orbits: Kepler's equation, orbital elements ↔ state vectors,
// universal-variable propagation and a Lambert solver for mission planning.

import {
  DEG, TAU, type Vec3, add, apply, cross, dot, norm, scale, sub, wrap2pi,
} from './math.ts';
import { ECL_TO_EQ_J2000 } from './frames.ts';
import { J2000 } from './time.ts';

/** Gaussian gravitational constant squared: GM☉ in AU³/day². */
export const GM_SUN = 0.01720209895 ** 2;

export interface Elements {
  /** Perihelion distance (AU); works for every eccentricity. */
  q: number;
  e: number;
  i: number; // radians, J2000 ecliptic
  node: number; // longitude of ascending node, radians
  peri: number; // argument of perihelion, radians
  /** Time of perihelion passage, JD (TT). */
  tp: number;
}

export interface State { r: Vec3; v: Vec3 }

/** Solve M = E − e sin E for the eccentric anomaly (elliptic orbits). */
export function solveKepler(M: number, e: number): number {
  M = wrap2pi(M);
  let E = e < 0.8 ? M : Math.PI;
  for (let k = 0; k < 50; k++) {
    const f = E - e * Math.sin(E) - M;
    const dE = f / (1 - e * Math.cos(E));
    E -= dE;
    if (Math.abs(dE) < 1e-14) break;
  }
  return E;
}

/** Solve M = e sinh H − H (hyperbolic orbits). */
export function solveKeplerHyperbolic(M: number, e: number): number {
  let H = Math.asinh(M / e);
  for (let k = 0; k < 60; k++) {
    const f = e * Math.sinh(H) - H - M;
    const dH = f / (e * Math.cosh(H) - 1);
    H -= dH;
    if (Math.abs(dH) < 1e-14) break;
  }
  return H;
}

/** Position and velocity in the orbital plane (x toward perihelion). */
function planeState(el: Elements, jdTT: number, mu: number): [number, number, number, number] {
  const { q, e } = el;
  const dt = jdTT - el.tp;
  if (e < 1 - 1e-9) {
    const a = q / (1 - e);
    const n = Math.sqrt(mu / (a * a * a));
    const E = solveKepler(n * dt, e);
    const cE = Math.cos(E), sE = Math.sin(E);
    const r = a * (1 - e * cE);
    const b = a * Math.sqrt(1 - e * e);
    return [a * (cE - e), b * sE, -Math.sqrt(mu * a) / r * sE, Math.sqrt(mu * a) / r * Math.sqrt(1 - e * e) * cE];
  }
  if (e > 1 + 1e-9) {
    const a = q / (e - 1);
    const n = Math.sqrt(mu / (a * a * a));
    const H = solveKeplerHyperbolic(n * dt, e);
    const cH = Math.cosh(H), sH = Math.sinh(H);
    const r = a * (e * cH - 1);
    const b = a * Math.sqrt(e * e - 1);
    return [a * (e - cH), b * sH, -Math.sqrt(mu * a) / r * sH, Math.sqrt(mu * a) / r * Math.sqrt(e * e - 1) * cH];
  }
  // Parabolic: Barker's equation.
  const W = 3 * Math.sqrt(mu / (2 * q * q * q)) * dt;
  const Y = Math.cbrt(W + Math.sqrt(W * W + 1));
  const s = Y - 1 / Y; // tan(ν/2)
  const r = q * (1 + s * s);
  const nu = 2 * Math.atan(s);
  const p = 2 * q;
  const vr = Math.sqrt(mu / p) * Math.sin(nu);
  const vt = Math.sqrt(mu / p) * (1 + Math.cos(nu));
  const c = Math.cos(nu), sn = Math.sin(nu);
  return [r * c, r * sn, vr * c - vt * sn, vr * sn + vt * c];
}

/** Heliocentric state in the J2000 ecliptic frame (AU, AU/day). */
export function stateFromElementsEcliptic(el: Elements, jdTT: number, mu = GM_SUN): State {
  const [x, y, vx, vy] = planeState(el, jdTT, mu);
  const cO = Math.cos(el.node), sO = Math.sin(el.node);
  const cw = Math.cos(el.peri), sw = Math.sin(el.peri);
  const ci = Math.cos(el.i), si = Math.sin(el.i);
  const P: Vec3 = [cO * cw - sO * sw * ci, sO * cw + cO * sw * ci, sw * si];
  const Q: Vec3 = [-cO * sw - sO * cw * ci, -sO * sw + cO * cw * ci, cw * si];
  return { r: add(scale(P, x), scale(Q, y)), v: add(scale(P, vx), scale(Q, vy)) };
}

/** Heliocentric state in the J2000 equatorial frame. */
export function stateFromElements(el: Elements, jdTT: number, mu = GM_SUN): State {
  const s = stateFromElementsEcliptic(el, jdTT, mu);
  return { r: apply(ECL_TO_EQ_J2000, s.r), v: apply(ECL_TO_EQ_J2000, s.v) };
}

/** Osculating elements from a state vector (in whatever frame the state is in). */
export function elementsFromState(s: State, jdTT: number, mu = GM_SUN): Elements & { a: number; period: number } {
  const { r, v } = s;
  const rn = norm(r);
  const h = cross(r, v);
  const hn = norm(h);
  const nvec: Vec3 = [-h[1], h[0], 0];
  const nn = norm(nvec);
  const ev = sub(scale(cross(v, h), 1 / mu), scale(r, 1 / rn));
  const e = norm(ev);
  const energy = dot(v, v) / 2 - mu / rn;
  const a = Math.abs(1 - e) > 1e-10 ? -mu / (2 * energy) : Infinity;
  const i = Math.acos(h[2] / hn);
  let node = nn > 1e-12 ? Math.acos(nvec[0] / nn) : 0;
  if (nvec[1] < 0) node = TAU - node;
  let peri = nn > 1e-12 && e > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, dot(nvec, ev) / (nn * e)))) : 0;
  if (ev[2] < 0) peri = TAU - peri;
  let nu = e > 1e-12 ? Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rn)))) : 0;
  if (dot(r, v) < 0) nu = TAU - nu;
  const q = (hn * hn / mu) / (1 + e);
  let tp: number;
  if (e < 1) {
    const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2));
    const M = E - e * Math.sin(E);
    tp = jdTT - M / Math.sqrt(mu / (a * a * a));
  } else if (e > 1) {
    const H = 2 * Math.atanh(Math.sqrt((e - 1) / (e + 1)) * Math.tan(nu / 2));
    const M = e * Math.sinh(H) - H;
    tp = jdTT - M / Math.sqrt(mu / (-a) ** 3);
  } else {
    const D = Math.tan(nu / 2);
    tp = jdTT - Math.sqrt(2 * q * q * q / mu) * (D + D * D * D / 3);
  }
  const period = e < 1 ? TAU * Math.sqrt(a * a * a / mu) : Infinity;
  return { q, e, i, node, peri: wrap2pi(peri), tp, a, period };
}

// ------------------------------------------------------------------ Stumpff + propagation

function stumpffC(z: number): number {
  if (z > 1e-6) return (1 - Math.cos(Math.sqrt(z))) / z;
  if (z < -1e-6) return (Math.cosh(Math.sqrt(-z)) - 1) / -z;
  return 1 / 2 - z / 24 + z * z / 720;
}

function stumpffS(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6 - z / 120 + z * z / 5040;
}

/** Propagate a two-body state by dt days with universal variables. */
export function propagate(s: State, dt: number, mu = GM_SUN): State {
  const r0 = norm(s.r);
  const vr0 = dot(s.r, s.v) / r0;
  const alpha = 2 / r0 - dot(s.v, s.v) / mu;
  const sq = Math.sqrt(mu);
  let chi = sq * Math.abs(alpha) * dt;
  if (!Number.isFinite(chi) || chi === 0) chi = sq * dt / r0;
  for (let k = 0; k < 100; k++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z), S = stumpffS(z);
    const F = r0 * vr0 / sq * chi * chi * C + (1 - alpha * r0) * chi * chi * chi * S + r0 * chi - sq * dt;
    const dF = r0 * vr0 / sq * chi * (1 - alpha * chi * chi * S) + (1 - alpha * r0) * chi * chi * C + r0;
    const d = F / dF;
    chi -= d;
    if (Math.abs(d) < 1e-12) break;
  }
  const z = alpha * chi * chi;
  const C = stumpffC(z), S = stumpffS(z);
  const f = 1 - chi * chi / r0 * C;
  const g = dt - chi * chi * chi / sq * S;
  const r = add(scale(s.r, f), scale(s.v, g));
  const rn = norm(r);
  const fd = sq / (rn * r0) * (alpha * chi * chi * chi * S - chi);
  const gd = 1 - chi * chi / rn * C;
  return { r, v: add(scale(s.r, fd), scale(s.v, gd)) };
}

/**
 * Lambert's problem: the velocities needed to travel from r1 to r2 in `tof` days
 * (single revolution, universal variables with bisection on z). Returns null if
 * no solution is found.
 */
export function lambert(r1: Vec3, r2: Vec3, tof: number, mu = GM_SUN, prograde = true): { v1: Vec3; v2: Vec3 } | null {
  const n1 = norm(r1), n2 = norm(r2);
  const c = cross(r1, r2);
  let dnu = Math.acos(Math.max(-1, Math.min(1, dot(r1, r2) / (n1 * n2))));
  if (prograde ? c[2] < 0 : c[2] >= 0) dnu = TAU - dnu;
  const A = Math.sin(dnu) * Math.sqrt(n1 * n2 / (1 - Math.cos(dnu)));
  if (Math.abs(A) < 1e-12) return null;
  const y = (z: number) => n1 + n2 + A * (z * stumpffS(z) - 1) / Math.sqrt(stumpffC(z));
  const t = (z: number) => {
    const yz = y(z);
    if (yz < 0) return NaN;
    return (Math.pow(yz / stumpffC(z), 1.5) * stumpffS(z) + A * Math.sqrt(yz)) / Math.sqrt(mu);
  };
  let lo = -4 * Math.PI * Math.PI, hi = 4 * Math.PI * Math.PI - 1e-6;
  // Move lo up until y(lo) is valid.
  while (y(lo) < 0 && lo < hi) lo += 0.1;
  let z = 0;
  for (let k = 0; k < 200; k++) {
    z = (lo + hi) / 2;
    const tz = t(z);
    if (!Number.isFinite(tz) || tz < tof) lo = z; else hi = z;
    if (hi - lo < 1e-12) break;
  }
  const yz = y(z);
  const f = 1 - yz / n1;
  const g = A * Math.sqrt(yz / mu);
  const gd = 1 - yz / n2;
  if (!Number.isFinite(g) || Math.abs(g) < 1e-14) return null;
  const v1 = scale(sub(r2, scale(r1, f)), 1 / g);
  const v2 = scale(sub(scale(r2, gd), r1), 1 / g);
  return { v1, v2 };
}

// ------------------------------------------------------------------ small bodies

export interface SmallBody {
  id: string;
  name: string;
  kind: 'dwarf' | 'asteroid' | 'comet';
  /** Where it lives, shown under the name: "Main asteroid belt", "Kuiper belt", ... */
  group: string;
  elements: Elements;
  /** H, G magnitude parameters (asteroids) or H, K (comets: m = H + 5 log Δ + K log r). */
  H: number;
  G?: number;
  K?: number;
  radiusKm: number;
  note?: string;
}

const el = (q: number, e: number, iDeg: number, nodeDeg: number, periDeg: number, tp: number): Elements => ({
  q, e, i: iDeg * DEG, node: nodeDeg * DEG, peri: periDeg * DEG, tp,
});

/**
 * Famous small bodies with fixed osculating elements (J2000 ecliptic).
 * Fixed elements drift over decades because of planetary perturbations, so
 * these are good to a degree or so near their epoch, worse far from it.
 *
 * Asteroid and trans-Neptunian elements are the Minor Planet Center's, as
 * collected in Stellarium's ssystem_minor.ini (epochs 2017–2025); the time of
 * perihelion is epoch − M/n. Radii are published mean (volume-equivalent)
 * radii, rounded: Dawn for Ceres and Vesta, occultations and thermal
 * measurements for the rest.
 */
export const SMALL_BODIES: SmallBody[] = [
  {
    id: 'halley', name: "Halley's Comet", kind: 'comet', group: 'Comet', H: 5.5, K: 8, radiusKm: 5.5,
    elements: el(0.5871, 0.96714, 162.262, 58.42, 111.33, 2446470.96),
    note: 'Returns about every 76 years; next perihelion in 2061. It comes from the scattered disc beyond Neptune.',
  },
  {
    id: 'halebopp', name: 'Hale–Bopp', kind: 'comet', group: 'Comet', H: -0.8, K: 8, radiusKm: 30,
    elements: el(0.9141, 0.99509, 89.43, 282.47, 130.59, 2450539.64),
    note: 'The Great Comet of 1997, visible to the naked eye for 18 months. Its orbit takes it out toward the Oort cloud.',
  },
  // Main asteroid belt
  {
    id: 'ceres', name: 'Ceres', kind: 'dwarf', group: 'Dwarf planet · Main asteroid belt', H: 3.34, G: 0.15, radiusKm: 470,
    elements: el(2.545538, 0.0795763, 10.58789, 80.24963, 73.29974, 2461599.95),
    note: 'The largest object in the asteroid belt and the first found, in 1801. It holds about a third of the belt\'s mass.',
  },
  {
    id: 'vesta', name: 'Vesta', kind: 'asteroid', group: 'Main asteroid belt', H: 3.25, G: 0.15, radiusKm: 263,
    elements: el(2.148607, 0.0901676, 7.14406, 103.70232, 151.53712, 2460901.79),
    note: 'The brightest asteroid, sometimes just visible to the naked eye. Meteorites from Vesta have landed on Earth.',
  },
  {
    id: 'pallas', name: 'Pallas', kind: 'asteroid', group: 'Main asteroid belt', H: 4.11, G: 0.15, radiusKm: 256,
    elements: el(2.131062, 0.230643, 34.92833, 172.88859, 310.9334, 2461694.94),
    note: 'The second asteroid found, in 1802. Its orbit is tipped steeply, 35° to the plane of the planets.',
  },
  {
    id: 'hygiea', name: 'Hygiea', kind: 'asteroid', group: 'Main asteroid belt', H: 5.64, G: 0.15, radiusKm: 217,
    elements: el(2.806947, 0.1082238, 3.83294, 283.12164, 312.60583, 2461812.47),
    note: 'The fourth-largest asteroid, dark and nearly round.',
  },
  // Kuiper belt and beyond
  {
    id: 'haumea', name: 'Haumea', kind: 'dwarf', group: 'Dwarf planet · Kuiper belt', H: 0.2, radiusKm: 798,
    elements: el(34.408493, 0.1983178, 28.20847, 121.86591, 240.99593, 2500289.98),
    note: 'Spins once every four hours, fast enough to stretch it into an egg shape. It has a ring and two moons.',
  },
  {
    id: 'makemake', name: 'Makemake', kind: 'dwarf', group: 'Dwarf planet · Kuiper belt', H: -0.1, radiusKm: 715,
    elements: el(37.962496, 0.1635304, 29.03373, 79.26068, 296.7554, 2408356.89),
    note: 'The second-brightest object in the Kuiper belt after Pluto, coated in frozen methane.',
  },
  {
    id: 'quaoar', name: 'Quaoar', kind: 'asteroid', group: 'Kuiper belt', H: 2.4, radiusKm: 555,
    elements: el(41.569362, 0.0376011, 7.9912, 189.04724, 163.15048, 2480486.81),
    note: 'A large icy world on a nearly circular orbit, with a ring far wider than theory allows.',
  },
  {
    id: 'orcus', name: 'Orcus', kind: 'asteroid', group: 'Kuiper belt · plutino', H: 2.2, G: 0.15, radiusKm: 455,
    elements: el(30.418352, 0.224754, 20.55649, 268.39889, 73.82944, 2503898.61),
    note: 'Goes round the Sun twice for every three of Neptune\'s turns, like Pluto, but always on the opposite side of its orbit from Pluto.',
  },
  {
    id: 'eris', name: 'Eris', kind: 'dwarf', group: 'Dwarf planet · Scattered disc', H: -1.1, radiusKm: 1163,
    elements: el(38.526069, 0.434306, 43.77787, 36.06369, 150.71804, 2545813.02),
    note: 'Almost the size of Pluto and more massive. Its discovery in 2005 led to the definition of a planet in 2006.',
  },
  {
    id: 'gonggong', name: 'Gonggong', kind: 'asteroid', group: 'Scattered disc', H: 1.8, G: 0.15, radiusKm: 615,
    elements: el(33.095653, 0.5064904, 30.90385, 336.82029, 207.05238, 2399626.85),
    note: 'One of the largest worlds beyond Neptune, deep red, and slow to spin.',
  },
  {
    id: 'sedna', name: 'Sedna', kind: 'asteroid', group: 'Detached object · inner Oort cloud?', H: 1.5, G: 0.15, radiusKm: 500,
    elements: el(76.304358, 0.8618058, 11.92774, 144.39469, 310.87403, 2479102.15),
    note: 'Never comes closer than 76 AU and swings out to about 1,000 AU, too far for Neptune to have put it there. One orbit takes about 13,000 years.',
  },
];

/** Pluto from Standish's mean elements (valid 1800–2050, usable a few centuries beyond). */
export function plutoPosition(jdTT: number): Vec3 {
  const T = (jdTT - J2000) / 36525;
  const a = 39.48211675 - 0.00031596 * T;
  const e = 0.2488273 + 0.0000517 * T;
  const i = (17.14001206 + 0.00004818 * T) * DEG;
  const L = (238.92903833 + 145.20780515 * T) * DEG;
  const varpi = (224.06891629 - 0.04062942 * T) * DEG;
  const node = (110.30393684 - 0.01183482 * T) * DEG;
  const peri = varpi - node;
  const M = L - varpi;
  const E = solveKepler(M, e);
  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node), sO = Math.sin(node), cw = Math.cos(peri), sw = Math.sin(peri);
  const ci = Math.cos(i), si = Math.sin(i);
  const x = (cw * cO - sw * sO * ci) * xp + (-sw * cO - cw * sO * ci) * yp;
  const y = (cw * sO + sw * cO * ci) * xp + (-sw * sO + cw * cO * ci) * yp;
  const z = sw * si * xp + cw * si * yp;
  return apply(ECL_TO_EQ_J2000, [x, y, z]);
}
