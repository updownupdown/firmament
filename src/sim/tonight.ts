// What the coming night holds at the observer's place: darkness, the Moon,
// which planets can be seen and when, and the constellations best placed.

import { type Frame, makeFrame, observeBody } from '../astro/ephemeris.ts';
import { type Twilight, twilight } from '../astro/events.ts';
import { azAlt, eclipticOfDate } from '../astro/frames.ts';
import { DEG, apply, wrap2pi } from '../astro/math.ts';
import { refineRoot } from '../astro/search.ts';
import { nightAnchor } from './format.ts';
import { type Universe, earthSite } from './universe.ts';

export interface TonightBody {
  id: string;
  /** Whether it can be seen at some point during the night. */
  visible: boolean;
  /** Rise and set within the 24 hours from the anchoring noon (UT Julian dates). */
  rise: number | null;
  set: number | null;
  /** Start and end of the time it is up in a dark enough sky. */
  from: number | null;
  until: number | null;
  /** The best moment to look: highest in a dark sky. */
  best: number | null;
  bestAlt: number;
  bestAz: number;
  mag: number;
  /** One of: 'evening', 'morning', 'all-night', 'night', 'hidden'. */
  when: 'evening' | 'morning' | 'all-night' | 'night' | 'hidden';
}

export const MOON_PHASE_NAMES = [
  'New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous',
  'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent',
];

export interface MoonTonight extends TonightBody {
  illum: number;
  /** Elongation from the Sun along the ecliptic, 0..2π (0 new, π full). */
  elongation: number;
  phaseName: string;
  waxing: boolean;
}

export interface Tonight {
  /** Local noon that starts this night (UT Julian date). */
  anchor: number;
  twilight: Twilight;
  /** When the sky is properly dark (Sun 18° down), if it gets there. */
  darkFrom: number | null;
  darkUntil: number | null;
  /** 'dark' has true night; 'twilight' never gets fully dark; 'day' the Sun never sets. */
  darkness: 'dark' | 'twilight' | 'day' | 'polar-night';
  moon: MoonTonight;
  planets: TonightBody[];
  /** Constellations of the current culture that are high in the middle of the night. */
  constellations: { ref: string; name: string; alt: number; az: number }[];
}

const STEP = 1 / 96; // 15 minutes
const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/** Elongation of the Moon from the Sun along the ecliptic of date, 0..2π. */
export function moonElongation(u: Universe, f: Frame): number {
  const sun = eclipticOfDate(observeBody(u.eph, f, 'sun').dir, f.jdTT, f.nut)[0];
  const moon = eclipticOfDate(observeBody(u.eph, f, 'moon').dir, f.jdTT, f.nut)[0];
  return wrap2pi(moon - sun);
}

export function moonPhaseName(elongation: number): string {
  const deg = elongation / DEG;
  // The four named instants get a window of ±6°; the rest are the in-between phases.
  const near = (x: number) => Math.abs(((deg - x + 540) % 360) - 180) < 6;
  if (near(0)) return MOON_PHASE_NAMES[0];
  if (near(90)) return MOON_PHASE_NAMES[2];
  if (near(180)) return MOON_PHASE_NAMES[4];
  if (near(270)) return MOON_PHASE_NAMES[6];
  return MOON_PHASE_NAMES[1 + 2 * Math.floor(deg / 90)];
}

