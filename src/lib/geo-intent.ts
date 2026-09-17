import { DESTINATIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";
import type { StoSearchHit } from "@/lib/rag/types";

// ============================================================================
// GEO-INTENT — "Geo odgovori" (Task 29, 1.41.0)
// ============================================================================
// Zaznavanje prostorskega namena v uporabnikovem vprašanju:
//   "kje lahko jedem v Ljubljani?" → lokacija: Ljubljana, kategorija: hrana
//   "where to eat in Bled?"        → lokacija: Bled,    kategorija: hrana
//
// Nadgradnja Mindtrip vzorca (UX-COMPARISON): njihov AI samodejno spusti
// pine na zemljevid ob iskanju hrane/pijač/tržnic. Mi isto stvar naredimo
// DETERMINISTIČNO (brez čakanja na AI) in z oznako porekla (T1/OSM) —
// zemljevid prizna, od kod so podatki.
//
// Trije deli:
//   1. detectGeoIntent(query) — lokacija (T1 dataset) + kategorije krajev
//   2. matchDestinationsInText(text) — T1 destinacije, omenjene v AI odgovoru
//      (odgovor se dobesedno izriše na zemljevidu kot zeleni pini)
//   3. ChatPlace — skupni tip strežnik ⇆ klient
//
// UJEMANJE IMEN: slovenščina skljuje imena krajev (Ljubljana → v Ljubljani,
// Celje → v Celju, Črnomelj → pri Črnomlju). Zato ne iščemo celih imen,
// ampak STEME (korene), ki jim lahko sledi 0–3 črk končnika. Stem baza je
// ročno vzgojena za vseh 22 destinacij (nominativ + lokativ + pridevniške
// oblike + EN različice). Za kratke/ dvoumne oblike (soci, bovec …) imamo
// EXACT seznam — celoten žeton, brez končnikov, ker bi prefix ujel tuje
// besede ("social", "summer").
// ============================================================================

/** Kategorije krajev, ki jih znamo iskati po OSM (Overpass). */
export type PlaceCategory =
  | "food"
  | "drinks"
  | "market"
  | "stay"
  | "service"
  /** 1.44: T2 uradni vir (članek STO) — NI fizični kraj; nikoli ne nastane
   *  iz uporabnikovega besedila (CATEGORY_MATCHERS ga ne more izdelati),
   *  nastavi ga samo stoHitToPlace. Pomeni: povezava na izvirnik, ne postanek. */
  | "source";

/** Poreklo geo podatka — vtičeno v našo T1/T2/T3 arhitekturo zaupanja. */
export type PlaceProvenance = "t1" | "osm" | "t2";

/**
 * En kraj na zemljevidu klepeta. OSM kraji imajo lat/lng iz Overpassa;
 * T1 destinacije iz našega dataseta (coords, rating, budget, slug);
 * T2 uradni viri (1.44) izposojo koordinate povezane destinacije + vir.
 */
export interface ChatPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: PlaceCategory;
  provenance: PlaceProvenance;
  /** OSM: kuhinja (npr. "regional;italian") ali podkategorija. */
  detail?: string;
  /** OSM: surov niz odpiralnih časov (npr. "Mo-Fr 08:00-20:00"). */
  openingHours?: string;
  /** OSM: naslov (ulica + hišna številka). */
  address?: string;
  /** T1: ocena destinacije (npr. 4.8). */
  rating?: number;
  /** T1: cenovni razred (€/€€/€€€). */
  budget?: string;
  /** T1: slug za povezavo na stran destinacije. */
  slug?: string;
  /** T2: URL izvirnika na slovenia.info (odpre se v novem zavihku). */
  sourceUrl?: string;
  /** T2: id povezane T1 destinacije (za odmik pinov z istimi koordinatami). */
  sourceDestinationId?: string;
}

export interface GeoIntent {
  /** T1 destinacija, omenjena v vprašanju (center iskanja). */
  location: { id: string; name: string; lat: number; lng: number } | null;
  /** Kategorije krajev, ki jih uporabnik išče (prazno = ni geo namena). */
  categories: PlaceCategory[];
}

interface StemMatcher {
  /** Celotni žetoni (brez končnikov) — za kratke/dvoumne besede. */
  exact: string[];
  /** Koreni — žeton se začne s korenom + max 3 črke (slovenski skloni). */
  stems: string[];
  /** Dvobesedni koreni (par zaporednih žetonov, isto prefix pravilo). */
  pairs?: string[];
}

