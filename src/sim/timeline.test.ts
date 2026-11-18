import assert from 'node:assert/strict';
import { test } from 'node:test';
import { localTime, jdFromLocal } from './format.ts';
import { nightMoments, shiftSameTime, timelineWindow, upSpans, withClockOf } from './timeline.ts';
import type { Tonight, TonightBody } from './tonight.ts';

const toronto = { lat: 43.653, lon: -79.383, height: 76, tz: 'America/Toronto', name: 'Toronto' };
const at = (y: number, m: number, d: number, hh: number, mm = 0) => jdFromLocal(toronto, y, m, d, hh, mm);
const clock = (jd: number) => { const t = localTime(jd, toronto); return `${t.year}-${t.month}-${t.day} ${t.hour}:${String(t.minute).padStart(2, '0')}`; };

test('the night strip runs from the noon before to the next noon', () => {
  const evening = timelineWindow('night', at(2026, 11, 18, 21), toronto);
  assert.equal(clock(evening.start), '2026-11-18 12:00');
  assert.equal(clock(evening.end), '2026-11-19 12:00');
  // In the small hours and the morning, it is still last night's strip.
  const morning = timelineWindow('night', at(2026, 11, 19, 9), toronto);
  assert.equal(evening.start, morning.start);
  // Across the end of daylight saving (1 Nov 2026) the strip is 25 hours, noon to noon.
  const dst = timelineWindow('night', at(2026, 10, 31, 22), toronto);
  assert.equal(clock(dst.end), '2026-11-1 12:00');
  assert.ok(Math.abs((dst.end - dst.start) * 24 - 25) < 1e-6);
});

test('month and year strips follow the calendar', () => {
  const m = timelineWindow('month', at(2026, 2, 14, 20), toronto);
  assert.equal(clock(m.start), '2026-2-1 0:00');
  assert.equal(clock(m.end), '2026-3-1 0:00');
  const y = timelineWindow('year', at(2026, 7, 4, 22), toronto);
  assert.equal(clock(y.start), '2026-1-1 0:00');
  assert.equal(clock(y.end), '2027-1-1 0:00');
});

test('stepping keeps the clock time, through daylight saving and short months', () => {
  assert.equal(clock(shiftSameTime(at(2026, 10, 31, 21), toronto, 'day', 1)), '2026-11-1 21:00');
  assert.equal(clock(shiftSameTime(at(2026, 3, 7, 21), toronto, 'day', 1)), '2026-3-8 21:00');
  assert.equal(clock(shiftSameTime(at(2026, 1, 31, 21), toronto, 'month', 1)), '2026-2-28 21:00');
  assert.equal(clock(shiftSameTime(at(2026, 1, 15, 21), toronto, 'month', -1)), '2025-12-15 21:00');
  assert.equal(clock(shiftSameTime(at(2024, 2, 29, 21), toronto, 'year', 1)), '2025-2-28 21:00');
  assert.equal(clock(withClockOf(at(2026, 12, 14, 3), at(2026, 11, 18, 21, 30), toronto)), '2026-12-14 21:30');
});

const body = (id: string, rise: number | null, set: number | null, visible = true): TonightBody => ({
  id, visible, rise, set, from: null, until: null, best: null, bestAlt: 0, bestAz: 0, mag: 0, when: 'night',
});

test('a body is up between its rise and set, or around them', () => {
  assert.deepEqual(upSpans(body('moon', 2, 5), 0, 10), [[2, 5]]);
  assert.deepEqual(upSpans(body('moon', 7, 3), 0, 10), [[0, 3], [7, 10]]);
  assert.deepEqual(upSpans(body('moon', null, 3), 0, 10), [[0, 3]]);
  assert.deepEqual(upSpans(body('moon', null, null), 0, 10), [[0, 10]]);
  assert.deepEqual(upSpans(body('moon', null, null, false), 0, 10), []);
});

test('the night’s moments are in order, inside the strip, and only for planets you can see', () => {
  const tw = { sunset: 1, civilDusk: 1.1, nauticalDusk: 1.2, astroDusk: 1.3, astroDawn: 1.8, nauticalDawn: 1.85, civilDawn: 1.9, sunrise: 1.95, minSunAlt: -1 };
  const night = {
    anchor: 0.9, twilight: tw, darkFrom: 1.3, darkUntil: 1.8, darkness: 'dark',
    moon: { ...body('moon', 0.9, 1.5), illum: 0.5, elongation: 1, phaseName: '', waxing: true },
    planets: [body('jupiter', 1.4, null), body('venus', 1.7, null, false), body('saturn', null, 1.6)],
    constellations: [],
  } as unknown as Tonight;
  const labels = nightMoments(night, 0.9, 1.9).map((m) => m.label);
  // Moonrise at 0.9 is in daylight, before sunset, so it is left out.
  assert.deepEqual(labels, ['Sunset', 'Dark', 'Jupiter rises', 'Moonset', 'Saturn sets', 'Dawn']);
});
