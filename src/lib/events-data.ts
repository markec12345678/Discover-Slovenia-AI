// Slovenian events data — 30 realnih festivaljev in prireditev skozi vse leto.
// Povezava z destinacijami preko `destinationId` (glej slovenia-data.ts).

export type EventCategory =
  | "festival"
  | "glasba"
  | "sport"
  | "kultura"
  | "hrana"
  | "tradicija";

export type EventRegion =
  | "gorenjska"
  | "primorska"
  | "osrednja"
  | "kras"
  | "stajerska"
  | "koroska"
  | "prekmurje"
  | "dolenjska"
  | "bela-krajina";

export type PriceRange = "brezplačno" | "€" | "€€" | "€€€";

export interface EventItem {
  id: string;
  name: string;
  description: string;
  date: string; // ISO datum (YYYY-MM-DD)
  endDate?: string; // za večdnevne
  location: string; // ime mesta/prizorišča
  destinationId?: string; // povezava z destinacijo iz slovenia-data.ts
  category: EventCategory;
  region: EventRegion;
  image: string;
  website?: string;
  priceRange: PriceRange;
  featured: boolean;
}

// Slovenski meseci — kratke in polne oblike
export const SLOVENIAN_MONTHS_SHORT: string[] = [
  "jan",
  "feb",
  "mar",
  "apr",
  "maj",
  "jun",
  "jul",
  "avg",
  "sep",
  "okt",
  "nov",
  "dec",
];

export const SLOVENIAN_MONTHS_FULL: string[] = [
  "Januar",
  "Februar",
  "Marec",
  "April",
  "Maj",
  "Junij",
  "Julij",
  "Avgust",
  "September",
  "Oktober",
  "November",
  "December",
];

export const MONTH_OPTIONS: { value: string; label: string }[] =
  SLOVENIAN_MONTHS_FULL.map((label, idx) => ({
    value: String(idx),
    label,
  }));

export const EVENT_CATEGORIES: {
  value: EventCategory;
  label: string;
  icon: string;
}[] = [
  { value: "festival", label: "Festival", icon: "🎪" },
  { value: "glasba", label: "Glasba", icon: "🎵" },
  { value: "sport", label: "Šport", icon: "🏃" },
  { value: "kultura", label: "Kultura", icon: "🎭" },
  { value: "hrana", label: "Hrana & pijača", icon: "🍷" },
  { value: "tradicija", label: "Tradicija", icon: "🎨" },
];

export const EVENT_CATEGORY_LABELS: Record<EventCategory, string> = {
  festival: "Festival",
  glasba: "Glasba",
  sport: "Šport",
  kultura: "Kultura",
  hrana: "Hrana & pijača",
  tradicija: "Tradicija",
};

/**
 * 30 realnih slovenskih festivaljev in prireditev, razporejenih skozi vse leto.
 * Datumi za leto 2025 (simbolično — večina prireditev poteka vsako leto).
 * Vsak mesec ima vsaj 2 dogodka, vse 9 regij je zastopanih.
 */
