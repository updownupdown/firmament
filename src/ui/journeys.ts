// Journeys in the shell: a sheet that lists them, and a card that walks
// through one while the sky stays in view.

import { JOURNEYS, findJourney } from '../journeys/content.ts';
import { JourneyRun, type Verdict } from '../journeys/engine.ts';
import type { Scene } from '../sim/scene.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import type { Panel, Shell } from './shell.ts';
import { marsFixWidget, marsOrbitFigure, transferWidget } from './workshop.ts';

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
  const feedback = h('p', { class: 'journey-feedback', role: 'status', 'aria-live': 'polite' });
  const back = h('button', { class: 'pill-button', type: 'button', onclick: () => move(-1) }, 'Back');
  const next = h('button', { class: 'pill-button primary', type: 'button', onclick: () => move(1) }, 'Next');
  const el = h('section', { class: 'journey-card glass chrome', hidden: true, 'aria-label': 'Journey' },
    h('header', { class: 'card-header' }, h('div', { class: 'card-heading' }, progress, title),
      iconButton('close', 'Leave this journey', () => stop(false))),
    text, task, feedback, h('div', { class: 'journey-nav' }, back, next));

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
    delete document.documentElement.dataset.workshop;
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

  /** The answer that solved the current step, so a workshop chart can keep showing it. */
  let accepted = '';
  const answer = (value: string | number) => {
    if (!run) return;
    verdict = run.answer(value, app.universe);
    if (verdict.ok) accepted = String(value);
    if (verdict.ok) renderTask();
    showVerdict();
  };

  const renderTask = () => {
    const t = run?.step.task;
    const figure = run?.step.figure;
    const chart = run && figure ? marsOrbitFigure(app, figure.nights, figure.orbit) : null;
    const workshop = !!chart || t?.kind === 'mars-fix' || t?.kind === 'transfer';
    el.dataset.workshop = String(workshop);
    // A chart needs the room the time bar takes.
    if (workshop && run) document.documentElement.dataset.workshop = 'true'; else delete document.documentElement.dataset.workshop;
    if (!run || !t) { fill(task, chart); return; }
    const prompt = h('p', { class: 'journey-prompt' }, t.prompt);
    if (t.kind === 'find') {
      fill(task, chart, prompt);
    } else if (t.kind === 'mars-fix') {
      // Points found in earlier steps stay on the chart.
      const earlier = run.journey.steps.slice(0, run.index).flatMap((s) => (s.task?.kind === 'mars-fix' ? [s.task.jd] : []));
      fill(task, prompt, marsFixWidget(app, t.jd, earlier, run.solved, answer));
    } else if (t.kind === 'transfer') {
      fill(task, prompt, transferWidget(app, t.from, t.window, t.budget, run.solved ? accepted : '', answer));
    } else if (t.kind === 'choice') {
      fill(task, chart, prompt, h('div', { class: 'journey-options' }, t.options.map((label, i) => h('button', {
        class: `pill-button option${run!.solved && i === t.answer ? ' correct' : ''}`, type: 'button', disabled: run!.solved,
        onclick: () => answer(i),
      }, label))));
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
    accepted = '';
    progress.textContent = `${run.journey.title} · ${run.index + 1} of ${run.journey.steps.length}`;
    title.textContent = step.title;
    text.textContent = step.text;
    back.hidden = run.index === 0;
    next.textContent = run.last ? 'Finish' : 'Next';
    if (applyScene && step.scene) {
      // A step that does not mention a selection should not inherit the last one's highlight.
      app.apply({ highlight: [], ...step.scene });
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
