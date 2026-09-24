import type { PrismaClient } from "@prisma/client";

// ============================================================================
// CLIENT PARITY — varovalka proti ZASTARELEMU Prisma klientu (1.98.1)
// ============================================================================
//
// VZROK (dokazan na produkciji 1.98.0, 2026-09-24): prisma/schema.prisma je
// imel lokalno zastavico git skip-worktree (dvojnа-env konvencija: repozitorij
// provider=postgresql, lokalni dev provider=sqlite). POSLEDICA: vse spremembe
// MODELOV od VALA 2 dalje (isPublic/contentVersion/updatedAt,
// TripCollaborator, TripExpense, TripDocument, SavedItineraryRevision,
// JourneyBooking.source/importData) so ostale SAMO v lokalnem delovnem
// drevesu — repozitorij (in s tem Render build) je gradil Prisma klienta iz
// ZASTARELE sheme. Produkcija: vsa BRANJA SavedItinerary s select isPublic
// so padala s PrismaClientValidationError ("Unknown field `isPublic`"),
// pisi (create brez teh polj) pa delovala — tiha, delujoča aplikacija z
// polomljenimi branjem poti.
//
// TA PREVERBA ob zagonu strežnika (instrumentation.ts) zahteva TISTA polja/
// modele, ki so bila žrtev pasti — PrismaClientValidationError se vrže ŽE NA
// STRANI KLIJENTA (ne potrebuje DB odgovora), zato je preverba poceni in
// takojšnja. Drugi klici (P2021 tabela ne obstaja ipd.) se NE štejejo kot
// pariteta — to je delo n-migracij, ne zastarelega klienta.
//
// ČIST MODUL: brez lastne ure, brez omrežja — samo prekliče podane funkcije
// klienta (testi vstopajo z lastnimi stub-i).
// ============================================================================

/** Minimalna površina Prisma klienta, ki jo preverjamo (testljivo). */
export interface ParityDb {
  savedItinerary: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
  tripCollaborator: { count: (args?: unknown) => Promise<number> };
  tripExpense: { count: (args?: unknown) => Promise<number> };
  tripDocument: { count: (args?: unknown) => Promise<number> };
  savedItineraryRevision: { count: (args?: unknown) => Promise<number> };
}

export interface ClientParityResult {
  ok: boolean;
  /** Uspešno preverjeni modeli/stolpci (dijagnostika v health detail). */
  verified: string[];
  /** Prva napaka PARITETE (PrismaClientValidationError) — null, če ni bilo. */
  staleClientError: string | null;
  /** Nedestruktivne druge napake (npr. manjkajoča tabela) — ne sesuje preverbe. */
  nonFatal: string[];
}

/** Prepozna klasa napake zastarelega klienta (velja za vse Prisma razrede). */
export function isStaleClientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  // PrismaClientValidationError se vrže CLIENT-side, šE pred poizvedbo —
  // to je točno razred "klient ne pozna polja/modela".
  if (error.name === "PrismaClientValidationError") return true;
  // Vedi varno tudi sporočilno obliko ( različice Prisma runtime-a).
  const msg = error.message || "";
  return msg.includes("Unknown field") || msg.includes("Unknown argument");
}

/**
 * Preveri, da TOK generiran Prisma klient pozna vsa polja/modelе, ki so bila
 * žrtev skip-worktree pasti (1.98.1). Vsak klic posebej: prva napaka
 * paritete prekine in se javi; druge napake (DB-side) se zabeležijo kot
 * nonFatal in NE pomenijo zastarelega klienta.
 */
export async function checkClientModelParity(
  db: ParityDb
): Promise<ClientParityResult> {
  const verified: string[] = [];
  const nonFatal: string[] = [];

  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
      verified.push(label);
    } catch (error) {
      if (isStaleClientError(error)) {
        throw error; // ZASTAREL KLIENT — takoj ven (pariteta je prelomljena)
      }
      nonFatal.push(`${label}: ${String(error).slice(0, 120)}`);
    }
  };

  try {
    await step(
      "SavedItinerary.isPublic/contentVersion/updatedAt",
      () =>
        db.savedItinerary.findUnique({
          where: { shareId: "__client_parity_probe__" },
          select: { isPublic: true, contentVersion: true, updatedAt: true },
        })
    );
    await step("TripCollaborator", () => db.tripCollaborator.count());
    await step("TripExpense", () => db.tripExpense.count());
    await step("TripDocument", () => db.tripDocument.count());
    await step("SavedItineraryRevision", () =>
      db.savedItineraryRevision.count()
    );
    return { ok: true, verified, staleClientError: null, nonFatal };
  } catch (error) {
    return {
      ok: false,
      verified,
      staleClientError:
        error instanceof Error ? error.message.slice(0, 300) : String(error),
      nonFatal,
    };
  }
}

/** Produkcijska ovojnica — globalni db klient (lazy uvoz, enak vzorec). */
export async function checkClientModelParityLive(): Promise<ClientParityResult> {
  const { db } = await import("@/lib/db");
  return checkClientModelParity(
    db as unknown as ParityDb
  );
}
