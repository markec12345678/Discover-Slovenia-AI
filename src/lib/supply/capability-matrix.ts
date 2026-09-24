// ============================================================================
// ISSUE #4 §5 — BOOKING PROVIDER LAYER: CAPABILITY MATRIX (1.96.0)
// ============================================================================
// Naročnikova zahteva (issue #4, odsek 5): README razlikovanja (CODE READY
// adapterji, affiliate /go, neaktivne API integracije, booking lifecycle)
// formalizirana v CAPABILITY MATRIKO z stolpci:
//
//   Provider | Discovery | Affiliate | API Search | Quote | Booking |
//   Cancellation | Webhook | Refund | Credentials | E2E
//
// PRAVILA (iskrenost — isto discipline kot production-matrix.ts):
//  - Status LIVE SAMO kadar obstaja DEJANSKI živi odgovor providerja
//    (testovno varovana invarianta — cene FROM_PRICE NISO živi citat).
//  - Vsa vrstica so IZPELJANA iz obstoječih strojno berljivih virov
//    (registry.ts / production-matrix.ts / affiliate.ts / booking.ts) —
//    NE iz README proze. Drift je nemogoč: vrstice sledijo registru.
//  - Credentials: SAMO Boolean prisotnost env spremenljivk PO IMENU
//    (vrednosti NIKOLI ne zapustijo strežnika — vira: providerEnvAccess).
//
// RAZLAGA CELIC (dvojezične oznake spodaj):
//  LIVE          — živi odgovor providerja dejansko teče (dokazan sondo/E2E)
//  CODE_READY    — kodirano in priklopljeno, a PRAZNO brez poverilnic/odobritve
//  ARCHITECTURE  — arhitektura obstaja (state machine/kanal), 0 živih klicev
//  USER_ATTESTED — uporabnikova izjava (ročni vnos/uvoz dokumenta), NI
//                  providerjev odgovor — dokument je atestacija
//  NOT_SUPPORTED — vir te zmožnosti nima / je ne ponuja našemu tierju
//  NOT_APPLICABLE — zmožnost za ta vir nima smisla (odprti podatki, manual)
//  NOT_RUN       — E2E dokaz za to vrstico še ni bil izveden (iskreno)
// ============================================================================

import { PROVIDER_REGISTRY } from "./registry";
import { getProductionMatrixEntry, providerEnvAccess } from "./production-matrix";
import type { ProviderSlug } from "./types";

/** Celica capability matrike (iskreni statusi — NIKOLI „LIVE" brez dokaza). */
export type CapabilityCell =
  | "LIVE"
  | "CODE_READY"
  | "ARCHITECTURE"
  | "USER_ATTESTED"
  | "NOT_SUPPORTED"
  | "NOT_APPLICABLE"
  | "NOT_RUN";

/** Vrstica §5 capability matrike (ena na provider registra + manual). */
export interface BookingCapabilityRow {
  slug: ProviderSlug;
  /** Supply iskanje vrača produkte tega vira (/api/supply/search). */
  discovery: CapabilityCell;
  /** Affiliate globoka povezava (/go/[provider]) — ruta fail-closed. */
  affiliate: CapabilityCell;
  /** Iskanje prek API-ja/feed-a VIRA (živo ali kodirano-prazno). */
  apiSearch: CapabilityCell;
  /** Živi citat cene ob poizvedbi (FROM_PRICE NI citat). */
  quote: CapabilityCell;
  /** Kako rezervacija poteka (pri ponudniku / naša tržnica / izjava). */
  booking: CapabilityCell;
  /** Odpoved prek NAŠE plasti. */
  cancellation: CapabilityCell;
  /** Webhook ingest dogodkov providerja. */
  webhook: CapabilityCell;
  /** Refundacija prek provider API-ja. */
  refund: CapabilityCell;
  /** Boolean prisotnost env poverilnic (imena so javna, vrednosti ne). */
  credentials: {
    productionConfigured: boolean;
    missingEnvVars: string[];
  };
  /** Ali obstaja IZVEDEN browser E2E dokaz za to vrstico. */
  e2e: CapabilityCell;
  /** Iskrena opomba (SL) za administracijo/dokumentacijo. */
  note?: string;
}

// ---------------------------------------------------------------------------
// IZPELJAVA (registry + production-matrix + affiliate) — en sam vir resnice
// ---------------------------------------------------------------------------

/** E2E dokazi, izvedeni v browserju (ux-verify-* dokazi, delovni dnevnik):
 *  osm (zemljevid/ploščice), fsq (pini zemljevida), kiwitaxi (/go/transfers
 *  302), viator (booking handoff + preusmeritev na viator.com). */
const E2E_PROVEN: ReadonlySet<string> = new Set(["osm", "fsq", "kiwitaxi", "viator"]);

/** Lokalni odprti viri — brez komercialnih stolpcev po arhitekturi. */
const LOCAL_OPEN: ReadonlySet<string> = new Set(["osm", "fsq", "sto"]);

