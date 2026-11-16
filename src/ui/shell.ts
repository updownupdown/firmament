// The app shell: the living sky behind, a top bar, the time bar, the object
// card, the dock, and one sheet at a time for everything else.

import type { App, Section } from '../app.ts';
import { RATE_STEPS, describeRate } from '../sim/clock.ts';
import { jdNow } from '../astro/time.ts';
import { calendarNote, formatDate, formatTime, localTime } from '../sim/format.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { blurb, detailFacts, quickFacts, riseSetFacts, whereNow } from './facts.ts';
import { logPanel, logSighting } from './log.ts';
import { placeTimePanel, searchPanel, settingsPanel } from './panels.ts';
import { tonightPanel } from './tonight.ts';

export type SheetId = 'search' | 'settings' | 'place' | 'tonight' | 'log' | null;

export interface Panel {
  title: string;
  el: HTMLElement;
  /** Called when the sheet opens, and again when its data may have changed. */
  refresh(): void;
  /** Element to focus on open, if not the heading. */
  focus?: HTMLElement;
}

export class Shell {
  readonly app: App;
  readonly root: HTMLElement;
  private sheet: SheetId = null;
  private readonly panels: Record<Exclude<SheetId, null>, Panel>;
  private readonly sheetEl: HTMLElement;
  private readonly sheetTitle: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  private lastFocus: HTMLElement | null = null;