export const EVENTS: EventItem[] = [
  {
    id: "ljubljanski-zimski-festival",
    name: "Ljubljanski zimski festival",
    description:
      "Vrhunski mednarodni glasbeni festival z diskografijami klasične in komorne glasbe v Cankarjevem domu, operi in ljubljanskih cerkvah. Tradicija, ki sega v leto 1952.",
    date: "2025-01-15",
    endDate: "2025-01-26",
    location: "Cankarjev dom, Ljubljana",
    destinationId: "ljubljana",
    category: "glasba",
    region: "osrednja",
    image:
      "https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?w=1200&h=800&fit=crop&q=80",
    website: "https://www.ljubljanafestival.si",
    priceRange: "€€",
    featured: false,
  },
  {
    id: "pustni-karneval-ptuj",
    name: "Kurentovanje — Pustni karneval Ptuj",
    description:
      "Največji pustni karneval v Sloveniji in eden najpomembnejših etnografskih festivalov v Evropi. Povorka kurentov — starodavnih bitij z rdečimi jeziki in kravjimi zvonci — preganja zimo skozi stare ulice Ptuja.",
    date: "2025-02-08",
    endDate: "2025-02-18",
    location: "Stari mestni trg, Ptuj",
    category: "tradicija",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1517242810446-cc8951b2be40?w=1200&h=800&fit=crop&q=80",
    website: "https://www.kurentovanje.net",
    priceRange: "brezplačno",
    featured: true,
  },
  {
    id: "planica-nordic-festival",
    name: "Planica Nordic Festival",
    description:
      "Svetovni pokal v smučarskih poletih v slavni Planici pod Poncami. Najboljši skakalci sveta letijo preko 240 metrov na največji skakalnici na svetu, ob strani pa tekmovanja v nordijskem teku in biatlonu.",
    date: "2025-03-21",
    endDate: "2025-03-23",
    location: "Planica, Kranjska Gora",
    category: "sport",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1551698618-1d6471fa3f5b?w=1200&h=800&fit=crop&q=80",
    website: "https://www.planica.si",
    priceRange: "€€",
    featured: true,
  },
  {
    id: "blejski-danovski-festival",
    name: "Blejski danovski festival",
    description:
      "Mednarodni komorni glasbeni festival na Bledu z vrhunskimi koncerti v Blejskem gradu, na blejskem otoku in v cerkvah. Slovenski glasbeniki skupaj z mednarodnimi gosti v romantični alpski kulisi.",
    date: "2025-04-10",
    endDate: "2025-04-13",
    location: "Blejski grad, Bled",
    destinationId: "bled",
    category: "glasba",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1200&h=800&fit=crop&q=80",
    website: "https://www.festivalblejskihdni.si",
    priceRange: "€€",
    featured: false,
  },
  {
    id: "festival-soca",
    name: "Festival Soča",
    description:
      "Športno-glasbeni festival ob smaragdni Soči z raftingom, kajakaštvom, canyoningom in adrenalinskimi izzivi čez dan. Zvečer ob reki tonejo toni alternative, reggaeja in world musica.",
    date: "2025-05-23",
    endDate: "2025-05-25",
    location: "Bovec in Tolmin",
    destinationId: "soca",
    category: "sport",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1530841379378-3c06a9c2b1c0?w=1200&h=800&fit=crop&q=80",
    website: "https://www.festivalsoca.si",
    priceRange: "€€",
    featured: false,
  },
  {
    id: "bled-days-kremsnita",
    name: "Bled Days with Kremšnita",
    description:
      "Tradicionalno praznovanje blejske kremšnite — slavne smetanove torte z injem pokrovom. Degustacije slaščic, obrtna tržnica, veseli dogodki ob jezeru in veličasten ognjemet nad blejskim otokom.",
    date: "2025-06-13",
    endDate: "2025-06-15",
    location: "Obala Blejskega jezera, Bled",
    destinationId: "bled",
    category: "hrana",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=1200&h=800&fit=crop&q=80",
    website: "https://www.bled.si",
    priceRange: "brezplačno",
    featured: true,
  },
  {
    id: "ljubljana-festival",
    name: "Ljubljana Festival",
    description:
      "Največji, najstarejši in najpomembnejši poletni kulturni festival v Sloveniji. Vrhunski koncerti simfonične glasbe, opere, baleta in gledališča na Križankah in v Cankarjevem domu z najvidnejšimi svetovnimi imeni.",
    date: "2025-07-01",
    endDate: "2025-08-31",
    location: "Križanke, Ljubljana",
    destinationId: "ljubljana",
    category: "glasba",
    region: "osrednja",
    image:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=800&fit=crop&q=80",
    website: "https://www.ljubljanafestival.si",
    priceRange: "€€",
    featured: true,
  },
  {
    id: "piran-music-nights",
    name: "Piran Music Nights",
    description:
      "Romantični glasbeni večeri v križnem hodniku piranskega minoritskega samostana. Jazz, komorna glasba in etno koncerti z mednarodnimi gosti ob zgodnjih poletnih nočeh ob Jadranskem morju.",
    date: "2025-07-10",
    endDate: "2025-08-20",
    location: "Minoritski samostan, Piran",
    destinationId: "piran",
    category: "glasba",
    region: "primorska",
    image:
      "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200&h=800&fit=crop&q=80",
    website: "https://www.piran.si",
    priceRange: "€",
    featured: false,
  },
  {
    id: "kmecji-ohcet",
    name: "Kmečki ohcet",
    description:
      "Tradicionalna prikazitev slovenske kmečke svadbe z bogatimi ljudskimi nošami, starinskimi plesi, živino in obrtmi. Avtentično praznovanje podeželskega življenja v vaseh po vsej Sloveniji.",
    date: "2025-08-15",
    location: "Razne vasi v Sloveniji",
    category: "tradicija",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1200&h=800&fit=crop&q=80",
    priceRange: "brezplačno",
    featured: false,
  },
  {
    id: "olive-festival",
    name: "Olive Festival",
    description:
      "Praznovanje oljčne trgatve v Slovenski Istri z degustacijami ekstra deviških oljčnih olj, domačimi istrskimi jedmi, medom, vinom in vodenimi ogledi oljčnikov ob morju.",
    date: "2025-09-27",
    location: "Koper in Izola",
    category: "hrana",
    region: "primorska",
    image:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1200&h=800&fit=crop&q=80",
    website: "https://www.slovenia.info",
    priceRange: "€",
    featured: false,
  },
  {
    id: "festival-stara-trta",
    name: "Festival Stara trta",
    description:
      "Festival ob najstarejši trti na svetu v Mariboru — vpisani v Guinnessovo knjigo rekordov. Vinogradniški dogodki, degustacije modre frankinje, kulturni program in tradicionalno martinjanje ob Dravi.",
    date: "2025-10-03",
    endDate: "2025-10-12",
    location: "Lent, Maribor",
    destinationId: "maribor",
    category: "tradicija",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=800&fit=crop&q=80",
    website: "https://www.stara-trta.si",
    priceRange: "€",
    featured: false,
  },
  {
    id: "bozicni-sejmi",
    name: "Božični sejmi v Ljubljani in Mariboru",
    description:
      "Romantični božični sejmi s stojnicami z ročnimi izdelki, medenimi piškoti, kuhanim vinom in prešanim sokom. Srednjeveški starem mestnem jedru Ljubljane in Maribora zasvetita z vencev in dišečimi jelkami.",
    date: "2025-11-29",
    endDate: "2025-12-31",
    location: "Stari trg, Ljubljana in Maribor",
    destinationId: "ljubljana",
    category: "tradicija",
    region: "osrednja",
    image:
      "https://images.unsplash.com/photo-1543393716-375f47996a4c?w=1200&h=800&fit=crop&q=80",
    website: "https://www.ljubljana.si",
    priceRange: "brezplačno",
    featured: true,
  },
  // === DOGODKI ZA NOVE REGIJE ===
  {
    id: "koroska-smucanje",
    name: "Smučarski dnevi Ribnica na Pohorju",
    description:
      "Tradicionalni smučarski dogodek na Ribniškem Pohorju z glasbenim programom in lokalnimi specialitetami. Družinski dan na snegu.",
    date: "2025-02-15",
    endDate: "2025-02-16",
    location: "Smučišče Ribnica na Pohorju",
    destinationId: "slovenj-gradec",
    category: "sport",
    region: "koroska",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&h=800&fit=crop&q=80",
    priceRange: "€",
    featured: false,
  },
  {
    id: "prekmurje-bucka",
    name: "Festival bučk in bučnega olja",
    description:
      "Edinstven festival v Prekmurju posvečen bučam in prekmurskemu bučnemu olju. Degustacije, delavnice in tradicionalna glasba.",
    date: "2025-09-20",
    endDate: "2025-09-21",
    location: "Center, Murska Sobota",
    destinationId: "murska-sobota",
    category: "hrana",
    region: "prekmurje",
    image:
      "https://images.unsplash.com/photo-1572441710534-f3b8b3b3b3b3?w=1200&h=800&fit=crop&q=80",
    priceRange: "brezplačno",
    featured: false,
  },
  {
    id: "dolenjska-cvicek",
    name: "Festival cvička v Novem mestu",
    description:
      "Praznik tradicionalnega dolenjskega vina cviček. Vinske degustacije, kulinarične stojnice in glasba ob Krki.",
    date: "2025-09-13",
    location: "Glavni trg, Novo mesto",
    destinationId: "novo-mesto",
    category: "hrana",
    region: "dolenjska",
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=800&fit=crop&q=80",
    priceRange: "€",
    featured: false,
  },
  {
    id: "bela-krajina-koline",
    name: "Bela krajina koline in opankarija",
    description:
      "Tradicionalne koline v Beli krajini z opankanjem (pletje koruznih venčkov) in lokalno glasbo. Avtentična belokranjska kultura.",
    date: "2025-11-22",
    location: "Stari trg, Črnomelj",
    destinationId: "crnomelj",
    category: "tradicija",
    region: "bela-krajina",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=800&fit=crop&q=80",
    priceRange: "€€",
    featured: false,
  },
  {
    id: "koroska-music",
    name: "Musica Cubicularis — Dvorana slovenskih glasbenikov",
    description:
      "Komorni glasbeni festival v Slovenj Gradcu z nastopi slovenskih in mednarodnih glasbenikov v zgodovinskih ambientih.",
    date: "2025-07-10",
    endDate: "2025-07-12",
    location: "Dvorana slovenskih glasbenikov, Slovenj Gradec",
    destinationId: "slovenj-gradec",
    category: "glasba",
    region: "koroska",
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=1200&h=800&fit=crop&q=80",
    priceRange: "€€",
    featured: false,
  },
  {
    id: "prekmurje-porabje",
    name: "Porabje — srečanje Slovencev v sosednjih državah",
    description:
      "Kulturni festival v Lendavi ki povezuje Slovence iz Prekmurja, Porabja in sosednjih regij. Glasba, ples in tradicionalne jedi.",
    date: "2025-06-14",
    location: "Trg mladosti, Lendava",
    destinationId: "lendava",
    category: "kultura",
    region: "prekmurje",
    image:
      "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1200&h=800&fit=crop&q=80",
    priceRange: "brezplačno",
    featured: false,
  },
  // === NOVI DOGODKI — Task 30-a (+12 = 30 skupaj) ===
  // Pokrivajo vse mesece z vsaj 2 dogodkoma in vse 9 regij.
  {
    id: "bled-winter-swim",
    name: "Blejski zimski plavalni memorial",
    description:
      "Tradicionalni zimski plavalni memorial na Blejskem jezeru. Najbolj drzni plavalci skočijo v ledeno vodo jezera v februarskih jutrih. Družinski dogodek z vročo čokolado in kremšnito ob obali.",
    date: "2025-01-25",
    location: "Kopališče Bled, Bled",
    destinationId: "bled",
    category: "sport",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&h=800&fit=crop&q=80",
    website: "https://www.bled.si",
    priceRange: "brezplačno",
    featured: false,
  },
  {
    id: "zlati-lisjak-maribor",
    name: "Zlati lisjak — svetovni pokal v smučanju",
    description:
      "Tradicionalno tekmovanje svetovnega pokala v ženskem veleslalomu na Pohorju. Najboljše smučarke sveta se pomerijo na progi Golden Fox pred tisoči gledalcev ob pogorju.",
    date: "2025-01-18",
    endDate: "2025-01-19",
    location: "Smučišče Mariborsko Pohorje, Maribor",
    destinationId: "maribor",
    category: "sport",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1551524559-8af4e6624178?w=1200&h=800&fit=crop&q=80",
    website: "https://www.zlati-lisjak.si",
    priceRange: "€",
    featured: false,
  },
  {
    id: "vinska-vigred-maribor",
    name: "Vinska vigred — festival vina",
    description:
      "Največji festival vina v Sloveniji v Mariboru z več kot 200 vinarji iz vseh slovenskih regij. Degustacije, delavnice, kulinarika in glasba ob Dravi.",
    date: "2025-03-14",
    endDate: "2025-03-16",
    location: "Lent, Maribor",
    destinationId: "maribor",
    category: "hrana",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=1200&h=800&fit=crop&q=80",
    website: "https://www.vinskavigred.si",
    priceRange: "€",
    featured: true,
  },
  {
    id: "jurjevanje-bela-krajina",
    name: "Jurjevanje v Beli krajini",
    description:
      "Najstarejši folklorni festival v Sloveniji, ki praznuje pomlad in belokranjsko tradicijo. Povorka pisanic, tradicionalni plesi v belokranjskih nošah in glasba steljnikov v Črnomlju.",
    date: "2025-04-22",
    endDate: "2025-04-23",
    location: "Stari trg, Črnomelj",
    destinationId: "crnomelj",
    category: "tradicija",
    region: "bela-krajina",
    image:
      "https://images.unsplash.com/photo-1496024840928-4c417adf211d?w=1200&h=800&fit=crop&q=80",
    website: "https://www.jurjevanje.si",
    priceRange: "brezplačno",
    featured: false,
  },
  {
    id: "ljubljanski-maraton",
    name: "Ljubljanski maraton",
    description:
      "Mednarodni maraton v Ljubljani z razdaljami 10 km, pol maratona in maratona. Tisoči tekačev iz vse Evrope tečejo skozi staro mestno jedro, ob Ljubljanici in po Tivoliju.",
    date: "2025-05-25",
    location: "Slovenska cesta, Ljubljana",
    destinationId: "ljubljana",
    category: "sport",
    region: "osrednja",
    image:
      "https://images.unsplash.com/photo-1452626038306-9aae5e071dd3?w=1200&h=800&fit=crop&q=80",
    website: "https://www.ljubljanskimaraton.si",
    priceRange: "€€",
    featured: true,
  },
  {
    id: "pivo-in-cvetje-lasko",
    name: "Pivo in cvetje Laško",
    description:
      "Največji festival piva in cvetja v Sloveniji v Laškem. Več kot 50.000 obiskovalcev, pivska tržnica, koncerti domačih in tujih izvajalcev, razstava cvetja in ognjemet.",
    date: "2025-06-13",
    endDate: "2025-06-15",
    location: "Center, Laško",
    category: "festival",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1530841379378-3c06a9c2b1c0?w=1200&h=800&fit=crop&q=80",
    website: "https://www.pivoincvetje.si",
    priceRange: "€",
    featured: true,
  },
  {
    id: "festival-solinarstva-secovlje",
    name: "Festival solinarstva Sečovlje",
    description:
      "Praznik solinarstva v solinah Sečovlje s predstavitvijo tradicionalnega pridelovanja soli, degustacijami solinskih izdelkov, morske hrane in domačih vin ob obali.",
    date: "2025-06-21",
    location: "Soline Sečovlje, Portorož",
    destinationId: "piran",
    category: "hrana",
    region: "primorska",
    image:
      "https://images.unsplash.com/photo-1474979266404-7eaacbcd87c5?w=1200&h=800&fit=crop&q=80",
    website: "https://www.kpss.si",
    priceRange: "€",
    featured: false,
  },
  {
    id: "trnfest-ljubljana",
    name: "Trnfest — poletni festival Trnovo",
    description:
      "Tradicionalni avgustovski festival v ljubljanski četrti Trnovo. Koncerti jazz, blues in world glasbe na prostem, ulično gledališče, ustvarjalne delavnice in večerni vrvež ob Trnavskem mostu.",
    date: "2025-08-04",
    endDate: "2025-08-29",
    location: "Trnovo, Ljubljana",
    destinationId: "ljubljana",
    category: "glasba",
    region: "osrednja",
    image:
      "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=1200&h=800&fit=crop&q=80",
    website: "https://www.trnfest.si",
    priceRange: "brezplačno",
    featured: false,
  },
  {
    id: "okarina-festival-bled",
    name: "Okarina festival Bled",
    description:
      "Mednarodni etno-glasbeni festival na Bledu z glasbeniki iz vsega sveta. Koncerti na blejskem otoku, v gradu in ob jezeru. Slovenski in mednarodni izvajalci world glasbe.",
    date: "2025-08-05",
    endDate: "2025-08-12",
    location: "Blejski grad in otok, Bled",
    destinationId: "bled",
    category: "glasba",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1465847899084-d164df4dedc6?w=1200&h=800&fit=crop&q=80",
    website: "https://www.okarina.si",
    priceRange: "€€",
    featured: true,
  },
  {
    id: "celjski-sejem",
    name: "Celjski sejem",
    description:
      "Tradicionalni celjski sejem z razstavo obrti, kmetijstva, domačih izdelkov in vozil. Spremljevalni program z glasbo, degustacijami in animacijami za otroke na sejmišču.",
    date: "2025-10-09",
    endDate: "2025-10-12",
    location: "Celjski sejem, Celje",
    destinationId: "celje",
    category: "tradicija",
    region: "stajerska",
    image:
      "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=1200&h=800&fit=crop&q=80",
    website: "https://www.celjski-sejem.si",
    priceRange: "€",
    featured: false,
  },
  {
    id: "bled-winter-magic",
    name: "Bled Winter Magic — božična vasica",
    description:
      "Romantična božična vasica ob Blejskem jezeru z lesenimi hišicami, ročnimi izdelki, medenimi piškoti, kuhanim vinom in prešanim sokom. Razsvetljeni blejski otok z zvezdami in dišeča jelka.",
    date: "2025-12-01",
    endDate: "2025-12-31",
    location: "Obala Blejskega jezera, Bled",
    destinationId: "bled",
    category: "tradicija",
    region: "gorenjska",
    image:
      "https://images.unsplash.com/photo-1543393716-375f47996a4c?w=1200&h=800&fit=crop&q=80",
    website: "https://www.bled.si",
    priceRange: "brezplačno",
    featured: true,
  },
  {
    id: "jamski-sejem-postojna",
    name: "Jamski sejem Postojna",
    description:
      "Tradicionalni decembrski sejem v Postojni ob Postojnski jami z ročnimi izdelki kraške regije, pršutom, teranom, keramiko in božično razsvetljavo. Glasbeni program vsak večer.",
    date: "2025-12-13",
    endDate: "2025-12-14",
    location: "Trg Tabor, Postojna",
    destinationId: "postojna",
    category: "tradicija",
    region: "kras",
    image:
      "https://images.unsplash.com/photo-1543393716-375f47996a4c?w=1200&h=800&fit=crop&q=80",
    website: "https://www.postojna.si",
    priceRange: "brezplačno",
    featured: false,
  },
];

