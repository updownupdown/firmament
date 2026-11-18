// Space view: the solar system from outside, at true scale. The camera orbits
// a focus body; everything is positioned relative to that focus in doubles
// and handed to the GPU in camera space, so there is no jitter up close.

import { BODIES } from '../astro/bodies.ts';
import { ECL_TO_EQ_J2000, EPS_J2000 } from '../astro/frames.ts';
import { type Population, REGIONS, type Region, allPopulations, regionById } from '../astro/populations.ts';
import { GALILEAN, galileanMoons } from '../astro/galilean.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import { J2000 } from '../astro/time.ts';
import { AU_KM, DEG, type Mat3, type Vec3, add, apply, clamp, cross, fromSpherical, mul, normalize, scale, sub } from '../astro/math.ts';
import type { LayerFlags } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';
import { type Controllable, ZoomPast } from './camera.ts';
import { Mesh, Program } from './gl.ts';
import type { LabelItem } from './labels.ts';
import {
  ORBIT_FRAG, ORBIT_VERT, POP_FRAG, POP_VERT, SPACE_BODY_FRAG, SPACE_BODY_VERT, SPACE_MILKY_FRAG, SPACE_MILKY_VERT, SPACE_STAR_VERT,
  STAR_ATTRIBUTES, STAR_FRAG,
} from './shaders.ts';

// The ecliptic frame expressed in J2000 equatorial coordinates: the camera's "up" is ecliptic north.
const ECL_X: Vec3 = [1, 0, 0];
const ECL_Y: Vec3 = [0, Math.cos(EPS_J2000), Math.sin(EPS_J2000)];
const ECL_N: Vec3 = [0, -Math.sin(EPS_J2000), Math.cos(EPS_J2000)];

export const MIN_DIST = 2e-4;   // AU: about 30,000 km
export const MAX_DIST = 300000; // AU: far enough to take in the whole Oort cloud

export interface SpacePoint {
  x: number;
  y: number;
  /** Distance in front of the camera, AU. */
  depth: number;
  onScreen: boolean;
}

/** An orbiting camera with a perspective projection. No DOM or WebGL. */
export class SpaceCamera implements Controllable {
  /** The body the camera circles. */
  focus = 'sun';
  /** Angle around the ecliptic pole and height above the ecliptic plane (radians). */
  yaw = -70 * DEG;
  pitch = 32 * DEG;
  /** Distance from the focus, AU. */
  dist = 4;
  width = 1;
  height = 1;
  /** Lens shift: how far up the screen the focus sits, CSS pixels (to keep it clear of a card below). */
  shiftY = 0;
  readonly fovY = 40 * DEG;
  held = false;
  reducedMotion = false;
  /** The closest the user may zoom in on the focus, AU (just clear of its surface). */
  floor = 0;
  /** Zooming in past the floor. */
  readonly zoomPast = new ZoomPast();
  /** What is left of the glide from the previous focus (AU, J2000). */
  offset: Vec3 = [0, 0, 0];
  /** J2000 → camera rotation (camera looks along −z). */
  view: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private velYaw = 0;
  private velPitch = 0;
  private flight: { from: number; to: number; t: number; duration: number; glide?: Vec3; then?: number } | null = null;

  constructor() {
    this.update();
  }

  /** Pixels per unit of x/−z. */
  get focal(): number {
    return this.height / 2 / Math.tan(this.fovY / 2);
  }

  update(): void {
    this.pitch = clamp(this.pitch, -89 * DEG, 89 * DEG);
    this.dist = clamp(this.dist, MIN_DIST, MAX_DIST);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    // From the focus back toward the camera.
    const back: Vec3 = [0, 1, 2].map((i) => cp * (cy * ECL_X[i] + sy * ECL_Y[i]) + sp * ECL_N[i]) as Vec3;
    const right = normalize([
      ECL_N[1] * back[2] - ECL_N[2] * back[1], ECL_N[2] * back[0] - ECL_N[0] * back[2], ECL_N[0] * back[1] - ECL_N[1] * back[0],
    ]);
    const up: Vec3 = [
      back[1] * right[2] - back[2] * right[1], back[2] * right[0] - back[0] * right[2], back[0] * right[1] - back[1] * right[0],
    ];
    this.view = [...right, ...up, ...back] as Mat3;
  }

  /** A point relative to the focus (AU, J2000) in camera space. */
  toCamera(rel: Vec3): Vec3 {
    const c = apply(this.view, sub(rel, this.offset));
    return [c[0], c[1], c[2] - this.dist];
  }

  /** Project a camera-space point to CSS pixels; null if it is behind the camera. */
  projectCamera(c: Vec3): SpacePoint | null {
    const depth = -c[2];
    if (depth < this.dist * 1e-3) return null;
    const f = this.focal;
    const x = this.width / 2 + (f * c[0]) / depth;
    const y = this.height / 2 - this.shiftY - (f * c[1]) / depth;
    return { x, y, depth, onScreen: x >= 0 && x <= this.width && y >= 0 && y <= this.height };
  }

