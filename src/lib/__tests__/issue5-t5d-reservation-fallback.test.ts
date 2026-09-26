// ============================================================================
// ISSUE #5 / T5-D (M1) + ISSUE #9 (ZERO-AI) — DETERMINISTIČNI PARSER
// REZERVACIJ (PRIMA, 0 AI)
// ============================================================================
// Vrzel (matrika M1): /api/journey/bookings/parse je bil za PDF IN besedilo
// AI-ONLY — z odpovedanimi/odsotnimi ključi je VEDNO padel s 502 ("vnesi
// ročno"). Zlata pot #9 (uvoz rezervacije) je bila tako odvisna od AI.
//
// Fix (T5-D): lib/reservation-text-parse.ts — čist regex ekstraktor nad
// besedilom potrdila (prilepljena e-pošta / unpdf besedilo iz PDF-a), izhod
// gre skozi ISTO normalizacijo kot prejšnja AI pot (imported-reservation.ts).
//
// ISSUE #9 (ZERO-AI/GROUP C): OBRAT — deterministični parser je zdaj PRIMA
// (generateCompletion ODSTRANJEN iz besedilne/PDF poti; via iskreno razkrije
// kanal "text-parser"|"pdf-parser"); če parser ne prepozna ključnih polj →
// iskren 422 z nasvetom (nikoli prazen uspeh). SLIKA ostaja VLM AI-only
// (iz slike ni besedila za parser) — pošten 502.
//
// Test varuje:
//   1. parser: realni formati (Booking.com SL, letalska PNR EN, KiwiTaxi
//      transfer, GetYourGuide prosti zapis), cene EU/US, datumi SL/EN/ISO,
//      izključitve lažnih zadetkov (datum kot cena, besedna št. rezervacije,
//      "datum prihoda" hotel vs "prihod" prevoz), determinizem;
//   2. source-contract: deterministični parser je PRIMA na OBEH poteh
//      (pdf + text, 0 AI — ISSUE #9), slika ostane pošten 502; UI razkrije
//      vir ("vgrajeni bralnik");
//   3. funkcionalno: z omrežjem, ki odbija VSE (0 AI žetonov, 0
//      odvisnosti) → 200 z method:"deterministic" + via kanal parserja
//      (besedilo IN PDF), neznano besedilo → 422; SLIKA → VLM-only 502.
//      (Vzorec task50/issue5-t5b: NO mock.module, globalThis.fetch odbija.)
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
// TASK 76 higiena: ruta uvožena prek @/app/api → troši žetone deljenega
// omejevalnika runnerja → okno OBVEZNO počistimo (konvencija suite-a).
import { clearProviderRateLimits } from "@/lib/supply/search";
import {
  parseReservationText,
  isReservationParseEmpty,
} from "@/lib/reservation-text-parse";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/journey/bookings/parse/route.ts");
const uiSrc = read("src/components/trip-reservations.tsx");

