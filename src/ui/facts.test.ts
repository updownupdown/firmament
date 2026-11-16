import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeSpectralType } from './facts.ts';

test('spectral types read as plain words', () => {
  assert.equal(describeSpectralType('K2III'), 'Orange giant'); // Arcturus
  assert.equal(describeSpectralType('G2V'), 'Yellow main-sequence star'); // the Sun
  assert.equal(describeSpectralType('M2Iab'), 'Red supergiant'); // Betelgeuse
  assert.equal(describeSpectralType('A1V'), 'White main-sequence star'); // Sirius
  assert.equal(describeSpectralType('DA2'), 'White dwarf');
  assert.equal(describeSpectralType(undefined), null);
});
