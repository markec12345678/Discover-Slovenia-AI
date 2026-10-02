// ISSUE #24 SKLOP 4 (1.166.0) — »Strošek goriva po vrsti vozila« (P3 backlog,
// Roadtrippers vzorec): pogodbenski + funkcionalni testi.
//
// Obseg:
//  ① FUNKCIONALNO VEHICLE_PROFILES + driveCostsForVehicle (čist delivec):
//     matematika profilov, ohranitev km/vinjete iz izvira, bit-identiteta
//     privzetega bencina s staro F5.3 formulo, idempotentnost, EV enota kWh;
//  ② ZDRUŽLJIVOST: computeTripDriveCosts (strežniška pot) NE nastavi polja
//     vehicle — vsi shranjeni načrti ostanejo veljavni brez spremembe;
//  ③ SOURCE-CONTRACT proračunska plošča: radiogroup izbirnik (4 možnosti,
//     aria), persist po vzorcu cilja, podatkovno-usmerjena formula (utrjena
//     konstanta v besedilu je ODSTRANJENA), EV pas negotovosti elektrike,
//     telemetrija ob spremembi;
//  ④ SOURCE-CONTRACT kartica kvalitete: ista deljena preferenca (usklajene
//     številke obeh površin), podatkovno-usmerjena formula, EV oznake;
//  ⑤ SOURCE-CONTRACT ui-persist: ključ dsa_budget_vehicle, strežniški
//     snapshot = privzeti bencin (hidracijska varnost), emit ob spremembi;
//  ⑥ ANALITIKA pariteta: budget_vehicle_changed v klientnem unionu IN
//     strežniški VALID_EVENTS IN docs/ANALYTICS-EVENTS.md (zlati kanon);
//  ⑦ SOURCE-CONTRACT types: VehicleKind izvožen, vehicle? na DriveCosts.
//
// Vzorec: source-contract readFileSync (isto kot issue24-s3 / w3) +
// funkcionalni klici čistih funkcij (0 DB — sandbox prijazen).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  computeTripDriveCosts,
  driveCostsForVehicle,
  FUEL_CONSUMPTION_L_PER_100,
  FUEL_PRICE_EUR_PER_L,
  isVehicleKind,
  VEHICLE_KINDS,
  VEHICLE_PROFILES,
} from "../trip-costs";
import type { DriveCosts, Itinerary, LocationVisit } from "../types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const BUDGET_PANEL = source("src/components/budget-panel.tsx");
const QUALITY_CARD = source("src/components/itinerary-quality-card.tsx");
const UI_PERSIST = source("src/lib/ui-persist.ts");
const TRIP_COSTS = source("src/lib/trip-costs.ts");
const TYPES = source("src/lib/types.ts");
const ANALYTICS_UNION = source("src/lib/planner-analytics.ts");
const ANALYTICS_SERVER = source("src/app/api/analytics/event/route.ts");
const ANALYTICS_DOC = source("docs/ANALYTICS-EVENTS.md");

