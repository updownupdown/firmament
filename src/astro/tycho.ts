// Tycho-2: about 1.9 million faint stars that HYG lacks, in declination bands
// that are fetched only when the view is zoomed in far enough to show them.
// Format in scripts/build_data.py (build_tycho).

import { DEG } from './math.ts';

export interface TychoIndex {
  /** Declination band width, degrees. */
  band: number;
  limit: number;
  counts: number[];
}

export interface TychoBand {
  ra: Float64Array;
  dec: Float64Array;
  /** Brightest first. */
  mag: Float32Array;
}

/** How many bands to keep loaded at once. */
export const TYCHO_KEEP = 12;

const pad4 = (n: number) => (n + 3) & ~3;

/** Decode one band file (radians, magnitudes). */
export function decodeTychoBand(buf: ArrayBuffer, band: number, bandDeg: number): TychoBand {
  const dv = new DataView(buf);
  if (String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3)) !== 'TYC1') throw new Error('bad Tycho file');
  const n = dv.getUint32(4, true);
  const bytes = new Uint8Array(buf);
  const raAt = 8, decAt = raAt + pad4(n * 3), magAt = decAt + pad4(n * 2);
  const ra = new Float64Array(n), dec = new Float64Array(n), mag = new Float32Array(n);
  const south = -90 + band * bandDeg;
  for (let i = 0; i < n; i++) {
    const r = bytes[raAt + i * 3] | (bytes[raAt + i * 3 + 1] << 8) | (bytes[raAt + i * 3 + 2] << 16);
    ra[i] = (r / 16777216) * 2 * Math.PI;
    dec[i] = (south + (dv.getUint16(decAt + i * 2, true) / 65535) * bandDeg) * DEG;
    mag[i] = 6 + bytes[magAt + i] / 40;
  }
  return { ra, dec, mag };
}

/** The bands a view needs: those within `radius` of a declination (radians). */
export function bandsNear(index: TychoIndex, dec: number, radius: number): number[] {
  const lo = Math.max(-90, (dec - radius) / DEG), hi = Math.min(90, (dec + radius) / DEG);
  const n = index.counts.length, out: number[] = [];
  for (let b = Math.max(0, Math.floor((lo + 90) / index.band)); b <= Math.min(n - 1, Math.floor((hi + 90) / index.band)); b++) out.push(b);
  return out;
}

/** How many of a brightest-first list are at or brighter than `limit`. */
export function countBrighter(mag: Float32Array, limit: number): number {
  let lo = 0, hi = mag.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (mag[mid] <= limit) lo = mid + 1; else hi = mid;
  }
  return lo;
}
