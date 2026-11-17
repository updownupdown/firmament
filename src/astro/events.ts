// Rise/set/transit, twilight, and calendar events: Moon phases, seasons,
// conjunctions, oppositions, elongations, eclipses and meteor showers.

import { AU_KM, DEG, type Vec3, angleBetween, apply, toSpherical, scale } from './math.ts';
import { EQ_TO_ECL_J2000, eclipticOfDate } from './frames.ts';
import {
  type EarthSite, type Ephemeris, type Frame, altitudeOf, makeFrame, observeBody,
} from './ephemeris.ts';
import { angleDiff, findCrossings, findMaxima, findMinima, goldenMin } from './search.ts';
import { ttFromUt, utFromTt } from './time.ts';

const EARTH_RADIUS_KM = 6378.14;

/** Frame for a geocentric observer (no parallax), for calendar-level events. */
export function geoFrame(eph: Ephemeris, jdUT: number): Frame {
  const f = makeFrame(eph, jdUT, { lat: 0, lon: 0, height: 0 });
  f.observerGeo = [0, 0, 0];
  return f;
}

// ------------------------------------------------------------------ rise / set

export interface RiseSet {
  rise: number | null;
  transit: number | null;
  set: number | null;
  transitAlt: number;
  /** Above the horizon for the whole window. */
  alwaysUp: boolean;
  /** Below the horizon for the whole window. */
  neverUp: boolean;
}

/** Standard altitude for rising and setting: refraction plus semidiameter. */
export function standardAltitude(id: string): number {
  if (id === 'sun') return -0.8333 * DEG;
  if (id === 'moon') return -0.8333 * DEG; // topocentric, upper limb, ~15.5′ radius
  return -0.5667 * DEG;
}

export type DirectionAt = (jdUT: number, f: Frame) => Vec3;

/**
 * Rise, transit and set in the window [jd0, jd0 + span] (UT days).
 * `dirAt` gives the J2000 apparent direction at a given time.
 */
export function riseTransitSet(
  eph: Ephemeris, site: EarthSite, jd0: number, dirAt: DirectionAt, h0: number, span = 1,
): RiseSet {
  const alt = (t: number) => altitudeOf(makeFrame(eph, t, site), dirAt(t, makeFrame(eph, t, site)));
  const step = 1 / 48;
  const crossings = findCrossings((t) => alt(t) - h0, jd0, jd0 + span, step);
  const rise = crossings.find((c) => c.rising)?.t ?? null;
  const set = crossings.find((c) => !c.rising)?.t ?? null;
  const maxima = findMaxima(alt, jd0 - step, jd0 + span + step, step).filter((m) => m.t >= jd0 && m.t <= jd0 + span);
  const top = maxima.sort((a, b) => b.value - a.value)[0];
  let alwaysUp = false, neverUp = false;
  if (!crossings.length) {
    const a = alt(jd0 + span / 2);
    alwaysUp = a > h0;
    neverUp = !alwaysUp;
  }
  return { rise, transit: top?.t ?? null, set, transitAlt: top?.value ?? alt(jd0), alwaysUp, neverUp };
}

export function bodyRiseSet(eph: Ephemeris, site: EarthSite, jd0: number, id: string, span = 1): RiseSet {
  return riseTransitSet(eph, site, jd0, (_t, f) => observeBody(eph, f, id).dir, standardAltitude(id), span);
}

export function starRiseSet(eph: Ephemeris, site: EarthSite, jd0: number, dir: Vec3, span = 1): RiseSet {
  return riseTransitSet(eph, site, jd0, () => dir, standardAltitude('star'), span);
}

export interface Twilight {
  sunset: number | null;
  civilDusk: number | null;
  nauticalDusk: number | null;
  astroDusk: number | null;
  astroDawn: number | null;
  nauticalDawn: number | null;
  civilDawn: number | null;
  sunrise: number | null;
  /** Lowest solar altitude in the window (radians); > −18° means no true darkness. */
  minSunAlt: number;
}

