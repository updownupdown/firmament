# Status and handoff

Last updated 2026-11-16. Read `docs/ARCHITECTURE.md` first; this file says where
the build stands against that plan and what to do next, in order.

## Done

**Pipeline**
- esbuild build (`scripts/build.mjs`), `tsc --noEmit` typecheck, `node --test`.
- GitHub Actions (`.github/workflows/deploy.yml`) tests, builds and deploys
  `main` to https://updownupdown.github.io/firmament/. This is confirmed working.
- The live site is still the placeholder page: `src/main.ts` only prints
  "Firmament is being built."

**Data** (`scripts/build_data.py` → `public/data/`, committed)
- `stars-bright.bin` (8,920 stars ≤ mag 6.5) and `stars-faint.bin` (101k stars to
  mag 10, plus everything within 25 pc and every star used by a sky culture).
  The binary format is documented in `src/astro/stars.ts`.
- `stars-meta.json`: names, Bayer/Flamsteed, constellation, spectral type, HD, Gliese.
- `cultures/*.json` and `cultures/index.json`: 16 CC BY-SA sky cultures from
  Stellarium. Lines are star indices into the catalog; Western includes asterisms.
- `boundaries.json` (IAU), `dsos.json` (Messier plus bright NGC/IC), `milkyway.png`
  (2048×1024 equirectangular RA/Dec brightness).
- `vsop87b.json` (9k terms), `elp-mpp02.json` (2.5k terms), `deltat.json`.
- `ATTRIBUTION.md` lists sources and licenses. The app must show credits.
- To regenerate, clone the sources into `../vendor` (commands in the script's
  docstring) and run `python3 scripts/build_data.py [stars|cultures|...]`.
  This needs numpy and Pillow.

**Astronomy core** (`src/astro`, 19 tests passing in `astro.test.ts`)
- `math.ts`: vectors, row-major 3×3 matrices, passive rotations, slerp.
- `time.ts`: JD ↔ calendar (Julian before 1582-10-15; works for negative JD),
  ΔT (table plus Espenak–Meeus polynomials, continuous), TT ↔ UT.
- `frames.ts`: IAU 2006 precession blended into a long-term model (valid to
  ±100k yr), IAU 1980 nutation (31 terms), obliquity, ERA/GMST/GAST,
  equator→horizon matrix (frame axes are **x = south, y = east, z = up**),
  az/alt helpers, refraction, and WGS84 observer position.
- `vsop87.ts`, `moon.ts` (ELP/MPP02), `kepler.ts` (Kepler solvers,
  elements ↔ state, universal propagation, Lambert, Pluto from Standish, Halley
  and Hale–Bopp), `nbody.ts` (leapfrog), `galilean.ts` (Meeus ch. 44),
  `bodies.ts` (radii, poles, rotation, magnitudes), `stars.ts` (catalog loader,
  linear 3D space motion, designations, B–V → colour).
- `ephemeris.ts`: `Ephemeris`, `makeFrame(eph, jdUT, site)` → a `Frame` holding
  every per-instant matrix, and `observeBody(eph, frame, id)` → apparent
  topocentric direction (J2000 frame, light-time and aberration applied),
  distance, phase, illumination, magnitude, angular radius, Sun direction and
  Saturn ring tilt.
- `search.ts` (crossings, minima, maxima) and `events.ts`: rise/transit/set,
  twilight, Moon phases, seasons, conjunctions, oppositions, elongations, lunar
  and solar eclipses (global type, plus local magnitude and obscuration), and
  meteor showers.
- Verified against: Meeus 7.a, 12.a, 25.b, 33.a, 44.a and 47.a; the 2020 great
  conjunction; the 2020 Mars opposition; the 2024 equinox; eclipses from 2022–2026
  including the 2023 hybrid; 2024-04-08 being total in Dallas and partial in
  Toronto; Toronto sunrise and sunset; Thuban as the pole star in 2800 BC.

