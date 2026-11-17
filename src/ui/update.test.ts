import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isNewBuild } from './update.ts';

test('a reload is offered only for a real, different build', () => {
  assert.equal(isNewBuild('ab12cd34ef', { build: 'ab12cd34ef' }), false);
  assert.equal(isNewBuild('ab12cd34ef', { build: '0123456789' }), true);
  // Development builds carry no hash, and a garbled answer is ignored.
  assert.equal(isNewBuild(null, { build: '0123456789' }), false);
  assert.equal(isNewBuild('ab12cd34ef', { build: '<html>' }), false);
  assert.equal(isNewBuild('ab12cd34ef', null), false);
  assert.equal(isNewBuild('ab12cd34ef', 'ab12'), false);
});
