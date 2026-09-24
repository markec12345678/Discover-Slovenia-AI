import { describe, expect, test } from "bun:test";
import {
  nowInSlovenia,
  openingStatusAt,
  parseOpeningHours,
} from "@/lib/opening-hours";
import {
  dayCostSummary,
  totalUnknownCostStops,
} from "@/lib/cost-truth";
import {
  buildAIUsageRow,
  estimateCostEur,
} from "@/lib/ai-usage";
import { showsUnknownPriceChip } from "@/lib/supply/price-display";

// ============================================================================
// ISSUE #4 §9 — ODPIRALNI ČASI: parser + status OPEN/CLOSED/UNKNOWN
// Dispciplina: delno razbiranje je NEPOŠTENO (napačen CLOSED) → vse
// nepodprte sintakse morajo pasti v UNKNOWN, ne v napako.
// ============================================================================

describe("Issue4 §9 — parseOpeningHours (preprosta podmnožica OSM)", () => {
  test("tipičen slovenski zapis se razbere", () => {
    const parsed = parseOpeningHours("Mo-Fr 08:00-17:00; Sa 09:00-13:00; Su off");
    expect(parsed).not.toBeNull();
    expect(parsed!.alwaysOpen).toBe(false);
    expect(parsed!.rules.length).toBe(3);
  });

  test("24/7", () => {
    expect(parseOpeningHours("24/7")!.alwaysOpen).toBe(true);
  });

  test("več časovnih okvirov na dan (pavza)", () => {
    const parsed = parseOpeningHours("Mo-Fr 08:00-12:00,14:00-18:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[0].ranges.length).toBe(2);
  });

  test("dnevi z vejico", () => {
    const parsed = parseOpeningHours("Mo,Tu,We 08:00-16:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[0].days.sort()).toEqual([1, 2, 3]);
  });

  test("razpon čez nedeljo (Sa-Su)", () => {
    const parsed = parseOpeningHours("Sa-Su 09:00-13:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[0].days.sort()).toEqual([0, 6]);
  });

  test("čas brez dni = vsak dan", () => {
    const parsed = parseOpeningHours("08:00-17:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[0].days.length).toBe(7);
  });

  test("konec 24:00 je veljaven (celodnevno)", () => {
    expect(parseOpeningHours("00:00-24:00")).not.toBeNull();
  });

  test("čez-nočni razpon (konec < začetek)", () => {
    const parsed = parseOpeningHours("Mo-Fr 10:00-02:00");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[0].ranges[0].overnight).toBe(true);
  });

  test("Su closed (beseda namesto off)", () => {
    const parsed = parseOpeningHours("Mo-Sa 08:00-20:00; Su closed");
    expect(parsed).not.toBeNull();
    expect(parsed!.rules[1].closed).toBe(true);
  });

  // ── NEPODPRTE sintakse → null (→ UNKNOWN) ──
  test.each([
    ["PH off (prazniki — nimamo koledarja)"],
    ["Mo-Fr sunrise-sunset"],
    ["Jan-Mar 10:00-17:00 (mesečno obdobje)"],
    ["Sa[1] 10:00-14:00 (prvi sobota)"],
    ["Mo-Fr 08:00+ (odprt konec)"],
    ["Mo-Fr (dnevi brez časa)"],
    ["Mo-Fr 08:00-17:00 arbitrary-token"],
    ["08:00-08:00 (degeneriran)"],
    ["Mo-Fr 25:00-26:00 (nad 24 h)"],
    [""],
    ["   "],
  ])("nepodprto %s → null (honest UNKNOWN)", (raw) => {
    expect(parseOpeningHours(raw)).toBeNull();
  });
});

describe("Issue4 §9 — openingStatusAt", () => {
  // Torek 10:30 (2 = tor, 630 min)
  const TUE_1030 = { weekday: 2, minutes: 630 };
  // Nedelja 10:30
  const SUN_1030 = { weekday: 0, minutes: 630 };
  // Ponedeljek 01:00 (razliva nedeljske čez-nočne)
  const MON_0100 = { weekday: 1, minutes: 60 };

  test("znotraj urnika → OPEN + odprto do", () => {
    const r = openingStatusAt("Mo-Fr 08:00-17:00", TUE_1030);
    expect(r.status).toBe("OPEN");
    expect(r.detail.sl).toContain("17:00");
  });

  test("zunaj urnika v delovnem dnevu → CLOSED + naslednja otvoritev", () => {
    const r = openingStatusAt("Mo-Fr 08:00-17:00", { weekday: 2, minutes: 1200 });
    expect(r.status).toBe("CLOSED");
    expect(r.detail.sl).toContain("sre"); // naslednji delovni dan = sreda
    expect(r.detail.sl).toContain("08:00");
  });

  test("dan izven pravil (nedelja) → CLOSED z otvoritvijo v ponedeljek", () => {
    const r = openingStatusAt("Mo-Fr 08:00-17:00", SUN_1030);
    expect(r.status).toBe("CLOSED");
    expect(r.detail.sl).toContain("pon");
  });

  test("Su off → nedelja CLOSED, brez otvoritve dneva", () => {
    const r = openingStatusAt("Mo-Sa 08:00-20:00; Su off", SUN_1030);
    expect(r.status).toBe("CLOSED");
    // naslednja otvoritev = ponedeljek 08:00
    expect(r.detail.sl).toContain("pon");
  });

  test("čez-nočni razpon: ponoči še odprto (razliva prejšnjega dne)", () => {
    // "Mo-Sa 10:00-02:00" — v ponedeljek 01:00 je odprto (razliva NEDELJE?
    // Ne: razliva sobote 6 → nedelja 0. Ponedeljek 01:00 → razliva NEDELJE?
    // Pravilo pokriva Mo-Sa, torej razliva So→Ne, ne Ne→Po.
    // Uporabimo pravilo, ki pokriva tudi nedeljo:
    const r = openingStatusAt("Mo-Su 20:00-02:00", MON_0100);
    expect(r.status).toBe("OPEN");
    expect(r.detail.sl).toContain("02:00");
  });

  test("čez-nočni razpon: zjutraj ISTI dan pred začetkom → CLOSED", () => {
    // ponedeljek 05:00, odprto od 20:00 do 02:00 → zaprto (odpre 20:00)
    const r = openingStatusAt("Mo-Su 20:00-02:00", { weekday: 1, minutes: 300 });
    expect(r.status).toBe("CLOSED");
    expect(r.detail.sl).toContain("20:00");
  });

  test("pavza med okviri istega dne → CLOSED", () => {
    // torek 13:00 med 08-12 in 14-18
    const r = openingStatusAt("Mo-Fr 08:00-12:00,14:00-18:00", {
      weekday: 2,
      minutes: 780,
    });
    expect(r.status).toBe("CLOSED");
    expect(r.detail.sl).toContain("14:00");
  });

  test("24/7 → OPEN dobesedno", () => {
    const r = openingStatusAt("24/7", TUE_1030);
    expect(r.status).toBe("OPEN");
    expect(r.detail.sl).toBe("odprto 24/7");
  });

  test("manjkajoč niz → UNKNOWN (ni objavljeno)", () => {
    const r = openingStatusAt(undefined, TUE_1030);
    expect(r.status).toBe("UNKNOWN");
    expect(r.detail.sl).toContain("niso objavljeni");
  });

  test("zapletena sintaksa → UNKNOWN (preveri pri ponudniku)", () => {
    const r = openingStatusAt("Mo-Fr 08:00-dusk; PH off", TUE_1030);
    expect(r.status).toBe("UNKNOWN");
    expect(r.detail.sl).toContain("zapleten");
  });

  test("surov niz se ohrani (zero feature loss)", () => {
    const raw = "Mo-Fr 08:00-17:00";
    const r = openingStatusAt(raw, TUE_1030);
    expect(r.raw).toBe(raw);
  });
});

describe("Issue4 §9 — nowInSlovenia (DST-varna stenska ura)", () => {
  test("vrne veljaven trenutek (0-6 / 0-1439)", () => {
    const m = nowInSlovenia();
    expect(m.weekday).toBeGreaterThanOrEqual(0);
    expect(m.weekday).toBeLessThanOrEqual(6);
    expect(m.minutes).toBeGreaterThanOrEqual(0);
    expect(m.minutes).toBeLessThanOrEqual(1439);
  });
});

// ============================================================================
// ISSUE #4 §6 — CENOVNA RESNICA: NaN ≠ 0
// ============================================================================

describe("Issue4 §6 — dayCostSummary (neznana cena NI strošek 0)", () => {
  test("NaN postanki se ne seštejejo kot 0", () => {
    const s = dayCostSummary([
      { estimated_cost: 20 } as never,
      { estimated_cost: Number.NaN } as never,
      { estimated_cost: 15 } as never,
    ]);
    expect(s.known).toBe(35);
    expect(s.unknownCount).toBe(1);
  });

  test("0 iz odprtih virov ostane pošteno 0 (NI neznano)", () => {
    const s = dayCostSummary([{ estimated_cost: 0 } as never]);
    expect(s.known).toBe(0);
    expect(s.unknownCount).toBe(0);
  });

  test("manjkajoče/ne-številsko → neznano", () => {
    const s = dayCostSummary([
      { estimated_cost: undefined } as never,
      {} as never,
    ]);
    expect(s.unknownCount).toBe(2);
    expect(s.known).toBe(0);
  });

  test("totalUnknownCostStops združi čez dneve", () => {
    const total = totalUnknownCostStops([
      { locations: [{ estimated_cost: Number.NaN } as never] },
      { locations: [{ estimated_cost: 5 } as never, { estimated_cost: Number.NaN } as never] },
    ] as never);
    expect(total).toBe(2);
  });
});

describe("Issue4 §6 — showsUnknownPriceChip (prikaz po klasifikaciji)", () => {
  test("cena obstaja → nikoli žeton", () => {
    expect(
      showsUnknownPriceChip({
        provider: "viator",
        price: { amount: 55, currency: "EUR", unit: "per_person" },
      })
    ).toBe(false);
  });

  test("brez cene + komercialni vir (FROM_PRICE) → žeton (iskreno, kot journey-planner)", () => {
    expect(
      showsUnknownPriceChip({ provider: "getyourguide", price: undefined })
    ).toBe(true);
    expect(showsUnknownPriceChip({ provider: "own", price: undefined })).toBe(
      true
    );
  });

  test("brez cene + NOT_SUPPORTED (osm) → brez žetona (tišina je iskrena)", () => {
    expect(showsUnknownPriceChip({ provider: "osm", price: undefined })).toBe(
      false
    );
  });

  test("neznan slug → brez žetona (fail-closed na obstoječi prikaz)", () => {
    expect(
      showsUnknownPriceChip({
        provider: "nepoznan-vir" as never,
        price: undefined,
      })
    ).toBe(false);
  });
});

// ============================================================================
// ISSUE #4 §11 — AI METERING (čisti deli)
// ============================================================================

describe("Issue4 §11 — buildAIUsageRow / estimateCostEur", () => {
  test("vrstica nosi vse stolpce sheme", () => {
    const row = buildAIUsageRow({
      feature: "itinerary",
      source: "openrouter",
      success: true,
      responseTimeMs: 61_234.7,
      model: "nex-agi/nex-n2.5-pro:free",
      usage: { promptTokens: 1_200, completionTokens: 3_400 },
      metadata: { attempts: ["openrouter:nex-agi/nex-n2.5-pro:free:ok"] },
    });
    expect(row.feature).toBe("itinerary");
    expect(row.source).toBe("openrouter");
    expect(row.success).toBe(true);
    expect(row.responseTime).toBe(61_235);
    expect(row.costEur).toBe(0);
    expect(row.userId).toBeNull();
    expect(row.sessionId).toBeNull();
    const meta = JSON.parse(row.metadata as string);
    expect(meta.model).toBe("nex-agi/nex-n2.5-pro:free");
    expect(meta.tokens.completionTokens).toBe(3_400);
    expect(meta.attempts).toHaveLength(1);
  });

  test(":free viri → strošek 0 (iskrenost: ne izmišljujemo)", () => {
    expect(
      estimateCostEur("openrouter", "nex-agi/nex-n2.5-pro:free", {
        promptTokens: 9_999_999,
        completionTokens: 9_999_999,
      })
    ).toBe(0);
  });

  test("brez žetonov/modela → 0 (ni podatka, ni stroška)", () => {
    expect(estimateCostEur("gemini")).toBe(0);
    expect(estimateCostEur("z-ai-sdk", undefined, { promptTokens: 5 })).toBe(0);
  });

  test("fallback vrstica: source=fallback, success=true (deterministični motor je služil)", () => {
    const row = buildAIUsageRow({
      feature: "smart-search",
      source: "fallback",
      success: true,
      responseTimeMs: 12_400,
    });
    expect(row.source).toBe("fallback");
    expect(row.success).toBe(true);
    expect(row.costEur).toBe(0);
  });
});

// ============================================================================
// ISSUE #4 §11 — ADMIN AGREGACIJA (čista plast ai-usage-aggregate.ts)
// ============================================================================

import {
  aggregateAiUsage,
  parseUsageMetadata,
  usageFailureRows,
} from "@/lib/ai-usage-aggregate";

describe("Issue4 §11 — aggregateAiUsage (admin bralnik)", () => {
  const rows = [
    {
      feature: "chat",
      source: "z-ai-sdk",
      success: true,
      responseTime: 2_000,
      costEur: 0,
      metadata: JSON.stringify({
        model: "x",
        tokens: { promptTokens: 100, completionTokens: 40 },
        attempts: ["openrouter:not-configured", "z-ai-sdk:ok"],
      }),
      createdAt: new Date(),
    },
    {
      feature: "chat",
      source: "none",
      success: false,
      responseTime: 45_000,
      costEur: 0,
      metadata: JSON.stringify({
        attempts: ["openrouter:timeout", "gemini:error", "z-ai-sdk:error"],
      }),
      createdAt: new Date(),
    },
    {
      feature: "search",
      source: "fallback",
      success: true,
      responseTime: 5,
      costEur: 0,
      metadata: null,
      createdAt: new Date(),
    },
  ];

  test("agregira po funkciji: klici, uspešnost, Ø čas, žetoni, viri", () => {
    const agg = aggregateAiUsage(rows);
    expect(agg).toHaveLength(2);
    const chat = agg.find((a) => a.feature === "chat")!;
    expect(chat.calls).toBe(2);
    expect(chat.successRate).toBe(0.5);
    expect(chat.avgResponseTimeMs).toBe(23_500);
    expect(chat.promptTokens).toBe(100);
    expect(chat.completionTokens).toBe(40);
    expect(chat.bySource.map((s) => s.source).sort()).toEqual(["none", "z-ai-sdk"]);
    const search = agg.find((a) => a.feature === "search")!;
    expect(search.calls).toBe(1);
    expect(search.successRate).toBe(1);
    expect(search.bySource[0].source).toBe("fallback");
  });

  test("razvrsti po številu klicev (največ prvi)", () => {
    expect(aggregateAiUsage(rows)[0].feature).toBe("chat");
  });

  test("parseUsageMetadata — pokvarjen JSON ne vrže (iskrena odsotnost)", () => {
    expect(parseUsageMetadata("{ni json")).toEqual({});
    expect(parseUsageMetadata(null)).toEqual({});
    const meta = parseUsageMetadata(
      JSON.stringify({ model: "m", tokens: { promptTokens: 5 }, attempts: ["a:b", 7] })
    );
    expect(meta.model).toBe("m");
    expect(meta.promptTokens).toBe(5);
    expect(meta.attempts).toEqual(["a:b"]); // ne-strt IZPUŠČEN
  });

  test("usageFailureRows — retry vidnost (poskusi verige)", () => {
    const failures = usageFailureRows([rows[1]]);
    expect(failures).toHaveLength(1);
    expect(failures[0].attempts).toEqual([
      "openrouter:timeout",
      "gemini:error",
      "z-ai-sdk:error",
    ]);
    expect(failures[0].model).toBeUndefined();
  });
});
