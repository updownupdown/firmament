// The crowds of small bodies between and beyond the planets: the main
// asteroid belt, Jupiter's trojans, the Kuiper belt (classical objects and
// plutinos), the scattered disc and the Oort cloud.
//
// Only a few hundred thousand of these objects have known orbits, and none
// in the Oort cloud has been seen there. So each population is drawn as a
// sample: a few thousand made-up orbits whose distances, eccentricities and
// tilts follow the published distributions, with the resonances that shape
// them built in (the Kirkwood gaps; trojans 60° ahead of and behind Jupiter;
// plutinos locked 3:2 with Neptune so they never meet it). One dot stands
// for very many real objects. No DOM.

import { DEG } from './math.ts';

/** Days per revolution at 1 AU, for Kepler's third law (Gaussian year). */
const YEAR_DAYS = 365.25636;

/** Standish mean elements at J2000 (degrees, AU) and mean motion (degrees per day). */
const JUPITER = { a: 5.202887, L: 34.39644051, n: 3034.74612775 / 36525 };
const NEPTUNE = { a: 30.06992276, L: -55.12002969, n: 218.45945325 / 36525 };

export type PopulationId = 'main-belt' | 'trojans' | 'kuiper' | 'plutinos' | 'scattered' | 'oort-inner' | 'oort-outer';
export type RegionId = 'main-belt' | 'trojans' | 'kuiper' | 'scattered' | 'oort';

export interface Region {
  id: RegionId;
  name: string;
  subtitle: string;
  /** Rough inner and outer edges, AU from the Sun. */
  inner: number;
  outer: number;
  /** The headline numbers for the card. */
  facts: { label: string; value: string }[];
  blurb: string;
  /** Searchable alternative names. */
  aka: string[];
  /** The populations drawn for it. */
  populations: PopulationId[];
}

/**
 * Sizes, counts and distances are published figures: the main belt from
 * Minor Planet Center statistics and DeMeo & Carry (2014), the trojans from
 * the Lucy mission team, the Kuiper belt and scattered disc from Gladman et
 * al. (2008) and the OSSOS survey, the Oort cloud from Oort (1950) and
 * Dones et al. (2004).
 */