  /** Change the body being circled, gliding there rather than jumping. `shift` is old centre minus new. */
  setFocus(id: string, shift: Vec3): void {
    if (id === this.focus) return;
    this.focus = id;
    this.offset = this.reducedMotion ? [0, 0, 0] : add(this.offset, shift);
  }

  /** Ease the distance to a new value. */
  flyTo(dist: number, duration = 1.4): void {
    const to = clamp(dist, Math.max(MIN_DIST, this.floor), MAX_DIST);
    if (this.reducedMotion || duration <= 0) { this.dist = to; this.flight = null; return; }
    this.flight = { from: this.dist, to, t: 0, duration };
  }

  /**
   * Pull back from close above one body to a wide view centred on another.
   * `shift` is the starting body's position minus the final centre's. The
   * centre slides across as the view widens, so the start stays in frame.
   */
  liftOff(shift: Vec3, from: number, to: number, duration = 2.6): void {
    this.offset = [0, 0, 0];
    if (this.reducedMotion) { this.dist = to; this.flight = null; return; }
    this.dist = from;
    this.offset = shift;
    // A far target cannot share the frame with the start: pull back until both fit, then close in.
    const wide = Math.max(to, Math.hypot(...shift) * 1.3);
    this.flight = { from, to: wide, t: 0, duration, glide: shift, then: wide > to * 1.01 ? to : undefined };
  }

  drag(dx: number, dy: number, dt: number): void {
    const k = 0.006;
    this.yaw -= dx * k;
    this.pitch += dy * k;
    this.velYaw = (-dx * k) / dt;
    this.velPitch = (dy * k) / dt;
    this.update();
  }

  release(): void {
    this.held = false;
    if (this.reducedMotion) this.velYaw = this.velPitch = 0;
  }

  zoom(factor: number): void {
    // Let a lift-off finish: the wheel that started it is usually still turning.
    if (this.flight?.glide) return;
    this.flight = null;
    if (this.zoomPast.feed(factor > 1 && this.dist <= Math.max(MIN_DIST, this.floor) * 1.001, Math.log(factor))) return;
    this.dist = clamp(this.dist / factor, Math.max(MIN_DIST, Math.min(this.floor, this.dist)), MAX_DIST);
    this.update();
  }

  key(key: string): boolean {
    const step = 8 * DEG;
    if (key === 'ArrowLeft') this.yaw += step;
    else if (key === 'ArrowRight') this.yaw -= step;
    else if (key === 'ArrowUp') this.pitch += step;
    else if (key === 'ArrowDown') this.pitch -= step;
    else if (key === '+' || key === '=') {
      if (!(this.dist <= Math.max(MIN_DIST, this.floor) * 1.001 && this.zoomPast.feed(true, 1))) this.flyTo(this.dist / 1.5, 0.25);
    }
    else if (key === '-') this.flyTo(this.dist * 1.5, 0.25);
    else return false;
    this.update();
    return true;
  }

  get moving(): boolean {
    return this.flight !== null || Math.abs(this.velYaw) + Math.abs(this.velPitch) > 1e-4 || Math.hypot(...this.offset) > 0;
  }

  tick(dt: number): boolean {
    let changed = false;
    if (this.flight) {
      const f = this.flight;
      f.t = Math.min(1, f.t + dt / f.duration);
      const e = f.t < 0.5 ? 4 * f.t ** 3 : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
      this.dist = Math.exp(Math.log(f.from) + (Math.log(f.to) - Math.log(f.from)) * e);
      if (f.glide) this.offset = f.t >= 1 ? [0, 0, 0] : scale(f.glide, 1 - (this.dist / f.to) ** 2);
      if (f.t >= 1) {
        this.flight = null;
        if (f.then !== undefined) this.flyTo(f.then, 2);
      }
      changed = true;
    }
    const left = Math.hypot(...this.offset);
    if (left > 0 && !this.flight?.glide) {
      this.offset = left < this.dist * 1e-4 ? [0, 0, 0] : scale(this.offset, Math.exp(-dt * 5));
      changed = true;
    }
    if (!this.held && Math.abs(this.velYaw) + Math.abs(this.velPitch) > 1e-4) {
      this.yaw += this.velYaw * dt;
      this.pitch += this.velPitch * dt;
      const decay = Math.exp(-dt * 4.5);
      this.velYaw *= decay;
      this.velPitch *= decay;
      if (Math.abs(this.velYaw) + Math.abs(this.velPitch) < 2e-3) this.velYaw = this.velPitch = 0;
      changed = true;
    }
    if (changed) this.update();
    return changed;
  }
}

// ------------------------------------------------------------------ compressed scale

/**
 * The compressed scale: distances from the Sun go as the square root (the
 * Earth stays at 1 AU, Neptune comes in to 5.5), sizes as the 0.6 power
 * (the Earth 0.02 AU across, the Sun 0.34), and moons sit out from their
 * planet by the square root of their distance in planet radii. The order of
 * everything, and which is bigger, stays true.
 */
