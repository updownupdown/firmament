// The Universe service: one place that knows where everything is for the
// current instant and observer. Every feature asks it; nothing else computes
// positions on its own.

import { BODIES, type SolarBodyId } from '../astro/bodies.ts';
import {
  type ApparentBody, type EarthSite, type Ephemeris, type Frame, type World,
  SOLAR_BODIES, aberrate, makeFrame, makeWorldFrame, observeBody, raDecOfDate,
} from '../astro/ephemeris.ts';
import { bodyRiseSet, starRiseSet, type RiseSet } from '../astro/events.ts';
import { azAlt, refractionFromTrue } from '../astro/frames.ts';
import { GALILEAN, galileanMoons } from '../astro/galilean.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import { REGIONS, type Region, regionById } from '../astro/populations.ts';
import { AU_KM, DEG, type Vec3, add, apply, fromSpherical, norm, normalize, scale, transpose as transposeRows } from '../astro/math.ts';
import { type StarCatalog, designation, genitive } from '../astro/stars.ts';
import { TYCHO_KEEP, type TychoBand } from '../astro/tycho.ts';
import { J2000 } from '../astro/time.ts';
import { type Boundaries, type Constellation, type Culture, type CultureInfo, type Dso, DSO_TYPES } from '../data/types.ts';

/** Where the observer stands. Angles are degrees here because this is user-facing data. */
export interface Site {
  name: string;
  country?: string;
  lat: number;
  lon: number;
  /** Metres above sea level. */
  height: number;
  /** IANA time zone, or '' for local mean time. */
  tz: string;
}

export function earthSite(site: Site): EarthSite {
  return { lat: site.lat * DEG, lon: site.lon * DEG, height: site.height };
}

export type ObjectKind = 'sun' | 'moon' | 'planet' | 'dwarf' | 'satellite' | 'comet' | 'minor' | 'region' | 'star' | 'dso' | 'constellation';

/** Anything you can point at, search for or select. */
export interface SkyObject {
  ref: string;
  kind: ObjectKind;
  name: string;
  /** A short second line: designation, type or parent body. */
  subtitle: string;
  /** Apparent direction from the observer, J2000 frame, unit vector. */
  dir: Vec3;
  mag: number | null;
  /** Present for solar system bodies (including Jupiter's moons). */
  body?: ApparentBody;
  starIndex?: number;
  dso?: Dso;
  constellation?: Constellation;
  /** A belt or cloud of small bodies: seen from Space view, not a point on the sky. */
  region?: Region;
}

export interface Horizontal {
  /** Azimuth from north through east, radians. */
  az: number;
  /** Geometric altitude, radians. */
  alt: number;
  /** Altitude as seen through the atmosphere, radians. */
  altApparent: number;
}

export interface SearchHit {
  ref: string;
  name: string;
  subtitle: string;
  kind: ObjectKind;
}

// Mean opposition magnitudes of the Galilean moons (at 5.2 AU from the Sun, 4.2 AU from Earth).
const GALILEAN_MAG0 = [5.02, 5.29, 4.61, 5.65];
const JUPITER_RADIUS_AU = BODIES.jupiter.radiusEq / AU_KM;

const PLANET_BLURBS: Record<string, string> = {
  sun: 'Our star', moon: "Earth's moon", earth: 'Our home planet', mercury: 'Planet', venus: 'Planet', mars: 'Planet', jupiter: 'Planet',
  saturn: 'Planet', uranus: 'Planet', neptune: 'Planet', pluto: 'Dwarf planet',
};

/** Ids of every solar system body the Universe tracks each frame. */
export const TRACKED_BODIES: string[] = [...SOLAR_BODIES, ...SMALL_BODIES.map((b) => b.id)];

export function dsoId(d: Dso): string {
  return (d.mes ?? d.d).replace(/\s+/g, '');
}

const GALAXY_SUFFIX = new Set(['Andromeda', 'Triangulum', 'Whirlpool', 'Pinwheel', 'Sombrero', 'Spindle', 'Southern Pinwheel']);

