// Concepts: the ideas behind the sky, each a long read with "Try it" buttons
// that set the sky up to show the idea, diagrams where they help, and an
// optional question at the end. They replace the step-by-step journeys: the
// same scenes and diagrams, without one step gating the next.

import { jdFromCalendar } from '../astro/time.ts';
import type { Plot, Task } from '../learn/tasks.ts';
import { hohmann } from '../learn/orbits.ts';
import type { Scene } from '../sim/scene.ts';
import {
  ACRUX, ALEXANDRIA, ANTARES, AT_SEA, BETELGEUSE, CAPE_CANAVERAL, DALLAS, DIPPER_LATER, DIPPER_NOW, ERATOSTHENES_NOON,
  FOMALHAUT, GIZA, HILO, KEPLER_FIX, KEPLER_TRACK, LUNAR_ECLIPSE_2025, MARS_ARRIVAL_2027, MARS_LOOP, MARS_WINDOW_2026,
  NAV_TIME, NOON_DECEMBER, NOON_JUNE, ORION_NIGHT, PADUA, PLAIN_LAYERS, POLARIS, POLE_LAYERS, PRAGUE, RIGEL, SHIP,
  SOLAR_ECLIPSE_2024, SOUTHERN_OCEAN, STONEHENGE, STONEHENGE_RISE_2026, STONEHENGE_RISE_2500BC, SYENE, THUBAN, TORONTO,
  VEGA, WHAT_IF_TIME, altOf, farthestMars, galileoNight, sunFromOverhead,
} from './moments.ts';
import { jdFromLocal } from '../sim/format.ts';

export type ConceptBlock =
  /** A run of paragraphs, under an optional heading. */
  | { kind: 'text'; title?: string; paragraphs: string[] }
  /** A button that sets up the sky to show the idea. */
  | { kind: 'try'; label: string; note: string; scene: Scene }
  /**
   * A diagram at full width, with an optional task answered on it. Opened on
   * request; `scene` is applied first for diagrams that read the sky.
   */
  | { kind: 'plot'; plot: Plot; caption: string; task?: Extract<Task, { kind: 'plot' }>; scene?: Scene }
  /** A button that opens one of the labs. */
  | { kind: 'lab'; lab: 'trip'; label: string; note: string }
  /**
   * A question to check yourself; never blocks reading on. `scene` is the sky
   * the answer is read from, set up again when checking so the answer matches.
   */
  | { kind: 'question'; task: Extract<Task, { kind: 'choice' } | { kind: 'number' }>; scene?: Scene };

export const CONCEPT_GROUPS = [
  'The sky around you', 'Sun, Moon and seasons', 'Planets and orbits', 'Into space', 'Stars', 'Deep time', 'People and the sky',
] as const;
export type ConceptGroup = (typeof CONCEPT_GROUPS)[number];

export interface Concept {
  id: string;
  group: ConceptGroup;
  title: string;
  /** One line for lists. */
  summary: string;
  /** The opening paragraph. */
  lede: string;
  blocks: ConceptBlock[];
  /** Atlas entries worth reading next. */
  related: string[];
  /** Listed under Labs as well as in its group. */
  lab?: { icon: string; hint: string; title?: string };
}

const sky = (s: Scene): Scene => ({ rate: 0, ...s });

