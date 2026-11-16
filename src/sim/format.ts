// Turning instants, angles and distances into text. No DOM here, so it is
// testable in Node; Intl is used only for time-zone offsets.

import { AU_KM, DEG, LY_PC, PC_AU, wrap2pi } from '../astro/math.ts';
import { type CalendarDate, calendarFromJd, jdFromCalendar, msFromJd } from '../astro/time.ts';

/** What formatting needs to know about where the observer is. */
export interface ZoneSite {
  /** Degrees, east positive. */
  lon: number;
  /** IANA time zone, or '' to always use local mean time. */
  tz: string;
}

export interface ZoneOffset {
  minutes: number;
  /** 'zone' = civil time from the IANA zone; 'lmt' = local mean time from longitude. */
  kind: 'zone' | 'lmt';
}

const formatters = new Map<string, Intl.DateTimeFormat | null>();

function zoneFormatter(tz: string): Intl.DateTimeFormat | null {
  let f = formatters.get(tz);
  if (f === undefined) {
    try {
      f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
        hour: 'numeric', minute: 'numeric', second: 'numeric',
      });
    } catch {
      f = null; // unknown zone on this platform
    }
    formatters.set(tz, f);
  }
  return f;
}

// Civil time zones only mean something in the era that had them. Outside this
// window we show local mean time, which is what a sundial-era clock would read.
const ZONE_FIRST_YEAR = 1900;
const ZONE_LAST_YEAR = 2500;

/** Offset of local time from UT at an instant. */
export function zoneOffset(site: ZoneSite, jdUT: number): ZoneOffset {
  const year = calendarFromJd(jdUT).year;
  if (site.tz && year >= ZONE_FIRST_YEAR && year <= ZONE_LAST_YEAR) {
    const f = zoneFormatter(site.tz);
    if (f) {
      const ms = Math.round(msFromJd(jdUT) / 1000) * 1000;
      const p: Record<string, number> = {};
      for (const part of f.formatToParts(new Date(ms))) {
        if (part.type !== 'literal') p[part.type] = Number(part.value);
      }
      const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
      return { minutes: Math.round((asUTC - ms) / 60000), kind: 'zone' };
    }
  }
  return { minutes: Math.round(site.lon * 4), kind: 'lmt' };
}

export interface LocalTime extends CalendarDate {
  offset: ZoneOffset;
  /** 0 = Sunday. */
  weekday: number;
}

/** Local calendar date and time at an instant (rounded to the nearest second). */
export function localTime(jdUT: number, site: ZoneSite): LocalTime {
  const offset = zoneOffset(site, jdUT);
  const jdLocal = Math.round((jdUT + offset.minutes / 1440) * 86400) / 86400;
  const cal = calendarFromJd(jdLocal + 1e-9);
  cal.second = Math.min(59, Math.floor(cal.second + 1e-3));
  const weekday = ((Math.floor(jdLocal + 1.5) % 7) + 7) % 7;
  return { ...cal, offset, weekday };
}

/** Instant (UT Julian date) of a local wall-clock time at a site. */
export function jdFromLocal(
  site: ZoneSite, year: number, month: number, day: number, hour = 0, minute = 0, second = 0,
): number {
  const wall = jdFromCalendar(year, month, day, hour, minute, second);
  let jd = wall - zoneOffset(site, wall).minutes / 1440;
  // The offset depends on the instant (daylight saving), so settle it.
  jd = wall - zoneOffset(site, jd).minutes / 1440;
  return jd;
}

/**
 * Local noon that anchors "tonight": today's noon, or yesterday's while the
 * small hours of the night are still running (before 06:00).
 */
export function nightAnchor(jdUT: number, site: ZoneSite): number {
  const lt = localTime(jdUT, site);
  const noon = jdFromLocal(site, lt.year, lt.month, lt.day, 12);
  return lt.hour < 6 ? noon - 1 : noon;
}

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Astronomical year → the way people write it: 2026, AD 79, 3000 BC. */
export function formatYear(year: number): string {
  if (year <= 0) return `${(1 - year).toLocaleString('en-US')} BC`;
  if (year < 1000) return `AD ${year}`;
  return year >= 10000 ? year.toLocaleString('en-US') : String(year);
}

const pad = (n: number) => String(n).padStart(2, '0');

