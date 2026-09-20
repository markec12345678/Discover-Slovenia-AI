// ============================================================================
// TASK 58 — POTOVANJA: TOK REZERVACIJE + KANONSKI MODEL POTRDITVE (§17–§19)
// ============================================================================
// Izpeljava pravilnega toka za vsak izbrani produkt IZ kanonskega bookingMode
// (NIKOLI iz klientove trditve) + model potrditve z ISKRENIMI invariantami:
//
//  A. API_BOOKING     — selection → revalidate → availability → booking
//                       request → provider reservation → payment → provider
//                       confirmation → save confirmation.
//  B. EXTERNAL_BOOKING— selection → revalidate → verified provider URL →
//                       zunanj ponudnik → uporabnik zaključi tam. NIKOLI ne
//                       trdimo, da smo plačali namesto njega.
//  C. AFFILIATE       — selection → verified affiliate URL → provider →
//                       provider payment → provider confirmation. Shranimo
//                       SAMO tisto, kar provider dejansko vrne.
//  D. INFO_ONLY       — selection → informacija vira. Brez fake rezervacije.
//
// DANAŠNJE DEJANSKO STANJE (0 poverilnic): A je arhitektura (0 ponudnikov),
// B/C sta realna (kiwitaxi prek /go), D je realna (OSM/dogodki). Lastna
// tržnica (own_marketplace) ima SVOJ Stripe tok (Booking model) — ločeno.
// ============================================================================

import type {
  BookingCapability,
  BookingFlow,
  ConfirmationStatus,
  MapProductStatus,
} from "./types";
import type { BookingMode, ProviderSlug } from "@/lib/supply/types";

// ---------------------------------------------------------------------------
// ZMOŽNOST REZERVACIJE IZ KANONSKEGA MODELA (bookingMode → tok)
// ---------------------------------------------------------------------------

/** Preslikava kanonskega bookingMode → potovalni tok zmožnosti. */
export function bookingCapabilityOf(
  mode: BookingMode
): BookingCapability {
  switch (mode) {
    case "affiliate_redirect":
      return {
        flow: "external_affiliate",
        payment: "external_provider",
        confirmation: "external",
        label: {
          sl: "Rezervacija in plačilo pri ponudniku (zunanja povezava)",
          en: "Booking and payment at the provider (external link)",
        },
      };
    case "api_bookable":
      return {
        flow: "api_booking",
        payment: "external_provider",
        confirmation: "provider_api",
        label: {
          sl: "Rezervacija prek API-ja ponudnika",
          en: "Booking via the provider API",
        },
      };
    case "own_marketplace":
      // Lastna tržnica ima SVOJ Stripe tok (Booking model — ločena pot);
      // v journey kontekstu jo iskreno označimo kot našo rezervacijo.
      return {
        flow: "api_booking",
        payment: "merchant_side",
        confirmation: "provider_api",
        label: {
          sl: "Rezervacija pri lokalnem ponudniku (naša tržnica)",
          en: "Booking with a local provider (our marketplace)",
        },
      };
    case "info_only":
    default:
      return {
        flow: "info_only",
        payment: "none",
        confirmation: "none",
        label: {
          sl: "Samo informacija — brez rezervacije",
          en: "Information only — no booking",
        },
      };
  }
}

// ---------------------------------------------------------------------------
// MODEL POTRDITVE (§19) — statusi + INVARIANTE
// ---------------------------------------------------------------------------

/**
 * Ali je status zaključno-potrjen (izključno iz providerjevega odgovora)?
 * EXTERNAL pomeni: rezervacija/potrditev obstaja PRI PONUDNIKU, ne pri nas —
 * NIKOLI se ne sme preslikati v CONFIRMED.
 */
export function isProviderConfirmed(status: ConfirmationStatus): boolean {
  return status === "CONFIRMED" || status === "PAID";
}

/** Veljavni prehodi statusov (drži EXTERNAL ≠ CONFIRMED). */
const ALLOWED_TRANSITIONS: Record<ConfirmationStatus, ConfirmationStatus[]> = {
  SELECTED: ["PENDING", "PAYMENT_REQUIRED", "CANCELLED", "FAILED"],
  PENDING: ["PAYMENT_REQUIRED", "CONFIRMED", "FAILED", "CANCELLED", "UNKNOWN"],
  PAYMENT_REQUIRED: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["CONFIRMED", "CANCELLED"], // paid ≠ confirmed (vračilo možno)
  CONFIRMED: ["CANCELLED"],
  FAILED: [],
  CANCELLED: [],
  UNKNOWN: ["PENDING", "FAILED", "CANCELLED"],
  // EXTERNAL je ABSORPTIVNO stanje: potrditev živi pri ponudniku — nikoli
  // ne postane naša CONFIRMED (le ponudnik sam lahko izda svojo potrditev,
  // in to prek svojega kanala, ne prek našega prehoda).
  EXTERNAL: ["EXTERNAL", "CANCELLED", "UNKNOWN"],
};

