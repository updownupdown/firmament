import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, angleBetween } from '../astro/math.ts';
import { readJSON, testEphemeris, testStars } from '../astro/testdata.ts';
import { jdFromCalendar, jdNow } from '../astro/time.ts';
import type { Culture, CultureInfo, Dso } from '../data/types.ts';
import { checkTask } from '../learn/tasks.ts';
import { MARS_YEAR, departureDv, eclipticXY, hohmann, marsFix, marsTrack, nextWindow } from '../learn/orbits.ts';
import { type Scene, sceneJd } from '../sim/scene.ts';
import { type Site, Universe } from '../sim/universe.ts';
import { atlasEntry } from './catalog.ts';
import { CONCEPTS, type Concept, type ConceptBlock, conceptScenes, findConcept } from './concepts.ts';
import {
  ACRUX, ALKAID, ANTARES, AT_SEA, BETELGEUSE, DUBHE, FOMALHAUT, KEPLER_FIX, KEPLER_TRACK, MARS_ARRIVAL_2027, MARS_LOOP,
  MARS_WINDOW_2026, MERAK, POLARIS, RIGEL, STONEHENGE_RISE_2026, STONEHENGE_RISE_2500BC, THUBAN, VEGA,
} from './moments.ts';

const HOME: Site = { name: 'Toronto', lat: 43.653, lon: -79.383, height: 76, tz: 'America/Toronto' };

function universe(site: Site, jd: number): Universe {
  return new Universe({
    eph: testEphemeris(), stars: testStars(), dsos: readJSON<Dso[]>('dsos.json'),
    cultureIndex: readJSON<CultureInfo[]>('cultures/index.json'),
    cultures: [readJSON<Culture>('cultures/western.json')], site, jdUT: jd,
  });
}
const sky = (s: Scene): Universe => universe(s.site ?? HOME, sceneJd(s.time, jdNow()) ?? jdNow());

/** The sky a concept's nth Try it button sets up. */
const at = (id: string, n: number): Universe => sky(conceptScenes(findConcept(id)!)[n]);

/** A concept's blocks of one kind, in order. */
function blocks<K extends ConceptBlock['kind']>(id: string, kind: K): Extract<ConceptBlock, { kind: K }>[] {
  return findConcept(id)!.blocks.filter((b): b is Extract<ConceptBlock, { kind: K }> => b.kind === kind);
}
const question = (id: string, n: number) => blocks(id, 'question')[n];
/** The sky a question is answered on: its own scene, or the default. */
const qsky = (id: string, n: number) => { const q = question(id, n); return q.scene ? sky(q.scene) : universe(HOME, jdNow()); };

const alt = (u: Universe, ref: string) => u.horizontal(u.resolve(ref)!.dir).altApparent / DEG;
/** Angle between an object and the north celestial pole of date, degrees. */
const poleDistance = (u: Universe, ref: string) => 90 - u.equatorial(u.resolve(ref)!.dir)[1] / DEG;
const words = (c: Concept) => [c.lede, ...c.blocks.flatMap((b) => (b.kind === 'text' ? b.paragraphs : []))].join(' ').split(/\s+/).length;

test('concepts: well formed, long, and everything they name resolves', () => {
  const u = universe(HOME, jdFromCalendar(2026, 11, 18, 3, 0));
  assert.equal(new Set(CONCEPTS.map((c) => c.id)).size, CONCEPTS.length);
  for (const c of CONCEPTS) {
    assert.ok(words(c) >= 500, `${c.id}: ${words(c)} words`);
    assert.ok(conceptScenes(c).length >= 1, `${c.id} has something to try`);
    for (const ref of c.related) assert.ok(atlasEntry(u, ref), `${c.id}: related ${ref}`);
    for (const b of c.blocks) {
      if (b.kind === 'question' && b.task.kind === 'choice') assert.ok(b.task.answer < b.task.options.length, c.id);
      if (b.kind === 'try') for (const ref of b.scene.highlight ?? []) if (ref.startsWith('con:western') || ref.startsWith('star:')) assert.ok(u.resolve(ref), `${c.id}: ${ref}`);
    }
  }
});

test('turning sky: the Big Dipper is circumpolar from Toronto; the Cross is up at sea in the south', () => {
  const u = at('turning-sky', 0);
  // Dubhe's polar distance is less than Toronto's latitude, so it never sets.
  assert.ok(poleDistance(u, DUBHE) < HOME.lat, `Dubhe ${poleDistance(u, DUBHE)}`);
  assert.ok(alt(u, 'sun') < -12);
  const south = at('turning-sky', 1);
  assert.ok(alt(south, ACRUX) > 25 && alt(south, 'sun') < -12, `Acrux ${alt(south, ACRUX)}`);
});

