// Single-star evolution: from a star's birth mass and metallicity, its life
// stage by stage, how it ends and what it gives back.
//
// Sources (published fits; the tests check them):
// - Zero-age main sequence luminosity and radius: Tout, Pols, Eggleton & Han
//   (1996, MNRAS 281, 257), valid for 0.1–100 M☉ and Z = 0.0001–0.03.
// - Main-sequence lifetime and the Hertzsprung gap: Hurley, Pols & Tout (2000,
//   MNRAS 315, 543), equations 4–7 and their Z-dependent coefficients, and the
//   helium-flash mass limit M_HeF (eq. 2).
// - Red giants: the core-mass–luminosity relation (Refsdal & Weigert 1970) and
//   core-mass–radius relation (Rappaport et al. 1995); AGB core-mass–luminosity
//   (Paczyński 1970).
// - White dwarf masses: the initial–final mass relation of Cummings et al.
//   (2018, ApJ 866, 21); radii from Nauenberg (1972); cooling from Mestel.
// - Late burning stages of massive stars: Woosley, Heger & Weaver (2002, Rev.
//   Mod. Phys. 74, 1015), table 1, interpolated in mass.
// - Neutron star or black hole: the "rapid" remnant prescription of Fryer et al.
//   (2012, ApJ 749, 91) from the carbon–oxygen core mass; pair instability
//   from Heger & Woosley (2002) and Woosley (2017).
// The stages after the main sequence are simplified: the timings and the
// shape of each track are approximate, the end points are the published ones.
// Masses in M☉, luminosity in L☉, radius in R☉, temperature in K, time in years.

export const SUN_TEFF = 5772;
export const UNIVERSE_AGE = 13.8e9;
export const MASS_MIN = 0.1;
export const MASS_MAX = 250;
export const FEH_MIN = -2.5;
export const FEH_MAX = 0.3;
/** Hurley et al. calibrate to Z = 0.02 for the Sun; the fits are used that way. */
export const Z_SUN = 0.02;

export type StageId =
  | 'ms' | 'blueDwarf' | 'subgiant' | 'rgb' | 'heCore' | 'agb' | 'pn'
  | 'crossing' | 'redSupergiant' | 'wolfRayet' | 'carbon' | 'neon' | 'oxygen' | 'silicon'
  | 'whiteDwarf' | 'neutronStar' | 'blackHole' | 'nothing';

export type FateKind = 'heWhiteDwarf' | 'coWhiteDwarf' | 'oneWhiteDwarf' | 'neutronStar' | 'blackHole' | 'nothing';

export type Element = 'H' | 'He' | 'C' | 'N' | 'O' | 'Ne' | 'Mg' | 'Si' | 'S' | 'Fe' | 'other';
export const ELEMENTS: Element[] = ['H', 'He', 'C', 'N', 'O', 'Ne', 'Mg', 'Si', 'S', 'Fe', 'other'];
export const ELEMENT_NAMES: Record<Element, string> = {
  H: 'Hydrogen', He: 'Helium', C: 'Carbon', N: 'Nitrogen', O: 'Oxygen', Ne: 'Neon', Mg: 'Magnesium',
  Si: 'Silicon', S: 'Sulfur', Fe: 'Iron', other: 'Everything else',
};
export type Composition = Partial<Record<Element, number>>;

/** Mass fractions of the metals in the Sun (Asplund et al. 2009), normalised to 1. */
const SOLAR_METALS: Record<Exclude<Element, 'H' | 'He'>, number> = (() => {
  const raw = { C: 2.37e-3, N: 6.93e-4, O: 5.73e-3, Ne: 1.26e-3, Mg: 7.08e-4, Si: 6.65e-4, S: 3.09e-4, Fe: 1.29e-3, other: 4.5e-4 };
  const sum = Object.values(raw).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, v / sum])) as typeof raw;
})();

export interface Stage {
  id: StageId;
  name: string;
  /** Years since birth; `end` is Infinity for a remnant. */
  start: number;
  end: number;
  /** What is fusing, in a few words, or null. */
  burning: string | null;
  text: string;
  // End points; luminosity and radius are interpolated in log.
  L0: number; L1: number;
  R0: number; R1: number;
  M0: number; M1: number;
  /** Shape of the log-interpolation: u → 0..1, for L and R separately. */
  curve: 'ms' | 'linear' | 'core' | 'loop' | 'early' | 'late';
  /** Core mass at the start and end of the stage (helium, carbon–oxygen or iron, by stage). */
  core0: number; core1: number;
}

export interface Remnant {
  kind: FateKind;
  mass: number;
  /** Radius in km. */
  radiusKm: number;
}

export interface Ending {
  kind: FateKind;
  title: string;
  text: string;
  /** e.g. "Type II supernova", "Planetary nebula", "Failed supernova". */
  event: string;
  explodes: boolean;
}

export interface Track {
  mass: number;
  feh: number;
  Z: number;
  /** Birth composition, mass fractions. */
  born: Composition;
  stages: Stage[];
  /** Age at which the star becomes a remnant. */
  lifetime: number;
  msLifetime: number;
  remnant: Remnant;
  ending: Ending;
  /** Mass returned to space by winds and explosions, by element (M☉). */
  ejecta: Composition;
  /** Of that, what the star made itself (above what it was born with). */
  made: Composition;
  /** Final mass before the end (after winds). */
  finalMass: number;
  heCore: number;
  coCore: number;
  stripped: boolean;
}

export interface StarState {
  stage: Stage;
  index: number;
  /** Progress through the stage, 0..1 (always 0 for a remnant). */
  u: number;
  age: number;
  L: number;
  R: number;
  T: number;
  M: number;
  core: number;
}

// ---------------------------------------------------------------- the fits

const poly = (c: number[], x: number) => c.reduce((s, a, i) => s + a * x ** i, 0);

// Tout et al. (1996), table 1 and 2: each coefficient is a quartic in log10(Z/0.02).
const TOUT_L: Record<string, number[]> = {
  alpha: [0.39704170, -0.32913574, 0.34776688, 0.37470851, 0.09011915],
  beta: [8.52762600, -24.41225973, 56.43597107, 37.06152575, 5.45624060],
  gamma: [0.00025546, -0.00123461, -0.00023246, 0.00045519, 0.00016176],
  delta: [5.43288900, -8.62157806, 13.44202049, 14.51584135, 3.39793084],
  epsilon: [5.56357900, -10.32345224, 19.44322980, 18.97361347, 4.16903097],
  zeta: [0.78866060, -2.90870942, 6.54713531, 4.05606657, 0.53287322],
  eta: [0.00586685, -0.01704237, 0.03872348, 0.02570041, 0.00383376],
};
const TOUT_R: Record<string, number[]> = {
  theta: [1.71535900, 0.62246212, -0.92557761, -1.16996966, -0.30631491],
  iota: [6.59778800, -0.42450044, -12.13339427, -10.73509484, -2.51487077],
  kappa: [10.08855000, -7.11727086, -31.67119479, -24.24848322, -5.33608972],
  lambda: [1.01249500, 0.32699690, -0.00923418, -0.03876858, -0.00412750],
  mu: [0.07490166, 0.02410413, 0.07233664, 0.03040467, 0.00197741],
  nu: [0.01077422, 0, 0, 0, 0],
  xi: [3.08223400, 0.94472050, -2.15200882, -2.49219496, -0.63848738],
  omicron: [17.84778000, -7.45345690, -48.96066856, -40.05386135, -9.09331816],
  pi: [0.00022582, -0.00186899, 0.00388783, 0.00142402, -0.00007671],
};

