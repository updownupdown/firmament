// The app's one shared state: clock, observer, renderer, selection and
// settings. Sections of the UI read from it and call its methods; "show me"
// anywhere means `app.apply(scene)`.

import { DEG, clamp } from './astro/math.ts';
import { jdNow } from './astro/time.ts';
import { type CoreData, loadBoundaries, loadCulture, loadFaintStars } from './data/load.ts';
import { SkyCamera, attachControls } from './render/camera.ts';
import { LabelLayer, collectLabels, layoutLabels } from './render/labels.ts';
import { pick } from './render/pick.ts';
import { SkyRenderer } from './render/sky.ts';
import { SpaceRenderer } from './render/space.ts';
import { Clock } from './sim/clock.ts';
import { EventService, workerCompute } from './sim/events.ts';
import { PLACES } from './sim/places.ts';
import { type LayerFlags, type Scene, encodeScene, sceneJd } from './sim/scene.ts';
import { type Store, browserStorage } from './sim/store.ts';
import { type Site, type SkyObject, Universe } from './sim/universe.ts';

export type Section = 'sky' | 'tonight' | 'journeys' | 'log';
export type ViewMode = 'sky' | 'space';

export type AppEvent =
  /** A frame was drawn (the sky or the view changed). */
  | 'frame'
  /** About once a second of real time, for clocks and live readouts. */
  | 'second'
  | 'select' | 'settings' | 'site' | 'section' | 'time' | 'data' | 'mode';

const DEFAULT_SITE: Site = (() => {
  const p = PLACES[0];
  return { name: p.name, country: p.country, lat: p.lat, lon: p.lon, height: p.height ?? 0, tz: p.tz };
})();

