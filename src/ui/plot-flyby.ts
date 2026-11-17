// A gravity assist: on the left the path past Jupiter (seen from Jupiter),
// on the right the velocities seen from the Sun, with the speed needed to
// escape the solar system drawn as a circle.

import { ARRIVAL, JUPITER, SOLAR_ESCAPE_AT_JUPITER, type Flyby, flyby, flybyPath, speed } from '../journeys/flyby.ts';
import { h } from './dom.ts';
import { type PlotView, arrow, palette, prepare } from './plot-kit.ts';

export function flybyPlot(): PlotView {
  const canvas = h('canvas', { class: 'plot-canvas', role: 'img', 'aria-label': 'The spacecraft\'s path past Jupiter, and its speed before and after.' });
  const readout = h('p', { class: 'plot-readout', 'aria-live': 'polite' });
  let sense: 1 | -1 = 1;
  const side = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Which side of Jupiter' });
  const slider = h('input', { class: 'plot-slider', type: 'range', min: '0', max: '1000', step: '1', value: '600', 'aria-label': 'Closest approach' });
  const el = h('div', { class: 'plot' }, canvas, side, slider, readout);
  let f: Flyby = flyby(ARRIVAL, JUPITER, JUPITER.radius * 10, sense);
  /** Closest approach in Jupiter radii: 1.1 to 30, spread evenly in ratio along the slider. */
  const radii = () => 1.1 * Math.pow(30 / 1.1, Number(slider.value) / 1000);

  const draw = () => {
    const ready = prepare(canvas);
    if (!ready) return;
    const { g, w, h: hgt } = ready;
    const c = palette(el);
    g.font = `11px ${c.font}`;
    // Left: Jupiter's frame. Jupiter moves to the right; the Sun is below.
    const lw = w * 0.56, mid = hgt / 2;
    const reachRj = Math.max(8, radii() * 2.6);
    const k = Math.min(lw, hgt) / 2 / reachRj / JUPITER.radius;
    const ox = lw / 2, oy = mid;
    g.fillStyle = c.sun; g.beginPath(); g.arc(ox, oy, Math.max(2.5, JUPITER.radius * k), 0, Math.PI * 2); g.fill();
    arrow(g, [ox - 22, hgt - 14], [ox + 22, hgt - 14], c.faint, 1.2);
    g.fillStyle = c.faint; g.textAlign = 'center'; g.fillText('Jupiter moves this way', ox, hgt - 22);
    const path = flybyPath(f, reachRj * JUPITER.radius * 1.5, 240);
    g.strokeStyle = c.accent; g.lineWidth = 1.8; g.beginPath();
    path.forEach((p, i) => { const x = ox + p[0] * k, y = oy - p[1] * k; if (i) g.lineTo(x, y); else g.moveTo(x, y); });
    g.stroke();
    // Arrowhead on the way out.
    if (path.length > 2) {
      const a = path[path.length - 2], b = path[path.length - 1];
      arrow(g, [ox + a[0] * k, oy - a[1] * k], [ox + b[0] * k, oy - b[1] * k], c.accent, 1.8);
    }
    g.strokeStyle = c.orbit; g.beginPath(); g.moveTo(lw, 8); g.lineTo(lw, hgt - 8); g.stroke();

    // Right: velocities seen from the Sun, km/s.
    const rx = lw + (w - lw) * 0.2, ry = mid + 6;
    const ks = Math.min((w - lw) * 0.75, hgt * 0.42) / 22;
    const tip = (v: [number, number]): [number, number] => [rx + v[0] * ks, ry - v[1] * ks];
    g.setLineDash([3, 4]); g.strokeStyle = c.good; g.lineWidth = 1;
    g.beginPath(); g.arc(rx, ry, SOLAR_ESCAPE_AT_JUPITER * ks, -Math.PI / 2.2, Math.PI / 2.2); g.stroke(); g.setLineDash([]);
    g.fillStyle = c.good; g.textAlign = 'left';
    const lab = tip([SOLAR_ESCAPE_AT_JUPITER * Math.cos(1.1), SOLAR_ESCAPE_AT_JUPITER * Math.sin(1.1)]);
    g.fillText('Escape', Math.min(lab[0], w - 40), lab[1] - 4);
    arrow(g, [rx, ry], tip(f.vIn), c.earth, 2);
    arrow(g, [rx, ry], tip(f.vOut), c.accent, 2.4);
    g.fillStyle = c.earth; g.fillText('before', tip(f.vIn)[0] + 4, tip(f.vIn)[1] - 4);
    g.fillStyle = c.accent; g.fillText('after', Math.min(tip(f.vOut)[0] + 4, w - 30), tip(f.vOut)[1] + 12);
    g.fillStyle = c.faint; g.textAlign = 'center'; g.fillText('Speed around the Sun', lw + (w - lw) / 2, 14);
  };

  const update = (attempt: boolean) => {
    f = flyby(ARRIVAL, JUPITER, radii() * JUPITER.radius, sense);
    const out = speed(f.vOut), into = speed(f.vIn);
    const verdict = out >= SOLAR_ESCAPE_AT_JUPITER ? 'fast enough to leave the solar system' : out > into ? 'faster, but still bound to the Sun' : 'slower than it came';
    readout.textContent = `Closest approach ${radii().toFixed(1)} Jupiter radii. Arrives at ${into.toFixed(1)} km/s, leaves at ${out.toFixed(1)} km/s: ${verdict}. Escaping the Sun from here takes ${SOLAR_ESCAPE_AT_JUPITER.toFixed(1)} km/s.`;
    slider.setAttribute('aria-valuetext', `${radii().toFixed(1)} Jupiter radii`);
    fill();
    draw();
    if (attempt) view.onAttempt?.(Math.max(0, SOLAR_ESCAPE_AT_JUPITER - out));
  };
  const fill = () => {
    side.replaceChildren(
      h('button', { type: 'button', 'aria-pressed': String(sense < 0), onclick: () => { sense = -1; update(true); } }, 'Pass behind Jupiter'),
      h('button', { type: 'button', 'aria-pressed': String(sense > 0), onclick: () => { sense = 1; update(true); } }, 'Pass in front'));
  };
  slider.addEventListener('input', () => update(true));
  // Everything is already on show: there is no hidden answer to reveal.
  const view: PlotView = { el, onAttempt: null, reveal() { draw(); } };
  update(false);
  new ResizeObserver(() => draw()).observe(canvas);
  return view;
}
