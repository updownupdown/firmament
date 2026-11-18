// What a fast traveller sees: special-relativistic aberration and Doppler shift.
// Light from a star arriving from direction n (unit vector toward the star, in
// the frame where the stars are at rest) is seen by an observer moving at
// velocity beta (in units of c) from a new direction, crowded toward the
// direction of travel, and with its frequency scaled by the Doppler factor D.
// See Rindler, "Relativity: Special, General, and Cosmological" §4.4, or
// McKinley & Doherty, Am. J. Phys. 47, 309 (1979), "In search of the starbow".

import { type Vec3, dot } from './math.ts';

/** Light-years per parsec (IAU). */
export const LY_PER_PC = 3.26156;
/** Seconds in a Julian year. */
export const SECONDS_PER_YEAR = 365.25 * 86400;

export interface RelativisticView {
  /** Where the star appears to the moving observer (unit vector). */
  dir: Vec3;
  /** Doppler factor: observed over emitted frequency (above 1 is blueshift). */
  doppler: number;
}

/** The apparent direction and Doppler factor of a star at `n` for an observer moving at `beta` (|beta| < 1). */
export function relativisticView(n: Vec3, beta: Vec3): RelativisticView {
  const b2 = dot(beta, beta);
  if (!(b2 > 0)) return { dir: n, doppler: 1 };
  if (b2 >= 1) throw new RangeError('speed must be below light speed');
  const g = 1 / Math.sqrt(1 - b2);
  const nb = dot(n, beta);
  const k = (g - 1) * nb / b2;
  const denom = g * (1 + nb);
  const dir: Vec3 = [(n[0] + g * beta[0] + k * beta[0]) / denom, (n[1] + g * beta[1] + k * beta[1]) / denom, (n[2] + g * beta[2] + k * beta[2]) / denom];
  return { dir, doppler: denom };
}

/**
 * The change in magnitude of a Doppler-shifted star, roughly: photon arrival
 * rate goes as D squared (aberration concentrating the light) times D (time
 * dilation), so the star brightens by 2.5 log10 D^3.
 */
export function dopplerMagnitude(doppler: number): number {
  return -7.5 * Math.log10(doppler);
}