test('magnitudes and colours: Orion is up in a dark sky; Betelgeuse is redder and Rigel brighter', () => {
  const u = at('magnitudes', 0);
  assert.ok(alt(u, BETELGEUSE) > 25 && alt(u, RIGEL) > 15 && alt(u, 'sun') < -18, `Betelgeuse ${alt(u, BETELGEUSE)}`);
  const b = u.stars.bv?.[u.starIndex(BETELGEUSE)], r = u.stars.bv?.[u.starIndex(RIGEL)];
  if (b !== undefined && r !== undefined) assert.ok(b > 1.4 && r < 0.1, `B−V ${b} ${r}`);
  assert.ok(alt(at('star-colours', 0), BETELGEUSE) > 25);
  const mags = question('magnitudes', 0);
  assert.equal(checkTask(mags.task, 1, u).ok, true);
});

test('seasons: the noon Sun from Toronto is about 70° up in June and 23° in December', () => {
  const june = alt(at('seasons', 0), 'sun'), dec = alt(at('seasons', 1), 'sun');
  assert.ok(Math.abs(june - 69.8) < 0.6, `June ${june}`);
  assert.ok(Math.abs(dec - 22.9) < 0.6, `December ${dec}`);
  // Twice the tilt between them.
  assert.ok(Math.abs(june - dec - 46.9) < 0.6);
  assert.equal(checkTask(question('seasons', 0).task, 46, at('seasons', 0)).ok, true);
});

test('seasons: the 2500 BC midsummer Sun rose about a degree north of today\'s', () => {
  const then = at('seasons', 2), now = at('seasons', 3);
  for (const u of [then, now]) assert.ok(alt(u, 'sun') < 0 && alt(u, 'sun') > -6, `Sun ${alt(u, 'sun')}`);
  then.update(STONEHENGE_RISE_2500BC); now.update(STONEHENGE_RISE_2026);
  assert.ok(Math.abs(alt(then, 'sun')) < 1 && Math.abs(alt(now, 'sun')) < 1);
  const az = (u: Universe) => u.horizontal(u.resolve('sun')!.dir).az / DEG;
  assert.ok(Math.abs(az(then) - 48) < 3, `rise az ${az(then)}`);
  const shift = az(now) - az(then);
  assert.ok(shift > 0.5 && shift < 2, `shift ${shift}`);
});

test('eclipses: the Moon covers the Sun over Dallas, and sits in the Earth\'s shadow on 14 March 2025', () => {
  const solar = at('eclipses', 0);
  const gap = angleBetween(solar.resolve('sun')!.dir, solar.resolve('moon')!.dir) / DEG;
  assert.ok(gap < 0.05, `Sun–Moon ${gap}°`);
  assert.ok(alt(solar, 'sun') > 50);
  const lunar = at('eclipses', 1);
  const opp = 180 - angleBetween(lunar.resolve('sun')!.dir, lunar.resolve('moon')!.dir) / DEG;
  // The umbra is about 0.7° in radius at the Moon's distance.
  assert.ok(opp < 0.4, `Moon off the shadow's centre by ${opp}°`);
  assert.ok(alt(lunar, 'moon') > 15, `Moon ${alt(lunar, 'moon')}`);
});

test('retrograde: Mars moves west against the stars around its 2027 opposition', () => {
  const ra = (jd: number) => { const u = universe(HOME, jd); return u.equatorial(u.resolve('mars')!.dir)[0] / DEG; };
  const unwrap = (a: number, b: number) => ((b - a + 540) % 360) - 180;
  // Eastward in December, westward through February, eastward again in May.
  assert.ok(unwrap(ra(MARS_LOOP[0]), ra(MARS_LOOP[0] + 10)) > 0);
  assert.ok(unwrap(ra(MARS_LOOP[1] - 5), ra(MARS_LOOP[1] + 5)) < 0);
  assert.ok(unwrap(ra(MARS_LOOP[2]), ra(MARS_LOOP[2] + 10)) > 0);
  const u = universe(HOME, MARS_LOOP[1]);
  assert.ok(angleBetween(u.resolve('sun')!.dir, u.resolve('mars')!.dir) / DEG > 170, 'opposition');
  for (let i = 0; i < 3; i++) assert.ok(alt(at('retrograde', i), 'mars') > 15, `Mars at try ${i}`);
});

