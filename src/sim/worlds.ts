// Places to stand on other worlds. Latitudes are planetocentric and longitudes
// east, in degrees, as in the IAU frames the Moon and Mars are drawn in.

export const WORLD_SITES = {
  /** The Taurus–Littrow valley, where Apollo 17 landed in 1972 and took the panorama shown around you. */
  moon: { name: 'Taurus–Littrow', lat: 20.19, lon: 30.77 },
  /** Husband Hill in Gusev Crater, where the rover Spirit took its 2005 summit panorama. */
  mars: { name: 'Gusev Crater', lat: -14.6, lon: 175.47 },
} as const;

export const WORLD_NAMES = { earth: 'Earth', moon: 'Moon', mars: 'Mars' } as const;
