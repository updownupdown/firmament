// Labels are DOM elements positioned over the canvas, so they take the design
// tokens and stay crisp. This file decides which labels to show, drops the
// ones that would overlap, and reuses elements between frames.

import { SOLAR_BODIES } from '../astro/ephemeris.ts';
import { GALILEAN } from '../astro/galilean.ts';
import { DEG, type Vec3, apply, clamp } from '../astro/math.ts';
import { fromAzAlt } from '../astro/frames.ts';
import type { LayerFlags } from '../sim/scene.ts';
import { type Universe, dsoId, dsoName, starRef } from '../sim/universe.ts';
import { dsoLimit } from './conditions.ts';
import type { SkyRenderer } from './sky.ts';

export interface LabelItem {
  key: string;
  text: string;
  /** Anchor point in CSS pixels. */
  x: number;
  y: number;
  /** CSS modifier: body, star, con, dso, cardinal. */
  kind: string;
  priority: number;
  /** Distance to keep clear of the anchor (the object's drawn radius). */
  offset: number;
  /** Centre the text on the anchor instead of setting it to the side. */
  centred?: boolean;
  selected?: boolean;
}

const CARDINALS: [string, number][] = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];

interface Cache { years: number; culture: string; count: number; centres: { ref: string; name: string; dir: Vec3 }[] }
let centreCache: Cache | null = null;

function constellationCentres(u: Universe): Cache['centres'] {
  const c = centreCache;
  if (c && c.culture === u.cultureId && c.count === u.stars.count && Math.abs(c.years - u.years) < 25) return c.centres;
  const centres: Cache['centres'] = [];
  for (const con of u.culture?.constellations ?? []) {
    if (con.asterism) continue;
    const dir = u.constellationCentre(con);
    if (dir) centres.push({ ref: `con:${u.cultureId}:${con.id}`, name: con.native && con.iau ? con.native : con.name, dir });
  }
  centreCache = { years: u.years, culture: u.cultureId, count: u.stars.count, centres };
  return centres;
}

/** Everything that would like a label this frame, before overlap is resolved. */
export function collectLabels(r: SkyRenderer, layers: LayerFlags, selectedRef: string | null, highlight: string[] = []): LabelItem[] {
  const u = r.universe, p = r.projection, c = r.conditions;
  const items: LabelItem[] = [];
  const marked = new Set(highlight);
  if (selectedRef) marked.add(selectedRef);
  const floor = layers.ground && !u.voyage ? -0.3 * DEG : -90 * DEG;
  const m = u.frame.j2000ToHorizon;
  const place = (dir: Vec3): { x: number; y: number } | null => {
    const h = apply(m, dir);
    if (Math.asin(clamp(h[2], -1, 1)) < floor) return null;
    const s = p.project(h);
    return s && s.onScreen ? s : null;
  };

  const voyage = u.voyage;
  if (voyage) {
    // The Sun, now one star among many.
    const d = Math.hypot(voyage[0], voyage[1], voyage[2]);
    const s = d > 1e-6 ? place([-voyage[0] / d, -voyage[1] / d, -voyage[2] / d]) : null;
    if (s) items.push({ key: 'sun', text: 'Sun', x: s.x, y: s.y, kind: 'body', priority: 900, offset: 8 });
  }

  if (layers.cardinals && layers.ground && !voyage) {
    for (const [text, az] of CARDINALS) {
      const s = p.projectCamera(apply(p.view, fromAzAlt(az * DEG, 0)));
      if (s && s.onScreen) {
        items.push({ key: `card:${text}`, text, x: s.x, y: s.y + 14, kind: text.length === 1 ? 'cardinal' : 'cardinal minor', priority: text.length === 1 ? 1000 : 900, offset: 0, centred: true });
      }
    }
  }

  if (layers.planetLabels) {
    const names: Record<string, string> = {};
    for (const d of r.drawn) {
      const isSolar = (SOLAR_BODIES as string[]).includes(d.id) || d.id === 'earth';
      const moon = GALILEAN.find((g) => g.id === d.id);
      if (!d.screen || !d.screen.onScreen || d.alt < floor) continue;
      // A planet passing behind the Moon (or the Sun) is hidden, and so is its name.
      const at = d.screen;
      if (r.drawn.some((o) => {
        if (o === d || !o.screen || o.body.dist >= d.body.dist) return false;
        const trueRadius = o.body.radius / p.pixelAngle;
        return trueRadius > 2 && Math.hypot(at.x - o.screen.x, at.y - o.screen.y) < trueRadius * 0.98;
      })) continue;
      const sel = marked.has(d.id);
      if (!sel) {
        if (d.body.mag > c.limitMag + 0.5 && d.id !== 'sun' && d.id !== 'moon' && d.id !== 'earth') continue;
        // Jupiter's moons only once they separate from the planet's glare.
        if (moon && p.fov > 3 * DEG) continue;
        if (!isSolar && !moon && d.body.mag > c.limitMag - 1) continue;
      }
      names[d.id] ??= u.resolve(d.id)?.name ?? d.id;
      items.push({
        key: d.id, text: names[d.id], x: d.screen.x, y: d.screen.y, kind: 'body',
        priority: 800 - d.body.mag, offset: Math.max(d.radiusPx, 4) + 4, selected: sel,
      });
    }
  }

  if (layers.starLabels) {
    // Name fewer stars when zoomed out, more as the field narrows.
    const limit = Math.min(c.limitMag - 2.2, 1.6 + 1.25 * Math.log2((100 * DEG) / p.fov));
    for (const [i, meta] of u.stars.meta) {
      if (!meta.n || i >= u.stars.count) continue;
      const ref = starRef(u.stars, i);
      const sel = marked.has(ref);
      // Near light speed the stars ahead crowd together and brighten: name only the ones bright at rest.
      const mag = !u.voyage ? u.stars.mag[i] : u.beta ? u.stars.at(i, u.years, u.voyage).mag + 1.5 : u.starMag(i);
      if (mag > limit && !sel) continue;
      const s = place(u.starDirection(i));
      if (!s) continue;
      items.push({ key: ref, text: meta.n, x: s.x, y: s.y, kind: 'star', priority: 500 - u.stars.mag[i] * 10, offset: 7, selected: sel });
    }
  }

  if (layers.constellationLabels && layers.lines && p.fov > 12 * DEG && !voyage) {
    for (const con of constellationCentres(u)) {
      const s = place(con.dir);
      if (s) items.push({ key: con.ref, text: con.name, x: s.x, y: s.y, kind: 'con', priority: marked.has(con.ref) ? 700 : 300, offset: 0, centred: true, selected: marked.has(con.ref) });
    }
  }

  if (layers.dsos) {
    for (const d of u.dsos) {
      const ref = `dso:${dsoId(d)}`;
      const sel = marked.has(ref);
      // Bright showpieces get names at wide fields; the rest wait for a closer look.
      if (!sel && d.m > dsoLimit(c, p.fov) - 1.5) continue;
      const s = place([Math.cos(d.de * DEG) * Math.cos(d.ra * DEG), Math.cos(d.de * DEG) * Math.sin(d.ra * DEG), Math.sin(d.de * DEG)]);
      if (s) items.push({ key: ref, text: dsoName(d) ?? d.mes ?? d.d, x: s.x, y: s.y, kind: 'dso', priority: 200 - d.m * 10, offset: 9, selected: sel });
    }
  }
  return items;
}

