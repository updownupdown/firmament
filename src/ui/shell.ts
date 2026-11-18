// The app shell: the living sky behind, and the same three places on every
// screen. At the top, Where and When: two chips that open the Where panel (every
// vantage, each labelled with the view it gives) and the When panel (the
// timeline, dropping down from the top). At the bottom, one toolbar (Search,
// Tonight, Atlas, View, Point, Settings). Just above it, the focus card: what
// you are looking at (an object, or a concept you are trying), with Atlas as its
// one labelled button, every other action named in its ⋯ menu, and × to let
// go. Messages appear in one place, under the chips. One sheet at a time holds
// everything else. Back (the phone's or the browser's) closes whatever was
// opened last; see back.ts.

import { verbsFor } from './viewpoint.ts';
import type { App } from '../app.ts';
import type { TripTarget } from '../learn/trip.ts';
import { type SlingshotLab, slingshotLab } from './slingshot.ts';
import { type TripPlanner, tripPlanner } from './trip.ts';
import { type WhatIfLab, whatIfLab } from './whatif.ts';
import { DEG } from '../astro/math.ts';
import { Pointing } from '../render/pointing.ts';
import { BackStack } from './back.ts';
import { type SearchOverlay, searchOverlay } from './search.ts';
import { formatDistanceAU } from '../sim/format.ts';
import { h, fill, icon, iconButton, swipeToDismiss } from './dom.ts';
import { quickFacts, riseSetFacts, whereNow } from './facts.ts';
import { type AtlasPanel, atlasPanel } from './atlas.ts';
import { measureTool } from './measure.ts';
import { settingsPanel, share } from './panels.ts';
import { whereChip, wherePanel } from './where.ts';
import { TRIP_TARGETS } from '../learn/trip.ts';
import { tonightPanel } from './tonight.ts';
import { type StarLabPanel, starLabPanel } from './starlab.ts';
import { type StarSeed, starSeed } from '../sim/starlink.ts';
import { type TimeBar, timeChip } from './timebar.ts';
import { type ViewBar, viewBar } from './viewbar.ts';

/** The toolbar's items. */
type Tool = 'search' | 'tonight' | 'atlas' | 'view' | 'point' | 'settings';

export type SheetId = 'atlas' | 'settings' | 'where' | 'tonight' | 'stars' | null;

/** A concept's Try it that is showing on the sky: the focus card leads back to the page, or home. */
export interface Trying {
  concept: string;
  title: string;
  label: string;
  note: string;
  article: () => void;
  home: () => void;
}

export interface Panel {
  title: string;
  el: HTMLElement;
  /** Called when the sheet opens, and again when its data may have changed. */
  refresh(): void;
  /** Element to focus on open, if not the heading. */
  focus?: HTMLElement;
  /** Pages inside the panel below the one showing; the header's back arrow shows while there are any. */
  depth?(): number;
  /** Step back one page inside the panel. */
  goBack?(): void;
}

export class Shell {
  readonly app: App;
  readonly root: HTMLElement;
  private sheet: SheetId = null;
  readonly panels: Record<Exclude<SheetId, null>, Panel>;
  private readonly sheetEl: HTMLElement;
  private readonly sheetTitle: HTMLElement;
  private readonly sheetBack: HTMLButtonElement;
  /** History entries for what is open, so Back closes it. */
  readonly back = new BackStack();
  private search!: SearchOverlay;
  private readonly sheetBody: HTMLElement;
  private readonly toastEl: HTMLElement;
  private toastTimer = 0;
  private lastFocus: HTMLElement | null = null;
  private readonly starLab: StarLabPanel;
  private readonly atlas: AtlasPanel;
  private timeBar!: TimeBar;
  private viewBar!: ViewBar;

