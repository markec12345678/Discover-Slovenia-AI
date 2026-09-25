// ============================================================================
// TASK 28 (Tier 1 #1) — LIVE-SYNC INDIKATOR POTI („Wanderlog model" brez CRDT)
// ============================================================================
// Spremembe, ki jih ta datoteka varuje:
//   1. NOVA ruta GET /api/trip/[shareId]/version — lahkotna verzija poti
//      (contentVersion + updatedAt, NIČ vsebine) za polling; zasebna pot
//      brez vloge → 404 (nevidnost, ne 403); 600/h/IP limit;
//   2. src/lib/trip-version.ts — čista odločitev resolveVersionStale
//      (STROGO novejša strežniška verzija; null = neznano = nikoli zastarelo)
//      + fetchTripVersion (napaka → null, ne ugibanje);
//   3. ADDITIVNO: GET /api/itinerary/shared/[shareId] vrača contentVersion
//      (baza za CAS po ponovnem odprtu) + fetchSharedItinerary jo prenese
//      (tipizirano, null = strežnik je ni poslal);
//   4. /pot/[shareId] podaja initialVersion SharedTrip → banner
//      „Ta načrt je bil med tem posodobljen — Osveži" (router.refresh)
//      + „Ne zdaj" (dismiss);
//   5. Planner: banner v akcijski kartici (pristine → gumb Naloži, umazana
//      → iskreno opozorilo BREZ gumba — ne shranjenih sprememb ne brišemo
//      tiho), handleLoadServerVersion (undo sklad §22 + linkedTrip/CAS
//      obnova), analitika plan_update_detected/loaded/load_failed,
//      i18n ključi SL+EN (task71 pariteta).
//
// Struktura (konvencija issue6-d6b-pdf.test.ts):
//   · ČISTE funkcije (resolveVersionStale resnica tabelice);
//   · fetchTripVersion z nadzorovanim globalThis.fetch (offline/4xx/shape);
//   · SOURCE-CONTRACT vseh 5-točkovnih integracij (readFileSync dokazi);
//   · FUNKCIONALNO ruto version (samo kadar je DB dosegljiva — pošten skip;
//     TASK 76 higiena: clearProviderRateLimits v beforeEach).
// ============================================================================
import { describe, expect, test, beforeAll, afterAll, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  fetchTripVersion,
  resolveVersionStale,
  TRIP_VERSION_MAX_CONSECUTIVE_ERRORS,
  TRIP_VERSION_POLL_MS,
} from "@/lib/trip-version";
// TASK 76 higiena: dinamični uvoz route handlerja (spodaj) troši žetone
// deljenega omejevalnika runnerja → okno OBVEZNO počistimo.
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const versionRouteSrc = read("src/app/api/trip/[shareId]/version/route.ts");
const sharedRouteSrc = read("src/app/api/itinerary/shared/[shareId]/route.ts");
const shareLibSrc = read("src/lib/itinerary-share.ts");
const tripVersionLibSrc = read("src/lib/trip-version.ts");
const potPageSrc = read("src/app/pot/[shareId]/page.tsx");
const sharedTripSrc = read("src/components/shared-trip.tsx");
const plannerSrc = read("src/components/sections/itinerary-planner.tsx");
const hookSrc = read("src/hooks/use-trip-version-poll.ts");
const analyticsSrc = read("src/lib/planner-analytics.ts");

// ---------------------------------------------------------------------------
// 1. ČISTA RESNICA resolveVersionStale (brez I/O)
// ---------------------------------------------------------------------------

