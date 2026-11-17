// The Star lab: build a star from its birth mass and metals and watch it live
// and die, with its size, colour, insides, ending and the elements it gives
// back. The physics is in src/astro/stellar.ts; catalogue stars come in
// through src/sim/starlink.ts.

import { blackbodyRGB } from '../astro/stars.ts';
import {
  ELEMENTS, ELEMENT_NAMES, type Element as Chem, FEH_MAX, FEH_MIN, MASS_MAX, MASS_MIN, type Stage, type StarState, type Track,
  UNIVERSE_AGE, evolve, layersAt, stateAt, zamsLuminosity, zamsRadius, temperatureFrom, metallicity,
} from '../astro/stellar.ts';
import type { StarSeed } from '../sim/starlink.ts';
import { h, fill, icon } from './dom.ts';
import { palette, prepare } from './plot-kit.ts';
import type { Panel, Shell } from './shell.ts';

export interface StarLabPanel extends Panel {
  /** Start from a real star (or clear back to a free build with null). */
  seed(s: StarSeed | null): void;
}

const REMNANT_SPAN = 1e10;
const PLAY_SECONDS = 26;
const MASS_STEPS = 1000;

const PRESETS: { label: string; mass: number; feh: number }[] = [
  { label: 'Red dwarf', mass: 0.15, feh: 0 },
  { label: 'The Sun', mass: 1, feh: 0 },
  { label: 'Sirius', mass: 2.06, feh: 0 },
  { label: 'Blue giant', mass: 8, feh: 0 },
  { label: 'Supergiant', mass: 18, feh: 0 },
  { label: 'Monster', mass: 60, feh: 0 },
  { label: 'A first star', mass: 200, feh: -2.5 },
];

const weight = (s: Stage) => s.id === 'ms' ? 4
  : s.end === Infinity ? 1.5
    : s.id === 'pn' || s.id === 'carbon' || s.id === 'neon' || s.id === 'oxygen' || s.id === 'silicon' ? 0.6 : 1;

/** Slider position (0..1) → age. Each stage gets a share of the slider by weight, not by time. */
export function ageAtPosition(track: Track, v: number): number {
  const total = track.stages.reduce((s, st) => s + weight(st), 0);
  let x = Math.min(Math.max(v, 0), 1) * total;
  for (const st of track.stages) {
    const w = weight(st);
    if (x <= w || st.end === Infinity) {
      const f = Math.min(x / w, 1);
      return st.end === Infinity ? st.start + REMNANT_SPAN * f * f : st.start + (st.end - st.start) * f;
    }
    x -= w;
  }
  return track.lifetime;
}

export function positionOfAge(track: Track, age: number): number {
  const total = track.stages.reduce((s, st) => s + weight(st), 0);
  let x = 0;
  for (const st of track.stages) {
    const w = weight(st);
    if (age < st.end || st.end === Infinity) {
      const f = st.end === Infinity ? Math.sqrt(Math.min(1, Math.max(0, (age - st.start) / REMNANT_SPAN))) : (age - st.start) / (st.end - st.start);
      return (x + w * Math.min(Math.max(f, 0), 1)) / total;
    }
    x += w;
  }
  return 1;
}

// ---------------------------------------------------------------- words and numbers

export function formatYears(y: number): string {
  const sig = (x: number) => (x < 10 ? x.toFixed(1).replace(/\.0$/, '') : Math.round(x).toLocaleString('en-US'));
  if (y >= 1e12) return `${sig(y / 1e12)} trillion years`;
  if (y >= 1e9) return `${sig(y / 1e9)} billion years`;
  if (y >= 1e6) return `${sig(y / 1e6)} million years`;
  if (y >= 1e4) return `${(Math.round(y / 1000) * 1000).toLocaleString('en-US')} years`;
  if (y >= 2) return `${Math.round(y).toLocaleString('en-US')} years`;
  if (y >= 1 / 6) return `${Math.round(y * 12)} months`;
  if (y >= 2 / 365) return `${Math.round(y * 365.25)} days`;
  return `${Math.max(1, Math.round(y * 8766))} hours`;
}

