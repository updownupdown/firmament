// Small vector and matrix helpers. Vectors are [x, y, z] tuples; matrices are
// row-major 9-element arrays. Everything is double precision.

export type Vec3 = [number, number, number];
export type Mat3 = number[];

export const PI = Math.PI;
export const TAU = 2 * Math.PI;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const ARCSEC = Math.PI / (180 * 3600);
export const AU_KM = 149597870.7;
export const PC_AU = 206264.80624709636;
export const C_AU_PER_DAY = 173.1446326742403;
export const LY_PC = 0.30660139378555057;

export function wrap2pi(a: number): number {
  a %= TAU;
  return a < 0 ? a + TAU : a;
}

export function wrapPi(a: number): number {
  a = wrap2pi(a);
  return a > PI ? a - TAU : a;
}

export function wrap360(a: number): number {
  a %= 360;
  return a < 0 ? a + 360 : a;
}

export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Evaluate c[0] + c[1] x + c[2] x² + ... */
export function poly(x: number, c: readonly number[]): number {
  let y = 0;
  for (let i = c.length - 1; i >= 0; i--) y = y * x + c[i];
  return y;
}

export function v3(x = 0, y = 0, z = 0): Vec3 {
  return [x, y, z];
}

export function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

export function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

export function norm(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

export function normalize(a: Vec3): Vec3 {
  const n = norm(a);
  return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}

/** Angle between two vectors (robust for small angles). */
export function angleBetween(a: Vec3, b: Vec3): number {
  return Math.atan2(norm(cross(a, b)), dot(a, b));
}

/** Spherical (longitude, latitude) in radians to a unit vector. */
export function fromSpherical(lon: number, lat: number, r = 1): Vec3 {
  const c = Math.cos(lat);
  return [r * c * Math.cos(lon), r * c * Math.sin(lon), r * Math.sin(lat)];
}

/** Unit or non-unit vector to [lon (0..2π), lat, r]. */
export function toSpherical(v: Vec3): [number, number, number] {
  const r = norm(v);
  if (r === 0) return [0, 0, 0];
  return [wrap2pi(Math.atan2(v[1], v[0])), Math.asin(clamp(v[2] / r, -1, 1)), r];
}

export function identity(): Mat3 {
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

/** Rotation of the coordinate frame about X by angle a (passive, as in IERS conventions). */
export function rotX(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [1, 0, 0, 0, c, s, 0, -s, c];
}

export function rotY(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, 0, -s, 0, 1, 0, s, 0, c];
}

export function rotZ(a: number): Mat3 {
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, 0, -s, c, 0, 0, 0, 1];
}

export function mul(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

/** Multiply any number of matrices left to right: mulAll(A, B, C) = A·B·C. */
export function mulAll(...ms: Mat3[]): Mat3 {
  return ms.reduce((acc, m) => mul(acc, m));
}

export function transpose(m: Mat3): Mat3 {
  return [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
}

export function apply(m: Mat3, v: Vec3): Vec3 {
  return [
    m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
    m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
    m[6] * v[0] + m[7] * v[1] + m[8] * v[2],
  ];
}

/** Quaternion [w, x, y, z] from a rotation matrix (used to interpolate rotations). */
export function matToQuat(m: Mat3): [number, number, number, number] {
  const tr = m[0] + m[4] + m[8];
  let w: number, x: number, y: number, z: number;
  if (tr > 0) {
    const s = Math.sqrt(tr + 1) * 2;
    w = 0.25 * s; x = (m[7] - m[5]) / s; y = (m[2] - m[6]) / s; z = (m[3] - m[1]) / s;
  } else if (m[0] > m[4] && m[0] > m[8]) {
    const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2;
    w = (m[7] - m[5]) / s; x = 0.25 * s; y = (m[1] + m[3]) / s; z = (m[2] + m[6]) / s;
  } else if (m[4] > m[8]) {
    const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2;
    w = (m[2] - m[6]) / s; x = (m[1] + m[3]) / s; y = 0.25 * s; z = (m[5] + m[7]) / s;
  } else {
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2;
    w = (m[3] - m[1]) / s; x = (m[2] + m[6]) / s; y = (m[5] + m[7]) / s; z = 0.25 * s;
  }
  return [w, x, y, z];
}

export function quatToMat(q: [number, number, number, number]): Mat3 {
  const [w, x, y, z] = q;
  return [
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y),
  ];
}

export function slerpMat(a: Mat3, b: Mat3, t: number): Mat3 {
  const qa = matToQuat(a);
  let qb = matToQuat(b);
  let d = qa[0] * qb[0] + qa[1] * qb[1] + qa[2] * qb[2] + qa[3] * qb[3];
  if (d < 0) { qb = [-qb[0], -qb[1], -qb[2], -qb[3]]; d = -d; }
  let s0: number, s1: number;
  if (d > 0.9995) { s0 = 1 - t; s1 = t; } else {
    const th = Math.acos(d), sn = Math.sin(th);
    s0 = Math.sin((1 - t) * th) / sn; s1 = Math.sin(t * th) / sn;
  }
  const q: [number, number, number, number] = [
    s0 * qa[0] + s1 * qb[0], s0 * qa[1] + s1 * qb[1], s0 * qa[2] + s1 * qb[2], s0 * qa[3] + s1 * qb[3],
  ];
  const n = Math.hypot(...q);
  return quatToMat([q[0] / n, q[1] / n, q[2] / n, q[3] / n]);
}
