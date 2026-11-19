// Constellation artwork behind the figures: Stellarium's illustrations of the
// Western constellations (Free Art License 1.3). Each picture is pinned to the
// sky by three stars: their pixel positions in the image and their Hipparcos
// numbers. An affine map from pixels to the tangent plane at those stars places
// every corner of the picture.

import { type Vec3, add, cross, dot, normalize, scale } from '../astro/math.ts';
import { Program, loadTexture } from './gl.ts';

export interface ArtInfo {
  /** IAU abbreviation, as in the Western culture's constellation ids. */
  id: string;
  file: string;
  size: [number, number];
  /** Three anchors: x and y in image pixels (from the top left), and the star's HIP number. */
  anchors: [number, number, number][];
}

interface Art {
  info: ArtInfo;
  vao: WebGLVertexArrayObject;
  count: number;
  texture: WebGLTexture | null;
  ready: boolean;
}

const GRID = 8;

/** Solve the 3×3 system m·x = v (rows of m), by Cramer's rule. */
function solve3(m: number[][], v: number[]): number[] {
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  return [0, 1, 2].map((k) => det(m.map((row, i) => row.map((x, j) => (j === k ? v[i] : x)))) / d);
}

/**
 * Directions (J2000) of an image's points, given its three anchor stars. Exported for tests.
 * Returns a function from image pixel (x right, y down) to a unit vector.
 */
export function artMapping(anchors: [number, number][], stars: Vec3[]): (x: number, y: number) => Vec3 {
  const centre = normalize(add(add(stars[0], stars[1]), stars[2]));
  const east = normalize(Math.abs(centre[2]) > 0.999 ? cross([1, 0, 0], centre) : cross([0, 0, 1], centre));
  const north = cross(centre, east);
  // Gnomonic projection onto the tangent plane at the centre.
  const plane = stars.map((s) => { const k = 1 / dot(s, centre); return [dot(s, east) * k, dot(s, north) * k]; });
  const rows = anchors.map(([x, y]) => [x, y, 1]);
  const a = solve3(rows, plane.map((p) => p[0]));
  const b = solve3(rows, plane.map((p) => p[1]));
  return (x, y) => {
    const xi = a[0] * x + a[1] * y + a[2], eta = b[0] * x + b[1] * y + b[2];
    return normalize(add(centre, add(scale(east, xi), scale(north, eta))));
  };
}

export class ConstellationArt {
  private arts: Art[] = [];
  private requested = false;
  onLoad: () => void = () => {};
  private readonly gl: WebGL2RenderingContext;
  private readonly program: Program;
  private readonly base: string;

  constructor(gl: WebGL2RenderingContext, program: Program, base = 'data/art/') {
    this.gl = gl;
    this.program = program;
    this.base = base;
  }

  /** Fetch the index once; `starDir` gives a star's J2000 direction by HIP number. */
  private load(starDir: (hip: number) => Vec3 | null): void {
    if (this.requested) return;
    this.requested = true;
    fetch(`${this.base}index.json`).then((r) => r.json()).then((list: ArtInfo[]) => {
      for (const info of list) {
        const stars = info.anchors.map(([, , hip]) => starDir(hip));
        if (stars.some((s) => !s)) continue;
        this.arts.push(this.build(info, stars as Vec3[]));
      }
      this.onLoad();
    }).catch(() => { this.requested = false; });
  }

  private build(info: ArtInfo, stars: Vec3[]): Art {
    const gl = this.gl;
    const [w, h] = info.size;
    const map = artMapping(info.anchors.map(([x, y]) => [x, y]), stars);
    const data: number[] = [];
    const push = (s: number, t: number) => { const v = map(s * w, t * h); data.push(v[0], v[1], v[2], s, t); };
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
    return { info, vao, count: data.length / 5, texture: null, ready: false };
  }

  /**
   * Draw every picture (or only `only`, an IAU abbreviation, brighter), tinted `tint`
   * with strength `gain`. The program's projection uniforms must already be set.
   */
  draw(starDir: (hip: number) => Vec3 | null, tint: Vec3, gain: number, only: string | null): void {
    if (gain <= 0.01) return;
    this.load(starDir);
    const gl = this.gl;
    this.program.use().i('uTex', 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const a of this.arts) {
      if (!a.texture) a.texture = loadTexture(gl, this.base + a.info.file, () => { a.ready = true; this.onLoad(); });
      if (!a.ready) continue;
      const g = only ? (a.info.id === only ? gain * 2.2 : gain * 0.5) : gain;
      this.program.v3('uTint', scale(tint, g));
      gl.bindTexture(gl.TEXTURE_2D, a.texture);
      gl.bindVertexArray(a.vao);
      gl.drawArrays(gl.TRIANGLES, 0, a.count);
    }
  }
}
