// Real places and moments the concepts take you to. Every one is checked
// against the simulation in concepts.test.ts.

import { DEG } from '../astro/math.ts';
import { jdFromCalendar } from '../astro/time.ts';
import { jdFromLocal } from '../sim/format.ts';
import type { Site, Universe } from '../sim/universe.ts';
import { marsTrack } from '../learn/orbits.ts';

export const site = (name: string, lat: number, lon: number, tz = '', country?: string): Site => ({ name, country, lat, lon, height: 0, tz });

export const POLARIS = 'star:11767';
export const THUBAN = 'star:68756';
export const VEGA = 'star:91262';
export const ACRUX = 'star:60718';
export const ANTARES = 'star:80763';
export const FOMALHAUT = 'star:113368';
export const DUBHE = 'star:54061';
export const ALKAID = 'star:67301';
export const MERAK = 'star:53910';

export const GIZA = site('Giza', 29.98, 31.13, 'Africa/Cairo', 'Egypt');
export const AT_SEA = site('Somewhere in the Atlantic', 36.5, -25);
export const SOUTHERN_OCEAN = site('Somewhere in the southern ocean', -34, 18);
export const SYENE = site('Syene (Aswan)', 24.09, 32.9, 'Africa/Cairo', 'Egypt');
export const ALEXANDRIA = site('Alexandria', 31.2, 29.92, 'Africa/Cairo', 'Egypt');
export const PADUA = site('Padua', 45.41, 11.88, 'Europe/Rome', 'Italy');
export const HILO = site('Hilo', 19.72, -155.08, 'Pacific/Honolulu', 'United States');
export const PRAGUE = site('Prague', 50.09, 14.42, 'Europe/Prague', 'Czechia');
export const SHIP = site('Somewhere in the North Atlantic', 40, -35);
export const STONEHENGE = site('Stonehenge', 51.1789, -1.8262, 'Europe/London', 'United Kingdom');
export const CAPE_CANAVERAL = site('Cape Canaveral', 28.39, -80.6, 'America/New_York', 'United States');

export const POLE_LAYERS = { gridEquatorial: true, atmosphere: false, lines: true, constellationLabels: true, starLabels: true };
export const PLAIN_LAYERS = { gridEquatorial: false, gridAltAz: false, atmosphere: true, ground: true };

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
export const altOf = (ref: string) => (u: Universe): number => u.horizontal(u.resolve(ref)!.dir).altApparent / DEG;
export const farthestMars = (u: Universe): number =>
  Math.max(...marsTrack(u.eph, KEPLER_TRACK.jd0, KEPLER_TRACK.count).map((f) => Math.hypot(f.mars[0], f.mars[1])));

export const sunFromOverhead = (u: Universe): number => 90 - u.horizontal(u.bodies.get('sun')!.dir).altApparent / DEG;

export const TORONTO = site('Toronto', 43.653, -79.383, 'America/Toronto', 'Canada');
export const DALLAS = site('Dallas', 32.78, -96.8, 'America/Chicago', 'United States');
/** Mid-totality of the lunar eclipse of 14 March 2025 (UT), seen from Toronto. */
export const LUNAR_ECLIPSE_2025 = jdFromCalendar(2025, 3, 14, 6, 59);
/** Mid-totality of the solar eclipse of 8 April 2024 over Dallas (UT; 13:42 local). */
export const SOLAR_ECLIPSE_2024 = jdFromCalendar(2024, 4, 8, 18, 42, 40);
/** Mars before, at and after its opposition of 19 February 2027 (UT, evenings in Toronto). */
export const MARS_LOOP = [jdFromCalendar(2026, 12, 1, 10, 0), jdFromCalendar(2027, 2, 19, 4, 0), jdFromCalendar(2027, 5, 1, 2, 0)];
/** A January evening in Toronto with Orion well up. */
export const ORION_NIGHT = jdFromCalendar(2027, 1, 20, 3, 0);
/** Solar noon in Toronto at the two solstices of 2026 (UT). */
export const NOON_JUNE = jdFromCalendar(2026, 6, 21, 17, 20);
export const NOON_DECEMBER = jdFromCalendar(2026, 12, 21, 17, 13);
export const BETELGEUSE = 'star:27989';
export const RIGEL = 'star:24436';
