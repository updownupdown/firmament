import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testEphemeris } from '../astro/testdata.ts';
import { VOYAGER2, slingshot, slingshotPath, slingshotPosition } from './slingshot.ts';
import { trip } from './trip.ts';

const eph = testEphemeris();
const approach = trip(eph, 'jupiter', VOYAGER2.launch, VOYAGER2.flyby - VOYAGER2.launch)!;
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('slingshot: Voyager 2 left the Earth at about 10 km/s', () => {
  // Voyager 2's launch energy C3 was about 102 km²/s², a departure speed of about 10.1 km/s.
  assert.ok(Math.abs(approach.depart - 10.1) < 0.6, `depart ${approach.depart}`);
});

test('slingshot: passing behind Jupiter at 10 radii roughly doubles the speed and escapes the Sun', () => {
  const s = slingshot(eph, approach, VOYAGER2.radii, true);
  assert.ok(s.before > 8 && s.before < 11.5, `before ${s.before}`);
  assert.ok(s.after > 18 && s.after < 23, `after ${s.after}`);
  // Escape speed at 5.4 AU is about 18 km/s.
  assert.ok(Math.abs(s.escape - 18.1) < 0.6, `escape ${s.escape}`);
  assert.ok(s.escapes);
  // The same pass on the other side slows it, and a distant pass barely turns it.
  const front = slingshot(eph, approach, VOYAGER2.radii, false);
  assert.ok(front.after < s.before && !front.escapes);
  const far = slingshot(eph, approach, 30, true);
  assert.ok(far.turn < s.turn && !far.escapes);
});

test('slingshot: the path joins up at Jupiter and heads outward', () => {
  const s = slingshot(eph, approach, VOYAGER2.radii, true);
  const atJ = eph.helio('jupiter', VOYAGER2.flyby);
  assert.ok(dist(slingshotPosition(s, VOYAGER2.flyby), atJ) < 1e-3);
  assert.ok(dist(slingshotPosition(s, VOYAGER2.flyby + 1), atJ) < 0.05);
  const path = slingshotPath(s, 3650);
  const r = (p: number[]) => Math.hypot(p[0], p[1], p[2]);
  assert.ok(r(path[path.length - 1]) > 10, `reaches ${r(path[path.length - 1])} AU`);
});