export const COMPRESS = {
  size: (radiusAU: number) => 8.4 * Math.pow(radiusAU, 0.6),
  helio: (p: Vec3): Vec3 => {
    const r = Math.hypot(p[0], p[1], p[2]);
    return r > 0 ? scale(p, 1 / Math.sqrt(r)) : p;
  },
  /** A moon's offset from its planet, given the planet's true radius. */
  moon: (offset: Vec3, parentRadiusAU: number): Vec3 => {
    const d = Math.hypot(offset[0], offset[1], offset[2]);
    if (d === 0) return offset;
    const out = COMPRESS.size(parentRadiusAU) * Math.sqrt(d / parentRadiusAU);
    return scale(offset, out / d);
  },
};

// ------------------------------------------------------------------ orbits

/**
 * One revolution of a body as a closed loop of points (AU, J2000), ending at
 * the body's position at `jdTT`. `positionAt` is heliocentric (or geocentric
 * for the Moon); `period` is in days.
 */
export function sampleOrbit(positionAt: (jdTT: number) => Vec3, jdTT: number, period: number, n: number): Float64Array {
  const out = new Float64Array((n + 1) * 3);
  for (let k = 0; k <= n; k++) {
    const p = positionAt(jdTT - period * (1 - k / n));
    out[k * 3] = p[0]; out[k * 3 + 1] = p[1]; out[k * 3 + 2] = p[2];
  }
  return out;
}

/** Period in days of a small body from its perihelion distance and eccentricity (Kepler's third law). */
export function keplerPeriod(q: number, e: number): number {
  return 365.25636 * Math.pow(q / (1 - e), 1.5);
}

// ------------------------------------------------------------------ renderer

interface SpaceBody {
  id: string;
  name: string;
  radiusAU: number;
  color: [number, number, number];
  kind: number;
  minPx: number;
  /** Orbital period, days; 0 for none. */
  period: number;
  /** Orbits this body rather than the Sun. */
  parent?: string;
  pole?: Vec3;
  /** Prime meridian angle at J2000 and its rate (radians, radians per day). */
  spin?: { w0: number; rate: number };
  /** Eccentric orbits are sampled evenly in eccentric anomaly instead of time. */
  comet?: { q: number; e: number; tp: number };
  /** A comet, asteroid or distant icy world: drawn more quietly than the planets. */
  minor?: boolean;
}

export interface DrawnSpaceBody {
  id: string;
  name: string;
  x: number;
  y: number;
  radiusPx: number;
  depth: number;
  onScreen: boolean;
}

interface OrbitCache {
  jd: number;
  points: Float64Array;
}

/** Surface kinds, matching the sky view's body shader. */
const SPACE_KIND: Record<string, number> = { sun: 1, moon: 2, jupiter: 3, saturn: 4, mars: 5, earth: 7 };

/** Sidereal periods of Io, Europa, Ganymede and Callisto, days. */
const GALILEAN_PERIODS = [1.769138, 3.551181, 7.154553, 16.689018];
const JUPITER_RADIUS_AU = BODIES.jupiter.radiusEq / AU_KM;

function buildBodies(): SpaceBody[] {
  const list: SpaceBody[] = [];
  const planet = (id: keyof typeof BODIES, minPx: number) => {
    const b = BODIES[id];
    list.push({
      id, name: b.name, radiusAU: b.radiusEq / AU_KM, color: b.color, kind: SPACE_KIND[id] ?? 0, minPx, period: b.period ?? 0,
      parent: id === 'moon' ? 'earth' : undefined, pole: fromSpherical(b.poleRa, b.poleDec),
      spin: id === 'moon' ? undefined : { w0: b.w0, rate: b.wRate },
    });
  };
  planet('sun', 6);
  planet('mercury', 3); planet('venus', 3.5); planet('earth', 3.5); planet('moon', 1.8); planet('mars', 3);
  planet('jupiter', 4.5); planet('saturn', 4); planet('uranus', 3.5); planet('neptune', 3.5); planet('pluto', 2);
  const jupiterPole = fromSpherical(BODIES.jupiter.poleRa, BODIES.jupiter.poleDec);
  GALILEAN.forEach((m, k) => {
    list.push({
      id: m.id, name: m.name, radiusAU: m.radiusKm / AU_KM, color: m.color, kind: 0, minPx: 1.5,
      period: GALILEAN_PERIODS[k], parent: 'jupiter', pole: jupiterPole,
    });
  });
  for (const sb of SMALL_BODIES) {
    const { q, e, tp } = sb.elements;
    list.push({
      id: sb.id, name: sb.name, radiusAU: sb.radiusKm / AU_KM, kind: 0, minPx: sb.kind === 'comet' ? 2 : 1.6,
      // Comets icy blue, the rocky belt grey-brown, the far icy worlds pale and reddish.
      color: sb.kind === 'comet' ? [0.75, 0.88, 1] : sb.elements.q < 6 ? [0.72, 0.68, 0.62] : [0.86, 0.74, 0.66],
      minor: true,
      period: keplerPeriod(q, e), comet: { q, e, tp },
    });
  }
  return list;
}

export interface SpaceOptions {
  layers: LayerFlags;
  lineColor: [number, number, number];
  accentColor: [number, number, number];
  selected: string | null;
}

