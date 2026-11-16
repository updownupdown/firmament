// VSOP87B: heliocentric spherical coordinates referred to the J2000 ecliptic and
// equinox. The data file is a truncation of the full theory (see build_data.py).

import { type Vec3, apply } from './math.ts';
import { ECL_TO_EQ_J2000 } from './frames.ts';
import { J2000 } from './time.ts';

export type PlanetName = 'mercury' | 'venus' | 'earth' | 'mars' | 'jupiter' | 'saturn' | 'uranus' | 'neptune';
export const PLANETS: PlanetName[] = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];

/** series[coord][alpha] = list of [A, B, C]; value = Σα τ^α Σ A cos(B + C τ). */
export interface VsopSeries { L: number[][][]; B: number[][][]; R: number[][][] }
export type VsopData = Record<PlanetName, VsopSeries>;

function evalSeries(powers: number[][][], tau: number): number {
  let sum = 0;
  let tp = 1;
  for (const terms of powers) {
    let s = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      s += t[0] * Math.cos(t[1] + t[2] * tau);
    }
    sum += s * tp;
    tp *= tau;
  }
  return sum;
}

export class Vsop87 {
  readonly data: VsopData;
  constructor(data: VsopData) {
    this.data = data;
  }

  /** Heliocentric ecliptic J2000 longitude, latitude (rad) and radius (AU). */
  lbr(planet: PlanetName, jdTT: number): [number, number, number] {
    const tau = (jdTT - J2000) / 365250;
    const s = this.data[planet];
    return [evalSeries(s.L, tau), evalSeries(s.B, tau), evalSeries(s.R, tau)];
  }

  /** Heliocentric position in the J2000 ecliptic frame (AU). */
  eclipticXYZ(planet: PlanetName, jdTT: number): Vec3 {
    const [l, b, r] = this.lbr(planet, jdTT);
    const cb = Math.cos(b);
    return [r * cb * Math.cos(l), r * cb * Math.sin(l), r * Math.sin(b)];
  }

  /** Heliocentric position in the J2000 equatorial frame (AU). */
  position(planet: PlanetName, jdTT: number): Vec3 {
    return apply(ECL_TO_EQ_J2000, this.eclipticXYZ(planet, jdTT));
  }

  /** Heliocentric velocity in the J2000 equatorial frame (AU/day), by central difference. */
  velocity(planet: PlanetName, jdTT: number): Vec3 {
    const h = 0.05;
    const a = this.position(planet, jdTT - h);
    const b = this.position(planet, jdTT + h);
    return [(b[0] - a[0]) / (2 * h), (b[1] - a[1]) / (2 * h), (b[2] - a[2]) / (2 * h)];
  }
}
