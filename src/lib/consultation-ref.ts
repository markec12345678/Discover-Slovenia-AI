// ============================================================================
// ATRIBUCIJA KONZULTACIJA → REZERVACIJA (Faza 3c — model „ponudniki plačajo")
// ============================================================================
// Booking-style zanka: uporabnik prejme BREZPLAČNO osebno konzultacijo →
// rezervacija izkušnje, ki sledi, se atribuira konzultaciji
// (Booking.source = "consultation") → ponudnik vidi, da AI konzultacija
// PRIHAJA do rezervacij → utemelji premium naročnino.
//
// session-scoped (ne trajen): atribucija velja za trenutno sejo
// brskalnika — pošteno okno vpliva, brez trajnega sledenja uporabnika.

const KEY = "dsai_consultation_ref";

/** Označi sejo kot »iz konzultacije« (pokliči ob dostavi odgovora). */
export function setConsultationRef(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // sessionStorage lahko vrže (zasebni način) — atribucija je best-effort
  }
}

/** true, če je v tej seji uporabnik prejel konzultacijo. */
export function hasConsultationRef(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

/** Počisti oznako (npr. po uspešno atribuirani rezervaciji). */
export function clearConsultationRef(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    // best-effort
  }
}
