// The journeys themselves. Dates and places are real; every scene and every
// answer is checked against the simulation in journeys.test.ts.

import { DEG } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { jdFromLocal } from '../sim/format.ts';
import type { Site, Universe } from '../sim/universe.ts';
import type { Journey } from './engine.ts';

const site = (name: string, lat: number, lon: number, tz = '', country?: string): Site => ({ name, country, lat, lon, height: 0, tz });

export const POLARIS = 'star:11767';
export const THUBAN = 'star:68756';
export const VEGA = 'star:91262';
export const ACRUX = 'star:60718';
export const ANTARES = 'star:80763';

const GIZA = site('Giza', 29.98, 31.13, 'Africa/Cairo', 'Egypt');
const AT_SEA = site('Somewhere in the Atlantic', 36.5, -25);
const SOUTHERN_OCEAN = site('Somewhere in the southern ocean', -34, 18);
const SYENE = site('Syene (Aswan)', 24.09, 32.9, 'Africa/Cairo', 'Egypt');
const ALEXANDRIA = site('Alexandria', 31.2, 29.92, 'Africa/Cairo', 'Egypt');
const PADUA = site('Padua', 45.41, 11.88, 'Europe/Rome', 'Italy');
const HILO = site('Hilo', 19.72, -155.08, 'Pacific/Honolulu', 'United States');

const POLE_LAYERS = { gridEquatorial: true, atmosphere: false, lines: true, constellationLabels: true, starLabels: true };
const PLAIN_LAYERS = { gridEquatorial: false, gridAltAz: false, atmosphere: true, ground: true };

/** True noon at Syene on the June solstice of 240 BC (Julian calendar; 11:57 local mean time). */
export const ERATOSTHENES_NOON = jdFromLocal(SYENE, -239, 6, 26, 11, 57);
/** Evenings in Padua, January 1610 (Gregorian dates, as Galileo wrote them), about an hour after sunset. */
export const galileoNight = (day: number): number => jdFromCalendar(1610, 1, day, 17, 0);

const HVEN = site('Hven', 55.908, 12.696, 'Europe/Copenhagen', 'Denmark');
const CANAVERAL = site('Cape Canaveral', 28.39, -80.6, 'America/New_York', 'United States');