function cssColor(name: string, fallback: [number, number, number]): [number, number, number] {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const m = /^#([0-9a-f]{6})$/i.exec(v);
  if (!m) return fallback;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export class App {
  readonly store: Store;
  readonly clock: Clock;
  readonly universe: Universe;
  readonly renderer: SkyRenderer;
  readonly camera: SkyCamera;
  readonly space: SpaceRenderer;
  /** Standing on the Earth looking up, or out in space looking back. */
  mode: ViewMode = 'sky';
  readonly events: EventService;
  readonly canvas: HTMLCanvasElement;
  selected: string | null = null;
  /** Objects a scene asked to point out. */
  highlight: string[] = [];
  section: Section = 'sky';
  /** Still mode: chrome hidden, the sky drifting. */
  still = false;

  private readonly labels: LabelLayer;
  private readonly listeners = new Map<AppEvent, Set<() => void>>();
  private readonly lineColor: [number, number, number];
  private readonly accentColor: [number, number, number];
  private lastFrame = 0;
  private lastSecond = 0;
  private sinceDraw = Infinity;
  private pendingCultures = new Set<string>();

  constructor(core: CoreData, store: Store, canvas: HTMLCanvasElement, labelRoot: HTMLElement) {
    this.store = store;
    this.canvas = canvas;
    this.clock = new Clock();
    this.universe = new Universe({
      eph: core.eph, stars: core.stars, dsos: core.dsos, cultureIndex: core.cultureIndex, cultures: [core.western],
      site: store.data.site ?? DEFAULT_SITE, jdUT: this.clock.jdUT,
    });
    this.renderer = new SkyRenderer(canvas, this.universe, 'data/milkyway.png');
    this.camera = new SkyCamera(this.renderer.projection);
    this.space = new SpaceRenderer(this.renderer.gl, this.universe, this.renderer.stars);
    this.labels = new LabelLayer(labelRoot);
    this.events = new EventService(
      workerCompute(() => new Worker('events-worker.js', { type: 'module' })), browserStorage(),
    );
    this.lineColor = cssColor('--sky-line', [0.62, 0.71, 1]);
    this.accentColor = cssColor('--color-accent', [0.62, 0.71, 1]);
    this.camera.reducedMotion = this.space.camera.reducedMotion = this.reducedMotion;

    attachControls(canvas, () => (this.mode === 'space' ? this.space.camera : this.camera), {
      onTap: (x, y) => {
        if (this.still) { this.setStill(false); return; }
        if (this.mode === 'space') {
          // In space a tap both picks a body and swings the camera round to circle it.
          const id = this.space.pick(x, y);
          if (id) this.space.setFocus(id);
          this.select(id && this.universe.resolve(id) ? id : null);
          return;
        }
        this.select(pick(this.renderer, this.layers, x, y));
      },
      onChange: () => this.invalidate(),
    });
    new ResizeObserver(() => this.invalidate()).observe(canvas);

    // The rest of the data arrives after the first frame.
    loadFaintStars(core.stars).then(() => {
      this.universe.catalogChanged();
      this.renderer.setStars();
      this.emit('data');
    }).catch(() => { /* the bright stars are enough to carry on */ });
    if (this.layers.boundaries) this.ensureBoundaries();
    this.setCulture(store.data.settings.culture);
  }

  // ---------------------------------------------------------------- events

  on(event: AppEvent, fn: () => void): () => void {
    let set = this.listeners.get(event);
    if (!set) this.listeners.set(event, (set = new Set()));
    set.add(fn);
    return () => set.delete(fn);
  }

  private emit(event: AppEvent): void {
    for (const fn of this.listeners.get(event) ?? []) fn();
  }

  invalidate(): void {
    this.renderer.dirty = true;
  }

  // ---------------------------------------------------------------- settings

  get layers(): LayerFlags {
    return this.store.data.settings.layers;
  }

  get site(): Site {
    return this.universe.site;
  }

  get reducedMotion(): boolean {
    return this.store.data.settings.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  setLayer(key: keyof LayerFlags, on: boolean): void {
    this.store.update((d) => { d.settings.layers[key] = on; });
    if (key === 'boundaries' && on) this.ensureBoundaries();
    this.invalidate();
    this.emit('settings');
  }

  setBortle(bortle: number): void {
    this.store.update((d) => { d.settings.bortle = clamp(Math.round(bortle), 1, 9); });
    this.invalidate();
    this.emit('settings');
  }

  updateSettings(change: (s: Store['data']['settings']) => void): void {
    this.store.update((d) => change(d.settings));
    this.camera.reducedMotion = this.space.camera.reducedMotion = this.reducedMotion;
    this.invalidate();
    this.emit('settings');
  }

  private boundariesRequested = false;
  private ensureBoundaries(): void {
    if (this.boundariesRequested) return;
    this.boundariesRequested = true;
    loadBoundaries().then((b) => {
      this.universe.boundaries = b;
      this.renderer.setBoundaries(b);
    }).catch(() => { this.boundariesRequested = false; });
  }

  /** Switch sky culture, fetching it on first use. */
  setCulture(id: string): void {
    const use = () => {
      this.universe.setCulture(id);
      this.store.update((d) => { d.settings.culture = id; });
      if (this.selected?.startsWith('con:') && !this.selected.startsWith(`con:${id}:`)) this.select(null);
      this.invalidate();
      this.emit('settings');
    };
    if (this.universe.cultures.has(id)) { use(); return; }
    if (this.pendingCultures.has(id)) return;
    this.pendingCultures.add(id);
    loadCulture(id).then((c) => { this.universe.addCulture(c); use(); })
      .catch(() => { /* stay on the current culture */ })
      .finally(() => this.pendingCultures.delete(id));
  }

  setSite(site: Site): void {
    this.universe.setSite(site);
    this.store.setSite(site);
    this.invalidate();
    this.emit('site');
    this.emit('time');
  }

  setSection(section: Section): void {
    if (this.section === section) return;
    this.section = section;
    this.emit('section');
  }

  setStill(on: boolean): void {
    this.still = on;
    if (on) {
      this.select(null);
      this.clock.paused = false;
      if (Math.abs(this.clock.rate) < 60) this.clock.rate = 120;
    } else if (this.clock.rate === 120) {
      this.clock.rate = 1;
    }
    this.emit('section');
    this.emit('time');
  }

  // ---------------------------------------------------------------- time

  setTime(jdUT: number): void {
    this.clock.setJd(jdUT);
    this.invalidate();
    this.emit('time');
  }

  setRate(rate: number, paused = false): void {
    this.clock.rate = rate;
    this.clock.paused = paused;
    this.emit('time');
  }

  goToNow(): void {
    this.clock.now();
    this.invalidate();
    this.emit('time');
  }

  // ---------------------------------------------------------------- selection and camera

  get selectedObject(): SkyObject | null {
    return this.selected ? this.universe.resolve(this.selected) : null;
  }

  select(ref: string | null): void {
    const obj = ref ? this.universe.resolve(ref) : null;
    this.selected = obj ? obj.ref : null;
    if (!obj) this.camera.track = null;
    this.invalidate();
    this.emit('select');
  }

  /** Where an object appears on the local sky, as the camera sees it. */
  private aim(ref: string): { az: number; alt: number } | null {
    const o = this.universe.resolve(ref);
    if (!o) return null;
    const h = this.universe.horizontal(o.dir);
    return { az: h.az, alt: this.layers.atmosphere ? h.altApparent : h.alt };
  }

  /** Turn to an object and keep it centred as the sky moves. */
  centre(ref: string, fov?: number): void {
    if (this.mode === 'space') {
      this.space.setFocus(ref);
      if (fov !== undefined) this.space.camera.flyTo(this.space.framingDistance(ref));
      this.invalidate();
      return;
    }
    const target = this.aim(ref);
    if (!target) return;
    this.camera.track = () => this.aim(ref);
    this.camera.flyTo({ ...target, fov });
    this.invalidate();
  }

  /** A field of view that frames an object comfortably. */
  framingFov(ref: string): number {
    const o = this.universe.resolve(ref);
    if (!o) return 60 * DEG;
    if (o.body) return clamp(o.body.radius * 14, 0.08 * DEG, 30 * DEG);
    if (o.kind === 'constellation') return 55 * DEG;
    if (o.kind === 'dso') return 6 * DEG;
    return 25 * DEG;
  }

  /** Switch between the sky from the ground and the solar system from outside. */
  setMode(mode: ViewMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    if (mode === 'space') {
      // Lift off: start just above the Earth and pull back until the inner planets are in view.
      this.universe.update(this.clock.jdUT);
      this.space.liftOff(this.selected ?? 'sun');
    }
    this.invalidate();
    this.emit('mode');
    this.emit('select');
  }

  /** Where a selected object is on screen, for the reticle. */
  locate(ref: string): { x: number; y: number; radiusPx: number } | null {
    if (this.mode === 'space') {
      const d = this.space.drawn.find((b) => b.id === ref);
      return d && d.onScreen ? { x: d.x, y: d.y, radiusPx: d.radiusPx } : null;
    }
    const obj = this.universe.resolve(ref);
    if (!obj || obj.kind === 'constellation') return null;
    const s = this.renderer.project(obj.dir);
    if (!s) return null;
    return { x: s.x, y: s.y, radiusPx: this.renderer.drawn.find((d) => d.id === ref)?.radiusPx ?? 0 };
  }

  // ---------------------------------------------------------------- scenes

  /** Make the sky look the way a scene describes. Parts it does not mention stay as they are. */
  apply(scene: Scene): void {
    const jd = sceneJd(scene.time, jdNow());
    if (jd !== undefined) this.clock.setJd(jd);
    if (scene.time === 'now' && scene.rate === undefined) { this.clock.rate = 1; this.clock.paused = false; }
    if (scene.rate !== undefined) {
      this.clock.paused = scene.rate === 0;
      if (scene.rate !== 0) this.clock.rate = scene.rate;
    }
    if (scene.site) this.setSite(scene.site);
    if (scene.layers) {
      this.store.update((d) => { Object.assign(d.settings.layers, scene.layers); });
      if (scene.layers.boundaries) this.ensureBoundaries();
    }
    if (scene.bortle !== undefined) this.store.update((d) => { d.settings.bortle = scene.bortle!; });
    if (scene.culture) this.setCulture(scene.culture);
    this.universe.update(this.clock.jdUT);
    this.highlight = scene.highlight ?? [];
    if (scene.select !== undefined) this.select(scene.select);
    const cam = scene.camera;
    if (cam?.mode) this.setMode(cam.mode);
    else if (cam && this.mode === 'space') this.setMode('sky');
    if (cam && this.mode === 'space') {
      if (typeof cam.look === 'string') this.centre(cam.look, cam.fov);
    } else if (cam) {
      const fov = cam.fov !== undefined ? cam.fov * DEG : undefined;
      if (typeof cam.look === 'string') {
        if (cam.track === false) {
          const t = this.aim(cam.look);
          this.camera.track = null;
          if (t) this.camera.flyTo({ ...t, fov });
        } else this.centre(cam.look, fov);
      } else {
        this.camera.track = null;
        this.camera.flyTo({ az: cam.look ? cam.look.az * DEG : undefined, alt: cam.look ? cam.look.alt * DEG : undefined, fov });
      }
    }
    this.invalidate();
    this.emit('settings');
    this.emit('time');
  }

  /** The current view as a scene, for sharing. */
  currentScene(): Scene {
    const p = this.renderer.projection;
    return {
      time: { jd: this.clock.jdUT }, rate: this.clock.paused ? 0 : this.clock.rate, site: this.site,
      camera: this.mode === 'space' ? { look: this.space.camera.focus, mode: 'space' } : this.selected && this.camera.track
        ? { look: this.selected, fov: p.fov / DEG, track: true }
        : { look: { az: p.az / DEG, alt: p.alt / DEG }, fov: p.fov / DEG },
      culture: this.universe.cultureId, bortle: this.store.data.settings.bortle,
      select: this.selected ?? undefined,
    };
  }

  shareUrl(): string {
    return `${location.origin}${location.pathname}#${encodeScene(this.currentScene())}`;
  }

  // ---------------------------------------------------------------- loop

  start(): void {
    const frame = (now: number) => {
      const dt = Math.min(0.1, (now - (this.lastFrame || now)) / 1000);
      this.lastFrame = now;
      this.clock.tick(dt);
      const space = this.mode === 'space';
      const moved = space ? this.space.camera.tick(dt) : this.camera.tick(dt);
      this.sinceDraw += dt;
      // The sky turns 15 arcseconds a second: redraw once it has moved a third of a pixel.
      const drift = (0.3 * this.renderer.projection.pixelAngle) / (7.3e-5 * Math.max(1, Math.abs(this.clock.rate)));
      // In space, planets only visibly move when time is running fast.
      const due = !this.clock.paused && this.sinceDraw >= (space ? (Math.abs(this.clock.rate) > 300 ? 0 : 1) : Math.min(drift, 1));
      if (moved || due || this.renderer.dirty || this.renderer.resize()) this.draw();
      if (now - this.lastSecond >= 1000) {
        this.lastSecond = now;
        this.emit('second');
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  private draw(): void {
    this.sinceDraw = 0;
    this.universe.update(this.clock.jdUT);
    if (this.mode === 'space') {
      const cam = this.space.camera, p = this.renderer.projection;
      cam.width = p.width; cam.height = p.height;
      cam.update();
      this.space.render({ layers: this.layers, lineColor: this.lineColor, accentColor: this.accentColor, selected: this.selected }, this.renderer.pixelRatio);
      this.labels.update(layoutLabels(this.still ? [] : this.space.labels(this.selected), p.width, p.height));
      this.renderer.dirty = false;
      this.emit('frame');
      return;
    }
    // Re-aim after the sky moved, so a tracked object stays exactly centred.
    if (this.camera.track && !this.camera.held) this.camera.tick(0);
    const con = [this.selected, ...this.highlight].find((r) => r?.startsWith('con:'));
    this.renderer.render({
      layers: this.layers, bortle: this.store.data.settings.bortle,
      highlightConstellation: con ? con.split(':')[2] : null,
      lineColor: this.lineColor, accentColor: this.accentColor,
    });
    const p = this.renderer.projection;
    const items = this.still ? [] : collectLabels(this.renderer, this.layers, this.selected, this.highlight);
    this.labels.update(layoutLabels(items, p.width, p.height));
    this.emit('frame');
  }
}