/**
 * Lines and markers a sandbox lays over Space view, in heliocentric J2000 AU
 * at true scale (squeezed here when the compressed scale is on).
 */
export interface SpaceOverlay {
  /** `along` runs 0..1 and brightens toward 1, as orbit trails do; leave it out for an even line. */
  paths: { points: Vec3[]; color: Vec3; alpha: number; along?: boolean }[];
  /** A marker's place and name may follow the clock (TT Julian date). */
  markers: { id: string; pos: Vec3 | ((jdTT: number) => Vec3); color: Vec3; label?: string | ((jdTT: number) => string | undefined); radiusPx?: number }[];
}

export class SpaceRenderer {
  readonly camera = new SpaceCamera();
  readonly bodies = buildBodies();
  /** What the last frame drew, far to near. */
  drawn: DrawnSpaceBody[] = [];
  /** Drawn over the planets' orbits by a sandbox such as the trip planner. */
  overlay: SpaceOverlay | null = null;
  /** Where the overlay's markers landed on screen last frame. */
  private overlayDrawn: { id: string; label?: string; x: number; y: number; onScreen: boolean; r: number }[] = [];
  private readonly gl: WebGL2RenderingContext;
  private readonly universe: Universe;
  private readonly starMesh: Mesh;
  private readonly starProgram: Program;
  private readonly milkyProgram: Program;
  private readonly milkyWay: WebGLTexture;
  private readonly screen: Mesh;
  private readonly orbitProgram: Program;
  private readonly bodyProgram: Program;
  private readonly orbitMesh: Mesh;
  private readonly quad: Mesh;
  private readonly orbits = new Map<string, OrbitCache>();
  private readonly positions = new Map<string, Vec3>();
  private readonly byId = new Map(this.bodies.map((b) => [b.id, b]));
  /** Distances and sizes squeezed so everything fits (see COMPRESS). */
  private compressed = false;
  private readonly popProgram: Program;
  /** Belts and clouds of small bodies, built on first use. */
  private populations: { pop: Population; mesh: Mesh }[] | null = null;

  constructor(gl: WebGL2RenderingContext, universe: Universe, starMesh: Mesh, milkyWay: WebGLTexture) {
    this.gl = gl;
    this.universe = universe;
    this.starMesh = starMesh;
    this.milkyWay = milkyWay;
    this.milkyProgram = new Program(gl, SPACE_MILKY_VERT, SPACE_MILKY_FRAG, ['aCorner']);
    this.screen = new Mesh(gl, 1, [], { quadSlot: 0 });
    this.screen.set(new Float32Array([0]));
    this.starProgram = new Program(gl, SPACE_STAR_VERT, STAR_FRAG, STAR_ATTRIBUTES);
    this.orbitProgram = new Program(gl, ORBIT_VERT, ORBIT_FRAG, ['aPos']);
    this.bodyProgram = new Program(gl, SPACE_BODY_VERT, SPACE_BODY_FRAG, ['aCorner']);
    this.popProgram = new Program(gl, POP_VERT, POP_FRAG, ['aOrbitA', 'aOrbitB']);
    this.orbitMesh = new Mesh(gl, 4, [{ index: 0, size: 4, offset: 0 }]);
    this.quad = new Mesh(gl, 1, [{ index: 1, size: 1, offset: 0 }], { quadSlot: 0 });
    this.quad.set(new Float32Array([0]));
  }

  /** Heliocentric position (AU, J2000) of a body at the universe's instant. */
  position(id: string): Vec3 | null {
    return this.positions.get(id) ?? null;
  }

  /** Radius as drawn, AU. */
  radiusOf(b: SpaceBody): number {
    return this.compressed ? COMPRESS.size(b.radiusAU) : b.radiusAU;
  }

  /** Switch between true and compressed scale, keeping the view on the same body. */
  setCompressed(on: boolean): void {
    if (on === this.compressed) return;
    const cam = this.camera;
    const before = cam.dist / this.framingDistance(cam.focus);
    this.compressed = on;
    this.orbits.clear();
    this.updatePositions();
    cam.floor = this.floorFor(cam.focus);
    cam.offset = [0, 0, 0];
    cam.flyTo(cam.focus === 'sun' ? cam.dist : this.framingDistance(cam.focus) * clamp(before, 1, 40), 0.8);
  }

  /** True orbit points (heliocentric, or a moon's offsets from its planet) as drawn at compressed scale. */
  private squashAll(points: Float64Array, parent?: SpaceBody): Float64Array {
    const out = new Float64Array(points.length);
    for (let k = 0; k < points.length; k += 3) {
      const p: Vec3 = [points[k], points[k + 1], points[k + 2]];
      out.set(parent ? COMPRESS.moon(p, parent.radiusAU) : COMPRESS.helio(p), k);
    }
    return out;
  }

