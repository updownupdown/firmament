// Lore for the Atlas: one line of science and one of story (myth, history or
// how other peoples saw it) for the planets, bright stars and constellations.

import type { SkyObject, Universe } from './universe.ts';

export interface Lore {
  /** A fact about what it is. */
  science?: string;
  /** Myth, history or how other cultures saw it. */
  story?: string;
}

/** Stories for solar system bodies. Science for these comes from the object card's blurb. */
export const BODY_STORIES: Record<string, string> = {
  sun: 'Almost every culture has a Sun god: Ra crossing the sky in his boat, Helios driving a chariot, Amaterasu hiding in a cave and plunging the world into darkness.',
  moon: 'Many peoples see a rabbit in the Moon\'s dark patches, from China and Japan to the Aztecs. In Europe it was a man with a bundle of sticks.',
  mercury: 'Named for the quick-footed messenger of the Roman gods, because it races around the Sun faster than any other planet.',
  venus: 'The Maya timed wars and rituals by its cycle and recorded it in the Dresden Codex. Babylonians knew it as Ishtar, goddess of love and war.',
  mars: 'Its red colour made it the god of war for the Romans, and Nergal, god of plague and the underworld, for the Babylonians.',
  jupiter: 'King of the Roman gods. Chinese astronomers called it the Year Star, because it takes about 12 years to go round the sky, one twelfth a year.',
  saturn: 'The slowest planet the ancients knew, named for the god of time and harvest. Saturday is still named after it.',
  uranus: 'The first planet found with a telescope, by William Herschel in 1781. He wanted to call it George\'s Star, after his king.',
  neptune: 'Found in 1846 where mathematics said it should be, from the way it tugged on Uranus. Galileo had drawn it in 1612 without knowing.',
  pluto: 'Named in 1930 by Venetia Burney, an 11-year-old in Oxford, after the Roman god of the underworld.',
  io: 'Named, like the other three, for one of Zeus\'s loves. Galileo first called them the Medicean Stars, to flatter his patrons.',
  europa: 'The Phoenician princess Zeus carried off as a white bull. The continent of Europe shares her name.',
  ganymede: 'The Trojan youth Zeus made cup-bearer to the gods.',
  callisto: 'A nymph Zeus loved; in one telling she was turned into the Great Bear in the northern sky.',
};

