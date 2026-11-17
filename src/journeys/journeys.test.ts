import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, angleBetween } from '../astro/math.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import { jdNow } from '../astro/time.ts';
import type { Culture, Dso } from '../data/types.ts';
import { sceneJd } from '../sim/scene.ts';
import { type Site, Universe } from '../sim/universe.ts';
import { ACRUX, ALKAID, ANTARES, DUBHE, FOMALHAUT, JOURNEYS, MERAK, STONEHENGE_RISE_2026, STONEHENGE_RISE_2500BC, KEPLER_FIX, KEPLER_TRACK, MARS_ARRIVAL_2027, MARS_WINDOW_2026, POLARIS, THUBAN, VEGA, findJourney } from './content.ts';
import { MARS_YEAR, departureDv, eclipticXY, hohmann, marsFix, marsTrack, nextWindow } from './orbits.ts';
import { JourneyRun, checkTask } from './engine.ts';

const HOME: Site = { name: 'Toronto', lat: 43.653, lon: -79.383, height: 76, tz: 'America/Toronto' };

/** Play a journey's scenes up to a step, the way the app applies them. */
function at(id: string, stepIndex: number): Universe {
  const j = findJourney(id)!;
  let site = HOME, jd = jdNow();
  for (let i = 0; i <= stepIndex; i++) {
    const s = j.steps[i].scene;
    if (s?.site) site = s.site;
    const t = sceneJd(s?.time, jdNow());
    if (t !== undefined) jd = t;
  }
  return new Universe({
    eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
    cultures: [readJSON<Culture>('cultures/western.json')], site, jdUT: jd,
  });
}

const alt = (u: Universe, ref: string) => u.horizontal(u.resolve(ref)!.dir).altApparent / DEG;
/** Angle between an object and the north celestial pole of date, degrees. */
function poleDistance(u: Universe, ref: string): number {
  return 90 - u.equatorial(u.resolve(ref)!.dir)[1] / DEG;
}

test('every journey is well formed', () => {
  const u = at('pole', 0);
  for (const j of JOURNEYS) {
    assert.ok(j.steps.length >= 3, j.id);
    for (const s of j.steps) {
      if (s.task?.kind === 'choice') assert.ok(s.task.answer < s.task.options.length);
      if (s.task?.kind === 'find') for (const ref of s.task.refs) assert.ok(u.resolve(ref), `${j.id}: ${ref}`);
    }
  }
});

test('pole: Polaris now, Thuban in 2800 BC, Vega in AD 14,000', () => {
  assert.ok(poleDistance(at('pole', 0), POLARIS) < 1);
  const giza = at('pole', 1);
  assert.ok(poleDistance(giza, THUBAN) < 0.5, `Thuban ${poleDistance(giza, THUBAN)}`);
  assert.ok(poleDistance(giza, POLARIS) > 20);
  assert.ok(alt(giza, THUBAN) > 28 && alt(giza, THUBAN) < 32);
  const future = at('pole', 2);
  const vega = poleDistance(future, VEGA);
  assert.ok(vega < 6, `Vega ${vega}`);
  // Nothing brighter than magnitude 2 is closer to the pole than Vega.
  for (const other of ['star:32349', 'star:69673', POLARIS]) assert.ok(poleDistance(future, other) > vega);
});

test('latitude: Polaris gives the latitude to about a degree; the Cross is up in the south', () => {
  const sea = at('latitude', 0);
  assert.ok(Math.abs(alt(sea, POLARIS) - 36.5) < 1.0, `Polaris ${alt(sea, POLARIS)}`);
  const run = new JourneyRun(findJourney('latitude')!, 1);
  assert.equal(run.answer(Math.round(alt(sea, POLARIS)), sea).ok, true);
  assert.equal(run.answer(50, sea).ok, false);
  const south = at('latitude', 2);
  assert.ok(alt(south, ACRUX) > 25, `Acrux ${alt(south, ACRUX)}`);
  const hz = south.horizontal(south.resolve(ACRUX)!.dir);
  assert.ok(Math.abs(hz.az / DEG - 180) < 40);
  // It is dark there.
  assert.ok(alt(south, 'sun') < -12);
});

test('eratosthenes: overhead at Syene, 7° to 8° off at Alexandria', () => {
  const syene = at('eratosthenes', 0), alex = at('eratosthenes', 1);
  const z1 = 90 - alt(syene, 'sun'), z2 = 90 - alt(alex, 'sun');
  assert.ok(z1 < 0.6, `Syene ${z1}`);
  // The latitude difference is 7.1°; the 3° of longitude between the cities adds the rest.
  assert.ok(z2 > 7.0 && z2 < 8.3, `Alexandria ${z2}`);
  const task = findJourney('eratosthenes')!.steps[1].task!;
  assert.equal(checkTask(task, z2.toFixed(0), alex).ok, true);
  assert.equal(checkTask(task, '', alex).ok, false);
  const size = findJourney('eratosthenes')!.steps[2].task!;
  assert.equal(checkTask(size, 800 * 360 / 7.2, alex).ok, true);
  assert.equal(checkTask(size, 25000, alex).ok, false);
});

