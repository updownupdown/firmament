// A Scene is a declarative description of what the sky should look like.
// Tonight prompts, journey steps, log entries, calendar events and shared links
// are all Scenes; "show me" means applying one.

import { type Site } from './universe.ts';

export interface LayerFlags {
  /** Constellation figures of the current sky culture. */
  lines: boolean;
  constellationLabels: boolean;
  boundaries: boolean;
  starLabels: boolean;
  planetLabels: boolean;
  dsos: boolean;
  milkyWay: boolean;
  atmosphere: boolean;
  ground: boolean;
  /** Compass points on the horizon. */
  cardinals: boolean;
  gridAltAz: boolean;
  gridEquatorial: boolean;
  ecliptic: boolean;
  /** Orbit lines in Space view. */
  orbits: boolean;
}

export const DEFAULT_LAYERS: LayerFlags = {
  lines: true, constellationLabels: true, boundaries: false, starLabels: true, planetLabels: true,
  dsos: true, milkyWay: true, atmosphere: true, ground: true, cardinals: true,
  gridAltAz: false, gridEquatorial: false, ecliptic: false, orbits: true,
};

// Order is part of the URL format: append new layers at the end, never reorder.
const LAYER_ORDER: (keyof LayerFlags)[] = [
  'lines', 'constellationLabels', 'boundaries', 'starLabels', 'planetLabels', 'dsos', 'milkyWay',
  'atmosphere', 'ground', 'cardinals', 'gridAltAz', 'gridEquatorial', 'ecliptic', 'orbits',
];

/** A direction on the local sky, degrees (azimuth from north through east). */
export interface AltAz {
  az: number;
  alt: number;
}

export type SceneTime =
  | 'now'
  /** A fixed instant, as a UT Julian date. */
  | { jd: number }
  /** A fixed instant, ISO 8601 UTC (for hand-written scenes in the modern era). */
  | { utc: string }
  /** Relative to the real present, in days. */
  | { offsetDays: number };

export interface SceneCamera {
  /** A body reference to centre on, or a fixed direction on the local sky. */
  look?: string | AltAz;
  /** Field of view, degrees. */
  fov?: number;
  mode?: 'sky' | 'space';
  /** Keep the camera on `look` as the sky turns. */
  track?: boolean;
  /** Space view: distance from the body being circled, AU. */
  dist?: number;
  /** Space view: angle around the ecliptic pole and height above the ecliptic plane, degrees. */
  orbit?: { yaw: number; pitch: number };
}

export interface Scene {
  time?: SceneTime;
  /** Simulated seconds per real second; 0 pauses. */
  rate?: number;
  site?: Site;
  camera?: SceneCamera;
  layers?: Partial<LayerFlags>;
  culture?: string;
  /** Bortle class 1–9. */
  bortle?: number;
  /** The object whose card is open. */
  select?: string;
  highlight?: string[];
}

// ------------------------------------------------------------------ URL hash
//
// Compact, readable `key=value` pairs joined by `&`:
//   t=2461361.45833   instant (UT Julian date), or t=now, or t=+3 (days from now)
//   r=3600            rate
//   s=43.653,-79.383,76,America/Toronto,Toronto
//   c=jupiter,12      camera: look target (or az;alt), fov, then optional flags (space, track)
//                     and, in Space view, distance and direction: c=jupiter,,space,0.02au,-70;32deg
//   l=1101…           layer flags in LAYER_ORDER ('-' leaves a layer untouched)
//   k=chinese         sky culture
//   b=4               Bortle class
//   o=star:32349      selected object
//   h=mars,venus      highlighted objects

const round = (x: number, places: number) => Number(x.toFixed(places));
const enc = encodeURIComponent;
const dec = (s: string) => {
  try { return decodeURIComponent(s); } catch { return s; }
};

