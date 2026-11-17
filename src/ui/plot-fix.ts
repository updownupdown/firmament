// A navigator's chart: the circles of position of two stars, measured at the
// moment the journey shows, and the ship where they cross.

import type { App } from '../app.ts';
import { DEG } from '../astro/math.ts';
import { type GeoPoint, circleOfPosition, fixFromTwo, geoDistance, groundPoint, nauticalMiles } from '../journeys/navigation.ts';
import { formatLatLon } from '../sim/format.ts';
import { h } from './dom.ts';
import { type PlotView, palette, prepare } from './plot-kit.ts';

/** Half the chart's height, degrees of latitude. */
const SPAN = 9;

export function starFixPlot(app: App, stars: [string, string]): PlotView {
  const canvas = h('canvas', { class: 'plot-canvas', role: 'img', 'aria-label': 'A chart of the ocean with two circles of position, one for each star.' });
  const readout = h('p', { class: 'plot-readout', 'aria-live': 'polite' }, 'Tap the chart where the two circles cross.');
  const el = h('div', { class: 'plot' }, canvas, readout);
  const u = app.universe;
  const ship: GeoPoint = { lat: app.site.lat * DEG, lon: app.site.lon * DEG };
  const sights = stars.map((ref) => {
    const o = u.resolve(ref)!;
    const [ra, dec] = u.equatorial(o.dir);
    return { name: o.name, gp: groundPoint(ra, dec, u.frame.gast), zenith: Math.PI / 2 - u.horizontal(o.dir).alt };
  });
  // The chart is centred on the navigator's rough guess, not on the answer.
  const centre: GeoPoint = { lat: (Math.round(app.site.lat / 5) * 5 + 2) * DEG, lon: (Math.round(app.site.lon / 5) * 5 + 3) * DEG };
  const fix = fixFromTwo(sights[0].gp, sights[0].zenith, sights[1].gp, sights[1].zenith, centre);
  const circles = sights.map((s) => circleOfPosition(s.gp, s.zenith, 720));
  let tapped: GeoPoint | null = null;
  let revealed = false;
  let scale = 1, cx = 0, cy = 0;
  const kx = Math.cos(centre.lat);
  const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const toPx = (p: GeoPoint): [number, number] => [cx + (wrap(p.lon - centre.lon) / DEG) * kx * scale, cy - ((p.lat - centre.lat) / DEG) * scale];
  const fromPx = (x: number, y: number): GeoPoint => ({ lat: centre.lat + ((cy - y) / scale) * DEG, lon: centre.lon + ((x - cx) / (kx * scale)) * DEG });

  const draw = () => {
    const ready = prepare(canvas);
    if (!ready) return;
    const { g, w, h: hgt } = ready;
    const c = palette(el);
    scale = hgt / 2 / SPAN; cx = w / 2; cy = hgt / 2;
    g.font = `11px ${c.font}`;
    // Graticule every 5°.
    g.strokeStyle = c.orbit; g.lineWidth = 1; g.fillStyle = c.faint;
    const c0 = fromPx(0, hgt), c1 = fromPx(w, 0);
    for (let lat = Math.ceil(c0.lat / DEG / 5) * 5; lat <= c1.lat / DEG; lat += 5) {
      const y = toPx({ lat: lat * DEG, lon: centre.lon })[1];
      g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke();
      g.textAlign = 'left'; g.fillText(`${Math.abs(lat)}°${lat >= 0 ? 'N' : 'S'}`, 4, y - 3);
    }
    for (let lon = Math.ceil(c0.lon / DEG / 5) * 5; lon <= c1.lon / DEG; lon += 5) {
      const x = toPx({ lat: centre.lat, lon: lon * DEG })[0];
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, hgt); g.stroke();
      g.textAlign = 'center'; g.fillText(`${Math.abs(lon)}°${lon >= 0 ? 'E' : 'W'}`, x, hgt - 4);
    }
    // The circles of position.
    const colours = [c.earth, c.sun];
    circles.forEach((pts, i) => {
      g.strokeStyle = colours[i]; g.lineWidth = 1.8; g.beginPath();
      let pen = false, labelAt: [number, number] | null = null;
      for (const p of pts) {
        const q = toPx(p);
        const inside = q[0] > -50 && q[0] < w + 50 && q[1] > -50 && q[1] < hgt + 50;
        if (!inside) { pen = false; continue; }
        if (pen) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]);
        pen = true;
        if (!labelAt && q[0] > 30 && q[0] < w - 90 && q[1] > 20 && q[1] < hgt - 30) labelAt = q;
      }
      g.stroke();
      if (labelAt) { g.fillStyle = colours[i]; g.textAlign = 'left'; g.font = `12px ${c.font}`; g.fillText(sights[i].name, labelAt[0] + 6, labelAt[1] - 6); }
    });
    if (tapped) {
      const q = toPx(tapped);
      g.strokeStyle = c.text; g.lineWidth = 1.5; g.beginPath(); g.arc(q[0], q[1], 7, 0, Math.PI * 2); g.stroke();
    }
    if (revealed) {
      const q = toPx(ship);
      g.fillStyle = c.good; g.beginPath(); g.arc(q[0], q[1], 5, 0, Math.PI * 2); g.fill();
      g.font = `12px ${c.font}`; g.textAlign = q[0] > w - 100 ? 'right' : 'left';
      g.fillText('The ship', q[0] + (q[0] > w - 100 ? -9 : 9), q[1] + 4);
    }
  };

  const view: PlotView = {
    el, onAttempt: null,
    reveal() {
      revealed = true;
      readout.textContent = `The ship is at ${formatLatLon(app.site.lat, app.site.lon)}. Each degree on the chart is 60 nautical miles.`;
      draw();
    },
  };
  canvas.addEventListener('pointerup', (e) => {
    const r = canvas.getBoundingClientRect();
    tapped = fromPx(e.clientX - r.left, e.clientY - r.top);
    draw();
    const miss = geoDistance(tapped, fix ? fix[0] : ship) / DEG;
    if (!revealed) readout.textContent = `That spot is ${Math.round(nauticalMiles(geoDistance(tapped, fix ? fix[0] : ship)))} nautical miles from where the circles cross.`;
    view.onAttempt?.(miss);
  });
  new ResizeObserver(() => draw()).observe(canvas);
  return view;
}
