// Web Worker: computes calendar events off the main thread, because a year of
// conjunction and eclipse searches takes seconds. Built as its own bundle.

import { type AstroEvent, allEvents } from '../astro/events.ts';
import { type Ephemeris } from '../astro/ephemeris.ts';
import { loadEphemeris } from '../data/load.ts';

export interface EventsRequest {
  id: number;
  jd0: number;
  jd1: number;
}

export interface EventsResponse {
  id: number;
  events?: AstroEvent[];
  error?: string;
}

// Searches for minima can miss one that sits right on the edge of the window,
// so search a little wider and keep only what falls inside.
const PAD_DAYS = 2;

export function eventsInRange(eph: Ephemeris, jd0: number, jd1: number): AstroEvent[] {
  return allEvents(eph, jd0 - PAD_DAYS, jd1 + PAD_DAYS).filter((e) => e.t >= jd0 && e.t < jd1);
}

interface WorkerScope {
  onmessage: ((e: MessageEvent<EventsRequest>) => void) | null;
  postMessage(message: EventsResponse): void;
}

// Only wire up messaging when actually running as a worker (not when imported by tests).
const scope = globalThis as unknown as WorkerScope & { WorkerGlobalScope?: unknown };
if (typeof scope.WorkerGlobalScope !== 'undefined') {
  let eph: Promise<Ephemeris> | null = null;
  // Requests are answered in order, one at a time.
  let queue: Promise<void> = Promise.resolve();
  scope.onmessage = (e) => {
    const { id, jd0, jd1 } = e.data;
    queue = queue.then(async () => {
      try {
        eph ??= loadEphemeris();
        scope.postMessage({ id, events: eventsInRange(await eph, jd0, jd1) });
      } catch (err) {
        eph = null;
        scope.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
      }
    });
  };
}
