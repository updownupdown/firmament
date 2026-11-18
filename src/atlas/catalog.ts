// The Atlas: every object in the app, sorted into categories a reader can
// browse. Entries are built from the simulation's own data, so the numbers on
// an entry are the ones the sky uses. No DOM here, so it can be tested in Node.

import { SOLAR_BODIES } from '../astro/ephemeris.ts';
import { METEOR_SHOWERS, type MeteorShower } from '../astro/events.ts';
import { GALILEAN } from '../astro/galilean.ts';
import { SMALL_BODIES } from '../astro/kepler.ts';
import { REGIONS } from '../astro/populations.ts';
import { DSO_TYPES } from '../data/types.ts';
import type { CultureInfo } from '../data/types.ts';
import { STAR_LORE } from '../sim/lore.ts';
import { type Universe, dsoId, starRef } from '../sim/universe.ts';

/** One line in a category list. `ref` is a sky reference, or `shower:<id>` / `culture:<id>`. */
export interface AtlasEntry {
  ref: string;
  name: string;
  subtitle: string;
}

/** A run of entries under a small heading inside a category. */
export interface AtlasGroup {
  title?: string;
  entries: AtlasEntry[];
}

export interface AtlasCategory {
  id: string;
  title: string;
  /** One sentence under the title. */
  blurb: string;
  /** Icon name from `ui/dom.ts`. */
  icon: string;
  groups(u: Universe): AtlasGroup[];
}

