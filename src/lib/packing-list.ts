import { PL } from "@/lib/planner-lang";
// ============================================================================
// PAKIRNI SEZNAM — deterministične hevristike glede na sezono/interese/dneve
// ============================================================================
//
// Uporaba:
//   - /api/itinerary: fallback, če AI izpusti/izpljune neveljaven
//     "packing_list", in izhodišče na fallback poti (brez AI)
//
// Pravila (deterministično, brez naključnosti — enak input = enak output):
//   - sezona: winter / summer prineseta sezonske kose
//   - interesi: narava/pohodi, avantura, kulinarika → dodatki
//   - groupType/interesi "družina" → otroški pripomočki
//   - days > 5 → power bank + pralni servis
//   - vedno: gotovina, adapter (EU), zložljiva torba
//   - deduplikacija + kap 14 elementov
// ============================================================================

export interface PackingListInput {
  season: string;
  interests: string[];
  groupType?: string;
  days: number;
  // FW4.3/P4-8 (EN-fallback fix): jezik izpisa — "sl" (privzeto) ali "en".
  // Fallback pot brez AI je prej izpisovala slovensko tudi za EN uporabnike.
  // W1-faza-2b (Issue #15): razširjeno na IT/DE (4-jezične tabele spodaj).
  lang?: "sl" | "en" | "it" | "de";
}

/** Max število elementov na pakirnem seznamu (berljivost). */
const MAX_ITEMS = 14;

const SEASON_ITEMS: Record<string, string[]> = {
  winter: [
    "Tople plasti obleke (layers)",
    "Kapa in rokavice",
    "Obutev za sneg",
    "Krema za obraz proti mrazu",
  ],
  summer: [
    "Sončna krema SPF 50",
    "Kopalke",
    "Kapa za sonce",
  ],
  spring: [
    "Lahka jakna proti vetru",
    "Sloji za spremenljivo vreme",
  ],
  autumn: [
    "Dežna jakna",
    "Zaprte pohodniške superge",
  ],
};

/** Vedno priporočeni kosi — ne glede na input. */
const ALWAYS_ITEMS = [
  "Evrovi gotovina (manjši lokalci)",
  "Adapter ni potreben (EU vtičnice)",
  "Zložljiva torba za spominke",
];

// --- EN različice (P4-8: EN uporabnik na fallback poti ne sme videti SL) ---
const SEASON_ITEMS_EN: Record<string, string[]> = {
  winter: [
    "Warm layers of clothing",
    "Hat and gloves",
    "Snow-appropriate footwear",
    "Cold-weather face cream",
  ],
  summer: ["Sunscreen SPF 50", "Swimwear", "Sun hat"],
  spring: ["Light windproof jacket", "Layers for changeable weather"],
  autumn: ["Rain jacket", "Closed hiking shoes"],
};

const ALWAYS_ITEMS_EN = [
  "Euros in cash (smaller local spots)",
  "No adapter needed (EU sockets)",
  "Foldable bag for souvenirs",
];

// --- W1-faza-2b: IT različice (Issue #15 — Alma pariteta) ---
const SEASON_ITEMS_IT: Record<string, string[]> = {
  winter: [
    "Strati caldi di abbigliamento",
    "Cappello e guanti",
    "Calzature da neve",
    "Crema viso antifreddo",
  ],
  summer: ["Crema solare SPF 50", "Costume da bagno", "Cappello per il sole"],
  spring: ["Giacca leggera antivento", "Strati per il meteo variabile"],
  autumn: ["Giacca antipioggia", "Scarpe da trekking chiuse"],
};

const ALWAYS_ITEMS_IT = [
  "Euro in contanti (esercizi locali più piccoli)",
  "Nessun adattatore necessario (prese EU)",
  "Borsa pieghevole per i souvenir",
];

// --- W1-faza-2b: DE različice (Issue #15 — Alma pariteta) ---
const SEASON_ITEMS_DE: Record<string, string[]> = {
  winter: [
    "Warme Kleidungsschichten",
    "Mütze und Handschuhe",
    "Schneetaugliches Schuhwerk",
    "Kälteschutzcreme fürs Gesicht",
  ],
  summer: ["Sonnencreme SPF 50", "Badekleidung", "Sonnenhut"],
  spring: ["Leichte winddichte Jacke", "Schichten für wechselhaftes Wetter"],
  autumn: ["Regenjacke", "Geschlossene Wanderschuhe"],
};

const ALWAYS_ITEMS_DE = [
  "Euro in Bargeld (kleinere lokale Läden)",
  "Kein Adapter nötig (EU-Steckdosen)",
  "Faltbare Tasche für Souvenirs",
];

