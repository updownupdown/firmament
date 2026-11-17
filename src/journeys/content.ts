// The journeys themselves. Dates and places are real; every scene and every
// answer is checked against the simulation in journeys.test.ts.

import { DEG } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { jdFromLocal } from '../sim/format.ts';
import type { Site, Universe } from '../sim/universe.ts';
import type { Journey } from './engine.ts';
import { hohmann, marsTrack } from './orbits.ts';

const site = (name: string, lat: number, lon: number, tz = '', country?: string): Site => ({ name, country, lat, lon, height: 0, tz });

export const POLARIS = 'star:11767';
export const THUBAN = 'star:68756';
export const VEGA = 'star:91262';
export const ACRUX = 'star:60718';
export const ANTARES = 'star:80763';
export const FOMALHAUT = 'star:113368';
export const DUBHE = 'star:54061';
export const ALKAID = 'star:67301';
export const MERAK = 'star:53910';

const GIZA = site('Giza', 29.98, 31.13, 'Africa/Cairo', 'Egypt');
const AT_SEA = site('Somewhere in the Atlantic', 36.5, -25);
const SOUTHERN_OCEAN = site('Somewhere in the southern ocean', -34, 18);
const SYENE = site('Syene (Aswan)', 24.09, 32.9, 'Africa/Cairo', 'Egypt');
const ALEXANDRIA = site('Alexandria', 31.2, 29.92, 'Africa/Cairo', 'Egypt');
const PADUA = site('Padua', 45.41, 11.88, 'Europe/Rome', 'Italy');
const HILO = site('Hilo', 19.72, -155.08, 'Pacific/Honolulu', 'United States');
const PRAGUE = site('Prague', 50.09, 14.42, 'Europe/Prague', 'Czechia');
export const SHIP = site('Somewhere in the North Atlantic', 40, -35);
export const STONEHENGE = site('Stonehenge', 51.1789, -1.8262, 'Europe/London', 'United Kingdom');
const CAPE_CANAVERAL = site('Cape Canaveral', 28.39, -80.6, 'America/New_York', 'United States');

const POLE_LAYERS = { gridEquatorial: true, atmosphere: false, lines: true, constellationLabels: true, starLabels: true };
const PLAIN_LAYERS = { gridEquatorial: false, gridAltAz: false, atmosphere: true, ground: true };

/** True noon at Syene on the June solstice of 240 BC (Julian calendar; 11:57 local mean time). */
export const ERATOSTHENES_NOON = jdFromLocal(SYENE, -239, 6, 26, 11, 57);
/** Evenings in Padua, January 1610 (Gregorian dates, as Galileo wrote them), about an hour after sunset. */
export const galileoNight = (day: number): number => jdFromCalendar(1610, 1, day, 17, 0);

/** Tycho Brahe's years of Mars observations, which Kepler inherited in 1601. */
export const KEPLER_FIX = jdFromCalendar(1591, 8, 1, 0, 0);
export const KEPLER_TRACK = { jd0: jdFromCalendar(1590, 1, 1, 0, 0), count: 12 };
/** The 2026 Mars launch window, and arrival on the Hohmann transfer from it (orbits.test.ts checks both). */
export const MARS_WINDOW_2026 = jdFromCalendar(2026, 11, 4, 0, 0);
export const MARS_ARRIVAL_2027 = jdFromCalendar(2027, 7, 27, 0, 0);
/** Two stars at dusk from the ship (UT). */
export const NAV_TIME = jdFromCalendar(2026, 11, 16, 21, 0);
/** Midsummer sunrise at Stonehenge in 2500 BC and in 2026 (UT, upper limb on a level horizon), from the season and rise searches. */
export const STONEHENGE_RISE_2500BC = 808492.6526;
export const STONEHENGE_RISE_2026 = 2461212.6609;
/** The what-if sandbox starts from the planets' real places on this date. */
export const WHAT_IF_TIME = jdFromCalendar(2026, 11, 17, 0, 0);
/** The Big Dipper on an April night, now and 50,000 years on. */
export const DIPPER_NOW = jdFromCalendar(2026, 4, 15, 21, 0);
export const DIPPER_LATER = DIPPER_NOW + 50000 * 365.25;
const altOf = (ref: string) => (u: Universe): number => u.horizontal(u.resolve(ref)!.dir).altApparent / DEG;
const farthestMars = (u: Universe): number =>
  Math.max(...marsTrack(u.eph, KEPLER_TRACK.jd0, KEPLER_TRACK.count).map((f) => Math.hypot(f.mars[0], f.mars[1])));

const sunFromOverhead = (u: Universe): number => 90 - u.horizontal(u.bodies.get('sun')!.dir).altApparent / DEG;

