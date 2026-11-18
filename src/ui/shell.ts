// The app shell: the living sky behind, a top bar whose chip holds the time,
// and one bar at the bottom: the dock of four places (Sky, Space, Tonight,
// Atlas), or the object card or journey step in its place. One sheet at a time
// holds everything else.

import type { App } from '../app.ts';
import { Pointing } from '../render/pointing.ts';
import { formatDistanceAU } from '../sim/format.ts';
import { lightNote } from '../sim/lore.ts';
import { h, fill, icon, iconButton, lumenGlyph, swipeToDismiss } from './dom.ts';
import { blurb, detailFacts, quickFacts, riseSetFacts, whereNow } from './facts.ts';
import { type AtlasPanel, atlasPanel } from './atlas.ts';
import { type JourneyPlayer, journeyPlayer } from './journeys.ts';
import { measureTool } from './measure.ts';
import { placeTimePanel, settingsPanel } from './panels.ts';
import { tonightPanel } from './tonight.ts';
import { type StarLabPanel, starLabPanel } from './starlab.ts';
import { type StarSeed, starSeed } from '../sim/starlink.ts';
import { type TimeBar, timeChip } from './timebar.ts';

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
  private readonly starLab: StarLabPanel;
  private readonly atlas: AtlasPanel;
  private timeBar!: TimeBar;

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
    this.sheetEl = h('section', { class: 'sheet glass', hidden: true, 'aria-labelledby': 'sheet-title' },
      h('header', { class: 'sheet-header' }, this.sheetTitle, iconButton('close', 'Close', () => this.closeSheet())),
      this.sheetBody);
    this.sheetTitle.id = 'sheet-title';
    this.toastEl = h('div', { class: 'toast glass', role: 'status', 'aria-live': 'polite', hidden: true });
    swipeToDismiss(this.toastEl, () => this.hideToast());
    // Reading it holds it up.
    this.toastEl.addEventListener('pointerenter', () => clearTimeout(this.toastTimer));
    this.toastEl.addEventListener('pointerleave', () => {
      if (!this.toastEl.hidden) this.toastTimer = window.setTimeout(() => this.hideToast(), 2500);
    });
    this.journey = journeyPlayer(this);
    const nightVision = h('div', { class: 'night-vision', 'aria-hidden': 'true' });
    const point = this.pointButton();
    if (point) root.append(point);
    root.append(this.scaleButton());
    const measure = measureTool(app);
    root.append(measure.layer, this.topBar(), measure.banner, this.reticle(), this.objectCard(), this.journey.el, this.dock(), this.timeBar.el, this.sheetEl, this.toastEl, this.stillHint(), nightVision);

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
        else if (this.timeBar.open) this.timeBar.close();
        else if (app.measure) app.stopMeasure();
        else if (app.selected) app.select(null);
      } else if (e.key === '/' && !isTyping(e)) {
        e.preventDefault();
        this.openAtlas({ search: true });
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
    this.timeBar.close();
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

  /** Open the Star lab, optionally starting from a real star. */
  openStarLab(seed?: StarSeed | null): void {
    if (seed !== undefined) this.starLab.seed(seed);
    this.openSheet('stars');
  }

  /** Open the Atlas at an entry, a category, or its search field. */
  openAtlas(target: Parameters<AtlasPanel['show']>[0]): void {
    this.atlas.show(target);
  }

  /** Begin or resume a journey, with the sky in view. */
  startJourney(id: string): void {
    this.closeSheet();
    this.timeBar.close();
    this.journey.start(id);
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

  // ---------------------------------------------------------------- top bar

  private topBar(): HTMLElement {
    const { chip, bar } = timeChip(this.app, {
      openPlace: () => this.openSheet('place'),
      onToggle: (open) => {
        if (open) this.closeSheet();
        if (open) document.documentElement.dataset.bar = 'time';
        else delete document.documentElement.dataset.bar;
      },
    });
    this.timeBar = bar;
    return h('div', { class: 'top-bar chrome' }, chip,
      iconButton('search', 'Search the Atlas', () => this.openAtlas({ search: true }), 'glass'),
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
    const zoomButton = h('button', { class: 'pill-button primary', type: 'button', onclick: () => {
      if (app.selected) app.centre(app.selected, app.framingFov(app.selected));
    } }, 'Zoom in');
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
        zoomButton,
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
      zoomButton.textContent = obj.region && !space ? 'Show in space' : 'Zoom in';
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

  /** The four places: the sky from the ground, space, tonight's guide, and the Atlas (objects, labs and journeys). */
  private dock(): HTMLElement {
    const app = this.app;
    const make = (place: Place, label: string, glyph: string, onClick: () => void) => {
      const b = h('button', { class: 'dock-item', type: 'button', onclick: onClick }, icon(glyph, 20), h('span', null, label));
      this.dockButtons[place] = b;
      return b;
    };
    const el = h('nav', { class: 'dock glass chrome', 'aria-label': 'Places' },
      make('sky', 'Sky', 'sky', () => { this.closeSheet(); app.setMode('sky'); }),
      make('space', 'Space', 'orbit', () => { this.closeSheet(); app.setMode('space'); }),
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
