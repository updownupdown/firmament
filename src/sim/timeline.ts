// The timeline in the time bar: which span of time it shows at each zoom, how
// to step to the same clock time on another day, and the moments of a night
// (sunset, darkness, rising and setting) as a list to jump to. No DOM here.

import type { Tonight, TonightBody } from './tonight.ts';
import { type ZoneSite, jdFromLocal, localTime } from './format.ts';

export type TimelineZoom = 'night' | 'month' | 'year';

export interface TimelineWindow {
  zoom: TimelineZoom;
  /** UT Julian dates; the strip runs from start to end. */
  start: number;
  end: number;
}

/** Local noon at or before the instant. */
export function noonBefore(jdUT: number, site: ZoneSite): number {
  const lt = localTime(jdUT, site);
  const noon = jdFromLocal(site, lt.year, lt.month, lt.day, 12);
  return noon > jdUT + 1e-9 ? jdFromLocal(site, ...prevDay(lt.year, lt.month, lt.day), 12) : noon;
}

function prevDay(y: number, m: number, d: number): [number, number, number] {
  if (d > 1) return [y, m, d - 1];
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  return [py, pm, daysInMonth(py, pm)];
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) {
    // The app's calendar is Julian before 1582: every fourth year is a leap year.
    const gregorian = year > 1582;
    const leap = gregorian ? (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 : ((year % 4) + 4) % 4 === 0;
    return leap ? 29 : 28;
  }
  return [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

/** The span the strip shows around an instant: noon to noon, a calendar month, or a calendar year. */
export function timelineWindow(zoom: TimelineZoom, jdUT: number, site: ZoneSite): TimelineWindow {
  if (zoom === 'night') {
    const start = noonBefore(jdUT, site);
    const lt = localTime(start, site);
    // The next noon by the calendar, so a daylight-saving change keeps it on noon.
    const nm = lt.day < daysInMonth(lt.year, lt.month) ? [lt.year, lt.month, lt.day + 1] : lt.month === 12 ? [lt.year + 1, 1, 1] : [lt.year, lt.month + 1, 1];
    return { zoom, start, end: jdFromLocal(site, nm[0], nm[1], nm[2], 12) };
  }
  const lt = localTime(jdUT, site);
  if (zoom === 'month') {
    const next = lt.month === 12 ? [lt.year + 1, 1] : [lt.year, lt.month + 1];
    return { zoom, start: jdFromLocal(site, lt.year, lt.month, 1), end: jdFromLocal(site, next[0], next[1], 1) };
  }
  return { zoom, start: jdFromLocal(site, lt.year, 1, 1), end: jdFromLocal(site, lt.year + 1, 1, 1) };
}

/** The same local clock time, `n` days, months or years away (day of month clamped). */
export function shiftSameTime(jdUT: number, site: ZoneSite, unit: 'day' | 'month' | 'year', n: number): number {
  const lt = localTime(jdUT, site);
  let { year, month, day } = lt;
  if (unit === 'day') {
    // Through the calendar, so a daylight-saving change keeps the clock time.
    const noon = jdFromLocal(site, year, month, day, 12) + n;
    ({ year, month, day } = localTime(noon, site));
  } else {
    const total = (unit === 'month' ? n : 12 * n) + (month - 1);
    year += Math.floor(total / 12);
    month = ((total % 12) + 12) % 12 + 1;
    day = Math.min(day, daysInMonth(year, month));
  }
  return jdFromLocal(site, year, month, day, lt.hour, lt.minute, lt.second);
}

/** The date of `dateJd` with the local clock time of `clockJd`. */
export function withClockOf(dateJd: number, clockJd: number, site: ZoneSite): number {
  const d = localTime(dateJd, site), c = localTime(clockJd, site);
  return jdFromLocal(site, d.year, d.month, d.day, c.hour, c.minute, c.second);
}

export interface Moment {
  t: number;
  label: string;
  /** For colour: 'sun', 'moon', or a planet id. */
  body: string;
}

const NAMES: Record<string, string> = { mercury: 'Mercury', venus: 'Venus', mars: 'Mars', jupiter: 'Jupiter', saturn: 'Saturn' };
/** Planets worth a lane and a moment: the ones anyone can see. */
export const BRIGHT_PLANETS = Object.keys(NAMES);

/**
 * Rising and setting in broad daylight is no use to a stargazer: the Moon and
 * planets are shown from sunset to sunrise.
 */
export function nightSpan(night: Tonight, start: number, end: number): [number, number] {
  const tw = night.twilight;
  const from = tw.sunset !== null ? Math.max(start, tw.sunset) : start;
  const until = tw.sunrise !== null && tw.sunrise > from ? Math.min(end, tw.sunrise) : end;
  return [from, until];
}

/** Sunset, darkness, rising, setting and best moments of a night, in order, inside the window. */
export function nightMoments(night: Tonight, start: number, end: number): Moment[] {
  const out: Moment[] = [];
  const tw = night.twilight;
  const [from, until] = nightSpan(night, start, end);
  const add = (t: number | null, label: string, body: string) => {
    if (t === null || t < start || t >= end) return;
    if (body !== 'sun' && (t < from || t > until)) return;
    out.push({ t, label, body });
  };
  add(tw.sunset, 'Sunset', 'sun');
  add(tw.astroDusk, 'Dark', 'sun');
  add(night.moon.rise, 'Moonrise', 'moon');
  add(night.moon.set, 'Moonset', 'moon');
  for (const p of night.planets) {
    if (!p.visible || !NAMES[p.id]) continue;
    add(p.rise, `${NAMES[p.id]} rises`, p.id);
    add(p.best, `${NAMES[p.id]} best`, p.id);
    add(p.set, `${NAMES[p.id]} sets`, p.id);
  }
  add(tw.astroDawn, 'Dawn', 'sun');
  add(tw.sunrise, 'Sunrise', 'sun');
  return out.sort((a, b) => a.t - b.t);
}

/** When a body is above the horizon within [start, end], from its first rise and set in that span. */
export function upSpans(body: TonightBody, start: number, end: number): [number, number][] {
  const { rise, set } = body;
  if (rise === null && set === null) return body.visible ? [[start, end]] : [];
  if (rise !== null && set === null) return [[rise, end]];
  if (rise === null && set !== null) return [[start, set]];
  return rise! < set! ? [[rise!, set!]] : [[start, set!], [rise!, end]];
}

export function planetName(id: string): string {
  return NAMES[id] ?? id;
}
