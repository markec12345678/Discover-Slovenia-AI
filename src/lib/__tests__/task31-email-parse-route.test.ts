// ============================================================================
// TASK 31 (Tier 1 #3) — /api/journey/bookings/parse: E-POŠTNI VHOD { email }
// ----------------------------------------------------------------------------
// Funkcionalni testi novega kanala (ISSUE #9: deterministični parser PRIMA,
// 0 AI žetonov — omrežje, ki odbija VSE, dokazuje 0 odvisnosti; isti
// vzorec kot issue5-t5d/issue6-d6b suite) + source-contract kaskade.
//
// Pokrito:
//  A. preprosta e-pošta → 200 deterministic + via text-parser (Subject s
//     ponudnikom — besedilna kaskada, 0 AI);
//  B. quoted-printable + RFC 2047 Subject → dekodirano skozi celo pot;
//  C. .ics priloga → via:"email-ics" (specifično pred splošnim, 0 AI);
//  D. smeti brez glave → iskren 422 z nasvetom (zavihek Besedilo);
//  E. email + text skupaj → 400 (SAMO EN vhod);
//  F. missing input → 400 (posodobljeno sporočilo z email);
//  G. source-contract: kaskada ICS → besedilo → PDF + cap + UI zavihek.
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena — vrata deljenega omejevalnika runnerja čistimo pred vsakim
// testom, ki dinamično uvaža route handler.
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const routeSrc = read("src/app/api/journey/bookings/parse/route.ts");
const uiSrc = read("src/components/trip-reservations.tsx");

const originalFetch = globalThis.fetch;
let seq = 0;

beforeEach(() => {
  seq += 1;
  clearProviderRateLimits();
  // ISSUE #9: besedilna kaskada je čisto deterministična (0 AI) — omrežje,
  // ki odbija VSE, dokazuje 0 odvisnosti (isti vzorec kot obstoječi suite).
  globalThis.fetch = (async () => {
    throw new Error(`test-offline-${seq}`);
  }) as unknown as typeof fetch;
});

afterAll(() => {
  globalThis.fetch = originalFetch;
});

function postEmail(raw: string, extra: Record<string, unknown> = {}) {
  // dinamičen uvoz — troši žetone rate limita (čiščeni v beforeEach)
  return import("@/app/api/journey/bookings/parse/route").then(({ POST }) =>
    POST(
      new Request("http://localhost/api/journey/bookings/parse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.31.77.${seq}`,
        },
        body: JSON.stringify({ email: raw, ...extra }),
      })
    )
  );
}

