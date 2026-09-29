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
  // W12-faza-2b: razširjeno na FR/ES (6-jezične tabele spodaj).
  lang?: "sl" | "en" | "it" | "de" | "fr" | "es";
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

// --- W12-faza-2b: FR različice (planner 6-jezičen) ---
const SEASON_ITEMS_FR: Record<string, string[]> = {
  winter: [
    "Couches de vêtements chaudes",
    "Bonnet et gants",
    "Chaussures adaptées à la neige",
    "Crème visage anti-froid",
  ],
  summer: ["Crème solaire SPF 50", "Maillot de bain", "Chapeau de soleil"],
  spring: ["Veste légère coupe-vent", "Couches pour temps changeant"],
  autumn: ["Veste de pluie", "Chaussures de randonnée fermées"],
};

const ALWAYS_ITEMS_FR = [
  "Euros en espèces (petits commerces locaux)",
  "Aucun adaptateur nécessaire (prises EU)",
  "Sac pliable pour les souvenirs",
];

// --- W12-faza-2b: ES različice (planner 6-jezičen) ---
const SEASON_ITEMS_ES: Record<string, string[]> = {
  winter: [
    "Capas de ropa abrigada",
    "Gorro y guantes",
    "Calzado apto para la nieve",
    "Crema facial para el frío",
  ],
  summer: ["Crema solar SPF 50", "Baño", "Gorro para el sol"],
  spring: ["Chaqueta ligera cortavientos", "Capas para clima cambiante"],
  autumn: ["Chaqueta impermeable", "Botas de senderismo cerradas"],
};

const ALWAYS_ITEMS_ES = [
  "Euros en efectivo (negocios locales más pequeños)",
  "No hace falta adaptador (enchufes EU)",
  "Bolsa plegable para los recuerdos",
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
  // W12-faza-2b: FR/ES svoji tabeli (isti vzorec)
  const lang = input?.lang ?? "sl";
  const seasonItems =
    lang === "en"
      ? SEASON_ITEMS_EN
      : lang === "it"
      ? SEASON_ITEMS_IT
      : lang === "de"
      ? SEASON_ITEMS_DE
      : lang === "fr"
      ? SEASON_ITEMS_FR
      : lang === "es"
      ? SEASON_ITEMS_ES
      : SEASON_ITEMS;
  const alwaysItems =
    lang === "en"
      ? ALWAYS_ITEMS_EN
      : lang === "it"
      ? ALWAYS_ITEMS_IT
      : lang === "de"
      ? ALWAYS_ITEMS_DE
      : lang === "fr"
      ? ALWAYS_ITEMS_FR
      : lang === "es"
      ? ALWAYS_ITEMS_ES
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
        fr: "Crème solaire (UV aussi au printemps/automne)",
        es: "Crema solar (también hay UV en primavera/otoño)",
      })
    );
  } else if (season === "summer") {
    items.push(
      PL(lang, {
        sl: "Rajčke za vroče popoldne",
        en: "Shorts for hot afternoons",
        it: "Pantaloncini per i pomeriggi caldi",
        de: "Shorts für heiße Nachmittage",
        fr: "Short pour les après-midis chauds",
        es: "Pantalones cortos para las tardes calurosas",
      })
    );
  } else if (season === "winter") {
    items.push(
      PL(lang, {
        sl: "Termično spodnje perilo",
        en: "Thermal base layers",
        it: "Intimo termico",
        de: "Thermounterwäsche",
        fr: "Sous-vêtements thermiques",
        es: "Ropa térmica",
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
        : lang === "fr"
        ? ["Chaussures de randonnée", "Gourde ou sac d'hydratation"]
        : lang === "es"
        ? ["Botas de senderismo", "Botella o mochila de hidratación"]
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
        fr: "Vêtements à séchage rapide",
        es: "Ropa de secado rápido",
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
        fr: "Un peu d'espace dans la valise pour les produits locaux",
        es: "Un poco de espacio en la maleta para los productos locales",
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
        fr: "Kit enfants (jeux pour la voiture, lingettes humides)",
        es: "Kit para niños (juegos para el coche, toallitas húmedas)",
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
        : lang === "fr"
        ? ["Power bank", "Laverie à mi-voyage"]
        : lang === "es"
        ? ["Power bank", "Lavandería a mitad del viaje"]
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
