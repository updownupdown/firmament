# Status and handoff

Last updated 2026-11-17. Read `docs/ARCHITECTURE.md` first; this file says where
the build stands against that plan and what to do next, in order.

## Done

**Pipeline**
- esbuild build (`scripts/build.mjs`), `tsc --noEmit` typecheck, `node --test`.
- GitHub Actions (`.github/workflows/deploy.yml`) tests, builds and deploys
  `main` to https://updownupdown.github.io/firmament/. This is confirmed working.
- The live site runs the app: Sky view, Tonight and Log.

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

**Sky renderer** (`src/render`; tests in `projection.test.ts`)
- `projection.ts`: `SkyProjection`, the stereographic camera (fov spans the
  shorter canvas side), mirrored exactly in GLSL. Refraction (Sæmundsson, faded
  out below the horizon) is applied in both, so labels and picking line up.
- `gl.ts` (program, mesh and texture helpers), `shaders.ts`, `sky.ts`:
  `SkyRenderer.render(options)` draws, in order, the analytic sky (day,
  twilight, light pollution by Bortle class, moonlight) with the Milky Way
  texture, stars as additive points (space motion, aberration, extinction,
  limiting magnitude from sky brightness and fov), lines as instanced quads
  (figures, boundaries, grids, ecliptic), deep-sky markers, sphere-impostor
  bodies (Sun with corona in totality, Moon with phase, maria and earthshine,
  banded Jupiter with its moons, ringed Saturn, Mars, comets) and the ground.
  `renderer.drawn` lists what was drawn, for labels and picking.
- `camera.ts`: `SkyCamera` (drag with inertia, pinch, wheel, keyboard, `flyTo`,
  `track`) and `attachControls`. `labels.ts`: pooled DOM labels with overlap
  culling. `pick.ts`: nearest object under a tap.
