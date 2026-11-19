import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEG, angleBetween, fromSpherical } from '../astro/math.ts';
import { artMapping, type ArtInfo } from './art.ts';

test('constellation art: each anchor pixel lands on its star', () => {
  // Betelgeuse, Rigel and Bellatrix, pinned to three made-up pixels.
  const stars = [fromSpherical(88.79 * DEG, 7.41 * DEG), fromSpherical(78.63 * DEG, -8.2 * DEG), fromSpherical(81.28 * DEG, 6.35 * DEG)];
  const px: [number, number][] = [[100, 120], [300, 420], [260, 140]];
  const map = artMapping(px, stars);
  px.forEach(([x, y], k) => assert.ok(angleBetween(map(x, y), stars[k]) < 1e-9));
});

test('constellation art: every picture names three stars and an IAU constellation', () => {
  const list = JSON.parse(readFileSync(new URL('../../public/data/art/index.json', import.meta.url), 'utf8')) as ArtInfo[];
  assert.ok(list.length >= 80);
  for (const a of list) {
    assert.equal(a.anchors.length, 3, a.id);
    assert.match(a.id, /^[A-Z][A-Za-z]{2}$/);
  }
});

test('deep-sky photos: every one has a credit, a licence and four corners close together', () => {
  const list = JSON.parse(readFileSync(new URL('../../public/data/dso-photos/index.json', import.meta.url), 'utf8')) as { corners: [number, number][]; credit: string; license: string }[];
  assert.ok(list.length >= 100);
  for (const p of list) {
    assert.ok(p.credit && p.license);
    const c = p.corners.map(([ra, dec]) => fromSpherical(ra * DEG, dec * DEG));
    assert.ok(angleBetween(c[0], c[2]) < 12 * DEG);
  }
});
