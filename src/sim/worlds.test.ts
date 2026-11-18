import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEG } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { testEphemeris, testStars } from '../astro/testdata.ts';
import { Universe } from './universe.ts';
import { WORLD_SITES } from './worlds.ts';

const HOME = { name: 'Toronto', lat: 43.65, lon: -79.38, height: 76, tz: 'America/Toronto' };
const universe = (jd: number) => new Universe({ eph: testEphemeris(), stars: testStars(), site: HOME, jdUT: jd });
const alt = (u: Universe, ref: string) => u.horizontal(u.resolve(ref)!.dir).alt / DEG;

test('from Tranquility Base the Earth hangs high and almost still, about 66° up', () => {
  const t0 = jdFromCalendar(2026, 11, 1, 0, 0);
  const u = universe(t0);
  u.setAway({ world: 'moon', ...WORLD_SITES.moon });
  const alts: number[] = [];
  for (let d = 0; d < 30; d += 0.5) { u.update(t0 + d); alts.push(alt(u, 'earth')); }
  // The site is 23.5° east of the point facing the Earth; libration rocks the Earth by up to about 8°.
  assert.ok(Math.min(...alts) > 55 && Math.max(...alts) < 78, `${Math.min(...alts)}..${Math.max(...alts)}`);
});

test('the Earth from the Moon is lit as much as the Moon from the Earth is dark', () => {
  for (const day of [1, 8, 15, 22]) {
    const jd = jdFromCalendar(2026, 11, day, 6, 0);
    const home = universe(jd);
    const lit = home.bodies.get('moon')!.illum;
    home.setAway({ world: 'moon', ...WORLD_SITES.moon });
    const earth = home.bodies.get('earth')!.illum;
    assert.ok(Math.abs(lit + earth - 1) < 0.02, `day ${day}: Moon ${lit}, Earth ${earth}`);
  }
});

test('on Mars the Sun keeps a sol of 24 h 39 m 35 s, and looks about two thirds as wide', () => {
  const t0 = jdFromCalendar(2026, 11, 18, 3, 0);
  const sol = 88775.244 / 86400;
  const u = universe(t0);
  u.setAway({ world: 'mars', ...WORLD_SITES.mars });
  const a0 = alt(u, 'sun');
  u.update(t0 + sol);
  assert.ok(Math.abs(alt(u, 'sun') - a0) < 1, 'same height one sol later');
  u.update(t0 + 1);
  assert.ok(Math.abs(alt(u, 'sun') - a0) > 4, 'not one Earth day later');
  // Mars is 1.38 to 1.67 AU out: the Sun's disc is 19 to 23 arcminutes across, against 32 from the Earth.
  const diameter = (2 * u.bodies.get('sun')!.radius) / DEG * 60;
  assert.ok(diameter > 19 && diameter < 23.5, `${diameter}′`);
});

test('the world underfoot is not in its own sky', () => {
  const u = universe(jdFromCalendar(2026, 11, 18, 3, 0));
  u.setAway({ world: 'mars', ...WORLD_SITES.mars });
  assert.ok(alt(u, 'mars') < -89);
  assert.equal(u.bodies.get('mars')!.radius, 0);
  u.setAway(null);
  assert.equal(u.resolve('earth'), null);
  assert.ok(u.bodies.get('mars')!.radius > 0);
});
