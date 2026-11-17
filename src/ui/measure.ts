// The measuring tool: an arc across the sky between two objects, labelled
// with the angle and the same angle in hands held out at arm's length.

import type { App } from '../app.ts';
import { angleBetween, normalize, type Vec3 } from '../astro/math.ts';
import { formatAngularSize, handMeasure } from '../sim/format.ts';
import { h, iconButton, swipeToDismiss } from './dom.ts';

const SVG = 'http://www.w3.org/2000/svg';

/** Points along the great circle from a to b. */
function arc(a: Vec3, b: Vec3, steps: number): Vec3[] {
  const theta = angleBetween(a, b);
  const s = Math.sin(theta);
  const out: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (s < 1e-9) { out.push(a); continue; }
    const wa = Math.sin((1 - t) * theta) / s, wb = Math.sin(t * theta) / s;
    out.push(normalize([a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb, a[2] * wa + b[2] * wb]));
  }
  return out;
}

export interface MeasureTool {
  /** The arc and its label, drawn over the sky. */
  layer: HTMLElement;
  /** The banner that says what is being measured. */
  banner: HTMLElement;
}

export function measureTool(app: App): MeasureTool {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'measure-arc');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(SVG, 'path');
  const ends = [document.createElementNS(SVG, 'circle'), document.createElementNS(SVG, 'circle')];
  for (const c of ends) c.setAttribute('r', '5');
  svg.append(path, ...ends);
  const tag = h('div', { class: 'measure-tag' });
  const layer = h('div', { class: 'measure-layer', hidden: true }, svg, tag);

  const text = h('p', { class: 'measure-text', role: 'status', 'aria-live': 'polite' });
  const banner = h('div', { class: 'measure-banner glass chrome', hidden: true },
    text, iconButton('close', 'Stop measuring', () => app.stopMeasure()));
  swipeToDismiss(banner, () => app.stopMeasure());

  const draw = () => {
    const m = app.measure;
    const a = m && app.universe.resolve(m.from);
    const b = m?.to ? app.universe.resolve(m.to) : null;
    layer.hidden = !a || !b || app.mode !== 'sky' || app.still;
    if (layer.hidden || !a || !b) return;
    const w = app.renderer.projection.width, ht = app.renderer.projection.height;
    const theta = angleBetween(a.dir, b.dir);
    let d = '', pen = false;
    const pts = arc(a.dir, b.dir, Math.max(8, Math.ceil(theta / 0.01)));
    for (const p of pts) {
      const s = app.renderer.project(p);
      // Points far off screen (or behind) break the line rather than streak across it.
      if (!s || Math.abs(s.x - w / 2) > w * 3 || Math.abs(s.y - ht / 2) > ht * 3) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${s.x.toFixed(1)} ${s.y.toFixed(1)}`;
      pen = true;
    }
    path.setAttribute('d', d);
    [a, b].forEach((o, i) => {
      const s = app.renderer.project(o.dir);
      ends[i].setAttribute('visibility', s ? 'visible' : 'hidden');
      if (s) { ends[i].setAttribute('cx', s.x.toFixed(1)); ends[i].setAttribute('cy', s.y.toFixed(1)); }
    });
    const mid = app.renderer.project(pts[pts.length >> 1]);
    tag.hidden = !mid || !mid.onScreen;
    if (mid) tag.style.transform = `translate(${mid.x.toFixed(1)}px, ${mid.y.toFixed(1)}px)`;
    tag.textContent = formatAngularSize(theta);
  };

  const sync = () => {
    const m = app.measure;
    banner.hidden = !m || app.mode !== 'sky';
    document.documentElement.dataset.measuring = String(!!m);
    if (m) {
      const a = app.universe.resolve(m.from), b = m.to ? app.universe.resolve(m.to) : null;
      if (!a) return;
      if (!b) text.textContent = `Measuring from ${a.name}. Tap a second object.`;
      else {
        const theta = angleBetween(a.dir, b.dir);
        text.textContent = `${a.name} to ${b.name}: ${formatAngularSize(theta)}, ${handMeasure(theta)} at arm's length.`;
      }
    }
    draw();
  };
  app.on('measure', sync);
  app.on('mode', sync);
  app.on('frame', draw);
  // The angle between two planets changes as time runs.
  app.on('second', () => { if (app.measure?.to) sync(); });
  sync();
  return { layer, banner };
}