// ---------------------------------------------------------------------------
// DESTINACIJSKI VZORCI — ključ = id iz slovenia-data.ts. Ročno vzgojeni:
// nominativ + lokativ + pridevniki + EN različice. Vsak koren preverjen
// proti lažnim zadetkom ("social", "summer", "marketing" …).
// ---------------------------------------------------------------------------
const LOCATION_MATCHERS: Record<string, StemMatcher> = {
  bled: {
    exact: [],
    stems: ["bled", "blejsk"], // Bled, na Bledu, blejsko jezero, Blejski grad
  },
  bohinj: {
    exact: [],
    stems: ["bohinj", "bohinjsk", "vogel", "voglu"], // v Bohinju, Vogel
  },
  ljubljana: {
    exact: ["metelkova"],
    stems: ["ljubljan", "presernov", "tivoli"], // v Ljubljani, ljubljanski grad
  },
  postojna: {
    exact: [],
    stems: ["postojn", "predjam"], // Postojna, Postojnska jama, Predjama
  },
  piran: {
    exact: [],
    stems: ["piran", "tartinij"], // v Piranu, Tartinijev trg
  },
  soca: {
    // "soci" bi kot prefix ujel "social" → exact oblike
    exact: ["soci", "soco", "soce", "socah", "socami", "bovec", "bovcu", "bovca"],
    stems: ["soca", "trenta", "isonzo"], // ob Soči, Bovec, Soča river
  },
  triglav: {
    exact: [],
    stems: ["triglav", "kredarica"], // pod Triglavom, Triglavski narodni park
  },
  kobarid: {
    exact: [],
    stems: ["kobarid", "caporetto"], // v Kobaridu
  },
  maribor: {
    exact: [],
    stems: ["maribor", "pohorj"], // v Mariboru, na Pohorju
  },
  portoroz: {
    exact: [],
    stems: ["portoroz", "portorose"], // v Portorožu (Portorose = IT)
  },
  vintgar: {
    // "sum" (šum) ne sme biti stem — ujel bi "summer"; Vintgarska soteska
    // se pokrije z "vintgar"
    exact: [],
    stems: ["vintgar"], // Vintgarska soteska, Vintgarsko
  },
  rogaska: {
    exact: [],
    stems: ["rogask"], // Rogaška, Rogaški Slatini
  },
  ptuj: {
    exact: [],
    stems: ["ptuj", "kurentovan"], // v Ptuju, Kurentovanje
  },
  celje: {
    exact: [],
    stems: ["celj"], // Celje, v Celju, Celjski grobovi
  },
  "nova-gorica": {
    exact: [],
    stems: ["goric", "solkan", "sabotin"], // Novi Gorici, Gorica/Gorizia
  },
  "slovenj-gradec": {
    exact: [],
    stems: [],
    pairs: ["slovenj grad"], // Slovenj Gradec, v Slovenj Gradcu
  },
  dravograd: {
    exact: [],
    stems: ["dravograd"], // v Dravogradu
  },
  "murska-sobota": {
    exact: [],
    stems: ["mursk", "prekmurj"], // Murski Soboti, Prekmurje
  },
  lendava: {
    exact: [],
    stems: ["lendav"], // v Lendavi
  },
  "novo-mesto": {
    exact: [],
    stems: [],
    pairs: ["nov mest"], // Novo mesto, v Novem mestu
  },
  otocec: {
    exact: [],
    stems: ["otoc"], // Otočec, na Otočcu
  },
  crnomelj: {
    exact: [],
    stems: ["crnomelj", "crnoml"], // Črnomelj, pri Črnomlju
    pairs: ["bela krajina"], // Bela krajina (regija)
  },
};

