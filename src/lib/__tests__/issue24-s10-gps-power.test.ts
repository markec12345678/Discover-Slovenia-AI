// ============================================================================
// ISSUE #24 SKLOP 10 (1.172.0) — »Prilagodljiva GPS natančnost (baterija)«
// (P3 backlog, Polarsteps <4 %/dan): pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO resolveGpsPowerMode (čisti delivec): daleč → balanced,
//     znotraj praga → high, TOČNO na pragu → high (inkluzivno), neznana
//     razdalja + odprt postanek → high (FAIL-SAFE — neznanje ne varčuje),
//     brez odprtega postanka → balanced (približek zadostuje);
//  ② VARNOSTNA GEOMETRIJA: prag preklopa (2 km) PREKRIVA geofence prihoda
//     (≤ 150 m + 75 m histereza) s KONZERVATIVNIM robom — preverjeno
//     kombinatorično nad DEFAULT_ARRIVAL_CONFIG; 8 s stabilnost ostaja
//     (minStableMs nespremenjen — zaklenjen);
//  ③ SOURCE-CONTRACT use-geolocation: enableHighAccuracy upravlja NAČIN
//     (modeRef), preklop ponovno odpre watch (clearWatch + beginWatch) BREZ
//     brisanja položaja/statusa (brez utripanja), proračun ponovitve se NE
//     resetira (preklop ni napaka), default brez možnosti = high
//     (kompatibilnost #21);
//  ④ SOURCE-CONTRACT go-mode.tsx: resolucija iz view.next + živega
//     položaja (distanceToStopM — isti vir resnice kot prihodi), prenos
//     prek stanja po makro-nalogi (set-state-in-effect kanon), čip varčnega
//     načina + razlaga v GPS plošči;
//  ⑤ TELEMETRIJA gps_power_mode_changed: SAMO ob dejanskem preklopu z
//     odprtim zajemanjem, brez PII (samo mode — brez razdalje);
//  ⑥ ANALITIKA 3-plastna pariteta: klientni union + strežniški
//     VALID_EVENTS + docs/ANALYTICS-EVENTS.md;
//  ⑦ OZNAKE GPS_POWER_LABELS: 6 jezikov, lastni prevodi (ne EN kopija).
//
// Vzorec: source-contract readFileSync (isto kot issue24-s9) + funkcionalni
// klici čistih funkcij (0 DB, 0 omrežja — sandbox prijazen).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  GPS_POWER_CONFIG,
  GPS_POWER_LABELS,
  resolveGpsPowerMode,
} from "@/lib/journey/gps-power";
import { DEFAULT_ARRIVAL_CONFIG } from "@/lib/journey/travel-state";

const ROOT = process.cwd();

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// ① resolveGpsPowerMode (čisti delivec)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ① resolveGpsPowerMode (resolucija)", () => {
  test("① daleč od postanka (> 2 km) → balanced (baterija)", () => {
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 15_000 })).toBe(
      "balanced"
    );
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 2_001 })).toBe(
      "balanced"
    );
  });

  test("② znotraj praga → high (geofence varnost)", () => {
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 0 })).toBe("high");
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 150 })).toBe("high");
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 1_999 })).toBe("high");
  });

  test("③ TOČNO na pragu (2000 m) → high (inkluzivno — konservativno)", () => {
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: 2_000 })).toBe("high");
    expect(GPS_POWER_CONFIG.highAccuracyWithinM).toBe(2_000);
  });

  test("④ NEZNANA razdalja + odprt postanek → high (fail-safe: neznanje NE varčuje)", () => {
    expect(resolveGpsPowerMode({ hasPendingStop: true, distanceToNextStopM: null })).toBe("high");
  });

  test("⑤ brez odprtega postanka → balanced (prihoda ni — približek zadostuje)", () => {
    expect(resolveGpsPowerMode({ hasPendingStop: false, distanceToNextStopM: null })).toBe(
      "balanced"
    );
    // tudi če razdalja irgendhow znana (zastarelo) — brez postanka ni geofenca
    expect(resolveGpsPowerMode({ hasPendingStop: false, distanceToNextStopM: 100 })).toBe(
      "balanced"
    );
  });
});

