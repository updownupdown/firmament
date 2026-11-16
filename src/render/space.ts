// Space view: the solar system from outside, at true scale. The camera orbits
// a focus body; everything is positioned relative to that focus in doubles
// and handed to the GPU in camera space, so there is no jitter up close.

import { BODIES } from '../astro/bodies.ts';
import { EPS_J2000 } from '../astro/frames.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import { AU_KM, DEG, type Mat3, type Vec3, add, apply, clamp, fromSpherical, normalize, scale, sub } from '../astro/math.ts';
import type { LayerFlags } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';
import type { Controllable } from './camera.ts';
import { Mesh, Program } from './gl.ts';
import type { LabelItem } from './labels.ts';
import {
  ORBIT_FRAG, ORBIT_VERT, SPACE_BODY_FRAG, SPACE_BODY_VERT, SPACE_STAR_VERT, STAR_ATTRIBUTES, STAR_FRAG,
} from './shaders.ts';

// The ecliptic frame expressed in J2000 equatorial coordinates: the camera's "up" is ecliptic north.
const ECL_X: Vec3 = [1, 0, 0];
const ECL_Y: Vec3 = [0, Math.cos(EPS_J2000), Math.sin(EPS_J2000)];
const ECL_N: Vec3 = [0, -Math.sin(EPS_J2000), Math.cos(EPS_J2000)];