export const REGIONS: Region[] = [
  {
    id: 'main-belt', name: 'Main asteroid belt', subtitle: 'Between Mars and Jupiter',
    inner: 2.1, outer: 3.3, populations: ['main-belt'], aka: ['asteroid belt', 'asteroids'],
    facts: [
      { label: 'From the Sun', value: '2.1 to 3.3 AU' },
      { label: 'Known objects', value: 'over 1.3 million' },
      { label: 'Total mass', value: 'about 3% of the Moon' },
    ],
    blurb: 'Rocky and metal leftovers that Jupiter\'s pull kept from ever forming a planet. Despite films, it is mostly empty: neighbours are typically a million kilometres apart. Gaps where an orbit would keep time with Jupiter\'s (the Kirkwood gaps) have been swept clear.',
  },
  {
    id: 'trojans', name: 'Jupiter trojans', subtitle: 'Sharing Jupiter\'s orbit',
    inner: 4.9, outer: 5.5, populations: ['trojans'], aka: ['trojan asteroids', 'trojans', 'greeks'],
    facts: [
      { label: 'From the Sun', value: 'about 5.2 AU' },
      { label: 'Known objects', value: 'about 15,000' },
      { label: 'Where', value: '60° ahead of and behind Jupiter' },
    ],
    blurb: 'Two swarms that travel with Jupiter, one leading it and one trailing, held in the two balance points (L4 and L5) of Jupiter and the Sun. NASA\'s Lucy spacecraft is on its way to visit several of them.',
  },
  {
    id: 'kuiper', name: 'Kuiper belt', subtitle: 'Icy worlds beyond Neptune',
    inner: 30, outer: 50, populations: ['kuiper', 'plutinos'], aka: ['kuiper', 'edgeworth', 'trans-neptunian', 'tno', 'kbo'],
    facts: [
      { label: 'From the Sun', value: '30 to 50 AU' },
      { label: 'Known objects', value: 'over 4,000' },
      { label: 'Wider than 100 km', value: 'perhaps 100,000' },
    ],
    blurb: 'A wide ring of frozen leftovers from the birth of the planets, home to Pluto, Haumea and Makemake. The plutinos, Pluto among them, go round twice for every three turns of Neptune, which keeps them from ever meeting it. New Horizons flew past Pluto in 2015 and the small world Arrokoth in 2019.',
  },
  {
    id: 'scattered', name: 'Scattered disc', subtitle: 'Flung out by Neptune',
    inner: 30, outer: 1000, populations: ['scattered'], aka: ['scattered disk', 'sdo'],
    facts: [
      { label: 'Nearest to the Sun', value: '30 to 40 AU' },
      { label: 'Farthest out', value: 'hundreds of AU' },
      { label: 'Largest', value: 'Eris' },
    ],
    blurb: 'Bodies on long, tilted orbits that Neptune threw outward long ago. Each still swoops back in near Neptune\'s distance. It is thought to be the source of most short-period comets, Halley\'s among them.',
  },
  {
    id: 'oort', name: 'Oort cloud', subtitle: 'The edge of the Sun\'s reach',
    inner: 2000, outer: 100000, populations: ['oort-inner', 'oort-outer'], aka: ['oort', 'hills cloud', 'opik'],
    facts: [
      { label: 'From the Sun', value: 'about 2,000 to 100,000 AU' },
      { label: 'Light takes', value: 'up to a year and a half' },
      { label: 'Objects', value: 'perhaps a trillion comets' },
    ],
    blurb: 'A vast, round swarm of icy bodies surrounding the solar system, reaching a third of the way to the nearest star. No object has ever been seen out there; we know it from long-period comets like Hale–Bopp that fall in from every direction. Passing stars still nudge it today.',
  },
];

export function regionById(id: string): Region | undefined {
  const key = id.startsWith('region:') ? id.slice(7) : id;
  return REGIONS.find((r) => r.id === key);
}

// ------------------------------------------------------------------ particles

/**
 * Per particle: semi-major axis (AU), eccentricity, inclination, node and
 * argument of perihelion (radians, J2000 ecliptic), mean anomaly at J2000
 * (revolutions) and mean motion (revolutions per day). Static particles
 * (the Oort cloud) have zero mean motion.
 */
export const PARTICLE_STRIDE = 7;

export interface Population {
  id: PopulationId;
  count: number;
  /** Two surface types (RGB) and the share of the second. */
  color: { a: [number, number, number]; b: [number, number, number]; shareB: number };
  data: Float32Array;
}

/** A small, fast, seeded generator (mulberry32), so every build draws the same sample. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const normal = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
/** Rayleigh-distributed value with scale `sigma`: the usual shape for eccentricities and inclinations. */
const rayleigh = (r: () => number, sigma: number) => sigma * Math.sqrt(-2 * Math.log(1 - r()));
const wrap = (x: number) => x - Math.floor(x);
const revsPerDay = (a: number) => 1 / (YEAR_DAYS * Math.pow(a, 1.5));

/** The Kirkwood gaps: semi-major axes where an asteroid would keep time with Jupiter (3:1, 5:2, 7:3, 2:1), and their widths. */
export const KIRKWOOD: [number, number][] = [[2.502, 0.035], [2.825, 0.025], [2.958, 0.015], [3.279, 0.04]];

/** Resonant semi-major axis for a period ratio `p` to a planet at `a`. */
export const resonance = (a: number, p: number) => a * Math.pow(p, 2 / 3);

function put(out: Float32Array, k: number, a: number, e: number, i: number, node: number, peri: number, m0: number, n: number): void {
  out.set([a, e, i, node, peri, wrap(m0), n], k * PARTICLE_STRIDE);
}