// ---------------------------------------------------------------------------
// ② varnostna geometrija (geofence prihodi NE SMEJO biti ogroženi)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ② varnostna geometrija geofenca", () => {
  test("① prag preklopa PREKRIVA najširši možni prag prihoda + histerezo", () => {
    const worstArrivalM =
      DEFAULT_ARRIVAL_CONFIG.arriveMaxM + DEFAULT_ARRIVAL_CONFIG.hysteresisM; // 150 + 75
    // Rob mora biti VEČKRATNIK najširšega geofenca — konservativen:
    // vsaj 5× (pri 50 km/h ≈ 2,4 min vožnje za ponovni prijem GPS).
    expect(GPS_POWER_CONFIG.highAccuracyWithinM).toBeGreaterThanOrEqual(worstArrivalM * 5);
  });

  test("② pas »Približuješ se« (300 m) je GLOBOKO znotraj high območja", () => {
    expect(DEFAULT_ARRIVAL_CONFIG.nearM).toBeLessThan(GPS_POWER_CONFIG.highAccuracyWithinM);
  });

  test("③ 8 s stabilnost prihoda ostaja NESPREMENJENA (zaklenjena)", () => {
    // Sprememba te vrednosti je varna le z ozaveščeno posodobitvijo tega
    // testa (isti kanon kot DEFAULT_FREE_TIME_CONFIG v Sklopu 9).
    expect(DEFAULT_ARRIVAL_CONFIG.minStableMs).toBe(8_000);
    expect(DEFAULT_ARRIVAL_CONFIG.arriveBaseM).toBe(60);
    expect(DEFAULT_ARRIVAL_CONFIG.arriveMaxM).toBe(150);
    expect(DEFAULT_ARRIVAL_CONFIG.hysteresisM).toBe(75);
  });

  test("④ lažni prihod iz grobe fiksacije izključi stabilnost (matematika)", () => {
    // Groba fiksacija, ki pokaže ≤ 2 km, preklopi način na high — prihod
    // mora nato VZDRŽATI 8 s v natančnih fiksacijah znotraj praga. Če je
    // bila groba fiksacija zmota, jo natančna prevotne v < 8 s → stanje
    // pade z arrived ŠE PRED stabilizacijo (iskreno near/far, ne lažen ✓).
    // Preverimo zgolj konsistentnost konstant: 8 s > 0 in prag high
    // območja je veliko večji od praga prihoda (preklop se zgodi ZGOLJ
    // pred prihodom, nikoli po).
    expect(GPS_POWER_CONFIG.highAccuracyWithinM).toBeGreaterThan(
      DEFAULT_ARRIVAL_CONFIG.arriveMaxM
    );
  });
});

// ---------------------------------------------------------------------------
// ③ source contract — use-geolocation.ts
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ③ use-geolocation source contract", () => {
  const src = norm(source("src/lib/journey/use-geolocation.ts"));

  test("① enableHighAccuracy upravlja NAČIN (modeRef — vedno najnovejši)", () => {
    expect(src).toContain("enableHighAccuracy: modeRef.current === \"high\"");
  });

  test("② preklop ponovno odpre watch (clearWatch + beginWatch) brez brisanja položaja", () => {
    expect(src).toContain("if (watchIdRef.current != null) {");
    expect(src).toContain("beginWatchRef.current({ keepActiveStatus: true });");
    // ohranitev statusa živi V beginWatch (zastavica + zrcalo — setState
    // NI neposredno v telesu efekta, pravilo set-state-in-effect)
    expect(src).toContain(
      "openOpts?.keepActiveStatus && positionRef.current != null"
    );
    // položaj se ob preklopu NE pobriše (samo izmenjava zajemanja)
    const i = src.indexOf("if (watchIdRef.current != null) {");
    const block = src.slice(i, i + 400);
    expect(block).not.toContain("setPosition(null)");
  });

  test("③ proračun ponovitve se ob preklopu NE resetira (preklop ni napaka)", () => {
    // retriedRef se resetira SAMO v start()/stop() uspešni fiksaciji —
    // ne v efektku preklopa načina.
    const i = src.indexOf("useEffect(() => {", src.indexOf("PREKLOP NAČINA"));
    const block = src.slice(i, i + 700);
    expect(block).not.toContain("retriedRef.current = false");
  });

  test("④ default brez možnosti = high (kompatibilnost z #21 klicniki)", () => {
    expect(src).toContain("opts?.mode ?? \"high\"");
  });

  test("⑤ preostale možnosti watcha so kanonske (ne spreminjajo se z načinom)", () => {
    expect(src).toContain("timeout: 10_000");
    expect(src).toContain("maximumAge: 30_000");
  });
});