/** Bright stars by Hipparcos number: a fact and a story. */
export const STAR_LORE: Record<number, Lore> = {
  32349: { science: 'The brightest star in the night sky, a white star twice the Sun\'s mass with a white dwarf companion.', story: 'Its dawn rising each summer warned the Egyptians that the Nile was about to flood. The Greeks blamed it for the "dog days" of heat.' },
  30438: { science: 'The second-brightest star, a giant about 10,000 times as luminous as the Sun. Spacecraft use it to keep their bearings.', story: 'Named for the helmsman of Menelaus\'s fleet in the Trojan War. For Māori it is Atutahi, who stands apart from the Milky Way.' },
  69673: { science: 'An orange giant racing through our part of the galaxy, moving faster than almost any other bright star.', story: 'Its name means "guardian of the bear". In 1933 its light, focused by a telescope, switched on the lights of the Chicago World\'s Fair.' },
  91262: { science: 'Spinning so fast it bulges at its equator. It is surrounded by a disc of dust, a hint of planets in the making.', story: 'In China and Japan it is the weaver girl, Zhinü or Orihime, kept from her love Altair by the river of the Milky Way. They meet once a year on Qixi, or Tanabata.' },
  24608: { science: 'Not one star but two yellow giants orbiting each other every 104 days.', story: 'The "little she-goat" carried by the charioteer Auriga. To the Greeks it was Amalthea, the goat who nursed the infant Zeus.' },
  24436: { science: 'A blue supergiant, about 100,000 times as luminous as the Sun.', story: 'Its name comes from the Arabic for "the foot of the giant": it marks Orion\'s left foot.' },
  37279: { science: 'One of our nearest bright neighbours, with a white dwarf companion.', story: 'Its name means "before the dog": it rises just before Sirius, the Dog Star.' },
  27989: { science: 'A red supergiant so large that, in the Sun\'s place, it would swallow the orbits of Mars and perhaps Jupiter. It will one day explode as a supernova.', story: 'In many Aboriginal Australian stories Orion is a man chasing the Seven Sisters of the Pleiades across the sky. For the Greeks it was the hunter\'s shoulder.' },
  97649: { science: 'Spins once every nine hours, so fast it is squashed into a flattened shape.', story: 'The cowherd Niulang in the Chinese tale, separated from the weaver girl Vega by the Milky Way. Magpies form a bridge so they can meet.' },
  21421: { science: 'An orange giant that only looks like part of the Hyades cluster; it is less than half as far away.', story: 'Its name means "the follower": it follows the Pleiades across the sky. It is the bull\'s fiery eye.' },
  80763: { science: 'A red supergiant about 700 times wider than the Sun.', story: 'Its name means "rival of Mars", for its red colour. For Māori and Hawaiians it sits on the fishhook of Maui, which pulled up the islands.' },
  65474: { science: 'Two hot blue stars so close they distort each other into egg shapes.', story: 'The ear of wheat held by Virgo. Hipparchus found precession around 130 BC by comparing its position with older records.' },
  37826: { science: 'The nearest giant star to us, with a planet about twice Jupiter\'s mass.', story: 'One of the twins of Gemini, the brothers Castor and Pollux, protectors of sailors.' },
  113368: { science: 'Ringed by a wide belt of icy dust, like a giant version of our Kuiper belt.', story: 'The "mouth of the fish", the southern fish drinking the water poured by Aquarius. It is the "lonely star" of autumn.' },
  102098: { science: 'One of the most luminous stars we can see by eye, perhaps 2,600 light-years away and tens of thousands of times as bright as the Sun.', story: 'Its name means "tail": it is the tail of Cygnus the swan, and the top of the Northern Cross.' },
  49669: { science: 'Spins so fast that, a little quicker, it would fly apart.', story: 'The "little king", the heart of the lion. Persian astronomers counted it among four royal stars that guarded the sky.' },
  11767: { science: 'A yellow supergiant that slowly pulses in brightness, about 50 times wider than the Sun.', story: 'Sailors steered by it for centuries, but it has not always been the pole star: 4,500 years ago that was Thuban, in Draco.' },
  68756: { science: 'A white giant that was the north pole star when the pyramids were built.', story: 'Some shafts inside the Great Pyramid point toward where Thuban crossed the sky, though whether that was deliberate is debated.' },
  65378: { science: 'With Alcor beside it, a test of good eyesight. A telescope splits Mizar itself, and each of those stars is double again.', story: 'Arab tradition used the faint Alcor as an eye test. For the Mi\'kmaq, Alcor is the cooking pot carried by a bird hunter chasing the bear.' },
  14576: { science: 'An eclipsing binary: every 2.87 days it dims for a few hours as one star passes in front of the other.', story: 'Its name means "the demon\'s head": it is the eye of Medusa, held by Perseus. Its winking was noticed long before anyone could explain it.' },
  60718: { science: 'The brightest star of the Southern Cross, itself a pair of hot blue stars.', story: 'It is on the flags of Australia, New Zealand, Brazil, Samoa and Papua New Guinea.' },
  7588: { science: 'Spins so fast it is about a third wider at the equator than at the poles, one of the flattest stars known.', story: 'Its name means "the end of the river", the mouth of Eridanus, the river the Greeks traced across the southern sky.' },
  71683: { science: 'Alpha Centauri, the nearest star system to the Sun: about 4.4 light-years away, with a third star, Proxima, that has planets.', story: 'For the Boorong people of Australia, it and Hadar are two brothers who speared the emu of the dark nebula beside the Cross.' },
};