const lzOf = (Z: number) => Math.log10(Z / Z_SUN);

/** Zero-age main-sequence luminosity (L☉), Tout et al. 1996. */
export function zamsLuminosity(M: number, Z: number): number {
  const x = lzOf(Z);
  const c = Object.fromEntries(Object.entries(TOUT_L).map(([k, v]) => [k, poly(v, x)]));
  return (c.alpha * M ** 5.5 + c.beta * M ** 11) /
    (c.gamma + M ** 3 + c.delta * M ** 5 + c.epsilon * M ** 7 + c.zeta * M ** 8 + c.eta * M ** 9.5);
}

/** Zero-age main-sequence radius (R☉), Tout et al. 1996. */
export function zamsRadius(M: number, Z: number): number {
  const x = lzOf(Z);
  const c = Object.fromEntries(Object.entries(TOUT_R).map(([k, v]) => [k, poly(v, x)]));
  return (c.theta * M ** 2.5 + c.iota * M ** 6.5 + c.kappa * M ** 11 + c.lambda * M ** 19 + c.mu * M ** 19.5) /
    (c.nu + c.xi * M ** 2 + c.omicron * M ** 8.5 + M ** 18.5 + c.pi * M ** 19.5);
}

/** Time to the base of the giant branch, and the main-sequence lifetime (years). Hurley et al. 2000, eq. 4–7. */
export function msTimes(M: number, Z: number): { tBGB: number; tMS: number } {
  const z = lzOf(Z);
  const a1 = poly([1.593890e3, 2.053038e3, 1.231226e3, 2.327785e2], z);
  const a2 = poly([2.706708e3, 1.483131e3, 5.772723e2, 7.411230e1], z);
  const a3 = poly([1.466143e2, -1.048442e2, -6.795374e1, -1.391127e1], z);
  const a4 = poly([4.141960e-2, 4.564888e-2, 2.958542e-2, 5.571483e-3], z);
  const a5 = 3.426349e-1;
  const a6 = poly([1.949814e1, 1.758178, -6.008212, -4.470533], z);
  const a7 = 4.903830;
  const a8 = poly([5.212154e-2, 3.166411e-2, -2.750074e-3, -2.271549e-3], z);
  const a9 = poly([1.312179, -3.294936e-1, 9.231860e-2, 2.610989e-2], z);
  const a10 = 8.073972e-1;
  const tBGB = (a1 + a2 * M ** 4 + a3 * M ** 5.5 + M ** 7) / (a4 * M ** 2 + a5 * M ** 7); // Myr
  const x = Math.max(0.95, Math.min(0.95 - 0.03 * (z + 0.30103), 0.99));
  const mu = Math.max(0.5, 1 - 0.01 * Math.max(a6 / M ** a7, a8 + a9 / M ** a10));
  const tHook = mu * tBGB;
  return { tBGB: tBGB * 1e6, tMS: Math.max(tHook, x * tBGB) * 1e6 };
}

/** Largest mass with a degenerate helium core that ignites in a flash (Hurley et al. 2000, eq. 2). */
export function heliumFlashMass(Z: number): number {
  const z = lzOf(Z);
  return 1.995 + 0.25 * z + 0.087 * z * z;
}

/** White dwarf mass from birth mass, Cummings et al. 2018 (MIST). */
export function whiteDwarfMass(Mi: number): number {
  if (Mi < 2.85) return 0.08 * Mi + 0.489;
  if (Mi < 3.6) return 0.187 * Mi + 0.184;
  return 0.107 * Mi + 0.471;
}

/** Radius of a cold white dwarf (R☉), Nauenberg 1972, μe = 2. */
export function whiteDwarfRadius(M: number): number {
  const x = Math.min(M, 1.43) / 1.44;
  return 0.0112 * Math.sqrt(Math.max(1e-4, x ** (-2 / 3) - x ** (2 / 3)));
}

/** Luminosity of a cooling white dwarf after `t` years (Mestel: L ∝ t^-7/5), L☉. */
function whiteDwarfLuminosity(M: number, t: number): number {
  const scale = 8e9 * (M / 0.6) ** (5 / 7);
  return 1e-4 * Math.max(t, 1e3) ** -1.4 * scale ** 1.4;
}
function whiteDwarfAge(M: number, L: number): number {
  return 8e9 * (M / 0.6) ** (5 / 7) * (L / 1e-4) ** (-5 / 7);
}

/** Remnant from the carbon–oxygen core and final mass: Fryer et al. 2012, "rapid". */
export function fryerRemnant(Mco: number, Mfinal: number): { baryonic: number; fallback: number; kind: 'neutronStar' | 'blackHole'; mass: number } {
  const proto = 1.0;
  const env = Math.max(Mfinal - proto, 0.01);
  let fb: number;
  if (Mco < 2.5) fb = 0.2 / env;
  else if (Mco < 6) fb = (0.286 * Mco - 0.514) / env;
  else if (Mco < 7) fb = 1;
  else if (Mco < 11) {
    const a2 = 0.25 - 1.275 / env;
    fb = a2 * Mco + (-11 * a2 + 1);
  } else fb = 1;
  fb = Math.min(1, Math.max(0, fb));
  const baryonic = proto + fb * env;
  if (baryonic < 3) return { baryonic, fallback: fb, kind: 'neutronStar', mass: (-1 + Math.sqrt(1 + 0.3 * baryonic)) / 0.15 };
  return { baryonic, fallback: fb, kind: 'blackHole', mass: 0.9 * baryonic };
}

/** Bolometric correction from effective temperature: Flower (1996) as corrected by Torres (2010). */
export function bolometricCorrection(T: number): number {
  const lt = Math.log10(T);
  if (lt < 3.7) return poly([-0.190537291496456e5, 0.155144866764412e5, -0.421278819301717e4, 0.381476328422343e3], lt);
  if (lt < 3.9) return poly([-0.370510203809015e5, 0.385672629965804e5, -0.150651486316025e5, 0.261724637119416e4, -0.170623810323864e3], lt);
  return poly([-0.118115450538963e6, 0.137145973583929e6, -0.636233812100225e5, 0.147412923562646e5, -0.170587278406872e4, 0.788731721804990e2], lt);
}

export const radiusFrom = (L: number, T: number) => Math.sqrt(L) * (SUN_TEFF / T) ** 2;
export const temperatureFrom = (L: number, R: number) => SUN_TEFF * (L / (R * R)) ** 0.25;

const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpLog = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

// Woosley, Heger & Weaver (2002) table 1: burning times (years) at 15 and 25 M☉,
// interpolated as a power law in mass.
const LATE: Record<'carbon' | 'neon' | 'oxygen' | 'silicon', [number, number]> = {
  carbon: [2.03e3, 5.22e2],
  neon: [0.732, 0.891],
  oxygen: [2.58, 0.402],
  silicon: [5.01e-2, 5.5e-3],
};
function lateTime(stage: keyof typeof LATE, M: number): number {
  const [a, b] = LATE[stage];
  const m = clamp(M, 9, 80);
  return a * (b / a) ** (Math.log(m / 15) / Math.log(25 / 15));
}

// ---------------------------------------------------------------- evolve

/** Metallicity Z from [Fe/H], on the Hurley scale (Sun = 0.02). */
export function metallicity(feh: number): number {
  return clamp(Z_SUN * 10 ** feh, 1e-4, 0.03);
}

