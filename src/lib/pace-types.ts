// ============================================================================
// F15 (backlog #3, sekcija 22) — tempo potovanja: skupni vir za API + UI
// ============================================================================
//
// PlannerInput.pace (opcijsko) oblikuje GOSTOTO načrta — število postankov
// na dan in čas na mestu:
//   slow     ("počasi")     → manj postankov, več časa na vsakem mestu
//   balanced ("umerjeno")   → dosedanji ritem (privzeto, nazaj kompatibilno)
//   fast     ("hitro")      → več postankov na dan
//
// Vir ideje: Reddit ×2 (r/AI_travel_tips + r/SlowTravelEurope) — Layla
// "izpljune 12-dnevni načrt v 10 s, ne da bi vprašala, če bi raje manj
// mest počasneje"; počasna potovanja = lastna skupnost. Tempo NI vprašanje,
// je pritožba (docs/COMPETITIVE-ANALYSIS-MINDTRIP.md, sekcija 21).
//
// Uporabniki:
//   - /api/itinerary        (validacija + AI prompt + fallback gostota)
//   - /api/itinerary/refine (AI prompt ob prilagoditvi)
//   - itinerary-planner     (izbirnik + NL parsing iz heroja/kviza)

/** Dovoljeni tempoi (validacija API + UI). */
export const PACES = ["slow", "balanced", "fast"] as const;

export type Pace = (typeof PACES)[number];

export function isPace(value: unknown): value is Pace {
  return (
    typeof value === "string" &&
    (PACES as readonly string[]).includes(value)
  );
}

/**
 * Oznake za AI prompt (SL + EN) — enoten vir za obe AI ruti,
 * da se tempo povsod imenuje enako.
 */
export const PACE_PROMPT_LABELS: Record<Pace, { sl: string; en: string }> = {
  slow: { sl: "počasen (manj mest, več časa na vsakem)", en: "slow (fewer places, more time at each)" },
  balanced: { sl: "umerjen", en: "balanced" },
  fast: { sl: "hiter (več mest na dan)", en: "fast (more places per day)" },
};

/**
 * Fallback gostota dneva (deterministična pot, brez AI): št. postankov,
 * trajanje vsakega postanka (h) in razmik med začetki (h).
 *
 * slow:     2 postanka × 5 h, razmik 6 h (9:00–14:00, 15:00–20:00)
 * balanced: 2 postanka × 4 h, razmik 5 h (dosedanji izpis — nespremenjeno)
 * fast:     3 postanki × 3 h, razmik 4 h (9:00–12:00, 13:00–16:00, 17:00–20:00)
 */
export interface PaceFallbackPlan {
  stopsPerDay: number;
  durationHours: number;
  spacingHours: number;
}

export const PACE_FALLBACK: Record<Pace, PaceFallbackPlan> = {
  slow: { stopsPerDay: 2, durationHours: 5, spacingHours: 6 },
  balanced: { stopsPerDay: 2, durationHours: 4, spacingHours: 5 },
  fast: { stopsPerDay: 3, durationHours: 3, spacingHours: 4 },
};