const NAV_SCENE = sky({ time: { jd: NAV_TIME }, site: SHIP, camera: { look: { az: 285, alt: 45 }, fov: 90 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } });
const ALEX_SCENE = sky({ time: { jd: ERATOSTHENES_NOON }, site: ALEXANDRIA, camera: { look: 'sun', fov: 100 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' });
/** The sandbox starts from the planets' real places at this moment. */
const WHAT_IF_SCENE: Scene = { time: { jd: WHAT_IF_TIME }, rate: 0 };

export const CONCEPTS: Concept[] = [
  // ---------------------------------------------------------------- the sky around you
  {
    id: 'turning-sky',
    group: 'The sky around you',
    title: 'The turning sky',
    summary: 'Why the stars wheel round one point, and why some never set.',
    lede: 'Watch the sky for an hour and every star moves together, rising in the east, arcing across and setting in the west, as if painted on a vast turning bowl. The stars are not moving. We are: the Earth spins once a day, and the whole sky seems to turn the other way around us.',
    blocks: [
      { kind: 'text', title: 'The celestial sphere', paragraphs: [
        'For thousands of years people pictured the stars fixed to a great sphere turning around the Earth. We know now that the stars are at wildly different distances, but the picture is still the most useful way to describe where things are in the sky, and astronomers still use it. Every star has a fixed place on this imaginary sphere, and the sphere turns once a day.',
        'The sphere turns around an axis that is simply the Earth\'s own axis, extended out into space. Where it meets the sky are the two celestial poles. The north celestial pole lies, by luck, within a degree of a moderately bright star, Polaris. The south celestial pole has no bright star nearby at all.',
      ] },
      { kind: 'try', label: 'Watch the northern sky turn', note: 'Toronto, a November night, with time running ten minutes a second. Every star circles Polaris.', scene: { time: { jd: jdFromCalendar(2026, 11, 18, 2, 0) }, rate: 600, site: TORONTO, camera: { look: { az: 0, alt: 40 }, fov: 100 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true, constellationLabels: true } } },
      { kind: 'text', title: 'Stars that never set', paragraphs: [
        'Stars close to the pole never dip below the horizon. They circle round it all night and all day, hidden only by daylight. These are circumpolar stars. From Toronto, at 44° north, everything within 44° of the north celestial pole is circumpolar: the Big Dipper, Cassiopeia, Cepheus and Draco never set.',
        'The rule is simple: the pole stands as high above your horizon as your latitude, so a circle of sky that big around it never sets, and a circle of the same size around the opposite pole never rises. At the North Pole every visible star is circumpolar and half the sky is never seen. On the equator both poles sit on the horizon, every star rises and sets, and over a year you can see the whole sky.',
      ] },
      { kind: 'text', title: 'Rising and setting', paragraphs: [
        'Stars away from the pole rise somewhere along the eastern horizon, climb highest when they cross the meridian, the north-south line through the point overhead, and set in the west. A star on the celestial equator rises due east and sets due west and spends exactly half its time above the horizon. Stars north of the equator, seen from the northern hemisphere, rise north of east and stay up longer; stars south of it rise south of east and keep low.',
        'The same is true of the Sun, which is why summer days are long: in June the Sun sits north of the celestial equator and takes a long, high path across the sky.',
      ] },
      { kind: 'text', title: 'The sidereal day', paragraphs: [
        'The stars come round to the same place about four minutes earlier every night. That is because the Earth also travels around the Sun. In one day it moves about a degree along its orbit, so to bring the Sun back to the same place in the sky it has to turn a little more than once. Measured against the stars, one turn takes 23 hours 56 minutes, the sidereal day. Those four minutes a day add up to two hours a month, which is why the constellations of evening change with the seasons: Orion is a winter sight in the evening but rises before dawn in late summer.',
      ] },
      { kind: 'try', label: 'See the southern sky turn', note: 'The southern ocean at 34° south. The sky turns around an empty patch of sky below the Southern Cross.', scene: { time: { jd: jdFromCalendar(2026, 5, 15, 19, 0) }, rate: 600, site: SOUTHERN_OCEAN, camera: { look: { az: 180, alt: 34 }, fov: 100 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } } },
      { kind: 'question', task: { kind: 'choice', prompt: 'From the North Pole, which stars would you see rise and set?', options: ['All of them', 'Only the ones near the horizon', 'None: every star circles at a constant height'], answer: 2, explain: 'None. At the pole the celestial pole is straight overhead, so every star circles parallel to the horizon at a constant height.' } },
    ],
    related: [POLARIS, 'con:western:UMa', 'con:western:Cas'],
  },
  {
    id: 'magnitudes',
    group: 'The sky around you',
    title: 'How bright is a star?',
    summary: 'The magnitude scale, which runs backwards, and what light pollution takes away.',
    lede: 'Astronomers measure brightness on a scale invented over two thousand years ago, and it runs backwards: the smaller the number, the brighter the star. The brightest stars are magnitude 0 or 1, the faintest you can see from a dark site about 6 or 7, and the Sun is −27.',
    blocks: [
      { kind: 'text', title: 'Hipparchus\'s six classes', paragraphs: [
        'Around 130 BC the Greek astronomer Hipparchus sorted the stars into six classes. The brightest were of the first magnitude, meaning first in importance; the faintest he could see were the sixth. The idea survived through Ptolemy\'s star catalogue and into the modern age.',
        'In 1856 Norman Pogson noticed that a first-magnitude star is about a hundred times brighter than a sixth-magnitude one, and fixed the scale so that five magnitudes is exactly a factor of 100. Each step of one magnitude is then a factor of about 2.512. A magnitude 1 star is 2.5 times brighter than a magnitude 2 star, 6.3 times brighter than magnitude 3, and so on.',
        'Once fixed by numbers, the scale could run past its ends. Sirius, the brightest star in the night sky, is −1.5. Venus reaches −4.6, the full Moon −12.7 and the Sun −26.7. Going the other way, binoculars reach about magnitude 9, the Hubble Space Telescope about 31.',
      ] },
      { kind: 'text', title: 'Apparent and absolute', paragraphs: [
        'How bright a star looks depends on two things: how much light it gives off and how far away it is. The magnitude on a star\'s card is its apparent magnitude, how it looks from here. To compare stars fairly, astronomers also use absolute magnitude, how bright each would look from a standard distance of 10 parsecs (32.6 light years). From there the Sun would be a faint magnitude 4.8, while Rigel would blaze at about −7, brighter than Venus.',
        'Sirius looks brightest of all mostly because it is close, 8.6 light years away. Deneb, at the top of the Northern Cross, looks only half as bright but is perhaps 2,600 light years away; it is one of the most luminous stars we can see by eye.',
      ] },
      { kind: 'text', title: 'What city lights take away', paragraphs: [
        'The faintest star you can see, the limiting magnitude, depends mostly on the sky behind it. Light scattered from street lamps, signs and windows brightens the night sky and drowns the faint stars. Astronomers grade this on the Bortle scale, from 1, a pristine dark site where the Milky Way casts shadows, to 9, an inner-city sky where only a few dozen stars show.',
        'The numbers are stark. Under a truly dark sky you can see around 4,000 to 5,000 stars at once. From a suburb, a few hundred. From a city centre, perhaps 20 to 50. About a third of humanity, and most people in Europe and North America, can no longer see the Milky Way from home.',
      ] },
      { kind: 'try', label: 'Orion from a city', note: 'Bortle 8: Orion\'s brightest stars and little else.', scene: sky({ time: { jd: ORION_NIGHT }, site: TORONTO, bortle: 8, camera: { look: 'con:western:Ori', fov: 70 }, layers: { ...PLAIN_LAYERS, lines: false, starLabels: true, milkyWay: true } }) },
      { kind: 'try', label: 'The same view from a dark site', note: 'Bortle 2: the same moment, with the faint stars and the Milky Way back. Set your own sky in View settings.', scene: sky({ time: { jd: ORION_NIGHT }, site: TORONTO, bortle: 2, camera: { look: 'con:western:Ori', fov: 70 }, layers: { ...PLAIN_LAYERS, lines: false, starLabels: true, milkyWay: true } }) },
      { kind: 'text', title: 'Seeing more', paragraphs: [
        'Your eyes need time to adapt to the dark: the pupils open within a minute, but the chemistry of the retina takes 20 to 30 minutes to reach full sensitivity, and a single glance at a white phone screen undoes much of it. That is what the red night-vision mode in View settings is for. Looking slightly to one side of a faint object, averted vision, puts its light on the more sensitive rod cells away from the centre of the eye and can reveal stars a magnitude fainter.',
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'A magnitude 1 star and a magnitude 6 star: how many times brighter is the first?', options: ['5 times', '100 times', '600 times'], answer: 1, explain: '100 times. Five magnitudes is defined as a factor of exactly 100.' } },
    ],
    related: ['star:32349', 'star:102098', 'star:24436', 'con:western:Ori'],
  },

  // ---------------------------------------------------------------- sun, moon and seasons
  {
    id: 'seasons',
    group: 'Sun, Moon and seasons',
    title: 'Seasons and the tilted Earth',
    summary: 'Why summer is warm, and why Stonehenge points where it does.',
    lede: 'The seasons have nothing to do with how far we are from the Sun. Earth is actually closest to the Sun in early January, in the depth of northern winter. Seasons come from the tilt of the Earth\'s axis, 23.4° from upright, which leans each hemisphere toward the Sun for half the year and away from it for the other half.',
    blocks: [
      { kind: 'text', title: 'High Sun, low Sun', paragraphs: [
        'In June the northern hemisphere leans toward the Sun. Seen from the ground, the Sun climbs high at noon and takes a long path across the sky, rising well north of east and setting well north of west. Its light strikes steeply, concentrated on a small patch of ground, and it shines for many hours. In December the northern hemisphere leans away: the Sun stays low, rises south of east, sets south of west, and its light comes in at a slant, spread thin over more ground and through more air. Those two effects, the angle and the length of day, make the difference between summer and winter.',
        'In the southern hemisphere everything is reversed: December is midsummer in Sydney and Buenos Aires.',
      ] },
      { kind: 'try', label: 'Noon on the longest day', note: 'Toronto, 21 June 2026, as the Sun crosses the meridian: about 70° up.', scene: sky({ time: { jd: NOON_JUNE }, site: TORONTO, camera: { look: 'sun', fov: 110 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' }) },
      { kind: 'try', label: 'Noon on the shortest day', note: 'Toronto, 21 December 2026: the noon Sun reaches only about 23°.', scene: sky({ time: { jd: NOON_DECEMBER }, site: TORONTO, camera: { look: 'sun', fov: 110 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' }) },
      { kind: 'text', title: 'Solstices and equinoxes', paragraphs: [
        'Four moments mark the year. At the June solstice, around 21 June, the Sun reaches its farthest north, overhead at noon on the Tropic of Cancer at 23.4° north. At the December solstice it is overhead on the Tropic of Capricorn. In between, around 20 March and 22 September, come the equinoxes, when the Sun crosses the celestial equator, rises due east and sets due west everywhere on Earth, and day and night are close to equal length.',
        'The Sun\'s noon height changes by 47° between the solstices, twice the tilt. That gives a quick way to find the tilt of the Earth with a stick: measure the shortest and longest noon shadows of the year and halve the difference in the Sun\'s angle.',
        'Beyond the Arctic and Antarctic circles, 23.4° from the poles, the tilt is enough for the Sun to stay up all day at midsummer and stay down all day at midwinter.',
      ] },
      { kind: 'text', title: 'Stonehenge', paragraphs: [
        'People have marked the solstices for at least five thousand years. The great stones of Stonehenge were raised around 2500 BC, and the monument\'s avenue points northeast toward the spot where the Sun rises on midsummer morning; turn around and it faces midwinter sunset. Whether it was built mainly as a calendar or as a place of ceremony is debated, but the alignment is no accident.',
        'The Earth\'s tilt is not quite fixed. It nods between about 22.1° and 24.5° over a 41,000-year cycle, and it has been shrinking for thousands of years. In 2500 BC it was about 24.0°, so the midsummer Sun swung a little farther north and rose about a degree farther north along the horizon than it does today.',
      ] },
      { kind: 'try', label: 'Midsummer sunrise, 2500 BC', note: 'Salisbury Plain before dawn on the longest day, time running at two minutes a second. Tap the Sun as it rises to read its direction.', scene: { time: { jd: STONEHENGE_RISE_2500BC - 0.03 }, rate: 120, site: STONEHENGE, camera: { look: { az: 50, alt: 4 }, fov: 60 }, layers: { ...PLAIN_LAYERS, cardinals: true } } },
      { kind: 'try', label: 'The same sunrise in 2026', note: 'Watch where the Sun comes up now, about a degree farther south.', scene: { time: { jd: STONEHENGE_RISE_2026 - 0.03 }, rate: 120, site: STONEHENGE, camera: { look: { az: 50, alt: 4 }, fov: 60 }, layers: { ...PLAIN_LAYERS, cardinals: true } } },
      { kind: 'text', title: "Closest in January", paragraphs: [
        "The Earth's orbit is not quite a circle. We are closest to the Sun, about 147 million km, in the first days of January, and farthest, about 152 million km, in early July. Sunlight is about 7% stronger at the January end, but that is far smaller than the effect of the tilt, and the northern summer happens at the far end anyway.",
        "The warmest weeks also come about a month after the June solstice, not on it. Land and especially oceans take time to warm up and cool down, so the seasons lag behind the Sun: the seasonal lag.",
        "Other planets have seasons too. Mars is tilted 25\u00b0, much like the Earth, and its polar caps grow and shrink each Martian year. Uranus is tipped over by 98\u00b0, so each pole gets about 42 years of daylight followed by 42 years of night.",
      ] },
      { kind: 'question', task: { kind: 'number', prompt: 'Toronto is at 43.7° north. How high is the noon Sun there at an equinox, in degrees?', answer: 46.3, tolerance: 1.5, unit: '°', hint: 'At an equinox the Sun is on the celestial equator, which stands 90° minus your latitude above the southern horizon.', explain: 'About 46°: 90° minus the latitude. Add 23.4° for the June solstice, subtract it for December.' } },
    ],
    related: ['sun', 'con:western:Cnc', 'con:western:Cap'],
  },
  {
    id: 'moon-phases',
    group: 'Sun, Moon and seasons',
    title: 'Phases of the Moon',
    summary: 'Why the Moon changes shape over a month, and when to look for it.',
    lede: 'The Moon makes no light of its own. Half of it is always lit by the Sun, and as it goes round the Earth once a month we see that lit half from changing angles: all of it at full Moon, none at new Moon, and every shape in between.',
    blocks: [
      { kind: 'text', title: 'Around the cycle', paragraphs: [
        'At new Moon, the Moon lies roughly between the Earth and the Sun, its lit side facing away from us. It rises and sets with the Sun and is lost in the glare. A day or two later it reappears as a thin crescent low in the west after sunset, lit on its right-hand side as seen from the northern hemisphere.',
        'Each day it moves about 13° east against the stars, so it rises about 50 minutes later each day and the crescent fattens. A week after new Moon comes first quarter, a half-lit Moon high in the south at sunset. Then it is gibbous, more than half lit, and two weeks after new comes full Moon, opposite the Sun, rising as the Sun sets and up all night. The second half of the month runs the same sequence backwards in the morning sky: waning gibbous, last quarter rising around midnight, and a thin morning crescent before the next new Moon.',
        'The whole cycle takes 29.5 days, the synodic month. The Moon actually circles the Earth in 27.3 days, measured against the stars; the extra two days are needed because the Earth has moved along its orbit meanwhile, and the Moon has to catch up to the same angle from the Sun.',
      ] },
      { kind: 'try', label: 'A month in under a minute', note: 'Time running at a day every two seconds, with the camera following the Moon. Watch the lit part grow and shrink.', scene: { time: { jd: jdFromCalendar(2026, 12, 9, 22, 0) }, rate: 43200, site: TORONTO, camera: { look: 'moon', fov: 3, track: true }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false }, select: 'moon' } },
      { kind: 'text', title: 'Reading the Moon', paragraphs: [
        'The lit side of the Moon always faces the Sun, wherever the Sun is, even when it is below the horizon. A crescent in the evening points its bright edge down toward where the Sun has set. That is why you never see a crescent Moon high in the sky at midnight: a thin crescent is always close to the Sun in the sky.',
        'From the southern hemisphere you see the Moon upside down compared with the north, so the waxing crescent is lit on its left. Near the equator the evening crescent lies almost flat, like a boat or a smile.',
        'In the days around a thin crescent, look at the unlit part: it glows faintly. That is earthshine, sunlight reflected from the Earth onto the Moon and back to your eye. Leonardo da Vinci worked out the explanation around 1510.',
      ] },
      { kind: 'text', title: 'Phases and eclipses', paragraphs: [
        'If the Moon\'s orbit lay exactly in the plane of the Earth\'s, every new Moon would cover the Sun and every full Moon would pass through the Earth\'s shadow. The orbit is tilted about 5°, so most months the Moon passes just above or below. Eclipses happen only when a new or full Moon falls near one of the two points where the orbits cross. The next concept, eclipses, picks up from there.',
      ] },
      { kind: 'text', title: "Always the same face", paragraphs: [
        "The Moon turns once on its axis in exactly the time it takes to go round the Earth, so it always keeps the same face toward us. The Earth's tides slowed its spin until it locked this way, long ago. The far side is not dark: it gets as much sunlight as the near side, and at new Moon it is fully lit. Because the Moon's orbit is tilted and elliptical, it seems to rock slightly over a month, and over time we see about 59% of its surface.",
        "The month is the Moon's: the word comes from it. The Islamic calendar still follows the Moon alone, with a year of twelve lunar months, 354 days, so its festivals move through the seasons. The Hebrew and Chinese calendars add an extra month seven times in every nineteen years, the Metonic cycle, to keep the months in step with the seasons.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'You see a half-lit Moon high in the south at sunset. Which phase is it?', options: ['First quarter', 'Last quarter', 'Full Moon'], answer: 0, explain: 'First quarter. It is 90° east of the Sun, so it is highest at sunset. A last quarter Moon is highest at sunrise.' } },
    ],
    related: ['moon', 'sun'],
  },
  {
    id: 'eclipses',
    group: 'Sun, Moon and seasons',
    title: 'Eclipses',
    summary: 'When the Moon hides the Sun, and when the Earth\'s shadow turns the Moon red.',
    lede: 'An eclipse happens when the Sun, the Earth and the Moon fall into a straight line. If the Moon passes in front of the Sun, it is a solar eclipse. If the Moon passes through the Earth\'s shadow, it is a lunar eclipse. Both are just the shadows of worlds, and both can be predicted centuries ahead.',
    blocks: [
      { kind: 'text', title: 'A lucky coincidence', paragraphs: [
        'The Sun is about 400 times wider than the Moon and, by chance, about 400 times farther away, so the two look almost exactly the same size in our sky, about half a degree across. That is why the Moon can cover the Sun\'s bright disc almost exactly, revealing the faint outer atmosphere, the corona, for a few minutes.',
        'Because the Moon\'s orbit is an ellipse, its distance changes, and so does its size in the sky. When an eclipse happens with the Moon near its farthest, it is too small to cover the Sun completely and leaves a blazing ring: an annular eclipse. The Moon is slowly drifting away from the Earth, about 3.8 cm a year, so in several hundred million years total eclipses will end.',
      ] },
      { kind: 'text', title: 'Solar eclipses', paragraphs: [
        'The Moon\'s shadow is small. Its dark core, the umbra, sweeps a path rarely more than 200 km wide across the Earth at over 1,700 km/h. Inside that path the eclipse is total: the sky darkens to deep twilight in seconds, the temperature drops, bright planets and stars come out, and the corona appears around the black disc. Outside it, across a much wider area, people see a partial eclipse, with a bite taken out of the Sun.',
        'Any one place sees a total solar eclipse only about once every 375 years on average, which is why people travel across the world to stand in the path. On 8 April 2024 the path crossed Mexico, the United States and eastern Canada, with about four minutes of totality over Dallas. The next total eclipses are in Spain and Iceland on 12 August 2026, along the Mediterranean on 2 August 2027, and across Australia in July 2028.',
        'Never look at the partial phases of a solar eclipse without proper eclipse glasses or a filter. Only during totality itself, when the Sun\'s disc is completely covered, is it safe to look with the naked eye.',
      ] },
      { kind: 'try', label: 'Totality over Dallas, 8 April 2024', note: 'The Moon covers the Sun and the corona shows. Bright planets are out in the darkened sky.', scene: sky({ time: { jd: SOLAR_ECLIPSE_2024 }, site: DALLAS, camera: { look: 'sun', fov: 6 }, layers: { ...PLAIN_LAYERS }, select: 'sun' }) },
      { kind: 'text', title: 'Lunar eclipses', paragraphs: [
        'A lunar eclipse is seen by everyone on the night side of the Earth at once, and it lasts for hours. First the Moon slides into the penumbra, the pale outer shadow, which only dims it slightly. Then the dark umbra creeps across its face, and for up to about an hour and three quarters the Moon is totally eclipsed.',
        'It does not vanish. It turns copper or deep red, because the Earth\'s atmosphere bends sunlight round the edge of the planet into the shadow, and on the way the air scatters the blue out of it, just as it does at sunset. A totally eclipsed Moon is lit by every sunrise and sunset on Earth at once. How red it looks depends on how much dust and cloud is in our atmosphere; after big volcanic eruptions it can turn so dark it almost disappears.',
      ] },
      { kind: 'try', label: 'The red Moon of 14 March 2025', note: 'Mid-totality, seen from Toronto. Faint stars come out around the Moon as its glare fades.', scene: sky({ time: { jd: LUNAR_ECLIPSE_2025 }, site: TORONTO, camera: { look: 'moon', fov: 12 }, layers: { ...PLAIN_LAYERS }, select: 'moon' }) },
      { kind: 'text', title: 'Seasons of eclipses, and the saros', paragraphs: [
        'The Moon\'s orbit is tilted about 5° to the Earth\'s, so eclipses can only happen when the Sun is near one of the two places where the orbits cross, the nodes. That happens twice a year, in eclipse seasons about 173 days apart, and each season brings at least one solar and usually one lunar eclipse, a fortnight apart.',
        'Babylonian astronomers found that eclipses repeat after 18 years, 11 days and 8 hours: the saros. After one saros the Sun, the Moon and the nodes return to nearly the same arrangement, so a similar eclipse happens again, shifted a third of the way round the world by the extra eight hours. The Greeks built the cycle into the Antikythera mechanism, a bronze gear-driven calculator from around 100 BC. The events calendar in Tonight lists every coming eclipse, and Show me takes you there.',
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Why isn\'t there an eclipse every month?', options: ['The Moon is too small', 'The Moon\'s orbit is tilted, so it usually passes above or below', 'The Sun moves too fast'], answer: 1, explain: 'The 5° tilt. Most months the new Moon passes above or below the Sun and the full Moon above or below the shadow.' } },
    ],
    related: ['moon', 'sun'],
  },

  // ---------------------------------------------------------------- planets and orbits
  {
    id: 'retrograde',
    group: 'Planets and orbits',
    title: 'Wanderers and retrograde loops',
    summary: 'Why the planets drift through the zodiac, and sometimes go backwards.',
    lede: 'The ancient Greeks called the planets planetes, wanderers, because unlike the stars they move. Night by night each drifts slowly eastward through the band of zodiac constellations. But every so often a planet stops, goes backward for weeks, then turns forward again. Explaining that loop took two thousand years.',
    blocks: [
      { kind: 'text', title: 'The road of the planets', paragraphs: [
        'All the planets orbit the Sun in nearly the same flat plane, so from the Earth they always appear close to one line across the sky: the ecliptic, the Sun\'s yearly path. The constellations along it are the zodiac. That is why you never see Jupiter near Polaris or Mars in the Southern Cross: the planets stay on the road.',
        'Against the stars, each planet usually moves eastward, the same way the Sun and Moon do, at a pace set by its orbit. Mars takes about two years to go round the sky, Jupiter twelve and Saturn nearly thirty.',
      ] },
      { kind: 'text', title: 'Backwards for a while', paragraphs: [
        'Every 26 months, as Mars approaches opposition, its eastward drift slows, stops, and for about two months it moves westward, retrograde, before stopping again and resuming its normal course. The path traces a loop or a zigzag against the stars. Jupiter and Saturn do the same every year, around their own oppositions.',
        'Ptolemy, around AD 150, explained the loops with epicycles: each planet rode a small circle whose centre rode a large circle around the Earth. With enough circles the scheme predicted the planets well enough to last 1,400 years.',
        'Copernicus, in 1543, gave the simpler answer. The Earth is itself a planet, moving faster than Mars on an inner track. When we overtake Mars, it seems to slip backward against the distant stars, the way a slower car on a motorway seems to move backward against the hills as you pass it. Nothing about Mars changes; the loop is a matter of perspective from a moving Earth.',
      ] },
      { kind: 'try', label: 'Mars in December 2026', note: 'Mars in Leo, moving eastward. Turn on the ecliptic to see the road of the planets.', scene: sky({ time: { jd: MARS_LOOP[0] }, site: TORONTO, camera: { look: 'mars', fov: 50 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, ecliptic: true, planetLabels: true, starLabels: true }, select: 'mars' }) },
      { kind: 'try', label: 'Mars at opposition, February 2027', note: 'Brightest and closest, in the middle of its backward loop.', scene: sky({ time: { jd: MARS_LOOP[1] }, site: TORONTO, camera: { look: 'mars', fov: 50 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, ecliptic: true, planetLabels: true, starLabels: true }, select: 'mars' }) },
      { kind: 'try', label: 'Mars in May 2027', note: 'Moving eastward again, fading as the Earth pulls ahead.', scene: sky({ time: { jd: MARS_LOOP[2] }, site: TORONTO, camera: { look: 'mars', fov: 50 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, ecliptic: true, planetLabels: true, starLabels: true }, select: 'mars' }) },
      { kind: 'text', title: 'Inner planets too', paragraphs: [
        'Mercury and Venus go retrograde as well, when they pass between the Earth and the Sun, at inferior conjunction. Then they swing from the evening sky to the morning sky. Because they orbit inside ours, they never stray far from the Sun: Venus at most about 47°, Mercury about 28°. Those greatest elongations are the best times to see them, and the Tonight calendar lists each one.',
      ] },
      { kind: 'text', title: "Opposition", paragraphs: [
        "An outer planet is at opposition when the Earth passes between it and the Sun. It is then opposite the Sun in our sky, rising at sunset and up all night, and close to its nearest and brightest. Mars reaches opposition every 780 days or so, Jupiter every 399 days and Saturn every 378: the closer a planet is to the Earth's own speed, the longer we take to lap it.",
        "Not all oppositions of Mars are equal. Its orbit is stretched enough that at some oppositions it is twice as close as at others. In August 2003 Mars came within 56 million km, closer than at any time in nearly 60,000 years. The opposition of February 2027 is a distant one, about 101 million km, and Mars will look smaller and fainter, though still brighter than any star except Sirius.",
        "Before Copernicus won the argument, Tycho Brahe proposed a halfway house: the planets go round the Sun, and the Sun and Moon go round a fixed Earth. It explains the loops just as well, and only measurements of the stars' tiny yearly shifts, made in 1838, finally proved that the Earth itself moves.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'When is an outer planet in retrograde motion?', options: ['Around conjunction, when it is behind the Sun', 'Around opposition, when the Earth overtakes it', 'Only when it is closest to the Sun'], answer: 1, explain: 'Around opposition. That is when the faster Earth passes it on the inside.' } },
    ],
    related: ['mars', 'jupiter', 'saturn', 'venus'],
  },
  {
    id: 'kepler',
    group: 'Planets and orbits',
    title: 'Kepler\'s laws and the orbit of Mars',
    summary: 'How Kepler found that planets move on ellipses, using two sightings and a triangle.',
    lede: 'Nobody can see how far away Mars is: every observation is only a direction. Yet in 1609 Johannes Kepler mapped its orbit and discovered that planets move on ellipses, not circles. He did it with Tycho Brahe\'s observations and a beautifully simple trick.',
    blocks: [
      { kind: 'text', title: 'Tycho\'s gift', paragraphs: [
        'Tycho Brahe spent twenty years measuring the positions of the planets from his observatory on the island of Hven, by eye, with huge brass instruments, to about one or two minutes of arc: better than anyone before him. When he died in Prague in 1601 his assistant, Johannes Kepler, inherited the records, and set himself to work out the orbit of Mars.',
      ] },
      { kind: 'try', label: 'Mars over Prague, 1602', note: 'Kepler\'s sky: Mars, a reddish point, high in the south.', scene: sky({ time: { jd: jdFromCalendar(1602, 3, 15, 21, 0) }, site: PRAGUE, camera: { look: 'mars', fov: 70 }, layers: { ...PLAIN_LAYERS, lines: true, planetLabels: true }, select: 'mars' }) },
      { kind: 'text', title: 'Triangulating a planet', paragraphs: [
        'Mars goes round the Sun once every 687 days. So on two dates 687 days apart, Mars is back at exactly the same point in space, but the Earth is not: in 687 days it has gone round almost twice and stopped at a different place in its own orbit. That gives two lookouts with a known baseline, both sighting the same Mars. Where the two lines of sight cross is where Mars is.',
      ] },
      { kind: 'plot', plot: { kind: 'triangulate', jd: KEPLER_FIX }, caption: 'The Solar System from above. The blue dots are the Earth on 1 August 1591 and 687 days later; the lines are the directions Tycho would have seen Mars.', task: { kind: 'plot', prompt: 'Tap where the two sight lines cross.', tolerance: 0.12, hint: 'Not on the crossing yet. Follow both lines until they meet.', explain: 'That is Mars, found without ever measuring its distance directly.' } },
      { kind: 'text', title: 'Not a circle', paragraphs: [
        'Kepler repeated this through Tycho\'s records, pair after pair, and plotted Mars point by point. The orbit was not a circle centred on the Sun. For six years he tried to make circles work, and his best still missed Tycho\'s numbers by eight minutes of arc, about a quarter of the Moon\'s width. He trusted Tycho and refused to ignore it. "Out of these eight minutes," he wrote, "we will construct a new theory."',
      ] },
      { kind: 'plot', plot: { kind: 'mars-orbit', jd0: KEPLER_TRACK.jd0, count: KEPLER_TRACK.count }, caption: 'Twelve fixes through Tycho\'s years. Tap a red point to read its distance from the Sun.' },
      { kind: 'question', task: { kind: 'number', prompt: 'How far from the Sun does Mars get, at most, in AU?', answer: farthestMars, tolerance: 0.04, unit: 'AU', hint: 'Tap the points on the far side of the path until you find the largest distance.', explain: 'About 1.66 AU. At its closest it is 1.38 AU, so the Sun is well off the centre of the path.' } },
      { kind: 'text', title: 'The three laws', paragraphs: [
        'First law (1609): each planet moves on an ellipse with the Sun at one focus, not at the centre. Most planetary orbits are nearly circular, but Mars\'s is stretched enough to show, and Mercury\'s more so.',
        'Second law (1609): a line from the Sun to the planet sweeps out equal areas in equal times. A planet moves fastest when closest to the Sun and slowest when farthest. The Earth moves about 3% faster in early January than in early July, which is one reason northern winter is a few days shorter than summer.',
        'Third law (1619): the square of a planet\'s year is proportional to the cube of its average distance from the Sun. Mars is 1.52 times farther out than the Earth; 1.52 cubed is 3.53, whose square root is 1.88, and Mars\'s year is indeed 1.88 Earth years. The same law holds for moons around a planet, as Galileo\'s moons of Jupiter show.',
        'Kepler did not know why these laws held. Isaac Newton showed in 1687 that all three follow from a single law of gravity, an attraction falling off with the square of distance. Every spacecraft trajectory, including the transfers in the next concepts, is built on them.',
      ] },
      { kind: 'text', title: "Ellipses everywhere", paragraphs: [
        "Kepler's laws hold for anything in orbit around the Sun. Comets follow long, thin ellipses: Halley's Comet swings from inside Venus's orbit out beyond Neptune's and back every 76 years. Edmond Halley used Newton's laws to predict its return in 1758, and its arrival on schedule, after he had died, was a triumph for the new physics.",
        "Kepler's own tables of the planets, the Rudolphine Tables of 1627, were thirty times more accurate than anything before. They predicted that Mercury would cross the face of the Sun in November 1631, and Pierre Gassendi in Paris watched it happen.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Where in its orbit does a planet move fastest?', options: ['Farthest from the Sun', 'Closest to the Sun', 'It always moves at the same speed'], answer: 1, explain: 'Closest to the Sun. That is the second law: equal areas in equal times.' } },
    ],
    related: ['mars', 'sun', 'jupiter'],
  },
  {
    id: 'galileo-moons',
    group: 'Planets and orbits',
    title: 'Galileo and the moons of Jupiter',
    summary: 'Four points of light beside Jupiter that changed how we see our place in the universe.',
    lede: 'In January 1610, in Padua, Galileo Galilei pointed a home-made telescope at Jupiter and saw three small stars in a line beside it. Night after night they moved, and not the way stars should. They were moons, circling another world, and they shook the old belief that everything turns around the Earth.',
    blocks: [
      { kind: 'text', title: 'Night by night', paragraphs: [
        'Galileo\'s telescope magnified about twenty times, less than a good pair of binoculars today, and showed a tiny field of view. On 7 January he noted three little stars near Jupiter, two to the east and one to the west, all in a straight line. He assumed they were background stars.',
        'On 8 January all three were west of Jupiter. If Jupiter were drifting past fixed stars that made no sense. On the 10th only two were visible, both to the east. By 13 January he had seen four, and he understood: they were moving with Jupiter and swinging back and forth around it, seen edge on.',
      ] },
      { kind: 'try', label: 'Padua, 7 January 1610', note: 'Jupiter through a narrow view like Galileo\'s. Three moons are on show.', scene: sky({ time: { jd: galileoNight(7) }, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, layers: { ...PLAIN_LAYERS, atmosphere: false, planetLabels: true }, select: 'jupiter' }) },
      { kind: 'try', label: 'The next night', note: '8 January: the little stars have moved, and all to one side.', scene: sky({ time: { jd: galileoNight(8) }, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, layers: { ...PLAIN_LAYERS, atmosphere: false, planetLabels: true }, select: 'jupiter' }) },
      { kind: 'try', label: 'All four, 13 January', note: 'Io, Europa, Ganymede and Callisto all clear of the disc. Callisto swings out farthest.', scene: sky({ time: { jd: galileoNight(13) }, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, layers: { ...PLAIN_LAYERS, atmosphere: false, planetLabels: true }, select: 'jupiter' }) },
      { kind: 'text', title: 'Why it mattered', paragraphs: [
        'Galileo published within two months, in a short book called Sidereus Nuncius, the Starry Messenger, and named the moons the Medicean Stars after his hoped-for patrons, the Medici. The names we use, Io, Europa, Ganymede and Callisto, were proposed by Simon Marius, who saw them at almost the same time.',
        'Here were four bodies plainly circling something other than the Earth. Critics of Copernicus had argued that if the Earth moved, it would leave the Moon behind. Jupiter, which everyone agreed was moving, kept four moons with it. Together with the phases of Venus, which Galileo saw later that year, it made the Sun-centred picture far harder to dismiss.',
      ] },
      { kind: 'text', title: 'Timing Io', paragraphs: [
        'Io, the innermost, never strays more than about three Jupiter-widths from the planet and goes round in 1.77 days. Callisto, the outermost, reaches about thirteen Jupiter-widths and takes 16.7 days. Callisto is about 4.5 times farther out than Io; 4.5 cubed is 91, whose square root is 9.5, and Callisto\'s period is 9.4 times Io\'s. Kepler\'s third law, found for the planets, works for Jupiter\'s moons too.',
        'The moons\' clockwork was useful. Their eclipses, as they slipped into Jupiter\'s shadow, could be timed anywhere on Earth and used to find longitude. In 1676 Ole Rømer noticed the eclipses ran late when Jupiter was far from the Earth and early when it was near, and realised light takes time to cross the gap: the first measurement that the speed of light is finite.',
      ] },
      { kind: 'try', label: 'Time Io yourself', note: 'Time is running at an hour a second. Note the date at the top when Io is farthest to one side, and wait until it is back.', scene: { time: { jd: galileoNight(13) }, rate: 3600, site: PADUA, camera: { look: 'jupiter', fov: 0.6 }, layers: { ...PLAIN_LAYERS, atmosphere: false, planetLabels: true }, select: 'io' } },
      { kind: 'text', title: "Four worlds", paragraphs: [
        "Spacecraft have since shown that the four Galilean moons are worlds in their own right. Io, squeezed by Jupiter's tides, is the most volcanic place known, with hundreds of active volcanoes. Europa has a smooth shell of ice over a salty ocean that may hold twice as much water as all the Earth's oceans, and NASA's Europa Clipper, launched in October 2024, is on its way to study it. Ganymede is the largest moon in the Solar System, bigger than the planet Mercury, and the only one with its own magnetic field; ESA's JUICE mission will orbit it in the 2030s. Callisto is an ancient, battered ball of ice and rock, covered in craters.",
        "You can repeat Galileo's discovery with ordinary binoculars held very steady, or propped on something: the moons show as tiny points in a line beside Jupiter, and from one night to the next you can see that they have moved.",
      ] },
      { kind: 'question', task: { kind: 'number', prompt: 'How long does Io take to go round once, in days?', answer: 1.769, tolerance: 0.2, unit: 'days', hint: 'Note the time when Io is farthest to one side, then wait until it is back there.', explain: '1.77 days, a little under 42.5 hours.' } },
    ],
    related: ['jupiter', 'io', 'europa', 'ganymede', 'callisto'],
  },

  // ---------------------------------------------------------------- into space
  {
    id: 'hohmann',
    group: 'Into space',
    title: 'Getting to Mars: Hohmann transfers',
    summary: 'You cannot fly straight at Mars. Find the day to launch so Mars is waiting when you arrive.',
    lede: 'A trip to Mars is not a straight line. A spacecraft leaving the Earth is already moving at 30 km/s around the Sun, and it coasts for months on a curved path. The cheapest way there, worked out by Walter Hohmann in 1925, is half an ellipse that touches the Earth\'s orbit at one end and Mars\'s at the other, and it only works if you leave on the right day.',
    blocks: [
      { kind: 'text', title: 'Two moving targets', paragraphs: [
        'The Earth and Mars both race around the Sun, the Earth faster on the inside track. A spacecraft launched from the Earth starts with the Earth\'s orbital speed and needs only a little more, about 3 km/s, to stretch its orbit out to reach Mars\'s. It then coasts, slowing as it climbs away from the Sun, for about eight and a half months.',
        'Aiming at Mars where it is at launch would miss by hundreds of millions of kilometres. The spacecraft must aim at where Mars will be when it arrives, which means leaving when Mars is about 44° ahead of the Earth in its orbit.',
      ] },
      { kind: 'try', label: 'Earth and Mars from above, autumn 2026', note: 'Space view over the Solar System, looking down on the orbits.', scene: sky({ time: { jd: jdFromCalendar(2026, 10, 1, 0, 0) }, site: CAPE_CANAVERAL, camera: { look: 'sun', mode: 'space', dist: 5.5, orbit: { yaw: -90, pitch: 80 } }, layers: { orbits: true, planetLabels: true } }) },
      { kind: 'plot', plot: { kind: 'transfer', from: jdFromCalendar(2026, 8, 1, 0, 0), to: jdFromCalendar(2027, 2, 1, 0, 0), start: jdFromCalendar(2026, 8, 15, 0, 0) }, caption: 'Slide the launch date. The dashed path ends at Mars\'s orbit; the red dot is where Mars will be that day.', task: { kind: 'plot', prompt: 'Find the launch date when Mars arrives at the orbit together with the spacecraft.', tolerance: 2, hint: 'Keep sliding: Mars needs to be on the end of the path, not ahead of it or behind.', explain: 'Early November 2026. Launch then and Mars is right there at the end of the trip.' } },
      { kind: 'lab', lab: 'trip', label: 'Open the trip planner', note: 'Plan real trips to Venus, Mars or Jupiter on a porkchop plot, compare with Perseverance, and fly them in Space view.' },
      { kind: 'text', title: 'Launch windows', paragraphs: [
        'The right arrangement comes round only once every 26 months, when the Earth is about to overtake Mars. Space agencies plan every Mars mission around these windows; miss one and the spacecraft waits on the ground for the next. In July 2020 three missions left within two weeks of each other: the UAE\'s Hope orbiter, China\'s Tianwen-1 and NASA\'s Perseverance rover, which landed on 18 February 2021.',
        'Real missions rarely fly a pure Hohmann transfer. The orbits of Earth and Mars are neither circles nor in quite the same plane, and a slightly faster path can be worth the extra fuel. Planners draw "porkchop plots", maps of launch date against arrival date coloured by cost, and pick a spot near the cheapest valley.',
      ] },
      { kind: 'question', task: { kind: 'number', prompt: 'How many days does the November 2026 trip take?', answer: (u) => hohmann(u.eph, MARS_WINDOW_2026).days, tolerance: 6, unit: 'days', explain: 'About 265 days, close to nine months: the same as real missions using these windows.' } },
      { kind: 'try', label: 'Arrival, July 2027', note: 'Where the spacecraft would reach Mars, nearly opposite where the Earth was at launch.', scene: sky({ time: { jd: MARS_ARRIVAL_2027 }, select: 'mars', camera: { look: 'sun', mode: 'space', dist: 5.5, orbit: { yaw: -90, pitch: 80 } }, layers: { orbits: true, planetLabels: true } }) },
      { kind: 'text', title: 'Coming home', paragraphs: [
        'A crew at Mars cannot simply turn round. The return window opens only when the Earth is in the right place behind Mars, which means waiting on Mars for about 15 months before flying home. A whole Hohmann round trip takes about two and a half years, one of the main challenges of sending people.',
      ] },
      { kind: 'text', title: "Why half an ellipse", paragraphs: [
        "Hohmann worked this out in 1925 in a book called The Attainability of Celestial Bodies, decades before any rocket could fly it. A spacecraft makes two burns: one leaving the Earth's orbit, pushing it onto an ellipse whose far end just touches Mars's orbit, and one on arrival, to match Mars's speed. Both burns are along the direction of travel, where a push changes the orbit most efficiently, which is why the path is the cheapest of all.",
        "The price is time. Hohmann transfers to the outer planets are very slow: about 2.7 years to Jupiter, 6 to Saturn and 30 to Neptune. That is why missions to the outer Solar System borrow speed from the planets they pass, as the next concept shows. To Venus, inward, a Hohmann transfer takes about five months, and the windows come every 19 months.",
        "Arriving is a problem of its own. A spacecraft reaches Mars about 2.6 km/s faster than Mars itself is moving. Orbiters brake with their engines or by dipping repeatedly into the thin Martian air; landers like Perseverance plunge straight in behind a heat shield and a parachute.",
      ] },
    ],
    related: ['mars', 'sun', 'jupiter'],
    lab: { icon: 'orbit', hint: 'Find the launch window to Mars.' },
  },
  {
    id: 'gravity-assist',
    group: 'Into space',
    title: 'Gravity assists',
    summary: 'How Voyager 2 reached the edge of the Solar System by borrowing speed from planets.',
    lede: 'Voyager 2\'s rocket burned for only a few minutes in 1977. It reached Jupiter, Saturn, Uranus and Neptune, and it is still leaving the Solar System at 15 km/s, because each planet it passed flung it onward. A gravity assist steals a tiny amount of a planet\'s orbital motion and gives it to a spacecraft.',
    blocks: [
      { kind: 'text', title: 'Coasting uphill', paragraphs: [
        'A spacecraft heading for the outer planets climbs away from the Sun the whole way and slows as it climbs, the way a ball thrown upward slows. Launched with only enough speed to reach Jupiter, it would arrive there moving too slowly to go farther and fall back toward the Sun.',
      ] },
      { kind: 'try', label: 'Voyager 2 at Jupiter, July 1979', note: 'Space view around Jupiter on the day of the flyby.', scene: sky({ time: { jd: jdFromCalendar(1979, 7, 9, 22, 0) }, camera: { look: 'jupiter', mode: 'space', dist: 0.08, orbit: { yaw: -80, pitch: 60 } }, layers: { orbits: true, planetLabels: true, compressed: false } }) },
      { kind: 'text', title: 'In, round and out', paragraphs: [
        'As seen by Jupiter, a passing spacecraft falls in, swings round and climbs out again at exactly the speed it came in. Nothing is gained. But Jupiter itself is moving around the Sun at 13 km/s. Seen from the Sun, the spacecraft\'s exit speed is its speed relative to Jupiter plus Jupiter\'s own motion, pointed in a new direction. Pass behind Jupiter, and the spacecraft is turned to leave in the direction Jupiter is going, and gains speed. Pass in front, and it loses speed: a way to fall inward toward the Sun, used by missions to Mercury.',
      ] },
      { kind: 'plot', plot: { kind: 'flyby' }, caption: 'Left: the path past Jupiter as Jupiter sees it. Right: the same flyby as the Sun sees it, with Jupiter\'s motion added. The green arc is the speed needed to escape the Sun from here.', task: { kind: 'plot', prompt: 'Choose a side and a closest approach that send the spacecraft out of the Solar System.', tolerance: 0, hint: 'Not enough yet. Try the other side, or a closer pass.', explain: 'Passing behind Jupiter, the spacecraft is pulled along after it and thrown forward in the direction Jupiter is moving.' } },
      { kind: 'text', title: 'Where the speed comes from', paragraphs: [
        'The extra speed comes from Jupiter, which slows down in its orbit by an equal and opposite amount of momentum. Jupiter is about 2,600 billion billion times heavier than Voyager, so the change is far too small ever to measure.',
        'Michael Minovitch worked out the mathematics of gravity assists in the early 1960s, and Gary Flandro noticed in 1965 that the outer planets would line up in the late 1970s so one spacecraft could visit all four. Voyager 2 did: Jupiter in 1979, Saturn in 1981, Uranus in 1986 and Neptune in 1989. Nearly every deep-space mission since has used assists, from Cassini, which swung past Venus twice, the Earth and Jupiter on its way to Saturn, to Parker Solar Probe, which uses Venus to fall ever closer to the Sun.',
      ] },
      { kind: 'try', label: 'Voyager 2 at Neptune, 1989', note: 'The whole Solar System in Space view. Voyager 2 passed Neptune on 25 August.', scene: sky({ time: { jd: jdFromCalendar(1989, 8, 25, 0, 0) }, camera: { look: 'sun', mode: 'space', dist: 60, orbit: { yaw: -90, pitch: 55 } }, layers: { orbits: true, planetLabels: true } }) },
      { kind: 'text', title: "Assists from the Earth itself", paragraphs: [
        "A spacecraft can even borrow speed from the planet it was launched from. Galileo, launched in 1989 toward Jupiter, swung past Venus once and the Earth twice before it had enough speed to reach Jupiter. The comet chaser Rosetta passed the Earth three times and Mars once on its ten-year path to Comet 67P. Planners string together assists from different planets, waiting years for the right line-up.",
        "Assists work just as well to slow down. To reach Mercury, deep in the Sun's gravity, a spacecraft must shed most of the Earth's orbital speed. BepiColombo, launched in 2018, used one flyby of the Earth, two of Venus and six of Mercury itself to brake before entering orbit.",
        "Voyager 1 and 2 are still travelling. Voyager 1 left the bubble of the solar wind, the heliosphere, in 2012 and Voyager 2 in 2018. Voyager 1 is now so far away that its radio signals, travelling at the speed of light, take nearly a day to reach us.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'A spacecraft passes in front of a planet, crossing its path ahead of it. What happens to its speed around the Sun?', options: ['It speeds up', 'It slows down', 'Nothing changes'], answer: 1, explain: 'It slows down. Missions to Mercury and the Sun use passes like this to fall inward.' } },
    ],
    related: ['jupiter', 'saturn', 'neptune', 'uranus'],
    lab: { icon: 'orbit', hint: 'Steer a slingshot past Jupiter.' },
  },
  {
    id: 'what-if',
    group: 'Into space',
    title: 'What if? Gravity and the planets',
    summary: 'Make Jupiter heavier or send a star through, and watch what gravity alone does.',
    lede: 'Every body in the Solar System pulls on every other. The Sun\'s pull dominates, but the planets tug on each other too. How stable is the arrangement? This sandbox starts the planets from where they really are and then lets gravity alone decide what happens next, including to a Solar System you have tampered with.',
    blocks: [
      { kind: 'text', title: 'Gravity, and nothing else', paragraphs: [
        'The diagram below starts with the Sun and eight planets at their real positions and speeds today. From there nothing is looked up: at each tiny step it adds up every pull on every body and moves them on. Run it for a few centuries.',
      ] },
      { kind: 'try', label: 'The real planets, from above', note: 'Space view of the Solar System at the moment the sandbox starts from.', scene: { ...WHAT_IF_SCENE, camera: { look: 'sun', mode: 'space', dist: 45, orbit: { yaw: -90, pitch: 70 } }, layers: { orbits: true, planetLabels: true } } },
      { kind: 'plot', plot: { kind: 'sandbox', controls: 'none' }, scene: WHAT_IF_SCENE, caption: 'The planets from above under gravity alone, starting from today.' },
      { kind: 'text', title: 'A heavier Jupiter', paragraphs: [
        'Jupiter is already more than twice as heavy as all the other planets together. Make it ten, a hundred or a thousand times heavier. At 1,000 times its real mass it would be about as heavy as the Sun: a second star. The outer planets feel it first. At 100 times, Saturn is pulled out toward 13 AU and Neptune\'s orbit stretches, while the Earth barely notices. At 1,000 times the system tears itself apart within a couple of centuries.',
      ] },
      { kind: 'plot', plot: { kind: 'sandbox', controls: 'jupiter' }, scene: WHAT_IF_SCENE, caption: 'Choose Jupiter\'s mass and watch.' },
      { kind: 'text', title: 'A passing star', paragraphs: [
        'Now keep Jupiter as it is and send a star like the Sun through the plane of the planets at 20 km/s, a typical speed for stars near us. At 100 AU it barely ruffles Neptune. At 10 AU the giant planets are thrown about but the Earth carries on. Only a pass within a few AU, inside Jupiter\'s orbit, threatens the Earth.',
        'Stars are so far apart that such passes are vanishingly rare. The closest known is coming: in about 1.3 million years the star Gliese 710 will pass roughly 10,000 AU from the Sun, through the Oort cloud of comets but far outside the planets. It may send a shower of comets inward; the planets\' orbits will not notice.',
      ] },
      { kind: 'plot', plot: { kind: 'sandbox', controls: 'star' }, scene: WHAT_IF_SCENE, caption: 'Choose how close the star comes. Switch to Inner to keep an eye on the Earth.' },
      { kind: 'text', title: 'Is the real Solar System stable?', paragraphs: [
        'Over millions of years the planets\' mutual tugs slowly change the shapes and tilts of their orbits. Laplace and Lagrange in the late 1700s thought these changes simply oscillated forever. Modern computer runs show the inner Solar System is chaotic: small differences grow, so the exact positions of the planets cannot be predicted beyond about 50 million years. Even so, in thousands of simulations over the Sun\'s remaining five billion years, the planets almost always stay put. In about one run in a hundred, Mercury\'s orbit is stretched enough by Jupiter to cross Venus\'s.',
      ] },
      { kind: 'text', title: "Jupiter's fingerprints", paragraphs: [
        "Jupiter has already shaped the Solar System. The asteroid belt between Mars and Jupiter has gaps, the Kirkwood gaps, at distances where an asteroid would go round exactly three times for every one of Jupiter's orbits, or five for every two. Jupiter's regular tugs at the same point in the orbit cleared those lanes out. Thousands of Trojan asteroids share Jupiter's own orbit, gathered in two swarms 60\u00b0 ahead of and behind the planet where its pull and the Sun's balance; NASA's Lucy spacecraft, launched in 2021, is on its way to visit them.",
        "Early in the Solar System's history the giant planets themselves probably moved, Jupiter drifting slightly inward and Saturn, Uranus and Neptune outward, scattering comets and asteroids as they went. The sandbox shows how quickly orbits change when a big mass is moved, which is how astronomers study that past.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'With Jupiter 100 times heavier, which planets are shaken up first?', options: ['Mercury and Venus', 'The Earth and Mars', 'Saturn, Uranus and Neptune'], answer: 2, explain: 'The outer planets, which are closest to Jupiter.' } },
    ],
    related: ['jupiter', 'region:oort', 'sun'],
    lab: { icon: 'orbit', hint: 'Change the planets and see what gravity does.', title: 'What if?' },
  },

  // ---------------------------------------------------------------- stars
  {
    id: 'star-colours',
    group: 'Stars',
    title: 'Star colours and temperature',
    summary: 'Why Betelgeuse is orange and Rigel blue-white, and what the colours tell us.',
    lede: 'Look carefully at Orion on a winter night and its two brightest stars are different colours: Betelgeuse, at the top left, is orange; Rigel, at the bottom right, is blue-white. The colour of a star is a thermometer. Cooler stars glow red and orange, hotter ones white and blue.',
    blocks: [
      { kind: 'try', label: 'Betelgeuse and Rigel', note: 'Orion on a January evening from Toronto. Compare the two corners.', scene: sky({ time: { jd: ORION_NIGHT }, site: TORONTO, camera: { look: 'con:western:Ori', fov: 40 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } }) },
      { kind: 'text', title: 'Hot things glow', paragraphs: [
        'Anything hot enough glows, and the hotter it is the bluer its light. An electric heater element glows dull red at about 1,000 K; a filament bulb shines yellowish-white at about 2,800 K. Stars follow the same rule. Betelgeuse\'s surface is about 3,600 K and peaks in the infrared, so its visible light is orange-red. The Sun at 5,800 K peaks in green-yellow light but gives out all colours, which together look white. Rigel at about 12,000 K pours out blue and ultraviolet.',
        'To the eye the colours are subtle, because our colour vision barely works in dim light. They show best in the brightest stars: Antares and Aldebaran are clearly orange, Vega and Sirius blue-white. Defocusing a pair of binoculars slightly spreads a star\'s light into a disc and makes its colour easier to see.',
      ] },
      { kind: 'text', title: 'O B A F G K M', paragraphs: [
        'Around 1900 astronomers at Harvard sorted hundreds of thousands of stars by the dark lines in their spectra, the fingerprints of the elements in their atmospheres. Annie Jump Cannon put the classes in temperature order: O, B, A, F, G, K and M, from hottest to coolest, and generations of students have remembered it with "Oh Be A Fine Girl, Kiss Me". Each class is split into ten, so the Sun is G2, Rigel B8 and Betelgeuse M1.',
        'In 1925 Cecilia Payne showed what the spectra meant: the differences were mainly temperature, not composition, and almost every star is made overwhelmingly of hydrogen and helium. It overturned the belief that stars were made of much the same stuff as the Earth.',
      ] },
      { kind: 'text', title: 'Colour, brightness and the life of a star', paragraphs: [
        'Plot stars by colour and true brightness, as Ejnar Hertzsprung and Henry Norris Russell did around 1910, and they do not scatter at random. Most fall along a diagonal band, the main sequence: stars burning hydrogen in their cores, from dim red dwarfs to blazing blue giants, sorted by mass. Above it sit the red giants and supergiants, stars that have used up their core hydrogen and swollen; below it the white dwarfs, the cooling cores of dead stars.',
        'So a star\'s colour together with its brightness says roughly how massive it is and where it is in its life. Betelgeuse is a red supergiant near the end of a short, extravagant life and will explode as a supernova, perhaps within the next hundred thousand years. Rigel is a younger blue supergiant on its way to the same fate. Open the Star lab from either star\'s card to watch its life play out.',
      ] },
      { kind: 'text', title: "Why there are no green stars", paragraphs: [
        "A star whose light peaks in green, like the Sun, also gives out plenty of red and blue, and the mixture looks white to our eyes. To look green, a star would have to give out green light alone, and a hot glowing body cannot do that. So stars run from red through orange, yellow and white to blue, and never green or purple.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Which star is hottest at its surface?', options: ['A red star', 'A yellow star like the Sun', 'A blue-white star'], answer: 2, explain: 'The blue-white star. Colour runs from red (coolest) to blue (hottest).' } },
    ],
    related: [BETELGEUSE, RIGEL, 'sun', 'star:80763', 'star:21421'],
  },
  {
    id: 'proper-motion',
    group: 'Stars',
    title: 'The stars are moving',
    summary: 'Why the constellations slowly change shape, and the Big Dipper will come apart.',
    lede: 'The "fixed stars" are not fixed. Every star is moving through space, most at tens of kilometres per second, but they are so far away that their motion across our sky is tiny: a few seconds of arc a century for most bright stars. Over tens of thousands of years, though, it adds up, and the constellations change shape.',
    blocks: [
      { kind: 'text', title: 'Halley\'s discovery', paragraphs: [
        'In 1718 Edmond Halley compared his own star positions with those recorded by Ptolemy fifteen centuries before. Most agreed, but Sirius, Arcturus and Aldebaran had shifted by more than the width of the full Moon. Stars had their own motions, which we now call proper motion.',
        'The fastest is Barnard\'s Star, a faint red dwarf six light years away, which crosses the width of the full Moon in about 180 years. Arcturus, among the bright stars, moves about a Moon-width every 800 years, because it is passing through our part of the galaxy on a steep orbit of its own.',
      ] },
      { kind: 'try', label: 'The Big Dipper today', note: 'Looking north on a spring night. Seven stars make the Dipper, part of the Great Bear.', scene: sky({ time: { jd: DIPPER_NOW }, site: STONEHENGE, camera: { look: 'con:western:UMa', fov: 55 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, starLabels: true }, highlight: ['con:western:UMa'] }) },
      { kind: 'try', label: 'The Big Dipper in AD 52,000', note: 'Fifty thousand years on. The two end stars have gone their own way.', scene: sky({ time: { jd: DIPPER_LATER }, site: STONEHENGE, camera: { look: 'con:western:UMa', fov: 55 }, layers: { ...PLAIN_LAYERS, atmosphere: false, ground: false, lines: true, starLabels: true }, highlight: ['con:western:UMa'] }) },
      { kind: 'text', title: 'A family of stars', paragraphs: [
        'Five of the Dipper\'s seven stars, from Merak to Mizar, travel together through space. They are the core of the Ursa Major moving group, about 80 light years away, born in the same cloud some 400 million years ago and still drifting the same way. The other two, Dubhe at the lip of the bowl and Alkaid at the tip of the handle, are unrelated stars passing through in other directions. Over tens of thousands of years the bowl opens and the handle bends.',
        'Many constellations hold groups like this. The Hyades in Taurus, the Pleiades and most of the bright stars of Scorpius are families born together. Most other constellations are chance alignments of stars at very different distances.',
      ] },
      { kind: 'text', title: 'Watch it yourself', paragraphs: [
        'The app moves every star in its catalogue along its measured path through space, so you can open Place and time, choose any year from 98,000 BC to AD 102,000, and see how the sky looked or will look. Constellations that seem eternal turn out to be a snapshot of a slow dance.',
      ] },
      { kind: 'text', title: "Toward us and away", paragraphs: [
        "Proper motion is only the sideways part of a star's movement. The part along our line of sight shows up as a Doppler shift in its spectrum: its lines move slightly toward the blue if it is coming closer and toward the red if it is moving away. Together they give a star's full path through space.",
        "The Sun is moving too, about 20 km/s relative to the stars around it, toward a point in Hercules not far from Vega, and the whole neighbourhood goes round the centre of the Milky Way at about 230 km/s, once every 230 million years or so. The nearest stars change over time: Alpha Centauri is approaching and will be closest, a little over three light years away, in about 28,000 years. Barnard's Star will pass within about 3.8 light years in about 10,000 years.",
        "Halley needed fifteen centuries of records to see proper motion by eye. The Hipparcos satellite, launched by ESA in 1989, measured it for over a hundred thousand stars, and its successor Gaia has measured it for nearly two billion, precisely enough to trace stars back to the clusters they were born in.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Why do most constellations look the same as they did to the ancient Greeks?', options: ['Stars do not move', 'Stars move, but are so far away that a few thousand years makes little difference', 'The constellations are redrawn every century'], answer: 1, explain: 'They move, but slowly against their great distances. It takes tens of thousands of years to change a pattern noticeably.' } },
    ],
    related: ['con:western:UMa', 'star:69673', 'dso:M45', 'star:54061'],
  },

  // ---------------------------------------------------------------- deep time
  {
    id: 'precession',
    group: 'Deep time',
    title: 'Precession and the wandering pole',
    summary: 'The North Star has not always been the north star.',
    lede: 'Polaris has not always marked north, and it will not forever. The Earth\'s axis slowly swings round in a circle, like the axis of a spinning top, taking about 26,000 years to go once round. As it swings, the celestial pole moves among the stars, and different stars take turns as the pole star.',
    blocks: [
      { kind: 'try', label: 'The pole today', note: 'Giza on a spring evening. The grid lines meet at the pole, less than a degree from Polaris.', scene: sky({ time: { jd: jdFromCalendar(2026, 3, 21, 19, 0) }, site: GIZA, camera: { look: POLARIS, fov: 55 }, layers: POLE_LAYERS, highlight: [POLARIS] }) },
      { kind: 'text', title: 'A spinning top', paragraphs: [
        'The Earth bulges at its equator. The Moon and Sun pull on that bulge, trying to straighten the tilted Earth upright, and the spinning Earth responds the way a gyroscope does: instead of straightening, its axis swings slowly round. It keeps its tilt of about 23.4° but points in a slowly changing direction, tracing a big circle on the sky about 47° across, around the pole of the ecliptic in Draco.',
        'One trip round takes about 25,800 years. It is slow, 50 seconds of arc a year, but steady, and easy to detect over centuries.',
      ] },
      { kind: 'try', label: 'The pole in 2800 BC', note: 'Giza, as the Great Pyramid is about to be built. The pole lies near Thuban, in Draco.', scene: sky({ time: { jd: jdFromCalendar(-2799, 3, 21, 19, 0) }, site: GIZA, camera: { look: { az: 0, alt: 30 }, fov: 60 }, layers: POLE_LAYERS, highlight: [THUBAN] }) },
      { kind: 'text', title: 'Pole stars through history', paragraphs: [
        'Around 2800 BC the pole lay near Thuban, a modest star in Draco, and the builders of the Great Pyramid aligned shafts toward the northern sky around it. Over the following millennia the pole drifted toward the Little Bear. In Greek times there was no good pole star at all; Polaris was 12° away. It has crept closer ever since and will be nearest, less than half a degree from the pole, around 2100.',
        'Then the pole moves on, through Cepheus, toward Deneb around AD 9,000, and reaches Vega, one of the brightest stars in the sky, around AD 14,000. Vega was also the pole star around 12,000 BC.',
      ] },
      { kind: 'try', label: 'The pole in AD 14,000', note: 'The pole has drifted to the neighbourhood of brilliant Vega.', scene: sky({ time: { jd: jdFromCalendar(14000, 3, 21, 19, 0) }, site: GIZA, camera: { look: { az: 0, alt: 32 }, fov: 70 }, layers: POLE_LAYERS, highlight: [VEGA] }) },
      { kind: 'text', title: 'Hipparchus and the zodiac', paragraphs: [
        'Hipparchus found precession around 130 BC by comparing his own measurements of Spica with records made about 150 years earlier: the star\'s position, measured from the point where the Sun crosses the equator in spring, had shifted by about two degrees.',
        'That point, the March equinox, slides westward through the zodiac with precession. When the zodiac signs were named, about 2,000 years ago, the Sun at the March equinox was in the constellation Aries. Now it is in Pisces, and around 2600 it will reach Aquarius: the "dawning of the Age of Aquarius". The astrological signs stayed fixed to the equinox, so they no longer match the constellations they are named after.',
        'Precession also explains why our calendar is tied to the seasons rather than the stars: the tropical year, equinox to equinox, is about 20 minutes shorter than the time the Earth takes to go round once relative to the stars.',
      ] },
      { kind: 'text', title: "Smaller wobbles and ice ages", paragraphs: [
        "On top of the great 26,000-year circle, the pole makes a small nod every 18.6 years, a few seconds of arc across, because the Moon's tilted orbit itself swings round in that time. James Bradley discovered this nutation in 1748 after twenty years of careful measurements.",
        "Precession, together with slow changes in the tilt of the Earth's axis and in the shape of its orbit, shifts how much sunlight each hemisphere gets in each season over tens of thousands of years. Milutin Milankovi\u0107 calculated these cycles in the early 1900s, and they have since been found written in ocean sediments and ice cores: they pace the comings and goings of the ice ages.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Thuban marked the pole around 2800 BC and Vega will be near it around AD 14,000, almost opposite on the circle. About how long does a full circle take?', options: ['2,600 years', '26,000 years', '260,000 years'], answer: 1, explain: 'About 26,000 years.' } },
    ],
    related: [POLARIS, THUBAN, VEGA, 'con:western:Dra', 'con:western:UMi'],
  },

  // ---------------------------------------------------------------- people and the sky
  {
    id: 'latitude',
    group: 'People and the sky',
    title: 'Finding your latitude from the stars',
    summary: 'The height of the pole is your latitude: how sailors knew how far north they were.',
    lede: 'One fact let sailors cross oceans for centuries: the height of the celestial pole above the horizon equals your latitude. At the North Pole the pole is overhead, 90° up; on the equator it sits on the horizon; halfway between, at 45° north, it stands halfway up the sky.',
    blocks: [
      { kind: 'text', title: 'Why it works', paragraphs: [
        'The celestial pole is the direction of the Earth\'s axis. The stars are so far away that the axis points at the same spot in the sky from anywhere on Earth. As you walk north, the ground curves under you and your horizon tilts, and the pole climbs by exactly one degree for every degree of latitude you cover, about 111 km.',
        'In the north, Polaris sits within a degree of the pole, so measuring its height gives your latitude to about a degree. Arab and Portuguese navigators did this with a kamal, a knotted cord and a wooden board, and later with quadrants and astrolabes; from the 1730s the sextant made it far more precise.',
      ] },
      { kind: 'try', label: 'Polaris from the mid-Atlantic', note: 'Night at sea at 36.5° north. Tap Polaris and read its altitude from the card.', scene: sky({ time: { jd: jdFromCalendar(2026, 11, 16, 23, 0) }, site: AT_SEA, camera: { look: { az: 0, alt: 30 }, fov: 80 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true } }) },
      { kind: 'question', task: { kind: 'number', prompt: 'What is the latitude, to the nearest degree?', answer: AT_SEA.lat, tolerance: 1.5, unit: '° north', explain: 'About 36.5° north, level with the Strait of Gibraltar.' } },
      { kind: 'text', title: 'Finding Polaris', paragraphs: [
        'Polaris is not especially bright, magnitude 2, and many people expect it to be the brightest star in the sky. The way to find it is the Big Dipper: follow the two stars at the end of the bowl, Merak and Dubhe, upward about five times the gap between them. Polaris is the end of the handle of the Little Dipper.',
      ] },
      { kind: 'text', title: 'No pole star in the south', paragraphs: [
        'The south celestial pole has no bright star. Navigators in the southern ocean used the Southern Cross: follow its long axis from the top star down through Acrux at the foot, about four and a half times the Cross\'s length, and you reach the pole. The two bright Pointers, Alpha and Beta Centauri, help confirm it.',
      ] },
      { kind: 'try', label: 'The Southern Cross at sea', note: 'The southern ocean at 34° south. The grid shows the pole the Cross points to.', scene: sky({ time: { jd: jdFromCalendar(2026, 5, 15, 19, 0) }, site: SOUTHERN_OCEAN, camera: { look: { az: 180, alt: 35 }, fov: 80 }, layers: { ...PLAIN_LAYERS, lines: true, starLabels: true, gridEquatorial: true }, highlight: ['con:western:Cru'], select: ACRUX }) },
      { kind: 'text', title: 'Latitude is the easy half', paragraphs: [
        'Latitude came from the pole alone. Longitude, how far east or west, was much harder, because the sky turns: the same star stands at the same height at different longitudes a few minutes apart. Finding longitude needed an accurate clock, and the problem was only solved in the 1760s with John Harrison\'s marine chronometers and Nevil Maskelyne\'s lunar tables. The next concept shows how two stars and a clock give both.',
      ] },
      { kind: 'text', title: "Close, but not on the pole", paragraphs: [
        "Polaris is not exactly at the pole. Today it lies about two thirds of a degree away and circles the pole once a day, so its height changes slightly through the night. Navigators corrected for this with a table in the almanac, and the corrected height of Polaris gave latitude to a few kilometres.",
        "By day, the same idea works with the Sun. At local noon the Sun crosses the meridian at its highest point; measure that height, look up how far north or south of the celestial equator the Sun is that day, and the latitude follows. Sailors called it \"shooting the Sun\" and did it every day at noon.",
        "Latitude alone was enough for one simple strategy. Viking and later Portuguese and Spanish sailors would head north or south until they reached the latitude of their destination, then turn and sail due east or west along it, keeping the pole star at the same height every night until land came in sight.",
      ] },
    ],
    related: [POLARIS, ACRUX, 'con:western:UMi', 'con:western:Cru'],
  },
  {
    id: 'navigation',
    group: 'People and the sky',
    title: 'Celestial navigation',
    summary: 'Two stars, a clock and a chart: how navigators fixed a ship\'s position for two hundred years.',
    lede: 'Before satellites, a ship in mid-ocean found its position from the stars. At dusk a navigator measured the heights of two or three stars with a sextant, noted the exact time, and in half an hour of arithmetic drew lines on the chart that crossed where the ship was. It was good to a few kilometres.',
    blocks: [
      { kind: 'try', label: 'Dusk in the North Atlantic', note: 'Vega high in the west, Fomalhaut low in the south. Tap each to read its altitude.', scene: NAV_SCENE },
      { kind: 'text', title: 'Circles of position', paragraphs: [
        'At any instant every star is straight overhead somewhere on the Earth, its ground point. The nautical almanac gives where, for every hour of the year. If you see the star at an altitude of 50°, you are 40° (about 4,400 km) from its ground point, somewhere on a circle around it. A second star gives a second circle. You are on both, so you are where they cross.',
        'The circles are huge, so navigators drew only the short stretch near their estimated position, a straight "line of position". A third star made a small triangle; the ship was inside it.',
      ] },
      { kind: 'question', task: { kind: 'number', prompt: 'How high is Vega at this moment, in degrees?', answer: altOf(VEGA), tolerance: 1, unit: '°', hint: 'Tap Vega and read its altitude on the card.', explain: 'Right. That altitude puts the ship on a circle about 90° minus that from Vega\'s ground point.' }, scene: NAV_SCENE },
      { kind: 'plot', plot: { kind: 'star-fix', stars: [VEGA, FOMALHAUT] }, caption: 'The chart on the navigator\'s table, with the two circles of position drawn from the stars\' altitudes and the time.', task: { kind: 'plot', prompt: 'Tap where the two circles cross.', tolerance: 0.8, hint: 'Not on the crossing yet. Follow both curves to where they meet.', explain: 'That is the ship: a fix good to a few nautical miles, from two stars and a clock.' }, scene: NAV_SCENE },
      { kind: 'text', title: 'Why the clock matters', paragraphs: [
        'The sky turns 15° an hour, so a star\'s ground point races westward at up to 1,670 km/h. An error of one minute in the time puts the fix about 28 km out at the equator. Before reliable clocks, navigators could find latitude but had to guess longitude from their speed and heading, and ships were wrecked by the thousands. After a disaster in 1707 that sank four British warships off the Scilly Isles, Parliament offered a prize for a solution; John Harrison\'s marine chronometer, finished in 1759, eventually won it.',
        'Two circles cross in two places, but the second crossing is usually thousands of kilometres away, and the ship knows roughly where it is from its course and speed. Celestial navigation is still taught to naval officers, in case satellite navigation fails.',
      ] },
      { kind: 'text', title: "The sextant and twilight", paragraphs: [
        "A sextant measures the angle between a star and the horizon. Looking through it, the navigator sees the horizon straight ahead and, in a mirror, an image of the star, then moves an arm until the star sits on the horizon line and reads the angle from a scale, to a tenth of a minute of arc. The design goes back to John Hadley's octant of 1731.",
        "A star sight needs both the star and a clear horizon at once, and that only happens in twilight. Nautical twilight, when the Sun is between 6\u00b0 and 12\u00b0 below the horizon, is named for exactly this: the brightest stars are out and the horizon is still sharp. Navigators took their sights at dawn and dusk and worked by dead reckoning in between.",
        "The method of drawing short lines of position near an estimated position was perfected by the French naval officer Marcq Saint-Hilaire in 1875. The same idea guided the Apollo astronauts, who carried a sextant to check their position against the stars, and still steers spacecraft today, whose star trackers recognise patterns of stars to know which way they are pointing.",
        "Celestial navigation never stopped being useful. Satellite signals can fail or be jammed, so navies still train officers to take star sights, and long-distance sailors carry a sextant as a backup.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'How does the navigator know which of the two crossings is right?', options: ['They cannot tell', 'The other one is far from anywhere the ship could be', 'The other one is always on land'], answer: 1, explain: 'A ship knows roughly where it is from course and speed, so the far crossing is easy to rule out.' } },
    ],
    related: [VEGA, FOMALHAUT, POLARIS],
  },
  {
    id: 'eratosthenes',
    group: 'People and the sky',
    title: 'Eratosthenes measures the Earth',
    summary: 'Around 240 BC, the size of the world from shadows in two cities.',
    lede: 'Around 240 BC Eratosthenes, librarian of the great library of Alexandria, measured the size of the Earth with nothing but shadows, a known distance and geometry. His answer was within a few percent of the truth.',
    blocks: [
      { kind: 'text', title: 'A well at Syene', paragraphs: [
        'Eratosthenes had read that at Syene, modern Aswan on the Nile in southern Egypt, the Sun at noon on the summer solstice shone straight down a deep well and upright posts cast no shadow. Syene sits almost exactly on the Tropic of Cancer, so on that day the noon Sun stands directly overhead.',
      ] },
      { kind: 'try', label: 'Noon at Syene, solstice of 240 BC', note: 'The Sun almost at the very top of the sky. Tap it and read its altitude.', scene: sky({ time: { jd: ERATOSTHENES_NOON }, site: SYENE, camera: { look: 'sun', fov: 100 }, layers: { ...PLAIN_LAYERS, gridAltAz: true }, select: 'sun' }) },
      { kind: 'text', title: 'The same moment in Alexandria', paragraphs: [
        'At noon on the same day in Alexandria, about 5,000 stadia to the north, a post did cast a shadow. Eratosthenes measured the angle of the Sun from overhead with a gnomon in a bowl-shaped sundial, the skaphe: one fiftieth of a full circle, 7.2°.',
      ] },
      { kind: 'try', label: 'The same moment in Alexandria', note: 'The Sun is no longer overhead. How far from the top is it?', scene: ALEX_SCENE },
      { kind: 'question', task: { kind: 'number', prompt: 'How many degrees from overhead is the Sun in Alexandria?', answer: sunFromOverhead, tolerance: 0.7, unit: '°', hint: 'Subtract the Sun\'s altitude from 90°.', explain: 'Close to 8°. Eratosthenes measured 7.2°; Alexandria is not quite due north of Syene, which he did not know.' }, scene: ALEX_SCENE },
      { kind: 'text', title: 'The geometry', paragraphs: [
        'The Sun is so far away that its rays reach both cities parallel. So the difference in the Sun\'s angle between the two places is the same as the angle between them measured at the centre of the Earth. If 5,000 stadia covers one fiftieth of the circle, the whole circumference is 50 × 5,000 = 250,000 stadia.',
        'How good that was depends on the length of a stadion, which varied from city to city. With the Egyptian stadion of about 157.5 m it comes to 39,375 km, astonishingly close to the true 40,008 km around the poles. With the Attic stadion of about 185 m it is about 46,000 km, 15% too large. Either way, his method was sound, and it showed the Earth was vast: the known world of the Greeks covered only a small part of it.',
      ] },
      { kind: 'question', task: { kind: 'number', prompt: 'With 7.2° and 800 km between the cities, how far is it around the Earth, in km?', answer: 40000, tolerance: 3500, unit: 'km', hint: 'Multiply 800 km by 360 ÷ 7.2.', explain: 'About 40,000 km.' } },
      { kind: 'text', title: 'Try it at home', paragraphs: [
        'Schools around the world repeat the measurement every equinox, pairing up with a school hundreds of kilometres north or south. Each measures the length of a vertical stick\'s shadow at local noon; the difference in the Sun\'s angle and the distance between them give the size of the Earth.',
      ] },
      { kind: 'text', title: "Who was Eratosthenes?", paragraphs: [
        "Eratosthenes was born around 276 BC in Cyrene, in what is now Libya, and became head of the Library of Alexandria. He worked in so many fields that rivals nicknamed him Beta, second best at everything. He drew one of the first maps of the known world with lines of latitude and longitude, coined the word geography, devised the sieve of Eratosthenes for finding prime numbers, and also measured the tilt of the Earth's axis.",
        "The distance between the cities was probably known from royal surveyors who paced out roads, or from the travel times of camel caravans, and his figure of 5,000 stadia looks rounded. Syene is also about 3\u00b0 east of Alexandria, not due south. The errors partly cancelled. Later, Posidonius tried the same idea with the height of the star Canopus and got a much smaller Earth, and it was a small Earth that encouraged Columbus to think Asia lay a short sail west of Spain.",
        "His answer also gave the first real sense of scale for the Moon and Sun. Once the size of the Earth was known, Greek astronomers such as Hipparchus could turn the geometry of eclipses into distances, and found the Moon about 60 Earth radii away, very close to the truth.",
      ] },
    ],
    related: ['sun'],
  },
  {
    id: 'sky-cultures',
    group: 'People and the sky',
    title: 'One sky, many stories',
    summary: 'The same stars, drawn into different pictures all over the world.',
    lede: 'The constellations are not in the sky. People everywhere have joined the same stars into their own pictures, for their own reasons: to keep a calendar, to steer a canoe, to remember a story. The 88 official constellations come mostly from ancient Mesopotamia and Greece, but they are only one sky among many.',
    blocks: [
      { kind: 'try', label: 'The scorpion', note: 'A July evening in Hawaiʻi. Scorpius curls across the south, with red Antares at its heart.', scene: sky({ time: { jd: jdFromLocal(HILO, 2026, 7, 15, 21, 30) }, site: HILO, culture: 'western', camera: { look: ANTARES, fov: 60 }, layers: { ...PLAIN_LAYERS, lines: true, constellationLabels: true, starLabels: true }, highlight: ['con:western:Sco'] }) },
      { kind: 'text', title: 'Maui\'s fishhook', paragraphs: [
        'To Hawaiian navigators the scorpion\'s curved tail is Manaiakalani, the fishhook the demigod Maui used to haul islands up from the sea. It belongs to one of the great star lines Polynesian voyagers steered by, crossing thousands of kilometres of open Pacific to settle Hawaiʻi, Aotearoa New Zealand and Rapa Nui. Navigators memorised the points on the horizon where hundreds of stars rose and set, a star compass carried in the head.',
      ] },
      { kind: 'try', label: 'The same stars as a fishhook', note: 'Switch to the Hawaiian star lines: the tail of the scorpion becomes Maui\'s hook.', scene: { culture: 'hawaiian_starlines', camera: { look: ANTARES, fov: 60 }, highlight: ['con:hawaiian_starlines:MAN'] } },
      { kind: 'text', title: 'Patterns with purposes', paragraphs: [
        'In China, astronomers divided the sky into 283 small asterisms organised like an empire, with the emperor near the pole and officials, palaces and markets around him; the Moon\'s path was marked by 28 lunar mansions. In India the same band was divided into 27 nakshatras. The Boorong people of north-west Victoria in Australia saw the dark lanes of the Milky Way, not just the bright stars, as figures: the Emu in the Sky stretches from the Southern Cross along the dust clouds, and its position through the year signalled when emus were laying eggs.',
        'The Western constellations themselves are a patchwork. The zodiac figures go back to Babylon over 3,000 years ago; Ptolemy listed 48 constellations around AD 150; European navigators filled in the southern sky in the 1500s and 1600s; and in 1922 the International Astronomical Union fixed the list at 88 and later drew official borders between them.',
      ] },
      { kind: 'text', title: 'See them all', paragraphs: [
        'Firmament includes 16 sky cultures from the Stellarium project, from Norse and Sámi to Tukano and Māori. Each has its own entry under Sky cultures in the Atlas, with a button to draw its figures on the sky.',
      ] },
      { kind: 'text', title: "Calendars in the stars", paragraphs: [
        "Many cultures watched for the first morning a star or cluster became visible again before dawn, its heliacal rising. In ancient Egypt the heliacal rising of Sirius came just before the yearly Nile flood and marked the new year. In Aotearoa New Zealand the Pleiades, Matariki, rise before dawn in midwinter, in June or July, and their return marks the M\u0101ori new year, now a public holiday. In Hawai\u02bbi the Pleiades, Makali\u02bbi, rising at sunset in November opened Makahiki, the season of harvest and peace.",
        "In ancient Greece the farmer-poet Hesiod advised starting the harvest when the Pleiades rise at dawn and ploughing when they set. Across cultures the Pleiades are among the most widely named star groups on Earth, and often seen as seven sisters, though most people can see only six.",
        "In the Andes the Inca also read figures in the Milky Way's dark clouds: Yacana, the llama, has Alpha and Beta Centauri as its eyes, and its appearance marked times in the farming year.",
        "Stellarium, the free planetarium program, gathers these sky cultures with the help of researchers and members of the communities themselves, which is where this app's figures and stories come from.",
      ] },
      { kind: 'question', task: { kind: 'choice', prompt: 'Which stars does Maui\'s fishhook share with the scorpion?', options: ['None: it is in another part of the sky', 'Antares and the curve of the tail', 'Only the claws'], answer: 1, explain: 'The same hook of stars, with a different story attached.' } },
    ],
    related: ['culture:hawaiian_starlines', 'culture:chinese', 'culture:boorong', 'con:western:Sco', ANTARES],
  },
];

export function findConcept(id: string): Concept | undefined {
  return CONCEPTS.find((c) => c.id === id);
}

/** Every scene a concept's Try it buttons apply, in order. */
export function conceptScenes(c: Concept): Scene[] {
  return c.blocks.flatMap((b) => (b.kind === 'try' ? [b.scene] : []));
}
