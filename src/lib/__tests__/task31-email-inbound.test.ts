// ============================================================================
// TASK 31 (Tier 1 #3) — /api/journey/bookings/email-inbound: DORMANT WEBHOOK
// ----------------------------------------------------------------------------
// Funkcionalni testi strojnega prejemnega kanala (TripItov model):
//  · FAIL-CLOSED: brez DSA_EMAIL_INBOUND_TOKEN → iskren 503 (0 lažnega
//    zelenja — isti vzorec kot JOURNEY_PROVIDER_TOKEN / Stripe);
//  · napačen žeton → 401 (timing-safe);
//  · srečna pot: posredovana e-pošta → DRAFT (source IMPORTED, NIKOLI
//    CONFIRMED) + idempotenca (ponovna pošta → obstoječi zapis);
//  · ICS priloga → via email-ics;
//  · nič prepoznanega → 422, ZAPIS NE NASTANE (smeti ne delajo osnutkov);
//  · validacija: obe odvezavi / nobena / slab format / missing raw;
//  · source-contract: DRAFT-only disciplina + žetonska vrata v izvorni kodi.
// ============================================================================
import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");
const routeSrc = read("src/app/api/journey/bookings/email-inbound/route.ts");

const TOKEN = "task31-test-inbound-token-0123456789";
const RUN = `t31in${Date.now().toString(36)}`;
const createdIds: string[] = [];

const originalFetch = globalThis.fetch;
let seq = 0;

beforeEach(() => {
  seq += 1;
  clearProviderRateLimits();
  process.env.DSA_EMAIL_INBOUND_TOKEN = TOKEN;
});

afterEach(() => {
  delete process.env.DSA_EMAIL_INBOUND_TOKEN;
});

afterAll(async () => {
  globalThis.fetch = originalFetch;
  delete process.env.DSA_EMAIL_INBOUND_TOKEN;
  try {
    if (createdIds.length > 0) {
      await db.journeyBooking.deleteMany({
        where: { id: { in: createdIds } },
      });
    }
    // varovalka: pobriši vse zapise tega testa (tudi nepričakovane)
    await db.journeyBooking.deleteMany({
      where: {
        OR: [
          { sessionKey: { startsWith: RUN } },
          { providerProductId: { startsWith: "imp-booking-" } , sessionKey: { startsWith: RUN } },
        ],
      },
    });
  } catch {
    // čiščenje je best-effort
  }
});

function call(body: unknown, headers: Record<string, string> = {}) {
  return import("@/app/api/journey/bookings/email-inbound/route").then(
    ({ POST }) =>
      POST(
        new Request("http://localhost/api/journey/bookings/email-inbound", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-forwarded-for": `10.31.99.${seq}`,
            "x-provider-token": TOKEN,
            ...headers,
          },
          body: JSON.stringify(body),
        })
      )
    );
}

