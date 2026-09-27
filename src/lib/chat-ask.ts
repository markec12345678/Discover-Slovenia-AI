// ============================================================================
// W9 (Issue #15, 1.130.0): KONTEKSTUALNI DEEP-LINK VSEBINA → KLEPET
// ============================================================================
// Trip Planner AIjev najmočnejši akvizicijski vzorec (raziskava Task 19-b):
// vsak vodniški razdelek ponudi klepet z vnaprej-izpolnjenim, namenu-skaldnim
// vprašanjem. Pri nas po kanonu ZERO FEATURE LOSS:
//
//   1. Vstopna točka (CTA v vsebini) pokliče openChatWithQuestion() →
//      CustomEvent CHAT_ASK_EVENT → Chatbot se ODPRE z pred-izpolnjenim
//      VNOSNIM POLJEM.
//   2. NOBENO vprašanje se NE pošlje samodejno — uporabnik vidi vprašanje,
//      ga lahko UREDI ali izbriše in sam odloči, kdaj ga pošlje (varovalo
//      iz verifikacijskih meril W9: "vidno + uredljivo pred pošiljanjem").
//   3. Klepet brez dogodka in brez initialQuestion propa je NESPREMENJEN
//      (bit-identičen na obstoječih 12+ površinah — regresijsko merilo).
//
// Vzorec dogodaja je ISTI kot pri CHAT_ADD_PLACE_EVENT (chat:add-place,
// 1.42.0) — enotna konvencija "chat:*" CustomEvent-ov na window.
//
// Vprašanje se VEDNO generira strežniško v jeziku strani (getTranslations,
// 4 jeziki W1) — klient samo posreduje niz; tu ni jezikovne logike.
// ============================================================================

/** Ime CustomEvent-a (vstopna točka → Chatbot). Ni cancelable — Chatbot
 *  je edini poslušalec in dogodek ne opisuje dejanja, ki bi ga lahko
 *  prevzel nek drug modul (za razliko od chat:add-place). */
export const CHAT_ASK_EVENT = "chat:ask";

/** Omejitev dolžine — ISTA kot vnosno polje klepeta (maxLength 500). */
export const CHAT_ASK_MAX = 500;

export interface ChatAskDetail {
  /** Pred-izpolnjeno vprašanje (jezik strani, strežniško sestavljeno). */
  question: string;
}

/**
 * Odpre klepet s pred-izpolnjenim vprašanjem (ne pošlje ničesar!).
 *
 * Strni na 500 znakov (enaka meja kot vnosno polje) in tiho ignorira
 * prazne nize — poklicati sme samo klient (window obstaja).
 */
export function openChatWithQuestion(question: string): void {
  if (typeof window === "undefined") return;
  const q = (question ?? "").trim().slice(0, CHAT_ASK_MAX);
  if (!q) return;
  window.dispatchEvent(
    new CustomEvent<ChatAskDetail>(CHAT_ASK_EVENT, { detail: { question: q } })
  );
}