export const JOURNEYS: Journey[] = [
  {
    id: 'pole',
    title: 'The wandering pole',
    summary: 'The North Star has not always been the north star. Travel 16,000 years to see why.',
    minutes: 5,
    steps: [
      {
        title: 'The still point',
        text: 'Face north from Giza on a spring evening and the whole sky turns around one point: the celestial pole, where the Earth\'s axis points. Right now a fairly bright star, Polaris, sits less than a degree from it. The grid lines show the pole.',
        scene: { time: { jd: jdFromCalendar(2026, 3, 21, 19, 0) }, rate: 0, site: GIZA, camera: { look: POLARIS, fov: 55 }, layers: POLE_LAYERS },
        task: { kind: 'find', refs: [POLARIS], prompt: 'Tap Polaris, at the centre of the grid.', hint: 'Polaris is the star right where the grid lines meet.' },
      },
      {
        title: 'The pyramid builders\' pole star',
        text: 'Now it is 2800 BC at Giza, where the Great Pyramid will soon rise. The grid still marks the pole, but Polaris is far from it. A fainter star in Draco holds the place instead, and the pyramid\'s shafts were lined up on it.',
        scene: { time: { jd: jdFromCalendar(-2799, 3, 21, 19, 0) }, rate: 0, site: GIZA, camera: { look: { az: 0, alt: 30 }, fov: 60 }, layers: POLE_LAYERS, highlight: [THUBAN] },
        task: { kind: 'find', refs: [THUBAN], prompt: 'Tap the star at the pole.', hint: 'Look where the grid lines converge, due north and 30° up. The star there is Thuban.' },
      },
      {
        title: 'Twelve thousand years from now',
        text: 'Jump ahead to AD 14,000. The pole has drifted across the sky to the neighbourhood of one of the brightest stars there is. It will be a few degrees off, not as exact as Polaris, but impossible to miss.',
        scene: { time: { jd: jdFromCalendar(14000, 3, 21, 19, 0) }, rate: 0, site: GIZA, camera: { look: { az: 0, alt: 32 }, fov: 70 }, layers: POLE_LAYERS, highlight: [VEGA] },
        task: { kind: 'choice', prompt: 'Which bright star is nearest the pole now?', options: ['Sirius', 'Vega', 'Arcturus', 'Polaris'], answer: 1, explain: 'Vega. It was also the pole star around 12,000 BC, and it will be again.' },
      },
      {
        title: 'A spinning top',
        text: 'The stars did not move to make this happen. The Earth\'s axis did. Pulled by the Moon and Sun, it swings slowly round in a circle like the axis of a leaning top, and the pole traces a ring through Draco, Cepheus, Cygnus and Lyra. Thuban, Polaris and Vega each take a turn.',
        task: { kind: 'choice', prompt: 'Thuban was the pole star around 2800 BC and Vega will be near the pole around AD 14,000, almost opposite it on the ring. So about how long does the full circle take?', options: ['2,600 years', '26,000 years', '260,000 years'], answer: 1, explain: 'About 26,000 years. Hipparchus noticed the drift around 130 BC by comparing his star positions with older ones.' },
      },
      {
        title: 'Try it yourself',
        text: 'You can watch this any time: face north, open Place and time, and try any year from 98,000 BC to AD 102,000. The constellations slowly change shape too, because the stars themselves are moving.',
      },
    ],
  },
  {
    id: 'latitude',
    title: 'Find your latitude',
    summary: 'You are on a ship with no instruments but your eyes. Work out where you are from the stars.',
    minutes: 5,
    steps: [
      {
        title: 'Lost at sea',
        text: 'It is night somewhere in the Atlantic, and you need to know how far north you are. Sailors used one fact for this: the height of the celestial pole above the horizon equals your latitude. In the north, Polaris marks the pole to within a degree.',
        scene: { time: { jd: jdFromCalendar(2026, 11, 16, 23, 0) }, rate: 0, site: AT_SEA, camera: { look: { az: 0, alt: 30 }, fov: 80 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } },
        task: { kind: 'find', refs: [POLARIS], prompt: 'Find Polaris and tap it. The two end stars of the Big Dipper\'s bowl point to it.', hint: 'Polaris is due north, a bit more than a third of the way up the sky.' },
      },
      {
        title: 'Measure it',
        text: 'Polaris\'s card shows its altitude: how many degrees it stands above the horizon. A navigator would measure that with a sextant.',
        task: { kind: 'number', prompt: 'What is your latitude, to the nearest degree?', answer: AT_SEA.lat, tolerance: 1.5, unit: '° north', explain: 'About 36.5° north: level with the Strait of Gibraltar. Polaris circles the true pole at a distance of 0.6°, so one sighting is good to about a degree.' },
      },
      {
        title: 'No pole star in the south',
        text: 'Now you are in the southern ocean. There is no bright star at the south pole, so navigators use the Southern Cross: follow its long axis, from the top star through Acrux at the foot, four and a half times its own length, and you arrive at the pole.',
        scene: { time: { jd: jdFromCalendar(2026, 5, 15, 19, 0) }, rate: 0, site: SOUTHERN_OCEAN, camera: { look: { az: 180, alt: 35 }, fov: 80 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true, gridEquatorial: true }, highlight: ['con:western:Cru'] },
        task: { kind: 'find', refs: [ACRUX], prompt: 'Tap Acrux, the bright star at the foot of the Cross.', hint: 'The Southern Cross is small and bright, high in the south. Acrux is its brightest star, the one nearest the pole.' },
      },
      {
        title: 'Read the sky',
        text: 'The grid shows where the Cross points: the south celestial pole, the still point the southern sky turns around. It stands 34° above the southern horizon here.',
        task: { kind: 'choice', prompt: 'Where are you?', options: ['34° north', '34° south', '56° south'], answer: 1, explain: '34° south, the latitude of Cape Town and Sydney. The same rule works in both hemispheres: the pole\'s height is your latitude.' },
      },
    ],
  },
  {
    id: 'eratosthenes',
    title: 'Measure the Earth',
    summary: 'Around 240 BC, Eratosthenes worked out the size of the Earth from shadows in two cities. Repeat his measurement.',
    minutes: 6,
    steps: [
      {
        title: 'A well in Syene',
        text: 'Noon on the summer solstice at Syene, on the Nile in southern Egypt. Eratosthenes had read that on this day the Sun shines straight down a deep well here, and upright posts cast no shadow. The Sun is at the very top of the sky.',
        scene: { time: { jd: ERATOSTHENES_NOON }, rate: 0, site: SYENE, camera: { look: 'sun', fov: 100 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' },
        task: { kind: 'number', prompt: 'The Sun\'s card shows its altitude; straight overhead is 90°. How many degrees from overhead is the Sun?', answer: sunFromOverhead, tolerance: 0.7, unit: '°', explain: 'Almost exactly overhead, as the story says.' },
      },
      {
        title: 'The same moment in Alexandria',
        text: 'Alexandria lies about 5,000 stadia to the north, close to 800 km. At the same moment a post there does cast a shadow, because the ground curves away and the Sun is no longer overhead.',
        scene: { time: { jd: ERATOSTHENES_NOON }, rate: 0, site: ALEXANDRIA, camera: { look: 'sun', fov: 100 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' },
        task: { kind: 'number', prompt: 'How many degrees from overhead is the Sun here?', answer: sunFromOverhead, tolerance: 0.7, unit: '°', hint: 'Subtract the Sun\'s altitude from 90°.', explain: 'Close to 8°. Eratosthenes measured 7.2° from the shadow of a sundial, one fiftieth of a circle. The small difference comes from Alexandria not being due north of Syene, which he did not know.' },
      },
      {
        title: 'The size of the world',
        text: 'The Sun is so far away that its rays arrive parallel. So the difference between the two cities is the angle between them as seen from the centre of the Earth. Use his figure of 7.2°. If 800 km covers 7.2° of the globe, the whole 360° must be 50 times as far.',
        task: { kind: 'number', prompt: 'What is the distance around the Earth, in kilometres?', answer: 40000, tolerance: 3500, unit: 'km', hint: 'Multiply 800 km by 360 ÷ 7.2.', explain: 'About 40,000 km. The modern figure around the poles is 40,008 km. He did this with a stick, a well and geometry.' },
      },
    ],
  },
  {
    id: 'galileo',
    title: 'Galileo\'s moons',
    summary: 'In January 1610 Galileo turned a telescope on Jupiter and found something that changed astronomy. See what he saw, night by night.',
    minutes: 5,
    steps: [
      {
        title: 'Padua, 7 January 1610',
        text: 'Galileo has built a telescope that magnifies twenty times. This evening he points it at Jupiter, bright in the east, and notices small stars beside it, all in a straight line. He assumes they are ordinary background stars.',
        scene: { time: { jd: galileoNight(7) }, rate: 0, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, layers: { ...PLAIN_LAYERS, atmosphere: false, planetLabels: true }, select: 'jupiter' },
        task: { kind: 'find', refs: ['jupiter'], prompt: 'Tap Jupiter.' },
      },
      {
        title: 'The next night',
        text: 'On 8 January he looks again. If Jupiter were drifting past fixed stars, they should have fallen behind it in a predictable way. Instead they are arranged differently, and all on one side.',
        scene: { time: { jd: galileoNight(8) }, rate: 0, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, select: 'jupiter' },
        task: { kind: 'choice', prompt: 'Compare the two nights with the Back button. What changed?', options: ['Nothing: the little stars are fixed', 'The little stars moved relative to Jupiter', 'Jupiter changed size'], answer: 1, explain: 'They moved, and not the way background stars would.' },
      },
      {
        title: 'Four, not three',
        text: 'Clouds on the 9th. By 13 January he has seen four of them at once, shuffling from side to side but never leaving Jupiter, always in the same line. Each name is shown here; he called them the Medicean stars.',
        scene: { time: { jd: galileoNight(13) }, rate: 0, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, select: 'jupiter' },
        task: { kind: 'find', refs: ['callisto'], prompt: 'Tap Callisto, the one that strays furthest from Jupiter.', hint: 'Callisto is labelled. It swings out to about 13 Jupiter-widths on either side.' },
      },
      {
        title: 'Time Io',
        text: 'Io is the innermost of the four, never more than about three Jupiter-widths from the planet. Time is running at an hour a second. Watch Io swing out to one side, across to the other and back again.',
        scene: { time: { jd: galileoNight(13) }, rate: 3600, camera: { look: 'jupiter', fov: 0.6 }, select: 'io' },
        task: { kind: 'number', prompt: 'How long does Io take to go round once, in days? Use the date and time at the top.', answer: 1.769, tolerance: 0.2, unit: 'days', hint: 'Note the time when Io is furthest to one side, then wait until it is back there.', explain: '1.77 days. Callisto, about 4.5 times further out, takes 16.7 days: 9.4 times as long. That is Kepler\'s third law, the same rule the planets follow round the Sun.' },
      },
      {
        title: 'What it meant',
        text: 'Run time with the controls at the bottom and watch them swing back and forth: Io in under two days, Callisto in nearly seventeen. They are moons circling Jupiter, seen edge on.',
        scene: { time: { jd: galileoNight(13) }, rate: 3600, camera: { look: 'jupiter', fov: 0.6 }, select: 'jupiter' },
        task: { kind: 'choice', prompt: 'Why did this matter so much in 1610?', options: ['It proved the Earth is round', 'It showed that not everything circles the Earth', 'It showed Jupiter is a star'], answer: 1, explain: 'Here were four bodies plainly circling something other than the Earth. The old picture, with everything revolving around us, could not be the whole story.' },
      },
    ],
  },
  {
    id: 'cultures',
    title: 'One sky, many stories',
    summary: 'The same stars have been drawn into different pictures all over the world. Find a scorpion that is also a fishhook.',
    minutes: 4,
    steps: [
      {
        title: 'The scorpion',
        text: 'A July evening in Hawaiʻi. In the south curls one of the few constellations that looks like its name: Scorpius, with the red giant Antares as its heart.',
        scene: { time: { jd: jdFromLocal(HILO, 2026, 7, 15, 21, 30) }, rate: 0, site: HILO, culture: 'western', camera: { look: ANTARES, fov: 60 }, layers: { ...PLAIN_LAYERS, lines: true, constellationLabels: true, starLabels: true }, highlight: ['con:western:Sco'] },
        task: { kind: 'find', refs: [ANTARES], prompt: 'Tap Antares, the bright reddish star.', hint: 'Antares is the brightest star in the highlighted figure.' },
      },
      {
        title: 'Maui\'s fishhook',
        text: 'Now the same stars as Hawaiian navigators know them. The scorpion\'s curved tail is Manaiakalani, the fishhook the demigod Maui used to haul islands up from the sea. It belongs to one of four great star lines that Polynesian voyagers steer by.',
        scene: { culture: 'hawaiian_starlines', camera: { look: ANTARES, fov: 60 }, highlight: ['con:hawaiian_starlines:MAN'] },
        task: { kind: 'choice', prompt: 'Which stars does the fishhook share with the scorpion?', options: ['None: it is in a different part of the sky', 'Antares and the curve of the tail', 'Only the claws'], answer: 1, explain: 'The same hook of stars, with a different story attached.' },
      },
      {
        title: 'Whose sky',
        text: 'Neither picture is in the sky itself. People everywhere joined the dots their own way, for their own reasons: calendars, navigation, memory. Open the view settings and choose "Whose sky" to see Chinese, Norse, Māori and other traditions over the same stars.',
        scene: { culture: 'western', highlight: [] },
      },
    ],
  },
  {
    id: 'kepler',
    title: 'Kepler\'s Mars',
    summary: 'Nobody can see how far away Mars is. Kepler found its orbit anyway, with two sightings and a triangle.',
    minutes: 6,
    steps: [
      {
        title: 'Prague, 1602',
        text: 'Johannes Kepler has inherited twenty years of Tycho Brahe\'s observations: the most precise measurements of the planets ever made, all by eye. Every one gives a direction to Mars. None says how far away it is.',
        scene: { time: { jd: jdFromCalendar(1602, 3, 15, 21, 0) }, rate: 0, site: PRAGUE, camera: { look: 'mars', fov: 70 }, layers: { ...PLAIN_LAYERS, lines: true, planetLabels: true } },
        task: { kind: 'find', refs: ['mars'], prompt: 'Tap Mars.', hint: 'Mars is the reddish point that is labelled, high in the south.' },
      },
      {
        title: 'The trick',
        text: 'Mars goes round the Sun once every 687 days. So on two dates 687 days apart, Mars is in exactly the same place, but the Earth is not: it has gone round almost twice and stopped at a different point of its own orbit. That gives two lookouts with a known baseline.',
        task: { kind: 'choice', prompt: 'Two lookouts sight the same object from different places. What does that let you find?', options: ['How bright it is', 'Where it is: the sight lines cross there', 'How fast it moves'], answer: 1, explain: 'Where the sight lines cross. Surveyors call it triangulation; Kepler used the Earth\'s orbit as the baseline.' },
      },
      {
        title: 'Two sightings',
        text: 'Here is the solar system from above. The Sun is in the middle and the dashed circle is the Earth\'s orbit. The blue dots are the Earth on 1 August 1591 and 687 days later, and each line is the direction Tycho would have seen Mars.',
        plot: { kind: 'triangulate', jd: KEPLER_FIX },
        task: { kind: 'plot', prompt: 'Tap where the two sight lines cross. That is Mars.', tolerance: 0.12, hint: 'Close, but not on the crossing. Follow both lines until they meet.', explain: 'There it is, without ever measuring its distance directly.' },
      },
      {
        title: 'The whole orbit',
        text: 'Kepler did this again and again, through Tycho\'s records. Each pair of dates gives one point on Mars\'s path. Tap any red point to read its distance from the Sun, in astronomical units (the Earth\'s average distance).',
        plot: { kind: 'mars-orbit', jd0: KEPLER_TRACK.jd0, count: KEPLER_TRACK.count },
        task: { kind: 'number', prompt: 'How far from the Sun does Mars get, at most?', answer: farthestMars, tolerance: 0.04, unit: 'AU', hint: 'Tap the points on the far side of the path from the Earth\'s orbit until you find the largest distance.', explain: 'About 1.66 AU. At its closest it comes within 1.38 AU, so the path is not a circle centred on the Sun.' },
      },
      {
        title: 'Not a circle',
        text: 'For 2,000 years astronomers had built the heavens from perfect circles. Kepler spent six years trying to make Mars fit one and missed Tycho\'s numbers by eight minutes of arc, about a quarter of the Moon\'s width. He refused to ignore it.',
        plot: { kind: 'mars-orbit', jd0: KEPLER_TRACK.jd0, count: KEPLER_TRACK.count },
        task: { kind: 'choice', prompt: 'What shape fits the points?', options: ['A circle centred on the Sun', 'An oval with the Sun off to one side', 'A circle centred on the Earth'], answer: 1, explain: 'An ellipse, with the Sun at one focus. Kepler published it in 1609 as his first law, and it holds for every planet.' },
      },
    ],
  },
  {
    id: 'mars-mission',
    title: 'Plan a trip to Mars',
    summary: 'You cannot fly straight at Mars. Find the day to launch so that Mars is waiting when you arrive.',
    minutes: 5,
    steps: [
      {
        title: 'Two moving targets',
        text: 'Autumn 2026, seen from above. The Earth and Mars are both racing round the Sun, the Earth faster on the inside track. A spacecraft launched from the Earth starts out with the Earth\'s speed and has to coast for months.',
        scene: { time: { jd: jdFromCalendar(2026, 10, 1, 0, 0) }, rate: 0, site: CAPE_CANAVERAL, camera: { look: 'sun', mode: 'space', dist: 5.5, orbit: { yaw: -90, pitch: 80 } }, layers: { orbits: true, planetLabels: true } },
        task: { kind: 'choice', prompt: 'So where should the spacecraft aim?', options: ['At Mars, where it is now', 'At where Mars will be when the spacecraft gets there', 'At the Sun'], answer: 1, explain: 'At where Mars will be, months from now. Hitting a moving target means leading it.' },
      },
      {
        title: 'The cheapest path',
        text: 'The least fuel takes the spacecraft half way round an ellipse that just touches the Earth\'s orbit at launch and Mars\'s orbit at the far side, Walter Hohmann\'s transfer from 1925. Slide the launch date. The dashed path ends at the ring; the red dot is where Mars will be on that day.',
        plot: { kind: 'transfer', from: jdFromCalendar(2026, 8, 1, 0, 0), to: jdFromCalendar(2027, 2, 1, 0, 0), start: jdFromCalendar(2026, 8, 15, 0, 0) },
        task: { kind: 'plot', prompt: 'Find the launch date when Mars arrives at the ring together with the spacecraft.', tolerance: 2, hint: 'Keep sliding. Mars needs to be on the ring, not ahead of it or behind.', explain: 'Early November 2026. Launch then and Mars is right there at the end of the trip.' },
      },
      {
        title: 'A launch window',
        text: 'The Earth laps Mars once every 26 months, and only then are the two lined up like this. Space agencies plan Mars missions around these windows; miss one and the spacecraft waits on the ground for the next.',
        plot: { kind: 'transfer', from: jdFromCalendar(2026, 8, 1, 0, 0), to: jdFromCalendar(2027, 2, 1, 0, 0), start: MARS_WINDOW_2026 },
        task: { kind: 'number', prompt: 'How many days does the trip take? The diagram shows it.', answer: (u) => hohmann(u.eph, MARS_WINDOW_2026).days, tolerance: 6, unit: 'days', explain: 'About 265 days, close to nine months: the same as the real missions that use these windows.' },
      },
      {
        title: 'Arrival',
        text: 'July 2027: the spacecraft would be arriving at Mars now, nearly opposite where the Earth was at launch. Run time backwards to watch the trip in reverse, or tap Mars to fly in closer.',
        scene: { time: { jd: MARS_ARRIVAL_2027 }, rate: 0, select: 'mars', camera: { look: 'sun', mode: 'space', dist: 5.5, orbit: { yaw: -90, pitch: 80 } } },
      },
    ],
  },

  {
    id: 'navigation',
    title: 'Fix your position at sea',
    summary: 'Two stars, a clock and a chart: find where your ship is, the way navigators did for two hundred years.',
    minutes: 6,
    steps: [
      {
        title: 'Dusk in mid-ocean',
        text: 'Polaris gives your latitude, but only that: one line across the ocean. A navigator wants a point. At dusk, when the brightest stars are out and the horizon can still be seen, they measure two stars far apart in the sky and note the exact time on the ship\'s chronometer.',
        scene: { time: { jd: NAV_TIME }, rate: 0, site: SHIP, camera: { look: { az: 285, alt: 45 }, fov: 90 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } },
        task: { kind: 'find', refs: [VEGA], prompt: 'Find Vega, the bright star high in the west, and tap it.', hint: 'Vega is the brightest star in the west, about halfway up.' },
      },
      {
        title: 'Measure the first star',
        text: 'With a sextant the navigator brings Vega down to the horizon and reads off its altitude. Here the card does the measuring.',
        task: { kind: 'number', prompt: 'How high is Vega, in degrees?', answer: altOf(VEGA), tolerance: 1, unit: '°', hint: 'Its altitude is on Vega\'s card.', explain: 'Right. That one number already says a lot about where you are.' },
      },
      {
        title: 'A circle on the globe',
        text: 'At this instant Vega is straight overhead at one spot on the Earth, its ground point, which the almanac gives from the time. Anyone who sees Vega at your altitude is the same distance from that spot: somewhere on a circle around it. A second star gives a second circle. Fomalhaut is low in the south.',
        scene: { camera: { look: FOMALHAUT, fov: 90, track: false } },
        task: { kind: 'find', refs: [FOMALHAUT], prompt: 'Tap Fomalhaut, alone and low in the south.', hint: 'Fomalhaut is the only bright star low in the south.' },
      },
      {
        title: 'Where the circles cross',
        text: 'This is the chart on the navigator\'s table, with both circles of position drawn from the two altitudes and the time. The ship is on both circles, so it is where they cross.',
        plot: { kind: 'star-fix', stars: [VEGA, FOMALHAUT] },
        task: { kind: 'plot', prompt: 'Tap where the two circles cross.', tolerance: 0.8, hint: 'Not quite on the crossing. Follow both curves to where they meet.', explain: 'That is the ship, a fix good to a few nautical miles, from two stars and a clock.' },
      },
      {
        title: 'Two crossings',
        text: 'Two circles on a globe cross in two places. The second crossing here is thousands of kilometres away.',
        task: { kind: 'choice', prompt: 'How does the navigator know which crossing is right?', options: ['They cannot tell', 'The other one is far from anywhere the ship could be', 'The other one is always on land'], answer: 1, explain: 'A ship knows roughly where it is from its course and speed, so the far crossing is easy to rule out. Navigators usually take a third star too, as a check.' },
      },
    ],
  },
  {
    id: 'stonehenge',
    title: 'Stonehenge and the drifting Dipper',
    summary: 'Travel back to midsummer morning in 2500 BC, then 50,000 years forward to watch a famous shape come apart.',
    minutes: 6,
    steps: [
      {
        title: 'Midsummer, 2500 BC',
        text: 'Salisbury Plain, shortly before dawn on the longest day, around the time the great stones were raised. The monument\'s avenue points northeast, toward where the Sun comes up on this one morning of the year. Time is running.',
        scene: { time: { jd: STONEHENGE_RISE_2500BC - 0.03 }, rate: 120, site: STONEHENGE, camera: { look: { az: 50, alt: 4 }, fov: 60 }, layers: { ...PLAIN_LAYERS, cardinals: true } },
        task: { kind: 'number', prompt: 'When the Sun has risen, tap it and open Details: in which direction does it rise, in degrees from north?', answer: 48.5, tolerance: 2, unit: '°', hint: 'Look under Direction in the Sun\'s details. Read it soon after the Sun clears the horizon.', explain: 'About 48°. The avenue points at about 50°, where the whole disc stands clear of the slightly raised horizon there.' },
      },
      {
        title: 'The same morning now',
        text: 'Midsummer morning in 2026, from the same spot.',
        scene: { time: { jd: STONEHENGE_RISE_2026 - 0.03 }, rate: 120, camera: { look: { az: 50, alt: 4 }, fov: 60 } },
        task: { kind: 'choice', prompt: 'Watch it rise. Compared with 2500 BC, where does the Sun come up?', options: ['About a degree further south', 'Ten degrees further north', 'In exactly the same place'], answer: 0, explain: 'A degree further south. The Earth\'s tilt has eased from 24.0° to 23.4°, so the midsummer Sun no longer swings quite as far north. The monument still works.' },
      },
      {
        title: 'The Big Dipper today',
        text: 'Now look north on a spring night. Seven stars make the Big Dipper, part of the Great Bear. They look like a family, and most of them are.',
        scene: { time: { jd: DIPPER_NOW }, rate: 0, camera: { look: 'con:western:UMa', fov: 55 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, starLabels: true }, highlight: ['con:western:UMa'] },
        task: { kind: 'find', refs: [DUBHE], prompt: 'Tap Dubhe, the star at the lip of the bowl.', hint: 'Dubhe is the bright star at the top corner of the bowl, furthest from the handle.' },
      },
      {
        title: 'AD 52,000',
        text: 'Fifty thousand years on. Every star is moving through space, and over this long they visibly shift. Five of the Dipper\'s stars travel together as a group, born in the same cloud. Two are strangers passing through in other directions.',
        scene: { time: { jd: DIPPER_LATER }, rate: 0, camera: { look: 'con:western:UMa', fov: 55 }, highlight: ['con:western:UMa'] },
        task: { kind: 'find', refs: [DUBHE, ALKAID], prompt: 'Tap one of the two stars that have gone their own way.', hint: 'Look for the two ends of the Dipper: the lip of the bowl and the tip of the handle.', explain: 'Dubhe and Alkaid. The other five, from Merak to Mizar, are the Ursa Major moving group, about 80 light-years away and drifting together.' },
      },
    ],
  },
  {
    id: 'slingshot',
    title: 'A slingshot past Jupiter',
    summary: 'Voyager 2 reached the edge of the solar system by borrowing speed from the planets. Steer a flyby that does the same.',
    minutes: 5,
    steps: [
      {
        title: 'Voyager 2 at Jupiter',
        text: 'July 1979. Voyager 2 left the Earth two years ago, and its rocket burned for only minutes. Ever since, it has coasted, slowing as it climbs away from the Sun. On its own it would fall back. Jupiter is about to change that.',
        scene: { time: { jd: jdFromCalendar(1979, 7, 9, 22, 0) }, rate: 0, camera: { look: 'jupiter', mode: 'space', dist: 0.08, orbit: { yaw: -80, pitch: 60 } }, layers: { orbits: true, planetLabels: true, compressed: false } },
      },
      {
        title: 'Steer the flyby',
        text: 'Left, the path past Jupiter as Jupiter sees it: in, round and out again at the same speed. Right, the same flyby seen from the Sun, where Jupiter\'s own motion is added back. The green arc is the speed needed to escape the Sun from here.',
        plot: { kind: 'flyby' },
        task: { kind: 'plot', prompt: 'Choose a side and a closest approach that send the spacecraft out of the solar system.', tolerance: 0, hint: 'Not enough yet. Try the other side, or a closer pass.', explain: 'Passing behind Jupiter, the spacecraft is pulled along after it and flung forward in the direction Jupiter is moving.' },
      },
      {
        title: 'Free speed?',
        text: 'Seen from Jupiter, nothing was gained: the spacecraft left as fast as it came. Seen from the Sun, it gained about 10 km/s.',
        task: { kind: 'choice', prompt: 'Where did the extra speed come from?', options: ['From the spacecraft\'s engine', 'From Jupiter, which slowed down by a tiny amount', 'From the Sun'], answer: 1, explain: 'From Jupiter. It is about 2,600 billion billion times heavier than Voyager, so it slowed by far too little to ever measure.' },
      },
      {
        title: 'The grand tour',
        text: 'A rare line-up let Voyager 2 do this again at Saturn in 1981, Uranus in 1986 and Neptune in 1989, the only visit either of those two worlds has had. It is still travelling, more than 130 AU from the Sun.',
        scene: { time: { jd: jdFromCalendar(1989, 8, 25, 0, 0) }, rate: 0, camera: { look: 'sun', mode: 'space', dist: 60, orbit: { yaw: -90, pitch: 55 } } },
      },
    ],
  },
  {
    id: 'what-if',
    title: 'What if?',
    summary: 'Make Jupiter heavier or send a star through the solar system, and watch what gravity alone does to the planets.',
    minutes: 5,
    steps: [
      {
        title: 'Gravity, and nothing else',
        text: 'This is the solar system from above, starting from where the planets are today. From here on nothing is looked up: every body pulls on every other, and the diagram works out where they go next, thousands of times a second. Watch a few centuries go by.',
        scene: { time: { jd: WHAT_IF_TIME }, rate: 0, camera: { look: 'sun', mode: 'space', dist: 60, orbit: { yaw: -90, pitch: 80 } }, layers: { orbits: true, planetLabels: true } },
        plot: { kind: 'sandbox', controls: 'none' },
        task: { kind: 'choice', prompt: 'What happens to the planets\' orbits over the centuries?', options: ['They slowly spiral into the Sun', 'They stay much as they are', 'They drift outward, away from the Sun'], answer: 1, explain: 'They stay put. The planets tug on each other, but those tugs are tiny next to the Sun\'s pull, so the orbits only wobble a little.' },
      },
      {
        title: 'A heavier Jupiter',
        text: 'Jupiter is already more than twice as heavy as all the other planets together. Make it heavier still. At 1,000 times its real mass it would be about as heavy as the Sun: a second star.',
        plot: { kind: 'sandbox', controls: 'jupiter' },
        task: { kind: 'choice', prompt: 'Try 100 times heavier. Which planets are shaken up first?', options: ['Mercury and Venus, closest to the Sun', 'The Earth and Mars', 'Saturn, Uranus and Neptune'], answer: 2, explain: 'The outer planets. Saturn is pulled out to 13 AU and Neptune\'s orbit stretches, while the Earth barely notices. At 1,000 times, the planets are thrown out of the system within a couple of centuries.' },
      },
      {
        title: 'A passing star',
        text: 'Now keep Jupiter as it is and send a star like the Sun through the plane of the planets at 20 km/s, a typical speed for stars near us. Choose how close it comes. Switch to Inner to keep an eye on the Earth.',
        plot: { kind: 'sandbox', controls: 'star' },
        task: { kind: 'choice', prompt: 'How close does the star have to come to throw the Earth out?', options: ['100 AU, beyond Neptune', '10 AU, about Saturn\'s distance', 'A few AU or less, inside Jupiter\'s orbit'], answer: 2, explain: 'Very close. At 10 AU the giant planets are flung away but the Earth keeps going round the Sun. At 2 or 3 AU it depends on where the Earth happens to be; at 1 AU it is always lost.' },
      },
      {
        title: 'Should we worry?',
        text: 'Stars are so far apart that close passes are vanishingly rare. The closest one known is coming: in about 1.3 million years the star Gliese 710 will pass roughly 10,000 AU from the Sun. That is through the cloud of icy comets at the edge of the solar system, but far outside the planets. It may send a few comets our way. The orbits of the planets will not notice.',
      },
    ],
  },
];

export function findJourney(id: string): Journey | undefined {
  return JOURNEYS.find((j) => j.id === id);
}