test('precession: Polaris now, Thuban in 2800 BC, Vega in AD 14,000', () => {
  assert.ok(poleDistance(at('precession', 0), POLARIS) < 1);
  const giza = at('precession', 1);
  assert.ok(poleDistance(giza, THUBAN) < 0.5, `Thuban ${poleDistance(giza, THUBAN)}`);
  assert.ok(poleDistance(giza, POLARIS) > 20);
  assert.ok(alt(giza, THUBAN) > 28 && alt(giza, THUBAN) < 32);
  const future = at('precession', 2);
  const vega = poleDistance(future, VEGA);
  assert.ok(vega < 6, `Vega ${vega}`);
  for (const other of ['star:32349', 'star:69673', POLARIS]) assert.ok(poleDistance(future, other) > vega);
});

test('latitude: Polaris gives the latitude to about a degree; the Cross is up in the south', () => {
  const sea = at('latitude', 0);
  assert.ok(Math.abs(alt(sea, POLARIS) - 36.5) < 1.0, `Polaris ${alt(sea, POLARIS)}`);
  assert.equal(AT_SEA.lat, 36.5);
  const task = question('latitude', 0).task;
  assert.equal(checkTask(task, Math.round(alt(sea, POLARIS)), sea).ok, true);
  assert.equal(checkTask(task, 50, sea).ok, false);
  const south = at('latitude', 1);
  assert.ok(alt(south, ACRUX) > 25, `Acrux ${alt(south, ACRUX)}`);
  assert.ok(Math.abs(south.horizontal(south.resolve(ACRUX)!.dir).az / DEG - 180) < 40);
  assert.ok(alt(south, 'sun') < -12);
});

test('eratosthenes: overhead at Syene, 7° to 8° off at Alexandria', () => {
  const syene = at('eratosthenes', 0), alex = at('eratosthenes', 1);
  const z1 = 90 - alt(syene, 'sun'), z2 = 90 - alt(alex, 'sun');
  assert.ok(z1 < 0.6, `Syene ${z1}`);
  // The latitude difference is 7.1°; the 3° of longitude between the cities adds the rest.
  assert.ok(z2 > 7.0 && z2 < 8.3, `Alexandria ${z2}`);
  // The question reads the Sun off the Alexandria sky, whatever the reader is looking at.
  const u = qsky('eratosthenes', 0);
  assert.equal(checkTask(question('eratosthenes', 0).task, z2.toFixed(0), u).ok, true);
  assert.equal(checkTask(question('eratosthenes', 0).task, '', u).ok, false);
  const size = question('eratosthenes', 1).task;
  assert.equal(checkTask(size, 800 * 360 / 7.2, u).ok, true);
  assert.equal(checkTask(size, 25000, u).ok, false);
});

test('galileo: Jupiter is up in a dark sky over Padua, with its moons spread out on the 13th', () => {
  for (const n of [0, 1, 2]) {
    const u = at('galileo-moons', n);
    assert.ok(alt(u, 'jupiter') > 20, `try ${n}: Jupiter ${alt(u, 'jupiter')}`);
    assert.ok(alt(u, 'sun') < -6, `try ${n}: Sun ${alt(u, 'sun')}`);
  }
  const u = at('galileo-moons', 2);
  const j = u.resolve('jupiter')!;
  for (const m of ['io', 'europa', 'ganymede', 'callisto']) assert.ok(angleBetween(u.resolve(m)!.dir, j.dir) > j.body!.radius * 1.3, m);
  const io = question('galileo-moons', 0).task;
  assert.ok(checkTask(io, 1.77, u).ok);
  assert.ok(!checkTask(io, 3.5, u).ok);
});

test('sky cultures: Antares is well up on a July evening in Hilo, and is on Maui\'s hook', () => {
  const u = at('sky-cultures', 0);
  assert.ok(alt(u, ANTARES) > 30, `Antares ${alt(u, ANTARES)}`);
  assert.ok(alt(u, 'sun') < -12);
  const hook = readJSON<Culture>('cultures/hawaiian_starlines.json').constellations.find((c) => c.id === 'MAN')!;
  assert.ok(hook.lines.flat().includes(u.starIndex(ANTARES)));
});

test('kepler: Mars is up over Prague, and two sightings a Martian year apart find it', () => {
  const u = at('kepler', 0);
  assert.ok(alt(u, 'mars') > 10, `Mars ${alt(u, 'mars')}`);
  assert.ok(alt(u, 'sun') < -12);
  const eph = testEphemeris();
  const fix = marsFix(eph, KEPLER_FIX)!;
  assert.ok(fix, 'the fix has usable geometry');
  const truth = eclipticXY(eph.helio('mars', KEPLER_FIX));
  assert.ok(Math.hypot(fix.mars[0] - truth[0], fix.mars[1] - truth[1]) < 0.01);
  const tri = blocks('kepler', 'plot')[0].task!;
  assert.equal(checkTask(tri, 0.05, u).ok, true);
  assert.equal(checkTask(tri, 0.4, u).ok, false);
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
  const u = at('kepler', 0);
  assert.equal(checkTask(question('kepler', 0).task, 1.66, u).ok, true);
  assert.equal(checkTask(question('kepler', 0).task, 1.52, u).ok, false);
});