// ─────────────────────────────────────────────────────────────────────────
// 1. Parser — realni formati potrdil
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M1: parseReservationText — realni formati", () => {
  test("Booking.com SL e-pošta (skupine s pikami, meseci z rodilnikom)", () => {
    const text = [
      "Vaša rezervacija je potrjena",
      "",
      "Hotel Park, Bled — 2 noči",
      "",
      "Gost: Marko Novak",
      "Št. rezervacije: 408.921.371.224",
      "PIN: 1234",
      "",
      "Prijavitev: sobota, 12. julij 2026 (od 14:00)",
      "Odjavitev: nedelja, 14. julij 2026 (do 10:00)",
      "",
      "Skupaj: 1.250,00 EUR",
      "Brezplačna odpoved: do 10. julija 2026 (23:59)",
      "",
      "Vprašanja? support@booking.com",
    ].join("\n");

    const r = parseReservationText(text);
    expect(r.providerName).toBe("Booking.com");
    expect(r.reservationNumber).toBe("408.921.371.224");
    expect(r.startDateTime).toBe("12. julij 2026");
    expect(r.endDateTime).toBe("14. julij 2026");
    expect(r.price).toBe(1250);
    expect(r.currency).toBe("EUR");
    expect(r.cancellationDeadline).toContain("10. julija 2026");
    // datum odpovedi NE uide v startDateTime:
    expect(r.startDateTime).not.toContain("10.");
    expect(r.guestName).toBe("Marko Novak");
    expect(r.contact).toBe("support@booking.com");
    expect(r.needsConfirmation).toBe(false);
    expect(r.notes).toBeNull();
  });

  test("letalska potrditev EN (PNR, departure/arrival, USD)", () => {
    const text = [
      "Wizz Air — booking confirmed",
      "",
      "Booking reference: XK7L2P",
      "Flight 6A 851 Ljubljana → Skopje",
      "Departure: 12.07.2026, 14:30",
      "Arrival: 12.07.2026, 16:05",
      "Passenger name: Ana Kovač",
      "Total price: USD 1,250.00",
      "Free cancellation: n/a",
      "Contact: +386 1 234 5678",
    ].join("\n");

    const r = parseReservationText(text);
    expect(r.providerName).toBe("Wizz Air");
    expect(r.reservationNumber).toBe("XK7L2P");
    expect(r.startDateTime).toBe("12.07.2026, 14:30");
    expect(r.endDateTime).toBe("12.07.2026, 16:05");
    expect(r.guestName).toBe("Ana Kovač");
    expect(r.price).toBe(1250);
    expect(r.currency).toBe("USD");
    expect(r.cancellationDeadline).toBeNull(); // "n/a" kapText zavrne
    expect(r.contact).toBe("+386 1 234 5678");
  });

  test("KiwiTaxi transfer (števke s presledki, ISO datumi, drop-off)", () => {
    const text = [
      "KiwiTaxi — naročilo potrjeno",
      "Booking number 408 921 371 224",
      "Pickup: 2026-07-12 14:30, Ljubljana, hotel Park",
      "Drop-off: 2026-07-12 16:30, Bled",
      "Za plačilo: 89,90 EUR",
    ].join("\n");

    const r = parseReservationText(text);
    expect(r.providerName).toBe("KiwiTaxi");
    expect(r.reservationNumber).toBe("408 921 371 224");
    expect(r.startDateTime).toBe("2026-07-12 14:30");
    expect(r.endDateTime).toBe("2026-07-12 16:30");
    expect(r.price).toBe(89.9);
    expect(r.currency).toBe("EUR");
  });

  test("GetYourGuide prosti zapis (primer iz UI placeholderja)", () => {
    const r = parseReservationText(
      "GetYourGuide — št. rezervacije GYG-123456, Bled, 12.07.2026 10:00, 2 osebi, 58 EUR"
    );
    expect(r.providerName).toBe("GetYourGuide");
    expect(r.reservationNumber).toBe("GYG-123456");
    expect(r.startDateTime).toBe("12.07.2026 10:00");
    expect(r.price).toBe(58);
    expect(r.currency).toBe("EUR");
    // "Bled" je NEOZNAČENO → ne izmišljujemo lokacije:
    expect(r.locationName).toBeNull();
    expect(r.needsConfirmation).toBe(false);
  });

  test("EN meseci (\"Check-in: Saturday, July 12, 2026\") + GBP", () => {
    const text = [
      "Agoda booking confirmation",
      "Confirmation number: 90123456",
      "Check-in: Saturday, July 12, 2026",
      "Check-out: Monday, July 14, 2026",
      "Guest name: John Smith",
      "Total: £89",
    ].join("\n");
    const r = parseReservationText(text);
    expect(r.providerName).toBe("Agoda");
    expect(r.reservationNumber).toBe("90123456");
    expect(r.startDateTime).toBe("July 12, 2026");
    expect(r.endDateTime).toBe("July 14, 2026");
    expect(r.guestName).toBe("John Smith");
    expect(r.price).toBe(89);
    expect(r.currency).toBe("GBP");
  });

  test("hotel SL: \"datum prihoda\" je ZAČETEK (goli prihod ne ukrade)", () => {
    const text = [
      "Počitnice potrjene",
      "Datum prihoda: 20.08.2026",
      "Prihod vlakom: 20.08.2026 18:45",
    ].join("\n");
    const r = parseReservationText(text);
    expect(r.startDateTime).toBe("20.08.2026");
    expect(r.endDateTime).toBe("20.08.2026 18:45");
  });

  test("SŽ vlak (znani ponudnik)", () => {
    const r = parseReservationText(
      "Slovenske železnice — vozovnica\nRezervacija: 1234567890\nDatum: 05.09.2026 08:15\nZnesek: 12,40 EUR"
    );
    expect(r.providerName).toBe("Slovenske železnice");
    expect(r.reservationNumber).toBe("1234567890");
    expect(r.startDateTime).toBe("05.09.2026 08:15");
    expect(r.price).toBe(12.4);
    expect(r.currency).toBe("EUR");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Parser — cene (EU/US zapisi) in determinizem
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M1: parseReservationText — cene in determinizem", () => {
  test("zapisi cen: 1.250,00 / 1,250.00 / €89 / 1.250 / 58.", () => {
    // (vrednosti prek označenega skupnega zneska)
    expect(
      parseReservationText("Total: 1.250,00 EUR").price
    ).toBe(1250);
    expect(
      parseReservationText("Total: $1,250.00").price
    ).toBe(1250);
    expect(parseReservationText("Total: €89").price).toBe(89);
    expect(parseReservationText("Skupaj: 1.250 EUR").price).toBe(1250);
    expect(parseReservationText("Znesek: 58. EUR").price).toBe(58);
  });

  test("datum NI cena (\"12.07.2026 EUR\" se pri pretvorbi zavrne)", () => {
    // 4 decimalke → parsePriceNumber null → iskanje nadaljuje do prave cene
    const r = parseReservationText(
      "Zbor: 12.07.2026 EUR ni cena, a plačilo 45 EUR je."
    );
    expect(r.price).toBe(45);
    expect(r.currency).toBe("EUR");
  });

  test("0 EUR in >100.000 sta zavrnjena (ista kap kot AI pot)", () => {
    expect(parseReservationText("Znesek: 0 EUR").price).toBeNull();
    expect(parseReservationText("Skupaj: 250.000,00 EUR").price).toBeNull();
  });

  test("determinizem: enak vhod → enak izhod (2 klica, deep equal)", () => {
    const text = [
      "Booking.com",
      "Št. rezervacije: 408.921.371.224",
      "Prijavitev: 12.07.2026",
      "Skupaj: 99,00 EUR",
    ].join("\n");
    expect(parseReservationText(text)).toEqual(parseReservationText(text));
  });

  test("neznano besedilo → VSE null (nič ne izmišljujemo) + isEmpty", () => {
    const r = parseReservationText(
      "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore."
    );
    expect(r.providerName).toBeNull();
    expect(r.reservationNumber).toBeNull();
    expect(r.startDateTime).toBeNull();
    expect(r.price).toBeNull();
    expect(r.needsConfirmation).toBe(true);
    expect(isReservationParseEmpty(r)).toBe(true);
  });

  test("\"confirmation sent\" (brez števk) NI št. rezervacije", () => {
    const r = parseReservationText(
      "Your booking confirmation sent to your email. Thank you!"
    );
    expect(r.reservationNumber).toBeNull();
    expect(r.providerName).toBeNull(); // gol "booking" NI ponudnik
  });

  test("št. rezervacije NE pogoltne sledečega datuma (meja skupin)", () => {
    const r = parseReservationText(
      "Št. rezervacije: 408.921.371.224 12.07.2026"
    );
    expect(r.reservationNumber).toBe("408.921.371.224");
    expect(r.startDateTime).toBe("12.07.2026");
  });

  test("prazen vhod → prazna ekstrakcija (brez izjeme)", () => {
    const r = parseReservationText("");
    expect(isReservationParseEmpty(r)).toBe(true);
    expect(parseReservationText("   ").providerName).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Source-contract — povezava rezerve na ruti + iskrenost vira v UI
// ─────────────────────────────────────────────────────────────────────────

describe("T5-D/M1 + ISSUE #9: source-contract /api/journey/bookings/parse", () => {
  test("deterministični parser je PRIMA na OBEH poteh (pdf + text, 0 AI)", () => {
    expect(routeSrc).toContain("deterministicParseResponse");
    expect(routeSrc).toContain(
      'deterministicParseResponse(pdfText, "pdf-parser")'
    );
    expect(routeSrc).toContain(
      'deterministicParseResponse(text, "text-parser")'
    );
  });

  test("odgovor iskreno razkrije vir (method deterministic, via kanal parserja)", () => {
    expect(routeSrc).toContain('method: "deterministic"');
    expect(routeSrc).toContain('"text-parser"');
    expect(routeSrc).toContain('"pdf-parser"');
    expect(routeSrc).not.toContain('via: "fallback"');
    expect(routeSrc).toContain("parseReservationText");
    expect(routeSrc).toContain("isReservationParseEmpty");
  });

  test("ISSUE #9: besedilna/PDF pot NE kliče generateCompletion (0 AI)", () => {
    // edini AI ostanek rute je VLM za SLIKO (generateVisionCompletion)
    expect(routeSrc).not.toMatch(/generateCompletion\(/);
    expect(routeSrc).toContain("generateVisionCompletion");
  });

  test("SLIKA ostaja AI-only — pošten 502 z nasvetom (brez tihe rezerve)", () => {
    expect(routeSrc).toContain("Slike ni bilo mogoče prebrati");
    expect(routeSrc).toMatch(/\{ status: 502 \}/);
  });

  test("UI razkrije vir: \"vgrajeni bralnik\" za deterministično pot", () => {
    expect(uiSrc).toContain("parseMethod");
    expect(uiSrc).toContain(
      "Prebrano z vgrajenim bralnikom (brez AI) — preveri polja pred potrditvijo."
    );
    expect(uiSrc).toContain("Prebrano z AI (${parseVia})");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Funkcionalno — ISSUE #9: besedilo/PDF sta deterministična PRIMA
//    (omrežje odbija VSE — 0 AI žetonov, 0 odvisnosti); neznano 422;
//    SLIKA ostane VLM AI-only → pošten 502 (isti mock okolje).
// ---------------------------------------------------------------------------

describe("T5-D/M1 + ISSUE #9: funkcionalno — 0 AI v besedilni/PDF poti", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    // VSI omrežni klici odbijejo (OpenRouter / Gemini / Puter / z-ai SDK vsi
    // gredo čez global fetch) → generateCompletion vrne null → REZERVA.
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  const bookingEmail = [
    "Vaša rezervacija pri Booking.com je potrjena.",
    "Št. rezervacije: 408.921.371.224",
    "Prijavitev: 12.07.2026",
    "Skupaj: 1.250,00 EUR",
  ].join("\n");

  test("BESEDILO: 200 + method deterministic + via fallback (0 AI)", async () => {
    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request("http://localhost/api/journey/bookings/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // unikatni IP — rate limit (6/min) med testi nikoli ne pade
        "x-forwarded-for": `10.99.78.${seq}`,
      },
      body: JSON.stringify({ text: bookingEmail }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      persisted: boolean;
      providerSlug: string;
      fields: { providerName: string | null; reservationNumber: string | null };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.persisted).toBe(false);
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("408.921.371.224");
    expect(body.providerSlug).toBe("booking");
  }, 30_000);

  test("BESEDILO neznano: iskren 422 z nasvetom (ročni vnos)", async () => {
    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request("http://localhost/api/journey/bookings/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.99.79.${seq}`,
      },
      body: JSON.stringify({
        text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do.",
      }),
    });
    const res = await POST(request);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ročno");
  }, 30_000);

  test("PDF: 200 + method deterministic + via pdf-parser (unpdf → regex, 0 AI)", async () => {
    // PDF z besedilno plastjo (ista tehnika kot task95 fiksture; ASCII-only,
    // ker StandardFonts ne podpira č/š/ž — oznake EN delujejo brez njih).
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const page = doc.addPage([595, 842]);
    const lines = [
      "Booking.com — reservation confirmed",
      "Booking number: 408.921.371.224",
      "Check-in: July 12, 2026",
      "Total price: EUR 1,250.00",
    ];
    let y = 780;
    for (const line of lines) {
      page.drawText(line, { x: 50, y, size: 11, font });
      y -= 19;
    }
    const bytes = await doc.save();
    const dataUrl = `data:application/pdf;base64,${Buffer.from(bytes).toString("base64")}`;

    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request("http://localhost/api/journey/bookings/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.99.80.${seq}`,
      },
      body: JSON.stringify({ pdf: dataUrl }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        price: number | null;
        currency: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("pdf-parser");
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("408.921.371.224");
    expect(body.fields.startDateTime).toBe("July 12, 2026");
    expect(body.fields.price).toBe(1250);
    expect(body.fields.currency).toBe("EUR");
  }, 60_000);

  test("SLIKA: VLM AI-only — odpoved vseh providerjev → pošten 502 (ročni vnos)", async () => {
    // ISSUE #9: iz slike NI besedilne plasti za parser — slika ostaja edina
    // AI pot (generateVisionCompletion). Brez delujočega VLM-a → 502 z
    // nasvetom (ročni vnos), NE tiha deterministična zamenjava vira.
    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request(
      "http://localhost/api/journey/bookings/parse",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.99.81.${seq}`,
        },
        body: JSON.stringify({
          // 1x1 rdeč pixel PNG (veljaven data URL, brez besedila)
          image:
            "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        }),
      }
    );
    const res = await POST(request);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ročno");
  }, 30_000);
});