/** The whole life of a star born with `mass` (M☉) and `feh` ([Fe/H], dex). */
export function evolve(mass: number, feh = 0): Track {
  const M = clamp(mass, MASS_MIN, MASS_MAX);
  const Z = metallicity(feh);
  const lz = lzOf(Z);
  const X = 0.76 - 3 * Z, Y = 0.24 + 2 * Z;
  const born: Composition = { H: X, He: Y };
  for (const [el, f] of Object.entries(SOLAR_METALS)) born[el as Element] = f * Z;

  // Beyond 100 M☉ the fits are extrapolated; they stay smooth and sensible.
  const Lz = zamsLuminosity(M, Z), Rz = zamsRadius(M, Z);
  const { tBGB, tMS } = msTimes(M, Z);
  const MHeF = heliumFlashMass(Z);
  const Mup = clamp(7.0 + 0.8 * lz, 5.5, 7.5);
  const Mcc = Mup + 1.6;
  const fL = 1 + 0.5 + 0.8 * smooth(0.25, 1.0, M);
  const fR = 1 + smooth(0.25, 1.0, M) * (0.85 + 0.9 * Math.log10(Math.max(M, 1)));
  const Ltms = Lz * fL, Rtms = Rz * fR;
  const stages: Stage[] = [];
  let t = 0;
  const push = (s: Omit<Stage, 'start' | 'end'>, duration: number) => {
    stages.push({ ...s, start: t, end: t + duration });
    t += duration;
  };

  // Main-sequence mass loss is only significant for massive stars.
  const windFrac = (0.08 + 0.62 * smooth(Math.log10(12), Math.log10(60), Math.log10(M))) * (Z / Z_SUN) ** 0.85;
  const massive = M >= Mcc;
  const Mfinal = massive ? M * (1 - Math.min(windFrac, 0.85)) : M;
  const msEnd = massive ? M - 0.3 * (M - Mfinal) : M;
  const qCore = M < 0.35 ? 1 : 0.08 + 0.3 * smooth(1.1, 30, M);

  const msText = M < 0.35
    ? 'A red dwarf. The whole star churns like a pot of soup, so it burns nearly all its hydrogen, slowly, over trillions of years.'
    : M < 1.5
      ? 'Fusing hydrogen into helium in its core, like the Sun now. The star brightens slowly as helium builds up in the middle.'
      : massive
        ? 'A hot, blue, brilliant star. Its core burns hydrogen ferociously and its light drives a strong wind off the surface.'
        : 'Fusing hydrogen into helium in a churning core. It is hotter and bluer than the Sun and burns far faster.';
  push({ id: 'ms', name: 'Main sequence', burning: 'Hydrogen → helium in the core', text: msText,
    L0: Lz, L1: Ltms, R0: Rz, R1: Rtms, M0: M, M1: msEnd, curve: 'ms', core0: 0, core1: qCore * M * 0.1 }, tMS);

  let remnant: Remnant;
  let ending: Ending;
  let heCore = 0, coCore = 0, stripped = false;
  let finalMass = M;

  if (M < 0.25) {
    // Laughlin, Bodenheimer & Adams (1997): the lightest stars never swell into giants.
    const Lb = Ltms * 6, Tb = 4500 + 15000 * M;
    push({ id: 'blueDwarf', name: 'Blue dwarf', burning: 'The last hydrogen → helium', text: 'With most of its hydrogen gone, the star shrinks a little and heats up, turning from red to blue-white. No star has lived long enough to do this yet.',
      L0: Ltms, L1: Lb, R0: Rtms, R1: radiusFrom(Lb, Tb), M0: M, M1: M, curve: 'linear', core0: 0, core1: M * 0.9 }, 0.12 * tMS);
    const Mwd = 0.9 * M;
    finalMass = Mwd;
    heCore = Mwd;
    remnant = { kind: 'heWhiteDwarf', mass: Mwd, radiusKm: whiteDwarfRadius(Mwd) * 695700 };
    ending = { kind: 'heWhiteDwarf', title: 'A helium white dwarf', explodes: false, event: 'Fades quietly',
      text: `Out of fuel, it settles into a white dwarf of pure helium, ${fmtMass(Mwd)}, about twice the Earth’s width.` };
  } else if (M < 0.5) {
    const Mwd = 0.22 + 0.9 * (M - 0.25);
    finalMass = Mwd;
    heCore = Mwd;
    const Tg = 4700 - 300 * lz;
    const Lb = Ltms * 1.3;
    push({ id: 'subgiant', name: 'Subgiant', burning: 'Hydrogen → helium in a shell', text: 'The core has run out of hydrogen. Burning moves to a shell around it and the star begins to swell.',
      L0: Ltms, L1: Lb, R0: Rtms, R1: radiusFrom(Lb, Tg + 400), M0: M, M1: M, curve: 'linear', core0: 0.1 * M, core1: 0.15 }, Math.max(tBGB - tMS, 0.05 * tMS));
    const Ltip = refsdal(Mwd);
    push({ id: 'rgb', name: 'Red giant', burning: 'Hydrogen → helium in a shell', text: 'A modest red giant. Its core is too light ever to ignite helium, so when the envelope is gone the bare helium core is all that remains.',
      L0: Lb, L1: Math.max(Ltip, Lb * 2), R0: radiusFrom(Lb, Tg + 400), R1: radiusFrom(Math.max(Ltip, Lb * 2), Tg - 600), M0: M, M1: Mwd + 0.01, curve: 'core', core0: 0.15, core1: Mwd }, 0.08 * tMS);
    remnant = { kind: 'heWhiteDwarf', mass: Mwd, radiusKm: whiteDwarfRadius(Mwd) * 695700 };
    ending = { kind: 'heWhiteDwarf', title: 'A helium white dwarf', explodes: false, event: 'Sheds its envelope',
      text: `It never gets hot enough to burn helium. It ends as a helium white dwarf of ${fmtMass(Mwd)}.` };
  } else if (!massive) {
    // Low and intermediate mass: giants, then a white dwarf.
    const lowMass = M < MHeF;
    const superAgb = M >= Mup;
    const ecsn = M >= Mcc - 0.25;
    const Mwd = superAgb ? Math.min(1.37, 1.1 + 0.15 * (M - Mup)) : whiteDwarfMass(M);
    const Tbgb = (lowMass ? 4900 : 4600) - 380 * lz;
    const Lbgb = Ltms * (lowMass ? 1.15 : 1.05);
    const Rbgb = radiusFrom(Lbgb, Tbgb);
    const Mc0 = lowMass ? clamp(0.1 + 0.05 * M, 0.12, 0.25) : 0.1 * M;
    push({ id: 'subgiant', name: lowMass ? 'Subgiant' : 'Hertzsprung gap', burning: 'Hydrogen → helium in a shell',
      text: lowMass
        ? 'The core has run out of hydrogen and starts to contract. Hydrogen keeps burning in a shell around it, and the star cools and swells.'
        : 'The core runs out of hydrogen and contracts while the envelope balloons. This happens so fast that few stars are caught in the act.',
      L0: Ltms, L1: Lbgb, R0: Rtms, R1: Rbgb, M0: M, M1: M, curve: 'linear', core0: qCore * M * 0.1, core1: Mc0 }, Math.max(tBGB - tMS, 0.004 * tMS));

    const McTip = lowMass ? 0.47 + 0.01 * clamp(-lz, 0, 2) : 0.1 * M + 0.05;
    const Ltip = lowMass ? refsdal(McTip) : Lbgb * 2.2;
    const Rtip = lowMass ? rappaport(McTip) * (Z / Z_SUN) ** 0.08 : radiusFrom(Ltip, Tbgb - 500);
    const rgbLoss = lowMass ? Math.min(0.28, Math.max(0, M - McTip - 0.03)) : 0.02 * M;
    const Mrgb = M - rgbLoss;
    push({ id: 'rgb', name: 'Red giant', burning: 'Hydrogen → helium in a shell',
      text: lowMass
        ? 'The helium core grows and the star climbs to hundreds of times the Sun’s brightness, a hundred or more times its width. A wind carries off much of its outer layers.'
        : 'A short climb as a red giant until the core is hot enough to burn helium, which it starts gently, without a flash.',
      L0: Lbgb, L1: Ltip, R0: Rbgb, R1: Rtip, M0: M, M1: Mrgb, curve: lowMass ? 'core' : 'linear', core0: Mc0, core1: McTip }, lowMass ? 0.065 * tMS : 0.025 * tMS);

    const env = Mrgb - McTip;
    const Lhe = lowMass ? 48 : Ltip * 0.7;
    // Horizontal-branch colour: old, metal-poor stars with thin envelopes sit hot and blue.
    const blue = (env < 0.25 ? (0.25 - env) / 0.25 : 0) * (0.15 + 0.85 * smooth(0, 1.5, -lz));
    const Tred = lowMass ? 4800 - 350 * lz + blue * 9000 : Tbgb - 200;
    const loop = !lowMass && M >= 4 ? clamp(5000 + 2600 * (M - 4) - 1500 * lz, 6000, 16000) : Tred;
    const tHe = lowMass ? 1.1e8 : 0.2 * tMS;
    push({ id: 'heCore', name: lowMass ? 'Helium burning (red clump)' : 'Helium burning', burning: 'Helium → carbon and oxygen in the core',
      text: lowMass
        ? (Tred > 6000
          ? 'After a helium flash, the core burns helium steadily. With little envelope left, the star sits hot and blue on the horizontal branch.'
          : 'After the helium flash, a runaway that the star absorbs in minutes, the core burns helium into carbon and oxygen. The star shrinks and settles down.')
        : (loop > Tred + 500
          ? 'The core burns helium into carbon and oxygen. The star loops out to hotter, bluer colours and back, pulsing as a Cepheid variable when it crosses the instability strip.'
          : 'The core burns helium into carbon and oxygen while hydrogen burns in a shell around it.'),
      L0: lowMass ? Lhe : Ltip, L1: lowMass ? Lhe * 1.4 : Lhe * 1.3, R0: radiusFrom(lowMass ? Lhe : Ltip, Tred), R1: radiusFrom(lowMass ? Lhe * 1.4 : Lhe * 1.3, Tred - 150),
      M0: Mrgb, M1: Mrgb, curve: !lowMass && loop > Tred + 500 ? 'loop' : 'linear', core0: McTip, core1: McTip + 0.05 }, tHe);
    const loopStage = stages[stages.length - 1];
    if (loopStage.curve === 'loop') loopStage.core0 = loop; // stash the loop's hottest temperature

    const Lagb0 = (lowMass ? Lhe * 1.4 : Lhe * 1.3);
    const Lagb1 = 5.9e4 * Math.max(Mwd - 0.495, 0.03);
    const Tagb = 3200 - 250 * lz;
    push({ id: 'agb', name: superAgb ? 'Super-AGB star' : 'Asymptotic giant branch', burning: superAgb ? 'Carbon → oxygen, neon and magnesium; helium and hydrogen in shells' : 'Helium and hydrogen in two shells',
      text: superAgb
        ? 'Carbon ignites in the core, making oxygen, neon and magnesium. Two shells burn around it and the star swells to a huge, cool giant.'
        : agbText(M),
      L0: Lagb0, L1: Math.max(Lagb1, Lagb0 * 1.5), R0: radiusFrom(Lagb0, Tred - 200), R1: radiusFrom(Math.max(Lagb1, Lagb0 * 1.5), Tagb),
      M0: Mrgb, M1: Mwd + 0.02, curve: 'late', core0: McTip * 0.9, core1: Mwd }, tHe * (lowMass ? 0.18 : 0.12));
    heCore = McTip;
    coCore = Mwd;
    finalMass = Mwd + 0.02;

    if (ecsn) {
      remnant = { kind: 'neutronStar', mass: 1.25, radiusKm: 12 };
      ending = { kind: 'neutronStar', title: 'A neutron star', explodes: true, event: 'Electron-capture supernova',
        text: 'Its oxygen–neon–magnesium core grows heavy enough that electrons are squeezed into nuclei. The core collapses into a light neutron star in a faint supernova.' };
    } else {
      const Lpn = Math.max(Lagb1, Lagb0 * 1.5);
      push({ id: 'pn', name: 'Planetary nebula', burning: 'Hydrogen in a thin shell, then nothing',
        text: 'The last of the envelope drifts away as a glowing shell, lit by the exposed core, which heats past 100,000 K. The nebula fades in a few tens of thousands of years.',
        L0: Lpn, L1: Lpn * 0.8, R0: radiusFrom(Lpn, Tagb), R1: radiusFrom(Lpn * 0.8, 110000), M0: Mwd + 0.02, M1: Mwd, curve: 'early', core0: Mwd, core1: Mwd }, 3e4);
      const kind: FateKind = superAgb ? 'oneWhiteDwarf' : 'coWhiteDwarf';
      remnant = { kind, mass: Mwd, radiusKm: whiteDwarfRadius(Mwd) * 695700 };
      ending = { kind, title: superAgb ? 'An oxygen–neon white dwarf' : 'A carbon–oxygen white dwarf', explodes: false, event: 'Planetary nebula',
        text: `What is left is the core: a white dwarf of ${fmtMass(Mwd)} packed into a ball not much bigger than the Earth. It has no fuel and cools for ever.` };
    }
    finalMass = Mwd;
  } else {
    // Massive stars.
    finalMass = Mfinal;
    const Mhe = Math.max(1.6, 0.43 * M - 2.3);
    stripped = Mfinal < Mhe + 1.5;
    heCore = Math.min(Mhe, Mfinal);
    coCore = Math.max(1.45, 0.7 * heCore - 0.2);
    const Lpost = Ltms * 1.15;
    const Trsg = 3650 - 450 * lz;
    const veryBig = stripped && M > 40;
    const Tcross = veryBig ? 14000 : Trsg;
    push({ id: 'crossing', name: veryBig ? 'Luminous blue variable' : 'Blue to red supergiant',
      burning: 'Hydrogen → helium in a shell',
      text: veryBig
        ? 'Too bright to hold itself together comfortably, the star throws off great shells of gas in fits and starts.'
        : 'The core contracts and the outer layers swell. In a few thousand years the star crosses from blue to red.',
      L0: Ltms, L1: Lpost, R0: Rtms, R1: radiusFrom(Lpost, Tcross), M0: msEnd, M1: msEnd - 0.05 * (M - Mfinal), curve: 'linear', core0: Mhe * 0.6, core1: Mhe * 0.75 }, Math.max(tBGB - tMS, 0.002 * tMS));
    const tHe = (0.2 - 0.1 * smooth(10, 40, M)) * tMS;
    const Mpre = msEnd - 0.05 * (M - Mfinal);
    if (stripped) {
      const Twr = 90000 + 30000 * smooth(20, 80, M);
      const Lwr = Lpost * 0.9;
      if (!veryBig) {
        push({ id: 'redSupergiant', name: 'Red supergiant', burning: 'Helium → carbon and oxygen in the core',
          text: 'A vast, cool supergiant burning helium in its core. Its wind is so strong that it strips away the whole hydrogen envelope.',
          L0: Lpost, L1: Lpost * 1.1, R0: radiusFrom(Lpost, Trsg), R1: radiusFrom(Lpost * 1.1, Trsg - 100), M0: Mpre, M1: lerp(Mpre, Mfinal, 0.6), curve: 'linear', core0: Mhe * 0.75, core1: Mhe }, tHe * 0.5);
      }
      const Mw0 = veryBig ? Mpre : lerp(Mpre, Mfinal, 0.6);
      const L0 = veryBig ? Lpost : Lpost * 1.1;
      push({ id: 'wolfRayet', name: 'Wolf–Rayet star', burning: 'Helium → carbon and oxygen in the core',
        text: 'Its hydrogen envelope blown away, the bare helium core shines at around 100,000 K, shedding mass in a dense, fast wind laced with carbon and nitrogen.',
        L0, L1: Lwr, R0: radiusFrom(L0, veryBig ? Tcross : Trsg), R1: radiusFrom(Lwr, Twr), M0: Mw0, M1: Mfinal, curve: 'early', core0: Mhe, core1: heCore }, veryBig ? tHe : tHe * 0.5);
    } else {
      push({ id: 'redSupergiant', name: Trsg > 5000 ? 'Yellow supergiant' : 'Red supergiant', burning: 'Helium → carbon and oxygen in the core',
        text: 'A supergiant hundreds of times wider than the Sun, burning helium in its core. Its cool, puffy surface pulses irregularly and a slow wind carries off its outer layers.',
        L0: Lpost, L1: Lpost * 1.2, R0: radiusFrom(Lpost, Trsg), R1: radiusFrom(Lpost * 1.2, Trsg - 100), M0: Mpre, M1: Mfinal, curve: 'linear', core0: Mhe * 0.75, core1: Mhe }, tHe);
    }
    const last = stages[stages.length - 1];
    const Lend = last.L1, Rend = last.R1;
    const late = (id: 'carbon' | 'neon' | 'oxygen' | 'silicon', name: string, burning: string, text: string, c0: number, c1: number) =>
      push({ id, name, burning, text, L0: Lend, L1: Lend * 1.02, R0: Rend, R1: Rend, M0: Mfinal, M1: Mfinal, curve: 'linear', core0: c0, core1: c1 }, lateTime(id, M));
    const feCore = clamp(1.3 + 0.04 * coCore, 1.3, 1.9);
    late('carbon', 'Carbon burning', 'Carbon → neon, sodium and magnesium',
      'The core now loses more energy to neutrinos than to light, so each new fuel lasts far less time. Nothing shows on the surface.', coCore, coCore);
    late('neon', 'Neon burning', 'Neon → oxygen and magnesium', 'Neon breaks apart in the heat and the pieces build oxygen and magnesium. This lasts about a year.', coCore * 0.8, coCore * 0.8);
    late('oxygen', 'Oxygen burning', 'Oxygen → silicon and sulfur', 'Oxygen fuses to silicon and sulfur at two billion degrees. The star is now layered like an onion.', coCore * 0.6, coCore * 0.6);
    late('silicon', 'Silicon burning', 'Silicon → iron and nickel', 'Silicon is remade into iron and nickel in days. Iron gives no energy when it fuses, so the iron core has nothing to hold it up.', 0, feCore);

    // How it ends.
    const He = heCore;
    const sneType = stripped ? 'Type Ib/c supernova' : 'Type II supernova';
    if (He >= 64 && He < 133) {
      remnant = { kind: 'nothing', mass: 0, radiusKm: 0 };
      ending = { kind: 'nothing', title: 'Nothing at all', explodes: true, event: 'Pair-instability supernova',
        text: 'The core grows so hot that light turns into pairs of electrons and positrons, the pressure fails and the core collapses onto its oxygen, which detonates. The whole star is blown apart and nothing is left.' };
    } else if (He >= 133) {
      const m = 0.9 * Mfinal;
      remnant = { kind: 'blackHole', mass: m, radiusKm: 2.953 * m };
      ending = { kind: 'blackHole', title: 'A black hole', explodes: false, event: 'Direct collapse',
        text: 'Too big even for a pair-instability explosion to tear apart, the whole star falls into a black hole.' };
    } else {
      const r = fryerRemnant(coCore, Mfinal);
      let mass = r.mass;
      let event: string = r.fallback >= 1 ? 'Failed supernova' : sneType;
      let text: string;
      if (He >= 35) {
        mass = Math.min(mass, 45);
        event = 'Pulsational pair instability, then collapse';
        text = 'Its core is so hot that it shudders, throwing off shells of gas in great pulses, before falling into a black hole.';
      } else if (r.kind === 'neutronStar') {
        text = `The iron core collapses in a fraction of a second into a ball of neutrons 24 km across. The rebound and a flood of neutrinos blow the rest of the star apart in a ${sneType}, outshining its whole galaxy for weeks.`;
      } else if (r.fallback >= 1) {
        text = 'The core collapses but the shock stalls. Instead of exploding, the star quietly falls in on itself and vanishes into a black hole.';
      } else {
        text = `The core collapses and the star explodes in a ${sneType}, but much of it falls back and the core becomes a black hole.`;
      }
      remnant = { kind: r.kind, mass, radiusKm: r.kind === 'neutronStar' ? 12 : 2.953 * mass };
      ending = { kind: r.kind, title: r.kind === 'neutronStar' ? 'A neutron star' : 'A black hole', explodes: r.fallback < 1 || He >= 35, event, text };
    }
  }

  const lifetime = t;
  // The remnant, shown for ten billion years.
  const rm = remnant;
  if (rm.kind === 'heWhiteDwarf' || rm.kind === 'coWhiteDwarf' || rm.kind === 'oneWhiteDwarf') {
    const R = whiteDwarfRadius(rm.mass);
    const L0 = R * R * (110000 / SUN_TEFF) ** 4;
    const what = rm.kind === 'heWhiteDwarf' ? 'helium' : rm.kind === 'coWhiteDwarf' ? 'carbon and oxygen' : 'oxygen, neon and magnesium';
    stages.push({ id: 'whiteDwarf', name: 'White dwarf', start: t, end: Infinity, burning: null,
      text: `A dead core of ${what}, held up by electrons that refuse to be squeezed closer. A teaspoon of it weighs tonnes. It cools for ever, taking longer than the age of the universe to fade to black.`,
      L0, L1: L0, R0: R, R1: R, M0: rm.mass, M1: rm.mass, curve: 'linear', core0: rm.mass, core1: rm.mass });
  } else if (rm.kind === 'neutronStar') {
    const R = 12 / 695700;
    const L = R * R * (1e6 / SUN_TEFF) ** 4; // a million degrees, glowing in X-rays
    stages.push({ id: 'neutronStar', name: 'Neutron star', start: t, end: Infinity, burning: null,
      text: 'A city-sized ball of neutrons, heavier than the Sun, spinning many times a second. If its beams sweep past the Earth we see it as a pulsar.',
      L0: L, L1: L, R0: R, R1: R, M0: rm.mass, M1: rm.mass, curve: 'linear', core0: rm.mass, core1: rm.mass });
  } else if (rm.kind === 'blackHole') {
    const R = rm.radiusKm / 695700;
    stages.push({ id: 'blackHole', name: 'Black hole', start: t, end: Infinity, burning: null,
      text: `Nothing, not even light, escapes from inside ${Math.round(rm.radiusKm).toLocaleString('en-US')} km of the centre. It gives out no light of its own.`,
      L0: 1e-9, L1: 1e-9, R0: R, R1: R, M0: rm.mass, M1: rm.mass, curve: 'linear', core0: rm.mass, core1: rm.mass });
  } else {
    stages.push({ id: 'nothing', name: 'Expanding remnant', start: t, end: Infinity, burning: null,
      text: 'A cloud of fresh elements, many solar masses of iron and oxygen among them, spreading through the galaxy to seed new stars.',
      L0: 1e-9, L1: 1e-9, R0: 1e-9, R1: 1e-9, M0: 0, M1: 0, curve: 'linear', core0: 0, core1: 0 });
  }

  const { ejecta, made } = yields(M, born, remnant, ending, { heCore, coCore, finalMass, stripped, massive: M >= Mcc });
  return { mass: M, feh, Z, born, stages, lifetime, msLifetime: tMS, remnant, ending, ejecta, made, finalMass, heCore, coCore, stripped };
}

