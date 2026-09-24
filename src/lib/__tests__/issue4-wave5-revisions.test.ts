// ============================================================================
// ISSUE #4 §22 — TRIP VERSIONING / UNDO TESTI (VAL 5, 1.97.0)
// ============================================================================
// Naročnikova zahteva (citat §22): "AI refinement ne sme nepreklicno
// prepisati tripa. Minimalno: Trip v1 → refinement → Trip v2, z možnostjo
// restore prejšnje verzije."
//
// Preverjamo (vzorec issue4-wave4-documents — unit nad migracijo +
// source-contract nad DEJANSKIMI datotekami + čisti modul undo sklada):
//   1. Zagonška migracija SavedItineraryRevision (idempotentna, obe
//      narečji, fail-open);
//   2. Prisma model + baseline SQL + migracijski DDL skladje (drift vrata);
//   3. Instrumentacija registrira schema:trip-revisions;
//   4. PATCH ruta: revizija STARE vsebine znotraj uspelega CAS + retencija
//      20 + fail-open + iskren revisionSaved v odgovoru/auditu;
//   5. GET revisions ruta: vrata ≥ EDITOR, metapodatki brez vsebine,
//      posamezna revizija z vsebino, audit TRIP_REVISION_READ;
//   6. Sejni undo sklad (čist modul): bound 10, LIFO, FIFO izrivanje;
//   7. Klient: updateItinerary (PATCH + editToken glava) + planner wiring
//      (3 destruktivna mesta → applyItinerary; undo čip; PATCH-na-mesto
//      pred novim shareId) + /pot zgodovina verzij UI.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { migrateTripRevisionsSchemaWith } from "../trip-revisions-migration";
import {
  pushUndo,
  popUndo,
  canUndo,
  peekUndo,
  UNDO_STACK_LIMIT,
  type UndoEntry,
} from "../itinerary-undo";
import type { Itinerary } from "../types";

const ROOT = process.cwd();

/** Lažni Prisma klient z beleženjem izjav (scripted odgovori). */
function makeDb(script: {
  pragmaThrows?: boolean;
  info?: unknown[];
  infoThrows?: boolean;
  /** PRAGMA table_info(SavedItineraryRevision) — neprazno = obstaja. */
  revisionExists?: boolean;
  infoRevisionExists?: boolean;
}) {
  const calls = { query: [] as string[], exec: [] as string[] };
  const db = {
    async $queryRawUnsafe(sql: string) {
      calls.query.push(sql);
      if (sql.startsWith("PRAGMA")) {
        if (script.pragmaThrows) throw new Error("syntax error near PRAGMA");
        if (sql.includes("SavedItineraryRevision")) {
          return script.revisionExists ? [{ name: "id" }] : [];
        }
        // PRAGMA SavedItinerary (dialect detekcija) = sqlite
        return [{ name: "id" }];
      }
      if (sql.includes("information_schema.tables")) {
        if (sql.includes("SavedItineraryRevision")) {
          return script.infoRevisionExists ? [{ x: 1 }] : [];
        }
        if (script.infoThrows) throw new Error("connection refused");
        return script.info ?? [{}];
      }
      return [];
    },
    async $executeRawUnsafe(sql: string) {
      calls.exec.push(sql);
      return 0;
    },
  };
  return { db, calls };
}

type SchemaDb = Parameters<typeof migrateTripRevisionsSchemaWith>[0];

function source(rel: string): string {
  return readFileSync(`${ROOT}/${rel}`, "utf8");
}

// ---------------------------------------------------------------------------
// 1. MIGRACIJA (unit)
// ---------------------------------------------------------------------------

