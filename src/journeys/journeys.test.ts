import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, angleBetween } from '../astro/math.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import { jdNow } from '../astro/time.ts';
import type { Culture, Dso } from '../data/types.ts';
import { sceneJd } from '../sim/scene.ts';
import { type Site, Universe } from '../sim/universe.ts';
import { ACRUX, ANTARES, JOURNEYS, LAUNCH_BUDGET, LAUNCH_FROM, LAUNCH_WINDOW, MARS_NIGHTS, POLARIS, THUBAN, VEGA, findJourney } from './content.ts';
import { JourneyRun, checkTask } from './engine.ts';
import { MARS_YEAR, crossing, crossingAngle, helioEcliptic, marsFix, planTransfer } from './orbits.ts';
import { jdFromCalendar } from '../astro/time.ts';

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

test('kepler: two sightings a Mars year apart cross where Mars is', () => {
  const eph = testEphemeris();
  // Published: sidereal period 686.98 days; perihelion 1.381 AU, aphelion 1.666 AU.
  const t = MARS_NIGHTS[0];
  const a = helioEcliptic(eph, 'mars', t), b = helioEcliptic(eph, 'mars', t + MARS_YEAR);
  assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.002, 'Mars returns to the same place');
  const radii: number[] = [];
  for (const jd of MARS_NIGHTS) {
    const fix = marsFix(eph, jd);
    assert.ok(crossingAngle(fix) > 12 * DEG, `lines of sight cross clearly (${crossingAngle(fix) / DEG})`);
    const meet = crossing(fix.a, fix.b)!;
    assert.ok(Math.hypot(meet[0] - fix.mars[0], meet[1] - fix.mars[1]) < 0.003, 'crossing is Mars');
    const r = Math.hypot(fix.mars[0], fix.mars[1]);
    assert.ok(r > 1.381 - 0.002 && r < 1.666 + 0.002, `distance ${r}`);
    radii.push(r);
    // The chart shows ±1.95 AU and the task accepts the crossing but not a point 0.15 AU away.
    const task = { kind: 'mars-fix' as const, prompt: '', jd, tolerance: 0.07 };
    const u = at('kepler', 0);
    assert.equal(checkTask(task, `${meet[0]},${meet[1]}`, u).ok, true);
    assert.equal(checkTask(task, `${meet[0] + 0.15},${meet[1]}`, u).ok, false);
    assert.equal(checkTask(task, '', u).ok, false);
  }
  // The text says the four points lie between 1.38 and 1.66.
  assert.equal(Math.min(...radii).toFixed(2), '1.38');
  assert.equal(Math.max(...radii).toFixed(2), '1.66');
  // Mars is up in a dark sky for the opening scene.
  const hven = at('kepler', 0);
  assert.ok(alt(hven, 'mars') > 20, `Mars ${alt(hven, 'mars')}`);
  assert.ok(alt(hven, 'sun') < -10);
});

test('mission: the 2026 window fits the budget, a bad day does not', () => {
  const eph = testEphemeris();
  // Published: Perseverance left on 30 July 2020 with C3 = 14.49 km²/s² (3.81 km/s) and landed 203 days later.
  const p = planTransfer(eph, jdFromCalendar(2020, 7, 30, 12), 203.4)!;
  assert.ok(Math.abs(p.departV - 3.81) < 0.05, `Perseverance departure ${p.departV}`);
  // The cheapest flight the planner offers leaves in autumn 2026 and takes most of a year.
  let best = { total: Infinity, day: 0, days: 0 };
  for (let day = 0; day <= LAUNCH_WINDOW; day += 2) {
    for (let days = 120; days <= 400; days += 4) {
      const t = planTransfer(eph, LAUNCH_FROM + day, days);
      if (t && t.departV + t.arriveV < best.total) best = { total: t.departV + t.arriveV, day, days };
    }
  }
  assert.ok(best.total < LAUNCH_BUDGET - 0.3, `best ${best.total}`);
  const launch = LAUNCH_FROM + best.day;
  assert.ok(launch > jdFromCalendar(2026, 10, 1) && launch < jdFromCalendar(2026, 12, 15), 'launch in the 2026 window');
  assert.ok(best.days > 180 && best.days < 330, `flight ${best.days} days`);
  const task = findJourney('mission')!.steps[1].task!;
  const u = at('mission', 0);
  assert.equal(checkTask(task, `${launch},${best.days}`, u).ok, true);
  // The chart's starting choice, and a launch at the wrong time of the cycle, are out of reach.
  assert.equal(checkTask(task, `${LAUNCH_FROM + 40},180`, u).ok, false);
  assert.equal(checkTask(task, `${LAUNCH_FROM + 300},200`, u).ok, false);
  assert.equal(checkTask(task, '', u).ok, false);
  // Mars is up before dawn at the Cape for the opening scene.
  assert.ok(alt(u, 'mars') > 20, `Mars ${alt(u, 'mars')}`);
  assert.ok(alt(u, 'sun') < -6, `Sun ${alt(u, 'sun')}`);
});
