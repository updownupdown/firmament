// From a star in the catalogue to a star in the Star lab: its birth mass,
// metallicity and age, from a published mass where we have one, otherwise by
// fitting its luminosity and temperature to the evolution tracks.

import { temperatureFromBV } from '../astro/stars.ts';
import {
  KNOWN_STARS, fitStar, luminosityFromMagnitude, phaseFromSpectralType, temperatureFromSpectralType,
} from '../astro/stellar.ts';
import type { SkyObject, Universe } from './universe.ts';

export interface StarSeed {
  name: string;
  mass: number;
  feh: number;
  /** Age in years on the track, if it could be placed. */
  age?: number;
  /** Where it sits now, if measured. */
  L?: number;
  T?: number;
  source: 'published' | 'fitted';
  /** A good fit is about 1; much more and the star does not sit on any single-star track. */
  miss?: number;
  note?: string;
}

export const SUN_SEED: StarSeed = { name: 'The Sun', mass: 1, feh: 0, age: 4.57e9, L: 1, T: 5772, source: 'published' };

/** The Star lab's starting point for an object on the sky, or null if it is not a star we can place. */
export function starSeed(u: Universe, obj: SkyObject): StarSeed | null {
  if (obj.kind === 'sun') return SUN_SEED;
  if (obj.starIndex === undefined) return null;
  const i = obj.starIndex;
  const meta = u.stars.meta.get(i);
  const known = meta?.n ? KNOWN_STARS[meta.n] : undefined;
  const feh = known?.feh ?? 0;
  const T = temperatureFromSpectralType(meta?.s) ?? temperatureFromBV(u.stars.bv[i]);
  const dist = u.stars.dist[i];
  if (!(dist > 0) || !(dist < 1e5)) {
    return known ? { name: obj.name, mass: known.mass, feh, source: 'published', note: known.note } : null;
  }
  const L = luminosityFromMagnitude(u.stars.mag[i], dist, T);
  const fit = fitStar(L, T, { feh, phase: phaseFromSpectralType(meta?.s), mass: known?.mass });
  return {
    name: obj.name, mass: known?.mass ?? fit.mass, feh, age: fit.age, L, T,
    source: known ? 'published' : 'fitted', miss: fit.miss, note: known?.note,
  };
}
