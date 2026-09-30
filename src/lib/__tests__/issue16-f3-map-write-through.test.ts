// ============================================================================
// ISSUE #16 (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE LOSS)
// faza 3 — ZEMLJEVID POI POPUP: KANONSKI WRITE-THROUGH · source-contract
// ----------------------------------------------------------------------------
// Audit #16 vrzel #7: POI popup na /zemljevid ima PRIMARNI gumb
// „+ Dodaj v mojo pot" (class map-poi-add), a je klical IZKLJUČNO
// addProductToSelection (supply izbira načrtovalnika) — NE pa zbirke
// dai:my-trip-items. Oznaka je obljubila „moja pot", podatki pa niso
// prispevali v hub /moja-potovanja. ProductModal in ProductCard (isti
// vir podatkov) pišeta v OBE plasti — popup je bila ZADNJA izjema
// (ostanek problema D8-A P-CTA-1).
//
// Popravek (1.150.0): handler kliče addMyTripItem(supplyTripItem(…,
// "zemljevid")) NEODVISNO od supply izida — addMyTripItem je idempotenten
// (dedup kind:refId), enak vzorec kot ProductModal handleToggleTrip.
//
// Source-contract (readFileSync) — brez uvozov @/app (kanon Task 28/33/34).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const MAP_VIEW_SRC = readFileSync(
  new URL("../../components/sections/map-view.tsx", import.meta.url),
  "utf8",
);
const PRODUCT_MODAL_SRC = readFileSync(
  new URL("../../components/supply/product-modal.tsx", import.meta.url),
  "utf8",
);
const PRODUCT_CARD_SRC = readFileSync(
  new URL("../../components/supply/product-card.tsx", import.meta.url),
  "utf8",
);

describe("ISSUE #16 faza 3: POI popup — kanonski write-through v OBE plasti", () => {
  test("uvoza: addMyTripItem + supplyTripItem (isti vir kot modal/kartica)", () => {
    expect(MAP_VIEW_SRC).toContain('import { addMyTripItem } from "@/lib/my-trip"');
    expect(MAP_VIEW_SRC).toContain(
      'import { supplyTripItem } from "@/lib/supply/my-trip-item"'
    );
  });

  test("handler map-poi-add piše v zbirko „Moja pot“ (source „zemljevid“ — isti vir kot ProductModal)", () => {
    // klic v map-poi-add vejavti (ne v kakšni drugi)
    const branchIdx = MAP_VIEW_SRC.indexOf('target.classList.contains("map-poi-add")');
    const addIdx = MAP_VIEW_SRC.indexOf(
      'addMyTripItem(supplyTripItem(product, lang === "en" ? "en" : "sl", "zemljevid"))'
    );
    expect(branchIdx).toBeGreaterThan(-1);
    expect(addIdx).toBeGreaterThan(branchIdx);
    // klic je NEODVISNO od supply izida — PRED vejitvami result.added/duplicate
    const addedIdx = MAP_VIEW_SRC.indexOf("if (result.added) {", branchIdx);
    expect(addIdx).toBeGreaterThan(branchIdx);
    expect(addIdx).toBeLessThan(addedIdx);
  });

  test("supply mehanika OSTAJA (zero loss): addProductToSelection z jezikom itinererja", () => {
    expect(MAP_VIEW_SRC).toMatch(
      /map-poi-add[\s\S]{0,500}addProductToSelection\(product,[\s\S]{0,120}locale: lang === "en" \? "en" : "sl"/
    );
    // iskreni odzivi ostanejo: dodano/duplikat → ✓; limit → besedilo
    expect(MAP_VIEW_SRC).toContain('sl: "✓ Dodano",');
    expect(MAP_VIEW_SRC).toContain('sl: "Doseženih največ izbir",');
  });

  test("komentar dokumentira popravek #16 faze 3 (prej: SAMO supply izbira)", () => {
    expect(MAP_VIEW_SRC).toContain("ISSUE #16 faza 3 — KANONSKI WRITE-THROUGH");
    expect(MAP_VIEW_SRC).toContain("dai:my-trip-items");
  });
});

describe("ISSUE #16 faza 3: kanonski vzorci ostajajo (zero-loss referendum)", () => {
  test("ProductModal: handleToggleTrip piše v obe plasti (referenca popravka)", () => {
    expect(PRODUCT_MODAL_SRC).toContain(
      'addMyTripItem(supplyTripItem(product, lang, "zemljevid"))'
    );
    expect(PRODUCT_MODAL_SRC).toContain("addProductToSelection(product, { locale: lang })");
  });

  test("ProductCard: onToggle piše v obe plasti + odstranitev pobriše oboje", () => {
    expect(PRODUCT_CARD_SRC).toContain(
      'addMyTripItem(supplyTripItem(product, lang, "zemljevid"))'
    );
    expect(PRODUCT_CARD_SRC).toContain("removeMyTripItem(supplyTripKind(product.type), product.id)");
  });
});
