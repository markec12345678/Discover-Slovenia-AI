// ============================================================================
// ATRIBUCIJA KONZULTACIJA → REZERVACIJA (Faza 3c — model „ponudniki plačajo")
// ============================================================================
// Booking-style zanka: uporabnik prejme BREZPLAČNO osebno konzultacijo →
// rezervacija izkušnje, ki sledi, se atribuira konzultaciji
// (Booking.source = "consultation") → ponudnik vidi, da AI konzultacija
// PRIHAJA do rezervacij → utemelji premium naročnino.
//
// P1: 30-DNEVNI PIŠKOTEK (first-party, brez PII) — rezervacija se atribuira
// tudi, če uporabnik kasneje (do 30 dni) direktno rezervira izkušnjo, ki jo
// je konzultacija priporočila (enako okno kot Booking/Viator affiliate).
// To je standardni first-party atribucijski piškotek z vrednostjo "1" —
// ne vsebuje osebnih podatkov in sledenja tretjim osebam.
// Fallback: sessionStorage (private mode / blokirani piškotki).

const KEY = "dsai_consultation_ref";
const COOKIE = "dsai_consultation_ref";
const MAX_AGE_DAYS = 30;

/** Označi 30-dnevno atribucijsko okno (pokliči ob dostavi odgovora). */
export function setConsultationRef(): void {
  try {
    // First-party piškotek — 30 dni, SameSite=Lax, brez PII (vrednost "1")
    document.cookie = `${COOKIE}=1; max-age=${MAX_AGE_DAYS * 24 * 60 * 60}; path=/; samesite=lax`;
  } catch {
    // document.cookie lahko vrže v restriktivnih okoljih — best-effort
  }
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // sessionStorage lahko vrže (zasebni način) — atribucija je best-effort
  }
}

/** true, če je v atribucijskem oknu (piškotek ALI seja) uporabnik prejel konzultacijo. */
export function hasConsultationRef(): boolean {
  try {
    if (sessionStorage.getItem(KEY) === "1") return true;
  } catch {
    // nadaljuj s piškotkom
  }
  try {
    return document.cookie
      .split(";")
      .some((c) => c.trim().split("=")[0] === COOKIE);
  } catch {
    return false;
  }
}

/** Počisti oznako (npr. po uspešno atribuirani rezervaciji). */
export function clearConsultationRef(): void {
  try {
    // Iztegni piškotek (max-age=0)
    document.cookie = `${COOKIE}=; max-age=0; path=/; samesite=lax`;
  } catch {
    // best-effort
  }
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