  constructor(app: App, root: HTMLElement) {
    this.app = app;
    this.root = root;
    this.panels = {
      atlas: (this.atlas = atlasPanel(this)),
      settings: settingsPanel(this),
      where: wherePanel(this),
      tonight: tonightPanel(this),
      stars: (this.starLab = starLabPanel(this)),
    };
    this.sheetTitle = h('h2', { class: 'sheet-title', tabindex: '-1' });
    this.sheetBody = h('div', { class: 'sheet-body' });
    this.sheetBack = iconButton('back', 'Back', () => this.pageBack(), 'sheet-back');
    this.sheetEl = h('section', { class: 'sheet glass', hidden: true, 'aria-labelledby': 'sheet-title' },
      h('header', { class: 'sheet-header' }, this.sheetBack, this.sheetTitle, iconButton('close', 'Close', () => this.closeSheet(), 'sheet-close')),
      this.sheetBody);
    this.sheetTitle.id = 'sheet-title';
    this.toastEl = h('div', { class: 'toast glass', role: 'status', 'aria-live': 'polite', hidden: true });
    swipeToDismiss(this.toastEl, () => this.hideToast());
    // Reading it holds it up.
    this.toastEl.addEventListener('pointerenter', () => clearTimeout(this.toastTimer));
    this.toastEl.addEventListener('pointerleave', () => {
      if (!this.toastEl.hidden) this.toastTimer = window.setTimeout(() => this.hideToast(), 2500);
    });
    const nightVision = h('div', { class: 'night-vision', 'aria-hidden': 'true' });
    const measure = measureTool(app);
    this.search = searchOverlay(this, (open) => {
      if (open) { this.closeBars(); this.back.push('search', () => this.search.close()); } else this.back.dropLast('search');
      this.syncTools();
    });
    root.append(measure.layer, this.topBar(), measure.banner, this.reticle(), this.focusCard(), this.toolbar(), this.timeBar.el, this.viewBar.el, this.sheetEl, this.search.el, this.toastEl, this.stillHint(), nightVision);
    this.watchPointing();

    // Back steps out of a selection and of Still mode too.
    app.on('select', () => {
      if (app.selected && !this.back.has('select')) this.back.push('select', () => app.select(null));
      else if (!app.selected) this.back.dropLast('select');
    });

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
      if (app.still && !this.back.has('still')) this.back.push('still', () => app.setStill(false));
      else if (!app.still) this.back.dropLast('still');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (app.still) app.setStill(false);
        else if (this.search.open) this.search.close();
        else if (this.sheet) this.closeSheet();
        else if (this.timeBar.open) this.timeBar.close();
        else if (this.viewBar.open) this.viewBar.close();
        else if (app.measure) app.stopMeasure();
        else if (app.selected) app.select(null);
      } else if (e.key === '/' && !isTyping(e)) {
        e.preventDefault();
        this.openSearch();
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
    if (this.sheet !== id) {
      this.lastFocus = document.activeElement as HTMLElement | null;
      if (this.sheet) this.back.dropAll('page');
      else this.back.push('sheet', () => this.closeSheet());
      for (let i = panel.depth?.() ?? 0; i > 0; i--) this.pageOpened();
    }
    this.search.close();
    this.closeBars();
    this.sheet = id;
    this.sheetTitle.textContent = panel.title;
    fill(this.sheetBody, panel.el);
    this.sheetEl.hidden = false;
    this.sheetEl.dataset.sheet = id;
    document.documentElement.dataset.sheet = id;
    panel.refresh();
    this.sheetBody.scrollTop = 0;
    (panel.focus ?? this.sheetTitle).focus({ preventScroll: true });
    this.app.setSection(id === 'tonight' || id === 'atlas' ? id : 'sky');
    this.syncTools();
    this.syncSheetHeader();
  }

  /** A panel moved one page deeper: Back should bring it up again. */
  pageOpened(): void {
    if (!this.sheet) return;
    this.back.push('page', () => this.panelBack());
  }

  /** The header's back arrow, or anything else in the UI that steps back a page. */
  pageBack(): void {
    if (!this.sheet || !(this.panels[this.sheet].depth?.() ?? 0)) return;
    this.back.dropLast('page');
    this.panelBack();
  }

  private panelBack(): void {
    if (!this.sheet) return;
    this.panels[this.sheet].goBack?.();
    this.syncSheetHeader();
  }

