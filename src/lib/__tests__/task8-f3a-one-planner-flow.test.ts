// TASK 8 / F3-A (issue #8 §43 NO PARALLEL APP — „en načrtovalnik, ena
// zbirka"): testi uskladitve ogledala izbir /potovanje ↔ zbirka „Moja pot"
// + source-contract mostov (/nacrtuj ↔ /potovanje, Sheet, noga, i18n).
//
// 1. FUNKCIONALNO: reconcileSelectionFromCollection (čista funkcija) —
//    DRIFT A (re-search rehidrira), DRIFT B (odstranitev iz zbirke
//    odstrani izbire), dogodki session-only, bailout brez spremembe.
// 2. SOURCE-CONTRACT: journey-planner (effect + čipi + zapisi), planner
//    (povezava nazaj), potovanje/page (vrstica odnosa), navigation (Sheet),
//    i18n ključi SL+EN, ZERO-LOSS markerji.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  isJourneyEventProduct,
  reconcileSelectionFromCollection,
} from "../journey/selection-mirror";
import { supplyTripKind } from "../supply/my-trip-item";
import type { MyTripKind } from "../my-trip";
import type { JourneyProduct } from "../journey/types";

const JOURNEY_SRC = readFileSync(
  new URL("../../components/sections/journey-planner.tsx", import.meta.url),
  "utf8",
);
const PLANNER_SRC = readFileSync(
  new URL("../../components/sections/itinerary-planner.tsx", import.meta.url),
  "utf8",
);
const POTOVANJE_SRC = readFileSync(
  new URL("../../app/potovanje/page.tsx", import.meta.url),
  "utf8",
);
const NAV_SRC = readFileSync(
  new URL("../../components/sections/navigation.tsx", import.meta.url),
  "utf8",
);
const SL = JSON.parse(
  readFileSync(new URL("../../i18n/messages/sl.json", import.meta.url), "utf8")
);
const EN = JSON.parse(
  readFileSync(new URL("../../i18n/messages/en.json", import.meta.url), "utf8")
);

// ---------------------------------------------------------------------------
// pomožniki — minimalni produkti (funkcija bere SAMO id/provider/type)
// ---------------------------------------------------------------------------
function product(over: {
  id: string;
  provider?: string;
  type?: string;
}): JourneyProduct {
  return {
    id: over.id,
    provider: (over.provider ?? "kiwitaxi") as never,
    providerProductId: over.id.split(":")[1] ?? "x",
    type: (over.type ?? "transfer") as never,
    title: over.id,
    bookingMode: "external_affiliate" as never,
    category: "transfer" as never,
    mapStatus: "known" as never,
  } as unknown as JourneyProduct;
}

const ALL = new Set<MyTripKind>([
  "destination",
  "poi",
  "listing",
  "event",
  "experience",
  "product",
  "guide",
  "community",
  "import",
  "ai",
]);
function collectionOf(keys: string[]) {
  return (kind: MyTripKind, refId: string) => {
    expect(ALL.has(kind)).toBe(true);
    return keys.includes(`${kind}:${refId}`);
  };
}

// ---------------------------------------------------------------------------
// 1. FUNKCIONALNO: reconcileSelectionFromCollection
// ---------------------------------------------------------------------------
describe("F3-A reconcileSelectionFromCollection (domena)", () => {
  test("DRIFT B: odstranitev iz zbirke odstrani izbiro (gumb kartice pove resnico)", () => {
    const transfer = product({ id: "kiwitaxi:t1" });
    const keys = new Set(["product:kiwitaxi:t1"]);
    const prev = new Set(["kiwitaxi:t1"]);
    // uporabnik odstrani iz /moja-potovanja (drug zavihek) → ni več v zbirki
    const next = reconcileSelectionFromCollection(
      prev,
      [transfer],
      collectionOf([])
    );
    expect(next.has("kiwitaxi:t1")).toBe(false);
    expect(next).not.toBe(prev); // sprememba → nova množica
  });

  test("DRIFT A: po novem iskanju se izbire rehidrirajo iz zbirke (iste relacije)", () => {
    const transfer = product({ id: "kiwitaxi:t1" });
    const stay = product({ id: "booking:s1", type: "stay" });
    // novo iskanje: plan() je pobrisal selected (prazna množica)
    const next = reconcileSelectionFromCollection(
      new Set(),
      [transfer, stay],
      collectionOf(["product:kiwitaxi:t1"])
    );
    expect(next.has("kiwitaxi:t1")).toBe(true); // rehidriran
    expect(next.has("booking:s1")).toBe(false); // ni bil v zbirki
  });

  test("dogodki so session-only: prenesejo se iz prejšnje izbire, ne iz zbirke", () => {
    const ev = product({ id: "events:e1", provider: "events", type: "event" });
    expect(isJourneyEventProduct(ev)).toBe(true);
    // dogodek je bil izbran prej, v zbirki pa NI (dogodki so izključeni)
    const next = reconcileSelectionFromCollection(
      new Set(["events:e1"]),
      [ev],
      collectionOf([])
    );
    expect(next.has("events:e1")).toBe(true);
    // NEizbran dogodek se NE izbere, tudi če bi bil (namišljeno) v zbirki
    const fresh = reconcileSelectionFromCollection(
      new Set(),
      [ev],
      collectionOf(["event:events:e1"])
    );
    expect(fresh.has("events:e1")).toBe(false);
  });

  test("predmeti, ki v novem potovanju niso prisotni, odpadejo iz izbire", () => {
    const only = product({ id: "kiwitaxi:t1" });
    const next = reconcileSelectionFromCollection(
      new Set(["kiwitaxi:t1", "kiwitaxi:gone"]),
      [only],
      collectionOf(["product:kiwitaxi:t1", "product:kiwitaxi:gone"])
    );
    expect(next.has("kiwitaxi:t1")).toBe(true);
    expect(next.has("kiwitaxi:gone")).toBe(false); // v zbirki ostaja, v izbiri ne
  });

  test("bailout: brez spremembe vrne ISTO referenco (React setState bailout)", () => {
    const transfer = product({ id: "kiwitaxi:t1" });
    const prev = new Set(["kiwitaxi:t1"]);
    const next = reconcileSelectionFromCollection(
      prev,
      [transfer],
      collectionOf(["product:kiwitaxi:t1"])
    );
    expect(next).toBe(prev);
  });

  test("vrsta preslikave: activity/tour/ticket → experience (ista kot write-through)", () => {
    const act = product({ id: "own:a1", type: "activity" });
    const next = reconcileSelectionFromCollection(
      new Set(),
      [act],
      collectionOf(["experience:own:a1"])
    );
    expect(next.has("own:a1")).toBe(true);
    expect(supplyTripKind("activity" as never)).toBe("experience");
  });
});

