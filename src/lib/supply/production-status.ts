// ============================================================================
// TRAVEL SUPPLY MAP — USER-FACING PRODUCTION STATUS (TASK 52 §32, 1.57.1)
// ============================================================================
// Poštena produkcijska klasifikacija providerja ZA UPORABNIKA/ADMINISTRATORJA
// (naročnik §32): register mora pokazati IZKLJUČNO
//
//   LIVE | CONFIGURED | NOT CONFIGURED | PARTNER ACCESS REQUIRED | AFFILIATE ONLY
//
// in NIKOLI „LIVE“, če credential manjka. Izpeljava je STROGO iz
// production-matrix.ts (življenjski cikel §0 + blokirni razlogi) in
// providerEnvAccess (§6 — SAMO Boolean PRESENT/MISSING, vrednosti ne
// zapustijo strežnika).
//
// PRAVILA IZPELJAVE (iskrenost, fail-closed):
//  1. LIVE — SAMO za stopnjo PRODUCTION_ACTIVE (podatki DEJANSKO tečejo:
//     OSM žive Overpass poizvedbe, STO RAG ingest, KiwiTaxi CSV inventar).
//     Affiliate ID NI pogoj za LIVE, kadar vir podatkov ne zahteva
//     poverilnic (npr. KiwiTaxi objavljeni CSV) — monetizacija je ločen
//     prikaz (spodaj).
//  2. AFFILIATE ONLY — vir NIMA inventarskega API-ja (blockedReason
//     NOT_APPLICABLE): partnerska povezava je ZA VEDNO edina zmožnost
//     (§26: affiliate ≠ inventory). Ne spremeni se niti z nastavljenim
//     affiliate ID-jem — sposobnost ostaja pošteno komunikirana.
//  3. CONFIGURED — INVENTORY API poverilnica je prisotna (API ključ/žeton),
//     a živi podatki še niso preverjeni (stopnja < LIVE_DATA_VERIFIED).
//     SAMO affiliate ID to NE sproži (affiliate URL ni inventar).
//  4. PARTNER ACCESS REQUIRED — inventarski API zahteva odobritev/pogodbo
//     (partner approval, B4B pogodba, Managed Affiliate Partner …).
//  5. NOT CONFIGURED — self-serve dostop obstaja, a ključ/dataset ni v env;
//     ali lastna plast še ni zgrajena (own marketplace).
//
// Ta modul je STREŽNIŠKI (bere process.env prek production-matrix) —
// NIKOLI ga ne uvažaj v klientne komponente.
// ============================================================================

import {
  productionMatrix,
  providerEnvAccess,
  type ProductionMatrixEntry,
  type ProviderEnvAccess,
  type LifecycleStage,
  type PriceClassification,
  type AvailabilityClassification,
} from "./production-matrix";
import type { ProviderSlug } from "./types";

/** Dovoljen nabor statusov za prikaz (§32 — nič drugih vrednosti). */
export const USER_FACING_STATUSES = [
  "LIVE",
  "CONFIGURED",
  "NOT_CONFIGURED",
  "PARTNER_ACCESS_REQUIRED",
  "AFFILIATE_ONLY",
] as const;
export type UserFacingStatus = (typeof USER_FACING_STATUSES)[number];

/** Stanje affiliate monetizacije (ločeno od podatkovne zmožnosti!). */
export const MONETIZATION_STATES = [
  "CONFIGURED",
  "NOT_CONFIGURED",
  "NOT_APPLICABLE",
] as const;
export type MonetizationState = (typeof MONETIZATION_STATES)[number];

/** Celoten uporabniški produkcijski status providerja (brez skrivnosti). */
export interface ProviderProductionStatus {
  slug: ProviderSlug;
  /** Glavni status (§32). */
  status: UserFacingStatus;
  /** Dosežena stopnja življenjskega cikla (§0 — tehnična, za admin). */
  stage: LifecycleStage;
  /** Klasifikacija cen (§16). */
  price: PriceClassification;
  /** Klasifikacija razpoložljivosti (§17). */
  availability: AvailabilityClassification;
  /** Affiliate monetizacija (ID prisoten/priklopljen — NI inventar). */
  monetization: MonetizationState;
}