interface Box { x0: number; y0: number; x1: number; y1: number }

/** Keep the highest-priority labels that do not overlap. Sizes are estimated from the text. */
export function layoutLabels(items: LabelItem[], width: number, height: number): (LabelItem & { left: number; top: number; width: number })[] {
  const placed: Box[] = [];
  const out: (LabelItem & { left: number; top: number; width: number })[] = [];
  const sorted = [...items].sort((a, b) => Number(b.selected ?? false) - Number(a.selected ?? false) || b.priority - a.priority);
  for (const it of sorted) {
    const w = it.text.length * (it.kind === 'con' ? 7.6 : 6.6) + 6;
    const h = 16;
    const left = it.centred ? it.x - w / 2 : it.x + it.offset;
    const top = it.y - h / 2;
    const box: Box = { x0: left - 3, y0: top - 1, x1: left + w + 3, y1: top + h + 1 };
    if (box.x1 < 0 || box.x0 > width || box.y1 < 0 || box.y0 > height) continue;
    if (!it.selected && placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) continue;
    placed.push(box);
    out.push({ ...it, left, top, width: w });
  }
  return out;
}

/** Owns the label elements. */
export class LabelLayer {
  private readonly root: HTMLElement;
  private readonly live = new Map<string, { el: HTMLElement; text: string; kind: string }>();
  /** Where each label was last placed, for tapping a name. */
  private boxes: { key: string; left: number; top: number; right: number; bottom: number }[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
  }

  /**
   * The object whose name is at a screen point (with a little slack for
   * fingers), or null. Compass points are not objects.
   */
  hit(x: number, y: number, slack = 6): string | null {
    for (let i = this.boxes.length - 1; i >= 0; i--) {
      const b = this.boxes[i];
      if (x >= b.left - slack && x <= b.right + slack && y >= b.top - slack && y <= b.bottom + slack) return b.key;
    }
    return null;
  }

  update(items: (LabelItem & { left: number; top: number; width?: number })[]): void {
    const seen = new Set<string>();
    this.boxes = [];
    for (const it of items) {
      seen.add(it.key);
      let entry = this.live.get(it.key);
      if (!entry) {
        const el = document.createElement('span');
        el.className = 'sky-label';
        this.root.appendChild(el);
        entry = { el, text: '', kind: '' };
        this.live.set(it.key, entry);
      }
      const kind = it.kind + (it.selected ? ' selected' : '');
      if (entry.text !== it.text) { entry.el.textContent = it.text; entry.text = it.text; }
      if (entry.kind !== kind) { entry.el.className = `sky-label ${kind}`; entry.kind = kind; }
      entry.el.style.transform = `translate(${it.left.toFixed(1)}px, ${it.top.toFixed(1)}px)`;
      if (!it.key.startsWith('card:')) {
        const width = it.width ?? entry.el.offsetWidth;
        this.boxes.push({ key: it.key.replace(/^space:/, ''), left: it.left, top: it.top, right: it.left + width, bottom: it.top + 16 });
      }
    }
    for (const [key, entry] of this.live) {
      if (!seen.has(key)) {
        entry.el.remove();
        this.live.delete(key);
      }
    }
  }
}