export interface TimeStyle {
  hour12?: boolean;
  seconds?: boolean;
}

export function formatClock(hour: number, minute: number, second: number, style: TimeStyle = {}): string {
  const tail = `:${pad(minute)}${style.seconds ? ':' + pad(second) : ''}`;
  if (!style.hour12) return `${pad(hour)}${tail}`;
  return `${hour % 12 === 0 ? 12 : hour % 12}${tail} ${hour < 12 ? 'am' : 'pm'}`;
}

/** Time of day at the site, rounded to the minute unless seconds are asked for. */
export function formatTime(jdUT: number, site: ZoneSite, style: TimeStyle = {}): string {
  const lt = localTime(style.seconds ? jdUT : Math.round(jdUT * 1440) / 1440, site);
  return formatClock(lt.hour, lt.minute, lt.second, style);
}

export interface DateStyle {
  weekday?: boolean;
  /** Leave the year off (for lists within one year). */
  noYear?: boolean;
  long?: boolean;
}

export function formatDate(jdUT: number, site: ZoneSite, style: DateStyle = {}): string {
  const lt = localTime(jdUT, site);
  const month = (style.long ? MONTHS : MONTHS_SHORT)[lt.month - 1];
  let s = `${lt.day} ${month}`;
  if (!style.noYear) s += ` ${formatYear(lt.year)}`;
  if (style.weekday) s = `${(style.long ? WEEKDAYS[lt.weekday] : WEEKDAYS[lt.weekday].slice(0, 3))} ${s}`;
  return s;
}

/** "UTC−5", "UTC+5:30", or "local mean time" when no civil zone applies. */
export function formatZone(offset: ZoneOffset): string {
  if (offset.kind === 'lmt') return 'local mean time';
  const m = Math.abs(offset.minutes);
  if (m === 0) return 'UTC';
  const h = Math.floor(m / 60), mm = m % 60;
  return `UTC${offset.minutes < 0 ? '−' : '+'}${h}${mm ? ':' + pad(mm) : ''}`;
}

/** Notes that belong next to a date far from the present: calendar and time scale. */
export function calendarNote(jdUT: number, site: ZoneSite): string {
  const lt = localTime(jdUT, site);
  const parts: string[] = [];
  if (lt.calendar === 'julian') parts.push('Julian calendar');
  if (lt.offset.kind === 'lmt' && site.tz) parts.push('local mean time');
  return parts.join(', ');
}

// ------------------------------------------------------------------ angles

function sexagesimal(value: number, places: number): [number, number, number] {
  const scaleUp = Math.pow(10, places);
  let total = Math.round(Math.abs(value) * 3600 * scaleUp) / scaleUp;
  const a = Math.floor(total / 3600);
  total -= a * 3600;
  const b = Math.floor(total / 60);
  return [a, b, total - b * 60];
}

/** Right ascension in radians → "5h 35m 17s". */
export function formatRA(ra: number): string {
  const [h, m, s] = sexagesimal((wrap2pi(ra) / DEG) / 15, 0);
  return `${h % 24}h ${pad(m)}m ${pad(Math.round(s))}s`;
}

/** Declination or latitude-like angle in radians → "−5° 23′ 28″". */
export function formatDMS(angle: number): string {
  const [d, m, s] = sexagesimal(angle / DEG, 0);
  return `${angle < 0 ? '−' : '+'}${d}° ${pad(m)}′ ${pad(Math.round(s))}″`;
}

/** Degrees with a sensible number of decimals: "23.4°". */
export function formatDeg(angle: number, places = 1): string {
  const v = angle / DEG;
  const s = Math.abs(v).toFixed(places);
  return `${v < 0 && Number(s) !== 0 ? '−' : ''}${s}°`;
}

/** An angular size in the unit a person would use: 31′, 44″, 2.3°. */
export function formatAngularSize(angle: number): string {
  const deg = Math.abs(angle) / DEG;
  if (deg >= 1) return `${deg.toFixed(1)}°`;
  if (deg * 60 >= 1) return `${(deg * 60).toFixed(deg * 60 < 10 ? 1 : 0)}′`;
  const arcsec = deg * 3600;
  return `${arcsec.toFixed(arcsec < 10 ? 1 : 0)}″`;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
const COMPASS_WORDS: Record<string, string> = {
  N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest',
};

/** 16-point compass abbreviation for an azimuth (radians from north through east). */
export function compassPoint(az: number): string {
  return COMPASS[Math.round(wrap2pi(az) / (Math.PI / 8)) % 16];
}

/** 8-point compass direction in words: "southwest". */
export function compassWord(az: number): string {
  const p = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(wrap2pi(az) / (Math.PI / 4)) % 8];
  return COMPASS_WORDS[p];
}

