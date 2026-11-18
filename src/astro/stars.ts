// The star catalog (HYG v4.1) and stellar space motion.
//
// Binary format (little-endian), see scripts/build_data.py:
//   'FST1', count u32, firstIndex u32, recordSize u32 (28), then per star:
//   ra f32 (rad), dec f32 (rad), dist f32 (pc, 0 = unknown),
//   mag i16 (×100), bv i16 (×1000, 32767 = unknown),
//   pmra i16 (mas/yr, includes cos δ), pmdec i16 (mas/yr), rv i16 (km/s ×10), pad i16, hip i32

import { type Vec3, fromSpherical } from './math.ts';

const MAS = Math.PI / (180 * 3600 * 1000);
/** The Sun's absolute visual magnitude: how bright it would look from 10 parsecs. */
export const SUN_ABSOLUTE_MAG = 4.83;

export const KMS_TO_PC_PER_YEAR = 1.0227121650537077e-6;

export interface StarMeta {
  i: number;
  n?: string; // proper name
  b?: string; // Bayer letter (Greek)
  f?: number; // Flamsteed number
  c?: string; // constellation abbreviation
  s?: string; // spectral type
  hd?: number;
  gl?: string;
  v?: string; // variable star designation
}

export class StarCatalog {
  count = 0;
  ra = new Float64Array(0);
  dec = new Float64Array(0);
  dist = new Float32Array(0);
  mag = new Float32Array(0);
  bv = new Float32Array(0);
  pmra = new Float32Array(0);
  pmdec = new Float32Array(0);
  rv = new Float32Array(0);
  hip = new Int32Array(0);
  meta = new Map<number, StarMeta>();
  hipIndex = new Map<number, number>();

  /** Append a binary chunk (bright first, then faint). Returns the index range added. */
  addChunk(buf: ArrayBuffer): [number, number] {
    const dv = new DataView(buf);
    const magic = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
    if (magic !== 'FST1') throw new Error('bad star file');
    const n = dv.getUint32(4, true);
    const first = dv.getUint32(8, true);
    const size = dv.getUint32(12, true);
    if (first !== this.count) throw new Error(`star chunk out of order: ${first} != ${this.count}`);
    const total = this.count + n;
    const grow = <T extends Float64Array | Float32Array | Int32Array>(a: T, C: new (n: number) => T): T => {
      const b = new C(total);
      b.set(a);
      return b;
    };
    this.ra = grow(this.ra, Float64Array);
    this.dec = grow(this.dec, Float64Array);
    this.dist = grow(this.dist, Float32Array);
    this.mag = grow(this.mag, Float32Array);
    this.bv = grow(this.bv, Float32Array);
    this.pmra = grow(this.pmra, Float32Array);
    this.pmdec = grow(this.pmdec, Float32Array);
    this.rv = grow(this.rv, Float32Array);
    this.hip = grow(this.hip, Int32Array);
    let o = 16;
    for (let k = 0; k < n; k++, o += size) {
      const i = first + k;
      this.ra[i] = dv.getFloat32(o, true);
      this.dec[i] = dv.getFloat32(o + 4, true);
      this.dist[i] = dv.getFloat32(o + 8, true);
      this.mag[i] = dv.getInt16(o + 12, true) / 100;
      const bv = dv.getInt16(o + 14, true);
      this.bv[i] = bv === 32767 ? 0.65 : bv / 1000;
      this.pmra[i] = dv.getInt16(o + 16, true);
      this.pmdec[i] = dv.getInt16(o + 18, true);
      this.rv[i] = dv.getInt16(o + 20, true) / 10;
      const hip = dv.getInt32(o + 24, true);
      this.hip[i] = hip;
      if (hip) this.hipIndex.set(hip, i);
    }
    this.count = total;
    return [first, total];
  }

  setMeta(list: StarMeta[]): void {
    for (const m of list) this.meta.set(m.i, m);
  }

  /** J2000 unit vector at the catalog epoch. */
  direction(i: number): Vec3 {
    return fromSpherical(this.ra[i], this.dec[i]);
  }

  /**
   * Position (pc, J2000 frame, heliocentric) and velocity (pc/yr). Stars without
   * a distance are placed at 1 pc with proper motion only, so their direction
   * still moves correctly.
   */
  spaceMotion(i: number): { pos: Vec3; vel: Vec3; hasDistance: boolean } {
    const a = this.ra[i], d = this.dec[i];
    const ca = Math.cos(a), sa = Math.sin(a), cd = Math.cos(d), sd = Math.sin(d);
    const hasDistance = this.dist[i] > 0;
    const r = hasDistance ? this.dist[i] : 1;
    const u: Vec3 = [cd * ca, cd * sa, sd];
    const ea: Vec3 = [-sa, ca, 0];
    const ed: Vec3 = [-sd * ca, -sd * sa, cd];
    const pa = this.pmra[i] * MAS, pd = this.pmdec[i] * MAS;
    const vr = hasDistance ? this.rv[i] * KMS_TO_PC_PER_YEAR : 0;
    const vel: Vec3 = [
      r * (pa * ea[0] + pd * ed[0]) + vr * u[0],
      r * (pa * ea[1] + pd * ed[1]) + vr * u[1],
      r * (pa * ea[2] + pd * ed[2]) + vr * u[2],
    ];
    return { pos: [u[0] * r, u[1] * r, u[2] * r], vel, hasDistance };
  }

