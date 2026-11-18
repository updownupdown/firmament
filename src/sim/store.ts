// Persistence: one versioned JSON document in localStorage holding settings,
// the observer's place and the hints already shown.

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
}

export interface StoreData {
  version: number;
  settings: Settings;
  site: Site | null;
  /** Places the player has used, most recent first. */
  recentSites: Site[];
  /** First-run hints already shown. */
  seen: string[];
}

export function defaultData(): StoreData {
  return {
    version: STORE_VERSION,
    settings: {
      layers: { ...DEFAULT_LAYERS }, culture: 'western', bortle: 4, hour12: false,
      nightVision: false, reducedMotion: false, theme: 'default',
    },
    site: null, recentSites: [], seen: [],
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
      ...base.settings, ...withoutGuide(settings),
      layers: { ...base.settings.layers, ...(settings.layers ?? {}) },
      bortle: Math.min(9, Math.max(1, Math.round(Number(settings.bortle ?? base.settings.bortle)) || base.settings.bortle)),
    },
    site: validSite(r.site) ? r.site : null,
    recentSites: Array.isArray(r.recentSites) ? r.recentSites.filter(validSite).slice(0, 8) : [],
    seen: Array.isArray(r.seen) ? r.seen.filter((s) => typeof s === 'string') : [],
  };
}

/** Lumen, the old optional guide, is gone; its setting is dropped. */
function withoutGuide(settings: Partial<Settings>): Partial<Settings> {
  const { guide: _, ...rest } = settings as Partial<Settings> & { guide?: unknown };
  return rest;
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
