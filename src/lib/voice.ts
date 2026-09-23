// ============================================================================
// VOICE — brskalnikova glasovna plast brez AI API ključa (Issue #2 §6/§7/§8)
// ============================================================================
// CILJ: uporabnik lahko z Discover Slovenijo govori BREZ lastnega AI ključa:
//   §6  VHOD  — Web Speech API SpeechRecognition (brskalnikov STT),
//               brez SDK in brez ključa;
//   §7  IZHOD — window.speechSynthesis (brskalniški/native TTS), brez ključa;
//   §8  CELI KLEPET — mikrofon → STT → besedilo → /api/chat (deterministična
//               domenska plast ali AI, kar je na voljo) → prikaz → TTS.
//
// POŠTENOST: NIč se ne lažnivo pretvarja — če brskalnik STT ne podpira, se
// gumb za mikrofon NE izriše (besedilni vnos je vedno viden = pravilen
// fallback); TTS naprave se ne posnema z API klicem. Vse funkcije so čiste
// (brez stanja) in unit-testljive.
// ============================================================================

/** Ali brskalnik podpira SpeechRecognition (STT). Client-only. */
export function sttSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  );
}

/** Ali brskalnik podpira speechSynthesis (TTS). Client-only. */
export function ttsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Konstruktor SpeechRecognition ( ali null, če nepodprto). */
export function speechRecognitionCtor(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
}

/** locale aplikacije → BCP-47 oznaka za STT/TTS jezik. */
export function speechLanguageTag(locale: string): string {
  switch (locale) {
    case "en":
      return "en-US";
    case "de":
      return "de-DE";
    case "it":
      return "it-IT";
    default:
      return "sl-SI";
  }
}

/**
 * Besedilo odgovora → besedilo ZA IZGOVOR (TTS).
 *
 * Odstrani vizualni šum, ki bi ga sinteza glasov nerodno prebrala:
 * citatne oznake [1], markdown (* _ # ` >), http(s) URL-je, emoji in
 * znake oglatega odstavka (•). Poti ("/nacrtuj") namerno ostanejo —
 * kratke in berljive.
 */
export function speechTextForUtterance(text: string): string {
  return text
    .replace(/\[(\d{1,2})\]/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[*_#`>]+/g, " ")
    .replace(/[•·]+/g, " ")
    .replace(
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}]/gu,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Ali naj bo izgovor SAMODEJEN (cel glasovni klepet §8): ja, kadar je bilo
 * zadnje uporabnikovo sporočilo REČENO (STT), ne tipkovnico.
 * (Oceno izvede klicatelj — ta helper je tu za dokumentacijo semantike in
 * enoten vir v testih.)
 */
export function shouldAutoSpeak(lastInputViaVoice: boolean): boolean {
  return lastInputViaVoice;
}
