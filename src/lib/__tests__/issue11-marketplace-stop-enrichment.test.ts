// ============================================================================
// ISSUE #11 (D1, 1.117.0) — TRŽNICA NA POSTANKU NAČRTA
// ----------------------------------------------------------------------------
// Mandat: docs/COMPETITIVE-ANALYSIS.md §2/D1 + §4 #6 (»realne cene v planerju«).
// Sklopi:
//  1. UNIT — čista domena summarizeDestinationExperiences: min cena → fromPrice,
//     top izbira verified→rating→reviewCount→ime (determinizem), 0 vrstic → null;
//  2. UNIT — applyMarketplaceToStops: prilepi SAMO ujemajoče postanke;
//     ISKRENOSTNI invariant: estimated_cost in ostala polja ostanejo
//     BITNO-identična (ocena se NIKOLI ne prepiše z realno ceno);
//  3. UNIT — enrichWithMarketplaceExperiences z INJEKTIRANIM pridobivalcem
//     (kanon „NO mock.module", Task 28): fail-open (resolver vrže → načrt
//     nespremenjen), predpomnilnik (2. klic NE poizveduje znova; NULL se
//     prav tako predpomni), predpomnjene destinacije NE gredo v poizvedbo;
//  4. SOURCE-CONTRACT — ruta kliče obogatitev pred odgovorom; tip na
//     LocationVisit; UI čip (locale-zavedna povezava /dozivetja +
//     /en/dozivetja); i18n ključi SL+EN; analytics whitelist klient+strežnik;
//  5. FUNKCIONALNO — samo, če je DB dosegljiva (dbReachable varovalka,
//     vzorec task31/33): lastna published izkušnja → obogatitev praznega
//     načrta; fromPrice ≡ min iz NEODVISNE poizvedbe; POST /api/itinerary
//     (unikaten x-real-ip — ločeno rate-limit vedro, vzorec task50/51) →
//     vsak postanek, katerega destinacija ima published izkušnjo, nosi
//     marketplace; estimated_cost načrta ostane ocena (NEOVERJENA s tržnico).
// ============================================================================
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import {
  applyMarketplaceToStops,
  clearMarketplaceCache,
  enrichWithMarketplaceExperiences,
  summarizeDestinationExperiences,
  type MarketplaceExperienceRow,
} from "@/lib/marketplace-stop-enrichment";
import type { Itinerary, LocationVisit, StopMarketplaceInfo } from "@/lib/types";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/itinerary/route.ts");
const typesSrc = read("src/lib/types.ts");
const timelineSrc = read("src/components/trip-timeline.tsx");
const slMessages = JSON.parse(read("src/i18n/messages/sl.json"));
const enMessages = JSON.parse(read("src/i18n/messages/en.json"));
const plannerAnalyticsSrc = read("src/lib/planner-analytics.ts");
const analyticsRouteSrc = read("src/app/api/analytics/event/route.ts");

/** Vrstica izkušnje za unit teste. */
function row(over: Partial<MarketplaceExperienceRow> = {}): MarketplaceExperienceRow {
  return {
    slug: "test-sl",
    name: "Testna izkušnja",
    destinationId: "testdest",
    pricePerPerson: 50,
    rating: 4.5,
    reviewCount: 10,
    verified: false,
    durationHours: 3,
    ...over,
  };
}

/** Minimalen veljaven načrt za unit teste. */
function emptyItinerary(stops: LocationVisit[]): Itinerary {
  return {
    days: [{ day: 1, locations: stops, weather: { condition: "sončno", temp: 20 } }],
  } as unknown as Itinerary;
}

