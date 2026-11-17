import { test } from 'node:test';
import assert from 'node:assert/strict';

import { DEG, wrapPi } from '../astro/math.ts';
import { pointingDirection } from './pointing.ts';

const near = (actual: number, expected: number, what: string) =>
  assert.ok(Math.abs(wrapPi(actual - expected)) < 1e-9, `${what}: expected ${expected / DEG}°, got ${actual / DEG}°`);

// Reference orientations from the W3C DeviceOrientation specification: alpha
// turns counter-clockwise about the vertical from north, beta tips the top of
// the device up, gamma tips its right edge down.
test('pointing: flat on a table, the back of the phone faces the ground', () => {
  near(pointingDirection(0, 0, 0).alt, -90 * DEG, 'altitude');
  near(pointingDirection(123, 0, 0).alt, -90 * DEG, 'altitude');
});

test('pointing: held upright, the phone looks at the horizon in its compass direction', () => {
  const north = pointingDirection(0, 90, 0);
  near(north.alt, 0, 'altitude'); near(north.az, 0, 'azimuth');
  // Alpha grows counter-clockwise: 90° faces west, 270° faces east.
  near(pointingDirection(90, 90, 0).az, 270 * DEG, 'azimuth facing west');
  near(pointingDirection(270, 90, 0).az, 90 * DEG, 'azimuth facing east');
  near(pointingDirection(180, 90, 0).az, 180 * DEG, 'azimuth facing south');
});

test('pointing: tipped back past upright, the phone looks up the sky', () => {
  const up45 = pointingDirection(0, 135, 0);
  near(up45.alt, 45 * DEG, 'altitude'); near(up45.az, 0, 'azimuth');
  // Held overhead, screen down: the back faces the zenith.
  near(pointingDirection(0, 180, 0).alt, 90 * DEG, 'altitude');
  // Tilted forward of upright, it looks below the horizon.
  near(pointingDirection(0, 60, 0).alt, -30 * DEG, 'altitude');
});

test('pointing: rolled onto its right edge with the top to the north, the back faces west', () => {
  // Positive gamma lowers the right edge: the screen turns to face east, the back west.
  const d = pointingDirection(0, 0, 90);
  near(d.alt, 0, 'altitude'); near(d.az, 270 * DEG, 'azimuth');
  near(pointingDirection(0, 0, -90).az, 90 * DEG, 'azimuth on the left edge');
});
