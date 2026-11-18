# Status and handoff

Last updated 2026-11-18. Read `docs/ARCHITECTURE.md` first; this file says where
the build stands against that plan and what to do next, in order.

## Done

**Pipeline**
- esbuild build (`scripts/build.mjs`), `tsc --noEmit` typecheck, `node --test`.
- GitHub Actions (`.github/workflows/deploy.yml`) tests, builds and deploys
  `main` to https://updownupdown.github.io/firmament/. This is confirmed working.
- The live site runs the app: Sky, Space, Tonight and the Atlas (objects, concepts, labs).

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
  elements ↔ state, universal propagation, Lambert, Pluto from Standish, and
  `SMALL_BODIES`: Halley, Hale–Bopp, Ceres, Vesta, Pallas, Hygiea, Haumea,
  Makemake, Quaoar, Orcus, Eris, Gonggong and Sedna, each with a `group` shown
  as its subtitle; MPC elements via Stellarium's `ssystem_minor.ini`),
  `populations.ts` (belts and clouds of small bodies, below), `nbody.ts` (leapfrog), `galilean.ts` (Meeus ch. 44),
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
- `store.ts`: versioned localStorage document (settings, site, journey
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
- `shell.ts`: top chip (place, date, time, pace and accuracy note, play/pause;
  tapping it opens the time panel), search and view buttons, object card (quick facts, centre,
  zoom, details with rise/transit/set), selection reticle, the dock of four
  places (Sky and Space switch the view mode; Tonight and Learn open sheets) and
  one sheet at a time: full screen above the dock on phones, a left column from
  900 px. On a phone the bottom holds one bar: the dock, or the object card in
  its place while something is selected, or the journey card during a journey
  (then the object card moves under the top bar). `Esc` closes, `/` searches, space pauses.
- `panels.ts`: search; view settings (layer toggles, sky culture, Bortle slider,
  night vision, 12-hour clock, reduced motion, share link, Still mode, credits
  rendered from `ATTRIBUTION.md`); place and time (city search, geolocation,
  coordinates, date fields with AD/BC down to the clock's limits).
- `tonight.ts`: daily prompt with "Show me" (big events first, otherwise one of
  the bright planets, the Moon or the best-placed constellation, chosen by day
  number), dark-sky and Moon tiles, planets, constellations overhead and the
  next seven weeks of events from the worker.
- `facts.ts`: the words and numbers on the object card.
- Visual checks: build, serve `dist/` and screenshot with Playwright (Chromium
  needs `--use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader`);
  `document.documentElement.dataset.ready` is set after the first frame.

**Concepts** (`src/atlas/concepts.ts`, `src/ui/concept.ts`; tests in
`atlas/concepts.test.ts`). The journeys were retired on 2026-11-18 and their
scenes and diagrams folded into concepts. A `Concept` has a group, a lede and
blocks: `text`, `try` (a button that applies a `Scene`), `plot` (a diagram,
opened on request, with an optional task) and `question` (`choice` or
`number`, never gating). A plot or question that reads the sky carries a
`scene` applied before it is drawn or checked. The first Try it remembers the
reader's sky; "Back to your sky" restores it. On a phone Try it closes the
sheet and a "Back to …" pill (`data-reading`) leads back to the page.
- 18 concepts so far, each at least 500 words (tested): the turning sky,
  magnitudes, seasons (noon Sun 69.8° and 22.9° at Toronto; Stonehenge 2500
  BC), Moon phases, eclipses (8 April 2024 at Dallas, 14 March 2025 from
  Toronto), retrograde Mars 2026–27, Kepler, Galileo's moons, Hohmann
  transfers, gravity assists, What if?, star colours, proper motion,
  precession, latitude, celestial navigation, Eratosthenes, sky cultures.
- Fixed moments and places are in `atlas/moments.ts`. Tasks and diagram
  types are in `learn/tasks.ts` (`Task`, `Plot`, `checkTask`); the physics
  behind the diagrams is in `src/learn` (`orbits.ts`: `marsFix`, `marsTrack`,
  `hohmann`, `nextWindow`, `lambert`/`departureDv`; `navigation.ts`;
  `flyby.ts`; `sandbox.ts` on `astro/nbody.ts`). Diagrams: `ui/plot.ts`
  dispatches to `plot-orbits`, `plot-fix`, `plot-flyby`, `plot-sandbox`;
  shared canvas helpers in `ui/plot-kit.ts`; colours are `--plot-*` tokens.
- Atlas tabs: Objects, Concepts (by group), Labs (Star lab plus concepts with
  `lab` set). Search finds concepts (`concept:<id>`); an entry page lists the
  concepts whose `related` names it. Stored journey progress is dropped by
  the store's migration.

**Trip planner** (`src/learn/trip.ts`, `src/ui/trip.ts`; tests in
`learn/trip.test.ts`). Opened from Atlas → Labs or the Hohmann concept. A card
over Space view with Venus / Mars / Jupiter, launch windows stepped by
synodic period, and a porkchop plot (`porkchop`: departure plus arrival
v∞ from `lambert` between the real planets, by launch date and flight time;
brighter is cheaper; the cross marks the cheapest). Tap or drag to choose a
trip; Space view draws its path and a spacecraft through `SpaceRenderer.overlay`
(paths and markers in heliocentric AU; a marker's place may follow the
clock). Fly it runs time so the trip takes 12 s and stops on arrival. Mars
windows match 2020–2031; Perseverance's 30 Jul 2020 trip needs 3.8 km/s
leaving the Earth (tested). `SpaceCamera.shiftY` is a lens shift that keeps
the orbits in the sky above the card on phones (all Space shaders take
`uShift`). The small-bodies layer is turned off while the card is open and
put back after.

**Lumen, the optional guide** (owner's decision, 2026-11-17): off until the
player opts in. `Settings.guide` is `'unset' | 'on' | 'off'`; while unset,
Tonight shows a "Meet Lumen" offer, and the View panel's Guide section
toggles it. Off, the Tonight prompt is a plain almanac line. On, the prompt
card adds "What it is" (the object card blurb, or `sim/lore.ts`) and "The
story" (myth, history, other cultures) for planets, the Moon, about 25 bright
stars and 45 Western constellations, and the object card says when the
light left (`lightNote`). Look: a soft breathing point of light in the accent
colour (`.lumen-glyph`), still under reduced motion.

**New version prompt** (`ui/update.ts`): the page carries its build hash in a
`firmament-build` meta tag; 20 s after start, every 15 minutes and when the
tab comes back, it fetches `version.json` (no-store) and, if the build
differs, shows a "Reload" banner (top on wide screens, above the dock on
phones).

**Faint stars can be tapped**: `Universe.faint` keeps the same Tycho-2 bands
as the renderer (`TYCHO_KEEP`, oldest dropped first); refs are `tyc:<band>:<i>`
and resolve to a "Faint star" with magnitude and position (no colour or
catalogue number in our files). `pick` searches loaded bands near the tap,
only stars a magnitude above the limit, so what is picked is visible.

**Sky conditions** (`render/conditions.ts`): sky brightness, limiting
magnitude, eclipse dimming and the deep-sky limit, split out of `sky.ts` so
labels, picking and tests use it without the renderer.

**Time chip and timeline** (`src/ui/timebar.ts`, `src/sim/timeline.ts`; owner's
choice from the 2026-11-18 controls study, option B): the top chip shows place
and time with play/pause. Tapping it turns the bottom bar into the timeline
(`data-bar="time"` on the root hides the dock; on phones an object card moves
under the top bar and shrinks). Zooms: **Night** is noon to noon (`timelineWindow`)
with a twilight band, up-lanes for the Moon and the visible bright planets
(clipped to sunset–sunrise, `nightSpan`) and moment chips (`nightMoments`: sunset,
dark, rises, sets, best, dawn, sunrise); play runs 1 h/s and stops at sunrise.
**Month** is the calendar month with a moonlight band (Moon illumination at
22:00 each day) and events of importance ≥ 1; **Year** shows importance ≥ 2 and
seasons, filled month by month from `EventService`. Zoomed out, dragging and play
keep the clock time (`withClockOf`, `shiftSameTime`), stepping a day per beat so
the sky does not spin. ‹ › step to the same time on the next night, month or year.
The heading opens Place and time (date fields, any year). "Speed" opens the
`RATE_STEPS` and direction for anyone who wants a rate.

**View chips** (`src/ui/viewbar.ts`, `src/sim/looks.ts`; option B of the same
study): the View button turns the bottom bar into one row of layer chips under
tabs (Looks, Sky, Guides, Ground; in Space view one Space tab), so each switch is
seen working. Looks (`LOOKS`: Naked eye, Stargazer = the defaults, Planets, Star
chart, Navigator) set every sky layer and leave Space layers alone. More opens
the full View sheet. Only one bottom bar (time or view) is open at a time
(`Shell.barToggled`); opening a sheet or a journey closes them.

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

**Sky tools** (from the original plan)
- Galactic grid: layer `gridGalactic`, drawn with `EQ_TO_GAL` from `astro/frames.ts`.
- Measuring tool (`src/ui/measure.ts`): the ruler button on the object card,
  then a tap on a second object. A dashed great-circle arc with the angle,
  and a banner with the angle in hands at arm's length (`handMeasure`).
  `App.measure` holds the two ends; Escape or the banner's close stops it.
- Zoom out past the widest sky (a few wheel notches, a firm pinch, or `-`)
  lifts off into Space; zoom into the Earth past its floor lands again.
  `ZoomPast` in `render/camera.ts` needs a deliberate push, so resting on a
  limit never switches views. Zoom input is ignored while lifting off.
- Compressed scale in Space view: layer `compressed`, switched by the pill
  under the place chip. `COMPRESS` in `render/space.ts` squares-roots
  distances from the Sun (Earth stays at 1 AU), takes sizes to the 0.6 power
  and moons' distances in planet radii to the square root; tested to keep
  every planet clear of its neighbours.

**Tycho-2** (`src/astro/tycho.ts`; tests in `tycho.test.ts`): 1.9 million
stars to magnitude 12 that HYG lacks, in 45 declination bands
(`public/data/tycho/NN.bin`, 6 bytes a star, 11 MB in all). `SkyRenderer`
lists the bands the view needs once the limiting magnitude passes 8
(`tychoWanted`); `App.loadTycho` fetches them two at a time after the view
has settled for 350 ms, and the renderer keeps the twelve most recently used.
They are drawn with the star shader, brightest first, with a sun-like tint
(this copy of Tycho-2 has no colours). Not pickable. The service worker does
not precache them; it keeps each band once seen, in a cache that outlives
builds (`firmament-tycho-1`).

**Milky Way map**: `build_milkyway` blends d3-celestial's contours (blurred
by a degree, for the broad glow and the Sagittarius clouds) with Tycho-2 star
counts at magnitude 9.5–12.5 (for dark lanes and fine structure), worked in
galactic coordinates and resampled to RA/Dec. The sky shader tints the dense
star clouds warm and the thin band cool.

**Orbits on the sky**: layer `skyOrbits` draws each planet's orbit (and the
Moon's) as seen from the observer, coloured by planet; the selected body's
orbit is drawn in the accent colour.

**View panel**: layers are icon tiles in groups (On the sky, Guides, Air and
ground, Space view), then cards for light pollution, sky culture, comfort and
more.

**Offline**: `public/sw.js` precaches every file of a build, serves `data/`
cache-first and everything else network-first, and is registered from
`main.ts`. Checked by reloading with the network off.

**Observing log removed** (2026-11-17, at the owner's request): the "I saw it"
button, the Log section, sighting checks (`sim/sightings.ts`) and stored log
entries are gone; old saved logs are dropped on load.

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

**Star lab** (`src/astro/stellar.ts`, `src/sim/starlink.ts`, `src/ui/starlab.ts`;
tests in `stellar.test.ts` and `starlab.test.ts`): a sheet where the player
sets a birth mass (0.1–250 M☉) and metallicity ([Fe/H] −2.5 to +0.3) and
scrubs or plays through the star's life. `evolve(mass, feh)` returns a
`Track`: stages (main sequence, subgiant, red giant, helium burning, AGB,
planetary nebula; or supergiant / Wolf–Rayet, then carbon, neon, oxygen and
silicon burning), the ending and remnant, the birth composition and the
elements given back. Main-sequence luminosity, radius and lifetime are the
published fits (Tout et al. 1996; Hurley, Pols & Tout 2000); white dwarf
masses follow Cummings et al. 2018; neutron star or black hole from Fryer et
al. 2012 ("rapid"); pair instability from the helium core mass. Later stages
are simplified shapes between published end points. The slider gives each
stage a share by weight, not time, so days of silicon burning are visible.
Catalogue stars link in through "Life story" on a star's card (and the Sun's):
a published birth mass from `KNOWN_STARS` where there is one, else `fitStar`
finds the mass and age whose track passes nearest the star's luminosity
(from magnitude, distance and a bolometric correction) and temperature (from
its spectral type). The lab also opens from Labs in the Learn sheet.
On James's request (2026-11-17) the lab starts with a list of star types
(`STAR_TYPES`, red dwarf to a first star), each with its lifetime and fate;
picking one plays its life from birth. Mass and metals sit in a folded
"Fine-tune" card; a real star from a card skips the list.

**Belts and clouds of small bodies** (`src/astro/populations.ts`; tests in
`populations.test.ts`), added 2026-11-17 at the owner's request.
- `REGIONS`: main asteroid belt, Jupiter trojans, Kuiper belt, scattered disc,
  Oort cloud, each with published distances, counts and a blurb. They resolve
  as `region:<id>` objects (kind `region`, no place on the sky): search finds
  them, their names are labels in Space view, and selecting one flies Space
  view out to frame it (`SpaceRenderer.showRegion`). Their card uses the
  region's facts; "Show in space" switches from the sky.
- Populations are seeded samples (a few thousand points each) whose orbital
  elements follow published distributions, with the Kirkwood gaps, trojans
  locked 60° ahead of and behind Jupiter's mean longitude, and plutinos locked
  3:2 with Neptune's mean motion (resonant angle near 180°, so they never meet
  it). The Oort cloud is static, density ∝ r^-3.5 from 2,000 to 100,000 AU.
  `POP_VERT` solves Kepler's equation per point on the GPU, so belts turn with
  time at no CPU cost. Each fades in by its size on screen (`ringAlpha`).
- Layer `smallBodies` ("Belts" in Space view settings, on by default).
  `MAX_DIST` is now 300,000 AU so the whole Oort cloud fits.
- Tests: Vesta and Ceres reach opposition on the published dates (2 May and
  2 October 2025); Sedna's perihelion (76 AU, 2075–76); Eris at about 96 AU;
  the gaps are empty; the trojan swarm stays 60° from Jupiter; plutinos stay
  more than 8 AU from Neptune for 400 years.

**Notices**: toasts have a close button and can be swiped away (sideways or
up), and so can the update and measuring banners (`swipeToDismiss` in
`dom.ts`). Pointing at a toast holds it up.

**Atlas, phase 1** (2026-11-18; `src/atlas`, `src/ui/atlas.ts`; tests in
`atlas.test.ts`). Learn is now the Atlas in the dock, and Search lives inside
it (`/` and the top-bar button open it with the field focused; the old search
sheet is gone). `atlas/catalog.ts` sorts every object into categories (Sun,
planets, moons, dwarf planets and asteroids, comets, belts and clouds, stars
grouped as brightest / nearest / with a story / more named, the 88
constellations and asterisms, clusters, nebulae, galaxies, meteor showers,
sky cultures). Showers and cultures are Atlas-only refs (`shower:<id>`,
`culture:<id>`). An entry page has Show me, a live "Right now" block (rise,
set, highest, with all the numbers folded), then the reading: a full article
from `atlas/articles.ts` (Sun, planets, Moon so far; at least 500 words each,
tested) or the card blurb and Lumen's lore. The object card's book button
opens the entry; Show me on a phone closes the sheet so the sky is in view.
Concepts and Labs are the other two tabs (see Concepts).

## Atlas plan (agreed with James 2026-11-17)

Plan doc: https://claude.ai/artifact/THe6GBiAoC8DTMUBuFFsV6. Decisions:
satellites and probes are **out** for now (no daily data workflows); concept
articles as long as the subject deserves; journeys are **retired** once
concepts cover them; a simple generic horizon is fine when standing on other
worlds; dock becomes Sky, Tonight, Atlas once viewpoints are unified. Order:
1. Atlas foundation (done). 2. Concepts (about 60, each with "Try it" scenes),
then remove journeys and their stored progress (first 18 concepts and the
removal done 2026-11-18; more concepts to come in batches). 3. Sandboxes in Space view
(overlay hook, a "What if" badge for physics forks, Hohmann planner with a
porkchop plot first). 4. One viewpoint (continuous lift-off and landing,
viewpoint chip, standing on the Moon and Mars). 5. Star travel to stars
within about 100 ly.

## Next steps, in order

### 1. Remaining work
- Phone pointing was confirmed working by the owner on 2026-11-17.

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

## Layout plan (chosen 2026-11-17)

James picked option C from the layout study
(https://claude.ai/artifact/MkgFRjfXzB3usHW9VqBw3D), built in two steps.
Step 1 (done, PR 22): the four-place dock (Sky, Space, Tonight, Learn), the
Learn sheet (Continue, Labs, Journeys by theme) and the journey card at the
bottom on phones. Step 2 (done): the time bar folded into the top chip, so on a
phone the bottom holds one bar: the dock, the object card, or the journey step.
Still open from the study: Android back closing sheets, swipe-down on sheets, a
ring around a journey's target.
