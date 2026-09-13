// ============================================================================
// PRAKTIČNI PODATKI LOKALCA (t12 faza 1) — skupni slovar za vse potrošnike
// ============================================================================
//
// Tri nova NEOBVEZNA polja Listing modela (vse String? / nullable — obstoječi
// zapisi ostanejo prazni, javni prikaz se izriše SAMO ob realnem vnosu
// partnerja/admina, nikoli izmišljen):
//
//   seasons            JSON array SeasonKey (["spring","summer",...])
//                      — prazno/null = neznano
//   weatherSuitability "indoor" | "outdoor" | "all-weather"
//                      — ključ za deževne dneve (AI kontekst načrtovalnika)
//   parking            "free" | "paid" | "street" | "private" | "none"
//
// Potrošniki: owner forma, admin forma, javni listing-modal, profile
// completion, ranking-engine (AI kontekst), seed-demo.
// Od tu NE odvisi nobena zunanja oblika (vrednosti so stabilni ključi).

export type SeasonKey = "spring" | "summer" | "autumn" | "winter";

export const SEASON_KEYS: readonly SeasonKey[] = [
  "spring",
  "summer",
  "autumn",
  "winter",
] as const;

/** Kratek prikaz posamezne sezone (modal / AI kontekst). */
export const SEASON_LABELS: Record<SeasonKey, { sl: string; en: string }> = {
  spring: { sl: "pomlad", en: "spring" },
  summer: { sl: "poletje", en: "summer" },
  autumn: { sl: "jesen", en: "autumn" },
  winter: { sl: "zima", en: "winter" },
};

export type WeatherSuitability = "indoor" | "outdoor" | "all-weather";

export const WEATHER_SUITABILITY_KEYS: readonly WeatherSuitability[] = [
  "indoor",
  "outdoor",
  "all-weather",
] as const;

/** Kratek prikaz (modal) + daljša forma labela (forme). */
export const WEATHER_SUITABILITY_LABELS: Record<
  WeatherSuitability,
  { sl: string; en: string; formSl: string }
> = {
  indoor: {
    sl: "Notranje (tudi v dežju)",
    en: "Indoor (fine in rain)",
    formSl: "Notranje — primerno tudi v dežju",
  },
  outdoor: {
    sl: "Zunanje (ob lepem vremenu)",
    en: "Outdoor (fair weather only)",
    formSl: "Zunanje — le ob lepem vremenu",
  },
  "all-weather": {
    sl: "V vsakem vremenu",
    en: "All-weather",
    formSl: "V vsakem vremenu",
  },
};

export type ParkingOption =
  | "free"
  | "paid"
  | "street"
  | "private"
  | "none";

export const PARKING_KEYS: readonly ParkingOption[] = [
  "free",
  "paid",
  "street",
  "private",
  "none",
] as const;

export const PARKING_LABELS: Record<
  ParkingOption,
  { sl: string; en: string; formSl: string }
> = {
  free: { sl: "Zastonj", en: "Free", formSl: "Zastonj parkirišče" },
  paid: { sl: "Plačljivo", en: "Paid", formSl: "Plačljivo parkirišče" },
  street: {
    sl: "Parkiranje na ulici",
    en: "Street parking",
    formSl: "Parkiranje na ulici",
  },
  private: {
    sl: "Lastno za goste",
    en: "Private (for guests)",
    formSl: "Lastno parkirišče za goste",
  },
  none: {
    sl: "Brez parkirišča",
    en: "No parking",
    formSl: "Brez parkirišča",
  },
};

// ============================================================================
// PARSERJI (DB string → tipizirane vrednosti; vedno varni)
// ============================================================================

/**
 * Varno razčleni seasons JSON iz baze v veljavne, deduplicirane ključe.
 * Neveljavni vnosi mirno odpadejo (nikoli ne vrže).
 */
