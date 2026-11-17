import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, type Vec3, dot } from '../astro/math.ts';
import { SkyProjection, refractVector, skyRefraction, unrefractVector, viewMatrix } from './projection.ts';

const fromAzAlt = (az: number, alt: number): Vec3 =>
  [-Math.cos(alt) * Math.cos(az), Math.cos(alt) * Math.sin(az), Math.sin(alt)];

test('refraction matches the standard values', () => {
  // Sæmundsson's formula (Meeus, Astronomical Algorithms, ch. 16): about 29′ for a
  // body truly on the horizon, about 1′ at 45°, nothing at the zenith.
  assert.ok(Math.abs(skyRefraction(0) / DEG * 60 - 29) < 0.5);
  assert.ok(Math.abs(skyRefraction(45 * DEG) / DEG * 60 - 1.0) < 0.05);
  assert.ok(Math.abs(skyRefraction(10 * DEG) / DEG * 60 - 5.3) < 0.2);
  assert.ok(skyRefraction(90 * DEG) / DEG * 60 < 0.01);
  // Faded out well below the horizon, so the ground is not distorted.
  assert.equal(skyRefraction(-10 * DEG), 0);
});

test('refraction can be undone', () => {
  for (const alt of [-3, -0.5, 0, 0.5, 5, 30, 89]) {
    const h = fromAzAlt(1.1, alt * DEG);
    const back = unrefractVector(refractVector(h));
    assert.ok(Math.acos(Math.min(1, dot(h, back))) < 2e-6, `alt ${alt}`);
  }
});

test('the view centre lands in the middle of the canvas', () => {
  const p = new SkyProjection();
  p.width = 800; p.height = 600; p.refraction = false;
  p.az = 123 * DEG; p.alt = 40 * DEG; p.fov = 60 * DEG;
  p.update();
  const s = p.project(fromAzAlt(p.az, p.alt))!;
  assert.ok(Math.abs(s.x - 400) < 1e-6 && Math.abs(s.y - 300) < 1e-6);
  // Looking south: east is to the left, up is up.
  p.az = 180 * DEG; p.alt = 20 * DEG; p.update();
  assert.ok(p.project(fromAzAlt(170 * DEG, 20 * DEG))!.x < 400);
  assert.ok(p.project(fromAzAlt(180 * DEG, 30 * DEG))!.y < 300);
});

test('field of view spans the shorter side', () => {
  const p = new SkyProjection();
  p.width = 800; p.height = 600; p.refraction = false;
  p.az = 0; p.alt = 0; p.fov = 60 * DEG;
  p.update();
  const top = p.project(fromAzAlt(0, 30 * DEG))!;
  assert.ok(Math.abs(top.y) < 1e-6);
});

test('project and unproject are inverses, with and without refraction', () => {
  const p = new SkyProjection();
  p.width = 390; p.height = 844;
  p.az = 200 * DEG; p.alt = 15 * DEG; p.fov = 90 * DEG;
  for (const refraction of [false, true]) {
    p.refraction = refraction;
    p.update();
    for (const [x, y] of [[10, 10], [195, 422], [380, 700], [100, 600]]) {
      const s = p.project(p.unproject(x, y))!;
      assert.ok(Math.hypot(s.x - x, s.y - y) < 0.01, `${x},${y} ${refraction}`);
    }
  }
});

test('the view matrix is a rotation', () => {
  const m = viewMatrix(1.2, 0.4);
  const rows: Vec3[] = [[m[0], m[1], m[2]], [m[3], m[4], m[5]], [m[6], m[7], m[8]]];
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    assert.ok(Math.abs(dot(rows[i], rows[j]) - (i === j ? 1 : 0)) < 1e-12);
  }
});

test('sky conditions: eclipse geometry and the faintest stars on a dark night', async () => {
  const { uncoveredFraction, skyConditions } = await import('./conditions.ts');
  assert.equal(uncoveredFraction(1, 1, 3), 1);
  assert.equal(uncoveredFraction(1, 1.05, 0), 0);
  // An annular eclipse: a smaller disc in the middle leaves a ring.
  assert.ok(Math.abs(uncoveredFraction(1, 0.9, 0) - 0.19) < 1e-9);
  // Two equal discs a radius apart overlap by 2π/3 − √3/2 (the lens area).
  assert.ok(Math.abs(uncoveredFraction(1, 1, 1) - (1 - (2 * Math.PI / 3 - Math.sqrt(3) / 2) / Math.PI)) < 1e-9);
  const { testEphemeris, testStars } = await import('../astro/testdata.ts');
  const { Universe } = await import('../sim/universe.ts');
  // New Moon, midnight, a dark site: the classic naked-eye limit of about 6.5 to 7.6.
  const u = new Universe({ eph: testEphemeris(), stars: testStars(), dsos: [], cultures: [], site: { name: 'Dark', lat: 31, lon: -105, height: 0, tz: '' }, jdUT: 2461383.79 });
  const dark = skyConditions(u, { bortle: 1, atmosphere: true, fov: 70 * Math.PI / 180 });
  assert.ok(dark.nakedEyeLimit > 6.5 && dark.nakedEyeLimit <= 7.6, String(dark.nakedEyeLimit));
  const city = skyConditions(u, { bortle: 8, atmosphere: true, fov: 70 * Math.PI / 180 });
  assert.ok(city.nakedEyeLimit < dark.nakedEyeLimit - 3, String(city.nakedEyeLimit));
});
