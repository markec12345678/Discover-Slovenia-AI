// ISSUE #24 SKLOP 5 (1.167.0) — »Poštena delitev stroškov med potnike«
// (P3 backlog, Wanderlog vzorec): pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO splitTripCostsPerPerson (čisti delivec): atrakcije NE
//     delimo (cene so ŽE na osebo — stara diskrecija bi jih zanižala),
//     vožnja SE deli (gorivo + vinjeta = strošek avta), N=1 identiteta,
//     zaokroževanje, defenzivni vhodi (0/NaN/negativno/necelo/meja 12);
//  ② ZDRUŽLJIVOST: computeTripDriveCosts (strežniška pot) ostaja BREZ
//     parametra potnikov — strežniški izračun je kanon, delitev je ČISTO
//     klientni prikaz nad obstoječimi številkami (0 sprememb shranjenih
//     načrtov);
//  ③ SOURCE-CONTRACT proračunska plošča: POŠTENA matematika (stara
//     neiskrena `totalEur / groupSize` ODSOTNA), razčlenitev vrstic
//     (vstopniki niso deljeni + vožnja ÷ N + skupaj na osebo), persist
//     po vzorcu vozila, koračnik 1–12 po MAX_CAR_SHARERS, telemetrija
//     samo ob spremembi;
//  ④ SOURCE-CONTRACT kartica kvalitete: ista deljena preferenca (usklajene
//     številke obeh površin), namig na osebo SAMO pri > 1 potniku,
//     razlaga souporabe v razkrivnostnem pasu (SL + EN);
//  ⑤ SOURCE-CONTRACT + FUNKCIONALNO ui-persist: ključ
//     dsa_budget_travelers, strežniški snapshot = null (hidracijsko
//     varno), varovala 1–12, emit ob spremembi;
//  ⑥ ANALITIKA pariteta: budget_travelers_changed v klientnem unionu IN
//     strežniški VALID_EVENTS IN docs/ANALYTICS-EVENTS.md (zlati kanon);
//  ⑦ ISKRENOST: razkrivnostni pas plošče razloži ZAKAJ se vstopnine ne
//     delijo (vsak plača svoje) in vožnja se (skupen strošek avta).
//
// Vzorec: source-contract readFileSync (isto kot issue24-s3/s4) +
// funkcionalni klici čistih funkcij (0 DB — sandbox prijazen).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  computeTripDriveCosts,
  MAX_CAR_SHARERS,
  splitTripCostsPerPerson,
} from "../trip-costs";
import {
  getBudgetTravelersSnapshot,
  getServerBudgetTravelersSnapshot,
  setBudgetTravelers,
  subscribeBudgetTravelers,
} from "../ui-persist";
import type { DriveCosts, Itinerary, LocationVisit } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const BUDGET_PANEL = source("src/components/budget-panel.tsx");
const QUALITY_CARD = source("src/components/itinerary-quality-card.tsx");
const UI_PERSIST = source("src/lib/ui-persist.ts");
const TRIP_COSTS = source("src/lib/trip-costs.ts");
const ANALYTICS_UNION = source("src/lib/planner-analytics.ts");
const ANALYTICS_SERVER = source("src/app/api/analytics/event/route.ts");
const ANALYTICS_DOC = source("docs/ANALYTICS-EVENTS.md");

