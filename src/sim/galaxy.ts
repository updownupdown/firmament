// A model of the Milky Way for interstellar flight beyond the star catalog.
// Past about 100 light years our map of real stars thins out, so a flight
// toward the centre of the galaxy flies through this instead: a few hundred
// thousand points standing for clusters and bright stars, laid out as a
// barred spiral (an exponential disc with four logarithmic arms, and a
// boxy bulge with a bar). It is a picture, not a catalog: the shapes and
// sizes follow published values, the individual points are made up.
//
// Sizes: Sun 8.18 kpc from the centre (GRAVITY Collaboration 2019) and about
// 20 pc above the plane; disc scale length 2.6 kpc and thin-disc scale height
// 300 pc (Bland-Hawthorn & Gerhard 2016); bar half-length about 5 kpc at about
// 27° to the Sun–centre line; arms pitched about 12°.

import { type Vec3, apply, normalize, scale, transpose } from '../astro/math.ts';
import { EQ_TO_GAL } from '../astro/frames.ts';

/** Distance from the Sun to the centre of the galaxy, parsecs. */
export const GALACTIC_CENTRE_PC = 8178;
const SUN_HEIGHT_PC = 20;
const DISC_SCALE_PC = 2600;
const BAR_ANGLE = (27 * Math.PI) / 180;
const PITCH = (12 * Math.PI) / 180;
/** Points within this distance of the Sun are left to the real catalog. */
export const GALAXY_INNER_PC = 40;

const GAL_TO_EQ = transpose(EQ_TO_GAL);

/** Unit vector to the centre of the galaxy, J2000 equatorial (towards Sagittarius). */
export const GALACTIC_CENTRE_DIR: Vec3 = normalize(apply(GAL_TO_EQ, [1, 0, 0]));

/** Where the centre of the galaxy is, parsecs from the Sun, J2000. */
export function galacticCentre(): Vec3 {
  return scale(GALACTIC_CENTRE_DIR, GALACTIC_CENTRE_PC);
}

export interface GalaxyPoints {
  count: number;
  /** x, y, z per point: parsecs from the Sun, J2000 equatorial. */
  pos: Float32Array;
  /** Absolute magnitude per point (a cluster or a bright star). */
  absMag: Float32Array;
  /** Colour temperature per point, kelvin. */
  temp: Float32Array;
}

/** A seeded generator, so the galaxy looks the same every time. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeGalaxy(count: number, seed = 20261119): GalaxyPoints {
  const r = rng(seed);
  const gauss = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  const laplace = (b: number) => (r() < 0.5 ? -1 : 1) * -b * Math.log(r() + 1e-12);
  const pos = new Float32Array(count * 3);
  const absMag = new Float32Array(count);
  const temp = new Float32Array(count);
  let n = 0;
  while (n < count) {
    // Galactocentric: x from the Sun's side towards the centre, z towards the north galactic pole.
    let x: number, y: number, z: number, M: number, T: number;
    const kind = r();
    if (kind < 0.24) {
      // The bulge and bar: old red giants packed round the centre.
      const bx = gauss() * (kind < 0.12 ? 1600 : 700), by = gauss() * 450, bz = gauss() * 330;
      const c = Math.cos(BAR_ANGLE), s = Math.sin(BAR_ANGLE);
      x = bx * c - by * s; y = bx * s + by * c; z = bz;
      M = -2 - 4 * r();
      T = 3600 + 1200 * r();
    } else {
      // The disc: exponential in radius (a gamma(2) draw), with most young stars along four arms.
      const R = -DISC_SCALE_PC * Math.log((r() + 1e-12) * (r() + 1e-12));
      if (R > 16000 || R < 600) continue;
      const young = r() < 0.6;
      let th: number;
      if (young) {
        const arm = Math.floor(r() * 4);
        th = Math.log(R / 3000) / Math.tan(PITCH) + (arm * Math.PI) / 2 + gauss() * 0.18;
      } else th = r() * 2 * Math.PI;
      x = -R * Math.cos(th); y = R * Math.sin(th);
      z = laplace(young ? 90 : 280);
      M = young ? -3.5 - 4 * r() : -1.5 - 3.5 * r();
      T = young ? 9000 + 16000 * r() : 4200 + 2800 * r();
    }
    // Heliocentric galactic: X towards the centre, Y towards galactic longitude 90°, Z north.
    const X = x + GALACTIC_CENTRE_PC, Y = y, Z = z - SUN_HEIGHT_PC;
    if (X * X + Y * Y + Z * Z < GALAXY_INNER_PC * GALAXY_INNER_PC) continue;
    const eq = apply(GAL_TO_EQ, [X, Y, Z]);
    pos[3 * n] = eq[0]; pos[3 * n + 1] = eq[1]; pos[3 * n + 2] = eq[2];
    absMag[n] = M;
    temp[n] = T;
    n++;
  }
  return { count, pos, absMag, temp };
}
