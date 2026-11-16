// Time scales and calendars.
//
// Internally every instant is a Julian date. `jdUT` is on the UT1 scale (we treat
// UTC as UT1; the difference is under a second) and `jdTT` on Terrestrial Time.
// They differ by ΔT, which is measured for 1657–2023, predicted to 2032 and
// modelled with the Espenak–Meeus polynomials outside that range.

import deltatTable from '../../public/data/deltat.json' with { type: 'json' };
import { poly } from './math.ts';

export const J2000 = 2451545.0;
export const UNIX_EPOCH_JD = 2440587.5;
export const DAY_MS = 86400000;
/** First Gregorian day (1582-10-15). Earlier dates are shown in the Julian calendar. */
export const GREGORIAN_START_JD = 2299160.5;

export function jdFromMs(ms: number): number {
  return ms / DAY_MS + UNIX_EPOCH_JD;
}

export function msFromJd(jd: number): number {
  return (jd - UNIX_EPOCH_JD) * DAY_MS;
}

export function jdNow(): number {
  return jdFromMs(Date.now());
}

/** Julian centuries of TT since J2000. */
export function centuries(jdTT: number): number {
  return (jdTT - J2000) / 36525;
}

export type CalendarKind = 'gregorian' | 'julian';

export interface CalendarDate {
  /** Astronomical year numbering: 0 = 1 BC, -1 = 2 BC. */
  year: number;
  month: number; // 1..12
  day: number; // 1..31
  hour: number;
  minute: number;
  second: number;
  calendar: CalendarKind;
}

/** Meeus ch. 7. `calendar` defaults to Gregorian from 1582-10-15, Julian before. */
export function jdFromCalendar(
  year: number, month: number, day: number,
  hour = 0, minute = 0, second = 0,
  calendar?: CalendarKind,
): number {
  let y = year, m = month;
  if (m <= 2) { y -= 1; m += 12; }
  const dayFrac = day + (hour + (minute + second / 60) / 60) / 24;
  const kind = calendar ?? (
    year > 1582 || (year === 1582 && (month > 10 || (month === 10 && day >= 15))) ? 'gregorian' : 'julian'
  );
  let b = 0;
  if (kind === 'gregorian') {
    const a = Math.floor(y / 100);
    b = 2 - a + Math.floor(a / 4);
  }
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + dayFrac + b - 1524.5;
}

/** Inverse of jdFromCalendar (Meeus ch. 7), valid for any jd ≥ 0. */
export function calendarFromJd(jd: number, calendar?: CalendarKind): CalendarDate {
  const kind = calendar ?? (jd >= GREGORIAN_START_JD ? 'gregorian' : 'julian');
  if (jd < 0 && kind === 'julian') {
    // The algorithm needs jd ≥ 0; the Julian calendar repeats every 4 years (1461 days).
    const k = Math.ceil(-jd / 1461) + 1;
    const c = calendarFromJd(jd + k * 1461, 'julian');
    return { ...c, year: c.year - 4 * k };
  }
  const j = jd + 0.5;
  const z = Math.floor(j);
  const f = j - z;
  let a = z;
  if (kind === 'gregorian') {
    const alpha = Math.floor((z - 1867216.25) / 36524.25);
    a = z + 1 + alpha - Math.floor(alpha / 4);
  }
  const b = a + 1524;
  const c = Math.floor((b - 122.1) / 365.25);
  const d = Math.floor(365.25 * c);
  const e = Math.floor((b - d) / 30.6001);
  const dayFrac = b - d - Math.floor(30.6001 * e) + f;
  const month = e < 14 ? e - 1 : e - 13;
  const year = month > 2 ? c - 4716 : c - 4715;
  let day = Math.floor(dayFrac);
  let secs = Math.round((dayFrac - day) * 86400 * 1000) / 1000;
  if (secs >= 86400) { secs -= 86400; day += 1; } // rounding edge; good enough for display
  const hour = Math.floor(secs / 3600);
  const minute = Math.floor((secs - hour * 3600) / 60);
  const second = secs - hour * 3600 - minute * 60;
  return { year, month, day, hour, minute, second, calendar: kind };
}

/** Decimal year (approximate, for ΔT and display). */
export function decimalYear(jd: number): number {
  return 2000 + (jd - J2000) / 365.25;
}

export function jdFromDecimalYear(y: number): number {
  return J2000 + (y - 2000) * 365.25;
}

const DT_YEARS: number[] = deltatTable.years;
const DT_SECONDS: number[] = deltatTable.seconds;
const DT_FIRST = DT_YEARS[0];
const DT_LAST = DT_YEARS[DT_YEARS.length - 1];

function deltaTPolynomial(y: number): number {
  if (y < -500) { const u = (y - 1820) / 100; return -20 + 32 * u * u; }
  if (y < 500) return poly(y / 100, [10583.6, -1014.41, 33.78311, -5.952053, -0.1798452, 0.022174192, 0.0090316521]);
  if (y < 1600) return poly((y - 1000) / 100, [1574.2, -556.01, 71.23472, 0.319781, -0.8503463, -0.005050998, 0.0083572073]);
  if (y < 1700) return poly(y - 1600, [120, -0.9808, -0.01532, 1 / 7129]);
  if (y < 2050) return poly((y - 2000) / 100, [62.92, 32.217, 55.89]);
  if (y < 2150) return poly((y - 1820) / 100, [-205.72, 56.28, 32]);
  const u = (y - 1820) / 100;
  return -20 + 32 * u * u;
}

function deltaTTable(y: number): number {
  let lo = 0, hi = DT_YEARS.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (DT_YEARS[mid] <= y) lo = mid; else hi = mid;
  }
  const t = (y - DT_YEARS[lo]) / (DT_YEARS[hi] - DT_YEARS[lo]);
  return DT_SECONDS[lo] + (DT_SECONDS[hi] - DT_SECONDS[lo]) * t;
}

/** ΔT = TT − UT in seconds for a decimal year. Continuous across model boundaries. */
export function deltaTForYear(y: number): number {
  if (y >= DT_FIRST && y <= DT_LAST) return deltaTTable(y);
  // Outside the table, use the polynomial with an offset that removes the jump
  // at the table edge and fades out over a century.
  if (y > DT_LAST) {
    const off = DT_SECONDS[DT_SECONDS.length - 1] - deltaTPolynomial(DT_LAST);
    const fade = Math.max(0, 1 - (y - DT_LAST) / 100);
    return deltaTPolynomial(y) + off * fade;
  }
  const off = DT_SECONDS[0] - deltaTPolynomial(DT_FIRST);
  const fade = Math.max(0, 1 - (DT_FIRST - y) / 100);
  return deltaTPolynomial(y) + off * fade;
}

export function deltaT(jdUT: number): number {
  return deltaTForYear(decimalYear(jdUT));
}

export function ttFromUt(jdUT: number): number {
  return jdUT + deltaT(jdUT) / 86400;
}

export function utFromTt(jdTT: number): number {
  // ΔT changes slowly, so one fixed-point step is plenty.
  let ut = jdTT - deltaT(jdTT) / 86400;
  ut = jdTT - deltaT(ut) / 86400;
  return ut;
}

/** Rough ΔT uncertainty in seconds (Morrison & Stephenson style), for accuracy labels. */
export function deltaTUncertainty(y: number): number {
  if (y >= 1957 && y <= 2026) return 0.1;
  if (y >= 1700 && y < 1957) return 1;
  if (y > 2026) return Math.min(1e6, 0.5 + 0.8 * Math.pow((y - 2026) / 10, 2));
  const u = (y - 1820) / 100;
  return 0.8 * u * u + 5;
}
