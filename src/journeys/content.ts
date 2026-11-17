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

const GIZA = site('Giza', 29.98, 31.13, 'Africa/Cairo', 'Egypt');
const AT_SEA = site('Somewhere in the Atlantic', 36.5, -25);
const SOUTHERN_OCEAN = site('Somewhere in the southern ocean', -34, 18);
const SYENE = site('Syene (Aswan)', 24.09, 32.9, 'Africa/Cairo', 'Egypt');
const ALEXANDRIA = site('Alexandria', 31.2, 29.92, 'Africa/Cairo', 'Egypt');
const PADUA = site('Padua', 45.41, 11.88, 'Europe/Rome', 'Italy');
const HILO = site('Hilo', 19.72, -155.08, 'Pacific/Honolulu', 'United States');
const PRAGUE = site('Prague', 50.09, 14.42, 'Europe/Prague', 'Czechia');
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
];

export function findJourney(id: string): Journey | undefined {
  return JOURNEYS.find((j) => j.id === id);
}