/** The night that is running or coming at `jdUT`, for the universe's site and culture. */
export function tonight(u: Universe, jdUT: number): Tonight {
  const site = earthSite(u.site);
  const anchor = nightAnchor(jdUT, u.site);
  const tw = twilight(u.eph, site, anchor);

  // One pass over the 24 hours: Sun altitude and every body's altitude.
  const ids = ['moon', ...PLANETS];
  const n = Math.round(1 / STEP) + 1;
  const sunAlt = new Float64Array(n);
  const alts = ids.map(() => new Float64Array(n));
  const altAt = (id: string, t: number): number => {
    const f = makeFrame(u.eph, t, site);
    return azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, id).dir))[1];
  };
  for (let k = 0; k < n; k++) {
    const f = makeFrame(u.eph, anchor + k * STEP, site);
    sunAlt[k] = azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, 'sun').dir))[1];
    ids.forEach((id, j) => {
      alts[j][k] = azAlt(apply(f.j2000ToHorizon, observeBody(u.eph, f, id).dir))[1];
    });
  }

  const describe = (j: number): TonightBody => {
    const id = ids[j];
    const a = alts[j];
    const h0 = (id === 'moon' ? -0.8333 : -0.5667) * DEG;
    let rise: number | null = null, set: number | null = null;
    for (let k = 1; k < n; k++) {
      const up = a[k] > h0, was = a[k - 1] > h0;
      if (up === was) continue;
      const t = refineRoot((x) => altAt(id, x) - h0, anchor + (k - 1) * STEP, anchor + k * STEP, a[k - 1] - h0, a[k] - h0, 1e-4);
      if (up && rise === null) rise = t;
      if (!up && set === null) set = t;
    }
    // Bright objects show in civil twilight; the two faint planets need real darkness.
    const faint = id === 'uranus' || id === 'neptune';
    const sunLimit = (id === 'moon' ? -0.8333 : faint ? -15 : -6) * DEG;
    const minAlt = (id === 'moon' ? 0 : faint ? 15 : 5) * DEG;
    let from: number | null = null, until: number | null = null, best = -1;
    for (let k = 0; k < n; k++) {
      if (sunAlt[k] > sunLimit || a[k] < minAlt) continue;
      const t = anchor + k * STEP;
      if (from === null) from = t;
      until = t;
      if (best < 0 || a[k] > a[best]) best = k;
    }
    const tBest = best >= 0 ? anchor + best * STEP : null;
    const fBest = makeFrame(u.eph, tBest ?? anchor + 0.5, site);
    const obs = observeBody(u.eph, fBest, id);
    const [bestAz, bestAlt] = azAlt(apply(fBest.j2000ToHorizon, obs.dir));
    let when: TonightBody['when'] = 'hidden';
    if (from !== null && until !== null) {
      const mid = anchor + 0.5;
      const span = until - from;
      const nightLength = sunAlt.filter((s) => s < sunLimit).length * STEP;
      if (span > 0.8 * nightLength && nightLength > 0.1) when = 'all-night';
      else if (until < mid + 0.04) when = 'evening';
      else if (from > mid - 0.04) when = 'morning';
      else when = 'night';
    }
    return { id, visible: from !== null, rise, set, from, until, best: tBest, bestAlt, bestAz, mag: obs.mag, when };
  };

  const bodies = ids.map((_, j) => describe(j));
  const fMoon = makeFrame(u.eph, bodies[0].best ?? anchor + 0.5, site);
  const elongation = moonElongation(u, fMoon);
  const moon: MoonTonight = {
    ...bodies[0], illum: observeBody(u.eph, fMoon, 'moon').illum, elongation,
    phaseName: moonPhaseName(elongation), waxing: elongation < Math.PI,
  };

  let minSun = Infinity, maxSun = -Infinity;
  for (const s of sunAlt) { minSun = Math.min(minSun, s); maxSun = Math.max(maxSun, s); }
  const darkness: Tonight['darkness'] = minSun > -0.8333 * DEG ? 'day'
    : maxSun < -0.8333 * DEG && minSun < -18 * DEG ? 'polar-night'
    : minSun < -18 * DEG ? 'dark' : 'twilight';

  // Constellations: altitude at the darkest moment of the night.
  let darkest = 0;
  for (let k = 1; k < n; k++) if (sunAlt[k] < sunAlt[darkest]) darkest = k;
  const fDark = makeFrame(u.eph, anchor + darkest * STEP, site);
  const constellations: Tonight['constellations'] = [];
  for (const c of u.culture?.constellations ?? []) {
    if (c.asterism) continue;
    const centre = u.constellationCentre(c);
    if (!centre) continue;
    const [az, alt] = azAlt(apply(fDark.j2000ToHorizon, centre));
    if (alt > 35 * DEG) constellations.push({ ref: `con:${u.cultureId}:${c.id}`, name: c.native && c.iau ? c.native : c.name, alt, az });
  }
  constellations.sort((a, b) => b.alt - a.alt);

  return {
    anchor, twilight: tw,
    darkFrom: tw.astroDusk ?? (darkness === 'polar-night' ? anchor : null),
    darkUntil: tw.astroDawn ?? (darkness === 'polar-night' ? anchor + 1 : null),
    darkness, moon, planets: bodies.slice(1), constellations: constellations.slice(0, 10),
  };
}
