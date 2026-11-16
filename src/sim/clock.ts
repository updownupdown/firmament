// The simulation clock: one instant, a rate, and how much to trust the sky there.

import { precessionAccuracyDeg } from '../astro/frames.ts';
import { J2000, decimalYear, deltaTUncertainty, jdNow, ttFromUt } from '../astro/time.ts';

export const RANGE_YEARS = 100000;
export const JD_MIN = J2000 - RANGE_YEARS * 365.25;
export const JD_MAX = J2000 + RANGE_YEARS * 365.25;

export type AccuracyLevel = 'precise' | 'good' | 'approximate' | 'qualitative';

export interface Accuracy {
  level: AccuracyLevel;
  /** Short label for the time chip; empty when there is nothing to warn about. */
  label: string;
  /** One sentence explaining what is and isn't reliable at this date. */
  detail: string;
  /** Uncertainty in the Earth's rotation angle, degrees (from ΔT). */
  rotationDeg: number;
  /** Uncertainty in the direction of the pole and equinox, degrees. */
  precessionDeg: number;
}

/** How well the models hold at a date. Pure, so labels can be shown for any instant. */
export function accuracyAt(jdUT: number): Accuracy {
  const y = decimalYear(jdUT);
  // The Earth turns 15″ per second of time, so ΔT uncertainty is a rotation error.
  const rotationDeg = Math.min(180, deltaTUncertainty(y) * 15 / 3600);
  const precessionDeg = precessionAccuracyDeg(ttFromUt(jdUT));
  const far = Math.abs(y - 2000);
  if (far <= 400 && rotationDeg < 0.02) {
    return { level: 'precise', label: '', detail: 'Positions are accurate to arcseconds.', rotationDeg, precessionDeg };
  }
  if (far <= 3000) {
    return {
      level: 'good', label: 'Good accuracy',
      detail: 'Planets and stars are accurate to a small fraction of a degree. The exact clock time of events is uncertain by '
        + describeSeconds(deltaTUncertainty(y)) + ' because the Earth\'s spin is not perfectly predictable.',
      rotationDeg, precessionDeg,
    };
  }
  if (far <= 10000) {
    return {
      level: 'approximate', label: 'Approximate',
      detail: 'The shape of the sky and the pole are right to about a degree. Planet positions and the time of day are rough.',
      rotationDeg, precessionDeg,
    };
  }
  return {
    level: 'qualitative', label: 'Illustrative',
    detail: 'Star motions and the drifting pole are shown as best estimates. Planets, the Moon and the time of day are not reliable this far from the present.',
    rotationDeg, precessionDeg,
  };
}

function describeSeconds(s: number): string {
  if (s < 90) return `about ${Math.max(1, Math.round(s))} s`;
  if (s < 5400) return `about ${Math.round(s / 60)} min`;
  return `about ${Math.round(s / 3600)} h`;
}

export class Clock {
  jdUT: number;
  /** Simulated seconds per real second. 1 is real time; negative runs backwards. */
  rate = 1;
  paused = false;

  constructor(jdUT: number = jdNow()) {
    this.jdUT = clampJd(jdUT);
  }

  /** Advance by `dtReal` seconds of wall-clock time. Returns true if the instant changed. */
  tick(dtReal: number): boolean {
    if (this.paused || this.rate === 0 || dtReal === 0) return false;
    const before = this.jdUT;
    this.jdUT = clampJd(this.jdUT + (dtReal * this.rate) / 86400);
    // Stop at the ends of the range instead of pushing against them forever.
    if (this.jdUT === JD_MIN || this.jdUT === JD_MAX) this.paused = true;
    return this.jdUT !== before;
  }

  setJd(jdUT: number): void {
    this.jdUT = clampJd(jdUT);
  }

  /** Jump to the present and run in real time. */
  now(): void {
    this.jdUT = clampJd(jdNow());
    this.rate = 1;
    this.paused = false;
  }

  /** True when the clock is tracking the real present (within a couple of seconds). */
  get live(): boolean {
    return !this.paused && this.rate === 1 && Math.abs(this.jdUT - jdNow()) < 2 / 86400;
  }

  get accuracy(): Accuracy {
    return accuracyAt(this.jdUT);
  }
}

export function clampJd(jd: number): number {
  if (!Number.isFinite(jd)) return jdNow();
  return Math.min(JD_MAX, Math.max(JD_MIN, jd));
}

/** Rates offered by the time controls (simulated seconds per real second). */
export const RATE_STEPS = [1, 60, 600, 3600, 86400, 7 * 86400, 30 * 86400, 365.25 * 86400, 100 * 365.25 * 86400];

export function describeRate(rate: number): string {
  const a = Math.abs(rate);
  const sign = rate < 0 ? '−' : '';
  if (a === 1) return rate < 0 ? 'Reverse real time' : 'Real time';
  if (a < 60) return `${sign}${a}×`;
  if (a < 3600) return `${sign}${fmt(a / 60)} min/s`;
  if (a < 86400) return `${sign}${fmt(a / 3600)} h/s`;
  if (a < 365.25 * 86400) return `${sign}${fmt(a / 86400)} d/s`;
  return `${sign}${fmt(a / (365.25 * 86400))} yr/s`;
}

function fmt(x: number): string {
  return Number.isInteger(x) ? String(x) : x.toFixed(1);
}
