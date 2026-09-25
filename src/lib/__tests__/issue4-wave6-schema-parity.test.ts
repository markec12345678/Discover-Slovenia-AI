import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  checkClientModelParity,
  isStaleClientError,
  type ParityDb,
} from "@/lib/client-parity";

// ============================================================================
// ISSUE #4 VAL 6 dopolnitev (1.98.1) — VAROVALKI PROTI PASTI SKIP-WORKTREE
// ============================================================================
//
// DEJSTVO (produkcija 1.98.0, 2026-09-24): prisma/schema.prisma je imel
// lokalno zastavico git skip-worktree (dvojni-env: repo provider=postgresql,
// lokalni dev provider=sqlite). Vse spremembe MODELOV VAL 2–5 so ostale
// SAMO v delovnem drevesu → Render je gradil Prisma klienta iz ZASTARELE
// sheme → vsa branja SavedItinerary (select isPublic) so padala s
// PrismaClientValidationError, pisi pa delovali (create polja izpusti).
//
// VAROVALKA 1 (test spodaj): MODEL VSEBINA delovnega drevesa mora biti
//   IDENTIČNA oddanemu HEAD (izjema: SAMO provider vrstica — to je edina
//   dovoljena lokalna razlika). Če agent doda model/polje lokalno in ga NE
//   commita, ta test PADA z glasnim navodilom.
// VAROVALKA 2: žrtveni modeli/polja morajo OBSTAJATI v shemi (zaščita
//   pred nesrečnim brisanjem).
// VAROVALKA 3: client-parity modul (instrumentacija produkcije) — enotski
//   testi vedenja s stub-i.
// ============================================================================

/** Odstrani SAMO datasource provider vrstico (edina dovoljena razlika). */
function stripProviderLine(content: string): string {
  return content
    .split("\n")
    .filter((line) => !/provider\s*=\s*"(postgresql|sqlite)"/.test(line))
    .join("\n");
}

function readHeadSchema(): string | null {
  try {
    const out = execFileSync(
      "git",
      ["show", "HEAD:prisma/schema.prisma"],
      { encoding: "utf-8", timeout: 15_000 }
    );
    return typeof out === "string" ? out : null;
  } catch {
    // Okolje brez git/HISTORY (npr. izvožen arhiv) — varovalka se preskoči
    // (CI ima vedno git; lokalni razvoj prav tako).
    return null;
  }
}

describe("ISSUE #4 VAL 6+ (1.98.1) — skip-worktree PAST: shema v repu = shema lokalno", () => {
  test("① MODEL VSEBINA prisma/schema.prisma je IDENTIČNA HEAD (edina izjema: provider vrstica)", () => {
    const head = readHeadSchema();
    if (head === null) {
      console.warn(
        "[schema-parity] git show HEAD nedosegljiv — varovalka preskočena"
      );
      expect(true).toBe(true);
      return;
    }
    const local = readFileSync("prisma/schema.prisma", "utf-8");
    const headModels = stripProviderLine(head);
    const localModels = stripProviderLine(local);
    expect(localModels).toBe(
      headModels
    );
    // GLASNO navodilo ob padcu (asertacija zgoraj nosi breme):
    // če ta test pade, je nekdo spremenil MODELE lokalno in jih NE commita
    // (skip-worktree past!) — produkcija bo gradila zastarega klienta.
  });

  test("② žrtveni modeli/stolpci pasti OBSTAJAJO v shemi (isPublic, contentVersion, updatedAt, TripCollaborator, TripExpense, TripDocument, SavedItineraryRevision, JourneyBooking.source/importData)", () => {
    const schema = readFileSync("prisma/schema.prisma", "utf-8");
    expect(schema).toContain("isPublic    Boolean  @default(true)");
    expect(schema).toContain("contentVersion Int   @default(0)");
    expect(schema).toContain("updatedAt   DateTime @updatedAt");
    expect(schema).toContain("model TripCollaborator {");
    expect(schema).toContain("model TripExpense {");
    expect(schema).toContain("model TripDocument {");
    expect(schema).toContain("model SavedItineraryRevision {");
    expect(schema).toContain("source            String?");
    expect(schema).toContain("importData        String?");
  });

  test("③ provider v HEAD je POSTGRESQL (produkcijska resnica — 1.99.1 HOTFIX past)", () => {
    // PRETEKLOST (1.99.1): commit 5d00161 je pomotoma vnesel
    // provider = "sqlite" v REPO (lokalna dev razlika je ušla prek
    // git add -A). Render je zgradil Prisma klienta iz sqlite sheme +
    // Postgres DATABASE_URL → PrismaClientInitializationError → health
    // degraded + /pot 500 na VSAH branjih.
    //
    // Ta test strippru provider vrstico PRI PRIMERJAVI modelov (①), zato
    // sam ZASEBNO ne preverja vrednosti — dopolnilna varovalka tu:
    // HEAD (oddana produkciji) MORA imeti provider = "postgresql".
    // Delovno drevo SME imeti sqlite (lokalni dev — edina dovoljena
    // razlika), REPO pa NE.
    const head = readHeadSchema();
    if (head === null) {
      console.warn("[schema-parity] git show HEAD nedosegljiv — preskočeno");
      return;
    }
    if (!/provider\s*=\s*"postgresql"/.test(head)) {
      throw new Error(
        'HEAD prisma/schema.prisma nima provider = "postgresql"! ' +
          "Repo je ODDAN produkciji (Render gradi klienta iz njega) — " +
          "sqlite v repu zlomi vse DB poizvedbe (PrismaClientInitialization" +
          "Error). Lokalni dev sqlite živi SAMO v delovnem drevesu: " +
          'spremeni vrstico nazaj na provider = "postgresql", commit, ' +
          "nato lokalno povrni sqlite."
      );
    }
  });
});