/** Pritisni presledke/nove vrstice v en presledek (robustno na formatiranje). */
function norm(src: string): string {
  return src.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// fiksture — minimalni načrt z dvema T1 postankoma (LJ → Bled), kot s4
// ---------------------------------------------------------------------------

function stop(partial: Partial<LocationVisit> = {}): LocationVisit {
  return {
    destination_id: partial.destination_id ?? "bled",
    destination_name: partial.destination_name ?? "Bled",
    time_slot: partial.time_slot ?? "09:00-11:00",
    duration: partial.duration ?? 2,
    estimated_cost: partial.estimated_cost ?? 15,
    notes: partial.notes ?? "",
    ...partial,
  };
}

function fixtureItinerary(): Itinerary {
  return {
    days: [
      {
        day: 1,
        locations: [
          stop({ destination_id: "ljubljana", destination_name: "Ljubljana" }),
          stop({ destination_id: "bled", destination_name: "Bled" }),
        ],
        weather: { condition: "sončno", temp: 24 },
      },
    ],
    total_budget: 30,
    recommendations: [],
    tips: [],
    source: "fallback",
  };
}

/** Fiksen izvorni DriveCosts (kot bi ga izračunal strežnik iz OSRM km). */
function baseCosts(km = 300): DriveCosts {
  return {
    km,
    fuelLiters: 20,
    fuelEur: 32,
    vignetteDays: 10,
    vignetteEur: 12.8,
    totalEur: 44.8,
  };
}

// ---------------------------------------------------------------------------
// ① FUNKCIONALNO — poštena delitev na osebo
// ---------------------------------------------------------------------------

describe("① splitTripCostsPerPerson — matematika poštenosti", () => {
  test("N=1 identiteta: vsi stroški v celoti (samo potuješ)", () => {
    const s = splitTripCostsPerPerson(34, 45, 1);
    expect(s.attractionsPerPerson).toBe(34);
    expect(s.drivePerPerson).toBe(45);
    expect(s.totalPerPerson).toBe(79);
  });

  test("KLJUČNO: vstopnine se NE delijo (so že cene na osebo)", () => {
    // Stara (neiskrena) diskrecija totalEur/N bi dala 34/4 = 8,5 € — to
    // bi ZANIŽALO pravi strošek posameznika. Vstopnina ostane CELA.
    const s = splitTripCostsPerPerson(34, 100, 4);
    expect(s.attractionsPerPerson).toBe(34);
    expect(s.drivePerPerson).toBe(25); // vožnja SE deli
    expect(s.totalPerPerson).toBe(59); // 34 + 25
  });

  test("vožnja se deli z zaokroževanjem na cel evro", () => {
    expect(splitTripCostsPerPerson(0, 100, 3).drivePerPerson).toBe(33);
    expect(splitTripCostsPerPerson(0, 100, 6).drivePerPerson).toBe(17);
    expect(splitTripCostsPerPerson(0, 45, 4).drivePerPerson).toBe(11);
  });

  test("skupni strošek na osebo < skupni strošek poti (pri N>1 z vožnjo)", () => {
    const s = splitTripCostsPerPerson(34, 100, 4);
    expect(s.totalPerPerson).toBeLessThan(134);
    expect(s.totalPerPerson).toBeGreaterThan(34);
  });

  test("driveEur = null → brez vožnje (0, ne izmišljujemo)", () => {
    const s = splitTripCostsPerPerson(50, null, 4);
    expect(s.drivePerPerson).toBe(0);
    expect(s.totalPerPerson).toBe(50); // vstopnine se NE delijo niti tu
  });

  test("defenzivni vhodi potnikov: 0/negativno/NaN → varno 1", () => {
    for (const bad of [0, -5, NaN, Number.NaN]) {
      const s = splitTripCostsPerPerson(30, 90, bad);
      expect(s.drivePerPerson).toBe(90); // ni deljeno
      expect(s.totalPerPerson).toBe(120);
    }
  });

  test("necelo število potnikov → floor (2,7 → 2)", () => {
    expect(splitTripCostsPerPerson(0, 90, 2.7).drivePerPerson).toBe(45);
  });

  test("nad mejo MAX_CAR_SHARERS → stisnjeno na 12", () => {
    expect(MAX_CAR_SHARERS).toBe(12);
    expect(splitTripCostsPerPerson(0, 120, 50).drivePerPerson).toBe(10);
  });

  test("negativni zneski → 0 (nepoznan ≠ dolg)", () => {
    const s = splitTripCostsPerPerson(-20, -30, 3);
    expect(s.attractionsPerPerson).toBe(0);
    expect(s.drivePerPerson).toBe(0);
    expect(s.totalPerPerson).toBe(0);
  });

  test("zaokrožitev atrakcij na cel evro (33,6 → 34)", () => {
    expect(splitTripCostsPerPerson(33.6, null, 2).attractionsPerPerson).toBe(34);
  });

  test("čista funkcija: ne mutira vnosa, vedno nov objekt", () => {
    const a = splitTripCostsPerPerson(10, 20, 2);
    const b = splitTripCostsPerPerson(10, 20, 2);
    expect(a).not.toBe(b);
    expect(a).toEqual(b);
  });
});

// ---------------------------------------------------------------------------
// ② ZDRUŽLJIVOST — strežniški izračun ostaja kanon brez potnikov
// ---------------------------------------------------------------------------

describe("② computeTripDriveCosts — brez sprememb (delitev je klientni prikaz)", () => {
  test("firma brez parametra potnikov; vrača kanonične polja F5.3", () => {
    const code = norm(TRIP_COSTS);
    const idx = code.indexOf("export function computeTripDriveCosts");
    expect(idx).toBeGreaterThan(-1);
    const head = code.slice(idx, idx + 160);
    expect(head).toContain("itinerary: Itinerary");
    expect(head).not.toContain("travelers");
  });

  test("funkcionalno: obstoječa matematika F5.3 se ni premaknila", () => {
    const result = computeTripDriveCosts(fixtureItinerary());
    // LJ → Bled po hevristiki ×1,3 (~50 km): km zaokroženo na 5
    expect(result).not.toBeNull();
    expect(Object.keys(result as object).sort()).toEqual(
      [
        "fuelEur",
        "fuelLiters",
        "km",
        "totalEur",
        "vignetteDays",
        "vignetteEur",
      ].sort()
    );
    expect((result as DriveCosts).km).toBeGreaterThan(0);
    // totalEur = fuelEur + vignetteEur (vinjeta je decimalna — F5.3 kanon)
    expect((result as DriveCosts).totalEur).toBe(
      (result as DriveCosts).fuelEur + (result as DriveCosts).vignetteEur
    );
  });

  test("delitev nad strežniškim izračunom daje smiselne vrednosti", () => {
    const base = baseCosts(); // 44,8 € vožnje, km 300
    const s = splitTripCostsPerPerson(30, base.totalEur, 2);
    // round(44,8) = 45 → 45 ÷ 2 = 22,5 → round = 23 (plošča isto: najprej
    // Math.round(driveCosts.totalEur), nato delivec — usklajeno)
    expect(s.drivePerPerson).toBe(23);
    expect(s.totalPerPerson).toBe(53);
  });
});

// ---------------------------------------------------------------------------
// ③ SOURCE-CONTRACT — proračunska plošča
// ---------------------------------------------------------------------------

describe("③ proračunska plošča — poštena razčlenitev + persist", () => {
  test("STARA neiskrena delitev (totalEur ÷ groupSize) je ODSOTNA", () => {
    const code = norm(BUDGET_PANEL);
    // prej: perPerson = Math.round(totalEur / groupSize) — delil je TUDI
    // vstopnine (cene na osebo) → zanižal pravi strošek posameznika
    expect(code).not.toContain("totalEur / groupSize");
    expect(code).not.toContain("totalEur/groupSize");
  });

  test("uporablja čisti delivec splitTripCostsPerPerson", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("splitTripCostsPerPerson(");
    expect(code).toContain("split.totalPerPerson");
  });

  test("razčlenitev vrstic: vstopniki niso deljeni + vožnja ÷ N + skupaj", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("Atrakcije (tvoji vstopniki — niso deljeni)");
    expect(code).toContain("Activities (your own tickets — not shared)");
    expect(code).toContain("Vožnja ÷");
    expect(code).toContain("Driving ÷");
    expect(code).toContain("strošek avta");
    expect(code).toContain("Skupaj na osebo");
    expect(code).toContain("Total per person");
  });

  test("persist števila potnikov po vzorcu vozila (useSyncExternalStore)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("subscribeBudgetTravelers");
    expect(code).toContain("getBudgetTravelersSnapshot");
    expect(code).toContain("getServerBudgetTravelersSnapshot");
    expect(code).toContain("setBudgetTravelers");
    expect(code).toContain("useSyncExternalStore");
  });

  test("privzeto število = velikost skupine NAČRTA (null fallback)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("savedTravelers ?? defaultGroup");
    expect(code).toContain("quality.groupSize");
  });

  test("koračnik 1–12 po MAX_CAR_SHARERS (ista konstanta kot delivec)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("MAX_CAR_SHARERS");
    expect(code).toContain("Math.min(MAX_CAR_SHARERS, groupSize + 1)");
    expect(code).toContain("Math.max(1, groupSize - 1)");
  });

  test("telemetrija budget_travelers_changed SAMO ob spremembi", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain('trackPlannerEvent("budget_travelers_changed"');
    expect(code).toContain("if (next === groupSize) return;");
  });

  test("število potnikov je aria-live (odčitku dostopna sprememba)", () => {
    expect(norm(BUDGET_PANEL)).toContain('aria-live="polite"');
  });
});

