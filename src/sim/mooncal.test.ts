import { test } from 'node:test';
import assert from 'node:assert/strict';

import { bodyRiseSet, eclipses, geoFrame, moonPhases, twilight } from '../astro/events.ts';
import { moonFace, nightSky } from '../astro/lunar.ts';
import { DEG } from '../astro/math.ts';
import { jdFromCalendar, utFromTt } from '../astro/time.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import type { Culture, Dso } from '../data/types.ts';
import { jdFromLocal } from './format.ts';
import { darkestStretch, moonMonth as monthWithEvents, moonMonthSpan, sizeVsMean } from './mooncal.ts';
import { findPlace } from './places.ts';
import { type Site, Universe, earthSite } from './universe.ts';

const near = (actual: number, expected: number, tol: number, what = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what} expected ${expected} ± ${tol}, got ${actual}`);

const place = (name: string): Site => {
  const p = findPlace(name)!;
  return { name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz };
};
const TORONTO = place('Toronto');

const moonMonth = (u: Universe, year: number, month: number) => {
  const [a, b] = moonMonthSpan(u.site, year, month);
  return monthWithEvents(u, year, month, [...moonPhases(u.eph, a, b), ...eclipses(u.eph, a, b)]);
};

const universe = (site: Site, jdUT: number) => new Universe({
  eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
  cultures: [readJSON<Culture>('cultures/western.json')], site, jdUT,
});

test('moon face: libration and distance match Meeus example 53.a', () => {
  // 1992 April 12, 0h TD: l = −1.23°, b = +4.20°, distance 368,409.7 km (example 47.a).
  const f = geoFrame(testEphemeris(), utFromTt(jdFromCalendar(1992, 4, 12)));
  const m = moonFace(testEphemeris(), f);
  near(m.libLon / DEG, -1.23, 0.1, 'libration in longitude');
  near(m.libLat / DEG, 4.20, 0.1, 'libration in latitude');
  near(m.distKm, 368409.7, 20, 'distance');
  near(m.illum, 0.6786, 0.002, 'illuminated fraction');
  // Unit vectors in the picture frame; the lit side faces the Sun.
  near(Math.hypot(...m.sun), 1, 1e-9);
  near(Math.hypot(...m.pole), 1, 1e-9);
});

test('moon face: a waxing Moon is lit on the right from the north, on the left from the south', () => {
  const eph = testEphemeris();
  // First quarter on 2026-11-17 (about 11:48 UT); that evening the Moon is half lit.
  const jd = jdFromCalendar(2026, 11, 18, 0);
  const north = moonFace(eph, geoFrame(eph, jd), 'north');
  const south = moonFace(eph, geoFrame(eph, jd), 'south');
  assert.ok(north.sun[0] > 0.8, `lit from the right, got ${north.sun[0]}`);
  assert.ok(south.sun[0] < -0.8, `lit from the left, got ${south.sun[0]}`);
  // The Moon's north pole is near the top of a north-up picture.
  assert.ok(north.pole[1] > 0.9);
});

test('night sky: darkness and moonrise agree with the full searches', () => {
  const eph = testEphemeris();
  const site = earthSite(TORONTO);
  for (const [y, m, d] of [[2026, 11, 19], [2024, 6, 20], [2025, 3, 2]]) {
    const noon = jdFromLocal(TORONTO, y, m, d, 12);
    const ns = nightSky(eph, site, noon);
    const tw = twilight(eph, site, noon);
    near(ns.dark[0][0], tw.astroDusk!, 3 / 1440, `dusk ${y}-${m}-${d}`);
    near(ns.dark.at(-1)![1], tw.astroDawn!, 3 / 1440, `dawn ${y}-${m}-${d}`);
    const rs = bodyRiseSet(eph, site, noon, 'moon');
    if (rs.rise !== null) near(ns.moonRise!, rs.rise, 2 / 1440, `moonrise ${y}-${m}-${d}`);
    if (rs.set !== null) near(ns.moonSet!, rs.set, 2 / 1440, `moonset ${y}-${m}-${d}`);
    assert.ok(ns.moonlessHours <= ns.darkHours + 1e-9);
  }
});

test('moon calendar: the November 2016 supermoon at Toronto', () => {
  // Perigee 2016-11-14 11:23 UT at 356,509 km; full Moon 13:52 UT the same day.
  const u = universe(TORONTO, jdFromLocal(TORONTO, 2016, 11, 1, 12));
  const m = moonMonth(u, 2016, 11);
  assert.equal(m.days.length, 30);
  const day = m.days[13];
  assert.equal(day.quarter?.q, 2);
  near(day.quarter!.t, jdFromCalendar(2016, 11, 14, 13, 52), 3 / 1440, 'full Moon');
  assert.equal(day.size, 'super');
  assert.equal(day.apsis?.kind, 'perigee');
  near(day.apsis!.km, 356509, 30, 'perigee distance');
  near(day.apsis!.t, jdFromCalendar(2016, 11, 14, 11, 23), 15 / 1440, 'perigee');
  near(sizeVsMean(day.apsis!.km), 7.8, 0.2, 'how much wider than average');
  // Phases in order, with ages to match.
  assert.deepEqual(m.quarters.map((q) => q.q), [1, 2, 3, 0]);
  const newDay = m.days.find((d) => d.quarter?.q === 0)!;
  assert.ok(newDay.age < 1 || newDay.age > 29);
  assert.ok(m.days[13].age > 13 && m.days[13].age < 16);
  // The darkest nights are near the new Moon (29 November 2016).
  const stretch = darkestStretch(m)!;
  assert.ok(stretch[0] >= 20 && stretch[1] <= 30, `darkest stretch ${stretch}`);
  // Every day has a rising or a setting.
  assert.ok(m.days.every((d) => d.rise !== null || d.set !== null));
});

test('moon calendar: the total lunar eclipse of 14 March 2025 is seen from Toronto', () => {
  const u = universe(TORONTO, jdFromLocal(TORONTO, 2025, 3, 1, 12));
  const m = moonMonth(u, 2025, 3);
  const [a, b] = moonMonthSpan(u.site, 2025, 3);
  const events = [...moonPhases(u.eph, a, b), ...eclipses(u.eph, a, b)];
  const t0 = performance.now();
  monthWithEvents(u, 2025, 3, events);
  const ms = performance.now() - t0;
  const lunar = m.eclipses.find((e) => e.event.kind === 'lunar-eclipse')!;
  assert.ok(lunar.upHere);
  assert.equal(lunar.event.data?.type, 'total');
  // Greatest eclipse at 06:59 UT on the 14th is 02:59 EDT on the 14th.
  assert.equal(m.days[13].eclipses[0]?.kind, 'lunar-eclipse');
  // The partial solar eclipse of 29 March 2025 is in the month too.
  assert.ok(m.eclipses.some((e) => e.event.kind === 'solar-eclipse'));
  assert.ok(ms < 600, `took ${ms} ms`);
});

test('moon calendar: traditional names, the Harvest Moon and Blue Moons', () => {
  // 2025: the full Moon nearest the 22 September equinox was on 6 October in Toronto, so it is the Harvest Moon,
  // September's is the Corn Moon and November's the Hunter's Moon.
  const u = universe(TORONTO, jdFromLocal(TORONTO, 2025, 9, 1, 12));
  const name = (y: number, mo: number) => moonMonth(u, y, mo).days.find((d) => d.fullName)!.fullName!.name;
  assert.equal(name(2025, 9), 'Corn Moon');
  assert.equal(name(2025, 10), 'Harvest Moon');
  assert.equal(name(2025, 11), 'Hunter’s Moon');
  assert.equal(name(2025, 12), 'Cold Moon');
  // 2024: the Harvest Moon was on 17 September (with a partial eclipse), the Hunter's Moon on 17 October.
  assert.equal(name(2024, 9), 'Harvest Moon');
  assert.equal(name(2024, 10), 'Hunter’s Moon');
  assert.equal(name(2024, 11), 'Beaver Moon');
  // August 2023 had two full Moons, on the 1st and the 30th: the second is a Blue Moon.
  const aug = moonMonth(u, 2023, 8).days.filter((d) => d.fullName);
  assert.deepEqual(aug.map((d) => [d.day, d.blue]), [[1, false], [30, true]]);
});
