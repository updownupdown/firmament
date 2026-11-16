// Shapes of the generated files in public/data (see scripts/build_data.py).

export interface Constellation {
  id: string;
  /** English name. */
  name: string;
  /** Polylines of star catalog indices. */
  lines: number[][];
  /** Name in the culture's own language. */
  native?: string;
  pronounce?: string;
  /** IAU abbreviation, for Western constellations. */
  iau?: string;
  asterism?: boolean;
}

export interface Culture {
  id: string;
  name: string;
  region: string;
  intro: string;
  license: string;
  authors: string;
  source: string;
  constellations: Constellation[];
}

export interface CultureInfo {
  id: string;
  name: string;
  region: string;
  count: number;
}

export interface Dso {
  /** Catalog designation, e.g. "NGC 1952". */
  d: string;
  /** Type code, see DSO_TYPES. */
  t: string;
  /** J2000 right ascension and declination, degrees. */
  ra: number;
  de: number;
  /** Visual magnitude. */
  m: number;
  /** Size in arcminutes, "6x4" or "13". */
  z?: string;
  /** Messier designation, e.g. "M1". */
  mes?: string;
  /** Common name. */
  n?: string;
}

export const DSO_TYPES: Record<string, string> = {
  snr: 'Supernova remnant', gc: 'Globular cluster', oc: 'Open cluster', sfr: 'Star-forming region',
  pos: 'Star cloud', pn: 'Planetary nebula', s: 'Spiral galaxy', e: 'Elliptical galaxy',
  rn: 'Reflection nebula', i: 'Irregular galaxy', sd: 'Dwarf galaxy', en: 'Emission nebula',
  g: 'Galaxy', s0: 'Lenticular galaxy', bn: 'Bright nebula', dn: 'Dark nebula',
};

/** Constellation boundary polylines: flat [ra, dec, ra, dec, …] in J2000 degrees. */
export type Boundaries = number[][];
