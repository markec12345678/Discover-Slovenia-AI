// ============================================================================
// KONZULTACIJE — skupne konstante (Faza 3c: model „ponudniki plačajo")
// ============================================================================
// Deljeno med CLIENT (ConsultationDialog validacija) in SERVER (API routes)
// — zato TU NI NOBENIH server-only importov (db, ai-client …).
//
// Model (kot Booking.com): uporabnik NE plačuje — globoka osebna
// konzultacija je BREZPLAČNA (dnevna meja na e-pošto varuje AI stroške).
// Monetizacija poteka na strani ponudnikov: citirani premium partnerji
// (B2B flywheel) + atribuirane rezervacije (Booking.source = "consultation").
// ============================================================================

/** Validacijske meje konzultacijskega vprašanja — ZRCALI strežnik. */
export const CONSULTATION_QUESTION_MIN = 20;
export const CONSULTATION_QUESTION_MAX = 2000;
export const CONSULTATION_DATES_MAX = 60;
export const CONSULTATION_PARTY_MAX = 80;

/** E-poštni vzorec — enak princip kot ostale poti platforme. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Dopustni interesi (chips v dialogu; strežnik zavrača vse ostale). */
export const CONSULTATION_INTERESTS = [
  "narava",
  "pohodništvo",
  "gastronomija",
  "vino",
  "kultura",
  "zgodovina",
  "družina z otroki",
  "adrenalin",
  "vrelci & wellness",
  "fotografija",
] as const;

/** Največ izbranih interesov naenkrat. */
export const CONSULTATION_INTERESTS_MAX = 6;

/** Dopustni proračuni (fiksne vrednosti — prikaz in validacija). */
export const CONSULTATION_BUDGETS = [
  "do 300 €",
  "300–600 €",
  "600–1000 €",
  "1000 € in več",
] as const;

/** Dnevna meja konzultacij na e-pošto (AI stroški — strežnik izvršuje). */
export const DAILY_CONSULTATIONS = 3;
