// The sky view: draws the local sky for the Universe's current instant.
// Passes, in order: sky and Milky Way, lines, stars, deep-sky markers,
// solar system bodies, ground. Labels are DOM (see labels.ts).

import { BODIES } from '../astro/bodies.ts';
import { type EarthShadow, earthShadowAt } from '../astro/events.ts';
import type { ApparentBody } from '../astro/ephemeris.ts';
import { GALILEAN } from '../astro/galilean.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import {
  C_AU_PER_DAY, DEG, type Mat3, type Vec3, add, angleBetween, apply, clamp, cross, dot, fromSpherical, identity,
  mulAll, normalize, rotX, scale, sub, transpose,
} from '../astro/math.ts';
import { blackbodyRGB, temperatureFromBV } from '../astro/stars.ts';
import { J2000 } from '../astro/time.ts';
import type { Boundaries, Constellation, Dso } from '../data/types.ts';
import type { LayerFlags } from '../sim/scene.ts';
import type { Universe } from '../sim/universe.ts';
import { Mesh, Program, loadTexture } from './gl.ts';
import { type Projected, SkyProjection, refractVector } from './projection.ts';
import {
  BODY_FRAG, BODY_VERT, GROUND_FRAG, LINE_ATTRIBUTES, LINE_FRAG, LINE_VERT, MARKER_ATTRIBUTES, MARKER_FRAG,
  MARKER_VERT, SKY_FRAG, SKY_VERT, STAR_ATTRIBUTES, STAR_FRAG, STAR_VERT,
} from './shaders.ts';

export interface SkyOptions {
  layers: LayerFlags;
  /** Bortle class 1–9. */
  bortle: number;
  /** Constellation (in the current culture) to draw brighter. */
  highlightConstellation?: string | null;
  /** Colour of lines and markers, linear 0..1 (set from the design tokens). */
  lineColor: [number, number, number];
  accentColor: [number, number, number];
}

/** What the sky is like right now; labels and the UI read this too. */
export interface SkyConditions {
  /** Apparent direction of the Sun and Moon in the horizon frame. */
  sunDir: Vec3;
  moonDir: Vec3;
  /** Geometric altitude of the Sun, radians. */
  sunAlt: number;
  /** Altitude that sets sky brightness: the Sun's, pulled down during a deep eclipse. */
  sunAltEffective: number;
  /** Fraction of the Sun's disk not covered by the Moon. */
  sunVisible: number;
  moonLight: number;
  /** The Earth's shadow, when the Moon is in or near it. */
  shadow: EarthShadow | null;
  /** Faintest magnitude drawn, and the same before the zoom gain. */
  limitMag: number;
  nakedEyeLimit: number;
  /** Magnitudes lost per airmass. */
  extinction: number;
}

const STAR_STRIDE = 11;
const LINE_STRIDE = 12;
const SEGMENT_STEP = 3 * DEG;

/** Fraction of a disk of radius r1 left uncovered by a disk of radius r2 whose centre is d away. */
export function uncoveredFraction(r1: number, r2: number, d: number): number {
  if (d >= r1 + r2) return 1;
  if (d <= Math.abs(r1 - r2)) return r2 >= r1 ? 0 : 1 - (r2 * r2) / (r1 * r1);
  const a = Math.acos(clamp((d * d + r1 * r1 - r2 * r2) / (2 * d * r1), -1, 1));
  const b = Math.acos(clamp((d * d + r2 * r2 - r1 * r1) / (2 * d * r2), -1, 1));
  const overlap = r1 * r1 * (a - Math.sin(2 * a) / 2) + r2 * r2 * (b - Math.sin(2 * b) / 2);
  return clamp(1 - overlap / (Math.PI * r1 * r1), 0, 1);
}

