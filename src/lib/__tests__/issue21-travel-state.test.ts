// ============================================================================
// ISSUE #21 — LIVE TRIP NAVIGATOR: TRAVEL STATE (1.159.0)
// ============================================================================
// Pokriva ČISTO plat src/lib/journey/travel-state.ts:
//  - geo veljavnost cilja + razdalja v metrih (isti haversine kanon);
//  - prag prihoda glede na natančnost (clamp) + NEAR območje;
//  - klasifikacijo prihoda: far/near/arrived z HYSTEREZO (šum ne utripa)
//    in MIN. ČASOVNO STABILNOSTJO (prihod mora vzdržati);
//  - TRAVEL status (upcoming/active/navigating/near_destination/arrived/
//    completed/skipped) — IZKLJUČNO iz travel vhodov, NIKOLI iz rezervacij;
//  - starost fiksacije (zastarelost);
//  - source contract: modul NE uvaža rezervacijskih modulov (ločitev dveh
//    resnic §3) + popolne dvojezične oznake.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ACCURACY_CLASS_LABELS,
  ACCURACY_THRESHOLDS,
  accuracyClassOf,
  ARRIVAL_LABELS,
  arriveRadiusM,
  classifyArrival,
  DEFAULT_ARRIVAL_CONFIG,
  distanceToStopM,
  hasValidStopGeo,
  isPositionStale,
  positionAgeMs,
  resolveTravelStatus,
  STALE_POSITION_MS,
  TRAVEL_LABELS,
  type ArrivalContext,
  type TravelStatus,
} from "@/lib/journey/travel-state";

// ---------------------------------------------------------------------------
// Geometrija: Δφ 0.009° ≈ 1001 m, 0.0027° ≈ 300 m, 0.002° ≈ 222 m,
// 0.0009° ≈ 100 m, 0.0004° ≈ 44 m (R = 6371 km — isti vir kot geo-corridor).
// ---------------------------------------------------------------------------

const STOP = { lat: 46.009, lng: 14.0 };
const AT = (dLat: number, ts = 1_000_000) => ({
  lat: 46.009 - dLat,
  lng: 14.0,
  timestamp: ts,
});
const NOW = 2_000_000;

// ---------------------------------------------------------------------------
// 1 — GEO VELJAVNOST CILJA (Geo data contract §4)
// ---------------------------------------------------------------------------

describe("ISSUE #21: hasValidStopGeo (veljavnost geo cilja)", () => {
  test("① veljavne koordinate → true", () => {
    expect(hasValidStopGeo({ lat: 46.1, lng: 14.1 })).toBe(true);
    expect(hasValidStopGeo({ lat: -45.9, lng: -13.5 })).toBe(true);
  });
  test("② manjkajoča/NaN/poljubna → false", () => {
    expect(hasValidStopGeo(null)).toBe(false);
    expect(hasValidStopGeo(undefined)).toBe(false);
    expect(hasValidStopGeo({})).toBe(false);
    expect(hasValidStopGeo({ lat: Number.NaN, lng: 14 })).toBe(false);
    expect(hasValidStopGeo({ lat: 46, lng: Number.POSITIVE_INFINITY })).toBe(false);
  });
  test("③ null island (0,0) = manjkajoče (sentinel projekta) → false", () => {
    expect(hasValidStopGeo({ lat: 0, lng: 0 })).toBe(false);
  });
  test("④ izven meja ±90/±180 → false", () => {
    expect(hasValidStopGeo({ lat: 91, lng: 14 })).toBe(false);
    expect(hasValidStopGeo({ lat: 46, lng: 181 })).toBe(false);
  });
});