const PLANETS = ['mercury', 'venus', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune'];
const CLUSTER_TYPES = new Set(['oc', 'gc', 'pos']);
const NEBULA_TYPES = new Set(['snr', 'sfr', 'pn', 'rn', 'en', 'bn', 'dn']);
const GALAXY_TYPES = new Set(['s', 'e', 'i', 'sd', 'g', 's0']);

/** Stars nearer than this many parsecs make the "Nearest" list (about 16 light years). */
const NEAREST_PC = 5;

const entry = (u: Universe, ref: string): AtlasEntry | null => {
  const o = u.resolve(ref);
  return o ? { ref: o.ref, name: o.name, subtitle: o.subtitle } : null;
};
const entries = (u: Universe, refs: string[]): AtlasEntry[] => refs.map((r) => entry(u, r)).filter((e) => !!e);

/** Deep-sky entries of some types, Messier objects first in catalogue order, then by brightness. */
function dsoEntries(u: Universe, types: Set<string>): AtlasGroup[] {
  const list = u.dsos.filter((d) => types.has(d.t));
  const messier = list.filter((d) => d.mes).sort((a, b) => Number(a.mes!.slice(1)) - Number(b.mes!.slice(1)));
  const other = list.filter((d) => !d.mes).sort((a, b) => a.m - b.m);
  const groups: AtlasGroup[] = [];
  if (messier.length) groups.push({ title: 'Messier objects', entries: entries(u, messier.map((d) => `dso:${dsoId(d)}`)) });
  if (other.length) groups.push({ title: 'More to find', entries: entries(u, other.map((d) => `dso:${dsoId(d)}`)) });
  return groups;
}

export const ATLAS_CATEGORIES: AtlasCategory[] = [
  {
    id: 'sun', title: 'The Sun', icon: 'sun', blurb: 'The star at the centre of it all.',
    groups: (u) => [{ entries: entries(u, ['sun']) }],
  },
  {
    id: 'planets', title: 'Planets', icon: 'planet', blurb: 'The seven other worlds that circle the Sun with us.',
    groups: (u) => [{ entries: entries(u, PLANETS) }],
  },
  {
    id: 'moons', title: 'Moons', icon: 'moon', blurb: 'Our Moon, and the four big moons Galileo found around Jupiter.',
    groups: (u) => [
      { title: 'Earth', entries: entries(u, ['moon']) },
      { title: 'Jupiter', entries: entries(u, GALILEAN.map((m) => m.id)) },
    ],
  },
  {
    id: 'small', title: 'Dwarf planets and asteroids', icon: 'planet', blurb: 'Pluto and the other small worlds, from the asteroid belt to the far edge.',
    groups: (u) => {
      const ids = [...SOLAR_BODIES.filter((id) => id === 'pluto'), ...SMALL_BODIES.filter((b) => b.kind !== 'comet').map((b) => b.id)];
      return [
        { title: 'Dwarf planets', entries: entries(u, ids.filter((id) => u.resolve(id)?.kind === 'dwarf')) },
        { title: 'Asteroids and other small bodies', entries: entries(u, ids.filter((id) => u.resolve(id)?.kind === 'minor')) },
      ].filter((g) => g.entries.length);
    },
  },
  {
    id: 'comets', title: 'Comets', icon: 'comet', blurb: 'Icy visitors on long, stretched orbits.',
    groups: (u) => [{ entries: entries(u, SMALL_BODIES.filter((b) => b.kind === 'comet').map((b) => b.id)) }],
  },
  {
    id: 'regions', title: 'Belts and clouds', icon: 'belt', blurb: 'Where the small bodies live: the asteroid belt out to the Oort cloud.',
    groups: (u) => [{ entries: entries(u, REGIONS.map((r) => `region:${r.id}`)) }],
  },
  {
    id: 'stars', title: 'Stars', icon: 'star', blurb: 'The brightest, the nearest, and the ones with stories.',
    groups: (u) => {
      const s = u.stars;
      const named: number[] = [];
      for (const [i, meta] of s.meta) if (meta.n && i < s.count) named.push(i);
      const byMag = (a: number, b: number) => s.mag[a] - s.mag[b];
      const brightest = named.filter((i) => s.mag[i] < 1.6 && s.hip[i]).sort(byMag);
      const near: number[] = [];
      for (let i = 0; i < s.count; i++) if (s.dist[i] > 0 && s.dist[i] < NEAREST_PC && s.hip[i]) near.push(i);
      near.sort((a, b) => s.dist[a] - s.dist[b]);
      const seen = new Set([...brightest, ...near]);
      const storied = Object.keys(STAR_LORE).map((hip) => s.hipIndex.get(Number(hip)))
        .filter((i): i is number => i !== undefined && !seen.has(i)).sort(byMag);
      for (const i of storied) seen.add(i);
      const more = named.filter((i) => !seen.has(i) && s.mag[i] < 3).sort(byMag);
      const refs = (list: number[]) => entries(u, list.map((i) => starRef(s, i)));
      return [
        { title: 'Brightest', entries: refs(brightest) },
        { title: 'Nearest', entries: refs(near) },
        { title: 'With a story', entries: refs(storied) },
        { title: 'More named stars', entries: refs(more) },
      ].filter((g) => g.entries.length);
    },
  },
  {
    id: 'constellations', title: 'Constellations', icon: 'figures', blurb: 'The 88 official constellations, and familiar patterns inside them.',
    groups: (u) => {
      const western = u.cultures.get('western');
      if (!western) return [];
      const byName = (a: AtlasEntry, b: AtlasEntry) => a.name.localeCompare(b.name);
      const list = (asterism: boolean) => western.constellations.filter((c) => !!c.asterism === asterism)
        .map((c) => entry(u, `con:western:${c.id}`)).filter((e) => !!e).sort(byName);
      const iau = list(false), asterisms = list(true);
      return [{ title: 'Constellations', entries: iau }, { title: 'Asterisms', entries: asterisms }].filter((g) => g.entries.length);
    },
  },
  {
    id: 'clusters', title: 'Star clusters', icon: 'cluster', blurb: 'Families of stars born together, from loose groups to dense balls.',
    groups: (u) => dsoEntries(u, CLUSTER_TYPES),
  },
  {
    id: 'nebulae', title: 'Nebulae', icon: 'nebula', blurb: 'Clouds of gas and dust where stars are born, and where they end.',
    groups: (u) => dsoEntries(u, NEBULA_TYPES),
  },
  {
    id: 'galaxies', title: 'Galaxies', icon: 'galaxy', blurb: 'Other islands of stars, millions of light years away.',
    groups: (u) => dsoEntries(u, GALAXY_TYPES),
  },
  {
    id: 'showers', title: 'Meteor showers', icon: 'meteor', blurb: 'Nights when Earth runs through a comet\'s trail.',
    groups: () => [{ entries: METEOR_SHOWERS.map(showerEntry) }],
  },
  {
    id: 'cultures', title: 'Sky cultures', icon: 'names', blurb: 'The same stars, as different peoples drew them.',
    groups: (u) => [{ entries: u.cultureIndex.map(cultureEntry) }],
  },
];

/** The constellation each shower's radiant lies in (IAU abbreviation), for "Show me". */
export const SHOWER_RADIANT: Record<string, string> = {
  qua: 'Boo', lyr: 'Lyr', eta: 'Aqr', sda: 'Aqr', per: 'Per', dra: 'Dra', ori: 'Ori', leo: 'Leo', gem: 'Gem', urs: 'UMi',
};

export function showerEntry(s: MeteorShower): AtlasEntry {
  return { ref: `shower:${s.id}`, name: s.name, subtitle: `Meteor shower · up to ${s.zhr} an hour` };
}

export function cultureEntry(c: CultureInfo): AtlasEntry {
  return { ref: `culture:${c.id}`, name: c.name, subtitle: `Sky culture · ${c.region} · ${c.count} figures` };
}

export function findShower(ref: string): MeteorShower | undefined {
  return ref.startsWith('shower:') ? METEOR_SHOWERS.find((s) => s.id === ref.slice(7)) : undefined;
}

export function findCultureInfo(u: Universe, ref: string): CultureInfo | undefined {
  return ref.startsWith('culture:') ? u.cultureIndex.find((c) => c.id === ref.slice(8)) : undefined;
}

export function categoryById(id: string): AtlasCategory | undefined {
  return ATLAS_CATEGORIES.find((c) => c.id === id);
}

/** Which category an object belongs to, from its reference. */
export function categoryOf(u: Universe, ref: string): AtlasCategory | undefined {
  const id = (() => {
    if (ref.startsWith('shower:')) return 'showers';
    if (ref.startsWith('culture:')) return 'cultures';
    if (ref.startsWith('region:')) return 'regions';
    if (ref.startsWith('con:')) return 'constellations';
    if (ref.startsWith('star') || ref.startsWith('tyc:')) return 'stars';
    const o = u.resolve(ref);
    if (!o) return undefined;
    if (o.dso) return CLUSTER_TYPES.has(o.dso.t) ? 'clusters' : NEBULA_TYPES.has(o.dso.t) ? 'nebulae' : 'galaxies';
    switch (o.kind) {
      case 'sun': return 'sun';
      case 'planet': return 'planets';
      case 'moon': case 'satellite': return 'moons';
      case 'comet': return 'comets';
      case 'dwarf': case 'minor': return 'small';
      default: return undefined;
    }
  })();
  return id ? categoryById(id) : undefined;
}

/** Everything in a category, flattened. */
export function categoryEntries(u: Universe, c: AtlasCategory): AtlasEntry[] {
  const seen = new Set<string>();
  return c.groups(u).flatMap((g) => g.entries).filter((e) => !seen.has(e.ref) && !!seen.add(e.ref));
}

/** Name and subtitle for any Atlas reference. */
export function atlasEntry(u: Universe, ref: string): AtlasEntry | null {
  const shower = findShower(ref);
  if (shower) return showerEntry(shower);
  const culture = findCultureInfo(u, ref);
  if (culture) return cultureEntry(culture);
  return entry(u, ref);
}

/** Search the Atlas's own entries that the Universe's search does not cover (showers, cultures, categories). */
export function searchExtras(u: Universe, q: string): (AtlasEntry & { category?: string })[] {
  const n = q.trim().toLowerCase();
  if (n.length < 2) return [];
  const match = (s: string) => s.toLowerCase().split(/[\s–-]+/).some((w) => w.startsWith(n)) || s.toLowerCase().startsWith(n);
  const out: (AtlasEntry & { category?: string })[] = [];
  for (const c of ATLAS_CATEGORIES) if (match(c.title)) out.push({ ref: `category:${c.id}`, name: c.title, subtitle: c.blurb, category: c.id });
  for (const s of METEOR_SHOWERS) if (match(s.name)) out.push(showerEntry(s));
  for (const c of u.cultureIndex) if (match(c.name)) out.push(cultureEntry(c));
  return out;
}

/** Type words for a deep-sky code, for tests and the UI. */
export const dsoType = (t: string): string => DSO_TYPES[t] ?? 'Deep-sky object';
