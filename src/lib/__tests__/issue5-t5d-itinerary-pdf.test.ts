// ============================================================================
// ISSUE #5 / T5-D (M8) — PDF IZVOZ ITINERERJA (determinističen, č/š/ž)
// ============================================================================
// Vrzel (matrika M8): "PDF izvoz itinererja ne obstaja" — edini izvoz je bil
// brskalniški window.print() (odvisen od brskalnika, brez garancije oblike).
//
// Fix (T5-D): lib/pdf/trip-itinerary-pdf.ts (pdf-lib + Liberation Sans,
// večstranska paginacija, noga s številčenjem, iskrena vir-labela) +
// GET /api/itinerary/shared/[shareId]/pdf (ista vrata kot JSON ogled:
// 404-oracle za zasebne/neobstoječe, 30/uro, attachment) + gumb "Prenesi
// PDF" na /pot (z editToken glavo za zasebne pote).
//
// Test varuje:
//   1. FUNKCIONALNA ZANKA (ista tehnika kot task95): zgeneriraj PDF →
//      %PDF glava + pdf-lib load + unpdf izvleček besedila → vsebina
//      dokazana (dnevi, postanki, DIAKRITIKE č/š/ž, nasveti, vir-labela,
//      noga s str. N/M);
//   2. PAGINACIJA: dolga pot → ≥ 2 strani, noga "str. 1/…";
//   3. SOURCE-CONTRACT rute: vrata (404-oracle, resolveTripRole, attachment,
//      no-store, rateLimit) + povezava generatorja;
//   4. SOURCE-CONTRACT UI: gumb + editToken glava + toast napaka;
//   5. FUNKCIONALNO ruto (samo kadar je DB dosegljiva — test.skipIf;
//      CI quality nima baze): javna pot → 200 PDF; neobstoječa → 404;
//      ZASEBNA brez žetona → 404 (obstoj NI oracle).
// ============================================================================
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { generateTripItineraryPdf } from "@/lib/pdf/trip-itinerary-pdf";
import type { Itinerary, LocationVisit, DayPlan } from "@/lib/types";
// TASK 76 higiena: funkcionalni blok dinamično uvaža route handler prek
// @/app/api → troši žetone deljenega omejevalnika runnerja → okno OBVEZNO
// počistimo (konvencija suite-a, glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read(
  "src/app/api/itinerary/shared/[shareId]/pdf/route.ts"
);
const uiSrc = read("src/components/shared-trip.tsx");

// ---------------------------------------------------------------------------
// fiksture
// ---------------------------------------------------------------------------

function stop(partial: Partial<LocationVisit>): LocationVisit {
  return {
    destination_id: partial.destination_id ?? "test-1",
    destination_name: partial.destination_name ?? "Test",
    time_slot: partial.time_slot ?? "09:00-11:00",
    duration: partial.duration ?? 2,
    estimated_cost: partial.estimated_cost ?? 20,
    notes: partial.notes ?? "",
  };
}

function day(n: number, locations: LocationVisit[]): DayPlan {
  return {
    day: n,
    locations,
    weather: { condition: "sončno", temp: 24 },
    weatherEstimated: true,
  };
}

function fixtureItinerary(): Itinerary {
  return {
    days: [
      day(1, [
        stop({
          destination_id: "bled",
          destination_name: "Bled",
          time_slot: "09:00-11:00",
          notes: "Jezero in otok — čoln ali sprehod okoli.",
          estimated_cost: 15,
        }),
        stop({
          destination_id: "vintgar",
          destination_name: "Soteska Vintgar",
          time_slot: "11:30-14:00",
          notes: "Lesene galerije nad modrozeleno Savo Dolinko — čevlji z oporo.",
          estimated_cost: 10,
        }),
      ]),
      day(2, [
        stop({
          destination_id: "ljubljana",
          destination_name: "Ljubljana — staro mestno jedro",
          time_slot: "10:00-13:00",
          notes: "Prešernov trg, Tromostovje, grad po vzpenjači.",
          estimated_cost: 12,
        }),
      ]),
    ],
    total_budget: 300,
    recommendations: [],
    tips: ["Za Vintgar pridi pred 10. uro — parkirišče se napolni."],
    source: "deterministic",
    tripStartDate: "2026-07-12",
    tripEndDate: "2026-07-13",
    geoValidation: {
      days: [
        { day: 1, km: 42.3, drivingMinutes: 55 },
        { day: 2, km: 55.1, drivingMinutes: 70 },
      ],
      issues: [],
    } as unknown as Itinerary["geoValidation"],
  };
}