**Simulation service** (`src/sim`, `src/data`; 15 tests in `sim.test.ts`)
- `clock.ts`: `Clock` (`jdUT`, `rate` in simulated seconds per real second,
  `paused`, `tick`, `setJd`, `now`), clamped to J2000 ± 100,000 years, and
  `accuracyAt(jd)` → level, short label and a plain-language sentence.
- `universe.ts`: `Universe` owns the ephemeris, star catalog, cultures and DSOs.
  `update(jdUT)` builds the `Frame` and observes every body in `TRACKED_BODIES`
  plus the Galilean moons (0.9 ms per call; a repeat call with the same instant
  is free). `resolve(ref)` → `SkyObject` for any reference, `horizontal(dir)`,
  `equatorial(dir)`, `riseSet(ref, jd0)`, `search(text)`.
- References: `sun`, `moon`, `mars`…, `io`…, `halley`; `star:<hip>` or
  `star#<index>`; `dso:M31`; `con:<culture>:<id>`.
- `tonight.ts`: `tonight(universe, jdUT)` → twilight, darkness, Moon phase, each
  planet's visibility window and best moment, and well-placed constellations.
  Takes about 110 ms, so call it when the Tonight panel opens and cache per night.
- `scene.ts`: `Scene`, `LayerFlags`, `encodeScene`/`decodeScene` for the URL hash
  (format documented in the file; layer order is append-only).
- `store.ts`: versioned localStorage document (settings, site, log, journey
  progress, seen hints) with `migrate` for repair; works in memory if storage
  is blocked.
- `format.ts`: local time through the site's IANA zone for 1900–2500 and local
  mean time outside that; "3000 BC" years; Julian calendar note; RA/Dec, compass
  words, distances, durations.
- `events.ts` + `events.worker.ts`: `EventService.month()` / `.range()` ask a
  Web Worker (second esbuild entry, `dist/events-worker.js`) for one month at a
  time, cached in memory and localStorage. Create it with
  `new EventService(workerCompute(() => new Worker('events-worker.js', { type: 'module' })), browserStorage())`.
- `src/data/load.ts`: `loadCore()` (ephemerides, bright stars, names, Western
  culture, DSOs), then `loadFaintStars`, `loadCulture`, `loadBoundaries`.
  Culture lines can reference faint-star indices, so skip segments whose stars
  are not loaded yet and call `universe.catalogChanged()` after loading.
- `places.ts`: about 120 places with IANA time zones, including journey sites.

## Next steps, in order

### 1. `src/render` — WebGL2
Planned design (not yet written):
- **Sky view uses a stereographic projection** in the vertex shader. The camera
  points along −z; for a unit direction `d` in camera space,
  `ndc = d.xy * 2 / (1 - d.z) * s`, where `s = 1 / (2 tan(fov/4))`, with aspect
  correction. Discard when `d.z > 0.98`. Subdivide long line segments to about
  2° so great circles curve correctly. Mirror the same projection in JS for
  labels and picking.
- Uniforms: `j2000ToHorizon` (from `Frame`), the view rotation (az/alt/roll),
  `years` since J2000 for star space motion, limiting magnitude and refraction
  parameters.
- Passes:
  1. A full-screen sky pass: analytic atmosphere (day, twilight band toward
     the Sun, Mie glow, light-pollution dome) plus the Milky Way texture,
     sampled by mapping each pixel's direction back to RA/Dec and faded by sky
     brightness.
  2. Stars as `gl.POINTS`, with attributes pos (pc) and vel (pc/yr) so the
     shader does `p + v·years`, plus magnitude and colour. Size and alpha come
     from flux relative to the limiting magnitude, which depends on sky
     brightness, the Bortle setting and FOV.
  3. Lines as screen-space quads (two endpoints per vertex, both with pos/vel
     so constellations deform over deep time): constellation figures,
     boundaries, grids, horizon and orbit lines.
  4. Solar system bodies as sphere impostors on billboards: the per-pixel
     normal is lit by the Sun direction, with procedural surfaces in body-fixed
     coordinates (Moon maria as hand-placed ellipses, Jupiter bands, Saturn with
     rings, Mars colour), a magnitude-based glow, and Sun glare.
  5. A ground pass: a procedural horizon silhouette from a few azimuth
     sines. The star and line shaders discard below the same profile.
  - Apply refraction in shaders near the horizon.