function discoveryCell(slug: ProviderSlug, stage: string, active: boolean): CapabilityCell {
  if (slug === "manual") return "NOT_APPLICABLE";
  if (slug === "sto") return "LIVE"; // RAG vsebina teče živo (ni supply iskanje — opomba)
  if (active) return stage === "PRODUCTION_ACTIVE" ? "LIVE" : "CODE_READY";
  return "NOT_SUPPORTED"; // brez adapterja: affiliate-only viri
}

function affiliateCell(
  slug: ProviderSlug,
  hasAffiliateFlag: boolean
): CapabilityCell {
  if (slug === "manual") return "NOT_APPLICABLE";
  if (slug === "own") return "NOT_APPLICABLE"; // lastna tržnica: lasten Stripe tok
  if (LOCAL_OPEN.has(slug)) return "NOT_SUPPORTED"; // ne-komercialni vir NIKOLI affiliate
  return hasAffiliateFlag ? "LIVE" : "NOT_SUPPORTED";
}

function apiSearchCell(
  slug: ProviderSlug,
  stage: string,
  active: boolean
): CapabilityCell {
  if (slug === "manual") return "NOT_APPLICABLE";
  if (slug === "sto") return "LIVE"; // llms.txt ingest — statičen vir, živo strežan
  if (!active) return "NOT_SUPPORTED";
  return stage === "PRODUCTION_ACTIVE" ? "LIVE" : "CODE_READY";
}

/** Živi citat ⟺ price === LIVE_PRICE (iz matrike — invarianta). FROM_PRICE
 *  je objavljena „od"-cena, NE citat: CODE_READY kadar adapter čaka ključ,
 *  NOT_SUPPORTED kadar je vir statičen (nikoli ne bo živi citat). */
function quoteCell(
  slug: ProviderSlug,
  price: string,
  stage: string
): CapabilityCell {
  if (slug === "manual") return "NOT_APPLICABLE";
  if (price === "LIVE_PRICE") return "LIVE";
  if (price === "FROM_PRICE") {
    // Adapter, ki čaka poverilnico (CODE_READY stopnja), PRIDOBIVA citate
    // po aktivaciji → capability je kodirana. Statični/aktivni viri
    // (kiwitaxi CSV, own izkušnje) imajo samo objavljene cene.
    const waitingForCredentials =
      stage === "CODE_READY" || stage === "PRODUCTION_CONFIGURED";
    const codedPriceCall =
      slug === "booking" || slug === "skyscanner" || slug === "travelpayouts" ||
      slug === "airalo" || slug === "viator" || slug === "getyourguide" ||
      slug === "tiqets";
    return waitingForCredentials && codedPriceCall ? "CODE_READY" : "NOT_SUPPORTED";
  }
  return "NOT_SUPPORTED";
}

function bookingCell(
  slug: ProviderSlug,
  cta: string
): CapabilityCell {
  if (slug === "manual") return "USER_ATTESTED"; // ročni vnos/uvoz dokumenta
  if (slug === "own") return "CODE_READY"; // Stripe tok kodiran; demo/501 do aktivacije
  if (cta === "affiliate_redirect") return "USER_ATTESTED"; // rezervacija se ZAKLJUČI pri ponudniku
  return "NOT_SUPPORTED"; // info_only (osm/fsq/sto)
}

function cancellationCell(slug: ProviderSlug, cta: string): CapabilityCell {
  if (slug === "manual") return "USER_ATTESTED";
  if (slug === "own") return "CODE_READY"; // owner bookings: confirm/cancel/complete (kodirano)
  if (cta === "affiliate_redirect") return "ARCHITECTURE"; // CANCELLED zapis obstaja — odpoved pri ponudniku, 0 API
  return "NOT_SUPPORTED";
}

function webhookCell(slug: ProviderSlug): CapabilityCell {
  if (slug === "manual") return "NOT_APPLICABLE";
  if (slug === "own") return "CODE_READY"; // Stripe webhook (plačila tržnice) kodiran; zahteva STRIPE_WEBHOOK_SECRET
  if (LOCAL_OPEN.has(slug)) return "NOT_APPLICABLE"; // odprti podatki nimajo webhookov
  return "ARCHITECTURE"; // JOURNEY_PROVIDER_TOKEN PATCH = ročni žeton, NE webhook ingest
}

function refundCell(slug: ProviderSlug, cta: string): CapabilityCell {
  if (slug === "manual") return "USER_ATTESTED";
  if (cta === "affiliate_redirect") return "ARCHITECTURE"; // REFUNDED status obstaja; 0 refund API
  if (slug === "own") return "ARCHITECTURE"; // Stripe refund NI kodiran (samo detekcija dvakratnega plačila)
  return "NOT_SUPPORTED";
}

// ---------------------------------------------------------------------------
// MATRIKA
// ---------------------------------------------------------------------------

