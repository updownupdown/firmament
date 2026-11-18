// Surface maps of the Sun, the planets and the Moon (Solar System Scope, CC BY
// 4.0; see data/ATTRIBUTION.md). Each is fetched the first time its body is
// drawn big enough to show it, and the shaders keep their painted look until
// it arrives. Maps are equirectangular, longitude 0 in the middle, north up.

import { type Program, loadTexture } from './gl.ts';

const MAPPED = new Set(['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune']);

/** Saturn's ring strip spans these radii (Saturn equatorial radii), inner to outer. */
export const RING_INNER = 1.166;
export const RING_OUTER = 2.330;

export class SurfaceMaps {
  private readonly gl: WebGL2RenderingContext;
  private readonly base: string;
  private readonly maps = new Map<string, { tex: WebGLTexture; ready: boolean }>();
  /** Called when a map has arrived, to redraw. */
  onLoad: () => void = () => {};

  constructor(gl: WebGL2RenderingContext, base = 'data/textures/') {
    this.gl = gl;
    this.base = base;
  }

  /** Does this body have a map at all? */
  has(id: string): boolean {
    return MAPPED.has(id);
  }

  /** The map for a body, starting the download on first ask; null until it has arrived. */
  get(id: string): WebGLTexture | null {
    if (!MAPPED.has(id)) return null;
    return this.load(id, `${id}.jpg`, 'rgb');
  }

  /** Saturn's rings: colour and opacity from the inner to the outer edge. */
  rings(): WebGLTexture | null {
    return this.load('saturn-rings', 'saturn-rings.png', 'rgba');
  }

  private load(key: string, file: string, channels: 'rgb' | 'rgba'): WebGLTexture | null {
    let entry = this.maps.get(key);
    if (!entry) {
      const e = { tex: null as unknown as WebGLTexture, ready: false };
      e.tex = loadTexture(this.gl, this.base + file, () => {
        e.ready = true;
        this.onLoad();
      }, channels);
      entry = e;
      this.maps.set(key, entry);
    }
    return entry.ready ? entry.tex : null;
  }
}

/** Bind a body's surface map (unit 2) and Saturn's rings (unit 3), once it is big enough to show them. */
export function bindSurfaceMaps(gl: WebGL2RenderingContext, maps: SurfaceMaps, p: Program, id: string, radiusDevPx: number): void {
  const map = radiusDevPx > 4 ? maps.get(id) : null;
  const rings = id === 'saturn' && radiusDevPx > 3 ? maps.rings() : null;
  gl.activeTexture(gl.TEXTURE2);
  gl.bindTexture(gl.TEXTURE_2D, map);
  gl.activeTexture(gl.TEXTURE3);
  gl.bindTexture(gl.TEXTURE_2D, rings);
  gl.activeTexture(gl.TEXTURE0);
  p.i('uMap', 2).i('uRings', 3).f('uMapped', map ? 1 : 0).f('uRingMapped', rings ? 1 : 0);
}
