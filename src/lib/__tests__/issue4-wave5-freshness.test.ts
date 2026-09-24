import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  FSQ_SNAPSHOT_DATE,
  classifyFreshness,
  freshnessLabel,
  formatDataAge,
  sourceTypeForSourceClass,
  type SourceClass,
} from "@/lib/data-freshness";
// §6: konstanta se re-izvaža iz dataset plasti (en vir resnice, vzorec
// SI_BBOX) — preverimo, da je identična modulovi.
import { FSQ_SNAPSHOT_DATE as FSQ_FROM_DATASET } from "@/lib/supply/providers/fsq/dataset";
// §6: computeMapPins (čisto jedro) mora nespremenjeno prenesti
// MapPinsDatasetInfo.snapshotDate v odgovor.
import { computeMapPins, parseMapPinsQuery } from "@/lib/map-pins";
import type { FsqPlace } from "@/lib/supply/providers/fsq/types";
import { DESTINATIONS_DATA_AS_OF } from "@/lib/stop-insights";

// ============================================================================
// ISSUE #4 VAL 5 SKLOP A (§17+§19) — ENOTEN KONCEPT SVEŽINE PODATKOV
// ============================================================================
//
// src/lib/data-freshness.ts je ČIST LISTNI modul (vzorec
// availability-note.ts / deterministic-itinerary.ts): brez omrežja, brez
// baze, brez LLM — ura VEDNO injicira klicalnik. Ti testi kodirajo
// obljube modula:
//
//   §1 KLASIFIKACIJA (§17): null → unknown; liveChecked → live
//      (short-circuit); meja fresh→stale PO RAZREDU (injicirana ura);
//      neveljaven ISO → unknown; brez ure → unknown; prihodnost → unknown;
//      HLADNA GLAVA: FSQ posnetek 2025-02-06 je ZASTAREL (posnetek ≠ živo).
//   §2 OZNAKE SL/EN za vse štiri vrednosti (snapshot — prazne prepovedane).
//   §3 formatDataAge (§19 data age): minute/ure/dnevi (slovenska ednina/
//      dvojina/množina), >30 dni → SAMO datum, neveljavno → null; obe
//      jezikovni različici.
//   §4 FSQ_SNAPSHOT_DATE stabilnost + §19 preslikava vrste vira
//      (poi→STATIC, weather→LIVE SAMO ob liveChecked, ocena→GENERATED,
//      uporabniški zapisi→USER …).
//   §5 ČISTOST MODULA (source-contract, vzorec task100): v izvorni kodi
//      NI fetch/prisma/ai-client/Date.now — modul je uvožen tudi v client.
//   §6 MAP-PINS: MapPinsDatasetInfo.snapshotDate se nespremenjeno prenaša
//      skozi čisto jedro (computeMapPins) + datasetInfoOf ga postavlja.
//   §7 i18n: blok dataSources.freshness obstaja v SL in EN z enakim
//      naborom ključev (pariteta + placeholder {date}).
// ============================================================================

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Izvorna koda BREZ komentarjev — čistost preverjamo na KODI, ne na
 *  dokumentacijskih omembah (glava modula utemeljuje, ZAKAJ nekaj NI
 *  prisotno — komentar sme besedo omeniti, klic je ta, ki šteje). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "") // blok komentarji
    .replace(/^\s*\/\/.*$/gm, ""); // vrstični komentarji
}

/** Fiksna ura (reproducibilnost — modul NIMA lastne ure, mi jo injiciramo).
 *  Namerno izbrana na časovni premici repozitorija (september 2026), da je
 *  FSQ posnetek 2025-02-06 že oddaljen > 500 dni. */
