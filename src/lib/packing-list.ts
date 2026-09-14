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
  lang?: "sl" | "en";
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

/** Kratek, berljiv hevristični seznam — glede komentar zgoraj za pravila. */
export function buildPackingList(input: PackingListInput): string[] {
  const season = (input?.season ?? "").toString().trim().toLowerCase();
  const interests = Array.isArray(input?.interests)
    ? input.interests.map((i) => i.toString().trim().toLowerCase())
    : [];
  const groupType = (input?.groupType ?? "").toString().trim().toLowerCase();
  const days = Number.isFinite(input?.days) ? Number(input.days) : 0;
  const isEn = input?.lang === "en";
  const seasonItems = isEn ? SEASON_ITEMS_EN : SEASON_ITEMS;
  const alwaysItems = isEn ? ALWAYS_ITEMS_EN : ALWAYS_ITEMS;

  const haystack = [...interests, groupType].join(" ");
  const items: string[] = [];

  // === Sezona ===
  if (seasonItems[season]) items.push(...seasonItems[season]);
  if (season === "spring" || season === "autumn") {
    items.push(
      isEn
        ? "Sunscreen (spring/autumn UV too)"
        : "Sončna krema (tudi pomladi/jeseni UV)"
    );
  } else if (season === "summer") {
    items.push(isEn ? "Shorts for hot afternoons" : "Rajčke za vroče popoldne");
  } else if (season === "winter") {
    items.push(isEn ? "Thermal base layers" : "Termično spodnje perilo");
  }

  // === Interesi ===
  if (/narav|pohod|gore?|planin|nature|hike|hiking|mountain/.test(haystack)) {
    items.push(
      ...(isEn
        ? ["Hiking boots", "Water bottle or hydration pack"]
        : ["Pohodniški čevlji", "Camelbak/voda"])
    );
  }
  if (/avantur|adrenalin|raft|kajak|canyon|bike|kolo|adventur/.test(haystack)) {
    items.push(isEn ? "Quick-dry clothing" : "Hitro sušeča se obleka");
  }
  if (/kulinar|hran|jest|gastro|vino|food|cuisine|wine/.test(haystack)) {
    items.push(
      isEn
        ? "A little spare luggage room for local treats"
        : "Rahel prtljačni prostor za lokalne dobrote"
    );
  }
  if (/dru[žz]in|otrok|family|kids|children/.test(haystack)) {
    items.push(
      isEn
        ? "Kids' kit (car games, wet wipes)"
        : "Otroški pripomočki (igrice za vožnjo, vlažilne robčice)"
    );
  }

  // === Dolžina potovanja ===
  if (days > 5) {
    items.push(
      ...(isEn
        ? ["Power bank", "Laundry service mid-trip"]
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