function times(x: number): string {
  if (x >= 1e4) return `${Math.round(x / 1000) * 1000 >= 1e6 ? (x / 1e6).toFixed(1) + ' million' : (Math.round(x / 100) * 100).toLocaleString('en-US')}`;
  if (x >= 100) return Math.round(x).toLocaleString('en-US');
  if (x >= 10) return x.toFixed(0);
  if (x >= 1) return x.toFixed(1).replace(/\.0$/, '');
  return x.toPrecision(2);
}

const solarMasses = (m: number) => `${m >= 10 ? Math.round(m) : m >= 1 ? m.toFixed(1).replace(/\.0$/, '') : m.toFixed(2)} M☉`;

function massLabel(m: number): string {
  return `${m >= 10 ? Math.round(m) : m >= 1 ? m.toFixed(2) : m.toFixed(2)} × the Sun`;
}

function metalLabel(feh: number): string {
  if (Math.abs(feh) < 0.05) return 'Like the Sun';
  const x = 10 ** feh;
  if (x < 1) return `1/${x < 0.1 ? Math.round(1 / x) : (1 / x).toFixed(1).replace(/\.0$/, '')} of the Sun’s`;
  return `${x.toFixed(1)} × the Sun’s`;
}

const AU = 215.03; // R☉
function sizeWords(R: number, stage: Stage): string {
  if (stage.id === 'blackHole') return `An event horizon ${Math.round(R * 695700 * 2).toLocaleString('en-US')} km across`;
  if (stage.id === 'neutronStar') return 'About 24 km across: the size of a city';
  if (stage.id === 'nothing') return 'Nothing left at the centre';
  if (R < 0.03) return `${Math.round(R * 695700 * 2).toLocaleString('en-US')} km across: ${R * 695700 < 7000 ? 'smaller than' : R * 695700 < 11000 ? 'a little bigger than' : 'about twice'} the Earth`;
  const places: [number, string][] = [[0.387 * AU, 'Mercury'], [0.723 * AU, 'Venus'], [AU, 'the Earth'], [1.524 * AU, 'Mars'], [5.2 * AU, 'Jupiter'], [9.54 * AU, 'Saturn']];
  const past = places.filter(([r]) => R > r).pop();
  const w = `${times(R)} × the Sun’s width`;
  return past ? `${w}. In the Sun’s place it would swallow ${past[1]}${past[1] === 'Saturn' ? '' : '’s orbit'}` : w;
}

function earthMasses(m: number): string {
  const e = m * 332946;
  return e >= 1 ? `${e >= 100 ? Math.round(e).toLocaleString('en-US') : e.toFixed(0)} Earths` : `${e.toPrecision(1)} Earths`;
}

// ---------------------------------------------------------------- the panel