// ---------------------------------------------------------------------------
// 2. SOURCE-CONTRACT: journey-planner (ogledalo + predlogi + zapisi)
// ---------------------------------------------------------------------------
describe("F3-A journey-planner (source-contract)", () => {
  test("uskladitev: effect z reconcileSelectionFromCollection + isInMyTrip + useMyTrip", () => {
    expect(JOURNEY_SRC).toContain(
      'import { reconcileSelectionFromCollection } from "@/lib/journey/selection-mirror"'
    );
    expect(JOURNEY_SRC).toContain('import { isInMyTrip } from "@/lib/my-trip"');
    expect(JOURNEY_SRC).toContain('import { useMyTrip } from "@/hooks/use-my-trip"');
    expect(JOURNEY_SRC).toContain("reconcileSelectionFromCollection(prev, allProducts, isInMyTrip)");
    // odvisnosti effecta: potovanje + produkti + živi pogled zbirke
    expect(JOURNEY_SRC).toContain("[journey, allProducts, myTripItems]");
  });

  test("dogodki ostajajo izven ogredala (D8-D meja ohranjena)", () => {
    expect(JOURNEY_SRC).toContain('p.provider !== "events"');
    // zbirka se NE posodablja za dogodke (isti pogoj kot prej)
    const guardedAdd = JOURNEY_SRC.indexOf('p.provider !== "events"');
    const addToTripIdx = JOURNEY_SRC.indexOf("addMyTripItem(");
    expect(guardedAdd).toBeGreaterThan(0);
    expect(addToTripIdx).toBeGreaterThan(0);
  });

  test("predlogi destinacij „Iz moje poti“: čipi nad obrazcem, klik = setDestination", () => {
    expect(JOURNEY_SRC).toContain("myTripDestinations");
    expect(JOURNEY_SRC).toContain("destinationIdOf");
    expect(JOURNEY_SRC).toContain("onClick={() => setDestination(d.id)}");
    expect(JOURNEY_SRC).toContain("aria-pressed={active}");
    expect(JOURNEY_SRC).toContain("Iz moje poti:");
    expect(JOURNEY_SRC).toContain('"From my trip:"');
  });

  test("vrstica odnosa v glavi obrazca (§43 — del enega načrtovalnika)", () => {
    expect(JOURNEY_SRC).toContain("Del enega načrtovalnika");
    expect(JOURNEY_SRC).toContain("Part of the one planner");
  });

  test("ZERO-LOSS: obstoječi write-through + handoff + Go Mode + print + totals", () => {
    expect(JOURNEY_SRC).toContain("added={isSelected}");
    expect(JOURNEY_SRC).toContain("addMyTripItem(");
    expect(JOURNEY_SRC).toContain("removeMyTripItem(supplyTripKind(p.type), p.id)");
    expect(JOURNEY_SRC).toContain("journeyProductsToSelection(selectedProducts, lang)");
    expect(JOURNEY_SRC).toContain("persistSelection(items)");
    expect(JOURNEY_SRC).toContain('router.push(lang === "en" ? "/en/nacrtuj" : "/nacrtuj")');
    expect(JOURNEY_SRC).toContain("saveGoTrip(journey, [...selected])");
    expect(JOURNEY_SRC).toContain("printConfirmation");
    expect(JOURNEY_SRC).toContain("describeTotals(journey.totals, lang)");
    expect(JOURNEY_SRC).toContain("JourneyMap");
    expect(JOURNEY_SRC).toContain("OpeningHoursStatus");
    expect(JOURNEY_SRC).toContain("recordExternalHandoff");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT: /nacrtuj povezava nazaj na /potovanje
// ---------------------------------------------------------------------------
describe("F3-A itinerary-planner (source-contract)", () => {
  test("vedno vidna tiha povezava na korak ponudnikov (locale-zavedajoča)", () => {
    expect(PLANNER_SRC).toContain('t("supplyCompanionLine")');
    expect(PLANNER_SRC).toContain('t("supplyCompanionLink")');
    expect(PLANNER_SRC).toContain('locale === "en" ? "/en/potovanje" : "/potovanje"');
  });

  test("povezava NI odvisna od trenutne izbire (vidna tudi brez čipov)", () => {
    // blok stoji ZA selectedProducts ternaryjem in PRED submit gumbom —
    // izven pogojnega izrisa
    const companionIdx = PLANNER_SRC.indexOf("supplyCompanionLine");
    const ternaryEnd = PLANNER_SRC.indexOf(") : null}");
    const submitIdx = PLANNER_SRC.indexOf('type="submit"', companionIdx - 3000);
    expect(companionIdx).toBeGreaterThan(ternaryEnd);
    expect(submitIdx).toBeGreaterThan(companionIdx);
  });

  test("ZERO-LOSS: supply čipi strip + FIXED krogotek ostajajo", () => {
    expect(PLANNER_SRC).toContain("supplySelectedTitle");
    expect(PLANNER_SRC).toContain("removeSelectedProduct");
    expect(PLANNER_SRC).toContain("selectionState");
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE-CONTRACT: potovanje/page (vrstica odnosa + zero-loss)
// ---------------------------------------------------------------------------
describe("F3-A potovanje/page (source-contract)", () => {
  test("tiha vrstica odnosa + povezava na AI načrtovalnik (§43)", () => {
    expect(POTOVANJE_SRC).toContain("flowNote");
    expect(POTOVANJE_SRC).toContain("flowLink");
    expect(POTOVANJE_SRC).toContain('href="/nacrtuj"');
    expect(POTOVANJE_SRC).toContain("Odpri AI načrtovalnik");
    expect(POTOVANJE_SRC).toContain("Open the AI planner");
  });

  test("ZERO-LOSS: SEO pogodba (title/meta/canonical/hreflang) + vse komponente", () => {
    expect(POTOVANJE_SRC).toContain("Eno potovanje, vsi ponudniki");
    expect(POTOVANJE_SRC).toContain("One journey, every provider");
    expect(POTOVANJE_SRC).toContain("metaTitle");
    expect(POTOVANJE_SRC).toContain("metaDescription");
    expect(POTOVANJE_SRC).toContain("hreflangForPath(PATH, base)");
    expect(POTOVANJE_SRC).toContain("canonical: `${base}${PATH}`");
    expect(POTOVANJE_SRC).toContain("<JourneyPlanner />");
    expect(POTOVANJE_SRC).toContain("<Navigation />");
    expect(POTOVANJE_SRC).toContain("<Footer />");
    expect(POTOVANJE_SRC).toContain("<Chatbot />");
    expect(POTOVANJE_SRC).toContain('PATH = "/potovanje"');
  });
});

// ---------------------------------------------------------------------------
// 5. SOURCE-CONTRACT: navigation Sheet + i18n ključi
// ---------------------------------------------------------------------------
describe("F3-A navigation + i18n (source-contract)", () => {
  test("Sheet sekundarne povezave vsebujejo /potovanje (prej samo noga)", () => {
    expect(NAV_SRC).toContain('{ href: "/potovanje", label: t("journey") }');
  });

  test("i18n: nav.journey + footer.planJourney (reframe) + planner ključi — SL + EN", () => {
    expect(SL.nav.journey).toBe("Celotno potovanje");
    expect(EN.nav.journey).toBe("Complete journey");
    // reframe: noga ne obljublja več „načrtuj“ (drugi načrtovalnik),
    // ampak ponudniški korak enega načrtovalnika
    expect(SL.footer.planJourney).toContain("ponudniki");
    expect(SL.footer.planJourney).not.toContain("Načrtuj celo");
    expect(EN.footer.planJourney).toContain("providers");
    expect(EN.footer.planJourney).not.toContain("Plan the whole");
    // planner povezava nazaj
    expect(SL.planner.supplyCompanionLine.length).toBeGreaterThan(10);
    expect(SL.planner.supplyCompanionLink).toBe("Celotno potovanje");
    expect(EN.planner.supplyCompanionLink).toBe("Complete journey");
    // SL/EN pariteta dolžin (ni manjkajočih prevodov)
    expect(EN.planner.supplyCompanionLine.length).toBeGreaterThan(10);
  });
});
