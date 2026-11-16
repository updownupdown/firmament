// Loads the generated data files for Node tests.
import { readFileSync } from 'node:fs';
import { Ephemeris } from './ephemeris.ts';
import { Elp } from './moon.ts';
import { StarCatalog } from './stars.ts';
import { Vsop87 } from './vsop87.ts';

const DATA = new URL('../../public/data/', import.meta.url);

export function readJSON<T>(name: string): T {
  return JSON.parse(readFileSync(new URL(name, DATA), 'utf8')) as T;
}

let eph: Ephemeris | null = null;
export function testEphemeris(): Ephemeris {
  eph ??= new Ephemeris(new Vsop87(readJSON('vsop87b.json')), new Elp(readJSON('elp-mpp02.json')));
  return eph;
}

let stars: StarCatalog | null = null;
export function testStars(): StarCatalog {
  if (!stars) {
    stars = new StarCatalog();
    for (const f of ['stars-bright.bin', 'stars-faint.bin']) {
      const b = readFileSync(new URL(f, DATA));
      stars.addChunk(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
    }
    stars.setMeta(readJSON('stars-meta.json'));
  }
  return stars;
}
