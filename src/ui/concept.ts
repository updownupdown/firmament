// A concept page in the Atlas: a long read with "Try it" buttons that set the
// sky up to show the idea, diagrams opened on request, and questions to check
// yourself. Nothing gates reading on. The first Try it remembers your own sky,
// and "Back to your sky" puts it back.

import type { Concept, ConceptBlock } from '../atlas/concepts.ts';
import { type Verdict, checkTask } from '../learn/tasks.ts';
import type { Scene } from '../sim/scene.ts';
import { type Child, h, icon } from './dom.ts';
import { plotView } from './plot.ts';
import type { Shell } from './shell.ts';

export interface ConceptPages {
  /** The page's contents, below the back link. */
  page(c: Concept): Child[];
  /** Whether a Try it has changed the sky from the reader's own. */
  readonly away: boolean;
  /** Put the reader's own sky back. */
  goHome(): void;
}

/** What the reader has done on each page, kept while the app is open. */
interface BlockState { verdict?: Verdict; value?: string; open?: boolean; solved?: boolean }

export function conceptPages(shell: Shell, redraw: () => void): ConceptPages {
  const app = shell.app;
  const state = new Map<string, BlockState>();
  const at = (key: string) => { let s = state.get(key); if (!s) state.set(key, (s = {})); return s; };
  /** The reader's own place and view, from before the first Try it. */
  let home: Scene | null = null;
  /** On a phone a Try it steps back to the sky; this pill leads back to the page. */
  let reading: Concept | null = null;
  const pillLabel = h('span', null);
  const pill = h('button', { class: 'pill-button glass chrome reading-pill', type: 'button', onclick: () => { if (reading) shell.openAtlas({ concept: reading.id }); } },
    icon('book', 16), pillLabel);
  shell.root.append(pill);
  const setReading = (c: Concept | null) => {
    reading = c;
    pillLabel.textContent = c ? `Back to “${c.title}”` : '';
    if (c) document.documentElement.dataset.reading = c.id; else delete document.documentElement.dataset.reading;
  };

  const remember = () => {
    if (home) return;
    home = {
      time: 'now', site: app.site, culture: app.universe.cultureId, layers: { ...app.layers },
      bortle: app.store.data.settings.bortle, camera: { mode: 'sky' },
    };
  };
  /** Set up the sky for a block. `look` closes the sheet on a phone so the sky can be seen. */
  const stage = (scene: Scene, look: boolean) => {
    remember();
    const s: Scene = { highlight: [], ...scene };
    if (look) shell.show(s); else app.apply(s);
  };

  const tryIt = (c: Concept, b: Extract<ConceptBlock, { kind: 'try' }>) =>
    h('div', { class: 'card concept-try' },
      h('button', { class: 'pill-button primary', type: 'button', onclick: () => {
        setReading(c);
        stage(b.scene, true);
        redraw();
      } }, icon(b.scene.camera?.mode === 'space' ? 'orbit' : 'sky', 16), b.label),
      h('p', { class: 'hint' }, b.note));

  const plot = (key: string, b: Extract<ConceptBlock, { kind: 'plot' }>) => {
    const s = at(key);
    const caption = h('p', { class: 'hint concept-caption' }, b.caption);
    if (!s.open) {
      return h('figure', { class: 'card concept-figure' },
        h('button', { class: 'pill-button', type: 'button', onclick: () => {
          if (b.scene) stage(b.scene, false);
          s.open = true;
          redraw();
        } }, icon('orbit', 16), b.task ? 'Open the diagram and try it' : 'Open the diagram'),
        caption);
    }
    const view = plotView(app, b.plot);
    const feedback = h('p', { class: 'concept-feedback', role: 'status', 'aria-live': 'polite' });
    const show = () => {
      feedback.textContent = s.verdict?.message ?? '';
      feedback.className = `concept-feedback${s.verdict ? (s.verdict.ok ? ' good' : ' bad') : ''}`;
    };
    if (!b.task || s.solved) view.reveal();
    const task = b.task;
    if (task) {
      view.onAttempt = (miss) => {
        if (s.solved) return;
        s.verdict = checkTask(task, miss, app.universe);
        if (s.verdict.ok) { s.solved = true; view.reveal(); }
        show();
      };
    }
    show();
    return h('figure', { class: 'card concept-figure' },
      task ? h('p', { class: 'concept-prompt' }, task.prompt) : null,
      view.el, caption, feedback);
  };

  const question = (key: string, b: Extract<ConceptBlock, { kind: 'question' }>) => {
    const s = at(key);
    const t = b.task;
    const feedback = h('p', { class: `concept-feedback${s.verdict ? (s.verdict.ok ? ' good' : ' bad') : ''}`, role: 'status', 'aria-live': 'polite' }, s.verdict?.message ?? '');
    const answer = (value: string | number) => {
      // An answer read off the sky is read off the sky the question is about.
      if (b.scene) stage({ time: b.scene.time, site: b.scene.site, rate: 0 }, false);
      s.verdict = checkTask(t, value, app.universe);
      if (s.verdict.ok) s.solved = true;
      if (typeof value === 'string') s.value = value;
      redraw();
    };
    let input: Child;
    if (t.kind === 'choice') {
      input = h('div', { class: 'concept-options' }, t.options.map((label, i) => h('button', {
        class: `pill-button option${s.solved && i === t.answer ? ' correct' : ''}`, type: 'button', disabled: !!s.solved,
        onclick: () => answer(i),
      }, label)));
    } else {
      const field = h('input', {
        class: 'field', type: 'number', step: 'any', inputmode: 'decimal', 'aria-label': t.prompt, disabled: !!s.solved, value: s.value ?? '',
      });
      input = h('form', { class: 'concept-number', onsubmit: (e: Event) => { e.preventDefault(); answer(field.value); } },
        field, h('span', { class: 'hint' }, t.unit), h('button', { class: 'pill-button', type: 'submit', disabled: !!s.solved }, 'Check'));
    }
    return h('section', { class: 'card concept-question' },
      h('span', { class: 'card-label' }, 'Check yourself'),
      h('p', { class: 'concept-prompt' }, t.prompt), input, feedback);
  };

  const block = (c: Concept, b: ConceptBlock, i: number): Child => {
    const key = `${c.id}:${i}`;
    if (b.kind === 'text') {
      return h('section', { class: 'atlas-section' },
        b.title ? h('h4', { class: 'atlas-section-title' }, b.title) : null,
        b.paragraphs.map((p) => h('p', null, p)));
    }
    if (b.kind === 'try') return tryIt(c, b);
    if (b.kind === 'plot') return plot(key, b);
    return question(key, b);
  };

  const pages: ConceptPages = {
    get away() { return home !== null; },
    goHome() {
      if (!home) return;
      app.select(null);
      if (app.mode === 'space') app.setMode('sky');
      app.apply({ ...home, highlight: [] });
      home = null;
      setReading(null);
    },
    page(c) {
      return [
        h('header', { class: 'atlas-head' },
          h('span', { class: 'card-label' }, c.group),
          h('h3', { class: 'atlas-title' }, c.title)),
        home ? h('button', { class: 'pill-button', type: 'button', onclick: () => { pages.goHome(); redraw(); } }, icon('back', 16), 'Back to your sky') : null,
        h('p', { class: 'atlas-lede' }, c.lede),
        ...c.blocks.map((b, i) => block(c, b, i)),
      ];
    },
  };
  return pages;
}
