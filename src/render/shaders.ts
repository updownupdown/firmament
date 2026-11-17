// GLSL for the sky view. Every vertex shader shares one projection chunk that
// mirrors projection.ts: refraction in the horizon frame, then a stereographic
// projection in the camera frame.

const HEADER = `#version 300 es
precision highp float;
const float DEG = 0.017453292519943295;
const float PI = 3.141592653589793;
`;

/** Refraction, the horizon→camera view and the stereographic projection. */
const PROJECT = `
uniform mat3 uView;      // horizon -> camera
uniform vec2 uScale;     // NDC per unit of the stereographic plane
uniform float uRefract;  // 1 when the atmosphere bends light

float skyRefraction(float alt) {
  float d = alt / DEG;
  float hd = max(d, -1.9);
  float arcmin = max(0.0, 1.02 / tan((hd + 10.3 / (hd + 5.11)) * DEG));
  float t = clamp((d + 8.0) / 6.1, 0.0, 1.0);
  return arcmin / 60.0 * DEG * t * t * (3.0 - 2.0 * t);
}

vec3 refractDir(vec3 h) {
  float alt = asin(clamp(h.z, -1.0, 1.0));
  float c = cos(alt);
  if (c < 1e-6 || uRefract < 0.5) return h;
  float a2 = alt + skyRefraction(alt);
  return vec3(h.xy * (cos(a2) / c), sin(a2));
}

// Camera-frame unit vector -> clip space. Points near straight-behind are pushed off screen.
vec4 projectCamera(vec3 c) {
  if (c.z > 0.98) return vec4(3.0, 3.0, 3.0, 1.0);
  return vec4(2.0 * c.xy / (1.0 - c.z) * uScale, 0.0, 1.0);
}
`;