/** Where to look, in plain words: "low in the southwest", "high overhead". */
export function describeSkyPosition(az: number, alt: number): string {
  const a = alt / DEG;
  if (a < 0) return 'below the horizon';
  if (a > 75) return 'almost overhead';
  const height = a < 10 ? 'very low' : a < 25 ? 'low' : a < 50 ? 'halfway up' : 'high';
  return `${height} in the ${compassWord(az)}`;
}

export function formatLatLon(latDeg: number, lonDeg: number): string {
  const f = (v: number, pos: string, neg: string) => `${Math.abs(v).toFixed(2)}° ${v >= 0 ? pos : neg}`;
  return `${f(latDeg, 'N', 'S')}, ${f(lonDeg, 'E', 'W')}`;
}

// ------------------------------------------------------------------ quantities

function sig(x: number, digits = 3): string {
  if (x === 0) return '0';
  const mag = Math.floor(Math.log10(Math.abs(x)));
  const places = Math.max(0, digits - 1 - mag);
  const v = Number(x.toPrecision(digits));
  return v.toLocaleString('en-US', { maximumFractionDigits: places });
}

/** A distance inside the solar system, given in AU. */
export function formatDistanceAU(au: number): string {
  const km = au * AU_KM;
  if (km < 1e6) return `${sig(km, 3)} km`;
  if (au < 0.1) return `${sig(km / 1e6, 3)} million km`;
  return `${sig(au, 3)} AU`;
}

/** A distance to a star, given in parsecs. */
export function formatDistancePc(pc: number): string {
  const ly = pc / LY_PC;
  if (ly < 0.1) return `${sig(pc * PC_AU, 3)} AU`;
  return `${sig(ly, 3)} light-years`;
}

/** How long light takes to cross a distance in AU. */
export function formatLightTime(au: number): string {
  const s = au * 499.004784;
  if (s < 90) return `${s.toFixed(1)} light-seconds`;
  if (s < 5400) return `${(s / 60).toFixed(1)} light-minutes`;
  return `${(s / 3600).toFixed(1)} light-hours`;
}

export function formatMagnitude(mag: number): string {
  return `${mag < 0 ? '−' : ''}${Math.abs(mag).toFixed(1)}`;
}

/** A span of days → "3 h 20 min", "45 min", "2.5 days". */
export function formatDuration(days: number): string {
  const min = Math.round(Math.abs(days) * 1440);
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) {
    const h = Math.floor(min / 60), m = min % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  const d = Math.abs(days);
  if (d < 60) return `${d.toFixed(d < 10 ? 1 : 0)} days`;
  if (d < 730) return `${Math.round(d / 30.44)} months`;
  return `${sig(d / 365.25, 3)} years`;
}

/** "in 3 days", "tomorrow", "5 days ago", relative to a reference instant. */
export function formatRelativeDay(jdUT: number, nowUT: number, site: ZoneSite): string {
  const dayNumber = (jd: number) => Math.floor(jd + zoneOffset(site, jd).minutes / 1440 + 0.5);
  const d = dayNumber(jdUT) - dayNumber(nowUT);
  if (d === 0) return 'today';
  if (d === 1) return 'tomorrow';
  if (d === -1) return 'yesterday';
  if (Math.abs(d) < 14) return d > 0 ? `in ${d} days` : `${-d} days ago`;
  if (Math.abs(d) < 60) return d > 0 ? `in ${Math.round(d / 7)} weeks` : `${Math.round(-d / 7)} weeks ago`;
  if (Math.abs(d) < 730) return d > 0 ? `in ${Math.round(d / 30.44)} months` : `${Math.round(-d / 30.44)} months ago`;
  return d > 0 ? `in ${Math.round(d / 365.25)} years` : `${Math.round(-d / 365.25)} years ago`;
}