describe("TASK 28: resolveVersionStale — čista resnična tabelica", () => {
  test("zastarelo SAMO pri strogo novejši strežniški verziji", () => {
    expect(resolveVersionStale(0, 1)).toBe(true);
    expect(resolveVersionStale(3, 7)).toBe(true);
  });

  test("ENAKA verzija NI zastarela (polling istega stanja)", () => {
    expect(resolveVersionStale(5, 5)).toBe(false);
    expect(resolveVersionStale(0, 0)).toBe(false);
  });

  test("NIŽJA strežniška verzija NI zastarela (contentVersion raste mono)", () => {
    expect(resolveVersionStale(5, 4)).toBe(false);
    expect(resolveVersionStale(5, 0)).toBe(false);
  });

  test("NEZNANA lokalna verzija (null/undefined) NIKOLI ne trdi zastarelosti", () => {
    expect(resolveVersionStale(null, 9)).toBe(false);
    expect(resolveVersionStale(undefined, 9)).toBe(false);
  });

  test("konstante pollinga ostajajo podne prijavljene (dokumentirana pogodba)", () => {
    expect(TRIP_VERSION_POLL_MS).toBe(20_000);
    expect(TRIP_VERSION_MAX_CONSECUTIVE_ERRORS).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// 2. fetchTripVersion — nadzorovan globalThis.fetch (offline / 4xx / shape)
// ---------------------------------------------------------------------------

describe("TASK 28: fetchTripVersion — iskrenost ob napakah", () => {
  const realFetch = globalThis.fetch;

  test("uspeh → { contentVersion, updatedAt } (relativna pot + no-store)", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          success: true,
          shareId: "abc123",
          contentVersion: 4,
          updatedAt: "2026-09-26T12:00:00.000Z",
        }),
        { status: 200 }
      );
    }) as unknown as typeof fetch;
    try {
      const v = await fetchTripVersion("abc123");
      expect(v).toEqual({
        contentVersion: 4,
        updatedAt: "2026-09-26T12:00:00.000Z",
      });
      expect(calls.length).toBe(1);
      expect(calls[0].url).toBe("/api/trip/abc123/version");
      expect(calls[0].init?.cache).toBe("no-store");
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("omrežna napaka (offline) → null (NE ugiba)", async () => {
    globalThis.fetch = (async () => {
      throw new Error("fetch failed");
    }) as unknown as typeof fetch;
    try {
      expect(await fetchTripVersion("abc123")).toBeNull();
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("404 / 500 → null (pot ne obstaja / strežniška napaka)", async () => {
    for (const status of [404, 500]) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: "x" }), { status })) as unknown as typeof fetch;
      try {
        expect(await fetchTripVersion("abc123")).toBeNull();
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  });

  test("pokvarjen shape (manjka success/contentVersion/updatedAt) → null", async () => {
    const badBodies = [
      "{}",
      JSON.stringify({ success: true }),
      JSON.stringify({ success: true, contentVersion: "4" }),
      JSON.stringify({ success: true, contentVersion: 4 }),
      "not-json{",
    ];
    for (const body of badBodies) {
      globalThis.fetch = (async () =>
        new Response(body, { status: 200 })) as unknown as typeof fetch;
      try {
        expect(await fetchTripVersion("abc123")).toBeNull();
      } finally {
        globalThis.fetch = realFetch;
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT — integracijske točke (readFileSync dokazi)
// ---------------------------------------------------------------------------

describe("TASK 28: source-contract — vseh 5 integracij", () => {
  test("ruta /api/trip/[shareId]/version: disciplina + limit + shape", () => {
    // zaščita zasebnosti: 404 (NE 403) + resolveTripRole ena točka resnice
    expect(versionRouteSrc).toContain('if (!saved || role === "NONE")');
    expect(versionRouteSrc).toContain("resolveTripRole(shareId");
    expect(versionRouteSrc).toContain('key: "trip-version"');
    expect(versionRouteSrc).toContain("limit: 600");
    // lahkoten odgovor: SAMO verzija (nikoli itinererja/imenskih polj)
    expect(versionRouteSrc).toContain(
      "select: { contentVersion: true, updatedAt: true }"
    );
    expect(versionRouteSrc).toContain("contentVersion: meta.contentVersion");
    // SW poštenost: komentar zakaj NE pod /api/itinerary/shared (cache fallback)
    expect(versionRouteSrc).toContain("network-first");
  });

  test("GET shared (additivno): contentVersion v select + odgovoru", () => {
    expect(sharedRouteSrc).toContain("contentVersion: true");
    expect(sharedRouteSrc).toContain("contentVersion: saved.contentVersion");
  });

  test("fetchSharedItinerary prenese contentVersion (null = ni poslana)", () => {
    expect(shareLibSrc).toContain("contentVersion: number | null");
    expect(shareLibSrc).toContain(
      'typeof data.contentVersion === "number" ? data.contentVersion : null'
    );
  });

  test("/pot RSC podaja initialVersion iz contentVersion", () => {
    expect(potPageSrc).toContain("contentVersion: true");
    expect(potPageSrc).toContain("initialVersion={saved.contentVersion}");
  });

  test("SharedTrip: banner + Osveži (router.refresh) + dismiss", () => {
    expect(sharedTripSrc).toContain("useTripVersionPoll");
    expect(sharedTripSrc).toContain("initialVersion?: number | null");
    expect(sharedTripSrc).toContain("Ta načrt je bil med tem posodobljen");
    expect(sharedTripSrc).toContain("onClick={() => router.refresh()}");
    expect(sharedTripSrc).toContain("Osveži");
    expect(sharedTripSrc).toContain("dismissPlanUpdate");
  });

  test("hook: viden zavihek + utihanje ob zaporednih napakah", () => {
    expect(hookSrc).toContain("visibilitychange");
    expect(hookSrc).toContain("TRIP_VERSION_POLL_MS");
    expect(hookSrc).toContain("TRIP_VERSION_MAX_CONSECUTIVE_ERRORS");
    // dismiss spoštuje uporabnikovo „ne zdaj" do novejše verzije
    expect(hookSrc).toContain("dismissedVersion");
  });

  test("planner: banner + handler + varnost lokalnih sprememb", () => {
    // polling povezane pote (SAMO znana verzija — tuja odprta pot ne)
    expect(plannerSrc).toContain("useTripVersionPoll({");
    expect(plannerSrc).toContain("linkedTrip?.contentVersion ?? null");
    // banner: pristen (activeShareId) → gumb; umazan → SAMO opozorilo
    expect(plannerSrc).toContain("{activeShareId === null && (");
    expect(plannerSrc).toContain('{activeShareId !== null && (');
    expect(plannerSrc).toContain("handleLoadServerVersion");
    // nalaganje = destruktiven prehod → §22 undo sklad
    expect(plannerSrc).toContain('applyItinerary(data.itinerary, t("undoLabelPlanUpdate"))');
    // CAS obnova po nalasu (naslednja shranitev = posodobitev na mestu)
    expect(plannerSrc).toContain("contentVersion: data.contentVersion");
    // dismiss na voljo tudi v plannerju
    expect(plannerSrc).toContain("onClick={dismissPlanUpdate}");
  });

  test("planner analitika: 3 novi dogodki v PlannerEventName", () => {
    expect(analyticsSrc).toContain('"plan_update_detected"');
    expect(analyticsSrc).toContain('"plan_update_loaded"');
    expect(analyticsSrc).toContain('"plan_update_load_failed"');
    expect(plannerSrc).toContain('trackPlannerEvent("plan_update_detected"');
    expect(plannerSrc).toContain('trackPlannerEvent("plan_update_loaded"');
    expect(plannerSrc).toContain('trackPlannerEvent("plan_update_load_failed"');
  });

  test("i18n pariteta: 11 novih ključev planner NS v SL in EN (task71 kanon)", () => {
    const keys = [
      "planUpdatedBannerTitle",
      "planUpdatedBannerDesc",
      "planUpdatedLocalEdits",
      "planUpdatedLoadButton",
      "planUpdatedLoading",
      "planUpdatedDismiss",
      "planUpdatedLoadedToast",
      "planUpdatedLoadedToastDesc",
      "planUpdatedLoadErrorToast",
      "planUpdatedLoadErrorToastDesc",
      "undoLabelPlanUpdate",
    ];
    const sl = JSON.parse(read("src/i18n/messages/sl.json")).planner as Record<
      string,
      string
    >;
    const en = JSON.parse(read("src/i18n/messages/en.json")).planner as Record<
      string,
      string
    >;
    for (const k of keys) {
      expect(typeof sl[k]).toBe("string");
      expect(typeof en[k]).toBe("string");
    }
    // interpolacijska pariteta ({version} na obeh straneh)
    for (const k of ["planUpdatedBannerDesc", "planUpdatedLoadedToastDesc"]) {
      expect(sl[k]).toContain("{version}");
      expect(en[k]).toContain("{version}");
    }
  });
});

// ---------------------------------------------------------------------------
// 4. FUNKCIONALNO — GET /api/trip/[shareId]/version (DB-gated, TASK 76)
// ---------------------------------------------------------------------------

describe("TASK 28: funkcionalno — GET /api/trip/[shareId]/version", () => {
  let dbReachable = false;
  const createdShareIds: string[] = [];

  beforeEach(() => {
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

  function minimalItineraryJson(): string {
    return JSON.stringify({
      days: [
        {
          day: 1,
          locations: [
            {
              destination_id: "bled",
              destination_name: "Bled",
              lat: 46.3623,
              lng: 14.114,
              time_slot: "09:00-11:00",
              estimated_cost: 15,
            },
          ],
        },
      ],
      total_budget: 15,
      source: "deterministic",
    });
  }

  async function getVersion(shareId: string, ip: string) {
    const { GET } = await import("@/app/api/trip/[shareId]/version/route");
    return GET(
      new Request(`http://localhost/api/trip/${shareId}/version`, {
        headers: { "x-forwarded-for": ip },
      }),
      { params: Promise.resolve({ shareId }) } as never
    );
  }

  test("javna pot → 200 { contentVersion, updatedAt } brez vsebine", async () => {
    if (!dbReachable) {
      console.log("[task28] DB ni dosegljiva — preskakujem DB primer");
      return;
    }
    const { db } = await import("@/lib/db");
    const shareId = "t28ver0000001";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        name: "Testna pot T28",
        itinerary: minimalItineraryJson(),
        formData: "null",
        isPublic: true,
      },
    });
    const res = await getVersion(shareId, "10.77.28.1");
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      success?: boolean;
      shareId?: string;
      contentVersion?: number;
      updatedAt?: string;
      itinerary?: unknown;
      name?: unknown;
    };
    expect(data.success).toBe(true);
    expect(data.shareId).toBe(shareId);
    expect(data.contentVersion).toBe(0);
    expect(typeof data.updatedAt).toBe("string");
    // lahkotnost: ODGOVOR NE nosi vsebine (0 bajtov itinererja)
    expect(data.itinerary).toBeUndefined();
    expect(data.name).toBeUndefined();
  });

  test("verzija se POVEČA po posodobitvi (CAS patch poveča contentVersion)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const shareId = "t28ver0000002";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        itinerary: minimalItineraryJson(),
        formData: "null",
        isPublic: true,
      },
    });
    // „nekdo drug je shranil" → PATCH CAS poveča contentVersion (ista
    // write-pot kot produkt: updateMany pogojeno na verzijo)
    await db.savedItinerary.updateMany({
      where: { shareId, contentVersion: 0 },
      data: { contentVersion: { increment: 1 } },
    });
    const res = await getVersion(shareId, "10.77.28.2");
    expect(res.status).toBe(200);
    const data = (await res.json()) as { contentVersion?: number };
    expect(data.contentVersion).toBe(1);
  });

  test("ZASEBNA pot brez vloge → 404 (nevidnost, NE 403)", async () => {
    if (!dbReachable) return;
    const { db } = await import("@/lib/db");
    const shareId = "t28ver0000003";
    createdShareIds.push(shareId);
    await db.savedItinerary.create({
      data: {
        shareId,
        itinerary: minimalItineraryJson(),
        formData: "null",
        isPublic: false,
      },
    });
    const res = await getVersion(shareId, "10.77.28.3");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: string };
    expect(typeof body.error).toBe("string");
  });

  test("neobstoječa pot → 404", async () => {
    if (!dbReachable) return;
    const res = await getVersion("t28nonexistent", "10.77.28.4");
    expect(res.status).toBe(404);
  });

  test("neveljaven shareId → 400 (brez DB klica)", async () => {
    const { GET } = await import("@/app/api/trip/[shareId]/version/route");
    const res = await GET(
      new Request("http://localhost/api/trip/INVALID!@#/version", {
        headers: { "x-forwarded-for": "10.77.28.5" },
      }),
      { params: Promise.resolve({ shareId: "INVALID!@#" }) } as never
    );
    expect(res.status).toBe(400);
  });
});