/** Dolga pot za paginacijo: 8 dni × 6 postankov z dolgimi opombami. */
function longItinerary(): Itinerary {
  const days: DayPlan[] = [];
  for (let d = 1; d <= 8; d++) {
    const locations: LocationVisit[] = [];
    for (let s = 0; s < 6; s++) {
      locations.push(
        stop({
          destination_id: `d${d}s${s}`,
          destination_name: `Krajsko ime ${d}-${s}`,
          notes:
            "Zelo dolga opomba, ki se mora prelomiti čez več vrstic in s tem " +
            "porabiti navpični prostor strani, da paginacija dejansko nastopi " +
            "in se dan ne raztrga čez rob. Ponovimo to še nekajkrat za globino.",
          time_slot: `${9 + s}:00-${11 + s}:00`,
        })
      );
    }
    days.push(day(d, locations));
  }
  return {
    days,
    total_budget: 900,
    recommendations: [],
    tips: [],
    source: "deterministic",
  };
}

async function pdfTextOf(bytes: Uint8Array): Promise<string> {
  const proxy = await getDocumentProxy(bytes);
  const out = await extractText(proxy, { mergePages: true });
  return typeof out.text === "string" ? out.text : "";
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Funkcionalna zanka — generiraj → preberi nazaj
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M8: generateTripItineraryPdf — vsebinska zanka", () => {
  test("veljaven PDF (%PDF glava, pdf-lib load, ≥1 stran)", async () => {
    const bytes = await generateTripItineraryPdf({
      name: "Poletje na Gorenjskem",
      shareId: "pdfxtest01",
      itinerary: fixtureItinerary(),
      createdAt: "2026-09-25T10:00:00.000Z",
    });
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  test("vsebina dokazana prek unpdf (dnevi, postanki, DIAKRITIKE, vir)", async () => {
    const bytes = await generateTripItineraryPdf({
      name: "Poletje na Gorenjskem",
      shareId: "pdfxtest01",
      itinerary: fixtureItinerary(),
      createdAt: "2026-09-25T10:00:00.000Z",
    });
    const text = await pdfTextOf(bytes);
    expect(text).toContain("DAN 1");
    expect(text).toContain("DAN 2");
    expect(text).toContain("Bled");
    // diakritike č/š/ž morajo preživeti subset embed:
    expect(text).toContain("Soteska Vintgar");
    expect(text).toContain("čevlji");
    expect(text).toContain("NASVETI");
    expect(text).toContain("brez AI (deterministično)"); // iskrena vir-labela
    expect(text).toContain("pdfxtest01"); // noga s shareId
    expect(text).toContain("str. 1/"); // noga s številčenjem
    expect(text).toContain("~42 km"); // km iz geo-validacije (~ = približek)
    expect(text).toContain("(ocena)"); // weatherEstimated iskrenost
  });

  test("paginacija: dolga pot → ≥ 2 strani, prazni dan izrecno", async () => {
    const it = longItinerary();
    it.days[3].locations = []; // en prazen dan
    const bytes = await generateTripItineraryPdf({
      name: null,
      shareId: "pdfxlong01",
      itinerary: it,
      createdAt: null,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(2);
    const text = await pdfTextOf(bytes);
    expect(text).toContain("str. 1/"); // številčenje sledi dejanskemu št. strani
    expect(text).toContain("prost dan");
    expect(text).toContain("Potovanje po Sloveniji"); // privzeti naslov
  });

  test("imena poti se prelomijo (2 vrstici max) in ne sesujejo risanja", async () => {
    const bytes = await generateTripItineraryPdf({
      name: "Zelo dolgo ime poti, ki zagotovo presega širino strani A4 in se mora prelomiti na več vrstic brez razpadanje postavitve",
      shareId: "pdfxtitle1",
      itinerary: fixtureItinerary(),
      createdAt: null,
    });
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Source-contract — vrata rute + UI povezava
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M8: source-contract /api/itinerary/shared/[shareId]/pdf", () => {
  test("nodejs runtime (fs za pisave) + strožja meja 30/uro", () => {
    expect(routeSrc).toContain('export const runtime = "nodejs"');
    expect(routeSrc).toContain("itinerary-shared-pdf");
    expect(routeSrc).toContain("limit: 30");
  });

  test("ISTA vrata kot JSON ogled: 404-oracle za zasebne, resolveTripRole", () => {
    expect(routeSrc).toContain("resolveTripRole");
    expect(routeSrc).toContain("roleAtLeast(role, \"VIEWER\")");
    expect(routeSrc).toContain("x-dsa-edit-token");
    // NE 403 (obstoj poti ne sme biti oracle) — 404 je edini "ne najdem":
    expect(routeSrc).not.toContain("status: 403");
  });

  test("izvoz je PRENOS: attachment + no-store + pdf-lib generator povezan", () => {
    expect(routeSrc).toContain("generateTripItineraryPdf");
    expect(routeSrc).toContain("attachment");
    expect(routeSrc).toContain("application/pdf");
    expect(routeSrc).toContain("no-store");
  });

  test("UI: gumb Prenesi PDF + editToken glava + toast odpovedi", () => {
    expect(uiSrc).toContain("Prenesi PDF");
    expect(uiSrc).toContain("downloadPdf");
    expect(uiSrc).toContain("/pdf");
    expect(uiSrc).toContain('"x-dsa-edit-token"');
    expect(uiSrc).toContain("PDF ni na voljo");
    // window.print() ostaja (offline rezerva — NE odstranimo delujoče poti):
    expect(uiSrc).toContain("window.print()");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Funkcionalno — rutna vrata (DB-generirani primeri samo, če je baza
//    dosegljiva; CI quality vrtljiv nima baze — pošten skip)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M8: funkcionalno — GET /pdf (vrata)", () => {
  let dbReachable = false;
  const createdShareIds: string[] = [];

  beforeEach(() => {
    // TASK 76: dinamični uvoz route handlerja (spodaj) sproži žetone →
    // pred vsakim testom počistimo deljeno okno, da ne onesnažujemo
    // nadaljnjih datotek suite-a (bun test = en proces).
    clearProviderRateLimits();
  });

  beforeAll(async () => {
    try {
      const { db } = await import("@/lib/db");
      await db.savedItinerary.count();
      dbReachable = true;
    } catch {
      dbReachable = false;
    }
  });

  afterAll(async () => {
    if (!dbReachable || createdShareIds.length === 0) return;
    try {
      const { db } = await import("@/lib/db");
      await db.savedItinerary.deleteMany({
        where: { shareId: { in: createdShareIds } },
      });
    } catch {
      // čiščenje je best-effort (vrstice so edinstvene s prefixom)
    }
  });

  test("neveljaven shareId → 400 (pred vsakim DB dostopom)", async () => {
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      "http://localhost/api/itinerary/shared/INVALID_ID!/pdf",
      {
        headers: { "x-forwarded-for": "10.99.90.1" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId: "INVALID_ID!" }),
    });
    expect(res.status).toBe(400);
  });

  test("neobstoječa pot → 404 (brez oracle)", async () => {
    if (!dbReachable) {
      console.log("[pdf-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const shareId = "pdfxmissing0001";
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf`,
      {
        headers: { "x-forwarded-for": "10.99.90.2" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(404);
  });

  test("javna pot → 200 + application/pdf + attachment + %PDF", async () => {
    if (!dbReachable) {
      console.log("[pdf-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "pdfxpublic00001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Testna pot Črni Kal",
        itinerary: JSON.stringify(fixtureItinerary()),
        formData: "null",
        isPublic: true,
      },
    });
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf`,
      {
        headers: { "x-forwarded-for": "10.99.90.3" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(
      "testna-pot-crni-kal"
    ); // čšž transliteracija v imenu datoteke
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.slice(0, 5).toString("latin1")).toBe("%PDF-");
  });

  test("ZASEBNA pot brez žetona → 404 (obstoj NI oracle)", async () => {
    if (!dbReachable) {
      console.log("[pdf-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "pdfxpriv000001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Zasebna pot",
        itinerary: JSON.stringify(fixtureItinerary()),
        formData: "null",
        isPublic: false,
        editTokenHash: null,
      },
    });
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf`,
      {
        headers: { "x-forwarded-for": "10.99.90.4" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(404);
  });
});
