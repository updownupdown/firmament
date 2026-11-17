// The words on an object's card: what it is, where it is now, and the numbers
// worth knowing. Pure functions over the Universe, so they can be tested.

import { BODIES } from '../astro/bodies.ts';
import { DEG } from '../astro/math.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import { genitive, temperatureFromBV } from '../astro/stars.ts';
import { DSO_TYPES } from '../data/types.ts';
import {
  type TimeStyle, compassPoint, describeSkyPosition, formatAngularSize, formatDMS, formatDeg, formatDistanceAU,
  formatDistancePc, formatDuration, formatLightTime, formatMagnitude, formatRA, formatTime,
} from '../sim/format.ts';
import { moonElongation, moonPhaseName } from '../sim/tonight.ts';
import type { SkyObject, Universe } from '../sim/universe.ts';

export interface Fact {
  label: string;
  value: string;
}

const CONSTELLATION_NAMES: Record<string, string> = {};

/** Full name of a constellation from its IAU abbreviation, using the Western culture's data. */
export function constellationName(u: Universe, abbr: string): string {
  if (!Object.keys(CONSTELLATION_NAMES).length) {
    for (const c of u.cultures.get('western')?.constellations ?? []) {
      if (c.iau) CONSTELLATION_NAMES[c.iau] = c.native ?? c.name;
    }
  }
  return CONSTELLATION_NAMES[abbr] ?? genitive(abbr);
}

const SPECTRAL: Record<string, string> = {
  O: 'blue', B: 'blue-white', A: 'white', F: 'yellow-white', G: 'yellow', K: 'orange', M: 'red',
};
const LUMINOSITY: [RegExp, string][] = [
  [/^.{1,6}?Ia|Ib/, 'supergiant'], [/III/, 'giant'], [/II/, 'bright giant'], [/IV/, 'subgiant'], [/V/, 'main-sequence star'],
];

