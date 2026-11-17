// Journeys: short guided investigations. A journey is a list of steps; a step
// has words, usually a Scene to show, and sometimes a task to do before moving
// on. Nothing here touches the DOM, so journeys can be checked in tests.

import type { Scene } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';

export type Task =
  /** Tap one of these objects in the sky. */
  | { kind: 'find'; refs: string[]; prompt: string; hint?: string; explain?: string }
  | { kind: 'choice'; prompt: string; options: string[]; answer: number; explain?: string }
  /** Type a number. `answer` may be read off the simulated sky at the moment of checking. */
  | { kind: 'number'; prompt: string; answer: number | ((u: Universe) => number); tolerance: number; unit: string; hint?: string; explain?: string }
  /**
   * Do something on the step's diagram. The diagram measures how far off the
   * attempt is (in its own units: AU for a tap, degrees for a launch date) and
   * submits that; within `tolerance` counts.
   */
  | { kind: 'plot'; prompt: string; tolerance: number; hint?: string; explain?: string };

/** A diagram drawn in the journey card, worked out from the ephemeris (see orbits.ts). */
export type Plot =
  /** Two sightings of Mars one Martian year apart, and the lines of sight from the Earth. */
  | { kind: 'triangulate'; jd: number }
  /** Many such fixes through one Martian year, tracing out Mars's orbit. */
  | { kind: 'mars-orbit'; jd0: number; count: number }
  /** A Hohmann transfer to Mars with a launch-date slider (`from`…`to`, starting at `start`). */
  | { kind: 'transfer'; from: number; to: number; start: number }
  /** A chart of the ocean with the circles of position of two stars, measured at the scene's moment. */
  | { kind: 'star-fix'; stars: [string, string] }
  /** A spacecraft swinging past Jupiter, with a side and a closest approach to choose. */
  | { kind: 'flyby' };

export interface Step {
  title: string;
  text: string;
  scene?: Scene;
  plot?: Plot;
  task?: Task;
}

export interface Journey {
  id: string;
  title: string;
  summary: string;
  minutes: number;
  steps: Step[];
}

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

/** Where someone is in a journey. */
export class JourneyRun {
  readonly journey: Journey;
  index: number;
  /** Whether the current step's task has been done (steps without a task count as done). */
  solved: boolean;

  constructor(journey: Journey, index = 0) {
    this.journey = journey;
    this.index = Math.min(Math.max(0, index), journey.steps.length - 1);
    this.solved = !this.step.task;
  }

  get step(): Step {
    return this.journey.steps[this.index];
  }

  get last(): boolean {
    return this.index === this.journey.steps.length - 1;
  }

  answer(value: string | number, u: Universe): Verdict {
    const task = this.step.task;
    if (!task) return { ok: true, message: '' };
    const v = checkTask(task, value, u);
    if (v.ok) this.solved = true;
    return v;
  }

  go(delta: number): boolean {
    const next = this.index + delta;
    if (next < 0 || next >= this.journey.steps.length) return false;
    if (delta > 0 && !this.solved) return false;
    this.index = next;
    this.solved = !this.step.task;
    return true;
  }
}