  private updatePositions(): void {
    const eph = this.universe.eph, jd = this.universe.frame.jdTT;
    const truth = new Map<string, Vec3>();
    for (const b of this.bodies) {
      if (b.parent === 'jupiter') continue;
      truth.set(b.id, b.id === 'earth' ? eph.earth(jd) : eph.helio(b.id, jd));
    }
    const jupiter = truth.get('jupiter')!;
    galileanAround(jd, jupiter, truth.get('earth')!).forEach((p, k) => truth.set(GALILEAN[k].id, p));
    for (const b of this.bodies) {
      const p = truth.get(b.id)!;
      if (!this.compressed) { this.positions.set(b.id, p); continue; }
      const parent = b.parent ? this.byId.get(b.parent)! : undefined;
      this.positions.set(b.id, parent
        ? add(COMPRESS.helio(truth.get(parent.id)!), COMPRESS.moon(sub(p, truth.get(parent.id)!), parent.radiusAU))
        : COMPRESS.helio(p));
    }
  }

  /** Begin above the Earth and pull back to a view centred on `target`. */
  liftOff(target: string): void {
    this.updatePositions();
    const id = this.bodies.some((b) => b.id === target) ? target : 'sun';
    const cam = this.camera;
    cam.focus = id;
    cam.floor = this.floorFor(id);
    const to = id === 'sun' ? 4.2 : Math.max(0.03, this.framingDistance(id) * 6);
    const earth = this.byId.get('earth')!;
    cam.liftOff(sub(this.positions.get('earth')!, this.positions.get(id)!), Math.max(3e-4, this.radiusOf(earth) * 7), id === 'earth' ? Math.max(0.012, this.framingDistance('earth') * 3) : to);
    cam.update();
  }

  /** Circle a different body, gliding from the current one. */
  setFocus(id: string): void {
    if (!this.bodies.some((b) => b.id === id) || id === this.camera.focus) return;
    if (!this.positions.size) this.updatePositions();
    const from = this.positions.get(this.camera.focus)!, to = this.positions.get(id)!;
    this.camera.setFocus(id, sub(from, to));
    this.camera.floor = this.floorFor(id);
    if (this.camera.dist < this.camera.floor) this.camera.flyTo(this.framingDistance(id));
  }

  /** Put the camera exactly here, with no flight: for shared links. Angles in radians. */
  place(id: string, dist: number, yaw?: number, pitch?: number): void {
    const cam = this.camera;
    if (this.bodies.some((b) => b.id === id)) cam.focus = id;
    cam.floor = this.floorFor(cam.focus);
    cam.offset = [0, 0, 0];
    cam.flyTo(dist, 0);
    if (yaw !== undefined) cam.yaw = yaw;
    if (pitch !== undefined) cam.pitch = pitch;
    cam.update();
  }

  private floorFor(id: string): number {
    const b = this.byId.get(id);
    return b ? this.radiusOf(b) * (b.kind === 4 ? 2.6 : b.kind === 1 ? 2 : 1.6) : 0;
  }

  /** A distance from which a body comfortably fills part of the view. */
  framingDistance(id: string): number {
    const b = this.byId.get(id);
    if (!b) return 4;
    if (id === 'sun') return 3.2;
    return Math.max(MIN_DIST, this.radiusOf(b) * (b.kind === 4 ? 16 : 9));
  }

  private orbitPoints(b: SpaceBody): Float64Array | null {
    if (!b.period) return null;
    const eph = this.universe.eph, jd = this.universe.frame.jdTT;
    const cached = this.orbits.get(b.id);
    // An orbit's shape changes slowly; the trail only has to end at the body, which the draw step sees to.
    const stale = b.parent ? 20 : b.comet ? b.period : 36525;
    if (cached && Math.abs(cached.jd - jd) < stale) return cached.points;
    let points: Float64Array;
    if (b.comet) {
      const { e, tp } = b.comet, n = 360;
      const turn = Math.floor((jd - tp) / b.period + 0.5);
      points = new Float64Array((n + 1) * 3);
      for (let k = 0; k <= n; k++) {
        // Crowd the samples toward perihelion, where a comet's path bends hardest.
        const u = (2 * k) / n - 1;
        const E = Math.PI * u * u * u;
        const p = eph.helio(b.id, tp + turn * b.period + (b.period * (E - e * Math.sin(E))) / (2 * Math.PI));
        points.set(p, k * 3);
      }
    } else if (b.parent === 'jupiter') {
      const k = GALILEAN.findIndex((m) => m.id === b.id);
      // The moons' orbits are circles about Jupiter; hold Jupiter still while sampling.
      const jupiter = eph.helio('jupiter', jd), earth = eph.earth(jd);
      points = sampleOrbit((t) => sub(galileanAround(t, jupiter, earth)[k], jupiter), jd, b.period, 96);
    } else if (b.parent) {
      points = sampleOrbit((t) => eph.moonGeo(t), jd, b.period, 96);
    } else {
      points = sampleOrbit((t) => (b.id === 'earth' ? eph.earth(t) : eph.helio(b.id, t)), jd, b.period, 240);
    }
    this.orbits.set(b.id, { jd, points });
    return points;
  }