test('galileo: Jupiter is up in a dark sky over Padua, with its moons spread out', () => {
  for (const step of [0, 1, 2]) {
    const u = at('galileo', step);
    assert.ok(alt(u, 'jupiter') > 20, `step ${step}: Jupiter ${alt(u, 'jupiter')}`);
    assert.ok(alt(u, 'sun') < -6, `step ${step}: Sun ${alt(u, 'sun')}`);
  }
  // On the 13th all four moons stand clear of the disc, as Galileo drew them.
  const u = at('galileo', 2);
  const j = u.resolve('jupiter')!;
  for (const m of ['io', 'europa', 'ganymede', 'callisto']) {
    assert.ok(angleBetween(u.resolve(m)!.dir, j.dir) > j.body!.radius * 1.3, m);
  }
});

test('cultures: Antares is well up on a July evening in Hilo', () => {
  const u = at('cultures', 0);
  assert.ok(alt(u, ANTARES) > 30, `Antares ${alt(u, ANTARES)}`);
  assert.ok(alt(u, 'sun') < -12);
  const hook = readJSON<Culture>('cultures/hawaiian_starlines.json').constellations.find((c) => c.id === 'MAN')!;
  const antares = u.starIndex(ANTARES);
  assert.ok(hook.lines.flat().includes(antares));
});

test('a run only moves on once the task is done', () => {
  const u = at('pole', 0);
  const run = new JourneyRun(findJourney('pole')!);
  assert.equal(run.go(1), false);
  assert.equal(run.answer('star:32349', u).ok, false);
  assert.equal(run.answer(POLARIS, u).ok, true);
  assert.equal(run.go(1), true);
  assert.equal(run.index, 1);
  assert.equal(run.go(-1), true);
});

test('kepler: Mars is up over Prague, and two sightings a Martian year apart find it', () => {
  const u = at('kepler', 0);
  assert.ok(alt(u, 'mars') > 10, `Mars ${alt(u, 'mars')}`);
  assert.ok(alt(u, 'sun') < -12);
  const eph = testEphemeris();
  const fix = marsFix(eph, KEPLER_FIX)!;
  assert.ok(fix, 'the fix has usable geometry');
  // The crossing is where Mars really was, to within the 0.02-day mismatch of the Martian year.
  const truth = eclipticXY(eph.helio('mars', KEPLER_FIX));
  assert.ok(Math.hypot(fix.mars[0] - truth[0], fix.mars[1] - truth[1]) < 0.01);
  const step = findJourney('kepler')!.steps[2].task!;
  assert.equal(checkTask(step, 0.05, u).ok, true);
  assert.equal(checkTask(step, 0.4, u).ok, false);
});

test('kepler: the track spans Mars\'s real perihelion and aphelion, and the answer reads off it', () => {
  const eph = testEphemeris();
  const track = marsTrack(eph, KEPLER_TRACK.jd0, KEPLER_TRACK.count);
  assert.equal(track.length, KEPLER_TRACK.count);
  const r = track.map((f) => Math.hypot(f.mars[0], f.mars[1]));
  // Mars: a = 1.5237 AU, e = 0.0934, so 1.381 to 1.666 AU.
  assert.ok(Math.max(...r) > 1.64 && Math.max(...r) < 1.67, `max ${Math.max(...r)}`);
  assert.ok(Math.min(...r) > 1.38 && Math.min(...r) < 1.41, `min ${Math.min(...r)}`);
  assert.ok(Math.abs(MARS_YEAR - 686.98) < 0.01);
  const task = findJourney('kepler')!.steps[3].task!;
  const u = at('kepler', 3);
  assert.equal(checkTask(task, 1.66, u).ok, true);
  assert.equal(checkTask(task, 1.52, u).ok, false);
});

