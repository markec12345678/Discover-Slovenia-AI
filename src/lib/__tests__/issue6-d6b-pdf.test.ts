// ============================================================================
// ISSUE #6 / D6-B (M8+) — PDF IZVOZ: JEZIK (en) + ETAPE + REZERVACIJE
// ============================================================================
// Nadgradnja T5-D/M8 izvoza (Issue #5, commit 66444a9). Vrzel iz Issue #6
// Phase 2:
//   1. EN LOKALIZACIJA: generateTripItineraryPdf(data, lang) — vsi nizi v
//      STRINGS (sl/en), datumi/številke po Intl (sl-SI / en-GB); ruta sprejme
//      ?lang= (SAMO "sl"/"en" sta veljavni, ostalo spodrsne v privzeti "sl"
//      — arbitrirne vrednosti NIKOLI ne potujejo v generator);
//   2. ETAPE med zaporednima postankoma ("→ ~X km · ~Y min") — obstoječa
//      deterministična hevrestika (road-routing.heuristicLeg = haversineKm ×
//      ROAD_FACTOR ÷ AVG_SPEED_KMH × 60 iz geo-distance, round5 — ISTI vir
//      številk kot povezovalnik v plannerju); manjkajoče koordinate →
//      "razdalja ni znana" / "distance unknown" (iskrenost, ne izumi);
//   3. REZERVACIJE: SAMO CONFIRMED JourneyBooking zapisi (čista veza
//      shareId) — provider + št. + status (CONFIRMATION_STATUS_LABELS sl/en);
//      brez potrdil razdelka NI (dokaz, ne napaka);
//   4. ODPIRALNI ČASI: PRESKOČENO — vrsta LocationVisit ne nosi odpiralnih
//      časov (živijo na Destination.opening, izven shranjenega itinererja —
//      izvoz ne izmišljuje ur).
//
// Test varuje (konvencije issue5-t5d-itinerary-pdf.test.ts):
//   · vsebinska zanka prek unpdf (EN vsebina, etape, rezervacije, pariteta
//     SL/EN, determinističnost bajtov);
//   · SOURCE-CONTRACT rute (validacija ?lang=, fetch rezervacij) in liba
//     (STRINGS sl/en, heuristicLeg, Intl locales);
//   · FUNKCIONALNO ruto (samo kadar je DB dosegljiva — pošten skip; TASK 76
//     higiena: clearProviderRateLimits v beforeEach, ker datoteka uvaža
//     route handler prek @/app/api/).
// ============================================================================
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import {
  generateTripItineraryPdf,
  type TripItineraryPdfReservation,
} from "@/lib/pdf/trip-itinerary-pdf";
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
const libSrc = read("src/lib/pdf/trip-itinerary-pdf.ts");

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
    ...(partial.lat != null ? { lat: partial.lat } : {}),
    ...(partial.lng != null ? { lng: partial.lng } : {}),
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

/** Dan 1: Bled → Vintgar (OBE koordinati) — etapa se IZRAČUNA.
 *  Dan 2: dva postanka, drugemu manjka lng — etapa je "ni znana".
 *  Dan 3: en sam postanek — NOG etape ni. */
function fixtureItinerary(): Itinerary {
  return {
    days: [
      day(1, [
        stop({
          destination_id: "bled",
          destination_name: "Bled",
          lat: 46.3623,
          lng: 14.114,
          time_slot: "09:00-11:00",
          estimated_cost: 15,
        }),
        stop({
          destination_id: "vintgar",
          destination_name: "Soteska Vintgar",
          lat: 46.4294,
          lng: 14.0936,
          time_slot: "11:30-14:00",
          estimated_cost: 10,
        }),
      ]),
      day(2, [
        stop({
          destination_id: "ljubljana",
          destination_name: "Ljubljana — staro mestno jedro",
          lat: 46.0569,
          lng: 14.5058,
          time_slot: "10:00-13:00",
          estimated_cost: 12,
        }),
        stop({
          destination_id: "brez-koordinat",
          destination_name: "Kraj brez koordinat",
          lat: 45.5,
          // lng MANJKA — odkritosrčno "razdalja ni znana"
          time_slot: "15:00-17:00",
        }),
      ]),
      day(3, [
        stop({
          destination_id: "solo",
          destination_name: "Samoten postanek",
          time_slot: "09:00-12:00",
        }),
      ]),
    ],
    total_budget: 300,
    recommendations: [],
    tips: ["Za Vintgar pridi pred 10. uro — parkirišče se napolni."],
    source: "deterministic",
    tripStartDate: "2026-07-12",
    tripEndDate: "2026-07-14",
    geoValidation: {
      days: [{ day: 1, km: 42.3, drivingMinutes: 55 }],
      issues: [],
    } as unknown as Itinerary["geoValidation"],
  };
}

