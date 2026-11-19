// What the camera can do with an object from where it is now: look at it, fly
// to it, stand on it. The focus card's ⋯ menu names them; every move is one
// flight (app.ts). Where to go without an object is the Where panel (where.ts).

import type { App } from '../app.ts';

export interface Verb {
  id: 'look' | 'fly' | 'stand';
  label: string;
  glyph: string;
  run: () => void;
}

/** What the camera can do with an object from where it is now. */
export function verbsFor(app: App, ref: string): Verb[] {
  const out: Verb[] = [];
  const region = ref.startsWith('region:');
  const obj = app.universe.resolve(ref);
  // Looking at a belt or cloud from the ground shows nothing: it is seen from outside.
  const underfoot = app.mode === 'sky' && ref === app.universe.world;
  if (!region && obj && !underfoot) out.push({ id: 'look', label: 'Look at it', glyph: 'eye', run: () => app.lookAt(ref) });
  // Already circling it: nothing to fly to.
  const circling = app.mode === 'space' && app.space.camera.focus === ref;
  if (app.canFlyTo(ref) && !circling) out.push({ id: 'fly', label: 'Fly to it', glyph: 'rocket', run: () => app.flyToObject(ref) });
  if (app.canStandOn(ref)) out.push({ id: 'stand', label: 'Stand on it', glyph: 'globe', run: () => app.standOn(ref) });
  return out;
}
