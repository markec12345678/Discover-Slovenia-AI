// ============================================================================
// W11-C „DOKAZLJIVO UREJEN DAN — DELJENA POT" (1.143.0)
// ============================================================================
// Tretji relief W11 vala (UX): W11-A (Google Maps izvoz dneva) in W11-B
// (značka „0 cik-cak" + obročni žetoni) sta bila doslej VIDNA SAMO na
// načrtovalski površini (trip-timeline.tsx, /nacrtuj). W11-C ju prenese
// na DE LJENO POT (shared-trip.tsx — /pot/[shareId] + /pot/embed/[shareId]
// isti komponenti — relief samodejno pokrijeta obe poti).
//
// RAZLOG (benchmark 29. 9. 2026): deljena povezava je kanal, po katerem
// načrt potuje NAPREJ — k prijateljem brez računa in na bloge (embed).
// Trditev kakovosti („0 cik-cak", obroki v kanonskem razponu) in
// „Dan v žepu" (Google Maps navigacija) sta točno tisti dve stvari, ki
// jih MonkeyTravelova niša OBIJA: „neither reliably hands you a day you
// can actually walk". Kdor odpre deljeno povezavo, vidi DOKAZ, ne obljubo.
//
// SOURCE-CONTRACT (readFileSync dejanskih datotek — isti vzorec kot
// task89-itinerary-audio.test.ts):
//  - shared-trip.tsx uvaŽA ISTI lib funkciji kot planner (ena resnica:
//    dayZigzagQuality/mealStopWindow iz day-quality.ts, gmapsDayUrl iz
//    gmaps-day-export.ts — NI duplikatne logike v komponenti),
//  - pilula je PRAVA <a> povezava (ne gumb), noopener, print:hidden;
//  - značka/povzetek/žetoni so vidni TUDI v PDF (trditev potuje naprej),
//  - telemetrija day_export_gmaps nosi surface: "shared" (dogodek je
//    ŽE v klientni union + strežniški whitelisti od W11-A),
//  - SL besedila so hardcodana (celoten shared-trip je SL površina —
//    isti konvenciji kot „Dan {day.day}" in zvočni gumb lang="sl").
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const shared = source("src/components/shared-trip.tsx");
const timeline = source("src/components/trip-timeline.tsx");
const analyticsLib = source("src/lib/planner-analytics.ts");
const analyticsRoute = source("src/app/api/analytics/event/route.ts");
const analyticsDocs = source("docs/ANALYTICS-EVENTS.md");

// ---------------------------------------------------------------------------
// ENA RESNICA — lib uvozi (0 duplikatne logike v komponenti)
// ---------------------------------------------------------------------------

describe("W11-C: ena resnica — isti lib kot planner", () => {
  test("shared-trip uvaža dayZigzagQuality + mealStopWindow (day-quality.ts)", () => {
    expect(shared).toContain(
      'import { dayZigzagQuality, mealStopWindow } from "@/lib/day-quality"'
    );
  });

  test("shared-trip uvaža gmapsDayUrl (gmaps-day-export.ts)", () => {
    expect(shared).toContain('import { gmapsDayUrl } from "@/lib/gmaps-day-export"');
  });

  test("NI lokalne kopije kanonov v shared-trip (backtracking/waypoint logika ostaja v lib)", () => {
    // Če bi komponenta reimplementirala M3 ali URL sestavljanje, bi ti
    // zaznamki iz lib modulov puhteli v komponento:
    expect(shared).not.toContain("findBacktrackingEvents");
    expect(shared).not.toContain("R_VISIT");
    expect(shared).not.toContain("api=1");
    expect(shared).not.toContain("maps/dir");
  });

  test("planner (trip-timeline) uporablja ISTI uvoz — obe površini iz istega vira", () => {
    expect(timeline).toContain('import { gmapsDayUrl } from "@/lib/gmaps-day-export"');
    expect(timeline).toContain(
      'import { dayZigzagQuality, mealStopWindow } from "@/lib/day-quality"'
    );
  });
});

// ---------------------------------------------------------------------------
// ZNAČKA „0 CIK-CAK" + POVZETEK (iskrenostna disciplina §8)
// ---------------------------------------------------------------------------

describe("W11-C: značka 0 cik-cak na deljeni poti", () => {
  test("dnevna značka se izriše SAMO ob dokazu (verifiable && zigzagFree)", () => {
    expect(shared).toContain("zigzag?.verifiable && zigzag.zigzagFree");
    expect(shared).toContain("0 cik-cak");
  });

  test("povzetek „Vsi dnevi: 0 cik-cak“ v glavi — vsak dan mora biti preverljiv", () => {
    expect(shared).toContain("showZigzagSummary");
    expect(shared).toContain("Vsi dnevi: 0 cik-cak");
    // Iskrenostna disciplina: trivialni dnevi (<2 postanka) ne štejejo
    // PROTI, a zahtevajo, da vsi ostali drže (enako kot planner).
    expect(shared).toContain("q.stops < 2 || (q.verifiable && q.zigzagFree)");
  });

  test("kakovost vseh dni izračunana ENKRAT (memo — ne v vsakem izrisu)", () => {
    expect(shared).toContain("zigzagAllDays");
    expect(shared).toContain("dayZigzagQuality(d)");
  });

  test("title razlaga (tooltip) razkrije DETERMINISTIČNO preverbo", () => {
    expect(shared).toContain(
      "Deterministično preverjeno: zaporedje postankov se ne vrača čez že obiskano območje"
    );
  });

  test("značka/povzetek NISTA print:hidden (trditev potuje v PDF deljenega načrta)", () => {
    // Značka (span) in povzetek (Badge v glavi) smeta v tisku; edini
    // print:hidden v glavi dneva pokriva pilulo + zvočni gumb (dejanji).
    const badgeBlock = shared.slice(
      shared.indexOf("zigzag?.verifiable && zigzag.zigzagFree"),
      shared.indexOf("0 cik-cak")
    );
    expect(badgeBlock).not.toContain("print:hidden");
  });
});

