import assert from 'node:assert/strict';
import test from 'node:test';
import { EQ_TO_ECL_J2000 } from './frames.ts';
import { apply, norm, sub } from './math.ts';
import { KIRKWOOD, PARTICLE_STRIDE, REGIONS, buildPopulation, particlePosition, regionById, resonance } from './populations.ts';
import { testEphemeris } from './testdata.ts';
import { J2000, jdFromCalendar } from './time.ts';

const eph = testEphemeris();
const eclLon = (v: number[]) => { const q = apply(EQ_TO_ECL_J2000, v as [number, number, number]); return Math.atan2(q[1], q[0]); };
const wrapPi = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));

/** Day (JD) near `jd0` when a body is opposite the Sun in ecliptic longitude. */
function opposition(id: string, jd0: number): number {
  const f = (t: number) => {
    const p = eph.helio(id, t), e = eph.earth(t);
    return wrapPi(eclLon(sub(p, e)) - eclLon(e));
  };
  let lo = jd0 - 40, hi = jd0 + 40;
  for (let k = 0; k < 60; k++) { const mid = (lo + hi) / 2; if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

test('named asteroids reach opposition on their published dates', () => {
  // Published oppositions: Vesta 2 May 2025, Ceres 2 October 2025.
  assert.ok(Math.abs(opposition('vesta', jdFromCalendar(2025, 5, 2)) - jdFromCalendar(2025, 5, 2, 12)) < 2);
  assert.ok(Math.abs(opposition('ceres', jdFromCalendar(2025, 10, 2)) - jdFromCalendar(2025, 10, 2, 12)) < 2);
});

test('distant worlds are where published', () => {
  // Sedna reaches perihelion, 76 AU out, around 2075–2076; Eris is about 96 AU from the Sun in the 2020s.
  let best = Infinity, when = 0;
  for (let jd = jdFromCalendar(2060, 1, 1); jd < jdFromCalendar(2090, 1, 1); jd += 30) {
    const r = norm(eph.helio('sedna', jd));
    if (r < best) { best = r; when = jd; }
  }
  assert.ok(Math.abs(best - 76.2) < 0.3, `Sedna perihelion ${best}`);
  assert.ok(when > jdFromCalendar(2075, 1, 1) && when < jdFromCalendar(2077, 1, 1));
  const eris = norm(eph.helio('eris', jdFromCalendar(2025, 1, 1)));
  assert.ok(eris > 95 && eris < 96.5, `Eris ${eris}`);
});

test('the main belt has its Kirkwood gaps', () => {
  const d = buildPopulation('main-belt', 4000);
  for (let k = 0; k < 4000; k++) {
    const a = d[k * PARTICLE_STRIDE];
    assert.ok(a > 2.05 && a < 3.33);
    for (const [g, w] of KIRKWOOD) assert.ok(Math.abs(a - g) >= w);
  }
  // The 3:1 gap really is where an asteroid makes three laps to Jupiter's one.
  assert.ok(Math.abs(resonance(5.2029, 1 / 3) - 2.502) < 0.003);
});

test('trojans keep 60° from Jupiter', () => {
  const d = buildPopulation('trojans', 2000);
  for (const days of [0, 9000, -40000]) {
    const lj = eclLon(eph.helio('jupiter', J2000 + days));
    let s = 0, c = 0;
    for (let k = 0; k < 2000; k++) {
      const p = particlePosition(d, k, days);
      const dl = wrapPi(Math.atan2(p[1], p[0]) - lj);
      if (dl > 0) { s += Math.sin(dl); c += Math.cos(dl); }
    }
    const centre = Math.atan2(s, c) * 180 / Math.PI;
    // Jupiter's true place swings ±6° about its mean one, so allow a little more than that.
    assert.ok(Math.abs(centre - 60) < 9, `L4 centre ${centre}° at ${days}`);
  }
});

test('plutinos never meet Neptune', () => {
  // Pluto never comes within 17 AU of Neptune; the resonance keeps the whole family well clear.
  const d = buildPopulation('plutinos', 800);
  let closest = Infinity;
  for (let days = 0; days < 365.25 * 400; days += 365.25 * 9) {
    const n = apply(EQ_TO_ECL_J2000, eph.helio('neptune', J2000 + days));
    for (let k = 0; k < 800; k++) closest = Math.min(closest, norm(sub(particlePosition(d, k, days), n)));
  }
  assert.ok(closest > 8, `closest ${closest}`);
});

test('regions and the Oort cloud', () => {
  const o = buildPopulation('oort-outer', 2000);
  for (let k = 0; k < 2000; k++) {
    const r = norm(particlePosition(o, k, 1e6));
    assert.ok(r >= 19999 && r <= 100001, `r ${r}`);
  }
  assert.equal(regionById('region:kuiper')?.name, 'Kuiper belt');
  for (const r of REGIONS) assert.ok(r.inner < r.outer && r.populations.length > 0);
});
