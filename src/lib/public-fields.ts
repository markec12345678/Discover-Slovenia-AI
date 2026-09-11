import type { Listing, Experience, Product } from "@prisma/client";

// ============================================================================
// JAVNA POLJA — sanitizacija javnih API odgovorov (FW1, audit R3 🟠)
// ============================================================================
// Problem: javne rute (/api/listings, /api/experiences, /api/products,
// /api/collections/[slug] + [slug] detajli) sovražno prek celega DB zapisa
// (`...row` spread) — v javni JSON je tako pristal:
//   - ownerEmail  → PRIJAVNI e-mail ponudnika (ne poslovni kontakt!)
//   - ownerId, approvedBy (ID admina), submittedAt/approvedAt
//   - rejectionReason (interni komentar moderatorja)
//   - draftNudge* (notranja avtomatizacija)
//   - aiRecommendations (B2B metrika)
// Demo podatki imajo ownerEmail null → bila je latentna napaka, ki jo
// aktivira PRVI realni ponudnik. Javno se vrnejo SAMO prikazna/polja po
// namenu (števci viewCount/clickCount/saleCount/stock/bookingCount so
// javni social proof in se namerno obdržijo).
//
// Uporaba: vedno PRED serializacijo v javni ruti:
//   const pub = toPublicListing(raw); // → ...pub, images: JSON.parse(...)
// Owner/admin poti NASVEDOM ne uporabljajo teh funkcij (tam so interna
// polja legitimna).

/** Lokal: odstrani interna/admin polja pred javnim odgovorom. */
export function toPublicListing(listing: Listing) {
  const {
    ownerId,
    ownerEmail,
    rejectionReason,
    approvedBy,
    approvedAt,
    submittedAt,
    draftNudgeStep,
    draftNudgeSentAt,
    aiRecommendations,
    ...publicListing
  } = listing;
  return publicListing;
}

/** Izkušnja: odstrani interna/admin polja pred javnim odgovorom. */
export function toPublicExperience(experience: Experience) {
  const {
    ownerId,
    rejectionReason,
    submittedAt,
    ...publicExperience
  } = experience;
  return publicExperience;
}

/** Izdelek: odstrani interna/admin polja pred javnim odgovorom. */
export function toPublicProduct(product: Product) {
  const {
    ownerId,
    rejectionReason,
    submittedAt,
    ...publicProduct
  } = product;
  return publicProduct;
}