describe("ISSUE #4 VAL 6+ (1.98.1) — client-parity modul (instrumentacijska varovalka)", () => {
  function okDb(): ParityDb {
    return {
      savedItinerary: { findUnique: async () => null },
      tripCollaborator: { count: async () => 0 },
      tripExpense: { count: async () => 0 },
      tripDocument: { count: async () => 0 },
      savedItineraryRevision: { count: async () => 0 },
    };
  }

  test("③ zdrav klient: ok=true, 5 preverjenih, 0 napak", async () => {
    const r = await checkClientModelParity(okDb());
    expect(r.ok).toBe(true);
    expect(r.verified).toHaveLength(5);
    expect(r.staleClientError).toBeNull();
    expect(r.nonFatal).toHaveLength(0);
  });

  test("④ ZASTAREL klient (PrismaClientValidationError na isPublic) → ok=false, napaka javljena, nadaljnji koraki NE tečejo", async () => {
    const stale = new Error(
      'Unknown field `isPublic` for select statement on model `SavedItinerary`.'
    );
    stale.name = "PrismaClientValidationError";
    const db: ParityDb = {
      ...okDb(),
      savedItinerary: { findUnique: async () => Promise.reject(stale) },
    };
    const r = await checkClientModelParity(db);
    expect(r.ok).toBe(false);
    expect(r.staleClientError).toContain("isPublic");
    expect(r.verified).toHaveLength(0); // prvi korak že prelomil
  });

  test("⑤ DB-side napaka (P2021 tabela manjka) NI paritetna: ok ostane true, zabeleženo nonFatal", async () => {
    const dbErr = new Error("PrismaClientKnownRequestError: table does not exist");
    dbErr.name = "PrismaClientKnownRequestError";
    const db: ParityDb = {
      ...okDb(),
      tripDocument: { count: async () => Promise.reject(dbErr) },
    };
    const r = await checkClientModelParity(db);
    expect(r.ok).toBe(true);
    expect(r.nonFatal).toHaveLength(1);
    expect(r.nonFatal[0]).toContain("TripDocument");
    expect(r.verified).toHaveLength(4);
  });

  test("⑥ isStaleClientError hevristika: ime razreda, 'Unknown field', 'Unknown argument', nedoločeno → false", () => {
    const v = new Error("Unknown field `x`");
    v.name = "PrismaClientValidationError";
    expect(isStaleClientError(v)).toBe(true);
    const byMessage = new Error("Unknown argument `y`");
    byMessage.name = "RandomError";
    expect(isStaleClientError(byMessage)).toBe(true);
    const byMessage2 = new Error("... Unknown field `z` ...");
    byMessage2.name = "Other";
    expect(isStaleClientError(byMessage2)).toBe(true);
    const other = new Error("connection refused");
    other.name = "PrismaClientInitializationError";
    expect(isStaleClientError(other)).toBe(false);
    expect(isStaleClientError("not an error")).toBe(false);
    expect(isStaleClientError(null)).toBe(false);
  });

  test("⑦ čistost modula: BREZ Date.now/fetch/prisma klient uvoza (samo tip)", () => {
    const code = readFileSync("src/lib/client-parity.ts", "utf-8");
    expect(code.includes("Date.now()")).toBe(false);
    expect(/\bfetch\(/.test(code)).toBe(false);
    // Edini uvoz Prisma je TYPE-ONLY (izbris ob prevajanju):
    expect(code.includes('import type { PrismaClient }')).toBe(true);
    expect(code.includes('from "@prisma/client"')).toBe(true);
    expect(code.includes("new PrismaClient")).toBe(false);
  });
});
