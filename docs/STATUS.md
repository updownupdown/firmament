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
- **Surface maps** (2026-11-18, `render/maps.ts`): Solar System Scope's 2k maps
  (CC BY 4.0) of the Sun, Mercury, Venus' clouds, Earth, Moon, Mars, Jupiter,
  Saturn, Uranus and Neptune, plus Saturn's ring strip (1.166–2.330 Saturn
  radii), in `public/data/textures` (`build_data.py textures`). `SurfaceMaps`
  fetches each the first time its disc is over a few pixels; both body
  shaders sample them with `mapAt` (seamless at the antimeridian) and keep the
  painted look until they arrive. The Sun only takes faint mottling from its map.
- **Orbiting moves** (2026-11-18): `orbitRate` makes the camera circle a
  focused body (not the Sun, and only within 0.05 AU) at the true circular-orbit
  rate for the clock's speed, never slower than a lap in 3 minutes and never
  faster than one in 40 s; stopped time holds still. `SpaceCamera.cruise`.
- **Line colours** (2026-11-19, `render/linestyle.ts`, setting `lineStyle`): Neutral
  (one periwinkle), Bold figures (bright blue, wider; golden orbits) and Quiet
  figures (faint grey; golden orbits). Chosen under View → Sky (and Space view).
- **Edge arrow** (`Shell.edgeArrow`, `App.offscreen`): when the selected object
  is out of view, a pill at the screen edge points to it; a tap centres it.
- **Night vision** is two layers on `document.body` (they were inside `#ui`,
  whose stacking context made the red multiply only with the controls, so the
  screen went bright red): a backdrop-filter to dim grey, then a red multiply.
- Labels: a body whose centre is behind a nearer body's true disc has no name
  (`behindDisc`; the sky view does the same for the Moon and the Sun), and the
  Planet names switch now works in Space view too.
