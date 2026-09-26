// ============================================================================
// TASK 35 (1.111.1) — PAYOUT SWEEP ŠTEVEC olderOpenCount
// ----------------------------------------------------------------------------
// Popravek semantike sweep prikaza v zavihku Izplačila (nadgradnja TASK 34):
//  - GET /api/owner/payouts vrača olderOpenCount = odprte postavke iz obdobij
//    STAREJŠIH od poravnavanega meseca (tekoči mesec NE — pripada naslednji
//    poravnavi);
//  - canGenerate zrcali strežniški pogoj issuePayoutSettlement („vse odprto do
//    vključno prejšnjega meseca") — postavke TEKOČEGA meseca NE omogočijo
//    gumba (sicer gumb obljublja izdajo, ki bi jo strežnik zavrnil z 400
//    „Ni odprtih postavk do vključno …");
//  - sweep hint prikazuje olderOpenCount, NE openPendingCount − lastMonth
//    .entryCount (ta šteje tudi tekoči mesec → lažen overcount) in NE
//    „odprtih skupno … iz starejših obdobij" (openPendingCount vsebuje tudi
//    tekoči mesec → lažna oznaka „starejša").
// Source-contract (readFileSync) — BREZ uvozov @/app/api → brez TASK 76
// obveznosti (kanon Task 28/33/34 za lastniške površine, „NO mock.module").
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/owner/payouts/route.ts");
const panelSrc = read("src/components/owner/payout-ledger-panel.tsx");
const ledgerSrc = read("src/lib/payout-ledger.ts");

// ─────────────────────────────────────────────────────────────────────────
// 1. SOURCE-CONTRACT — API (GET /api/owner/payouts)
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 35: source-contract — GET olderOpenCount (API)", () => {
  test("odgovor vrača olderOpenCount + dokumentiran NEVEZANI sweep komentar", () => {
    expect(routeSrc).toContain("olderOpenCount,");
    expect(routeSrc).toContain(
      "Odprte NEVEZANE postavke iz obdobij STAREJŠIH od poravnavanega"
    );
  });

  test("štetje zajame SAMO nevezane odprte postavke pred poravnavanim mesecem (settlementId null, periodEnd ≤ last.start)", () => {
    // Zadnji payoutEntry.count v GET (za openCount brez filtra, pred
    // pendingEntries findMany) je prav olderOpenCount števec.
    const sweepIdx = routeSrc.lastIndexOf("db.payoutEntry.count({");
    expect(sweepIdx).toBeGreaterThan(-1);
    const findManyIdx = routeSrc.indexOf(
      "db.payoutEntry.findMany({",
      sweepIdx
    );
    expect(findManyIdx).toBeGreaterThan(sweepIdx);
    const block = routeSrc.slice(sweepIdx, findManyIdx);
    // periodEnd je ekskluzivna meja meseca → lte last.start = strogo pred
    // prejšnjim mesecem (postavke prejšnjega meseca so že v
    // lastMonth.entryCount, tekočega meseca pa ne grejo v to izdajo).
    expect(block).toContain("periodEnd: { lte: last.start }");
    expect(block).toContain('status: "pending"');
    // Postavke VEZANE na izdano (še nepotrjeno) poravnavo so status pending
    // do potrditve — pripadajo Njej, ne naslednji izdaji → izključene.
    expect(block).toContain("settlementId: null");
  });

  test("domena: izdaja zajame vse odprto do vključno prejšnjega meseca in postavke VEŽE na poravnavo (isti vir meje)", () => {
    // issuePayoutSettlement — vključna meja (lte last.end) je zgornja meja
    // sweepa; olderOpenCount je strogo pod-spodnji del istega obdobja.
    expect(ledgerSrc).toContain("periodEnd: { lte: last.end }");
    // Vezava postavk ob izdaji (settlementId) — ravno ta polje ločuje
    // „zajeto v obstoječi poravnavi“ od „čaka naslednjo izdajo“.
    expect(ledgerSrc).toContain("settlementId: s.id");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. SOURCE-CONTRACT — UI panel (sweep prikaz + canGenerate)
// ─────────────────────────────────────────────────────────────────────────
describe("TASK 35: source-contract — panel sweep prikaz (UI)", () => {
  test("interface PayoutsData deklarira olderOpenCount", () => {
    expect(panelSrc).toMatch(/olderOpenCount:\s*number/);
  });

  test("canGenerate upošteva SAMO postavke do vključno prejšnjega meseca", () => {
    const canIdx = panelSrc.indexOf("const canGenerate =");
    expect(canIdx).toBeGreaterThan(-1);
    const block = panelSrc.slice(canIdx, canIdx + 300);
    expect(block).toContain("data.lastMonth.entryCount > 0");
    expect(block).toContain("data.olderOpenCount > 0");
    // REGRESIJSKA varovalka: tekoči mesec NE sme omogočiti gumba izdaje
    // (gumb bi obljubljal izdajo, ki jo strežnik zavrne z 400 no_entries).
    expect(block).not.toContain("data.openPendingCount > 0");
  });

  test("sweep hint: olderOpenCount + poštena diferenciacija izdaja/naslednja", () => {
    expect(panelSrc).toContain(
      "iz obdobij pred {data.lastMonth.monthLabel}"
    );
    expect(panelSrc).toContain("zajela jih bo ta izdaja.");
    expect(panelSrc).toContain("zajela jih bo naslednja izdaja.");
  });

  test("REGRESIJSKA varovalka: stari lažni sweep izračuni so ODKLOPLJENI", () => {
    // openPendingCount − lastMonth.entryCount šteje tudi tekoči mesec
    // (postavke, ki NE gredo v to izdajo) → lažen overcount.
    expect(panelSrc).not.toContain(
      "data.openPendingCount - data.lastMonth.entryCount"
    );
    // „odprtih skupno … iz starejših obdobij" je bila lažna oznaka —
    // openPendingCount vsebuje tudi tekoči mesec.
    expect(panelSrc).not.toContain("odprtih skupno:");
    // „(vidne v naslednji poravnavi)" je bila napačna obljuba za postavke
    // tekočega meseca (pripadajo šele prihodnjim poravnavam).
    expect(panelSrc).not.toContain("vidne v naslednji poravnavi");
  });
});