function agbText(M: number): string {
  if (M >= 4) return 'Helium and hydrogen burn in two thin shells. The bottom of the envelope gets so hot it turns carbon into nitrogen. Strong winds strip the star.';
  if (M >= 1.5) return 'Helium and hydrogen burn in turn in two thin shells. Each helium flash dredges fresh carbon to the surface, making a carbon star, and slow neutron captures build barium and lead.';
  return 'Helium and hydrogen burn in two thin shells around a carbon–oxygen core. The star swells larger than ever, perhaps to the Earth’s orbit, and blows away its envelope.';
}

/** Red giant luminosity from helium core mass (Refsdal & Weigert 1970). */
function refsdal(Mc: number): number {
  return 2.3e5 * Mc ** 6;
}
/** Red giant radius from helium core mass (Rappaport et al. 1995). */
function rappaport(Mc: number): number {
  return (3.7e3 * Mc ** 4) / (1 + Mc ** 3 + 1.75 * Mc ** 4);
}

function fmtMass(m: number): string {
  return `${m < 10 ? m.toFixed(2) : Math.round(m)} solar masses`;
}

// ---------------------------------------------------------------- state

function shape(curve: Stage['curve'], u: number): [number, number] {
  switch (curve) {
    case 'ms': return [u ** 0.9, u ** 1.9];
    case 'early': return [1 - (1 - u) ** 3, 1 - (1 - u) ** 3];
    case 'late': return [u ** 2.5, u ** 2.5];
    case 'core': {
      // Core mass grows as dMc/dt ∝ L ∝ Mc^6: Mc^-5 falls linearly in time.
      const m0 = 0.15, m1 = 0.47;
      const mc = (m0 ** -5 - u * (m0 ** -5 - m1 ** -5)) ** -0.2;
      const s = Math.log(mc / m0) / Math.log(m1 / m0);
      return [s, s];
    }
    default: return [u, u];
  }
}

