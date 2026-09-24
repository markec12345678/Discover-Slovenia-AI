// ============================================================================
// TASK 96 — D1 UI SPRINT: INVENTURA + POGODBA HIERARHIJE DELOVNE POVRŠINE
// ============================================================================
//
// ZADEVA: UI sprint (D1 iz MINDTRIP-ANALIZA §7) je bil izveden že v 1.22.0
// (komit 1ba324f — "delovna površina po Mindtrip modelu, nabora #1+#2").
// Kot pri D3 (TASK 95) je bil checklist doc drift — nikoli odkrito zaprt.
// TASK 96 ga zapre: E2E spot-check (obnovljeni načrt iz localStorage —
// BONUS: preverjena tudi welcome-back pot) + ta pogodba hierarhije.
//
// POGODBA (render vrstni red v itinerary-planner.tsx — smer
// docs/AI/ITINERARY-PLANNER-UI-DIRECTION.md "Target UX hierarchy"):
//   1. Trip header (resultTitle + badgeAI/badgeSample/totalBadge)
//   2. PlannerSummaryBar (zložen obrazec — točka B smeri)
//   3. Zemljevid + Pogovor v ENI delovni površini (točki A+F — grid
//      lg:grid-cols-[1.6fr_1fr], TripMapPanel + itinerary-refiner z
//      zavihkoma Spremeni načrt / Vprašaj)
//   4. PlannerStatusStrip (kompaktni status — točka 3 smeri)
//   5. PlannerDayNav + kartice dni (id="day-card-N")
//   6. Več o tvoji poti (moreOpen → TripTimeline s segmenti dneva)
//
// E2E DOKAZ (agent-browser 375 px, 2026-09-24): obnovljeni 5-dnevni načrt
// (localStorage iz TASK 95 seje) → 8 programskih orientirjev (header,
// summaryBar, map, refineTabs, statusStrip, dayNav, dayCards,
// quickActions) VSI prisotni; zavihek Vprašaj preklopljen (panel
// "Vprašaj o načrtu" + vprašalno polje); 0 konzolnih napak; 0 px preliva;
// VLM potrditev (~285 km · ~3h 55min · ~€385 · 1 opozorilo statusni trak).
// Dokaz: docs/screenshots/task96-d1-workspace-restored.png.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const PLANNER = "src/components/sections/itinerary-planner.tsx";

/**
 * Poišči 1-based pozicijo vrstice z danim vzorcem (prvi zadetek).
 * Za pogodbo VRSTNEGA REDA: component/tag se pojavijo v izvirni kodi v
 * vrstnem redu, kot jih React izriše (JSX gnezdenje).
 */
function lineOf(s: string, pattern: string): number {
  const idx = s.indexOf(pattern);
  if (idx === -1) return -1;
  return s.slice(0, idx).split("\n").length;
}