/** §5 capability matrika — vrstica za vsak provider registra (+ manual). */
export function bookingCapabilityMatrix(): BookingCapabilityRow[] {
  const rows: BookingCapabilityRow[] = PROVIDER_REGISTRY.map((p) => {
    const m = getProductionMatrixEntry(p.slug);
    const stage = m?.stage ?? "DISCOVERED";
    const price = m?.price ?? "NOT_SUPPORTED";
    const cta = m?.cta ?? "info_only";
    const env = providerEnvAccess(p.slug);
    const missing = [...env.affiliate, ...env.api]
      .filter((c) => !c.present)
      .map((c) => c.envVar);
    const row: BookingCapabilityRow = {
      slug: p.slug,
      discovery: discoveryCell(p.slug, stage, p.active),
      affiliate: affiliateCell(p.slug, p.capabilities.affiliate),
      apiSearch: apiSearchCell(p.slug, stage, p.active),
      quote: quoteCell(p.slug, price, stage),
      booking: bookingCell(p.slug, cta),
      cancellation: cancellationCell(p.slug, cta),
      webhook: webhookCell(p.slug),
      refund: refundCell(p.slug, cta),
      credentials: {
        productionConfigured: env.productionConfigured,
        missingEnvVars: missing,
      },
      e2e: E2E_PROVEN.has(p.slug) ? "LIVE" : "NOT_RUN",
    };
    if (p.slug === "sto") {
      row.note = "RAG vsebina (llms.txt ingest) — NE nastopa kot supply iskanje/sloj zemljevida.";
    }
    if (p.slug === "kiwitaxi") {
      row.note = "Statični CSV feed (objavljene cene) — živi citat ni na voljo nikoli.";
    }
    if (p.slug === "own") {
      row.note = "Stripe tok tržnice: demo/501 do aktivacije pravih plačil; cancel kodiran, refund ne.";
    }
    return row;
  });
  // manual (izrecni slug izval 3 — ni supply vir, je uporabnikova izjava)
  rows.push({
    slug: "manual",
    discovery: "NOT_APPLICABLE",
    affiliate: "NOT_APPLICABLE",
    apiSearch: "NOT_APPLICABLE",
    quote: "NOT_APPLICABLE",
    booking: "USER_ATTESTED",
    cancellation: "USER_ATTESTED",
    webhook: "NOT_APPLICABLE",
    refund: "USER_ATTESTED",
    credentials: { productionConfigured: false, missingEnvVars: [] },
    e2e: "LIVE", // val 3 E2E: ročni vnos + uvoz KiwiTaxi/hotel → DRAFT/CONFIRMED
  });
  return rows;
}

/** Vrstica posameznega providerja ( ali undefined). */
export function getBookingCapabilityRow(
  slug: string
): BookingCapabilityRow | undefined {
  return bookingCapabilityMatrix().find((r) => r.slug === slug);
}

// ---------------------------------------------------------------------------
// DVOJEZIČNE OZNANE CELIC (UI — /vir-podatkov §5 tabela)
// ---------------------------------------------------------------------------

export const CAPABILITY_CELL_LABELS: Record<
  CapabilityCell,
  { sl: string; en: string }
> = {
  LIVE: { sl: "živo", en: "live" },
  CODE_READY: {
    sl: "kodirano, čaka dostop",
    en: "coded, awaiting access",
  },
  ARCHITECTURE: {
    sl: "arhitektura (0 živih)",
    en: "architecture (0 live)",
  },
  USER_ATTESTED: {
    sl: "uporabnikova izjava",
    en: "user-attested",
  },
  NOT_SUPPORTED: { sl: "ni podprto", en: "not supported" },
  NOT_APPLICABLE: { sl: "neveljavno", en: "not applicable" },
  NOT_RUN: { sl: "E2E ni izveden", en: "E2E not run" },
};

/** Naslovi stolpcev §5 matrike (SL+EN — vrstni red po naročniku). */
export const CAPABILITY_COLUMN_LABELS: Record<
  | "provider" | "discovery" | "affiliate" | "apiSearch" | "quote" | "booking"
  | "cancellation" | "webhook" | "refund" | "credentials" | "e2e",
  { sl: string; en: string }
> = {
  provider: { sl: "Ponudnik", en: "Provider" },
  discovery: { sl: "Odkrivanje", en: "Discovery" },
  affiliate: { sl: "Affiliate", en: "Affiliate" },
  apiSearch: { sl: "API iskanje", en: "API search" },
  quote: { sl: "Citat", en: "Quote" },
  booking: { sl: "Rezervacija", en: "Booking" },
  cancellation: { sl: "Odpoved", en: "Cancellation" },
  webhook: { sl: "Webhook", en: "Webhook" },
  refund: { sl: "Refundacija", en: "Refund" },
  credentials: { sl: "Poverilnice", en: "Credentials" },
  e2e: { sl: "E2E", en: "E2E" },
};