/** The star at `age` years. */
export function stateAt(track: Track, age: number): StarState {
  const stages = track.stages;
  let index = stages.findIndex((s) => age < s.end);
  if (index < 0) index = stages.length - 1;
  const stage = stages[index];
  const a = Math.max(age, 0);
  if (stage.end === Infinity) {
    const since = Math.max(0, a - stage.start);
    let L = stage.L0;
    if (stage.id === 'whiteDwarf') {
      const t0 = whiteDwarfAge(stage.M0, stage.L0);
      L = whiteDwarfLuminosity(stage.M0, t0 + since);
    }
    const R = stage.R0;
    return { stage, index, u: 0, age: a, L, R, T: stage.id === 'whiteDwarf' || stage.id === 'neutronStar' ? temperatureFrom(L, R) : 0, M: stage.M0, core: stage.core0 };
  }
  const u = clamp((a - stage.start) / (stage.end - stage.start), 0, 1);
  const [fl, fr] = shape(stage.curve, u);
  let L = lerpLog(stage.L0, stage.L1, fl);
  let R = lerpLog(stage.R0, stage.R1, fr);
  if (stage.curve === 'loop') {
    // A blue loop: out to a hotter surface and back at nearly constant brightness.
    const T0 = temperatureFrom(stage.L0, stage.R0), T1 = temperatureFrom(stage.L1, stage.R1);
    const Tbase = lerpLog(T0, T1, u);
    const T = lerpLog(Tbase, stage.core0, Math.sin(Math.PI * clamp((u - 0.1) / 0.8, 0, 1)) ** 0.7);
    R = radiusFrom(L, T);
  }
  const M = lerp(stage.M0, stage.M1, u);
  const core = stage.curve === 'loop' ? lerp(stage.core1 - 0.05, stage.core1, u) : lerp(stage.core0, stage.core1, u);
  L = Math.max(L, 1e-9);
  return { stage, index, u, age: a, L, R, T: temperatureFrom(L, R), M, core };
}

