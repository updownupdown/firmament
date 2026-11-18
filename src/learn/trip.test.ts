import assert from 'node:assert/strict';
import { test } from 'node:test';
import { testEphemeris } from '../astro/testdata.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { launchWindows, porkchop, trip, tripPath, tripPosition } from './trip.ts';

const eph = testEphemeris();
const dist = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('trip: the path leaves the Earth and meets the target', () => {
  const t = trip(eph, 'mars', jdFromCalendar(2026, 11, 1, 0, 0), 300)!;
  assert.ok(dist(tripPosition(t, t.launch), eph.earth(t.launch)) < 1e-6);
  assert.ok(dist(tripPosition(t, t.arrive), eph.helio('mars', t.arrive)) < 1e-4);
  const path = tripPath(t, 50);
  assert.equal(path.length, 50);
  // Outward the whole way to Mars, from 1 AU to about 1.5.
  const r = path.map((p) => Math.hypot(p[0], p[1], p[2]));
  assert.ok(r[0] < 1.02 && r[49] > 1.35);
});

test('trip: Perseverance needed about 3.8 km/s beyond the Earth\'s pull', () => {
  // Launched 30 July 2020 with C3 of about 14.5 km²/s², a departure speed of about 3.8 km/s; landed 18 February 2021.
  const t = trip(eph, 'mars', jdFromCalendar(2020, 7, 30, 11, 50), jdFromCalendar(2021, 2, 18, 20, 55) - jdFromCalendar(2020, 7, 30, 11, 50))!;
  assert.ok(Math.abs(t.depart - 3.8) < 0.3, `depart ${t.depart}`);
});

test('trip: Mars windows come every 26 months, matching the real ones', () => {
  const w = launchWindows(eph, 'mars', jdFromCalendar(2020, 1, 1, 0, 0), jdFromCalendar(2031, 6, 1, 0, 0));
  // Real windows: July 2020, September 2022, October 2024, November 2026, November–December 2028, January 2031.
  const expected = [[2020, 7, 24], [2022, 9, 5], [2024, 10, 10], [2026, 11, 5], [2028, 12, 1], [2030, 12, 28]];
  assert.equal(w.length, expected.length, w.map((x) => x.launch).join(','));
  w.forEach((x, i) => {
    const [y, m, d] = expected[i];
    assert.ok(Math.abs(x.launch - jdFromCalendar(y, m, d, 0, 0)) < 30, `window ${i}`);
    // Hohmann's ideal is 2.9 + 2.6 km/s; real windows cost a little more.
    assert.ok(x.total > 5.4 && x.total < 7.2, `cost ${x.total}`);
  });
});

test('trip: Venus windows come every 19 months, Jupiter\'s every 13', () => {
  const v = launchWindows(eph, 'venus', jdFromCalendar(2024, 1, 1, 0, 0), jdFromCalendar(2029, 1, 1, 0, 0));
  for (let i = 1; i < v.length; i++) assert.ok(Math.abs(v[i].launch - v[i - 1].launch - 584) < 60, `Venus gap ${v[i].launch - v[i - 1].launch}`);
  assert.ok(v.length >= 3);
  const j = launchWindows(eph, 'jupiter', jdFromCalendar(2024, 1, 1, 0, 0), jdFromCalendar(2027, 1, 1, 0, 0));
  for (let i = 1; i < j.length; i++) assert.ok(Math.abs(j[i].launch - j[i - 1].launch - 399) < 60, `Jupiter gap ${j[i].launch - j[i - 1].launch}`);
  // Leaving for Jupiter takes far more: about 8.8 km/s for Hohmann's ellipse.
  for (const x of j) assert.ok(x.depart > 8.3 && x.depart < 10.5, `Jupiter depart ${x.depart}`);
});

test('porkchop: the best trip is the cheapest cell, polished', () => {
  const p = porkchop(eph, 'mars', jdFromCalendar(2026, 8, 1, 0, 0), jdFromCalendar(2027, 2, 1, 0, 0), 30, 24);
  let min = Infinity;
  for (const c of p.cost) min = Math.min(min, c);
  assert.ok(p.best.total <= min + 1e-9);
  assert.ok(p.best.total > min - 0.3);
  assert.ok(Math.abs(p.best.launch - jdFromCalendar(2026, 11, 1, 0, 0)) < 20);
});
