// ============================================================================
// KONZULTACIJE — skupne konstante (Faza 3b-2)
// ============================================================================
// Deljeno med CLIENT (ConsultationDialog validacija) in SERVER (API routes)
// — zato TU NI NOBENIH server-only importov (db, ai-client …).
//
// Freemium model:
//   1 brezplačno vprašanje/dan (ask-local) → globoka osebna konzultacija
//   kot plačljiv paket (krediti, vezani na e-pošto).
// ============================================================================

/** Validacijske meje konzultacijskega vprašanja — ZRCALI strežnik. */
export const CONSULTATION_QUESTION_MIN = 20;
export const CONSULTATION_QUESTION_MAX = 2000;
export const CONSULTATION_NAME_MIN = 2;
export const CONSULTATION_NAME_MAX = 40;
export const CONSULTATION_DATES_MAX = 60;
export const CONSULTATION_PARTY_MAX = 80;

/** E-poštni vzorec — enak princip kot ostale checkout poti platforme. */
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

/** Paketi konzultacij — source of truth za cene + število kreditov. */
export interface ConsultationPackage {
  key: "single" | "pack3";
  name: string;
  credits: number;
  /** Znesek v EUR (končna cena, DDV vključen). */
  priceEur: number;
  /** Kratek opis za kartico paketa. */
  description: string;
}

export const CONSULTATION_PACKAGES: ConsultationPackage[] = [
  {
    key: "single",
    name: "Ena konzultacija",
    credits: 1,
    priceEur: 9.9,
    description:
      "Eno globoko vprašanje — osebni načrt lokalca za tvoje potovanje.",
  },
  {
    key: "pack3",
    name: "Paket 3 konzultacije",
    credits: 3,
    priceEur: 19.9,
    description:
      "Tri globoka vprašanja (npr. pred, med in po načrtovanju) — prihraniš 9,80 €.",
  },
];

/** Paket po ključu (typed) — null za neveljaven key. */
export function packageByKey(
  key: string
): ConsultationPackage | null {
  return CONSULTATION_PACKAGES.find((p) => p.key === key) ?? null;
}

/** Znesek v berljivi obliki (€9,90 / €19,90 — slovenska decimalna vejica). */
export function formatEur(amount: number): string {
  return `${amount.toFixed(2).replace(".", ",")} €`;
}
