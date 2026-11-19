import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEG, add, angleBetween, fromSpherical, normalize } from '../astro/math.ts';
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
    assert.ok(angleBetween(c[0], c[2]) < 15 * DEG); // the Large Magellanic Cloud is the widest, about 12°
  }
  // The showpieces are placed from their AVM metadata; each is centred on its object (SIMBAD positions)
  // with north up and east to the left, as in the sky.
  const at = (file: string) => list.find((p) => (p as unknown as { file: string }).file === file)!.corners.map(([ra, dec]) => fromSpherical(ra * DEG, dec * DEG));
  for (const [file, ra, dec, tol] of [['m42.jpg', 83.822, -5.391, 0.1], ['m31.jpg', 10.685, 41.269, 0.3], ['m51.jpg', 202.47, 47.195, 0.1], ['n5139.jpg', 201.697, -47.479, 0.1]] as const) {
    const c = at(file);
    const mid = normalize(add(add(c[0], c[1]), add(c[2], c[3])));
    assert.ok(angleBetween(mid, fromSpherical(ra * DEG, dec * DEG)) < tol * DEG, file);
  }
  const m42 = at('m42.jpg');
  assert.ok(m42[3][2] > m42[0][2], 'top is north');
  assert.ok(Math.atan2(m42[0][1], m42[0][0]) > Math.atan2(m42[1][1], m42[1][0]), 'left is east');
});
