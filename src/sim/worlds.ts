// Places to stand on other worlds. Latitudes are planetocentric and longitudes
// east, in degrees, as in the IAU frames the Moon and Mars are drawn in.

export const WORLD_SITES = {
  /** Apollo 11's landing site in Mare Tranquillitatis. */
  moon: { name: 'Tranquility Base', lat: 0.674, lon: 23.473 },
  /** Jezero Crater, where Perseverance landed in 2021. */
  mars: { name: 'Jezero Crater', lat: 18.44, lon: 77.45 },
} as const;

export const WORLD_NAMES = { earth: 'Earth', moon: 'Moon', mars: 'Mars' } as const;
