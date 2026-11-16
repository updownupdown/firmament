// The Moon from ELP/MPP02 (Chapront & Francou 2003, fit to DE405), truncated.
// Output is geocentric, in km, in the J2000 equatorial frame.

import { ARCSEC, type Vec3, apply, poly } from './math.ts';
import { ECL_TO_EQ_J2000 } from './frames.ts';
import { J2000 } from './time.ts';

/** Each term: [A, φ0, φ1, φ2, φ3, φ4]; value = Σα T^α Σ A sin(φ(T)). */
export interface ElpData { W1: number[]; L: number[][][]; B: number[][][]; R: number[][][] }

function evalSeries(powers: number[][][], T: number): number {
  let sum = 0;
  let tp = 1;
  const T2 = T * T, T3 = T2 * T, T4 = T3 * T;
  for (const terms of powers) {
    let s = 0;
    for (let i = 0; i < terms.length; i++) {
      const t = terms[i];
      s += t[0] * Math.sin(t[1] + t[2] * T + t[3] * T2 + t[4] * T3 + t[5] * T4);
    }
    sum += s * tp;
    tp *= T;
  }
  return sum;
}

export const MOON_RADIUS_KM = 1737.4;

export class Elp {
  readonly data: ElpData;
  constructor(data: ElpData) {
    this.data = data;
  }

  /** Geocentric position, J2000 ecliptic (km). */
  eclipticXYZ(jdTT: number): Vec3 {
    const T = (jdTT - J2000) / 36525;
    const L = poly(T, this.data.W1) + evalSeries(this.data.L, T) * ARCSEC;
    const B = evalSeries(this.data.B, T) * ARCSEC;
    const R = evalSeries(this.data.R, T);
    const x = R * Math.cos(L) * Math.cos(B);
    const y = R * Math.sin(L) * Math.cos(B);
    const z = R * Math.sin(B);
    // Laskar's rotation from the ELP ecliptic of date to the J2000 inertial ecliptic.
    const P = poly(T, [0, 0.10180391e-4, 0.47020439e-6, -0.5417367e-9, -0.2507948e-11, 0.463486e-14]);
    const Q = poly(T, [0, -0.113469002e-3, 0.12372674e-6, 0.1265417e-8, -0.1371808e-11, -0.320334e-14]);
    const sq = Math.sqrt(1 - P * P - Q * Q);
    return [
      (1 - 2 * P * P) * x + 2 * P * Q * y + 2 * P * sq * z,
      2 * P * Q * x + (1 - 2 * Q * Q) * y - 2 * Q * sq * z,
      -2 * P * sq * x + 2 * Q * sq * y + (1 - 2 * P * P - 2 * Q * Q) * z,
    ];
  }

  /** Geocentric position, J2000 equatorial (km). */
  position(jdTT: number): Vec3 {
    return apply(ECL_TO_EQ_J2000, this.eclipticXYZ(jdTT));
  }
}
