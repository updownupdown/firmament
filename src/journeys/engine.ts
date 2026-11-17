// Journeys: short guided investigations. A journey is a list of steps; a step
// has words, usually a Scene to show, and sometimes a task to do before moving
// on. Nothing here touches the DOM, so journeys can be checked in tests.

import type { Scene } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';

export type Task =
  /** Tap one of these objects in the sky. */
  | { kind: 'find'; refs: string[]; prompt: string; hint?: string }
  | { kind: 'choice'; prompt: string; options: string[]; answer: number; explain?: string }
  /** Type a number. `answer` may be read off the simulated sky at the moment of checking. */
  | { kind: 'number'; prompt: string; answer: number | ((u: Universe) => number); tolerance: number; unit: string; hint?: string; explain?: string };

export interface Step {
  title: string;
  text: string;
  scene?: Scene;
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
    return { ok, message: ok ? 'That is it.' : task.hint ?? 'Not that one. Have another look.' };
  }
  if (task.kind === 'choice') {
    const ok = value === task.answer;
    return { ok, message: ok ? task.explain ?? 'Right.' : 'Not quite. Try another.' };
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
