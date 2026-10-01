// ============================================================================
// ISSUE #21 §4 — GEO DATA CONTRACT: testi resolucije/klasifikacije (1.161.0)
// ============================================================================
// Vedenjski testi čiste projekcije resolveStopGeo (determinizem: isti vhod
// → isti izhod), integracija skozi buildGoView (kartice nosijo kanonski geo)
// in source-contract dokazi, da UI resnica gre čez ENO funkcijo (§19).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { MyTripDay, MyTripView, TripEntry } from "@/lib/journey/trip-view";
import { buildGoView } from "@/lib/journey/go-view";
import { goNavLinks } from "@/lib/journey/go-nav";
import {
  STOP_GEO_LABELS,
  isNavigableGeo,
  resolveStopGeo,
} from "@/lib/journey/resolve-stop-geo";
import { hasValidStopGeo } from "@/lib/journey/travel-state";

// ---------------------------------------------------------------------------
// Fixture gradniki (isti vzorec kot issue21-go-travel)
// ---------------------------------------------------------------------------

function mkEntry(key: string, over: Partial<TripEntry> = {}): TripEntry {
  return {
    key,
    category: "attractions",
    icon: "🏛️",
    title: `Postanek ${key}`,
    providerLabel: { sl: "AI načrt", en: "AI plan" },
    status: "INFO",
    statusLabel: { sl: "Načrtovani postanek", en: "Planned stop" },
    cancellation: { sl: "Ni rezervacije.", en: "No booking." },
    bookingId: null,
    ...over,
  };
}

function mkTrip(days: MyTripDay[]): MyTripView {
  return {
    title: { sl: "MOJA POT — BLED", en: "MY TRIP — BLED" },
    days,
    externalCards: [],
    confirmation: { confirmedCount: 0, note: { sl: "ni", en: "none" } },
    generatedAt: new Date(2026, 8, 20, 12, 0).toISOString(),
  };
}

const NOW = new Date(2026, 8, 20, 14, 0);