/** The analytic sky: day, twilight, night, light pollution and moonlight. */
const SKY = `
uniform vec3 uSunDir;          // horizon frame, apparent
uniform float uSunAlt;         // altitude that drives sky brightness (radians; lowered during eclipses)
uniform float uSunVisible;     // 0..1 fraction of the Sun's disk not hidden by the Moon
uniform vec3 uMoonDir;         // horizon frame
uniform float uMoonLight;      // 0..1 moonlight reaching the ground
uniform float uLightPollution; // 0 (pristine) .. 1 (inner city)
uniform float uAtmosphere;     // 0 turns the air off

vec3 skyColor(vec3 h) {
  if (uAtmosphere < 0.5) return vec3(0.0, 0.001, 0.004);
  float mu = max(h.z, 0.0);
  float hz = pow(1.0 - mu, 3.0);
  float s = uSunAlt / DEG;
  float day = smoothstep(-5.0, 4.0, s);
  float civil = smoothstep(-11.0, -3.0, s);
  float nautical = smoothstep(-18.0, -9.0, s);

  vec2 flatH = normalize(h.xy + vec2(1e-6, 0.0));
  vec2 flatSun = normalize(uSunDir.xy + vec2(1e-6, 0.0));
  float toward = dot(flatH, flatSun) * 0.5 + 0.5;
  float cosSun = dot(h, uSunDir);

  vec3 night = vec3(0.0035, 0.0055, 0.012) + vec3(0.010, 0.013, 0.022) * hz;
  vec3 dusk = mix(vec3(0.012, 0.026, 0.075), mix(vec3(0.022, 0.04, 0.10), vec3(0.10, 0.09, 0.16), pow(toward, 4.0)), hz);
  vec3 civilSky = mix(
    vec3(0.06, 0.12, 0.31),
    mix(vec3(0.17, 0.20, 0.36), vec3(0.96, 0.50, 0.22), pow(toward, 3.0)),
    hz);
  // A band of rose above the orange, on the Sun's side.
  civilSky += vec3(0.20, 0.06, 0.08) * pow(toward, 3.0) * pow(1.0 - mu, 1.5) * (1.0 - hz);
  vec3 daySky = mix(vec3(0.15, 0.35, 0.78), vec3(0.60, 0.77, 0.95), pow(1.0 - mu, 2.4));
  float lowSun = (1.0 - smoothstep(0.0, 14.0, s));
  daySky = mix(daySky, vec3(1.0, 0.66, 0.36), lowSun * pow(toward, 4.0) * hz * 0.85);
  daySky *= mix(0.72, 1.0, smoothstep(0.0, 20.0, s));

  vec3 c = mix(night, dusk, nautical);
  c = mix(c, civilSky, civil);
  c = mix(c, daySky, day);

  // Forward scattering around the Sun.
  float glow = pow(max(cosSun, 0.0), 180.0) * 0.55 + pow(max(cosSun, 0.0), 12.0) * 0.16;
  vec3 glowColor = mix(vec3(1.0, 0.45, 0.16), vec3(1.0, 0.96, 0.88), smoothstep(-2.0, 14.0, s));
  c += glowColor * glow * smoothstep(-9.0, 1.0, s) * uSunVisible;

  float dark = 1.0 - civil;
  // City glow: a warm dome that is strongest near the horizon.
  float lp = uLightPollution * uLightPollution;
  c += (vec3(0.050, 0.040, 0.034) * (0.45 + 1.8 * hz)) * lp * dark;
  // Moonlight turns the night sky a deep blue and puts a soft aureole around the Moon.
  float cosMoon = max(dot(h, uMoonDir), 0.0);
  c += (vec3(0.010, 0.017, 0.036) * (0.7 + hz) + vec3(0.05, 0.055, 0.065) * pow(cosMoon, 60.0)) * uMoonLight * dark;

  // Below the horizon (only seen with the ground hidden) fade toward black.
  c *= mix(1.0, 0.45, smoothstep(0.0, -0.35, h.z));
  return c;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** The low hills that hide the true horizon. Altitude of the skyline at an azimuth. */
const GROUND_PROFILE = `
float groundProfile(vec3 h) {
  float az = atan(h.y, -h.x);
  return (0.35 + 0.22 * sin(az * 3.0 + 1.3) + 0.14 * sin(az * 7.0 + 4.1) + 0.08 * sin(az * 17.0 + 0.6)
    + 0.05 * sin(az * 41.0 + 2.2)) * DEG;
}
`;

// ---------------------------------------------------------------- full-screen sky

export const SKY_VERT = HEADER + `
layout(location = 0) in vec2 aCorner;
out vec2 vNdc;
void main() {
  vNdc = aCorner;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

/** Inverse projection for full-screen passes: NDC -> apparent horizon-frame direction. */
const UNPROJECT = `
uniform mat3 uViewT;   // camera -> horizon
uniform vec2 uScale;
vec3 pixelDirection(vec2 ndc) {
  vec2 p = ndc / uScale;
  float r2 = dot(p, p);
  vec3 c = vec3(4.0 * p, r2 - 4.0) / (r2 + 4.0);
  return uViewT * c;
}
`;

export const SKY_FRAG = HEADER + UNPROJECT + SKY + `
uniform mat3 uHorizonToJ2000;
uniform sampler2D uMilkyWay;
uniform float uMilkyWayGain;
in vec2 vNdc;
out vec4 outColor;
void main() {
  vec3 h = pixelDirection(vNdc);
  vec3 c = skyColor(h);
  if (uMilkyWayGain > 0.001) {
    vec3 e = uHorizonToJ2000 * h;
    float ra = atan(e.y, e.x);
    float dec = asin(clamp(e.z, -1.0, 1.0));
    vec2 uv = vec2(ra / (2.0 * PI), 0.5 - dec / PI);
    // Derivatives of the raw coordinate jump at RA = 0, so give explicit ones.
    vec2 uvAlt = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
    vec2 dx = dFdx(uvAlt), dy = dFdy(uvAlt);
    if (abs(uvAlt.x) > 0.25) { dx = dFdx(vec2(fract(uv.x), uv.y)); dy = dFdy(vec2(fract(uv.x), uv.y)); }
    float mw = textureGrad(uMilkyWay, uv, dx, dy).r;
    float thin = uAtmosphere > 0.5 ? smoothstep(-0.02, 0.30, h.z) : 1.0;
    // As in long exposures: the dense star clouds warm, the thin outer band cooler.
    vec3 tint = mix(vec3(0.58, 0.68, 0.92), vec3(0.95, 0.86, 0.72), smoothstep(0.35, 0.9, mw));
    c += tint * pow(mw, 1.25) * 0.55 * uMilkyWayGain * thin;
  }
  c += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(c, 1.0);
}`;

export const GROUND_FRAG = HEADER + UNPROJECT + SKY + GROUND_PROFILE + `
uniform float uPixelAngle;
in vec2 vNdc;
out vec4 outColor;
void main() {
  vec3 h = pixelDirection(vNdc);
  float alt = asin(clamp(h.z, -1.0, 1.0));
  float edge = groundProfile(h);
  float cover = 1.0 - smoothstep(edge - uPixelAngle, edge + uPixelAngle, alt);
  if (cover <= 0.0) discard;
  // The land takes a little colour from the sky above it and darkens toward the feet.
  // Lit by the whole sky overhead, not by the glow at the horizon.
  vec3 overhead = skyColor(vec3(0.0, 0.0, 1.0));
  float luma = dot(overhead, vec3(0.3, 0.5, 0.2));
  vec3 land = vec3(0.008, 0.010, 0.014) + vec3(0.30, 0.36, 0.24) * luma * 0.6 + overhead * 0.04;
  float depth = smoothstep(0.0, -0.6, h.z);
  land *= mix(1.0, 0.55, depth);
  land += (hash12(gl_FragCoord.xy) - 0.5) / 255.0;
  outColor = vec4(land, cover);
}`;

// ---------------------------------------------------------------- stars

export const STAR_ATTRIBUTES = ['aPos', 'aVel', 'aMagColor'];

export const STAR_VERT = HEADER + PROJECT + `
layout(location = 0) in vec4 aPos;       // parsecs, J2000; w = 1 when the distance is known
layout(location = 1) in vec3 aVel;       // parsecs per year
layout(location = 2) in vec4 aMagColor;  // magnitude, r, g, b
uniform mat3 uJ2000ToHorizon;
uniform float uYears;       // years since J2000
uniform vec3 uAberration;   // Earth's velocity / c, J2000
uniform float uLimitMag;
uniform float uExtinction;  // magnitudes per airmass, 0 without air
uniform float uPixelRatio;
uniform float uSizeBoost;
out vec3 vColor;
out float vCore;    // core radius in device pixels
out float vBright;  // 0..1 peak intensity
out float vSize;    // sprite size in device pixels
void main() {
  vec3 p = aPos.xyz + aVel * uYears;
  float r = length(p);
  float mag = aMagColor.x;
  if (aPos.w > 0.5) mag += 5.0 * log(r / length(aPos.xyz)) / log(10.0);
  vec3 d = normalize(p / r + uAberration);
  vec3 h = refractDir(uJ2000ToHorizon * d);
  if (uExtinction > 0.0) {
    float sinAlt = max(h.z, 0.0);
    float airmass = 1.0 / (sinAlt + 0.025 * exp(-11.0 * sinAlt));
    mag += uExtinction * (airmass - 1.0);
  }
  float x = uLimitMag - mag;
  if (x <= 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 1.0; return; }
  gl_Position = projectCamera(uView * h);
  float core = min(0.55 + 0.30 * x + 0.015 * x * x, 6.0) * uSizeBoost;
  vCore = core * uPixelRatio;
  vBright = clamp(0.12 + x / 1.8, 0.0, 1.0) * smoothstep(0.0, 0.25, x);
  vColor = aMagColor.yzw;
  vSize = max(2.0, vCore * 6.0 + 2.0);
  gl_PointSize = vSize;
}`;

export const STAR_FRAG = HEADER + `
in vec3 vColor;
in float vCore;
in float vBright;
in float vSize;
out vec4 outColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * vSize;
  float core = exp(-(r * r) / (vCore * vCore));
  float halo = exp(-r / (vCore * 1.1)) * 0.22 * smoothstep(2.0, 5.0, vCore);
  float edge = 1.0 - smoothstep(0.42, 0.5, length(gl_PointCoord - 0.5));
  vec3 c = mix(vColor, vec3(1.0), core * 0.55) * (core + halo) * vBright * edge;
  outColor = vec4(c, 0.0);
}`;

// ---------------------------------------------------------------- lines

export const LINE_ATTRIBUTES = ['aCorner', 'aA', 'aVelA', 'aB', 'aVelB'];

export const LINE_VERT = HEADER + PROJECT + `
layout(location = 0) in vec2 aCorner;  // x: -1 start, +1 end; y: -1/+1 side
layout(location = 1) in vec3 aA;       // unit direction at J2000
layout(location = 2) in vec3 aVelA;    // change of that vector per year
layout(location = 3) in vec3 aB;
layout(location = 4) in vec3 aVelB;
uniform mat3 uFrame;        // the lines' own frame -> horizon
uniform float uYears;
uniform vec3 uAberration;
uniform float uWidth;       // device pixels
uniform vec2 uViewport;     // device pixels
out float vSide;
vec3 toCamera(vec3 p, vec3 v) {
  vec3 d = normalize(normalize(p + v * uYears) + uAberration);
  return uView * refractDir(uFrame * d);
}
void main() {
  vec3 ca = toCamera(aA, aVelA);
  vec3 cb = toCamera(aB, aVelB);
  if (ca.z > 0.9 || cb.z > 0.9) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); return; }
  vec2 a = projectCamera(ca).xy * uViewport * 0.5;
  vec2 b = projectCamera(cb).xy * uViewport * 0.5;
  vec2 along = b - a;
  float len = length(along);
  vec2 dir = len > 1e-4 ? along / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  float w = uWidth * 0.5 + 1.0;
  vec2 p = (aCorner.x < 0.0 ? a : b) + normal * aCorner.y * w;
  vSide = aCorner.y * w;
  gl_Position = vec4(p / (uViewport * 0.5), 0.0, 1.0);
}`;

export const LINE_FRAG = HEADER + `
uniform vec4 uColor;
uniform float uWidth;
in float vSide;
out vec4 outColor;
void main() {
  float a = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, abs(vSide));
  outColor = vec4(uColor.rgb, uColor.a * a);
}`;

// ---------------------------------------------------------------- markers (deep-sky objects)

export const MARKER_ATTRIBUTES = ['aDir', 'aInfo'];

export const MARKER_VERT = HEADER + PROJECT + `
layout(location = 0) in vec3 aDir;   // J2000 unit vector
layout(location = 1) in vec3 aInfo;  // magnitude, kind (0 galaxy, 1 cluster, 2 nebula), angular radius (radians)
uniform mat3 uJ2000ToHorizon;
uniform float uLimitMag;   // faintest object marked
uniform float uPixelRatio;
uniform float uPixelsPerRadian;
out float vKind;
out float vAlpha;
out float vSize;
void main() {
  vSize = 1.0;
  float x = uLimitMag - aInfo.x;
  if (x <= 0.0) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 1.0; return; }
  vec3 h = refractDir(uJ2000ToHorizon * aDir);
  gl_Position = projectCamera(uView * h);
  vKind = aInfo.y;
  vAlpha = clamp(x / 1.5, 0.0, 1.0) * smoothstep(-0.02, 0.05, h.z + 0.02);
  float size = max(9.0, min(aInfo.z * uPixelsPerRadian * 2.0, 220.0));
  vSize = size * uPixelRatio;
  gl_PointSize = vSize;
}`;

export const MARKER_FRAG = HEADER + `
uniform vec3 uColor;
in float vKind;
in float vAlpha;
in float vSize;
out vec4 outColor;
void main() {
  vec2 p = (gl_PointCoord - 0.5) * 2.0;
  float px = 2.0 / vSize;          // one device pixel in these units
  float w = px * 1.6;
  float a;
  if (vKind < 0.5) {
    // Galaxy: a tilted ellipse.
    vec2 q = vec2(p.x * 0.8 + p.y * 0.6, (p.y * 0.8 - p.x * 0.6) * 1.9);
    a = 1.0 - smoothstep(w, w * 1.8, abs(length(q) - (1.0 - w * 2.0)));
  } else if (vKind < 1.5) {
    // Cluster: a dashed circle.
    float ring = 1.0 - smoothstep(w, w * 1.8, abs(length(p) - (1.0 - w * 2.0)));
    float ang = atan(p.y, p.x);
    a = ring * step(0.0, sin(ang * 6.0));
  } else {
    // Nebula: a rounded square.
    vec2 q = abs(p);
    float d = length(max(q - 0.55, 0.0)) + min(max(q.x, q.y) - 0.55, 0.0);
    a = 1.0 - smoothstep(w, w * 1.8, abs(d - (0.4 - w * 2.0)));
  }
  outColor = vec4(uColor, a * vAlpha * 0.6);
}`;

// ---------------------------------------------------------------- solar system bodies

export const BODY_VERT = HEADER + `
layout(location = 0) in vec2 aCorner;
uniform vec2 uCentre;   // NDC
uniform vec2 uHalf;     // half size of the quad in NDC
out vec2 vLocal;        // -1..1 across the quad
out vec2 vNdc;
void main() {
  vLocal = aCorner;
  vNdc = uCentre + aCorner * uHalf;
  gl_Position = vec4(vNdc, 0.0, 1.0);
}`;

/** Value noise and the Moon's face, shared by both views' body shaders. */
const SURFACE = `
float vnoise(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n = dot(i, vec3(1.0, 57.0, 113.0));
  vec4 a = fract(sin(vec4(n, n + 1.0, n + 57.0, n + 58.0)) * 43758.5453);
  vec4 b = fract(sin(vec4(n + 113.0, n + 114.0, n + 170.0, n + 171.0)) * 43758.5453);
  vec4 m = mix(a, b, f.z);
  vec2 q = mix(m.xz, m.yw, f.x);
  return mix(q.x, q.y, f.y);
}
float fbm(vec3 p) {
  return vnoise(p) * 0.5 + vnoise(p * 2.1) * 0.27 + vnoise(p * 4.3) * 0.15 + vnoise(p * 8.9) * 0.08;
}

// A soft-edged spot on a sphere: 1 inside angular radius r (degrees) of (lon, lat) in degrees.
float spot(vec3 n, float lon, float lat, float r) {
  float lo = lon * DEG, la = lat * DEG;
  vec3 c = vec3(cos(la) * cos(lo), cos(la) * sin(lo), sin(la));
  float ang = acos(clamp(dot(n, c), -1.0, 1.0)) / DEG;
  // Ragged, soft edges: real maria are not circles.
  ang += (fbm(n * 3.2 + lon) - 0.5) * r * 1.1;
  return 1.0 - smoothstep(r * 0.5, r * 1.2, ang);
}

float moonAlbedo(vec3 b) {
  // Maria as dark patches in selenographic coordinates (longitude east positive, as seen from Earth).
  float m = 0.0;
  m = max(m, spot(b, -16.0, 34.0, 19.0));   // Imbrium
  m = max(m, spot(b, 18.0, 27.0, 11.5));    // Serenitatis
  m = max(m, spot(b, 31.0, 8.0, 13.5));     // Tranquillitatis
  m = max(m, spot(b, 59.0, 17.0, 8.5));     // Crisium
  m = max(m, spot(b, 51.0, -7.0, 10.5));    // Fecunditatis
  m = max(m, spot(b, 35.0, -15.0, 6.5));    // Nectaris
  m = max(m, spot(b, -15.0, -20.0, 12.0));  // Nubium
  m = max(m, spot(b, -39.0, -24.0, 7.0));   // Humorum
  m = max(m, spot(b, -52.0, 20.0, 21.0));   // Procellarum
  m = max(m, spot(b, -42.0, -2.0, 15.0));   // Procellarum (south)
  m = max(m, spot(b, 0.0, 57.0, 7.0));      // Frigoris
  m = max(m, spot(b, -24.0, 57.0, 7.0));
  m = max(m, spot(b, 22.0, 56.0, 7.0));
  m = max(m, spot(b, 6.0, 12.0, 7.0));      // Vaporum
  float rough = fbm(b * 5.0);
  float albedo = mix(0.80 + 0.22 * rough, 0.50 + 0.16 * rough, m);
  albedo += 0.12 * spot(b, -11.0, -43.0, 2.6);   // Tycho
  albedo += 0.08 * spot(b, -20.0, 10.0, 2.2);    // Copernicus
  albedo += 0.08 * spot(b, -47.0, 24.0, 1.6);    // Aristarchus
  return albedo;
}
`;

export const BODY_FRAG = HEADER + UNPROJECT + SKY + SURFACE + `
// Kinds: 0 plain, 1 Sun, 2 Moon, 3 Jupiter, 4 Saturn, 5 Mars, 6 glare only, 7 Earth, 8 comet coma, 9 corona
uniform int uKind;
uniform float uExtent;      // quad half-size in units of the body's radius
uniform float uRadiusPx;    // body radius in device pixels
uniform vec3 uSun;          // direction to the Sun in the disc's frame (x right, y up, z toward the viewer)
uniform vec3 uPole;         // north pole in the same frame
uniform vec3 uPrime;        // direction of the prime meridian (on the equator) in the same frame
uniform vec3 uColor;
uniform float uDim;         // extinction near the horizon, 0..1
uniform float uEarthshine;
uniform float uGlare;       // strength of the glare sprite
uniform float uFlatten;     // polar flattening
uniform vec3 uShadow;       // Earth's shadow on the Moon: centre (xy, body radii) and umbra radius (0 = none)
uniform vec2 uShadowEdge;   // penumbra radius (body radii), and how much the eye has adapted to the umbra (0..1)
in vec2 vLocal;
in vec2 vNdc;
out vec4 outColor;

void main() {
  vec2 p = vLocal * uExtent;            // in body radii
  vec3 h = pixelDirection(vNdc);
  vec3 sky = skyColor(h);
  float skyLuma = dot(sky, vec3(0.3, 0.5, 0.2));
  float aa = 1.0 / max(uRadiusPx, 0.5);  // one pixel in body radii

  // Glare and glow, used by the Sun (and faintly by bright planets).
  vec3 add = vec3(0.0);
  float rr = length(p);
  if (uGlare > 0.0) {
    float rpx = rr * uRadiusPx;
    float g = exp(-rpx / 5.0) * 0.9 + 1.0 / (1.0 + rpx * rpx / 60.0) * 0.5 + exp(-rpx / 60.0) * 0.12;
    float fade = 1.0 - smoothstep(0.75, 1.0, length(vLocal));
    add = uColor * g * uGlare * fade;
  }
  if (uKind == 6) { outColor = vec4(add * uDim, 0.0); return; }
  if (uKind == 9) {
    // The solar corona, seen only in totality: pearly streamers falling off from the limb.
    float ang = atan(p.y, p.x);
    float streamers = 0.75 + 0.25 * sin(ang * 2.0 + 0.7) + 0.12 * sin(ang * 7.0) + 0.08 * sin(ang * 13.0 + 2.0);
    float fall = pow(max(rr, 1.0), -3.2) * streamers;
    float fade = 1.0 - smoothstep(0.7, 1.0, length(vLocal));
    outColor = vec4(uColor * fall * fade * uGlare, 0.0);
    return;
  }

  if (uKind == 8) {
    // Comet: a soft coma with a tail streaming away from the Sun.
    vec2 away = -normalize(uSun.xy + vec2(1e-5, 0.0));
    float along = dot(p, away);
    float across = length(p - away * along);
    float coma = exp(-rr * rr * 1.2);
    float tail = along > 0.0 ? exp(-across * across / (0.02 + along * along * 0.035)) * exp(-along * 0.38) : 0.0;
    float fade = 1.0 - smoothstep(0.8, 1.0, length(vLocal));
    outColor = vec4(uColor * (coma + tail * 0.7) * uDim * fade * uGlare, 0.0);
    return;
  }

  // Saturn's rings, in front of and behind the globe.
  float ringAlpha = 0.0;
  vec3 ringColor = vec3(0.0);
  float ringZ = -1e9;
  if (uKind == 4 && abs(uPole.z) > 1e-4) {
    float z = -(uPole.x * p.x + uPole.y * p.y) / uPole.z;
    vec3 q = vec3(p, z);
    float rho = length(q);
    float w = aa * 1.2;
    float c = smoothstep(1.239 - w, 1.239 + w, rho) * (1.0 - smoothstep(1.527 - w, 1.527 + w, rho)) * 0.25;
    float b = smoothstep(1.527 - w, 1.527 + w, rho) * (1.0 - smoothstep(1.951 - w, 1.951 + w, rho)) * 0.95;
    float a = smoothstep(2.027 - w, 2.027 + w, rho) * (1.0 - smoothstep(2.269 - w, 2.269 + w, rho)) * 0.70;
    ringAlpha = c + b + a;
    float fine = 0.88 + 0.12 * sin(rho * 90.0) * (1.0 - smoothstep(0.02, 0.2, aa));
    ringColor = vec3(0.86, 0.80, 0.66) * fine;
    // The globe's shadow falls across the rings.
    float t = dot(q, uSun);
    if (t < 0.0 && length(q - uSun * t) < 1.0) ringColor *= 0.06;
    ringZ = z;
  }

  // The globe (slightly flattened along its pole when asked).
  vec2 pe = p;
  if (uFlatten > 0.0) {
    vec2 axis = normalize(uPole.xy + vec2(1e-6, 0.0));
    float stretch = 1.0 / (1.0 - uFlatten * (1.0 - uPole.z * uPole.z));
    pe = p + axis * dot(p, axis) * (stretch - 1.0);
  }
  float r2 = dot(pe, pe);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, sqrt(r2));
  vec3 color = sky;
  float alpha = 0.0;
  if (disc > 0.0) {
    vec3 n = vec3(pe, sqrt(max(1.0 - r2, 0.0)));
    n = normalize(n);
    float lit = dot(n, uSun);
    // Body-fixed coordinates of this point.
    vec3 east = cross(uPole, uPrime);
    vec3 b = vec3(dot(n, uPrime), dot(n, east), dot(n, uPole));
    float lat = asin(clamp(b.z, -1.0, 1.0));
    vec3 surface = uColor;
    float shade;
    if (uKind == 1) {
      // The Sun: limb darkening, no phase.
      float mu = n.z;
      shade = 0.42 + 0.58 * pow(mu, 0.55);
      surface = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.98, 0.94), shade) * uColor;
      color = surface * (0.9 + shade * 0.5);
      alpha = disc;
    } else {
      if (uKind == 2) {
        // The Moon reflects almost evenly across its face, so the full Moon looks flat.
        shade = smoothstep(-0.02, 0.10, lit) * (0.55 + 0.45 * pow(max(lit, 0.0), 0.6));
        surface = uColor * moonAlbedo(b);
      } else if (uKind == 3) {
        float bands = 0.5 + 0.5 * sin(lat * 13.0 + 0.6 * sin(lat * 7.0));
        float fine = fbm(vec3(b.xy * 2.0, b.z * 18.0));
        surface = mix(vec3(0.62, 0.44, 0.30), vec3(0.93, 0.88, 0.78), smoothstep(0.25, 0.75, bands * 0.75 + fine * 0.35));
        surface = mix(surface, vec3(0.55, 0.52, 0.50), smoothstep(1.05, 1.4, abs(lat)));
        shade = max(lit, 0.0) * (0.55 + 0.45 * n.z);
      } else if (uKind == 4) {
        float bands = 0.5 + 0.5 * sin(lat * 10.0);
        surface = mix(vec3(0.80, 0.70, 0.50), vec3(0.94, 0.87, 0.68), bands);
        shade = max(lit, 0.0) * (0.55 + 0.45 * n.z);
      } else if (uKind == 5) {
        float f = fbm(b * 2.6 + 3.0);
        surface = mix(vec3(0.86, 0.50, 0.30), vec3(0.50, 0.27, 0.18), smoothstep(0.45, 0.68, f));
        surface = mix(surface, vec3(0.96, 0.95, 0.93), smoothstep(1.28, 1.40, abs(lat)));
        shade = max(lit, 0.0);
      } else if (uKind == 7) {
        float land = smoothstep(0.50, 0.56, fbm(b * 2.2 + 7.0));
        surface = mix(vec3(0.07, 0.20, 0.45), vec3(0.22, 0.36, 0.16), land);
        surface = mix(surface, vec3(0.95), smoothstep(1.15, 1.35, abs(lat)));
        surface = mix(surface, vec3(1.0), smoothstep(0.52, 0.75, fbm(b * 3.5 + 1.0)) * 0.8);
        shade = max(lit, 0.0);
      } else {
        shade = max(lit, 0.0) * (0.6 + 0.4 * n.z);
      }
      vec3 litColor = surface * shade * 1.25;
      if (uKind == 2) litColor += surface * uEarthshine * (1.0 - smoothstep(-0.05, 0.15, lit));
      if (uKind == 2 && uShadow.z > 0.0) {
        // A lunar eclipse: the penumbra dims gently toward the umbra, whose edge is soft
        // and whose inside glows copper with sunlight bent through the Earth's air.
        float d = length(p - uShadow.xy);
        float penumbra = smoothstep(uShadow.z, uShadowEdge.x, d);
        float outside = smoothstep(uShadow.z - 0.10, uShadow.z + 0.04, d);
        vec3 copper = mix(vec3(0.20, 0.035, 0.012), vec3(0.50, 0.17, 0.06), smoothstep(0.0, uShadow.z, d));
        vec3 inUmbra = surface * copper * mix(0.12, 1.0, uShadowEdge.y);
        litColor = mix(inUmbra, litColor * (0.35 + 0.65 * penumbra), outside);
      }
      // Over a bright sky the lit face is washed out, and the dark side is just sky.
      color = sky + litColor * uDim * (1.0 - 0.55 * clamp(skyLuma * 1.6, 0.0, 1.0));
      alpha = disc;
    }
  }

  // Composite globe and rings by depth.
  if (ringAlpha > 0.0) {
    vec3 ringLit = sky + ringColor * (0.6 + 0.4 * abs(dot(uSun, uPole))) * uDim;
    bool inFront = ringZ > 0.0 || alpha < 0.5;
    if (inFront) {
      color = mix(color, ringLit, ringAlpha);
      alpha = max(alpha, ringAlpha);
    } else if (alpha <= 0.0) {
      color = ringLit; alpha = ringAlpha;
    }
  }
  outColor = vec4(color * alpha + add * uDim, alpha);
}`;

// ---------------------------------------------------------------- space view
//
// Space view projects on the CPU side of things: positions arrive already in
// camera space (x right, y up, looking along −z), relative to the camera, so
// float32 is precise near whatever the camera is looking at.

export const SPACE_STAR_VERT = HEADER + `
layout(location = 0) in vec4 aPos;
layout(location = 1) in vec3 aVel;
layout(location = 2) in vec4 aMagColor;
uniform mat3 uView;      // J2000 → camera
uniform vec2 uF;         // focal length over half-width and half-height
uniform float uYears;
uniform float uLimitMag;
uniform float uPixelRatio;
out vec3 vColor;
out float vCore;
out float vBright;
out float vSize;
void main() {
  vec3 p = aPos.xyz + aVel * uYears;
  float r = length(p);
  float mag = aMagColor.x;
  if (aPos.w > 0.5) mag += 5.0 * log(r / length(aPos.xyz)) / log(10.0);
  vec3 c = uView * (p / r);
  float x = uLimitMag - mag;
  if (x <= 0.0 || c.z > -0.01) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 1.0; return; }
  gl_Position = vec4(uF * c.xy, 0.0, -c.z);
  float core = min(0.5 + 0.22 * x + 0.012 * x * x, 4.0);
  vCore = core * uPixelRatio;
  vBright = clamp(0.1 + x / 2.6, 0.0, 1.0) * smoothstep(0.0, 0.25, x);
  vColor = aMagColor.yzw;
  vSize = max(2.0, vCore * 6.0 + 2.0);
  gl_PointSize = vSize;
}`;

export const ORBIT_VERT = HEADER + `
layout(location = 0) in vec4 aPos;   // camera space, w = position along the orbit 0..1 (1 = the body)
uniform vec2 uF;
uniform float uNear;
out float vAlong;
void main() {
  vAlong = aPos.w;
  gl_Position = vec4(uF * aPos.xy, -aPos.z - 2.0 * uNear, -aPos.z);
}`;

export const ORBIT_FRAG = HEADER + `
in float vAlong;
uniform vec4 uColor;
out vec4 outColor;
void main() {
  // Brightest just behind the body, fading around the orbit: a trail that shows direction.
  float a = uColor.a * (0.25 + 0.75 * vAlong * vAlong);
  outColor = vec4(uColor.rgb * a, a);
}`;

export const SPACE_BODY_VERT = HEADER + `
layout(location = 0) in vec2 aCorner;
uniform vec2 uCentre;   // NDC
uniform vec2 uHalf;     // NDC half-size of the quad
out vec2 vUv;
void main() {
  vUv = aCorner;
  gl_Position = vec4(uCentre + aCorner * uHalf, 0.0, 1.0);
}`;

export const SPACE_BODY_FRAG = HEADER + SURFACE + `
in vec2 vUv;
uniform vec3 uColor;
uniform vec3 uLight;    // camera-space direction to the Sun
uniform vec3 uPole;     // camera-space north pole
uniform vec3 uPrime;    // camera-space direction of the prime meridian, on the equator
// Kinds as in the sky view: 0 plain, 1 Sun, 2 Moon, 3 Jupiter, 4 Saturn, 5 Mars, 7 Earth
uniform int uKind;
uniform float uExtent;  // quad half-size in body radii
uniform float uPixels;  // body radius in device pixels
out vec4 outColor;

vec3 surfaceAt(vec3 b, float lat) {
  if (uKind == 2) return uColor * moonAlbedo(b);
  if (uKind == 3) {
    float bands = 0.5 + 0.5 * sin(lat * 13.0 + 0.6 * sin(lat * 7.0));
    float fine = fbm(vec3(b.xy * 2.0, b.z * 18.0));
    vec3 c = mix(vec3(0.62, 0.44, 0.30), vec3(0.93, 0.88, 0.78), smoothstep(0.25, 0.75, bands * 0.75 + fine * 0.35));
    // The Great Red Spot, at about 22 degrees south.
    float lon = atan(b.y, b.x);
    float grs = 1.0 - smoothstep(0.6, 1.0, length(vec2((lon - 0.9) / 0.20, (lat + 0.39) / 0.09)));
    c = mix(c, vec3(0.78, 0.42, 0.28), grs * 0.8);
    return mix(c, vec3(0.55, 0.52, 0.50), smoothstep(1.05, 1.4, abs(lat)));
  }
  if (uKind == 4) return mix(vec3(0.80, 0.70, 0.50), vec3(0.94, 0.87, 0.68), 0.5 + 0.5 * sin(lat * 10.0));
  if (uKind == 5) {
    float f = fbm(b * 2.6 + 3.0);
    vec3 c = mix(vec3(0.86, 0.50, 0.30), vec3(0.50, 0.27, 0.18), smoothstep(0.45, 0.68, f));
    return mix(c, vec3(0.96, 0.95, 0.93), smoothstep(1.28, 1.40, abs(lat)));
  }
  if (uKind == 7) {
    float land = smoothstep(0.50, 0.56, fbm(b * 2.2 + 7.0));
    vec3 c = mix(vec3(0.07, 0.20, 0.45), vec3(0.22, 0.36, 0.16), land);
    c = mix(c, vec3(0.95), smoothstep(1.15, 1.35, abs(lat)));
    return mix(c, vec3(1.0), smoothstep(0.52, 0.75, fbm(b * 3.5 + 1.0)) * 0.8);
  }
  return uColor;
}

void main() {
  vec2 p = vUv * uExtent;
  float r = length(p);
  float aa = 1.2 / max(uPixels, 1.0);
  float disc = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, r);
  if (uKind == 1) {
    float glow = exp(-max(r - 1.0, 0.0) * 1.3) * 0.55 * (1.0 - smoothstep(uExtent * 0.7, uExtent, r));
    float mu = sqrt(max(0.0, 1.0 - r * r));
    vec3 face = mix(vec3(1.0, 0.72, 0.42), vec3(1.0, 0.98, 0.94), 0.42 + 0.58 * pow(mu, 0.55)) * uColor;
    vec3 c = face * disc + vec3(1.0, 0.82, 0.55) * glow * (1.0 - disc);
    outColor = vec4(c, max(disc, glow));
    return;
  }
  vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r * r)));
  float lit = clamp(dot(n, uLight), 0.0, 1.0);
  vec3 surface = uColor;
  // Surface detail only once the disc is big enough to show it.
  if (uPixels > 6.0 && disc > 0.0) {
    vec3 east = cross(uPole, uPrime);
    vec3 b = vec3(dot(n, uPrime), dot(n, east), dot(n, uPole));
    float lat = asin(clamp(b.z, -1.0, 1.0));
    surface = mix(uColor, surfaceAt(b, lat), smoothstep(6.0, 18.0, uPixels));
  }
  float shade = uKind == 2 ? smoothstep(-0.02, 0.10, lit) * (0.55 + 0.45 * pow(lit, 0.6)) : pow(lit, 0.75);
  vec3 c = surface * (0.035 + 0.965 * shade) * disc;
  float a = disc;
  if (uKind == 4 && abs(uPole.z) > 0.002) {
    // Where the line of sight through this pixel crosses the ring plane.
    float pz = -(p.x * uPole.x + p.y * uPole.y) / uPole.z;
    float rr = length(vec3(p, pz));
    float w = aa * 2.0;
    float ring = smoothstep(1.24 - w, 1.24 + w, rr) * (1.0 - smoothstep(2.27 - w, 2.27 + w, rr));
    ring *= 1.0 - 0.75 * smoothstep(1.95 - w, 1.95, rr) * (1.0 - smoothstep(2.03, 2.03 + w, rr));
    ring *= 0.55 + 0.45 * smoothstep(1.5, 1.6, rr);
    // The globe's shadow falls on the rings behind it.
    vec3 q = vec3(p, pz);
    float along = dot(q, uLight);
    float shadow = along < 0.0 ? smoothstep(0.95, 1.05, length(q - uLight * along)) : 1.0;
    float front = max(step(0.0, pz), 1.0 - disc);
    float ra = ring * front * 0.9;
    c = c * (1.0 - ra) + vec3(0.86, 0.78, 0.62) * 0.9 * (0.15 + 0.85 * shadow) * ra;
    a = a + ra * (1.0 - a);
  }
  outColor = vec4(c, a);
}`;

/** The Milky Way behind Space view: a full-screen pass over the same equirectangular map. */
export const SPACE_MILKY_VERT = HEADER + `
layout(location = 0) in vec2 aCorner;
out vec2 vNdc;
void main() {
  vNdc = aCorner;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}`;

export const SPACE_MILKY_FRAG = HEADER + `
in vec2 vNdc;
uniform mat3 uView;     // J2000 → camera
uniform vec2 uF;
uniform sampler2D uMilkyWay;
uniform float uGain;
out vec4 outColor;
void main() {
  vec3 e = normalize(transpose(uView) * vec3(vNdc / uF, -1.0));
  float ra = atan(e.y, e.x);
  float dec = asin(clamp(e.z, -1.0, 1.0));
  vec2 uv = vec2(ra / (2.0 * PI), 0.5 - dec / PI);
  vec2 uvAlt = vec2(fract(uv.x + 0.5) - 0.5, uv.y);
  vec2 dx = dFdx(uvAlt), dy = dFdy(uvAlt);
  if (abs(uvAlt.x) > 0.25) { dx = dFdx(vec2(fract(uv.x), uv.y)); dy = dFdy(vec2(fract(uv.x), uv.y)); }
  float mw = textureGrad(uMilkyWay, uv, dx, dy).r;
  vec3 c = vec3(0.012, 0.018, 0.035) + vec3(0.62, 0.70, 0.90) * pow(mw, 1.3) * 0.30 * uGain;
  outColor = vec4(c, 1.0);
}`;

// ---------------------------------------------------------------- Milky Way stars
//
// The Milky Way's glow is the light of stars too faint to see one by one. A
// few hundred thousand points, scattered with the same density as the glow,
// stand in for them: grainy star clouds from afar that resolve into separate
// points as you zoom in. They are not real stars, so nothing can pick them.

export const MILKY_STAR_VERT = HEADER + PROJECT + `
layout(location = 0) in vec4 aStar;   // xyz: J2000 direction; w: relative brightness 0..1
uniform mat3 uJ2000ToHorizon;
uniform vec3 uAberration;
uniform float uGain;
uniform float uPixelRatio;
uniform float uAtmosphere;
out float vBright;
void main() {
  vec3 h = refractDir(uJ2000ToHorizon * normalize(aStar.xyz + uAberration));
  float thin = uAtmosphere > 0.5 ? smoothstep(-0.02, 0.30, h.z) : 1.0;
  vBright = aStar.w * uGain * thin;
  if (vBright < 0.004) { gl_Position = vec4(3.0, 3.0, 3.0, 1.0); gl_PointSize = 1.0; return; }
  gl_Position = projectCamera(uView * h);
  gl_PointSize = max(1.0, 1.4 * uPixelRatio);
}`;

export const MILKY_STAR_FRAG = HEADER + `
in float vBright;
out vec4 outColor;
void main() {
  float r = length(gl_PointCoord - 0.5) * 2.0;
  float a = 1.0 - smoothstep(0.2, 1.0, r);
  outColor = vec4(vec3(0.80, 0.85, 1.0) * vBright * a, 0.0);
}`;
