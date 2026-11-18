// Full Atlas articles: the long read under an entry's live facts. Plain data,
// one article per reference. Numbers that change with time (distance,
// brightness, where it is tonight) are left to the live block, so the words
// here stay true.

export interface ArticleSection {
  title: string;
  paragraphs: string[];
}

export interface Article {
  /** The opening paragraph, shown larger. */
  lede: string;
  sections: ArticleSection[];
  sources: { title: string; url: string }[];
}

const FACT_SHEET = { title: 'NASA Planetary Fact Sheets', url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/' };
const nasa = (name: string, path: string) => ({ title: `NASA Science: ${name}`, url: `https://science.nasa.gov/${path}/` });

export const ARTICLES: Record<string, Article> = {
  sun: {
    lede: 'The Sun is an ordinary star, and that is the most remarkable thing about it. It is a ball of hot gas 109 times wider than Earth, holding 99.8% of all the mass in the Solar System, and every other star you see at night is a sun of its own, made distant.',
    sections: [
      { title: 'What it is', paragraphs: [
        'The Sun is about 1.39 million kilometres across and about 333,000 times as massive as Earth. It is made mostly of hydrogen (about three quarters by mass) and helium (most of the rest), with a sprinkling of heavier elements such as oxygen, carbon, neon and iron that were forged in older stars before the Sun was born.',
        'Astronomers classify it as a G2V star: a yellow-white dwarf on the main sequence, the long, steady stage of life in which a star fuses hydrogen into helium in its core. The word "dwarf" only separates it from giants; the Sun outshines the great majority of stars in our part of the galaxy, because most stars are small, dim red dwarfs.',
      ] },
      { title: 'How it shines', paragraphs: [
        'In the core, at about 15 million kelvin, hydrogen nuclei fuse into helium. Each second the Sun turns roughly 600 million tonnes of hydrogen into helium, and about 4 million tonnes of that simply vanishes, converted into energy as Einstein\'s E = mc² says it must.',
        'That energy takes a long road out. In the dense inner layers it travels as light, absorbed and re-emitted so many times that it takes on the order of a hundred thousand years to cross the radiative zone. In the outer third it is carried by boiling convection, which you can see on the surface as granules, each about the size of a country, that come and go in minutes. From the visible surface, the photosphere at about 5,800 K, light reaches Earth in a little over eight minutes.',
      ] },
      { title: 'Spots, flares and the solar cycle', paragraphs: [
        'The Sun\'s magnetic field is tangled by its own rotation, which is faster at the equator (about 25 days) than near the poles (about 35). Where bundles of field break through the surface they hold back the heat flowing up from below, and those patches look dark: sunspots, many of them larger than Earth.',
        'The number of spots rises and falls over a cycle of about 11 years, and at each minimum the magnetic field flips its direction. Near maximum the Sun throws off more flares and coronal mass ejections, billion-tonne clouds of charged gas. When one reaches Earth it can set off bright auroras far from the poles, as the storms of 2024 did, when the northern lights were seen as far south as Mexico.',
      ] },
      { title: 'The Sun in our sky', paragraphs: [
        'Over a year the Sun seems to drift eastward through the stars along a path called the ecliptic, about a degree a day, because we are watching it from a moving Earth. Earth\'s axis is tilted 23.4° to that path, so the Sun climbs higher and stays up longer in summer and keeps low in winter. That tilt, not our distance from the Sun, makes the seasons: Earth is actually closest to the Sun in early January.',
        'Its disc is about half a degree wide, almost exactly the size of the Moon\'s. That coincidence is why total solar eclipses are possible, and why they are so brief: the Moon only just covers the Sun, and for a few minutes the faint outer atmosphere, the corona, appears as pearly streamers around a black disc.',
        'Never look at the Sun directly, and never through binoculars or a telescope without a certified solar filter over the front. Its light can burn the retina in seconds, and the damage is permanent and painless while it happens.',
      ] },
      { title: 'Past and future', paragraphs: [
        'The Sun formed about 4.6 billion years ago from a collapsing cloud of gas and dust, probably in a cluster with hundreds of sibling stars that have long since drifted apart. It has been slowly brightening ever since and is now about 30% brighter than when it was young.',
        'In roughly 5 billion years it will run out of hydrogen in its core, swell into a red giant large enough to swallow Mercury and Venus and perhaps Earth, shed its outer layers as a glowing planetary nebula, and settle down as a white dwarf about the size of Earth, cooling for billions of years. You can play out that life in the Star lab from the Sun\'s card.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('The Sun', 'sun')],
  },

  mercury: {
    lede: 'Mercury is the smallest planet and the closest to the Sun, a cratered, airless world that races around its orbit in 88 days. It is easy to see with the naked eye, but only if you know when to look, because it never strays far from the Sun.',
    sections: [
      { title: 'What it is', paragraphs: [
        'Mercury is 4,880 km across, only a little larger than our Moon, and it looks much like the Moon too: grey, battered by impacts, with no air to speak of. But it is far denser. An iron core makes up about 85% of its radius, the largest share of any planet, which suggests that a giant collision early in its history may have stripped away much of its rocky mantle.',
        'Its orbit is the most stretched of the planets, carrying it between 46 and 70 million kilometres from the Sun. The shift in where its orbit comes closest to the Sun, a tiny 43 arcseconds a century more than Newton\'s gravity could explain, was one of the first tests passed by Einstein\'s general relativity in 1915.',
      ] },
      { title: 'A long day and a hot one', paragraphs: [
        'Mercury spins three times for every two orbits, a resonance locked in by the Sun\'s tides. The result is a solar day, from one sunrise to the next, that lasts 176 Earth days, twice as long as its year.',
        'With no air to hold heat, the ground swings from about 430 °C at noon to about −180 °C before dawn. Yet near its poles there are craters whose floors never see sunlight, and the MESSENGER spacecraft found strong evidence of water ice inside them.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'Seen from Earth, Mercury never gets more than about 28° from the Sun. It appears for a few weeks at a time, low in the west after sunset or low in the east before sunrise, around its greatest elongations, then slips back into the Sun\'s glare. The events calendar in Tonight lists each elongation.',
        'The best apparitions are evening ones in spring and morning ones in autumn, when the ecliptic stands steeply to the horizon and lifts Mercury higher out of the twilight. At its best it shines as brightly as the brightest stars, a steady pinkish point in the twilight. Copernicus is said to have regretted never seeing it; from the misty Baltic coast that is easy to believe.',
        'Every so often Mercury crosses directly in front of the Sun, a transit. The next ones are on 13 November 2032 and 7 November 2039.',
      ] },
      { title: 'The surface', paragraphs: [
        'Mercury\'s largest known feature is the Caloris Basin, an impact scar about 1,550 km wide, ringed by mountains. The shock of that impact was focused through the planet and broke up the ground on the exact opposite side into a jumble of hills that geologists call the "weird terrain".',
        'Its craters are named after artists, writers and musicians: Bach, Beethoven, Dickens, Hokusai, Matisse, Tolkien. Some young craters are surrounded by bright rays of splashed rock; others hold shallow, bright hollows that seem to form as volatile material boils away in the sunlight, and may still be forming today.',
        'Mercury has a magnetic field, about one per cent as strong as Earth\'s, which surprised the scientists who found it in 1974: a planet this small was expected to have frozen solid inside long ago. Part of its iron core must still be molten.',
      ] },
      { title: 'Exploring it', paragraphs: [
        'Mariner 10 flew past three times in 1974 and 1975 and mapped under half of the surface. MESSENGER orbited from 2011 to 2015, mapping the whole planet and finding its ice, a lopsided magnetic field, and long cliffs called lobate scarps that show the planet has shrunk as its core cooled. BepiColombo, a joint European and Japanese mission launched in 2018, is on its way to study Mercury from orbit.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Mercury', 'mercury')],
  },

  venus: {
    lede: 'After the Sun and the Moon, Venus is the brightest thing in the sky: the evening star and the morning star, bright enough to cast shadows on a dark night. Underneath its clouds it is the hottest planet, hotter even than Mercury.',
    sections: [
      { title: 'Earth\'s twin, gone wrong', paragraphs: [
        'Venus is almost exactly Earth\'s size, 12,104 km across, and has about 82% of its mass. It probably started out much like Earth. But its air is now 96% carbon dioxide and so thick that the pressure at the ground is about 92 times ours, like being nearly a kilometre under the sea.',
        'That blanket of carbon dioxide traps heat in a runaway greenhouse effect. The surface sits at about 465 °C, day and night, pole to equator: hot enough to melt lead. Above it, clouds of sulphuric acid droplets wrap the whole planet and reflect about three quarters of the sunlight that falls on them, which is why Venus shines so brightly.',
      ] },
      { title: 'A backward, slow spin', paragraphs: [
        'Venus turns the wrong way, east to west, and very slowly: once every 243 Earth days, longer than its 225-day year. On Venus the Sun would rise in the west and set in the east, about 117 days later. Oddly, the cloud tops race around the planet in only four days.',
        'Radar from the Magellan orbiter, which mapped 98% of the surface in the early 1990s, showed a young surface of volcanic plains, thousands of volcanoes and strange circular features called coronae. Whether any of those volcanoes are active today is still being argued about; some recent studies of old radar images point to fresh lava.',
      ] },
      { title: 'Landing on Venus', paragraphs: [
        'The Soviet Union sent a series of Venera probes into that furnace. Venera 7 sent back the first signals from the surface of another planet in 1970, and in 1975 Venera 9 and 10 returned the first photographs: flat slabs of dark rock under an orange sky. The longest survivor, Venera 13 in 1982, lasted 127 minutes before the heat and pressure killed it.',
        'No lander has been back since the Vega balloons of 1985. New missions are planned for the 2030s, including NASA\'s DAVINCI, which would drop a probe through the atmosphere, and VERITAS and ESA\'s EnVision, which would map the surface from orbit in far more detail than Magellan.',
      ] },
      { title: 'Phases and the case for a Sun-centred system', paragraphs: [
        'Because Venus orbits inside Earth\'s orbit, we see it go through phases like the Moon. When it is on the far side of the Sun it is a small, nearly full disc; as it swings toward us it grows larger and becomes a thin crescent, about six times wider than when it was full.',
        'Galileo saw those phases in 1610, and they mattered. In the old Earth-centred system Venus could never show a full phase. Seeing it go from crescent to full was strong evidence that it circles the Sun.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'Venus is never more than about 47° from the Sun, so it is always an evening or a morning object, never seen at midnight. It spends roughly nine months as the evening star, passes between Earth and the Sun, then about nine months as the morning star, in a cycle that repeats every 584 days.',
        'Five of those cycles add up almost exactly to eight years, so Venus traces nearly the same pattern through the sky every eight years. Maya astronomers tracked that cycle closely, and tables for it fill several pages of the Dresden Codex.',
        'When it is high and bright, you can sometimes find Venus in a clear blue daytime sky if you know exactly where to look. Its rare transits across the Sun, in 2004 and 2012, were once used to measure the size of the Solar System. The next is not until December 2117.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Venus', 'venus')],
  },

  mars: {
    lede: 'Mars is the red planet, a cold desert world half Earth\'s width, with the tallest volcano and the deepest canyon in the Solar System. It is also the planet we know best after our own, explored by more spacecraft than any other.',
    sections: [
      { title: 'What it is', paragraphs: [
        'Mars is 6,779 km across and has about a tenth of Earth\'s mass, so you would weigh about 38% of your Earth weight there. Its day, 24 hours 37 minutes, is very close to ours, and its axis is tilted 25°, so it has seasons too, each almost twice as long as ours because its year lasts 687 days.',
        'Its colour comes from iron oxide, rust, in the fine dust that covers everything. The air is thin, about 0.6% of Earth\'s pressure, and nearly all carbon dioxide. In winter so much of that air freezes onto the polar caps that the planet\'s pressure drops by about a quarter.',
      ] },
      { title: 'Volcanoes, canyons and old rivers', paragraphs: [
        'Olympus Mons rises about 22 km above the surrounding plains, two and a half times the height of Everest, on a base as wide as France. Valles Marineris, a crack in the crust beside the Tharsis volcanoes, runs about 4,000 km, the width of the continental United States, and in places is 7 km deep.',
        'Mars was not always a desert. Dry river valleys, deltas and lake beds show that liquid water once flowed there, more than three billion years ago. Rovers have driven across those old lake beds: Curiosity in Gale crater since 2012 and Perseverance in Jezero crater since 2021, the latter collecting rock samples in sealed tubes for a possible future return to Earth. Today water survives as ice, in the polar caps and beneath the ground across much of the planet.',
      ] },
      { title: 'Two small moons', paragraphs: [
        'Phobos and Deimos, found by Asaph Hall in 1877, are small, dark, lumpy bodies 22 and 12 km across, possibly captured asteroids or debris from an ancient impact. Phobos orbits so close and so fast, three times a day, that from the surface it rises in the west and sets in the east. It is slowly spiralling inward and will be torn apart in some tens of millions of years.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'Every 26 months Earth overtakes Mars on the inside track, and Mars reaches opposition: it rises at sunset, stays up all night and shines at its brightest, a fiery orange point. Because its orbit is stretched, some oppositions bring it much closer than others. The close ones, like 2003 and 2018, come every 15 or 17 years and show the most detail in a telescope. The next opposition is in February 2027, a distant one.',
        'Around opposition Mars seems to stop, drift backward (westward) against the stars for about two months, then turn forward again. This retrograde loop is just the view from a faster planet passing a slower one, but it puzzled astronomers for thousands of years. Johannes Kepler\'s study of Tycho Brahe\'s careful observations of Mars led him in 1609 to the discovery that planets move on ellipses, not circles.',
        'Between oppositions Mars is small and fairly faint, and spends long stretches near the Sun in the sky. The planet\'s colour made it the god of war for the Greeks and Romans, and Nergal for the Babylonians.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Mars', 'mars')],
  },

  jupiter: {
    lede: 'Jupiter is the giant of the Solar System, more than twice as massive as all the other planets put together. Even a pair of binoculars shows it as a small disc with a line of tiny moons beside it, the same view that changed astronomy in 1610.',
    sections: [
      { title: 'What it is', paragraphs: [
        'Jupiter is 139,820 km across at the equator, eleven times Earth\'s width, and about 318 times as massive. It has no solid surface. Below the clouds, hydrogen and helium are squeezed by the planet\'s own weight until, thousands of kilometres down, hydrogen becomes a liquid metal that conducts electricity. Currents in that metal make Jupiter\'s magnetic field, the strongest of any planet.',
        'Jupiter spins faster than any other planet, once in just under 10 hours, which flattens it visibly at the poles and draws its clouds out into bands. Pale zones and darker belts are rising and sinking gas, coloured by traces of ammonia, sulphur compounds and other chemistry we do not fully understand.',
      ] },
      { title: 'The Great Red Spot', paragraphs: [
        'The Great Red Spot is a storm, a high-pressure system turning anticlockwise, larger than Earth. It has been watched continuously since at least the 1830s and may be the spot reported by Giovanni Cassini in 1665. It has been shrinking for over a century, from about 40,000 km long in the late 1800s to about a third of that today, and has grown rounder as it shrank.',
        'Juno, in orbit since 2016, found that its roots reach a few hundred kilometres below the cloud tops, and that Jupiter\'s poles are crowded with clusters of cyclones arranged in neat polygons.',
      ] },
      { title: 'Galileo\'s moons', paragraphs: [
        'In January 1610 Galileo turned his new telescope on Jupiter and saw three, then four, little stars in a line beside it that changed position from night to night. They were moons, circling another world, and they were a blow to the idea that everything circles the Earth. Io, Europa, Ganymede and Callisto each have their own entry in the Atlas.',
        'Jupiter has more than 90 known moons. Most are small, irregular bodies, probably captured asteroids, many on backward orbits. It also has faint rings of dust, found by Voyager 1 in 1979.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'Jupiter is usually the second-brightest planet after Venus, a steady cream-white point that outshines every star. It takes almost 12 years to go round the Sun, so it moves through about one constellation of the zodiac each year. Chinese astronomers called it the Year Star and used it to keep a twelve-year calendar.',
        'Steady binoculars show the Galilean moons as points of light in a line; their positions change in hours, and you can watch one slip behind Jupiter or come out of its shadow. A small telescope shows the two main dark belts, and with patience the Great Red Spot.',
      ] },
      { title: 'A guardian, a bully or both', paragraphs: [
        'Jupiter\'s gravity shapes the whole Solar System. It carved the Kirkwood gaps in the asteroid belt, holds two great swarms of Trojan asteroids 60° ahead of it and behind it, and flings comets inward or out of the Solar System entirely. In 1994 the comet Shoemaker–Levy 9, torn into fragments by Jupiter\'s tides, struck the planet and left dark scars bigger than Earth. In the What if? sandbox you can make Jupiter heavier and see what that does to the inner planets.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Jupiter', 'jupiter')],
  },

  saturn: {
    lede: 'Saturn is the ringed planet, and the rings are real: billions of chunks of water ice, from grains of dust to boulders the size of houses, spread in a sheet about as wide as the distance from Earth to the Moon but in most places only ten to a hundred metres thick.',
    sections: [
      { title: 'What it is', paragraphs: [
        'Saturn is the second-largest planet, 116,460 km across at the equator, about nine times Earth\'s width. Like Jupiter it is mostly hydrogen and helium with no solid surface, but it is so much less compressed that its average density is lower than water. It spins in about 10 hours 34 minutes and is the most flattened planet, 10% wider at the equator than pole to pole.',
        'Its clouds are muted gold, the bands softened by a high haze. At its north pole a six-sided jet stream, the hexagon, wider than Earth, has kept its shape since Voyager first saw it in 1981.',
      ] },
      { title: 'The rings', paragraphs: [
        'The main rings, named A, B and C from the outside in, are divided by gaps. The widest, the Cassini Division, about 4,700 km across, is cleared by a resonance with the moon Mimas. Small shepherd moons keep the edges of some narrow rings sharp, and others open gaps of their own.',
        'How old the rings are is an open question. The Cassini spacecraft found them remarkably clean and light in mass, which suggests they may be young, perhaps a few hundred million years. Other researchers argue that old rings could stay clean. Either way, they are slowly losing material, raining into Saturn\'s atmosphere.',
      ] },
      { title: 'Titan, Enceladus and more', paragraphs: [
        'Saturn has more than 270 known moons, the most of any planet. Titan, larger than Mercury, is the only moon with a thick atmosphere: orange nitrogen smog over lakes and seas of liquid methane and ethane. The Huygens probe landed there in 2005. Enceladus, only 500 km wide, sprays jets of water from cracks near its south pole, fed by an ocean under its ice. Those two make Saturn\'s family one of the main places to look for life beyond Earth.',
      ] },
      { title: 'Visiting Saturn', paragraphs: [
        'Pioneer 11 flew past in 1979, followed by Voyager 1 in 1980 and Voyager 2 in 1981. Then came Cassini, which arrived in 2004 carrying the European Huygens lander for Titan and stayed for thirteen years. It found the geysers of Enceladus, mapped Titan\'s seas by radar, watched a giant storm wrap around the planet in 2010 and 2011, and followed the seasons change from northern winter to summer.',
        'Running low on fuel, Cassini made 22 daring dives through the gap between the rings and the planet in 2017, then plunged into Saturn\'s atmosphere on 15 September, so that it could never crash into and contaminate Enceladus or Titan. NASA\'s Dragonfly, a nuclear-powered drone, is due to launch in 2028 to fly between landing sites on Titan.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'To the eye Saturn is a steady, pale yellow point, about as bright as the brighter stars. It takes 29.5 years to go round the Sun, so it moves slowly, lingering two or three years in each constellation of the zodiac. It was the slowest planet the ancients knew, and gave its name to Saturday.',
        'Any small telescope shows the rings, and few sights in astronomy draw a gasp so reliably. Their tilt toward us changes over Saturn\'s year. Twice in each orbit we see them exactly edge-on and they all but vanish, as they did in March 2025. Over the next few years they will open up again, reaching their widest in the early 2030s. The object card shows the tilt for whatever date you choose.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Saturn', 'saturn')],
  },

  uranus: {
    lede: 'Uranus was the first planet found with a telescope, and the first discovered at all since antiquity. It is an ice giant, a pale blue-green world that spins on its side, so that each pole spends 42 years in sunlight and then 42 years in darkness.',
    sections: [
      { title: 'Discovery', paragraphs: [
        'On 13 March 1781 William Herschel, a musician turned astronomer in Bath, was surveying stars with a home-made telescope when he noticed one that showed a small disc. He thought it was a comet, but its orbit turned out to be nearly circular and far beyond Saturn. In a single night the known Solar System doubled in size.',
        'Herschel wanted to name it Georgium Sidus, George\'s Star, after King George III. The name that stuck, Uranus, was proposed by Johann Bode after the Greek god of the sky, father of Saturn.',
      ] },
      { title: 'What it is', paragraphs: [
        'Uranus is 50,724 km across, four times Earth\'s width, and 14.5 times as massive. It is called an ice giant because most of its mass is not hydrogen and helium but a hot, dense fluid of water, ammonia and methane around a small rocky core. Methane in its upper air absorbs red light, which gives the planet its cyan colour.',
        'Its axis is tipped 98°, so it rolls along its orbit on its side. The likeliest explanation is a collision with an Earth-sized body long ago. As a result, its seasons are extreme: during the 84-year orbit, each pole faces the Sun for decades.',
        'It has 13 known rings, dark and narrow, found in 1977 when they blocked the light of a star passing behind the planet, and nearly 30 known moons, named after characters from Shakespeare and Alexander Pope: Miranda, Ariel, Umbriel, Titania, Oberon and others.',
      ] },
      { title: 'Moons with Shakespeare\'s names', paragraphs: [
        'The five large moons are a mix of ice and rock. Titania and Oberon, the largest, were found by Herschel himself in 1787. Miranda, the smallest of the five, is the strangest: a patchwork of grooved terrain and cliffs, as if it had been shattered and put back together. One of them, Verona Rupes, may be the tallest cliff in the Solar System, perhaps 20 km high. In Miranda\'s weak gravity a rock dropped from the top would fall for several minutes.',
        'Because Uranus lies on its side, its moons orbit over its equator and share its tilt. When Voyager 2 arrived the Sun was shining almost straight down on the south pole, so it saw only the southern halves of the moons. Much of their surfaces has still never been seen.',
        'A dedicated orbiter and atmospheric probe for Uranus was named the top priority for a new large NASA planetary mission in the 2022 planetary science decadal survey. If it flies, it would arrive in the 2040s.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'At about magnitude 5.7, Uranus is just visible to the naked eye under a dark sky, if you know exactly where to look; it had been charted as a star several times before Herschel. In binoculars it is an unremarkable point, and in a telescope a tiny, featureless blue-green disc. It moves slowly, taking about seven years to cross each zodiac constellation; it is in Taurus through the late 2020s.',
        'Only one spacecraft has visited: Voyager 2, which flew past in January 1986 and found a planet with almost no visible weather. Since then telescopes have caught storms and bright clouds as the seasons changed.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Uranus', 'uranus')],
  },

  neptune: {
    lede: 'Neptune was found with mathematics before anyone knew where to point a telescope. It is the outermost planet, a deep blue ice giant with the fastest winds in the Solar System, 30 times farther from the Sun than Earth.',
    sections: [
      { title: 'Discovery on paper', paragraphs: [
        'By the 1840s Uranus was straying from its predicted path: something unseen was tugging on it. Urbain Le Verrier in France worked out where the culprit should be, and on 23 September 1846 Johann Galle at the Berlin Observatory found Neptune within about a degree of the predicted spot on his first night of looking. John Couch Adams in England had made a similar prediction, and the credit was argued over for years.',
        'Galileo had in fact drawn Neptune in his notes in December 1612 and January 1613, as a faint star near Jupiter, and even noted that it seemed to have moved. He never followed it up.',
      ] },
      { title: 'What it is', paragraphs: [
        'Neptune is 49,244 km across, slightly smaller than Uranus but denser and a little more massive, 17 times Earth\'s mass. Like Uranus it is mostly a hot fluid of water, ammonia and methane under an atmosphere of hydrogen and helium, and methane gives it its blue colour.',
        'Unlike Uranus it has lively weather. Voyager 2 flew past in 1989 and photographed the Great Dark Spot, a storm the size of Earth, which had vanished when the Hubble Space Telescope looked a few years later. Winds there reach about 2,000 km/h, the fastest measured on any planet, oddly so far from the Sun\'s warmth. Neptune gives off more than twice as much heat as it receives, and that inner heat may drive them.',
      ] },
      { title: 'Triton', paragraphs: [
        'Neptune\'s largest moon, Triton, orbits backward, against the planet\'s spin, which almost certainly means it was captured: it was probably once a dwarf planet of the Kuiper belt, like Pluto. Voyager 2 saw dark plumes rising from its frozen nitrogen surface, at about −235 °C one of the coldest places ever measured. Neptune\'s tides are slowly dragging Triton inward.',
      ] },
      { title: 'Rings in arcs', paragraphs: [
        'From Earth, stars passing behind Neptune in the 1980s seemed to blink on one side of the planet but not the other, as if it had only pieces of rings. Voyager 2 showed why: Neptune has five thin, dark rings, and the outermost, the Adams ring, is gathered into bright clumps called arcs, named Liberté, Égalité and Fraternité, held in place by the gravity of a small moon. Some of them have faded noticeably since 1989.',
        'Voyager 2 is still the only spacecraft to have visited. It passed about 5,000 km above Neptune\'s north pole on 25 August 1989, the closest approach of its whole tour, and used the planet\'s gravity to swing down past Triton and out of the plane of the planets.',
        'Neptune\'s axis is tilted 28°, a little more than Earth\'s, so it has seasons too, each about 40 years long. Telescopes have watched its southern hemisphere slowly brighten since the 1990s as spring there turned to summer.',
      ] },
      { title: 'Finding it in the sky', paragraphs: [
        'At about magnitude 7.8 Neptune is never visible to the naked eye. Binoculars show it as a faint star; a telescope at high power shows a tiny blue disc. It takes 165 years to go round the Sun, so since its discovery in 1846 it completed its first full orbit only in 2011. In 2025 and 2026 it shared a patch of sky with Saturn, near the border of Pisces.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('Neptune', 'neptune')],
  },

  moon: {
    lede: 'The Moon is Earth\'s only natural satellite and the one world beyond our own that people have walked on. It is the easiest thing in the sky to watch change: its phase, its place among the stars and its rising time move noticeably from one night to the next.',
    sections: [
      { title: 'What it is', paragraphs: [
        'The Moon is 3,475 km across, a little over a quarter of Earth\'s width, and has about 1.2% of Earth\'s mass, so its gravity is about a sixth of ours. It orbits at an average distance of 384,400 km, close enough that light makes the trip in 1.3 seconds and far enough that all the other planets would fit in the gap.',
        'The leading idea for its birth is a giant impact. About 4.5 billion years ago a Mars-sized body struck the young Earth, and the debris thrown into orbit gathered into the Moon. Rocks brought back by Apollo astronauts are strikingly similar to Earth\'s, which supports a shared origin.',
      ] },
      { title: 'Seas and craters', paragraphs: [
        'The dark patches are the maria, Latin for "seas", though they hold no water. They are plains of basalt lava that welled up and flooded giant impact basins more than three billion years ago. The brighter highlands are older, saturated with craters. With no air or weather, a crater on the Moon can last for billions of years, so the Moon keeps a record of the early Solar System that Earth has erased.',
        'Different cultures read different shapes in the maria: a man in the Moon, a rabbit pounding medicine in East Asia and among the Aztecs, a woman carrying water in parts of Polynesia.',
      ] },
      { title: 'Phases', paragraphs: [
        'Half the Moon is always lit by the Sun. What changes is how much of that lit half faces us. At new Moon it lies between Earth and the Sun and we see its dark side; a thin crescent appears in the evening a day or two later, then a half-lit first quarter, a gibbous Moon, and full Moon, opposite the Sun, rising at sunset. Then the sequence runs backward into the morning sky. The cycle takes 29.5 days, the synodic month, which is the root of the word "month".',
        'In the nights around a thin crescent, look at the dark part: it glows faintly grey. That is earthshine, sunlight reflected off Earth onto the Moon and back again. Leonardo da Vinci explained it around 1510.',
      ] },
      { title: 'Always the same face', paragraphs: [
        'The Moon turns once on its axis in exactly the time it takes to orbit, so the same side always faces Earth. This is tidal locking: Earth\'s pull raised a bulge in the young Moon and gradually braked its spin until the two matched. Slight wobbles, called libration, let us see about 59% of the surface over time, but the far side was unknown until the Soviet probe Luna 3 photographed it in 1959. It looks quite different, with very few maria.',
        'The tides work the other way too. The Moon raises Earth\'s ocean tides, and the friction slowly lengthens our day while the Moon drifts away, about 3.8 cm a year, measured by bouncing lasers off reflectors left on the surface by Apollo crews.',
      ] },
      { title: 'Eclipses', paragraphs: [
        'The Moon\'s orbit is tilted about 5° to Earth\'s, so most months the full Moon passes above or below Earth\'s shadow and the new Moon passes above or below the Sun. Only when a full or new Moon falls near one of the two crossing points, the nodes, do we get an eclipse. A lunar eclipse turns the Moon copper-red, lit by sunlight bent through Earth\'s atmosphere, the light of every sunrise and sunset on Earth at once. Tonight\'s calendar lists the coming eclipses, and Show me takes you to them.',
      ] },
      { title: 'People on the Moon', paragraphs: [
        'Twelve astronauts walked on the Moon between July 1969 and December 1972, on six Apollo missions, and brought back 382 kg of rock and soil. No one has been back since, but robotic landers have: China\'s Chang\'e 4 made the first landing on the far side in 2019, and Chang\'e 6 returned the first far-side samples in 2024. NASA\'s Artemis programme plans to take people back.',
      ] },
    ],
    sources: [FACT_SHEET, nasa('The Moon', 'moon')],
  },
};

export function articleFor(ref: string): Article | undefined {
  return ARTICLES[ref];
}
