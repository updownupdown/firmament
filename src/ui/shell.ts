// The app shell: the living sky behind, a top bar whose chip holds the time
// (with search and settings beside it), and one bar at the bottom: the dock
// of four places (Sky, Space, Tonight, Atlas), or the object card, the
// timeline or the view switches in its place. The View button sits at the
// bottom right. One sheet at a time holds everything else. Back (the phone's
// or the browser's) closes whatever was opened last; see back.ts.

import { verbsFor, viewpointChip } from './viewpoint.ts';
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
import { lightNote } from '../sim/lore.ts';
import { h, fill, icon, iconButton, lumenGlyph, swipeToDismiss } from './dom.ts';
import { blurb, detailFacts, quickFacts, riseSetFacts, whereNow } from './facts.ts';
import { type AtlasPanel, atlasPanel } from './atlas.ts';
import { measureTool } from './measure.ts';
import { placeTimePanel, settingsPanel } from './panels.ts';
import { tonightPanel } from './tonight.ts';
import { type StarLabPanel, starLabPanel } from './starlab.ts';
import { type StarSeed, starSeed } from '../sim/starlink.ts';
import { type TimeBar, timeChip } from './timebar.ts';
import { type ViewBar, viewBar } from './viewbar.ts';

/** The four places in the dock. */
type Place = 'sky' | 'space' | 'tonight' | 'atlas';