// ---------------------------------------------------------------------------
// OBROČNI ŽETONI (kosilo 12–14 / večerja 18–21)
// ---------------------------------------------------------------------------

describe("W11-C: obročni žetoni na karticah postankov", () => {
  test("LocationCard računa mealStopWindow (ista čista funkcija)", () => {
    expect(shared).toContain("const mealWindow = mealStopWindow(visit)");
  });

  test("SL besedili žetonov (celotna površina je SL — kot ostali teksti)", () => {
    expect(shared).toContain("kosilo 12–14 ✓");
    expect(shared).toContain("večerja 18–21 ✓");
  });

  test("title razloži kanonski razpon (kosilo/večerja)", () => {
    expect(shared).toContain("kanonskem razponu kosila (12:00–14:00)");
    expect(shared).toContain("kanonskem razponu večerje (18:00–21:00)");
  });

  test("žeton se izriše SAMO ob dokazu (mealWindow &&)", () => {
    expect(shared).toContain("{mealWindow && (");
  });
});

// ---------------------------------------------------------------------------
// GOOGLE MAPS PILULA (W11-A na deljeni poti)
// ---------------------------------------------------------------------------

describe("W11-C: Google Maps pilula v glavi dneva deljene poti", () => {
  test("PRAVA <a> povezava (ne gumb) z noopener (zunanja stran)", () => {
    expect(shared).toContain("gmapsDayUrl(day)");
    expect(shared).toContain('rel="noopener noreferrer"');
    expect(shared).toContain('target="_blank"');
  });

  test("iskrenost: brez URL-ja (postanek brez koordinat) → brez pilule", () => {
    expect(shared).toContain("g.url ?");
    expect(shared).toContain(": null;");
  });

  test("aria-label napove navigacijo po celotnem dnevu (SL)", () => {
    expect(shared).toContain(
      "v Google Maps (navigacija po celotnem dnevu)"
    );
  });

  test("pilula je print:hidden (PDF ostane čist — navigacija je dejanje)", () => {
    const pillBlock = shared.slice(
      shared.indexOf("ml-auto flex shrink-0 items-center gap-2 self-center print:hidden"),
      shared.indexOf('surface="shared"')
    );
    expect(pillBlock.length).toBeGreaterThan(0);
    expect(pillBlock).toContain("gmapsDayUrl(day)");
  });

  test("pilula sede PRED zvočnim povzetkom (oba v desnem ovoju glave)", () => {
    const header = shared.slice(
      shared.indexOf("ml-auto flex shrink-0 items-center gap-2 self-center print:hidden"),
      shared.indexOf("{/* Lokacije v dnevu */}")
    );
    const pillAt = header.indexOf("gmapsDayUrl(day)");
    const audioAt = header.indexOf("<DayAudioButton");
    expect(pillAt).toBeGreaterThan(-1);
    expect(audioAt).toBeGreaterThan(pillAt);
  });
});

// ---------------------------------------------------------------------------
// TELEMETRIJA — surface=shared (dogodek obstaja od W11-A)
// ---------------------------------------------------------------------------

describe("W11-C: telemetrija day_export_gmaps s površino", () => {
  test("shared-trip sledi klik z vsemi propsi + surface: 'shared'", () => {
    expect(shared).toContain('trackPlannerEvent("day_export_gmaps"');
    expect(shared).toContain('surface: "shared"');
    expect(shared).toContain("stops: g.stops");
    expect(shared).toContain("skipped: g.skipped");
    expect(shared).toContain("truncated: g.truncated");
  });

  test("dogodek je v klientni whitelisti (union) — od W11-A, brez sprememb", () => {
    expect(analyticsLib).toContain('"day_export_gmaps"');
  });

  test("dogodek je v strežniški VALID_EVENTS — od W11-A, brez sprememb", () => {
    expect(analyticsRoute).toContain('"day_export_gmaps"');
  });

  test("dogodek je dokumentiran v docs/ANALYTICS-EVENTS.md (z surface=shared)", () => {
    // W11-A je vrstico izpustil (najdena vrzel) — W11-C jo dodaja ZDAJ,
    // skupaj z razširitvijo surface.
    expect(analyticsDocs).toMatch(/`day_export_gmaps` \(1\.141\.0 W11-A; 1\.143\.0 `surface=shared`\)/);
    expect(analyticsDocs).toContain("`surface` (`planner`/`shared`)");
  });
});

// ---------------------------------------------------------------------------
// ČISTOST — shared-trip ostaja SL površina z zvočnim gumbom nedotaknim
// ---------------------------------------------------------------------------

describe("W11-C: ni regresij na obstoječi površini", () => {
  test("zvočni povzetek še vedno sedi v glavi dneva (lang=sl, surface=shared)", () => {
    expect(shared).toContain("<DayAudioButton");
    expect(shared).toContain('surface="shared"');
    expect(shared).toContain('lang="sl"');
  });

  test("vremenski čip je ostal v isti glavi (živi čip premošča posnetek)", () => {
    expect(shared).toContain("<WeatherChip w={liveWeather} lang=\"sl\" />");
  });

  test("dnevi se preslikajo z indeksom (kakovost iz skupnega memo-ja)", () => {
    expect(shared).toContain("itinerary.days.map((day, dayIdx) => {");
    expect(shared).toContain("zigzagAllDays[dayIdx]");
  });
});