  /** Show the back arrow while the open panel has pages behind it. */
  syncSheetHeader(): void {
    const depth = this.sheet ? this.panels[this.sheet].depth?.() ?? 0 : 0;
    this.sheetBack.hidden = depth === 0;
    this.sheetEl.dataset.depth = String(depth);
  }

  closeSheet(): void {
    if (!this.sheet) return;
    this.back.dropAll('page');
    this.back.dropLast('sheet');
    this.sheet = null;
    this.sheetEl.hidden = true;
    delete document.documentElement.dataset.sheet;
    this.app.setSection('sky');
    this.syncTools();
    (this.lastFocus?.isConnected ? this.lastFocus : this.app.canvas).focus({ preventScroll: true });
  }

  /** Open the Star lab, optionally starting from a real star. */
  openStarLab(seed?: StarSeed | null): void {
    if (seed !== undefined) this.starLab.seed(seed);
    this.openSheet('stars');
  }

  private trip: TripPlanner | null = null;

  /** Open the trip planner over Space view. */
  openTrip(target?: TripTarget): void {
    this.trip ??= tripPlanner(this);
    this.trip.open(target);
  }

  private slingshot: SlingshotLab | null = null;
  private whatIf: WhatIfLab | null = null;

  /** Open a lab that runs in Space view. */
  openLab(lab: 'trip' | 'slingshot' | 'whatif'): void {
    if (lab === 'trip') this.openTrip();
    else if (lab === 'slingshot') (this.slingshot ??= slingshotLab(this)).open();
    else (this.whatIf ??= whatIfLab(this)).open();
  }

  /** Open the Atlas at an entry, a category, a concept or its front page. */
  openAtlas(target: Parameters<AtlasPanel['show']>[0]): void {
    this.atlas.show(target);
  }

  /** The search overlay, with the keyboard up. */
  openSearch(): void {
    this.search.show();
  }

  /** Select an object and turn the view to it: the sky, or Space view for a belt or cloud. */
  showObject(ref: string): void {
    const app = this.app;
    const obj = app.universe.resolve(ref);
    if (!obj) return;
    if (obj.region) {
      this.show({ select: obj.ref, camera: { mode: 'space', look: 'sun' } });
      app.centre(obj.ref);
      return;
    }
    const fov = Math.min(app.renderer.projection.fov, app.framingFov(obj.ref) * 4) / DEG;
    this.show({ select: obj.ref, camera: { mode: 'sky', look: obj.ref, fov } });
  }

  /** Apply a scene; on a phone, step back to the sky so it can be seen. */
  show(scene: Parameters<App['apply']>[0]): void {
    this.app.apply(scene);
    if (matchMedia('(max-width: 899px)').matches) this.closeSheet();
  }

  /** The one place for messages: under the Where and When chips. A newer message replaces the last. */
  toast(message: string, glyph?: string): void {
    fill(this.toastEl, glyph ? icon(glyph, 16) : null, h('span', { class: 'toast-text' }, message), iconButton('close', 'Dismiss', () => this.hideToast(), 'toast-close'));
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    // Longer notes stay up long enough to read.
    this.toastTimer = window.setTimeout(() => this.hideToast(), 2600 + message.length * 35);
  }

  private hideToast(): void {
    clearTimeout(this.toastTimer);
    this.toastEl.hidden = true;
  }

  // ---------------------------------------------------------------- bottom bars

  /** The timeline or the view chips take the dock's place; one at a time. */
  private barToggled(kind: 'time' | 'view', open: boolean): void {
    const root = document.documentElement;
    if (open) {
      this.closeSheet();
      this.search.close();
      if (kind === 'time') this.viewBar.close();
      else this.timeBar.close();
      root.dataset.bar = kind;
      this.back.push('bar', () => (kind === 'time' ? this.timeBar.close() : this.viewBar.close()));
    } else if (root.dataset.bar === kind) {
      delete root.dataset.bar;
      this.back.dropLast('bar');
    }
    this.syncTools();
  }

