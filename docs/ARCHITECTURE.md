# Firmament architecture

Firmament is a planetarium and solar system simulator you can play: the real
sky for any time and place, plus journeys, a daily guide and an observing log
built on top of one shared simulation. It is a web app only (no native or watch
apps), deployed to GitHub Pages.

## Principles

- **One simulation, many uses.** Every feature reads from the same clock,
  observer and ephemerides. Nothing computes positions on its own.
- **Honest science.** Positions come from published theories and catalogs, and
  each one has a stated accuracy range that is checked by tests.
- **Scenes are the glue.** Any feature can say "show me" by applying a Scene.
- **Calm by default.** No reflex timing, no score pressure, everything playable
  by touch and keyboard, with a reduced-motion option.
- **No runtime dependencies.** TypeScript, a hand-written WebGL2 renderer and
  plain DOM UI. esbuild bundles it; Node's built-in test runner tests it.

## Layers

```
src/
  astro/     pure astronomy: no DOM, no WebGL, fully unit-tested
  sim/       the Universe service: clock, observer, body positions, queries
  render/    WebGL2 renderer: sky view and space view
  ui/        app shell, sections, panels, design tokens
  journeys/  journey definitions (data + small checker functions)
  data/      typed loaders for the generated assets in public/data
```

Dependencies flow downward only: `ui` and `journeys` use `sim` and `render`;
`render` uses `sim`; `sim` uses `astro`. `astro` imports nothing else.

### 1. `astro` — the simulation core

| Area | Model | Valid range / accuracy |
| --- | --- | --- |
| Time scales | UTC, TT, UT1 via ΔT (observed table 1657–2023, Morrison–Stephenson parabola beyond, blended) | ΔT uncertainty grows to hours by 3000 BC |
| Sidereal time | IAU 2006 GMST / GAST | sub-arcsecond |
| Precession | IAU 2006 (P03) polynomials; for \|t\| > 5000 yr blends into a uniform-rate model (50.29″/yr around the ecliptic pole, mean obliquity) | ″ near the present, qualitative over ±100,000 yr |
| Nutation | IAU 1980, largest terms | ~0.5″ |
| Aberration, light-time | annual aberration from Earth's velocity; planetary light-time iteration | ″ |
| Refraction | Bennett / Sæmundsson with temperature and pressure | ~0.1′ above 5° |
| Sun, planets | VSOP87B (heliocentric, J2000 ecliptic), truncated to ~1″ | ±4000 yr |
| Moon | ELP/MPP02 (fit to DE405), truncated | a few ″ over ±3000 yr |
| Galilean moons | Meeus ch. 44 low-precision theory | ~0.1 Jupiter radius |
| Stars | HYG v4.1: J2000 positions, distances, proper motions and radial velocities, propagated linearly in 3D | the catalog, then degrading over ±100,000 yr |
| Small bodies | Kepler orbits from osculating elements | depends on the elements |
| Dynamics | N-body leapfrog / RK4 integrator, Kepler solver, Lambert solver (patched conics) | for missions and the sandbox |
| Searches | rise/set/transit, twilight, Moon phases, equinoxes, conjunctions, oppositions, greatest elongations, solar and lunar eclipses, meteor shower calendar | minute-level timing |

Searches are generic: a bracketing root finder and a golden-section extremum
finder over any function of time. Specific searches are thin wrappers.

Tests compare against published values: Meeus worked examples, the
2020-12-21 great conjunction, the 2004 and 2012 transits of Venus, known
eclipse dates and equinox times.

### 2. `sim` — the Universe service

- `Clock`: current instant (UTC and TT), rate (paused, real time, any speed),
  and smooth scrubbing. Range is clamped to ±100,000 years, with an accuracy
  label that changes as you leave the well-modelled range.
- `Observer`: either a place on Earth (latitude, longitude, elevation, time
  zone) or a free point in space (heliocentric position and orientation).
- `Universe`: each frame, computes everything visible for the clock and
  observer, caching what changes slowly. Exposes queries used by every
  feature: `position(body)`, `altAz(body)`, `riseSet(body, day)`,
  `visibleTonight()`, `events(range)`, `search(text)`.
- `Body` registry: Sun, Moon, planets, dwarf planets, Galilean moons, stars,
  deep-sky objects, constellations; all share one `BodyRef` id format
  (`planet:mars`, `star:hip32349`, `dso:m31`, `con:western:Ori`).

### 3. `render` — WebGL2

Two camera modes share one renderer and transition continuously:

- **Sky view** (observer on Earth): an alt-azimuth dome. Layers: stars (point
  sprites; size and brightness from magnitude, colour from B–V via a blackbody
  approximation), constellation lines and labels for the selected sky culture,
  IAU boundaries, Milky Way texture, deep-sky markers, coordinate grids
  (alt-az, equatorial, ecliptic, galactic), Sun with glare, Moon with correct
  phase and libration-free terminator, planets, and an atmosphere shader with
  daylight, twilight colours and a light-pollution dial (which also lowers the
  limiting magnitude). A procedural horizon silhouette sits on top.
- **Space view** (free observer): floating origin (camera-relative positions in
  double precision, uploaded as float32) and logarithmic depth, so the same
  scene spans the Moon's orbit to the Oort cloud. Planets are lit spheres with
  procedural surfaces, orbits are drawn as lines, and a scale toggle switches
  between true and compressed distances and sizes.

Zooming out in Sky view lifts the camera off the ground into Space view;
"land" puts you back at your observer.

Labels and markers are DOM elements positioned from projected coordinates, so
they inherit the design tokens and stay accessible.

### 4. Scenes

A `Scene` is a declarative description of what the sky should look like:

```ts
interface Scene {
  time?: { utc: string } | { offsetDays: number } | 'now';
  rate?: number;
  observer?: EarthObserver | SpaceObserver;
  camera?: { look?: BodyRef | AltAz; fov?: number; mode?: 'sky' | 'space' };
  layers?: Partial<LayerFlags>;
  culture?: string;
  highlight?: BodyRef[];
  overlays?: OverlayRef[];   // e.g. a measuring tool or a plot
}
```

Every Tonight prompt, journey step, log entry, event in the calendar and shared
link (encoded in the URL hash) is a Scene. "Show me" means `app.apply(scene)`.

### 5. App shell and sections

One living sky is always behind the UI. Sections are panels over it, not
separate pages.

- **Sky** — the planetarium: search, time scrubber, location, layers, object
  cards, "point at the sky" (device orientation), and Still mode (no UI, slow
  time).
- **Tonight** — a daily prompt from the guide, what is up now and later
  tonight, and an events calendar.
- **Journeys** — chapters made of steps. A step can narrate, apply a Scene,
  ask the player to find or measure something, or run a small interactive
  (a plot, a slider, a launch window). Checkers are pure functions over the
  Universe, so they are testable.
  - Kepler's Mars: fit an orbit to observation-date positions of Mars.
  - Eratosthenes: measure Earth from noon shadows in two cities.
  - Galileo's moons: watch the Galilean moons night by night and time them.
  - Celestial navigation: latitude from Polaris, then position from two stars.
  - Time travel: Thuban as pole star, Stonehenge's solstice sunrise,
    the shifting Big Dipper.
  - Mission planning: Hohmann transfers and gravity assists.
  - Sky cultures: the same stars as different peoples drew them.
- **Log** — the observing collection: planets, Moon phases, Messier objects,
  constellations, events. An entry is checked against the sky at that time and
  place (was it above the horizon and dark enough?).
- **Space** — entered by zooming out of Sky: orrery, orbits, true or compressed
  scale.

Navigation is a dock with Sky, Tonight, Journeys and Log; Space is reached from
Sky by zooming out or from a button, and is also used by journeys.

Persistence is `localStorage` with a versioned schema: settings, observer,
log entries and journey progress.

### 6. Data pipeline

`scripts/build_data.py` turns third-party catalogs into compact assets in
`public/data/`:

| Asset | Source | License |
| --- | --- | --- |
| `stars-bright.bin`, `stars-faint.bin`, `stars-meta.json` | HYG v4.1 | CC BY-SA 4.0 |
| `cultures/*.json` | Stellarium sky cultures (CC BY-SA ones only) | CC BY-SA |
| `boundaries.json`, `dsos.json`, `milkyway.png` | d3-celestial | BSD-3-Clause |
| `vsop87.json`, `elp.json`, `deltat.json` | VSOP87 / ELP-MPP02 / ΔT tables via astronomia | MIT |

Generated files are committed so the site builds without the sources. Sources
are listed with versions in `public/data/ATTRIBUTION.md` and shown in the app.

### 7. Build, test, deploy

- `npm test` runs `node --test` on `src/**/*.test.ts` (Node strips types; the
  code uses only erasable TypeScript syntax).
- `npm run typecheck`, `npm run build` (esbuild → `dist/`).
- GitHub Actions runs all three on every push and deploys `main` to Pages.
- A service worker precaches the build so the app works offline.
