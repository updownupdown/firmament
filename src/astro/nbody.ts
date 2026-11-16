// A small N-body integrator for the sandbox and mission modes.
// Units: AU, days, solar masses (G·M☉ = GM_SUN). Leapfrog (kick-drift-kick) is
// symplectic, so orbits don't spiral in or out over long runs.

import { GM_SUN } from './kepler.ts';

export interface Particle {
  id: string;
  mass: number; // solar masses
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  /** Massless test particles feel gravity but exert none. */
  test?: boolean;
}

export class NBody {
  particles: Particle[] = [];
  t = 0;
  softening = 1e-6;

  add(p: Particle): void {
    this.particles.push(p);
  }

  private accelerations(): Float64Array {
    const ps = this.particles;
    const n = ps.length;
    const acc = new Float64Array(n * 3);
    const eps2 = this.softening * this.softening;
    for (let i = 0; i < n; i++) {
      const pi = ps[i];
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const pj = ps[j];
        if (pj.test || pj.mass === 0) continue;
        const dx = pj.x - pi.x, dy = pj.y - pi.y, dz = pj.z - pi.z;
        const r2 = dx * dx + dy * dy + dz * dz + eps2;
        const f = GM_SUN * pj.mass / (r2 * Math.sqrt(r2));
        acc[i * 3] += f * dx; acc[i * 3 + 1] += f * dy; acc[i * 3 + 2] += f * dz;
      }
    }
    return acc;
  }

  step(dt: number): void {
    const ps = this.particles;
    let a = this.accelerations();
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vx += a[i * 3] * dt / 2; p.vy += a[i * 3 + 1] * dt / 2; p.vz += a[i * 3 + 2] * dt / 2;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    }
    a = this.accelerations();
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      p.vx += a[i * 3] * dt / 2; p.vy += a[i * 3 + 1] * dt / 2; p.vz += a[i * 3 + 2] * dt / 2;
    }
    this.t += dt;
  }

  /** Total energy (kinetic + potential), for checking the integrator. */
  energy(): number {
    let e = 0;
    const ps = this.particles;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (p.test) continue;
      e += 0.5 * p.mass * (p.vx * p.vx + p.vy * p.vy + p.vz * p.vz);
      for (let j = i + 1; j < ps.length; j++) {
        const q = ps[j];
        if (q.test) continue;
        const r = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
        e -= GM_SUN * p.mass * q.mass / r;
      }
    }
    return e;
  }
}
