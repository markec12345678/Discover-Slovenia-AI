/**
 * A/B test infra — deterministična razvrstitev variant.
 *
 * Test "subscription_pitch_v1" (P2-4): naročninski nagovor na zavihku
 * »Naročnina« owner dashboarda.
 *   - Varianta A (kontrola): obstoječi vrstni red (kartice paketov).
 *   - Varianta B: na vrhu prelomni kalkulator ("Se Vam Premium izplača?"),
 *     za njim obstoječa vsebina.
 *
 * Determinizem: FNV-1a hash semena → mod 2. ISTI owner (isti id/email)
 * vedno dobi ISTO varianto — tudi med reloadi, sessioni in prekizi med
 * SSR/klientom (ista čista funkcija teče povsod, brez naključnosti).
 */

export const AB_TEST_NAME = "subscription_pitch_v1";

export type AbVariant = "A" | "B";

/** FNV-1a (32-bit) hash — hiter, dobro porazdeljen, brez odvisnosti. */
function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  // Math.imul drži predznak — normaliziramo na unsigned 32-bit.
  return hash >>> 0;
}

/**
 * Deterministična razvrstitev v varianto A ali B.
 *
 * Enak seed → VEDNO ista varianta (~50/50 porazdelitev čez populacijo
 * — preverjeno na 200 znanih seedov v E2E). SSR-varno: čista funkcija,
 * brez window/document/Math.random.
 *
 * Klic iz klienta: getAbVariant(session?.user?.id ?? session?.user?.email ?? "anon")
 */
export function getAbVariant(seed: string): AbVariant {
  // Prazna/nedoločena semena konsistentno umesti v isto variantno skupino —
  // pomembno je le, da je razvrstitev stabilna (anonimni obiskovalci niso
  // deležni A/B testa na owner dashboardu).
  return fnv1a(seed) % 2 === 0 ? "A" : "B";
}