export type SheetId = 'atlas' | 'settings' | 'place' | 'tonight' | 'stars' | null;

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
      place: placeTimePanel(this),
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
    const point = this.pointButton();
    if (point) root.append(point);
    root.append(viewpointChip(app, [this.scaleButton()]));
    const measure = measureTool(app);
    this.search = searchOverlay(this, (open) => {
      if (open) { this.closeBars(); this.back.push('search', () => this.search.close()); } else this.back.dropLast('search');
    });
    root.append(measure.layer, this.topBar(), measure.banner, this.reticle(), this.objectCard(), this.dock(), this.viewButton(), this.timeBar.el, this.viewBar.el, this.sheetEl, this.search.el, this.toastEl, this.stillHint(), nightVision);

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
    this.syncDock();
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
    this.syncDock();
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

  toast(message: string): void {
    fill(this.toastEl, h('span', { class: 'toast-text' }, message), iconButton('close', 'Dismiss', () => this.hideToast(), 'toast-close'));
    this.toastEl.hidden = false;
    clearTimeout(this.toastTimer);
    // Longer notes (Lumen's) stay up long enough to read.
    this.toastTimer = window.setTimeout(() => this.hideToast(), 3200 + message.length * 35);
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
  }

  private closeBars(): void {
    this.timeBar.close();
    this.viewBar.close();
  }

  // ---------------------------------------------------------------- top bar

  private topBar(): HTMLElement {
    const { chip, bar } = timeChip(this.app, {
      openPlace: () => this.openSheet('place'),
      onToggle: (open) => this.barToggled('time', open),
    });
    this.timeBar = bar;
    this.viewBar = viewBar(this.app, { onToggle: (open) => this.barToggled('view', open) });
    return h('div', { class: 'top-bar chrome' }, chip,
      iconButton('search', 'Search', () => this.openSearch(), 'glass'),
      iconButton('gear', 'Settings', () => (this.sheet === 'settings' ? this.closeSheet() : this.openSheet('settings')), 'glass'));
  }

  /** The View button, bottom right: layers, looks, light pollution and sky culture in the bottom bar. */
  private viewButton(): HTMLElement {
    return iconButton('sliders', 'View', () => (this.viewBar.open ? this.viewBar.close() : this.viewBar.show()), 'glass view-button chrome');
  }

  /**
   * A round icon button that widens for a moment to say what it just did,
   * in place of a toast.
   */
  private flash(button: HTMLElement, text: string): void {
    const label = button.querySelector('.flash-label') as HTMLElement;
    label.textContent = text;
    button.classList.add('flashing');
    clearTimeout(Number(button.dataset.flashTimer ?? 0));
    button.dataset.flashTimer = String(window.setTimeout(() => button.classList.remove('flashing'), 2200));
  }

  /** Phone pointing: only offered on devices that can do it. */
  private pointButton(): HTMLElement | null {
    const app = this.app;
    if (!Pointing.supported) return null;
    const button = h('button', { class: 'icon-button glass flash-button point-button chrome', type: 'button', onclick: () => {
      if (app.pointing.active) { void app.setPointing(false); this.flash(button, 'Pointing off'); return; }
      app.setPointing(true).then((result) => {
        if (result === 'denied') this.flash(button, 'No motion access');
        else if (result === 'unsupported') this.flash(button, 'No compass here');
        else this.flash(button, 'Pointing on');
      });
    } }, h('span', { class: 'flash-label' }), icon('pointing'));
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

  /** Space view: true or compressed distances and sizes. The icon shows which; the name shows for a moment after a switch. */
  private scaleButton(): HTMLElement {
    const app = this.app;
    const glyph = h('span', { class: 'flash-icon' });
    const button = h('button', { class: 'icon-button glass flash-button scale-button chrome', type: 'button', onclick: () => {
      app.setLayer('compressed', !app.layers.compressed);
      this.flash(button, app.layers.compressed ? 'Compressed scale' : 'True scale');
    } }, glyph, h('span', { class: 'flash-label' }));
    let shown: boolean | null = null;
    const sync = () => {
      const on = app.layers.compressed;
      if (on !== shown) fill(glyph, icon(on ? 'squeeze' : 'spread'));
      shown = on;
      const label = on ? 'Compressed scale: switch to true scale' : 'True scale: switch to compressed scale';
      button.setAttribute('aria-label', label);
      button.title = label;
      button.hidden = app.mode !== 'space';
    };
    app.on('settings', sync);
    app.on('mode', sync);
    sync();
    return button;
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
    const lumen = h('p', { class: 'card-lumen', hidden: true });
    const detailsLabel = h('span', null, 'More details');
    const detailsButton = h('button', { class: 'card-disclosure', type: 'button', 'aria-expanded': 'false' }, detailsLabel, icon('up', 16));
    const measureButton = iconButton('ruler', 'Measure the angle to another object', () => {
      if (app.selected) app.startMeasure(app.selected);
    }, 'outlined');
    const lifeButton = h('button', { class: 'pill-button', type: 'button', onclick: () => {
      const obj = app.selectedObject;
      const seed = obj ? starSeed(app.universe, obj) : null;
      if (seed) this.openStarLab(seed);
    } }, icon('star', 16), 'Life story');
    const readButton = iconButton('book', 'Read about it in the Atlas', () => {
      if (app.selected) this.openAtlas({ ref: app.selected });
    }, 'outlined');
    // Look at it, Fly to it, Stand on it: whichever make sense for this object from here.
    const verbRow = h('div', { class: 'card-verbs' });
    const followButton = iconButton('target', 'Centre and follow', () => {
      if (app.selected) app.centre(app.selected);
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
      lumen,
      h('div', { class: 'card-actions' },
        verbRow,
        followButton,
        readButton,
        measureButton,
        lifeButton),
      detailsButton,
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
      subtitle.textContent = obj.region ? obj.subtitle
        : app.mode === 'space' && obj.body
        ? (obj.kind === 'sun' ? obj.subtitle : `${obj.subtitle} · ${formatDistanceAU(obj.body.r)} from the Sun`)
        : `${obj.subtitle} · ${whereNow(app.universe, obj, app.layers.atmosphere)}`;
      const space = app.mode === 'space';
      fill(quick, factList(quickFacts(app.universe, obj).filter((f) => !space || f.label !== 'Altitude')));
      // Lumen, when it is on, says how old the light is.
      const note = app.store.data.settings.guide === 'on' && !space ? lightNote(app.universe, obj) : null;
      lumen.hidden = !note;
      if (note) fill(lumen, lumenGlyph(), h('span', null, note));
      measureButton.hidden = space || obj.kind === 'constellation' || !!obj.region;
      followButton.hidden = !!obj.region;
      readButton.hidden = obj.ref.startsWith('tyc:');
      const verbs = verbsFor(app, obj.ref);
      // The verb that keeps you where you are leads: looking from the ground, flying in space.
      const lead = space ? 'fly' : 'look';
      const key = `${obj.ref}|${verbs.map((v) => v.id).join()}|${lead}`;
      if (verbRow.dataset.key !== key) {
        verbRow.dataset.key = key;
        fill(verbRow, verbs.map((v) => h('button', {
          class: `pill-button${v.id === lead ? ' primary' : ''}`, type: 'button', onclick: () => {
            // Fresh each time: the selection may have changed since the row was built.
            const sel = app.selected;
            if (!sel) return;
            verbsFor(app, sel).find((x) => x.id === v.id)?.run();
          },
          'aria-label': `${v.label}: ${obj.name}`, title: v.label,
        }, icon(v.glyph, 16), h('span', { class: 'verb-label' }, v.label))));
      }
      lifeButton.hidden = !(obj.kind === 'sun' || (obj.starIndex !== undefined && (app.universe.stars.dist[obj.starIndex] > 0 || !!app.universe.stars.meta.get(obj.starIndex)?.n)));
      renderMore();
    };
    detailsButton.addEventListener('click', () => {
      expanded = !expanded;
      more.hidden = !expanded;
      detailsButton.setAttribute('aria-expanded', String(expanded));
      detailsLabel.textContent = expanded ? 'Fewer details' : 'More details';
      renderMore();
    });
    app.on('select', () => { riseSetFor = ''; update(); });
    app.on('second', update);
    app.on('time', update);
    app.on('site', update);
    app.on('mode', update);
    return el;
  }

  // ---------------------------------------------------------------- dock

  private dockButtons: Partial<Record<Place, HTMLButtonElement>> = {};

  /** The four places: the sky from the ground, space, tonight's guide, and the Atlas (objects, concepts and labs). */
  private dock(): HTMLElement {
    const app = this.app;
    const make = (place: Place, label: string, glyph: string, onClick: () => void) => {
      const b = h('button', { class: 'dock-item', type: 'button', onclick: onClick }, icon(glyph, 20), h('span', null, label));
      this.dockButtons[place] = b;
      return b;
    };
    const el = h('nav', { class: 'dock glass chrome', 'aria-label': 'Places' },
      make('sky', 'Sky', 'sky', () => { this.closeSheet(); app.setMode('sky', undefined, true); }),
      make('space', 'Space', 'orbit', () => { this.closeSheet(); app.setMode('space', undefined, true); }),
      make('tonight', 'Tonight', 'moon', () => this.openSheet('tonight')),
      make('atlas', 'Atlas', 'book', () => this.openSheet('atlas')));
    app.on('mode', () => {
      document.documentElement.dataset.mode = app.mode;
      this.syncDock();
    });
    document.documentElement.dataset.mode = app.mode;
    this.syncDock();
    return el;
  }

  private syncDock(): void {
    const current = this.sheet === 'tonight' || this.sheet === 'atlas' ? this.sheet : this.app.mode === 'space' ? 'space' : 'sky';
    for (const [place, button] of Object.entries(this.dockButtons)) {
      if (place === current) button.setAttribute('aria-current', 'page');
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
