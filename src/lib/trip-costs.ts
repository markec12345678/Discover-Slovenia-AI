import { DESTINATIONS } from "@/lib/slovenia-data";
import { legKey, type LegRouteIndex } from "@/lib/road-routing";
import { ROAD_FACTOR, haversineKm } from "@/lib/geo-distance";
import type { DriveCosts, Itinerary, VehicleKind } from "@/lib/types";

// ============================================================================
// TRIP DRIVE COSTS (F5.3) — ocena stroškov vožnje: gorivo + e-vinjeta
// ============================================================================
//
// Namen (primerjalna analiza vs MindTrip): MindTrip za pot prikaže
// stroškovno razčlenitev vožnje (cestnine, gorivo) — mi smo do Faze 5
// prikazovali samo vnose atrakcij. Ta čista funkcija doda OCENO vožnje
// za slovenske razmere, pošteno in razkrito:
//
//   gorivo  = km × poraba(l/100 km) × cena(€/l)
//   vinjeta = veljavnost, izbrana po dolžini potovanja (vozila do 3,5 t)
//
// Načelo znamke: vsaka številka pove svoje predpostavke. Cene so "glede
// na objavljene cenike (AMZS/DARS, regulirana cena goriva) ob času
// implementacije" in so vidne v UI; vinjeta je POGOJNA (potrebna le ob
// vožnji po avtocestah — obcestne alternative so v Sloveniji običajno
// le nekaj minut počasnejše).
//
// Deterministična čista funkcija — teče na strežniku (ob generiranju,
// vključena v ItineraryQuality.driveCosts) in po potrebi na clientu
// (stari načrti brez quality polja). Brez stranskih učinkov.
// ============================================================================

// T5-b1/H2: cestni faktor in haversine formula živita v
// src/lib/geo-distance.ts (en vir resnice — ISTI vrednosti kot prej).

// --- Predpostavke (razkrite v UI) — viri ob implementaciji ---------------

/** Regulirana maloprodajna cena NMB-95 v Sloveniji (€/l) — pas ~1,55–1,70
 *  (gov.si / AMZS). Ocenjujemo s 1,60; dejanska črpalka se razlikuje. */
export const FUEL_PRICE_EUR_PER_L = 1.6;

/** Tipična poraba osebnega vozila (l/100 km) — povprečen kombilimuzina. */
export const FUEL_CONSUMPTION_L_PER_100 = 6.5;

/** Cene e-vinjete za vozila do 3,5 t (DARS/AMZS cenik). */
export const VIGNETTE_PRICES: Record<
  DriveCosts["vignetteDays"],
  number
> = {
  1: 8.1, // 1-dnevna (uvrščena z reformo dec 2024)
  10: 12.8, // 10-dnevna
  62: 32.0, // dvomesečna
  365: 106.8, // letna
};

/** Izbor veljavnosti vinjete glede na število dni potovanja. */
export function pickVignetteDays(days: number): DriveCosts["vignetteDays"] {
  if (days <= 1) return 1;
  if (days <= 10) return 10;
  if (days <= 62) return 62;
  return 365;
}

// --- ISSUE #24 Sklop 4 (1.166.0): strošek goriva po vrsti vozila ------------
//
// Roadtrippers vzorec (benchmark Round 2, P3): ocena goriva glede na to,
// s čim uporabnik dejansko vozi. Profili so RAZKRITI (vsak svoj vir + pas
// negotovosti), izbor je uporabnikova PREFERENCA (localStorage, ne shranjen
// podatek načrta) — strežniški izračun ostane na privzetem bencinu (0
// sprememb baze/API za shranjene načrte), UI pa prešteje prikaz s čisto
// funkcijo driveCostsForVehicle nad OBSTOJEČIMI km (OSRM km se ohranijo —
// vrsta vozila ne spreminja poti).
//
// Vinjeta ostane pri VSEH vrstah: e-vinjeta je cestnina za vozila do 3,5 t,
// ne davek na gorivo — tudi EV jo potrebuje na avtocestah.

export interface VehicleProfile {
  /** Poraba na 100 km: bencin/dizel/hibrid v litrih; EV v kWh (vključno z
   *  izgubami polnjenja ~15 % — javno objavljene povprečne vrednosti). */
  consumptionPer100: number;
  /** Cena enote: €/l (regulirani gorivi) ali €/kWh (EV — najbolj nestanovitna,
   *  pas je širše razkrit v UI). */
  pricePerUnit: number;
  /** Enota količine za prikaz: "l" ali "kWh". */
  unit: "l" | "kWh";
}

