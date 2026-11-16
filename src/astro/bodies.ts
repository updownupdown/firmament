// Physical data for solar system bodies (IAU WGCCRE 2015 rotation models,
// simplified to their constant and linear terms).

import { DEG } from './math.ts';
import type { PlanetName } from './vsop87.ts';

export type SolarBodyId = 'sun' | 'moon' | PlanetName | 'pluto';

export interface BodyInfo {
  id: SolarBodyId;
  name: string;
  /** Mean radius, km. */
  radius: number;
  /** Equatorial radius, km. */
  radiusEq: number;
  flattening: number;
  /** North pole right ascension and declination (J2000, radians). */
  poleRa: number;
  poleDec: number;
  /** Prime meridian angle W = w0 + rate·d (radians, radians/day). */
  w0: number;
  wRate: number;
  /** Base colour for rendering (linear-ish sRGB). */
  color: [number, number, number];
  albedo: number;
  kind: 'star' | 'planet' | 'moon' | 'dwarf';
  /** Orbital period, days (for display). */
  period?: number;
  moons?: number;
  facts?: string;
}

const b = (
  id: SolarBodyId, name: string, radius: number, radiusEq: number, flattening: number,
  poleRaDeg: number, poleDecDeg: number, w0Deg: number, wRateDeg: number,
  color: [number, number, number], albedo: number, kind: BodyInfo['kind'], period?: number, moons?: number,
): BodyInfo => ({
  id, name, radius, radiusEq, flattening,
  poleRa: poleRaDeg * DEG, poleDec: poleDecDeg * DEG,
  w0: w0Deg * DEG, wRate: wRateDeg * DEG, color, albedo, kind, period, moons,
});

export const BODIES: Record<SolarBodyId, BodyInfo> = {
  sun: b('sun', 'Sun', 695700, 695700, 0, 286.13, 63.87, 84.176, 14.1844, [1, 0.96, 0.9], 1, 'star'),
  mercury: b('mercury', 'Mercury', 2439.7, 2440.5, 0, 281.0103, 61.4155, 329.5988, 6.1385108, [0.6, 0.57, 0.54], 0.142, 'planet', 87.969, 0),
  venus: b('venus', 'Venus', 6051.8, 6051.8, 0, 272.76, 67.16, 160.2, -1.4813688, [0.95, 0.9, 0.78], 0.689, 'planet', 224.701, 0),
  earth: b('earth', 'Earth', 6371.0, 6378.137, 0.00335, 0, 90, 190.147, 360.9856235, [0.35, 0.5, 0.8], 0.434, 'planet', 365.256, 1),
  moon: b('moon', 'Moon', 1737.4, 1738.1, 0.0012, 269.9949, 66.5392, 38.3213, 13.17635815, [0.72, 0.7, 0.67], 0.12, 'moon', 27.3217),
  mars: b('mars', 'Mars', 3389.5, 3396.2, 0.00589, 317.269, 54.432, 176.049863, 350.891982443, [0.85, 0.5, 0.33], 0.17, 'planet', 686.98, 2),
  jupiter: b('jupiter', 'Jupiter', 69911, 71492, 0.06487, 268.056595, 64.495303, 284.95, 870.536, [0.85, 0.78, 0.68], 0.538, 'planet', 4332.59, 95),
  saturn: b('saturn', 'Saturn', 58232, 60268, 0.09796, 40.589, 83.537, 38.9, 810.7939024, [0.9, 0.83, 0.65], 0.499, 'planet', 10759.22, 146),
  uranus: b('uranus', 'Uranus', 25362, 25559, 0.02293, 257.311, -15.175, 203.81, -501.1600928, [0.66, 0.84, 0.88], 0.488, 'planet', 30688.5, 28),
  neptune: b('neptune', 'Neptune', 24622, 24764, 0.01708, 299.36, 43.46, 249.978, 541.1397757, [0.4, 0.55, 0.9], 0.442, 'planet', 60182, 16),
  pluto: b('pluto', 'Pluto', 1188.3, 1188.3, 0, 132.993, -6.163, 302.695, 56.3625225, [0.8, 0.7, 0.6], 0.52, 'dwarf', 90560, 5),
};

/**
 * Visual magnitude (Astronomical Almanac formulas, as in Meeus ch. 41).
 * r: distance from the Sun (AU), delta: distance from the observer (AU),
 * phase: phase angle (radians), ringTilt: Saturn's ring tilt as seen by the observer (radians).
 */
export function visualMagnitude(id: SolarBodyId, r: number, delta: number, phase: number, ringTilt = 0): number {
  const i = phase / DEG;
  const d = 5 * Math.log10(r * delta);
  switch (id) {
    case 'sun': return -26.74 + 5 * Math.log10(delta);
    case 'moon': return -12.73 + 0.026 * Math.abs(i) + 4e-9 * i ** 4 + 5 * Math.log10(delta / 0.0025695 * r);
    case 'mercury': return -0.42 + d + 0.038 * i - 0.000273 * i * i + 0.000002 * i * i * i;
    case 'venus': return -4.4 + d + 0.0009 * i + 0.000239 * i * i - 0.00000065 * i * i * i;
    case 'earth': return -3.86 + d + 0.01 * i;
    case 'mars': return -1.52 + d + 0.016 * i;
    case 'jupiter': return -9.4 + d + 0.005 * i;
    case 'saturn': {
      const s = Math.abs(Math.sin(ringTilt));
      return -8.88 + d + 0.044 * Math.abs(i) - 2.6 * s + 1.25 * s * s;
    }
    case 'uranus': return -7.19 + d;
    case 'neptune': return -6.87 + d;
    case 'pluto': return -1.0 + d;
  }
}

/** Fraction of the disk that is lit, from the phase angle. */
export function illuminatedFraction(phase: number): number {
  return (1 + Math.cos(phase)) / 2;
}