describe("§22 trip-revisions-migration (unit)", () => {
  test("postgres, tabela manjka → CREATE TABLE + 2 indeksa", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, info: [{}] });
    const r = await migrateTripRevisionsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("postgres");
    expect(r.tablesCreated).toEqual(["SavedItineraryRevision"]);
    const ddl = calls.exec.join("\n");
    expect(ddl).toContain('CREATE TABLE "SavedItineraryRevision"');
    expect(ddl).toContain('"shareId" TEXT NOT NULL');
    expect(ddl).toContain('"version" INTEGER NOT NULL');
    expect(ddl).toContain('"itinerary" TEXT NOT NULL');
    expect(ddl).toContain('"authorRole" TEXT NOT NULL');
    expect(ddl).toContain('"createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP');
    expect(calls.exec.filter((s) => s.includes("CREATE INDEX"))).toHaveLength(2);
  });

  test("sqlite, tabela manjka → IF NOT EXISTS DDL", async () => {
    const { db, calls } = makeDb({});
    const r = await migrateTripRevisionsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("sqlite");
    expect(r.tablesCreated).toEqual(["SavedItineraryRevision"]);
    expect(calls.exec[0]).toContain("CREATE TABLE IF NOT EXISTS");
    expect(calls.exec[0]).toContain('"createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP');
  });

  test("IDEMPOTENTNA: tabela obstaja → NE ustvarja, samo indeksi", async () => {
    const { db, calls } = makeDb({ revisionExists: true });
    const r = await migrateTripRevisionsSchemaWith(db as unknown as SchemaDb);
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec.some((s) => s.includes("CREATE TABLE"))).toBe(false);
    expect(calls.exec.filter((s) => s.includes("CREATE INDEX"))).toHaveLength(2);
  });

  test("FAIL-OPEN: DB nedosegljiva → unknown, brez izjav", async () => {
    const { db, calls } = makeDb({ pragmaThrows: true, infoThrows: true });
    const r = await migrateTripRevisionsSchemaWith(db as unknown as SchemaDb);
    expect(r.dialect).toBe("unknown");
    expect(r.tablesCreated).toEqual([]);
    expect(calls.exec).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. DRIFT VRATA: schema ↔ baseline ↔ migracijski modul
// ---------------------------------------------------------------------------

describe("§22 — skladje schema.prisma ↔ baseline SQL ↔ migracija (drift vrata)", () => {
  const schema = source("prisma/schema.prisma");
  const baseline = source(
    "prisma/migrations/20260916000000_baseline/migration.sql"
  );
  const migrationModule = source("src/lib/trip-revisions-migration.ts");

  test("schema.prisma ima model SavedItineraryRevision z vsemi §22 stolpci", () => {
    const start = schema.indexOf("model SavedItineraryRevision {");
    expect(start).toBeGreaterThan(-1);
    const model = schema.slice(start, schema.indexOf("}", start));
    for (const col of [
      "shareId",
      "version",
      "itinerary",
      "name",
      "authorId",
      "authorRole",
      "createdAt",
    ]) {
      expect(model).toContain(col);
    }
    // Indeksa kot jih ustvari db push (skladje z DDL spodaj)
    expect(model).toContain('@@index([shareId, version])');
    expect(model).toContain('@@index([createdAt])');
  });

  test("baseline SQL vsebuje SavedItineraryRevision DDL + 2 indeksa", () => {
    expect(baseline).toContain('CREATE TABLE "SavedItineraryRevision"');
    expect(baseline).toContain(
      'CREATE INDEX "SavedItineraryRevision_shareId_version_idx" ON "SavedItineraryRevision"("shareId", "version")'
    );
    expect(baseline).toContain(
      'CREATE INDEX "SavedItineraryRevision_createdAt_idx" ON "SavedItineraryRevision"("createdAt")'
    );
  });

  test("migracijski modul DDL se ujema z baseline (postgres oblika + indeksa)", () => {
    expect(migrationModule).toContain(
      'CREATE TABLE "SavedItineraryRevision" ('
    );
    expect(migrationModule).toContain('"version" INTEGER NOT NULL');
    expect(migrationModule).toContain(
      'CREATE INDEX IF NOT EXISTS "SavedItineraryRevision_shareId_version_idx"'
    );
    expect(migrationModule).toContain(
      'CREATE INDEX IF NOT EXISTS "SavedItineraryRevision_createdAt_idx"'
    );
  });

  test("instrumentacija registrira schema:trip-revisions (obe veji)", () => {
    const instr = source("src/instrumentation.ts");
    expect(instr).toContain('name: "schema:trip-revisions"');
    // Izklopna veja (DSA_DISABLE_SCHEMA_MIGRATION) prav tako javi skipped
    expect(instr.split("schema:trip-revisions").length).toBeGreaterThanOrEqual(
      4
    );
  });
});

// ---------------------------------------------------------------------------
// 3. PATCH RUTA — revizija znotraj CAS (source-contract)
// ---------------------------------------------------------------------------

describe("§22 — PATCH /api/itinerary/shared/[shareId] piše revizijo (source-contract)", () => {
  const route = source("src/app/api/itinerary/shared/[shareId]/route.ts");

  test("prebere STARO vsebino PRED CAS (samo ob menjavi vsebine)", () => {
    expect(route).toContain("const prePatch =");
    expect(route).toContain(
      "itineraryJson !== null\n        ? await db.savedItinerary.findUnique"
    );
  });

  test("revizija se zapiše SAMO po uspelem CAS (znotraj count > 0 poti)", () => {
    // Zapis je PO konfliktnem 409 returnu (vrstni red v datoteki)
    const conflictIdx = route.indexOf("status: 409");
    const createIdx = route.indexOf("db.savedItineraryRevision.create");
    expect(conflictIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(conflictIdx);
    // Fail-open: napaka revizije NE sesuje PATCH-a
    expect(route).toContain("revizija ni zapisana (fail-open)");
    expect(route).toContain("let revisionSaved = false");
  });

  test("retencija: TRIP_REVISIONS_KEEP = 20 + deleteMany nad verzijo", () => {
    expect(route).toContain("const TRIP_REVISIONS_KEEP = 20;");
    expect(route).toContain("db.savedItineraryRevision.deleteMany");
    expect(route).toContain('orderBy: { version: "desc" }');
    expect(route).toContain("skip: TRIP_REVISIONS_KEEP");
  });

  test("iskren odgovor + audit: revisionSaved se vrača in logira", () => {
    expect(route).toContain("revisionSaved,");
    expect(route).toContain("revisionSaved,");
    // odgovor (additive — klienti ≤1.96 prezrejo)
    expect(route).toContain("// §22: dodano (additive) — klienti ≤1.96 ga prezrejo.");
  });

  test("NAME-ONLY sprememba NE dela revizije (prePatch null)", () => {
    // prePatch je pogojen z itineraryJson !== null (zgoraj) — preveri
    // izrecni pogoj prisotnosti v if-u zapisa
    expect(route).toContain("if (prePatch && prePatch.itinerary) {");
  });
});

// ---------------------------------------------------------------------------
// 4. GET REVIZIJE RUTA — vrata + metapodatki (source-contract)
// ---------------------------------------------------------------------------

describe("§22 — GET /api/itinerary/shared/[shareId]/revisions (source-contract)", () => {
  const route = source(
    "src/app/api/itinerary/shared/[shareId]/revisions/route.ts"
  );

  test("vrata ≥ EDITOR: javna pot 403, zasebna 404 (obstoj skrit)", () => {
    expect(route).toContain('roleAtLeast(role, "EDITOR")');
    expect(route).toContain("!saved.isPublic");
    expect(route).toContain("status: 404");
    expect(route).toContain("status: 403");
  });

  test("seznam vrača SAMO metapodatke (sizeBytes, NE vsebine)", () => {
    expect(route).toContain("sizeBytes: r.itinerary.length");
    // Seznamna pot (map nad r) NE vrača itinerarja — vsebina se vrača
    // SAMO v posamezni (\?version=N) veji, ne v seznamu.
    const listMapper = route.slice(
      route.indexOf("revisions: rows.map"),
      route.indexOf("}));", route.indexOf("revisions: rows.map"))
    );
    expect(listMapper).not.toContain("itinerary:");
  });

  test("?version=N vrača celo vsebino + audit TRIP_REVISION_READ", () => {
    expect(route).toContain('searchParams.get("version")');
    expect(route).toContain("JSON.parse(revision.itinerary)");
    expect(route).toContain("AUDIT_ACTIONS.TRIP_REVISION_READ");
  });

  test("veljavacijska vrata: version integer ≥ 0 (zloraba odpade)", () => {
    expect(route).toContain("Number.isInteger(version)");
    expect(route).toContain("version < 0");
  });

  test("retencija bralne poti usklajena s pisalno (20)", () => {
    expect(route).toContain("const REVISIONS_RETURN_LIMIT = 20;");
    expect(route).toContain("take: REVISIONS_RETURN_LIMIT");
  });
});

// ---------------------------------------------------------------------------
// 5. AUDIT AKCIJA
// ---------------------------------------------------------------------------

describe("§22 — audit-log akcija", () => {
  test("TRIP_REVISION_READ je registrirana v AUDIT_ACTIONS", () => {
    const audit = source("src/lib/audit-log.ts");
    expect(audit).toContain('TRIP_REVISION_READ: "trip_revision_read"');
  });
});

// ---------------------------------------------------------------------------
// 6. SEJNI UNDO SKLAD (čist modul — unit)
// ---------------------------------------------------------------------------

const fakeItinerary = (name: string): Itinerary =>
  ({
    title: name,
    source: "deterministic",
    days: [],
  }) as unknown as Itinerary;

function entry(name: string, at: number): UndoEntry {
  return { itinerary: fakeItinerary(name), label: `refine:${name}`, at };
}

describe("§22 itinerary-undo (čist modul)", () => {
  test("prazen sklad: canUndo false, popUndo null, peekUndo null", () => {
    expect(canUndo([])).toBe(false);
    expect(popUndo([])).toBeNull();
    expect(peekUndo([])).toBeNull();
  });

  test("push → canUndo true; pop vrne ZADNJI vnos (LIFO) + skrajšani sklad", () => {
    const stack = pushUndo(pushUndo([], entry("a", 1)), entry("b", 2));
    expect(canUndo(stack)).toBe(true);
    const popped = popUndo(stack)!;
    expect(popped.entry.label).toBe("refine:b");
    expect(popped.remaining).toHaveLength(1);
    // pop NE spremeni originala (imutabilno)
    expect(stack).toHaveLength(2);
  });

  test("peek vrne zadnji BREZ odvzema", () => {
    const stack = pushUndo(pushUndo([], entry("a", 1)), entry("b", 2));
    expect(peekUndo(stack)?.label).toBe("refine:b");
    expect(stack).toHaveLength(2);
  });

  test(`BOUND ${UNDO_STACK_LIMIT}: najstarejši vnos se izrine (FIFO)`, () => {
    let stack: UndoEntry[] = [];
    for (let i = 0; i < UNDO_STACK_LIMIT + 5; i++) {
      stack = pushUndo(stack, entry(`v${i}`, i));
    }
    expect(stack).toHaveLength(UNDO_STACK_LIMIT);
    // Zadnji ostane zadnji; NAJSTAREJŠI preživeli je v5 (v0–v4 izrinjeni)
    expect(peekUndo(stack)?.label).toBe(`refine:v${UNDO_STACK_LIMIT + 4}`);
    expect(stack[0].label).toBe("refine:v5");
    // Celoten sklad se da popnati do konca (ni lukenj)
    let remaining = stack;
    let count = 0;
    while (canUndo(remaining)) {
      remaining = popUndo(remaining)!.remaining;
      count++;
    }
    expect(count).toBe(UNDO_STACK_LIMIT);
  });

  test("čistost modula (source-contract): brez Date.now/fetch/prisma/ai-client", () => {
    const mod = source("src/lib/itinerary-undo.ts");
    expect(mod).not.toContain("Date.now()");
    expect(mod).not.toContain("fetch(");
    expect(mod).not.toContain("prisma");
    expect(mod).not.toContain("ai-client");
  });
});

// ---------------------------------------------------------------------------
// 7. KLIENT: itinerary-share + planner + /pot UI (source-contract)
// ---------------------------------------------------------------------------

describe("§22 — klient (itinerary-share.ts, planner, /pot)", () => {
  const shareLib = source("src/lib/itinerary-share.ts");
  const planner = source("src/components/sections/itinerary-planner.tsx");
  const collab = source("src/components/trip-collaboration.tsx");

  test("updateItinerary: PATCH + x-dsa-edit-token + CAS baseVersion", () => {
    expect(shareLib).toContain("export async function updateItinerary");
    expect(shareLib).toContain('method: "PATCH"');
    expect(shareLib).toContain('"x-dsa-edit-token"');
    expect(shareLib).toContain("baseVersion");
    // 409 se NE poje tiho — vrže iskreno napako
    expect(shareLib).toContain("res.status === 409");
  });

  test("fetchTripRevisions/fetchTripRevisionContent: vrata + vsebina", () => {
    expect(shareLib).toContain("export async function fetchTripRevisions");
    expect(shareLib).toContain(
      "export async function fetchTripRevisionContent"
    );
    expect(shareLib).toContain("/revisions?version=");
  });

  test("planner: VSA TRI destruktivna mesta gredo skozi applyItinerary", () => {
    // 2× onRefined (kontrolna vrstica + rail refiner) + regeneracija
    expect(planner.split("applyItinerary(newItinerary").length).toBe(3);
    expect(planner).toContain('applyItinerary(data, t("undoLabelRegenerate"))');
  });

  test("planner: undo čip pogojen z canUndo + gumb Razveljavi + čiščenje", () => {
    expect(planner).toContain("{canUndo(undoStack) && (");
    expect(planner).toContain("onClick={handleUndo}");
    expect(planner).toContain("onClick={() => setUndoStack([])}");
    expect(planner).toContain('t("undoChipAction")');
  });

  test("planner: PATCH-na-mesto PRED novim shareId (pogoji: editToken + znana verzija)", () => {
    expect(planner).toContain("const linked =");
    expect(planner).toContain("linked.contentVersion !== null");
    expect(planner).toContain("getEditToken(linked.shareId)");
    expect(planner).toContain("await updateItinerary(");
    // Iskren padec: save_inplace_fallback dogodek + console.warn
    expect(planner).toContain('"save_inplace_fallback"');
    // Nova pot še vedno obstaja (POST) po neuspehu PATCH-a
    expect(planner).toContain("await saveItinerary(itinerary, formData)");
  });

  test("planner: linkedTrip nosi contentVersion (POST → 0, odprta pot → null)", () => {
    expect(planner).toContain("contentVersion: 0");
    expect(planner).toContain("contentVersion: null");
  });

  test("/pot: Zgodovina verzij sekcija (leneco + obnovitev s CAS + reload)", () => {
    expect(collab).toContain("Zgodovina verzij");
    expect(collab).toContain("fetchTripRevisions");
    expect(collab).toContain("fetchTripRevisionContent");
    expect(collab).toContain("restoreVersion");
    expect(collab).toContain("agg.version.contentVersion");
    expect(collab).toContain("window.location.reload()");
  });

  test("i18n pariteta: planner undo + updated ključi v SL in EN", () => {
    const sl = JSON.parse(source("src/i18n/messages/sl.json")) as Record<
      string,
      Record<string, string>
    >;
    const en = JSON.parse(source("src/i18n/messages/en.json")) as Record<
      string,
      Record<string, string>
    >;
    for (const key of [
      "savedUpdatedToast",
      "savedUpdatedToastDesc",
      "undoLabelRefine",
      "undoLabelRegenerate",
      "undoChip",
      "undoChipAction",
      "undoChipDismiss",
    ]) {
      expect(sl.planner[key]?.length ?? 0).toBeGreaterThan(0);
      expect(en.planner[key]?.length ?? 0).toBeGreaterThan(0);
    }
    // SL/EN sta prava prevoda (ne kopija) — vzorec task71
    expect(sl.planner.undoChipAction).not.toBe(en.planner.undoChipAction);
    expect(sl.planner.undoChip).toContain("{count}");
    expect(en.planner.undoChip).toContain("{count}");
    expect(sl.planner.savedUpdatedToast).toContain("{version}");
    expect(en.planner.savedUpdatedToast).toContain("{version}");
  });
});
