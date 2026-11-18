// Lifting off and landing as one flight. The sky view rises along the local
// vertical: the horizon drops to the Earth's limb, the air fades, the view
// turns to look straight down and the lens blends from stereographic to
// perspective. At the top it matches Space view's camera exactly (same
// stars on the same pixels), so the hand-over cannot be seen. Landing runs
// the same path backwards. No DOM or WebGL.

import { EPS_J2000 } from '../astro/frames.ts';
import { DEG, type Mat3, type Vec3, apply, clamp, wrapPi } from '../astro/math.ts';

/** Ecliptic north in J2000 equatorial coordinates: Space view's "up". */
const ECL_X: Vec3 = [1, 0, 0];
const ECL_Y: Vec3 = [0, Math.cos(EPS_J2000), Math.sin(EPS_J2000)];
const ECL_N: Vec3 = [0, -Math.sin(EPS_J2000), Math.cos(EPS_J2000)];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** How long the climb from the ground to the hand-over takes, seconds. */
export const ASCENT_SECONDS = 3.6;

/**
 * The sky azimuth that, looking straight down, puts ecliptic north at the
 * top of the screen, as Space view does. `j2000ToHorizon` maps J2000 to the
 * horizon frame (x south, y east, z up).
 */
export function nadirAzimuth(j2000ToHorizon: Mat3): number {
  const n = apply(j2000ToHorizon, ECL_N);
  return Math.atan2(n[1], -n[0]);
}

/** Space view's orbit angles (yaw, pitch) for a camera on the side of `dirJ2000`, looking back at the centre. */
export function orbitAngles(dirJ2000: Vec3): { yaw: number; pitch: number } {
  return {
    yaw: Math.atan2(dot(dirJ2000, ECL_Y), dot(dirJ2000, ECL_X)),
    pitch: Math.asin(clamp(dot(dirJ2000, ECL_N), -1, 1)),
  };
}

/** The sky's field of view (across the shorter side, perspective lens) that matches Space view's vertical `fovY`. */
export function matchingFov(width: number, height: number, fovY: number): number {
  return 2 * Math.atan((Math.min(width, height) / height) * Math.tan(fovY / 2));
}

export interface SkyPose {
  az: number;
  alt: number;
  fov: number;
}

export interface AscentPose extends SkyPose {
  /** 0.5 stereographic .. 1 perspective. */
  lens: number;
  /** Height above the ground, Earth radii. */
  height: number;
}

const ease = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - Math.pow(-2 * t + 2, 3) / 2);
const span = (t: number, a: number, b: number) => ease(clamp((t - a) / (b - a), 0, 1));
/** Lowest height drawn, Earth radii: about a hundred metres. */
const FIRST = 2e-5;

/**
 * Where the camera is `t` of the way up (0 on the ground, 1 at the hand-over
 * in orbit, `top.height` Earth radii up, looking straight down).
 */
export function ascentPose(t: number, ground: SkyPose, top: { az: number; fov: number; height: number }): AscentPose {
  const e = ease(clamp(t, 0, 1));
  // Rising evenly in the logarithm of height: the first kilometres take as long as the last thousand.
  const height = t <= 0 ? 0 : Math.exp(Math.log(FIRST) + (Math.log(top.height) - Math.log(FIRST)) * e) - FIRST * (1 - e);
  const a = span(t, 0.1, 0.85);
  // Turning about the vertical only once mostly looking down, where it reads as a roll.
  const z = span(t, 0.35, 1);
  const f = span(t, 0.2, 1);
  return {
    height: Math.max(0, height),
    alt: ground.alt + (-90 * DEG - ground.alt) * a,
    az: ground.az + wrapPi(top.az - ground.az) * z,
    fov: Math.exp(Math.log(ground.fov) + (Math.log(top.fov) - Math.log(ground.fov)) * f),
    lens: 0.5 + 0.5 * span(t, 0.3, 1),
  };
}
