// The Moon phase calendar: one calendar month at a site, day by day. Each day
// carries the Moon's face that evening, its phase, age, distance, rising and
// setting, and how much of the night is dark with the Moon down (what matters
// for faint stars, the Milky Way and astrophotography). The month carries its
// principal phases, perigees and apogees, and eclipses. No DOM here.

import { type AstroEvent, seasons } from '../astro/events.ts';
import type { Ephemeris } from '../astro/ephemeris.ts';
import { makeFrame, observeBody, altitudeOf } from '../astro/ephemeris.ts';
import { type MoonFace, type MoonUp, type NightSky, MOON_MEAN_KM, moonFace, nightSky } from '../astro/lunar.ts';
import { AU_KM } from '../astro/math.ts';
import { findMaxima, findMinima } from '../astro/search.ts';
import { ttFromUt } from '../astro/time.ts';
import { type ZoneSite, jdFromLocal, localTime } from './format.ts';
import { daysInMonth } from './timeline.ts';
import { moonElongation, moonPhaseName } from './tonight.ts';
import { type Site, type Universe, earthSite } from './universe.ts';

/** Synodic month, days. */
export const SYNODIC_MONTH = 29.530589;

/** The hour (local) at which each day's picture and phase are taken. */
export const EVENING_HOUR = 22;

/** A full Moon closer than this (km) is usually called a supermoon; farther than the other, a micromoon. */
export const SUPERMOON_KM = 360_000;
export const MICROMOON_KM = 405_000;

export interface MoonDay {
  year: number;
  month: number;
  day: number;
  /** 0 = Sunday. */
  weekday: number;
  /** The evening instant the face and numbers are for (local 22:00), UT. */
  jd: number;
  face: MoonFace;
  illum: number;
  phaseName: string;
  waxing: boolean;
  /** Days since the last new Moon. */
  age: number;
  /** A principal phase (0 new, 1 first quarter, 2 full, 3 last quarter) during this local date. */
  quarter: { q: number; t: number } | null;
  /** Moonrise and moonset between this noon and the next (as on Tonight), if they happen. */
  rise: number | null;
  set: number | null;
  /** The night that starts this evening. */
  night: NightSky;
  /** Eclipses whose greatest moment falls on this local date. */
  eclipses: AstroEvent[];
  /** Perigee or apogee on this local date. */
  apsis: { kind: 'perigee' | 'apogee'; t: number; km: number } | null;
  /** 'super' or 'micro' on the date of a full Moon near perigee or apogee. */
  size: 'super' | 'micro' | null;
  /** On the date of a full Moon: its traditional name, and whether it is a Blue Moon. */
  fullName: FullMoonName | null;
  blue: boolean;
}

export interface MoonMonth {
  year: number;
  month: number;
  days: MoonDay[];
  quarters: { q: number; t: number; km: number }[];
  apsides: { kind: 'perigee' | 'apogee'; t: number; km: number }[];
  /** Eclipses this month, and whether the Moon (lunar) or Sun (solar) is up here at greatest eclipse. */
  eclipses: { event: AstroEvent; upHere: boolean }[];
  /** The longest astronomical darkness of any night this month, hours (the scale for the dark-sky bars). */
  maxDark: number;
}

// ------------------------------------------------------------------ full Moon names

export interface FullMoonName {
  /** "Beaver Moon". */
  name: string;
  /** Where the name comes from, in a line. */
  story: string;
}

/**
 * The traditional North American full Moon names by month, as almanacs print
 * them (drawn from Algonquin and colonial usage). The Harvest Moon and the
 * Hunter's Moon follow the September equinox instead of the calendar.
 */