  private closeBars(): void {
    this.timeBar.close();
    this.viewBar.close();
  }

  // ---------------------------------------------------------------- top bar: Where and When

  private topBar(): HTMLElement {
    const { chip, bar } = timeChip(this.app, { onToggle: (open) => this.barToggled('time', open) });
    this.timeBar = bar;
    this.viewBar = viewBar(this.app, { onToggle: (open) => this.barToggled('view', open) });
    const where = whereChip(this.app, () => (this.sheet === 'where' ? this.closeSheet() : this.openSheet('where')));
    return h('div', { class: 'top-bar' }, where, chip);
  }

  // ---------------------------------------------------------------- toolbar

  private tools: Partial<Record<Tool, HTMLButtonElement>> = {};

  /** One row of labelled tools at the bottom. Each opens its panel, or closes it again. */
  private toolbar(): HTMLElement {
    const app = this.app;
    const make = (tool: Tool, label: string, glyph: string, onClick: () => void) => {
      const b = h('button', { class: 'tool', type: 'button', onclick: onClick }, icon(glyph, 20), h('span', null, label));
      this.tools[tool] = b;
      return b;
    };
    const sheet = (id: Exclude<SheetId, null>) => () => (this.sheet === id ? this.closeSheet() : this.openSheet(id));
    const el = h('nav', { class: 'toolbar glass chrome', 'aria-label': 'Tools' },
      make('search', 'Search', 'search', () => this.openSearch()),
      make('tonight', 'Tonight', 'moon', sheet('tonight')),
      make('atlas', 'Atlas', 'book', sheet('atlas')),
      make('view', 'View', 'sliders', () => (this.viewBar.open ? this.viewBar.close() : this.viewBar.show())),
      Pointing.supported ? make('point', 'Point', 'pointing', () => this.togglePointing()) : null,
      make('settings', 'Settings', 'gear', sheet('settings')));
    app.on('mode', () => {
      document.documentElement.dataset.mode = app.mode;
      this.syncTools();
    });
    app.on('pointing', () => this.syncTools());
    document.documentElement.dataset.mode = app.mode;
    this.syncTools();
    return el;
  }

  private syncTools(): void {
    if (!this.viewBar) return;
    const root = document.documentElement;
    const on: Record<Tool, boolean> = {
      search: 'search' in root.dataset,
      tonight: this.sheet === 'tonight',
      atlas: this.sheet === 'atlas' || this.sheet === 'stars',
      view: this.viewBar.open,
      point: this.app.pointing.active,
      settings: this.sheet === 'settings',
    };
    for (const [tool, button] of Object.entries(this.tools) as [Tool, HTMLButtonElement][]) {
      button.setAttribute('aria-pressed', String(on[tool]));
    }
    const point = this.tools.point;
    if (point) {
      point.hidden = this.app.mode === 'space';
      point.setAttribute('aria-label', on.point ? 'Stop following the phone' : 'Point your phone at the sky');
    }
  }

  // ---------------------------------------------------------------- phone pointing

  private togglePointing(): void {
    const app = this.app;
    if (app.pointing.active) { void app.setPointing(false); return; }
    app.setPointing(true).then((result) => {
      if (result === 'denied') this.toast('No motion access. Allow it in your browser’s settings to point the phone.', 'pointing');
      else if (result === 'unsupported') this.toast('This device has no compass to point with.', 'pointing');
    });
  }

  /** Every change of pointing, however it came about (the tool, a drag, a jump), says so in the message slot. */
  private watchPointing(): void {
    const app = this.app;
    let was = app.pointing.active;
    app.on('pointing', () => {
      const now = app.pointing.active;
      if (now === was) return;
      was = now;
      this.toast(now ? 'Pointing on: move your phone around the sky' : 'Pointing off', 'pointing');
    });
  }

  // ---------------------------------------------------------------- the focus card: what you are looking at

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

  private trying: Trying | null = null;
  private renderFocus: () => void = () => {};