function interp(x: number, table: [number, number][]): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    if (x <= table[i][0]) {
      const [x0, y0] = table[i - 1], [x1, y1] = table[i];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

// Faintest star visible against the sky for a Sun altitude in degrees.
const TWILIGHT_LIMIT: [number, number][] = [[-18, 9], [-15, 7.2], [-12, 6.0], [-9, 4.6], [-6, 3.0], [-3, 1.0], [0, -1.2], [3, -2.8], [6, -3.8]];

/** Sky brightness, limiting magnitude and friends for the Universe's current frame. */
export function skyConditions(u: Universe, opts: { bortle: number; atmosphere: boolean; fov: number }): SkyConditions {
  const m = u.frame.j2000ToHorizon;
  const sun = u.bodies.get('sun')!, moon = u.bodies.get('moon')!;
  const sunTrue = apply(m, sun.dir), moonTrue = apply(m, moon.dir);
  const sunDir = opts.atmosphere ? refractVector(sunTrue) : sunTrue;
  const moonDir = opts.atmosphere ? refractVector(moonTrue) : moonTrue;
  const sunAlt = Math.asin(clamp(sunTrue[2], -1, 1));
  const sunVisible = uncoveredFraction(sun.radius, moon.radius, angleBetween(sun.dir, moon.dir));
  // In the last tenth of an eclipse the sky falls to deep twilight.
  const t = clamp(sunVisible / 0.1, 0, 1);
  const deep = -5.5 * DEG;
  const sunAltEffective = sunAlt > deep ? deep + (sunAlt - deep) * t * t * (3 - 2 * t) : sunAlt;

  const moonUp = clamp(moonTrue[2] * 3, 0, 1);
  // Near the point opposite the Sun, the Moon may be in the Earth's shadow.
  const shadow = angleBetween(moon.dir, scale(sun.dir, -1)) < 3 * DEG ? earthShadowAt(u.eph, u.frame.jdUT) : null;
  const eclipsed = shadow && shadow.separation < shadow.penumbra + shadow.moonRadius ? shadow : null;
  const moonLight = Math.pow(moon.illum, 1.6) * moonUp * (eclipsed ? 0.03 + 0.97 * eclipsed.uncovered : 1);
  const zoomGain = clamp(1.7 * Math.log2((70 * DEG) / opts.fov), -0.6, 6.5);
  let nakedEyeLimit: number;
  if (opts.atmosphere) {
    const dark = 7.6 - (clamp(opts.bortle, 1, 9) - 1) * 0.5 - 1.7 * moonLight;
    nakedEyeLimit = Math.min(dark, interp(sunAltEffective / DEG, TWILIGHT_LIMIT));
  } else {
    nakedEyeLimit = 6.8;
  }
  return {
    sunDir, moonDir, sunAlt, sunAltEffective, sunVisible, moonLight, shadow: eclipsed,
    nakedEyeLimit, limitMag: nakedEyeLimit + zoomGain,
    extinction: opts.atmosphere ? 0.16 + 0.012 * (opts.bortle - 1) : 0,
  };
}

/** Faintest deep-sky object marked: only showpieces when zoomed out, more as the field narrows. */
export function dsoLimit(c: SkyConditions, fov: number): number {
  return Math.min(c.limitMag + 2.5, 4.6 + clamp(2.6 * Math.log2((100 * DEG) / fov), -1, 8));
}

/** Brightness lost to the air at an altitude, as a factor 0..1. */
function airDimming(sinAlt: number, k: number): number {
  if (k <= 0) return 1;
  const s = Math.max(sinAlt, 0);
  const airmass = 1 / (s + 0.025 * Math.exp(-11 * s));
  return Math.pow(10, -0.4 * k * (airmass - 1));
}

const BODY_KIND: Record<string, number> = { sun: 1, moon: 2, jupiter: 3, saturn: 4, mars: 5, earth: 7 };

export interface DrawnBody {
  id: string;
  /** Screen position in CSS pixels, or null if behind the camera. */
  screen: Projected | null;
  /** Radius of the drawn disc in CSS pixels. */
  radiusPx: number;
  body: ApparentBody;
  alt: number;
}

export class SkyRenderer {
  readonly canvas: HTMLCanvasElement;
  readonly gl: WebGL2RenderingContext;
  readonly projection = new SkyProjection();
  readonly universe: Universe;
  pixelRatio = 1;
  conditions!: SkyConditions;
  /** Bodies as drawn in the last frame, for labels and picking. */
  drawn: DrawnBody[] = [];
  /** Interleaved star records (see STAR_STRIDE): pos xyz, hasDistance, vel xyz, mag, rgb. */
  starData = new Float32Array(0);

  private readonly skyProgram: Program;
  private readonly groundProgram: Program;
  private readonly starProgram: Program;
  private readonly lineProgram: Program;
  private readonly markerProgram: Program;
  private readonly bodyProgram: Program;
  private readonly quad: Mesh;
  /** The star catalog on the GPU; Space view draws the same buffer. */
  readonly stars: Mesh;
  private readonly bodyPoints: Mesh;
  private readonly figures: Mesh;
  private readonly highlight: Mesh;
  private readonly boundaries: Mesh;
  private readonly graticule: Mesh;
  private readonly circle: Mesh;
  private readonly markers: Mesh;
  private readonly milkyWay: WebGLTexture;
  private highlighted: string | null = null;
  private figureCulture = '';
  private figureStars = 0;
  /** Set when something changed outside the clock, so the loop redraws. */
  dirty = true;

  constructor(canvas: HTMLCanvasElement, universe: Universe, milkyWayUrl: string) {
    this.canvas = canvas;
    this.universe = universe;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    this.skyProgram = new Program(gl, SKY_VERT, SKY_FRAG, ['aCorner']);
    this.groundProgram = new Program(gl, SKY_VERT, GROUND_FRAG, ['aCorner']);
    this.starProgram = new Program(gl, STAR_VERT, STAR_FRAG, STAR_ATTRIBUTES);
    this.lineProgram = new Program(gl, LINE_VERT, LINE_FRAG, LINE_ATTRIBUTES);
    this.markerProgram = new Program(gl, MARKER_VERT, MARKER_FRAG, MARKER_ATTRIBUTES);
    this.bodyProgram = new Program(gl, BODY_VERT, BODY_FRAG, ['aCorner']);

    this.quad = new Mesh(gl, 1, [], { quadSlot: 0 });
    this.quad.set(new Float32Array([0]));
    const starLayout = [{ index: 0, size: 4, offset: 0 }, { index: 1, size: 3, offset: 4 }, { index: 2, size: 4, offset: 7 }];
    this.stars = new Mesh(gl, STAR_STRIDE, starLayout);
    this.bodyPoints = new Mesh(gl, STAR_STRIDE, starLayout);
    const lineLayout = [
      { index: 1, size: 3, offset: 0 }, { index: 2, size: 3, offset: 3 },
      { index: 3, size: 3, offset: 6 }, { index: 4, size: 3, offset: 9 },
    ];
    const lineMesh = () => new Mesh(gl, LINE_STRIDE, lineLayout, { quadSlot: 0 });
    this.figures = lineMesh();
    this.highlight = lineMesh();
    this.boundaries = lineMesh();
    this.graticule = lineMesh();
    this.circle = lineMesh();
    this.markers = new Mesh(gl, 6, [{ index: 0, size: 3, offset: 0 }, { index: 1, size: 3, offset: 3 }]);
    this.milkyWay = loadTexture(gl, milkyWayUrl, () => { this.dirty = true; });

    this.buildGraticule();
    this.setStars();
    this.setDsos(universe.dsos);
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
  }

  // ---------------------------------------------------------------- geometry

  /** (Re)upload the star catalog; call again after the faint stars load. */
  setStars(): void {
    const s = this.universe.stars;
    const data = new Float32Array(s.count * STAR_STRIDE);
    for (let i = 0; i < s.count; i++) {
      const { pos, vel, hasDistance } = s.spaceMotion(i);
      const [r, g, b] = blackbodyRGB(temperatureFromBV(s.bv[i]));
      const o = i * STAR_STRIDE;
      data[o] = pos[0]; data[o + 1] = pos[1]; data[o + 2] = pos[2]; data[o + 3] = hasDistance ? 1 : 0;
      data[o + 4] = vel[0]; data[o + 5] = vel[1]; data[o + 6] = vel[2];
      data[o + 7] = s.mag[i];
      // Soften the colours: real star tints are subtle to the eye.
      data[o + 8] = 0.45 + 0.55 * r; data[o + 9] = 0.45 + 0.55 * g; data[o + 10] = 0.45 + 0.55 * b;
    }
    this.starData = data;
    this.stars.set(data);
    this.figureCulture = '';
    this.dirty = true;
  }

  private segments(out: number[], a: Vec3, va: Vec3, b: Vec3, vb: Vec3): void {
    const n = Math.max(1, Math.ceil(angleBetween(a, b) / SEGMENT_STEP));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      for (const t of [t0, t1]) {
        out.push(
          a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t,
          va[0] + (vb[0] - va[0]) * t, va[1] + (vb[1] - va[1]) * t, va[2] + (vb[2] - va[2]) * t,
        );
      }
    }
  }

  /** Unit direction of a star and its rate of change, so lines follow the stars through time. */
  private starLine(i: number): { p: Vec3; v: Vec3 } {
    const o = i * STAR_STRIDE, d = this.starData;
    const r = Math.hypot(d[o], d[o + 1], d[o + 2]);
    return { p: [d[o] / r, d[o + 1] / r, d[o + 2] / r], v: [d[o + 4] / r, d[o + 5] / r, d[o + 6] / r] };
  }

  private figureData(list: Constellation[]): Float32Array {
    const out: number[] = [];
    const count = this.universe.stars.count;
    for (const c of list) {
      for (const line of c.lines) {
        for (let k = 1; k < line.length; k++) {
          // Lines can name faint stars that have not loaded yet; those segments appear later.
          if (line[k - 1] >= count || line[k] >= count) continue;
          const a = this.starLine(line[k - 1]), b = this.starLine(line[k]);
          this.segments(out, a.p, a.v, b.p, b.v);
        }
      }
    }
    return new Float32Array(out);
  }

  private syncFigures(highlight: string | null): void {
    const u = this.universe;
    const culture = u.culture;
    if (culture && (this.figureCulture !== culture.id || this.figureStars !== u.stars.count)) {
      this.figures.set(this.figureData(culture.constellations.filter((c) => !c.asterism)));
      this.figureCulture = culture.id;
      this.figureStars = u.stars.count;
      this.highlighted = null;
    }
    if (highlight !== this.highlighted) {
      const c = highlight ? culture?.constellations.find((x) => x.id === highlight) : undefined;
      this.highlight.set(c ? this.figureData([c]) : new Float32Array(0));
      this.highlighted = highlight;
    }
  }

  setBoundaries(b: Boundaries): void {
    const out: number[] = [];
    const zero: Vec3 = [0, 0, 0];
    for (const line of b) {
      for (let k = 2; k + 1 < line.length; k += 2) {
        const p0 = fromSpherical(line[k - 2] * DEG, line[k - 1] * DEG);
        const p1 = fromSpherical(line[k] * DEG, line[k + 1] * DEG);
        this.segments(out, p0, zero, p1, zero);
      }
    }
    this.boundaries.set(new Float32Array(out));
    this.dirty = true;
  }

  private buildGraticule(): void {
    const zero: Vec3 = [0, 0, 0];
    const out: number[] = [];
    const step = 3;
    for (let lat = -80; lat <= 80; lat += 10) {
      if (lat === 0) continue;
      for (let lon = 0; lon < 360; lon += step) {
        this.segments(out, fromSpherical(lon * DEG, lat * DEG), zero, fromSpherical((lon + step) * DEG, lat * DEG), zero);
      }
    }
    for (let lon = 0; lon < 360; lon += 15) {
      for (let lat = -80; lat < 80; lat += step + 1) {
        const hi = Math.min(80, lat + step + 1);
        this.segments(out, fromSpherical(lon * DEG, lat * DEG), zero, fromSpherical(lon * DEG, hi * DEG), zero);
      }
    }
    this.graticule.set(new Float32Array(out));
    const ring: number[] = [];
    for (let lon = 0; lon < 360; lon += step) {
      this.segments(ring, fromSpherical(lon * DEG, 0), zero, fromSpherical((lon + step) * DEG, 0), zero);
    }
    this.circle.set(new Float32Array(ring));
  }

  setDsos(dsos: Dso[]): void {
    const data = new Float32Array(dsos.length * 6);
    dsos.forEach((d, i) => {
      const dir = fromSpherical(d.ra * DEG, d.de * DEG);
      const kind = ['s', 'e', 'i', 'sd', 'g', 's0'].includes(d.t) ? 0 : d.t === 'oc' || d.t === 'gc' ? 1 : 2;
      const size = Math.max(...(d.z ?? '5').split('x').map(Number).filter(Number.isFinite), 1);
      data.set([dir[0], dir[1], dir[2], d.m, kind, (size / 2 / 60) * DEG], i * 6);
    });
    this.markers.set(data);
  }

  // ---------------------------------------------------------------- frame

  resize(): boolean {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    const pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    const changed = this.canvas.width !== pw || this.canvas.height !== ph;
    if (changed) {
      this.canvas.width = pw;
      this.canvas.height = ph;
    }
    this.pixelRatio = dpr;
    this.projection.width = Math.max(1, w);
    this.projection.height = Math.max(1, h);
    return changed;
  }

  /** Project an apparent J2000 direction to the screen (CSS pixels). */
  project(dirJ2000: Vec3): Projected | null {
    return this.projection.project(apply(this.universe.frame.j2000ToHorizon, dirJ2000));
  }

  /** The J2000 direction under a screen point. */
  unproject(x: number, y: number): Vec3 {
    return apply(transpose(this.universe.frame.j2000ToHorizon), this.projection.unproject(x, y));
  }

  private common(p: Program): Program {
    const pr = this.projection;
    return p.use()
      .m3('uView', pr.view)
      .v2('uScale', (pr.scale * 2) / pr.width, (pr.scale * 2) / pr.height)
      .f('uRefract', pr.refraction ? 1 : 0);
  }

  private skyUniforms(p: Program, c: SkyConditions, opts: SkyOptions): Program {
    const pr = this.projection;
    return p.use()
      .m3('uViewT', transpose(pr.view))
      .v2('uScale', (pr.scale * 2) / pr.width, (pr.scale * 2) / pr.height)
      .v3('uSunDir', c.sunDir).f('uSunAlt', c.sunAltEffective).f('uSunVisible', c.sunVisible)
      .v3('uMoonDir', c.moonDir).f('uMoonLight', c.moonLight)
      .f('uLightPollution', (clamp(opts.bortle, 1, 9) - 1) / 8)
      .f('uAtmosphere', opts.layers.atmosphere ? 1 : 0);
  }

  render(opts: SkyOptions): void {
    const gl = this.gl, u = this.universe, pr = this.projection, f = u.frame;
    this.resize();
    pr.refraction = opts.layers.atmosphere;
    pr.update();
    const c = skyConditions(u, { bortle: opts.bortle, atmosphere: opts.layers.atmosphere, fov: pr.fov });
    this.conditions = c;
    this.syncFigures(opts.highlightConstellation ?? null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    const dpr = this.pixelRatio;
    const aberration = scale(f.earthVel, 1 / C_AU_PER_DAY);
    const night = clamp((c.nakedEyeLimit + 2) / 6, 0, 1);

    // 1. Sky and Milky Way.
    gl.blendFunc(gl.ONE, gl.ZERO);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.milkyWay);
    const mwGain = opts.layers.milkyWay ? Math.pow(clamp((c.nakedEyeLimit - 4.4) / 2.4, 0, 1), 1.4) : 0;
    this.skyUniforms(this.skyProgram, c, opts)
      .m3('uHorizonToJ2000', transpose(f.j2000ToHorizon)).i('uMilkyWay', 0).f('uMilkyWayGain', mwGain);
    this.quad.drawQuads(1);

    // 2. Lines.
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const lines = this.common(this.lineProgram)
      .v2('uViewport', this.canvas.width, this.canvas.height).f('uYears', u.years);
    const [lr, lg, lb] = opts.lineColor;
    const drawLines = (mesh: Mesh, frame: Mat3, alpha: number, width: number, moving: boolean, refract: boolean, rgb = opts.lineColor) => {
      lines.m3('uFrame', frame).v4('uColor', rgb[0], rgb[1], rgb[2], alpha).f('uWidth', width * dpr)
        .v3('uAberration', moving ? aberration : [0, 0, 0]).f('uRefract', refract && pr.refraction ? 1 : 0)
        .f('uYears', moving ? u.years : 0);
      mesh.drawQuads();
    };
    if (opts.layers.gridAltAz) {
      drawLines(this.graticule, identity(), 0.16, 1, false, false);
      drawLines(this.circle, identity(), 0.3, 1, false, false);
    }
    if (opts.layers.gridEquatorial) {
      drawLines(this.graticule, f.dateToHorizon, 0.17, 1, false, true, [lr * 0.7, lg * 0.85, lb]);
      drawLines(this.circle, f.dateToHorizon, 0.34, 1.2, false, true, [lr * 0.7, lg * 0.85, lb]);
    }
    if (opts.layers.ecliptic) {
      drawLines(this.circle, mulAll(f.dateToHorizon, rotX(-f.nut.epsTrue)), 0.5, 1.2, false, true, [1, 0.8, 0.45]);
    }
    if (opts.layers.boundaries && this.boundaries.count) {
      drawLines(this.boundaries, f.j2000ToHorizon, 0.2, 1, false, true, [lr * 0.9, lg * 0.75, lb * 0.75]);
    }
    if (opts.layers.lines) {
      drawLines(this.figures, f.j2000ToHorizon, 0.2 + 0.2 * night, 1.2, true, true);
    }
    if (this.highlight.count) {
      drawLines(this.highlight, f.j2000ToHorizon, 0.95, 2, true, true, opts.accentColor);
    }

    // 3. Stars, then planets too small to show a disc (same shader, so they match the stars).
    gl.blendFunc(gl.ONE, gl.ONE);
    const stars = this.common(this.starProgram)
      .m3('uJ2000ToHorizon', f.j2000ToHorizon).f('uYears', u.years).v3('uAberration', aberration)
      .f('uLimitMag', c.limitMag).f('uExtinction', c.extinction).f('uPixelRatio', dpr).f('uSizeBoost', 1);
    // The catalog is sorted by magnitude, so only the stars that can show are sent.
    this.stars.drawPoints(this.countBrighter(c.limitMag + 0.5));

    this.drawn = this.placeBodies(c);
    const points: number[] = [];
    for (const d of this.drawn) {
      if (d.id === 'sun' || d.id === 'moon') continue;
      // Fade the point out as the disc takes over.
      const fade = clamp((d.radiusPx * dpr - 1.5) / 3, 0, 1);
      const color = this.bodyColor(d.id);
      points.push(d.body.dir[0], d.body.dir[1], d.body.dir[2], 0, 0, 0, 0, d.body.mag + 6 * fade, 0.55 + 0.45 * color[0], 0.55 + 0.45 * color[1], 0.55 + 0.45 * color[2]);
    }
    this.bodyPoints.set(new Float32Array(points), gl.DYNAMIC_DRAW);
    stars.v3('uAberration', [0, 0, 0]).f('uYears', 0).f('uSizeBoost', 1.15);
    this.bodyPoints.drawPoints();

    // 4. Deep-sky markers.
    if (opts.layers.dsos) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.common(this.markerProgram)
        .m3('uJ2000ToHorizon', f.j2000ToHorizon).f('uLimitMag', dsoLimit(c, pr.fov)).f('uPixelRatio', dpr)
        .f('uPixelsPerRadian', pr.scale).v3('uColor', opts.accentColor);
      this.markers.drawPoints();
    }

    // 5. Discs, far to near.
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.drawBodies(c, opts);

    // 6. Ground.
    if (opts.layers.ground) {
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      this.skyUniforms(this.groundProgram, c, opts).f('uPixelAngle', pr.pixelAngle / dpr);
      this.quad.drawQuads(1);
    }
    this.dirty = false;
  }

  private countBrighter(limit: number): number {
    const d = this.starData, n = d.length / STAR_STRIDE;
    let lo = 0, hi = n;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d[mid * STAR_STRIDE + 7] <= limit) lo = mid + 1; else hi = mid;
    }
    // Space motion can brighten a star over deep time; keep a margin when far from the present.
    return Math.abs(this.universe.years) > 2000 ? n : lo;
  }

  bodyColor(id: string): [number, number, number] {
    const b = (BODIES as Record<string, { color: [number, number, number] } | undefined>)[id];
    if (b) return b.color;
    return GALILEAN.find((m) => m.id === id)?.color ?? [0.8, 0.9, 1];
  }

  private placeBodies(c: SkyConditions): DrawnBody[] {
    const u = this.universe, pr = this.projection;
    const sun = u.bodies.get('sun')!;
    const out: DrawnBody[] = [];
    for (const [id, body] of u.bodies) {
      const h = apply(u.frame.j2000ToHorizon, body.dir);
      const cam = apply(pr.view, pr.refraction ? refractVector(h) : h);
      const screen = pr.projectCamera(cam);
      const local = (2 / (1 - cam[2])) * pr.scale; // CSS pixels per radian here
      let radiusPx = body.radius * local;
      // The Moon is drawn no smaller than a few pixels so its phase can be read when zoomed
      // out, except near the Sun, where true sizes matter for eclipses.
      if (id === 'moon' && angleBetween(body.dir, sun.dir) > 3 * DEG) radiusPx = Math.max(radiusPx, 5);
      out.push({ id, screen, radiusPx, body, alt: Math.asin(clamp(h[2], -1, 1)) });
    }
    void c;
    return out.sort((a, b) => b.body.dist - a.body.dist);
  }

  private drawBodies(c: SkyConditions, opts: SkyOptions): void {
    const u = this.universe, pr = this.projection, dpr = this.pixelRatio;
    const p = this.skyUniforms(this.bodyProgram, c, opts);
    const toJ2000 = transpose(mulAll(pr.view, u.frame.j2000ToHorizon));
    const days = u.frame.jdTT - J2000;
    for (const d of this.drawn) {
      if (!d.screen) continue;
      const { id, body } = d;
      const small = SMALL_BODIES.find((b) => b.id === id);
      const rDev = d.radiusPx * dpr;
      const dim = airDimming(Math.sin(d.alt), c.extinction);
      let kind = BODY_KIND[id] ?? 0;
      let extent = 1.15, glare = 0, radius = d.radiusPx;
      let color = this.bodyColor(id);
      if (id === 'sun' && c.sunVisible < 0.02 && rDev > 1.5) {
        // Totality: the corona appears around the hidden Sun.
        const strength = 1 - c.sunVisible / 0.02;
        p.i('uKind', 9).f('uExtent', 6).f('uRadiusPx', rDev)
          .v2('uCentre', (d.screen.x / pr.width) * 2 - 1, 1 - (d.screen.y / pr.height) * 2)
          .v2('uHalf', (d.radiusPx * 12) / pr.width, (d.radiusPx * 12) / pr.height)
          .v3('uColor', [0.95, 0.96, 1]).f('uDim', 1).f('uGlare', 0.9 * strength);
        this.quad.drawQuads(1);
      }
      if (id === 'sun') {
        // Glare that reads as "too bright to look at", reddening toward the horizon.
        const low = clamp(d.alt / (12 * DEG), 0, 1);
        color = [1, 0.55 + 0.42 * low, 0.25 + 0.65 * low];
        glare = c.sunVisible * (opts.layers.atmosphere ? 0.55 + 0.45 * low : 1);
        extent = Math.max(1.15, 150 / Math.max(d.radiusPx, 0.01));
      } else if (id === 'moon') {
        glare = opts.layers.atmosphere ? 0.22 * body.illum * (1 - clamp((rDev - 6) / 30, 0, 1)) * (c.shadow ? c.shadow.uncovered : 1) : 0;
        extent = Math.max(1.15, glare > 0 ? 60 / Math.max(d.radiusPx, 0.01) : 0);
        color = [0.93, 0.91, 0.86];
      } else if (small) {
        if (body.mag > c.limitMag + 1) continue;
        kind = 8;
        radius = Math.max(0.35 * DEG * pr.scale, 6);
        extent = 6;
        glare = clamp((c.limitMag + 1 - body.mag) / 4, 0, 1);
        color = [0.75, 0.9, 1];
      } else {
        if (rDev < 0.9) continue;
        if (kind === 4) extent = 2.5;
      }
      const cam = apply(pr.view, pr.refraction ? refractVector(apply(u.frame.j2000ToHorizon, body.dir)) : apply(u.frame.j2000ToHorizon, body.dir));
      const basis = pr.tangentBasis(cam);
      const ex = apply(toJ2000, basis.right), ey = apply(toJ2000, basis.up);
      const ez = scale(body.dir, -1);
      const local = (v: Vec3): Vec3 => [dot(v, ex), dot(v, ey), dot(v, ez)];
      const info = (BODIES as Record<string, { poleRa: number; poleDec: number; w0: number; wRate: number; flattening: number } | undefined>)[id];
      let pole: Vec3 = [0, 0, 1], prime: Vec3 = ez, flatten = 0;
      if (info) {
        pole = fromSpherical(info.poleRa, info.poleDec);
        flatten = info.flattening;
        if (id === 'moon') {
          // Tidally locked: the prime meridian faces the Earth (libration is not modelled).
          prime = normalize(sub(ez, scale(pole, dot(ez, pole))));
        } else {
          const node = normalize(cross([0, 0, 1], pole));
          const w = info.w0 + info.wRate * days;
          prime = add(scale(node, Math.cos(w)), scale(cross(pole, node), Math.sin(w)));
        }
      } else {
        prime = normalize(sub(ez, scale(pole, dot(ez, pole))));
      }
      // The Earth's shadow on the Moon, in the disc's own frame and in Moon radii.
      let shadow: Vec3 = [0, 0, 0], penumbra = 0, adapted = 0;
      if (id === 'moon' && c.shadow) {
        const s = c.shadow;
        const offset = local(sub(s.shadowDir, s.moonDir));
        shadow = [offset[0] / s.moonRadius, offset[1] / s.moonRadius, s.umbra / s.moonRadius];
        penumbra = s.penumbra / s.moonRadius;
        // While any of the Moon is in sunlight the umbra looks nearly black beside it.
        adapted = 1 - clamp(s.uncovered / 0.12, 0, 1);
      }
      const half = radius * extent;
      p.v3('uShadow', shadow).v2('uShadowEdge', penumbra, adapted);
      p.i('uKind', kind).f('uExtent', extent).f('uRadiusPx', radius * dpr)
        .v2('uCentre', (d.screen.x / pr.width) * 2 - 1, 1 - (d.screen.y / pr.height) * 2)
        .v2('uHalf', (half * 2) / pr.width, (half * 2) / pr.height)
        .v3('uSun', id === 'sun' ? [0, 0, 1] : local(body.sunDir)).v3('uPole', local(pole)).v3('uPrime', local(prime))
        .v3('uColor', color).f('uDim', id === 'sun' ? 1 : Math.max(dim, 0.12))
        .f('uEarthshine', angleBetween(body.dir, u.bodies.get('sun')!.dir) > 6 * DEG ? 0.05 * (1 - body.illum) : 0).f('uGlare', glare).f('uFlatten', kind === 8 ? 0 : flatten);
      this.quad.drawQuads(1);
    }
  }
}