/** Common name of a deep-sky object, tidied from the source catalog. */
export function dsoName(d: Dso): string | undefined {
  if (d.d === 'GalCtr') return 'Galactic Centre';
  if (!d.n) return undefined;
  const n = d.n.replace(/´/g, '’');
  return GALAXY_SUFFIX.has(n) ? `${n} Galaxy` : n;
}

export function starRef(stars: StarCatalog, i: number): string {
  return stars.hip[i] ? `star:${stars.hip[i]}` : `star#${i}`;
}

export class Universe {
  readonly eph: Ephemeris;
  readonly stars: StarCatalog;
  readonly dsos: Dso[];
  readonly cultureIndex: CultureInfo[];
  readonly cultures = new Map<string, Culture>();
  boundaries: Boundaries | null = null;
  /** Tycho-2 bands loaded so far, oldest first (the renderer keeps the same ones). */
  readonly faint = new Map<number, TychoBand>();

  site: Site;
  cultureId = 'western';
  /** Standing somewhere other than home, on the Moon or Mars; null at home on the Earth. */
  away: { world: Exclude<World, 'earth'>; name: string; lat: number; lon: number } | null = null;

  /** Per-instant state, rebuilt by `update`. */
  frame!: Frame;
  /** Julian years since J2000 (TT), which drives stellar space motion. */
  years = 0;
  readonly bodies = new Map<string, ApparentBody>();

  private readonly dsoById = new Map<string, Dso>();
  private searchIndex: { keys: string[]; hit: SearchHit; weight: number }[] | null = null;
  private stamp = '';

  constructor(opts: {
    eph: Ephemeris; stars: StarCatalog; dsos?: Dso[]; cultureIndex?: CultureInfo[]; cultures?: Culture[];
    site: Site; jdUT: number;
  }) {
    this.eph = opts.eph;
    this.stars = opts.stars;
    this.dsos = opts.dsos ?? [];
    this.cultureIndex = opts.cultureIndex ?? [];
    for (const c of opts.cultures ?? []) this.cultures.set(c.id, c);
    for (const d of this.dsos) this.dsoById.set(dsoId(d).toLowerCase(), d);
    this.site = opts.site;
    this.update(opts.jdUT);
  }

  get culture(): Culture | undefined {
    return this.cultures.get(this.cultureId);
  }

  addCulture(c: Culture): void {
    this.cultures.set(c.id, c);
    this.searchIndex = null;
  }

  setCulture(id: string): void {
    this.cultureId = id;
    this.searchIndex = null;
  }

  /** Call after the faint stars are appended to the catalog. */
  catalogChanged(): void {
    this.searchIndex = null;
  }

  setSite(site: Site): void {
    this.site = site;
    this.update(this.frame.jdUT);
  }

  /** The world the observer stands on. */
  get world(): World {
    return this.away?.world ?? 'earth';
  }

  /** Stand on the Moon or Mars at a place (degrees, planetocentric, east longitude), or come home with null. */
  setAway(away: Universe['away']): void {
    this.away = away;
    this.update(this.frame.jdUT);
  }

  /** Recompute everything for an instant. Cheap to call again with the same instant. */
  update(jdUT: number): void {
    const a = this.away;
    const stamp = `${jdUT}|${this.site.lat}|${this.site.lon}|${this.site.height}|${a ? `${a.world}|${a.lat}|${a.lon}` : ''}`;
    if (stamp === this.stamp) return;
    this.stamp = stamp;
    const f = a
      ? makeWorldFrame(this.eph, jdUT, a.world, { lat: a.lat * DEG, lon: a.lon * DEG, height: 0 })
      : makeFrame(this.eph, jdUT, earthSite(this.site));
    this.frame = f;
    this.years = (f.jdTT - J2000) / 365.25;
    this.bodies.clear();
    for (const id of TRACKED_BODIES) this.bodies.set(id, observeBody(this.eph, f, id));
    if (a) {
      // The Earth joins the sky; the ground underfoot leaves it (straight down, no size, too faint to draw).
      this.bodies.set('earth', observeBody(this.eph, f, 'earth'));
      const self = this.bodies.get(a.world)!;
      this.bodies.set(a.world, { ...self, dir: apply(transposeRows(f.j2000ToHorizon), [0, 0, -1]), radius: 0, mag: 99 });
    }
    this.addGalileanMoons(f);
  }