export const FULL_MOON_NAMES: FullMoonName[] = [
  { name: 'Wolf Moon', story: 'Wolves were heard howling in the hungry midwinter.' },
  { name: 'Snow Moon', story: 'February is often the snowiest month.' },
  { name: 'Worm Moon', story: 'The ground thaws and earthworms surface.' },
  { name: 'Pink Moon', story: 'Named for early spring wildflowers, the pink moss phlox.' },
  { name: 'Flower Moon', story: 'Flowers bloom everywhere in May.' },
  { name: 'Strawberry Moon', story: 'Wild strawberries ripen for picking in June.' },
  { name: 'Buck Moon', story: 'Male deer grow new antlers in midsummer.' },
  { name: 'Sturgeon Moon', story: 'Sturgeon were most easily caught in the Great Lakes in August.' },
  { name: 'Corn Moon', story: 'Corn is gathered in September.' },
  { name: 'Hunter’s Moon', story: 'The full Moon after the Harvest Moon, lighting hunts after the fields were cleared.' },
  { name: 'Beaver Moon', story: 'Beavers build up their lodges, and traps were set before the swamps froze.' },
  { name: 'Cold Moon', story: 'The long nights of December turn bitterly cold.' },
];
const HARVEST: FullMoonName = { name: 'Harvest Moon', story: 'The full Moon nearest the September equinox. It rises soon after sunset several evenings running, so farmers could keep harvesting by its light.' };

const equinoxes = new Map<number, number | null>();

/** The September equinox of a year (UT), cached. */
function septemberEquinox(eph: Ephemeris, year: number): number | null {
  if (!equinoxes.has(year)) {
    const e = seasons(eph, jdFromCalendarUT(year, 9, 10), jdFromCalendarUT(year, 10, 5)).find((x) => x.data?.season === 2);
    equinoxes.set(year, e?.t ?? null);
  }
  return equinoxes.get(year)!;
}
const jdFromCalendarUT = (y: number, m: number, d: number) => jdFromLocal({ lon: 0, tz: '' }, y, m, d);

/** The traditional name of the full Moon at `t` (UT), by the local calendar month. */
export function fullMoonName(eph: Ephemeris, site: ZoneSite, t: number): FullMoonName {
  const lt = localTime(t, site);
  const eq = septemberEquinox(eph, lt.year);
  if (eq !== null && lt.month >= 8 && lt.month <= 11) {
    const from = t - eq;
    if (Math.abs(from) < SYNODIC_MONTH / 2) return HARVEST;
    // The one after the Harvest Moon; in a late year that takes November's name.
    if (from >= SYNODIC_MONTH / 2 && from < 1.5 * SYNODIC_MONTH) return FULL_MOON_NAMES[9];
    if (lt.month === 9 || lt.month === 10) return FULL_MOON_NAMES[8];
  }
  return FULL_MOON_NAMES[lt.month - 1];
}

/** Whether the full Moon at `t` is the second in its local calendar month, given other full Moons around it. */
export function isBlueMoon(site: ZoneSite, t: number, fullMoons: number[]): boolean {
  const lt = localTime(t, site);
  return fullMoons.some((o) => o < t - 1 && t - o < 32 && (() => {
    const l = localTime(o, site);
    return l.year === lt.year && l.month === lt.month;
  })());
}

/** Which way is up for the calendar's pictures: as the Moon looks from this hemisphere. */
export function hemisphereUp(site: Site): MoonUp {
  return site.lat < 0 ? 'south' : 'north';
}

/** The span of calendar events `moonMonth` needs: from a month before the 1st to the day after the last. */
export function moonMonthSpan(site: Site, year: number, month: number): [number, number] {
  const first = jdFromLocal(site, year, month, 1);
  return [first - SYNODIC_MONTH - 1, first + daysInMonth(year, month) + 1];
}

/**
 * One calendar month of the Moon at the universe's site, given the calendar
 * events (Moon phases and eclipses, as the events worker makes them) over
 * `moonMonthSpan`. Takes about 0.15 s.
 */
