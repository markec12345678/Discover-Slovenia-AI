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
// ISSUE #24 Sklop 8 (1.170.0): 6-jezične oznake (Go Mode žeton rezervacije).
import type { GoStrings } from "./go-lang";

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
 * TASK 28 (Tier 1 #2): statusi, ki štejejo kot POTRJENO pri ponudniku —
 * IZKLJUČEN vir resnice za isProviderConfirmed() in za poizvedbe, ki
 * iščejo potrjene rezervacije (npr. žeton »overjena rezervacija« v
 * POST /api/reviews — Prisma where { in: [...] } ne more klicati funkcije).
 */
export const PROVIDER_CONFIRMED_STATUSES: ConfirmationStatus[] = [
  "CONFIRMED",
  "PAID",
  "MODIFIED",
];

/**
 * Ali je status zaključno-potrjen (izključno iz providerjevega odgovora)?
 * EXTERNAL pomeni: rezervacija/potrditev obstaja PRI PONUDNIKU, ne pri nas —
 * NIKOLI se ne sme preslikati v CONFIRMED. TASK 99: MODIFIED (spremenjena
 * POTRJENA rezervacija) je prav tako provider-potrjen dogodek.
 */
export function isProviderConfirmed(status: ConfirmationStatus): boolean {
  return PROVIDER_CONFIRMED_STATUSES.includes(status);
}

/**
 * TASK 99 (issue #1 §2) — 6-jezične oznake statusov potrditve za UI
 * (iskrene: npr. REFUNDED samo iz providerjevega odgovora, EXTERNAL vedno
 * „pri ponudniku"). Uporabljajo se v My Trip prekrivki iz JourneyBooking.
 * ISSUE #4 §4 (val 3): DRAFT — osnutek, ki čaka uporabnikovo potrditev
 * (vedno z razloženim izvorom v source polju).
 * ISSUE #24 Sklop 8 (1.170.0): +it/de/fr/es (Go Mode žeton rezervacije —
 * isto dedno kanon GL: manjkajoč prevod → EN, nikoli SL za tuje).
 */
export const CONFIRMATION_STATUS_LABELS: Record<
  ConfirmationStatus,
  GoStrings
> = {
  DRAFT: {
    sl: "Osnutek — čaka potrditev",
    en: "Draft — awaiting confirmation",
    it: "Bozza — in attesa di conferma",
    de: "Entwurf — wartet auf Bestätigung",
    fr: "Brouillon — en attente de confirmation",
    es: "Borrador — a la espera de confirmación",
  },
  SELECTED: {
    sl: "Izbrano",
    en: "Selected",
    it: "Selezionato",
    de: "Ausgewählt",
    fr: "Sélectionné",
    es: "Seleccionado",
  },
  BOOKING_REQUESTED: {
    sl: "Zahteva za rezervacijo oddana",
    en: "Booking request submitted",
    it: "Richiesta di prenotazione inviata",
    de: "Buchungsanfrage übermittelt",
    fr: "Demande de réservation envoyée",
    es: "Solicitud de reserva enviada",
  },
  PENDING: {
    sl: "Čaka na ponudnika",
    en: "Awaiting provider",
    it: "In attesa del fornitore",
    de: "Wartet auf den Anbieter",
    fr: "En attente du prestataire",
    es: "A la espera del proveedor",
  },
  PAYMENT_REQUIRED: {
    sl: "Zahtevano plačilo",
    en: "Payment required",
    it: "Pagamento richiesto",
    de: "Zahlung erforderlich",
    fr: "Paiement requis",
    es: "Pago requerido",
  },
  PAID: {
    sl: "Plačano (čaka potrditev)",
    en: "Paid (awaiting confirmation)",
    it: "Pagato (in attesa di conferma)",
    de: "Bezahlt (wartet auf Bestätigung)",
    fr: "Payé (en attente de confirmation)",
    es: "Pagado (a la espera de confirmación)",
  },
  CONFIRMED: {
    sl: "Potrjeno pri ponudniku",
    en: "Confirmed by provider",
    it: "Confermato dal fornitore",
    de: "Vom Anbieter bestätigt",
    fr: "Confirmé par le prestataire",
    es: "Confirmado por el proveedor",
  },
  MODIFIED: {
    sl: "Spremenjeno pri ponudniku",
    en: "Modified at the provider",
    it: "Modificato dal fornitore",
    de: "Beim Anbieter geändert",
    fr: "Modifié chez le prestataire",
    es: "Modificado por el proveedor",
  },
  REFUNDED: {
    sl: "Vračilo izvršeno",
    en: "Refunded",
    it: "Rimborsato",
    de: "Erstattet",
    fr: "Remboursé",
    es: "Reembolsado",
  },
  EXPIRED: {
    sl: "Poteklo",
    en: "Expired",
    it: "Scaduto",
    de: "Abgelaufen",
    fr: "Expiré",
    es: "Caducado",
  },
  FAILED: {
    sl: "Spodletelo",
    en: "Failed",
    it: "Non riuscito",
    de: "Fehlgeschlagen",
    fr: "Échoué",
    es: "Fallido",
  },
  CANCELLED: {
    sl: "Preklicano",
    en: "Cancelled",
    it: "Cancellata",
    de: "Storniert",
    fr: "Annulée",
    es: "Cancelada",
  },
  UNKNOWN: {
    sl: "Stanje neznano",
    en: "Status unknown",
    it: "Stato sconosciuto",
    de: "Status unbekannt",
    fr: "Statut inconnu",
    es: "Estado desconocido",
  },
  EXTERNAL: {
    sl: "Zunanja rezervacija — pri ponudniku",
    en: "External booking — at the provider",
    it: "Prenotazione esterna — presso il fornitore",
    de: "Externe Buchung — beim Anbieter",
    fr: "Réservation externe — chez le prestataire",
    es: "Reserva externa — en el proveedor",
  },
};

/** Veljavni prehodi statusov (drži EXTERNAL ≠ CONFIRMED). TASK 99 (§2):
 * dopolnjen BOOKING_REQUESTED / MODIFIED / REFUNDED / EXPIRED poti —
 * REFUNDED iz PAID/CONFIRMED/CANCELLED (vračilo je providerjev dogodek,
 * ne naša odločitev), MODIFIED samo iz provider-potrjenih stanj,
 * EXPIRED iz ne-zaključenih čakalnih stanj (terminalen).
 * ISSUE #4 §4 (val 3): DRAFT — uporabnik potrdi uvoz (CONFIRMED — z
 * izvorom USER/IMPORTED, ne provider kanalom), ga prekliče ali označi
 * spodletelega; DRAFT NIKOLI ne vodi v PAID (plačilo potrjuje samo
 * providerjev dogodek ali uporabnikov strošek v TripExpense). */
const ALLOWED_TRANSITIONS: Record<ConfirmationStatus, ConfirmationStatus[]> = {
  // ISSUE #4 §4: uvožena rezervacija čaka potrditev — uporabnikova odločitev
  // (ali zaključek življenjskega cikla) zapre osnutek.
  DRAFT: ["CONFIRMED", "CANCELLED", "FAILED", "UNKNOWN", "EXTERNAL"],
  // HARDENING X1: dopolnjen EXTERNAL — POST sprejema SELECTED in EXTERNAL
  // kot začetna stanja, handoff klik pa je ravno prehod izbira → zunanja
  // rezervacija (brez tega roba bi drugi klik po izbiri dobil 409 in
  // optimistična UI vrstica se povrnila).
  SELECTED: [
    "BOOKING_REQUESTED",
    "PENDING",
    "PAYMENT_REQUIRED",
    "EXTERNAL",
    "CANCELLED",
    "FAILED",
  ],
  BOOKING_REQUESTED: [
    "PENDING",
    "PAYMENT_REQUIRED",
    "CONFIRMED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN",
  ],
  PENDING: [
    "PAYMENT_REQUIRED",
    "CONFIRMED",
    "FAILED",
    "CANCELLED",
    "EXPIRED",
    "UNKNOWN",
  ],
  PAYMENT_REQUIRED: ["PAID", "FAILED", "CANCELLED", "EXPIRED"],
  PAID: ["CONFIRMED", "MODIFIED", "REFUNDED", "CANCELLED"], // paid ≠ confirmed (vračilo možno)
  CONFIRMED: ["MODIFIED", "REFUNDED", "CANCELLED"],
  MODIFIED: ["CANCELLED", "REFUNDED", "UNKNOWN"],
  REFUNDED: [], // vračilo izvršeno — terminalno
  EXPIRED: [], // zadržani inventar/zahteva je potekla — terminalno
  FAILED: [],
  CANCELLED: ["REFUNDED"], // preklic s kasnejšim vračilom (providerjev dogodek)
  UNKNOWN: ["PENDING", "FAILED", "CANCELLED", "EXPIRED"],
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

/** Zapišljiv zapis potrditve — SAMO tisto, kar provider dejansko vrne.
 * ISSUE #4 §4 (val 3): `source` — izvor podatkov zapisa:
 *   "USER" | "IMPORTED" = uporabnik je podatke potrdil (ročni vnos oz.
 *   pregledan dokument — DOKUMENT JE ATESTACIJA: uporabnik potrdi, da mu je
 *   ponudnik izdal to potrditev; ne trdimo, da je provider potrdil prek
 *   NAŠE integracije — UI vedno razkrije izvor);
 *   "PROVIDER" | undefined = stara pravila (atestacije SAMO provider kanal).
 */
export type BookingSource = "USER" | "IMPORTED" | "PROVIDER";

export interface BookingConfirmationRecord {
  provider: ProviderSlug;
  providerProductId: string;
  status: ConfirmationStatus;
  /** Izvor podatkov (§4) — določa, katera atestacijska pravila veljajo. */
  source?: BookingSource;
  /** SAMO če ga je vrnil provider (EXTERNAL tok ga NIMA — null);
 *   izjema: source USER/IMPORTED — št. rezervacije IZ uporabnikovega
 *   dokumenta (uporabniško potrjen). */
  providerBookingId?: string;
  /** Potrjena cena SAMO iz providerjevega odgovora (nikoli klientova);
 *   izjema: source USER/IMPORTED — cena IZ uporabnikovega dokumenta. */
  confirmedPrice?: { amount: number; currency: "EUR" };
  confirmationUrl?: string;
  cancellationUrl?: string;
  /** Surovi podatki, ki jih je vrnil provider (JSON). */
  providerPayload?: string;
  /** §4: ekstrahirani/ročni podatki rezervacije (JSON) — SAMO source
 *   USER/IMPORTED (provider kanal nosi providerPayload). */
  importData?: string;
}

/**
 * Validacija zapisa potrditve ob meji persistenčne plasti:
 *  - CONFIRMED/PAID ZAHTEVATA providerBookingId (brez njega je to trditev,
 *    ne podatek) — zavrnjeno;
 *  - EXTERNAL ne sme nositi providerBookingId/potrdilne URL-jev NASE
 *    (živi pri ponudniku, ne pri nas);
 *  - DRAFT (§4) ne sme nositi atestacij — osnutek je NEPOTRJEN;
 *  - ISSUE #4 §4: source USER/IMPORTED sme nositi providerBookingId/
 *    confirmedPrice/importData — atestacija je UPORABNIKOV DOKUMENT
 *    (potrdilo, ki mu ga je izdal ponudnik, in ga je uporabnik potrdil),
 *    NE klientova trditev o providerjevem odgovoru prek naše integracije.
 *    Ključna razlika od S1 (POST hardening): S1 ščiti pred lažnimi
 *    trditvami „provider je potrdil MOJO izbiro“; §4 uvaža ZGODBO „to je
 *    moje potrdilo od ponudnika“ — vedno z razkritim izvorom (source +
 *    UI provenance žeton „uporabniško potrjeno“, NIKOLI smaragdno
 *    „provider potrjeno“ brez provider kanala).
 * Vrne { ok: true } ali { ok: false, reason } — klicalnik zavrne zapis.
 */
export function validateConfirmationRecord(
  rec: BookingConfirmationRecord
): { ok: true } | { ok: false; reason: string } {
  const userSourced = rec.source === "USER" || rec.source === "IMPORTED";
  if (isProviderConfirmed(rec.status) && !userSourced) {
    if (!rec.providerBookingId || rec.providerBookingId.trim() === "") {
      return {
        ok: false,
        reason:
          "CONFIRMED/PAID/MODIFIED zahteva providerBookingId iz providerjevega odgovora (sicer je trditev, ne potrditev)",
      };
    }
    if (rec.confirmedPrice == null) {
      return {
        ok: false,
        reason: "CONFIRMED/PAID/MODIFIED zahteva potrjeno ceno iz providerjevega odgovora",
      };
    }
  }
  // TASK 99 (§2): REFUNDED se nanaša na DEJANSKO providerjevo rezervacijo —
  // zahtevamo providerBookingId (znesek vračila je lahko drugačen od
  // prvotne cene, zato confirmedPrice ni obvezen).
  if (rec.status === "REFUNDED") {
    if (!rec.providerBookingId || rec.providerBookingId.trim() === "") {
      return {
        ok: false,
        reason:
          "REFUNDED zahteva providerBookingId (vračilo se nanaša na dejansko rezervacijo)",
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
  // ISSUE #4 §4: DRAFT je NEPOTRJEN — nosi SAMO importData (surovi parse),
  // nikoli atestacijskih polj (ta se zapišeta šele ob uporabnikovi potrditvi).
  if (rec.status === "DRAFT") {
    if (rec.providerBookingId != null || rec.confirmedPrice != null) {
      return {
        ok: false,
        reason:
          "DRAFT zapis ne sme nositi atestacijskih polj (osnutek čaka potrditev — ceno/št. rezervacije iz dokumenta hrani importData)",
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
