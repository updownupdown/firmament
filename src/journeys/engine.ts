// Journeys: short guided investigations. A journey is a list of steps; a step
// has words, usually a Scene to show, and sometimes a task to do before moving
// on. Nothing here touches the DOM, so journeys can be checked in tests.

import type { Scene } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';
import { crossing, marsFix, planTransfer } from './orbits.ts';

export type Task =
  /** Tap one of these objects in the sky. */
  | { kind: 'find'; refs: string[]; prompt: string; hint?: string }
  | { kind: 'choice'; prompt: string; options: string[]; answer: number; explain?: string }
  /** Type a number. `answer` may be read off the simulated sky at the moment of checking. */
  | { kind: 'number'; prompt: string; answer: number | ((u: Universe) => number); tolerance: number; unit: string; hint?: string; explain?: string }
  /** Workshop: mark where two sightings of Mars, one Mars year apart from `jd`, cross. The value is "x,y" in AU. */
  | { kind: 'mars-fix'; prompt: string; jd: number; tolerance: number; explain?: string }
  /**
   * Workshop: choose a launch day (within `window` days of `from`) and a flight time to Mars that
   * cost no more than `budget` km/s in all. The value is "jd,days".
   */
  | { kind: 'transfer'; prompt: string; from: number; window: number; budget: number; explain?: string };

export interface Step {
  title: string;
  text: string;
  scene?: Scene;
  task?: Task;
  /** A chart to show with the words: the places found for Mars, with or without its true orbit. */
  figure?: { kind: 'mars-orbit'; nights: number[]; orbit: boolean };
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
    return { ok, message: ok ? 'That is it.' : task.hint ?? 'Not that one. Have another look.' };
  }
  if (task.kind === 'choice') {
    const ok = value === task.answer;
    return { ok, message: ok ? task.explain ?? 'Right.' : 'Not quite. Try another.' };
  }
  if (task.kind === 'mars-fix') {
    const [x, y] = String(value).split(',').map(Number);
    const fix = marsFix(u.eph, task.jd);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { ok: false, message: 'Tap the chart where the two lines of sight cross.' };
    const off = Math.hypot(x - fix.mars[0], y - fix.mars[1]);
    const r = Math.hypot(fix.mars[0], fix.mars[1]);
    if (off <= task.tolerance) return { ok: true, message: `${task.explain ?? 'That is where Mars was.'} Mars was ${r.toFixed(2)} times as far from the Sun as the Earth is.` };
    // Is the mark at least on one of the lines? Then say so.
    const meet = crossing(fix.a, fix.b);
    return { ok: false, message: meet && off < 0.4 ? 'Close. Put the mark exactly where the two lines meet.' : 'Mars has to be on both lines of sight at once: mark the point where they cross.' };
  }
  if (task.kind === 'transfer') {
    const [jd, days] = String(value).split(',').map(Number);
    const plan = Number.isFinite(jd) && Number.isFinite(days) && days > 0 ? planTransfer(u.eph, jd, days) : null;
    if (!plan) return { ok: false, message: 'Choose a launch day and a flight time.' };
    const total = plan.departV + plan.arriveV;
    if (total <= task.budget) return { ok: true, message: `${task.explain ?? 'That flight works.'} It needs ${total.toFixed(1)} km/s of the ${task.budget.toFixed(1)} available.` };
    return { ok: false, message: `That flight needs ${total.toFixed(1)} km/s and the rocket has ${task.budget.toFixed(1)}. Try another launch day, or a longer or shorter flight.` };
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
