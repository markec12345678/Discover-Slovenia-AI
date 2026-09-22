// TASK 93 — segmentacija dneva (Jutro / Popoldan / Večer) kot SKUPNA lib.
//
// Zgodovina: UI sprint (nabor #2, docs/AI/MINDTRIP-ANALIZA-2026-09-AGENT.md
// §6.2.1) je uvedel segmentacijo SAMO v podrobnem pogledu dneva ("Več o tvoji
// poti") z LOKALNO funkcijo v itinerary-planner.tsx. TASK 93 razširi isto
// segmentacijo na zadnji dve površini (TripTimeline + SharedTrip) in spravi
// logiko v eno resnico tukaj — 0 omrežja/db/React, čista funkcija.
//
// SEMANTIKA (nespremenjena iz UI sprinta — ekstrakcija, ne redesign):
// - "HH:MM-…" → košarica po ZAČETNI uri (ključni vir: AI time_slot polje).
// - besedilni sloti → ključne besede (SL + EN).
// - neznano → null (BREZ segmentacije — nazaj kompatibilno s starimi načrti,
//   brez ugibanj; §8 poštenostne discipline).
// - NE spreminja podatkovne plasti (time_slot ostaja edini vir).

export type DaySegment = "morning" | "afternoon" | "evening";

/** Oznake segmentov (L vzorec — dvajezična polja, kot journey/trip-view).
 *  Površine z next-intl lahko uporabijo lastne ključe; SharedTrip (samo SL)
 *  bere .sl direktno — ena resnica za besedilo. */
export const DAY_SEGMENT_LABELS: Record<DaySegment, { sl: string; en: string }> = {
  morning: { sl: "Jutro", en: "Morning" },
  afternoon: { sl: "Popoldan", en: "Afternoon" },
  evening: { sl: "Večer", en: "Evening" },
};

/** time_slot → segment dneva; null pri neznanem (brez ugibanj). */
export function segmentOfSlot(slot: string | null | undefined): DaySegment | null {
  if (!slot) return null;
  const hourMatch = slot.match(/^(\d{1,2}):(\d{2})/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  }
  const lower = slot.toLowerCase();
  if (/(jutr|zjutraj|morning)/.test(lower)) return "morning";
  if (/(popoldan|afternoon)/.test(lower)) return "afternoon";
  if (/(večer|vecer|zvečer|zvecer|evening|night)/.test(lower)) return "evening";
  return null;
}

export interface SegmentBoundary {
  /** Segment TEGA elementa (null = neznan → brez glave). */
  segment: DaySegment | null;
  /** Ali naj se glava segmenta izriše NAD tem elementom (prehod ali prvi). */
  showHeader: boolean;
}

/** Meja segmenta za element na indeksu `idx` znotraj urejenega seznama.
 *
 * Pravilo (isto kot UI sprint v podrobnem pogledu):
 * - prvi element z znanim segmentom → glava (dneva se začne z "JUTRO");
 * - prehod proti prejšnjim (znanim ali neznanim) → glava;
 * - element z neznanim slotom → BREZ glave (ne trdimo ničesar);
 * - praznemu/neobstoječemu indeksu → nič (defenzivno, fail-closed).
 */
export function segmentBoundaryAt<T extends { time_slot?: string | null }>(
  items: readonly T[],
  idx: number
): SegmentBoundary {
  const item = items[idx];
  if (!item) return { segment: null, showHeader: false };
  const segment = segmentOfSlot(item.time_slot);
  if (segment === null) return { segment: null, showHeader: false };
  if (idx === 0) return { segment, showHeader: true };
  const prevSeg = segmentOfSlot(items[idx - 1]?.time_slot);
  return { segment, showHeader: segment !== prevSeg };
}
