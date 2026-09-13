// ============================================================================
// WEATHER-CONTEXT (t11) — tip potne skupine: skupni vir za API ruti + UI
// ============================================================================
//
// PlannerInput.partyType (opcijsko) oblikuje ritem in izbor načrta:
// družina z otroki → krajši prevozi in otrokom prijazne lokacije, par →
// mirnejši tempo, prijatelji → bolj aktivna izbira, sam → fleksibilnost.
//
// Uporabniki:
//   - /api/itinerary        (validacija + AI prompt)
//   - /api/itinerary/refine (AI prompt ob prilagoditvi)
//   - itinerary-planner     (formni čipi + NL parsing iz heroja/kviza)

/** Dovoljeni tipi potne skupine (validacija API + UI). */
export const PARTY_TYPES = ["couple", "family", "friends", "solo"] as const;

export type PartyType = (typeof PARTY_TYPES)[number];

export function isPartyType(value: unknown): value is PartyType {
  return (
    typeof value === "string" &&
    (PARTY_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Oznake za AI prompt (SL + EN) — enoten vir za obe AI ruti,
 * da se sestava potnikov povsod imenuje enako.
 */
export const PARTY_PROMPT_LABELS: Record<
  PartyType,
  { sl: string; en: string }
> = {
  couple: { sl: "par", en: "couple" },
  family: { sl: "družina z otroki", en: "family with kids" },
  friends: { sl: "prijateljska skupina", en: "group of friends" },
  solo: { sl: "samostojni potnik", en: "solo traveller" },
};