// ─────────────────────────────────────────────────────────────────────────
// 1. UNIT — čista domena: summarizeDestinationExperiences
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #11: domena — summarizeDestinationExperiences", () => {
  test("0 vrstic → null (polja NI — 0 izkušenj se ne izmišljuje)", () => {
    expect(summarizeDestinationExperiences([])).toBeNull();
  });

  test("fromPrice = min(pricePerPerson) — »od« cena je spodnja meja", () => {
    const s = summarizeDestinationExperiences([
      row({ pricePerPerson: 45 }),
      row({ pricePerPerson: 60 }),
      row({ pricePerPerson: 18 }),
    ]);
    expect(s?.fromPrice).toBe(18);
    expect(s?.count).toBe(3);
    expect(s?.currency).toBe("EUR");
  });

  test("top izbira: verified premaga višjo oceno (GYG-model zaupanja)", () => {
    const s = summarizeDestinationExperiences([
      row({ slug: "neoverjena", name: "B", rating: 5, reviewCount: 100, verified: false }),
      row({ slug: "overjena", name: "A", rating: 4.8, reviewCount: 50, verified: true }),
    ]);
    expect(s?.top.slug).toBe("overjena");
  });

  test("top izbira: rating odloča pri enaki verified zastavici", () => {
    const s = summarizeDestinationExperiences([
      row({ slug: "nizja", rating: 4.1 }),
      row({ slug: "visja", rating: 4.9 }),
    ]);
    expect(s?.top.slug).toBe("visja");
  });

  test("top izbira: reviewCount odloča pri enakem ratingu; ime AZ prelomi izenačenje", () => {
    const s = summarizeDestinationExperiences([
      row({ slug: "malo", name: "Zdnje", rating: 4.8, reviewCount: 5 }),
      row({ slug: "veliko", name: "Adrugo", rating: 4.8, reviewCount: 500 }),
    ]);
    expect(s?.top.slug).toBe("veliko");
    const tie = summarizeDestinationExperiences([
      row({ slug: "b", name: "B", rating: 4.8, reviewCount: 50 }),
      row({ slug: "a", name: "A", rating: 4.8, reviewCount: 50 }),
    ]);
    expect(tie?.top.slug).toBe("a");
  });

  test("determinizem: isti vhod → bitno-identičen izhod (vrstni red vhoda NE šteje)", () => {
    const rows = [
      row({ slug: "x", rating: 4.5, reviewCount: 10 }),
      row({ slug: "y", rating: 4.5, reviewCount: 10, verified: true }),
      row({ slug: "z", pricePerPerson: 12 }),
    ];
    const a = JSON.stringify(summarizeDestinationExperiences(rows));
    const b = JSON.stringify(summarizeDestinationExperiences([...rows].reverse()));
    expect(a).toBe(b);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. UNIT — applyMarketplaceToStops (iskrenostni invariant)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #11: applyMarketplaceToStops — prilepi SAMO ujemajoče postanke", () => {
  const summary: StopMarketplaceInfo = {
    count: 2,
    fromPrice: 39,
    currency: "EUR",
    top: {
      slug: "kajak",
      name: "Sončni zahod s kajakom",
      pricePerPerson: 39,
      rating: 4.9,
      reviewCount: 66,
      verified: false,
      durationHours: 2,
    },
  };

  test("ujemajoč postanek dobi marketplace; ostali ostanejo BREZ polja", () => {
    const it = emptyItinerary([
      { destination_id: "piran", destination_name: "Piran", time_slot: "10:00", duration: 2, estimated_cost: 40, notes: "" },
      { destination_id: "ljubljana", destination_name: "Ljubljana", time_slot: "15:00", duration: 3, estimated_cost: 30, notes: "" },
    ]);
    const out = applyMarketplaceToStops(it, new Map([["piran", summary], ["ljubljana", null]]));
    expect(out.days[0].locations[0].marketplace).toEqual(summary);
    expect(out.days[0].locations[1].marketplace).toBeUndefined();
  });

  test("ISKRENOST: estimated_cost ostane OCENA načrta (nikoli prepisana/primešana)", () => {
    const it = emptyItinerary([
      { destination_id: "piran", destination_name: "Piran", time_slot: "10:00", duration: 2, estimated_cost: 40, notes: "ocena" },
    ]);
    const out = applyMarketplaceToStops(it, new Map([["piran", summary]]));
    // Ocena 40 ≠ tržniška »od« cena 39 — NE sintetizira se nobena mešana vrednost
    expect(out.days[0].locations[0].estimated_cost).toBe(40);
    expect(out.days[0].locations[0].marketplace?.fromPrice).toBe(39);
  });

  test("VHOD se NE mutira (čista funkcija — nova struktura)", () => {
    const stop: LocationVisit = { destination_id: "piran", destination_name: "Piran", time_slot: "10:00", duration: 2, estimated_cost: 40, notes: "" };
    const it = emptyItinerary([stop]);
    applyMarketplaceToStops(it, new Map([["piran", summary]]));
    expect(stop.marketplace).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. UNIT — enrichWithMarketplaceExperiences (injektiran pridobivalec)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #11: enrich — fail-open + predpomnilnik (injektiran resolver)", () => {
  beforeAll(() => clearMarketplaceCache());
  beforeEach(() => clearMarketplaceCache());

  test("fail-open: resolver vrže → načrt NESPREMENJEN (isti kanon kot vreme)", async () => {
    const it = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    const boom: never = undefined as never;
    const out = await enrichWithMarketplaceExperiences(it, {
      resolve: async () => {
        throw boom;
      },
    });
    expect(out).toBe(it);
    expect(out.days[0].locations[0].marketplace).toBeUndefined();
  });

  test("0 izkušenj → brez polja (iskreno — nič se ne izmišljuje)", async () => {
    const it = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    const out = await enrichWithMarketplaceExperiences(it, { resolve: async () => [] });
    expect(out.days[0].locations[0].marketplace).toBeUndefined();
  });

  test("obogatitev prilepi povzetek (fromPrice = min, top = verified)", async () => {
    const it = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    const out = await enrichWithMarketplaceExperiences(it, {
      resolve: async () => [
        row({ destinationId: "soca", slug: "kanjoning", pricePerPerson: 60, rating: 4.9, reviewCount: 98 }),
        row({ destinationId: "soca", slug: "rafting", pricePerPerson: 45, rating: 4.8, reviewCount: 214, verified: true }),
      ],
    });
    const m = out.days[0].locations[0].marketplace;
    expect(m?.count).toBe(2);
    expect(m?.fromPrice).toBe(45);
    expect(m?.top.slug).toBe("rafting");
  });

  test("predpomnilnik: druga poizvedba NE kliče resolverja znova (ISTI načrt)", async () => {
    let calls = 0;
    const it = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    const resolve = async (ids: string[]) => {
      calls += 1;
      return ids.map((id) => row({ destinationId: id }));
    };
    await enrichWithMarketplaceExperiences(it, { resolve });
    await enrichWithMarketplaceExperiences(it, { resolve });
    expect(calls).toBe(1);
  });

  test("NULL se predpomni: prazna destinacija se NE poizveduje znova", async () => {
    let calls = 0;
    const it = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    const resolve = async (ids: string[]) => {
      calls += 1;
      return ids.includes("soca") ? [] : ids.map((id) => row({ destinationId: id }));
    };
    await enrichWithMarketplaceExperiences(it, { resolve });
    await enrichWithMarketplaceExperiences(it, { resolve });
    expect(calls).toBe(1);
  });

  test("mešano: predpomnjena destinacija NE gre v novo poizvedbo (samo manjkajoče)", async () => {
    clearMarketplaceCache();
    const soca = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
    ]);
    await enrichWithMarketplaceExperiences(soca, {
      resolve: async (ids) => ids.map((id) => row({ destinationId: id })),
    });
    const fetched: string[][] = [];
    const mixed = emptyItinerary([
      { destination_id: "soca", destination_name: "Soča", time_slot: "09:00", duration: 4, estimated_cost: 50, notes: "" },
      { destination_id: "piran", destination_name: "Piran", time_slot: "14:00", duration: 3, estimated_cost: 30, notes: "" },
    ]);
    const out = await enrichWithMarketplaceExperiences(mixed, {
      resolve: async (ids) => {
        fetched.push(ids);
        return ids.map((id) => row({ destinationId: id }));
      },
    });
    expect(fetched).toEqual([["piran"]]);
    expect(out.days[0].locations[0].marketplace?.count).toBe(1);
    expect(out.days[0].locations[1].marketplace?.count).toBe(1);
  });

  test("prazen načrt (0 postankov) → resolver NI klican, načrt nespremenjen", async () => {
    let calls = 0;
    const it = emptyItinerary([]);
    const out = await enrichWithMarketplaceExperiences(it, {
      resolve: async () => {
        calls += 1;
        return [];
      },
    });
    expect(calls).toBe(0);
    expect(out.days[0].locations.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. SOURCE-CONTRACT — povezava plasti (drift nemogoč)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #11: source-contract — ruta + tip + UI + i18n + analytics", () => {
  test("ruta uvozi IN kliče enrichWithMarketplaceExperiences pred odgovorom", () => {
    expect(routeSrc).toContain('from "@/lib/marketplace-stop-enrichment"');
    expect(routeSrc).toContain("await enrichWithMarketplaceExperiences(withIntent)");
    // klic je ZADNJI korak pred odgovorom (za namerno-plastjo — nad vsemi dnevi/postanki)
    const callIdx = routeSrc.indexOf("await enrichWithMarketplaceExperiences(withIntent)");
    const returnIdx = routeSrc.indexOf("return NextResponse.json(withMarketplace)");
    expect(callIdx).toBeGreaterThan(-1);
    expect(returnIdx).toBeGreaterThan(callIdx);
  });

  test("tip: LocationVisit.marketplace (optional) + StopMarketplaceInfo pogodba", () => {
    expect(typesSrc).toContain("marketplace?: StopMarketplaceInfo");
    expect(typesSrc).toContain("export interface StopMarketplaceInfo");
    for (const field of ["count", "fromPrice", "currency", "top"]) {
      expect(typesSrc).toContain(`/**`);
    }
    expect(typesSrc).toMatch(/fromPrice: number/);
    expect(typesSrc).toMatch(/currency: "EUR"/);
  });

  test("UI: čip se izriše SAMO ob obstoječih podatkih + locale-zavedna povezava", () => {
    expect(timelineSrc).toContain("const marketplace = visit.marketplace;");
    expect(timelineSrc).toContain("{marketplace && (");
    expect(timelineSrc).toContain('lang === "en" ? "/en/dozivetja" : "/dozivetja"');
    expect(timelineSrc).toContain("marketplaceFrom");
    expect(timelineSrc).toContain("marketplaceCount");
    // top izkušnja razkrita ob hoverju (dostopnost)
    expect(timelineSrc).toContain("marketplace.top.name");
  });

  test("i18n: ključa obstajata v OBEH jezikih (SL + EN)", () => {
    expect(slMessages.planner.timeline.marketplaceFrom).toContain("€{price}");
    expect(slMessages.planner.timeline.marketplaceCount).toContain("plural");
    expect(enMessages.planner.timeline.marketplaceFrom).toContain("{price}");
    expect(enMessages.planner.timeline.marketplaceCount).toContain("plural");
  });

  test("analytics: dogodek marketplace_stop_cta na BELI whitelisti klienta IN strežnika", () => {
    expect(plannerAnalyticsSrc).toContain('"marketplace_stop_cta"');
    expect(analyticsRouteSrc).toContain('"marketplace_stop_cta"');
    // UI dogodek dejansko izstreli ob kliku čipa
    expect(timelineSrc).toContain('trackPlannerEvent("marketplace_stop_cta"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. FUNKCIONALNO — dbReachable varovalka (vzorec task31/33)
// ─────────────────────────────────────────────────────────────────────────

let dbReachable = false;
const createdExperienceIds: string[] = [];

beforeAll(async () => {
  try {
    await db.savedItinerary.count();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

afterAll(async () => {
  if (!dbReachable) return;
  try {
    if (createdExperienceIds.length > 0) {
      await db.review.deleteMany({ where: { experienceId: { in: createdExperienceIds } } });
      await db.experienceAvailabilityDay.deleteMany({ where: { experienceId: { in: createdExperienceIds } } });
      await db.experienceAvailability.deleteMany({ where: { experienceId: { in: createdExperienceIds } } });
      await db.experience.deleteMany({ where: { id: { in: createdExperienceIds } } });
    }
  } catch {
    // čiščenje je best-effort (CI baza je ephemeral)
  }
});

describe("ISSUE #11: funkcionalno — prava DB (published izkušnje)", () => {
  const RUN = `i11d1${Date.now().toString(36)}`;

  test("obogatitev nad načrtom: fromPrice ≡ min iz NEODVISNE poizvedbe + top ≡ kanon izbire", async () => {
    if (!dbReachable) {
      console.log("[issue11-d1] DB ni dosegljiva — preskakujem (vzorec task33)");
      return;
    }
    clearMarketplaceCache();
    // Lastna published izkušnja z znanim destinacijskim ID-jem (bled je
    // kanonska destinacija — nikoli ni v konfliktu s testnimi fixture-i).
    const created = await db.experience.create({
      data: {
        name: `I11 D1 test — draga ${RUN}`,
        slug: `i11-d1-draga-${RUN}`,
        description: "Testna izkušnja Issue #11 (funkcionalni test) — draga.",
        category: "outdoor",
        destinationId: "bled",
        destinationName: "Bled",
        pricePerPerson: 123,
        currency: "EUR",
        durationHours: 4,
        languages: "[\"sl\"]",
        address: "Test 1",
        images: "[]",
        providerName: "I11 Test",
        status: "published",
        rating: 3.0,
        reviewCount: 1,
      },
    });
    const cheap = await db.experience.create({
      data: {
        name: `I11 D1 test — poceni ${RUN}`,
        slug: `i11-d1-poceni-${RUN}`,
        description: "Testna izkušnja Issue #11 (funkcionalni test) — poceni.",
        category: "outdoor",
        destinationId: "bled",
        destinationName: "Bled",
        pricePerPerson: 7,
        currency: "EUR",
        durationHours: 1,
        languages: "[\"sl\"]",
        address: "Test 2",
        images: "[]",
        providerName: "I11 Test",
        status: "published",
        verified: true,
        rating: 4.0,
        reviewCount: 2,
      },
    });
    createdExperienceIds.push(created.id, cheap.id);

    const it = emptyItinerary([
      { destination_id: "bled", destination_name: "Bled", time_slot: "09:00", duration: 3, estimated_cost: 25, notes: "" },
    ]);
    const out = await enrichWithMarketplaceExperiences(it);
    const m = out.days[0].locations[0].marketplace;
    expect(m).toBeDefined();

    // NEODVISNA poizvedba (ista pogodba kot obogatitev — druga koda pot)
    const rows = await db.experience.findMany({
      where: { status: "published", destinationId: "bled" },
      select: { pricePerPerson: true, verified: true, rating: true, reviewCount: true, name: true },
      orderBy: [{ verified: "desc" }, { rating: "desc" }, { reviewCount: "desc" }, { name: "asc" }],
    });
    const expectedMin = Math.min(...rows.map((r) => r.pricePerPerson));
    expect(m?.fromPrice).toBe(expectedMin);
    expect(m?.count).toBe(rows.length);
    expect(m?.top.name).toBe(rows[0]?.name);

    // ISKRENOST: ocena načrta ostane nespremenjena (25 ≠ 7 — nikoli prepisana)
    expect(out.days[0].locations[0].estimated_cost).toBe(25);
  });

  test("POST /api/itinerary: postanek z published izkušnjo destinacije nosi marketplace (samo-zadosten)", async () => {
    if (!dbReachable) {
      console.log("[issue11-d1] DB ni dosegljiva — preskakujem (vzorec task33)");
      return;
    }
    // TASK 76 higiena + rate-limit ločeno vedro (unikaten x-real-ip — task50/51 vzorec)
    const { clearProviderRateLimits } = await import("@/lib/supply/search");
    clearProviderRateLimits();

    // SAMO-ZADOSTNOST (lekcija issue9 ask-local): test NE predpostavlja
    // niti prazne NITI naseljene baze. Prvi korak: počisti vrstice PREJŠNJEGA
    // funkcionalnega testa (bled) — plan A potrebuje čisto izhodišče GLEDE
    // NAŠIH vrstic (tuje vrstice ostanejo in se dokazujejo NEODVISNO).
    if (createdExperienceIds.length > 0) {
      await db.experience.deleteMany({
        where: { id: { in: createdExperienceIds } },
      });
      createdExperienceIds.length = 0;
    }
    clearMarketplaceCache();

    /** NEODVISNA mapa stanja tržnice (ista pogodba — druga koda pot). */
    const marketMap = async () => {
      const rows = await db.experience.findMany({
        where: { status: "published", destinationId: { not: null } },
        select: { destinationId: true, pricePerPerson: true },
      });
      const m = new Map<string, { count: number; minPrice: number }>();
      for (const r of rows) {
        const id = r.destinationId as string;
        const cur = m.get(id);
        if (cur) {
          cur.count += 1;
          cur.minPrice = Math.min(cur.minPrice, r.pricePerPerson);
        } else {
          m.set(id, { count: 1, minPrice: r.pricePerPerson });
        }
      }
      return m;
    };

    const { POST } = await import("@/app/api/itinerary/route");
    const payload = {
      budget: 500,
      days: 3,
      interests: ["narava", "mesta"],
      season: "summer",
      groupSize: 2,
      language: "sl",
      engine: "deterministic",
    };
    const post = (ip: string) =>
      new Request("http://localhost/api/itinerary", {
        method: "POST",
        headers: { "content-type": "application/json", "x-real-ip": ip },
        body: JSON.stringify(payload),
      });

    // ── Načrt A (stanje tržnice KAKRŠNOKOLI je) ──
    const resA = await POST(post("10.11.20.1"));
    expect(resA.status).toBe(200);
    const planA = (await resA.json()) as Itinerary;
    expect(planA.days?.length).toBeGreaterThan(0);
    const stopsA = planA.days.flatMap((d) => d.locations);

    // Regresijska varovalka Issue #4: vsak postanek nosi oceno (polje
    // prisotno) — obogatitev je DODATNA plast, ne nadomestilo.
    for (const stop of stopsA) {
      expect("estimated_cost" in stop).toBe(true);
    }

    // DOKAZ pravilnosti proti POLJUBNEMU stanju baze: postanek nosi
    // marketplace TOČNO TAKO KO ima destinacija published izkušnje;
    // fromPrice ≡ min in count ≡ števec iz NEODVISNE poizvedbe.
    const mapA = await marketMap();
    for (const stop of stopsA) {
      const state = mapA.get(stop.destination_id);
      if (state) {
        expect(stop.marketplace).toBeDefined();
        expect(stop.marketplace!.fromPrice).toBe(state.minPrice);
        expect(stop.marketplace!.count).toBe(state.count);
      } else {
        expect(stop.marketplace ?? null).toBeNull();
      }
    }

    // ── Ustvari izkušnjo NA destinaciji, ki jo načrt DEJANSKO obišče ──
    const targetDest = stopsA[0]?.destination_id;
    expect(targetDest).toBeTruthy();
    const existing = mapA.get(targetDest);
    const myPrice = existing ? Math.max(0.5, Math.min(existing.minPrice / 2, 42)) : 42;
    const exp = await db.experience.create({
      data: {
        name: `I11 D1 POST test ${RUN}`,
        slug: `i11-d1-post-${RUN}`,
        description: "Testna izkušnja Issue #11 (POST route test).",
        category: "outdoor",
        destinationId: targetDest,
        destinationName: stopsA[0]?.destination_name,
        pricePerPerson: myPrice,
        currency: "EUR",
        durationHours: 2,
        languages: "[\"sl\"]",
        address: "Test 3",
        images: "[]",
        providerName: "I11 Test",
        status: "published",
        verified: true,
        rating: 4.0,
        reviewCount: 3,
      },
    });
    createdExperienceIds.push(exp.id);

    // ── Načrt B (determinizem motorja → isti postanki; nova izkušnja
    //    mora prijeti, ocena načrta pa ostati bitno-identična) ──
    clearMarketplaceCache();
    const resB = await POST(post("10.11.20.2"));
    expect(resB.status).toBe(200);
    const planB = (await resB.json()) as Itinerary;
    const stopsB = planB.days.flatMap((d) => d.locations);
    expect(stopsB.length).toBe(stopsA.length); // determinizem: isti obseg

    const mapB = await marketMap();
    const stateB = mapB.get(targetDest);
    expect(stateB).toBeDefined();
    let enrichedStops = 0;
    for (const stop of stopsB) {
      const state = mapB.get(stop.destination_id);
      if (state) {
        expect(stop.marketplace).toBeDefined();
        expect(stop.marketplace!.fromPrice).toBe(state.minPrice);
        expect(stop.marketplace!.count).toBe(state.count);
        if (stop.destination_id === targetDest) enrichedStops += 1;
      } else {
        expect(stop.marketplace ?? null).toBeNull();
      }
    }
    expect(enrichedStops).toBeGreaterThan(0);

    // ISKRENOST (DoD): ocena načrta je bitno-identična med A (prej) in B
    // (z novo izkušnjo) — obogatitev NE spreminja estimated_cost postankov.
    const costA = stopsA.map((s) => s.estimated_cost);
    const costB = stopsB.map((s) => s.estimated_cost);
    expect(costB).toEqual(costA);
  });
});