- `space.ts`: Space view. `SpaceCamera` orbits a focus body (yaw and pitch
  about the ecliptic pole, distance in AU, perspective); `SpaceRenderer` draws
  the same star buffer at infinity, orbit trails (one revolution, ending on the
  body; comets sampled densely near perihelion), and lit discs at true scale
  with a minimum pixel size (Sun glow, Saturn's rings). Positions are taken
  relative to the focus in doubles and uploaded in camera space, so close-ups
  do not jitter. `App.setMode('space')` lifts off from above the Earth;
  tapping a body circles it; any "Show me" lands again. `attachControls` takes
  a `Controllable`, so both cameras share the input code.
- Space view also draws Io, Europa, Ganymede and Callisto with their orbits
  (`galileanAround`), surface detail on the Sun, Moon, Earth, Mars, Jupiter
  (with the Great Red Spot) and Saturn once a disc is over about 6 px (the
  noise and Moon chunks are shared with the sky shader as `SURFACE`), the
  globe's shadow on Saturn's rings, and the Milky Way behind everything.
- Shared links keep the Space camera: `c=jupiter,,space,0.0125au,-60;12deg`
  (distance, then yaw and pitch). `SpaceRenderer.place` opens there with no
  flight. Lifting off toward a far body first pulls back until the Earth and
  the target both fit, then closes in. The camera cannot zoom inside the
  focus body (`SpaceCamera.floor`).
- Space view does not yet have a compressed-scale toggle.

**App and UI** (`src/app.ts`, `src/ui`; design direction **"Quiet glass"**,
chosen by the owner on 2026-11-16)
- `app.ts`: `App` owns the store, clock, universe, renderer, camera and events
  service, runs the frame loop (redraws only when the sky has moved a third of a
  pixel) and emits `frame`, `second`, `select`, `settings`, `site`, `section`,
  `time` and `data`. `app.apply(scene)` is what every "Show me" calls;
  `currentScene()` / `shareUrl()` go the other way.
- `ui/tokens.css` holds every colour, size and radius; `base.css` and
  `shell.css` use only those. `dom.ts` is the tiny element helper (`h`, `icon`,
  `toggle`). No framework.
- `shell.ts`: top chip (place, date, time, accuracy note), search and view
  buttons, time bar (pause, slower/faster along `RATE_STEPS` in both directions,
  a spring-back jog slider, Now), object card (quick facts, "I saw it", centre,
  zoom, details with rise/transit/set), selection reticle, the lift-off / land
  button, dock (Sky, Tonight,
  Log) and one sheet at a time: full screen above the dock on phones, a left
  column from 900 px. `Esc` closes, `/` searches, space pauses.
- `panels.ts`: search; view settings (layer toggles, sky culture, Bortle slider,
  night vision, 12-hour clock, reduced motion, share link, Still mode, credits
  rendered from `ATTRIBUTION.md`); place and time (city search, geolocation,
  coordinates, date fields with AD/BC down to the clock's limits).
- `tonight.ts`: daily prompt with "Show me" (big events first, otherwise one of
  the bright planets, the Moon or the best-placed constellation, chosen by day
  number), dark-sky and Moon tiles, planets, constellations overhead and the
  next seven weeks of events from the worker.
- `log.ts`: `logSighting` marks entries unconfirmed when the object could not
  have been seen (see Sky events below); checklists for planets,
  Moon phases, the 88 constellations and the Messier objects.
- `facts.ts`: the words and numbers on the object card.
- Visual checks: build, serve `dist/` and screenshot with Playwright (Chromium
  needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`);
  `document.documentElement.dataset.ready` is set after the first frame.

**Journeys** (`src/journeys`, `src/ui/journeys.ts`; tests in `journeys.test.ts`)
- `engine.ts`: a `Journey` is steps; a `Step` has text, an optional `Scene` and
  an optional task: `find` (tap an object), `choice`, or `number` (the answer
  may be read off the simulation when checked). `JourneyRun` tracks position.
- `content.ts`: five journeys: the wandering pole (Polaris, Thuban in 2800 BC,
  Vega in AD 14,000), find your latitude (Polaris, then the Southern Cross),
  measure the Earth (Eratosthenes, solstice noon 240 BC), Galileo's moons
  (Padua, January 1610) and one sky, many stories (Scorpius and Manaiakalani).
  Every scene and answer is asserted against the simulation in the tests.
- The player is a card over the sky. It saves progress in the store, and puts
  the player's own place, layers and culture back when a journey ends.
- Diagrams: a `Step` can carry a `plot` (`triangulate`, `mars-orbit`,
  `transfer`), drawn on a 2D canvas in the card by `src/ui/plot.ts` from the
  geometry in `src/journeys/orbits.ts` (ecliptic plane from above, AU). A
  `plot` task is answered by the diagram itself: it reports a miss (AU from a
  tap, or degrees for a launch date) and within `tolerance` counts. Plot
  colours are the `--plot-*` tokens.
- Two more journeys use them. Kepler's Mars (Prague, 1602): two sightings one
  Martian year apart cross at Mars (`marsFix`); twelve of them trace the orbit
  (`marsTrack`), 1.38 to 1.66 AU. Plan a trip to Mars: slide the launch date
  until a Hohmann transfer (`hohmann`) meets Mars; `nextWindow` finds
  4 November 2026, arriving 27 July 2027, and the tests check with `lambert`
  (`departureDv`) that a real trajectory costs least near that date
  (about 3.1 km/s).

**Time bar** (`src/ui/timebar.ts`): play/pause, a speed menu that opens
upward (direction plus the `RATE_STEPS`), and a "go to" menu with date and time
fields in the place's local time plus quick jumps. The old spring-back jog
slider is gone. Years outside 1 to 9999 go through Place and time.

**Picking**: tapping a label picks what it names (`LabelLayer.hit`). The
nearest-object pick leans toward bright and named stars, and toward
`App.pickPreference` (a journey's "find" targets). On phones a journey card
folds to just its task while there is something to find.

**Type and look**: Outfit (OFL, self-hosted in `public/fonts`, marked external
in the build), glass with a sheen and top-edge light (`--glass-sheen`,
`--glass-edge`), uppercase tracked small labels.

**Install**: `public/manifest.webmanifest`, `icon.svg` (the logo), PNG icons
including a maskable one, iOS meta tags. Settings shows "Install as an app"
when the browser offers it (or a hint on iOS).

**Milky Way from stars**: `milkyWayStars` scatters 320k points (140k on
phones) with the density of `milkyway.png`, drawn as faint points
(`MILKY_STAR_*` shaders) over a weaker glow. They are statistical stand-ins for
unresolved stars, not catalog stars, so they cannot be picked.

**Offline**: `public/sw.js` precaches every file of a build, serves `data/`
cache-first and everything else network-first, and is registered from
`main.ts`. Checked by reloading with the network off.

**Sky events in the Log** (`src/sim/sightings.ts`; tests in `sightings.test.ts`)
- `checkSighting` (objects) and `checkEvent` (calendar events) decide whether
  something could be seen from the player's place at the clock's instant.
  `checkEvent` also gives the best moment from here: the local maximum of a
  solar eclipse, the darkest hour with the radiant high for a meteor shower.
- `EVENT_GOALS` is the Log's "Sky events" checklist: lunar and solar eclipses,
  a close conjunction and ten meteor showers. Tapping one searches month by
  month (up to six years) for the next that counts from the player's place.
- The Log shows a "Happening now" card when an event is within reach of the
  clock, with its own "I saw it".

**Lunar eclipses in the sky**: `earthShadowAt` (`astro/events.ts`, tested
against the published contact times of 14 March 2025) gives the umbra and
penumbra where the Moon is. The body shader dims the Moon through the
penumbra and turns it copper in the umbra, the Moon's glare and its share of
sky brightness fall with it, so faint stars come out in totality. Solar
eclipses were already drawn (the Moon covers the Sun; corona in totality).

**Phone pointing** (`src/render/pointing.ts`; tests in `pointing.test.ts`)
- `pointingDirection(alpha, beta, gamma)` is where the back of the phone
  faces. `Pointing` listens to `deviceorientationabsolute` (Chrome) or
  `deviceorientation` with `webkitCompassHeading` (Safari, after a permission
  tap) and smooths the readings. `App.setPointing` makes the sky camera follow
  it; dragging the sky stops it. The button only appears on touch devices.
- Not yet tried on a real phone: only the maths and an emulated sensor are
  tested. Compass north is magnetic; no declination correction is applied.

## Next steps, in order

### 1. Remaining work
- Phone pointing was confirmed working by the owner on 2026-11-17.
- More real stars: Tycho-2 (2.5M stars to about mag 12) loaded in sky tiles
  only when zoomed in. Needs the catalog added to `scripts/build_data.py`.
- The Tonight guide character is still unnamed; ask the owner.

### 2. Launch
A pass over accessibility and performance on a real phone, and a short tour
for first-time visitors.

## Environment notes
- The owner doesn't run the app locally. Work on a branch, merge into `main`
  with `--no-ff`, and push. Pushing `main` deploys.
- Sessions in the Firmament project can open pull requests; use one per step
  and merge it once CI is green.
- Use Playwright (if available) to screenshot the built site for visual
  checks before merging.