  private addGalileanMoons(f: Frame): void {
    const jup = this.bodies.get('jupiter')!;
    const toObserver = scale(jup.dir, -1);
    const offsets = galileanMoons(f.jdTT, toObserver, jup.dist);
    const centre = scale(jup.dir, jup.dist);
    GALILEAN.forEach((moon, k) => {
      const g = add(centre, scale(offsets[k], JUPITER_RADIUS_AU));
      const dist = norm(g);
      this.bodies.set(moon.id, {
        id: moon.id, dir: scale(g, 1 / dist), dist, r: jup.r,
        helio: add(jup.helio, scale(offsets[k], JUPITER_RADIUS_AU)),
        phase: jup.phase, illum: jup.illum,
        mag: GALILEAN_MAG0[k] + 5 * Math.log10((jup.r * dist) / (5.2 * 4.2)),
        radius: Math.asin(Math.min(1, moon.radiusKm / (dist * AU_KM))),
        sunDir: jup.sunDir, ringTilt: 0,
      });
    });
  }

  // ---------------------------------------------------------------- objects

  /** Apparent direction of a catalog star now (space motion and aberration applied). */
  starDirection(i: number): Vec3 {
    return aberrate(this.stars.at(i, this.years).dir, this.frame.earthVel);
  }

  /** Keep a Tycho-2 band so its stars can be picked and named. */
  addFaintBand(band: number, data: TychoBand): void {
    this.faint.delete(band);
    this.faint.set(band, data);
    while (this.faint.size > TYCHO_KEEP) this.faint.delete(this.faint.keys().next().value!);
  }

  /** Apparent direction (J2000 frame) of a Tycho-2 star. */
  faintDirection(band: TychoBand, i: number): Vec3 {
    return aberrate(fromSpherical(band.ra[i], band.dec[i]), this.frame.earthVel);
  }

  /** Index of a star from its reference, or -1. */
  starIndex(ref: string): number {
    if (ref.startsWith('star:')) return this.stars.hipIndex.get(Number(ref.slice(5))) ?? -1;
    if (ref.startsWith('star#')) {
      const i = Number(ref.slice(5));
      return Number.isInteger(i) && i >= 0 && i < this.stars.count ? i : -1;
    }
    return -1;
  }

  findConstellation(ref: string): Constellation | undefined {
    const [, cultureId, id] = ref.split(':');
    return this.cultures.get(cultureId)?.constellations.find((c) => c.id === id);
  }

  /** Centre of a constellation figure: the mean direction of its stars. */
  constellationCentre(c: Constellation): Vec3 | null {
    let sum: Vec3 = [0, 0, 0];
    const seen = new Set<number>();
    for (const line of c.lines) {
      for (const i of line) {
        if (seen.has(i) || i >= this.stars.count) continue;
        seen.add(i);
        sum = add(sum, this.stars.at(i, this.years).dir);
      }
    }
    return seen.size && norm(sum) > 1e-6 ? normalize(sum) : null;
  }

