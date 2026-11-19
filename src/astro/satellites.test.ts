import { test } from 'node:test';
import assert from 'node:assert/strict';
import { angleBetween, cross, dot, normalize } from './math.ts';
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

test('moons are where JPL Horizons puts them, seen from the Earth', () => {
  // Offsets from the planet (arcseconds east and north, J2000) from Horizons for 2025–26, and how
  // close we must be. The far, Sun-pulled moons (Himalia, Elara, Phoebe) only keep to a few per cent;
  // Epimetheus checks the January 2026 orbit swap with Janus.
  const cases: [string, string, number, number, number, number][] = [
    ['amalthea', 'jupiter', 2460916.5, 41.33, -6.55, 0.2],
    ['amalthea', 'jupiter', 2461396.5, -46.66, 18.83, 0.2],
    ['thebe', 'jupiter', 2460916.5, 21.91, -5.00, 0.2],
    ['thebe', 'jupiter', 2461396.5, -24.71, 10.84, 0.2],
    ['himalia', 'jupiter', 2460916.5, 1807.71, -1114.01, 300],
    ['himalia', 'jupiter', 2461396.5, 3248.68, -1678.18, 300],
    ['elara', 'jupiter', 2460916.5, 1543.84, 200.91, 300],
    ['elara', 'jupiter', 2461396.5, 2503.77, 912.62, 300],
    ['janus', 'saturn', 2460916.5, 21.98, -1.22, 0.6],
    ['janus', 'saturn', 2461396.5, 20.59, -0.22, 0.6],
    ['epimetheus', 'saturn', 2460916.5, 13.06, -0.18, 1.5],
    ['epimetheus', 'saturn', 2461396.5, -6.80, 2.63, 1.5],
    ['phoebe', 'saturn', 2460916.5, -95.36, 131.69, 40],
    ['phoebe', 'saturn', 2461396.5, -1206.17, -448.80, 40],
    ['hyperion', 'saturn', 2460916.5, -111.36, 14.33, 12],
    ['hyperion', 'saturn', 2461396.5, 182.43, -24.26, 12],
    ['miranda', 'uranus', 2460916.5, 8.25, -3.31, 1],
    ['miranda', 'uranus', 2461396.5, -9.24, -2.09, 1],
    ['puck', 'uranus', 2460916.5, 3.82, -4.54, 0.2],
    ['puck', 'uranus', 2461396.5, 5.57, -2.59, 0.2],
    ['proteus', 'neptune', 2460916.5, -3.06, -4.10, 0.2],
    ['proteus', 'neptune', 2461396.5, -1.40, 1.22, 0.2],
    ['nereid', 'neptune', 2460916.5, 386.86, 202.24, 0.4],
    ['nereid', 'neptune', 2461396.5, 43.12, 11.56, 0.4],
    ['nix', 'pluto', 2460916.5, 0.46, 1.58, 0.1],
    ['nix', 'pluto', 2461396.5, 1.39, -1.01, 0.1],
    ['hydra', 'pluto', 2460916.5, -2.54, -0.43, 0.1],
    ['hydra', 'pluto', 2461396.5, 2.38, -0.29, 0.1],
  ];
  const site = { name: 'Earth centre', lat: 0, lon: 0, height: 0, tz: 'UTC' };
  for (const [id, parent, jd, east, north, tol] of cases) {
    const u = new Universe({ eph: testEphemeris(), stars: testStars(), site, jdUT: jd });
    const a = u.bodies.get(id)!.dir, p = u.bodies.get(parent)!.dir;
    const e = normalize(cross([0, 0, 1], p)), n = cross(p, e);
    const de = dot(a, e) / ARCSEC - east, dn = dot(a, n) / ARCSEC - north;
    assert.ok(Math.hypot(de, dn) < tol, `${id} at ${jd}: off by ${Math.hypot(de, dn).toFixed(2)}″`);
  }
});