/** Ali je prehod statusov dovoljen (isklena državna naprava §19). */
export function isValidStatusTransition(
  from: ConfirmationStatus,
  to: ConfirmationStatus
): boolean {
  return (ALLOWED_TRANSITIONS[from] ?? []).includes(to);
}

/** Zapišljiv zapis potrditve — SAMO tisto, kar provider dejansko vrne. */
export interface BookingConfirmationRecord {
  provider: ProviderSlug;
  providerProductId: string;
  status: ConfirmationStatus;
  /** SAMO če ga je vrnil provider (EXTERNAL tok ga NIMA — null). */
  providerBookingId?: string;
  /** Potrjena cena SAMO iz providerjevega odgovora (nikoli klientova). */
  confirmedPrice?: { amount: number; currency: "EUR" };
  confirmationUrl?: string;
  cancellationUrl?: string;
  /** Surovi podatki, ki jih je vrnil provider (JSON). */
  providerPayload?: string;
}

/**
 * Validacija zapisa potrditve ob meji persistenčne plasti:
 *  - CONFIRMED/PAID ZAHTEVATA providerBookingId (brez njega je to trditev,
 *    ne podatek) — zavrnjeno;
 *  - EXTERNAL ne sme nositi providerBookingId/potrdilne URL-jev NASE
 *    (živi pri ponudniku, ne pri nas).
 * Vrne { ok: true } ali { ok: false, reason } — klicalnik zavrne zapis.
 */
export function validateConfirmationRecord(
  rec: BookingConfirmationRecord
): { ok: true } | { ok: false; reason: string } {
  if (isProviderConfirmed(rec.status)) {
    if (!rec.providerBookingId || rec.providerBookingId.trim() === "") {
      return {
        ok: false,
        reason:
          "CONFIRMED/PAID zahteva providerBookingId iz providerjevega odgovora (sicer je trditev, ne potrditev)",
      };
    }
    if (rec.confirmedPrice == null) {
      return {
        ok: false,
        reason: "CONFIRMED/PAID zahteva potrjeno ceno iz providerjevega odgovora",
      };
    }
  }
  if (rec.status === "EXTERNAL") {
    if (rec.providerBookingId != null) {
      return {
        ok: false,
        reason: "EXTERNAL zapis ne sme nositi providerBookingId (potrditev živi pri ponudniku, ne pri nas)",
      };
    }
    if (rec.confirmedPrice != null) {
      return {
        ok: false,
        reason: "EXTERNAL zapis ne sme nositi potrjene cene (ni od ponudnika)",
      };
    }
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// STATUSI PINOV (§13) — nikoli lažna rezervacija
// ---------------------------------------------------------------------------

/**
 * Ali mapStatus nakazuje DEJANSKO rezervacijo? booker/pending/failed so
 * dosegljivi SAMO prek API_BOOKING toka; external_affiliate tok PINA NIKOLI
// ne sme barvati kot „booked" (preusmeritev ≠ rezervacija).
 */
export function impliesReservation(status: MapProductStatus): boolean {
  return status === "booked" || status === "pending" || status === "failed";
}

/** Ali je mapStatus dosegljiv v DANEM toku rezervacije (iskrenost)? */
export function mapStatusReachable(
  status: MapProductStatus,
  flow: BookingFlow
): boolean {
  if (!impliesReservation(status)) return true; // selected/recommended/informational vedno
  // Rezervacijski statusi so dosegljivi SAMO prek API_BOOKING plov.
  return flow === "api_booking";
}

/** Privzeti status pina za produkt (dokler uporabnik ne izbere). */
export function defaultMapStatus(flow: BookingFlow): MapProductStatus {
  // Strežniško priporočilo za rezervabilne (SUGGESTED semantika),
  // informacija za info_only — NIKOLI „booked".
  return flow === "info_only" ? "informational" : "recommended";
}