describe("TASK 31 + ISSUE #9: parse { email } — funkcionalno (0 AI, PRIMA)", () => {
  test("A: preprosta e-pošta → 200 deterministic + Subject s ponudnikom", async () => {
    const raw = [
      "From: potrditve@getyourguide.com",
      "To: janez@example.com",
      "Subject: GetYourGuide potrditev rezervacije GYG-123456",
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Pozdravljeni,",
      "Vaša rezervacija GYG-123456 je potrjena.",
      "Datum: 12.07.2026 10:00",
      "Lokacija: Bled",
      "Skupaj: 58 EUR",
    ].join("\r\n");
    const res = await postEmail(raw);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      persisted: boolean;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("text-parser");
    expect(body.persisted).toBe(false);
    expect(body.fields.providerName).toBe("GetYourGuide");
    expect(body.fields.reservationNumber).toBe("GYG-123456");
  }, 30_000);

  test("B: quoted-printable + RFC 2047 Subject → dekodirano skozi pot", async () => {
    const raw = [
      "From: noreply@booking.com",
      "Subject: =?utf-8?Q?Booking=2Ecom_potrditev=5F40891037?=",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=utf-8",
      "Content-Transfer-Encoding: quoted-printable",
      "",
      "Va=C5=A1a rezervacija je potrjena.",
      "=C5=A0t. rezervacije: 40891037",
      "Prijavitev: 12.07.2026",
      "Skupaj: 1.250,00 EUR",
    ].join("\r\n");
    const res = await postEmail(raw);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      fields: { providerName: string | null; reservationNumber: string | null };
    };
    expect(body.method).toBe("deterministic");
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("40891037");
  }, 30_000);

  test("C: .ics priloga → via email-ics (specifično pred splošnim, 0 AI)", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "DTSTAMP:20260101T000000Z",
      "DTSTART:20260814T140000Z",
      "DTEND:20260816T100000Z",
      "SUMMARY:Booking.com \\, Hotel Park",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const b = "ICALB";
    const raw = [
      "From: confirm@booking.com",
      "Subject: Rezervacija 408921371224",
      `Content-Type: multipart/mixed; boundary="${b}"`,
      "",
      `--${b}`,
      "Content-Type: text/plain; charset=utf-8",
      "",
      "Glej koledarsko prilogo.",
      `--${b}`,
      'Content-Type: text/calendar; name="booking.ics"; charset=utf-8',
      'Content-Disposition: attachment; filename="booking.ics"',
      "Content-Transfer-Encoding: base64",
      "",
      Buffer.from(ics, "utf8").toString("base64"),
      `--${b}--`,
    ].join("\r\n");
    const res = await postEmail(raw);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      fields: { reservationNumber: string | null; startDateTime: string | null };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("email-ics");
    expect(body.fields.reservationNumber).toBe("408921371224@booking.com");
    expect(body.fields.startDateTime).toBe("20260814T140000Z");
  }, 30_000);

  test("D: smeti brez glave → iskren 422 z nasvetom (zavihek Besedilo)", async () => {
    const res = await postEmail(
      "GetYourGuide GYG-123 Bled 12.07.2026 58 EUR — samo vidno besedilo brez glave"
    );
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("strukture e-pošte");
  }, 30_000);

  test("E: email + text skupaj → 400 (SAMO EN vhod)", async () => {
    const raw = "From: x@y.com\r\nSubject: s\r\nContent-Type: text/plain\r\n\r\ntelo";
    const res = await postEmail(raw, { text: "dodatno besedilo" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("SAMO EN");
  }, 30_000);

  test("F: manjkajoč vhod → 400 (sporočilo našteva email)", async () => {
    clearProviderRateLimits();
    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const res = await POST(
      new Request("http://localhost/api/journey/bookings/parse", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `10.31.78.${seq}`,
        },
        body: JSON.stringify({}),
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("email");
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────
// G: source-contract — kaskada, cap, UI zavihek
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: parse { email } — source-contract", () => {
  test("kaskada v pravem vrstnem redu: ICS → besedilo → PDF", () => {
    // uvoz MIME bralnika:
    expect(routeSrc).toContain("email-mime-parse");
    expect(routeSrc).toContain("parseEmailSource");
    // vrstni red: ics priloga PREJ emailTextForParsing PREJ pdf priloga:
    const icsIdx = routeSrc.indexOf("msg.icsAttachment && isIcsInput(msg.icsAttachment)");
    const textIdx = routeSrc.indexOf("emailTextForParsing(msg)");
    const pdfIdx = routeSrc.indexOf("pdfParseCascade(msg.pdfAttachmentBase64)");
    expect(icsIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeGreaterThan(icsIdx);
    expect(pdfIdx).toBeGreaterThan(textIdx);
    // ISSUE #9 (ZERO-AI): CELA e-poštna kaskada je deterministična — v ruti
    // ni klica generateCompletion (edini AI je VLM za sliko):
    expect(routeSrc).not.toMatch(/generateCompletion\(/);
    expect(routeSrc).toContain("generateVisionCompletion");
  });

  test("cap + MAX_RAW_EMAIL_CHARS spoštovan (413 pot)", () => {
    expect(routeSrc).toContain("MAX_RAW_EMAIL_CHARS");
    expect(routeSrc).toContain("{ status: 413 }");
    expect(routeSrc).toContain("E-pošta je prevelika");
  });

  test("via iskreno razkrije e-poštni kanal (email-ics)", () => {
    expect(routeSrc).toContain('"email-ics"');
    expect(routeSrc).toContain("deterministicEmailResponse");
  });

  test("UI ima zavihek E-pošta z navodili (Gmail/Outlook/Apple Mail)", () => {
    expect(uiSrc).toContain('value="email"');
    expect(uiSrc).toContain("Preberi e-pošto");
    expect(uiSrc).toContain("Pokaži izvorno kodo");
    expect(uiSrc).toContain(".eml");
    expect(uiSrc).toContain("parseRawEmail");
    // iskrena opomba o dormantnem posredovalnem naslovu:
    expect(uiSrc).toContain("vhodni poštni kanal");
  });
});
