// Slovenian events data — 12 realnih festivaljev in prireditev skozi vse leto.
// Povezava z destinacijami preko `destinationId` (glej slovenia-data.ts).

export type EventCategory =
  | "festival"
  | "glasba"
  | "sport"
  | "kultura"
  | "hrana"
  | "tradicija";

export type EventRegion =
  | "alpine"
  | "coastal"
  | "central"
  | "karst"
  | "pannonian";

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
 * 12 realnih slovenskih festivaljev in prireditev, razporejenih skozi vse leto.
 * Datumi za leto 2025 (simbolično — večina prireditev poteka vsako leto).
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
    region: "central",
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
    region: "pannonian",
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
    region: "alpine",
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
    region: "alpine",
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
    region: "alpine",
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
    region: "alpine",
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
    region: "central",
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
    region: "coastal",
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
    region: "alpine",
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
    region: "coastal",
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
    region: "pannonian",
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
    region: "central",
    image:
      "https://images.unsplash.com/photo-1543393716-375f47996a4c?w=1200&h=800&fit=crop&q=80",
    website: "https://www.ljubljana.si",
    priceRange: "brezplačno",
    featured: true,
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