const NOW = Date.parse("2026-09-24T12:00:00Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** ISO časovni žig, star točno `ageMs` glede na NOW. */
function aged(ageMs: number): string {
  return new Date(NOW - ageMs).toISOString();
}

// ---------------------------------------------------------------------------
// §1 — KLASIFIKACIJA SVEŽINE (§17)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §17/§1: classifyFreshness — klasifikacija", () => {
  test("manjkajoč čas zajema (null/undefined) → unknown (ne ugibamo)", () => {
    expect(classifyFreshness("weather", { timestamp: null, now: NOW })).toBe("unknown");
    expect(classifyFreshness("weather", { now: NOW })).toBe("unknown");
    expect(classifyFreshness("poi", { timestamp: undefined, now: NOW })).toBe("unknown");
  });

  test("liveChecked: true → live (short-circuit — tudi brez časa in ure)", () => {
    expect(classifyFreshness("weather", { liveChecked: true })).toBe("live");
    expect(classifyFreshness("weather", { liveChecked: true, now: NOW })).toBe("live");
    expect(
      classifyFreshness("weather", { liveChecked: true, timestamp: aged(90 * DAY), now: NOW })
    ).toBe("live");
    expect(classifyFreshness("poi", { liveChecked: true, timestamp: null })).toBe("live");
  });

  test("BREZ injicirane ure → unknown (modul nima lastne ure — iskrenost)", () => {
    expect(classifyFreshness("weather", { timestamp: aged(1 * HOUR) })).toBe("unknown");
    expect(classifyFreshness("destinationContent", { timestamp: aged(1 * DAY) })).toBe(
      "unknown"
    );
  });

  test("neveljaven ISO → unknown", () => {
    expect(classifyFreshness("weather", { timestamp: "ni-iso", now: NOW })).toBe("unknown");
    // OPOMBA: "13. sep. 2026" JSC razčleni dovoljeno (v 2026-09-13) —
    // zato kot NEVELJAVEN uporabimo semantično nemogoč datum.
    expect(classifyFreshness("weather", { timestamp: "2026-13-45", now: NOW })).toBe(
      "unknown"
    );
    expect(classifyFreshness("poi", { timestamp: "", now: NOW })).toBe("unknown");
  });

  test("meja fresh→stale PO RAZREDU (injicirana ura)", () => {
    // [razred, starost-znotraj-praga, starost-čez-prag]
    const cases: Array<[SourceClass, number, number]> = [
      ["weather", 5 * HOUR, 7 * HOUR],
      ["openingHours", 29 * DAY, 31 * DAY],
      ["events", 6 * DAY, 8 * DAY],
      ["poi", 179 * DAY, 181 * DAY],
      ["transferPrices", 89 * DAY, 91 * DAY],
      ["destinationContent", 179 * DAY, 181 * DAY],
      ["supplyProduct", 23 * HOUR, 25 * HOUR],
    ];
    for (const [cls, freshAge, staleAge] of cases) {
      expect(classifyFreshness(cls, { timestamp: aged(freshAge), now: NOW }), cls).toBe(
        "fresh"
      );
      expect(classifyFreshness(cls, { timestamp: aged(staleAge), now: NOW }), cls).toBe(
        "stale"
      );
    }
  });

  test("točno na pragu → še sveže (≤), milisekunda čez → zastarelo", () => {
    // weather prag je 6 h: EXACTNO 6 h star še sveče.
    expect(classifyFreshness("weather", { timestamp: aged(6 * HOUR), now: NOW })).toBe(
      "fresh"
    );
    expect(
      classifyFreshness("weather", { timestamp: aged(6 * HOUR + 1), now: NOW })
    ).toBe("stale");
  });

  test("affiliateOffers: NI praga — vedno unknown po času (brez živih podatkov)", () => {
    expect(classifyFreshness("affiliateOffers", { timestamp: aged(1 * HOUR), now: NOW })).toBe(
      "unknown"
    );
    expect(
      classifyFreshness("affiliateOffers", { timestamp: aged(365 * DAY), now: NOW })
    ).toBe("unknown");
    // Edina pot do "live" je izrecna živa preverba (za prihodnjo uporabo).
    expect(
      classifyFreshness("affiliateOffers", { liveChecked: true, now: NOW })
    ).toBe("live");
  });

  test("čas v prihodnosti: > 1 h → unknown (neuveljavljen zapis); 30 s → sveže", () => {
    expect(classifyFreshness("weather", { timestamp: aged(-2 * HOUR), now: NOW })).toBe(
      "unknown"
    );
    expect(classifyFreshness("weather", { timestamp: aged(-30 * 1000), now: NOW })).toBe(
      "fresh"
    );
  });

  test("HLADNA GLAVA §17: FSQ posnetek 2025-02-06 → ZASTARELO (posnetek ≠ živo stanje)", () => {
    expect(classifyFreshness("poi", { timestamp: FSQ_SNAPSHOT_DATE, now: NOW })).toBe(
      "stale"
    );
    // enako za starost datumom destinacij — 11 dni → sveže (kontrola vrstice
    // na /vir-podatkov)
    expect(
      classifyFreshness("destinationContent", { timestamp: DESTINATIONS_DATA_AS_OF, now: NOW })
    ).toBe("fresh");
  });
});

