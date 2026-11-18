import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG, type Vec3 } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { testEphemeris, testStars } from '../astro/testdata.ts';
import { SUN_ABSOLUTE_MAG } from '../astro/stars.ts';
import { Universe } from './universe.ts';

const HOME = { name: 'Toronto', lat: 43.65, lon: -79.38, height: 76, tz: 'America/Toronto' };
const u = new Universe({ eph: testEphemeris(), stars: testStars(), site: HOME, jdUT: jdFromCalendar(2026, 11, 18, 0, 0) });
const index = (hip: number) => {
  const s = u.stars;
  for (let i = 0; i < s.count; i++) if (s.hip[i] === hip) return i;
  throw new Error(`HIP ${hip} not in the catalogue`);
};
const where = (i: number): Vec3 => {
  const { dir } = u.stars.at(i, u.years);
  const d = u.stars.dist[i];
  return [dir[0] * d, dir[1] * d, dir[2] * d];
};

test('from Alpha Centauri the Sun is a magnitude 0.5 star in Cassiopeia', () => {
  const at = where(index(71683)); // α Centauri A
  const d = Math.hypot(...at);
  assert.ok(Math.abs(d - 1.34) < 0.02, `${d} pc`);
  const mag = SUN_ABSOLUTE_MAG + 5 * Math.log10(d / 10);
  assert.ok(Math.abs(mag - 0.47) < 0.06, `magnitude ${mag}`);
  // The Sun sits opposite α Centauri on our sky: RA 2h 39.6m, Dec +60° 50′, near ε Cassiopeiae.
  const ra = (Math.atan2(-at[1], -at[0]) / DEG + 360) % 360, dec = Math.asin(-at[2] / d) / DEG;
  assert.ok(Math.abs(ra - 39.9) < 0.5 && Math.abs(dec - 60.83) < 0.5, `RA ${ra} Dec ${dec}`);
});

test('travelling re-lights the stars: Sirius dims and Alpha Centauri blazes, unmeasured stars stay put', () => {
  const sirius = index(32349), alpha = index(71683);
  const before = { sirius: u.starMag(sirius), alpha: u.starMag(alpha), dir: u.starDirection(sirius) };
  const at = where(alpha);
  u.setAway({ world: 'star', name: 'Alpha Centauri', at: [at[0] * 0.999, at[1] * 0.999, at[2] * 0.999] });
  // Sirius is 2.64 pc from us, and about 2.9 pc from α Centauri: a little fainter.
  const siriusThere = u.starMag(sirius);
  assert.ok(siriusThere > before.sirius && siriusThere < before.sirius + 0.5, `${before.sirius} → ${siriusThere}`);
  // 0.0013 pc from α Cen A, it is brighter than the full Moon.
  assert.ok(u.starMag(alpha) < -13, `${u.starMag(alpha)}`);
  // Sirius moves on the sky by a few degrees.
  const moved = Math.acos(Math.min(1, before.dir[0] * u.starDirection(sirius)[0] + before.dir[1] * u.starDirection(sirius)[1] + before.dir[2] * u.starDirection(sirius)[2])) / DEG;
  assert.ok(moved > 2 && moved < 40, `${moved}°`);
  u.setAway(null);
  assert.ok(Math.abs(u.starMag(alpha) - before.alpha) < 1e-9);
});
