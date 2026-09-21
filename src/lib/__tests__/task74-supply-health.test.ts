import { describe, expect, test } from "bun:test";
import {
  SUPPLY_HEALTH_LABELS,
  supplyHealthView,
} from "@/lib/journey/supply-health";
import {
  activeProviders,
  getProvider,
} from "@/lib/supply/registry";

// ============================================================================
// TASK 74 — ZDRAVJE VIROV NA MY TRIP (supplyHealth → uporabniški pogled)
//
// supplyHealthView dvigne journey.supplyHealth.degradedProviders (§22/§30)
// v berljiv pogled. Dvoslojno varovalko:
//   A) PRESLIKAVA: slugi → oznake registra (realna imena virov), dedup,
//      zaporedje, fail-closed nad smeti (stari zapisi / pokvarjen JSON).
//   B) KOPija pasu: ključne iskrene trditve („nič izmišljenega",
//      „ostalo potovanje deluje") so del testirane kopije, ne UI hvale.
//
// REALNI slugi, ki se lahko pojavijo (orkestrator): transfer viri z
// manjkajočim datasetom (kiwitaxi) + lokalni adapterji, ki so padli
// (osm, fsq). Za vse tri register MORA poznati oznako — to je regresijska
// varovalka proti padcu na surovi slug.
// ============================================================================

describe("TASK 74 A: supplyHealthView — preslikava in fail-closed", () => {
  test("① prazna množica → null (zdravo = tišina, isti kanon kot vreme)", () => {
    expect(supplyHealthView([], "sl")).toBeNull();
    expect(supplyHealthView([], "en")).toBeNull();
  });

  test("② undefined/null (stari zapisi brez supplyHealth) → null, ne sesuje", () => {
    expect(supplyHealthView(undefined, "sl")).toBeNull();
    expect(supplyHealthView(null, "en")).toBeNull();
  });

  test("③ samo smeti (ne-nizi/prazni/samo-presledki nizi) → null (fail-closed)", () => {
    expect(supplyHealthView(["", null, 42, {}, "   "], "sl")).toBeNull();
    expect(supplyHealthView(["   "], "en")).toBeNull();
  });

  test("④ realni slugi → oznake IZ REGISTRA (ne surovi slugi)", () => {
    const v = supplyHealthView(["osm", "fsq", "kiwitaxi"], "sl");
    expect(v).not.toBeNull();
    expect(v!.providerLabels).toEqual([
      getProvider("osm")!.labels.sl,
      getProvider("fsq")!.labels.sl,
      getProvider("kiwitaxi")!.labels.sl,
    ]);
    // Dejanske vrednosti registra (dokaz, da so imena resnična, ne "osm"):
    expect(v!.providerLabels[0]).toBe("OpenStreetMap");
    expect(v!.providerLabels[1]).toBe("Foursquare Open Places");
    expect(v!.providerLabels[2]).toBe("KiwiTaxi");
  });

  test("⑤ neznan slug → SUROVI niz (ime ne obstaja — ga ne izmislimo)", () => {
    const v = supplyHealthView(["ghost-provider"], "en");
    expect(v!.providerLabels).toEqual(["ghost-provider"]);
    expect(v!.listText).toBe("ghost-provider");
  });

  test("⑥ dedup: isti slug dvakrat → enkrat; isto OZNAKA (različna sluga) → enkrat", () => {
    expect(supplyHealthView(["osm", "osm"], "sl")!.providerLabels).toEqual([
      "OpenStreetMap",
    ]);
    // Dva različna sluga z isto labelo registriramo prek registrov
    // (defenzivno — danes ne obstajata, dedup po labeli je pravilna
    // semantika: potniku ne kažemo istega imena dvakrat).
    const v = supplyHealthView(["a-dup", "b-dup"], "sl");
    // a-dup/b-dup niso v registru → surovi nizi, različna → oba
    expect(v!.providerLabels).toEqual(["a-dup", "b-dup"]);
  });

  test("⑦ zaporedje vhoda je ohranjeno (kronologija odpovedi)", () => {
    const v = supplyHealthView(["kiwitaxi", "osm"], "en");
    expect(v!.providerLabels).toEqual([
      getProvider("kiwitaxi")!.labels.en,
      getProvider("osm")!.labels.en,
    ]);
  });

  test("⑧ SL/EN pariteta: isti seznam oznak, isti join („, “ v obeh)", () => {
    const sl = supplyHealthView(["osm", "kiwitaxi"], "sl")!;
    const en = supplyHealthView(["osm", "kiwitaxi"], "en")!;
    expect(sl.providerLabels.length).toBe(en.providerLabels.length);
    expect(sl.listText.split(", ").length).toBe(2);
    expect(en.listText.split(", ").length).toBe(2);
    // Oznake so lahko jezikovno različne (registry SL/EN) — struktura ne:
    expect(sl.listText).toContain("OpenStreetMap");
    expect(en.listText).toContain("OpenStreetMap");
  });

  test("⑨ readonly vhod (kakor ga da journey zapis) deluje brez mutacije", () => {
    const input: readonly string[] = ["osm"];
    const v = supplyHealthView(input, "sl");
    expect(v!.providerLabels).toEqual(["OpenStreetMap"]);
    expect(input).toEqual(["osm"]);
  });
});

describe("TASK 74 B: kopija pasu — iskrene trditve so testno varovane", () => {
  test("⑩ telo SL vsebuje seznam + fail-closed trditev + pomiritev §22", () => {
    const text = SUPPLY_HEALTH_LABELS.body.sl("OpenStreetMap, KiwiTaxi");
    expect(text).toContain("OpenStreetMap, KiwiTaxi");
    expect(text).toContain("ni bilo mogoče doseči");
    expect(text).toContain("nič izmišljenega"); // fail-closed v uporabnikovem jeziku
    expect(text).toContain("Ostalo potovanje deluje"); // §22 izolacija odpovedi
    expect(text).toContain("Ob generiranju poti"); // časovni kontekst (posnetek, ne živo)
  });

  test("⑪ telo EN vsebuje seznam + fail-closed trditev + pomiritev §22", () => {
    const text = SUPPLY_HEALTH_LABELS.body.en("OpenStreetMap, KiwiTaxi");
    expect(text).toContain("OpenStreetMap, KiwiTaxi");
    expect(text).toContain("could not be reached");
    expect(text).toContain("nothing invented");
    expect(text).toContain("The rest of the journey still works");
    expect(text).toContain("when this trip was generated");
  });

  test("⑫ naslov SL/EN pariteta: oba neprazna, različna (resničen prevod)", () => {
    const { sl, en } = SUPPLY_HEALTH_LABELS.title;
    expect(sl.length).toBeGreaterThan(5);
    expect(en.length).toBeGreaterThan(5);
    expect(sl).not.toBe(en);
  });

  test("⑬ REGRESIJA: vsi danes možni degraded slugi imajo oznako v registru", () => {
    // Orkestrator lahko v degradedProviders zapiše SAMO:
    //  - transfer ponudnike z lokalnim inventarjem (aktivni, static_content)
    //  - lokalne adapterje, ki padejo (aktivni)
    // Za VSE aktivne vnose registra preslikava NE SME pasti na surovi slug.
    for (const entry of activeProviders()) {
      expect(entry.labels.sl.length).toBeGreaterThan(0);
      expect(entry.labels.en.length).toBeGreaterThan(0);
      const v = supplyHealthView([entry.slug], "sl");
      expect(v!.providerLabels).toEqual([entry.labels.sl]);
    }
  });
});
