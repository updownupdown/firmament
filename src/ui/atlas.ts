// The Atlas sheet: search, the categories of objects, an entry page for each
// object (live facts for your place and time, then the long read), the
// concepts (see concept.ts), and the labs. Reading happens here; "Show me" turns the sky to the object and, on a
// phone, steps back so the sky is in view. The object card's book button
// comes back to the same page.

import { articleFor } from '../atlas/articles.ts';
import {
  ATLAS_CATEGORIES, type AtlasCategory, type AtlasEntry, SHOWER_RADIANT, atlasEntry, categoryById, categoryEntries,
  categoryOf, findCultureInfo, findShower, searchExtras,
} from '../atlas/catalog.ts';
import { meteorShowers } from '../astro/events.ts';
import { DEG } from '../astro/math.ts';
import { loadCulture } from '../data/load.ts';
import { formatDate } from '../sim/format.ts';
import { loreFor } from '../sim/lore.ts';
import { starSeed } from '../sim/starlink.ts';
import type { SkyObject } from '../sim/universe.ts';
import { type Child, h, fill, icon } from './dom.ts';
import { blurb, detailFacts, quickFacts, riseSetFacts, whereNow, type Fact } from './facts.ts';
import { CONCEPTS, CONCEPT_GROUPS, type Concept, findConcept } from '../atlas/concepts.ts';
import { conceptPages } from './concept.ts';
import type { Panel, Shell } from './shell.ts';

type Tab = 'objects' | 'concepts' | 'labs';
const TAB_LABEL: Record<Tab, string> = { objects: 'Objects', concepts: 'Concepts', labs: 'Labs' };

type View =
  | { kind: 'home'; tab: Tab }
  | { kind: 'concept'; id: string }
  | { kind: 'category'; id: string }
  | { kind: 'entry'; ref: string };

export interface AtlasPanel extends Panel {
  /** Open an entry, a category, or the front page with the search field focused. */
  show(target: { ref: string } | { category: string } | { concept: string } | { search: true }): void;
}

