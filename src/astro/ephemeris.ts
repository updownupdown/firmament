// Positions of solar system bodies, and their apparent places as seen from a
// point on Earth.

import {
  AU_KM, C_AU_PER_DAY, DEG, type Mat3, type Vec3,
  add, angleBetween, apply, dot, mulAll, norm, normalize, rotZ, scale, sub, transpose, fromSpherical,
} from './math.ts';
import {
  type Nutation, equatorToHorizonMatrix, gast, nutation, nutationMatrix, observerGeocentric, precessionMatrix,
} from './frames.ts';
import { Elp } from './moon.ts';
import { Vsop87, type PlanetName } from './vsop87.ts';
import { BODIES, type SolarBodyId, illuminatedFraction, visualMagnitude } from './bodies.ts';
import { plutoPosition, SMALL_BODIES, type SmallBody, stateFromElements } from './kepler.ts';
import { ttFromUt } from './time.ts';

export const SOLAR_BODIES: SolarBodyId[] = [
  'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune', 'pluto',
];

export class Ephemeris {
  readonly vsop: Vsop87;
  readonly elp: Elp;
  constructor(vsop: Vsop87, elp: Elp) {
    this.vsop = vsop;
    this.elp = elp;
  }

  /** Heliocentric J2000 equatorial position (AU) of any solar system body. */
  helio(id: SolarBodyId | string, jdTT: number): Vec3 {
    switch (id) {
      case 'sun': return [0, 0, 0];
      case 'moon': return add(this.vsop.position('earth', jdTT), scale(this.elp.position(jdTT), 1 / AU_KM));
      case 'pluto': return plutoPosition(jdTT);
      default: {
        if ((BODIES as Record<string, unknown>)[id]) return this.vsop.position(id as PlanetName, jdTT);
        const sb = SMALL_BODIES.find((b) => b.id === id);
        if (sb) return stateFromElements(sb.elements, jdTT).r;
        throw new Error(`unknown body ${id}`);
      }
    }
  }

  earth(jdTT: number): Vec3 {
    return this.vsop.position('earth', jdTT);
  }

  earthVelocity(jdTT: number): Vec3 {
    return this.vsop.velocity('earth', jdTT);
  }

  /** Geocentric Moon, J2000 equatorial, AU. */
  moonGeo(jdTT: number): Vec3 {
    return scale(this.elp.position(jdTT), 1 / AU_KM);
  }
}

// ------------------------------------------------------------------ observing

export interface EarthSite {
  lat: number; // radians, north positive
  lon: number; // radians, east positive
  height: number; // metres
}

/** Everything about the observer's frame at one instant. */
export interface Frame {
  jdUT: number;
  jdTT: number;
  nut: Nutation;
  /** J2000 → true equator and equinox of date. */
  j2000ToDate: Mat3;
  gast: number;
  last: number;
  /** True equator of date → horizon (x south, y east, z up). */
  dateToHorizon: Mat3;
  /** J2000 → horizon, the matrix the renderer uses for the whole sky. */
  j2000ToHorizon: Mat3;
  /** Earth's heliocentric position and velocity (J2000, AU, AU/day). */
  earth: Vec3;
  earthVel: Vec3;
  /** Observer's geocentric position, J2000 frame, AU. */
  observerGeo: Vec3;
  site: EarthSite;
}

export function makeFrame(eph: Ephemeris, jdUT: number, site: EarthSite): Frame {
  const jdTT = ttFromUt(jdUT);
  const nut = nutation(jdTT);
  const j2000ToDate = mulAll(nutationMatrix(nut), precessionMatrix(jdTT));
  const g = gast(jdUT, jdTT, nut);
  const last = g + site.lon;
  const dateToHorizon = equatorToHorizonMatrix(last, site.lat);
  const j2000ToHorizon = mulAll(dateToHorizon, j2000ToDate);
  // Observer: terrestrial → true of date is R3(−GAST); then back to J2000.
  const obsTerr = observerGeocentric(site.lat, site.lon, site.height);
  const obsDate = apply(rotZ(-g), obsTerr);
  const observerGeo = scale(apply(transpose(j2000ToDate), obsDate), 1 / AU_KM);
  return {
    jdUT, jdTT, nut, j2000ToDate, gast: g, last, dateToHorizon, j2000ToHorizon,
    earth: eph.earth(jdTT), earthVel: eph.earthVelocity(jdTT), observerGeo, site,
  };
}

/** Apply annual aberration to a unit direction (J2000) given Earth's velocity. */
export function aberrate(u: Vec3, earthVel: Vec3): Vec3 {
  const b = scale(earthVel, 1 / C_AU_PER_DAY);
  const d = dot(u, b);
  return normalize(add(sub(u, scale(u, d)), b));
}

