// Generic time searches: crossings of a target value and local extrema.

export type Fn = (t: number) => number;

/** Wrap an angle difference into (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Refine a sign change of f in [a, b] by bisection with secant steps. */
export function refineRoot(f: Fn, a: number, b: number, fa = f(a), fb = f(b), tol = 1e-6): number {
  for (let k = 0; k < 80 && b - a > tol; k++) {
    // Secant guess, guarded to stay inside the bracket.
    let m = a - fa * (b - a) / (fb - fa);
    if (!(m > a + (b - a) * 0.05 && m < b - (b - a) * 0.05)) m = (a + b) / 2;
    const fm = f(m);
    if (fm === 0) return m;
    if ((fm < 0) === (fa < 0)) { a = m; fa = fm; } else { b = m; fb = fm; }
  }
  return (a + b) / 2;
}

export interface Crossing { t: number; rising: boolean }

/**
 * Times in [t0, t1] where f(t) crosses zero, sampled every `step`.
 * Jumps larger than `maxJump` between samples are treated as wraps, not crossings
 * (useful for angle differences).
 */
export function findCrossings(f: Fn, t0: number, t1: number, step: number, maxJump = Infinity): Crossing[] {
  const out: Crossing[] = [];
  let ta = t0, fa = f(ta);
  while (ta < t1) {
    const tb = Math.min(ta + step, t1);
    const fb = f(tb);
    if (fa === 0) out.push({ t: ta, rising: fb > 0 });
    else if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      if (Math.abs(fb - fa) < maxJump) out.push({ t: refineRoot(f, ta, tb, fa, fb), rising: fb > fa });
    }
    ta = tb; fa = fb;
  }
  return out;
}

/** Golden-section search for a minimum of f in [a, b]. */
export function goldenMin(f: Fn, a: number, b: number, tol = 1e-6): number {
  const g = (Math.sqrt(5) - 1) / 2;
  let c = b - g * (b - a), d = a + g * (b - a);
  let fc = f(c), fd = f(d);
  for (let k = 0; k < 200 && b - a > tol; k++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - g * (b - a); fc = f(c); }
    else { a = c; c = d; fc = fd; d = a + g * (b - a); fd = f(d); }
  }
  return (a + b) / 2;
}

export interface Extremum { t: number; value: number }

/** Local minima of f in [t0, t1], sampled every `step` then refined. */
export function findMinima(f: Fn, t0: number, t1: number, step: number): Extremum[] {
  const out: Extremum[] = [];
  let tPrev = t0, fPrev = f(t0);
  let tCur = t0 + step, fCur = f(tCur);
  while (tCur < t1) {
    const tNext = tCur + step, fNext = f(tNext);
    if (fCur <= fPrev && fCur < fNext) {
      const t = goldenMin(f, tPrev, tNext);
      out.push({ t, value: f(t) });
    }
    tPrev = tCur; fPrev = fCur; tCur = tNext; fCur = fNext;
  }
  return out;
}

export function findMaxima(f: Fn, t0: number, t1: number, step: number): Extremum[] {
  return findMinima((t) => -f(t), t0, t1, step).map((e) => ({ t: e.t, value: -e.value }));
}