/** "Orange giant" from a spectral type like K2III. */
export function describeSpectralType(type: string | undefined): string | null {
  if (!type) return null;
  const colour = SPECTRAL[type.charAt(0).toUpperCase()];
  if (!colour) return type.startsWith('D') ? 'White dwarf' : null;
  const lum = LUMINOSITY.find(([re]) => re.test(type.slice(1)))?.[1] ?? 'star';
  const text = `${colour} ${lum}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One sentence on where to look right now. */
export function whereNow(u: Universe, obj: SkyObject, atmosphere: boolean): string {
  const hz = u.horizontal(obj.dir);
  const alt = atmosphere ? hz.altApparent : hz.alt;
  if (alt < 0) return 'Below the horizon now';
  const text = describeSkyPosition(hz.az, alt);
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The headline numbers for the compact card. */
export function quickFacts(u: Universe, obj: SkyObject): Fact[] {
  if (obj.region) return obj.region.facts.slice(0, 2);
  const hz = u.horizontal(obj.dir);
  const facts: Fact[] = [];
  if (obj.mag !== null && obj.kind !== 'sun') facts.push({ label: 'Magnitude', value: formatMagnitude(obj.mag) });
  if (obj.body) facts.push({ label: 'Distance', value: formatDistanceAU(obj.body.dist) });
  else if (obj.starIndex !== undefined && u.stars.dist[obj.starIndex] > 0) {
    facts.push({ label: 'Distance', value: formatDistancePc(u.stars.dist[obj.starIndex]) });
  } else if (obj.dso) facts.push({ label: 'Type', value: DSO_TYPES[obj.dso.t] ?? 'Deep sky' });
  facts.push({ label: 'Altitude', value: formatDeg(hz.altApparent, 0) });
  return facts;
}

/** Everything else, for the expanded card. */
export function detailFacts(u: Universe, obj: SkyObject, style: TimeStyle): Fact[] {
  if (obj.region) return obj.region.facts.slice(2);
  const facts: Fact[] = [];
  const hz = u.horizontal(obj.dir);
  const [ra, dec] = u.equatorial(obj.dir);
  const b = obj.body;
  if (obj.kind === 'moon' && b) {
    const e = moonElongation(u, u.frame);
    facts.push({ label: 'Phase', value: `${moonPhaseName(e)}, ${Math.round(b.illum * 100)}% lit` });
  } else if (b && obj.kind !== 'sun' && (obj.ref === 'mercury' || obj.ref === 'venus' || obj.ref === 'mars')) {
    facts.push({ label: 'Lit', value: `${Math.round(b.illum * 100)}%` });
  }
  if (b) {
    facts.push({ label: 'Apparent size', value: formatAngularSize(b.radius * 2) });
    facts.push({ label: 'Light takes', value: formatLightTime(b.dist).replace('light-', '') });
    if (obj.kind !== 'sun' && obj.kind !== 'moon' && obj.kind !== 'satellite') {
      facts.push({ label: 'From the Sun', value: formatDistanceAU(b.r) });
    }
    const info = (BODIES as Record<string, { radius: number; period?: number } | undefined>)[obj.ref];
    if (info) {
      facts.push({ label: 'Diameter', value: `${Math.round(info.radius * 2).toLocaleString('en-US')} km` });
      if (info.period) facts.push({ label: obj.kind === 'moon' ? 'Orbits Earth in' : 'Year', value: formatDuration(info.period) });
    }
    if (obj.ref === 'saturn') facts.push({ label: 'Ring tilt', value: formatDeg(Math.abs(b.ringTilt), 0) });
  }
  if (obj.starIndex !== undefined) {
    const i = obj.starIndex;
    const meta = u.stars.meta.get(i);
    const kind = describeSpectralType(meta?.s);
    if (kind) facts.push({ label: 'Kind', value: `${kind}${meta?.s ? ` (${meta.s})` : ''}` });
    facts.push({ label: 'Surface', value: `${(Math.round(temperatureFromBV(u.stars.bv[i]) / 100) * 100).toLocaleString('en-US')} K` });
    if (meta?.c) facts.push({ label: 'Constellation', value: constellationName(u, meta.c) });
    if (u.stars.dist[i] > 0) {
      // Absolute magnitude → luminosity relative to the Sun (4.83).
      const abs = u.stars.mag[i] - 5 * Math.log10(u.stars.dist[i] / 10);
      const lum = Math.pow(10, (4.83 - abs) / 2.5);
      facts.push({ label: 'Luminosity', value: `${lum >= 100 ? Math.round(lum).toLocaleString('en-US') : lum.toPrecision(2)} × Sun` });
    }
    const names = [u.stars.hip[i] ? `HIP ${u.stars.hip[i]}` : '', meta?.hd ? `HD ${meta.hd}` : ''].filter(Boolean).join(', ');
    if (names) facts.push({ label: 'Catalogs', value: names });
  }
  if (obj.dso) {
    if (obj.dso.z) facts.push({ label: 'Size', value: `${obj.dso.z.replace('x', ' × ')}′` });
    if (obj.dso.mes && obj.dso.d !== obj.dso.mes) facts.push({ label: 'Also', value: obj.dso.d });
  }
  facts.push({ label: 'Direction', value: `${compassPoint(hz.az)} (${formatDeg(hz.az, 0)})` });
  facts.push({ label: 'Right ascension', value: formatRA(ra) });
  facts.push({ label: 'Declination', value: formatDMS(dec) });
  void style;
  return facts;
}

/** Rise, highest point and set over the next 24 hours, in plain words. */
export function riseSetFacts(u: Universe, obj: SkyObject, jdUT: number, style: TimeStyle): Fact[] {
  if (obj.kind === 'constellation' || obj.region) return [];
  const rs = u.riseSet(obj.ref, jdUT);
  if (!rs) return [];
  if (rs.alwaysUp) return [{ label: 'Rises and sets', value: 'Never sets from here' }];
  if (rs.neverUp) return [{ label: 'Rises and sets', value: 'Never rises from here' }];
  const t = (x: number | null) => (x === null ? '—' : formatTime(x, u.site, style));
  const facts: Fact[] = [];
  // List whichever comes first, first.
  const order: [string, number | null][] = [['Rises', rs.rise], ['Highest', rs.transit], ['Sets', rs.set]];
  order.sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity));
  for (const [label, when] of order) {
    if (when === null) continue;
    facts.push({ label, value: label === 'Highest' ? `${t(when)} at ${formatDeg(rs.transitAlt, 0)}` : t(when) });
  }
  return facts;
}

/** A sentence or two of context for the best-known objects. */
export function blurb(obj: SkyObject): string | null {
  if (obj.region) return obj.region.blurb;
  const small = SMALL_BODIES.find((s) => s.id === obj.ref);
  if (small?.note) return small.note;
  return BLURBS[obj.ref] ?? null;
}

const BLURBS: Record<string, string> = {
  sun: 'Never look at the Sun directly or through any instrument without a certified solar filter.',
  moon: 'The same face always points at Earth. The dark patches are ancient lava plains called maria.',
  mercury: 'The closest planet to the Sun, so it never strays far from it in the sky. Look low in twilight.',
  venus: 'The brightest planet, wrapped in cloud. It shows phases like the Moon in a small telescope.',
  mars: 'The red planet. It brightens dramatically for a few months around opposition, about every 26 months.',
  jupiter: 'The largest planet. Binoculars held steady will show its four big moons as a line of points.',
  saturn: 'Its rings are visible in any small telescope. Their tilt toward us changes over a 29-year cycle.',
  uranus: 'Just at the edge of naked-eye visibility under a dark sky; a tiny blue-green disc in a telescope.',
  neptune: 'The most distant planet. It needs binoculars or a telescope and a good chart.',
  pluto: 'A dwarf planet in the Kuiper belt, far too faint to see without a large telescope.',
  io: 'The most volcanically active body known. It circles Jupiter in under two days.',
  europa: 'An ice shell over a salt-water ocean. It circles Jupiter every three and a half days.',
  ganymede: 'The largest moon in the solar system, bigger than Mercury.',
  callisto: 'The outermost of the four big moons, and among the most heavily cratered bodies known.',
};

export { DEG };
