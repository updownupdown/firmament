import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DEG } from './math.ts';
import { readJSON } from './testdata.ts';
import { type TychoIndex, bandsNear, countBrighter, decodeTychoBand } from './tycho.ts';

const index = readJSON<TychoIndex>('tycho/index.json');
const band = (b: number) => {
  const buf = readFileSync(new URL(`../../public/data/tycho/${String(b).padStart(2, '0')}.bin`, import.meta.url));
  return decodeTychoBand(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), b, index.band);
};

test('tycho: the bands hold the Tycho-2 stars HYG lacks', () => {
  // Tycho-2 has 2,539,913 stars plus 17,588 in its supplement (Høg et al. 2000);
  // about 2 million are brighter than 12, and HYG already has some 113,000 of them.
  const total = index.counts.reduce((a, b) => a + b, 0);
  assert.ok(total > 1.8e6 && total < 2.0e6, String(total));
  // The sky is densest toward the galactic plane and thinnest at the poles.
  assert.ok(index.counts[0] < index.counts[22] / 10);
});

test('tycho: a band decodes to positions inside it, brightest first', () => {
  const b = 30, d = band(b);
  assert.equal(d.mag.length, index.counts[b]);
  for (let i = 0; i < d.mag.length; i += 997) {
    assert.ok(d.dec[i] >= (-90 + b * index.band) * DEG - 1e-9 && d.dec[i] <= (-90 + (b + 1) * index.band) * DEG + 1e-9);
    assert.ok(d.ra[i] >= 0 && d.ra[i] < 2 * Math.PI);
    if (i) assert.ok(d.mag[i] >= d.mag[i - 997]);
  }
  assert.ok(d.mag[d.mag.length - 1] <= index.limit + 0.03);
  assert.equal(countBrighter(d.mag, 99), d.mag.length);
  assert.equal(countBrighter(d.mag, 0), 0);
});

test('tycho: a view needs only the bands it can see', () => {
  assert.deepEqual(bandsNear(index, 0, 3 * DEG), [21, 22, 23]);
  assert.deepEqual(bandsNear(index, 0, 1 * DEG), [22]);
  assert.deepEqual(bandsNear(index, 89 * DEG, 5 * DEG), [43, 44]);
  assert.equal(bandsNear(index, 0, 90 * DEG).length, 45);
});