export const MIN_DIST = 2e-4;   // AU: about 30,000 km
export const MAX_DIST = 400;    // AU

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
  readonly fovY = 40 * DEG;
  held = false;
  reducedMotion = false;
  /** What is left of the glide from the previous focus (AU, J2000). */
  offset: Vec3 = [0, 0, 0];
  /** J2000 → camera rotation (camera looks along −z). */
  view: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  private velYaw = 0;
  private velPitch = 0;
  private flight: { from: number; to: number; t: number; duration: number; glide?: Vec3 } | null = null;

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
    const y = this.height / 2 - (f * c[1]) / depth;
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
    const to = clamp(dist, MIN_DIST, MAX_DIST);
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
    this.flight = { from, to, t: 0, duration, glide: shift };
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
    if (this.flight?.glide) this.offset = [0, 0, 0];
    this.flight = null;
    this.dist = clamp(this.dist / factor, MIN_DIST, MAX_DIST);
    this.update();
  }

  key(key: string): boolean {
    const step = 8 * DEG;
    if (key === 'ArrowLeft') this.yaw += step;
    else if (key === 'ArrowRight') this.yaw -= step;
    else if (key === 'ArrowUp') this.pitch += step;
    else if (key === 'ArrowDown') this.pitch -= step;
    else if (key === '+' || key === '=') this.flyTo(this.dist / 1.5, 0.25);
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
      if (f.t >= 1) this.flight = null;
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
  /** Eccentric orbits are sampled evenly in eccentric anomaly instead of time. */
  comet?: { q: number; e: number; tp: number };
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

function buildBodies(): SpaceBody[] {
  const list: SpaceBody[] = [];
  const planet = (id: keyof typeof BODIES, minPx: number, kind = 0) => {
    const b = BODIES[id];
    list.push({
      id, name: b.name, radiusAU: b.radiusEq / AU_KM, color: b.color, kind, minPx, period: b.period ?? 0,
      parent: id === 'moon' ? 'earth' : undefined, pole: fromSpherical(b.poleRa, b.poleDec),
    });
  };
  planet('sun', 6, 1);
  planet('mercury', 3); planet('venus', 3.5); planet('earth', 3.5); planet('moon', 1.8); planet('mars', 3);
  planet('jupiter', 4.5); planet('saturn', 4, 4); planet('uranus', 3.5); planet('neptune', 3.5); planet('pluto', 2);
  for (const sb of SMALL_BODIES) {
    const { q, e, tp } = sb.elements;
    list.push({
      id: sb.id, name: sb.name, radiusAU: sb.radiusKm / AU_KM, color: [0.75, 0.88, 1], kind: 0, minPx: 2,
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

export class SpaceRenderer {
  readonly camera = new SpaceCamera();
  readonly bodies = buildBodies();
  /** What the last frame drew, far to near. */
  drawn: DrawnSpaceBody[] = [];
  private readonly gl: WebGL2RenderingContext;
  private readonly universe: Universe;
  private readonly starMesh: Mesh;
  private readonly starProgram: Program;
  private readonly orbitProgram: Program;
  private readonly bodyProgram: Program;
  private readonly orbitMesh: Mesh;
  private readonly quad: Mesh;
  private readonly orbits = new Map<string, OrbitCache>();
  private readonly positions = new Map<string, Vec3>();

  constructor(gl: WebGL2RenderingContext, universe: Universe, starMesh: Mesh) {
    this.gl = gl;
    this.universe = universe;
    this.starMesh = starMesh;
    this.starProgram = new Program(gl, SPACE_STAR_VERT, STAR_FRAG, STAR_ATTRIBUTES);
    this.orbitProgram = new Program(gl, ORBIT_VERT, ORBIT_FRAG, ['aPos']);
    this.bodyProgram = new Program(gl, SPACE_BODY_VERT, SPACE_BODY_FRAG, ['aCorner']);
    this.orbitMesh = new Mesh(gl, 4, [{ index: 0, size: 4, offset: 0 }]);
    this.quad = new Mesh(gl, 1, [{ index: 1, size: 1, offset: 0 }], { quadSlot: 0 });
    this.quad.set(new Float32Array([0]));
  }

  /** Heliocentric position (AU, J2000) of a body at the universe's instant. */
  position(id: string): Vec3 | null {
    return this.positions.get(id) ?? null;
  }

  private updatePositions(): void {
    const eph = this.universe.eph, jd = this.universe.frame.jdTT;
    for (const b of this.bodies) {
      this.positions.set(b.id, b.id === 'earth' ? eph.earth(jd) : eph.helio(b.id, jd));
    }
  }

  /** Circle a different body, gliding from the current one. */
  /** Begin above the Earth and pull back to a view centred on `target`. */
  liftOff(target: string): void {
    this.updatePositions();
    const id = this.bodies.some((b) => b.id === target) ? target : 'sun';
    const cam = this.camera;
    cam.focus = id;
    const to = id === 'sun' ? 4.2 : Math.max(0.03, this.framingDistance(id) * 6);
    cam.liftOff(sub(this.positions.get('earth')!, this.positions.get(id)!), 3e-4, id === 'earth' ? 0.012 : to);
    cam.update();
  }

  setFocus(id: string): void {
    if (!this.bodies.some((b) => b.id === id)) return;
    if (!this.positions.size) this.updatePositions();
    const from = this.positions.get(this.camera.focus)!, to = this.positions.get(id)!;
    this.camera.setFocus(id, sub(from, to));
  }

  /** A distance from which a body comfortably fills part of the view. */
  framingDistance(id: string): number {
    const b = this.bodies.find((x) => x.id === id);
    if (!b) return 4;
    if (id === 'sun') return 3.2;
    return Math.max(MIN_DIST, b.radiusAU * (b.kind === 4 ? 16 : 9));
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
    this.updatePositions();
    const focusPos = this.positions.get(cam.focus) ?? [0, 0, 0];
    const w = gl.canvas.width, h = gl.canvas.height;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.012, 0.018, 0.035, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const fx = (2 * cam.focal) / cam.width, fy = (2 * cam.focal) / cam.height;

    // Stars, at infinity.
    gl.blendFunc(gl.ONE, gl.ONE);
    this.starProgram.use().m3('uView', cam.view).v2('uF', fx, fy).f('uYears', u.years).f('uLimitMag', 6.3).f('uPixelRatio', pixelRatio);
    this.starMesh.drawPoints();

    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    if (opts.layers.orbits) {
      this.orbitProgram.use().v2('uF', fx, fy).f('uNear', cam.dist * 1e-3);
      for (const b of this.bodies) {
        const points = this.orbitPoints(b);
        if (!points) continue;
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
        this.orbitProgram.v4('uColor', col[0], col[1], col[2], alpha * (marked ? 0.95 : 0.5));
        this.orbitMesh.drawLineStrip();
      }
    }

    // Bodies, far to near.
    const drawn: (DrawnSpaceBody & { body: SpaceBody; cam: Vec3 })[] = [];
    for (const b of this.bodies) {
      const c = cam.toCamera(sub(this.positions.get(b.id)!, focusPos));
      const s = cam.projectCamera(c);
      if (!s) continue;
      const radiusPx = Math.max(b.minPx, (cam.focal * b.radiusAU) / s.depth);
      drawn.push({ id: b.id, name: b.name, x: s.x, y: s.y, radiusPx, depth: s.depth, onScreen: s.onScreen, body: b, cam: c });
    }
    drawn.sort((a, b) => b.depth - a.depth);
    const p = this.bodyProgram.use();
    for (const d of drawn) {
      const extent = d.body.kind === 1 ? 5 : d.body.kind === 4 ? 2.6 : 1.4;
      const half = d.radiusPx * extent;
      if (d.x + half < 0 || d.x - half > cam.width || d.y + half < 0 || d.y - half > cam.height) continue;
      const toSun = normalize(scale(this.positions.get(d.id)!, -1));
      p.v2('uCentre', (d.x / cam.width) * 2 - 1, 1 - (d.y / cam.height) * 2)
        .v2('uHalf', (half / cam.width) * 2, (half / cam.height) * 2)
        .v3('uColor', d.body.color).v3('uLight', d.id === 'sun' ? [0, 0, 1] : apply(cam.view, toSun))
        .v3('uPole', d.body.pole ? apply(cam.view, d.body.pole) : [0, 1, 0])
        .i('uKind', d.body.kind).f('uExtent', extent).f('uPixels', d.radiusPx * pixelRatio);
      this.quad.drawQuads();
    }
    this.drawn = drawn;
  }

  /** Names for what was drawn. */
  labels(selected: string | null): LabelItem[] {
    const items: LabelItem[] = [];
    const earth = this.drawn.find((d) => d.id === 'earth');
    for (const d of this.drawn) {
      // A body that fills the view needs no name tag.
      if (!d.onScreen || d.radiusPx > 110) continue;
      const sel = d.id === selected;
      // The Moon gets its name once it has pulled clear of the Earth.
      if (d.id === 'moon' && !sel && earth && Math.hypot(d.x - earth.x, d.y - earth.y) < 28) continue;
      const rank = d.id === 'sun' ? 900 : d.id === this.camera.focus ? 880 : d.id === 'moon' || d.id === 'pluto' ? 500 : 800;
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
