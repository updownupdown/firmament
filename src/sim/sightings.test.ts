import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEG } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { testEphemeris, testStars } from '../astro/testdata.ts';
import { eventsInRange } from './events.worker.ts';
import { findPlace } from './places.ts';
import { EVENT_GOALS, checkEvent, checkSighting, countsFromHere } from './sightings.ts';
import { type Site, Universe } from './universe.ts';

const place = (name: string): Site => {
  const p = findPlace(name)!;
  return { name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz };
};
const universe = (name: string, jdUT: number) =>
  new Universe({ eph: testEphemeris(), stars: testStars(), site: place(name), jdUT });
const goal = (ref: string) => EVENT_GOALS.find((g) => g.ref === ref)!;
const eventsOn = (y: number, m: number, d: number, kind: string) => {
  const jd = jdFromCalendar(y, m, d);
  return eventsInRange(testEphemeris(), jd - 3, jd + 3).filter((e) => e.kind === kind);
};

test('sightings: a planet below the horizon or in daylight is not confirmed', () => {
  // Toronto, 2024-12-08 02:00 UT (evening): Jupiter, a day past opposition, is well up; Mercury is not.
  const u = universe('Toronto', jdFromCalendar(2024, 12, 8, 2));
  assert.equal(checkSighting(u, u.resolve('jupiter')!).ok, true);
  assert.equal(checkSighting(u, u.resolve('mercury')!).ok, false);
  // Local noon: Jupiter is down, and Vega is up but lost in daylight.
  u.update(jdFromCalendar(2024, 12, 8, 17));
  assert.equal(checkSighting(u, u.resolve('jupiter')!).ok, false);
  assert.match(checkSighting(u, u.resolve('star:91262')!).reason, /too bright/);
});

test('sightings: the total lunar eclipse of 14 March 2025 counts from Toronto, not Nairobi', () => {
  // Published: greatest eclipse 06:59 UT, visible from the Americas; the Moon had set over East Africa.
  const [e] = eventsOn(2025, 3, 14, 'lunar-eclipse');
  assert.equal(e.data?.type, 'total');
  const toronto = universe('Toronto', e.t);
  const seen = checkEvent(toronto, e, e.t)!;
  assert.equal(seen.ok, true);
  assert.equal(seen.ref, 'event:lunar-eclipse:total');
  assert.ok(countsFromHere(toronto, e, goal('event:lunar-eclipse:total')));
  assert.equal(countsFromHere(toronto, e, goal('event:lunar-eclipse:partial')), null);
  // A day later the eclipse is over.
  assert.equal(checkEvent(toronto, e, e.t + 1)!.ok, false);
  const nairobi = universe('Nairobi', e.t);
  assert.equal(checkEvent(nairobi, e, e.t)!.ok, false);
  assert.equal(countsFromHere(nairobi, e, goal('event:lunar-eclipse:total')), null);
});

test('sightings: the solar eclipse of 8 April 2024 is total in Dallas, partial in Toronto, absent in Sydney', () => {
  // Published: totality at Dallas about 18:42 UT; Toronto just outside the path (over 99% covered).
  const [e] = eventsOn(2024, 4, 8, 'solar-eclipse');
  const dallas = universe('Dallas', e.t);
  const total = countsFromHere(dallas, e, goal('event:solar-eclipse:central'))!;
  assert.ok(total, 'central at Dallas');
  assert.ok(Math.abs(total.best - jdFromCalendar(2024, 4, 8, 18, 42)) < 3 / 1440, 'time of totality at Dallas');
  const toronto = universe('Toronto', e.t);
  assert.equal(countsFromHere(toronto, e, goal('event:solar-eclipse:central')), null);
  const partial = countsFromHere(toronto, e, goal('event:solar-eclipse:partial'))!;
  assert.match(partial.name, /^Partial solar eclipse, (9[5-9]|100)% covered$/);
  // Seen at the local maximum, but not three hours later.
  assert.equal(checkEvent(toronto, e, partial.best + 0.125)!.ok, false);
  assert.equal(checkEvent(universe('Sydney', e.t), e, e.t), null);
});

test('sightings: the Perseids count from Toronto in the dark, never from Sydney', () => {
  // The radiant (declination +58°) never clears the horizon at 34° south.
  const [e] = eventsOn(2026, 8, 13, 'meteor-shower');
  assert.equal(e.data?.shower, 'per');
  const toronto = universe('Toronto', e.t);
  const seen = countsFromHere(toronto, e, goal('event:meteor-shower:per'))!;
  assert.ok(seen, 'visible from Toronto');
  assert.equal(seen.name, 'Perseids');
  // The best hour is before dawn, with the radiant high.
  toronto.update(seen.best);
  assert.ok(toronto.horizontal(toronto.bodies.get('sun')!.dir).alt < -12 * DEG);
  assert.ok(seen.look!.alt > 45 * DEG);
  // Local noon on the peak day does not count.
  assert.match(checkEvent(toronto, e, jdFromCalendar(2026, 8, 12, 17))!.reason, /too bright/);
  assert.equal(countsFromHere(universe('Sydney', e.t), e, goal('event:meteor-shower:per')), null);
});

test('sightings: Venus and Jupiter, 12 August 2025, count before dawn', () => {
  // Published: closest on 12 August 2025, under a degree apart in the morning sky.
  const e = eventsOn(2025, 8, 12, 'conjunction').find((c) => c.bodies.includes('venus') && c.bodies.includes('jupiter'))!;
  assert.ok(e && e.importance >= 2);
  const toronto = universe('Toronto', e.t);
  const seen = countsFromHere(toronto, e, goal('event:conjunction'))!;
  assert.ok(seen, 'visible from Toronto');
  // Best in morning twilight: between 08:00 and 10:00 UT (4 to 6 am in Toronto).
  const hourUT = ((seen.best + 0.5) % 1) * 24;
  assert.ok(hourUT > 8 && hourUT < 10, `best at ${hourUT} UT`);
  // Phases and seasons are not collected.
  const [phase] = eventsOn(2025, 8, 9, 'moon-phase');
  assert.equal(checkEvent(toronto, phase, phase.t), null);
});