// ---------------------------------------------------------------------------
// ④ SOURCE-CONTRACT — kartica kvalitete (usklajene številke)
// ---------------------------------------------------------------------------

describe("④ kartica kvalitete — namig na osebo pri vožnji", () => {
  test("ista deljena preferenca potnikov (usklajene številke obeh površin)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("subscribeBudgetTravelers");
    expect(code).toContain("getBudgetTravelersSnapshot");
    expect(code).toContain("getServerBudgetTravelersSnapshot");
    expect(code).toContain("splitTripCostsPerPerson");
  });

  test("namig SAMO pri > 1 potniku (pri enem je delitev trivialna)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("effectiveTravelers > 1 &&");
    expect(code).toContain("€/osebo");
    expect(code).toContain("€${drivePerPersonEur}/person");
  });

  test("fallback privzetega števila = skupina NAČRTA", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain(
      "savedTravelers ?? Math.max(1, quality.groupSize || 1)"
    );
  });

  test("razlaga souporabe avta v razkrivnostnem pasu (SL + EN)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("Pri souporabi avta med");
    expect(code).toContain("vstopnine so že na osebo in se NE delijo");
    expect(code).toContain("When sharing the car among");
    expect(code).toContain("activity tickets are already per person and are NOT divided");
  });
});