export function buildPopulation(id: PopulationId, count: number, seed = 1): Float32Array {
  const r = rng(seed * 7919 + id.length * 104729);
  const out = new Float32Array(count * PARTICLE_STRIDE);
  for (let k = 0; k < count; k++) {
    switch (id) {
      case 'main-belt': {
        // Most asteroids lie between 2.2 and 3.2 AU, peaking near 2.7, with the resonant gaps empty.
        let a = 0;
        do { a = 2.7 + 0.32 * normal(r); } while (a < 2.06 || a > 3.32 || KIRKWOOD.some(([g, w]) => Math.abs(a - g) < w));
        const e = Math.min(0.32, rayleigh(r, 0.09));
        const i = Math.min(32 * DEG, rayleigh(r, 7 * DEG));
        put(out, k, a, e, i, r() * 2 * Math.PI, r() * 2 * Math.PI, r(), revsPerDay(a));
        break;
      }
      case 'trojans': {
        // Same period as Jupiter, mean longitude 60° ahead (L4) or behind (L5), spread by libration.
        const side = r() < 0.6 ? 1 : -1; // L4 holds more than L5
        const lambda = (JUPITER.L + side * 60 + 11 * normal(r)) * DEG;
        const e = Math.min(0.15, rayleigh(r, 0.06));
        const i = Math.min(40 * DEG, rayleigh(r, 11 * DEG));
        const node = r() * 2 * Math.PI, peri = r() * 2 * Math.PI;
        put(out, k, JUPITER.a, e, i, node, peri, (lambda - node - peri) / (2 * Math.PI), JUPITER.n / 360);
        break;
      }
      case 'kuiper': {
        // Classical objects, 42 to 48 AU on near-circular orbits: a flat "cold" core and a thicker "hot" population.
        const a = 42 + 5.5 * r();
        const e = Math.min(0.18, rayleigh(r, 0.05), 1 - 36 / a);
        const cold = r() < 0.45;
        const i = Math.min(40 * DEG, rayleigh(r, (cold ? 2.2 : 13) * DEG));
        put(out, k, a, e, i, r() * 2 * Math.PI, r() * 2 * Math.PI, r(), revsPerDay(a));
        break;
      }
      case 'plutinos': {
        // 3:2 with Neptune. The resonant angle 3λ − 2λN − ϖ stays near 180°, so perihelion falls far from Neptune.
        const a = resonance(NEPTUNE.a, 1.5);
        const e = 0.1 + 0.2 * r();
        const i = Math.min(35 * DEG, rayleigh(r, 11 * DEG));
        const lambda = r() * 2 * Math.PI;
        const phi = Math.PI + 45 * DEG * normal(r) * 0.6;
        const varpi = 3 * lambda - 2 * NEPTUNE.L * DEG - phi;
        const node = r() * 2 * Math.PI;
        // Exactly two thirds of Neptune's mean motion, so the lock holds as time runs.
        put(out, k, a, e, i, node, varpi - node, (lambda - varpi) / (2 * Math.PI), ((2 / 3) * NEPTUNE.n) / 360);
        break;
      }
      case 'scattered': {
        // Perihelia near Neptune, aphelia far out: semi-major axes spread roughly evenly in log from 50 to 400 AU.
        const q = 30 + 8 * Math.pow(r(), 1.5);
        const a = 50 * Math.pow(8, Math.pow(r(), 1.4));
        const e = 1 - q / a;
        const i = Math.min(60 * DEG, rayleigh(r, 17 * DEG));
        put(out, k, a, e, i, r() * 2 * Math.PI, r() * 2 * Math.PI, r(), revsPerDay(a));
        break;
      }
      case 'oort-inner':
      case 'oort-outer': {
        // Number density falling as r^-3.5 (Duncan, Quinn & Tremaine 1987); the inner (Hills) cloud is somewhat flattened.
        const [lo, hi] = id === 'oort-inner' ? [2000, 20000] : [20000, 100000];
        const p = -1.5; // r^2 · r^-3.5
        const u = r();
        const dist = Math.pow(Math.pow(lo, p + 1) + u * (Math.pow(hi, p + 1) - Math.pow(lo, p + 1)), 1 / (p + 1));
        let z = 2 * r() - 1;
        if (id === 'oort-inner') z *= 0.55 + 0.45 * Math.min(1, (dist - lo) / (hi - lo) * 2);
        const lon = r() * 2 * Math.PI;
        // A circular "orbit" through the point that does not move: node 90° behind it, latitude as the tilt.
        put(out, k, dist, 0, Math.asin(z), lon - Math.PI / 2, 0, 0.25, 0);
        break;
      }
    }
  }
  return out;
}

