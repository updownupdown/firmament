import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  bolometricCorrection, evolve, fitStar, fryerRemnant, heliumFlashMass, layersAt, luminosityFromMagnitude, msTimes,
  phaseFromSpectralType, stateAt, temperatureFromSpectralType, whiteDwarfMass, whiteDwarfRadius, zamsLuminosity, zamsRadius,
} from './stellar.ts';

const near = (actual: number, expected: number, tol: number, what: string) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${what}: ${actual} not within ${tol} of ${expected}`);

test('zero-age main sequence matches Tout et al. (1996)', () => {
  // The paper's solar model at Z = 0.02: L = 0.698, R = 0.888.
  near(zamsLuminosity(1, 0.02), 0.698, 0.002, 'L');
  near(zamsRadius(1, 0.02), 0.888, 0.002, 'R');
  // Metal-poor stars of the same mass are brighter and hotter (about 1.4 L☉ at Z = 0.001).
  near(zamsLuminosity(1, 0.001), 1.4, 0.15, 'L, Z = 0.001');
  near(zamsRadius(1, 0.001), 0.9, 0.05, 'R, Z = 0.001');
});

test('main-sequence lifetimes', () => {
  // Hurley et al. (2000): about 11 Gyr for the Sun.
  near(msTimes(1, 0.02).tMS / 1e9, 11, 0.5, 'Sun');
  // Woosley, Heger & Weaver (2002) table 1: 11.1 Myr at 15 M☉ and 6.7 Myr at 25 M☉.
  near(msTimes(15, 0.02).tMS / 1e6, 11.1, 1.6, '15 M☉');
  near(msTimes(25, 0.02).tMS / 1e6, 6.7, 0.5, '25 M☉');
  // Red dwarfs outlive the universe many times over.
  assert.ok(msTimes(0.1, 0.02).tMS > 1e12);
  assert.ok(heliumFlashMass(0.02) > 1.9 && heliumFlashMass(0.02) < 2.1);
});

test('the Sun today and its future', () => {
  const sun = evolve(1, 0);
  const now = stateAt(sun, 4.57e9);
  near(now.L, 1, 0.08, 'L now');
  near(now.R, 1, 0.05, 'R now');
  near(now.T, 5772, 120, 'T now');
  assert.equal(now.stage.id, 'ms');
  // Red giant tip at about 2,500 L☉ with a 0.47 M☉ helium core (Sackmann et al. 1993).
  const rgb = sun.stages.find((s) => s.id === 'rgb')!;
  near(rgb.L1, 2500, 400, 'tip L');
  assert.ok(rgb.R1 > 120 && rgb.R1 < 260, `tip R ${rgb.R1}`);
  // Ends as a carbon-oxygen white dwarf of about 0.57 M☉ (Cummings et al. 2018).
  assert.equal(sun.remnant.kind, 'coWhiteDwarf');
  near(sun.remnant.mass, 0.569, 0.01, 'WD mass');
  near(sun.lifetime / 1e9, 12.4, 0.8, 'lifetime');
  // A white dwarf of 0.6 M☉ is about the size of the Earth.
  near(whiteDwarfRadius(0.6) * 695700, 8700, 600, 'WD radius km');
});

test('white dwarf masses follow the initial-final mass relation', () => {
  near(whiteDwarfMass(2.06), 0.654, 0.005, 'Sirius A'); // Sirius B is 1.02 M☉ from a heavier parent
  near(whiteDwarfMass(5), 1.006, 0.005, '5 M☉');
  assert.equal(evolve(5, 0).remnant.kind, 'coWhiteDwarf');
});

test('massive stars end as neutron stars or black holes', () => {
  const s15 = evolve(15, 0);
  assert.equal(s15.remnant.kind, 'neutronStar');
  assert.ok(s15.remnant.mass > 1.1 && s15.remnant.mass < 1.6);
  assert.match(s15.ending.event, /Type II/);
  assert.equal(evolve(40, 0).remnant.kind, 'blackHole');
  assert.ok(evolve(40, 0).stripped, '40 M☉ at solar metallicity becomes a Wolf–Rayet star');
  // Fryer et al. (2012), rapid: direct collapse for a 6.5 M☉ CO core.
  assert.equal(fryerRemnant(6.5, 20).fallback, 1);
  // Late burning stages are short: silicon lasts days (WHW 2002, 25 M☉: about 2 days).
  const si = evolve(25, 0).stages.find((s) => s.id === 'silicon')!;
  near((si.end - si.start) * 365.25, 2, 0.1, 'silicon days');
  // Every massive star ends with an iron core.
  const s = evolve(20, 0);
  const st = stateAt(s, s.stages.find((x) => x.id === 'silicon')!.end - 1e-6);
  assert.equal(layersAt(s, st)[0].main, 'Fe');
});

test('metallicity changes the ending', () => {
  // Metal-poor giants keep their mass: pair instability destroys the heaviest completely.
  const pisn = evolve(200, -2.3);
  assert.equal(pisn.remnant.kind, 'nothing');
  assert.match(pisn.ending.event, /Pair-instability/);
  assert.ok((pisn.ejecta.Fe ?? 0) > 1, 'pair-instability makes solar masses of iron');
  // The same star at solar metallicity loses most of its mass to winds and leaves a black hole.
  assert.equal(evolve(200, 0).remnant.kind, 'blackHole');
  // Low-metal black holes are heavier.
  assert.ok(evolve(60, -2).remnant.mass > 2 * evolve(60, 0).remnant.mass);
});

test('the lightest stars become helium white dwarfs without ever being giants', () => {
  const t = evolve(0.1, 0);
  assert.ok(!t.stages.some((s) => s.id === 'rgb'));
  assert.equal(t.remnant.kind, 'heWhiteDwarf');
  assert.ok(t.lifetime > 1e12);
});

test('supernovae return oxygen and iron; the Sun mostly helium and carbon', () => {
  const s25 = evolve(25, 0);
  assert.ok((s25.made.O ?? 0) > 1 && (s25.made.O ?? 0) < 5, `O ${s25.made.O}`);
  assert.ok((s25.made.Fe ?? 0) > 0.03);
  const sun = evolve(1, 0);
  assert.ok((sun.made.He ?? 0) > 0 && !sun.made.Fe);
  const ejected = Object.values(sun.ejecta).reduce((a, b) => a + (b ?? 0), 0);
  near(ejected, 1 - sun.remnant.mass, 0.01, 'mass conserved');
});

test('track states are continuous at stage boundaries', () => {
  for (const m of [0.3, 1, 3, 6, 15, 60]) {
    const t = evolve(m, 0);
    for (let i = 1; i < t.stages.length; i++) {
      const s = t.stages[i];
      // Remnants appear suddenly, and the helium flash drops a red giant to the clump in about a million years.
      if (s.end === Infinity || (s.id === 'heCore' && m < 2)) continue;
      const eps = 0.01 * Math.min(s.end - s.start, t.stages[i - 1].end - t.stages[i - 1].start);
      const a = stateAt(t, s.start - eps), b = stateAt(t, s.start + eps);
      assert.ok(Math.abs(Math.log10(a.L / b.L)) < 0.2, `${m} M☉ L jump into ${s.id}: ${a.L} → ${b.L}`);
    }
  }
});

test('bolometric correction and spectral types', () => {
  near(bolometricCorrection(5772), -0.07, 0.03, 'BC Sun'); // Torres 2010
  near(luminosityFromMagnitude(-26.74, 4.848e-6, 5772), 1, 0.05, 'Sun from its magnitude');
  near(temperatureFromSpectralType('G2V')!, 5770, 60, 'G2');
  near(temperatureFromSpectralType('M2Ib')!, 3550, 150, 'M2');
  assert.equal(phaseFromSpectralType('M2Ib'), 'supergiant');
  assert.equal(phaseFromSpectralType('K2III'), 'giant');
  assert.equal(phaseFromSpectralType('F5IV-V'), 'subgiant');
  assert.equal(phaseFromSpectralType('A0V'), 'dwarf');
  assert.equal(phaseFromSpectralType('B8Ia'), 'supergiant');
  assert.equal(phaseFromSpectralType('K2II'), 'supergiant');
});

test('fitting real stars to tracks', () => {
  // Betelgeuse: about 3,600 K and 10^5 L☉ gives 16–20 M☉ (Joyce et al. 2020: 16.5–19).
  const b = fitStar(1e5, 3600, { phase: 'supergiant' });
  assert.ok(b.mass > 15 && b.mass < 21, `Betelgeuse ${b.mass}`);
  // Vega: 40 L☉, 9,600 K on the main sequence, about 2.1 M☉.
  const v = fitStar(40, 9600, { phase: 'dwarf' });
  assert.ok(v.mass > 1.9 && v.mass < 2.4, `Vega ${v.mass}`);
  // A known mass fixes the track; the fit finds the age. The Sun, from L and T, is middle-aged.
  const sun = fitStar(1, 5772, { mass: 1 });
  assert.ok(sun.age > 3e9 && sun.age < 6e9, `Sun ${sun.age / 1e9} Gyr`);
});

test('every star with a published mass is in the catalogue', async () => {
  const { readFileSync } = await import('node:fs');
  const { KNOWN_STARS } = await import('./stellar.ts');
  const meta = JSON.parse(readFileSync(new URL('../../public/data/stars-meta.json', import.meta.url), 'utf8')) as { n?: string }[];
  const names = new Set(meta.map((m) => m.n).filter(Boolean));
  for (const name of Object.keys(KNOWN_STARS)) if (name !== 'Sun') assert.ok(names.has(name), name);
});