/** Twilight times for the night following jdNoon (local noon, UT days). */
export function twilight(eph: Ephemeris, site: EarthSite, jdNoon: number): Twilight {
  const sunAlt = (t: number) => {
    const f = makeFrame(eph, t, site);
    return altitudeOf(f, observeBody(eph, f, 'sun').dir);
  };
  // Sample once, then find each crossing.
  const step = 1 / 96;
  const samples: [number, number][] = [];
  for (let t = jdNoon; t <= jdNoon + 1 + 1e-9; t += step) samples.push([t, sunAlt(t)]);
  const cross = (h: number, rising: boolean): number | null => {
    for (let i = 1; i < samples.length; i++) {
      const [ta, fa] = samples[i - 1], [tb, fb] = samples[i];
      const ga = fa - h, gb = fb - h;
      if (rising ? ga < 0 && gb >= 0 : ga > 0 && gb <= 0) {
        let a = ta, b = tb, fa2 = ga;
        for (let k = 0; k < 30; k++) {
          const m = (a + b) / 2, fm = sunAlt(m) - h;
          if ((fm < 0) === (fa2 < 0)) { a = m; fa2 = fm; } else b = m;
        }
        return (a + b) / 2;
      }
    }
    return null;
  };
  return {
    sunset: cross(-0.8333 * DEG, false),
    civilDusk: cross(-6 * DEG, false),
    nauticalDusk: cross(-12 * DEG, false),
    astroDusk: cross(-18 * DEG, false),
    astroDawn: cross(-18 * DEG, true),
    nauticalDawn: cross(-12 * DEG, true),
    civilDawn: cross(-6 * DEG, true),
    sunrise: cross(-0.8333 * DEG, true),
    minSunAlt: Math.min(...samples.map((s) => s[1])),
  };
}

// ------------------------------------------------------------------ calendar events

export type EventKind =
  | 'moon-phase' | 'season' | 'conjunction' | 'opposition' | 'elongation'
  | 'lunar-eclipse' | 'solar-eclipse' | 'meteor-shower' | 'perigee-moon';

export interface AstroEvent {
  kind: EventKind;
  /** Instant (UT Julian date). */
  t: number;
  title: string;
  detail: string;
  bodies: string[];
  /** 0 (minor) … 3 (rare / spectacular). */
  importance: number;
  data?: Record<string, number | string | boolean>;
}

