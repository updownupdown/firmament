// Finding what is under a tap: the nearest drawn object, with brighter and
// more important things winning ties.

import { DEG, type Vec3, apply, clamp } from '../astro/math.ts';
import type { LayerFlags } from '../sim/scene.ts';
import { countBrighter } from '../astro/tycho.ts';
import { dsoId, starRef } from '../sim/universe.ts';
import { dsoLimit } from './conditions.ts';
import type { SkyRenderer } from './sky.ts';

const STRIDE = 11;

/**
 * Reference of the object nearest to a screen point, or null if nothing is
 * close. A tap rarely lands exactly on a star, so bright and named stars pull
 * harder than faint ones, and anything in `prefer` (a journey's target) pulls
 * hardest of all.
 */
export function pick(r: SkyRenderer, layers: LayerFlags, x: number, y: number, radius = 36, prefer: ReadonlySet<string> = new Set()): string | null {
  const u = r.universe, p = r.projection, c = r.conditions;
  const floor = layers.ground ? -0.5 * DEG : -90 * DEG;
  let best: string | null = null;
  let bestScore = radius;
  const consider = (ref: string, sx: number, sy: number, bonus: number, reach = 0) => {
    const d = Math.max(0, Math.hypot(sx - x, sy - y) - reach);
    if (d > radius) return;
    const score = d - bonus - (prefer.has(ref) ? 30 : 0);
    if (score < bestScore) { bestScore = score; best = ref; }
  };

  for (const d of r.drawn) {
    if (!d.screen || d.alt < floor) continue;
    const major = d.id === 'sun' || d.id === 'moon';
    if (!major && d.body.mag > c.limitMag + 1) continue;
    consider(d.id, d.screen.x, d.screen.y, major ? 14 : 10, d.radiusPx);
  }

  // Stars: test in J2000 against the direction under the pointer, then project the near ones.
  const centre = r.unproject(x, y);
  const cosLimit = Math.cos(Math.min(Math.PI / 2, radius * p.pixelAngle * 2.5));
  const data = r.starData, years = u.years, m = u.frame.j2000ToHorizon;
  const n = data.length / STRIDE;
  for (let i = 0; i < n; i++) {
    const o = i * STRIDE;
    if (data[o + 7] > c.limitMag) {
      if (Math.abs(years) < 2000) break; // sorted by magnitude
      continue;
    }
    const px = data[o] + data[o + 4] * years, py = data[o + 1] + data[o + 5] * years, pz = data[o + 2] + data[o + 6] * years;
    const len = Math.hypot(px, py, pz);
    if ((px * centre[0] + py * centre[1] + pz * centre[2]) / len < cosLimit) continue;
    const dir: Vec3 = u.starDirection(i);
    const h = apply(m, dir);
    if (Math.asin(clamp(h[2], -1, 1)) < floor) continue;
    const s = p.project(h);
    if (!s) continue;
    const named = u.stars.meta.get(i)?.n ? 6 : 0;
    consider(starRef(u.stars, i), s.x, s.y, clamp((c.limitMag - data[o + 7]) * 2.2, 0, 16) + named);
  }

  // Tycho-2 stars, once zoomed in far enough to draw them.
  const index = r.tychoIndex;
  if (index && c.limitMag > 8 && u.faint.size) {
    const dec = Math.asin(clamp(centre[2], -1, 1)), reach = Math.acos(cosLimit);
    for (const [b, band] of u.faint) {
      const south = (-90 + b * index.band) * DEG, north = south + index.band * DEG;
      if (dec + reach < south || dec - reach > north) continue;
      // Only stars bright enough to see on screen, not the ones fading out at the limit.
      const n = countBrighter(band.mag, c.limitMag - 1);
      for (let i = 0; i < n; i++) {
        const cd = Math.cos(band.dec[i]);
        if (cd * Math.cos(band.ra[i]) * centre[0] + cd * Math.sin(band.ra[i]) * centre[1] + Math.sin(band.dec[i]) * centre[2] < cosLimit) continue;
        const h = apply(m, u.faintDirection(band, i));
        if (Math.asin(clamp(h[2], -1, 1)) < floor) continue;
        const s = p.project(h);
        if (s) consider(`tyc:${b}:${i}`, s.x, s.y, clamp((c.limitMag - band.mag[i]) * 2.2, 0, 16));
      }
    }
  }

  if (layers.dsos) {
    for (const d of u.dsos) {
      if (d.m > dsoLimit(c, p.fov)) continue;
      const s = r.project([Math.cos(d.de * DEG) * Math.cos(d.ra * DEG), Math.cos(d.de * DEG) * Math.sin(d.ra * DEG), Math.sin(d.de * DEG)]);
      if (s) consider(`dso:${dsoId(d)}`, s.x, s.y, 3);
    }
  }
  return best;
}