/** Pritisni presledke/nove vrstice v en presledek (robustno na formatiranje). */
function norm(src: string): string {
  return src.replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// fiksture — minimalni načrt z dvema T1 postankoma (LJ → Bled), kot plan-qa
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
// ① FUNKCIONALNO — profili + preštevalna funkcija
// ---------------------------------------------------------------------------

describe("① VEHICLE_PROFILES — 4 profili, razkriti, pošteni", () => {
  test("natanko 4 vrste v stabilnem vrstnem redu", () => {
    expect(VEHICLE_KINDS).toEqual(["petrol", "diesel", "hybrid", "ev"]);
    expect(Object.keys(VEHICLE_PROFILES).sort()).toEqual(
      ["diesel", "ev", "hybrid", "petrol"].sort()
    );
  });

  test("privzeti bencin IZPELJAN iz obstoječih F5.3 konstant (bit-identiteta)", () => {
    // Ključna varovala: sprememba profila ne sme spremeniti privzete slike
    // strežniškega izračuna (plan-qa pini isti formuli).
    expect(VEHICLE_PROFILES.petrol.consumptionPer100).toBe(
      FUEL_CONSUMPTION_L_PER_100
    );
    expect(VEHICLE_PROFILES.petrol.pricePerUnit).toBe(FUEL_PRICE_EUR_PER_L);
    expect(VEHICLE_PROFILES.petrol.unit).toBe("l");
  });

  test("vsi profili: pozitivna poraba in cena; enote poštene (EV = kWh)", () => {
    for (const [kind, p] of Object.entries(VEHICLE_PROFILES)) {
      expect(p.consumptionPer100).toBeGreaterThan(0);
      expect(p.pricePerUnit).toBeGreaterThan(0);
      expect(["l", "kWh"]).toContain(p.unit);
      expect(kind).toBe(kind); // iteracija zdrava
    }
    expect(VEHICLE_PROFILES.ev.unit).toBe("kWh");
    expect(VEHICLE_PROFILES.diesel.unit).toBe("l");
    expect(VEHICLE_PROFILES.hybrid.unit).toBe("l");
  });

  test("hibrid vozi na bencin (ista regulirana cena), dizel je cenejši na liter", () => {
    expect(VEHICLE_PROFILES.hybrid.pricePerUnit).toBe(
      VEHICLE_PROFILES.petrol.pricePerUnit
    );
    // dizel: cenejša enota, nižja poraba — oba vpliva smer pravilno
    expect(VEHICLE_PROFILES.diesel.pricePerUnit).toBeLessThan(
      VEHICLE_PROFILES.petrol.pricePerUnit
    );
    expect(VEHICLE_PROFILES.diesel.consumptionPer100).toBeLessThan(
      VEHICLE_PROFILES.petrol.consumptionPer100
    );
  });

  test("isVehicleKind type guard", () => {
    expect(isVehicleKind("petrol")).toBe(true);
    expect(isVehicleKind("diesel")).toBe(true);
    expect(isVehicleKind("hybrid")).toBe(true);
    expect(isVehicleKind("ev")).toBe(true);
    expect(isVehicleKind("tesla")).toBe(false);
    expect(isVehicleKind(null)).toBe(false);
    expect(isVehicleKind(undefined)).toBe(false);
  });
});

describe("① driveCostsForVehicle — čista preštevalna funkcija", () => {
  test("matematika vseh štirih profilov nad km = 300, vinjeta = 12,8 €", () => {
    const base = baseCosts(300);
    // bencin: 300/100 × 6,5 = 19,5 → 20 l; 20 × 1,6 = 32 €; skupaj 44,8
    const petrol = driveCostsForVehicle(base, "petrol");
    expect(petrol.fuelLiters).toBe(20);
    expect(petrol.fuelEur).toBe(32);
    expect(petrol.totalEur).toBe(44.8);
    // dizel: 300/100 × 5,5 = 16,5 → 17 l; 17 × 1,5 = 25,5 → 26 €; skupaj 38,8
    const diesel = driveCostsForVehicle(base, "diesel");
    expect(diesel.fuelLiters).toBe(17);
    expect(diesel.fuelEur).toBe(26);
    expect(diesel.totalEur).toBe(38.8);
    // hibrid: 13,5 → 14 l; 14 × 1,6 = 22,4 → 22 €; skupaj 34,8
    const hybrid = driveCostsForVehicle(base, "hybrid");
    expect(hybrid.fuelLiters).toBe(14);
    expect(hybrid.fuelEur).toBe(22);
    expect(hybrid.totalEur).toBe(34.8);
    // EV: 54 kWh; 54 × 0,4 = 21,6 → 22 €; skupaj 34,8
    const ev = driveCostsForVehicle(base, "ev");
    expect(ev.fuelLiters).toBe(54); // kWh (enota v profilu)
    expect(ev.fuelEur).toBe(22);
    expect(ev.totalEur).toBe(34.8);
  });

  test("km in vinjeta se PREPIŠETA iz izvira (vozilo ne spreminja poti ne cestnine)", () => {
    const base = baseCosts(123);
    for (const kind of VEHICLE_KINDS) {
      const out = driveCostsForVehicle(base, kind);
      expect(out.km).toBe(123);
      expect(out.vignetteDays).toBe(base.vignetteDays);
      expect(out.vignetteEur).toBe(base.vignetteEur);
      expect(out.totalEur).toBe(out.fuelEur + base.vignetteEur);
    }
  });

  test("privzeti bencin = STARA F5.3 formula, bit po bit (nad istimi km)", () => {
    const base = baseCosts(237);
    const out = driveCostsForVehicle(base, "petrol");
    // stara formula iz computeTripDriveCosts (plan-qa pinjana):
    const legacyQty = Math.round(
      (base.km / 100) * FUEL_CONSUMPTION_L_PER_100
    );
    const legacyEur = Math.round(legacyQty * FUEL_PRICE_EUR_PER_L);
    expect(out.fuelLiters).toBe(legacyQty);
    expect(out.fuelEur).toBe(legacyEur);
    expect(out.totalEur).toBe(legacyEur + base.vignetteEur);
  });

  test("idempotentnost: dvojna preštevanja da isto sliko", () => {
    const base = baseCosts(300);
    const once = driveCostsForVehicle(base, "diesel");
    const twice = driveCostsForVehicle(once, "diesel");
    expect(twice).toEqual({ ...once });
  });

  test("polje vehicle se vedno nastavi (sledljivost profila v odgovoru)", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(driveCostsForVehicle(baseCosts(), kind).vehicle).toBe(kind);
    }
  });

  test("robni primer km = 0: količina 0, vinjeta ostane", () => {
    const out = driveCostsForVehicle(baseCosts(0), "ev");
    expect(out.fuelLiters).toBe(0);
    expect(out.fuelEur).toBe(0);
    expect(out.totalEur).toBe(baseCosts(0).vignetteEur);
  });
});

