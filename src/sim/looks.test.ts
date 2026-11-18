import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LOOKS, SKY_LAYERS, currentLook, lookLayers } from './looks.ts';
import { DEFAULT_LAYERS } from './scene.ts';

test('every look names only sky layers, and the defaults are Stargazer', () => {
  for (const l of LOOKS) for (const k of l.on) assert.ok(SKY_LAYERS.includes(k), `${l.id}: ${k}`);
  assert.equal(currentLook(DEFAULT_LAYERS)?.id, 'stargazer');
});

test('a look sets every sky layer and leaves Space view alone', () => {
  const layers = { ...DEFAULT_LAYERS, ...lookLayers(LOOKS.find((l) => l.id === 'chart')!) };
  assert.equal(layers.boundaries, true);
  assert.equal(layers.milkyWay, false);
  assert.equal(layers.orbits, DEFAULT_LAYERS.orbits);
  assert.equal(currentLook(layers)?.id, 'chart');
  assert.equal(currentLook({ ...layers, ecliptic: true }), null);
});
