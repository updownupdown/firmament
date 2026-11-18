import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jdFromCalendar } from '../astro/time.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import type { Culture, CultureInfo, Dso } from '../data/types.ts';
import { findPlace } from '../sim/places.ts';
import { Universe } from '../sim/universe.ts';
import { atlasEntry } from './catalog.ts';
import { SOLAR_SYSTEM } from './system.ts';

const toronto = findPlace('Toronto')!;
const u = new Universe({
  eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
  cultureIndex: readJSON<CultureInfo[]>('cultures/index.json'),
  cultures: [readJSON<Culture>('cultures/western.json')],
  site: { name: toronto.name, lat: toronto.lat, lon: toronto.lon, height: 0, tz: toronto.tz },
  jdUT: jdFromCalendar(2026, 11, 18, 3, 0),
});

test('solar system list: every row opens an Atlas page, once', () => {
  const refs = SOLAR_SYSTEM.map((n) => n.ref).filter((r): r is string => r !== null);
  assert.equal(new Set(refs).size, refs.length);
  for (const ref of refs) assert.ok(atlasEntry(u, ref), ref);
  // Every body the Universe tracks is in the list.
  for (const id of ['sun', 'mercury', 'venus', 'moon', 'mars', 'jupiter', 'io', 'saturn', 'uranus', 'neptune', 'pluto', 'ceres', 'eris', 'sedna', 'halley', 'halebopp']) {
    assert.ok(refs.includes(id), id);
  }
});

test('solar system list: runs outward from the Sun, children after their parent', () => {
  const top = SOLAR_SYSTEM.filter((n) => n.depth === 0);
  for (let i = 1; i < top.length; i++) assert.ok(top[i].au > top[i - 1].au, `${top[i].ref} after ${top[i - 1].ref}`);
  assert.equal(SOLAR_SYSTEM[0].ref, 'sun');
  assert.equal(SOLAR_SYSTEM.at(-1)!.depth, 1);
  assert.equal(top.at(-1)!.ref, 'region:oort');
  assert.equal(SOLAR_SYSTEM[0].depth, 0);
});
