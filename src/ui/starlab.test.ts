import assert from 'node:assert/strict';
import { test } from 'node:test';
import { evolve } from '../astro/stellar.ts';
import { ageAtPosition, formatYears, positionOfAge } from './starlab.ts';

test('the Star lab slider maps to ages and back', () => {
  for (const m of [0.15, 1, 18, 200]) {
    const t = evolve(m, m === 200 ? -2.5 : 0);
    for (const v of [0, 0.1, 0.37, 0.5, 0.81, 0.95, 1]) {
      near(positionOfAge(t, ageAtPosition(t, v)), v, 1e-6);
    }
    // The slider's end is past the star's death.
    assert.ok(ageAtPosition(t, 1) > t.lifetime);
  }
  assert.equal(formatYears(4.57e9), '4.6 billion years');
  assert.equal(formatYears(2.03e3), '2,030 years');
  assert.equal(formatYears(5.5e-3), '2 days');
});

function near(a: number, b: number, tol: number) {
  assert.ok(Math.abs(a - b) <= tol, `${a} vs ${b}`);
}
