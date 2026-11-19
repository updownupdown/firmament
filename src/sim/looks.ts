// Looks: ready-made sets of sky layers for a purpose, so a newcomer gets a
// useful sky in one tap. Each look sets every sky layer; Space view layers are
// left alone.

import type { LayerFlags } from './scene.ts';

/** The layers that belong to the sky from the ground. */
export const SKY_LAYERS: (keyof LayerFlags)[] = [
  'lines', 'art', 'constellationLabels', 'starLabels', 'planetLabels', 'dsos', 'dsoPhotos', 'milkyWay', 'skyOrbits', 'boundaries',
  'gridAltAz', 'gridEquatorial', 'ecliptic', 'gridGalactic', 'cardinals', 'atmosphere', 'ground',
];

export interface Look {
  id: string;
  name: string;
  /** What it is for, in a few words. */
  hint: string;
  on: (keyof LayerFlags)[];
}

const AIR: (keyof LayerFlags)[] = ['atmosphere', 'ground', 'cardinals'];

export const LOOKS: Look[] = [
  { id: 'eye', name: 'Naked eye', hint: 'Just the sky, as your eyes see it', on: ['milkyWay', 'dsoPhotos', ...AIR] },
  { id: 'stargazer', name: 'Stargazer', hint: 'Figures and names', on: ['lines', 'constellationLabels', 'starLabels', 'planetLabels', 'dsos', 'dsoPhotos', 'milkyWay', ...AIR] },
  { id: 'planets', name: 'Planets', hint: 'The ecliptic and their paths', on: ['planetLabels', 'ecliptic', 'skyOrbits', 'milkyWay', ...AIR] },
  { id: 'chart', name: 'Star chart', hint: 'Borders, grid and every name', on: ['lines', 'constellationLabels', 'boundaries', 'starLabels', 'planetLabels', 'dsos', 'gridEquatorial', ...AIR] },
  { id: 'navigator', name: 'Navigator', hint: 'Altitude grid and bright stars', on: ['gridAltAz', 'starLabels', 'planetLabels', 'milkyWay', ...AIR] },
];

/** The sky layers a look sets, on and off. */
export function lookLayers(look: Look): Partial<LayerFlags> {
  const out: Partial<LayerFlags> = {};
  for (const k of SKY_LAYERS) out[k] = look.on.includes(k);
  return out;
}

/** The look the layers match exactly, if any. */
export function currentLook(layers: LayerFlags): Look | null {
  return LOOKS.find((l) => SKY_LAYERS.every((k) => layers[k] === l.on.includes(k))) ?? null;
}
