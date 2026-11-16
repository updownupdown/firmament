// Fetches the generated assets. The first batch is what the sky needs to draw
// anything; the faint stars and other sky cultures arrive later.

import { Ephemeris } from '../astro/ephemeris.ts';
import { Elp, type ElpData } from '../astro/moon.ts';
import { StarCatalog, type StarMeta } from '../astro/stars.ts';
import { Vsop87, type VsopData } from '../astro/vsop87.ts';
import type { Boundaries, Culture, CultureInfo, Dso } from './types.ts';

export const DATA_URL = 'data/';

async function get(name: string): Promise<Response> {
  const res = await fetch(DATA_URL + name);
  if (!res.ok) throw new Error(`Could not load ${name} (${res.status})`);
  return res;
}

export const fetchJSON = async <T>(name: string): Promise<T> => (await get(name)).json() as Promise<T>;
export const fetchBinary = async (name: string): Promise<ArrayBuffer> => (await get(name)).arrayBuffer();

export async function loadEphemeris(): Promise<Ephemeris> {
  const [vsop, elp] = await Promise.all([fetchJSON<VsopData>('vsop87b.json'), fetchJSON<ElpData>('elp-mpp02.json')]);
  return new Ephemeris(new Vsop87(vsop), new Elp(elp));
}

export interface CoreData {
  eph: Ephemeris;
  stars: StarCatalog;
  cultureIndex: CultureInfo[];
  western: Culture;
  dsos: Dso[];
}

/** Everything needed for a first frame. `onProgress` gets a 0..1 fraction. */
export async function loadCore(onProgress?: (fraction: number) => void): Promise<CoreData> {
  let done = 0;
  const jobs = 6;
  const track = <T>(p: Promise<T>): Promise<T> => p.then((v) => { onProgress?.(++done / jobs); return v; });
  const [eph, bright, meta, cultureIndex, western, dsos] = await Promise.all([
    track(loadEphemeris()),
    track(fetchBinary('stars-bright.bin')),
    track(fetchJSON<StarMeta[]>('stars-meta.json')),
    track(fetchJSON<CultureInfo[]>('cultures/index.json')),
    track(fetchJSON<Culture>('cultures/western.json')),
    track(fetchJSON<Dso[]>('dsos.json')),
  ]);
  const stars = new StarCatalog();
  stars.addChunk(bright);
  stars.setMeta(meta);
  return { eph, stars, cultureIndex, western, dsos };
}

/** Appends the faint stars to the catalog. Returns the index range added. */
export async function loadFaintStars(stars: StarCatalog): Promise<[number, number]> {
  return stars.addChunk(await fetchBinary('stars-faint.bin'));
}

export const loadCulture = (id: string): Promise<Culture> => fetchJSON<Culture>(`cultures/${id}.json`);
export const loadBoundaries = (): Promise<Boundaries> => fetchJSON<Boundaries>('boundaries.json');
