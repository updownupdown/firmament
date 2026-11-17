// Journeys in the shell: a sheet that lists them, and a card that walks
// through one while the sky stays in view.

import { JOURNEYS, findJourney } from '../journeys/content.ts';
import { JourneyRun, type Verdict } from '../journeys/engine.ts';
import type { Scene } from '../sim/scene.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { type PlotView, plotView } from './plot.ts';
import type { Panel, Shell } from './shell.ts';

export function journeysPanel(shell: Shell): Panel {
  const app = shell.app;
  const el = h('div', { class: 'panel' });
  const refresh = () => {
    fill(el,
      h('p', { class: 'lede' }, 'Short investigations that use the real sky. Each takes a few minutes.'),
      JOURNEYS.map((j) => {
        const p = app.store.data.journeys[j.id];
        const state = p?.done ? 'Done' : p && p.step > 0 ? `Step ${p.step + 1} of ${j.steps.length}` : `${j.minutes} min`;
        return h('button', { class: 'card journey-item', type: 'button', onclick: () => shell.startJourney(j.id) },
          h('span', { class: 'journey-head' }, h('span', { class: 'row-name' }, j.title),
            h('span', { class: `tag${p?.done ? ' up' : ''}` }, p?.done ? [icon('check', 12), ' Done'] : state)),
          h('span', { class: 'hint' }, j.summary));
      }));
  };
  return { title: 'Journeys', el, refresh };
}

export interface JourneyPlayer {
  el: HTMLElement;
  start(id: string): void;
  readonly active: boolean;
}

export function journeyPlayer(shell: Shell): JourneyPlayer {
  const app = shell.app;
  let run: JourneyRun | null = null;
  let verdict: Verdict | null = null;
  /** The player's own place and view, put back when the journey ends. */
  let home: Scene | null = null;

  const progress = h('span', { class: 'card-label' });
  const title = h('h2', { class: 'journey-title', tabindex: '-1' });
  const text = h('p', { class: 'journey-text' });
  const task = h('div', { class: 'journey-task' });
  const figure = h('div', { class: 'journey-figure' });
  let plot: PlotView | null = null;
  const feedback = h('p', { class: 'journey-feedback', role: 'status', 'aria-live': 'polite' });
  const back = h('button', { class: 'pill-button', type: 'button', onclick: () => move(-1) }, 'Back');
  const next = h('button', { class: 'pill-button primary', type: 'button', onclick: () => move(1) }, 'Next');
  const el = h('section', { class: 'journey-card glass chrome', hidden: true, 'aria-label': 'Journey' },
    h('header', { class: 'card-header' }, h('div', { class: 'card-heading' }, progress, title),
      iconButton('close', 'Leave this journey', () => stop(false))),
    text, figure, task, feedback, h('div', { class: 'journey-nav' }, back, next));

  const save = (done: boolean) => {
    if (!run) return;
    const was = app.store.data.journeys[run.journey.id];
    app.store.setJourney(run.journey.id, { step: done ? 0 : run.index, done: done || !!was?.done });
  };

  const stop = (finished: boolean) => {
    if (!run) return;
    save(finished);
    const j = run.journey;
    run = null;
    el.hidden = true;
    delete document.documentElement.dataset.journey;
    delete document.documentElement.dataset.plot;
    fill(figure);
    plot = null;
    app.select(null);
    if (app.mode === 'space') app.setMode('sky');
    if (home) app.apply({ ...home, highlight: [] });
    home = null;
    if (finished) shell.toast(`You finished “${j.title}”.`);
    app.canvas.focus({ preventScroll: true });
  };

  const showVerdict = () => {
    feedback.textContent = verdict?.message ?? '';
    feedback.className = `journey-feedback${verdict ? (verdict.ok ? ' good' : ' bad') : ''}`;
    next.disabled = !run?.solved;
  };

  const answer = (value: string | number) => {
    if (!run) return;
    verdict = run.answer(value, app.universe);
    if (verdict.ok) { renderTask(); plot?.reveal(); }
    showVerdict();
  };

  const renderTask = () => {
    const t = run?.step.task;
    if (!run || !t) { fill(task); return; }
    const prompt = h('p', { class: 'journey-prompt' }, t.prompt);
    if (t.kind === 'find') {
      fill(task, prompt);
    } else if (t.kind === 'choice') {
      fill(task, prompt, h('div', { class: 'journey-options' }, t.options.map((label, i) => h('button', {
        class: `pill-button option${run!.solved && i === t.answer ? ' correct' : ''}`, type: 'button', disabled: run!.solved,
        onclick: () => answer(i),
      }, label))));
    } else if (t.kind === 'plot') {
      fill(task, prompt);
    } else {
      const input = h('input', { class: 'field', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': t.prompt, disabled: run.solved });
      const form = h('form', { class: 'journey-number', onsubmit: (e: Event) => { e.preventDefault(); answer(input.value); } },
        input, h('span', { class: 'hint' }, t.unit), h('button', { class: 'pill-button', type: 'submit', disabled: run.solved }, 'Check'));
      fill(task, prompt, form);
    }
  };

  const render = (applyScene: boolean) => {
    if (!run) return;
    const step = run.step;
    verdict = null;
    progress.textContent = `${run.journey.title} · ${run.index + 1} of ${run.journey.steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    back.hidden = run.index === 0;
    next.textContent = run.last ? 'Finish' : 'Next';
    if (applyScene && step.scene) {
      // A step that does not mention a selection should not inherit the last one's highlight.
      app.apply({ highlight: [], ...step.scene });
    }
    if (step.plot) {
      plot = plotView(app, step.plot);
      // A diagram that only illustrates (no plot task) shows its answer from the start.
      if (step.task?.kind !== 'plot') plot.reveal();
      plot.onAttempt = (miss) => { if (run && !run.solved && run.step.task?.kind === 'plot') answer(miss); };
      fill(figure, plot.el);
      document.documentElement.dataset.plot = '';
    } else {
      plot = null;
      fill(figure);
      delete document.documentElement.dataset.plot;
    }
    renderTask();
    showVerdict();
    el.scrollTop = 0;
  };

  const move = (delta: number) => {
    if (!run) return;
    if (delta > 0 && run.last) { if (run.solved) stop(true); return; }
    if (!run.go(delta)) return;
    save(false);
    render(true);
    title.focus({ preventScroll: true });
  };

  // Tapping the sky answers a "find" task.
  app.on('select', () => {
    const t = run?.step.task;
    if (!run || run.solved || t?.kind !== 'find' || !app.selected) return;
    answer(app.selected);
  });

  return {
    el,
    get active() { return run !== null; },
    start(id: string) {
      const j = findJourney(id);
      if (!j) return;
      if (run) stop(false);
      home = { time: 'now', site: app.site, culture: app.universe.cultureId, layers: { ...app.layers }, bortle: app.store.data.settings.bortle };
      app.select(null);
      const p = app.store.data.journeys[id];
      run = new JourneyRun(j, p && !p.done ? p.step : 0);
      el.hidden = false;
      document.documentElement.dataset.journey = id;
      if (app.mode === 'space') app.setMode('sky');
      // Replay earlier scenes so a resumed journey has the right place and time.
      for (let i = 0; i < run.index; i++) if (j.steps[i].scene) app.apply({ highlight: [], ...j.steps[i].scene });
      render(true);
      title.focus({ preventScroll: true });
    },
  };
}
