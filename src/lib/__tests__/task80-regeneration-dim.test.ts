// ============================================================================
// TASK 80 (1.74.2) — regeneracija zamegli obstoječi načrt (dim, ne unmount).
// ============================================================================
// REPRODUCIRANA VRZEL: ob ponovnem generiranju je delovna površina načrta
// imela pogoj `!loading && !error && itinerary` — obstoječi načrt je MED
// regeneracijo (in tudi ob njeni NAPAKI) IZGINIL s pogleda, nadomestili so
// ga skeleti (lažna obetanja, ko že imaš načrt). Pri napaki + zloženem
// obrazcu je nastalo celo MRTVO stanje: načrt skrit, napaka nevidna.
//
// PRISTOP (precedent TASK 78/73 — source-contract): trditve o DEJANSKI
// odposlani datoteki src/components/sections/itinerary-planner.tsx (ne
// kopiji): pogoj delovne površine, zameglitev (opacity + pointer-events +
// inert), izluščena statusna vrstica, error-veja, X gumb, analitika.
// Obnašanje (dim pride/preide) dokazuje E2E.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const SOURCE = readFileSync(
  "src/components/sections/itinerary-planner.tsx",
  "utf8"
);

describe("TASK 80 — pogoj delovne površine (načrt ne izgine več)", () => {
  test("① STARI pogoj !loading && !error && itinerary je ODSOTEN (načrt ostane viden)", () => {
    // To je bila točka izginevanja: regeneracija/napaka je skrila načrt.
    expect(SOURCE.includes("!loading && !error && itinerary")).toBe(false);
  });

  test("② nova površina: {itinerary && ( … cn(… loading && dim …) aria-busy inert", () => {
    // TASK 4 / K-11 (UX FIX PASS): površina je zdaj flex-col (mobilni vrstni
    // red naslov → dnevi → zemljevid → kontrole) + id="plan-workspace"
    // (scroll sidro po generaciji) — NAMEN je nespremenjen: pogoj SAMO
    // itinerary, zameglitev + inert + aria-busy med regeneracijo.
    // ([\s\S]*? mosti komentarje znotraj cn() klica.)
    const dimSurface = /\{itinerary && \(\s*<div\s+id="plan-workspace"\s+className=\{cn\(\s*[\s\S]*?"flex flex-col space-y-5 transition-opacity duration-300",\s*formExpanded && "mt-8",\s*loading && "pointer-events-none select-none opacity-60",\s*\)\}\s*aria-busy=\{loading \|\| undefined\}\s*inert=\{loading \|\| undefined\}/;
    expect(dimSurface.test(SOURCE)).toBe(true);
  });

  test("③ zameglitev je NEINTERAKTIVNA v obeh smereh (miška IN tipkovnica)", () => {
    // pointer-events-none = klikanje; select-none = izbiranje besedila;
    // inert (React 19) = fokus/aktivacija s tipkovnico + a11y drevo —
    // stara različica načrta med regeneracijo NI uporabna (je v zamenjavi).
    expect(SOURCE).toContain("pointer-events-none select-none opacity-60");
    expect(SOURCE).toContain("inert={loading || undefined}");
    // mehak prehod (300 ms) — ne utripanje ob prehodu v/iz zamegljenosti
    expect(SOURCE).toContain("transition-opacity duration-300");
  });
});

describe("TASK 80 — statusna vrstica (TASK 77) nad zamegljenim načrtom", () => {
  test("④ vrstica je IZVLUČENA (generationStatusBar) in uporabljena NATANČNO 2×", () => {
    expect(SOURCE).toContain("const generationStatusBar = (");
    const uses = SOURCE.match(/\{generationStatusBar\}/g) ?? [];
    expect(uses.length).toBe(2); // 1× v skeletu (prva generacija), 1× nad dim načrtom
  });

  test("⑤ regeneracijski blok: itinerary && loading → vrstica NEODVISNO od formExpanded", () => {
    // Prekliči (edini izhod iz predolge generacije) mora ostati dosegljiv
    // tudi, če uporabnik med generiranjem zloži obrazec.
    const regenBlock =
      /\{itinerary && loading && \(\s*<div\s+className=\{cn\("space-y-4", formExpanded && "mt-6"\)\}\s*role="status"\s*aria-live="polite"\s*>\s*\{generationStatusBar\}/;
    expect(regenBlock.test(SOURCE)).toBe(true);
  });

  test("⑥ prva generacija NESPREMENJENA: intro prostor še vedno skelet z vrstico", () => {
    expect(
      SOURCE.includes(
        "loading ? loadingSkeleton : error ? errorAlert : emptyCard"
      )
    ).toBe(true);
    // TASK 77 regresija: skeleti ostajajo dekorativni (aria-hidden)
    expect(SOURCE).toContain('aria-hidden="true"');
    // TASK 77 regresija: gumb Prekliči še vedno obstaja
    expect(SOURCE).toContain("function handleCancelGeneration");
  });
});

describe("TASK 80 — napaka regeneracije: stari načrt ostane + tiho umikanje", () => {
  test("⑦ error veja pod obrazcem SAMO za napako (nalaganje ne podvaja vrstice)", () => {
    expect(
      SOURCE.includes("formExpanded && itinerary && !loading && error")
    ).toBe(true);
    // stara kombinirana veja (loading || error → poljuben skelet) je odstranjena
    expect(
      SOURCE.includes("formExpanded && itinerary && (loading || error)")
    ).toBe(false);
  });

  test("⑧ X gumb (zapri obrazec) počisti napako — konec mrtvega stanja", () => {
    // Prej: napaka + zložen obrazec → načrt skrit BREZ možnosti prikaza.
    // Sedaj: setError(null) v istem onClick kot setFormExpanded(false).
    const xHandler =
      /setFormExpanded\(false\);\s*\/\/ TASK 80[\s\S]{0,450}?setError\(null\);/;
    expect(xHandler.test(SOURCE)).toBe(true);
  });
});

describe("TASK 80 — analitika: prvo generiranje ≠ regeneracija", () => {
  test("⑨ planner_submitted nosi regeneration: Boolean(itinerary)", () => {
    expect(SOURCE).toContain("regeneration: Boolean(itinerary)");
    // prop je znotraj dogodka planner_submitted (ne drugje).
    // Okno 450 → 650 znakov (TASK 100 je dogodku dodal polje engine —
    // namen testa je članstvo v dogodku, ne dolžina payloada).
    const submitted =
      /trackPlannerEvent\("planner_submitted", \{[\s\S]{0,650}?regeneration: Boolean\(itinerary\),[\s\S]{0,80}?locale,/;
    expect(submitted.test(SOURCE)).toBe(true);
  });
});