- **Space view**: a perspective camera with a floating origin (subtract the
  camera position in doubles before uploading float32). Bodies are the same
  impostors, sorted back to front with no depth buffer. Orbits are sampled
  from VSOP or Kepler over one period. Stars are a background at infinity.
- Apply annual aberration to stars in the shader (`normalize(dir + earthVel / c)`)
  so they match `Universe.starDirection`, which labels and picking use.
  Toggle between true and compressed scale. Enter Space with a "lift off"
  animation from the observer's location, and "land" to go back.
- Labels are pooled DOM elements positioned with transforms each frame.
  Picking finds the nearest projected object in screen space.

### 2. `src/ui` — shell and sections
- Create `tokens.css` first (colours, type, spacing, radii and motion as CSS
  custom properties), with a plain provisional theme. The owner wants **UI
  design-language mockup options** (a Design artifact with three directions)
  before polishing. Directions to offer: "Observatory" (brass and ink,
  instrument-like), "Star atlas" (engraved, paper-on-night, serif), and "Quiet
  glass" (minimal, soft).
- Layout: the sky canvas is always behind. A bottom dock (Sky, Tonight,
  Journeys, Log); panels are bottom sheets on phones and side panels on desktop.
  Sky has a top chip for place and time, a time scrubber with rate buttons,
  search, a layers sheet (lines, culture, boundaries, grids, Milky Way, DSOs,
  atmosphere, ground, Bortle), an object card with an "I saw it" log button,
  phone pointing (DeviceOrientation; iOS needs a permission tap), Still mode
  and a night-vision red overlay.
- Tonight: twilight times, Moon, planets visible tonight with best time and
  direction, well-placed constellations, upcoming events (from the worker),
  and a daily guide prompt chosen deterministically per date. Each item has a
  Scene behind "Show me". The guide character is still unnamed; ask the owner.
- Log: checklists (naked-eye planets, Moon phases, 110 Messier objects, 88
  constellations, events). Entries are verified by recomputing altitude and
  Sun altitude at the logged time and place.
- Credits screen showing `ATTRIBUTION.md`.

### 3. Journeys (`src/journeys`)
Engine: a journey has steps; a step has text, an optional Scene and an
optional task (`find` a body by tapping it, `choice`, `number` with tolerance,
or a `custom` mount for canvas interactives with a checker). Planned content:
- **Wandering pole**: Thuban in 2800 BC, Polaris now, Vega in AD 14,000, and a
  slider deforming the Big Dipper over ±100k years.
- **Celestial navigation**: latitude from Polaris's altitude at a hidden
  location, then the south pole from Crux.
- **Eratosthenes**: noon Sun at Alexandria vs Syene on the June solstice
  (around 240 BC), measure the 7.2° difference, compute the circumference.
- **Galileo's moons**: Padua in January 1610, night by night, then estimate
  Io's period.
- **Kepler's Mars**: triangulate Mars from pairs of Earth positions 687 days
  apart (Kepler's actual method), then fit an ellipse on a 2D canvas.
- **Mission planning**: Hohmann transfer to Mars, choosing the launch date
  (phase angle about 44°), checked with `lambert`.
- **Sky cultures**: find Maui's fishhook (Hawaiian) and the same stars in
  other cultures.

### 4. Launch
Merge to `main`, check the live site, then send the owner next steps and the
design mockups.

## Environment notes
- The owner doesn't run the app locally. Work on a branch, merge into `main`
  with `--no-ff`, and push. Pushing `main` deploys.
- Sessions in the Firmament project can open pull requests; use one per step
  and merge it once CI is green.
- Use Playwright (if available) to screenshot the built site for visual
  checks before merging.