/** Kratek, berljiv hevristični seznam — glede komentar zgoraj za pravila. */
export function buildPackingList(input: PackingListInput): string[] {
  const season = (input?.season ?? "").toString().trim().toLowerCase();
  const interests = Array.isArray(input?.interests)
    ? input.interests.map((i) => i.toString().trim().toLowerCase())
    : [];
  const groupType = (input?.groupType ?? "").toString().trim().toLowerCase();
  const days = Number.isFinite(input?.days) ? Number(input.days) : 0;
  // W1-faza-2b: izbira tabel po jeziku (IT/DE svoji tabeli; neprepoznan → SL)
  const lang = input?.lang ?? "sl";
  const seasonItems =
    lang === "en"
      ? SEASON_ITEMS_EN
      : lang === "it"
      ? SEASON_ITEMS_IT
      : lang === "de"
      ? SEASON_ITEMS_DE
      : SEASON_ITEMS;
  const alwaysItems =
    lang === "en"
      ? ALWAYS_ITEMS_EN
      : lang === "it"
      ? ALWAYS_ITEMS_IT
      : lang === "de"
      ? ALWAYS_ITEMS_DE
      : ALWAYS_ITEMS;

  const haystack = [...interests, groupType].join(" ");
  const items: string[] = [];

  // === Sezona ===
  if (seasonItems[season]) items.push(...seasonItems[season]);
  if (season === "spring" || season === "autumn") {
    items.push(
      PL(lang, {
        sl: "Sončna krema (tudi pomladi/jeseni UV)",
        en: "Sunscreen (spring/autumn UV too)",
        it: "Crema solare (UV anche in primavera/autunno)",
        de: "Sonnencreme (UV auch im Frühjahr/Herbst)",
      })
    );
  } else if (season === "summer") {
    items.push(
      PL(lang, {
        sl: "Rajčke za vroče popoldne",
        en: "Shorts for hot afternoons",
        it: "Pantaloncini per i pomeriggi caldi",
        de: "Shorts für heiße Nachmittage",
      })
    );
  } else if (season === "winter") {
    items.push(
      PL(lang, {
        sl: "Termično spodnje perilo",
        en: "Thermal base layers",
        it: "Intimo termico",
        de: "Thermounterwäsche",
      })
    );
  }

  // === Interesi ===
  if (/narav|pohod|gore?|planin|nature|hike|hiking|mountain/.test(haystack)) {
    items.push(
      ...(lang === "en"
        ? ["Hiking boots", "Water bottle or hydration pack"]
        : lang === "it"
        ? ["Scarpe da trekking", "Borraccia o zaino con idratazione"]
        : lang === "de"
        ? ["Wanderschuhe", "Trinkflasche oder Trinkrucksack"]
        : ["Pohodniški čevlji", "Camelbak/voda"])
    );
  }
  if (/avantur|adrenalin|raft|kajak|canyon|bike|kolo|adventur/.test(haystack)) {
    items.push(
      PL(lang, {
        sl: "Hitro sušeča se obleka",
        en: "Quick-dry clothing",
        it: "Vestiti a asciugatura rapida",
        de: "Schnell trocknende Kleidung",
      })
    );
  }
  if (/kulinar|hran|jest|gastro|vino|food|cuisine|wine/.test(haystack)) {
    items.push(
      PL(lang, {
        sl: "Rahel prtljačni prostor za lokalne dobrote",
        en: "A little spare luggage room for local treats",
        it: "Un po' di spazio in valigia per i prodotti locali",
        de: "Etwas Platz im Gepäck für lokale Köstlichkeiten",
      })
    );
  }
  if (/dru[žz]in|otrok|family|kids|children/.test(haystack)) {
    items.push(
      PL(lang, {
        sl: "Otroški pripomočki (igrice za vožnjo, vlažilne robčice)",
        en: "Kids' kit (car games, wet wipes)",
        it: "Kit per bambini (giochi per l'auto, salviette umide)",
        de: "Kinder-Set (Autospiele, Feuchttücher)",
      })
    );
  }

  // === Dolžina potovanja ===
  if (days > 5) {
    items.push(
      ...(lang === "en"
        ? ["Power bank", "Laundry service mid-trip"]
        : lang === "it"
        ? ["Power bank", "Servizio lavanderia a metà viaggio"]
        : lang === "de"
        ? ["Powerbank", "Wäscheservice unterwegs"]
        : ["Power bank", "Pralni servis med potovanjem"])
    );
  }

  // === Vedno ===
  items.push(...alwaysItems);

  // Deduplikacija (ohrani vrstni red) + kap
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= MAX_ITEMS) break;
  }

  return result;
}

/**
 * Sanitizacija AI "packing_list" izhodov.
 * Vrne veljaven seznam (samo stringi, max 20, vsak ≤ 80 znakov) ali
 * `null`, če AI izhod ni uporaben (klical naj uporabi hevristiko).
 */
export function sanitizeAiPackingList(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || raw.length === 0) return null;

  const items = raw
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim().slice(0, 80))
    .filter((item) => item.length > 0);

  if (items.length === 0) return null;

  // Deduplikacija + kap 20 (API vrača 8–14, a AI lahko poda več)
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= 20) break;
  }

  return result.length > 0 ? result : null;
}
