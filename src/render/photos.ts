// Deep-sky photographs laid on the sky where their objects are, fading in as
// the view zooms close enough to show them. The images and their placement
// come from Stellarium's nebula set (corners in J2000 RA/Dec), keeping only
// those from ESO, ESA/Hubble, NASA and the Sloan Digital Sky Survey, whose
// licences let us ship them; each keeps its credit in index.json.

import { DEG, type Vec3, angleBetween, fromSpherical, normalize } from '../astro/math.ts';
import { Program, loadTexture } from './gl.ts';
import type { SkyProjection } from './projection.ts';

export interface PhotoInfo {
  file: string;
  /** Corners, [RA, Dec] in degrees (J2000), in the order of the image's corners from bottom left, anticlockwise. */
  corners: [number, number][];
  credit: string;
  url: string;
  license: string;
}

interface Photo extends PhotoInfo {
  centre: Vec3;
  /** Angular radius (corner to centre), radians. */
  radius: number;
  vao: WebGLVertexArrayObject;
  count: number;
  texture: WebGLTexture | null;
  ready: boolean;
}

/** Vertices along each side of the subdivided image, so it follows the projection's curve. */
const GRID = 6;

export class SkyPhotos {
  private photos: Photo[] = [];
  private loading = false;
  /** Called when an image arrives, to draw again. */
  onLoad: () => void = () => {};

  private readonly gl: WebGL2RenderingContext;
  private readonly program: Program;
  private readonly base: string;

  constructor(gl: WebGL2RenderingContext, program: Program, base = 'data/dso-photos/') {
    this.gl = gl;
    this.program = program;
    this.base = base;
  }

  /** Fetch the index once, the first time photos are wanted. */
  private load(): void {
    if (this.loading) return;
    this.loading = true;
    fetch(`${this.base}index.json`).then((r) => r.json()).then((list: PhotoInfo[]) => {
      this.photos = list.map((p) => this.build(p));
      this.onLoad();
    }).catch(() => { this.loading = false; });
  }

  private build(p: PhotoInfo): Photo {
    const gl = this.gl;
    const c = p.corners.map(([ra, dec]) => fromSpherical(ra * DEG, dec * DEG));
    const at = (s: number, t: number): Vec3 => {
      const v: Vec3 = [0, 0, 0];
      const w = [(1 - s) * (1 - t), s * (1 - t), s * t, (1 - s) * t];
      for (let k = 0; k < 4; k++) for (let i = 0; i < 3; i++) v[i] += c[k][i] * w[k];
      return normalize(v);
    };
    const data: number[] = [];
    const push = (s: number, t: number) => { const v = at(s, t); data.push(v[0], v[1], v[2], s, 1 - t); };
    for (let j = 0; j < GRID; j++) {
      for (let i = 0; i < GRID; i++) {
        const s0 = i / GRID, s1 = (i + 1) / GRID, t0 = j / GRID, t1 = (j + 1) / GRID;
        push(s0, t0); push(s1, t0); push(s1, t1);
        push(s0, t0); push(s1, t1); push(s0, t1);
      }
    }
    const vao = gl.createVertexArray()!;
    const buf = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 20, 12);
    gl.bindVertexArray(null);
    const centre = at(0.5, 0.5);
    const radius = Math.max(...c.map((v) => angleBetween(v, centre)));
    return { ...p, centre, radius, vao, count: data.length / 5, texture: null, ready: false };
  }

  /** Photo credits, for the Atlas and the credits list. */
  get list(): readonly PhotoInfo[] {
    return this.photos;
  }

  /**
   * Draw the photos large enough on screen to be worth showing. `gain` (0..1) carries
   * how dark the sky is; the program's projection uniforms must already be set.
   */
  draw(pr: SkyProjection, toHorizon: (v: Vec3) => Vec3, gain: number): void {
    if (gain <= 0.01) return;
    this.load();
    const gl = this.gl;
    let bound = false;
    for (const p of this.photos) {
      const px = (2 * p.radius) / pr.pixelAngle;
      if (px < 24) continue;
      const s = pr.project(toHorizon(p.centre));
      const margin = px / 2 + 20;
      if (!s || s.x < -margin || s.y < -margin || s.x > pr.width + margin || s.y > pr.height + margin) continue;
      if (!p.texture) {
        p.texture = loadTexture(gl, this.base + p.file, () => { p.ready = true; this.onLoad(); }, 'rgb');
        continue;
      }
      if (!p.ready) continue;
      if (!bound) { this.program.use().i('uTex', 0); gl.activeTexture(gl.TEXTURE0); bound = true; }
      // Fade in from about 24 to 90 pixels across.
      const t = Math.min(1, Math.max(0, (px - 24) / 66));
      this.program.f('uAlpha', gain * t * t * (3 - 2 * t));
      gl.bindTexture(gl.TEXTURE_2D, p.texture);
      gl.bindVertexArray(p.vao);
      gl.drawArrays(gl.TRIANGLES, 0, p.count);
    }
  }
}
