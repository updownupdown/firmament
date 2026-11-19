// A picture of the Moon as it really looks at an instant: the map of its
// surface turned by libration, lit from where the Sun is, with earthshine on
// the dark side. Drawn on a 2D canvas pixel by pixel with the same lighting as
// the sky shader, so the Tonight card and the calendar match the sky.

import type { MoonFace } from '../astro/lunar.ts';

const MAP_W = 1024, MAP_H = 512;
/** The Moon's colour, as in `BODIES.moon.color`, times the shader's map gain. */
const TINT = [0.72 * 1.35, 0.70 * 1.35, 0.67 * 1.35];

let map: Uint8Array | null = null;
let loading: Promise<void> | null = null;
const waiting = new Set<() => void>();

function loadMap(): void {
  if (loading || typeof Image === 'undefined') return;
  loading = new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = MAP_W; c.height = MAP_H;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (g) {
        g.drawImage(img, 0, 0, MAP_W, MAP_H);
        const px = g.getImageData(0, 0, MAP_W, MAP_H).data;
        const lum = new Uint8Array(MAP_W * MAP_H);
        for (let i = 0; i < lum.length; i++) lum[i] = (px[i * 4] * 54 + px[i * 4 + 1] * 183 + px[i * 4 + 2] * 19) >> 8;
        map = lum;
      }
      resolve();
      for (const redraw of waiting) redraw();
      waiting.clear();
    };
    img.onerror = () => resolve();
    img.src = 'data/textures/moon.jpg';
  });
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Draw the face into a canvas `size` CSS pixels across. */
function draw(canvas: HTMLCanvasElement, face: MoonFace, size: number): void {
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const px = Math.round(size * dpr);
  if (canvas.width !== px) { canvas.width = px; canvas.height = px; }
  const g = canvas.getContext('2d');
  if (!g) return;
  const img = g.createImageData(px, px);
  const out = img.data;
  const R = px / 2;
  const [sx, sy, sz] = face.sun;
  const [px_, py_, pz_] = face.prime;
  const [qx, qy, qz] = face.pole;
  // East axis = pole × prime.
  const ex = qy * pz_ - qz * py_, ey = qz * px_ - qx * pz_, ez = qx * py_ - qy * px_;
  // Earthshine is strongest near new Moon; the dark limb stays faintly visible.
  const earthshine = 0.05 * (1 - face.illum) + 0.02;
  for (let j = 0; j < px; j++) {
    const y = (R - j - 0.5) / R;
    for (let i = 0; i < px; i++) {
      const x = (i + 0.5 - R) / R;
      const r2 = x * x + y * y;
      const cover = Math.min(1, Math.max(0, (1 - Math.sqrt(r2)) * R + 0.5));
      if (cover <= 0) continue;
      const z = Math.sqrt(Math.max(0, 1 - r2));
      const lit = x * sx + y * sy + z * sz;
      let albedo = 0.55;
      if (map) {
        const bx = x * px_ + y * py_ + z * pz_, by = x * ex + y * ey + z * ez, bz = x * qx + y * qy + z * qz;
        const u = Math.atan2(by, bx) / (2 * Math.PI) + 0.5;
        const v = 0.5 - Math.asin(Math.max(-1, Math.min(1, bz))) / Math.PI;
        const mi = Math.min(MAP_W - 1, Math.floor(u * MAP_W)), mj = Math.min(MAP_H - 1, Math.floor(v * MAP_H));
        albedo = map[mj * MAP_W + mi] / 255;
      }
      const shade = smooth(-0.02, 0.1, lit) * (0.55 + 0.45 * Math.pow(Math.max(lit, 0), 0.6)) * 1.25
        + earthshine * (1 - smooth(-0.05, 0.15, lit));
      const k = (j * px + i) * 4;
      // A gentle curve so the bright side does not clip and the grey maria still read.
      for (let c = 0; c < 3; c++) out[k + c] = 255 * Math.min(1, Math.pow(Math.min(1.2, TINT[c] * albedo * shade), 0.85));
      out[k + 3] = 255 * cover;
    }
  }
  g.putImageData(img, 0, 0);
}

/** A canvas showing the Moon's face, `size` CSS pixels across; it sharpens when the surface map arrives. */
export function moonPicture(face: MoonFace, size: number, label?: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.className = 'moon-pic';
  canvas.style.width = canvas.style.height = `${size}px`;
  canvas.setAttribute('role', 'img');
  if (label) canvas.setAttribute('aria-label', label);
  draw(canvas, face, size);
  if (!map) {
    loadMap();
    waiting.add(() => draw(canvas, face, size));
  }
  return canvas;
}