// ---------------------------------------------------------------- inside

export interface Layer {
  name: string;
  /** Outer edge, as a fraction of the star's mass (layers listed centre outward). */
  to: number;
  /** Main elements, for colour. */
  main: Element;
  /** What it is made of, in words. */
  what: string;
  burning: boolean;
}

/** The star's insides, by mass, centre outward. */
export function layersAt(track: Track, s: StarState): Layer[] {
  const { stage, M } = s;
  const frac = (m: number) => clamp(m / Math.max(M, 1e-6), 0, 1);
  const env: Layer = { name: 'Envelope', to: 1, main: 'H', what: 'Hydrogen and helium, as it was born', burning: false };
  const u = s.u;
  switch (stage.id) {
    case 'ms': {
      if (track.mass < 0.35) {
        const X = (track.born.H ?? 0.7) * (1 - 0.6 * u);
        return [{ name: 'Whole star, mixed', to: 1, main: X > 0.4 ? 'H' : 'He', what: `${Math.round(X * 100)}% hydrogen, the rest mostly helium`, burning: true }];
      }
      const q = track.mass < 1.1 ? 0.1 : 0.08 + 0.3 * smooth(1.1, 30, track.mass);
      const X = (track.born.H ?? 0.7) * (1 - 0.97 * u);
      return [{ name: 'Core', to: q, main: X > 0.35 ? 'H' : 'He', what: `${Math.round(X * 100)}% hydrogen, the rest helium`, burning: true }, env];
    }
    case 'blueDwarf':
      return [{ name: 'Whole star, mixed', to: 1, main: 'He', what: 'Mostly helium now', burning: true }];
    case 'subgiant': case 'rgb': case 'crossing':
      return [
        { name: 'Helium core', to: frac(s.core), main: 'He', what: 'Helium, inert and dense', burning: false },
        { name: 'Shell', to: frac(s.core) + 0.02, main: 'H', what: 'Hydrogen burning to helium', burning: true },
        env,
      ];
    case 'heCore': case 'redSupergiant': {
      const he = frac(s.core);
      return [
        { name: 'Core', to: he * 0.35, main: u > 0.5 ? 'C' : 'He', what: 'Helium burning to carbon and oxygen', burning: true },
        { name: 'Helium layer', to: he, main: 'He', what: 'Helium', burning: false },
        { name: 'Shell', to: Math.min(1, he + 0.02), main: 'H', what: 'Hydrogen burning to helium', burning: true },
        env,
      ];
    }
    case 'wolfRayet':
      return [
        { name: 'Core', to: 0.4, main: u > 0.5 ? 'C' : 'He', what: 'Helium burning to carbon and oxygen', burning: true },
        { name: 'Helium layer', to: 1, main: 'He', what: 'Helium, with carbon and nitrogen at the surface', burning: false },
      ];
    case 'agb': {
      const co = frac(s.core);
      const superAgb = stage.name.startsWith('Super');
      return [
        { name: superAgb ? 'Oxygen–neon core' : 'Carbon–oxygen core', to: co, main: superAgb ? 'Ne' : 'C', what: superAgb ? 'Oxygen, neon and magnesium' : 'Carbon and oxygen, inert', burning: superAgb },
        { name: 'Helium shell', to: Math.min(1, co + 0.02), main: 'He', what: 'Helium burning to carbon', burning: true },
        { name: 'Hydrogen shell', to: Math.min(1, co + 0.04), main: 'H', what: 'Hydrogen burning to helium', burning: true },
        env,
      ];
    }
    case 'carbon': case 'neon': case 'oxygen': case 'silicon': {
      const co = frac(track.coCore), he = frac(track.heCore);
      const order = ['carbon', 'neon', 'oxygen', 'silicon'];
      const k = order.indexOf(stage.id);
      const L: Layer[] = [];
      if (k === 3) L.push({ name: 'Iron core', to: frac(s.core), main: 'Fe', what: 'Iron and nickel', burning: false });
      if (k >= 3) L.push({ name: 'Silicon shell', to: frac(track.coCore * 0.45 + 0.4), main: 'Si', what: 'Silicon and sulfur', burning: true });
      if (k >= 2) L.push({ name: 'Oxygen shell', to: frac(track.coCore * 0.75), main: 'O', what: 'Oxygen burning to silicon', burning: k === 2 });
      if (k >= 1) L.push({ name: 'Neon layer', to: frac(track.coCore * 0.85), main: 'Ne', what: 'Oxygen, neon and magnesium', burning: k === 1 });
      L.push({ name: 'Carbon–oxygen layer', to: co, main: 'C', what: 'Carbon and oxygen', burning: k === 0 });
      L.push({ name: 'Helium layer', to: he, main: 'He', what: 'Helium, burning at its base', burning: true });
      if (!track.stripped) L.push(env);
      else L[L.length - 1].to = 1;
      // Keep the edges increasing.
      for (let i = 1; i < L.length; i++) L[i].to = Math.max(L[i].to, L[i - 1].to + 0.01);
      L[L.length - 1].to = 1;
      return L;
    }
    case 'pn':
      return [
        { name: 'Core', to: 0.97, main: 'C', what: 'Carbon and oxygen', burning: false },
        { name: 'Skin', to: 1, main: 'H', what: 'A thin layer of helium and hydrogen', burning: true },
      ];
    case 'whiteDwarf': {
      const kind = track.remnant.kind;
      return [
        { name: 'Core', to: 0.99, main: kind === 'heWhiteDwarf' ? 'He' : kind === 'oneWhiteDwarf' ? 'Ne' : 'C', what: kind === 'heWhiteDwarf' ? 'Helium' : kind === 'oneWhiteDwarf' ? 'Oxygen, neon and magnesium' : 'Carbon and oxygen, slowly crystallising', burning: false },
        { name: 'Atmosphere', to: 1, main: kind === 'heWhiteDwarf' ? 'H' : 'He', what: 'A thin skin of helium and hydrogen', burning: false },
      ];
    }
    case 'neutronStar':
      return [{ name: 'Neutron star', to: 1, main: 'other', what: 'Neutrons, packed tighter than an atomic nucleus, under an iron crust', burning: false }];
    default:
      return [];
  }
}