export interface ApparentBody {
  id: SolarBodyId | string;
  /** Apparent direction from the observer, J2000 frame (unit vector, aberration included). */
  dir: Vec3;
  /** Distance from the observer (AU, light-time corrected). */
  dist: number;
  /** Distance from the Sun (AU). */
  r: number;
  /** Heliocentric position at the light-time-corrected instant (AU, J2000). */
  helio: Vec3;
  /** Sun–body–observer angle (radians). */
  phase: number;
  /** Fraction of the disk lit. */
  illum: number;
  mag: number;
  /** Angular radius (radians). */
  radius: number;
  /** Direction from the body toward the Sun (J2000 unit vector), for shading. */
  sunDir: Vec3;
  /** Saturn's ring tilt toward the observer (radians), else 0. */
  ringTilt: number;
}

const SATURN_POLE = fromSpherical(BODIES.saturn.poleRa, BODIES.saturn.poleDec);

/** Apparent place of a solar system body as seen from the observer in `f`. */
export function observeBody(eph: Ephemeris, f: Frame, id: SolarBodyId | string): ApparentBody {
  const obsHelio = add(f.earth, f.observerGeo);
  let tau = 0;
  let helio: Vec3 = [0, 0, 0];
  let g: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    if (id === 'moon') {
      // Geocentric theory: subtract the observer. Light-time is ~1.3 s, so the
      // Earth's position at the frame instant is close enough for the heliocentric part.
      const mg = eph.moonGeo(f.jdTT - tau);
      g = sub(mg, f.observerGeo);
      helio = add(f.earth, mg);
    } else {
      helio = eph.helio(id, f.jdTT - tau);
      g = sub(helio, obsHelio);
    }
    tau = norm(g) / C_AU_PER_DAY;
  }
  const dist = norm(g);
  let dir = scale(g, 1 / dist);
  if (id !== 'moon') dir = aberrate(dir, f.earthVel);
  const r = norm(helio);
  const toSun = id === 'sun' ? scale(dir, -1) : normalize(scale(helio, -1));
  const toObs = scale(normalize(g), -1);
  const phase = id === 'sun' ? 0 : angleBetween(toSun, toObs);
  const info = (BODIES as Record<string, { radiusEq: number } | undefined>)[id];
  let radiusKm = info?.radiusEq;
  let mag: number;
  let ringTilt = 0;
  if (id === 'saturn') ringTilt = Math.asin(dot(toObs, SATURN_POLE));
  if (info) {
    mag = visualMagnitude(id as SolarBodyId, Math.max(r, 1e-9), dist, phase, ringTilt);
  } else {
    const sb = SMALL_BODIES.find((b) => b.id === id) as SmallBody;
    radiusKm = sb.radiusKm;
    mag = sb.kind === 'comet'
      ? sb.H + 5 * Math.log10(dist) + (sb.K ?? 10) * Math.log10(r)
      : sb.H + 5 * Math.log10(r * dist);
  }
  const radius = Math.asin(Math.min(1, (radiusKm ?? 1) / (dist * AU_KM)));
  return { id, dir, dist, r, helio, phase, illum: illuminatedFraction(phase), mag, radius, sunDir: toSun, ringTilt };
}

/** Altitude and azimuth (radians, geometric, no refraction) of a J2000 direction. */
export function horizonVector(f: Frame, dirJ2000: Vec3): Vec3 {
  return apply(f.j2000ToHorizon, dirJ2000);
}

export function altitudeOf(f: Frame, dirJ2000: Vec3): number {
  const h = horizonVector(f, dirJ2000);
  return Math.asin(Math.max(-1, Math.min(1, h[2])));
}

/** Right ascension and declination of date (apparent) from a J2000 direction. */
export function raDecOfDate(f: Frame, dirJ2000: Vec3): [number, number] {
  const v = apply(f.j2000ToDate, dirJ2000);
  const ra = Math.atan2(v[1], v[0]);
  return [ra < 0 ? ra + 2 * Math.PI : ra, Math.asin(Math.max(-1, Math.min(1, v[2])))];
}

/** Elongation of a body from the Sun as seen by the observer. */
export function elongation(a: ApparentBody, sun: ApparentBody): number {
  return angleBetween(a.dir, sun.dir);
}

export const KM_PER_AU = AU_KM;
export const SUN_RADIUS_RAD_AT_1AU = Math.asin(BODIES.sun.radius / AU_KM);
export { DEG };
