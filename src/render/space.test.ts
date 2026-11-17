import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, type Vec3 } from '../astro/math.ts';
import { SpaceCamera, keplerPeriod, sampleOrbit } from './space.ts';

test('the focus sits in the middle of the view, at the camera distance', () => {
  const cam = new SpaceCamera();
  cam.width = 800; cam.height = 600; cam.dist = 5;
  cam.update();
  const s = cam.projectCamera(cam.toCamera([0, 0, 0]))!;
  assert.ok(Math.abs(s.x - 400) < 1e-9 && Math.abs(s.y - 300) < 1e-9);
  assert.ok(Math.abs(s.depth - 5) < 1e-12);
});

test('ecliptic north is up on screen and the field of view is 40° tall', () => {
  const cam = new SpaceCamera();
  cam.width = 800; cam.height = 600; cam.dist = 10; cam.pitch = 0; cam.yaw = 0.7;
  cam.update();
  // The ecliptic pole in J2000 equatorial coordinates (obliquity 23.4393°).
  const eps = 23.4392911 * DEG;
  const north: Vec3 = [0, -Math.sin(eps), Math.cos(eps)];
  const edge = 10 * Math.tan(20 * DEG);
  const s = cam.projectCamera(cam.toCamera([north[0] * edge, north[1] * edge, north[2] * edge]))!;
  assert.ok(Math.abs(s.x - 400) < 1e-6);
  assert.ok(Math.abs(s.y) < 1e-6);
});

test('points behind the camera are not drawn', () => {
  const cam = new SpaceCamera();
  cam.dist = 1; cam.pitch = 0; cam.yaw = 0;
  cam.update();
  // The camera sits at +x (toward the equinox) from the focus, looking back at it.
  assert.equal(cam.projectCamera(cam.toCamera([2, 0, 0])), null);
  assert.notEqual(cam.projectCamera(cam.toCamera([-2, 0, 0])), null);
});

test('changing focus glides rather than jumps', () => {
  const cam = new SpaceCamera();
  cam.setFocus('earth', [-1, 0, 0]);
  assert.equal(cam.focus, 'earth');
  assert.deepEqual(cam.offset, [-1, 0, 0]);
  for (let i = 0; i < 400; i++) cam.tick(1 / 60);
  assert.deepEqual(cam.offset, [0, 0, 0]);
});

test("Kepler's third law gives Halley's period", () => {
  // q = 0.5871 AU, e = 0.96714: about 75.3 years (the 1986 apparition's osculating orbit).
  assert.ok(Math.abs(keplerPeriod(0.5871, 0.96714) / 365.25 - 75.3) < 0.5);
  assert.ok(Math.abs(keplerPeriod(1, 0) - 365.256) < 0.01);
});

test('an orbit trail ends on the body', () => {
  const circle = (t: number): Vec3 => [Math.cos(t / 10), Math.sin(t / 10), 0];
  const pts = sampleOrbit(circle, 100, 20 * Math.PI, 60);
  assert.equal(pts.length, 61 * 3);
  const here = circle(100);
  assert.ok(Math.hypot(pts[180] - here[0], pts[181] - here[1]) < 1e-12);
  assert.ok(Math.hypot(pts[0] - here[0], pts[1] - here[1]) < 1e-9);
});

test('the Galilean moons circle Jupiter at their true distances', async () => {
  const { galileanAround } = await import('./space.ts');
  const jupiter: Vec3 = [-5, 1, 0.4], earth: Vec3 = [0.2, 0.9, 0.4];
  const AU = 149597870.7;
  // Semi-major axes, km (Io, Europa, Ganymede, Callisto).
  const expected = [421700, 671034, 1070412, 1882709];
  const moons = galileanAround(2461000.5, jupiter, earth);
  moons.forEach((m, k) => {
    const km = Math.hypot(m[0] - jupiter[0], m[1] - jupiter[1], m[2] - jupiter[2]) * AU;
    assert.ok(Math.abs(km / expected[k] - 1) < 0.01, `moon ${k}: ${km} km`);
  });
  // Half an orbit later Io is on the far side of Jupiter.
  const later = galileanAround(2461000.5 + 1.769138 / 2, jupiter, earth)[0];
  const a = moons[0].map((x, i) => x - jupiter[i]), b = later.map((x, i) => x - jupiter[i]);
  const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (Math.hypot(...a) * Math.hypot(...b));
  assert.ok(cos < -0.99, `cos ${cos}`);
});

test('lifting off toward a far body keeps the start centred, then closes in on the target', () => {
  const cam = new SpaceCamera();
  cam.width = 800; cam.height = 600;
  const shift: Vec3 = [4.3, -2.7, -1.2];   // the Earth, seen from Jupiter
  cam.liftOff(shift, 3e-4, 0.03);
  cam.tick(0.05);
  // The Earth (at `shift` from the focus) is still in the middle of the view.
  const s = cam.projectCamera(cam.toCamera(shift))!;
  assert.ok(Math.hypot(s.x - 400, s.y - 300) < 1, `${s.x}, ${s.y}`);
  for (let i = 0; i < 200; i++) cam.tick(0.05);
  assert.ok(Math.abs(cam.dist - 0.03) < 1e-9, `${cam.dist}`);
  assert.deepEqual(cam.offset, [0, 0, 0]);
});
