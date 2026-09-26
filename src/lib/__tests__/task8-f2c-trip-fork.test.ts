// ISSUE #8 Faza 2 / F2-C — FORK SKUPNOSTNE POTE (Task 37-c):
// „Community content should connect naturally into the same trip system"
// (issue §26) + regresijska matrika Faze 2 „fork skupnostne poti v planner".
//
// Vzorec: source-contract readFileSync (isto kot task8-d-add-to-trip-surfaces)
// + FUNKCIONALNI testi fork toka (mock globalThis.fetch + window.localStorage,
// isto kot task8-my-trip-core). Varovalke:
//  (a) TripForkButton obstaja in kliče saveItinerary/addSavedTrip (SL/EN),
//  (b) ZERO-LOSS na /pot/[shareId] — „Zaženi Na poti" / „Natisni / Shrani
//      kot PDF" / „Prenesi PDF" / „Odpri v načrtovalniku" / kolaboracija /
//      JSON-LD / print nogica / QR ostajajo,
//  (c) saveItinerary sprejema null formData BREZ lomljenja obstoječih
//      klicev (planner/timeline pošiljata PlannerInput nespremenjeno).

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { saveItinerary } from "../itinerary-share";
import {
  addSavedTrip,
  deriveSavedTripName,
} from "../my-trips-storage";
import type { Itinerary, PlannerInput } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ---------------------------------------------------------------------------
// fiksture (isti minimalni kanon kot issue5-t5d-itinerary-pdf)
// ---------------------------------------------------------------------------

function stop(
  partial: Partial<Itinerary["days"][number]["locations"][number]>
): Itinerary["days"][number]["locations"][number] {
  return {
    destination_id: partial.destination_id ?? "bled",
    destination_name: partial.destination_name ?? "Bled",
    time_slot: partial.time_slot ?? "09:00-11:00",
    duration: partial.duration ?? 2,
    estimated_cost: partial.estimated_cost ?? 15,
    notes: partial.notes ?? "",
  };
}

function fixtureItinerary(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          stop({ destination_name: "Bled" }),
          stop({ destination_id: "vintgar", destination_name: "Soteska Vintgar" }),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
    ],
    total_budget: 30,
    recommendations: [],
    tips: [],
    source: "ai",
  };
}