// ---------------------------------------------------------------------------
// ② ZDRUŽLJIVOST — strežniška pot ostane netaknjena
// ---------------------------------------------------------------------------

describe("② computeTripDriveCosts — privzeti izračun brez polja vehicle", () => {
  test("rezultat strežniške funkcije NE nastavi vehicle (odsotno = bencin)", () => {
    const out = computeTripDriveCosts(fixtureItinerary());
    expect(out).not.toBeNull();
    expect(out!.vehicle).toBeUndefined();
    // stara formula (isti pin kot plan-qa):
    expect(out!.fuelLiters).toBe(
      Math.round((out!.km / 100) * FUEL_CONSUMPTION_L_PER_100)
    );
    expect(out!.fuelEur).toBe(
      Math.round(out!.fuelLiters * FUEL_PRICE_EUR_PER_L)
    );
  });

  test("recompute bencina nad strežniškim rezultatom je identičen (0 tveganja)", () => {
    const server = computeTripDriveCosts(fixtureItinerary())!;
    const recompute = driveCostsForVehicle(server, "petrol");
    expect(recompute.km).toBe(server.km);
    expect(recompute.fuelLiters).toBe(server.fuelLiters);
    expect(recompute.fuelEur).toBe(server.fuelEur);
    expect(recompute.totalEur).toBe(server.totalEur);
    expect(recompute.vehicle).toBe("petrol"); // edina razlika: označen profil
  });
});

// ---------------------------------------------------------------------------
// ③ SOURCE-CONTRACT — proračunska plošča (izbirnik + poštena formula)
// ---------------------------------------------------------------------------