// ---------------------------------------------------------------------------
// §2 — OZNAKE SL/EN (snapshot)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §17/§2: freshnessLabel — oznake SL/EN", () => {
  test("SL: sveže / zastarelo / neznano / živo (ton availability-note)", () => {
    expect(freshnessLabel("fresh", "sl")).toBe("sveže");
    expect(freshnessLabel("stale", "sl")).toBe("zastarelo");
    expect(freshnessLabel("unknown", "sl")).toBe("neznano");
    expect(freshnessLabel("live", "sl")).toBe("živo");
  });

  test("EN: fresh / stale / unknown / live", () => {
    expect(freshnessLabel("fresh", "en")).toBe("fresh");
    expect(freshnessLabel("stale", "en")).toBe("stale");
    expect(freshnessLabel("unknown", "en")).toBe("unknown");
    expect(freshnessLabel("live", "en")).toBe("live");
  });

  test("nobena oznaka ni prazna (vseh 4 × 2 jezikov)", () => {
    const values = ["fresh", "stale", "unknown", "live"] as const;
    for (const v of values) {
      for (const locale of ["sl", "en"] as const) {
        expect(freshnessLabel(v, locale).trim().length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// §3 — formatDataAge (§19 data age)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §19/§3: formatDataAge — relativna starost", () => {
  test("manj kot minuta → pravkar / just now", () => {
    expect(formatDataAge(aged(30 * 1000), NOW, "sl")).toBe("pravkar");
    expect(formatDataAge(aged(30 * 1000), NOW, "en")).toBe("just now");
  });

  test("minute — slovenska sklonjatev (ednina/dvojina/množina)", () => {
    expect(formatDataAge(aged(1 * 60 * 1000), NOW, "sl")).toBe("pred 1 minuto");
    expect(formatDataAge(aged(2 * 60 * 1000), NOW, "sl")).toBe("pred 2 minutama");
    expect(formatDataAge(aged(3 * 60 * 1000), NOW, "sl")).toBe("pred 3 minutami");
    expect(formatDataAge(aged(5 * 60 * 1000), NOW, "sl")).toBe("pred 5 minutami");
  });

  test("minute — EN oblika", () => {
    expect(formatDataAge(aged(1 * 60 * 1000), NOW, "en")).toBe("1 minute ago");
    expect(formatDataAge(aged(3 * 60 * 1000), NOW, "en")).toBe("3 minutes ago");
  });

  test("ure — slovenska sklonjatev + EN", () => {
    expect(formatDataAge(aged(1 * HOUR), NOW, "sl")).toBe("pred 1 uro");
    expect(formatDataAge(aged(2 * HOUR), NOW, "sl")).toBe("pred 2 urama");
    expect(formatDataAge(aged(5 * HOUR), NOW, "sl")).toBe("pred 5 urami");
    expect(formatDataAge(aged(1 * HOUR), NOW, "en")).toBe("1 hour ago");
    expect(formatDataAge(aged(5 * HOUR), NOW, "en")).toBe("5 hours ago");
  });

  test("dnevi — slovenska sklonjatev + EN", () => {
    expect(formatDataAge(aged(1 * DAY), NOW, "sl")).toBe("pred 1 dnevom");
    expect(formatDataAge(aged(2 * DAY), NOW, "sl")).toBe("pred 2 dnevoma");
    expect(formatDataAge(aged(3 * DAY), NOW, "sl")).toBe("pred 3 dnevi");
    expect(formatDataAge(aged(11 * DAY), NOW, "sl")).toBe("pred 11 dnevi");
    expect(formatDataAge(aged(1 * DAY), NOW, "en")).toBe("1 day ago");
    expect(formatDataAge(aged(3 * DAY), NOW, "en")).toBe("3 days ago");
  });

  test("meja 30 dni: še 'pred 30 dnevi'; 31 dni → SAMO datum YYYY-MM-DD (oba jezika)", () => {
    expect(formatDataAge(aged(30 * DAY), NOW, "sl")).toBe("pred 30 dnevi");
    expect(formatDataAge(aged(31 * DAY), NOW, "sl")).toBe("2026-08-24");
    expect(formatDataAge(aged(31 * DAY), NOW, "en")).toBe("2026-08-24");
    // FSQ posnetek (2025-02-06) je čez prag → izpis SAMO datuma posnetka.
    expect(formatDataAge(FSQ_SNAPSHOT_DATE, NOW, "sl")).toBe("2025-02-06");
    expect(formatDataAge(FSQ_SNAPSHOT_DATE, NOW, "en")).toBe("2025-02-06");
  });

  test("neveljaven vhod → null (null/undefined/pokvarjen ISO/prihodnost)", () => {
    expect(formatDataAge(null, NOW, "sl")).toBeNull();
    expect(formatDataAge(undefined, NOW, "en")).toBeNull();
    expect(formatDataAge("ni-iso", NOW, "sl")).toBeNull();
    expect(formatDataAge(aged(-2 * HOUR), NOW, "sl")).toBeNull();
  });

  test("starost FSQ posnetka glede na časovno premico repozitorija → datum posnetka", () => {
    // 2026-09-24 minus 2025-02-06 = ~596 dni → datum-only (glej zgornji test).
    const age = formatDataAge(FSQ_SNAPSHOT_DATE, NOW, "sl");
    expect(age).toBe("2025-02-06");
    expect(age).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

// ---------------------------------------------------------------------------
// §4 — FSQ_SNAPSHOT_DATE + §19 PRESLIKAVA VRSTE VIRA
// ---------------------------------------------------------------------------

describe("ISSUE #4 §17+§19/§4: konstanta posnetka + sourceTypeForSourceClass", () => {
  test("FSQ_SNAPSHOT_DATE stabilnost: '2025-02-06' (en vir resnice)", () => {
    expect(FSQ_SNAPSHOT_DATE).toBe("2025-02-06");
  });

  test("dataset plast RE-IZVAŽA istovetno konstanto (vzorec SI_BBOX)", () => {
    expect(FSQ_FROM_DATASET).toBe(FSQ_SNAPSHOT_DATE);
  });

  test("poi → STATIC (FSQ posnetek); LIVE SAMO ob liveChecked (OSM Overpass)", () => {
    expect(sourceTypeForSourceClass("poi")).toBe("STATIC");
    expect(sourceTypeForSourceClass("poi", { liveChecked: true })).toBe("LIVE");
  });

  test("weather → LIVE SAMO ob liveChecked; ocena → GENERATED; posnetek → STATIC", () => {
    expect(sourceTypeForSourceClass("weather")).toBe("STATIC");
    expect(sourceTypeForSourceClass("weather", { liveChecked: true })).toBe("LIVE");
    expect(sourceTypeForSourceClass("weather", { estimated: true })).toBe("GENERATED");
    // ocena + živa preverba hkrati nima smisla — živa preverba zmaga
    // (izrecna atestacija klicalnika)
    expect(
      sourceTypeForSourceClass("weather", { estimated: true, liveChecked: true })
    ).toBe("LIVE");
  });

  test("statični razredi → STATIC (urniki/dogodki/cene transferjev/vodnik)", () => {
    expect(sourceTypeForSourceClass("openingHours")).toBe("STATIC");
    expect(sourceTypeForSourceClass("events")).toBe("STATIC");
    expect(sourceTypeForSourceClass("transferPrices")).toBe("STATIC");
    expect(sourceTypeForSourceClass("destinationContent")).toBe("STATIC");
  });

  test("affiliateOffers/supplyProduct → PROVIDER (partnerjev vir)", () => {
    expect(sourceTypeForSourceClass("affiliateOffers")).toBe("PROVIDER");
    expect(sourceTypeForSourceClass("supplyProduct")).toBe("PROVIDER");
  });

  test("uporabniški zapisi → USER — TUDI ob liveChecked (izjava ≠ živa preverba)", () => {
    expect(sourceTypeForSourceClass("userContent")).toBe("USER");
    expect(sourceTypeForSourceClass("userContent", { liveChecked: true })).toBe("USER");
  });
});

// ---------------------------------------------------------------------------
// §5 — ČISTOST MODULA (source-contract, vzorec task100)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §17+§19/§5: čistost modula data-freshness (source-contract)", () => {
  const mod = codeOnly(source("src/lib/data-freshness.ts"));

  test("NI omrežja (fetch) in NI baze (prisma / @/lib/db)", () => {
    expect(mod).not.toMatch(/\bfetch\s*\(/);
    expect(mod).not.toContain("prisma");
    expect(mod).not.toContain("@/lib/db");
  });

  test("NI generativnega AI (ai-client / z-ai-web-dev-sdk)", () => {
    expect(mod).not.toContain("ai-client");
    expect(mod).not.toContain("z-ai-web-dev-sdk");
  });

  test("NI lastne ure (Date.now) — ura VEDNO injicirana (Date.parse je dovoljen)", () => {
    expect(mod).not.toMatch(/Date\.now\s*\(/);
    expect(mod).not.toMatch(/new Date\(\s*\)/);
  });

  test("izvaža JAVNI API modula (§17+§19)", () => {
    expect(mod).toContain("export type DataFreshness");
    expect(mod).toContain("export type SourceClass");
    expect(mod).toContain("export type SourceType");
    expect(mod).toContain("export const FSQ_SNAPSHOT_DATE");
    expect(mod).toContain("export function classifyFreshness");
    expect(mod).toContain("export function freshnessLabel");
    expect(mod).toContain("export function formatDataAge");
    expect(mod).toContain("export function sourceTypeForSourceClass");
  });
});

// ---------------------------------------------------------------------------
// §6 — MAP-PINS: snapshotDate v MapPinsDatasetInfo
// ---------------------------------------------------------------------------

/** Sintetični kraj (vzorec map-pins.test.ts — brez datotečnega sistema). */
function synthPlace(id: string): FsqPlace {
  return {
    fsq_id: id,
    name: `Kraj ${id}`,
    latitude: 46.05,
    longitude: 14.51,
    categories: [{ label: "Dining and Drinking > Restaurant" }],
  };
}

describe("ISSUE #4 §17/§6: MapPinsDatasetInfo.snapshotDate", () => {
  test("computeMapPins nespremenjeno prenaša snapshotDate v odgovor", () => {
    const parsed = parseMapPinsQuery({
      bbox: "45.8,14.3,46.3,14.8",
      zoom: "12",
      cats: null,
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const r = computeMapPins([synthPlace("syn-1")], parsed.query, {
      installed: true,
      places: 1,
      lastUpdated: null,
      snapshotDate: FSQ_SNAPSHOT_DATE,
    });
    expect(r.dataset.snapshotDate).toBe(FSQ_SNAPSHOT_DATE);
    expect(r.dataset.snapshotDate).toBe("2025-02-06");
  });

  test("source-contract: datasetInfoOf postavlja snapshotDate iz konstante", () => {
    // datasetInfoOf je privatna — preverjamo navzkrižno (vzorec task85):
    // plast UVAŽA konstanto in IZPOSTAVLJA polje snapshotDate.
    const src = source("src/lib/map-pins.ts");
    expect(src).toContain("snapshotDate");
    expect(src).toContain("FSQ_SNAPSHOT_DATE");
    // dvojni pomen je dokumentiran: lastUpdated (osvežitev namestitve)
    // ≠ snapshotDate (starost vira).
    expect(src).toContain("posnetek VIRA");
  });
});

// ---------------------------------------------------------------------------
// §7 — i18n: blok dataSources.freshness (SL + EN pariteta)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §17+§19/§7: i18n blok dataSources.freshness (SL/EN)", () => {
  const sl = JSON.parse(source("src/i18n/messages/sl.json")).dataSources.freshness;
  const en = JSON.parse(source("src/i18n/messages/en.json")).dataSources.freshness;

  /** Plošča razširitev (vzorec task71). */
  function flat(obj: unknown, prefix = ""): Record<string, string> {
    const out: Record<string, string> = {};
    if (typeof obj !== "object" || obj === null) return out;
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === "object" && value !== null) {
        Object.assign(out, flat(value, path));
      } else {
        out[path] = String(value);
      }
    }
    return out;
  }

  test("SL in EN imata IDENTIČEN nabor ploščih ključev (16)", () => {
    const slKeys = Object.keys(flat(sl)).sort();
    const enKeys = Object.keys(flat(en)).sort();
    expect(slKeys).toEqual(enKeys);
    expect(slKeys).toHaveLength(16);
  });

  test("nobeno sporočilo ni prazno niz v obeh jezikih", () => {
    for (const [k, v] of Object.entries(flat(sl))) {
      expect(v.trim().length, `SL "${k}" prazen`).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(flat(en))) {
      expect(v.trim().length, `EN "${k}" prazen`).toBeGreaterThan(0);
    }
  });

  test("placeholder {date} je prisoten v obeh jezikih (disclaimer + destinationsDetail)", () => {
    const ph = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort();
    expect(ph(sl.disclaimer)).toEqual(["{date}"]);
    expect(ph(en.disclaimer)).toEqual(["{date}"]);
    expect(ph(sl.destinationsDetail)).toEqual(["{date}"]);
    expect(ph(en.destinationsDetail)).toEqual(["{date}"]);
  });

  test("source-contract: /vir-podatkov izpelje vrstice IZ modula (ne ročno)", () => {
    const page = source("src/app/vir-podatkov/page.tsx");
    expect(page).toContain('from "@/lib/data-freshness"');
    expect(page).toContain("classifyFreshness");
    expect(page).toContain("freshnessLabel");
    expect(page).toContain("sourceTypeForSourceClass");
    expect(page).toContain("formatDataAge");
    expect(page).toContain("FSQ_SNAPSHOT_DATE");
  });

  test("source-contract: stop-insights klasificira destinationContent + izpise vrstico", () => {
    const comp = source("src/components/stop-insights.tsx");
    expect(comp).toContain('from "@/lib/data-freshness"');
    expect(comp).toContain('classifyFreshness("destinationContent"');
    expect(comp).toContain("freshnessLabel");
    // as-of datum iz ENEGA vira (stop-insights.ts — ne lokalna kopija)
    expect(comp).toContain("DESTINATIONS_DATA_AS_OF");
    // vreme v itinererju NIMA časovnega žiga → vrstice o starosti vremena
    // NI (iskrenost §17: ne izmišljujemo)
    expect(comp).not.toMatch(/classifyFreshness\("weather"/);
  });
});