const NAMES: Record<string, string> = {
  sun: 'the Sun', moon: 'the Moon', mercury: 'Mercury', venus: 'Venus', mars: 'Mars',
  jupiter: 'Jupiter', saturn: 'Saturn', uranus: 'Uranus', neptune: 'Neptune',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Apparent geocentric ecliptic longitude of date. */
function eclLon(eph: Ephemeris, id: string, jdTT: number): number {
  const f = geoFrame(eph, utFromTt(jdTT));
  return eclipticOfDate(observeBody(eph, f, id).dir, f.jdTT, f.nut)[0];
}

/** Sun's geometric longitude in the J2000 ecliptic (used for meteor showers). */
function solarLongitudeJ2000(eph: Ephemeris, jdTT: number): number {
  const e = eph.earth(jdTT);
  return toSpherical(apply(EQ_TO_ECL_J2000, scale(e, -1)))[0];
}

export const PHASE_NAMES = ['New Moon', 'First Quarter', 'Full Moon', 'Last Quarter'];

export function moonPhases(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  const t0 = ttFromUt(jdUT0), t1 = ttFromUt(jdUT1);
  const elong = (t: number) => angleDiff(eclLon(eph, 'moon', t), eclLon(eph, 'sun', t));
  for (let q = 0; q < 4; q++) {
    const target = q * Math.PI / 2;
    const f = (t: number) => angleDiff(elong(t), target);
    for (const c of findCrossings(f, t0, t1, 1, Math.PI)) {
      if (!c.rising) continue;
      out.push({
        kind: 'moon-phase', t: utFromTt(c.t), title: PHASE_NAMES[q], detail: '',
        bodies: ['moon'], importance: q === 0 || q === 2 ? 1 : 0, data: { phase: q },
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

const SEASONS = [
  ['March equinox', 'The Sun crosses the celestial equator heading north.'],
  ['June solstice', 'The Sun reaches its northernmost point.'],
  ['September equinox', 'The Sun crosses the celestial equator heading south.'],
  ['December solstice', 'The Sun reaches its southernmost point.'],
];

export function seasons(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  const t0 = ttFromUt(jdUT0), t1 = ttFromUt(jdUT1);
  for (let q = 0; q < 4; q++) {
    const f = (t: number) => angleDiff(eclLon(eph, 'sun', t), q * Math.PI / 2);
    for (const c of findCrossings(f, t0, t1, 5, Math.PI)) {
      if (!c.rising) continue;
      out.push({ kind: 'season', t: utFromTt(c.t), title: SEASONS[q][0], detail: SEASONS[q][1], bodies: ['sun'], importance: 1, data: { season: q } });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

function separation(eph: Ephemeris, a: string, b: string, jdTT: number): number {
  const f = geoFrame(eph, utFromTt(jdTT));
  return angleBetween(observeBody(eph, f, a).dir, observeBody(eph, f, b).dir);
}

/** Close approaches between bright planets, and the Moon passing planets. */
export function conjunctions(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  const t0 = ttFromUt(jdUT0), t1 = ttFromUt(jdUT1);
  const planets = ['mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  for (let i = 0; i < planets.length; i++) {
    for (let j = i + 1; j < planets.length; j++) {
      const a = planets[i], b = planets[j];
      for (const m of findMinima((t) => separation(eph, a, b, t), t0, t1, 1)) {
        if (m.value > 3 * DEG) continue;
        const sunSep = Math.min(separation(eph, a, 'sun', m.t), separation(eph, b, 'sun', m.t));
        const deg = m.value / DEG;
        out.push({
          kind: 'conjunction', t: utFromTt(m.t),
          title: `${cap(NAMES[a])} and ${NAMES[b]}`,
          detail: `${deg < 1 ? (deg * 60).toFixed(0) + '′' : deg.toFixed(1) + '°'} apart${sunSep < 12 * DEG ? ', close to the Sun' : ''}.`,
          bodies: [a, b], importance: deg < 0.5 && sunSep > 15 * DEG ? 3 : deg < 1.5 ? 2 : 1,
          data: { separation: m.value, sunSeparation: sunSep },
        });
      }
    }
  }
  for (const p of planets) {
    for (const m of findMinima((t) => separation(eph, 'moon', p, t), t0, t1, 0.25)) {
      if (m.value > 4 * DEG) continue;
      const sunSep = separation(eph, p, 'sun', m.t);
      if (sunSep < 15 * DEG) continue;
      const deg = m.value / DEG;
      out.push({
        kind: 'conjunction', t: utFromTt(m.t), title: `The Moon passes ${NAMES[p]}`,
        detail: m.value < 0.26 * DEG ? 'Close enough that the Moon may cover it (an occultation) for some places.' : `${deg.toFixed(1)}° apart.`,
        bodies: ['moon', p], importance: deg < 1 ? 2 : 1, data: { separation: m.value },
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

export function oppositionsAndElongations(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  const t0 = ttFromUt(jdUT0), t1 = ttFromUt(jdUT1);
  for (const p of ['mars', 'jupiter', 'saturn', 'uranus', 'neptune']) {
    const f = (t: number) => angleDiff(eclLon(eph, p, t), eclLon(eph, 'sun', t) + Math.PI);
    for (const c of findCrossings(f, t0, t1, 4, Math.PI)) {
      if (c.rising) continue; // planets move retrograde through opposition
      const fr = geoFrame(eph, utFromTt(c.t));
      const b = observeBody(eph, fr, p);
      out.push({
        kind: 'opposition', t: utFromTt(c.t), title: `${cap(NAMES[p])} at opposition`,
        detail: `Opposite the Sun: up all night and at its brightest (magnitude ${b.mag.toFixed(1)}).`,
        bodies: [p], importance: p === 'mars' || p === 'jupiter' || p === 'saturn' ? 2 : 1,
        data: { mag: b.mag, distance: b.dist },
      });
    }
  }
  for (const p of ['mercury', 'venus']) {
    const el = (t: number) => separation(eph, p, 'sun', t);
    for (const m of findMaxima(el, t0, t1, 2)) {
      const east = angleDiff(eclLon(eph, p, m.t), eclLon(eph, 'sun', m.t)) > 0;
      out.push({
        kind: 'elongation', t: utFromTt(m.t),
        title: `${cap(NAMES[p])} at greatest ${east ? 'eastern' : 'western'} elongation`,
        detail: `${(m.value / DEG).toFixed(1)}° from the Sun, best seen ${east ? 'after sunset' : 'before sunrise'}.`,
        bodies: [p], importance: p === 'venus' ? 2 : 1, data: { elongation: m.value, east },
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

// ------------------------------------------------------------------ eclipses

export interface LunarEclipse {
  t: number; // UT of greatest eclipse
  type: 'penumbral' | 'partial' | 'total';
  umbralMag: number;
  penumbralMag: number;
}

function shadowGeometry(eph: Ephemeris, jdTT: number) {
  const f = geoFrame(eph, utFromTt(jdTT));
  const sun = observeBody(eph, f, 'sun');
  const moon = observeBody(eph, f, 'moon');
  const piM = Math.asin(EARTH_RADIUS_KM / (moon.dist * AU_KM));
  const piS = Math.asin(EARTH_RADIUS_KM / (sun.dist * AU_KM));
  return { sun, moon, piM, piS };
}

export interface EarthShadow {
  /** Geocentric directions (J2000) of the Moon and of the centre of the Earth's shadow. */
  moonDir: Vec3;
  shadowDir: Vec3;
  /** Angular radii at the Moon's distance, radians. */
  umbra: number;
  penumbra: number;
  moonRadius: number;
  /** Angle between the Moon's centre and the shadow's, radians. */
  separation: number;
  /** Fraction of the Moon's disc outside the umbra, 0..1. */
  uncovered: number;
}

/** The Earth's shadow where the Moon is, at an instant (UT). */
export function earthShadowAt(eph: Ephemeris, jdUT: number): EarthShadow {
  const g = shadowGeometry(eph, ttFromUt(jdUT));
  const shadowDir = scale(g.sun.dir, -1);
  // The atmosphere enlarges the shadow by about 2% (the traditional rule).
  const umbra = 1.02 * (0.99834 * g.piM - g.sun.radius + g.piS);
  const penumbra = 1.02 * (0.99834 * g.piM + g.sun.radius + g.piS);
  const separation = angleBetween(g.moon.dir, shadowDir);
  const r = g.moon.radius;
  let uncovered = 1;
  if (separation < umbra + r) {
    if (separation <= umbra - r) uncovered = 0;
    else {
      // Area of the lens where two circles overlap.
      const d = separation;
      const a1 = r * r * Math.acos((d * d + r * r - umbra * umbra) / (2 * d * r));
      const a2 = umbra * umbra * Math.acos((d * d + umbra * umbra - r * r) / (2 * d * umbra));
      const a3 = 0.5 * Math.sqrt((-d + r + umbra) * (d + r - umbra) * (d - r + umbra) * (d + r + umbra));
      uncovered = 1 - (a1 + a2 - a3) / (Math.PI * r * r);
    }
  }
  return { moonDir: g.moon.dir, shadowDir, umbra, penumbra, moonRadius: r, separation, uncovered };
}

export function lunarEclipseAt(eph: Ephemeris, fullMoonUT: number): LunarEclipse | null {
  const tt = ttFromUt(fullMoonUT);
  const sepAt = (t: number) => {
    const g = shadowGeometry(eph, t);
    return angleBetween(g.moon.dir, scale(g.sun.dir, -1));
  };
  const tMax = goldenMin(sepAt, tt - 0.3, tt + 0.3, 1e-5);
  const g = shadowGeometry(eph, tMax);
  const sep = sepAt(tMax);
  const sS = g.sun.radius, sM = g.moon.radius;
  const umbra = 1.02 * (0.99834 * g.piM - sS + g.piS);
  const penumbra = 1.02 * (0.99834 * g.piM + sS + g.piS);
  const umbralMag = (umbra + sM - sep) / (2 * sM);
  const penumbralMag = (penumbra + sM - sep) / (2 * sM);
  if (penumbralMag <= 0) return null;
  const type = umbralMag >= 1 ? 'total' : umbralMag > 0 ? 'partial' : 'penumbral';
  return { t: utFromTt(tMax), type, umbralMag, penumbralMag };
}

export interface SolarEclipse {
  t: number; // UT of geocentric conjunction minimum
  type: 'partial' | 'annular' | 'total' | 'hybrid';
  /** Geocentric separation at greatest eclipse relative to the eclipse limit (0 central … 1 grazing). */
  gamma: number;
}

export function solarEclipseAt(eph: Ephemeris, newMoonUT: number): SolarEclipse | null {
  const tt = ttFromUt(newMoonUT);
  const sepAt = (t: number) => {
    const g = shadowGeometry(eph, t);
    return angleBetween(g.moon.dir, g.sun.dir);
  };
  const tMax = goldenMin(sepAt, tt - 0.3, tt + 0.3, 1e-5);
  const g = shadowGeometry(eph, tMax);
  const sep = sepAt(tMax);
  const limit = g.piM - g.piS + g.sun.radius + g.moon.radius;
  if (sep >= limit) return null;
  const centralLimit = g.piM - g.piS;
  let type: SolarEclipse['type'] = 'partial';
  if (sep < centralLimit) {
    // The Moon looks bigger from the point under the shadow axis than from the
    // Earth's centre; near the ends of the path the observer is no closer than
    // the centre. Total in the middle but annular at the ends is a hybrid.
    const gamma = sep / centralLimit;
    const D = g.moon.dist * AU_KM;
    const mid = g.moon.radius * D / (D - EARTH_RADIUS_KM * Math.sqrt(1 - gamma * gamma));
    if (mid <= g.sun.radius) type = 'annular';
    else if (g.moon.radius >= g.sun.radius) type = 'total';
    else type = 'hybrid';
  }
  return { t: utFromTt(tMax), type, gamma: sep / centralLimit };
}

export interface LocalEclipse {
  t: number; // UT of maximum at the site
  magnitude: number; // fraction of the Sun's diameter covered
  obscuration: number; // fraction of the Sun's area covered
  sunAlt: number;
  central: boolean;
}

/** How a solar eclipse looks from a given site (null if the Moon misses the Sun there). */
export function localSolarEclipse(eph: Ephemeris, site: EarthSite, aroundUT: number): LocalEclipse | null {
  const sepAt = (t: number) => {
    const f = makeFrame(eph, t, site);
    return angleBetween(observeBody(eph, f, 'moon').dir, observeBody(eph, f, 'sun').dir);
  };
  const t = goldenMin(sepAt, aroundUT - 0.25, aroundUT + 0.25, 1e-6);
  const f = makeFrame(eph, t, site);
  const sun = observeBody(eph, f, 'sun'), moon = observeBody(eph, f, 'moon');
  const d = angleBetween(sun.dir, moon.dir);
  const rs = sun.radius, rm = moon.radius;
  if (d >= rs + rm) return null;
  const magnitude = (rs + rm - d) / (2 * rs);
  let obscuration: number;
  if (d <= Math.abs(rm - rs)) obscuration = rm >= rs ? 1 : (rm * rm) / (rs * rs);
  else {
    const a1 = rs * rs * Math.acos((d * d + rs * rs - rm * rm) / (2 * d * rs));
    const a2 = rm * rm * Math.acos((d * d + rm * rm - rs * rs) / (2 * d * rm));
    const a3 = 0.5 * Math.sqrt((-d + rs + rm) * (d + rs - rm) * (d - rs + rm) * (d + rs + rm));
    obscuration = (a1 + a2 - a3) / (Math.PI * rs * rs);
  }
  return { t, magnitude, obscuration, sunAlt: altitudeOf(f, sun.dir), central: d < Math.abs(rm - rs) };
}

export function eclipses(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  for (const p of moonPhases(eph, jdUT0, jdUT1)) {
    if (p.data?.phase === 2) {
      const e = lunarEclipseAt(eph, p.t);
      if (e) {
        out.push({
          kind: 'lunar-eclipse', t: e.t,
          title: `${cap(e.type)} lunar eclipse`,
          detail: e.type === 'total' ? 'The Moon passes fully into Earth\'s shadow and turns coppery red.'
            : e.type === 'partial' ? `Earth's shadow covers ${(e.umbralMag * 100).toFixed(0)}% of the Moon's width.`
              : 'A subtle dimming as the Moon passes through Earth\'s outer shadow.',
          bodies: ['moon', 'sun'], importance: e.type === 'total' ? 3 : e.type === 'partial' ? 2 : 1,
          data: { type: e.type, umbralMag: e.umbralMag, penumbralMag: e.penumbralMag },
        });
      }
    } else if (p.data?.phase === 0) {
      const e = solarEclipseAt(eph, p.t);
      if (e) {
        out.push({
          kind: 'solar-eclipse', t: e.t,
          title: `${cap(e.type)} solar eclipse`,
          detail: e.type === 'total' ? 'The Moon completely covers the Sun along a narrow path.'
            : e.type === 'annular' ? 'The Moon is too small to cover the Sun, leaving a ring of fire.'
              : e.type === 'hybrid' ? 'Total along part of its path and annular elsewhere.'
                : 'The Moon covers part of the Sun as seen from part of the Earth.',
          bodies: ['moon', 'sun'], importance: e.type === 'partial' ? 2 : 3,
          data: { type: e.type, gamma: e.gamma },
        });
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ meteor showers

export interface MeteorShower {
  id: string;
  name: string;
  /** Solar longitude of the peak (J2000, degrees). */
  peakLon: number;
  /** Radiant (J2000, degrees). */
  ra: number;
  dec: number;
  zhr: number;
  speed: number; // km/s
  parent: string;
}

// International Meteor Organization working list (approximate values).
export const METEOR_SHOWERS: MeteorShower[] = [
  { id: 'qua', name: 'Quadrantids', peakLon: 283.15, ra: 230, dec: 49, zhr: 110, speed: 41, parent: 'asteroid 2003 EH1' },
  { id: 'lyr', name: 'Lyrids', peakLon: 32.32, ra: 271, dec: 34, zhr: 18, speed: 49, parent: 'Comet Thatcher' },
  { id: 'eta', name: 'Eta Aquariids', peakLon: 45.5, ra: 338, dec: -1, zhr: 50, speed: 66, parent: "Halley's Comet" },
  { id: 'sda', name: 'Southern Delta Aquariids', peakLon: 127, ra: 340, dec: -16, zhr: 25, speed: 41, parent: 'Comet 96P/Machholz' },
  { id: 'per', name: 'Perseids', peakLon: 140.0, ra: 48, dec: 58, zhr: 100, speed: 59, parent: 'Comet Swift–Tuttle' },
  { id: 'dra', name: 'Draconids', peakLon: 195.4, ra: 262, dec: 54, zhr: 10, speed: 20, parent: 'Comet Giacobini–Zinner' },
  { id: 'ori', name: 'Orionids', peakLon: 208, ra: 95, dec: 16, zhr: 20, speed: 66, parent: "Halley's Comet" },
  { id: 'leo', name: 'Leonids', peakLon: 235.27, ra: 152, dec: 22, zhr: 15, speed: 71, parent: 'Comet Tempel–Tuttle' },
  { id: 'gem', name: 'Geminids', peakLon: 262.2, ra: 112, dec: 33, zhr: 150, speed: 35, parent: 'asteroid 3200 Phaethon' },
  { id: 'urs', name: 'Ursids', peakLon: 270.7, ra: 217, dec: 76, zhr: 10, speed: 33, parent: 'Comet 8P/Tuttle' },
];

export function meteorShowers(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  const out: AstroEvent[] = [];
  const t0 = ttFromUt(jdUT0), t1 = ttFromUt(jdUT1);
  for (const s of METEOR_SHOWERS) {
    const f = (t: number) => angleDiff(solarLongitudeJ2000(eph, t), s.peakLon * DEG);
    for (const c of findCrossings(f, t0, t1, 3, Math.PI)) {
      if (!c.rising) continue;
      const t = utFromTt(c.t);
      // Moonlight matters: how full is the Moon at the peak?
      const fr = geoFrame(eph, t);
      const illum = observeBody(eph, fr, 'moon').illum;
      out.push({
        kind: 'meteor-shower', t, title: `${s.name} peak`,
        detail: `Up to ~${s.zhr} meteors an hour under dark skies, from debris of ${s.parent}.${illum > 0.6 ? ' A bright Moon will wash out the fainter ones.' : illum < 0.3 ? ' Little moonlight this year.' : ''}`,
        bodies: [], importance: s.zhr >= 50 ? (illum < 0.5 ? 3 : 2) : 1,
        data: { shower: s.id, moonIllum: illum, ra: s.ra, dec: s.dec },
      });
    }
  }
  return out;
}

/** Every calendar event in a range, sorted. */
export function allEvents(eph: Ephemeris, jdUT0: number, jdUT1: number): AstroEvent[] {
  return [
    ...moonPhases(eph, jdUT0, jdUT1),
    ...seasons(eph, jdUT0, jdUT1),
    ...conjunctions(eph, jdUT0, jdUT1),
    ...oppositionsAndElongations(eph, jdUT0, jdUT1),
    ...eclipses(eph, jdUT0, jdUT1),
    ...meteorShowers(eph, jdUT0, jdUT1),
  ].sort((a, b) => a.t - b.t);
}