  render(opts: SpaceOptions, pixelRatio: number): void {
    const gl = this.gl, cam = this.camera, u = this.universe;
    this.setCompressed(opts.layers.compressed);
    this.updatePositions();
    const focusPos = this.positions.get(cam.focus) ?? [0, 0, 0];
    const w = gl.canvas.width, h = gl.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.012, 0.018, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const fx = (2 * cam.focal) / cam.width, fy = (2 * cam.focal) / cam.height;
    const shift = (2 * cam.shiftY) / cam.height;

    if (opts.layers.milkyWay) {
      gl.blendFunc(gl.ONE, gl.ZERO);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.milkyWay);
      this.milkyProgram.use().m3('uView', cam.view).v2('uF', fx, fy).v2('uShift', 0, shift).i('uMilkyWay', 0).f('uGain', 1);
      this.screen.drawQuads();
    }

    // Stars, at infinity.
    gl.blendFunc(gl.ONE, gl.ONE);
    this.starProgram.use().m3('uView', cam.view).v2('uF', fx, fy).v2('uShift', 0, shift).f('uYears', u.years).f('uLimitMag', 6.3).f('uPixelRatio', pixelRatio);
    this.starMesh.drawPoints();

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (opts.layers.smallBodies) this.drawPopulations(focusPos, fx, fy, pixelRatio);
    if (opts.layers.orbits) {
      this.orbitProgram.use().v2('uF', fx, fy).v2('uShift', 0, (2 * cam.shiftY) / cam.height).f('uNear', cam.dist * 1e-3);
      for (const b of this.bodies) {
        const truePoints = this.orbitPoints(b);
        if (!truePoints) continue;
        const parent = b.parent ? this.byId.get(b.parent) : undefined;
        const points = this.compressed ? this.squashAll(truePoints, parent) : truePoints;
        const origin = b.parent ? this.positions.get(b.parent)! : [0, 0, 0] as Vec3;
        const here = sub(this.positions.get(b.id)!, origin);
        const n = points.length / 3;
        // Size of the orbit against the view: hide it when it is a speck or when we are deep inside it.
        const size = Math.hypot(here[0], here[1], here[2]);
        const apparent = size / cam.dist;
        const alpha = clamp((apparent - 0.01) / 0.03, 0, 1) * clamp(2.2 - Math.log10(Math.max(apparent, 1e-9)) * 0.9, 0, 1);
        if (alpha <= 0.01) continue;
        // Start the loop at the sample nearest the body, and finish exactly on the body.
        let start = 0, best = Infinity;
        for (let k = 0; k < n - 1; k++) {
          const d = (points[k * 3] - here[0]) ** 2 + (points[k * 3 + 1] - here[1]) ** 2 + (points[k * 3 + 2] - here[2]) ** 2;
          if (d < best) { best = d; start = k; }
        }
        const data = new Float32Array((n + 1) * 4);
        const put = (i: number, p: Vec3, along: number) => {
          const c = cam.toCamera(sub(add(p, origin), focusPos));
          data[i * 4] = c[0]; data[i * 4 + 1] = c[1]; data[i * 4 + 2] = c[2]; data[i * 4 + 3] = along;
        };
        for (let j = 1; j < n; j++) {
          const k = (start + j) % (n - 1);
          put(j - 1, [points[k * 3], points[k * 3 + 1], points[k * 3 + 2]], j / n);
        }
        put(n - 1, here, 1);
        const marked = opts.selected === b.id;
        const col = marked ? opts.accentColor : opts.lineColor;
        this.orbitMesh.set(data.subarray(0, n * 4), gl.DYNAMIC_DRAW);
        this.orbitProgram.v4('uColor', col[0], col[1], col[2], alpha * (marked ? 0.95 : b.minor ? 0.22 : 0.5));
        this.orbitMesh.drawLineStrip();
      }
    }

    if (this.overlay) this.drawOverlayPaths(this.overlay, focusPos, fx, fy);

