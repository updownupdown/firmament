// Celestial navigation: every star stands straight overhead somewhere on the
// Earth (its ground point). Seen at altitude h, it is 90° − h away from that
// point, so the observer is somewhere on a circle around it. Two stars give two
// circles, and they cross where the observer is. Angles are radians.

import { type Vec3, cross, dot, fromSpherical, normalize, toSpherical, wrapPi } from '../astro/math.ts';

export interface GeoPoint {
  /** Latitude and longitude (east positive), radians. */
  lat: number;
  lon: number;
}

const toVec = (p: GeoPoint): Vec3 => fromSpherical(p.lon, p.lat);
const toGeo = (v: Vec3): GeoPoint => {
  const [lon, lat] = toSpherical(v);
  return { lat, lon: wrapPi(lon) };
};

/** Where a star of right ascension `ra` and declination `dec` (of date) is overhead, at sidereal time `gast` (Greenwich). */
export function groundPoint(ra: number, dec: number, gast: number): GeoPoint {
  return { lat: dec, lon: wrapPi(ra - gast) };
}

/** The angle between two places, seen from the centre of the Earth. */
export function geoDistance(a: GeoPoint, b: GeoPoint): number {
  return Math.acos(Math.max(-1, Math.min(1, dot(toVec(a), toVec(b)))));
}

/** Points on the circle of places `radius` away from `centre`. */
export function circleOfPosition(centre: GeoPoint, radius: number, n = 180): GeoPoint[] {
  const c = toVec(centre);
  // Any direction not parallel to the centre gives a first axis in the circle's plane.
  const e1 = normalize(cross(c, Math.abs(c[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]));
  const e2 = cross(c, e1);
  const out: GeoPoint[] = [];
  for (let k = 0; k <= n; k++) {
    const t = (2 * Math.PI * k) / n;
    const v: Vec3 = [0, 1, 2].map((i) =>
      c[i] * Math.cos(radius) + Math.sin(radius) * (e1[i] * Math.cos(t) + e2[i] * Math.sin(t))) as Vec3;
    out.push(toGeo(v));
  }
  return out;
}

/**
 * Where two circles of position cross: both points, nearest to `near` first
 * (a navigator always knows roughly where they are, so the far one is
 * thrown away). Null if the circles miss each other.
 */
export function fixFromTwo(gp1: GeoPoint, r1: number, gp2: GeoPoint, r2: number, near: GeoPoint): GeoPoint[] | null {
  const g1 = toVec(gp1), g2 = toVec(gp2);
  const c = dot(g1, g2);
  const s2 = 1 - c * c;
  if (s2 < 1e-12) return null;
  const a = (Math.cos(r1) - Math.cos(r2) * c) / s2;
  const b = (Math.cos(r2) - Math.cos(r1) * c) / s2;
  const x0: Vec3 = [a * g1[0] + b * g2[0], a * g1[1] + b * g2[1], a * g1[2] + b * g2[2]];
  const n = cross(g1, g2);
  const t2 = (1 - dot(x0, x0)) / dot(n, n);
  if (t2 < 0) return null;
  const t = Math.sqrt(t2);
  const p1 = toGeo([x0[0] + n[0] * t, x0[1] + n[1] * t, x0[2] + n[2] * t]);
  const p2 = toGeo([x0[0] - n[0] * t, x0[1] - n[1] * t, x0[2] - n[2] * t]);
  return geoDistance(p1, near) <= geoDistance(p2, near) ? [p1, p2] : [p2, p1];
}

/** Nautical miles in an angle on the Earth: one minute of arc each. */
export function nauticalMiles(angle: number): number {
  return (angle * 180 / Math.PI) * 60;
}

