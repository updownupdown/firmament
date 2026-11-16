// Reference frames: precession, nutation, obliquity, sidereal time and the
// rotations between the J2000 equatorial frame (our working frame), the
// equator and equinox of date, ecliptic, galactic and local horizon frames.

import {
  ARCSEC, DEG, TAU, type Mat3, type Vec3,
  apply, clamp, mulAll, poly, rotX, rotY, rotZ, slerpMat, smoothstep, wrap2pi, toSpherical,
} from './math.ts';
import { J2000, centuries } from './time.ts';

/** Obliquity of the J2000 ecliptic used by VSOP87 and ELP (Meeus/Bretagnon). */
export const EPS_J2000 = 84381.448 * ARCSEC;

/** J2000 equatorial → J2000 ecliptic. */
export const EQ_TO_ECL_J2000: Mat3 = rotX(EPS_J2000);
export const ECL_TO_EQ_J2000: Mat3 = rotX(-EPS_J2000);

/** J2000 equatorial → galactic (IAU 1958 system expressed in J2000). */
export const EQ_TO_GAL: Mat3 = [
  -0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762,
];

// ------------------------------------------------------------------ obliquity

/** IAU 2006 mean obliquity (radians), T in Julian centuries TT. */
function obliquityIAU(T: number): number {
  return poly(T, [84381.406, -46.836769, -0.0001831, 0.0020034, -0.000000576, -0.0000000434]) * ARCSEC;
}

/** Laskar (1986) mean obliquity, valid for ±10,000 years. */
function obliquityLaskar(T: number): number {
  const U = T / 100;
  return (23 * 3600 + 26 * 60 + 21.448 + poly(U, [
    0, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45,
  ])) * ARCSEC;
}

/** A 41,000-year cycle between 22.1° and 24.5°: qualitative only, for deep time. */
function obliquityCycle(T: number): number {
  const y = 2000 + T * 100;
  return (23.3 + 1.2 * Math.cos(TAU * (y + 8700) / 41040)) * DEG;
}

/** Mean obliquity of the ecliptic of date, usable from −100,000 to +100,000 years. */
export function meanObliquity(jdTT: number): number {
  const T = centuries(jdTT);
  const a = Math.abs(T);
  if (a <= 30) return obliquityIAU(T);
  if (a <= 50) return obliquityIAU(T) + (obliquityLaskar(T) - obliquityIAU(T)) * smoothstep(30, 50, a);
  if (a <= 90) return obliquityLaskar(T);
  if (a <= 100) return obliquityLaskar(T) + (obliquityCycle(T) - obliquityLaskar(T)) * smoothstep(90, 100, a);
  return obliquityCycle(T);
}

// ------------------------------------------------------------------ precession

/** IAU 2006 (P03) precession angles, accurate near the present. */
function precessionIAU(T: number): Mat3 {
  const zetaA = poly(T, [2.650545, 2306.083227, 0.2988499, 0.01801828, -0.000005971, -0.0000003173]) * ARCSEC;
  const zA = poly(T, [-2.650545, 2306.077181, 1.0927348, 0.01826837, -0.000028596, -0.0000002904]) * ARCSEC;
  const thetaA = poly(T, [0, 2004.191903, -0.4294934, -0.04182264, -0.000007089, -0.0000001274]) * ARCSEC;
  return mulAll(rotZ(-zA), rotY(thetaA), rotZ(-zetaA));
}

/**
 * Long-term model: the equator precesses uniformly about the J2000 ecliptic pole
 * at the present rate, with a varying obliquity. Ignores the slow motion of the
 * ecliptic itself, so it is qualitative (good to about a degree over 10,000 years).
 */
function precessionLong(T: number, jdTT: number): Mat3 {
  const psi = 5028.796195 * T * ARCSEC;
  return mulAll(rotX(-meanObliquity(jdTT)), rotZ(-psi), rotX(EPS_J2000));
}

const BLEND_START = 40; // centuries from J2000
const BLEND_END = 60;

/** Rotation from the J2000 mean equator and equinox to the mean equator and equinox of date. */
export function precessionMatrix(jdTT: number): Mat3 {
  const T = centuries(jdTT);
  const a = Math.abs(T);
  if (a <= BLEND_START) return precessionIAU(T);
  if (a >= BLEND_END) return precessionLong(T, jdTT);
  return slerpMat(precessionIAU(T), precessionLong(T, jdTT), smoothstep(BLEND_START, BLEND_END, a));
}