const PDF_DATA = {
  name: "Poletje na Gorenjskem",
  shareId: "pdf6test00001",
  itinerary: fixtureItinerary(),
  createdAt: "2026-09-25T10:00:00.000Z",
};

const RESERVATIONS: readonly TripItineraryPdfReservation[] = [
  {
    provider: "Booking.com",
    reservationNumber: "408.921.371.224",
    status: "CONFIRMED",
  },
  {
    // rezervacija brez številke — številka se NE izumi
    provider: "Prireditve Poletje",
    reservationNumber: null,
    status: "CONFIRMED",
  },
];

async function pdfTextOf(bytes: Uint8Array): Promise<string> {
  const proxy = await getDocumentProxy(bytes);
  const out = await extractText(proxy, { mergePages: true });
  return typeof out.text === "string" ? out.text : "";
}

// ─────────────────────────────────────────────────────────────────────────
// 1. EN lokalizacija — vsebinska zanka prek unpdf
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B/M8+: generateTripItineraryPdf(data, \"en\")", () => {
  test("EN vsebina dokazana (DAY, exported, vir, proračun, estimate)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    // glava se preverja PREJ — unpdf (getDocumentProxy) preneše (transfer)
    // ustrezen ArrayBuffer, zato bajtov po izvlečku ne smemo več brati
    // (ista konvencija kot issue5-t5d-itinerary-pdf.test.ts):
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const text = await pdfTextOf(bytes);
    expect(text).toContain("DAY 1"); // glava dneva
    expect(text).toContain("DAY 3");
    expect(text).toContain("TRAVEL TIPS"); // razdelek nasvetov
    expect(text).toContain("source: no AI (deterministic)"); // iskrena vir-labela
    expect(text).toContain("approximate budget 300 €");
    expect(text).toContain("12 July 2026"); // Intl en-GB (datum dneva 1)
    expect(text).toContain("(estimate)"); // weatherEstimated iskrenost
    expect(text).toContain("exported"); // noga (footerExported)
    expect(text).toContain("trip pdf6test00001"); // noga (footerTrail)
    expect(text).toContain("p. 1/"); // noga s številčenjem
    // diakritike č/š/ž preživijo tudi v EN izvozu (imena ostanejo):
    expect(text).toContain("Soteska Vintgar");
  });

  test("privzeti jezik ostaja SL (nazaj kompatibilno — brez parametra)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA });
    const text = await pdfTextOf(bytes);
    expect(text).toContain("DAN 1");
    expect(text).toContain("NASVETI ZA POTOVANJE");
    expect(text).toContain("vir: brez AI (deterministično)");
    expect(text).toContain("izvoženo");
    expect(text).toContain("str. 1/");
    expect(text).toContain("12. julij 2026"); // Intl sl-SI
  });

  test("pariteta: SL ≠ EN besedilo, ŠT. STRANI enako (±0)", async () => {
    const slBytes = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const enBytes = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    // pdf-lib load NE odcepi buffra (za razliko od unpdf) — najprej strani:
    const slDoc = await PDFDocument.load(slBytes);
    const enDoc = await PDFDocument.load(enBytes);
    expect(slDoc.getPageCount()).toBe(enDoc.getPageCount()); // enaka postavitev
    expect(slDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    const slText = await pdfTextOf(slBytes);
    const enText = await pdfTextOf(enBytes);
    expect(slText).not.toBe(enText); // RAZLIČNO besedilo ...
    expect(slText).toContain("DAN 1");
    expect(enText).toContain("DAY 1");
  });

  test("determinističnost: isti vhod dvakrat → BAJTNO enak izhod", async () => {
    const a = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const b = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    expect(a.length).toBe(b.length);
    expect(Buffer.compare(Buffer.from(a), Buffer.from(b))).toBe(0);
    const e1 = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    const e2 = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    expect(Buffer.compare(Buffer.from(e1), Buffer.from(e2))).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Etape med zaporednimi postanki (deterministična hevrestika)
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B/M8+: etape (→ ~X km · ~Y min) med postanki", () => {
  test("oba postanka s koordinatama → etapa s km in min (round5 hevrestika)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const text = await pdfTextOf(bytes);
    // Bled → Vintgar: haversine × 1,3 ≈ 9,9 km → round5 = 10; ÷ 55 km/h →
    // ~11 min → round5 = 10. FORMAT je pogodben: "→ ~N km · ~N min".
    expect(text).toMatch(/→ ~\d+ km · ~\d+ min/);
    expect(text).toContain("→ ~10 km · ~10 min");
  });

  test("manjkajoča koordinata → \"razdalja ni znana\" (iskrenost, ne izum)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const text = await pdfTextOf(bytes);
    expect(text).toContain("→ razdalja ni znana");
    const enBytes = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    const enText = await pdfTextOf(enBytes);
    expect(enText).toContain("→ distance unknown");
  });

  test("en sam postanek v dnevu → brez etape (ni povezovalnika)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const text = await pdfTextOf(bytes);
    // dan 3 ima 1 postanek → nobenega "→" iz dan 3; skupno št. etap = 2
    const legRows = text.match(/→/g) ?? [];
    expect(legRows.length).toBe(2); // dan 1 (znana) + dan 2 (neznana)
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Rezervacije (SAMO CONFIRMED — provider + št. + status)
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B/M8+: razdelek Rezervacije / Reservations", () => {
  test("SL: heading + ponudnik + št. + iskrena statusna oznaka", async () => {
    const bytes = await generateTripItineraryPdf(
      { ...PDF_DATA, reservations: RESERVATIONS },
      "sl"
    );
    const text = await pdfTextOf(bytes);
    expect(text).toContain("REZERVACIJE");
    expect(text).toContain("Booking.com");
    expect(text).toContain("št. rezervacije 408.921.371.224");
    expect(text).toContain("Potrjeno pri ponudniku"); // CONFIRMATION_STATUS_LABELS
  });

  test("EN: heading + reservation no. + Confirmed by provider", async () => {
    const bytes = await generateTripItineraryPdf(
      { ...PDF_DATA, reservations: RESERVATIONS },
      "en"
    );
    const text = await pdfTextOf(bytes);
    expect(text).toContain("RESERVATIONS");
    expect(text).toContain("reservation no. 408.921.371.224");
    expect(text).toContain("Confirmed by provider");
  });

  test("manjkajoča številka se NE izumi (ena sama vrstica s št.)", async () => {
    const bytes = await generateTripItineraryPdf(
      { ...PDF_DATA, reservations: RESERVATIONS },
      "sl"
    );
    const text = await pdfTextOf(bytes);
    expect((text.match(/št\. rezervacije/g) ?? []).length).toBe(1);
    // druga rezervacija (brez št.) se vseeno izpiše s ponudnikom + statusom:
    expect(text).toContain("Prireditve Poletje");
  });

  test("brez rezervacij → razdelka NI (dokaz, ne napaka)", async () => {
    const bytes = await generateTripItineraryPdf({ ...PDF_DATA }, "sl");
    const text = await pdfTextOf(bytes);
    expect(text).not.toContain("REZERVACIJE");
    const enBytes = await generateTripItineraryPdf({ ...PDF_DATA }, "en");
    expect(await pdfTextOf(enBytes)).not.toContain("RESERVATIONS");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Source-contract — lib + ruta
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B/M8+: source-contract lib (STRINGS, hevrestika, Intl)", () => {
  test("Vsi nizi v STRINGS (sl/en stolpec) + TripPdfLang", () => {
    expect(libSrc).toContain('export type TripPdfLang = "sl" | "en"');
    expect(libSrc).toContain("const STRINGS: Record<TripPdfLang, TripPdfStrings>");
    // ključni nizi OBEH jezikov (en vir resnice, brez raztresenih literal):
    expect(libSrc).toContain('"Potovanje po Sloveniji"');
    expect(libSrc).toContain('"Trip around Slovenia"');
    expect(libSrc).toContain('"razdalja ni znana"');
    expect(libSrc).toContain('"distance unknown"');
    expect(libSrc).toContain('"REZERVACIJE"');
    expect(libSrc).toContain('"RESERVATIONS"');
    expect(libSrc).toContain('"NASVETI ZA POTOVANJE"');
    expect(libSrc).toContain('"TRAVEL TIPS"');
    expect(libSrc).toContain('"št. rezervacije"');
    expect(libSrc).toContain('"reservation no."');
  });

  test("etape uporabljajo obstoječo deterministično hevrestiko (road-routing/geo-distance)", () => {
    expect(libSrc).toContain(
      'import { heuristicLeg } from "@/lib/road-routing"'
    );
    // hevrestika (haversine × ROAD_FACTOR ÷ AVG_SPEED_KMH, round5) prihaja
    // iz geo-distance — en vir konstant (T5-b1/H2):
    expect(libSrc).toContain("haversineKm × ROAD_FACTOR");
  });

  test("datumi/številke: sl-SI za sl, en-GB za en (localeOf)", () => {
    expect(libSrc).toContain('lang === "sl" ? "sl-SI" : "en-GB"');
  });

  test("statusne oznake rezervacij iz CONFIRMATION_STATUS_LABELS (ne prevajamo ugibanj)", () => {
    expect(libSrc).toContain("CONFIRMATION_STATUS_LABELS");
  });
});

describe("D6-B/M8+: source-contract ruta (?lang= validacija + rezervacije)", () => {
  test("sprejme ?lang= SAMO z belistom (sl privzet, en izrecno)", () => {
    expect(routeSrc).toContain('searchParams.get("lang")');
    expect(routeSrc).toContain('langParam === "en" ? "en" : "sl"');
    expect(routeSrc).toContain("TripPdfLang");
  });

  test("jezik potuje v generator (drugi argument klica)", () => {
    expect(routeSrc).toMatch(
      /generateTripItineraryPdf\(\s*\{[\s\S]*?\},\s*lang\s*\);/
    );
  });

  test("fetch SAMO CONFIRMED rezervacij (veza shareId) + preslikava prikaznih polj", () => {
    expect(routeSrc).toContain("journeyBooking.findMany");
    expect(routeSrc).toContain('status: "CONFIRMED"');
    expect(routeSrc).toContain("providerBookingId");
    expect(routeSrc).toContain("importData");
    expect(routeSrc).toContain("reservations");
    // prikazna polja se parsajo STREŽNIŠKO (surovi importData ne potuje v
    // generator) — isti §23 kanon kot bookings odgovori:
    expect(routeSrc).toContain("d.reservationNumber");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. Funkcionalno — rutna vrata (DB-generirani primeri samo, če je baza
//    dosegljiva; CI quality vrtljiv nima baze — pošten skip)
// ─────────────────────────────────────────────────────────────────────────

describe("D6-B/M8+: funkcionalno — GET /pdf?lang= + rezervacije", () => {
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
      await db.journeyBooking.deleteMany({
        where: { shareId: { in: createdShareIds } },
      });
      await db.savedItinerary.deleteMany({
        where: { shareId: { in: createdShareIds } },
      });
    } catch {
      // čiščenje je best-effort (vrstice so edinstvene s prefixom)
    }
  });

  test("?lang=en → 200 + EN PDF (celotna zanka prek rute)", async () => {
    if (!dbReachable) {
      console.log("[pdf6-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "pdf6en00000001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Testna pot D6-B",
        itinerary: JSON.stringify(fixtureItinerary()),
        formData: "null",
        isPublic: true,
      },
    });
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf?lang=en`,
      {
        headers: { "x-forwarded-for": "10.99.91.1" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.slice(0, 5).toString("latin1")).toBe("%PDF-");
    const text = await pdfTextOf(new Uint8Array(buf));
    expect(text).toContain("DAY 1"); // EN skozi VSO pot (rute → generator)
    expect(text).toContain("exported");
    expect(text).toContain("→ ~10 km · ~10 min"); // etapa tudi prek rute
  });

  test("?lang=zzz (neveljaven) → 200 s PRIVZETIM sl (ne 400, ne izum)", async () => {
    if (!dbReachable) {
      console.log("[pdf6-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "pdf6sl00000001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Testna pot jezikovna",
        itinerary: JSON.stringify(fixtureItinerary()),
        formData: "null",
        isPublic: true,
      },
    });
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf?lang=zzz`,
      {
        headers: { "x-forwarded-for": "10.99.91.2" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(200); // validacija spodrsne v privzet "sl"
    const text = await pdfTextOf(new Uint8Array(await res.arrayBuffer()));
    expect(text).toContain("DAN 1");
    expect(text).not.toContain("DAY 1");
  });

  test("CONFIRMED rezervacija poti → razdelek REZERVACIJE v izvozu", async () => {
    if (!dbReachable) {
      console.log("[pdf6-test] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "pdf6res0000001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Pot s potrjeno rezervacijo",
        itinerary: JSON.stringify(fixtureItinerary()),
        formData: "null",
        isPublic: true,
      },
    });
    // CONFIRMED uvoz (kanon /api/journey/bookings/import): providerBookingId
    // = potrjena št. + importData s prikaznimi polji.
    await db.journeyBooking.create({
      data: {
        shareId,
        provider: "booking",
        providerProductId: "imported:booking.com:408",
        status: "CONFIRMED",
        source: "IMPORTED",
        providerBookingId: "408.921.371.224",
        importData: JSON.stringify({
          providerName: "Booking.com",
          reservationNumber: "408.921.371.224",
          locationName: "Hotel Slon, Ljubljana",
        }),
      },
    });
    const { GET } = await import(
      "@/app/api/itinerary/shared/[shareId]/pdf/route"
    );
    const request = new Request(
      `http://localhost/api/itinerary/shared/${shareId}/pdf`,
      {
        headers: { "x-forwarded-for": "10.99.91.3" },
      }
    );
    const res = await GET(request, {
      params: Promise.resolve({ shareId }),
    });
    expect(res.status).toBe(200);
    const text = await pdfTextOf(new Uint8Array(await res.arrayBuffer()));
    expect(text).toContain("REZERVACIJE");
    expect(text).toContain("Booking.com"); // iz importData (prikazno ime)
    expect(text).toContain("408.921.371.224"); // atestirana št.
    expect(text).toContain("Potrjeno pri ponudniku");
  });
});