// ---------------------------------------------------------------------------
// KATEGORIJE — besede po katerih uporabnik išče KRAJ (hrana, pijača,
// tržnica, spanje, storitve). Isti exact/stem mehanizem.
// ---------------------------------------------------------------------------
const CATEGORY_MATCHERS: Record<PlaceCategory, StemMatcher> = {
  food: {
    exact: ["jem", "jedem", "eat", "eats", "dine", "meal"],
    stems: [
      "hran", "jest", "jede", "kosil", "vecerj", "zajtrk", "restavraci",
      "gostiln", "gostisc", "picer", "burger", "pizza", "food", "lunch",
      "dinner", "breakfast", "restaurant", "eater", "dining",
    ],
  },
  drinks: {
    exact: ["bar", "bars", "pub", "pubs", "kava", "kavo", "kave", "pivo", "piva"],
    stems: [
      "pijac", "kavarn", "kafic", "pivnic", "vinotoc", "koktajl", "drink",
      "coffee", "cafe", "cocktail",
    ],
  },
  market: {
    exact: ["shop", "shops"],
    stems: [
      "trznic", "trgovin", "supermarket", "pekarn", "kruh", "sadj", "zelenjav",
      "spomink", "nakup", "market", "marketplace", "grocer", "bakery",
      "souvenir", "shopping",
    ],
  },
  stay: {
    exact: ["soba", "sobe", "sobo", "sobi", "spat", "sleep", "camp"],
    stems: [
      "nastanitv", "spanj", "presp", "nocit", "hotel", "apartm", "hostel",
      "prenocis", "kamp", "accommod", "camping", "campsite", "overnight",
      "stay",
    ],
  },
  service: {
    exact: ["atm", "wc", "gas", "fuel", "posta", "posti", "posto"],
    stems: [
      "bencin", "goriv", "lekarn", "farmac", "bankomat", "parkir",
      "informac", "stranisc", "pharmac", "petrol", "toilet",
    ],
    pairs: ["tourist info", "tourist information"], // turistični urad
  },
  // 1.44: "source" NIMA matcherja — uporabniško besedilo ne more izdelati
  // te kategorije (nastavi jo samo stoHitToPlace za citane T2 vire); prazen
  // vnos drži Record izčrpan in matcherHits() nikoli ne zadene.
  source: { exact: [], stems: [] },
};

