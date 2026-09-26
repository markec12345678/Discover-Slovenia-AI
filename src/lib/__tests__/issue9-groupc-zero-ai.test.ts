// ============================================================================
// ISSUE #9 (ZERO-AI/deterministic-first) — GROUP C (medij/glas) CONTRACT
// ============================================================================
// Z9-C dokazni red za skupino C:
//  (a) /api/journey/bookings/parse: besedilo/PDF/e-pošta so 100 %
//      deterministični — v ruti ostane SAMO generateVisionCompletion
//      (slika); NOBEN klic generateCompletion;
//  (b) strežniški TTS je ODSTRANJEN: src/lib/tts-engine.ts +
//      src/app/api/tts/route.ts + src/app/api/itinerary/tts/route.ts
//      NE obstajajo več;
//  (c) zvočni povzetki (dan + načrt) izgovarja BRKALNIŠKI glas
//      (window.speechSynthesis) — komponenti gradita skript NA KLIENTU
//      (čisti lib funkciji buildDayNarrationScript /
//      buildItineraryAudioScript), brez strežniškega TTS klica;
//  (d) deterministični fixture-i rezervacij: ≥6 REALNIH formatov ponudnikov
//      (Booking.com SL e-pošta, letalska PNR EN, KiwiTaxi transfer,
//      GetYourGuide, ICS koledar, neznano besedilo) → pričakovana polja +
//      iskren `via` kanal parserja; omrežje odbija VSE (dokaz 0 AI
//      odvisnosti — isti vzorec kot issue5-t5d/issue6-d6b/task31).
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena — route-handler uvozi trošijo žetone deljenega omejevalnika
// runnerja → okno čistimo pred vsakim testom (konvencija suite-a).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/journey/bookings/parse/route.ts");
const dayAudioSrc = read("src/components/itinerary-audio.tsx");
const plannerSrc = read("src/components/sections/itinerary-planner.tsx");

// ---------------------------------------------------------------------------
// (a) bookings/parse — ZERO-AI besedilna pot (VLM samo za sliko)
// ---------------------------------------------------------------------------

describe("ISSUE #9 C(a): /api/journey/bookings/parse — brez generateCompletion", () => {
  test("ruta uvaža SAMO generateVisionCompletion iz ai-client", () => {
    // uvozna vrstica vsebuje IZKLJUČNO vision noge (+ ne more vsebovati
    // tekstovne, saj bi generateCompletion postal nedoločen uvoz):
    expect(routeSrc).toContain(
      'import { generateVisionCompletion } from "@/lib/ai-client";'
    );
    expect(routeSrc).not.toMatch(
      /import\s*\{[^}]*generateCompletion[^}]*\}\s*from\s*"@\/lib\/ai-client"/
    );
  });

  test("NOBEN klic generateCompletion( v celotni ruti (slika = edini AI)", () => {
    expect(routeSrc).not.toMatch(/generateCompletion\s*\(/);
    expect(routeSrc).toContain("generateVisionCompletion(");
  });

  test("besedilna/PDF kaskada vračata deterministic + kanal parserja", () => {
    expect(routeSrc).toContain(
      'deterministicParseResponse(text, "text-parser")'
    );
    expect(routeSrc).toContain(
      'deterministicParseResponse(pdfText, "pdf-parser")'
    );
    // stara rezervna pogodba (via:"fallback") je odstranjena:
    expect(routeSrc).not.toContain('via: "fallback"');
    // ICS zaznavanje PREJ generičnim ostaja (D6-B vrstni red):
    const fnIdx = routeSrc.indexOf("function deterministicParseResponse");
    const icsProbeIdx = routeSrc.indexOf("isIcsInput(text)");
    const textCallIdx = routeSrc.indexOf("parseReservationText(text)");
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    expect(icsProbeIdx).toBeGreaterThan(fnIdx);
    expect(textCallIdx).toBeGreaterThan(icsProbeIdx);
  });

  test("slika ostaja pošten VLM-only 502 (brez tihe rezerve)", () => {
    expect(routeSrc).toContain("Slike ni bilo mogoče prebrati");
    expect(routeSrc).toMatch(/\{ status: 502 \}/);
  });
});

// ---------------------------------------------------------------------------
// (b) strežniški TTS — datoteke NE obstajajo več
// ---------------------------------------------------------------------------

