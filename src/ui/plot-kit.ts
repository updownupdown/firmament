// Shared bits for the concept diagrams: colours from the design tokens and a
// canvas sized for the screen's pixel density.

export interface PlotView {
  el: HTMLElement;
  /** Called with the miss whenever the user tries something. */
  onAttempt: ((miss: number) => void) | null;
  /** Show the answer (after the task is solved). */
  reveal(): void;
}

export interface Palette { sun: string; earth: string; mars: string; orbit: string; sight: string; text: string; faint: string; accent: string; good: string; font: string }

export function palette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    sun: v('--plot-sun'), earth: v('--plot-earth'), mars: v('--plot-mars'), orbit: v('--plot-orbit'),
    sight: v('--plot-sight'), text: v('--color-text-muted'), faint: v('--color-text-faint'),
    accent: v('--color-accent'), good: v('--color-good'), font: v('--font'),
  };
}

/** Size the canvas's backing store to its box; returns the context in CSS pixels. */
export function prepare(canvas: HTMLCanvasElement): { g: CanvasRenderingContext2D; w: number; h: number } | null {
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
  const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  }
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  return { g, w, h };
}

/** An arrow from a to b (CSS pixels). */
export function arrow(g: CanvasRenderingContext2D, a: [number, number], b: [number, number], color: string, width = 2): void {
  const ang = Math.atan2(b[1] - a[1], b[0] - a[0]), head = 7;
  g.strokeStyle = g.fillStyle = color; g.lineWidth = width;
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0] - Math.cos(ang) * head * 0.6, b[1] - Math.sin(ang) * head * 0.6); g.stroke();
  g.beginPath(); g.moveTo(b[0], b[1]);
  g.lineTo(b[0] - head * Math.cos(ang - 0.45), b[1] - head * Math.sin(ang - 0.45));
  g.lineTo(b[0] - head * Math.cos(ang + 0.45), b[1] - head * Math.sin(ang + 0.45));
  g.closePath(); g.fill();
}