/** Normalizacija: lowercase + strip diakritike + ločila → presledki. */
function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // čšž → csz
    .replace(/[.,!?;:()"'\-–—/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Žetoni normaliziranega besedila. */
function tokensOf(q: string): string[] {
  return normalizeQuery(q).split(" ").filter(Boolean);
}

/**
 * Ali se žeton ujema s korenom (prefix + max 3 črke končnika).
 * Končniki pokrivajo slovenske sklone: -a/-i/-o/-e/-u/-om/-ah/-ih …
 */
function tokenMatchesStem(token: string, stem: string): boolean {
  if (!token.startsWith(stem)) return false;
  return token.length - stem.length <= 3;
}

/** Ali se matcher ujame nekje v žetonskem nizu. */
function matcherHits(tokens: string[], m: StemMatcher): number {
  let best = -1;
  const setIndex = (i: number) => {
    if (i >= 0 && (best === -1 || i < best)) best = i;
  };

  if (m.exact.length > 0) {
    setIndex(tokens.findIndex((t) => m.exact.includes(t)));
  }
  for (const stem of m.stems) {
    setIndex(tokens.findIndex((t) => tokenMatchesStem(t, stem)));
  }
  if (m.pairs) {
    for (const pair of m.pairs) {
      const words = pair.split(" ");
      for (let i = 0; i + words.length <= tokens.length; i++) {
        let ok = true;
        for (let w = 0; w < words.length; w++) {
          if (!tokenMatchesStem(tokens[i + w], words[w])) {
            ok = false;
            break;
          }
        }
        if (ok) setIndex(i);
      }
    }
  }
  return best;
}

/**
 * Prepozna geo namen v vprašanju. Vrne kategorije + lokacijo (T1 center).
 *
 * Pravila (konzervativna — lažje zamuditi kot lažno sprožiti):
 *  - kategorija se šteje, če je njena beseda/koren v vprašanju;
 *  - lokacija = T1 destinacija z najzgodnejšo omembo;
 *  - Overpass klic (v chat API-ju) se zgodi SAMO kadar obstaja lokacija
 *    IN ≥1 kategorija — varuje javni Overpass API pred nepotrebnimi klici.
 */
export function detectGeoIntent(query: string): GeoIntent {
  const tokens = tokensOf(query);

  const categories: PlaceCategory[] = [];
  for (const [cat, matcher] of Object.entries(
    CATEGORY_MATCHERS
  ) as [PlaceCategory, StemMatcher][]) {
    if (matcherHits(tokens, matcher) >= 0) categories.push(cat);
  }

  return { location: matchFirstDestination(query), categories };
}

/** Destinacija iz T1 dataseta z najzgodnejšo omembo v besedilu (null = nič). */
function matchFirstDestination(text: string): GeoIntent["location"] {
  const tokens = tokensOf(text);
  let best: { idx: number; dest: Destination } | null = null;

  for (const dest of DESTINATIONS) {
    const matcher = LOCATION_MATCHERS[dest.id];
    if (!matcher) continue;
    const idx = matcherHits(tokens, matcher);
    if (idx < 0) continue;
    if (best === null || idx < best.idx) best = { idx, dest };
  }
  if (!best) return null;
  return {
    id: best.dest.id,
    name: best.dest.name,
    lat: best.dest.coords.lat,
    lng: best.dest.coords.lng,
  };
}

/**
 * Vse T1 destinacije, omenjene v AI odgovoru — izrišejo se kot ZELENI
 * pini (provenance: t1) na mini zemljevidu klepeta. Odgovor se torej
 * dobesedno izriše prostorsko, ne glede na geo-intent vprašanja.
 *
 * @param text      AI odgovor (ali poljubno besedilo)
 * @param excludeIds  ID-ji destinacij, ki jih ne smemo podvojiti
 *                    (npr. lokacija iz vprašanja že ima svoj center)
 */
export function matchDestinationsInText(
  text: string,
  excludeIds: Set<string> = new Set()
): ChatPlace[] {
  const tokens = tokensOf(text);
  const places: ChatPlace[] = [];
  const seen = new Set<string>(excludeIds);

  for (const dest of DESTINATIONS) {
    if (seen.has(dest.id)) continue;
    const matcher = LOCATION_MATCHERS[dest.id];
    if (!matcher) continue;
    if (matcherHits(tokens, matcher) >= 0) {
      seen.add(dest.id);
      places.push(destinationToPlace(dest));
    }
  }
  return places;
}

/** T1 destinacija → ChatPlace (zelen pin z "Preverjeno" značko). */
export function destinationToPlace(d: Destination): ChatPlace {
  return {
    id: `t1-${d.id}`,
    name: d.name,
    lat: d.coords.lat,
    lng: d.coords.lng,
    // T1 pin je splošen "kraj" — barva vizualno izhaja iz provenance (zeleni)
    category: "stay",
    provenance: "t1",
    rating: d.rating,
    budget: d.budget,
    slug: d.slug,
  };
}

// ---------------------------------------------------------------------------
// T2 → PIN (1.44): citiran uradni vir STO kot turkizen pin na mini zemljevidu
// ---------------------------------------------------------------------------

/**
 * Determinističen odmik v METRIH iz hasha id-ja (FNV-1a lite) — T2 članek
 * si izposoja koordinate povezane destinacije, ki bi se brez odmika
 * natanko prekrila s T1 pinom (ali sidrom iskanja). Odmik 180–350 m je
 * na zoomu 13–15 (fitBounds maxZoom 15) vidno ločen, a še vedno
 * "ob destinaciji" — semantično pošteno: članek je O kraju.
 *
 * Determinističnost: isti vir → isti odmik (stabilno med renderi/sesijami).
 */
function hashOffsetMeters(id: string): { dLatM: number; dLngM: number } {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  const angle = ((h % 360) * Math.PI) / 180;
  const dist = 180 + ((h >>> 8) % 171); // 180–350 m
  return { dLatM: Math.sin(angle) * dist, dLngM: Math.cos(angle) * dist };
}

const METERS_PER_DEG_LAT = 111_320;

/**
 * T2 zadetek (citan uradni vir STO s geopovezavo) → ChatPlace.
 *
 * POŠTENOST: naslov članka je lahko npr. "Piran – mestni utrip" — pin
 * sedi ob destinaciji Piran (izposojene koordinate + determinističen
 * odmik), turkizna barva + značka STO pa izrecno povedeta, da je to
 * URADNI ČLANEK, ne restavracija ali atrakcija. Ne more se dodati v
 * načrt (category "source" ni fizični postanek) — povezava vodi na
 * izvirnik na slovenia.info.
 *
 * @param hit zadetek iz buildStoGrounding (mora imeti .destination)
 */
export function stoHitToPlace(hit: StoSearchHit): ChatPlace | null {
  const dest = hit.destination;
  if (!dest) return null;
  const anchor = DESTINATIONS.find((d) => d.id === dest.id);
  if (!anchor) return null; // neznana destinacija → ne ugibamo
  const { dLatM, dLngM } = hashOffsetMeters(hit.record.id);
  const dLat = dLatM / METERS_PER_DEG_LAT;
  const dLng =
    dLngM /
    (METERS_PER_DEG_LAT * Math.cos((anchor.coords.lat * Math.PI) / 180));
  return {
    id: `t2-${hit.record.id}`,
    name: hit.record.title,
    lat: anchor.coords.lat + dLat,
    lng: anchor.coords.lng + dLng,
    category: "source",
    provenance: "t2",
    detail: hit.record.section,
    sourceUrl: hit.record.url,
    sourceDestinationId: anchor.id,
  };
}
