import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEG } from '../astro/math.ts';
import { J2000, jdFromCalendar } from '../astro/time.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import type { AstroEvent } from '../astro/events.ts';
import type { Culture, Dso } from '../data/types.ts';
import { Clock, JD_MAX, accuracyAt, describeRate } from './clock.ts';
import { EventService, addMonths, monthOf, monthRange } from './events.ts';
import { eventsInRange } from './events.worker.ts';
import {
  compassPoint, describeSkyPosition, formatAngularSize, formatDMS, formatDate, formatDistanceAU, formatDistancePc,
  formatRA, formatTime, formatYear, formatZone, jdFromLocal, localTime, nightAnchor, zoneOffset,
} from './format.ts';
import { findPlace } from './places.ts';
import { DEFAULT_LAYERS, type Scene, decodeScene, encodeScene, sceneJd } from './scene.ts';
import { STORE_KEY, Store, type StorageLike, migrate } from './store.ts';
import { moonPhaseName, tonight } from './tonight.ts';
import { type Site, Universe } from './universe.ts';

const near = (actual: number, expected: number, tol: number, what = '') =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what} expected ${expected} ± ${tol}, got ${actual}`);

const place = (name: string): Site => {
  const p = findPlace(name)!;
  return { name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz };
};
const TORONTO = place('Toronto');

function memoryStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => { map.set(k, v); },
    removeItem: (k) => { map.delete(k); },
  };
}

function universe(site: Site, jdUT: number): Universe {
  return new Universe({
    eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
    cultures: [readJSON<Culture>('cultures/western.json')], site, jdUT,
  });
}

test('clock: ticks at its rate, pauses, and stops at the end of the range', () => {
  const c = new Clock(J2000);
  c.rate = 3600;
  assert.equal(c.tick(2), true);
  near(c.jdUT, J2000 + 2 / 24, 1e-9);
  c.paused = true;
  assert.equal(c.tick(10), false);
  c.paused = false;
  c.setJd(JD_MAX - 1);
  c.rate = 86400 * 365;
  c.tick(10);
  assert.equal(c.jdUT, JD_MAX);
  assert.equal(c.paused, true);
  c.setJd(Infinity);
  assert.ok(Number.isFinite(c.jdUT));
  assert.equal(describeRate(3600), '1 h/s');
  assert.equal(describeRate(-86400), '−1 d/s');
});

test('clock: accuracy label degrades away from the present', () => {
  assert.equal(accuracyAt(jdFromCalendar(2026, 11, 16)).level, 'precise');
  assert.equal(accuracyAt(jdFromCalendar(-500, 1, 1)).level, 'good');
  assert.equal(accuracyAt(jdFromCalendar(-2800, 1, 1)).level, 'approximate');
  assert.equal(accuracyAt(J2000 - 50000 * 365.25).level, 'qualitative');
  assert.ok(accuracyAt(jdFromCalendar(-2800, 1, 1)).rotationDeg > 1);
});

test('format: civil time uses the IANA zone, including daylight saving', () => {
  const winter = jdFromCalendar(2026, 11, 16, 22, 50);
  assert.equal(formatTime(winter, TORONTO), '17:50');
  assert.equal(formatTime(winter, TORONTO, { hour12: true }), '5:50 pm');
  assert.equal(formatZone(zoneOffset(TORONTO, winter)), 'UTC−5');
  assert.equal(formatDate(winter, TORONTO, { weekday: true }), 'Mon 16 Nov 2026');
  const summer = jdFromCalendar(2026, 7, 1, 2, 0);
  assert.equal(formatZone(zoneOffset(TORONTO, summer)), 'UTC−4');
  assert.equal(formatDate(summer, TORONTO), '30 Jun 2026');
  assert.equal(formatZone(zoneOffset(place('Delhi') ?? TORONTO, summer)), 'UTC+5:30');
});

test('format: local time round-trips and old dates use local mean time', () => {
  const jd = jdFromLocal(TORONTO, 2026, 7, 4, 21, 30);
  const lt = localTime(jd, TORONTO);
  assert.deepEqual([lt.year, lt.month, lt.day, lt.hour, lt.minute], [2026, 7, 4, 21, 30]);
  near(jd, jdFromCalendar(2026, 7, 5, 1, 30), 1e-8);
  // 240 BC in Alexandria: no civil zone, the Julian calendar, and the offset is longitude / 15 h.
  const alex = place('Alexandria');
  const old = jdFromLocal(alex, -239, 6, 26, 12);
  const o = zoneOffset(alex, old);
  assert.equal(o.kind, 'lmt');
  near(o.minutes, alex.lon * 4, 0.5);
  assert.equal(localTime(old, alex).calendar, 'julian');
  assert.equal(formatDate(old, alex), '26 Jun 240 BC');
  assert.equal(formatYear(0), '1 BC');
  assert.equal(formatYear(79), 'AD 79');
  assert.equal(formatYear(14000), '14,000');
});

test('format: night anchor is the previous noon in the small hours', () => {
  const evening = jdFromLocal(TORONTO, 2026, 11, 16, 20);
  const smallHours = jdFromLocal(TORONTO, 2026, 11, 17, 2);
  const noon = jdFromLocal(TORONTO, 2026, 11, 16, 12);
  near(nightAnchor(evening, TORONTO), noon, 1e-8);
  near(nightAnchor(smallHours, TORONTO), noon, 1e-8);
  near(nightAnchor(jdFromLocal(TORONTO, 2026, 11, 17, 9), TORONTO), noon + 1, 1e-8);
});

test('format: angles, directions and distances', () => {
  assert.equal(formatRA(83.8221 * DEG), '5h 35m 17s');
  assert.equal(formatDMS(-5.3911 * DEG), '−5° 23′ 28″');
  assert.equal(formatAngularSize(0.52 * DEG), '31′');
  assert.equal(formatAngularSize((44 / 3600) * DEG), '44″');
  assert.equal(compassPoint(225 * DEG), 'SW');
  assert.equal(describeSkyPosition(225 * DEG, 12 * DEG), 'low in the southwest');
  assert.equal(formatDistanceAU(0.00257), '384,000 km');
  assert.equal(formatDistanceAU(5.2), '5.2 AU');
  assert.equal(formatDistancePc(2.637), '8.6 light-years');
});

test('scene: survives a round trip through the URL hash', () => {
  const scene: Scene = {
    time: { jd: 2461361.45833 }, rate: 3600, site: TORONTO,
    camera: { look: 'star:32349', fov: 40, track: true },
    layers: { lines: false, boundaries: true, ecliptic: true }, culture: 'chinese', bortle: 3,
    select: 'dso:M31', highlight: ['mars', 'con:western:Ori'],
  };
  const back = decodeScene('#' + encodeScene(scene));
  assert.deepEqual(back.time, scene.time);
  assert.equal(back.rate, 3600);
  assert.equal(back.site?.name, 'Toronto');
  near(back.site!.lat, TORONTO.lat, 1e-4);
  assert.equal(back.site?.tz, 'America/Toronto');
  assert.deepEqual(back.camera, scene.camera);
  assert.deepEqual(back.layers, scene.layers);
  assert.equal(back.culture, 'chinese');
  assert.equal(back.bortle, 3);
  assert.equal(back.select, 'dso:M31');
  assert.deepEqual(back.highlight, scene.highlight);

  assert.deepEqual(decodeScene(encodeScene({ camera: { look: { az: 180, alt: 30 }, mode: 'space' } })).camera,
    { look: { az: 180, alt: 30 }, mode: 'space' });
  const spaceCam = { look: 'jupiter', mode: 'space' as const, dist: 0.01234, orbit: { yaw: -70.5, pitch: 32 } };
  assert.deepEqual(decodeScene(encodeScene({ camera: spaceCam })).camera, spaceCam);
  assert.equal(encodeScene({ camera: spaceCam }), 'c=jupiter,,space,0.01234au,-70.5;32deg');
  assert.deepEqual(decodeScene(encodeScene({ time: { offsetDays: -2.5 } })).time, { offsetDays: -2.5 });
  assert.deepEqual(decodeScene('t=now').time, 'now');
  // Junk never throws and never produces half-valid values.
  assert.deepEqual(decodeScene('s=abc,def&r=fast&b=99&zzz&c=,&%E0%A4%A=1'), { bortle: 9, camera: {} });
  near(sceneJd({ utc: '2000-01-01T12:00:00Z' }, 0)!, J2000, 1e-9);
  assert.equal(Object.keys(DEFAULT_LAYERS).length, 23);
});

test('store: saves, reloads and repairs damaged data', () => {
  const storage = memoryStorage();
  const a = new Store(storage);
  assert.equal(a.data.site, null);
  a.setSite(TORONTO);
  a.update((d) => { d.settings.bortle = 7; d.settings.layers.boundaries = true; });
  assert.equal(a.markSeen('welcome'), true);
  assert.equal(a.markSeen('welcome'), false);

  const b = new Store(storage);
  assert.equal(b.data.site?.name, 'Toronto');
  assert.equal(b.data.settings.bortle, 7);
  assert.equal(b.data.settings.layers.boundaries, true);
  assert.equal(b.data.settings.layers.lines, true);

  storage.setItem(STORE_KEY, '{not json');
  assert.equal(new Store(storage).data.settings.culture, 'western');
  const repaired = migrate({ version: 1, settings: { bortle: 40 }, site: { name: 'x', lat: 500 }, log: [{ ref: 3 }], seen: 'no' });
  assert.equal(repaired.settings.bortle, 9);
  assert.equal(repaired.site, null);
  // An observing log from older versions is dropped.
  assert.equal('log' in repaired, false);
  assert.equal(migrate({ version: 99 }).version, 3);
  assert.equal(migrate({ version: 2, settings: { layers: { twinkle: true } as never } }).settings.layers.twinkle, false);
  // The old default light pollution moves to the new dark default; a chosen value stays.
  assert.equal(migrate({ version: 1, settings: { bortle: 4 } }).settings.bortle, 2);
  assert.equal(migrate({ version: 1, settings: { bortle: 7 } }).settings.bortle, 7);
  assert.equal(migrate({ version: 2, settings: { bortle: 4 } }).settings.bortle, 4);
  // Storage that throws must not break the app.
  const broken = new Store({ getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() {} });
  broken.setSite(TORONTO);
  assert.equal(broken.data.site?.name, 'Toronto');
});

test('universe: resolves every kind of reference', () => {
  const u = universe(TORONTO, jdFromCalendar(2026, 11, 17, 3, 0));
  const sirius = u.resolve('star:32349')!;
  assert.equal(sirius.name, 'Sirius');
  assert.equal(sirius.subtitle, 'α Canis Majoris');
  near(sirius.mag!, -1.44, 0.05);
  const [ra, dec] = u.equatorial(sirius.dir);
  near(ra / DEG, 101.6, 0.3, 'Sirius RA of date');
  near(dec / DEG, -16.75, 0.1, 'Sirius Dec of date');
  assert.equal(u.resolve('star#0')!.ref, 'star:32349');
  assert.equal(u.resolve('jupiter')!.kind, 'planet');
  assert.equal(u.resolve('pluto')!.kind, 'dwarf');
  assert.equal(u.resolve('halley')!.kind, 'comet');
  const m31 = u.resolve('dso:m31')!;
  assert.equal(m31.name, 'Andromeda Galaxy');
  assert.equal(m31.ref, 'dso:M31');
  const orion = u.resolve('con:western:Ori')!;
  assert.equal(orion.name, 'Orion');
  near(u.equatorial(orion.dir)[1] / DEG, 0, 8, 'Orion straddles the equator');
  assert.equal(u.resolve('star:999999999'), null);
  assert.equal(u.resolve('con:western:Nope'), null);
  assert.equal(u.resolve('nonsense'), null);
});

test('universe: Polaris stands at the latitude of the observer', () => {
  const u = universe(TORONTO, jdFromCalendar(2026, 11, 17, 3, 0));
  const polaris = u.resolve(u.search('Polaris')[0].ref)!;
  const h = u.horizontal(polaris.dir);
  near(h.alt / DEG, TORONTO.lat, 0.8, 'Polaris altitude');
  assert.ok(h.az < 2 * DEG || h.az > 358 * DEG, 'Polaris is due north');
  // From Sydney it never rises.
  u.setSite(place('Sydney'));
  assert.ok(u.horizontal(u.resolve(polaris.ref)!.dir).alt < -30 * DEG);
  assert.equal(u.riseSet(polaris.ref, u.frame.jdUT)!.neverUp, true);
});

test('universe: Galilean moons sit beside Jupiter', () => {
  const u = universe(TORONTO, jdFromCalendar(2026, 11, 17, 3, 0));
  const jup = u.bodies.get('jupiter')!;
  for (const id of ['io', 'europa', 'ganymede', 'callisto']) {
    const m = u.resolve(id)!;
    const sep = Math.acos(Math.min(1, m.dir[0] * jup.dir[0] + m.dir[1] * jup.dir[1] + m.dir[2] * jup.dir[2]));
    assert.ok(sep < 28 * jup.radius, `${id} within its orbit radius`);
    assert.ok(m.mag! > 4 && m.mag! < 7, `${id} magnitude ${m.mag}`);
    assert.equal(m.subtitle, 'Moon of Jupiter');
  }
});

test('universe: search finds names, designations and catalog numbers', () => {
  const u = universe(TORONTO, J2000);
  const first = (q: string) => u.search(q)[0]?.name;
  assert.equal(first('sirius'), 'Sirius');
  assert.equal(first('Jup'), 'Jupiter');
  assert.equal(first('alpha orionis'), 'Betelgeuse');
  assert.equal(first('α Ori'), 'Betelgeuse');
  assert.equal(first('m 31'), 'Andromeda Galaxy');
  assert.equal(first('M42'), u.resolve('dso:M42')!.name);
  assert.equal(first('hip 91262'), 'Vega');
  assert.equal(first('orion'), 'Orion');
  assert.equal(first('big dipper'), 'Big Dipper (Plough)');
  assert.equal(first('halley'), "Halley's Comet");
  assert.deepEqual(u.search('   '), []);
  assert.deepEqual(u.search('qqqqqq'), []);
});

test('tonight: Jupiter is up all night at opposition and Venus is an evening star', () => {
  // Jupiter was at opposition on 2023-11-03.
  let u = universe(TORONTO, jdFromLocal(TORONTO, 2023, 11, 3, 20));
  let t = tonight(u, u.frame.jdUT);
  const jupiter = t.planets.find((p) => p.id === 'jupiter')!;
  assert.equal(jupiter.when, 'all-night');
  near(jupiter.mag, -2.9, 0.15, 'Jupiter magnitude at opposition');
  assert.equal(t.darkness, 'dark');
  // Published sunset for Toronto on 2023-11-03 is 18:05 EDT.
  near(t.twilight.sunset!, jdFromLocal(TORONTO, 2023, 11, 3, 18, 5), 2 / 1440, 'sunset');
  assert.ok(t.constellations.length > 3);

  // Venus near greatest eastern elongation (2025-01-10): bright after sunset, gone by midnight.
  u = universe(TORONTO, jdFromLocal(TORONTO, 2025, 1, 10, 18));
  t = tonight(u, u.frame.jdUT);
  const venus = t.planets.find((p) => p.id === 'venus')!;
  assert.equal(venus.when, 'evening');
  assert.ok(venus.set! - t.twilight.sunset! > 3 / 24, 'Venus sets more than three hours after the Sun');
  assert.ok(venus.mag < -4);
  assert.ok(venus.bestAz > 180 * DEG && venus.bestAz < 270 * DEG, 'Venus is in the southwest');
});

test('tonight: Moon phase and the midnight Sun', () => {
  // Full Moon on 2024-04-23 23:49 UT.
  let u = universe(TORONTO, jdFromLocal(TORONTO, 2024, 4, 23, 21));
  let t = tonight(u, u.frame.jdUT);
  assert.equal(t.moon.phaseName, 'Full Moon');
  assert.ok(t.moon.illum > 0.99);
  assert.equal(t.moon.when, 'all-night');
  assert.equal(moonPhaseName(45 * DEG), 'Waxing crescent');
  assert.equal(moonPhaseName(300 * DEG), 'Waning crescent');
  assert.equal(moonPhaseName(91 * DEG), 'First quarter');
  // Tromsø at midsummer: the Sun does not set.
  const tromso = place('Tromsø');
  u = universe(tromso, jdFromLocal(tromso, 2026, 6, 21, 20));
  t = tonight(u, u.frame.jdUT);
  assert.equal(t.darkness, 'day');
  assert.equal(t.twilight.sunset, null);
  assert.ok(t.planets.every((p) => !p.visible));
});

test('events: a month of calendar events, computed once and then cached', async () => {
  const march = { year: 2024, month: 3 };
  assert.deepEqual(addMonths({ year: 2024, month: 12 }, 1), { year: 2025, month: 1 });
  assert.deepEqual(addMonths({ year: 2024, month: 1 }, -1), { year: 2023, month: 12 });
  assert.deepEqual(monthOf(jdFromCalendar(2024, 3, 31, 23, 59)), march);
  const [jd0, jd1] = monthRange(march);
  assert.equal(jd1 - jd0, 31);

  let calls = 0;
  const storage = memoryStorage();
  const compute = async (a: number, b: number): Promise<AstroEvent[]> => {
    calls++;
    return eventsInRange(testEphemeris(), a, b);
  };
  const service = new EventService(compute, storage);
  assert.equal(service.cached(march), null);
  const [events, again] = await Promise.all([service.month(march), service.month(march)]);
  assert.equal(calls, 1, 'concurrent requests share one computation');
  assert.equal(events, again);
  // Published: equinox 2024-03-20 03:06 UT; penumbral lunar eclipse 2024-03-25 07:13 UT.
  const equinox = events.find((e) => e.kind === 'season')!;
  near(equinox.t, jdFromCalendar(2024, 3, 20, 3, 6), 2 / 1440, 'equinox');
  const eclipse = events.find((e) => e.kind === 'lunar-eclipse')!;
  near(eclipse.t, jdFromCalendar(2024, 3, 25, 7, 13), 5 / 1440, 'eclipse maximum');
  assert.equal(events.filter((e) => e.kind === 'moon-phase').length, 4);
  assert.ok(events.every((e) => e.t >= jd0 && e.t < jd1));

  // A new service with the same storage does not recompute.
  const second = new EventService(compute, storage);
  assert.equal((await second.month(march)).length, events.length);
  assert.equal(calls, 1);
  const slice = await second.range(jdFromCalendar(2024, 3, 19), jdFromCalendar(2024, 3, 21));
  assert.ok(slice.some((e) => e.kind === 'season'));
  assert.equal(calls, 1);
});

test('format: angles in hands at arm\'s length', async () => {
  const { handMeasure } = await import('./format.ts');
  const deg = Math.PI / 180;
  // The Big Dipper's pointers are about 5.4° apart, three fingers; the Dipper's bowl to Polaris about 28°.
  assert.equal(handMeasure(0.5 * deg), 'less than a finger');
  assert.equal(handMeasure(1 * deg), 'about 1 finger');
  assert.equal(handMeasure(5.4 * deg), 'about three fingers');
  assert.equal(handMeasure(10 * deg), 'about a fist');
  assert.equal(handMeasure(20 * deg), 'about a spread hand');
  assert.equal(handMeasure(28 * deg), 'about 3 fists');
  assert.equal(handMeasure(90 * deg), 'about 9 fists');
});

test('a loaded Tycho-2 star can be named and found; an unloaded one cannot', async () => {
  const { testEphemeris, testStars } = await import('../astro/testdata.ts');
  const { Universe } = await import('./universe.ts');
  const { TYCHO_KEEP } = await import('../astro/tycho.ts');
  const u = new Universe({ eph: testEphemeris(), stars: testStars(), dsos: [], cultures: [], site: { name: 'X', lat: 0, lon: 0, height: 0, tz: '' }, jdUT: 2451545 });
  const band = { ra: Float64Array.of(1), dec: Float64Array.of(0.5), mag: Float32Array.of(10.2) };
  u.addFaintBand(35, band);
  const o = u.resolve('tyc:35:0')!;
  assert.equal(o.kind, 'star');
  assert.equal(o.mag, Float32Array.of(10.2)[0]);
  // Aberration moves it by at most about 20″.
  const want = [Math.cos(0.5) * Math.cos(1), Math.cos(0.5) * Math.sin(1), Math.sin(0.5)];
  assert.ok(Math.acos(o.dir[0] * want[0] + o.dir[1] * want[1] + o.dir[2] * want[2]) < 25 / 206265);
  assert.equal(u.resolve('tyc:35:1'), null);
  assert.equal(u.resolve('tyc:3:0'), null);
  // Only the most recent bands are kept.
  for (let b = 0; b < TYCHO_KEEP; b++) u.addFaintBand(b, band);
  assert.equal(u.resolve('tyc:35:0'), null);
});

test('Lore points at real stars and constellations, and the old Lumen setting is dropped', async () => {
  const { BODY_STORIES, CONSTELLATION_LORE, STAR_LORE, loreFor } = await import('./lore.ts');
  assert.ok(!('guide' in migrate({ version: 1, settings: { guide: 'on' } as never }).settings));

  const western = readJSON<Culture>('cultures/western.json');
  const u = new Universe({ eph: testEphemeris(), stars: testStars(), dsos: [], cultures: [western], site: TORONTO, jdUT: jdFromCalendar(2026, 11, 17, 0, 0) });
  for (const hip of Object.keys(STAR_LORE)) assert.ok(u.resolve(`star:${hip}`), `HIP ${hip}`);
  const iau = new Set(western.constellations.map((c) => c.iau));
  for (const id of Object.keys(CONSTELLATION_LORE)) assert.ok(iau.has(id), id);
  for (const id of Object.keys(BODY_STORIES)) assert.ok(u.resolve(id), id);

  // Each note pairs a fact with a story.
  const vega = u.resolve('star:91262')!;
  const lore = loreFor(u, vega, () => null);
  assert.ok(lore.science && lore.story);
  const orion = u.resolve(`con:western:${western.constellations.find((c) => c.iau === 'Ori')!.id}`)!;
  assert.ok(loreFor(u, orion, () => null).story?.includes('hunter'));
  assert.equal(loreFor(u, u.resolve('saturn')!, () => 'rings').science, 'rings');
});