  /**
   * Direction (J2000 unit vector) and magnitude `years` after J2000, by linear
   * space motion, seen from `from` (parsecs from the Sun; the Sun by default).
   * Stars without a distance stay where they are, as if infinitely far.
   */
  at(i: number, years: number, from?: Vec3): { dir: Vec3; mag: number } {
    const { pos, vel, hasDistance } = this.spaceMotion(i);
    const p: Vec3 = [pos[0] + vel[0] * years, pos[1] + vel[1] * years, pos[2] + vel[2] * years];
    if (from && hasDistance) { p[0] -= from[0]; p[1] -= from[1]; p[2] -= from[2]; }
    const r = Math.hypot(p[0], p[1], p[2]);
    const r0 = hasDistance ? this.dist[i] : 1;
    return { dir: [p[0] / r, p[1] / r, p[2] / r], mag: this.mag[i] + (hasDistance ? 5 * Math.log10(r / r0) : 0) };
  }

  /** Human-readable designation: proper name, Bayer, Flamsteed, HIP or HD. */
  label(i: number): string {
    const m = this.meta.get(i);
    if (m?.n) return m.n;
    const des = designation(m);
    if (des) return des;
    if (this.hip[i]) return `HIP ${this.hip[i]}`;
    return `Star ${i}`;
  }
}

const CONST_GENITIVE: Record<string, string> = {
  And: 'Andromedae', Ant: 'Antliae', Aps: 'Apodis', Aqr: 'Aquarii', Aql: 'Aquilae', Ara: 'Arae', Ari: 'Arietis',
  Aur: 'Aurigae', Boo: 'Boötis', Cae: 'Caeli', Cam: 'Camelopardalis', Cnc: 'Cancri', CVn: 'Canum Venaticorum',
  CMa: 'Canis Majoris', CMi: 'Canis Minoris', Cap: 'Capricorni', Car: 'Carinae', Cas: 'Cassiopeiae', Cen: 'Centauri',
  Cep: 'Cephei', Cet: 'Ceti', Cha: 'Chamaeleontis', Cir: 'Circini', Col: 'Columbae', Com: 'Comae Berenices',
  CrA: 'Coronae Australis', CrB: 'Coronae Borealis', Crv: 'Corvi', Crt: 'Crateris', Cru: 'Crucis', Cyg: 'Cygni',
  Del: 'Delphini', Dor: 'Doradus', Dra: 'Draconis', Equ: 'Equulei', Eri: 'Eridani', For: 'Fornacis', Gem: 'Geminorum',
  Gru: 'Gruis', Her: 'Herculis', Hor: 'Horologii', Hya: 'Hydrae', Hyi: 'Hydri', Ind: 'Indi', Lac: 'Lacertae',
  Leo: 'Leonis', LMi: 'Leonis Minoris', Lep: 'Leporis', Lib: 'Librae', Lup: 'Lupi', Lyn: 'Lyncis', Lyr: 'Lyrae',
  Men: 'Mensae', Mic: 'Microscopii', Mon: 'Monocerotis', Mus: 'Muscae', Nor: 'Normae', Oct: 'Octantis',
  Oph: 'Ophiuchi', Ori: 'Orionis', Pav: 'Pavonis', Peg: 'Pegasi', Per: 'Persei', Phe: 'Phoenicis', Pic: 'Pictoris',
  Psc: 'Piscium', PsA: 'Piscis Austrini', Pup: 'Puppis', Pyx: 'Pyxidis', Ret: 'Reticuli', Sge: 'Sagittae',
  Sgr: 'Sagittarii', Sco: 'Scorpii', Scl: 'Sculptoris', Sct: 'Scuti', Ser: 'Serpentis', Sex: 'Sextantis',
  Tau: 'Tauri', Tel: 'Telescopii', Tri: 'Trianguli', TrA: 'Trianguli Australis', Tuc: 'Tucanae', UMa: 'Ursae Majoris',
  UMi: 'Ursae Minoris', Vel: 'Velorum', Vir: 'Virginis', Vol: 'Volantis', Vul: 'Vulpeculae',
};

export function designation(m: StarMeta | undefined): string | null {
  if (!m?.c) return null;
  const gen = CONST_GENITIVE[m.c] ?? m.c;
  if (m.b) return `${m.b} ${gen}`;
  if (m.f) return `${m.f} ${gen}`;
  return null;
}

export function genitive(abbr: string): string {
  return CONST_GENITIVE[abbr] ?? abbr;
}

/** Effective temperature from B−V (Ballesteros 2012), kelvin. */
export function temperatureFromBV(bv: number): number {
  return 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
}

/** Approximate sRGB colour (0..1) of a blackbody at temperature T, normalised to max 1. */
export function blackbodyRGB(T: number): [number, number, number] {
  const t = Math.max(1000, Math.min(40000, T)) / 100;
  let r: number, g: number, b: number;
  if (t <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(t) - 161.1195681661;
    b = t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(t - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(t - 60, -0.0755148492);
    b = 255;
  }
  const c = (x: number) => Math.max(0, Math.min(255, x)) / 255;
  return [c(r), c(g), c(b)];
}
