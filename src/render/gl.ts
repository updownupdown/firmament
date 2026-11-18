// Small WebGL2 helpers: programs with cached uniform locations, and buffers.

import type { Mat3 } from '../astro/math.ts';

export class Program {
  readonly gl: WebGL2RenderingContext;
  readonly handle: WebGLProgram;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();

  constructor(gl: WebGL2RenderingContext, vertex: string, fragment: string, attributes: string[] = []) {
    this.gl = gl;
    const program = gl.createProgram()!;
    const shaders = [
      compile(gl, gl.VERTEX_SHADER, vertex),
      compile(gl, gl.FRAGMENT_SHADER, fragment),
    ];
    for (const s of shaders) gl.attachShader(program, s);
    // Fixed attribute slots, so one vertex array layout works across programs.
    attributes.forEach((name, i) => gl.bindAttribLocation(program, i, name));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Shader link failed: ${gl.getProgramInfoLog(program)}`);
    }
    for (const s of shaders) gl.deleteShader(s);
    this.handle = program;
  }

  use(): this {
    this.gl.useProgram(this.handle);
    return this;
  }

  loc(name: string): WebGLUniformLocation | null {
    let l = this.uniforms.get(name);
    if (l === undefined) {
      l = this.gl.getUniformLocation(this.handle, name);
      this.uniforms.set(name, l);
    }
    return l;
  }

  f(name: string, x: number): this { this.gl.uniform1f(this.loc(name), x); return this; }
  i(name: string, x: number): this { this.gl.uniform1i(this.loc(name), x); return this; }
  v2(name: string, x: number, y: number): this { this.gl.uniform2f(this.loc(name), x, y); return this; }
  v3(name: string, v: ArrayLike<number>): this { this.gl.uniform3f(this.loc(name), v[0], v[1], v[2]); return this; }
  v4(name: string, x: number, y: number, z: number, w: number): this { this.gl.uniform4f(this.loc(name), x, y, z, w); return this; }

  /** Upload a row-major 3×3 matrix (GLSL stores columns, so transpose on the way in). */
  m3(name: string, m: Mat3): this {
    this.gl.uniformMatrix3fv(this.loc(name), false, [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
    return this;
  }
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader) ?? '';
    const lines = source.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n');
    throw new Error(`Shader compile failed: ${log}\n${lines}`);
  }
  return shader;
}

export interface AttributeSpec {
  /** Attribute slot (matches the order given to Program). */
  index: number;
  size: number;
  /** Offset in floats within one record. */
  offset: number;
}

/** A vertex array over one interleaved float buffer. */
export class Mesh {
  readonly gl: WebGL2RenderingContext;
  readonly vao: WebGLVertexArrayObject;
  readonly buffer: WebGLBuffer;
  /** Number of records currently uploaded. */
  count = 0;
  private readonly stride: number;

  /**
   * `stride` is floats per record. With `instanced`, each record is one instance
   * of a unit quad (4 vertices, attribute slot `quadSlot`) drawn as a triangle strip.
   */
  constructor(gl: WebGL2RenderingContext, stride: number, attributes: AttributeSpec[], instanced?: { quadSlot: number }) {
    this.gl = gl;
    this.stride = stride;
    this.vao = gl.createVertexArray()!;
    this.buffer = gl.createBuffer()!;
    gl.bindVertexArray(this.vao);
    if (instanced) {
      const quad = gl.createBuffer()!;
      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(instanced.quadSlot);
      gl.vertexAttribPointer(instanced.quadSlot, 2, gl.FLOAT, false, 0, 0);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const a of attributes) {
      gl.enableVertexAttribArray(a.index);
      gl.vertexAttribPointer(a.index, a.size, gl.FLOAT, false, stride * 4, a.offset * 4);
      if (instanced) gl.vertexAttribDivisor(a.index, 1);
    }
    gl.bindVertexArray(null);
  }

  set(data: Float32Array, usage: number = this.gl.STATIC_DRAW): void {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, usage);
    this.count = data.length / this.stride;
  }

  /** Free the GPU memory. The mesh cannot be drawn afterwards. */
  dispose(): void {
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteVertexArray(this.vao);
    this.count = 0;
  }

  drawPoints(count = this.count): void {
    if (count <= 0) return;
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.POINTS, 0, count);
  }

  drawLineStrip(count = this.count): void {
    if (count <= 1) return;
    this.gl.bindVertexArray(this.vao);
    this.gl.drawArrays(this.gl.LINE_STRIP, 0, count);
  }

  drawQuads(count = this.count, first = 0): void {
    if (count <= 0) return;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    if (first) {
      // Instanced draws always start at instance 0, so shift the attribute pointers instead.
      throw new Error('drawQuads: use a separate mesh for sub-ranges');
    }
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
  }
}

/** Load an image into a mipmapped texture: one channel by default, or colour (`rgb`, `rgba`). */
export function loadTexture(gl: WebGL2RenderingContext, url: string, onLoad?: (img: HTMLImageElement) => void, channels: 'red' | 'rgb' | 'rgba' = 'red'): WebGLTexture {
  const tex = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  // One dark pixel until the image arrives.
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
  const img = new Image();
  img.onload = () => {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (channels === 'rgb') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB8, gl.RGB, gl.UNSIGNED_BYTE, img);
    else if (channels === 'rgba') gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, gl.RED, gl.UNSIGNED_BYTE, img);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    onLoad?.(img);
  };
  img.src = url;
  return tex;
}