  /** Look up anything by reference. Returns null for unknown or not-yet-loaded objects. */
  resolve(ref: string): SkyObject | null {
    const body = this.bodies.get(ref);
    if (body) {
      const solar = (BODIES as Record<string, { name: string; kind: string } | undefined>)[ref];
      if (solar) {
        const kind: ObjectKind = ref === 'sun' ? 'sun' : ref === 'moon' ? 'moon' : solar.kind === 'dwarf' ? 'dwarf' : 'planet';
        return { ref, kind, name: solar.name, subtitle: PLANET_BLURBS[ref] ?? 'Planet', dir: body.dir, mag: body.mag, body };
      }
      const moon = GALILEAN.find((m) => m.id === ref);
      if (moon) return { ref, kind: 'satellite', name: moon.name, subtitle: 'Moon of Jupiter', dir: body.dir, mag: body.mag, body };
      const small = SMALL_BODIES.find((b) => b.id === ref)!;
      const kind: ObjectKind = small.kind === 'comet' ? 'comet' : small.kind === 'dwarf' ? 'dwarf' : 'minor';
      return { ref, kind, name: small.name, subtitle: small.group, dir: body.dir, mag: body.mag, body };
    }
    if (ref.startsWith('star')) {
      const i = this.starIndex(ref);
      if (i < 0) return null;
      const meta = this.stars.meta.get(i);
      const name = this.stars.label(i);
      const des = designation(meta);
      const subtitle = meta?.n && des ? des : meta?.c ? `Star in ${genitive(meta.c)}` : 'Star';
      return { ref: starRef(this.stars, i), kind: 'star', name, subtitle, dir: this.starDirection(i), mag: this.stars.at(i, this.years).mag, starIndex: i };
    }
    if (ref.startsWith('tyc:')) {
      const [b, i] = ref.slice(4).split(':').map(Number);
      const band = this.faint.get(b);
      if (!band || !Number.isInteger(i) || i < 0 || i >= band.mag.length) return null;
      return { ref, kind: 'star', name: 'Faint star', subtitle: 'Tycho-2 catalogue', dir: this.faintDirection(band, i), mag: band.mag[i] };
    }
    if (ref.startsWith('dso:')) {
      const d = this.dsoById.get(ref.slice(4).replace(/\s+/g, '').toLowerCase());
      if (!d) return null;
      const type = DSO_TYPES[d.t] ?? 'Deep-sky object';
      const id = d.mes ?? d.d;
      return {
        ref: `dso:${dsoId(d)}`, kind: 'dso', name: dsoName(d) ?? id, subtitle: d.n ? `${id} · ${type}` : type,
        dir: fromSpherical(d.ra * DEG, d.de * DEG), mag: d.m, dso: d,
      };
    }
    if (ref.startsWith('region:')) {
      const region = regionById(ref);
      const sun = this.bodies.get('sun');
      if (!region || !sun) return null;
      return { ref: `region:${region.id}`, kind: 'region', name: region.name, subtitle: region.subtitle, dir: sun.dir, mag: null, region };
    }
    if (ref.startsWith('con:')) {
      const c = this.findConstellation(ref);
      const dir = c && this.constellationCentre(c);
      if (!c || !dir) return null;
      const cultureName = this.cultures.get(ref.split(':')[1])?.name ?? '';
      const what = c.asterism ? 'Asterism' : 'Constellation';
      return {
        ref, kind: 'constellation', name: c.native && c.iau ? c.native : c.name,
        subtitle: c.native && c.iau ? `${c.name} · ${what}` : `${what} · ${cultureName}`,
        dir, mag: null, constellation: c,
      };
    }
    return null;
  }

  // ---------------------------------------------------------------- coordinates

  /** Where a J2000 direction sits above the observer's horizon. */
  horizontal(dir: Vec3): Horizontal {
    const [az, alt] = azAlt(apply(this.frame.j2000ToHorizon, dir));
    // Only the Earth's air bends light enough to matter.
    return { az, alt, altApparent: alt + (alt > -2 * DEG && !this.away ? refractionFromTrue(alt) : 0) };
  }

  /** Right ascension and declination of date, radians. */
  equatorial(dir: Vec3): [number, number] {
    return raDecOfDate(this.frame, dir);
  }

  /** Rise, transit and set of an object in the 24 hours from `jd0` (UT). */
  riseSet(ref: string, jd0: number): RiseSet | null {
    const obj = this.resolve(ref);
    // Rising and setting are worked out for the Earth's turning only.
    if (!obj || this.away) return null;
    const site = earthSite(this.site);
    if (obj.body && !GALILEAN.some((m) => m.id === ref)) return bodyRiseSet(this.eph, site, jd0, ref);
    if (obj.body) return bodyRiseSet(this.eph, site, jd0, 'jupiter');
    return starRiseSet(this.eph, site, jd0, obj.dir);
  }