export function moonMonth(u: Universe, year: number, month: number, events: AstroEvent[]): MoonMonth {
  const site = u.site;
  const es = earthSite(site);
  const n = daysInMonth(year, month);
  const first = jdFromLocal(site, year, month, 1);
  const next = month === 12 ? jdFromLocal(site, year + 1, 1, 1) : jdFromLocal(site, year, month + 1, 1);
  const eph = u.eph;

  const phases = events.filter((e) => e.kind === 'moon-phase').sort((a, b) => a.t - b.t);
  const newMoons = phases.filter((p) => p.data?.phase === 0).map((p) => p.t);
  const geoKm = (jdUT: number) => eph.moonGeo(ttFromUt(jdUT)).reduce((s, x) => s + x * x, 0) ** 0.5 * AU_KM;
  const quarters = phases.filter((p) => p.t >= first && p.t < next)
    .map((p) => ({ q: Number(p.data?.phase), t: p.t, km: geoKm(p.t) }));
  const apsides = [
    ...findMinima(geoKm, first - 1, next + 1, 0.5).map((e) => ({ kind: 'perigee' as const, t: e.t, km: e.value })),
    ...findMaxima(geoKm, first - 1, next + 1, 0.5).map((e) => ({ kind: 'apogee' as const, t: e.t, km: e.value })),
  ].filter((a) => a.t >= first && a.t < next).sort((a, b) => a.t - b.t);
  const ecl = events.filter((e) => (e.kind === 'lunar-eclipse' || e.kind === 'solar-eclipse') && e.t >= first && e.t < next).map((event) => {
    const f = makeFrame(eph, event.t, es);
    const body = event.kind === 'lunar-eclipse' ? 'moon' : 'sun';
    return { event, upHere: altitudeOf(f, observeBody(eph, f, body).dir) > -0.8333 * Math.PI / 180 };
  });

  const up = hemisphereUp(site);
  const days: MoonDay[] = [];
  for (let d = 1; d <= n; d++) {
    const dayStart = jdFromLocal(site, year, month, d);
    const dayEnd = d < n ? jdFromLocal(site, year, month, d + 1) : next;
    const jd = jdFromLocal(site, year, month, d, EVENING_HOUR);
    const f = makeFrame(eph, jd, es);
    const face = moonFace(eph, f, up);
    const elong = moonElongation(u, f);
    const lastNew = newMoons.filter((t) => t <= jd).pop() ?? jd;
    // The night from this noon to the next, as Tonight counts it.
    const night = nightSky(eph, es, jdFromLocal(site, year, month, d, 12));
    const inDay = (t: number) => t >= dayStart && t < dayEnd;
    const quarter = quarters.find((q) => inDay(q.t)) ?? null;
    const apsis = apsides.find((a) => inDay(a.t)) ?? null;
    const full = quarter?.q === 2 ? quarter : null;
    const fullMoons = phases.filter((p) => p.data?.phase === 2).map((p) => p.t);
    days.push({
      year, month, day: d, weekday: localTime(jd, site).weekday, jd, face,
      illum: face.illum, phaseName: moonPhaseName(elong), waxing: elong < Math.PI,
      age: jd - lastNew,
      quarter: quarter ? { q: quarter.q, t: quarter.t } : null,
      rise: night.moonRise, set: night.moonSet, night,
      eclipses: ecl.filter((e) => inDay(e.event.t)).map((e) => e.event),
      apsis,
      size: full ? (full.km < SUPERMOON_KM ? 'super' : full.km > MICROMOON_KM ? 'micro' : null) : null,
      fullName: full ? fullMoonName(eph, site, full.t) : null,
      blue: full ? isBlueMoon(site, full.t, fullMoons) : false,
    });
  }
  return {
    year, month, days, quarters, apsides, eclipses: ecl,
    maxDark: Math.max(0, ...days.map((x) => x.night.darkHours)),
  };
}

/** How much wider the Moon looks than at its mean distance, as a signed percentage. */
export function sizeVsMean(km: number): number {
  return (MOON_MEAN_KM / km - 1) * 100;
}

/**
 * The run of nights with the most dark sky and the Moon down: the best stretch
 * for faint things. Returns the first and last day numbers, or null.
 */
export function darkestStretch(m: MoonMonth): [number, number] | null {
  const best = Math.max(...m.days.map((d) => d.night.moonlessHours));
  if (best < 1) return null;
  const good = (d: MoonDay) => d.night.moonlessHours >= best * 0.75;
  let run: [number, number] | null = null, cur: [number, number] | null = null;
  for (const d of m.days) {
    if (good(d)) cur = cur ? [cur[0], d.day] : [d.day, d.day];
    else cur = null;
    if (cur && (!run || cur[1] - cur[0] > run[1] - run[0])) run = [...cur] as [number, number];
  }
  return run;
}
