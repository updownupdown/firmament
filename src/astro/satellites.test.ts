import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleBetween } from './math.ts';
import { testEphemeris, testStars } from './testdata.ts';
import { Universe } from '../sim/universe.ts';
import { ELEMENT_MOONS, moonOffset } from './satellites.ts';

const HOME = { name: 'Toronto', lat: 43.65, lon: -79.38, height: 76, tz: 'America/Toronto' };
const ARCSEC = Math.PI / 180 / 3600;

test('moons sit at their published distances from their planets', () => {
  // Mean distances, km (JPL).
  const mean: Record<string, number> = { phobos: 9376, titan: 1221870, iapetus: 3560820, oberon: 583520, triton: 354759, charon: 19591 };
  for (const [id, a] of Object.entries(mean)) {
    const m = ELEMENT_MOONS.find((x) => x.id === id)!;
    for (let k = 0; k < 20; k++) {
      const v = moonOffset(m, 2461000.5 + k * 3.7);
      const r = Math.hypot(...v);
      assert.ok(Math.abs(r / a - 1) < 0.05, `${id}: ${r} km`);
    }
  }
});

test('moons are where PyEphem (BDL and TASS theories) puts them, seen from the Earth', () => {
  // Separation from the planet in arcseconds, from PyEphem 4.2, and how close we must be (within
  // about 4%: the mean elements trade the theories' short-period terms for size and speed).
  const cases: [string, string, number, number, number][] = [
    ['titan', 'saturn', 2460827.5, 19.76, 1], ['titan', 'saturn', 2462941.0, 115.6, 5],
    ['rhea', 'saturn', 2460827.5, 72.39, 1], ['rhea', 'saturn', 2462941.0, 37.97, 1],
    ['oberon', 'uranus', 2460827.5, 36.94, 1], ['oberon', 'uranus', 2462941.0, 41.87, 1],
    ['phobos', 'mars', 2460827.5, 7.31, 0.6], ['phobos', 'mars', 2462941.0, 14.79, 0.6],
  ];
  for (const [id, parent, jd, sep, tol] of cases) {
    const u = new Universe({ eph: testEphemeris(), stars: testStars(), site: HOME, jdUT: jd });
    const got = angleBetween(u.bodies.get(id)!.dir, u.bodies.get(parent)!.dir) / ARCSEC;
    assert.ok(Math.abs(got - sep) < tol, `${id} at ${jd}: ${got.toFixed(2)}″ against ${sep}″`);
  }
});
