// Places the observer can pick without typing coordinates. Coordinates are
// city centres, rounded; time zones are IANA names for Intl.

export interface Place {
  name: string;
  country: string;
  lat: number; // degrees
  lon: number; // degrees, east positive
  tz: string;
  height?: number; // metres
}

const p = (name: string, country: string, lat: number, lon: number, tz: string, height = 0): Place =>
  ({ name, country, lat, lon, tz, height });

export const PLACES: Place[] = [
  // North America
  p('Toronto', 'Canada', 43.653, -79.383, 'America/Toronto', 76),
  p('Montréal', 'Canada', 45.502, -73.567, 'America/Toronto', 30),
  p('Ottawa', 'Canada', 45.421, -75.697, 'America/Toronto', 70),
  p('Vancouver', 'Canada', 49.283, -123.121, 'America/Vancouver', 10),
  p('Calgary', 'Canada', 51.045, -114.057, 'America/Edmonton', 1045),
  p('Halifax', 'Canada', 44.649, -63.575, 'America/Halifax', 20),
  p('Winnipeg', 'Canada', 49.895, -97.138, 'America/Winnipeg', 239),
  p("St. John's", 'Canada', 47.561, -52.713, 'America/St_Johns', 60),
  p('Yellowknife', 'Canada', 62.454, -114.372, 'America/Edmonton', 206),
  p('Iqaluit', 'Canada', 63.749, -68.522, 'America/Iqaluit', 30),
  p('New York', 'USA', 40.713, -74.006, 'America/New_York', 10),
  p('Boston', 'USA', 42.360, -71.059, 'America/New_York', 10),
  p('Washington, D.C.', 'USA', 38.907, -77.037, 'America/New_York', 20),
  p('Chicago', 'USA', 41.878, -87.630, 'America/Chicago', 180),
  p('Dallas', 'USA', 32.777, -96.797, 'America/Chicago', 140),
  p('Denver', 'USA', 39.739, -104.990, 'America/Denver', 1609),
  p('Phoenix', 'USA', 33.448, -112.074, 'America/Phoenix', 331),
  p('Los Angeles', 'USA', 34.052, -118.244, 'America/Los_Angeles', 90),
  p('San Francisco', 'USA', 37.775, -122.419, 'America/Los_Angeles', 16),
  p('Seattle', 'USA', 47.606, -122.332, 'America/Los_Angeles', 50),
  p('Miami', 'USA', 25.762, -80.192, 'America/New_York', 2),
  p('Anchorage', 'USA', 61.218, -149.900, 'America/Anchorage', 30),
  p('Honolulu', 'USA', 21.307, -157.858, 'Pacific/Honolulu', 5),
  p('Mauna Kea Observatories', 'USA', 19.821, -155.468, 'Pacific/Honolulu', 4205),
  p('Flagstaff', 'USA', 35.198, -111.651, 'America/Phoenix', 2106),
  p('Mexico City', 'Mexico', 19.433, -99.133, 'America/Mexico_City', 2240),
  p('Havana', 'Cuba', 23.113, -82.366, 'America/Havana', 59),
  // South America
  p('São Paulo', 'Brazil', -23.551, -46.633, 'America/Sao_Paulo', 760),
  p('Rio de Janeiro', 'Brazil', -22.907, -43.173, 'America/Sao_Paulo', 5),
  p('Buenos Aires', 'Argentina', -34.604, -58.382, 'America/Argentina/Buenos_Aires', 25),
  p('Santiago', 'Chile', -33.449, -70.669, 'America/Santiago', 570),
  p('Atacama Desert (ALMA)', 'Chile', -23.029, -67.755, 'America/Santiago', 5058),
  p('Lima', 'Peru', -12.046, -77.043, 'America/Lima', 154),
  p('Cusco', 'Peru', -13.532, -71.967, 'America/Lima', 3399),
  p('Bogotá', 'Colombia', 4.711, -74.072, 'America/Bogota', 2640),
  p('Quito', 'Ecuador', -0.180, -78.468, 'America/Guayaquil', 2850),
  p('Ushuaia', 'Argentina', -54.801, -68.303, 'America/Argentina/Ushuaia', 20),
  // Europe
  p('London', 'UK', 51.507, -0.128, 'Europe/London', 11),
  p('Greenwich', 'UK', 51.477, 0.0, 'Europe/London', 47),
  p('Edinburgh', 'UK', 55.953, -3.188, 'Europe/London', 47),
  p('Dublin', 'Ireland', 53.350, -6.260, 'Europe/Dublin', 20),
  p('Paris', 'France', 48.857, 2.352, 'Europe/Paris', 35),
  p('Madrid', 'Spain', 40.417, -3.704, 'Europe/Madrid', 667),
  p('Lisbon', 'Portugal', 38.722, -9.139, 'Europe/Lisbon', 50),
  p('La Palma (Roque de los Muchachos)', 'Spain', 28.756, -17.892, 'Atlantic/Canary', 2396),
  p('Rome', 'Italy', 41.903, 12.496, 'Europe/Rome', 21),
  p('Padua', 'Italy', 45.406, 11.877, 'Europe/Rome', 12),
  p('Florence', 'Italy', 43.770, 11.256, 'Europe/Rome', 50),
  p('Berlin', 'Germany', 52.520, 13.405, 'Europe/Berlin', 34),
  p('Prague', 'Czechia', 50.076, 14.438, 'Europe/Prague', 235),
  p('Vienna', 'Austria', 48.208, 16.374, 'Europe/Vienna', 190),
  p('Amsterdam', 'Netherlands', 52.368, 4.904, 'Europe/Amsterdam', 0),
  p('Copenhagen', 'Denmark', 55.676, 12.568, 'Europe/Copenhagen', 14),
  p('Hven (Uraniborg)', 'Sweden', 55.908, 12.696, 'Europe/Stockholm', 40),
  p('Stockholm', 'Sweden', 59.329, 18.069, 'Europe/Stockholm', 28),
  p('Oslo', 'Norway', 59.914, 10.752, 'Europe/Oslo', 23),
  p('Tromsø', 'Norway', 69.649, 18.956, 'Europe/Oslo', 10),
  p('Reykjavík', 'Iceland', 64.147, -21.943, 'Atlantic/Reykjavik', 20),
  p('Helsinki', 'Finland', 60.170, 24.938, 'Europe/Helsinki', 17),
  p('Warsaw', 'Poland', 52.230, 21.012, 'Europe/Warsaw', 100),
  p('Athens', 'Greece', 37.984, 23.728, 'Europe/Athens', 70),
  p('Istanbul', 'Türkiye', 41.008, 28.978, 'Europe/Istanbul', 39),
  p('Kyiv', 'Ukraine', 50.450, 30.523, 'Europe/Kyiv', 179),
  p('Moscow', 'Russia', 55.756, 37.617, 'Europe/Moscow', 156),
  p('Stonehenge', 'UK', 51.179, -1.826, 'Europe/London', 100),
  // Africa and the Middle East
  p('Cairo', 'Egypt', 30.044, 31.236, 'Africa/Cairo', 23),
  p('Giza', 'Egypt', 29.979, 31.134, 'Africa/Cairo', 60),
  p('Alexandria', 'Egypt', 31.200, 29.918, 'Africa/Cairo', 5),
  p('Aswan (Syene)', 'Egypt', 24.089, 32.899, 'Africa/Cairo', 194),
  p('Marrakesh', 'Morocco', 31.629, -7.981, 'Africa/Casablanca', 466),
  p('Lagos', 'Nigeria', 6.524, 3.379, 'Africa/Lagos', 41),
  p('Accra', 'Ghana', 5.604, -0.187, 'Africa/Accra', 61),
  p('Nairobi', 'Kenya', -1.292, 36.822, 'Africa/Nairobi', 1795),
  p('Addis Ababa', 'Ethiopia', 9.030, 38.740, 'Africa/Addis_Ababa', 2355),
  p('Cape Town', 'South Africa', -33.925, 18.424, 'Africa/Johannesburg', 25),
  p('Johannesburg', 'South Africa', -26.204, 28.047, 'Africa/Johannesburg', 1753),
  p('Namib Desert', 'Namibia', -24.729, 15.293, 'Africa/Windhoek', 600),
  p('Jerusalem', 'Israel', 31.768, 35.214, 'Asia/Jerusalem', 754),
  p('Baghdad', 'Iraq', 33.315, 44.366, 'Asia/Baghdad', 34),
  p('Tehran', 'Iran', 35.689, 51.389, 'Asia/Tehran', 1189),
  p('Dubai', 'UAE', 25.205, 55.271, 'Asia/Dubai', 5),
  p('Riyadh', 'Saudi Arabia', 24.713, 46.675, 'Asia/Riyadh', 612),
  p('Samarkand', 'Uzbekistan', 39.627, 66.975, 'Asia/Samarkand', 702),
  // Asia
  p('Delhi', 'India', 28.614, 77.209, 'Asia/Kolkata', 216),
  p('Mumbai', 'India', 19.076, 72.878, 'Asia/Kolkata', 14),
  p('Jaipur', 'India', 26.912, 75.787, 'Asia/Kolkata', 431),
  p('Bengaluru', 'India', 12.972, 77.595, 'Asia/Kolkata', 920),
  p('Kathmandu', 'Nepal', 27.717, 85.324, 'Asia/Kathmandu', 1400),
  p('Dhaka', 'Bangladesh', 23.810, 90.413, 'Asia/Dhaka', 4),
  p('Bangkok', 'Thailand', 13.756, 100.502, 'Asia/Bangkok', 2),
  p('Singapore', 'Singapore', 1.352, 103.820, 'Asia/Singapore', 15),
  p('Jakarta', 'Indonesia', -6.208, 106.846, 'Asia/Jakarta', 8),
  p('Manila', 'Philippines', 14.600, 120.984, 'Asia/Manila', 7),
  p('Hanoi', 'Vietnam', 21.028, 105.834, 'Asia/Bangkok', 10),
  p('Hong Kong', 'China', 22.320, 114.169, 'Asia/Hong_Kong', 10),
  p('Beijing', 'China', 39.904, 116.407, 'Asia/Shanghai', 44),
  p('Shanghai', 'China', 31.230, 121.474, 'Asia/Shanghai', 4),
  p('Xi\'an', 'China', 34.341, 108.940, 'Asia/Shanghai', 405),
  p('Lhasa', 'China', 29.652, 91.172, 'Asia/Shanghai', 3656),
  p('Ulaanbaatar', 'Mongolia', 47.886, 106.906, 'Asia/Ulaanbaatar', 1350),
  p('Seoul', 'South Korea', 37.567, 126.978, 'Asia/Seoul', 38),
  p('Tokyo', 'Japan', 35.676, 139.650, 'Asia/Tokyo', 40),
  p('Kyoto', 'Japan', 35.012, 135.768, 'Asia/Tokyo', 50),
  p('Taipei', 'Taiwan', 25.033, 121.565, 'Asia/Taipei', 9),
  // Oceania
  p('Sydney', 'Australia', -33.869, 151.209, 'Australia/Sydney', 58),
  p('Melbourne', 'Australia', -37.814, 144.963, 'Australia/Melbourne', 31),
  p('Perth', 'Australia', -31.950, 115.860, 'Australia/Perth', 31),
  p('Uluru', 'Australia', -25.344, 131.036, 'Australia/Darwin', 500),
  p('Darwin', 'Australia', -12.463, 130.842, 'Australia/Darwin', 30),
  p('Auckland', 'New Zealand', -36.849, 174.763, 'Pacific/Auckland', 20),
  p('Lake Tekapo (Aoraki Mackenzie)', 'New Zealand', -44.004, 170.477, 'Pacific/Auckland', 710),
  p('Nukuʻalofa', 'Tonga', -21.139, -175.204, 'Pacific/Tongatapu', 3),
  p('Papeete', 'French Polynesia', -17.535, -149.570, 'Pacific/Tahiti', 2),
  // Poles and extremes
  p('Longyearbyen', 'Svalbard', 78.223, 15.627, 'Arctic/Longyearbyen', 20),
  p('North Pole', '—', 90, 0, 'UTC', 0),
  p('Equator (Quito area)', 'Ecuador', 0, -78.45, 'America/Guayaquil', 2600),
  p('McMurdo Station', 'Antarctica', -77.846, 166.676, 'Antarctica/McMurdo', 10),
  p('South Pole', 'Antarctica', -90, 0, 'Antarctica/McMurdo', 2835),
];

export function findPlace(name: string): Place | undefined {
  const n = name.toLowerCase();
  return PLACES.find((pl) => pl.name.toLowerCase() === n) ?? PLACES.find((pl) => pl.name.toLowerCase().startsWith(n));
}

export function searchPlaces(q: string, limit = 12): Place[] {
  const n = q.trim().toLowerCase();
  if (!n) return PLACES.slice(0, limit);
  return PLACES
    .filter((pl) => pl.name.toLowerCase().includes(n) || pl.country.toLowerCase().includes(n))
    .sort((a, b) => Number(!a.name.toLowerCase().startsWith(n)) - Number(!b.name.toLowerCase().startsWith(n)))
    .slice(0, limit);
}
