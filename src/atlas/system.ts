// The Solar System as a list, from the Sun out to the edge of the Oort
// cloud: the Atlas's first page. Not to scale. Each planet is followed by its
// moons, each belt or cloud by the bodies that live in it, indented one step.

import { REGIONS } from '../astro/populations.ts';

export type SystemKind = 'star' | 'planet' | 'home' | 'dwarf' | 'small' | 'moon' | 'belt' | 'comet';

export interface SystemNode {
  /** Atlas reference; null for the Earth, which has no page (you are standing on it). */
  ref: string | null;
  kind: SystemKind;
  /** 0 for things that circle the Sun on their own, 1 for moons and belt members. */
  depth: 0 | 1;
  /** Typical distance from the Sun in AU (the semi-major axis, or a belt's inner edge), for ordering and the label. */
  au: number;
  /** The distance label: AU from the Sun, or km from the planet for a moon. */
  distance: string;
  /** Colour token for the dot, a CSS custom property name. */
  tint?: string;
  /** Name when the ref does not give one (the Earth). */
  name?: string;
  /** Short note in place of the object's subtitle. */
  note?: string;
}

const region = (id: string) => REGIONS.find((r) => r.id === id)!;
const span = (id: string) => {
  const r = region(id);
  const f = (x: number) => x.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${f(r.inner)}–${f(r.outer)} AU`;
};
const au = (x: number) => `${x < 10 ? x.toFixed(2) : x.toLocaleString('en-US', { maximumFractionDigits: 1 })} AU`;
const km = (x: number) => `${x.toLocaleString('en-US')} km`;

const body = (ref: string, kind: SystemKind, a: number, tint?: string, note?: string): SystemNode =>
  ({ ref, kind, depth: 0, au: a, distance: au(a), tint, note });
const moon = (ref: string, from: number, at: number, note?: string): SystemNode =>
  ({ ref, kind: 'moon', depth: 1, au: at, distance: km(from), note });
const member = (ref: string, kind: SystemKind, a: number, note?: string): SystemNode =>
  ({ ref, kind, depth: 1, au: a, distance: au(a), note });
const belt = (id: string, note?: string): SystemNode =>
  ({ ref: `region:${id}`, kind: 'belt', depth: 0, au: region(id).inner, distance: span(id), note });

/**
 * Semi-major axes from JPL's planetary and small-body elements (rounded);
 * moon distances are mean orbital radii.
 */
export const SOLAR_SYSTEM: SystemNode[] = [
  { ref: 'sun', kind: 'star', depth: 0, au: 0, distance: 'Centre', tint: '--sys-sun' },
  body('mercury', 'planet', 0.387, '--sys-mercury'),
  body('venus', 'planet', 0.723, '--sys-venus'),
  { ref: null, name: 'Earth', kind: 'home', depth: 0, au: 1, distance: '1.00 AU', tint: '--sys-earth', note: 'You are here' },
  moon('moon', 384_400, 1),
  body('mars', 'planet', 1.524, '--sys-mars'),
  moon('phobos', 9_376, 1.524),
  moon('deimos', 23_458, 1.524),
  belt('main-belt'),
  member('vesta', 'small', 2.362),
  member('ceres', 'dwarf', 2.766),
  member('pallas', 'small', 2.773),
  member('hygiea', 'small', 3.139),
  body('jupiter', 'planet', 5.203, '--sys-jupiter'),
  moon('amalthea', 181_366, 5.203),
  moon('thebe', 221_889, 5.203),
  moon('io', 421_700, 5.203),
  moon('europa', 671_034, 5.203),
  moon('ganymede', 1_070_412, 5.203),
  moon('callisto', 1_882_709, 5.203),
  moon('himalia', 11_461_000, 5.203),
  moon('elara', 11_741_000, 5.203),
  { ...belt('trojans'), depth: 1, note: 'Sharing Jupiter\'s orbit' },
  body('saturn', 'planet', 9.537, '--sys-saturn'),
  moon('janus', 151_460, 9.537),
  moon('epimetheus', 151_410, 9.537),
  moon('mimas', 185_539, 9.537),
  moon('enceladus', 237_948, 9.537),
  moon('tethys', 294_619, 9.537),
  moon('dione', 377_396, 9.537),
  moon('rhea', 527_108, 9.537),
  moon('titan', 1_221_870, 9.537),
  moon('hyperion', 1_481_010, 9.537),
  moon('iapetus', 3_560_820, 9.537),
  moon('phoebe', 12_947_918, 9.537),
  body('uranus', 'planet', 19.19, '--sys-uranus'),
  moon('puck', 86_004, 19.19),
  moon('miranda', 129_390, 19.19),
  moon('ariel', 190_900, 19.19),
  moon('umbriel', 266_000, 19.19),
  moon('titania', 435_910, 19.19),
  moon('oberon', 583_520, 19.19),
  body('neptune', 'planet', 30.07, '--sys-neptune'),
  moon('proteus', 117_647, 30.07),
  moon('triton', 354_759, 30.07),
  moon('nereid', 5_513_818, 30.07),
  { ...belt('kuiper'), au: 39 },
  member('orcus', 'small', 39.17),
  member('pluto', 'dwarf', 39.48),
  { ...moon('charon', 19_591, 39.48), depth: 1 },
  { ...moon('nix', 48_694, 39.48), depth: 1 },
  { ...moon('hydra', 64_738, 39.48), depth: 1 },
  member('haumea', 'dwarf', 43.12),
  member('quaoar', 'small', 43.69),
  member('makemake', 'dwarf', 45.43),
  { ...belt('scattered'), au: 50 },
  member('halley', 'comet', 17.83, 'Born out here; back every 76 years'),
  member('gonggong', 'small', 67.49),
  member('eris', 'dwarf', 67.86),
  body('sedna', 'small', 506, undefined, 'Detached: never comes near Neptune'),
  belt('oort'),
  member('halebopp', 'comet', 186, 'Fell in from here; back in about 2,400 years'),
];
