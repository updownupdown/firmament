// "What if?": the Sun and the eight planets, started from where they really
// are and then left to gravity alone, with a heavier Jupiter or a passing star
// to stir things up. Ecliptic coordinates, AU and days; masses in suns.

import { EPS_J2000 } from '../astro/frames.ts';
import type { Ephemeris } from '../astro/ephemeris.ts';
import { GM_SUN } from '../astro/kepler.ts';
import type { Vec3 } from '../astro/math.ts';
import { NBody, type Particle } from '../astro/nbody.ts';

/** IAU nominal masses, in solar masses (the Earth carries the Moon). */
export const PLANET_MASSES: Record<string, number> = {
  mercury: 1.6601e-7, venus: 2.4478e-6, earth: 3.0404e-6, mars: 3.2272e-7,
  jupiter: 9.5479e-4, saturn: 2.8589e-4, uranus: 4.3662e-5, neptune: 5.1514e-5,
};
export const PLANETS = Object.keys(PLANET_MASSES);

export interface WhatIf {
  /** Jupiter's mass as a multiple of its real one. */
  jupiter: number;
  /** A star sent through the system in the plane of the planets. */
  star?: { mass: number; closest: number; kms: number; from: number };
}

const KMS = 86400 / 1.495978707e8; // km/s to AU/day
const cosE = Math.cos(EPS_J2000), sinE = Math.sin(EPS_J2000);
const ecl = (v: Vec3): Vec3 => [v[0], cosE * v[1] + sinE * v[2], -sinE * v[1] + cosE * v[2]];

export class Sandbox {
  readonly sim = new NBody();
  /** Days since the start. */
  get days(): number { return this.sim.t; }

  constructor(eph: Ephemeris, jdTT: number, what: WhatIf) {
    this.sim.softening = 2e-3;
    this.sim.add({ id: 'sun', mass: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
    for (const id of PLANETS) {
      const r = ecl(eph.helio(id, jdTT));
      const a = ecl(eph.helio(id, jdTT - 0.5)), b = ecl(eph.helio(id, jdTT + 0.5));
      const mass = PLANET_MASSES[id] * (id === 'jupiter' ? what.jupiter : 1);
      this.sim.add({ id, mass, x: r[0], y: r[1], z: r[2], vx: b[0] - a[0], vy: b[1] - a[1], vz: b[2] - a[2] });
    }
    if (what.star) {
      // In from the -x side along +x, offset in y by the closest approach (a straight-line aim).
      const s = what.star;
      this.sim.add({ id: 'star', mass: s.mass, x: -s.from, y: s.closest, z: 0, vx: s.kms * KMS, vy: 0, vz: 0 });
    }
    // Hold the centre of mass still, so the picture doesn't drift away.
    let m = 0, px = 0, py = 0, pz = 0;
    for (const p of this.sim.particles) { m += p.mass; px += p.mass * p.vx; py += p.mass * p.vy; pz += p.mass * p.vz; }
    for (const p of this.sim.particles) { p.vx -= px / m; p.vy -= py / m; p.vz -= pz / m; }
  }

  get(id: string): Particle | undefined {
    return this.sim.particles.find((p) => p.id === id);
  }

  /** A step short enough for the tightest pairing in the system right now (days). */
  private stepSize(): number {
    const ps = this.sim.particles;
    let worst = Infinity;
    for (const a of ps) {
      for (const b of ps) {
        if (a === b || b.mass < 1e-4) continue;
        const r = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
        // Time to fall a good way round b from here: r^1.5 / sqrt(GM).
        worst = Math.min(worst, r ** 1.5 / Math.sqrt(GM_SUN * (b.mass + a.mass)));
      }
    }
    return Math.min(8, Math.max(0.01, worst * 0.02));
  }

  /** Run on by `days`. Returns the number of steps taken. */
  advance(days: number): number {
    const end = this.sim.t + days;
    let n = 0;
    while (this.sim.t < end - 1e-9 && n < 20000) {
      this.sim.step(Math.min(this.stepSize(), end - this.sim.t));
      n++;
    }
    return n;
  }

  /** Distance of a body from the Sun, AU. */
  distance(id: string): number {
    const s = this.get('sun')!, p = this.get(id)!;
    return Math.hypot(p.x - s.x, p.y - s.y, p.z - s.z);
  }

  /** Whether a body is still bound to the Sun (two-body energy with the Sun, negative means bound). */
  bound(id: string): boolean {
    const s = this.get('sun')!, p = this.get(id)!;
    const r = this.distance(id);
    const v2 = (p.vx - s.vx) ** 2 + (p.vy - s.vy) ** 2 + (p.vz - s.vz) ** 2;
    return v2 / 2 - GM_SUN * (s.mass + p.mass) / r < 0;
  }
}
