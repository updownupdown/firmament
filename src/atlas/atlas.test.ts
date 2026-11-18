import { test } from 'node:test';
import assert from 'node:assert/strict';

import { jdFromCalendar } from '../astro/time.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import type { Culture, CultureInfo, Dso } from '../data/types.ts';
import { findPlace } from '../sim/places.ts';
import { Universe } from '../sim/universe.ts';
import { ARTICLES } from './articles.ts';
import {
  ATLAS_CATEGORIES, SHOWER_RADIANT, atlasEntry, categoryById, categoryEntries, categoryOf, searchExtras,
} from './catalog.ts';

const toronto = findPlace('Toronto')!;
const u = new Universe({
  eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
  cultureIndex: readJSON<CultureInfo[]>('cultures/index.json'),
  cultures: [readJSON<Culture>('cultures/western.json')],
  site: { name: toronto.name, lat: toronto.lat, lon: toronto.lon, height: 0, tz: toronto.tz },
  jdUT: jdFromCalendar(2026, 11, 18, 3, 0),
});

test('atlas: every category has entries, and every entry resolves', () => {
  for (const c of ATLAS_CATEGORIES) {
    const list = categoryEntries(u, c);
    assert.ok(list.length > 0, c.id);
    for (const e of list) assert.ok(atlasEntry(u, e.ref), `${c.id}: ${e.ref}`);
    for (const g of c.groups(u)) assert.equal(new Set(g.entries.map((e) => e.ref)).size, g.entries.length, `${c.id}: ${g.title} repeats`);
  }
});

test('atlas: objects land in the right category', () => {
  const cases: [string, string][] = [
    ['sun', 'sun'], ['mars', 'planets'], ['moon', 'moons'], ['io', 'moons'], ['pluto', 'small'], ['ceres', 'small'],
    ['halley', 'comets'], ['region:kuiper', 'regions'], ['star:32349', 'stars'], ['con:western:Ori', 'constellations'],
    ['dso:M31', 'galaxies'], ['dso:M42', 'nebulae'], ['dso:M45', 'clusters'], ['dso:M13', 'clusters'], ['dso:M1', 'nebulae'],
    ['shower:per', 'showers'], ['culture:maori', 'cultures'],
  ];
  for (const [ref, id] of cases) assert.equal(categoryOf(u, ref)?.id, id, ref);
  // Every entry's category is the one it is listed in.
  for (const c of ATLAS_CATEGORIES) for (const e of categoryEntries(u, c)) assert.equal(categoryOf(u, e.ref)?.id, c.id, e.ref);
});

test('atlas: all 88 constellations, the nearest stars nearest first', () => {
  const groups = categoryById('constellations')!.groups(u);
  assert.equal(groups[0].entries.length, 88);
  const stars = categoryById('stars')!.groups(u);
  const nearest = stars.find((g) => g.title === 'Nearest')!.entries.map((e) => e.name);
  // Proxima Centauri (1.30 pc), then the Alpha Centauri pair.
  assert.equal(nearest[0], 'Proxima Centauri');
  assert.ok(nearest.includes('Sirius'));
  const brightest = stars.find((g) => g.title === 'Brightest')!.entries.map((e) => e.name);
  assert.equal(brightest[0], 'Sirius');
});

test('atlas: shower radiants are real constellations, and extras are searchable', () => {
  for (const iau of Object.values(SHOWER_RADIANT)) assert.ok(u.resolve(`con:western:${iau}`), iau);
  assert.ok(searchExtras(u, 'perse').some((e) => e.ref === 'shower:per'));
  assert.ok(searchExtras(u, 'galax').some((e) => e.ref === 'category:galaxies'));
  assert.ok(searchExtras(u, 'maori').some((e) => e.ref === 'culture:maori'));
});

test('atlas: articles belong to real objects and are full length', () => {
  for (const [ref, a] of Object.entries(ARTICLES)) {
    assert.ok(u.resolve(ref), ref);
    const words = [a.lede, ...a.sections.flatMap((s) => s.paragraphs)].join(' ').split(/\s+/).length;
    assert.ok(words >= 500, `${ref}: ${words} words`);
    assert.ok(a.sections.length >= 3 && a.sources.length >= 1, ref);
  }
});