describe("③ BudgetPanel — izbirnik vrste vozila (source contract)", () => {
  test("radiogroup z role=radio + aria-checked (a11y)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain('role="radiogroup"');
    expect(code).toContain('role="radio"');
    expect(code).toContain("aria-checked={active}");
    expect(code).toContain("aria-labelledby=");
  });

  test("vse 4 možnosti dvojezično (Bencin/Dizel/Hibrid/Električni + EN)", () => {
    const code = norm(BUDGET_PANEL);
    for (const sl of ["Bencin", "Dizel", "Hibrid", "Električni"]) {
      expect(code).toContain(`"${sl}"`);
    }
    for (const en of ["Petrol", "Diesel", "Hybrid", "Electric"]) {
      expect(code).toContain(`"${en}"`);
    }
    // moznosti sledijo VEHICLE_KINDS (en vir resnice za vrstni red)
    expect(code).toContain("VEHICLE_KINDS.map");
  });

  test("persist po vzorcu proračunskega cilja (localStorage, ne stanje načrta)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("subscribeBudgetVehicle");
    expect(code).toContain("getBudgetVehicleSnapshot");
    expect(code).toContain("getServerBudgetVehicleSnapshot");
    expect(code).toContain("setBudgetVehicle");
    expect(code).toContain("useSyncExternalStore");
  });

  test("preštevanje nad OBSTOJEČIMI km (driveCostsForVehicle, OSRM se ohrani)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("driveCostsForVehicle(baseDriveCosts, vehicle)");
    // izvorna ocena je ločena spremenljivka (strežniška/fallback vrednost)
    expect(code).toContain("quality.driveCosts ?? computeTripDriveCosts(itinerary)");
  });

  test("UTRJENA konstanta v besedilu formule je ODSTRANJENA (podatkovno-usmerjeno)", () => {
    // prej: „Vožnja: X km × 6,5 l/100 km × 1,60 €/l + vinjeta …“ (utrjeno)
    const code = norm(BUDGET_PANEL);
    expect(code).not.toContain("6,5 l/100 km");
    expect(code).not.toContain("6.5 l/100 km");
    expect(code).not.toContain("× €1.60/l");
    // zdaj: vrednosti prihajajo iz profila izbrane vrste vozila
    expect(code).toContain("VEHICLE_PROFILES[vehicle]");
    expect(code).toContain("${consFmt}");
    expect(code).toContain("${priceFmt}");
    expect(code).toContain("${vehicleProfile.unit}");
  });

  test("EV poštenost: pas elektrike + izgube polnjenja + oznaka vrstice", () => {
    const code = norm(BUDGET_PANEL);
    // pas negotovosti elektrike (najbolj nestanovitna postavka) — SL in EN
    expect(code).toContain("0,30–0,55");
    expect(code).toContain("0.30–0.55");
    expect(code).toContain("izgube polnjenja");
    expect(code).toContain("Charging losses");
    // oznaka vrstice sledi vrsti vozila (EV = polnjenje, ne gorivo)
    expect(code).toContain("Vožnja (elektrika + vinjeta)");
    expect(code).toContain("Driving (charging + vignette)");
    expect(code).toContain("Vožnja (gorivo + vinjeta)");
  });

  test("telemetrija samo ob SPREMEMBI (ponovni klik iste vrste ne meri)", () => {
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("if (kind === vehicle) return;");
    expect(code).toContain('trackPlannerEvent("budget_vehicle_changed"');
    expect(code).toContain("vehicle: kind");
    expect(code).toContain("km: baseDriveCosts.km");
    expect(code).toContain("fuel_eur: next.fuelEur");
  });

  test("izbirnik se NE prikaže brez ocene vožnje (brez koordinat ni ocene)", () => {
    // fail-closed: baseDriveCosts null → brez izbirnika (ne izmišljujemo km)
    const code = norm(BUDGET_PANEL);
    expect(code).toContain("baseDriveCosts ? (");
  });
});

// ---------------------------------------------------------------------------
// ④ SOURCE-CONTRACT — kartica kvalitete (usklajena z isto preferenco)
// ---------------------------------------------------------------------------

describe("④ ItineraryQualityCard — ista deljena preferenca vozila", () => {
  test("bere isto persistirano preferenco (usklajene številke obeh površin)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("subscribeBudgetVehicle");
    expect(code).toContain("getBudgetVehicleSnapshot");
    expect(code).toContain("driveCostsForVehicle(baseDriveCosts, vehicle)");
  });

  test("UTRJENI konstanti sta odstranjeni iz uvozov in formule (profil je vir)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).not.toContain("FUEL_CONSUMPTION_L_PER_100");
    expect(code).not.toContain("FUEL_PRICE_EUR_PER_L");
    expect(code).toContain("VEHICLE_PROFILES[vehicle]");
    // JSX interpolacija (kartica sestavlja besedilo po kosih, ne predloga)
    expect(code).toContain("{consFmt}");
    expect(code).toContain("{priceFmt}");
  });

  test("EV oznake metrike + razčlenitve (elektrika, ne gorivo)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("Elektrika + avtocestna vinjeta");
    expect(code).toContain("Charging + motorway vignette");
    expect(code).toContain("Elektrika + vinjeta");
    // stara bencinska oznaka ostaja za ostale vrste
    expect(code).toContain("Gorivo + avtocestna vinjeta");
  });

  test("EV pas elektrike v razkrivnostni formuli (SL + EN)", () => {
    const code = norm(QUALITY_CARD);
    expect(code).toContain("~0,16 €");
    expect(code).toContain("~€0.16");
    expect(code).toContain("0,79 €/kWh");
    expect(code).toContain("€0.79/kWh");
  });
});