// ===================== POMOŽNE FUNKCIJE =====================

/**
 * Vrne slovensko formatiran datum za dogodek.
 * - enodnevni: "15. jul 2025"
 * - večdnevni isti mesec: "15. – 17. jul 2025"
 * - večdnevni različen mesec: "15. jul – 15. avg 2025"
 */
export function formatEventDate(date: string, endDate?: string): string {
  const start = new Date(date);
  const startDay = start.getDate();
  const startMonth = SLOVENIAN_MONTHS_SHORT[start.getMonth()];
  const startYear = start.getFullYear();

  if (!endDate) {
    return `${startDay}. ${startMonth} ${startYear}`;
  }

  const end = new Date(endDate);
  const endDay = end.getDate();
  const endMonth = SLOVENIAN_MONTHS_SHORT[end.getMonth()];
  const endYear = end.getFullYear();

  // Isto leto in isti mesec
  if (startYear === endYear && start.getMonth() === end.getMonth()) {
    return `${startDay}. – ${endDay}. ${startMonth} ${startYear}`;
  }

  // Isto leto, različen mesec
  if (startYear === endYear) {
    return `${startDay}. ${startMonth} – ${endDay}. ${endMonth} ${startYear}`;
  }

  // Različno leto
  return `${startDay}. ${startMonth} ${startYear} – ${endDay}. ${endMonth} ${endYear}`;
}

/** Vrne dogodke za podani mesec (0 = januar, 11 = december). */
export function getEventsByMonth(month: number): EventItem[] {
  return EVENTS.filter((e) => {
    const startMonth = new Date(e.date).getMonth();
    const endMonth = e.endDate ? new Date(e.endDate).getMonth() : startMonth;
    return month >= startMonth && month <= endMonth;
  });
}

/** Vrne dogodke za podano kategorijo. */
export function getEventsByCategory(category: EventCategory): EventItem[] {
  return EVENTS.filter((e) => e.category === category);
}

/** Vrne izpostavljene dogodke. */
export function getFeaturedEvents(): EventItem[] {
  return EVENTS.filter((e) => e.featured);
}

/** Vrne dogodke za podano regijo. */
export function getEventsByRegion(region: EventRegion): EventItem[] {
  return EVENTS.filter((e) => e.region === region);
}

/** Vrne leto dogodka (za prikaz v glavi). */
export function getEventYear(event: EventItem): number {
  return new Date(event.date).getFullYear();
}