test('mars mission: the 2026 window, its flight time and arrival, checked with Lambert', () => {
  const eph = testEphemeris();
  const j = findJourney('mars-mission')!;
  const plot = j.steps[1].plot!;
  assert.equal(plot.kind, 'transfer');
  if (plot.kind !== 'transfer') return;
  const window = nextWindow(eph, plot.from)!;
  assert.ok(window > plot.from && window < plot.to);
  assert.ok(Math.abs(window - MARS_WINDOW_2026) < 2, `window ${window - MARS_WINDOW_2026}`);
  const t = hohmann(eph, window);
  assert.ok(Math.abs(t.arrive - MARS_ARRIVAL_2027) < 3, `arrival ${t.arrive - MARS_ARRIVAL_2027}`);
  assert.ok(t.days > 250 && t.days < 280);
  // The slider starts well away from the answer.
  assert.ok(Math.abs(hohmann(eph, plot.start).missDeg) > 20);
  // A real trajectory between the actual positions costs least near the Hohmann window.
  const best = (launch: number) => {
    let dv = Infinity;
    for (let days = 150; days <= 330; days += 5) dv = Math.min(dv, departureDv(eph, launch, days));
    return dv;
  };
  const atWindow = best(window);
  assert.ok(atWindow > 2.8 && atWindow < 3.6, `dv ${atWindow}`);
  for (const d of [-60, -30, 30, 60]) assert.ok(best(window + d) > atWindow, `dv at ${d} days`);
  // The task accepts launch dates within two degrees.
  assert.equal(checkTask(j.steps[1].task!, hohmann(eph, window + 1).missDeg, at('pole', 0)).ok, true);
  assert.equal(checkTask(j.steps[1].task!, hohmann(eph, window + 20).missDeg, at('pole', 0)).ok, false);
});

test('galileo: Io goes round in 1.77 days, timed with Jupiter up', () => {
  const j = findJourney('galileo')!;
  const i = j.steps.findIndex((s) => s.title === 'Time Io');
  const u = at('galileo', i);
  assert.ok(alt(u, 'jupiter') > 20);
  const task = j.steps[i].task!;
  assert.ok(checkTask(task, 1.77, u).ok);
  assert.ok(!checkTask(task, 3.5, u).ok);
});

test('navigation: Vega and Fomalhaut are both up at dusk mid-Atlantic, far apart', () => {
  const u = at('navigation', 0);
  assert.ok(alt(u, 'sun') < -6, `Sun ${alt(u, 'sun')}`);
  const v = alt(u, VEGA), f = alt(u, FOMALHAUT);
  assert.ok(v > 35 && v < 60, `Vega ${v}`);
  assert.ok(f > 10 && f < 30, `Fomalhaut ${f}`);
  // The number task reads Vega's own altitude.
  assert.ok(checkTask(findJourney('navigation')!.steps[1].task!, v + 0.5, u).ok);
});

test('stonehenge: the 2500 BC midsummer Sun rises near azimuth 48°, a degree north of today\'s', () => {
  const az = (u: Universe) => {
    const hz = u.horizontal(u.resolve('sun')!.dir);
    return hz.az / DEG;
  };
  const then = at('stonehenge', 0), now = at('stonehenge', 1);
  // Scenes start just before rise: the Sun is a little below the horizon in the northeast.
  for (const u of [then, now]) assert.ok(alt(u, 'sun') < 0 && alt(u, 'sun') > -6, `Sun ${alt(u, 'sun')}`);
  then.update(STONEHENGE_RISE_2500BC); now.update(STONEHENGE_RISE_2026);
  assert.ok(Math.abs(alt(then, 'sun')) < 1 && Math.abs(alt(now, 'sun')) < 1);
  assert.ok(checkTask(findJourney('stonehenge')!.steps[0].task!, az(then), then).ok, `rise az ${az(then)}`);
  const shift = az(now) - az(then);
  assert.ok(shift > 0.5 && shift < 2, `shift ${shift}`);
});

test('stonehenge: in AD 52,000 Dubhe and Alkaid have left the Dipper\'s shape', () => {
  const now = at('stonehenge', 2), later = at('stonehenge', 3);
  assert.ok(alt(now, DUBHE) > 30 && alt(now, 'sun') < -12);
  // The angle the bowl makes at a corner star: unchanged by turning the sky, so it shows only the stars' own motion.
  const corner = (u: Universe, at: string, a: string, b: string) => {
    const p = u.resolve(at)!.dir, x = u.resolve(a)!.dir, y = u.resolve(b)!.dir;
    const tangent = (q: number[]) => { const k = q[0] * p[0] + q[1] * p[1] + q[2] * p[2]; return [q[0] - k * p[0], q[1] - k * p[1], q[2] - k * p[2]] as [number, number, number]; };
    return angleBetween(tangent(x), tangent(y)) / DEG;
  };
  const turn = (at: string, a: string, b: string) => Math.abs(corner(later, at, a, b) - corner(now, at, a, b));
  const PHECDA = 'star:58001', MEGREZ = 'star:59774', MIZAR = 'star:65378', ALIOTH = 'star:62956';
  // Dubhe and Alkaid drift one way, the five moving-group stars the other: the bowl's lip and the handle's tip bend.
  assert.ok(turn(MERAK, DUBHE, PHECDA) > 15, `bowl corner turned ${turn(MERAK, DUBHE, PHECDA)}`);
  assert.ok(turn(MIZAR, ALKAID, ALIOTH) > 15, `handle bend turned ${turn(MIZAR, ALKAID, ALIOTH)}`);
  // Within the group, the shape barely changes.
  assert.ok(turn(PHECDA, MERAK, MEGREZ) < 5, `group corner turned ${turn(PHECDA, MERAK, MEGREZ)}`);
});
