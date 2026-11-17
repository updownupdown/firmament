// A gravity assist, worked in the plane of the planet's orbit. Seen from the
// planet, a spacecraft swings past on a hyperbola and leaves at the same speed
// it arrived, only turned. Seen from the Sun, the planet's own motion is added
// back, so turning the right way makes the spacecraft faster. Speeds in km/s,
// distances in km, angles in radians.

export type Vec2 = [number, number];

/** Jupiter: gravitational parameter (km³/s²), equatorial radius (km) and mean orbital speed (km/s). */
export const JUPITER = { mu: 1.26686534e8, radius: 71492, speed: 13.06 };
/** Speed needed to escape the Sun from Jupiter's distance (5.2 AU), km/s. */
export const SOLAR_ESCAPE_AT_JUPITER = 42.12 / Math.sqrt(5.2);

/**
 * A spacecraft arriving at Jupiter on a path a little faster than a Hohmann
 * transfer, much as Voyager 2 did in 1979: 10.2 km/s, 35° off Jupiter's
 * direction of travel (x is Jupiter's direction of travel, y away from the Sun).
 */
export const ARRIVAL: Vec2 = [10.2 * Math.cos(35 * Math.PI / 180), 10.2 * Math.sin(35 * Math.PI / 180)];

const len = (v: Vec2) => Math.hypot(v[0], v[1]);
const rot = (v: Vec2, a: number): Vec2 => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];

export interface Flyby {
  /** Heliocentric velocity before and after, and the planet's. */
  vIn: Vec2;
  vOut: Vec2;
  vPlanet: Vec2;
  /** Velocity relative to the planet, before and after (same length). */
  relIn: Vec2;
  relOut: Vec2;
  /** How far the relative velocity is turned (positive anticlockwise). */
  turn: number;
  /** Eccentricity of the hyperbola and closest approach (km from the centre). */
  e: number;
  periapsis: number;
  /** +1 when the path curls anticlockwise round the planet, −1 clockwise. */
  sense: 1 | -1;
}

/**
 * Fly past a planet. `periapsis` is the closest approach from the planet's
 * centre; `sense` picks the side: the path curls anticlockwise (+1) or
 * clockwise (−1) round the planet as seen from above.
 */
export function flyby(vIn: Vec2, planet: { mu: number; speed: number }, periapsis: number, sense: 1 | -1): Flyby {
  const vPlanet: Vec2 = [planet.speed, 0];
  const relIn: Vec2 = [vIn[0] - vPlanet[0], vIn[1] - vPlanet[1]];
  const vInf = len(relIn);
  const e = 1 + (periapsis * vInf * vInf) / planet.mu;
  const turn = sense * 2 * Math.asin(1 / e);
  const relOut = rot(relIn, turn);
  return { vIn, vOut: [relOut[0] + vPlanet[0], relOut[1] + vPlanet[1]], vPlanet, relIn, relOut, turn, e, periapsis, sense };
}

export const speed = len;

/**
 * Points along the hyperbola in the planet's frame (km), from far on the way
 * in to far on the way out. The asymptotes are the relative velocities.
 */
export function flybyPath(f: Flyby, reach: number, n = 160): Vec2[] {
  const nuMax = Math.acos(-1 / f.e);
  const p = f.periapsis * (1 + f.e);
  const inAngle = Math.atan2(f.relIn[1], f.relIn[0]);
  // Periapsis direction: for anticlockwise motion the way in comes from ν = −ν∞.
  const omega = f.sense > 0 ? inAngle + nuMax - Math.PI : inAngle - nuMax + Math.PI;
  const out: Vec2[] = [];
  for (let k = 0; k <= n; k++) {
    const nu = -nuMax * 0.999 + (2 * nuMax * 0.999 * k) / n;
    const r = p / (1 + f.e * Math.cos(nu));
    if (r > reach) continue;
    const a = omega + f.sense * nu;
    out.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return out;
}