/** Rough accuracy of the precession model at this date, in degrees. */
export function precessionAccuracyDeg(jdTT: number): number {
  const a = Math.abs(centuries(jdTT));
  if (a <= 20) return 0.0003;
  if (a <= BLEND_START) return 0.01;
  if (a <= 100) return 0.3 + (a - BLEND_START) * 0.01;
  return 2;
}

// ------------------------------------------------------------------ nutation

// IAU 1980 nutation, largest terms (Meeus table 22.A).
// Multipliers of D, M, M', F, Ω; Δψ = (a + b T) sin(arg); Δε = (c + d T) cos(arg); units 0.0001″.
const NUT: number[][] = [
  [0, 0, 0, 0, 1, -171996, -174.2, 92025, 8.9],
  [-2, 0, 0, 2, 2, -13187, -1.6, 5736, -3.1],
  [0, 0, 0, 2, 2, -2274, -0.2, 977, -0.5],
  [0, 0, 0, 0, 2, 2062, 0.2, -895, 0.5],
  [0, 1, 0, 0, 0, 1426, -3.4, 54, -0.1],
  [0, 0, 1, 0, 0, 712, 0.1, -7, 0],
  [-2, 1, 0, 2, 2, -517, 1.2, 224, -0.6],
  [0, 0, 0, 2, 1, -386, -0.4, 200, 0],
  [0, 0, 1, 2, 2, -301, 0, 129, -0.1],
  [-2, -1, 0, 2, 2, 217, -0.5, -95, 0.3],
  [-2, 0, 1, 0, 0, -158, 0, 0, 0],
  [-2, 0, 0, 2, 1, 129, 0.1, -70, 0],
  [0, 0, -1, 2, 2, 123, 0, -53, 0],
  [2, 0, 0, 0, 0, 63, 0, 0, 0],
  [0, 0, 1, 0, 1, 63, 0.1, -33, 0],
  [2, 0, -1, 2, 2, -59, 0, 26, 0],
  [0, 0, -1, 0, 1, -58, -0.1, 32, 0],
  [0, 0, 1, 2, 1, -51, 0, 27, 0],
  [-2, 0, 2, 0, 0, 48, 0, 0, 0],
  [0, 0, -2, 2, 1, 46, 0, -24, 0],
  [2, 0, 0, 2, 2, -38, 0, 16, 0],
  [0, 0, 2, 2, 2, -31, 0, 13, 0],
  [0, 0, 2, 0, 0, 29, 0, 0, 0],
  [-2, 0, 1, 2, 2, 29, 0, -12, 0],
  [0, 0, 0, 2, 0, 26, 0, 0, 0],
  [-2, 0, 0, 2, 0, -22, 0, 0, 0],
  [0, 0, -1, 2, 1, 21, 0, -10, 0],
  [0, 2, 0, 0, 0, 17, -0.1, 0, 0],
  [2, 0, -1, 0, 1, 16, 0, -8, 0],
  [-2, 2, 0, 2, 2, -16, 0.1, 7, 0],
  [0, 1, 0, 0, 1, -15, 0, 9, 0],
];

export interface Nutation {
  dpsi: number; // nutation in longitude (rad)
  deps: number; // nutation in obliquity (rad)
  epsMean: number;
  epsTrue: number;
}

export function nutation(jdTT: number): Nutation {
  const T = centuries(jdTT);
  const epsMean = meanObliquity(jdTT);
  // Beyond a few millennia the fundamental arguments are meaningless; nutation is
  // an 18.6-year wobble of ~17″, so leave it out rather than invent it.
  if (Math.abs(T) > 60) return { dpsi: 0, deps: 0, epsMean, epsTrue: epsMean };
  const D = poly(T, [297.85036, 445267.11148, -0.0019142, 1 / 189474]) * DEG;
  const M = poly(T, [357.52772, 35999.05034, -0.0001603, -1 / 300000]) * DEG;
  const Mp = poly(T, [134.96298, 477198.867398, 0.0086972, 1 / 56250]) * DEG;
  const F = poly(T, [93.27191, 483202.017538, -0.0036825, 1 / 327270]) * DEG;
  const Om = poly(T, [125.04452, -1934.136261, 0.0020708, 1 / 450000]) * DEG;
  let dpsi = 0, deps = 0;
  for (const r of NUT) {
    const arg = r[0] * D + r[1] * M + r[2] * Mp + r[3] * F + r[4] * Om;
    dpsi += (r[5] + r[6] * T) * Math.sin(arg);
    deps += (r[7] + r[8] * T) * Math.cos(arg);
  }
  dpsi *= 0.0001 * ARCSEC;
  deps *= 0.0001 * ARCSEC;
  return { dpsi, deps, epsMean, epsTrue: epsMean + deps };
}