/** Je env vnos „credential-like“ (ID/ključ/žeton/URL)? _BASE, _DIR in _ORIGIN
 *  NISO poverilnice (preklop produkcija/sandbox, pot do dataseta oz.
 *  operaterska konfiguracija izhodišča letov — TASK 53). */
function credentialLike(name: string): boolean {
  return !name.endsWith("_BASE") && !name.endsWith("_DIR") && !name.endsWith("_ORIGIN");
}

/**
 * Glavna izpeljava statusa (§32). Argumenta sta iz matrike + env dostopa —
 * oba brez vrednosti skrivnosti.
 */
export function userFacingStatus(
  entry: ProductionMatrixEntry,
  env: ProviderEnvAccess
): UserFacingStatus {
  // 1) ŽIVI PODATKI — izključno po dokazani stopnji (nikoli po željah).
  if (entry.stage === "PRODUCTION_ACTIVE") return "LIVE";

  // 2) Affiliate-only vir (brez inventarskega API-ja) — ZA VEDNO honestly
  //    „AFFILIATE ONLY“, tudi če je monetizacija nastavljena (§26).
  if (entry.blockedReason === "NOT_APPLICABLE") return "AFFILIATE_ONLY";

  // 3) CONFIGURED — SAMO inventarske API poverilnice (ključ/žeton) so
  //    prisotne — VSE credential-like vnosе api skupine (TASK 53 §21:
  //    airalo OAuth2 potrebuje OBE, delna = NE konfigurirano). Affiliate
  //    ID/URL tega NE sproži: monetizirana povezava NI konfiguriran
  //    inventar (§26 — ločena chip spodaj).
  const apiCreds = env.api.filter((c) => credentialLike(c.envVar));
  const apiConfigured =
    apiCreds.length > 0 && apiCreds.every((c) => c.present);
  if (apiConfigured) return "CONFIGURED";

  // 4) Partner approval / pogodba (tudi B4B = pogodbena oblika dostopa).
  if (
    entry.blockedReason === "PARTNER_APPROVAL_REQUIRED" ||
    entry.blockedReason === "BLOCKED"
  ) {
    return "PARTNER_ACCESS_REQUIRED";
  }

  // 5) Self-serve dostop obstaja, a ključ/dataset/plast manjka.
  return "NOT_CONFIGURED";
}

/**
 * Stanje affiliate monetizacije (ločeno od podatkov — §19/§26):
 *  - CONFIGURED: affiliate ID/URL je prisoten (povezave so monetizirane)
 *  - NOT_CONFIGURED: program obstaja, ID manjka (čiste povezave)
 *  - NOT_APPLICABLE: vir nima affiliate programa (lokalni/lastni viri)
 */
export function monetizationState(
  env: ProviderEnvAccess
): MonetizationState {
  if (!env.affiliate || env.affiliate.length === 0) return "NOT_APPLICABLE";
  return env.affiliate.some((c) => c.present) ? "CONFIGURED" : "NOT_CONFIGURED";
}

/** Status enega providerja (ali undefined, če slug ni v registru). */
export function providerProductionStatus(
  slug: string
): ProviderProductionStatus | undefined {
  const entry = productionMatrix().find((e) => e.slug === slug);
  if (!entry) return undefined;
  const env = providerEnvAccess(entry.slug);
  return {
    slug: entry.slug,
    status: userFacingStatus(entry, env),
    stage: entry.stage,
    price: entry.price,
    availability: entry.availability,
    monetization: monetizationState(env),
  };
}

/** Statusi VSIH providerjev registra (vrstni red registra). */
export function productionStatuses(): ProviderProductionStatus[] {
  return productionMatrix().map((entry) => {
    const env = providerEnvAccess(entry.slug);
    return {
      slug: entry.slug,
      status: userFacingStatus(entry, env),
      stage: entry.stage,
      price: entry.price,
      availability: entry.availability,
      monetization: monetizationState(env),
    };
  });
}
