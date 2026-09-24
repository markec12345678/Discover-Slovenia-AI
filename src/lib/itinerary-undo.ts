// ============================================================================
// ISSUE #4 §22 (VAL 5, sklop C) — ODNESLJIV UNDO SKLAD NAČRTOVALNIKA
// ============================================================================
// ČISTI modul (brez Reacta/omrežja/baze) — enolično testljiv sloj nad
// plannerjevim setItinerary. Vsak DESTRUKTIVNI prehod (AI refinement,
// regeneracija) potisne PREJŠNJO vsebino na sklad; "Razveljavi" jo vzame
// nazaj. Omejen (bound) — pomnilnik ne raste neomejeno.
//
// Zakaj ≠ SavedItineraryRevision (strežnik): ta sklad je SEJNA varnostka
// ("AI refinement ne sme nepreklicno prepisati tripa" — citat §22) PRED
// shranjevanjem; strežniške revizije pa pokrivajo ZAMENJAVE ŽE shranjene
// vsebine (PATCH). Skupno: v1 → refinement → v2 vsebuje undo v obeh
// svetovih (lokalno pred shranitvijo, strežniško po njej).
//
// ČISTOST: nikoli lastna ura znotraj — `at` vnosa podaja klicalnik
// (testno deterministično). Nima stranskih učinkov — čiste funkcije.
// ============================================================================

import type { Itinerary } from "./types";

/** Največje število odvzemov (globina zgodovine sejnih sprememb). */
export const UNDO_STACK_LIMIT = 10;

/** En vnos sklada — vsebina PRED spremembo + oznaka vira spremembe. */
export interface UndoEntry {
  /** Vsebina, ki jo sprememba ZAMENJUJE (prejšnja različica). */
  itinerary: Itinerary;
  /** Kratek opis spremembe (refine/regeneracija) — za aria/tooltip. */
  label: string;
  /** Čas vnosa (epoch ms) — podaja KLICALNIK (ne klicalnikov zunanji čas tu). */
  at: number;
}

/**
 * Potisni prejšnjo vsebino na sklad (po vzorcu immutabilnega reduktorja).
 * Meja: ob prekoračitvi NAJSTAREJŠI vnos odpade (FIFO) — zadnjih
 * UNDO_STACK_LIMIT sprememb je vedno dosegljivih.
 */
export function pushUndo(
  stack: readonly UndoEntry[],
  entry: UndoEntry
): UndoEntry[] {
  const next = [...stack, entry];
  return next.length > UNDO_STACK_LIMIT
    ? next.slice(next.length - UNDO_STACK_LIMIT)
    : next;
}

/** Ali je razveljavitev možna (sklad ni prazen). */
export function canUndo(stack: readonly UndoEntry[]): boolean {
  return stack.length > 0;
}

/**
 * Vzemi zadnji vnos (LIFO) — vsebina za vrnitev + sklad BREZ njega.
 * Prazen sklad → null (klicalnik ne ponuja gumba — canUndo vrata).
 */
export function popUndo(
  stack: readonly UndoEntry[]
): { entry: UndoEntry; remaining: UndoEntry[] } | null {
  if (stack.length === 0) return null;
  const entry = stack[stack.length - 1];
  return { entry, remaining: stack.slice(0, -1) };
}

/** Zadnji vnos BREZ odvzema (za prikaz "Razveljavi: {label}"). */
export function peekUndo(stack: readonly UndoEntry[]): UndoEntry | null {
  return stack.length > 0 ? stack[stack.length - 1] : null;
}
