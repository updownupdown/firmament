// How the drawn lines look: the constellation figures and the orbits, set in
// View. Neutral is the original single periwinkle. The other two colour-code
// them (cool figures, warm orbits) so the two never read as each other: one
// lifts the figures, the other sinks them back behind the stars.

export type LineStyleId = 'neutral' | 'vivid' | 'subtle';

export interface LineStyle {
  id: LineStyleId;
  name: string;
  hint: string;
  /** Figure colour (null keeps the theme's line colour), opacity multiplier and width multiplier. */
  figure: [number, number, number] | null;
  figureAlpha: number;
  figureWidth: number;
  /** Orbit colour (null keeps each planet's tint on the sky and the line colour in space) and opacity multiplier. */
  orbit: [number, number, number] | null;
  orbitAlpha: number;
}

export const LINE_STYLES: LineStyle[] = [
  { id: 'neutral', name: 'Neutral', hint: 'One soft blue for every line', figure: null, figureAlpha: 1, figureWidth: 1, orbit: null, orbitAlpha: 1 },
  { id: 'vivid', name: 'Bold figures', hint: 'Bright blue figures, golden orbits', figure: [0.45, 0.78, 1], figureAlpha: 1.9, figureWidth: 1.35, orbit: [1, 0.74, 0.36], orbitAlpha: 1.25 },
  { id: 'subtle', name: 'Quiet figures', hint: 'Faint grey figures, golden orbits', figure: [0.72, 0.76, 0.86], figureAlpha: 0.6, figureWidth: 0.85, orbit: [1, 0.74, 0.36], orbitAlpha: 1.1 },
];

export function lineStyle(id: string | undefined): LineStyle {
  return LINE_STYLES.find((s) => s.id === id) ?? LINE_STYLES[0];
}