/** Western constellations by IAU abbreviation. */
export const CONSTELLATION_LORE: Record<string, Lore> = {
  And: { science: 'Holds the Andromeda Galaxy, 2.5 million light-years away: the farthest thing most people can see by eye.', story: 'The princess chained to a rock as an offering to a sea monster, until Perseus rescued her.' },
  Aql: { science: 'Its brightest star, Altair, is one of the nearest bright stars, about 17 light-years away.', story: 'The eagle that carried Zeus\'s thunderbolts.' },
  Aqr: { science: 'A faint band of stars that includes the Helix Nebula, the gas shed by a dying star.', story: 'The water-bearer, linked to Babylon\'s rainy season, when the Sun passed through this part of the sky.' },
  Ari: { science: 'Its stars are faint, but the Sun once crossed the celestial equator here at the March equinox.', story: 'The golden ram whose fleece Jason sailed to find.' },
  Aur: { science: 'The Milky Way runs through it, with three open star clusters that binoculars show as soft patches.', story: 'The charioteer, often shown carrying a goat and her kids.' },
  Boo: { science: 'Holds Arcturus, the brightest star in the northern half of the sky.', story: 'The herdsman, who drives the Great Bear around the pole.' },
  Cap: { science: 'The Sun passed through it at the December solstice two thousand years ago, giving the Tropic of Capricorn its name.', story: 'A sea-goat, half goat and half fish: one of the oldest figures in the sky, from Babylon.' },
  Cas: { science: 'Its W shape lies in the Milky Way, opposite the Big Dipper across the pole.', story: 'The vain queen of Ethiopia, placed in the sky in a chair that swings upside down for half the night as punishment.' },
  Cen: { science: 'Holds Alpha Centauri, the nearest star system, and Omega Centauri, the largest globular cluster in our galaxy.', story: 'Chiron, the wise centaur who taught heroes such as Achilles and Jason.' },
  Cep: { science: 'Its star Delta Cephei gave its name to the Cepheid variables, the yardsticks that first measured the distances to other galaxies.', story: 'King Cepheus, husband of Cassiopeia and father of Andromeda.' },
  Cet: { science: 'Holds Mira, the "wonderful" star that swells and fades over about 11 months, from easily visible to invisible.', story: 'The sea monster sent to devour Andromeda.' },
  CMa: { science: 'Holds Sirius, the brightest star in the night sky, only 8.6 light-years away.', story: 'Orion\'s larger hunting dog, at his heels.' },
  CMi: { science: 'Holds Procyon, one of the nearest bright stars.', story: 'Orion\'s smaller dog.' },
  Cnc: { science: 'Holds the Beehive Cluster, a swarm of stars just visible by eye on a dark night.', story: 'The crab sent by Hera to nip at Heracles while he fought the Hydra.' },
  Cru: { science: 'The smallest constellation, beside the Coalsack, a dark cloud of dust that blots out the Milky Way.', story: 'Many Aboriginal Australian peoples see the Coalsack as the head of an emu stretching along the Milky Way.' },
  Cyg: { science: 'Lies along the Milky Way, where the Great Rift of dust divides the band in two.', story: 'The swan Zeus became; also the Northern Cross, which stands upright in the west on winter evenings.' },
  Del: { science: 'A small, neat diamond of stars, easy to spot once found.', story: 'The dolphin that rescued the poet Arion when sailors threw him overboard.' },
  Dra: { science: 'Holds Thuban, the pole star 4,500 years ago.', story: 'The dragon Ladon, who guarded the golden apples of the Hesperides.' },
  Eri: { science: 'A long, winding line of faint stars that ends at bright Achernar.', story: 'The river Eridanus, into which Phaethon fell after losing control of the Sun\'s chariot.' },
  Gem: { science: 'The Geminid meteors, the year\'s richest shower, seem to fly from here every December.', story: 'The twins Castor and Pollux, sailors\' patrons; St Elmo\'s fire on masts was their sign.' },
  Her: { science: 'Holds M13, the Great Globular Cluster, a ball of several hundred thousand stars.', story: 'The hero Heracles, shown kneeling, often with his foot on the dragon\'s head.' },
  Hya: { science: 'The largest constellation, stretching over a quarter of the sky.', story: 'The many-headed water serpent Heracles fought; cut off one head and two grew back.' },
  Leo: { science: 'The Leonid meteors seem to come from its head each November; in 1833 they fell like snow.', story: 'The Nemean lion, whose hide no weapon could pierce, killed by Heracles.' },
  Lib: { science: 'Its two brightest stars were once the claws of the scorpion next door.', story: 'The scales of justice, held by Virgo, the only zodiac sign that is an object rather than a creature.' },
  Lyr: { science: 'Holds Vega and the Ring Nebula, a shell of gas thrown off by a dying star.', story: 'The lyre of Orpheus, whose music could charm stones and even the gods of the underworld.' },
  Oph: { science: 'The Sun passes through it each December, though it is not one of the traditional zodiac signs.', story: 'The serpent-bearer, Asclepius, a healer so skilled he could raise the dead.' },
  Ori: { science: 'Below the belt hangs the Orion Nebula, a stellar nursery 1,300 light-years away, visible by eye as a fuzzy star.', story: 'The hunter. In Greek myth he is chased forever by the scorpion, which rises as he sets. The Lakota see a hand here, with the belt as its wrist.' },
  Peg: { science: 'Its Great Square is a signpost for the autumn sky. 51 Pegasi was the first Sun-like star found with a planet, in 1995.', story: 'The winged horse, born from Medusa\'s blood, ridden by Bellerophon.' },
  Per: { science: 'The Perseid meteors, the most popular shower, seem to come from here every August.', story: 'The hero Perseus, holding Medusa\'s head. Its eye is the winking star Algol.' },
  Psc: { science: 'The Sun is here at the March equinox now, the point from which the sky\'s longitude is counted.', story: 'Two fish tied together by their tails: Aphrodite and Eros, escaping the monster Typhon.' },
  PsA: { science: 'Holds Fomalhaut, which has a vast belt of icy dust and perhaps planets.', story: 'The southern fish, drinking the water poured by Aquarius.' },
  Sco: { science: 'Lies in the thick of the Milky Way, toward the centre of our galaxy.', story: 'The scorpion that killed Orion. For Māori and Hawaiians it is the fishhook of Maui.' },
  Sgr: { science: 'The centre of our galaxy, with its black hole of four million suns, lies just off the spout of its Teapot.', story: 'An archer, half man and half horse, aiming at the heart of the scorpion.' },
  Tau: { science: 'Holds the Pleiades and the Hyades, the two nearest bright star clusters, and the Crab Nebula, left by a supernova seen in 1054.', story: 'The bull Zeus became to carry off Europa. The Pleiades were the Seven Sisters in Greek, Aboriginal and Kiowa stories alike.' },
  Tri: { science: 'Holds the Triangulum Galaxy, about 3 million light-years away, among the farthest things visible by eye.', story: 'One of the oldest Greek figures, sometimes seen as the delta of the Nile.' },
  UMa: { science: 'Five of the Big Dipper\'s stars are a family, the Ursa Major moving group, travelling through space together.', story: 'A bear for the Greeks and many Native American peoples; a plough in Britain, a wagon in much of Europe, and the Seven Sages, or Saptarishi, in India.' },
  UMi: { science: 'The end of its handle is Polaris, less than a degree from the north celestial pole.', story: 'The Little Bear. Sailors once called it Cynosura, the dog\'s tail, which gave English the word cynosure, a guiding light.' },
  Vir: { science: 'Toward Virgo lies a cluster of more than a thousand galaxies, the heart of our local supercluster.', story: 'The maiden holding an ear of wheat, linked to the harvest goddesses Demeter and Persephone.' },
  Vul: { science: 'Holds the Dumbbell Nebula, and the first pulsar was found in this patch of sky in 1967.', story: 'A little fox, added in the 1680s by Johannes Hevelius.' },
  Lep: { science: 'Just south of Orion, with the deep-red Hind\'s Crimson Star.', story: 'A hare, the prey of Orion and his dogs.' },
  Gru: { science: 'A southern crane with a long, curving neck of stars.', story: 'Added by Dutch navigators in the 1590s, when they first charted the southern sky.' },
  Car: { science: 'Holds Canopus and the Carina Nebula, where Eta Carinae, a giant unstable star, flared up in the 1840s.', story: 'The keel of the Argo, Jason\'s ship, which the old sky held as one huge constellation.' },
};

/** The lore for an object, shown on its Atlas page. */
export function loreFor(u: Universe, obj: SkyObject, bodyScience: (o: SkyObject) => string | null): Lore {
  if (obj.body) return { science: bodyScience(obj) ?? undefined, story: BODY_STORIES[obj.ref] };
  if (obj.starIndex !== undefined) {
    const lore = STAR_LORE[u.stars.hip[obj.starIndex]];
    return { science: lore?.science, story: lore?.story };
  }
  if (obj.constellation?.iau && obj.ref.startsWith('con:western:')) return CONSTELLATION_LORE[obj.constellation.iau] ?? {};
  return {};
}