describe("ISSUE #9 C(b): strežniški TTS izbrisan", () => {
  test("tts-engine + /api/tts + /api/itinerary/tts ne obstajajo", () => {
    expect(existsSync(join(ROOT, "src/lib/tts-engine.ts"))).toBe(false);
    expect(existsSync(join(ROOT, "src/app/api/tts/route.ts"))).toBe(false);
    expect(
      existsSync(join(ROOT, "src/app/api/itinerary/tts/route.ts"))
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// (c) brskalniški SpeechSynthesis — dan + načrt
// ---------------------------------------------------------------------------

describe("ISSUE #9 C(c): DayAudioButton — brskalniški TTS (dan)", () => {
  test("skript gradi klient + govori speechSynthesis (0 strežniških klicev)", () => {
    expect(dayAudioSrc).toContain("buildDayNarrationScript");
    expect(dayAudioSrc).toContain("speechSynthesis");
    expect(dayAudioSrc).toContain("SpeechSynthesisUtterance");
    expect(dayAudioSrc).toContain("speechLanguageTag");
    expect(dayAudioSrc).toContain("ttsSupported");
    expect(dayAudioSrc).toContain("utterance.rate = 1");
  });

  test("NI strežniškega TTS klica / blob predpomnilnika / z-ai", () => {
    expect(dayAudioSrc).not.toContain('"/api/tts"');
    expect(dayAudioSrc).not.toContain('"/api/itinerary/tts"');
    expect(dayAudioSrc).not.toContain("URL.createObjectURL");
    expect(dayAudioSrc).not.toContain("z-ai");
  });

  test("dostopen tekstovni padec, kadar govorna sinteza ni na voljo", () => {
    expect(dayAudioSrc).toContain("Prikaži besedilo");
    expect(dayAudioSrc).toContain("Show text");
    expect(dayAudioSrc).toContain("Računalniški glas ni na voljo");
    expect(dayAudioSrc).toContain("Computer voice unavailable");
  });
});

describe("ISSUE #9 C(c): planner »Poslušaj svoj načrt« — brskalniški TTS", () => {
  test("skript načrta gradi klient (čista lib) + govori speechSynthesis", () => {
    expect(plannerSrc).toContain("buildItineraryAudioScript");
    expect(plannerSrc).toContain("speechSynthesis");
    expect(plannerSrc).toContain("SpeechSynthesisUtterance");
    expect(plannerSrc).toContain("speechLanguageTag");
    expect(plannerSrc).toContain("ttsSupported");
    expect(plannerSrc).toContain("utterance.rate = 1");
  });

  test("NI strežniškega TTS klica (fetch na odstranjeno ruto) / blob URL-jev", () => {
    expect(plannerSrc).not.toContain('"/api/itinerary/tts"');
    expect(plannerSrc).not.toContain('"/api/tts"');
    // URL.createObjectURL ostaja SAMO za .ics izvoz (F5.2, datotečni
    // download — neodvisen od zvoka): zvočni povzetek ne dela blob URL-jev.
    const listenIdx = plannerSrc.indexOf("function handleListenClick");
    const listenBlock = plannerSrc.slice(
      listenIdx,
      plannerSrc.indexOf("utterance.onerror", listenIdx) + 600
    );
    expect(listenIdx).toBeGreaterThanOrEqual(0);
    expect(listenBlock).not.toContain("URL.createObjectURL");
    expect(listenBlock).not.toContain("fetch(");
  });

  test("govor se ustavi ob unmountu/pagehide (ne predvajaj v prazno)", () => {
    expect(plannerSrc).toContain("speechSynthesis.cancel()");
    expect(plannerSrc).toContain('"pagehide"');
  });

  test("iskrene UI niti ostanejo (existing i18n keys + tekstovni padec)", () => {
    // obstoječi i18n ključi (src/i18n/messages/*.json — planner imenski prostor):
    expect(plannerSrc).toContain('t("listenButton")');
    expect(plannerSrc).toContain('t("listenButtonAria")');
    expect(plannerSrc).toContain('t("listenHint")');
    // novi dvojezični nizi (selitev v i18n je poročana v issue9-report-c.md):
    expect(plannerSrc).toContain("Prikaži besedilo");
    expect(plannerSrc).toContain("Show text");
  });
});

// ---------------------------------------------------------------------------
// (d) deterministični fixture-i rezervacij (≥6 realnih formatov, 0 AI)
// ---------------------------------------------------------------------------

describe("ISSUE #9 C(d): bookings/parse — realni formati (deterministic PRIMA)", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;

  beforeEach(() => {
    seq += 1;
    clearProviderRateLimits();
    // ISSUE #9: besedilna pot je 100 % deterministična — omrežje, ki odbija
    // VSE, NE more spremeniti izida (dokaz: 0 AI klicev, 0 odvisnosti).
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-groupc-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  async function postParse(input: Record<string, unknown>) {
    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    return POST(
      new Request("http://localhost/api/journey/bookings/parse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // unikatni IP — rate limit (6/min) med testi nikoli ne pade
          "x-forwarded-for": `10.99.61.${seq}`,
        },
        body: JSON.stringify(input),
      })
    );
  }

  test("1. Booking.com SL e-pošta → via text-parser + polja", async () => {
    const res = await postParse({
      text: [
        "Vaša rezervacija pri Booking.com je potrjena.",
        "Št. rezervacije: 408.921.371.224",
        "Prijavitev: 12.07.2026",
        "Odjavitev: 14.07.2026",
        "Skupaj: 1.250,00 EUR",
      ].join("\n"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      persisted: boolean;
      providerSlug: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        price: number | null;
        currency: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.persisted).toBe(false);
    expect(body.providerSlug).toBe("booking");
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("408.921.371.224");
    expect(body.fields.startDateTime).toBe("12.07.2026");
    expect(body.fields.endDateTime).toBe("14.07.2026");
    expect(body.fields.price).toBe(1250);
    expect(body.fields.currency).toBe("EUR");
  }, 30_000);

  test("2. letalska potrditev EN (Wizz Air PNR) → via text-parser", async () => {
    const res = await postParse({
      text: [
        "Wizz Air — booking confirmed",
        "Booking reference: XK7L2P",
        "Departure: 12.07.2026, 14:30",
        "Arrival: 12.07.2026, 16:05",
        "Total price: USD 1,250.00",
      ].join("\n"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        price: number | null;
        currency: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.fields.providerName).toBe("Wizz Air");
    expect(body.fields.reservationNumber).toBe("XK7L2P");
    expect(body.fields.startDateTime).toBe("12.07.2026, 14:30");
    expect(body.fields.endDateTime).toBe("12.07.2026, 16:05");
    expect(body.fields.price).toBe(1250);
    expect(body.fields.currency).toBe("USD");
  }, 30_000);

  test("3. KiwiTaxi transfer (ISO datumi, števke s presledki) → text-parser", async () => {
    const res = await postParse({
      text: [
        "KiwiTaxi — naročilo potrjeno",
        "Booking number 408 921 371 224",
        "Pickup: 2026-07-12 14:30, Ljubljana, hotel Park",
        "Drop-off: 2026-07-12 16:30, Bled",
        "Za plačilo: 89,90 EUR",
      ].join("\n"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        price: number | null;
        currency: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.fields.providerName).toBe("KiwiTaxi");
    expect(body.fields.reservationNumber).toBe("408 921 371 224");
    expect(body.fields.startDateTime).toBe("2026-07-12 14:30");
    expect(body.fields.endDateTime).toBe("2026-07-12 16:30");
    expect(body.fields.price).toBe(89.9);
    expect(body.fields.currency).toBe("EUR");
  }, 30_000);

  test("4. GetYourGuide prosti zapis → text-parser (lokacije NE izmišljuje)", async () => {
    const res = await postParse({
      text: "GetYourGuide — št. rezervacije GYG-123456, Bled, 12.07.2026 10:00, 2 osebi, 58 EUR",
    });
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
        locationName: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.fields.providerName).toBe("GetYourGuide");
    expect(body.fields.reservationNumber).toBe("GYG-123456");
    expect(body.fields.startDateTime).toBe("12.07.2026 10:00");
    expect(body.fields.price).toBe(58);
    expect(body.fields.currency).toBe("EUR");
    // "Bled" je NEOZNAČENO → ne izmišljujemo lokacije:
    expect(body.fields.locationName).toBeNull();
  }, 30_000);

  test("5. ICS koledar (BEGIN:VCALENDAR) → VEVENT parser PREJ generičnim, via text-parser", async () => {
    const res = await postParse({
      text: [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "BEGIN:VEVENT",
        "UID:408921371224@booking.com",
        "DTSTART:20260814T140000Z",
        "DTEND:20260816T100000Z",
        "SUMMARY:Booking.com \\, Hotel Park",
        "LOCATION:Hotel Slon\\, Ljubljana",
        "END:VEVENT",
        "END:VCALENDAR",
      ].join("\r\n"),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        locationName: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    // kanal je BESEDILO (zavihek Besedilo) — ICS parser je NOTRIJ specifična
    // izbira; via iskreno razkrije vhodni kanal parserja:
    expect(body.via).toBe("text-parser");
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("408921371224@booking.com");
    expect(body.fields.startDateTime).toBe("20260814T140000Z");
    expect(body.fields.endDateTime).toBe("20260816T100000Z");
    expect(body.fields.locationName).toBe("Hotel Slon, Ljubljana");
  }, 30_000);

  test("6. neznano besedilo → iskren 422 (ročni vnos, NE izmišljeni vir)", async () => {
    const res = await postParse({
      text: "Lorem ipsum dolor sit amet, consectetur adipiscing elit sed do eiusmod.",
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ročno");
  }, 30_000);

  test("7. determinizem: enak vhod → enak izhod (2 klica, deep equal)", async () => {
    const text = [
      "Slovenske železnice — vozovnica",
      "Rezervacija: 1234567890",
      "Datum: 05.09.2026 08:15",
      "Znesek: 12,40 EUR",
    ].join("\n");
    const first = await postParse({ text });
    const second = await postParse({ text });
    const a = (await first.json()) as Record<string, unknown>;
    const b = (await second.json()) as Record<string, unknown>;
    expect(a).toEqual(b);
    expect(a.via).toBe("text-parser");
  }, 30_000);
});