/**
 * Profili vozil — vrednosti ob implementaciji (okt 2026), vsaka s svojim
 * virom; UI izpiše pas negotovosti (načelo: vsaka številka pove svoje
 * predpostavke — cena na črpalki/polnilnici se razlikuje).
 */
export const VEHICLE_PROFILES: Record<VehicleKind, VehicleProfile> = {
  /** Privzeti profil — IZVOŽENI stalnici (bit-identično F5.3 obnašanje). */
  petrol: {
    consumptionPer100: FUEL_CONSUMPTION_L_PER_100,
    pricePerUnit: FUEL_PRICE_EUR_PER_L,
    unit: "l",
  },
  /** Dizel: regulirana maloprodajna cena pas ~1,45–1,55 €/l (gov.si);
   *  poraba tipičnega dizelskega kombilimuzina. */
  diesel: {
    consumptionPer100: 5.5,
    pricePerUnit: 1.5,
    unit: "l",
  },
  /** Poln hibrid (bencinski): poraba ~30 % nižja od enakovrednega bencinskega;
   *  gorivo NMB-95 (ista regulirana cena kot bencin). */
  hybrid: {
    consumptionPer100: 4.5,
    pricePerUnit: FUEL_PRICE_EUR_PER_L,
    unit: "l",
  },
  /** EV: poraba vključuje izgube polnjenja; cena elektrike je ŠIRŠA — doma
   *  ~0,16 €/kWh, javno AC ~0,30–0,55 €/kWh, hitro polnjenje do ~0,79 €/kWh.
   *  Ocena 0,40 €/kWh = sredina javnega polnjenja; UI pas obvezno pokaže. */
  ev: {
    consumptionPer100: 18,
    pricePerUnit: 0.4,
    unit: "kWh",
  },
};

/** Vrstni red možnosti v UI (stabilen). */
export const VEHICLE_KINDS: readonly VehicleKind[] = [
  "petrol",
  "diesel",
  "hybrid",
  "ev",
] as const;

/** Type guard za vrednost iz localStorage/UI. */
export function isVehicleKind(v: unknown): v is VehicleKind {
  return v === "petrol" || v === "diesel" || v === "hybrid" || v === "ev";
}

/**
 * Preštej stroške vožnje za izbrano vrsto vozila nad OBSTOJEČO oceno
 * (ISSUE #24 Sklop 4). Čista deterministična funkcija:
 *
 *   količina = round(km ÷ 100 × poraba profila)
 *   energija = round(količina × cena enote profila)
 *   skupaj   = energija + vinjeta (nespremenjena — cestnina, ne gorivo)
 *
 * - km in vinjeta se PREPIŠETA iz izvira (OSRM/hevristika ostane poštena —
 *   vrsta vozila ne spreminja poti ne cestnine);
 * - za "petrol" je rezultat bit-identičen privzetemu izračunu (isti formuli
 *   in konstanti) — sprememba profila je brez tveganja;
 * - fuelLiters za EV nosi kWh (enota v profilu; UI jo izpiše pošteno).
 */
export function driveCostsForVehicle(
  base: DriveCosts,
  vehicle: VehicleKind
): DriveCosts {
  const profile = VEHICLE_PROFILES[vehicle];
  const quantity = Math.round((base.km / 100) * profile.consumptionPer100);
  const fuelEur = Math.round(quantity * profile.pricePerUnit);
  return {
    ...base,
    vehicle,
    fuelLiters: quantity,
    fuelEur,
    totalEur: fuelEur + base.vignetteEur,
  };
}

// --- ISSUE #24 Sklop 5 (1.167.0): poštena delitev stroškov med potnike -------
//
// Wanderlog vzorec (benchmark Round 2, P3: »split med popotniki manjka«).
// Iskrenostno načelo: CENE ATRAKCIJ so ŽE na osebo (vsak potnik plača svoj
// vstopnik — deljenje z velikostjo skupine bi ZANIŽALO pravi strošek
// posameznika), strošek VOŽNJE (gorivo/elektrika + vinjeta) pa je strošek
// AVTA, ki ga potniki v tistem avtu delijo med seboj.
//
//   na osebo = atrakcije (celotne, na osebo) + vožnja ÷ število potnikov
//
// Varovalo po benchmarku: TripBudgetCard / proračunska plošča ostane
// EDINI vir — NE gradimo knjigovodstva "kdo je kaj plačal" (nov podatkovni
// model bi bil nov motor po §17); to je POŠTEN PRIKAZ obstoječe ocene.

/** Zgornja meja potnikov v enem osebnem vozilu (enaka meji koračnika UI). */
export const MAX_CAR_SHARERS = 12;

