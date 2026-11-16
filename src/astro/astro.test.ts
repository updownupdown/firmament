import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ARCSEC, DEG, angleBetween, apply, cross, dot, fromSpherical, normalize, norm, sub, transpose } from './math.ts';
import { calendarFromJd, deltaT, jdFromCalendar, utFromTt } from './time.ts';
import { eclipticOfDate, gast, gmst, precessionMatrix } from './frames.ts';
import { makeFrame, observeBody, raDecOfDate } from './ephemeris.ts';
import { galileanMoons } from './galilean.ts';
import {
  allEvents, bodyRiseSet, conjunctions, eclipses, localSolarEclipse, moonPhases,
  oppositionsAndElongations, seasons, twilight,
} from './events.ts';
import { GM_SUN, elementsFromState, lambert, propagate, stateFromElements, SMALL_BODIES } from './kepler.ts';
import { NBody } from './nbody.ts';
import { testEphemeris, testStars } from './testdata.ts';

const eph = testEphemeris();
const near = (a: number, b: number, tol: number, msg?: string) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} expected ${b} ± ${tol}, got ${a}`);
const minutes = (jdA: number, jdB: number) => Math.abs(jdA - jdB) * 1440;

function geocentric(jdTT: number, id: string) {
  const f = makeFrame(eph, utFromTt(jdTT), { lat: 0, lon: 0, height: 0 });
  f.observerGeo = [0, 0, 0];
  const b = observeBody(eph, f, id);
  const [ra, dec] = raDecOfDate(f, b.dir);
  const [lon, lat] = eclipticOfDate(b.dir, f.jdTT, f.nut);
  return { ra: ra / DEG, dec: dec / DEG, lon: lon / DEG, lat: lat / DEG, b };
}

test('Julian dates (Meeus 7.a, 7.b)', () => {
  near(jdFromCalendar(2000, 1, 1, 12), 2451545.0, 1e-9);
  near(jdFromCalendar(1957, 10, 4.81), 2436116.31, 1e-6);
  near(jdFromCalendar(333, 1, 27, 12), 1842713.0, 1e-9); // Julian calendar
  near(jdFromCalendar(-4712, 1, 1, 12), 0, 1e-9);
  const c = calendarFromJd(2436116.31);
  assert.deepEqual([c.year, c.month, c.day], [1957, 10, 4]);
  const ancient = calendarFromJd(jdFromCalendar(-2800, 3, 21, 6));
  assert.deepEqual([ancient.year, ancient.month, ancient.day, ancient.hour, ancient.calendar], [-2800, 3, 21, 6, 'julian']);
});

test('ΔT is close to published values', () => {
  near(deltaT(jdFromCalendar(2000, 1, 1)), 63.8, 0.5);
  near(deltaT(jdFromCalendar(1900, 1, 1)), -2.7, 1);
  near(deltaT(jdFromCalendar(1700, 1, 1)), 21, 2);
  near(deltaT(jdFromCalendar(-500, 1, 1)), 17190, 100);
});

test('sidereal time (Meeus 12.a)', () => {
  const jd = jdFromCalendar(1987, 4, 10);
  near(gmst(jd, jd + 55.6 / 86400) / DEG, 197.693195, 0.0001);
  near(gast(jd, jd + 55.6 / 86400) / DEG, 197.69223, 0.0001);
});

test('Venus apparent place (Meeus 33.a)', () => {
  const v = geocentric(2448976.5, 'venus');
  near(v.ra, 316.172725, 1 / 3600);
  near(v.dec, -18.888011, 1 / 3600);
});

test('Sun apparent place (Meeus 25.b)', () => {
  const s = geocentric(2448908.5, 'sun');
  near(s.ra, 198.378121, 1 / 3600);
  near(s.dec, -7.783817, 1 / 3600);
});

test('Moon apparent place (Meeus 47.a, itself good to ~10″)', () => {
  const m = geocentric(2448724.5, 'moon');
  near(m.lon, 133.167265, 10 / 3600);
  near(m.lat, -3.229126, 10 / 3600);
  near(m.b.dist * 149597870.7, 368409.7, 20);
});

test('Galilean moons (Meeus 44.a)', () => {
  const jdUT = jdFromCalendar(1992, 12, 16);
  const f = makeFrame(eph, jdUT, { lat: 0, lon: 0, height: 0 });
  f.observerGeo = [0, 0, 0];
  const jup = observeBody(eph, f, 'jupiter');
  const moons = galileanMoons(f.jdTT, [-jup.dir[0], -jup.dir[1], -jup.dir[2]], jup.dist);
  // Meeus measures X along Jupiter's equator (positive west) and Y toward Jupiter's north.
  const d = jup.dir;
  const pole = fromSpherical(268.056595 * DEG, 64.495303 * DEG);
  const north = normalize(sub(pole, [d[0] * dot(pole, d), d[1] * dot(pole, d), d[2] * dot(pole, d)]));
  let west = normalize(cross(north, d));
  if (dot(west, cross([0, 0, 1], d)) > 0) west = [-west[0], -west[1], -west[2]];
  const east = [-west[0], -west[1], -west[2]] as [number, number, number];
  const expected = [[-3.44, 0.21], [7.44, 0.25], [1.24, 0.65], [7.08, 1.1]];
  moons.forEach((p, i) => {
    near(-dot(p, east), expected[i][0], 0.15, `X${i + 1}`);
    near(dot(p, north), expected[i][1], 0.15, `Y${i + 1}`);
  });
});

test('Moon phases: full Moon 2024-01-25 17:54 UT, new Moon 2024-04-08 18:21 UT', () => {
  const ph = moonPhases(eph, jdFromCalendar(2024, 1, 1), jdFromCalendar(2024, 5, 1));
  const full = ph.find((p) => p.data?.phase === 2)!;
  assert.ok(minutes(full.t, jdFromCalendar(2024, 1, 25, 17, 54)) < 2);
  const nm = ph.filter((p) => p.data?.phase === 0).find((p) => Math.abs(p.t - jdFromCalendar(2024, 4, 8)) < 2)!;
  assert.ok(minutes(nm.t, jdFromCalendar(2024, 4, 8, 18, 21)) < 2);
});

test('seasons: March equinox 2024-03-20 03:06 UT, June solstice 2026-06-21 08:24 UT', () => {
  const s = seasons(eph, jdFromCalendar(2024, 1, 1), jdFromCalendar(2024, 12, 31));
  assert.ok(minutes(s[0].t, jdFromCalendar(2024, 3, 20, 3, 6)) < 2);
  const s26 = seasons(eph, jdFromCalendar(2026, 1, 1), jdFromCalendar(2026, 12, 31));
  assert.ok(minutes(s26[1].t, jdFromCalendar(2026, 6, 21, 8, 24)) < 2);
});

test('great conjunction of Jupiter and Saturn, 2020-12-21, 6′ apart', () => {
  const c = conjunctions(eph, jdFromCalendar(2020, 12, 1), jdFromCalendar(2021, 1, 10))
    .find((e) => e.bodies.includes('jupiter') && e.bodies.includes('saturn'))!;
  assert.ok(c, 'found');
  near(c.t, jdFromCalendar(2020, 12, 21, 18), 0.5);
  near((c.data!.separation as number) / DEG * 60, 6.1, 0.3);
});

test('Mars opposition 2020-10-13', () => {
  const o = oppositionsAndElongations(eph, jdFromCalendar(2020, 9, 1), jdFromCalendar(2020, 11, 30)).find((e) => e.kind === 'opposition' && e.bodies[0] === 'mars')!;
  near(o.t, jdFromCalendar(2020, 10, 13, 23, 20), 0.1);
});

test('eclipses of 2022–2026 are found with the right types and times', () => {
  const ev = eclipses(eph, jdFromCalendar(2022, 1, 1), jdFromCalendar(2026, 12, 31));
  const find = (kind: string, y: number, m: number, d: number) =>
    ev.find((e) => e.kind === kind && Math.abs(e.t - jdFromCalendar(y, m, d, 12)) < 1);
  const checks: [string, number, number, number, string, number, number][] = [
    ['lunar-eclipse', 2022, 11, 8, 'total', 10, 59],
    ['lunar-eclipse', 2025, 3, 14, 'total', 6, 58],
    ['lunar-eclipse', 2026, 3, 3, 'total', 11, 33],
    ['solar-eclipse', 2023, 10, 14, 'annular', 18, 0],
    ['solar-eclipse', 2024, 4, 8, 'total', 18, 17],
    ['solar-eclipse', 2026, 8, 12, 'total', 17, 46],
  ];
  for (const [kind, y, m, d, type, hh, mm] of checks) {
    const e = find(kind, y, m, d);
    assert.ok(e, `${kind} ${y}-${m}-${d}`);
    assert.equal(e!.data!.type, type, `${y}-${m}-${d} type`);
    assert.ok(minutes(e!.t, jdFromCalendar(y, m, d, hh, mm)) < 20, `${y}-${m}-${d} time ${calendarFromJd(e!.t).hour}:${calendarFromJd(e!.t).minute}`);
  }
  // 2023-04-20 was a hybrid eclipse.
  const hybrid = ev.find((e) => e.kind === 'solar-eclipse' && Math.abs(e.t - jdFromCalendar(2023, 4, 20, 4)) < 1);
  assert.equal(hybrid?.data?.type, 'hybrid');
});

test('2024-04-08 eclipse: total in Dallas, deep partial in Toronto', () => {
  const t = jdFromCalendar(2024, 4, 8, 18, 20);
  const dallas = localSolarEclipse(eph, { lat: 32.78 * DEG, lon: -96.8 * DEG, height: 150 }, t)!;
  assert.ok(dallas.central && dallas.obscuration === 1, 'Dallas total');
  const toronto = localSolarEclipse(eph, { lat: 43.65 * DEG, lon: -79.38 * DEG, height: 80 }, t)!;
  assert.ok(!toronto.central && toronto.magnitude > 0.98 && toronto.magnitude < 1, `Toronto ${toronto.magnitude}`);
});

test('sunrise and sunset in Toronto on 2026-06-21 (05:36 and 21:03 EDT)', () => {
  const site = { lat: 43.6532 * DEG, lon: -79.3832 * DEG, height: 76 };
  const rs = bodyRiseSet(eph, site, jdFromCalendar(2026, 6, 21, 4), 'sun');
  assert.ok(minutes(rs.rise!, jdFromCalendar(2026, 6, 21, 9, 36)) < 2, 'rise');
  assert.ok(minutes(rs.set!, jdFromCalendar(2026, 6, 22, 1, 3)) < 2, 'set');
  const tw = twilight(eph, site, jdFromCalendar(2026, 6, 21, 17));
  assert.ok(tw.astroDusk === null || tw.minSunAlt < -18 * DEG);
  assert.ok(tw.nauticalDusk && tw.nauticalDusk > rs.set!);
});

test('Thuban was the pole star around 2800 BC; Polaris is closest around 2100', () => {
  const stars = testStars();
  const thuban = [...stars.meta.values()].find((m) => m.n === 'Thuban')!.i;
  const polaris = [...stars.meta.values()].find((m) => m.n === 'Polaris')!.i;
  const poleAt = (jdTT: number) => apply(transpose(precessionMatrix(jdTT)), [0, 0, 1]);
  const ancient = jdFromCalendar(-2800, 1, 1);
  const tDir = stars.at(thuban, (ancient - 2451545) / 365.25).dir;
  assert.ok(angleBetween(poleAt(ancient), tDir) < 1 * DEG, `Thuban ${angleBetween(poleAt(ancient), tDir) / DEG}°`);
  const now = jdFromCalendar(2100, 1, 1);
  near(angleBetween(poleAt(now), stars.at(polaris, 100).dir) / DEG, 0.45, 0.05);
});

test("Barnard's Star moves about 10.4″ a year", () => {
  const stars = testStars();
  const i = [...stars.meta.values()].find((m) => m.n === "Barnard's Star")!.i;
  near(angleBetween(stars.at(i, 0).dir, stars.at(i, 100).dir) / ARCSEC / 100, 10.39, 0.1);
});

test('Kepler propagation and elements agree; Lambert reproduces a known arc', () => {
  const halley = SMALL_BODIES.find((b) => b.id === 'halley')!;
  const t0 = 2446470.96 - 300;
  const s0 = stateFromElements(halley.elements, t0);
  const s1 = propagate(s0, 500);
  const s1b = stateFromElements(halley.elements, t0 + 500);
  assert.ok(norm(sub(s1.r, s1b.r)) < 1e-8);
  const el = elementsFromState(s0, t0);
  near(el.e, 0.96714, 1e-8);
  near(el.period / 365.25, 75.3, 1.5);
  const sol = lambert(s0.r, s1.r, 500, GM_SUN, false)!; // Halley's orbit is retrograde
  assert.ok(norm(sub(sol.v1, s0.v)) < 1e-7, 'lambert v1');
});

test('N-body leapfrog conserves energy for an Earth orbit', () => {
  const sim = new NBody();
  sim.add({ id: 'sun', mass: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0 });
  sim.add({ id: 'earth', mass: 3e-6, x: 1, y: 0, z: 0, vx: 0, vy: Math.sqrt(GM_SUN), vz: 0 });
  const e0 = sim.energy();
  for (let i = 0; i < 3650; i++) sim.step(1);
  assert.ok(Math.abs((sim.energy() - e0) / e0) < 1e-6);
  const p = sim.particles[1];
  near(Math.hypot(p.x, p.y), 1, 1e-3);
});

test('a year of events is computed quickly', () => {
  const t = Date.now();
  const ev = allEvents(eph, jdFromCalendar(2026, 1, 1), jdFromCalendar(2027, 1, 1));
  assert.ok(ev.length > 60);
  assert.ok(Date.now() - t < 20000);
  assert.ok(ev.some((e) => e.kind === 'meteor-shower' && e.title.startsWith('Perseids')));
});