// ---------------------------------------------------------------------------
// ⑤ SOURCE-CONTRACT — ui-persist (hidracijska varnost)
// ---------------------------------------------------------------------------

describe("⑤ ui-persist — vrsta vozila po vzorcu proračunskega cilja", () => {
  test("ključ localStorage dsa_budget_vehicle + parse z varovalo", () => {
    const code = norm(UI_PERSIST);
    expect(code).toContain('"dsa_budget_vehicle"');
    // neznan/pokvarjen zapis → privzeti bencin (ne izmišljujemo)
    expect(code).toContain("neznan/pokvarjen zapis → privzeta vrsta");
  });

  test("strežniški snapshot = privzeti bencin (SSR/hidracija brez mismatch)", () => {
    const code = norm(UI_PERSIST);
    expect(code).toContain(
      "export function getServerBudgetVehicleSnapshot(): VehicleKind { return \"petrol\"; }"
    );
  });

  test("setter emitira poslušalcem (write + emit — uradni React 19 vzorec)", () => {
    const code = norm(UI_PERSIST);
    const setIdx = code.indexOf("export function setBudgetVehicle");
    expect(setIdx).toBeGreaterThan(-1);
    const body = code.slice(setIdx, setIdx + 600);
    expect(body).toContain("vehicleListeners.forEach");
  });
});

// ---------------------------------------------------------------------------
// ⑥ ANALITIKA — pariteta klient union ⊆ strežniška allowlista + dokumentacija
// ---------------------------------------------------------------------------

describe("⑥ budget_vehicle_changed — analitika po kanonu W3", () => {
  test("v klientnem PlannerEventName union-u", () => {
    expect(norm(ANALYTICS_UNION)).toContain('| "budget_vehicle_changed"');
  });

  test("v strežniški VALID_EVENTS allowlisti (0 tihih 400)", () => {
    expect(norm(ANALYTICS_SERVER)).toContain('"budget_vehicle_changed"');
  });

  test("dokumentiran v docs/ANALYTICS-EVENTS.md (zlati kanon, z verzijo)", () => {
    expect(ANALYTICS_DOC).toContain("`budget_vehicle_changed` (1.166.0");
    expect(ANALYTICS_DOC).toMatch(/budget_vehicle_changed[\s\S]*?`vehicle`/);
    expect(ANALYTICS_DOC).toMatch(/budget_vehicle_changed[\s\S]*?`km`/);
    expect(ANALYTICS_DOC).toMatch(/budget_vehicle_changed[\s\S]*?`fuel_eur`/);
  });
});

// ---------------------------------------------------------------------------
// ⑦ SOURCE-CONTRACT — tipi (pogodba podatkov)
// ---------------------------------------------------------------------------

describe("⑦ types.ts — VehicleKind + opcionalno polje DriveCosts.vehicle", () => {
  test("VehicleKind izvožen s štirimi vrednostmi", () => {
    expect(norm(TYPES)).toContain(
      'export type VehicleKind = "petrol" | "diesel" | "hybrid" | "ev";'
    );
  });

  test("DriveCosts.vehicle je OPCIONALNO (odsotno = privzeti bencin)", () => {
    const code = norm(TYPES);
    const driveIdx = code.indexOf("export interface DriveCosts");
    const end = code.indexOf("}", driveIdx);
    const block = code.slice(driveIdx, end);
    expect(block).toContain("vehicle?: VehicleKind");
  });

  test("trip-costs: profili imajo razkrite vire (komentarji z viri)", () => {
    // načelo „vsaka številka pove svoje predpostavke“ — viri v komentarjih
    const code = TRIP_COSTS;
    expect(code).toContain("gov.si");
    expect(code).toContain("AMZS");
    expect(code).toContain("cestnina"); // vinjeta = cestnina tudi za EV
  });
});
