import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testEphemeris } from '../astro/testdata.ts';
import { ttFromUt } from '../astro/time.ts';
import { WHAT_IF_TIME } from '../atlas/moments.ts';
import { PLANETS, Sandbox, type WhatIf } from './sandbox.ts';

const eph = testEphemeris();

/** Run a what-if for some years; the range of each planet's distance from the Sun, and which are lost. */
function run(what: WhatIf, years: number) {
  const sb = new Sandbox(eph, ttFromUt(WHAT_IF_TIME), what);
  const e0 = sb.sim.energy();
  const range: Record<string, [number, number]> = {};
  for (let d = 0; d < years * 365.25; d += 8) {
    sb.advance(8);
    for (const id of PLANETS) {
      const d = sb.distance(id), r = (range[id] ??= [d, d]);
      r[0] = Math.min(r[0], d); r[1] = Math.max(r[1], d);
    }
  }
  return { range, lost: PLANETS.filter((id) => !sb.bound(id)), drift: Math.abs((sb.sim.energy() - e0) / e0) };
}

test('sandbox: the real solar system holds steady for a century, conserving energy', () => {
  const { range, lost, drift } = run({ jupiter: 1 }, 100);
  assert.deepEqual(lost, []);
  assert.ok(drift < 1e-5, `energy drift ${drift}`);
  // Published perihelion and aphelion distances (AU).
  const want: Record<string, [number, number]> = { mercury: [0.307, 0.467], earth: [0.983, 1.017], mars: [1.381, 1.666], jupiter: [4.95, 5.46], neptune: [29.8, 30.3] };
  for (const [id, [q, Q]] of Object.entries(want)) {
    assert.ok(Math.abs(range[id][0] - q) < 0.02 * Q && Math.abs(range[id][1] - Q) < 0.02 * Q, `${id} ${range[id]}`);
  }
});

test('sandbox: a Jupiter 100 times heavier shakes the outer planets, not the Earth', () => {
  const { range, lost } = run({ jupiter: 100 }, 150);
  assert.deepEqual(lost, []);
  assert.ok(range.saturn[1] > 12, `Saturn ${range.saturn}`);
  assert.ok(range.earth[0] > 0.95 && range.earth[1] < 1.05, `Earth ${range.earth}`);
});

test('sandbox: a Jupiter as heavy as the Sun breaks the system up', () => {
  const { lost } = run({ jupiter: 1000 }, 150);
  assert.ok(lost.length >= 3, lost.join());
});

test('sandbox: a passing star must come within a few AU to take the Earth', () => {
  const star = (closest: number) => run({ jupiter: 1, star: { mass: 1, closest, kms: 20, from: 160 } }, 90).lost;
  assert.deepEqual(star(100), []);
  const at10 = star(10);
  assert.ok(!at10.includes('earth') && at10.some((id) => ['saturn', 'uranus', 'neptune'].includes(id)), at10.join());
  // Closer in it depends on where the Earth happens to be; a pass at 1 AU always takes it.
  assert.ok(star(1).includes('earth'));
});