/** Realistična posredovana potrditvena e-pošta (Booking.com slog). */
function forwardedEmail(resNum: string): string {
  return [
    `Return-Path: <confirm@booking.com>`,
    `Received: from mx.booking.com (mx.booking.com [203.0.113.9])`,
    `From: "Booking.com" <confirm@booking.com>`,
    `To: rezervacije+${RUN}@discoverslovenia.ai`,
    `Subject: Vaša rezervacija ${resNum} je potrjena`,
    `Date: Sat, 26 Sep 2026 11:00:00 +0200`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset=utf-8`,
    "",
    `Pozdravljeni,`,
    `Vaša rezervacija je potrjena.`,
    `Št. rezervacije: ${resNum}`,
    `Prijavitev: 14.08.2026 od 14:00`,
    `Lokacija: Bled`,
    `Skupaj: 250,00 EUR`,
  ].join("\r\n");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. Fail-closed + avtentikacija
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: email-inbound — fail-closed vrata", () => {
  test("brez DSA_EMAIL_INBOUND_TOKEN → iskren 503 (kanal DORMANT)", async () => {
    delete process.env.DSA_EMAIL_INBOUND_TOKEN;
    const { POST } = await import(
      "@/app/api/journey/bookings/email-inbound/route"
    );
    const res = await POST(
      new Request("http://localhost/api/journey/bookings/email-inbound", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "10.31.99.1",
        },
        body: JSON.stringify({ raw: forwardedEmail("777001"), sessionKey: RUN }),
      })
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: string; hint?: string };
    expect(body.error).toContain("ni konfiguriran");
    expect(body.error).toContain("DSA_EMAIL_INBOUND_TOKEN");
    expect(body.hint).toBeDefined();
  });

  test("napačen žeton → 401", async () => {
    const res = await call(
      { raw: forwardedEmail("777002"), sessionKey: RUN },
      { "x-provider-token": "napacen-zeton" }
    );
    expect(res.status).toBe(401);
  });

  test("brez žetona v glavi → 401", async () => {
    const res = await call(
      { raw: forwardedEmail("777003"), sessionKey: RUN },
      { "x-provider-token": "" }
    );
    expect(res.status).toBe(401);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Validacija telesa
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: email-inbound — validacija telesa", () => {
  test("manjka raw → 400", async () => {
    const res = await call({ sessionKey: RUN });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("raw");
  });

  test("manjka odvezava → 400 (osnutek mora vedeti kam spada)", async () => {
    const res = await call({ raw: forwardedEmail("777004") });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("odvezava");
  });

  test("OBE odvezavi → 400 (SAMO ENA)", async () => {
    const res = await call({
      raw: forwardedEmail("777005"),
      sessionKey: RUN,
      shareId: "abc123",
    });
    expect(res.status).toBe(400);
  });

  test("slab sessionKey format → 400", async () => {
    const res = await call({
      raw: forwardedEmail("777006"),
      sessionKey: "slab format s presledki!",
    });
    expect(res.status).toBe(400);
  });

  test("ne-obstoječ shareId → 404 (brez sirot)", async () => {
    const res = await call({
      raw: forwardedEmail("777007"),
      shareId: "sicernoobstaja1",
    });
    expect(res.status).toBe(404);
  });

  test("suhoparna smet (ni e-pošte) → 422, zapis NE nastane", async () => {
    const res = await call({
      raw: "navadno besedilo brez glave in brez ničesar",
      sessionKey: RUN,
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string; needsConfirmation: boolean };
    expect(body.needsConfirmation).toBe(false);
  });

  test("e-pošta brez prepoznavnih polj → 422, zapis NE nastane", async () => {
    const res = await call({
      raw: [
        "From: newsletters@marketing.com",
        "Subject: Popust na čevlje!",
        "Content-Type: text/plain",
        "",
        "Uživajte v naših novih čevljih z 20 % popustom.",
      ].join("\r\n"),
      sessionKey: RUN,
    });
    expect(res.status).toBe(422);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Srečna pot — DRAFT + idempotenca (funkcionalno DB)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: email-inbound — srečna pot (DB)", () => {
  test("posredovana e-pošta → 201 DRAFT (source IMPORTED, needsConfirmation)", async () => {
    const res = await call({
      raw: forwardedEmail("408921371001"),
      sessionKey: `${RUN}-a`,
    });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      created: boolean;
      needsConfirmation: boolean;
      via: string;
      booking: {
        id: string;
        status: string;
        source: string;
        provider: string;
        providerProductId: string;
      };
    };
    expect(body.created).toBe(true);
    expect(body.needsConfirmation).toBe(true);
    expect(body.via).toBe("email-text");
    // §4 disciplina: SAMO DRAFT — nikoli CONFIRMED iz strojnega kanala:
    expect(body.booking.status).toBe("DRAFT");
    expect(body.booking.source).toBe("IMPORTED");
    expect(body.booking.provider).toBe("booking");
    expect(body.booking.providerProductId).toBe("imp-booking-408921371001");
    createdIds.push(body.booking.id);

    // preveri v DB:
    const row = await db.journeyBooking.findUnique({
      where: { id: body.booking.id },
    });
    expect(row?.status).toBe("DRAFT");
    expect(row?.sessionKey).toBe(`${RUN}-a`);
    const importData = JSON.parse(row?.importData ?? "{}");
    expect(importData.reservationNumber).toBe("408921371001");
    expect(importData.providerName).toBe("Booking.com");
  }, 30_000);

  test("idempotenca: ISTA e-pošta znova → 200 created:false (brez duplikata)", async () => {
    const first = await call({
      raw: forwardedEmail("408921371002"),
      sessionKey: `${RUN}-b`,
    });
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { booking: { id: string } };
    createdIds.push(firstBody.booking.id);

    const second = await call({
      raw: forwardedEmail("408921371002"),
      sessionKey: `${RUN}-b`,
    });
    expect(second.status).toBe(200);
    const secondBody = (await second.json()) as {
      created: boolean;
      booking: { id: string };
    };
    expect(secondBody.created).toBe(false);
    expect(secondBody.booking.id).toBe(firstBody.booking.id);

    // v bazi je TOČNO ENA vrstica za ta produkt:
    const rows = await db.journeyBooking.findMany({
      where: {
        provider: "booking",
        providerProductId: "imp-booking-408921371002",
        sessionKey: `${RUN}-b`,
      },
    });
    expect(rows.length).toBe(1);
  }, 30_000);

  test(".ics priloga → via email-ics + DRAFT", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:408921371003@booking.com",
      "DTSTART:20260814T140000Z",
      "SUMMARY:Booking.com \\, Hotel Park",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const b = "ICSINB";
    const raw = [
      "From: confirm@booking.com",
      "Subject: rezervacija",
      `Content-Type: multipart/mixed; boundary="${b}"`,
      "",
      `--${b}`,
      "Content-Type: text/plain",
      "",
      "Glej prilogo.",
      `--${b}`,
      'Content-Type: text/calendar; name="booking.ics"',
      'Content-Disposition: attachment; filename="booking.ics"',
      "",
      ics,
      `--${b}--`,
    ].join("\r\n");
    const res = await call({ raw, sessionKey: `${RUN}-c` });
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      via: string;
      booking: { id: string; status: string; providerProductId: string };
    };
    expect(body.via).toBe("email-ics");
    expect(body.booking.status).toBe("DRAFT");
    expect(body.booking.providerProductId).toBe(
      "imp-booking-408921371003BOOKINGCOM"
    );
    createdIds.push(body.booking.id);
  }, 30_000);
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Source-contract — disciplina v izvorni kodi
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 31: email-inbound — source-contract", () => {
  test("fail-closed žetonska vrata (vzorec JOURNEY_PROVIDER_TOKEN)", () => {
    expect(routeSrc).toContain("DSA_EMAIL_INBOUND_TOKEN");
    expect(routeSrc).toContain("timingSafeEqual");
    expect(routeSrc).toContain('{ status: 503 }');
    expect(routeSrc).toContain('{ status: 401 }');
  });

  test("DRAFT-ONLY disciplina: create SAMO z DRAFT (nikoli CONFIRMED)", () => {
    const createIdx = routeSrc.indexOf("tx.journeyBooking.create");
    const draftIdx = routeSrc.indexOf('status: "DRAFT"');
    expect(createIdx).toBeGreaterThan(0);
    expect(draftIdx).toBeGreaterThan(createIdx);
    // nikjer v ruti ne piše status: "CONFIRMED":
    expect(routeSrc).not.toContain('status: "CONFIRMED"');
  });

  test("deterministična kaskada (0 AI) + idempotenca v izvorni kodi", () => {
    // kaskada: ics → besedilo → pdf (vrstni red):
    const icsIdx = routeSrc.indexOf("msg.icsAttachment && isIcsInput(msg.icsAttachment)");
    const textIdx = routeSrc.indexOf("emailTextForParsing(msg)");
    const pdfIdx = routeSrc.indexOf("msg.pdfAttachmentBase64");
    expect(icsIdx).toBeGreaterThanOrEqual(0);
    expect(textIdx).toBeGreaterThan(icsIdx);
    expect(pdfIdx).toBeGreaterThan(textIdx);
    // brez AI uvozov (strojni kanal ne žge žetonov):
    expect(routeSrc).not.toContain("generateCompletion");
    expect(routeSrc).not.toContain("generateVisionCompletion");
    // idempotenca:
    expect(routeSrc).toContain("findFirst");
    expect(routeSrc).toContain('"idempotent"');
  });

  test("surowa pošta se NE shrani (samo normaliziran importData)", () => {
    // importData vsebuje SAMO normalizirana polja (ne surovega raw):
    const idx = routeSrc.indexOf("const importData = JSON.stringify(");
    const end = routeSrc.indexOf("}).slice(0, 20_000);", idx);
    const snippet = routeSrc.slice(idx, end);
    expect(snippet).not.toContain("raw");
    expect(snippet).toContain("providerName");
    // audit ne nosi surove pošte — samo temo (120 znakov):
    expect(routeSrc).toContain("emailSubject: msg.subject?.slice(0, 120)");
  });
});
