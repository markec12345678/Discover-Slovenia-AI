// ============================================================================
// ISSUE #7 (G11 + G-1) — hardening regresija produkcijske resnice
// ----------------------------------------------------------------------------
// Pokrito (dokazana vrzeli iz audita Issue #7, 2026-09-26):
//  A. POST /api/itinerary/save s POKVARJENIM JSON → 400 (prej 500 — parse
//     izjema je padla v splošni catch; generično sporočilo, brez popuškanja,
//     a napačen status); isti vzorec kot /api/journey/bookings/parse.
//  B. GET /api/itinerary/shared/{id} z NEVELJAVNO OBLIKO shareId → 400
//     (prej 404 — GET je preverjal SAMO dolžino, PDF/PATCH pa polni
//     SHARE_ID_RE; isti vhod je dobil različne odgovole na različnih poteh).
//  C. Veljavna-oblika-neznan shareId ostane 404 ( obstoj poti NE razkrije).
//  D. Source-contract pariteta: VSE tri shared rute (GET/PDF/PATCH) uporabljajo
//     SHARE_ID_RE vrata.
//  E. Verzijska vrata (G-1): functional-smoke.sh --expect-version obstaja in
//     prod-monitor.yml obe produkciji preverjata proti verziji repa.
// ============================================================================
import { describe, expect, test, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena — route-handler uvozi trošijo žetone deljenega omejevalnika
// runnerja → okno čistimo pred vsakim testom (isti vzorec kot task31 suite).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(import.meta.dir, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

// CI quality job NIMA baze ( isti vzorec kot task31-email-inbound /
// issue5-t5d-itinerary-pdf ) — test C rabi findUnique → preskoči brez baze.
// Bun sam naloži .env → lokalno/Build pot ima DATABASE_URL.
const hasDb = Boolean(process.env.DATABASE_URL);

let seq = 0;
const nextIp = () => `10.77.88.${(seq += 1)}`;

beforeEach(() => {
  clearProviderRateLimits();
});

describe("ISSUE #7 G11-A: save — pokvarjen JSON je 400, ne 500", () => {
  test("① '{???…' (nepopoln JSON) → 400 z jasnim sporočilom", async () => {
    const { POST } = await import("@/app/api/itinerary/save/route");
    const res = await POST(
      new Request("http://localhost/api/itinerary/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": nextIp(),
        },
        // NAMERNO pokvarjen JSON (parse vrže)
        body: "{???",
      })
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Neveljaven JSON v zahtevi");
  });

  test("② veljaven JSON brez itinerary → 400 ( obstoječa semantika pinirana)", async () => {
    const { POST } = await import("@/app/api/itinerary/save/route");
    const res = await POST(
      new Request("http://localhost/api/itinerary/save", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": nextIp(),
        },
        body: JSON.stringify({ name: "brez itinererja" }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("ISSUE #7 G11-B: shared GET — enotna validacija shareId", () => {
  test("③ 'zzz-ne-obstaja-12345' (neveljavni znaki) → 400, NE 404", async () => {
    const { GET } = await import("@/app/api/itinerary/shared/[shareId]/route");
    const res = await GET(
      new Request("http://localhost/api/itinerary/shared/zzz-ne-obstaja-12345"),
      { params: Promise.resolve({ shareId: "zzz-ne-obstaja-12345" }) }
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error?: string };
    expect(body.error).toBe("Neveljaven ID itinererja");
  });

  test.skipIf(!hasDb)(
    "④ 'aabbccdd01' (veljavna oblika, neznana) → 404 ( obstoj NE razkrije)",
    async () => {
      const { GET } = await import(
        "@/app/api/itinerary/shared/[shareId]/route"
      );
      const res = await GET(
        new Request("http://localhost/api/itinerary/shared/aabbccdd01"),
        { params: Promise.resolve({ shareId: "aabbccdd01" }) }
      );
      expect(res.status).toBe(404);
    }
  );
});

describe("ISSUE #7 G11-D: source-contract pariteta shared rut", () => {
  test("⑤ GET ruta uporablja SHARE_ID_RE vrata ( enak kanon kot PDF/PATCH)", () => {
    const src = read("src/app/api/itinerary/shared/[shareId]/route.ts");
    expect(src).toContain("SHARE_ID_RE.test(shareId)");
    expect(src).not.toContain("shareId.length > 32");
  });

  test("⑥ PDF ruta ohranja SHARE_ID_RE vrata", () => {
    const src = read(
      "src/app/api/itinerary/shared/[shareId]/pdf/route.ts"
    );
    expect(src).toContain("SHARE_ID_RE.test(shareId)");
  });
});

describe("ISSUE #7 G-1: verzijska vrata deploja ( drift ne sme biti tiho zelen)", () => {
  test("⑦ functional-smoke.sh ima --expect-version + rdeči alarm ob driftu", () => {
    const src = read("scripts/ops/functional-smoke.sh");
    expect(src).toContain("--expect-version)");
    expect(src).toContain("DRIFT VERZIJE");
    expect(src).toContain("verzija deploja ≡ repo");
  });

  test("⑧ prod-monitor.yml obe produkciji preverjata verzijo ≡ repo", () => {
    const src = read(".github/workflows/prod-monitor.yml");
    expect(src).toMatch(/--expect-version "\$\(jq -r \.version package\.json\)"/);
    expect(src.match(/--expect-version "\$\(jq/g)?.length).toBe(2);
    // Job oznake sledijo README kanonu (Render = primarna) — prej obrnjeno.
    expect(src).toContain("Render (PRIMARNA produkcija");
    expect(src).not.toContain("Vercel (PRIMARNA");
  });
});