const COUNTS: Record<PopulationId, number> = {
  'main-belt': 7000, trojans: 2600, kuiper: 4200, plutinos: 1400, scattered: 2200, 'oort-inner': 5000, 'oort-outer': 9000,
};
/**
 * Surface colours, as two common types and the share of the rarer: dark grey
 * C-types and tan S-types in the main belt (about 3 in 4 are C-like); reddish
 * D-types among the Trojans; Kuiper belt objects from grey to the "ultra-red"
 * of the cold classical belt; and the Oort cloud's comets as pale, icy grey.
 * Brightened to read against the black, but in the right order of hue.
 */
const COLORS: Record<PopulationId, { a: [number, number, number]; b: [number, number, number]; shareB: number }> = {
  'main-belt': { a: [0.70, 0.68, 0.65], b: [0.92, 0.74, 0.54], shareB: 0.3 },
  trojans: { a: [0.84, 0.60, 0.46], b: [0.72, 0.66, 0.60], shareB: 0.2 },
  kuiper: { a: [0.95, 0.62, 0.46], b: [0.80, 0.76, 0.74], shareB: 0.35 },
  plutinos: { a: [0.88, 0.70, 0.58], b: [0.80, 0.78, 0.78], shareB: 0.45 },
  scattered: { a: [0.80, 0.70, 0.64], b: [0.92, 0.62, 0.48], shareB: 0.3 },
  'oort-inner': { a: [0.74, 0.80, 0.90], b: [0.86, 0.80, 0.74], shareB: 0.3 },
  'oort-outer': { a: [0.70, 0.77, 0.90], b: [0.84, 0.80, 0.76], shareB: 0.3 },
};

export function allPopulations(): Population[] {
  return (Object.keys(COUNTS) as PopulationId[]).map((id) => ({ id, count: COUNTS[id], color: COLORS[id], data: buildPopulation(id, COUNTS[id]) }));
}

/** Where a particle is (J2000 ecliptic, AU) at `days` since J2000: the same sum the shader does. */
export function particlePosition(data: Float32Array, k: number, days: number): [number, number, number] {
  const o = k * PARTICLE_STRIDE;
  const [a, e, i, node, peri, m0, n] = data.subarray(o, o + PARTICLE_STRIDE);
  const M = 2 * Math.PI * wrap(m0 + n * days);
  let E = M + e * Math.sin(M);
  for (let it = 0; it < 6; it++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cO = Math.cos(node), sO = Math.sin(node), cw = Math.cos(peri), sw = Math.sin(peri), ci = Math.cos(i), si = Math.sin(i);
  return [
    (cO * cw - sO * sw * ci) * x + (-cO * sw - sO * cw * ci) * y,
    (sO * cw + cO * sw * ci) * x + (-sO * sw + cO * cw * ci) * y,
    sw * si * x + cw * si * y,
  ];
}

/** Mean longitude of Jupiter or Neptune (radians) at `days` since J2000, from the same mean elements. */
export function meanLongitude(planet: 'jupiter' | 'neptune', days: number): number {
  const p = planet === 'jupiter' ? JUPITER : NEPTUNE;
  return (p.L + p.n * days) * DEG;
}
