// Calendar events for the app: asks the worker for one month at a time and
// remembers the answers, in memory and in localStorage.

import { type AstroEvent } from '../astro/events.ts';
import { calendarFromJd, jdFromCalendar } from '../astro/time.ts';
import { type EventsRequest, type EventsResponse } from './events.worker.ts';
import { type StorageLike } from './store.ts';

// Bump when the event model changes so stale months are recomputed.
export const EVENTS_CACHE_VERSION = 1;
const CACHE_PREFIX = `firmament:events:v${EVENTS_CACHE_VERSION}:`;
/** Months kept in localStorage before the oldest-written are dropped. */
const MAX_STORED_MONTHS = 60;

export interface MonthKey {
  year: number;
  month: number; // 1..12
}

export function monthOf(jdUT: number): MonthKey {
  const c = calendarFromJd(jdUT);
  return { year: c.year, month: c.month };
}

export function addMonths(k: MonthKey, n: number): MonthKey {
  const index = k.year * 12 + (k.month - 1) + n;
  return { year: Math.floor(index / 12), month: ((index % 12) + 12) % 12 + 1 };
}

/** UT range [start, end) of a calendar month. */
export function monthRange(k: MonthKey): [number, number] {
  const next = addMonths(k, 1);
  return [jdFromCalendar(k.year, k.month, 1), jdFromCalendar(next.year, next.month, 1)];
}

const keyOf = (k: MonthKey) => `${k.year}-${k.month}`;

/** Does the computing. The app passes a Web Worker; tests pass a function. */
export type EventsCompute = (jd0: number, jd1: number) => Promise<AstroEvent[]>;

/** Wraps a worker built from events.worker.ts as an `EventsCompute`. */
export function workerCompute(makeWorker: () => Worker): EventsCompute {
  let worker: Worker | null = null;
  let nextId = 1;
  const pending = new Map<number, { resolve: (e: AstroEvent[]) => void; reject: (e: Error) => void }>();
  const failAll = (message: string) => {
    for (const p of pending.values()) p.reject(new Error(message));
    pending.clear();
    worker?.terminate();
    worker = null; // a fresh worker is made on the next request
  };
  return (jd0, jd1) => new Promise((resolve, reject) => {
    if (!worker) {
      worker = makeWorker();
      worker.onmessage = (e: MessageEvent<EventsResponse>) => {
        const p = pending.get(e.data.id);
        if (!p) return;
        pending.delete(e.data.id);
        if (e.data.events) p.resolve(e.data.events);
        else p.reject(new Error(e.data.error ?? 'Event search failed'));
      };
      worker.onerror = (e) => failAll(e.message || 'Event worker stopped');
    }
    const id = nextId++;
    pending.set(id, { resolve, reject });
    const request: EventsRequest = { id, jd0, jd1 };
    worker.postMessage(request);
  });
}

export class EventService {
  private readonly compute: EventsCompute;
  private readonly storage: StorageLike | null;
  private readonly memory = new Map<string, AstroEvent[]>();
  private readonly inFlight = new Map<string, Promise<AstroEvent[]>>();

  constructor(compute: EventsCompute, storage: StorageLike | null) {
    this.compute = compute;
    this.storage = storage;
  }

  /** Events of a month if they are already known, without computing. */
  cached(k: MonthKey): AstroEvent[] | null {
    const key = keyOf(k);
    const mem = this.memory.get(key);
    if (mem) return mem;
    try {
      const text = this.storage?.getItem(CACHE_PREFIX + key);
      if (text) {
        const events = JSON.parse(text) as AstroEvent[];
        if (Array.isArray(events)) {
          this.memory.set(key, events);
          return events;
        }
      }
    } catch {
      // Damaged cache entry: fall through and recompute.
    }
    return null;
  }

  /** Events of one calendar month (UT), computing them if needed. */
  month(k: MonthKey): Promise<AstroEvent[]> {
    const have = this.cached(k);
    if (have) return Promise.resolve(have);
    const key = keyOf(k);
    let job = this.inFlight.get(key);
    if (!job) {
      const [jd0, jd1] = monthRange(k);
      job = this.compute(jd0, jd1).then((events) => {
        this.memory.set(key, events);
        this.remember(key, events);
        return events;
      }).finally(() => this.inFlight.delete(key));
      this.inFlight.set(key, job);
    }
    return job;
  }

  /** Events in [jd0, jd1), month by month. */
  async range(jd0: number, jd1: number): Promise<AstroEvent[]> {
    const months: MonthKey[] = [];
    const last = monthOf(jd1);
    for (let k = monthOf(jd0); k.year < last.year || (k.year === last.year && k.month <= last.month); k = addMonths(k, 1)) {
      months.push(k);
      if (months.length > 240) break;
    }
    const lists = await Promise.all(months.map((k) => this.month(k)));
    return lists.flat().filter((e) => e.t >= jd0 && e.t < jd1);
  }

  private remember(key: string, events: AstroEvent[]): void {
    if (!this.storage) return;
    const indexKey = CACHE_PREFIX + 'index';
    try {
      let index: string[] = JSON.parse(this.storage.getItem(indexKey) ?? '[]');
      if (!Array.isArray(index)) index = [];
      index = index.filter((k) => k !== key);
      index.push(key);
      while (index.length > MAX_STORED_MONTHS) this.storage.removeItem(CACHE_PREFIX + index.shift());
      this.storage.setItem(CACHE_PREFIX + key, JSON.stringify(events));
      this.storage.setItem(indexKey, JSON.stringify(index));
    } catch {
      // Storage full or blocked: the in-memory copy still serves this session.
    }
  }
}