function fixturePlannerInput(): PlannerInput {
  return {
    budget: 600,
    days: 3,
    interests: ["narava", "hrana"],
    season: "summer",
    groupSize: 2,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 1. TRIP FORK BUTTON — vir, uvozi, dvojezičnost, dostopnost
// ─────────────────────────────────────────────────────────────────────────

describe("F2-C: TripForkButton komponenta (source-contract)", () => {
  const src = source("src/components/trip-fork-button.tsx");

  test("client komponenta z uvozi kanonskih helperjev (saveItinerary + addSavedTrip)", () => {
    expect(src).toContain('"use client"');
    expect(src).toContain('saveItinerary } from "@/lib/itinerary-share"');
    expect(src).toContain('from "@/lib/my-trips-storage"');
    expect(src).toContain("addSavedTrip");
    expect(src).toContain("deriveSavedTripName");
  });

  test("dvojezičnost prek useLocale (vzorec L objekta AddToTripButton)", () => {
    expect(src).toContain('useLocale } from "next-intl"');
    expect(src).toContain('locale === "en" ? L.en : L.sl');
    // SL nizi
    expect(src).toContain("Shrani kot svojo kopijo");
    expect(src).toContain("Potovanje shranjeno kot tvoja kopija");
    expect(src).toContain("Odpri kopijo");
    expect(src).toContain("Kopije ni bilo mogoče shraniti");
    // EN nizi
    expect(src).toContain("Save as your own copy");
    expect(src).toContain("Trip saved as your own copy");
    expect(src).toContain("Open the copy");
    expect(src).toContain("Could not save your copy");
  });

  test("fork tok: saveItinerary → addSavedTrip → toast z Odpri kopijo", () => {
    expect(src).toContain("await saveItinerary(");
    expect(src).toContain("addSavedTrip(result.shareId, name ?? deriveSavedTripName(itinerary))");
    expect(src).toContain("<ToastAction");
    expect(src).toContain("altText={s.openCopy}");
    expect(src).toContain("router.push(result.url)");
  });

  test("napaka: DESTRUCTIVE toast z iskrenim sporočilom iz saveItinerary", () => {
    expect(src).toContain('variant: "destructive"');
    expect(src).toContain("err instanceof Error && err.message");
    expect(src).toContain("s.errorFallback");
  });

  test("dostopnost: 44px tarča, aria-label, disabled + Loader2 med nalaganjem", () => {
    expect(src).toContain("min-h-[44px]");
    expect(src).toContain("aria-label={s.aria}");
    expect(src).toContain("disabled={busy}");
    expect(src).toContain("<Loader2");
    expect(src).toContain("animate-spin");
  });

  test("props: itinerary / formData (PlannerInput | null) / name (string | null)", () => {
    expect(src).toContain("itinerary: Itinerary;");
    expect(src).toContain("formData: PlannerInput | null;");
    expect(src).toContain("name: string | null;");
    // null formData se poda naprej (API ključ izpusti); name ?? undefined
    expect(src).toContain("name ?? undefined");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. SHARED TRIP — priklop gumba + ZERO-LOSS obstoječih akcij
// ─────────────────────────────────────────────────────────────────────────

describe("F2-C: SharedTrip priklop (source-contract)", () => {
  const src = source("src/components/shared-trip.tsx");

  test("izrisuje TripForkButton s popolnimi propsi", () => {
    expect(src).toContain('from "@/components/trip-fork-button"');
    expect(src).toContain("<TripForkButton");
    expect(src).toContain("itinerary={itinerary}");
    expect(src).toContain("formData={formData}");
    expect(src).toContain("name={name}");
  });

  test("nov prop formData (PlannerInput | null) z nazaj-kompatibilnim defaultom", () => {
    expect(src).toContain("formData?: PlannerInput | null;");
    expect(src).toContain("formData = null,");
    expect(src).toContain("PlannerInput } from \"@/lib/types\"");
  });

  test("ZERO-LOSS: vrstica akcij ohrani VSE obstoječe gumbe", () => {
    expect(src).toContain("Načrtuj svoje potovanje");
    expect(src).toContain("Zaženi Na poti");
    expect(src).toContain("Odpri v načrtovalniku");
    expect(src).toContain("Natisni / Shrani kot PDF");
    expect(src).toContain("Prenesi PDF");
    // print + PDF izvoz mehanizma nespremenjena
    expect(src).toContain("window.print()");
    expect(src).toContain("void downloadPdf()");
    expect(src).toContain(
      "`/api/itinerary/shared/${encodeURIComponent(shareId)}/pdf`"
    );
    // CTA vrstica ostaja izven print izhoda
    expect(src).toContain("print-hide print:hidden");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SERVER STRAN /pot/[shareId] — select formData + varen parse + prop
// ─────────────────────────────────────────────────────────────────────────

describe("F2-C: /pot/[shareId] server stran (source-contract)", () => {
  const src = source("src/app/pot/[shareId]/page.tsx");

  test("select vsebuje formData", () => {
    expect(src).toContain("formData: true,");
  });

  test("VAREN JSON.parse (try/catch → null, brez sesutja strani)", () => {
    expect(src).toContain("let formData: PlannerInput | null = null;");
    expect(src).toContain("JSON.parse(saved.formData)");
    expect(src).toContain('[pot] pokvarjen JSON formData:');
    expect(src).toContain("PlannerInput } from \"@/lib/types\"");
  });

  test("podaja SharedTrip nov prop formData", () => {
    expect(src).toContain("formData={saved.formData}");
  });

  test("ZERO-LOSS: sila-dinamičnost, metadata, JSON-LD, lupina, print, vse kartice", () => {
    expect(src).toContain('export const dynamic = "force-dynamic"');
    expect(src).toContain("index: false");
    expect(src).toContain("safeJsonLd(touristTrip)");
    expect(src).toContain("<Navigation solid />");
    expect(src).toContain("<Footer />");
    expect(src).toContain("<PrintQr shareId={shareId} />");
    expect(src).toContain("Izvoženo z Discover Slovenia AI");
    expect(src).toContain("<TripCollaboration shareId={shareId}");
    expect(src).toContain("<TripReservations shareId={shareId}");
    expect(src).toContain("<TripBudgetCard");
    expect(src).toContain("<TripDocumentsCard shareId={shareId}");
    expect(src).toContain("<TripGuide");
    expect(src).toContain("<TripPolls");
    expect(src).toContain("<TripSocial");
    expect(src).toContain("<TripDiary");
    expect(src).toContain("<TripPushCard shareId={shareId}");
    expect(src).toContain("<PageViewTracker path={`/pot/${shareId}`}");
    expect(src).toContain("initialVersion={saved.contentVersion}");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. itinerary-share.ts — signatura sprejema null + obstoječi klici cel
// ─────────────────────────────────────────────────────────────────────────

describe("F2-C: saveItinerary signatura (source-contract)", () => {
  const lib = source("src/lib/itinerary-share.ts");

  test("formData: PlannerInput | null — ob null ključ NE gre v telo", () => {
    expect(lib).toContain("formData: PlannerInput | null,");
    expect(lib).toContain("...(formData ? { formData } : {})");
  });

  test("obstoječi klici NESPREMENJENI (nazaj-kompatibilna širitev tipa)", () => {
    const planner = source("src/components/sections/itinerary-planner.tsx");
    expect(planner).toContain("await saveItinerary(itinerary, formData)");
    const timeline = source("src/components/trip-timeline.tsx");
    expect(timeline).toContain("await saveItinerary(");
    expect(timeline).toContain("plannerForm ?? fallbackForm(itinerary)");
  });
});

describe("F2-C: my-trips-storage izvozi ostajajo (source-contract)", () => {
  const storage = source("src/lib/my-trips-storage.ts");

  test("addSavedTrip + deriveSavedTripName izvožena (pogodba fork toka)", () => {
    expect(storage).toContain("export function addSavedTrip(");
    expect(storage).toContain("export function deriveSavedTripName(");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. FUNKCIONALNO: fork tok (mock fetch + window.localStorage)
// ─────────────────────────────────────────────────────────────────────────

// localStorage mock (bun nima DOM) — vzorec task8-my-trip-core
function makeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? (map.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      map.set(k, String(v));
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => {
      map.clear();
    },
    dump: () => map,
  };
}

const capturedBodies: string[] = [];
const storage = makeStorage();
const g = globalThis as Record<string, unknown>;
let prevFetch: unknown;
let hadWindow = false;
let prevWindow: unknown;

function okResponse(): Response {
  return new Response(
    JSON.stringify({
      success: true,
      shareId: "forkcopy123",
      url: "/pot/forkcopy123",
      editToken: "e".repeat(32),
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

beforeAll(() => {
  prevFetch = g.fetch;
  g.fetch = (async (_input: unknown, init?: { method?: string; body?: unknown }) => {
    if (init?.method === "POST") {
      capturedBodies.push(String(init.body ?? ""));
    }
    return okResponse();
  }) as typeof fetch;

  hadWindow = "window" in g;
  prevWindow = g.window;
  g.window = { localStorage: storage };
});

afterAll(() => {
  g.fetch = prevFetch;
  if (hadWindow) g.window = prevWindow;
  else delete g.window;
});

describe("F2-C funkcionalno: saveItinerary telo ob null formData", () => {
  test("null → BREZ formData ključa (API obravnava manjkajoči kot null)", async () => {
    capturedBodies.length = 0;
    const result = await saveItinerary(fixtureItinerary(), null, "Bled 3 dnevi");
    expect(result.shareId).toBe("forkcopy123");
    expect(result.url).toBe("/pot/forkcopy123");
    expect(result.editToken).toBe("e".repeat(32));
    const body = JSON.parse(capturedBodies[0]) as Record<string, unknown>;
    expect(body.itinerary).toBeDefined();
    expect(body.formData).toBeUndefined();
    expect(body.name).toBe("Bled 3 dnevi");
  });

  test("PlannerInput → formData PODAN (obstoječi klici nespremenjeni)", async () => {
    capturedBodies.length = 0;
    const fd = fixturePlannerInput();
    await saveItinerary(fixtureItinerary(), fd);
    const body = JSON.parse(capturedBodies[0]) as Record<string, unknown>;
    expect(body.formData).toEqual(fd);
  });

  test("napaka strežnika → iskreno sporočilo API-ja se prerine naprej", async () => {
    const prev = g.fetch;
    g.fetch = (async () =>
      new Response(JSON.stringify({ error: "Preveč zahtev. Prosimo, poskusite znova kasneje." }), {
        status: 429,
        headers: { "Content-Type": "application/json" },
      })) as unknown as typeof fetch;
    try {
      await saveItinerary(fixtureItinerary(), null);
      expect.unreachable();
    } catch (e) {
      expect(e instanceof Error).toBe(true);
      expect((e as Error).message).toContain("Preveč zahtev");
    } finally {
      g.fetch = prev;
    }
  });
});

describe("F2-C funkcionalno: cel fork tok (save → addSavedTrip)", () => {
  test("kopija se zapiše v dai:my-trips (Moja potovanja) z izpeljanim imenom", async () => {
    capturedBodies.length = 0;
    storage.clear();
    const itinerary = fixtureItinerary();
    // natanko vrednosti, ki jih podá TripForkButton (name: string | null)
    const name: string | null = null;
    const result = await saveItinerary(
      itinerary,
      null,
      name ?? undefined
    );
    addSavedTrip(result.shareId, name ?? deriveSavedTripName(itinerary));

    const raw = storage.dump().get("dai:my-trips");
    expect(raw).toBeDefined();
    const trips = JSON.parse(raw as string) as {
      shareId: string;
      name: string | null;
    }[];
    expect(trips).toHaveLength(1);
    expect(trips[0].shareId).toBe("forkcopy123");
    expect(trips[0].name).toBe("Bled · Soteska Vintgar");
  });

  test("editToken žetona shranjevalnika se shrani pod svoj ključ (lastništvo kopije)", async () => {
    storage.clear();
    await saveItinerary(fixtureItinerary(), null, undefined);
    expect(storage.dump().get("dsa_edit_token_forkcopy123")).toBe("e".repeat(32));
  });
});