// ---------------------------------------------------------------- yields

function yields(M: number, born: Composition, remnant: Remnant, ending: Ending,
  c: { heCore: number; coCore: number; finalMass: number; stripped: boolean; massive: boolean }): { ejecta: Composition; made: Composition } {
  const ejecta: Composition = {};
  const add = (el: Element, m: number) => { if (m > 0) ejecta[el] = (ejecta[el] ?? 0) + m; };
  const addBorn = (m: number, dHe = 0, swapN = 0) => {
    // Material returned roughly as it was born, with some hydrogen turned to helium
    // and some carbon and oxygen turned to nitrogen.
    for (const el of ELEMENTS) {
      let f = born[el] ?? 0;
      if (el === 'H') f -= dHe;
      if (el === 'He') f += dHe;
      if (el === 'C') f -= swapN * 0.6;
      if (el === 'O') f -= swapN * 0.4;
      if (el === 'N') f += swapN;
      add(el, m * Math.max(f, 0));
    }
  };
  const Z = 1 - (born.H ?? 0) - (born.He ?? 0);
  const wd = remnant.kind === 'heWhiteDwarf' || remnant.kind === 'coWhiteDwarf' || remnant.kind === 'oneWhiteDwarf';

  if (wd || (!c.massive && remnant.kind === 'neutronStar')) {
    const shed = Math.max(0, M - remnant.mass);
    if (remnant.kind === 'heWhiteDwarf') addBorn(shed, 0.02);
    else {
      // First and second dredge-up raise helium; third dredge-up adds carbon (1.5–4 M☉),
      // hot-bottom burning turns carbon into nitrogen (above about 4 M☉).
      const dHe = 0.03 + 0.04 * smooth(1, 6, M);
      const hbb = smooth(3.5, 5, M);
      const swapN = born.C! * 0.3 + hbb * (born.C! + born.O! * 0.3);
      addBorn(shed, dHe, swapN);
      const dredge = Math.exp(-(((M - 2.5) / 1.0) ** 2)) * 0.012 * (1 - hbb) * Math.min(1, M / 1.5);
      add('C', dredge);
      add('H', -dredge);
      add('other', shed * Z * 0.02); // s-process: barium, strontium, lead
    }
  } else if (c.massive) {
    const wind = M - c.finalMass;
    // Winds: the envelope, then (stripped stars) layers rich in helium, nitrogen and carbon.
    addBorn(wind, c.stripped ? 0.15 : 0.04, born.C! * 0.5);
    if (c.stripped) add('C', wind * 0.02);
    if (remnant.kind === 'nothing') {
      // Pair-instability: everything goes. Nickel-56 (decays to iron) rises steeply with core mass.
      const He = c.heCore;
      const ni = 57 * Math.max(0, (He - 64) / 69) ** 3;
      const rest = Math.max(0, c.finalMass - ni);
      const core = Math.min(rest, He - ni);
      add('Fe', ni);
      add('O', core * 0.55);
      add('Si', core * 0.16);
      add('S', core * 0.08);
      add('Ne', core * 0.07);
      add('Mg', core * 0.05);
      add('C', core * 0.04);
      add('He', core * 0.05);
      addBorn(Math.max(0, c.finalMass - He), 0.05);
    } else {
      const fb = remnant.kind === 'blackHole' && !ending.explodes ? 1 : remnant.kind === 'blackHole' ? 0.5 : 0;
      const keep = 1 - fb;
      const envelope = Math.max(0, c.finalMass - c.heCore);
      addBorn(envelope, 0.05, born.C! * 0.4);
      const heLayer = Math.max(0, c.heCore - c.coCore);
      add('He', heLayer * 0.9 * keep);
      add('C', heLayer * 0.08 * keep);
      add('N', heLayer * 0.02 * keep);
      const Mco = c.coCore;
      const O = Math.max(0.1, 0.6 * (Mco - 1.5));
      add('O', O * keep);
      add('C', (0.08 + 0.03 * Mco) * keep);
      add('Ne', 0.18 * O * keep);
      add('Mg', 0.07 * O * keep);
      add('Si', (0.06 + 0.025 * Mco) * keep);
      add('S', (0.03 + 0.012 * Mco) * keep);
      add('Fe', 0.07 * keep); // nickel-56, as in SN 1987A
      add('other', (0.02 + 0.006 * Mco) * keep); // calcium, argon, and r-process traces
    }
  }
  // What it made = returned minus what it was born with in that mass.
  const shedTotal = ELEMENTS.reduce((s, el) => s + (ejecta[el] ?? 0), 0);
  const made: Composition = {};
  for (const el of ELEMENTS) {
    const d = (ejecta[el] ?? 0) - shedTotal * (born[el] ?? 0);
    if (d > 1e-4 && el !== 'H') made[el] = d;
  }
  return { ejecta, made };
}