export function atlasPanel(shell: Shell): AtlasPanel {
  const app = shell.app;
  const u = app.universe;
  const el = h('div', { class: 'panel atlas' });
  /** Everything below the search field, redrawn on each change; the field itself stays put so typing keeps focus. */
  const body = h('div', { class: 'panel atlas-body' });
  const input = h('input', {
    class: 'field', type: 'search', placeholder: 'Search: Mars, Vega, Orion, M31, Perseids…', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: false, 'aria-label': 'Search the Atlas', enterkeyhint: 'search',
  });
  /** Pages visited, so Back retraces them. */
  const stack: View[] = [{ kind: 'home', tab: 'objects' }];
  const view = () => stack[stack.length - 1];
  const scrollBody = () => el.closest('.sheet-body')?.scrollTo({ top: 0 });
  const go = (v: View) => { stack.push(v); render(); scrollBody(); };
  const back = () => { if (stack.length > 1) stack.pop(); render(); scrollBody(); };
  const cultureIntro = new Map<string, string>();
  /** Whether the full table of numbers is unfolded; kept across the minute-by-minute refresh. */
  let numbersOpen = false;

  const style = () => ({ hour12: app.store.data.settings.hour12 });
  const upTag = (ref: string) => {
    const o = u.resolve(ref);
    if (!o) return null;
    if (o.region) return h('span', { class: 'tag' }, 'Space view');
    if (o.constellation) return null;
    const up = u.horizontal(o.dir).altApparent > 0;
    return h('span', { class: `tag${up ? ' up' : ''}` }, up ? 'Up now' : 'Below horizon');
  };
  const row = (e: AtlasEntry, onClick: () => void) =>
    h('li', null, h('button', { class: 'result', type: 'button', onclick: onClick },
      h('span', { class: 'result-main' }, h('span', { class: 'result-name' }, e.name), h('span', { class: 'result-sub' }, e.subtitle)),
      /^(shower|culture|category|concept):/.test(e.ref) ? null : upTag(e.ref)));
  const open = (e: AtlasEntry) => {
    if (e.ref.startsWith('category:')) go({ kind: 'category', id: e.ref.slice(9) });
    else if (e.ref.startsWith('concept:')) go({ kind: 'concept', id: e.ref.slice(8) });
    else go({ kind: 'entry', ref: e.ref });
  };
  const backBar = (label: string) =>
    h('button', { class: 'link-button atlas-back', type: 'button', onclick: back }, icon('back', 16), label);

  // ------------------------------------------------------------ front page

  const searchResults = (q: string) => {
    const lq = q.toLowerCase();
    const concepts = lq.length < 3 ? [] : CONCEPTS.filter((c) => c.title.toLowerCase().includes(lq) || c.summary.toLowerCase().includes(lq))
      .map((c) => ({ ref: `concept:${c.id}`, name: c.title, subtitle: `Concept · ${c.group}` }));
    const extras = [...searchExtras(u, q), ...concepts];
    const hits = u.search(q, 24).map((x) => ({ ref: x.ref, name: x.name, subtitle: x.subtitle }));
    const all = [...extras, ...hits];
    return all.length
      ? h('ul', { class: 'result-list', role: 'list' }, all.map((e) => row(e, () => open(e))))
      : h('p', { class: 'hint' }, `Nothing found for “${q}”. Try a planet, a star, a constellation, or a number like M13.`);
  };

  const categoryTile = (c: AtlasCategory) => {
    const n = categoryEntries(u, c).length;
    return h('button', { class: 'card atlas-tile', type: 'button', onclick: () => go({ kind: 'category', id: c.id }) },
      icon(c.icon, 22),
      h('span', { class: 'row-name' }, c.title),
      h('span', { class: 'hint' }, n === 1 ? c.blurb : `${n} · ${c.blurb}`));
  };

  const conceptRow = (c: Concept) =>
    h('button', { class: 'card concept-item', type: 'button', onclick: () => go({ kind: 'concept', id: c.id }) },
      h('span', { class: 'row-name' }, c.title), h('span', { class: 'hint' }, c.summary));

  const labTile = (title: string, glyph: string, hint: string, onClick: () => void) =>
    h('button', { class: 'card lab-tile', type: 'button', onclick: onClick },
      icon(glyph, 24), h('span', { class: 'row-name' }, title), h('span', { class: 'hint' }, hint));

  const home = (tab: Tab) => {
    const q = input.value.trim();
    const tabs = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Atlas sections' },
      (['objects', 'concepts', 'labs'] as const).map((t) => h('button', {
        type: 'button', 'aria-pressed': String(t === tab),
        onclick: () => { stack[stack.length - 1] = { kind: 'home', tab: t }; render(); },
      }, TAB_LABEL[t])));
    if (q) return [searchResults(q)];
    if (tab === 'concepts') {
      return [tabs,
        h('p', { class: 'lede' }, 'The ideas behind the sky, each a long read with buttons that set the sky up to show it.'),
        CONCEPT_GROUPS.map((g) => {
          const list = CONCEPTS.filter((c) => c.group === g);
          return list.length ? h('section', { class: 'view-section' }, h('h4', { class: 'section-title' }, g), list.map(conceptRow)) : null;
        })];
    }
    if (tab === 'labs') {
      return [tabs, h('div', { class: 'lab-grid' },
        labTile('Star lab', 'star', 'Build a star and watch it live and die.', () => shell.openStarLab()),
        labTile('Trip planner', 'rocket', 'Plan a real trip to Mars, Venus or Jupiter and fly it.', () => shell.openLab('trip')),
        labTile('Slingshot', 'orbit', 'Steer Voyager 2 past Jupiter and out of the Solar System.', () => shell.openLab('slingshot')),
        labTile('What if?', 'orbit', 'Make Jupiter heavier or send a star through.', () => shell.openLab('whatif')))];
    }
    return [tabs, h('div', { class: 'atlas-grid' }, ATLAS_CATEGORIES.map(categoryTile))];
  };

  const concepts = conceptPages(shell, () => {
    const scroll = el.closest('.sheet-body')?.scrollTop ?? 0;
    render();
    el.closest('.sheet-body')?.scrollTo({ top: scroll });
  });

  const conceptPage = (id: string) => {
    const c = findConcept(id);
    if (!c) return [backBar('Back')];
    const rel = c.related.map((ref) => atlasEntry(u, ref)).filter((e): e is AtlasEntry => !!e);
    return [
      backBar('Back'),
      concepts.page(c),
      rel.length ? h('section', { class: 'view-section' }, h('h4', { class: 'section-title' }, 'In the Atlas'),
        h('div', { class: 'chips' }, rel.map((e) => h('button', { class: 'chip-button', type: 'button', onclick: () => open(e) }, e.name)))) : null,
    ];
  };

  /** Concepts that point at an object, for the foot of its page. */
  const conceptsAbout = (ref: string) => {
    const list = CONCEPTS.filter((c) => c.related.includes(ref));
    return list.length ? h('section', { class: 'view-section' }, h('h4', { class: 'section-title' }, 'Concepts'), list.map(conceptRow)) : null;
  };

  // ------------------------------------------------------------ category

  const category = (id: string) => {
    const c = categoryById(id);
    if (!c) return [backBar('Atlas')];
    return [
      backBar('Atlas'),
      h('header', { class: 'atlas-head' }, h('h3', { class: 'atlas-title' }, c.title), h('p', { class: 'lede' }, c.blurb)),
      c.groups(u).map((g) => h('section', { class: 'view-section' },
        g.title ? h('h4', { class: 'section-title' }, g.title) : null,
        h('ul', { class: 'result-list', role: 'list' }, g.entries.map((e) => row(e, () => open(e)))))),
    ];
  };

  // ------------------------------------------------------------ entry

  const factList = (facts: Fact[]) =>
    h('dl', { class: 'facts' }, facts.map((f) => h('div', { class: 'fact' }, h('dt', null, f.label), h('dd', null, f.value))));

  /** Turn the sky to an object, as search used to. */
  const showObject = (obj: SkyObject) => {
    if (obj.region) {
      shell.show({ select: obj.ref, camera: { mode: 'space', look: 'sun' } });
      app.centre(obj.ref);
      return;
    }
    const fov = Math.min(app.renderer.projection.fov, app.framingFov(obj.ref) * 4) / DEG;
    shell.show({ select: obj.ref, camera: { mode: 'sky', look: obj.ref, fov } });
  };

  const objectActions = (obj: SkyObject) => {
    const seed = obj.kind === 'sun' || obj.starIndex !== undefined ? starSeed(u, obj) : null;
    return h('div', { class: 'button-row' },
      h('button', { class: 'pill-button primary', type: 'button', onclick: () => showObject(obj) },
        icon(obj.region ? 'orbit' : 'sky', 16), obj.region ? 'Show in space' : 'Show in the sky'),
      seed ? h('button', { class: 'pill-button', type: 'button', onclick: () => shell.openStarLab(seed) }, icon('star', 16), 'Life story') : null);
  };

  const rightNow = (obj: SkyObject) => {
    if (obj.region) return h('section', { class: 'card atlas-now' }, h('span', { class: 'card-label' }, 'At a glance'), factList(obj.region.facts));
    const where = obj.constellation ? null : whereNow(u, obj, app.layers.atmosphere);
    const main = [...quickFacts(u, obj).filter((f) => f.label !== 'Altitude'), ...riseSetFacts(u, obj, app.clock.jdUT, style())];
    const rest = detailFacts(u, obj, style());
    const more = h('details', { class: 'atlas-more' }, h('summary', null, 'All the numbers'), factList(rest));
    (more as HTMLDetailsElement).open = numbersOpen;
    more.addEventListener('toggle', () => { numbersOpen = (more as HTMLDetailsElement).open; });
    return h('section', { class: 'card atlas-now' },
      h('span', { class: 'card-label' }, `Right now · ${app.site.name}`),
      where ? h('p', { class: 'atlas-where' }, where) : null,
      main.length ? factList(main) : null,
      rest.length ? more : null);
  };

  const readingFor = (obj: SkyObject) => {
    const article = articleFor(obj.ref);
    if (article) {
      return [
        h('p', { class: 'atlas-lede' }, article.lede),
        article.sections.map((s) => h('section', { class: 'atlas-section' },
          h('h4', { class: 'atlas-section-title' }, s.title), s.paragraphs.map((p) => h('p', null, p)))),
        sources(article.sources),
      ];
    }
    const lore = loreFor(u, obj, blurb);
    const about = blurb(obj);
    const paras = [about, lore.science && lore.science !== about ? lore.science : null].filter((p): p is string => !!p);
    if (!paras.length && !lore.story) return [];
    return [
      paras.length ? h('section', { class: 'atlas-section' }, h('h4', { class: 'atlas-section-title' }, 'About'), paras.map((p) => h('p', null, p))) : null,
      lore.story ? h('section', { class: 'atlas-section' }, h('h4', { class: 'atlas-section-title' }, 'The story'), h('p', null, lore.story)) : null,
    ];
  };

  const sources = (list: { title: string; url: string }[]) => list.length
    ? h('section', { class: 'atlas-sources' }, h('h4', { class: 'section-title' }, 'Sources'),
      h('ul', null, list.map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener' }, s.title)))))
    : null;

  const related = (ref: string) => {
    const c = categoryOf(u, ref);
    if (!c) return null;
    const list = categoryEntries(u, c);
    const at = list.findIndex((e) => e.ref === ref);
    const near = (at < 0 ? list.slice(0, 8) : [...list.slice(Math.max(0, at - 4), at), ...list.slice(at + 1, at + 5)]);
    if (!near.length) return null;
    return h('section', { class: 'view-section' }, h('h4', { class: 'section-title' }, `More ${c.title.toLowerCase()}`),
      h('div', { class: 'chips' }, near.map((e) => h('button', { class: 'chip-button', type: 'button', onclick: () => go({ kind: 'entry', ref: e.ref }) }, e.name))));
  };

  const header = (ref: string, name: string, subtitle: string) => {
    const c = categoryOf(u, ref);
    return h('header', { class: 'atlas-head' },
      c ? h('button', { class: 'link-button card-label atlas-kicker', type: 'button', onclick: () => go({ kind: 'category', id: c.id }) }, c.title) : null,
      h('h3', { class: 'atlas-title' }, name),
      h('p', { class: 'atlas-sub' }, subtitle));
  };

  const showerPage = (ref: string) => {
    const s = findShower(ref)!;
    const jd = app.clock.jdUT;
    const next = meteorShowers(u.eph, jd - 2, jd + 370).find((e) => e.data?.shower === s.id && e.t > jd - 2);
    const radiant = SHOWER_RADIANT[s.id];
    const conRef = radiant ? `con:western:${radiant}` : null;
    const con = conRef ? u.resolve(conRef) : null;
    return [
      header(ref, s.name, `Meteor shower · radiant in ${con?.name ?? 'the sky'}`),
      h('div', { class: 'button-row' },
        next && conRef ? h('button', { class: 'pill-button primary', type: 'button', onclick: () => {
          // The night of the peak, a little before dawn when the radiant is highest for most showers.
          shell.show({ time: { jd: next.t }, select: conRef, camera: { mode: 'sky', look: conRef, fov: 100 } });
        } }, icon('sky', 16), 'Show the peak') : null),
      h('section', { class: 'card atlas-now' },
        h('span', { class: 'card-label' }, 'At a glance'),
        factList([
          ...(next ? [{ label: 'Next peak', value: formatDate(next.t, u.site) }] : []),
          { label: 'Rate at best', value: `Up to ${s.zhr} an hour` },
          { label: 'Speed', value: `${s.speed} km/s` },
          { label: 'Parent', value: s.parent.charAt(0).toUpperCase() + s.parent.slice(1) },
          { label: 'Radiant', value: `${Math.floor(s.ra / 15)}h ${String(Math.round((s.ra / 15 % 1) * 60)).padStart(2, '0')}m, ${s.dec >= 0 ? '+' : '−'}${Math.abs(s.dec)}°` },
        ]),
        next ? h('p', { class: 'hint' }, next.detail) : null),
      h('section', { class: 'atlas-section' }, h('h4', { class: 'atlas-section-title' }, 'About'),
        h('p', null, `Every year Earth passes through the trail of dust left by ${s.parent}. The grains, most no bigger than sand, hit the air at ${s.speed} km/s and burn up 80 to 120 km overhead. Because they arrive on parallel paths, perspective makes them all seem to fan out from one point, the radiant, in ${con?.name ?? 'the sky'}.`),
        h('p', null, 'The rate is the zenithal hourly rate: what one observer would see under a perfectly dark sky with the radiant overhead. Real counts are lower, especially with moonlight or city lights. Look away from the radiant, about 40° to one side, where trails are longer.')),
    ];
  };

  const culturePage = (ref: string) => {
    const info = findCultureInfo(u, ref)!;
    const intro = cultureIntro.get(info.id) ?? u.cultures.get(info.id)?.intro;
    if (intro === undefined) {
      loadCulture(info.id).then((c) => { cultureIntro.set(info.id, c.intro ?? ''); if (view().kind === 'entry' && (view() as { ref: string }).ref === ref) render(); })
        .catch(() => cultureIntro.set(info.id, ''));
    }
    const using = u.cultureId === info.id;
    return [
      header(ref, info.name, `Sky culture · ${info.region}`),
      h('div', { class: 'button-row' },
        h('button', { class: 'pill-button primary', type: 'button', disabled: using, onclick: () => {
          shell.show({ culture: info.id, layers: { lines: true, constellationLabels: true } });
          render();
        } }, icon('figures', 16), using ? 'In use on the sky' : 'Use on the sky')),
      h('section', { class: 'card atlas-now' }, h('span', { class: 'card-label' }, 'At a glance'),
        factList([{ label: 'Figures', value: String(info.count) }, { label: 'Region', value: info.region }])),
      intro ? h('section', { class: 'atlas-section' }, h('h4', { class: 'atlas-section-title' }, 'About'), h('p', null, intro))
        : intro === undefined ? h('p', { class: 'hint' }, 'Loading…') : null,
      h('p', { class: 'hint' }, 'Sky culture data from Stellarium, shared under CC BY-SA.'),
    ];
  };

  const entryPage = (ref: string) => {
    if (findShower(ref)) return [backBar('Back'), showerPage(ref), related(ref)];
    if (findCultureInfo(u, ref)) return [backBar('Back'), culturePage(ref), conceptsAbout(ref), related(ref)];
    const obj = u.resolve(ref);
    const e = atlasEntry(u, ref);
    if (!obj || !e) return [backBar('Back'), h('p', { class: 'hint' }, 'This object is not loaded yet.')];
    return [
      backBar('Back'),
      header(obj.ref, obj.name, obj.subtitle),
      objectActions(obj),
      rightNow(obj),
      readingFor(obj),
      conceptsAbout(obj.ref),
      related(obj.ref),
    ];
  };

  // ------------------------------------------------------------ render

  type Tree = Child | Tree[];
  const flat = (t: Tree): Child[] => (Array.isArray(t) ? t.flatMap(flat) : [t]);

  const render = () => {
    const v = view();
    if (v.kind !== 'home') input.blur();
    input.hidden = v.kind !== 'home';
    fill(body, flat(v.kind === 'home' ? home(v.tab) : v.kind === 'category' ? category(v.id) : v.kind === 'concept' ? conceptPage(v.id) : entryPage(v.ref)));
  };
  fill(el, input, body);
  input.addEventListener('input', render);
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const q = input.value.trim();
    const first = searchExtras(u, q)[0] ?? u.search(q, 1)[0];
    if (first) open(first);
  });
  // Keep the live block current while an entry is open (minute by minute is plenty).
  let lastMinute = 0;
  app.on('second', () => {
    const m = Math.floor(app.clock.jdUT * 1440);
    if (m === lastMinute || shell.openSheetId !== 'atlas' || view().kind !== 'entry') return;
    lastMinute = m;
    const scroll = el.closest('.sheet-body')?.scrollTop ?? 0;
    render();
    el.closest('.sheet-body')?.scrollTo({ top: scroll });
  });

  const panel: AtlasPanel = {
    title: 'Atlas',
    el,
    refresh: render,
    get focus() { return view().kind === 'home' ? input : undefined; },
    show(target) {
      if ('search' in target) {
        stack.length = 1;
        stack[0] = { kind: 'home', tab: 'objects' };
      } else if ('category' in target) {
        stack.push({ kind: 'category', id: target.category });
      } else if ('concept' in target) {
        if (!(view().kind === 'concept' && (view() as { id: string }).id === target.concept)) stack.push({ kind: 'concept', id: target.concept });
      } else if (!(view().kind === 'entry' && (view() as { ref: string }).ref === target.ref)) {
        stack.push({ kind: 'entry', ref: target.ref });
      }
      shell.openSheet('atlas');
      if ('search' in target) { input.select(); input.focus({ preventScroll: true }); }
    },
  };
  return panel;
}
