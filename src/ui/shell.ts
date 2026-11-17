// The app shell: the living sky behind, a top bar, the time bar, the object
// card, the dock, and one sheet at a time for everything else.

import type { App, Section } from '../app.ts';
import { Pointing } from '../render/pointing.ts';
import { jdNow } from '../astro/time.ts';
import { calendarNote, formatDate, formatDistanceAU, formatTime, localTime } from '../sim/format.ts';
import { h, fill, icon, iconButton } from './dom.ts';
import { blurb, detailFacts, quickFacts, riseSetFacts, whereNow } from './facts.ts';
import { type JourneyPlayer, journeyPlayer, journeysPanel } from './journeys.ts';
import { logPanel, logSighting } from './log.ts';
import { measureTool } from './measure.ts';
import { placeTimePanel, searchPanel, settingsPanel } from './panels.ts';
import { tonightPanel } from './tonight.ts';
import { timeBar } from './timebar.ts';

export type SheetId = 'search' | 'settings' | 'place' | 'tonight' | 'journeys' | 'log' | null;

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
  readonly panels: Record<Exclude<SheetId, null>, Panel>;
  private readonly sheetEl: HTMLElement;
  private readonly sheetTitle: HTMLElement;
  private readonly sheetBody: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  private lastFocus: HTMLElement | null = null;
  private readonly journey: JourneyPlayer;

  constructor(app: App, root: HTMLElement) {
    this.app = app;
    this.root = root;
    this.panels = {
      search: searchPanel(this),
      settings: settingsPanel(this),
      place: placeTimePanel(this),
      tonight: tonightPanel(this),
      journeys: journeysPanel(this),
      log: logPanel(this),
    };
    this.sheetTitle = h('h2', { class: 'sheet-title', tabindex: '-1' });
    this.sheetBody = h('div', { class: 'sheet-body' });
    this.sheetEl = h('section', { class: 'sheet glass', hidden: true, 'aria-labelledby': 'sheet-title' },
      h('header', { class: 'sheet-header' }, this.sheetTitle, iconButton('close', 'Close', () => this.closeSheet())),
      this.sheetBody);
    this.sheetTitle.id = 'sheet-title';
    this.toastEl = h('div', { class: 'toast glass', role: 'status', 'aria-live': 'polite', hidden: true });
    this.journey = journeyPlayer(this);
    const nightVision = h('div', { class: 'night-vision', 'aria-hidden': 'true' });
    const point = this.pointButton();
    if (point) root.append(point);
    root.append(this.scaleButton());
    const measure = measureTool(app);
    root.append(measure.layer, this.topBar(), measure.banner, this.reticle(), this.objectCard(), this.journey.el, this.timeBar(), this.dock(), this.sheetEl, this.toastEl, this.stillHint(), nightVision);

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
        else if (app.measure) app.stopMeasure();
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
    this.app.setSection(id === 'tonight' || id === 'log' || id === 'journeys' ? id : 'sky');
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

  /** Begin or resume a journey, with the sky in view. */
  startJourney(id: string): void {
    this.closeSheet();
    this.journey.start(id);
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
    const mode = iconButton('orbit', '', () => app.setMode(app.mode === 'space' ? 'sky' : 'space'), 'glass');
    const syncMode = () => {
      const space = app.mode === 'space';
      const label = space ? 'Land: back to the sky from the ground' : 'Lift off: see the solar system from space';
      fill(mode, icon(space ? 'horizon' : 'orbit'));
      mode.setAttribute('aria-label', label);
      mode.title = label;
      document.documentElement.dataset.mode = app.mode;
    };
    app.on('mode', syncMode);
    syncMode();
    return h('div', { class: 'top-bar chrome' }, chip, mode,
      iconButton('search', 'Search the sky', () => this.openSheet('search'), 'glass'),
      iconButton('sliders', 'View and settings', () => this.openSheet('settings'), 'glass'));
  }

  /** Phone pointing: only offered on devices that can do it. */
  private pointButton(): HTMLElement | null {
    const app = this.app;
    if (!Pointing.supported) return null;
    const button = iconButton('phone', '', () => {
      if (app.pointing.active) { void app.setPointing(false); return; }
      app.setPointing(true).then((result) => {
        if (result === 'denied') this.toast('Motion access was not allowed, so the sky cannot follow your phone.');
        else if (result === 'unsupported') this.toast('This device does not report which way it is pointing.');
      });
      this.toast('Hold your phone up to the sky. Drag the sky to stop.');
    }, 'glass point-button chrome');
    const sync = () => {
      const on = app.pointing.active;
      const label = on ? 'Stop following the phone' : 'Point your phone at the sky';
      button.setAttribute('aria-label', label);
      button.setAttribute('aria-pressed', String(on));
      button.title = label;
      button.hidden = app.mode === 'space';
    };
    app.on('pointing', sync);
    app.on('mode', sync);
    sync();
    return button;
  }

  /** Space view: true or compressed distances and sizes. */
  private scaleButton(): HTMLElement {
    const app = this.app;
    const button = h('button', { class: 'pill-button glass scale-button chrome', type: 'button', onclick: () => {
      app.setLayer('compressed', !app.layers.compressed);
      this.toast(app.layers.compressed
        ? 'Compressed scale: distances and sizes are squeezed so planets show as discs.'
        : 'True scale: the planets are specks, and most of the solar system is empty space.');
    } });
    const sync = () => {
      const on = app.layers.compressed;
      button.textContent = on ? 'Compressed scale' : 'True scale';
      button.setAttribute('aria-pressed', String(on));
      button.title = 'Switch between true and compressed scale';
      button.hidden = app.mode !== 'space';
    };
    app.on('settings', sync);
    app.on('mode', sync);
    sync();
    return button;
  }

  // ---------------------------------------------------------------- time bar

  private timeBar(): HTMLElement {
    return timeBar(this.app, () => this.openSheet('place'));
  }

  // ---------------------------------------------------------------- object card

  private reticle(): HTMLElement {
    const app = this.app;
    const el = h('div', { class: 'reticle', hidden: true, 'aria-hidden': 'true' });
    app.on('frame', () => {
      const s = app.selected && !app.still ? app.locate(app.selected) : null;
      // Big discs speak for themselves.
      if (!s || s.radiusPx > 40) { el.hidden = true; return; }
      const r = Math.max(14, s.radiusPx + 8);
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
    const measureButton = iconButton('ruler', 'Measure the angle to another object', () => {
      if (app.selected) app.startMeasure(app.selected);
    }, 'outlined');
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
        measureButton,
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
      subtitle.textContent = app.mode === 'space' && obj.body
        ? (obj.kind === 'sun' ? obj.subtitle : `${obj.subtitle} · ${formatDistanceAU(obj.body.r)} from the Sun`)
        : `${obj.subtitle} · ${whereNow(app.universe, obj, app.layers.atmosphere)}`;
      const space = app.mode === 'space';
      fill(quick, factList(quickFacts(app.universe, obj).filter((f) => !space || f.label !== 'Altitude')));
      const logged = app.store.hasLogged(obj.ref);
      fill(saw, icon('check', 18), logged ? 'Seen' : 'I saw it');
      saw.classList.toggle('done', logged);
      saw.hidden = obj.kind === 'sun' || space;
      measureButton.hidden = space || obj.kind === 'constellation';
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
    app.on('mode', update);
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
      make('journeys', 'Journeys', () => this.openSheet('journeys')),
      make('log', 'Log', () => this.openSheet('log')));
    this.syncDock();
    return el;
  }

  private syncDock(): void {
    const current: Section = this.sheet === 'tonight' || this.sheet === 'log' || this.sheet === 'journeys' ? this.sheet : 'sky';
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