/** Mean equator of date → true equator of date. */
export function nutationMatrix(n: Nutation): Mat3 {
  return mulAll(rotX(-n.epsTrue), rotZ(-n.dpsi), rotX(n.epsMean));
}

// ------------------------------------------------------------------ Earth rotation

/** Earth rotation angle (IAU 2000), radians. */
export function earthRotationAngle(jdUT: number): number {
  const du = jdUT - J2000;
  return wrap2pi(TAU * (0.779057273264 + 0.00273781191135448 * du + (du % 1)));
}

/** Greenwich mean sidereal time (IAU 2006), radians. */
export function gmst(jdUT: number, jdTT: number): number {
  const T = centuries(jdTT);
  const extra = poly(T, [0.014506, 4612.156534, 1.3915817, -0.00000044, -0.000029956, -0.0000000368]) * ARCSEC;
  return wrap2pi(earthRotationAngle(jdUT) + extra);
}

/** Greenwich apparent sidereal time, radians. */
export function gast(jdUT: number, jdTT: number, n: Nutation = nutation(jdTT)): number {
  return wrap2pi(gmst(jdUT, jdTT) + n.dpsi * Math.cos(n.epsTrue));
}

// ------------------------------------------------------------------ horizon

/**
 * True equator of date → local horizon frame (x = south, y = east, z = up).
 * `last` is local apparent sidereal time, `lat` geodetic latitude.
 */
export function equatorToHorizonMatrix(last: number, lat: number): Mat3 {
  return mulAll(rotY(Math.PI / 2 - lat), rotZ(last));
}

/** Azimuth (from north through east) and altitude from a horizon-frame vector. */
export function azAlt(h: Vec3): [number, number] {
  const r = Math.hypot(h[0], h[1], h[2]);
  return [wrap2pi(Math.atan2(h[1], -h[0])), Math.asin(clamp(h[2] / r, -1, 1))];
}

/** Horizon-frame unit vector from azimuth (from north through east) and altitude. */
export function fromAzAlt(az: number, alt: number): Vec3 {
  const c = Math.cos(alt);
  return [-c * Math.cos(az), c * Math.sin(az), Math.sin(alt)];
}

/** Ecliptic longitude and latitude of date from a J2000 equatorial vector. */
export function eclipticOfDate(vJ2000: Vec3, jdTT: number, n: Nutation = nutation(jdTT)): [number, number] {
  const m = mulAll(rotX(n.epsTrue), nutationMatrix(n), precessionMatrix(jdTT));
  const [lon, lat] = toSpherical(apply(m, vJ2000));
  return [lon, lat];
}

// ------------------------------------------------------------------ refraction

/**
 * Atmospheric refraction (Sæmundsson): how much an object at true altitude `h`
 * is lifted, in radians. Pressure in hPa, temperature in °C.
 */
export function refractionFromTrue(h: number, pressure = 1010, tempC = 10): number {
  const hd = Math.max(h / DEG, -1.9);
  const r = 1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG); // arcminutes
  return Math.max(r, 0) * (pressure / 1010) * (283 / (273 + tempC)) / 60 * DEG;
}

/** Refraction for an apparent altitude (Bennett), radians. */
export function refractionFromApparent(h: number, pressure = 1010, tempC = 10): number {
  const hd = Math.max(h / DEG, -1.5);
  const r = 1 / Math.tan((hd + 7.31 / (hd + 4.4)) * DEG); // arcminutes
  return Math.max(r, 0) * (pressure / 1010) * (283 / (273 + tempC)) / 60 * DEG;
}

// ------------------------------------------------------------------ observer

const WGS84_A = 6378.137; // km
const WGS84_F = 1 / 298.257223563;

/**
 * Observer's geocentric position (km) in the frame rotating with the Earth,
 * i.e. x toward the Greenwich meridian, z toward the north pole.
 */
export function observerGeocentric(lat: number, lon: number, heightM = 0): Vec3 {
  const e2 = WGS84_F * (2 - WGS84_F);
  const s = Math.sin(lat), c = Math.cos(lat);
  const N = WGS84_A / Math.sqrt(1 - e2 * s * s);
  const h = heightM / 1000;
  return [(N + h) * c * Math.cos(lon), (N + h) * c * Math.sin(lon), (N * (1 - e2) + h) * s];
}