export function encodeScene(scene: Scene): string {
  const parts: string[] = [];
  const t = scene.time;
  if (t === 'now') parts.push('t=now');
  else if (t && 'jd' in t) parts.push(`t=${round(t.jd, 5)}`);
  else if (t && 'utc' in t) parts.push(`t=${enc(t.utc)}`);
  else if (t && 'offsetDays' in t) parts.push(`t=${t.offsetDays >= 0 ? '+' : ''}${round(t.offsetDays, 4)}`);
  if (scene.rate !== undefined) parts.push(`r=${round(scene.rate, 3)}`);
  if (scene.site) {
    const s = scene.site;
    parts.push(`s=${[round(s.lat, 4), round(s.lon, 4), Math.round(s.height), enc(s.tz), enc(s.name)].join(',')}`);
  }
  if (scene.camera) {
    const c = scene.camera;
    const look = c.look === undefined ? '' : typeof c.look === 'string' ? enc(c.look) : `${round(c.look.az, 2)};${round(c.look.alt, 2)}`;
    const fields = [look, c.fov === undefined ? '' : String(round(c.fov, 2))];
    if (c.mode === 'space') fields.push('space');
    if (c.track) fields.push('track');
    if (c.dist !== undefined) fields.push(`${Number(c.dist.toPrecision(4))}au`);
    if (c.orbit) fields.push(`${round(c.orbit.yaw, 1)};${round(c.orbit.pitch, 1)}deg`);
    parts.push(`c=${fields.join(',')}`);
  }
  if (scene.layers) {
    const bits = LAYER_ORDER.map((k) => (scene.layers![k] === undefined ? '-' : scene.layers![k] ? '1' : '0')).join('');
    parts.push(`l=${bits.replace(/-+$/, '')}`);
  }
  if (scene.culture) parts.push(`k=${enc(scene.culture)}`);
  if (scene.bortle !== undefined) parts.push(`b=${scene.bortle}`);
  if (scene.select) parts.push(`o=${enc(scene.select)}`);
  if (scene.highlight?.length) parts.push(`h=${scene.highlight.map(enc).join(',')}`);
  return parts.join('&');
}

const finite = (s: string | undefined): number | undefined => {
  if (s === undefined || s === '') return undefined;
  const n = Number(s);
  return Number.isFinite(n) ? n : undefined;
};

/** Parses a hash produced by `encodeScene`. Unknown or malformed parts are ignored. */
export function decodeScene(hash: string): Scene {
  const scene: Scene = {};
  for (const part of hash.replace(/^#/, '').split('&')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const key = part.slice(0, eq), value = part.slice(eq + 1);
    switch (key) {
      case 't': {
        if (value === 'now') scene.time = 'now';
        else if (/^[+-]/.test(value)) {
          const d = finite(value);
          if (d !== undefined) scene.time = { offsetDays: d };
        } else if (/^-?\d+(\.\d+)?$/.test(value)) scene.time = { jd: Number(value) };
        else if (!Number.isNaN(Date.parse(dec(value)))) scene.time = { utc: dec(value) };
        break;
      }
      case 'r': {
        const r = finite(value);
        if (r !== undefined) scene.rate = r;
        break;
      }
      case 's': {
        const f = value.split(',');
        const lat = finite(f[0]), lon = finite(f[1]);
        if (lat !== undefined && lon !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 360) {
          scene.site = {
            lat, lon: ((lon + 540) % 360) - 180, height: finite(f[2]) ?? 0, tz: dec(f[3] ?? ''),
            name: dec(f.slice(4).join(',')) || 'Shared place',
          };
        }
        break;
      }
      case 'c': {
        const f = value.split(',');
        const cam: SceneCamera = {};
        if (f[0]) {
          const azAlt = f[0].split(';');
          const az = finite(azAlt[0]), alt = finite(azAlt[1]);
          cam.look = azAlt.length === 2 && az !== undefined && alt !== undefined ? { az, alt } : dec(f[0]);
        }
        const fov = finite(f[1]);
        if (fov !== undefined && fov > 0) cam.fov = fov;
        if (f.includes('space')) cam.mode = 'space';
        if (f.includes('track')) cam.track = true;
        for (const field of f.slice(2)) {
          if (field.endsWith('au')) {
            const d = finite(field.slice(0, -2));
            if (d !== undefined && d > 0) cam.dist = d;
          } else if (field.endsWith('deg')) {
            const [y, p] = field.slice(0, -3).split(';').map(finite);
            if (y !== undefined && p !== undefined) cam.orbit = { yaw: y, pitch: p };
          }
        }
        scene.camera = cam;
        break;
      }
      case 'l': {
        const layers: Partial<LayerFlags> = {};
        LAYER_ORDER.forEach((k, i) => {
          if (value[i] === '1') layers[k] = true;
          else if (value[i] === '0') layers[k] = false;
        });
        scene.layers = layers;
        break;
      }
      case 'k': scene.culture = dec(value); break;
      case 'b': {
        const b = finite(value);
        if (b !== undefined) scene.bortle = Math.min(9, Math.max(1, Math.round(b)));
        break;
      }
      case 'o': scene.select = dec(value); break;
      case 'h': scene.highlight = value.split(',').filter(Boolean).map(dec); break;
    }
  }
  return scene;
}

/** The instant a scene asks for, given the real present. Undefined if it doesn't set one. */
export function sceneJd(time: SceneTime | undefined, jdNow: number): number | undefined {
  if (time === undefined) return undefined;
  if (time === 'now') return jdNow;
  if ('jd' in time) return time.jd;
  if ('utc' in time) {
    const ms = Date.parse(time.utc);
    return Number.isNaN(ms) ? undefined : ms / 86400000 + 2440587.5;
  }
  return jdNow + time.offsetDays;
}