  // ---------------------------------------------------------------- search

  private buildSearchIndex(): { keys: string[]; hit: SearchHit; weight: number }[] {
    const index: { keys: string[]; hit: SearchHit; weight: number }[] = [];
    const push = (ref: string, weight: number, extra: string[] = []) => {
      const o = this.resolve(ref);
      if (!o) return;
      index.push({
        keys: [o.name, ...extra].filter(Boolean).map(normalizeText),
        hit: { ref: o.ref, name: o.name, subtitle: o.subtitle, kind: o.kind },
        weight,
      });
    };
    for (const id of SOLAR_BODIES) push(id, 100);
    for (const m of GALILEAN) push(m.id, 60);
    for (const b of SMALL_BODIES) push(b.id, 50, [b.id]);
    for (const r of REGIONS) push(`region:${r.id}`, 55, r.aka);
    for (const c of this.culture?.constellations ?? []) {
      push(`con:${this.cultureId}:${c.id}`, c.asterism ? 30 : 70, [c.name, c.native ?? '', c.iau ?? '']);
    }
    for (const d of this.dsos) {
      const m = d.mes ? [d.mes, d.mes.replace(/^M/, 'M '), d.mes.replace(/^M/, 'Messier ')] : [];
      push(`dso:${dsoId(d)}`, 40 - d.m, [...m, d.d, d.d.replace(/\s+/g, '')]);
    }
    for (const [i, meta] of this.stars.meta) {
      if (i >= this.stars.count) continue;
      const des = designation(meta);
      if (!meta.n && !des) continue;
      const extra: string[] = [];
      if (des) extra.push(des);
      if (meta.b && meta.c) {
        const letter = GREEK_NAMES[meta.b.charAt(0)];
        if (letter) {
          const rest = meta.b.slice(1);
          extra.push(`${letter}${rest} ${genitive(meta.c)}`, `${letter}${rest} ${meta.c}`);
        }
        extra.push(`${meta.b} ${meta.c}`);
      }
      if (meta.f && meta.c) extra.push(`${meta.f} ${meta.c}`);
      if (this.stars.hip[i]) extra.push(`HIP ${this.stars.hip[i]}`);
      if (meta.hd) extra.push(`HD ${meta.hd}`);
      push(starRef(this.stars, i), (meta.n ? 45 : 20) - this.stars.mag[i], extra);
    }
    return index;
  }

  /** Find objects by name or designation, best matches first. */
  search(text: string, limit = 12): SearchHit[] {
    const q = normalizeText(text);
    if (!q) return [];
    this.searchIndex ??= this.buildSearchIndex();
    const scored: { hit: SearchHit; score: number }[] = [];
    for (const e of this.searchIndex) {
      let best = 0;
      for (const k of e.keys) {
        let s = 0;
        if (k === q) s = 4;
        else if (k.startsWith(q)) s = 3;
        else if (k.includes(' ' + q)) s = 2;
        else if (q.length >= 3 && k.includes(q)) s = 1;
        if (s > best) best = s;
      }
      if (best) scored.push({ hit: e.hit, score: best * 1000 + e.weight });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).map((s) => s.hit);
  }
}

const GREEK_NAMES: Record<string, string> = {
  α: 'alpha', β: 'beta', γ: 'gamma', δ: 'delta', ε: 'epsilon', ζ: 'zeta', η: 'eta', θ: 'theta', ι: 'iota',
  κ: 'kappa', λ: 'lambda', μ: 'mu', ν: 'nu', ξ: 'xi', ο: 'omicron', π: 'pi', ρ: 'rho', σ: 'sigma', τ: 'tau',
  υ: 'upsilon', φ: 'phi', χ: 'chi', ψ: 'psi', ω: 'omega',
};

/** Lower-case, strip accents and punctuation, collapse spaces. */
export function normalizeText(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9α-ω]+/g, ' ').trim();
}

export type { SolarBodyId };
