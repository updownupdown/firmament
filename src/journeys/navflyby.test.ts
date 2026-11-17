import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG } from '../astro/math.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import { jdFromCalendar } from '../astro/time.ts';
import type { Culture, Dso } from '../data/types.ts';
import { Universe } from '../sim/universe.ts';
import { ARRIVAL, JUPITER, SOLAR_ESCAPE_AT_JUPITER, flyby, flybyPath, speed } from './flyby.ts';
import { circleOfPosition, fixFromTwo, geoDistance, groundPoint, nauticalMiles } from './navigation.ts';

const SHIP = { name: 'At sea', lat: 40, lon: -35, height: 0, tz: '' };
const universe = (jd: number) => new Universe({
  eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
  cultures: [readJSON<Culture>('cultures/western.json')], site: SHIP, jdUT: jd,
});

test('navigation: Polaris stands over a point less than a degree from the North Pole', () => {
  const u = universe(jdFromCalendar(2026, 11, 16, 21, 0));
  const [ra, dec] = u.equatorial(u.resolve('star:11767')!.dir);
  const gp = groundPoint(ra, dec, u.frame.gast);
  // Polaris's declination in 2026 is +89° 22′ (it creeps toward the pole until 2100).
  assert.ok(Math.abs(gp.lat / DEG - 89.37) < 0.03, String(gp.lat / DEG));
});

test('navigation: two star sightings fix the ship', () => {
  const u = universe(jdFromCalendar(2026, 11, 16, 21, 0));
  const sight = (ref: string) => {
    const dir = u.resolve(ref)!.dir;
    const [ra, dec] = u.equatorial(dir);
    return { gp: groundPoint(ra, dec, u.frame.gast), zenith: Math.PI / 2 - u.horizontal(dir).alt };
  };
  const vega = sight('star:91262'), fomalhaut = sight('star:113368');
  // Every point on a circle of position is the same distance from the ground point.
  for (const p of circleOfPosition(vega.gp, vega.zenith, 36)) assert.ok(Math.abs(geoDistance(p, vega.gp) - vega.zenith) < 1e-9);
  const guess = { lat: 42 * DEG, lon: -30 * DEG };
  const fix = fixFromTwo(vega.gp, vega.zenith, fomalhaut.gp, fomalhaut.zenith, guess)!;
  const ship = { lat: SHIP.lat * DEG, lon: SHIP.lon * DEG };
  // Geocentric altitudes from a geodetic site: a fix good to a couple of nautical miles.
  assert.ok(nauticalMiles(geoDistance(fix[0], ship)) < 15, String(nauticalMiles(geoDistance(fix[0], ship))));
  assert.ok(geoDistance(fix[1], ship) > 20 * DEG);
});

test('gravity assist: the speed relative to Jupiter is kept, only turned', () => {
  for (const rp of [1.1, 3, 10, 30]) {
    for (const sense of [1, -1] as const) {
      const f = flyby(ARRIVAL, JUPITER, rp * JUPITER.radius, sense);
      assert.ok(Math.abs(speed(f.relOut) - speed(f.relIn)) < 1e-9);
      // The most a flyby can add is twice the arrival speed relative to the planet.
      assert.ok(speed(f.vOut) - speed(f.vIn) <= 2 * speed(f.relIn) + 1e-9);
      // The drawn path passes the planet at the closest approach and leaves along the outgoing direction.
      const path = flybyPath(f, 1e9, 400);
      const closest = Math.min(...path.map((p) => Math.hypot(p[0], p[1])));
      assert.ok(Math.abs(closest / (rp * JUPITER.radius) - 1) < 1e-3);
      const a = path[path.length - 1], b = path[path.length - 2];
      const dir = Math.atan2(a[1] - b[1], a[0] - b[0]), want = Math.atan2(f.relOut[1], f.relOut[0]);
      assert.ok(Math.abs(Math.atan2(Math.sin(dir - want), Math.cos(dir - want))) < 0.02);
    }
  }
});

test('gravity assist: passing behind Jupiter can fling a spacecraft out of the solar system', () => {
  const arrive = speed(ARRIVAL);
  assert.ok(arrive < SOLAR_ESCAPE_AT_JUPITER);
  // Voyager 2 passed about 10 Jupiter radii from the centre and left fast enough to escape the Sun.
  const behind = flyby(ARRIVAL, JUPITER, 10 * JUPITER.radius, -1);
  const ahead = flyby(ARRIVAL, JUPITER, 10 * JUPITER.radius, 1);
  assert.ok(speed(behind.vOut) > SOLAR_ESCAPE_AT_JUPITER, String(speed(behind.vOut)));
  assert.ok(speed(ahead.vOut) < arrive);
});