  /** A concept's Try it is on the sky (or not any more). */
  setTrying(t: Trying | null): void {
    this.trying = t;
    if (t) document.documentElement.dataset.reading = t.concept; else delete document.documentElement.dataset.reading;
    this.renderFocus();
  }

  private focusCard(): HTMLElement {
    const app = this.app;
    // A concept being tried.
    const tryCap = h('span', { class: 'card-label focus-try-cap' });
    const tryTitle = h('p', { class: 'focus-try-title' });
    const tryNote = h('p', { class: 'focus-try-note' });
    const trySection = h('div', { class: 'focus-try', hidden: true },
      h('div', { class: 'focus-try-head' },
        h('span', { class: 'focus-try-glyph' }, icon('book', 18)),
        h('div', { class: 'focus-try-text' }, tryCap, tryTitle, tryNote),
        iconButton('close', 'Leave the concept and go back to your sky', () => this.trying?.home(), 'outlined focus-close')),
      h('div', { class: 'focus-try-actions' },
        h('button', { class: 'pill-button primary', type: 'button', onclick: () => this.trying?.article() }, icon('book', 16), 'Back to the article'),
        h('button', { class: 'pill-button', type: 'button', onclick: () => this.trying?.home() }, 'Back to my sky')));

    // An object.
    const title = h('h2', { class: 'card-title' });
    const subtitle = h('p', { class: 'card-subtitle' });
    const quick = h('dl', { class: 'facts quick' });
    const atlasButton = h('button', { class: 'pill-button primary focus-atlas', type: 'button', onclick: () => {
      if (app.selected) this.openAtlas({ ref: app.selected });
    } }, icon('book', 16), 'Atlas');
    const moreButton = iconButton('more', 'More things to do', () => toggleMenu(), 'outlined focus-more');
    moreButton.setAttribute('aria-haspopup', 'menu');
    moreButton.setAttribute('aria-expanded', 'false');
    const menu = h('div', { class: 'focus-menu glass', role: 'menu', hidden: true });
    const objSection = h('div', { class: 'focus-object', hidden: true },
      h('header', { class: 'card-header' },
        h('div', { class: 'card-heading' }, title, subtitle),
        atlasButton, moreButton,
        iconButton('close', 'Stop looking at it', () => app.select(null), 'outlined focus-close')),
      quick);
    const el = h('section', { class: 'focus-card glass chrome', hidden: true, 'aria-label': 'What you are looking at' }, trySection, objSection, menu);

    // ---- the ⋯ menu: every action, by name, with a line on what it does
    const closeMenu = () => {
      menu.hidden = true;
      moreButton.setAttribute('aria-expanded', 'false');
    };
    const item = (glyph: string, label: string, sub: string, run: () => void) =>
      h('button', { class: 'menu-item', type: 'button', role: 'menuitem', onclick: () => { closeMenu(); run(); } },
        icon(glyph, 20), h('span', { class: 'menu-text' }, h('span', { class: 'menu-label' }, label), sub ? h('span', { class: 'menu-sub' }, sub) : null));
    const toggleMenu = () => {
      if (!menu.hidden) { closeMenu(); return; }
      const obj = app.selectedObject;
      if (!obj) return;
      const space = app.mode === 'space' || !!app.universe.voyage;
      const items: HTMLElement[] = [];
      if (!obj.region) items.push(item('target', 'Keep it centred', app.mode === 'space' ? 'Circle it as time runs' : `The sky turns, ${obj.name} stays put`, () => app.centre(obj.ref)));
      for (const v of verbsFor(app, obj.ref)) {
        if (v.id === 'look') items.push(item('eye', 'Zoom in on it', space ? `Land and look from ${app.site.name}` : 'Fill the view with it', v.run));
        else if (v.id === 'fly') items.push(item('rocket', `Fly to ${obj.name}`, obj.starIndex !== undefined ? 'Star travel: see the sky from there' : 'Space view, circling it', v.run));
        else items.push(item('flag', `Stand on ${obj.name}`, obj.ref === 'earth' ? `Sky view from ${app.site.name}` : 'Sky view from its surface', v.run));
      }
      if (!space && obj.kind !== 'constellation' && !obj.region) items.push(item('ruler', 'Measure the angle to…', 'Then tap a second object', () => app.startMeasure(obj.ref)));
      if (obj.kind === 'sun' || (obj.starIndex !== undefined && (app.universe.stars.dist[obj.starIndex] > 0 || !!app.universe.stars.meta.get(obj.starIndex)?.n))) {
        items.push(item('star', 'Its life story', 'In the Star lab', () => { const seed = starSeed(app.universe, obj); if (seed) this.openStarLab(seed); }));
      }
      if (obj.ref in TRIP_TARGETS) items.push(item('slingshot', `Plan a trip to ${obj.name}`, 'Launch windows and what they cost', () => this.openTrip(obj.ref as keyof typeof TRIP_TARGETS)));
      items.push(item('share', 'Share this view', 'Copy a link to exactly this sky', () => share(this)));
      fill(menu, items);
      menu.hidden = false;
      moreButton.setAttribute('aria-expanded', 'true');
      (menu.querySelector('button') as HTMLButtonElement | null)?.focus({ preventScroll: true });
    };
    document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target as Node) && e.target !== moreButton && !moreButton.contains(e.target as Node)) closeMenu(); });
    menu.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeMenu(); moreButton.focus(); } });

    let riseSetFor = '';
    let riseSet: ReturnType<typeof riseSetFacts> = [];
    const style = () => ({ hour12: app.store.data.settings.hour12 });
    const factList = (facts: { label: string; value: string }[]) =>
      facts.map((f) => h('div', { class: 'fact' }, h('dt', null, f.label), h('dd', null, f.value)));

    const update = () => {
      const obj = app.selectedObject;
      const t = this.trying;
      document.documentElement.dataset.selected = String(!!obj);
      el.hidden = !obj && !t;
      trySection.hidden = !t;
      objSection.hidden = !obj;
      el.classList.toggle('both', !!obj && !!t);
      if (t) {
        tryCap.textContent = `Trying it · ${t.title}`;
        tryTitle.textContent = t.label;
        tryNote.textContent = t.note;
      }
      if (!obj) { closeMenu(); return; }
      title.textContent = obj.name;
      subtitle.textContent = obj.region ? obj.subtitle
        : app.mode === 'space' && obj.body
        ? (obj.kind === 'sun' ? obj.subtitle : `${obj.subtitle} · ${formatDistanceAU(obj.body.r)} from the Sun`)
        : app.universe.voyage ? obj.subtitle
        : `${obj.subtitle} · ${whereNow(app.universe, obj, app.layers.atmosphere)}`;
      // Out in space or among the stars there is no horizon to measure from.
      const space = app.mode === 'space' || !!app.universe.voyage;
      const key = `${obj.ref}|${Math.floor(app.clock.jdUT * 4)}|${app.site.lat}|${app.site.lon}`;
      if (key !== riseSetFor) {
        riseSetFor = key;
        riseSet = space || obj.region ? [] : riseSetFacts(app.universe, obj, app.clock.jdUT, style());
      }
      // Three numbers at most: how bright, how far, and the next rise or set.
      const facts = quickFacts(app.universe, obj).filter((f) => f.label !== 'Altitude');
      const next = riseSet.find((f) => /^(Rises|Sets)/.test(f.label));
      fill(quick, factList([...facts.slice(0, next ? 2 : 3), ...(next ? [next] : [])]));
      atlasButton.hidden = obj.ref.startsWith('tyc:');
    };
    this.renderFocus = update;
    app.on('select', () => { riseSetFor = ''; closeMenu(); update(); });
    app.on('second', update);
    app.on('time', update);
    app.on('site', update);
    app.on('mode', () => { closeMenu(); update(); });
    return el;
  }

  private stillHint(): HTMLElement {
    return h('button', { class: 'still-hint glass', type: 'button', onclick: () => this.app.setStill(false) }, 'Tap to bring the controls back');
  }
}

function isTyping(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
}
