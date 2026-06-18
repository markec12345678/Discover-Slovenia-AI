import type { Destination } from "./types";

// Single source of truth za slovenske destinacije.
// 12 najboljših destinacij, pokriva vse regije.
export const DESTINATIONS: Destination[] = [
  {
    id: "bled",
    slug: "bled",
    name: "Bled",
    tagline: "Biser Alp s srednjeveškim gradom in otokom",
    region: "alpine",
    type: "lake",
    description:
      "Blejsko jezero s svojim edinstvenim otokom, na katerem stoji cerkev z zvonikom, je najbolj prepoznavna slovenska razglednica. Srednjeveški grad na pečini ponuja panoramske poglede, Vintgarska soteska pa kratek sprehod skozi apnenec ob umirjeni reki. Kremšnita v slaščičarni ob jezeru je obvezen sladki greh.",
    highlights: ["Blejski otok", "Blejski grad", "Vintgarska soteska", "Kremšnita"],
    activities: ["Pletna vožnja do otoka", "Obisk gradu", "Sprehod po soteski", "Plavanje"],
    bestFor: ["romantika", "družina", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1502989649865-81233767fe55?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.3683, lng: 14.0944 },
    rating: 4.8,
    budget: "€€",
    duration: "1-2 dni",
    costPerPerson: 25,
    featured: true,
  },
  {
    id: "bohinj",
    slug: "bohinj",
    name: "Bohinj",
    tagline: "Divja, nedotaknjena lepota Triglavskega narodnega parka",
    region: "alpine",
    type: "lake",
    description:
      "Bohinjsko jezero je večji in bolj divji brat Blejskega jezera, znotraj Triglavskega narodnega parka. Žičnica Vogel ponuja panoramske poglede na Julijce, slap Savica pa je kratek pohod skozi gozd. Idealno za tiste, ki iščejo mir in aktivno naravo.",
    highlights: ["Bohinjsko jezero", "Vogel", "Slap Savica", "Triglavski narodni park"],
    activities: ["Pohodništvo", "Smučanje", "Kajakaštvo", "Žičnica Vogel"],
    bestFor: ["narava", "aktivnosti", "mir"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image:
      "https://images.unsplash.com/photo-1531366936337-7c912a4589a7?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.2833, lng: 13.8833 },
    rating: 4.7,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 15,
    featured: true,
  },
  {
    id: "ljubljana",
    slug: "ljubljana",
    name: "Ljubljana",
    tagline: "Zelena, ustvarjalna prestolnica z zmajevim mostom",
    region: "central",
    type: "city",
    description:
      "Ljubljana je majhna, a živahna prestolnica, kjer se mešata srednjeveška arhitektura in sodobna kulinarična scena. Ljubljanski grad nudi panoramski pogled, Prešernov trg z zmajevim mostom je srce mesta, ob Ljubljanici pa se odvija kava in klepet.",
    highlights: ["Ljubljanski grad", "Zmajev most", "Prešernov trg", "Tivoli park"],
    activities: ["Obisk gradu", "Sprehod po starem mestu", "Kulinarična tura", "Kolo ob Ljubljanici"],
    bestFor: ["kultura", "hrana", "mesto"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1567361047-2d0b2e9c9f3e?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.0569, lng: 14.5058 },
    rating: 4.6,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 20,
    featured: true,
  },
  {
    id: "postojna",
    slug: "postojnska-jama",
    name: "Postojnska jama",
    tagline: "24 km podzemnih rovov in vilinsko kraljestvo kapnikov",
    region: "karst",
    type: "cave",
    description:
      "Postojnska jama je največji turistični jamski sistem v Evropi z edinstvenim podzemnim vlakcem. V njej bivala tudi človeška ribica — endemit, ki je navdihnil legende o zmajevih mladičih. Predjamski grad, vklesan v 123-metrsko pečino, je le 9 km stran.",
    highlights: ["Podzemno vlakec", "Kapniki", "Človeška ribica", "Predjamski grad"],
    activities: ["Jamska tura z vlakcem", "Obisk Predjamskega gradu", "Fotografija"],
    bestFor: ["družina", "avantura", "narava"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image:
      "https://images.unsplash.com/photo-1542884748-2b87b36c6b90?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 45.7845, lng: 14.2045 },
    rating: 4.7,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 30,
    featured: true,
  },
  {
    id: "piran",
    slug: "piran",
    name: "Piran",
    tagline: "Slovenske Benetke s kamnitimi uličicami in Tartinijevim trgom",
    region: "coastal",
    type: "coast",
    description:
      "Piran je obmorsko mestece beneškega videza, kjer se ozke uličice stiskajo med kamnitimi hišami. Tartinijev trg, glavni trg z marmornatimi tlaki, je posvečen violinistu Giuseppu Tartiniju. Cerkev sv. Jurija na hribu ponuja pogled na Jadransko morje.",
    highlights: ["Tartinijev trg", "Cerkev sv. Jurija", "Obala", "Stare uličice"],
    activities: ["Sprehod po starem mestu", "Sončni zahod", "Morska hrana", "Obisk solin"],
    bestFor: ["romantika", "kultura", "hrana"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1533927559590-9d6bcae3e3a0?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 45.5233, lng: 13.5676 },
    rating: 4.7,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 35,
    featured: true,
  },
  {
    id: "soca",
    slug: "reka-soca",
    name: "Reka Soča",
    tagline: "Smaragdna reka med Julijci za adrenalinske avanture",
    region: "alpine",
    type: "river",
    description:
      "Soča je ena redkih rek, ki ohranja svojo smaragdno barvo skozi vse leto. Vije se skozi Tolmin in Bovec, kjer ponuja vrhunsko rafting, kajakaštvo in canyoning. Vmes so korita Soče — naravni bazeni, vrezani v apnenec, idealni za poletno osvežitev.",
    highlights: ["Korita Soče", "Bovec", "Tolmin", "Trdnjava Kluže"],
    activities: ["Rafting", "Kajakaštvo", "Canyoning", "Zip-line"],
    bestFor: ["adrenalin", "narava", "poletje"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.3447, lng: 13.7332 },
    rating: 4.8,
    budget: "€€",
    duration: "2-3 dni",
    costPerPerson: 40,
    featured: true,
  },
  {
    id: "triglav",
    slug: "triglav",
    name: "Triglav",
    tagline: "2864 m visok simbol naroda z neštetimi potmi",
    region: "alpine",
    type: "mountain",
    description:
      "Triglav je najvišji vrh Slovenije in narodni simbol, ki krasa državni grb. Vzpon zahteva tehnično pohodništvo, a ob pogoju dobre priprave je dosegljiv v enih ali dveh dneh. Na vrhu stoji Aljažev stolp — najvišje ležeče zatočišče v državi.",
    highlights: ["Vrh 2864 m", "Aljažev stolp", "Triglavska roža", "Pohodništvo"],
    activities: ["Pohodništvo", "Alpinizem", "Fotografija"],
    bestFor: ["avantura", "pohodništvo", "narava"],
    bestSeason: ["summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.3794, lng: 13.8462 },
    rating: 4.9,
    budget: "€",
    duration: "2 dni",
    costPerPerson: 15,
    featured: false,
  },
  {
    id: "kobarid",
    slug: "kobarid",
    name: "Kobarid",
    tagline: "Zgodovina, Soška fronta in kulinarika v eni vasi",
    region: "alpine",
    type: "city",
    description:
      "Kobarid je vasica ob Soči, znana po Kobaridskem muzeju, ki dokumentira krvavo Soško fronto prve svetovne vojne. Napoleonov most čez Sočo in Kolovrat ponujata panoramske poglede. Hiša Franko, ena najboljših restavrac v regiji, prinaša sodobno tolminsko kuhinjo.",
    highlights: ["Kobaridski muzej", "Napoleonov most", "Kolovrat", "Hiša Franko"],
    activities: ["Muzej", "Pohodništvo", "Kulinarična izkušnja", "Kolo ob Soči"],
    bestFor: ["zgodovina", "hrana", "narava"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1520637836862-4d197d17c43a?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.2453, lng: 13.5864 },
    rating: 4.5,
    budget: "€€",
    duration: "1 dan",
    costPerPerson: 25,
    featured: false,
  },
  {
    id: "maribor",
    slug: "maribor",
    name: "Maribor",
    tagline: "Drugo največje mesto z najstarejšo trto na svetu",
    region: "pannonian",
    type: "city",
    description:
      "Maribor leži ob Dravi, obkrožen z vinogradi Pohorja. Stara trta, stara več kot 400 let, je vpisana v Guinnessovo knjigo rekordov. Mesto ponuja živahno staro mestno jedro, vinogradniške lance Pohorja in smučanje pozimi.",
    highlights: ["Stara trta", "Pohorje", "Glavni trg", "Vinogradništvo"],
    activities: ["Obisk Stare trte", "Smučanje Pohorje", "Vinska degustacija", "Staro mesto"],
    bestFor: ["kultura", "vino", "smučanje"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image:
      "https://images.unsplash.com/photo-1518684079-3c830dcef090?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.5547, lng: 15.6459 },
    rating: 4.4,
    budget: "€",
    duration: "1-2 dni",
    costPerPerson: 20,
    featured: false,
  },
  {
    id: "portoroz",
    slug: "portoroz",
    name: "Portorož",
    tagline: "Slovensko obmorsko letovišče s Casino in wellness",
    region: "coastal",
    type: "coast",
    description:
      "Portorož je najbolj znano slovensko obmorsko letovišče z dolgo peščeno plažo, hoteli z wellness centri in Casinojem. Obalne sprehajališče povezuje Portorož s Piranom, soline Sečovlje pa nudijo edinstveno naravno izkušnjo in wellness z blatom.",
    highlights: ["Plaža", "Casino", "Soline Sečovlje", "Wellness"],
    activities: ["Plavanje", "Wellness", "Igre na srečo", "Kolo ob morju"],
    bestFor: ["poletje", "wellness", "družina"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 45.5142, lng: 13.5922 },
    rating: 4.3,
    budget: "€€€",
    duration: "2-3 dni",
    costPerPerson: 60,
    featured: false,
  },
  {
    id: "vintgar",
    slug: "vintgarska-soteska",
    name: "Vintgarska soteska",
    tagline: "Kratek sprehod skozi apnenec ob umirjeni reki",
    region: "alpine",
    type: "gorge",
    description:
      "Vintgarska soteska je 1,6 km dolga soteska ob reki Radovni, le 4 km od Bleda. Lesene poti vodijo ob kristalno čisti vodi, mimo slapa in naravnih bazenov. Sprehod traja približno eno uro in je primeren za vse starosti.",
    highlights: ["Slap Šum", "Lesene poti", "Kristalna voda", "Naravni bazeni"],
    activities: ["Sprehod", "Fotografija", "Opazovanje narave"],
    bestFor: ["družina", "narava", "fotografija"],
    bestSeason: ["spring", "summer", "autumn"],
    image:
      "https://images.unsplash.com/photo-1473773508845-188df298d2d1?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.4, lng: 14.1167 },
    rating: 4.6,
    budget: "€",
    duration: "1 dan",
    costPerPerson: 10,
    featured: false,
  },
  {
    id: "rogaska",
    slug: "rogaska-slatina",
    name: "Rogaška Slatina",
    tagline: "Najstarejše slovensko zdravilišče z mineralno vodo",
    region: "pannonian",
    type: "spa",
    description:
      "Rogaška Slatina je elegantno zdravilišče z 400-letno tradicijo, znano po mineralni vodi Donat Mg z najvišjo vsebnostjo magnezija na svetu. Secesijska arhitektura, parki in wellness centri nudijo sprostitev skozi vse leto.",
    highlights: ["Donat Mg", "Secesijska arhitektura", "Grand hotel", "Wellness"],
    activities: ["Wellness", "Pitje mineralne vode", "Sprehodi po parku", "Masaže"],
    bestFor: ["wellness", "sprostitev", "zdravje"],
    bestSeason: ["spring", "summer", "autumn", "winter"],
    image:
      "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200&h=800&fit=crop&q=80",
    coords: { lat: 46.3231, lng: 15.6422 },
    rating: 4.4,
    budget: "€€€",
    duration: "2 dni",
    costPerPerson: 80,
    featured: false,
  },
];

// Pomožne funkcije za iskanje
export function getDestinationById(id: string): Destination | undefined {
  return DESTINATIONS.find((d) => d.id === id);
}

export function getFeaturedDestinations(): Destination[] {
  return DESTINATIONS.filter((d) => d.featured);
}

export function getDestinationsByRegion(region: string): Destination[] {
  return DESTINATIONS.filter((d) => d.region === region);
}

export const REGIONS: { value: string; label: string }[] = [
  { value: "alpine", label: "Alpska Slovenija" },
  { value: "coastal", label: "Obala" },
  { value: "central", label: "Osrednja Slovenija" },
  { value: "karst", label: "Kras" },
  { value: "pannonian", label: "Panonska Slovenija" },
];

export const INTERESTS: { value: string; label: string; icon: string }[] = [
  { value: "narava", label: "Narava", icon: "🌿" },
  { value: "kultura", label: "Kultura", icon: "🏛️" },
  { value: "hrana", label: "Hrana & vino", icon: "🍷" },
  { value: "avantura", label: "Avantura", icon: "🧗" },
  { value: "adrenalin", label: "Adrenalin", icon: "⚡" },
  { value: "romantika", label: "Romantika", icon: "❤️" },
  { value: "družina", label: "Družina", icon: "👨‍👩‍👧" },
  { value: "wellness", label: "Wellness", icon: "💆" },
];
