// ============================================================================
// PERSISTENCA ZADNJEGA ITINERERJA (localStorage) — ENKRATEN VIR (99-b)
// ============================================================================
// Revizija stanja (GitHub #1 §18) je odkrila DVA neodvisna pisca istega
// ključa "discoverslovenia_last_itinerary" z identično, a DUPLICIRANO
// semantiko:
//   - persistItineraryLocally v src/components/sections/itinerary-planner.tsx
//     (pisanje) + obnovitvena pot ob mountu (branje)
//   - persistLastItinerary / readLastItinerary v src/lib/chat-add-place.ts
//     (klepet doda kraj v zadnji shranjen načrt)
// Od 99-b je ta knjižnica edini vir — planner (zapis + obnova), klepet in
// vsi prihodnji klicatelji berejo in pisijo isto mesto z istimi mejami.
//
// Semantika je NESPREMENJENA (drop-in za oba prejšnja pisca):
//   - payload { itinerary, formData?, savedAt } — savedAt je SVEŽ ob vsakem
//     zapisu (new Date().toISOString())
//   - meja 250 * 1024 znakov serializiranega JSON — VEČJI zapis se tiho
//     preskoči (ne izbriše prejšnjega, ne throw)
//   - vse v try/catch — poln/zasebni localStorage ne sme sesesti plannerja
//   - branje defenzivno: manjkajoč/smeten/korupten zapis oz. neveljavna
//     oblika (dni niso neprazen array) → null
// ============================================================================

import type { Itinerary, PlannerInput } from "@/lib/types";

/** localStorage ključ zadnjega načrta — isti niz kot dosedaj (ne spreminjaj). */
export const LAST_ITINERARY_KEY = "discoverslovenia_last_itinerary";

/** Meja zapisa v znakih serializiranega JSON (250 KB — vrednost plannerja). */
export const MAX_PERSIST_CHARS = 250 * 1024;

/** Oblika zapisa — isto strukturo sta nekoč definiral planner in klepet. */
export interface PersistedItinerary {
  itinerary: Itinerary;
  formData?: PlannerInput;
  savedAt?: string;
}

/**
 * Zapiše zadnji načrt v localStorage — drop-in za oba nekdaj duplicirana
 * pisca:
 *   - planner: persistItineraryLocally(it, input) → persistItinerary(it, input)
 *   - klepet:  persistLastItinerary(it, formData?) → persistItinerary(it, formData)
 *
 * Prvi parameter je tipovno DEFENZIVEN (unknown) — neveljaven vhod pomeni
 * le, da ga bralna stran (readLastItinerary) zavrze; pisanje nikoli ne
 * throwa. Če klic pošlje ŽE SESTAVLJEN PersistedItinerary payload kot
 * prvi argument (klic z enim argumentom), se ta zapiše takoj, brez dvojnega
 * ovijanja (Itinerary sam nikoli nima lastnosti "itinerary", zato se
 * običajna pot (it, formData) nikoli ne zamenja s payload potjo).
 *
 * @returns true, če je bil zapis dejansko izveden (pod mejo, storage dela)
 */
export function persistItinerary(
  it: unknown,
  formData?: PlannerInput
): boolean {
  try {
    const alreadyPayload =
      !!it &&
      typeof it === "object" &&
      "itinerary" in it &&
      !!(it as { itinerary?: unknown }).itinerary;
    const payload = alreadyPayload
      ? it
      : {
          itinerary: it,
          formData,
          savedAt: new Date().toISOString(),
        };
    const serialized = JSON.stringify(payload);
    if (serialized.length < MAX_PERSIST_CHARS) {
      localStorage.setItem(LAST_ITINERARY_KEY, serialized);
      return true;
    }
    return false;
  } catch {
    // Poln/zasebni localStorage — mirno preskoči
    return false;
  }
}

/**
 * Prebere zadnji načrt iz localStorage (defenzivno — smeti ne sesujejo
 * aplikacije). Validacija je ISTA kot plannerjeva obnovitvena pot:
 * payload mora imeti itinerary z NEPRAZNIM arrayem dni (days.length > 0).
 *
 * Opomba: formData se tukaj NE validira — planner ob obnovi sam odloči
 * (isValidPlannerInput), ali ga uporabi; klepet ga ne potrebuje.
 */
export function readLastItinerary(): PersistedItinerary | null {
  try {
    const raw = localStorage.getItem(LAST_ITINERARY_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedItinerary | null;
    if (
      !parsed ||
      !parsed.itinerary ||
      !Array.isArray(parsed.itinerary.days) ||
      parsed.itinerary.days.length === 0
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