  constructor(app: App, root: HTMLElement) {
    this.app = app;
    this.root = root;
    this.panels = {
      search: searchPanel(this),
      settings: settingsPanel(this),
      place: placeTimePanel(this),
      tonight: tonightPanel(this),
      log: logPanel(this),
    };
    this.sheetTitle = h('h2', { class: 'sheet-title', tabindex: '-1' });
    this.sheetBody = h('div', { class: 'sheet-body' });
    this.sheetEl = h('section', { class: 'sheet glass', hidden: true, 'aria-labelledby': 'sheet-title' },
      h('header', { class: 'sheet-header' }, this.sheetTitle, iconButton('close', 'Close', () => this.closeSheet())),
      this.sheetBody);
    this.sheetTitle.id = 'sheet-title';
    this.toastEl = h('div', { class: 'toast glass', role: 'status', 'aria-live': 'polite', hidden: true });
    const nightVision = h('div', { class: 'night-vision', 'aria-hidden': 'true' });
    root.append(this.topBar(), this.reticle(), this.objectCard(), this.timeBar(), this.dock(), this.sheetEl, this.toastEl, this.stillHint(), nightVision);

    const syncSettings = () => {
      const s = app.store.data.settings;
      document.documentElement.dataset.nightVision = String(s.nightVision);
      document.documentElement.dataset.reducedMotion = String(app.reducedMotion);
    };
    app.on('settings', syncSettings);
    syncSettings();
    app.on('section', () => {
      document.documentElement.dataset.still = String(app.still);
      if (app.still) this.closeSheet();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (app.still) app.setStill(false);
        else if (this.sheet) this.closeSheet();
        else if (app.selected) app.select(null);
      } else if (e.key === '/' && !isTyping(e)) {
        e.preventDefault();
        this.openSheet('search');
      } else if (e.key === ' ' && !isTyping(e) && document.activeElement === app.canvas) {
        e.preventDefault();
        app.setRate(app.clock.rate, !app.clock.paused);
      }
    });
    for (const event of ['data', 'site', 'settings'] as const) {
      app.on(event, () => { if (this.sheet) this.panels[this.sheet].refresh(); });
    }
  }

  // ---------------------------------------------------------------- sheets

  get openSheetId(): SheetId {
    return this.sheet;
  }

  openSheet(id: Exclude<SheetId, null>): void {
    const panel = this.panels[id];
    if (this.sheet !== id) this.lastFocus = document.activeElement as HTMLElement | null;
    this.sheet = id;
    this.sheetTitle.textContent = panel.title;
    fill(this.sheetBody, panel.el);
    this.sheetEl.hidden = false;
    this.sheetEl.dataset.sheet = id;
    document.documentElement.dataset.sheet = id;
    panel.refresh();
    this.sheetBody.scrollTop = 0;
    (panel.focus ?? this.sheetTitle).focus({ preventScroll: true });
    this.app.setSection(id === 'tonight' || id === 'log' ? id : 'sky');
    this.syncDock();
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.sheet = null;
    this.sheetEl.hidden = true;
    delete document.documentElement.dataset.sheet;
    this.app.setSection('sky');
    this.syncDock();
    (this.lastFocus?.isConnected ? this.lastFocus : this.app.canvas).focus({ preventScroll: true });
  }

  /** Apply a scene; on a phone, step back to the sky so it can be seen. */
  show(scene: Parameters<App['apply']>[0]): void {
    this.app.apply(scene);
    if (matchMedia('(max-width: 899px)').matches) this.closeSheet();
  }

  toast(message: string): void {
    this.toastEl.textContent = message;
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { this.toastEl.hidden = true; }, 3200);
  }

  // ---------------------------------------------------------------- top bar

  private topBar(): HTMLElement {
    const app = this.app;
    const place = h('span', { class: 'chip-place' });
    const when = h('span', { class: 'chip-when' });
    const note = h('span', { class: 'chip-note' });
    const chip = h('button', { class: 'chip glass', type: 'button', 'aria-label': 'Change place and time', onclick: () => this.openSheet('place') },
      h('span', { class: 'chip-main' }, place, when), note);
    const update = () => {
      const jd = app.clock.jdUT, site = app.site;
      place.textContent = site.name;
      // This year needs no year; any other does, and then the weekday makes way for it.
      const thisYear = localTime(jd, site).year === localTime(jdNow(), site).year;
      when.textContent = `${formatDate(jd, site, { weekday: thisYear, noYear: thisYear })} · ${formatTime(jd, site, { hour12: app.store.data.settings.hour12 })}`;
      const parts = [app.clock.accuracy.label, calendarNote(jd, site)].filter(Boolean);
      note.textContent = parts.join(' · ');
      note.hidden = parts.length === 0;
    };
    for (const e of ['second', 'time', 'site', 'settings'] as const) app.on(e, update);
    let lastText = 0;
    app.on('frame', () => {
      // While time is racing, keep the readout current without rebuilding it every frame.
      const now = performance.now();
      if (now - lastText > 120) { lastText = now; update(); }
    });
    update();
    return h('div', { class: 'top-bar chrome' }, chip,
      iconButton('search', 'Search the sky', () => this.openSheet('search'), 'glass'),
      iconButton('sliders', 'View and settings', () => this.openSheet('settings'), 'glass'));
  }

  // ---------------------------------------------------------------- time bar

  private timeBar(): HTMLElement {
    const app = this.app;
    const playPause = iconButton('pause', 'Pause time', () => app.setRate(app.clock.rate, !app.clock.paused), 'glass');
    const rateLabel = h('span', { class: 'rate-label' });
    const step = (dir: number) => {
      const clock = app.clock;
      // Walk along …, −1 d/s, −1 h/s, real time, 1 min/s, 1 h/s, …
      const ladder = [...RATE_STEPS.slice(1).map((r) => -r).reverse(), ...RATE_STEPS];
      let i = ladder.findIndex((r) => r >= clock.rate - 1e-9);
      if (i < 0) i = ladder.length - 1;
      if (ladder[i] !== clock.rate && dir > 0) i -= 1;
      app.setRate(ladder[Math.min(ladder.length - 1, Math.max(0, i + dir))], false);
    };
    const slower = iconButton('slower', 'Slower, or backwards', () => step(-1));
    const faster = iconButton('faster', 'Faster', () => step(1));
    const now = h('button', { class: 'pill-button', type: 'button', onclick: () => app.goToNow() }, 'Now');

    // The jog: push it either way to run time, further is faster; let go and time settles.
    const jog = h('input', {
      class: 'jog', type: 'range', min: '-100', max: '100', value: '0', step: '1',
      'aria-label': 'Scrub time: drag right for the future, left for the past',
    });
    let before: { rate: number; paused: boolean } | null = null;
    const jogRate = (v: number) => Math.sign(v) * 30 * Math.pow(10, (Math.abs(v) / 100) * 6.2);
    jog.addEventListener('input', () => {
      const v = Number(jog.value);
      before ??= { rate: app.clock.rate, paused: app.clock.paused };
      if (v === 0) app.setRate(before.rate, before.paused);
      else app.setRate(jogRate(v), false);
    });
    const release = () => {
      if (!before) return;
      // Return to where time was running before: paused stays paused, live stays ticking.
      app.setRate(before.rate, before.paused);
      before = null;
      jog.value = '0';
    };
    jog.addEventListener('change', release);
    jog.addEventListener('pointerup', release);
    jog.addEventListener('blur', release);

    const update = () => {
      const c = app.clock;
      fill(playPause, icon(c.paused ? 'play' : 'pause'));
      playPause.setAttribute('aria-label', c.paused ? 'Run time' : 'Pause time');
      playPause.title = c.paused ? 'Run time' : 'Pause time';
      rateLabel.textContent = c.paused ? 'Paused' : describeRate(c.rate);
      now.hidden = c.live;
    };
    app.on('time', update);
    app.on('second', update);
    update();
    return h('div', { class: 'time-bar chrome' }, playPause,
      h('div', { class: 'time-track glass' }, slower, h('div', { class: 'jog-wrap' }, jog, rateLabel), faster), now);
  }

  // ---------------------------------------------------------------- object card

  private reticle(): HTMLElement {
    const app = this.app;
    const el = h('div', { class: 'reticle', hidden: true, 'aria-hidden': 'true' });
    app.on('frame', () => {
      const obj = app.selectedObject;
      const s = obj && !app.still ? app.renderer.project(obj.dir) : null;
      if (!s || obj!.kind === 'constellation') { el.hidden = true; return; }
      const drawn = app.renderer.drawn.find((d) => d.id === obj!.ref);
      const r = Math.max(14, (drawn?.radiusPx ?? 0) + 8);
      el.hidden = false;
      el.style.width = el.style.height = `${r * 2}px`;
      el.style.transform = `translate(${(s.x - r).toFixed(1)}px, ${(s.y - r).toFixed(1)}px)`;
    });
    return el;
  }

  private objectCard(): HTMLElement {
    const app = this.app;
    const title = h('h2', { class: 'card-title' });
    const subtitle = h('p', { class: 'card-subtitle' });
    const quick = h('dl', { class: 'facts quick' });
    const more = h('div', { class: 'card-more', hidden: true });
    const saw = h('button', { class: 'pill-button primary', type: 'button' });
    const detailsButton = h('button', { class: 'pill-button', type: 'button', 'aria-expanded': 'false' }, 'Details');
    let expanded = false;
    let riseSetFor = '';
    let riseSet: ReturnType<typeof riseSetFacts> = [];

    const factList = (facts: { label: string; value: string }[]) =>
      facts.map((f) => h('div', { class: 'fact' }, h('dt', null, f.label), h('dd', null, f.value)));

    const el = h('section', { class: 'object-card glass chrome', hidden: true, 'aria-label': 'Selected object' },
      h('header', { class: 'card-header' },
        h('div', { class: 'card-heading' }, title, subtitle),
        iconButton('close', 'Close', () => app.select(null))),
      quick,
      h('div', { class: 'card-actions' },
        saw,
        iconButton('target', 'Centre and follow', () => {
          if (app.selected) app.centre(app.selected);
        }, 'outlined'),
        h('button', { class: 'pill-button', type: 'button', onclick: () => {
          if (app.selected) app.centre(app.selected, app.framingFov(app.selected));
        } }, 'Zoom in'),
        detailsButton),
      more);

    const style = () => ({ hour12: app.store.data.settings.hour12 });
    const renderMore = () => {
      const obj = app.selectedObject;
      if (!obj || !expanded) return;
      const key = `${obj.ref}|${Math.floor(app.clock.jdUT * 4)}|${app.site.lat}|${app.site.lon}`;
      if (key !== riseSetFor) {
        riseSetFor = key;
        riseSet = riseSetFacts(app.universe, obj, app.clock.jdUT, style());
      }
      const text = blurb(obj);
      fill(more,
        text ? h('p', { class: 'card-blurb' }, text) : null,
        h('dl', { class: 'facts' }, factList([...riseSet, ...detailFacts(app.universe, obj, style())])));
    };
    const update = () => {
      const obj = app.selectedObject;
      el.hidden = !obj;
      document.documentElement.dataset.selected = String(!!obj);
      if (!obj) return;
      title.textContent = obj.name;
      subtitle.textContent = `${obj.subtitle} · ${whereNow(app.universe, obj, app.layers.atmosphere)}`;
      fill(quick, factList(quickFacts(app.universe, obj)));
      const logged = app.store.hasLogged(obj.ref);
      fill(saw, icon('check', 18), logged ? 'Seen' : 'I saw it');
      saw.classList.toggle('done', logged);
      saw.hidden = obj.kind === 'sun';
      renderMore();
    };
    detailsButton.addEventListener('click', () => {
      expanded = !expanded;
      more.hidden = !expanded;
      detailsButton.setAttribute('aria-expanded', String(expanded));
      detailsButton.textContent = expanded ? 'Less' : 'Details';
      renderMore();
    });
    saw.addEventListener('click', () => {
      const obj = app.selectedObject;
      if (!obj) return;
      this.toast(logSighting(app, obj));
      update();
    });
    app.on('select', () => { riseSetFor = ''; update(); });
    app.on('second', update);
    app.on('time', update);
    app.on('site', update);
    return el;
  }

  // ---------------------------------------------------------------- dock

  private dockButtons: Partial<Record<Section, HTMLButtonElement>> = {};

  private dock(): HTMLElement {
    const make = (section: Section, label: string, onClick: () => void) => {
      const b = h('button', { class: 'dock-item', type: 'button', onclick: onClick }, label);
      this.dockButtons[section] = b;
      return b;
    };
    const el = h('nav', { class: 'dock glass chrome', 'aria-label': 'Sections' },
      make('sky', 'Sky', () => this.closeSheet()),
      make('tonight', 'Tonight', () => this.openSheet('tonight')),
      make('log', 'Log', () => this.openSheet('log')));
    this.syncDock();
    return el;
  }

  private syncDock(): void {
    const current: Section = this.sheet === 'tonight' || this.sheet === 'log' ? this.sheet : 'sky';
    for (const [section, button] of Object.entries(this.dockButtons)) {
      if (section === current) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
  }

  private stillHint(): HTMLElement {
    return h('button', { class: 'still-hint glass', type: 'button', onclick: () => this.app.setStill(false) }, 'Tap to bring the controls back');
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