// ---------------------------------------------------------------------------
// ④ source contract — go-mode.tsx (resolucija + UI)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ④ go-mode.tsx source contract", () => {
  const src = norm(source("src/components/sections/go-mode.tsx"));

  test("① resolucija iz view.next + živega položaja (distanceToStopM — isti vir)", () => {
    expect(src).toContain("resolveGpsPowerMode({");
    expect(src).toContain("hasPendingStop: view.next != null");
    expect(src).toContain("distanceToStopM(geo.position, view.next.geo)");
  });

  test("② prenos načina prek stanja po makro-nalogi (set-state-in-effect kanon)", () => {
    expect(src).toContain("const [gpsPower, setGpsPower] = useState<GpsPowerMode>(\"high\")");
    expect(src).toContain("const geo = useGeolocation({ mode: gpsPower })");
    expect(src).toContain("setTimeout(() => setGpsPower(gpsPowerNext), 0)");
  });

  test("③ brez zapisa/pogleda → high (fail-safe privzet)", () => {
    expect(src).toContain(": \"high\", // brez zapisa/pogleda → kanonsko (fail-safe)");
  });

  test("④ čip varčnega načina + razlaga v GPS plošči (iskreno razkritje)", () => {
    expect(src).toContain("gpsPower === \"balanced\"");
    expect(src).toContain("t(GPS_POWER_LABELS.balanced)");
    expect(src).toContain("t(GPS_POWER_LABELS.balancedHint)");
  });
});

// ---------------------------------------------------------------------------
// ⑤ telemetrija (brez PII)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ⑤ telemetrija gps_power_mode_changed", () => {
  const src = norm(source("src/components/sections/go-mode.tsx"));

  test("① dogodek ob dejanskem preklopu z odprtim zajemanjem", () => {
    expect(src).toContain('trackPlannerEvent("gps_power_mode_changed"');
    expect(src).toContain("gpsPowerPrevRef.current === gpsPower");
    expect(src).toContain('geo.status === "active" || geo.status === "requesting"');
  });

  test("② brez PII — SAMO mode (brez razdalje, ki je izpeljana iz lokacije)", () => {
    const i = src.indexOf('trackPlannerEvent("gps_power_mode_changed"');
    const call = src.slice(i, i + 100);
    expect(call).toContain("{ mode: gpsPower }");
    expect(call).not.toContain("distance");
    expect(call).not.toContain("lat");
    expect(call).not.toContain("lng");
  });
});

// ---------------------------------------------------------------------------
// ⑥ analitika — 3-plastna pariteta
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ⑥ gps_power_mode_changed 3-plastna pariteta", () => {
  test("① klientni union (planner-analytics.ts)", () => {
    expect(norm(source("src/lib/planner-analytics.ts"))).toContain(
      '| "gps_power_mode_changed"'
    );
  });

  test("② strežniški VALID_EVENTS (api/analytics/event/route.ts)", () => {
    expect(norm(source("src/app/api/analytics/event/route.ts"))).toContain(
      '"gps_power_mode_changed"'
    );
  });

  test("③ docs/ANALYTICS-EVENTS.md (zlati kanon)", () => {
    const doc = source("docs/ANALYTICS-EVENTS.md");
    expect(doc).toContain("`gps_power_mode_changed` (1.172.0, Issue #24 Sklop 10)");
    expect(doc).toMatch(/gps_power_mode_changed[\s\S]*?`mode`/);
  });
});

// ---------------------------------------------------------------------------
// ⑦ oznake (6 jezikov — P4-8 polni prevodi)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 10 — ⑦ GPS_POWER_LABELS (6 jezikov)", () => {
  test("① balanced čip: vsi jeziki prisotni, neprazni, lastni", () => {
    const langs = ["sl", "en", "it", "de", "fr", "es"] as const;
    for (const l of langs) {
      const s = GPS_POWER_LABELS.balanced[l];
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(3);
    }
    // lastni prevodi (ne EN kopija)
    expect(GPS_POWER_LABELS.balanced.it).not.toBe(GPS_POWER_LABELS.balanced.en);
    expect(GPS_POWER_LABELS.balanced.de).not.toBe(GPS_POWER_LABELS.balanced.en);
    expect(GPS_POWER_LABELS.balanced.fr).not.toBe(GPS_POWER_LABELS.balanced.en);
    expect(GPS_POWER_LABELS.balanced.es).not.toBe(GPS_POWER_LABELS.balanced.en);
  });

  test("② balancedHint: 6 jezikov, razlaga vsebuje samodejni povratek natančnosti", () => {
    const langs = ["sl", "en", "it", "de", "fr", "es"] as const;
    for (const l of langs) {
      const s = GPS_POWER_LABELS.balancedHint[l];
      expect(typeof s).toBe("string");
      expect(s.length).toBeGreaterThan(20);
    }
    expect(GPS_POWER_LABELS.balancedHint.sl.toLowerCase()).toContain("samodejn");
    expect(GPS_POWER_LABELS.balancedHint.en.toLowerCase()).toContain("automatically");
  });
});
