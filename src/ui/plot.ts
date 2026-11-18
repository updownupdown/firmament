// Diagrams in the Atlas concepts. Each kind lives in its own module; this picks
// the one a concept asks for.

import type { App } from '../app.ts';
import type { Plot } from '../learn/tasks.ts';
import { flybyPlot } from './plot-flyby.ts';
import { starFixPlot } from './plot-fix.ts';
import { type PlotView } from './plot-kit.ts';
import { orbitPlot } from './plot-orbits.ts';
import { sandboxPlot } from './plot-sandbox.ts';

export type { PlotView };

export function plotView(app: App, plot: Plot): PlotView {
  if (plot.kind === 'star-fix') return starFixPlot(app, plot.stars);
  if (plot.kind === 'flyby') return flybyPlot();
  if (plot.kind === 'sandbox') return sandboxPlot(app, plot.controls);
  return orbitPlot(app, plot);
}