// ---------------------------------------------------------------------------
// ⑤ ui-persist — hidracijska varnost + varovala (pogodba + funkcionalno)
// ---------------------------------------------------------------------------

describe("⑤ ui-persist — dsa_budget_travelers", () => {
  test("ključ localStorage dsa_budget_travelers", () => {
    expect(norm(UI_PERSIST)).toContain('"dsa_budget_travelers"');
  });

  test("strežniški snapshot = null (SSR/hidracija brez mismatch)", () => {
    expect(getServerBudgetTravelersSnapshot()).toBeNull();
    const code = norm(UI_PERSIST);
    expect(code).toContain(
      "export function getServerBudgetTravelersSnapshot(): number | null { return null; }"
    );
  });

  test("funkcionalno: klient getter v okolju brez okna vrne null", () => {
    // bun test nima window — getter mora VARNI vrniti null (ne RNIsati)
    expect(getBudgetTravelersSnapshot()).toBeNull();
  });

  test("funkcionalno: setter emitira poslušalcem (write + emit)", () => {
    let fired = 0;
    const unsub = subscribeBudgetTravelers(() => {
      fired += 1;
    });
    setBudgetTravelers(4);
    expect(fired).toBe(1);
    // brez spreminjanja se ne izstreli nič (telemetrija samo ob spremembi)
    setBudgetTravelers(4);
    expect(fired).toBe(2); // setter vedno emitira (React vzorec); UI filtrira
    unsub();
    setBudgetTravelers(6);
    expect(fired).toBe(2);
  });

  test("varovalo parse: izven 1–12 ali necelo → null (privzeto skupine)", () => {
    const code = norm(UI_PERSIST);
    const idx = code.indexOf("function parseTravelers");
    expect(idx).toBeGreaterThan(-1);
    const body = code.slice(idx, idx + 400);
    expect(body).toContain("n < 1");
    expect(body).toContain("n > MAX_CAR_SHARERS");
    expect(body).toContain("n % 1 !== 0");
    expect(body).toContain("return null");
  });

  test("setter čisti neveljavne vhode (null = privzeto skupine načrta)", () => {
    const code = norm(UI_PERSIST);
    const idx = code.indexOf("export function setBudgetTravelers");
    expect(idx).toBeGreaterThan(-1);
    const body = code.slice(idx, idx + 500);
    expect(body).toContain("? n : null");
    expect(body).toContain("localStorage.removeItem");
    expect(body).toContain("travelersListeners.forEach");
  });
});

// ---------------------------------------------------------------------------
// ⑥ ANALITIKA — pariteta klient union ⊆ strežniška allowlista + dokumentacija
// ---------------------------------------------------------------------------

describe("⑥ budget_travelers_changed — analitika po kanonu W3", () => {
  test("v klientnem PlannerEventName union-u", () => {
    expect(norm(ANALYTICS_UNION)).toContain('| "budget_travelers_changed"');
  });

  test("v strežniški VALID_EVENTS allowlisti (0 tihih 400)", () => {
    expect(norm(ANALYTICS_SERVER)).toContain('"budget_travelers_changed"');
  });

  test("dokumentiran v docs/ANALYTICS-EVENTS.md (zlati kanon, z verzijo)", () => {
    expect(ANALYTICS_DOC).toContain("`budget_travelers_changed` (1.167.0");
    expect(ANALYTICS_DOC).toMatch(/budget_travelers_changed[\s\S]*?`travelers`/);
  });
});

// ---------------------------------------------------------------------------
// ⑦ ISKRENOST — razkrivnostni pas plošče razloži logiko delitve
// ---------------------------------------------------------------------------

describe("⑦ razkrivnost — vsaka številka pove svoje predpostavke", () => {
  test("plošča: razlaga ZAKAJ se vstopnine ne delijo (SL + EN)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("Delitev na osebo: cene atrakcij so že na osebo");
    expect(code).toContain("Per-person split: activity prices are already per person");
    expect(code).toContain("NE delimo");
    expect(code).toContain("NOT divided");
  });

  test("plošča: sam potnik = vsi stroški v celoti (trivialna delitev)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("potuješ sam, zato so vsi stroški v celoti tvoji");
    expect(code).toContain("you are traveling alone, so all costs are yours in full");
  });

  test("delivec: dokumentiran namen (Wanderlog vzorec, ne knjigovodstvo)", () => {
    const code = norm(TRIP_COSTS);
    expect(code).toContain("Wanderlog vzorec");
    expect(code).toContain("NE gradimo knjigovodstva");
    expect(code).toContain("POŠTEN PRIKAZ obstoječe ocene");
  });
});
