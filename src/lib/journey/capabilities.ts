// ============================================================================
// TASK 58 — POTOVANJA: MATRIKS ZMOŽNOSTI PONUDNIKOV (§1/§2) — IZPELJAN
// IZ OBSTOJEČEGA REGISTRA (registry.ts) + produkcijske matrike.
// ============================================================================
// ENOTNI vir resnice ostane PROVIDER_REGISTRY — ta modul ga preslika v
// potovalni besednjak zmožnosti (LIVE / CODE_READY / AFFILIATE_ONLY /
// STATIC_CONTENT / INFO_ONLY / NOT_CONFIGURED / BLOCKED / NOT_SUPPORTED)
// in ga izpostavi UI-ju ter testom (drift-testi varujejo usklajenost).
//
// NIKOLI ne označimo ponudnika LIVE samo zato, ker adapter obstaja:
// LIVE zahteva DEJANSKO dostop (dataset nameščen / ključ prisoten).
// ============================================================================

import { PROVIDER_REGISTRY, getProvider } from "@/lib/supply/registry";
import type { ProviderSlug } from "@/lib/supply/types";
import type { BookingFlow, PaymentCapability, ConfirmationCapability } from "./types";
import { bookingCapabilityOf } from "./booking";

/** Razvrstitvena beseda (naročnikova klasifikacija — vrednost je STANJE). */
export type CapabilityClass =
  | "LIVE"
  | "CODE_READY"
  | "AFFILIATE_ONLY"
  | "STATIC_CONTENT"
  | "INFO_ONLY"
  | "NOT_CONFIGURED"
  | "BLOCKED"
  | "NOT_SUPPORTED";

/** Ali je API env ključ prisoten v TEK primerku procesa (brez vrednosti). */
function apiEnvPresent(slug: ProviderSlug): boolean {
  const entry = getProvider(slug);
  if (!entry) return false;
  return (entry.envKeys.api ?? []).some((k) => Boolean(process.env[k]?.trim()));
}

/**
 * Zmožnosti PONUDNIKA za potovalno verigo (10 stolpcev matriksa iz TASK 58
 * §1 — vrednosti izpeljane iz registra + produkcijske matrike + env).
 */
export interface JourneyProviderCapabilities {
  slug: ProviderSlug;
  /** Discovery (iskanje/objava produktov). */
  discovery: CapabilityClass;
  /** Živi inventar (API/feed dostop, potrjen). */
  liveInventory: CapabilityClass;
  /** Cene (vir + semantika). */
  price: CapabilityClass;
  /** Razpoložljivost (vir koncepta + preverjanje). */
  availability: CapabilityClass;
  /** Tok rezervacije (bookingMode danes). */
  booking: BookingFlow | "none";
  /** Kje se zgodi plačilo. */
  payment: PaymentCapability;
  /** Kaj se lahko potrdi. */
  confirmation: ConfirmationCapability;
  /** Affiliate program (/go). */
  affiliate: boolean;
  /** AI integriran (supply kontekst / izbire / T2). */
  ai: CapabilityClass;
  /** Iskrena opomba za UI. */
  note: { sl: string; en: string };
}

/**
 * Izpeljava zmožnosti PONUDNIKA iz registra (čista preslikava — brez
 * ročnega podvajanja; env prisotnost vpliva SAMO na NOT_CONFIGURED
// razvrstitev discovery/liveInventory stolpcev).
 */
export function journeyProviderCapabilities(
  slug: ProviderSlug
): JourneyProviderCapabilities | null {
  const entry = getProvider(slug);
  if (!entry) return null;

  const hasApiEnv = apiEnvPresent(slug);
  const staticContent = entry.inventoryAccess.includes("static_content");
  const openData = entry.inventoryAccess.includes("open_data");
  const affiliateOnly =
    entry.inventoryAccess.length === 1 &&
    entry.inventoryAccess[0] === "affiliate_deep_link";
  const datasetGated = (entry.envKeys.api ?? []).some((k) =>
    ["FSQ_PLACES_DIR"].includes(k)
  );
  const adapterConnected = entry.active; // priklopljen na /api/supply/search

  // Discovery: LIVE za žive/open-data vire s priklopljenim adapterjem;
  // STATIC_CONTENT za ingested kanon; AFFILIATE_ONLY sicer.
  let discovery: CapabilityClass;
  if (openData && adapterConnected && !datasetGated) discovery = "LIVE";
  else if (staticContent && adapterConnected) discovery = "STATIC_CONTENT";
  else if (affiliateOnly) discovery = "AFFILIATE_ONLY";
  else if (datasetGated) discovery = hasApiEnv ? "LIVE" : "NOT_CONFIGURED";
  else if (adapterConnected) discovery = hasApiEnv ? "LIVE" : "NOT_CONFIGURED";
  else discovery = "AFFILIATE_ONLY";

  // Živi inventar: danes LE odprti podatki (OSM Overpass) so „živi“ v
  // pomenu klica-na-poizvedbo; CSV je statika; affiliate NI inventar.
  let liveInventory: CapabilityClass;
  if (openData && adapterConnected && !datasetGated) liveInventory = "INFO_ONLY"; // odprti podatki ≠ komercialni inventar
  else if (staticContent) liveInventory = "NOT_SUPPORTED";
  else if (affiliateOnly || entry.group === "commercial") liveInventory = hasApiEnv ? "CODE_READY" : "NOT_CONFIGURED";
  else liveInventory = "NOT_SUPPORTED";

  // Cene: KT = objavljene (STATIC); odprti podatki jih NIMAJÓ.
  const price: CapabilityClass = entry.capabilities.price
    ? staticContent
      ? "STATIC_CONTENT"
      : hasApiEnv
        ? "CODE_READY"
        : "NOT_CONFIGURED"
    : "NOT_SUPPORTED";

  // Razpoložljivost: register capabilities.availability + vir.
  const availability: CapabilityClass = entry.capabilities.availability
    ? hasApiEnv || openData
      ? "CODE_READY"
      : "NOT_CONFIGURED"
    : "NOT_SUPPORTED";

  // Tok rezervacije: lastna tržnica = API; sicer affiliate tok (adapter
  // booking ALI goRoute affiliate kartica — obe sta rezervacija PRI ponudniku);
  // brez obeh = nič (OSM POI).
  const booking: BookingFlow | "none" = entry.group === "own"
    ? "api_booking"
    : entry.capabilities.booking || (entry.capabilities.affiliate && entry.goRoute)
      ? "external_affiliate"
      : "none";

  const caps = bookingCapabilityOf(
    entry.capabilities.booking ? "affiliate_redirect" : "info_only"
  );

  return {
    slug,
    discovery,
    liveInventory,
    price,
    availability,
    booking,
    payment: caps.payment,
    confirmation: caps.confirmation,
    affiliate: entry.capabilities.affiliate,
    ai: adapterConnected
      ? staticContent || openData
        ? "LIVE"
        : hasApiEnv
          ? "CODE_READY"
          : "NOT_CONFIGURED"
      : "NOT_CONFIGURED",
    note: entry.accessNote ?? { sl: "", en: "" },
  };
}

/** Celotna matrika (vsi ponudniki registra — vrstni red registra). */
export function journeyCapabilityMatrix(): JourneyProviderCapabilities[] {
  return PROVIDER_REGISTRY.map((p) => journeyProviderCapabilities(p.slug)).filter(
    (c): c is JourneyProviderCapabilities => c != null
  );
}
