import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEG, type Mat3, type Vec3, apply, fromSpherical, mul, rotX, rotZ, transpose } from '../astro/math.ts';
import { ascentPose, matchingFov, nadirAzimuth, orbitAngles } from './ascent.ts';
import { SkyProjection } from './projection.ts';
import { SpaceCamera } from './space.ts';

/** A horizon frame for some place and moment: any rotation will do. */
const frames: Mat3[] = [
  mul(rotX(0.7), rotZ(2.1)), mul(rotX(-1.1), rotZ(-0.4)), mul(rotZ(0.3), mul(rotX(2.6), rotZ(4.0))),
];

for (const [k, m] of frames.entries()) {
  for (const [w, h] of [[390, 844], [1280, 800]]) {
    test(`looking straight down at the top of the climb matches Space view star for star (frame ${k}, ${w}×${h})`, () => {
      const zenith = apply(transpose(m), [0, 0, 1]);
      const { yaw, pitch } = orbitAngles(zenith);
      if (Math.abs(pitch) > 88 * DEG) return; // Space view's pitch stops short of the ecliptic pole
      const cam = new SpaceCamera();
      cam.width = w; cam.height = h; cam.yaw = yaw; cam.pitch = pitch; cam.dist = 3e-4;
      cam.update();
      const sky = new SkyProjection();
      sky.width = w; sky.height = h; sky.refraction = false;
      sky.az = nadirAzimuth(m); sky.alt = -90 * DEG; sky.lens = 1; sky.fov = matchingFov(w, h, cam.fovY);
      sky.update();
      let checked = 0;
      for (let ra = 0; ra < 360; ra += 7) {
        for (let de = -85; de <= 85; de += 5) {
          const d: Vec3 = fromSpherical(ra * DEG, de * DEG);
          const c = apply(cam.view, d);
          if (c[2] > -0.5) continue;
          const sx = w / 2 + (cam.focal * c[0]) / -c[2], sy = h / 2 - (cam.focal * c[1]) / -c[2];
          if (sx < 0 || sx > w || sy < 0 || sy > h) continue;
          const p = sky.project(apply(m, d))!;
          assert.ok(Math.hypot(p.x - sx, p.y - sy) < 0.01, `ra ${ra} de ${de}: sky ${p.x},${p.y} space ${sx},${sy}`);
          checked++;
        }
      }
      assert.ok(checked > 20);
    });
  }
}

test('the lens blends stereographic into perspective and unprojects back', () => {
  const p = new SkyProjection();
  p.width = 800; p.height = 600; p.refraction = false; p.az = 1; p.alt = 0.3;
  for (const lens of [0.5, 0.7, 1]) {
    p.lens = lens; p.fov = 50 * DEG; p.update();
    // The shorter side spans the field of view at every lens.
    const top = p.project(p.unproject(400, 0))!;
    assert.ok(Math.abs(top.y) < 1e-6 && Math.abs(top.x - 400) < 1e-6);
    for (const [x, y] of [[100, 80], [700, 500], [400, 300]]) {
      const back = p.project(p.unproject(x, y))!;
      assert.ok(Math.hypot(back.x - x, back.y - y) < 1e-6);
    }
  }
  // A point 25° from the centre: tan(θ) away in perspective, 2 tan(θ/2) stereographically, in units of scale.
  p.alt = 0; p.az = 0; p.fov = 60 * DEG;
  const off: Vec3 = [-Math.cos(25 * DEG), 0, Math.sin(25 * DEG)];
  p.lens = 1; p.update();
  assert.ok(Math.abs((300 - p.project(off)!.y) / p.scale - Math.tan(25 * DEG)) < 1e-9);
  p.lens = 0.5; p.update();
  assert.ok(Math.abs((300 - p.project(off)!.y) / p.scale - 2 * Math.tan(12.5 * DEG)) < 1e-9);
});

test('the climb starts on the ground and ends looking straight down, in orbit, through the perspective lens', () => {
  const ground = { az: 3, alt: 20 * DEG, fov: 150 * DEG };
  const top = { az: -2.5, fov: 40 * DEG, height: 6 };
  const a = ascentPose(0, ground, top);
  assert.deepEqual([a.height, a.lens], [0, 0.5]);
  assert.ok(Math.abs(a.alt - ground.alt) < 1e-12 && Math.abs(a.fov - ground.fov) < 1e-12);
  const b = ascentPose(1, ground, top);
  assert.ok(Math.abs(b.height - 6) < 1e-9 && b.lens === 1 && Math.abs(b.alt + 90 * DEG) < 1e-12 && Math.abs(b.fov - top.fov) < 1e-12);
  assert.ok(Math.abs(Math.cos(b.az - top.az) - 1) < 1e-12);
  // Always going up.
  let last = 0;
  for (let t = 0.01; t <= 1; t += 0.01) {
    const h = ascentPose(t, ground, top).height;
    assert.ok(h > last);
    last = h;
  }
});