/** Nights when Tycho could have measured Mars; each is paired with the night one Mars year later. */
export const MARS_NIGHTS = [
  jdFromCalendar(1583, 3, 2, 21, 0), jdFromCalendar(1584, 3, 26, 4, 0),
  jdFromCalendar(1586, 6, 14, 2, 0), jdFromCalendar(1585, 9, 17, 4, 0),
];
/** The start of the 2026 launch season, and how many days of it the planner offers. */
export const LAUNCH_FROM = jdFromCalendar(2026, 6, 1);
export const LAUNCH_WINDOW = 420;
/** Speed the journey's rocket can supply, km/s: enough for a good window, not for a bad one. */
export const LAUNCH_BUDGET = 6.2;

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
    summary: 'Find the true shape of an orbit the way Kepler did, with nothing but directions in the sky.',
    minutes: 8,
    steps: [
      {
        title: 'Twenty years of Mars',
        text: 'From his observatory on the island of Hven, Tycho Brahe measured where Mars stood among the stars, night after night for twenty years, more exactly than anyone before. But a direction is not a distance. When Tycho died in 1601, his assistant Johannes Kepler was left with the numbers and one question: what path does Mars really follow?',
        scene: { time: { jd: MARS_NIGHTS[0] }, rate: 0, site: HVEN, camera: { look: 'mars', fov: 50 }, layers: PLAIN_LAYERS },
        task: { kind: 'find', refs: ['mars'], prompt: 'Tap Mars, as Tycho saw it on 2 March 1583.', hint: 'Mars is the bright orange point in the centre.' },
      },
      {
        title: 'Kepler\'s trick',
        text: 'Mars takes 687 days to go once around the Sun. So 687 days after any sighting, Mars is back at exactly the same point, but the Earth is somewhere else on its own orbit. Two lines of sight from two places must cross where Mars is. The chart looks down on the Sun (centre) and the Earth\'s orbit, with the two sightings drawn in.',
        task: { kind: 'mars-fix', prompt: 'Mark the place where Mars must be.', jd: MARS_NIGHTS[0], tolerance: 0.07, explain: 'That is where Mars was on both nights.' },
      },
      {
        title: 'Around the orbit',
        text: 'One point does not make an orbit. Kepler repeated the trick with other pairs of nights, each 687 days apart, catching Mars at a different part of its path every time.',
        task: { kind: 'mars-fix', prompt: 'Mark Mars for this pair of sightings.', jd: MARS_NIGHTS[1], tolerance: 0.07 },
      },
      {
        title: 'A third point',
        text: 'Keep an eye on the distances as the points pile up. If Mars moved on a circle around the Sun, they would all come out the same.',
        task: { kind: 'mars-fix', prompt: 'Mark Mars for this pair.', jd: MARS_NIGHTS[2], tolerance: 0.07 },
      },
      {
        title: 'And a fourth',
        text: 'One more pair, on the far side of the orbit from the first.',
        task: { kind: 'mars-fix', prompt: 'Mark Mars for this pair.', jd: MARS_NIGHTS[3], tolerance: 0.07 },
      },
      {
        title: 'Not a circle',
        text: 'Your four points lie between 1.38 and 1.66 times the Earth\'s distance from the Sun. Kepler tried for years to make a circle fit Tycho\'s numbers and could not: it missed by eight minutes of arc, a quarter of the Moon\'s width, and he trusted Tycho too much to ignore it. The curve that fits is an ellipse.',
        figure: { kind: 'mars-orbit', nights: MARS_NIGHTS, orbit: true },
        task: { kind: 'choice', prompt: 'Where is the Sun in Mars\'s orbit?', options: ['At the centre of the ellipse', 'Off centre, at one focus', 'Outside the orbit'], answer: 1, explain: 'At a focus. Mars comes closest on one side and swings farthest on the other. This is Kepler\'s first law, and every planet, moon and comet obeys it.' },
      },
      {
        title: 'See it from outside',
        text: 'Kepler never saw what you can see now: the solar system from above, with Mars on its slightly lopsided orbit. Drag to look around, and run time forward to watch it speed up as it nears the Sun. That is his second law.',
        scene: { time: 'now', rate: 86400 * 5, camera: { look: 'mars', mode: 'space' }, select: 'mars', layers: { orbits: true } },
      },
    ],
  },
  {
    id: 'mission',
    title: 'Fly to Mars',
    summary: 'Pick a launch day and a flight time. Leave on the wrong day and no rocket can get you there.',
    minutes: 6,
    steps: [
      {
        title: 'A moving target',
        text: 'Mars is in tonight\'s sky from Cape Canaveral in the autumn of 2026. It looks like somewhere to aim for, but a spacecraft that sets off toward that point will arrive months later to find Mars long gone. You have to aim at where Mars will be.',
        scene: { time: { jd: jdFromCalendar(2026, 11, 1, 10, 0) }, rate: 0, site: CANAVERAL, camera: { look: 'mars', fov: 60 }, select: 'mars', layers: PLAIN_LAYERS },
        task: { kind: 'choice', prompt: 'The Earth goes round the Sun faster than Mars. To arrive together, when should you launch?', options: ['When Mars is straight overhead', 'When Mars is well ahead of the Earth', 'When Mars is behind the Earth'], answer: 1, explain: 'Ahead. The spacecraft coasts outward along a long curve while Mars comes round more slowly to meet it.' },
      },
      {
        title: 'Plan the flight',
        text: 'The chart looks down on the Sun, the Earth\'s orbit and Mars\'s. Once the engine stops, the spacecraft coasts on an orbit of its own (the curve). Leaving the Earth takes speed, and so does stopping at Mars. Your rocket can supply 6.2 km/s in all.',
        task: { kind: 'transfer', prompt: 'Find a launch day and flight time the rocket can manage.', from: LAUNCH_FROM, window: LAUNCH_WINDOW, budget: LAUNCH_BUDGET, explain: 'You are on your way.' },
      },
      {
        title: 'The launch window',
        text: 'Good days to leave come only when the two planets line up the right way, for a few weeks every 26 months. That is why Mars missions leave in clusters: several in July 2020, the next chances in late 2026 and late 2028. Miss the window and the flight waits two years.',
        task: { kind: 'choice', prompt: 'A cheap flight to Mars takes about how long?', options: ['Three days, like Apollo to the Moon', 'Six to ten months', 'Five years'], answer: 1, explain: 'Six to ten months. Perseverance left on 30 July 2020 and landed on 18 February 2021.' },
      },
      {
        title: 'Watch the planets turn',
        text: 'Here is the solar system from above, running a week every second. Watch the Earth catch up with Mars and pass it on the inside track, again and again: each pass is a launch window just gone.',
        scene: { time: { jd: jdFromCalendar(2026, 6, 1) }, rate: 86400 * 7, camera: { look: 'sun', mode: 'space' }, layers: { orbits: true } },
      },
    ],
  },
];

export function findJourney(id: string): Journey | undefined {
  return JOURNEYS.find((j) => j.id === id);
}