export function starLabPanel(shell: Shell): StarLabPanel {
  void shell;
  let mass = 1;
  let feh = 0;
  let track = evolve(mass, feh);
  let pos = positionOfAge(track, 4.57e9);
  let seed: StarSeed | null = null;
  let playing = false;
  let raf = 0;
  let last = 0;
  let hrCache: { key: string; pts: { lT: number; lL: number; age: number }[][] } | null = null;

  const toMass = (v: number) => MASS_MIN * (MASS_MAX / MASS_MIN) ** (v / MASS_STEPS);
  const fromMass = (m: number) => Math.round((Math.log(m / MASS_MIN) / Math.log(MASS_MAX / MASS_MIN)) * MASS_STEPS);

  // Controls.
  const massValue = h('span', { class: 'lab-value' });
  const massInput = h('input', { type: 'range', min: '0', max: String(MASS_STEPS), step: '1', 'aria-label': 'Birth mass' });
  const fehValue = h('span', { class: 'lab-value' });
  const fehInput = h('input', { type: 'range', min: String(FEH_MIN), max: String(FEH_MAX), step: '0.1', 'aria-label': 'Metals' });
  const presets = h('div', { class: 'chips' }, PRESETS.map((p) => h('button', {
    class: 'chip-button', type: 'button', onclick: () => { seed = null; setStar(p.mass, p.feh, 0); },
  }, p.label)));

  // Seed (a real star).
  const seedCard = h('div', { class: 'card lab-seed', hidden: true });

  // The star itself.
  const view = h('canvas', { class: 'lab-view', 'aria-hidden': 'true' });
  const stageLabel = h('span', { class: 'card-label' });
  const stageName = h('h3', { class: 'lab-stage' });
  const ageLine = h('p', { class: 'lab-age' });
  const stageText = h('p', { class: 'lab-text' });
  const sizeLine = h('p', { class: 'hint' });
  const strip = h('div', { class: 'lab-strip', 'aria-hidden': 'true' });
  const timeInput = h('input', { type: 'range', min: '0', max: '1000', step: '1', class: 'lab-time', 'aria-label': 'Age' });
  const playButton = h('button', { class: 'icon-button outlined', type: 'button', 'aria-label': 'Play', onclick: () => setPlaying(!playing) }, icon('play', 18));
  const facts = h('dl', { class: 'facts lab-facts' });

  // Diagrams and tables.
  const hr = h('canvas', { class: 'lab-hr', role: 'img', 'aria-label': 'Hertzsprung–Russell diagram of the star’s life' });
  const inside = h('div', { class: 'lab-inside' });
  const ending = h('div', { class: 'lab-ending' });
  const born = h('div', { class: 'lab-born' });
  const gives = h('div', { class: 'lab-gives' });

  const el = h('div', { class: 'panel star-lab' },
    h('p', { class: 'lede' }, 'Build a star and watch it live and die. Its birth mass decides almost everything; its metals change the details.'),
    seedCard,
    h('section', { class: 'card lab-star' },
      view,
      h('div', { class: 'lab-heading' }, stageLabel, stageName, ageLine),
      h('div', { class: 'lab-timeline' }, playButton, h('div', { class: 'lab-track' }, strip, timeInput)),
      stageText,
      sizeLine,
      facts),
    h('section', { class: 'card lab-controls' },
      h('label', { class: 'lab-row' }, h('span', { class: 'card-label' }, 'Birth mass'), massValue),
      massInput,
      h('label', { class: 'lab-row' }, h('span', { class: 'card-label' }, 'Metals'), fehValue),
      fehInput,
      h('p', { class: 'hint' }, 'Metals are every element heavier than helium. The first stars had none; stars born today have the most.'),
      presets),
    h('section', { class: 'card' }, h('span', { class: 'card-label' }, 'Its life on the Hertzsprung–Russell diagram'), hr,
      h('p', { class: 'hint' }, 'Brightness against surface temperature. Most stars spend their lives on the main sequence, then wander off to the right as giants.')),
    h('section', { class: 'card' }, h('span', { class: 'card-label' }, 'Inside, by mass'), inside),
    h('section', { class: 'card' }, h('span', { class: 'card-label' }, 'How it ends'), ending),
    h('section', { class: 'card' }, h('span', { class: 'card-label' }, 'Born from'), born),
    h('section', { class: 'card' }, h('span', { class: 'card-label' }, 'What it gives back'), gives),
    h('p', { class: 'hint lab-sources' },
      'Main-sequence sizes and lifetimes from Tout et al. (1996) and Hurley, Pols & Tout (2000); giants from core-mass relations; white dwarf masses from Cummings et al. (2018); late burning times from Woosley, Heger & Weaver (2002); neutron stars and black holes from Fryer et al. (2012). Single stars only, without rotation or a companion. The stages after the main sequence are simplified.'));

  // ------------------------------------------------------------ state changes

  function setStar(m: number, f: number, v: number | null) {
    mass = Math.min(MASS_MAX, Math.max(MASS_MIN, m));
    feh = f;
    track = evolve(mass, feh);
    hrCache = null;
    if (v !== null) pos = v;
    massInput.value = String(fromMass(mass));
    fehInput.value = String(feh);
    renderStatic();
    renderTime();
  }

  // The slider shares its length out by stage, so the same position stays in the same part of life.
  massInput.addEventListener('input', () => setStar(toMass(Number(massInput.value)), feh, null));
  fehInput.addEventListener('input', () => setStar(mass, Number(fehInput.value), null));
  timeInput.addEventListener('input', () => {
    pos = Number(timeInput.value) / 1000;
    if (playing) setPlaying(false);
    renderTime();
  });

  function setPlaying(on: boolean) {
    playing = on;
    fill(playButton, icon(on ? 'pause' : 'play', 18));
    playButton.setAttribute('aria-label', on ? 'Pause' : 'Play');
    cancelAnimationFrame(raf);
    if (!on) return;
    if (pos >= 0.999) pos = 0;
    last = performance.now();
    const step = (now: number) => {
      if (!playing || !el.isConnected) { playing = false; fill(playButton, icon('play', 18)); return; }
      pos = Math.min(1, pos + (now - last) / 1000 / PLAY_SECONDS);
      last = now;
      renderTime();
      if (pos >= 1) { setPlaying(false); return; }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  }

  // ------------------------------------------------------------ rendering

  function renderStatic() {
    massValue.textContent = massLabel(mass);
    massInput.setAttribute('aria-valuetext', `${solarMasses(mass)}`);
    fehValue.textContent = metalLabel(feh);
    fehInput.setAttribute('aria-valuetext', metalLabel(feh));

    // Timeline strip: one segment per stage, sized like the slider.
    fill(strip, track.stages.map((s) => {
      const st = stateAt(track, s.end === Infinity ? s.start + 1e8 : (s.start + s.end) / 2);
      const seg = h('span', { class: 'lab-seg', title: s.name });
      seg.style.flexGrow = String(weight(s));
      seg.style.background = s.end === Infinity ? '' : starColour(st.T, 0.85);
      if (s.end === Infinity) seg.classList.add('remnant');
      return seg;
    }));

    renderSeed();
    renderEnding();
    renderBorn();
    renderGives();
  }

  function renderSeed() {
    seedCard.hidden = !seed;
    if (!seed) return;
    const s = seed;
    const changed = Math.abs(s.mass - mass) / s.mass > 0.01 || Math.abs(s.feh - feh) > 0.05;
    let text: string;
    if (s.age === undefined) text = `A published birth mass of ${solarMasses(s.mass)}. We could not place it on its track without a distance.`;
    else {
      const st = stateAt(evolve(s.mass, s.feh), s.age);
      const how = s.source === 'published' ? `A published birth mass of ${solarMasses(s.mass)}.` : `Fitted from its brightness and colour: about ${solarMasses(s.mass)}.`;
      text = `${how} On that track it is about ${formatYears(s.age)} old: ${article(st.stage.name)}.`;
      if (s.miss !== undefined && s.miss > 4) text += ' It does not sit cleanly on a single-star track (it may be a close pair or reddened by dust), so treat this as rough.';
    }
    fill(seedCard,
      h('div', { class: 'lab-row' }, h('span', { class: 'card-label' }, changed ? `Started from ${s.name}` : s.name),
        h('button', { class: 'link-button', type: 'button', onclick: () => { seed = null; renderStatic(); renderTime(); } }, 'Clear')),
      h('p', null, text),
      s.note ? h('p', { class: 'hint' }, s.note) : null,
      changed && s.age !== undefined ? h('button', { class: 'link-button', type: 'button', onclick: () => applySeed(s) }, `Back to ${s.name}`) : null);
  }

  function renderTime() {
    const age = ageAtPosition(track, pos);
    const st = stateAt(track, age);
    timeInput.value = String(Math.round(pos * 1000));
    timeInput.setAttribute('aria-valuetext', `${formatYears(age)}: ${st.stage.name}`);
    const remnant = st.stage.end === Infinity;
    stageLabel.textContent = remnant ? 'After its death' : `Stage ${st.index + 1} of ${track.stages.length - 1}`;
    stageName.textContent = st.stage.name;
    ageLine.textContent = remnant
      ? `${formatYears(Math.max(0, age - st.stage.start))} after it died, at ${formatYears(age)}`
      : `Age ${formatYears(age)} · this stage lasts ${formatYears(st.stage.end - st.stage.start)}`;
    stageText.textContent = st.stage.text;
    sizeLine.textContent = sizeWords(st.R, st.stage);
    const list: [string, string][] = [];
    if (st.stage.id !== 'blackHole' && st.stage.id !== 'nothing') {
      list.push(['Brightness', `${times(st.L)} × the Sun`]);
      list.push(['Surface', `${(Math.round(st.T / 100) * 100).toLocaleString('en-US')} K`]);
    }
    if (st.stage.id !== 'nothing') list.push(['Mass', solarMasses(st.M)]);
    if (st.stage.burning) list.push(['Fusing', st.stage.burning]);
    fill(facts, list.map(([k, v]) => h('div', { class: 'fact' }, h('dt', null, k), h('dd', null, v))));
    drawView(st);
    drawHR(st);
    renderInside(st);
  }

  function renderInside(st: StarState) {
    const layers = layersAt(track, st);
    if (!layers.length) {
      fill(inside, h('p', { class: 'hint' }, st.stage.id === 'blackHole' ? 'No insides to speak of: all its mass lies behind the event horizon.' : 'Nothing is left at the centre.'));
      return;
    }
    let prev = 0;
    const bar = h('div', { class: 'lab-bar' }, layers.map((l) => {
      const seg = h('span', { class: `lab-bar-seg el-${l.main}${l.burning ? ' burning' : ''}`, title: l.name });
      seg.style.flexGrow = String(Math.max(l.to - prev, 0.012));
      prev = l.to;
      return seg;
    }));
    fill(inside,
      h('div', { class: 'lab-axis' }, h('span', null, 'Centre'), h('span', null, 'Surface')),
      bar,
      h('ul', { class: 'lab-legend' }, layers.map((l) => h('li', null,
        h('span', { class: `lab-swatch el-${l.main}${l.burning ? ' burning' : ''}` }),
        h('span', null, h('strong', null, l.name), ` · ${l.what}`),
        l.burning ? h('span', { class: 'tag up' }, 'Burning') : null))));
  }

  function renderEnding() {
    const e = track.ending, r = track.remnant;
    const list: [string, string][] = [['Lives for', formatYears(track.lifetime)], ['Main sequence', formatYears(track.msLifetime)]];
    if (r.kind !== 'nothing') {
      list.push(['Left behind', solarMasses(r.mass)]);
      list.push(['Across', `${Math.round(r.radiusKm * 2).toLocaleString('en-US')} km`]);
    }
    const old = track.lifetime > UNIVERSE_AGE;
    fill(ending,
      h('div', { class: 'lab-row' }, h('h3', { class: 'lab-ending-title' }, e.title), h('span', { class: 'tag' }, e.event)),
      h('p', null, e.text),
      old ? h('p', { class: 'hint' }, `No star this light has died yet: the universe is only ${formatYears(UNIVERSE_AGE)} old.`) : null,
      h('dl', { class: 'facts' }, list.map(([k, v]) => h('div', { class: 'fact' }, h('dt', null, k), h('dd', null, v)))));
  }

  function renderBorn() {
    const b = track.born;
    const metals = 1 - (b.H ?? 0) - (b.He ?? 0);
    const pct = (x: number) => (x >= 0.01 ? `${(x * 100).toFixed(1)}%` : `${(x * 100).toPrecision(1)}%`);
    const bar = h('div', { class: 'lab-bar' },
      ([['H', b.H ?? 0], ['He', b.He ?? 0], ['other', metals]] as [Chem, number][]).map(([e, x]) => {
        const s = h('span', { class: `lab-bar-seg el-${e === 'other' ? 'C' : e}` });
        s.style.flexGrow = String(Math.max(x, 0.006));
        return s;
      }));
    const metalRows = ELEMENTS.filter((e) => e !== 'H' && e !== 'He').map((e) => [e, b[e] ?? 0] as [Chem, number]).sort((a, c) => c[1] - a[1]);
    fill(born,
      bar,
      h('ul', { class: 'lab-legend' },
        h('li', null, h('span', { class: 'lab-swatch el-H' }), h('span', null, h('strong', null, 'Hydrogen'), ` ${pct(b.H ?? 0)}`)),
        h('li', null, h('span', { class: 'lab-swatch el-He' }), h('span', null, h('strong', null, 'Helium'), ` ${pct(b.He ?? 0)}`)),
        h('li', null, h('span', { class: 'lab-swatch el-C' }), h('span', null, h('strong', null, 'Metals'), ` ${pct(metals)}: ${metalRows.slice(0, 4).map(([e]) => ELEMENT_NAMES[e].toLowerCase()).join(', ')} and more`))),
      h('p', { class: 'hint' }, 'By mass. The hydrogen and most of the helium are from the Big Bang; every heavier atom was made in stars that lived and died before this one.'));
  }

  function renderGives() {
    const ej = track.ejecta, made = track.made;
    const total = ELEMENTS.reduce((s, e) => s + (ej[e] ?? 0), 0);
    if (total < 1e-3) {
      fill(gives, h('p', { class: 'hint' }, 'Almost nothing: it keeps nearly all of itself.'));
      return;
    }
    const rows = ELEMENTS.map((e) => ({ e, m: ej[e] ?? 0, n: made[e] ?? 0 }))
      .filter((r) => r.m > total * 2e-4 || r.n > 0).sort((a, b) => b.m - a.m);
    const madeList = ELEMENTS.filter((e) => (made[e] ?? 0) > total * 1e-4 && e !== 'He').sort((a, b) => (made[b] ?? 0) - (made[a] ?? 0));
    fill(gives,
      h('p', null, `${solarMasses(total)} goes back into space${track.remnant.kind === 'nothing' ? ': the whole star' : ''}, to be built into new stars and planets.${madeList.length ? ` New from this star: ${madeList.slice(0, 4).map((e) => ELEMENT_NAMES[e].toLowerCase()).join(', ')}.` : ''}`),
      h('ul', { class: 'lab-yields' }, rows.map((r) => h('li', null,
        h('span', { class: `lab-swatch el-${r.e}` }),
        h('span', { class: 'lab-yield-name' }, ELEMENT_NAMES[r.e]),
        h('span', { class: 'lab-yield-bar' }, (() => {
          const b = h('span', { class: `el-${r.e}` });
          b.style.width = `${Math.max(2, (Math.log10(r.m / total) + 5) / 5 * 100)}%`;
          return b;
        })()),
        h('span', { class: 'lab-yield-mass' }, r.m >= 0.01 ? solarMasses(r.m) : earthMasses(r.m), r.n > r.m * 0.2 ? h('span', { class: 'tag up' }, 'made here') : null)))),
      h('p', { class: 'hint' }, 'M☉ is the mass of the Sun, 333,000 Earths. Bars are on a log scale. Traces such as barium, lead, calcium and gold are in “Everything else”.'));
  }

  // ------------------------------------------------------------ drawing

  function starColour(T: number, a = 1): string {
    const [r, g, b] = blackbodyRGB(T);
    return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
  }

  function drawView(st: StarState) {
    const p = prepare(view);
    if (!p) return;
    const { g, w, h: H } = p;
    const pal = palette(view);
    const cx = w / 2, cy = H / 2;
    const maxR = H * 0.46;
    const px = (R: number) => Math.min(maxR, Math.max(1.6, 18 + 24 * Math.log10(Math.max(R, 1e-9))));
    const id = st.stage.id;
    const ring = (r: number, label: string) => {
      if (r > maxR * 1.02 || r < 4) return;
      g.setLineDash([3, 4]); g.strokeStyle = pal.faint; g.lineWidth = 1;
      g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
      g.fillStyle = pal.faint; g.font = `12px ${pal.font}`; g.textAlign = 'left';
      g.fillText(label, cx + r * 0.72 + 4, cy - r * 0.72 - 4);
    };
    const sinceDeath = st.stage.end === Infinity ? st.age - st.stage.start : -1;
    // A supernova flash just after core collapse.
    if (track.ending.explodes && sinceDeath >= 0 && sinceDeath < 4e6 && id !== 'whiteDwarf') {
      const f = sinceDeath / 4e6;
      const r = maxR * (0.3 + 0.9 * f);
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, starColour(40000, 0.9 * (1 - f)));
      grad.addColorStop(0.4, starColour(9000, 0.45 * (1 - f)));
      grad.addColorStop(1, starColour(9000, 0));
      g.fillStyle = grad; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    }
    if (id === 'nothing') {
      g.strokeStyle = pal.accent; g.globalAlpha = 0.5; g.lineWidth = 1.5;
      for (const k of [0.5, 0.7, 0.9]) { g.beginPath(); g.arc(cx, cy, maxR * k, 0, Math.PI * 2); g.stroke(); }
      g.globalAlpha = 1;
      return;
    }
    if (id === 'pn') {
      const r = maxR * (0.4 + 0.5 * st.u);
      // Glowing oxygen and hydrogen in a thin shell.
      g.globalAlpha = 0.45 * (1 - st.u * 0.6);
      g.strokeStyle = token(view, '--lab-nebula'); g.lineWidth = r * 0.22;
      g.beginPath(); g.arc(cx, cy, r * 0.85, 0, Math.PI * 2); g.stroke();
      g.strokeStyle = token(view, '--lab-nebula-edge'); g.lineWidth = r * 0.06;
      g.beginPath(); g.arc(cx, cy, r * 0.98, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 1;
    }
    const r = px(st.R);
    const rings = () => {
      ring(px(1), 'Sun');
      if (st.R > 30) ring(px(AU), 'Earth’s orbit');
    };
    if (id === 'blackHole') {
      const rr = Math.max(r, 5);
      const glow = g.createRadialGradient(cx, cy, rr, cx, cy, rr * 2.4);
      glow.addColorStop(0, pal.accent); glow.addColorStop(1, starColour(10000, 0));
      g.globalAlpha = 0.5; g.fillStyle = glow; g.beginPath(); g.arc(cx, cy, rr * 2.4, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
      g.fillStyle = token(view, '--lab-void'); g.beginPath(); g.arc(cx, cy, rr, 0, Math.PI * 2); g.fill();
      rings();
      return;
    }
    const haloR = Math.min(r * 2.2 + 6, H / 2);
    const halo = g.createRadialGradient(cx, cy, r * 0.6, cx, cy, haloR);
    halo.addColorStop(0, starColour(st.T, 0.35)); halo.addColorStop(1, starColour(st.T, 0));
    g.fillStyle = halo; g.beginPath(); g.arc(cx, cy, haloR, 0, Math.PI * 2); g.fill();
    const body = g.createRadialGradient(cx - r * 0.25, cy - r * 0.25, r * 0.1, cx, cy, r);
    body.addColorStop(0, starColour(st.T + 1500, 1)); body.addColorStop(1, starColour(st.T * 0.85, 1));
    g.fillStyle = body; g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
    rings();
  }

  // HR diagram axes: log T from 200,000 K (left) to 2,500 K, log L from 10^-4.6 to 10^7.4.
  const HR = { t0: 5.3, t1: 3.38, l0: -4.6, l1: 7.4 };

  function hrPoints() {
    const key = `${mass}|${feh}`;
    if (hrCache?.key === key) return hrCache.pts;
    const pts: { lT: number; lL: number; age: number }[][] = [];
    for (const s of track.stages) {
      if (s.id === 'neutronStar' || s.id === 'blackHole' || s.id === 'nothing') continue;
      const line: { lT: number; lL: number; age: number }[] = [];
      const n = s.id === 'ms' ? 30 : 24;
      for (let k = 0; k <= n; k++) {
        const age = s.end === Infinity ? s.start + REMNANT_SPAN * (k / n) ** 2 : s.start + (s.end - s.start) * (k / n);
        const st = stateAt(track, age);
        line.push({ lT: Math.log10(st.T), lL: Math.log10(st.L), age });
      }
      pts.push(line);
    }
    hrCache = { key, pts };
    return pts;
  }

  function drawHR(st: StarState) {
    const p = prepare(hr);
    if (!p) return;
    const { g, w, h: H } = p;
    const pal = palette(hr);
    const left = 34, right = 8, top = 8, bottom = 22;
    const x = (lT: number) => left + ((HR.t0 - lT) / (HR.t0 - HR.t1)) * (w - left - right);
    const y = (lL: number) => top + ((HR.l1 - lL) / (HR.l1 - HR.l0)) * (H - top - bottom);
    g.font = `11px ${pal.font}`;
    g.fillStyle = pal.faint; g.strokeStyle = pal.faint; g.lineWidth = 1;
    // Axes and ticks.
    g.globalAlpha = 0.25;
    for (const lL of [-4, -2, 0, 2, 4, 6]) { g.beginPath(); g.moveTo(left, y(lL)); g.lineTo(w - right, y(lL)); g.stroke(); }
    g.globalAlpha = 1;
    g.textAlign = 'right'; g.textBaseline = 'middle';
    for (const [lL, t] of [[-4, '10⁻⁴'], [-2, '0.01'], [0, '1'], [2, '100'], [4, '10⁴'], [6, '10⁶']] as [number, string][]) g.fillText(t, left - 5, y(lL));
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    for (const [T, t] of [[100000, '100,000 K'], [20000, '20,000'], [10000, '10,000'], [5000, '5,000'], [3000, '3,000']] as [number, string][]) g.fillText(t, x(Math.log10(T)), H - 6);
    // Background: colour band of temperature along the bottom.
    for (let i = 0; i < 40; i++) {
      const lT = HR.t0 - (i / 40) * (HR.t0 - HR.t1);
      g.fillStyle = starColour(10 ** lT, 0.5);
      g.fillRect(x(lT), H - bottom, (w - left - right) / 40 + 1, 3);
    }
    // The zero-age main sequence for this metallicity.
    const Z = metallicity(feh);
    g.setLineDash([2, 4]); g.strokeStyle = pal.text; g.globalAlpha = 0.45; g.beginPath();
    for (let i = 0; i <= 60; i++) {
      const m = MASS_MIN * (MASS_MAX / MASS_MIN) ** (i / 60);
      const L = zamsLuminosity(m, Z), T = temperatureFrom(L, zamsRadius(m, Z));
      const X = x(Math.log10(T)), Y = y(Math.log10(L));
      if (i) g.lineTo(X, Y); else g.moveTo(X, Y);
    }
    g.stroke(); g.setLineDash([]); g.globalAlpha = 1;
    g.fillStyle = pal.faint; g.textAlign = 'left';
    g.save(); g.translate(x(4.35), y(3.3)); g.rotate(-0.62); g.fillText('main sequence', 0, 0); g.restore();
    // The Sun.
    g.strokeStyle = pal.text; g.beginPath(); g.arc(x(Math.log10(5772)), y(0), 3.5, 0, Math.PI * 2); g.stroke();
    g.fillStyle = pal.text; g.fillText('Sun', x(Math.log10(5772)) + 6, y(0) + 12);
    // The track: lived part in the accent colour.
    const pts = hrPoints();
    for (const line of pts) {
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1], b = line[k];
        g.strokeStyle = b.age <= st.age ? pal.accent : pal.faint;
        g.lineWidth = b.age <= st.age ? 2 : 1.2;
        g.globalAlpha = b.age <= st.age ? 1 : 0.6;
        g.beginPath(); g.moveTo(x(a.lT), y(a.lL)); g.lineTo(x(b.lT), y(b.lL)); g.stroke();
      }
    }
    g.globalAlpha = 1;
    // A real star where it was measured.
    if (seed?.L && seed.T) {
      const sx = x(Math.log10(seed.T)), sy = y(Math.log10(seed.L));
      g.strokeStyle = pal.good; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(sx - 5, sy); g.lineTo(sx + 5, sy); g.moveTo(sx, sy - 5); g.lineTo(sx, sy + 5); g.stroke();
      g.fillStyle = pal.good; g.textAlign = sx > w * 0.7 ? 'right' : 'left';
      g.fillText(seed.name, sx + (sx > w * 0.7 ? -8 : 8), sy - 8);
    }
    // Now.
    if (st.T > 0 && st.L > 1e-8 && st.stage.id !== 'neutronStar') {
      const lT = Math.min(HR.t0, Math.max(HR.t1, Math.log10(st.T)));
      const lL = Math.min(HR.l1, Math.max(HR.l0, Math.log10(st.L)));
      g.fillStyle = starColour(st.T); g.beginPath(); g.arc(x(lT), y(lL), 5, 0, Math.PI * 2); g.fill();
      g.strokeStyle = pal.text; g.lineWidth = 1.5; g.beginPath(); g.arc(x(lT), y(lL), 8, 0, Math.PI * 2); g.stroke();
    }
  }

  function applySeed(s: StarSeed) {
    seed = s;
    const t = evolve(s.mass, s.feh);
    setStar(s.mass, s.feh, s.age !== undefined ? positionOfAge(t, s.age) : 0);
  }

  window.addEventListener('resize', () => { if (el.isConnected) renderTime(); });

  setStar(mass, feh, pos);
  return {
    title: 'Star lab',
    el,
    refresh: () => { renderStatic(); renderTime(); },
    seed(s) {
      setPlaying(false);
      if (s) applySeed(s);
      else { seed = null; renderStatic(); renderTime(); }
    },
  };
}

function token(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function article(name: string): string {
  const n = name.charAt(0).toLowerCase() + name.slice(1);
  if (/^main sequence/.test(n)) return 'still on the main sequence';
  if (/^white dwarf|^neutron|^black/.test(n)) return `already a ${n}`;
  return `${/^[aeiou]/.test(n) ? 'an' : 'a'} ${n}`;
}
