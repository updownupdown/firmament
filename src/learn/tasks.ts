// Questions and diagrams for the Atlas concepts. Nothing here touches the DOM,
// so the answers can be checked in tests.

import type { Universe } from '../sim/universe.ts';

export type Task =
  /** Tap one of these objects in the sky. */
  | { kind: 'find'; refs: string[]; prompt: string; hint?: string; explain?: string }
  | { kind: 'choice'; prompt: string; options: string[]; answer: number; explain?: string }
  /** Type a number. `answer` may be read off the simulated sky at the moment of checking. */
  | { kind: 'number'; prompt: string; answer: number | ((u: Universe) => number); tolerance: number; unit: string; hint?: string; explain?: string }
  /**
   * Do something on the concept's diagram. The diagram measures how far off the
   * attempt is (in its own units: AU for a tap, degrees for a launch date) and
   * submits that; within `tolerance` counts.
   */
  | { kind: 'plot'; prompt: string; tolerance: number; hint?: string; explain?: string };

/** A diagram drawn in a concept, worked out from the ephemeris (see orbits.ts). */
export type Plot =
  /** Two sightings of Mars one Martian year apart, and the lines of sight from the Earth. */
  | { kind: 'triangulate'; jd: number }
  /** Many such fixes through one Martian year, tracing out Mars's orbit. */
  | { kind: 'mars-orbit'; jd0: number; count: number }
  /** A Hohmann transfer to Mars with a launch-date slider (`from`…`to`, starting at `start`). */
  | { kind: 'transfer'; from: number; to: number; start: number }
  /** The planets from above under gravity alone, with a choice of Jupiter's mass or a passing star. */
  | { kind: 'sandbox'; controls: 'none' | 'jupiter' | 'star' }
  /** A chart of the ocean with the circles of position of two stars, measured at the sky's current moment and place. */
  | { kind: 'star-fix'; stars: [string, string] }
  /** A spacecraft swinging past Jupiter, with a side and a closest approach to choose. */
  | { kind: 'flyby' };

export interface Verdict {
  ok: boolean;
  message: string;
}

/** Judge an answer to a task. `value` is a body reference, an option index or a number. */
export function checkTask(task: Task, value: string | number, u: Universe): Verdict {
  if (task.kind === 'find') {
    const ok = typeof value === 'string' && task.refs.includes(value);
    return { ok, message: ok ? task.explain ?? 'That is it.' : task.hint ?? 'Not that one. Have another look.' };
  }
  if (task.kind === 'choice') {
    const ok = value === task.answer;
    return { ok, message: ok ? task.explain ?? 'Right.' : 'Not quite. Try another.' };
  }
  if (task.kind === 'plot') {
    const miss = Number(value);
    const ok = Number.isFinite(miss) && Math.abs(miss) <= task.tolerance;
    return { ok, message: ok ? task.explain ?? 'That is it.' : task.hint ?? 'Not quite. Try again.' };
  }
  const x = Number(value);
  if (typeof value === 'string' && value.trim() === '' || !Number.isFinite(x)) return { ok: false, message: 'Enter a number.' };
  const answer = typeof task.answer === 'function' ? task.answer(u) : task.answer;
  const ok = Math.abs(x - answer) <= task.tolerance;
  if (ok) return { ok, message: task.explain ?? 'Right.' };
  return { ok, message: task.hint ?? (x < answer ? 'Too low. Try again.' : 'Too high. Try again.') };
}