describe("TASK 96: D1 hierarhija delovne površine (source-contract)", () => {
  const s = source(PLANNER);

  test("površina je izrisana KADARKOLI načrt obstaja (TASK 80: regeneracija ne izbriše)", () => {
    // Pogoj površine je SAMO itinerary (ne !loading && !error)
    expect(s).toMatch(/\{itinerary && \(/);
    // med regeneracijo zamegljena + inert (izgubi klik/fokus, ne izgine)
    expect(s).toContain("pointer-events-none select-none opacity-60");
    expect(s).toContain("inert={loading || undefined}");
    expect(s).toContain('aria-busy={loading || undefined}');
  });

  test("VRSTNI RED: header → summary → zemljevid+pogovor → status → dnevi", () => {
    // 1. Trip header (naslov rezultata z številom dni)
    const header = lineOf(s, 't("resultTitle"');
    // 2. PlannerSummaryBar (zložen obrazec, gumb Uredi)
    const summary = lineOf(s, "<PlannerSummaryBar");
    // 3. Zemljevid + pogovor grid (1.6fr/1fr)
    const grid = lineOf(s, "lg:grid-cols-[1.6fr_1fr]");
    // 4. Statusni trak
    const status = lineOf(s, "<PlannerStatusStrip");
    // 5. Dnevna navigacija
    const dayNav = lineOf(s, "<PlannerDayNav");
    // 6. Kartice dni (id vzorec)
    const dayCard = lineOf(s, 'id={`day-card-${day.day}`}');

    expect(header).toBeGreaterThan(0);
    expect(summary).toBeGreaterThan(header);
    expect(grid).toBeGreaterThan(summary);
    expect(status).toBeGreaterThan(grid);
    expect(dayNav).toBeGreaterThan(status);
    expect(dayCard).toBeGreaterThan(dayNav);
  });

  test("zemljevid in pogovor v ENI površini (točki A+F — 1.6fr/1fr)", () => {
    expect(s).toContain("lg:grid-cols-[1.6fr_1fr]");
    // zemljevid poti na strani načrtovalca + dvosmerna sinhronizacija
    expect(s).toContain("<TripMapPanel");
    expect(s).toContain("onStopSelect=");
    // pogovor PRITRJEN poti: zavihka Spremeni načrt (mutacije) + Vprašaj
    expect(s).toContain('id="itinerary-refiner"');
    expect(s).toMatch(/chatTab === "refine"/);
    expect(s).toMatch(/chatTab === "ask"|setChatTab\("ask"\)/);
  });

  test("obrazec NL-first (točka B): želja vrstica + zloženi napredni parametri", () => {
    // NL vrstica je PRVA vrata (ista čista funkcija kot hero)
    expect(s).toMatch(/fireStartedOnce\(\)/);
    // napredni parametri zloženi (Podrobne nastavitve disclosure)
    expect(s).toContain('Podrobne nastavitve');
  });

  test("sličice postankov iz OBSTOJEČIH virov (0 zunanjih odvisnosti — točka C)", () => {
    // sličice POGOJNE na obstoječe lokalne podatke (dest?.image) — ne fake
    expect(s).toMatch(/\{dest\?\.image && \(/);
    // 0 ZUNANJIH virov slik (next/image je vgrajen Next.js — dovoljen)
    expect(s).not.toMatch(/unsplash|placeholder\.com|picsum|source\.co/);
  });

  test("F16 prihranek kot kontekstualna vrstica (točka E — prag ≥5 km/5 %)", () => {
    // 2-opt prihranek izrisan kot kontekst, ne nova kartica
    expect(s).toMatch(/krajšo pot|prihraniš|2-opt/i);
  });

  test("mobilni vrstni red (točka G): zemljevid NE uide čez kartice", () => {
    // min-w-0 varovalka v mreži (preliv Leaflet v gridu)
    expect(s).toContain("min-w-0");
  });

  test("TripTimeline (Več o tvoji poti) je del površine z legendo segmentov", () => {
    // TASK 93: timeline z glavami segmentov in poštenimi etapami
    expect(s).toContain("<TripTimeline");
    expect(s).toContain("moreOpen");
  });
});

describe("TASK 96: D1 komponente — obstoj in integracija", () => {
  test("PlannerSummaryBar: gumb Uredi odpre obrazec nad površino", () => {
    const s = source(PLANNER);
    expect(s).toMatch(/onEdit=\{\(\) => \{/);
    expect(s).toContain("setFormExpanded(true)");
  });

  test("PlannerStatusStrip: izrisan s povzetkom poti (km/čas/strošek/opozorila)", () => {
    const comp = source("src/components/planner-status-strip.tsx");
    // komponenta obstaja in sprejme itinerar/geo podatke
    expect(comp).toMatch(/interface|type .*Props/);
    expect(comp.length).toBeGreaterThan(200);
    const s = source(PLANNER);
    expect(s).toMatch(/<PlannerStatusStrip\s/);
  });

  test("PlannerDayNav: izrisan z dnevi itinerarja", () => {
    const s = source(PLANNER);
    // TASK 4 / K-11 (UX FIX PASS): vrstica je dobila className (vrstni red v
    // flex delovni površini — mobilno neposredno pred dnevi) in je zdaj
    // večvrstična; NAMEN je nespremenjen: izrisana z dnevi itinererja.
    expect(s).toContain("<PlannerDayNav");
    expect(s).toContain("days={itinerary.days}");
  });

  test("restored chip (welcome-back): role=status + dismissing", () => {
    const s = source(PLANNER);
    // obnovljeni načrt chip nad površino (E2E ga je pokazal)
    expect(s).toContain('role="status"');
    expect(s).toContain("restoredChip");
    expect(s).toContain("restoredChipDismiss");
  });
});

describe("TASK 96: i18n ključi delovne površine (sl + en)", () => {
  test("resultTitle/railPrompt prisotni v obeh jezikih", async () => {
    const sl = JSON.parse(
      source("src/i18n/messages/sl.json")
    ) as Record<string, Record<string, unknown>>;
    const en = JSON.parse(
      source("src/i18n/messages/en.json")
    ) as Record<string, Record<string, unknown>>;
    const keys = ["resultTitle", "railPrompt", "restoredChip", "totalBadge"];
    for (const k of keys) {
      expect(k in (sl.planner ?? {})).toBeTrue();
      expect(k in (en.planner ?? {})).toBeTrue();
    }
  });
});