- Small-body populations take two surface colours each (C/S types in the main
  belt, red D types among the Trojans, grey to ultra-red in the Kuiper belt,
  icy grey in the Oort cloud). Stars: B−V colour saturation lifted ×1.4 and a
  faint bloom on the brightest (`STAR_LOOK`).
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
- `shell.ts` (layout rethought 2026-11-18, owner's request): the same three
  places on every screen. **Top:** the Where chip (`ui/where.ts`: the kind of
  view, "Sky from Earth", "Space view", "Star travel", "Sky from Mars", over the
  place) and the When chip (`ui/timebar.ts`: date and time, with a glyph for live,
  running or stopped; not a button). **Bottom:** one toolbar (Search, Tonight,
  Atlas, View, Point on phones that can, Settings), always visible; Sky is gone
  because going home lives in Where. **Just above the toolbar:** the focus card,
  "what you are looking at": an object (name, what and where it is; the numbers live in the Atlas since 2026-11-18; Atlas
  as the one labelled button, a ⋯ menu that names every other action with a line
  on what it does, and × to let go) and/or the concept being tried (`Shell.setTrying`:
  Back to the article, Back to my sky). Flying to an object keeps it selected.
  **Messages:** one toast slot under the chips (`Shell.toast(text, glyph)`);
  pointing on and off is announced there from the `pointing` event, however it
  changed. Every panel has the same head (`.panel-head`: title left, × right).
  Sheets fill the screen above the toolbar on phones, a left column from 900 px.
  `Esc` closes, `/` searches, space pauses.
- `where.ts`: the Where panel (2026-11-18, mock-up C): opens over the chips like
  When, no title. One search box finds cities (`searchPlaces`), planets (orbit
  them) and stars within reach (fly toward them); my location beside it. Then
  four rows: the city on the ground; Earth, no ground (ground and atmosphere
  layers off at home: `groundless`); Solar System; Interstellar flight. A link
  opens coordinates. Standing on the Moon or Mars is only on their Atlas pages
  and focus card ("Stand on it"); the suggested-city and near-star lists are gone.
- `menu.ts`: `picker`, our own drop-down (trigger plus a fixed glass list in
  `<body>`, keyboard and outside-tap aware). No native `<select>` is left.
- `flight.ts`: the Interstellar flight HUD (heading picker, distance from the
  Sun and to go, arrival time; speed row of `FLIGHT_SPEEDS`).
- `panels.ts`: Settings (night vision, 12-hour clock, reduced motion, share
  link, Still mode, install, credits rendered from `ATTRIBUTION.md`; nothing that
  View holds); `LAYER_GROUPS` and `BORTLE` for View; `placeForm` (Where) and
  `dateForm` (When).
- `tonight.ts`: daily prompt with "Show me" (big events first, otherwise one of
  the bright planets, the Moon or the best-placed constellation, chosen by day
  number), then two full-width cards: **Dark sky** (2026-11-19: the night as a
  band from an hour before sunset to an hour after sunrise in the timeline's
  `--tl-*` colours, with a Moon-up strip, the dark hours with the Moon down in
  the accent colour, a now mark, hour ticks and a one-line verdict) and the
  **Moon** (a real picture from `ui/moonpic.ts` as it looks at its best time,
  zenith up; phase, age from the last new Moon, rise and set in time order, the
  next principal phase; Show me and Moon calendar). Then planets,
  constellations overhead and the next seven weeks of events from the worker.
- **Moon picture** (`ui/moonpic.ts`): a 2D canvas drawn pixel by pixel from
  `astro/lunar.ts` `moonFace` (picture frame x right, y up, z toward the
  observer; up = celestial north, south or the zenith) with the Moon map
  (`data/textures/moon.jpg`, loaded once as luminance), the sky shader's
  lighting and a little earthshine. Libration and the pole use the IAU 2009
  lunar model with its periodic terms (`lunarOrientation`; tested against
  Meeus 53.a to 0.1°). The sky shader still uses the simpler constant pole.
- **Moon phase calendar** (`ui/mooncal.ts`, `sim/mooncal.ts`, 2026-11-19): a
  modal (`.modal-scrim` / `.modal`, z-index 8, on the Back stack as
  `moon-calendar`) opened by `Shell.openMoonCalendar()` from Tonight's Moon
  card, the Moon's ⋯ menu and its Atlas page. A month grid (Sunday first) of
  Moons at 22:00 local, north up (south up south of the equator), each with its
  principal phase, eclipse and supermoon marks, and a bar for that night's dark
  hours with the Moon down; then the chosen day (phase, age, rise and set for
  the night as Tonight counts it, distance and size against the mean, perigee
  or apogee, eclipses and whether they are seen here, the moonless dark
  window, libration in words, Show in the sky), then the month at a glance
  (phases, perigee and apogee, eclipses) and its darkest run of nights.
  `moonMonth(u, year, month, events)` takes phases and eclipses from the
  events worker over `moonMonthSpan` and runs in about 0.15 s; nights use
  `astro/lunar.ts` `nightSky` (two-hourly positions interpolated, the Earth's
  turn exact; 5-minute samples, within 2 minutes of the full searches).
  Supermoon = full Moon under 360,000 km. Full Moons carry their traditional
  North American names (`FULL_MOON_NAMES`, with a line on each; the Harvest
  Moon is the one nearest the September equinox and the Hunter's Moon the next)
  and a Blue Moon is the second full Moon in a local calendar month (owner's
  request, 2026-11-19); shown in the grid, the day, the month list and on
  Tonight's next-phase line. Tests in `sim/mooncal.test.ts`.
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
- Atlas tabs: Solar system (the front page: `atlas/system.ts` `SOLAR_SYSTEM`,
  Sun to Oort cloud in order, not to scale, moons and belt members indented under
  their parent, a dot per body sized by kind; tested to resolve and run outward),
  Objects (category tiles one to a row), Concepts (by group, each with an icon:
  `CONCEPT_ICONS` in `ui/atlas.ts`, falling back to `GROUP_ICONS`, so give new
  concepts an icon there), Labs (Star lab plus concepts with `lab` set). The
  sheet header holds the back arrow while a page is open (`Panel.depth` /
  `goBack`), so it never scrolls away. Search finds concepts (`concept:<id>`); an entry page lists the
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

**Slingshot and What if? in Space view** (`ui/space-lab.ts` is the shared
card: framing with the lens shift, small bodies off while open, closes on
leaving Space view, one at a time).
- Slingshot (`learn/slingshot.ts`, `ui/slingshot.ts`): Voyager 2's real
  Earth–Jupiter Lambert transfer (20 Aug 1977 → 9 Jul 1979; departure
  10.1 km/s, matching its C3), then a patched-conic turn at Jupiter set by the
  closest approach (1.1–30 Jupiter radii) and side; "behind" is whichever side
  speeds it up. Space view draws the path in and the path out (green when it
  escapes); Fly it runs launch to eight years after. Tests: 10.1 radii behind
  goes from about 9.6 to 19.7 km/s against 18.2 km/s escape.
- What if? (`ui/whatif.ts`): the N-body `Sandbox` drawn in Space view with
  trails; the overlay's `hideBodies` hides the real planets and their orbits,
  and the card carries a "What if" badge (`data-whatif` on the root).
- Labs tab: Star lab, Trip planner, Slingshot, What if?. Concepts open these
  with `lab` blocks (`shell.openLab`).

**Lumen removed** (owner's decision, 2026-11-18): the opt-in guide is gone,
with the light-travel note. Its lore (`sim/lore.ts`: science and story for the
planets, the Moon, about 25 bright stars and 45 Western constellations) shows on
each object's Atlas page ("About", "The story"). The store's migration drops the
old `guide` setting.

**New version prompt** (`ui/update.ts`): the page carries its build hash in a
`firmament-build` meta tag; 20 s after start, every 15 minutes and when the
tab comes back, it fetches `version.json` (no-store) and, if the build
differs, shows a "Reload" banner (top on wide screens, above the toolbar on
phones).

**Faint stars can be tapped**: `Universe.faint` keeps the same Tycho-2 bands
as the renderer (`TYCHO_KEEP`, oldest dropped first); refs are `tyc:<band>:<i>`
and resolve to a "Faint star" with magnitude and position (no colour or
catalogue number in our files). `pick` searches loaded bands near the tap,
only stars a magnitude above the limit, so what is picked is visible.

**Sky conditions** (`render/conditions.ts`): sky brightness, limiting
magnitude, eclipse dimming and the deep-sky limit, split out of `sky.ts` so
labels, picking and tests use it without the renderer.

**When panel** (`src/ui/timebar.ts`, `src/sim/timeline.ts`; reworked
2026-11-18 as mock-up A): tapping the When chip opens the panel over the chips
(no title, the date shown once with a status line, Back to now, ×). While time
runs it shrinks to one slim bar (pause, date, pace, speed, expand) over a mini
strip; tap expand to open it again. Zoom, Jump and speed are `picker` menus on
one row with Play; speed has a Forward/Backward switch. Lanes are 14 px apart.
The date written out (tap to type any date and time,
`dateForm`), a note when the sky is less than precise, Night / Month / Year,
‹ › to the same time on the next night, month or year, then the strip. **Night**
is noon to noon (`timelineWindow`) with day, twilight and dark as the background
behind lanes for the Moon and the visible bright planets (clipped to
sunset–sunrise, `nightSpan`); play runs 1 h/s and stops at sunrise. **Month**
has moonlight each night (Moon illumination at 22:00) behind events of
importance ≥ 1; **Year** shows importance ≥ 2 and seasons, filled month by month
from `EventService`. Moments and events are one "Jump to" dropdown
(`nightMoments` at night). Zoomed out, dragging and play keep the clock time
(`withClockOf`, `shiftSameTime`). The speed is a dropdown of `RATE_STEPS`,
forwards and backwards.

**View panel** (`src/ui/viewbar.ts`, `src/sim/looks.ts`): View in the toolbar
opens it just above the toolbar (on phones it takes the focus card's place),
with the same head as every panel, then tabs (Looks, Sky, Guides, Ground with
the light-pollution slider, Culture with the sky-culture picker; in Space view
one Space tab) over tiles four to a row. Looks (`LOOKS`: Naked eye, Stargazer =
the defaults, Planets, Star chart, Navigator) set every sky layer and leave
Space layers alone. When and View are never open together (`Shell.barToggled`);
opening a sheet closes them.

**Search** (`src/ui/search.ts`, 2026-11-18): its own overlay from the search
button or `/`, the only place the field takes focus (the Atlas no longer has a
field, so the phone keyboard stays down when it opens). Before typing it shows a
few suggestions. A result turns the sky to the object (`Shell.showObject`; belts
and clouds go to Space view); its book button, and any result that is a page
(concept, category, shower, culture), opens the Atlas.

**Back button** (`src/ui/back.ts`, `Shell.back`): every layer that opens (sheet,
Atlas page, search, time or view bar, selection, lab card, Still mode) pushes a
history entry carrying its depth, and Back closes the topmost; the app is only
left when nothing is open. Layers closed from the UI drop their entry with
`dropLast`/`dropAll` (a quiet `history.go`, with pushes held until it lands).

**Ground veil**: standing on the Earth the ground is drawn at 80% opacity
(`GROUND_VEIL` in `GROUND_FRAG`), so lines below the horizon show faintly.

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
  Both, and the Where panel's moves between them, fly one unbroken path
  (`render/ascent.ts`, `App.setMode(mode, target, fly)`): the sky view rises
  along the local vertical (`SkyRenderer.height`, Earth radii), the horizon
  drops to the limb of a globe drawn in `GROUND_FRAG` with the same
  `earthSurface` as Space view, the air and the charted lines fade, the view
  turns to look straight down and `SkyProjection.lens` blends stereographic
  (0.5) into perspective (1). At `liftOffStart` (3e-4 AU from the centre) it
  matches Space view's camera star for star (tested), and Space view's
  lift-off carries on. Landing first swings Space view round over home
  (`SpaceCamera.flyToPose`), then runs the climb backwards to the pose the
  sky had when it left. Scenes, links and reduced motion still cut straight.
- Viewpoint (`App.viewpoint`, shown by the Where chip; `verbsFor` in
  `src/ui/viewpoint.ts` feeds the focus card's ⋯ menu): Look at it (`App.lookAt`: lands first
  when in space, then centres and frames), Fly to it (`App.flyToObject`:
  any Space view body or region; stars come with star travel) and Stand on
  it (`App.canStandOn`: the Earth for now; the Moon and Mars next). The
  verb that keeps you where you are leads; on narrow phones the others show
  only their icons (before the 2026-11-18 rethink; now each is a named item in
  the ⋯ menu).
- Standing on the Moon and Mars (`sim/worlds.ts`, `makeWorldFrame` in
  `astro/ephemeris.ts`, `Universe.away`): Stand on it puts the observer at
  Tranquility Base or Jezero Crater. The horizon frame comes from the world's
  IAU pole and rotation (`primeMeridian`); `observerGeo` becomes the observer
  relative to the Earth's centre, so every body (the Earth included) is seen
  from there, and the world underfoot is dropped from its own sky. The Moon
  has no air (black sky, lit grey ground, no refraction); Mars has a
  butterscotch day sky with blue around a low Sun and rust ground
  (`uWorld`, `uLand`, `uSunLit`). Rise and set times and the Moon's light are
  Earth-only and switch off away. The jump is a fade through black for now;
  Home to … in the Where panel comes back. Tests in
  `sim/worlds.test.ts` (the Earth fixed high over Tranquility Base, the
  Earth's phase from the Moon, a Martian sol, the Sun's size from Mars).
- Star travel (phase 5): Fly to it on any star with a measured distance
  within 30.7 pc (`MAX_TRIP_PC`, about 100 ly). A fade takes the observer out
  of the Solar System (`Universe.away = { world: 'star', at }`, parsecs from
  the Sun), then `App.stepTravel` eases `at` to a few hundred AU short of the
  star while the view keeps it centred, and on arrival turns round to the Sun.
  `StarCatalog.at(i, years, from)`, `Universe.starDirection`/`starMag` and the
  star shader's `uObserver` see every star with a distance from there and
  re-light it; stars without one stay put as a backdrop. Among the stars
  celestial north is up, there is no ground or air, the charted lines and
  constellation names go (they come apart), and the Sun is drawn as one more
  star of magnitude 4.83 + 5 log10(d / 10 pc) with a label. Tested: from
  Alpha Centauri the Sun is magnitude 0.47 at RA 2h 40m, Dec +60.8° in
  Cassiopeia (`sim/travel.test.ts`). Home to … in the Where panel
  comes back; going to Space from there lands over the Solar System.
  `ZoomPast` in `render/camera.ts` needs a deliberate push, so resting on a
  limit never switches views. Zoom input is ignored while lifting off.
- Interstellar flight (2026-11-18): `App.startFlight(ref)` goes out among the
  stars and flies in real time toward a star, the Sun, or where the view faces
  (`setFlightHeading`), at `FLIGHT_SPEEDS` (0.5c, 0.99c, 1,000c, 1M c, 10M c;
  `flightPcPerSecond`). Below light speed `Universe.beta` turns on special
  relativity (`astro/relativity.ts`, tested against the textbook values):
  aberration crowds stars ahead, the Doppler factor brightens them by
  7.5 log10 D (held to 2.5 mag brighter, 6 fainter) and tints them (rough colour shift), in the star shader
  (`uBeta`) and in `starDirection`/`starMag`. Faster than light is labelled
  make-believe: plain motion, no relativity. The flight stops on arrival a few
  hundred AU short.
- Flight follow-up (2026-11-19): speeds run 0.5c, 0.9c, 0.99c, then 1,000c up
  to 10 billion c, stepped with rewind/fast-forward around a play button (the
  ladder shows as dots). Past the catalog's reach the sky is a model galaxy
  (`sim/galaxy.ts`: seeded barred spiral, exponential disc 2.6 kpc, four arms
  pitched 12°, bulge and bar, Sun 8.18 kpc out; drawn with the star shader from
  20 pc out, while the Milky Way picture fades between 30 and 430 pc). "The
  galactic centre" is a heading (Sgr A* direction tested); flights stop 16 kpc
  from the Sun. Deep-sky labels hide beyond 30 pc. On desktop the speed card
  centres over the toolbar (the media rule must come after the base rule).
- When panel performance: while time runs, the strip's window is rebuilt at
  most every 1.5 s at Night zoom (each rebuild runs `tonight()`, ~110 ms) and
  every 0.4 s otherwise; this was the stutter at fast rates.
- Compressed scale in Space view: layer `compressed`, switched by the pill
  under the place chip. `COMPRESS` in `render/space.ts` squares-roots
  distances from the Sun (Earth stays at 1 AU), takes sizes to the 0.6 power
  and moons' distances in planet radii to the square root; tested to keep
  every planet clear of its neighbours.

**Survey features** (2026-11-19, from James's pick of what other sky apps have):
- More moons (`astro/satellites.ts`): Phobos, Deimos, Saturn's eight classical
  moons, Uranus's five, Triton and Charon, beside the Galilean four (`MOONS`
  holds all of them). Mean elements in the parent's equatorial plane with
  turning node and pericentre and one libration term (Mimas–Tethys,
  Enceladus–Dione, Titan–Hyperion), fitted to PyEphem's BDL/TASS theories over
  2000–2038 (`scripts/fit_moons.py`). The Universe observes them (light-time
  from the planet), Space view draws them with orbits, search, Atlas and the
  Solar System list include them.
- Night light in the sky shader (`NIGHT_LIGHT`): zodiacal light, its band and
  the gegenschein (Leinert-shaped, from the Sun's ecliptic longitude and
  latitude), and airglow (van Rhijn, gravity-wave ripples). Twinkling in the
  star shader (`uTwinkle`; airmass-scaled, colour split low down). Layers
  `twinkle`, `zodiacal`, `airglow` (View → Air). Twinkling keeps the loop
  drawing at 20 fps without relaying labels (`App.draw(true)`); reduced
  motion stops it.
- Star trails (`App.startTrails`, `ui/trails.ts`; View → Looks → Star trails):
  the sky is drawn off screen and stacked with `MAX` blending (lighten
  stacking) while time runs at 5 min/s; charted lines and labels are left out,
  moving the view or the time starts a new exposure, and Save picture
  downloads the canvas.
- Deep-sky photos (`render/photos.ts`, layer `dsoPhotos`): 108 images from
  Stellarium's nebula set, only those credited to ESO, ESA/Hubble, NASA or
  SDSS (`public/data/dso-photos/index.json` keeps each credit, source and
  licence). They fade in from about 24 px across. The famous showpieces (M31,
  M42…) in Stellarium's set are by amateurs or DSS, so they are not included.
- Constellation art (`render/art.ts`, layer `art`, off by default; Western
  culture only): Stellarium's modern illustrations by Johan Meuris (Free Art
  License), each pinned by three anchor stars through an affine map on the
  tangent plane.
- Landscapes: standing on the Moon shows NASA's Apollo 17 panorama
  (Taurus–Littrow) and on Mars Spirit's Husband Hill panorama (Gusev); the
  stand-on sites moved there to match. The Earth keeps its generic hills (no
  Earth panorama with a clear licence was found).

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

**Settings and View**: Settings (gear) and View (bottom right) are separate
since 2026-11-18; see View bar above.

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
