import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG, norm } from '../astro/math.ts';
import { GALACTIC_CENTRE_DIR, GALAXY_INNER_PC, makeGalaxy } from './galaxy.ts';

test('the centre of the galaxy lies at Sagittarius A* (RA 17h 45m 40s, Dec −29.0°)', () => {
  const [x, y, z] = GALACTIC_CENTRE_DIR;
  const ra = (Math.atan2(y, x) / DEG + 360) % 360, dec = Math.asin(z) / DEG;
  // Reid & Brunthaler 2004: RA 266.417°, Dec −29.008°; the IAU galactic frame puts l = 0 within 0.1° of it.
  assert.ok(Math.abs(ra - 266.4) < 0.15, `RA ${ra}`);
  assert.ok(Math.abs(dec + 28.94) < 0.15, `Dec ${dec}`);
});

test('the model galaxy is the same every time, clears the Sun, and crowds toward the centre', () => {
  const a = makeGalaxy(5000), b = makeGalaxy(5000);
  assert.deepEqual(a.pos.slice(0, 30), b.pos.slice(0, 30));
  let toward = 0;
  for (let i = 0; i < a.count; i++) {
    const p: [number, number, number] = [a.pos[3 * i], a.pos[3 * i + 1], a.pos[3 * i + 2]];
    assert.ok(norm(p) >= GALAXY_INNER_PC - 0.01);
    if (p[0] * GALACTIC_CENTRE_DIR[0] + p[1] * GALACTIC_CENTRE_DIR[1] + p[2] * GALACTIC_CENTRE_DIR[2] > 0) toward++;
  }
  assert.ok(toward / a.count > 0.75, `${toward / a.count} toward the centre`);
});