    // Bodies, far to near.
    const drawn: (DrawnSpaceBody & { body: SpaceBody; cam: Vec3 })[] = [];
    for (const b of this.bodies) {
      const c = cam.toCamera(sub(this.positions.get(b.id)!, focusPos));
      const s = cam.projectCamera(c);
      if (!s) continue;
      const radiusPx = Math.max(b.minPx, (cam.focal * this.radiusOf(b)) / s.depth);
      drawn.push({ id: b.id, name: b.name, x: s.x, y: s.y, radiusPx, depth: s.depth, onScreen: s.onScreen, body: b, cam: c });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    const p = this.bodyProgram.use();
    const days = this.universe.frame.jdTT - J2000;
    for (const d of drawn) {
      const extent = d.body.kind === 1 ? 5 : d.body.kind === 4 ? 2.6 : 1.4;
      const half = d.radiusPx * extent;
      if (d.x + half < 0 || d.x - half > cam.width || d.y + half < 0 || d.y - half > cam.height) continue;
      const toSun = normalize(scale(this.positions.get(d.id)!, -1));
      p.v2('uCentre', (d.x / cam.width) * 2 - 1, 1 - (d.y / cam.height) * 2)
        .v2('uHalf', (half / cam.width) * 2, (half / cam.height) * 2)
        .v3('uColor', d.body.color).v3('uLight', d.id === 'sun' ? [0, 0, 1] : apply(cam.view, toSun))
        .v3('uPole', d.body.pole ? apply(cam.view, d.body.pole) : [0, 1, 0])
        .v3('uPrime', apply(cam.view, this.primeMeridian(d.body, days)))
        .i('uKind', d.body.kind).f('uExtent', extent).f('uPixels', d.radiusPx * pixelRatio);
      this.quad.drawQuads();
    }
    this.drawn = drawn;
    this.overlayDrawn = [];
    if (this.overlay) {
      for (const m of this.overlay.markers) {
        const jd = u.frame.jdTT;
        const pos = typeof m.pos === 'function' ? m.pos(jd) : m.pos;
        const s = cam.projectCamera(cam.toCamera(sub(this.squash(pos), focusPos)));
        if (!s) continue;
        const r = m.radiusPx ?? 3.5;
        const label = typeof m.label === 'function' ? m.label(jd) : m.label;
        this.overlayDrawn.push({ id: m.id, label, x: s.x, y: s.y, onScreen: s.onScreen, r });
        p.v2('uCentre', (s.x / cam.width) * 2 - 1, 1 - (s.y / cam.height) * 2)
          .v2('uHalf', (r * 1.4 / cam.width) * 2, (r * 1.4 / cam.height) * 2)
          .v3('uColor', m.color).v3('uLight', [0, 0, 1]).v3('uPole', [0, 1, 0]).v3('uPrime', [1, 0, 0])
          .i('uKind', 0).f('uExtent', 1.4).f('uPixels', r * pixelRatio);
        this.quad.drawQuads();
      }
    }
  }

  /** A heliocentric point as drawn at the current scale. */
  private squash(p: Vec3): Vec3 {
    return this.compressed ? COMPRESS.helio(p) : p;
  }

  private drawOverlayPaths(o: SpaceOverlay, focusPos: Vec3, fx: number, fy: number): void {
    const gl = this.gl, cam = this.camera;
    this.orbitProgram.use().v2('uF', fx, fy).v2('uShift', 0, (2 * cam.shiftY) / cam.height).f('uNear', cam.dist * 1e-3);
    for (const path of o.paths) {
      const n = path.points.length;
      if (n < 2) continue;
      const data = new Float32Array(n * 4);
      path.points.forEach((pt, i) => {
        const c = cam.toCamera(sub(this.squash(pt), focusPos));
        data.set([c[0], c[1], c[2], path.along ? i / (n - 1) : 1], i * 4);
      });
      this.orbitMesh.set(data, gl.DYNAMIC_DRAW);
      this.orbitProgram.v4('uColor', path.color[0], path.color[1], path.color[2], path.alpha);
      this.orbitMesh.drawLineStrip();
    }
  }

  /** How visible a ring of radius `r` AU is from here: 0 when it is a speck or we are deep inside it. */
  private ringAlpha(r: number): number {
    const size = this.compressed ? Math.sqrt(r) : r;
    const apparent = size / this.camera.dist;
    return clamp((apparent - 0.03) / 0.06, 0, 1) * clamp(2.6 - Math.log10(Math.max(apparent, 1e-9)) * 0.9, 0, 1);
  }

  private drawPopulations(focusPos: Vec3, fx: number, fy: number, pixelRatio: number): void {
    const gl = this.gl, cam = this.camera;
    if (!this.populations) {
      this.populations = allPopulations().map((pop) => {
        const mesh = new Mesh(gl, 7, [{ index: 0, size: 4, offset: 0 }, { index: 1, size: 3, offset: 4 }]);
        mesh.set(pop.data);
        return { pop, mesh };
      });
    }
    const centre = cam.toCamera(scale(focusPos, -1));
    const p = this.popProgram.use()
      .m3('uEclToView', mul(cam.view, ECL_TO_EQ_J2000)).v3('uCentre', centre).f('uDist', cam.dist).v2('uF', fx, fy).v2('uShift', 0, (2 * cam.shiftY) / cam.height)
      .f('uDays', this.universe.frame.jdTT - J2000).f('uCompressed', this.compressed ? 1 : 0)
      .f('uPointSize', Math.max(1, 1.6 * pixelRatio));
    for (const { pop, mesh } of this.populations) {
      const region = REGIONS.find((r) => r.populations.includes(pop.id))!;
      const alpha = this.ringAlpha((region.inner + region.outer) / 2) * (region.id === 'oort' ? 0.5 : 0.6);
      if (alpha <= 0.01) continue;
      p.v4('uColor', pop.color[0], pop.color[1], pop.color[2], alpha);
      mesh.drawPoints();
    }
  }