export function parseSeasons(
  raw: string | null | undefined
): SeasonKey[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<SeasonKey>();
    for (const item of parsed) {
      if (
        typeof item === "string" &&
        (SEASON_KEYS as readonly string[]).includes(item)
      ) {
        seen.add(item as SeasonKey);
      }
    }
    return SEASON_KEYS.filter((k) => seen.has(k));
  } catch {
    return [];
  }
}

/** Je vrednost veljaven WeatherSuitability ključ? */
export function isValidWeatherSuitability(
  value: unknown
): value is WeatherSuitability {
  return (
    typeof value === "string" &&
    (WEATHER_SUITABILITY_KEYS as readonly string[]).includes(value)
  );
}

/** Je vrednost veljaven ParkingOption ključ? */
export function isValidParkingOption(value: unknown): value is ParkingOption {
  return (
    typeof value === "string" &&
    (PARKING_KEYS as readonly string[]).includes(value)
  );
}

// ============================================================================
// OBLIKOVANJE PRIKAZA
// ============================================================================

/**
 * Berljiva oznaka sezonskega okna: vse štiri sezone → "Celo leto",
 * sicer seznam (npr. "Pomlad, poletje"). Vrne null, kadar ni podatka.
 * (AI fragment v practicalPromptFragment sam spusti v mali začetek.)
 */
export function formatSeasonsLabel(
  keys: SeasonKey[],
  lang: "sl" | "en" = "sl"
): string | null {
  if (keys.length === 0) return null;
  if (keys.length === SEASON_KEYS.length) {
    return lang === "en" ? "All year" : "Celo leto";
  }
  const joined = keys
    .map((k) =>
      lang === "en"
        ? SEASON_LABELS[k].en
        : SEASON_LABELS[k].sl
    )
    .join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** Kratek prikaz ustreznosti vremenu ali null ob manjkajočem podatku. */
export function formatWeatherLabel(
  value: string | null | undefined,
  lang: "sl" | "en" = "sl"
): string | null {
  if (!isValidWeatherSuitability(value)) return null;
  return WEATHER_SUITABILITY_LABELS[value][lang];
}

/** Kratek prikaz parkirišča ali null ob manjkajočem podatku. */
export function formatParkingLabel(
  value: string | null | undefined,
  lang: "sl" | "en" = "sl"
): string | null {
  if (!isValidParkingOption(value)) return null;
  return PARKING_LABELS[value][lang];
}

// ============================================================================
// AI KONTEKST (ranking-engine → itinerary prompt)
// ============================================================================

/**
 * Fragment za vrstico partnerja v AI kontekstu, npr.:
 *   ", sezona: celo leto, vreme: notranje, parkiranje: zastonj"
 * Samo realni vnosi partnerja — prazna polja ne prispejo ničesar.
 */
export function practicalPromptFragment(
  listing: {
    seasons?: string | null;
    weatherSuitability?: string | null;
    parking?: string | null;
  },
  lang: "sl" | "en" = "sl"
): string {
  const parts: string[] = [];

  const seasons = parseSeasons(listing.seasons);
  const seasonsLabel = formatSeasonsLabel(seasons, lang);
  if (seasonsLabel) {
    // Naslovni register konteksta: "Celo leto" → "celo leto"
    const lc = seasonsLabel.charAt(0).toLowerCase() + seasonsLabel.slice(1);
    parts.push(lang === "en" ? `season: ${lc}` : `sezona: ${lc}`);
  }

  const weather = formatWeatherLabel(listing.weatherSuitability, lang);
  if (weather) {
    parts.push(lang === "en" ? `weather: ${weather}` : `vreme: ${weather}`);
  }

  const parking = formatParkingLabel(listing.parking, lang);
  if (parking) {
    parts.push(
      lang === "en" ? `parking: ${parking}` : `parkiranje: ${parking}`
    );
  }

  if (parts.length === 0) return "";
  return ", " + parts.join(", ");
}