describe("ISSUE #21: distanceToStopM (razdalja v metrih)", () => {
  test("① Δφ 0.009° ≈ 1001 m (isto zemljepisno dolžino)", () => {
    expect(distanceToStopM(AT(0.009), STOP)).toBe(1001);
  });
  test("② brez položaja ali brez veljavnega geo cilja → null (ne izmišljujemo)", () => {
    expect(distanceToStopM(null, STOP)).toBeNull();
    expect(distanceToStopM(AT(0.009), null)).toBeNull();
    expect(distanceToStopM(AT(0.009), { lat: 0, lng: 0 })).toBeNull();
    expect(distanceToStopM(AT(0.009), { lat: Number.NaN, lng: 1 })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 2 — PRAG PRIHODA (natančnost → radij, clamp)
// ---------------------------------------------------------------------------

describe("ISSUE #21: arriveRadiusM (prag glede na natančnost)", () => {
  test("① brez natančnosti → osnovni prag 60 m", () => {
    expect(arriveRadiusM(undefined)).toBe(DEFAULT_ARRIVAL_CONFIG.arriveBaseM);
    expect(arriveRadiusM(Number.NaN)).toBe(60);
    expect(arriveRadiusM(-5)).toBe(60);
  });
  test("② natančnost širi prag: 50 m → 60 (tla), 60 m → 70, 100 m → 110", () => {
    expect(arriveRadiusM(50)).toBe(60); // 50+10=60 < tla? enako → 60
    expect(arriveRadiusM(60)).toBe(70);
    expect(arriveRadiusM(100)).toBe(110);
  });
  test("③ slaba fiksacija (800 m) NE razširi preko stropa 150 m", () => {
    expect(arriveRadiusM(800)).toBe(DEFAULT_ARRIVAL_CONFIG.arriveMaxM);
  });
});

// ---------------------------------------------------------------------------
// 3 — KLASIFIKACIJA PRIHODA (hystereza + stabilnost — §7)
// ---------------------------------------------------------------------------

describe("ISSUE #21: classifyArrival — osnovna stanja", () => {
  test("① brez položaja → unknown + kontekst null (fail-closed)", () => {
    const r = classifyArrival("k", { position: null, stop: STOP }, null, NOW);
    expect(r.state).toBe("unknown");
    expect(r.distanceM).toBeNull();
    expect(r.context).toBeNull();
  });
  test("② cilj brez veljavnega geo → unknown (geo contract §4)", () => {
    const r = classifyArrival("k", { position: AT(0.001), stop: { lat: 0, lng: 0 } }, null, NOW);
    expect(r.state).toBe("unknown");
    expect(r.context).toBeNull();
  });
  test("③ 1001 m → far; razdalja in radij se vrneita", () => {
    const r = classifyArrival("k", { position: AT(0.009), stop: STOP }, null, NOW);
    expect(r.state).toBe("far");
    expect(r.distanceM).toBe(1001);
    expect(r.arriveRadiusM).toBe(60);
    expect(r.stable).toBe(false);
  });
  test("④ 222 m → near (znotraj NEAR 300)", () => {
    expect(classifyArrival("k", { position: AT(0.002), stop: STOP }, null, NOW).state).toBe("near");
  });
  test("⑤ točno 300 m → še near (meja vključujoča)", () => {
    expect(classifyArrival("k", { position: AT(0.0027), stop: STOP }, null, NOW).state).toBe("near");
  });
  test("⑥ 44 m → arrived (znotraj praga 60)", () => {
    const r = classifyArrival("k", { position: AT(0.0004), stop: STOP }, null, NOW);
    expect(r.state).toBe("arrived");
  });
  test("⑦ natančnost 120 m razširi prag na 130 → 100 m je arrived", () => {
    const pos = { ...AT(0.0009), accuracyM: 120 };
    const r = classifyArrival("k", { position: pos, stop: STOP }, null, NOW);
    expect(r.arriveRadiusM).toBe(130);
    expect(r.state).toBe("arrived");
  });
});

describe("ISSUE #21: classifyArrival — HYSTEREZA (GPS šum ne utripa stanj)", () => {
  test("① arrived ob 100 m (znotraj 60+75=135) ZDRŽI arrived", () => {
    const prev: ArrivalContext = { key: "k", state: "arrived", sinceMs: NOW - 30_000 };
    const r = classifyArrival("k", { position: AT(0.0009), stop: STOP }, prev, NOW);
    expect(r.state).toBe("arrived");
  });
  test("② arrived ob 145 m (> 135) PADA na near", () => {
    const prev: ArrivalContext = { key: "k", state: "arrived", sinceMs: NOW - 30_000 };
    const r = classifyArrival("k", { position: AT(0.0013), stop: STOP }, prev, NOW);
    expect(r.state).toBe("near");
  });
  test("③ near ob 320 m (znotraj 300+75=375) ZDRŽI near", () => {
    const prev: ArrivalContext = { key: "k", state: "near", sinceMs: NOW - 30_000 };
    // Δφ za ~320 m: 0.00288° ≈ 321 m
    const r = classifyArrival("k", { position: AT(0.00288), stop: STOP }, prev, NOW);
    expect(r.state).toBe("near");
  });
  test("④ near ob 400 m (> 375) PADA na far", () => {
    const prev: ArrivalContext = { key: "k", state: "near", sinceMs: NOW - 30_000 };
    const r = classifyArrival("k", { position: AT(0.0036), stop: STOP }, prev, NOW);
    expect(r.state).toBe("far");
  });
  test("⑤ vzpon stanj je TAKOJŠEN (far → arrived brez zamika)", () => {
    const prev: ArrivalContext = { key: "k", state: "far", sinceMs: NOW - 30_000 };
    const r = classifyArrival("k", { position: AT(0.0004), stop: STOP }, prev, NOW);
    expect(r.state).toBe("arrived");
  });
});

describe("ISSUE #21: classifyArrival — stabilnost + kontekst", () => {
  test("① svež arrived NI stabilen (min. 8 s šteje od sinceMs)", () => {
    const r = classifyArrival("k", { position: AT(0.0004), stop: STOP }, null, NOW);
    expect(r.state).toBe("arrived");
    expect(r.stable).toBe(false);
    expect(r.context?.sinceMs).toBe(NOW);
  });
  test("② arrived, ki vzdrži ≥ 8 s, JE stabilen", () => {
    const prev: ArrivalContext = {
      key: "k",
      state: "arrived",
      sinceMs: NOW - DEFAULT_ARRIVAL_CONFIG.minStableMs,
    };
    const r = classifyArrival("k", { position: AT(0.0004), stop: STOP }, prev, NOW);
    expect(r.state).toBe("arrived");
    expect(r.stable).toBe(true);
  });
  test("③ ista stanja ohranijo sinceMs (kontekst se ne resettira)", () => {
    const prev: ArrivalContext = { key: "k", state: "near", sinceMs: NOW - 50_000 };
    const r = classifyArrival("k", { position: AT(0.002), stop: STOP }, prev, NOW);
    expect(r.context?.sinceMs).toBe(NOW - 50_000);
  });
  test("④ SPREMEMBA postanka (key) resetira kontekst — sveža klasifikacija", () => {
    const prev: ArrivalContext = { key: "DRUG", state: "arrived", sinceMs: NOW - 50_000 };
    const r = classifyArrival("k", { position: AT(0.009), stop: STOP }, prev, NOW);
    expect(r.state).toBe("far"); // prispe iz arrived na 1001 m BREZ histereze
    expect(r.context?.key).toBe("k");
  });
  test("⑤ kontekst nosi key/state/sinceMs/lastDistanceM", () => {
    const r = classifyArrival("k", { position: AT(0.002), stop: STOP }, null, NOW);
    expect(r.context).toEqual({
      key: "k",
      state: "near",
      sinceMs: NOW,
      lastDistanceM: 222,
    });
  });
});

// ---------------------------------------------------------------------------
// 4 — TRAVEL STATUS (ločitev od rezervacij §3)
// ---------------------------------------------------------------------------

describe("ISSUE #21: resolveTravelStatus (7 stanj — čisti travel vhodi)", () => {
  test("① doneAt → completed (uporabnikov klik ima prednost)", () => {
    expect(resolveTravelStatus({ isNext: true, doneAt: "2026-10-01T10:00:00Z" })).toBe("completed");
  });
  test("② skippedAt → skipped (izrecna uporabnikova izbira)", () => {
    expect(resolveTravelStatus({ isNext: true, skippedAt: "2026-10-01T10:00:00Z" })).toBe("skipped");
  });
  test("③ done pred preskokom (ena resnica na postanek)", () => {
    expect(
      resolveTravelStatus({
        isNext: true,
        doneAt: "2026-10-01T10:00:00Z",
        skippedAt: "2026-10-01T11:00:00Z",
      })
    ).toBe("completed");
  });
  test("④ !isNext → upcoming", () => {
    expect(resolveTravelStatus({ isNext: false })).toBe("upcoming");
  });
  test("⑤ naslednji brez GPS konteksta → active (ne lažemo o bližini)", () => {
    expect(resolveTravelStatus({ isNext: true, arrival: null })).toBe("active");
    expect(
      resolveTravelStatus({ isNext: true, arrival: { state: "unknown", stable: false } })
    ).toBe("active");
  });
  test("⑥ far → navigating", () => {
    expect(resolveTravelStatus({ isNext: true, arrival: { state: "far", stable: false } })).toBe(
      "navigating"
    );
  });
  test("⑦ near → near_destination", () => {
    expect(resolveTravelStatus({ isNext: true, arrival: { state: "near", stable: false } })).toBe(
      "near_destination"
    );
  });
  test("⑧ arrived BREZ stabilnosti → near_destination (nikoli utripajoč prihod)", () => {
    expect(resolveTravelStatus({ isNext: true, arrival: { state: "arrived", stable: false } })).toBe(
      "near_destination"
    );
  });
  test("⑨ arrived + stabilen → arrived", () => {
    expect(resolveTravelStatus({ isNext: true, arrival: { state: "arrived", stable: true } })).toBe(
      "arrived"
    );
  });
});

// ---------------------------------------------------------------------------
// 5 — STAROST FIKSACIJE (§6: zastarela ni sveža)
// ---------------------------------------------------------------------------

describe("ISSUE #21: starost fiksacije", () => {
  test("① age je maks(0, now−ts) — nikoli negativen", () => {
    expect(positionAgeMs(NOW - 30_000, NOW)).toBe(30_000);
    expect(positionAgeMs(NOW + 5_000, NOW)).toBe(0);
  });
  test("② zastarelost na meji 60 s (vključujoče)", () => {
    expect(isPositionStale(NOW - STALE_POSITION_MS, NOW)).toBe(true);
    expect(isPositionStale(NOW - STALE_POSITION_MS + 1, NOW)).toBe(false);
  });
  test("③ lasten prag", () => {
    expect(isPositionStale(NOW - 120_000, NOW, 60_000)).toBe(true);
    expect(isPositionStale(NOW - 30_000, NOW, 60_000)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 5b — RAZRED NATANČNOSTI (§6, 1.161.0)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §6: accuracyClassOf — razred natančnosti fiksacije", () => {
  test("① pragi sta vključujoči meji (50/200 m)", () => {
    expect(ACCURACY_THRESHOLDS.highMaxM).toBe(50);
    expect(ACCURACY_THRESHOLDS.mediumMaxM).toBe(200);
    expect(accuracyClassOf(50)).toBe("high");
    expect(accuracyClassOf(50.01)).toBe("medium");
    expect(accuracyClassOf(200)).toBe("medium");
    expect(accuracyClassOf(200.01)).toBe("low");
  });

  test("② ni natančnosti / neveljavna → null (ne izmišljujemo razreda)", () => {
    expect(accuracyClassOf(undefined)).toBe(null);
    expect(accuracyClassOf(null)).toBe(null);
    expect(accuracyClassOf(Number.NaN)).toBe(null);
    expect(accuracyClassOf(-5)).toBe(null);
  });

  test("③ skladnost z pragom prihoda: low natančnost NE razširi praga preko stropa", () => {
    // natančnost 800 m → razred low, a prag prihoda ostane pri stropu 150 m
    expect(accuracyClassOf(800)).toBe("low");
    expect(arriveRadiusM(800)).toBe(DEFAULT_ARRIVAL_CONFIG.arriveMaxM);
  });

  test("④ oznake razredov so dvojezične in nenastete", () => {
    for (const cls of ["high", "medium", "low"] as const) {
      expect(ACCURACY_CLASS_LABELS[cls].sl.length).toBeGreaterThan(0);
      expect(ACCURACY_CLASS_LABELS[cls].en.length).toBeGreaterThan(0);
      expect(ACCURACY_CLASS_LABELS[cls].sl).not.toBe(ACCURACY_CLASS_LABELS[cls].en);
    }
  });
});

// ---------------------------------------------------------------------------
// 6 — OZNAKE (dvojezične, popolne)
// ---------------------------------------------------------------------------

describe("ISSUE #21: oznake", () => {
  test("① TRAVEL_LABELS pokrijejo VSA 7 stanja (SL+EN nenasteta)", () => {
    const statuses: TravelStatus[] = [
      "upcoming",
      "active",
      "navigating",
      "near_destination",
      "arrived",
      "completed",
      "skipped",
    ];
    for (const s of statuses) {
      expect(TRAVEL_LABELS[s].sl.length).toBeGreaterThan(0);
      expect(TRAVEL_LABELS[s].en.length).toBeGreaterThan(0);
    }
  });
  test("② ARRIVAL_LABELS: near meterji, arrived naslov, stale minute, radij", () => {
    expect(ARRIVAL_LABELS.near.sl(180)).toBe("Približuješ se — 180 m");
    expect(ARRIVAL_LABELS.near.en(180)).toBe("Approaching — 180 m");
    expect(ARRIVAL_LABELS.arrived.sl("Bled")).toBe("✓ Prišel si na lokacijo Bled");
    expect(ARRIVAL_LABELS.arrivedHint.sl).toContain("NE potrdi rezervacije");
    expect(ARRIVAL_LABELS.stale.sl(3)).toBe("zadnja fiksacija pred 3 min");
    expect(ARRIVAL_LABELS.radiusHint.en(60)).toContain("~60 m");
  });
});

// ---------------------------------------------------------------------------
// 7 — SOURCE CONTRACT: LOČITEV DVEH RESNIC (§3)
// ---------------------------------------------------------------------------

describe("ISSUE #21: source contract — travel NE pozna rezervacij", () => {
  const src = readFileSync(
    join(import.meta.dir, "../journey/travel-state.ts"),
    "utf8"
  );

  test("① modul NE uvaža rezervacijskih modulov (booking/supply/journey types)", () => {
    const imports = src.split("\n").filter((l) => l.trim().startsWith("import")).join("\n");
    expect(imports).not.toContain("./booking");
    expect(imports).not.toContain("./types");
    expect(imports).not.toContain("@/lib/supply");
    expect(imports).not.toContain("ConfirmationStatus");
  });
  test("② edini uvoz je geo-corridor (haversine — isti vir resnice)", () => {
    expect(src).toContain('from "@/lib/geo-corridor"');
  });
  test("③ determinizem: 0 omrežja/0 db/0 localStorage v modulu (dejanske rabe)", () => {
    // funkcionalne rabe (komentar glave o "0 localStorage" je dovoljen):
    expect(src).not.toContain("window.localStorage");
    expect(src).not.toContain(".getItem(");
    expect(src).not.toContain(".setItem(");
    expect(src).not.toMatch(/[^a-zA-Z.](fetch|XMLHttpRequest)\(/);
    expect(src).not.toContain("navigator.geolocation");
  });
});