  /** Where to put a region's name: on its near side, toward the camera, in the plane of the planets. */
  private regionAnchor(region: Region): Vec3 {
    const back = [this.camera.view[6], this.camera.view[7], this.camera.view[8]] as Vec3;
    // Project the direction toward the camera onto the ecliptic plane.
    const n = ECL_N, d = back[0] * n[0] + back[1] * n[1] + back[2] * n[2];
    let flat: Vec3 = [back[0] - d * n[0], back[1] - d * n[1], back[2] - d * n[2]];
    if (Math.hypot(...flat) < 1e-3) flat = ECL_X;
    // Looking down from above, the near edge sits at the bottom of the screen; the Oort cloud's name goes on top.
    const r = region.id === 'oort' ? region.outer * 0.6 : region.id === 'scattered' ? 70 : (region.inner + region.outer) / 2;
    const at = region.id === 'oort' ? scale(n, r) : scale(normalize(flat), r);
    return this.compressed ? COMPRESS.helio(at) : at;
  }

  /** Fly out to take in a region of small bodies, centred on the Sun. */
  showRegion(id: string): void {
    const region = regionById(id);
    if (!region) return;
    this.setFocus('sun');
    this.camera.flyTo(this.regionDistance(region), 1.8);
  }

  /** A camera distance that frames a region. */
  regionDistance(region: Region): number {
    const r = region.id === 'scattered' ? 160 : region.outer;
    return (this.compressed ? Math.sqrt(r) : r) * 2.6;
  }

  /** Where a body's prime meridian points (J2000). The Moon keeps one face to the Earth. */
  private primeMeridian(b: SpaceBody, days: number): Vec3 {
    const pole = b.pole ?? [0, 0, 1];
    if (b.spin) {
      const node = normalize(cross([0, 0, 1], pole));
      const w = b.spin.w0 + b.spin.rate * days;
      return add(scale(node, Math.cos(w)), scale(cross(pole, node), Math.sin(w)));
    }
    const parent = b.parent ? this.positions.get(b.parent) : undefined;
    const here = this.positions.get(b.id);
    if (!parent || !here) return normalize(cross(pole, [1, 0, 0]));
    const toParent = normalize(sub(parent, here));
    return normalize(sub(toParent, scale(pole, toParent[0] * pole[0] + toParent[1] * pole[1] + toParent[2] * pole[2])));
  }

  /** Names for what was drawn. */
  labels(selected: string | null, smallBodies = true): LabelItem[] {
    const items: LabelItem[] = [];
    const cam = this.camera, focusPos = this.positions.get(cam.focus) ?? [0, 0, 0];
    for (const region of smallBodies ? REGIONS : []) {
      const ref = `region:${region.id}`;
      const shown = this.ringAlpha((region.inner + region.outer) / 2);
      if (shown < 0.3 && selected !== ref) continue;
      const s = cam.projectCamera(cam.toCamera(sub(this.regionAnchor(region), focusPos)));
      if (!s || !s.onScreen) continue;
      items.push({ key: ref, text: region.name, x: s.x, y: s.y, kind: 'region', priority: 300, offset: 0, centred: true, selected: selected === ref });
    }
    for (const m of this.overlayDrawn) {
      if (m.label && m.onScreen) items.push({ key: `overlay:${m.id}`, text: m.label, x: m.x, y: m.y, kind: 'body', priority: 950, offset: m.r + 5, selected: false });
    }
    const parentOf = new Map(this.bodies.filter((b) => b.parent).map((b) => [b.id, b.parent!]));
    for (const d of this.drawn) {
      // A body that fills the view needs no name tag.
      if (!d.onScreen || d.radiusPx > 110) continue;
      const sel = d.id === selected;
      // A moon gets its name once it has pulled clear of its planet.
      const parent = parentOf.get(d.id);
      const host = parent ? this.drawn.find((x) => x.id === parent) : undefined;
      if (host && !sel && Math.hypot(d.x - host.x, d.y - host.y) < host.radiusPx + 28) continue;
      // Home first: the Sun needs no name to be found, the Earth does.
      const rank = d.id === 'earth' ? 910 : d.id === 'sun' ? 900 : d.id === this.camera.focus ? 880 : parent || d.id === 'pluto' ? 500 : this.byId.get(d.id)?.minor ? 450 : 800;
      items.push({ key: `space:${d.id}`, text: d.name, x: d.x, y: d.y, kind: 'body', priority: rank - d.depth * 0.01, offset: d.radiusPx * (d.id === 'saturn' && d.radiusPx > 6 ? 2.3 : 1) + 5, selected: sel });
    }
    return items;
  }

  /** The body nearest a screen point, or null. */
  pick(x: number, y: number, radius = 28): string | null {
    let best: string | null = null, bestD = radius;
    for (const d of this.drawn) {
      const dist = Math.max(0, Math.hypot(d.x - x, d.y - y) - d.radiusPx);
      // Nearer bodies are later in the list and win ties.
      if (dist <= bestD) { bestD = dist; best = d.id; }
    }
    return best;
  }
}

/** Heliocentric positions (AU, J2000) of Io, Europa, Ganymede and Callisto. */
export function galileanAround(jdTT: number, jupiter: Vec3, earth: Vec3): Vec3[] {
  const toEarth = sub(earth, jupiter);
  const dist = Math.hypot(toEarth[0], toEarth[1], toEarth[2]);
  return galileanMoons(jdTT, toEarth, dist).map((o) => add(jupiter, scale(o, JUPITER_RADIUS_AU)));
}