/** Poštena delitev stroškov potovanja na posameznega potnika. */
export interface SplitCostsPerPerson {
  /** Atrakcije na osebo — cene vstopnikov so ŽE na osebo (NE delimo). */
  attractionsPerPerson: number;
  /** Vožnja na osebo — gorivo + vinjeta sta strošek avta (deljeno). */
  drivePerPerson: number;
  /** Skupaj na osebo: atrakcije + vožnja ÷ N. */
  totalPerPerson: number;
}

/**
 * Preštej pošteno delitev na osebo (ISSUE #24 Sklop 5). Čista
 * deterministična funkcija:
 *
 *   atrakcijeNaOsebo = zaokroženi znesek atrakcij (NE deljen — cene
 *                      lokacij so že na osebo)
 *   vožnjaNaOsebo    = round(vožnja ÷ N) (gorivo + vinjeta sta skupni
 *                      strošek avta; pri N = 1 identiteta)
 *
 * - `driveEur == null` → vozniške vrstice ni (0, brez izmišljanja);
 * - število potnikov < 1 ali necelo → varno 1 oz. floor (defenzivno,
 *   vhod iz localStorage/UI je nezaupanja vreden);
 * - negativni zneski se prištejpajo na 0 (nepoznan ≠ dolg).
 */
export function splitTripCostsPerPerson(
  attractionsEur: number,
  driveEur: number | null,
  travelers: number
): SplitCostsPerPerson {
  const n =
    Number.isFinite(travelers) && travelers >= 1
      ? Math.min(MAX_CAR_SHARERS, Math.floor(travelers))
      : 1;
  const attractions = Math.max(0, Math.round(attractionsEur));
  const drive = driveEur == null ? 0 : Math.max(0, Math.round(driveEur));
  const drivePerPerson = Math.round(drive / n);
  return {
    attractionsPerPerson: attractions,
    drivePerPerson,
    totalPerPerson: attractions + drivePerPerson,
  };
}

// --- Čisti izračun ---------------------------------------------------------

/**
 * Skupni kilometri poti (zaporedni postanki: realne ceste prek indeksa nog
 * OSRM, kadar je podan; sicer haversine × cestni faktor; zaokroženo na 5 —
 * brez lažne natančnosti). Enaka logika kot geo-validation dnevni km, a čez
 * celo pot (tudi prehode med dnevi).
 */
export function computeDrivingKm(
  days: Itinerary["days"],
  legs?: LegRouteIndex
): number {
  const visits = days.flatMap((d) =>
    (d.locations ?? []).map((l) => ({
      id: typeof l.destination_id === "string" ? l.destination_id : "",
      coords: DESTINATIONS.find((x) => x.id === l.destination_id)?.coords,
    }))
  );
  const known = visits.filter(
    (v): v is { id: string; coords: { lat: number; lng: number } } => !!v.coords
  );
  if (known.length < 2) return 0;
  let km = 0;
  for (let i = 1; i < known.length; i++) {
    const leg = legs?.get(legKey(known[i - 1].id, known[i].id));
    if (leg) {
      km += leg.km; // realna cesta (OSRM) — faktor je že v merjeni poti
    } else {
      // hevristika (noga ni v indeksu) — enaka formula kot brez indeksa
      km += haversineKm(known[i - 1].coords, known[i].coords) * ROAD_FACTOR;
    }
  }
  return Math.round(km / 5) * 5;
}

/**
 * Ocena stroškov vožnje za celo pot (gorivo + vinjeta).
 * Čista funkcija: Itinerary + število dni → DriveCosts.
 * F5.6: z indeksom nog (OSRM) km temeljijo na realnih cestah.
 */
export function computeTripDriveCosts(
  itinerary: Itinerary,
  legs?: LegRouteIndex
): DriveCosts | null {
  const days = Array.isArray(itinerary.days) ? itinerary.days : [];
  const km = computeDrivingKm(days, legs);
  if (km <= 0) return null; // brez znanih koordinat → brez ocene (ne izmišljujemo)

  const fuelLiters = Math.round((km / 100) * FUEL_CONSUMPTION_L_PER_100);
  const fuelEur = Math.round(fuelLiters * FUEL_PRICE_EUR_PER_L);
  const vignetteDays = pickVignetteDays(days.length);
  const vignetteEur = VIGNETTE_PRICES[vignetteDays];

  return {
    km,
    fuelLiters,
    fuelEur,
    vignetteDays,
    vignetteEur,
    totalEur: fuelEur + vignetteEur,
  };
}