// ---------------------------------------------------------------- real stars

export interface StarFit {
  mass: number;
  age: number;
  stage: StageId;
  /** How far from the nearest track point, in units of the expected error (about 1 is good). */
  miss: number;
}

/**
 * Estimate a star's birth mass and age from its luminosity and temperature by
 * finding the nearest point on a grid of tracks. `phase` narrows the search by
 * luminosity class; `mass` fixes the mass (a published value) and finds the age.
 */
export function fitStar(L: number, T: number, opts: { feh?: number; phase?: StarFitPhase; mass?: number } = {}): StarFit {
  const feh = opts.feh ?? 0;
  const allowed: StageId[] | null = opts.phase === 'dwarf' ? ['ms', 'blueDwarf']
    : opts.phase === 'subgiant' ? ['ms', 'subgiant', 'crossing']
      : opts.phase === 'giant' ? ['subgiant', 'rgb', 'heCore', 'agb', 'crossing', 'redSupergiant']
        : opts.phase === 'supergiant' ? ['crossing', 'redSupergiant', 'wolfRayet', 'heCore', 'agb', 'carbon']
          : opts.phase === 'whiteDwarf' ? ['whiteDwarf'] : null;
  const masses: number[] = [];
  if (opts.mass) masses.push(opts.mass);
  else for (let i = 0; i <= 160; i++) masses.push(MASS_MIN * (MASS_MAX / MASS_MIN) ** (i / 160));
  const lL = Math.log10(L), lT = Math.log10(T);
  let best: StarFit = { mass: masses[0], age: 0, stage: 'ms', miss: Infinity };
  for (const m of masses) {
    const track = evolve(m, feh);
    for (const s of track.stages) {
      if (allowed && !allowed.includes(s.id)) continue;
      if (s.end === Infinity && s.id !== 'whiteDwarf') continue;
      const end = s.end === Infinity ? s.start + 1e10 : s.end;
      // A remnant's age only makes sense within the age of the universe.
      for (let k = 0; k <= 40; k++) {
        const age = s.start + (end - s.start) * (s.end === Infinity ? (k / 40) ** 3 : k / 40);
        if (age > UNIVERSE_AGE * 1.05 && !opts.mass) break;
        const st = stateAt(track, age);
        const d = Math.hypot((Math.log10(st.T) - lT) / 0.02, (Math.log10(st.L) - lL) / 0.1);
        if (d < best.miss) best = { mass: m, age, stage: s.id, miss: d };
      }
    }
  }
  if (best.miss === Infinity && opts.phase) return fitStar(L, T, { ...opts, phase: undefined });
  return best;
}

/** Luminosity (L☉) from apparent magnitude, distance (pc) and temperature, ignoring dust. */
export function luminosityFromMagnitude(mag: number, distPc: number, T: number): number {
  const absV = mag - 5 * Math.log10(distPc / 10);
  return 10 ** ((4.74 - (absV + bolometricCorrection(T))) / 2.5);
}

/** Effective temperature from a spectral type like "B8Ia" or "K2III", or null. */
export function temperatureFromSpectralType(type: string | undefined): number | null {
  const m = /^(?:sd)?([OBAFGKM])(\d(?:\.\d)?)?/.exec(type ?? '');
  if (!m) return null;
  // Pecaut & Mamajek (2013) dwarf scale, sampled at sub-types 0 and 5.
  const scale: Record<string, [number, number, number]> = {
    O: [45000, 41000, 31000], B: [31000, 15700, 9700], A: [9700, 8100, 7200],
    F: [7200, 6500, 5920], G: [5920, 5660, 5280], K: [5280, 4450, 3850], M: [3850, 3060, 2400],
  };
  const [t0, t5, t10] = scale[m[1]];
  const sub = m[2] ? parseFloat(m[2]) : 0;
  return sub <= 5 ? lerpLog(t0, t5, sub / 5) : lerpLog(t5, t10, (sub - 5) / 5);
}

/** Luminosity class in words from a spectral type. */
export function phaseFromSpectralType(type: string | undefined): StarFitPhase | undefined {
  if (!type) return undefined;
  if (/^D/.test(type)) return 'whiteDwarf';
  const rest = type.replace(/^(?:sd)?[OBAFGKM][\d.]*/, '');
  if (/^\s*(?:Ia|Ib|I\b|0|II(?!I))/.test(rest)) return 'supergiant';
  if (/^\s*III/.test(rest)) return 'giant';
  if (/^\s*IV/.test(rest)) return 'subgiant';
  if (/^\s*V/.test(rest) || type.startsWith('sd')) return 'dwarf';
  return undefined;
}
export type StarFitPhase = 'dwarf' | 'subgiant' | 'giant' | 'supergiant' | 'whiteDwarf';

/** Published birth masses (M☉) and metallicities for well-known stars, by proper name. */
export const KNOWN_STARS: Record<string, { mass: number; feh?: number; note?: string }> = {
  Sun: { mass: 1, feh: 0 },
  Sirius: { mass: 2.06, note: 'Sirius has a white dwarf companion, Sirius B, once the heavier star.' },
  Canopus: { mass: 8.0 },
  Arcturus: { mass: 1.08, feh: -0.52 },
  'Rigil Kentaurus': { mass: 1.08, feh: 0.2 },
  Toliman: { mass: 0.91, feh: 0.2 },
  Vega: { mass: 2.14, feh: -0.5 },
  Capella: { mass: 2.57, note: 'Capella is a pair of yellow giants; this is the brighter one.' },
  Rigel: { mass: 21 },
  Procyon: { mass: 1.48 },
  Achernar: { mass: 6.0 },
  Betelgeuse: { mass: 18 },
  Hadar: { mass: 12 },
  Altair: { mass: 1.86 },
  Acrux: { mass: 17.8 },
  Aldebaran: { mass: 1.16, feh: -0.3 },
  Spica: { mass: 11.4 },
  Antares: { mass: 13 },
  Pollux: { mass: 1.91 },
  Fomalhaut: { mass: 1.92 },
  Mimosa: { mass: 16 },
  Deneb: { mass: 19 },
  Regulus: { mass: 3.8 },
  Castor: { mass: 2.37 },
  Bellatrix: { mass: 7.7 },
  Alnilam: { mass: 40 },
  Alnitak: { mass: 33 },
  Mintaka: { mass: 24 },
  Saiph: { mass: 15.5 },
  Polaris: { mass: 5.4 },
  Mira: { mass: 1.2 },
  Algol: { mass: 3.17, note: 'Algol is an eclipsing pair; this is the brighter star.' },
  Naos: { mass: 25 },
  'Proxima Centauri': { mass: 0.12, feh: 0.2 },
  "Barnard's Star": { mass: 0.16, feh: -0.4 },
};