test('hohmann: the 2026 window, its flight time and arrival, checked with Lambert', () => {
  const eph = testEphemeris();
  const b = blocks('hohmann', 'plot')[0];
  const plot = b.plot;
  assert.equal(plot.kind, 'transfer');
  if (plot.kind !== 'transfer') return;
  const window = nextWindow(eph, plot.from)!;
  assert.ok(window > plot.from && window < plot.to);
  assert.ok(Math.abs(window - MARS_WINDOW_2026) < 2, `window ${window - MARS_WINDOW_2026}`);
  const t = hohmann(eph, window);
  assert.ok(Math.abs(t.arrive - MARS_ARRIVAL_2027) < 3, `arrival ${t.arrive - MARS_ARRIVAL_2027}`);
  assert.ok(t.days > 250 && t.days < 280);
  assert.ok(Math.abs(hohmann(eph, plot.start).missDeg) > 20);
  const best = (launch: number) => {
    let dv = Infinity;
    for (let days = 150; days <= 330; days += 5) dv = Math.min(dv, departureDv(eph, launch, days));
    return dv;
  };
  const atWindow = best(window);
  assert.ok(atWindow > 2.8 && atWindow < 3.6, `dv ${atWindow}`);
  for (const d of [-60, -30, 30, 60]) assert.ok(best(window + d) > atWindow, `dv at ${d} days`);
  const u = universe(HOME, jdNow());
  assert.equal(checkTask(b.task!, hohmann(eph, window + 1).missDeg, u).ok, true);
  assert.equal(checkTask(b.task!, hohmann(eph, window + 20).missDeg, u).ok, false);
  assert.equal(checkTask(question('hohmann', 0).task, Math.round(t.days), u).ok, true);
});

test('navigation: Vega and Fomalhaut are both up at dusk mid-Atlantic, and the question reads Vega there', () => {
  const u = at('navigation', 0);
  assert.ok(alt(u, 'sun') < -6, `Sun ${alt(u, 'sun')}`);
  const v = alt(u, VEGA), f = alt(u, FOMALHAUT);
  assert.ok(v > 35 && v < 60, `Vega ${v}`);
  assert.ok(f > 10 && f < 30, `Fomalhaut ${f}`);
  assert.ok(checkTask(question('navigation', 0).task, v + 0.5, qsky('navigation', 0)).ok);
  // The chart is drawn from the same moment.
  assert.deepEqual(blocks('navigation', 'plot')[0].scene, conceptScenes(findConcept('navigation')!)[0]);
});

test('proper motion: in AD 52,000 Dubhe and Alkaid have left the Dipper\'s shape', () => {
  const now = at('proper-motion', 0), later = at('proper-motion', 1);
  assert.ok(alt(now, DUBHE) > 30 && alt(now, 'sun') < -12);
  // The angle the bowl makes at a corner star: unchanged by turning the sky, so it shows only the stars' own motion.
  const corner = (u: Universe, c: string, a: string, b: string) => {
    const p = u.resolve(c)!.dir, x = u.resolve(a)!.dir, y = u.resolve(b)!.dir;
    const tangent = (q: number[]) => { const k = q[0] * p[0] + q[1] * p[1] + q[2] * p[2]; return [q[0] - k * p[0], q[1] - k * p[1], q[2] - k * p[2]] as [number, number, number]; };
    return angleBetween(tangent(x), tangent(y)) / DEG;
  };
  const turn = (c: string, a: string, b: string) => Math.abs(corner(later, c, a, b) - corner(now, c, a, b));
  const PHECDA = 'star:58001', MEGREZ = 'star:59774', MIZAR = 'star:65378', ALIOTH = 'star:62956';
  assert.ok(turn(MERAK, DUBHE, PHECDA) > 15, `bowl corner turned ${turn(MERAK, DUBHE, PHECDA)}`);
  assert.ok(turn(MIZAR, ALKAID, ALIOTH) > 15, `handle bend turned ${turn(MIZAR, ALKAID, ALIOTH)}`);
  assert.ok(turn(PHECDA, MERAK, MEGREZ) < 5, `group corner turned ${turn(PHECDA, MERAK, MEGREZ)}`);
});