// ---------------------------------------------------------------------------
// 1 — KLASIFIKACIJA PRECISION (matrika §4)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §4: resolveStopGeo — klasifikacija", () => {
  test("① brez koordinat → missing (vir jih ni podal — ni napaka vira)", () => {
    const geo = resolveStopGeo({});
    expect(geo.precision).toBe("missing");
    expect(geo.lat).toBeUndefined();
    expect(geo.lng).toBeUndefined();
  });

  test("② samo lat ALI samo lng → invalid (polovični par — podatek vira je napakan)", () => {
    expect(resolveStopGeo({ lat: 46.1 }).precision).toBe("invalid");
    expect(resolveStopGeo({ lng: 14.1 }).precision).toBe("invalid");
  });

  test("③ zunaj obsega / NaN / null-island → invalid (validacija ±90/±180/0,0)", () => {
    expect(resolveStopGeo({ lat: 91, lng: 14 }).precision).toBe("invalid");
    expect(resolveStopGeo({ lat: 46, lng: -181 }).precision).toBe("invalid");
    expect(resolveStopGeo({ lat: Number.NaN, lng: 14 }).precision).toBe("invalid");
    expect(resolveStopGeo({ lat: 0, lng: 0 }).precision).toBe("invalid");
  });

  test("④ veljavne + provider »own« → exact (edini per-objekt preverjen vir)", () => {
    const geo = resolveStopGeo({ lat: 46.1, lng: 14.1, provider: "own" });
    expect(geo.precision).toBe("exact");
    expect(geo.lat).toBe(46.1);
    expect(geo.lng).toBe(14.1);
  });

  test("⑤ veljavne + zunanji viri (fsq/sto/osm/events/komercialni/neznan) → approximate", () => {
    for (const provider of ["fsq", "sto", "osm", "events", "getyourguide", undefined]) {
      const geo = resolveStopGeo({ lat: 46.1, lng: 14.1, provider });
      expect(geo.precision).toBe("approximate");
      expect(geo.source).toBe(provider ?? "unknown");
    }
  });

  test("⑥ prenos §4 polj: naslov, vir, ID vira (kjer obstajajo — drugje jih NI)", () => {
    const full = resolveStopGeo({
      lat: 46.1,
      lng: 14.1,
      provider: "own",
      providerProductId: "lst-123",
      location: "Cesta v Castle 5, Bled",
    });
    expect(full).toEqual({
      lat: 46.1,
      lng: 14.1,
      canonicalAddress: "Cesta v Castle 5, Bled",
      source: "own",
      sourceId: "lst-123",
      precision: "exact",
    });
    // brez naslova/ID-ja → polja NI (ne prazni nizi, ne null — čista odsotnost)
    const bare = resolveStopGeo({ lat: 46.1, lng: 14.1 });
    expect(bare.canonicalAddress).toBeUndefined();
    expect(bare.sourceId).toBeUndefined();
    expect(bare.source).toBe("unknown");
  });

  test("⑦ determinizem: isti vhod → POPIX isti izhod (10× zapored)", () => {
    const entry = mkEntry("a", { lat: 46.1, lng: 14.1, provider: "fsq" });
    const first = JSON.stringify(resolveStopGeo(entry));
    for (let i = 0; i < 9; i++) {
      expect(JSON.stringify(resolveStopGeo(entry))).toBe(first);
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — NAVIGABILNOST (§4 fail-closed: samo veljavne koordinate)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §4: isNavigableGeo — fail-closed", () => {
  test("① exact/approximate → uporaben navigacijski cilj", () => {
    expect(isNavigableGeo({ source: "own", precision: "exact", lat: 1, lng: 1 })).toBe(true);
    expect(isNavigableGeo({ source: "fsq", precision: "approximate", lat: 1, lng: 1 })).toBe(true);
  });

  test("② missing/invalid → NI navigacijskega cilja (§18 vrstici 7/8)", () => {
    expect(isNavigableGeo({ source: "unknown", precision: "missing" })).toBe(false);
    expect(isNavigableGeo({ source: "fsq", precision: "invalid" })).toBe(false);
  });

  test("③ goNavLinks: vnos brez koordinat → handoff NE obstaja (isti kanon)", () => {
    expect(goNavLinks(mkEntry("a", { title: "Bled" }))).toBeNull();
    expect(
      goNavLinks(mkEntry("a", { title: "Bled", lat: 46.1, lng: 14.1 }))
    ).not.toBeNull();
  });

  test("④ skladnost z arrival validacijo: invalid za resolveStopGeo je invalid za hasValidStopGeo", () => {
    // ena resnica o veljavnosti (§19) — oba kanona se morata strinpati
    for (const bad of [
      { lat: 91, lng: 14 },
      { lat: 46, lng: 181 },
      { lat: 0, lng: 0 },
      { lat: Number.NaN, lng: 14 },
    ]) {
      const geo = resolveStopGeo(bad);
      expect(geo.precision).toBe("invalid");
      expect(hasValidStopGeo(bad)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// 3 — INTEGRACIJA: buildGoView kartice nosijo kanonski geo (§19 ena resnica)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §4: buildGoView — geo na karticah", () => {
  const trip = mkTrip([
    {
      date: "2026-09-20",
      dateLabel: { sl: "x", en: "x" },
      entries: [
        mkEntry("own-stop", {
          lat: 46.1,
          lng: 14.1,
          provider: "own",
          providerProductId: "lst-9",
          location: "Bled",
        }),
        mkEntry("fsq-stop", { lat: 46.2, lng: 14.2, provider: "fsq" }),
        mkEntry("no-geo-stop", {}),
        mkEntry("bad-geo-stop", { lat: 95, lng: 14.5, provider: "sto" }),
      ],
    },
  ]);

  test("① naslednji + preostali: vsaka kartica nosi precision projekcijo svojega vnosa", () => {
    const v = buildGoView(trip, NOW, null, {});
    expect(v.next?.entry.key).toBe("own-stop");
    expect(v.next?.geo.precision).toBe("exact");
    expect(v.next?.geo.source).toBe("own");
    expect(v.next?.geo.sourceId).toBe("lst-9");
    expect(v.next?.geo.canonicalAddress).toBe("Bled");

    const byKey = new Map(v.remaining.map((c) => [c.entry.key, c.geo.precision]));
    expect(byKey.get("fsq-stop")).toBe("approximate");
    expect(byKey.get("no-geo-stop")).toBe("missing");
    expect(byKey.get("bad-geo-stop")).toBe("invalid");
  });

  test("② opravljeni/preskočeni prav tako nosijo geo (celotna shema dneva ista resnica)", () => {
    const v = buildGoView(
      trip,
      NOW,
      null,
      { "own-stop": "2026-09-20T10:00:00Z" },
      { skipped: { "fsq-stop": "2026-09-20T10:05:00Z" } }
    );
    expect(v.done[0].geo.precision).toBe("exact");
    expect(v.skipped[0].geo.precision).toBe("approximate");
  });

  test("③ nextAfter + line: ista klasifikacija kot naslednji (pogledi se ne morejo raziti)", () => {
    const v = buildGoView(trip, NOW, null, { "own-stop": "2026-09-20T10:00:00Z" });
    expect(v.next?.entry.key).toBe("fsq-stop"); // own opravljen → fsq je naslednji
    expect(v.next?.geo.precision).toBe("approximate");
    expect(v.nextAfter?.entry.key).toBe("no-geo-stop");
    expect(v.nextAfter?.geo.precision).toBe("missing");
    // shema dneva: vsi štirje, vsak s svojo resnico
    expect(v.line.map((i) => i.key)).toEqual([
      "own-stop",
      "fsq-stop",
      "no-geo-stop",
      "bad-geo-stop",
    ]);
  });
});

// ---------------------------------------------------------------------------
// 4 — OZNAKE (dvojezične — iskrene)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §4: STOP_GEO_LABELS — dvojezične iskrene oznake", () => {
  test("① approximate poimenuje VIR (uporabnik ve, čemur zaupa)", () => {
    expect(STOP_GEO_LABELS.approximate.sl("fsq")).toBe("Približna lokacija (vir: fsq)");
    expect(STOP_GEO_LABELS.approximate.en("fsq")).toBe("Approximate location (source: fsq)");
  });

  test("② missing/invalid povesta ZAKAJ navigacija ni na voljo (§18-7/8 — različni sporočili)", () => {
    expect(STOP_GEO_LABELS.missing.sl).toContain("Lokacija ni znana");
    expect(STOP_GEO_LABELS.missing.en).toContain("Location unknown");
    expect(STOP_GEO_LABELS.invalid.sl).toContain("napačni");
    expect(STOP_GEO_LABELS.invalid.en).toContain("invalid");
    expect(STOP_GEO_LABELS.missing.sl).not.toBe(STOP_GEO_LABELS.invalid.sl);
  });

  test("③ exact NE obljublja več kot je („preverjena“, ne „garantirana“)", () => {
    expect(STOP_GEO_LABELS.exact.sl).toBe("Preverjena lokacija");
    expect(STOP_GEO_LABELS.exact.en).toBe("Verified location");
  });
});

// ---------------------------------------------------------------------------
// 5 — SOURCE CONTRACT: UI gre čez ENO funkcijo (§19)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §4: source contract — ena geo resnica v UI", () => {
  const goModeSrc = readFileSync(
    join(import.meta.dir, "../../components/sections/go-mode.tsx"),
    "utf8"
  );
  const goDayLineSrc = readFileSync(
    join(import.meta.dir, "../../components/sections/go-day-line.tsx"),
    "utf8"
  );

  test("① go-mode: geo natančnost cilja se prikaže čez STOP_GEO_LABELS (ne lastne faze)", () => {
    expect(goModeSrc).toContain("STOP_GEO_LABELS");
    expect(goModeSrc).toContain('precision === "approximate"');
    expect(goModeSrc).toContain('precision === "exact"');
    // missing/invalid → izrecna opomba (ne tiha odsotnost gumba)
    expect(goModeSrc).toContain("isNavigableGeo");
  });

  test("② go-day-line: zemljevid dneva OSTAJA fail-closed po postanku (regresija 1.160.0)", () => {
    expect(goDayLineSrc).toContain("buildDayMapUrl");
  });
});
