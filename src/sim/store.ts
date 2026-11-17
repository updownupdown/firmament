// Persistence: one versioned JSON document in localStorage holding settings,
// the observer's place, the observing log and journey progress.

import { DEFAULT_LAYERS, type LayerFlags } from './scene.ts';
import { type Site } from './universe.ts';

export const STORE_KEY = 'firmament';
export const STORE_VERSION = 1;

export interface Settings {
  layers: LayerFlags;
  culture: string;
  /** Bortle class 1 (pristine) to 9 (inner city). */
  bortle: number;
  hour12: boolean;
  nightVision: boolean;
  reducedMotion: boolean;
  /** Design direction chosen by the owner or the player. */
  theme: string;
  /** Lumen, the optional guide: not yet offered, turned on, or turned off. Off until the player opts in. */
  guide: 'unset' | 'on' | 'off';
}

export interface LogEntry {
  id: string;
  /** Object reference, or an event key such as "event:lunar-eclipse:2461234". */
  ref: string;
  name: string;
  /** When it was seen (UT Julian date) and from where. */
  jdUT: number;
  site: Site;
  note?: string;
  /** Result of checking the entry against the simulated sky. */
  verified: boolean;
  /** Altitude at that moment, degrees. */
  alt?: number;
}

export interface JourneyProgress {
  /** Index of the furthest step reached. */
  step: number;
  done: boolean;
  /** Answers the player gave, by step id. */
  answers?: Record<string, string | number>;
}

export interface StoreData {
  version: number;
  settings: Settings;
  site: Site | null;
  /** Places the player has used, most recent first. */
  recentSites: Site[];
  log: LogEntry[];
  journeys: Record<string, JourneyProgress>;
  /** First-run hints already shown. */
  seen: string[];
}

export function defaultData(): StoreData {
  return {
    version: STORE_VERSION,
    settings: {
      layers: { ...DEFAULT_LAYERS }, culture: 'western', bortle: 4, hour12: false,
      nightVision: false, reducedMotion: false, theme: 'default', guide: 'unset',
    },
    site: null, recentSites: [], log: [], journeys: {}, seen: [],
  };
}

/** The slice of the Web Storage API we use, so tests can pass a plain object. */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Brings stored data of any age up to the current shape, tolerating damage. */
export function migrate(raw: unknown): StoreData {
  const base = defaultData();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<StoreData>;
  // Version 1 is the first schema. Future versions transform `r` here, step by step.
  if (typeof r.version !== 'number' || r.version > STORE_VERSION) return base;
  const settings = (r.settings && typeof r.settings === 'object' ? r.settings : {}) as Partial<Settings>;
  return {
    version: STORE_VERSION,
    settings: {
      ...base.settings, ...settings,
      layers: { ...base.settings.layers, ...(settings.layers ?? {}) },
      bortle: Math.min(9, Math.max(1, Math.round(Number(settings.bortle ?? base.settings.bortle)) || base.settings.bortle)),
      guide: settings.guide === 'on' || settings.guide === 'off' ? settings.guide : 'unset',
    },
    site: validSite(r.site) ? r.site : null,
    recentSites: Array.isArray(r.recentSites) ? r.recentSites.filter(validSite).slice(0, 8) : [],
    log: Array.isArray(r.log) ? r.log.filter((e) => e && typeof e.ref === 'string' && Number.isFinite(e.jdUT) && validSite(e.site)) : [],
    journeys: r.journeys && typeof r.journeys === 'object' ? r.journeys : {},
    seen: Array.isArray(r.seen) ? r.seen.filter((s) => typeof s === 'string') : [],
  };
}

function validSite(s: unknown): s is Site {
  if (!s || typeof s !== 'object') return false;
  const v = s as Site;
  return typeof v.name === 'string' && Number.isFinite(v.lat) && Number.isFinite(v.lon)
    && Math.abs(v.lat) <= 90 && Math.abs(v.lon) <= 180 && typeof v.tz === 'string' && Number.isFinite(v.height);
}

type Listener = (data: StoreData) => void;

export class Store {
  data: StoreData;
  private readonly storage: StorageLike | null;
  private readonly listeners = new Set<Listener>();

  constructor(storage: StorageLike | null) {
    this.storage = storage;
    this.data = defaultData();
    try {
      const text = storage?.getItem(STORE_KEY);
      if (text) this.data = migrate(JSON.parse(text));
    } catch {
      // Unreadable or blocked storage: start fresh and keep working in memory.
    }
  }

  /** Change the data, save it and tell listeners. */
  update(change: (data: StoreData) => void): void {
    change(this.data);
    this.save();
    for (const l of this.listeners) l(this.data);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private save(): void {
    try {
      this.storage?.setItem(STORE_KEY, JSON.stringify(this.data));
    } catch {
      // Private mode or a full quota: the session still works, it just won't persist.
    }
  }

  setSite(site: Site): void {
    this.update((d) => {
      d.site = site;
      d.recentSites = [site, ...d.recentSites.filter((s) => s.name !== site.name || s.lat !== site.lat || s.lon !== site.lon)].slice(0, 8);
    });
  }

  addLog(entry: Omit<LogEntry, 'id'>): LogEntry {
    const full: LogEntry = { ...entry, id: `${Math.round(entry.jdUT * 1440)}-${Math.random().toString(36).slice(2, 8)}` };
    this.update((d) => { d.log.unshift(full); });
    return full;
  }

  removeLog(id: string): void {
    this.update((d) => { d.log = d.log.filter((e) => e.id !== id); });
  }

  hasLogged(ref: string): boolean {
    return this.data.log.some((e) => e.ref === ref);
  }

  setJourney(id: string, progress: JourneyProgress): void {
    this.update((d) => { d.journeys[id] = progress; });
  }

  /** Marks a one-time hint as shown. Returns true the first time. */
  markSeen(key: string): boolean {
    if (this.data.seen.includes(key)) return false;
    this.update((d) => { d.seen.push(key); });
    return true;
  }
}

/** localStorage if the browser allows it, otherwise null (memory only). */
export function browserStorage(): StorageLike | null {
  try {
    const s = globalThis.localStorage;
    s.setItem(STORE_KEY + ':probe', '1');
    s.removeItem(STORE_KEY + ':probe');
    return s;
  } catch {
    return null;
  }
}
