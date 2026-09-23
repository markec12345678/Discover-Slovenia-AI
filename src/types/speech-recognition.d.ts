// ============================================================================
// Web Speech API — minimalne ambientne deklaracije (Issue #2 §6)
// ============================================================================
// TypeScript DOM lib vsebuje SpeechSynthesis/TTS (§7), NE pa SpeechRecognition
// (STT, §6) — slednji je še vedno predponski API (webkitSpeechRecognition) in
// ni v lib.dom.d.ts. Tu so deklaracije, ki jih klepet potrebuje — namerno
// MINIMALNE (samo uporabljene člane), da ne dopuščajo izumljanja API-jev.
//
// Runtime podpora se PREVERJA pred uporabo (sttSupported spodaj): brskalnik
// brez STT → gumb za mikrofon se NE izriše (padec na besedilni vnos je
// privzeto viden — Issue #2 zahteva "UI mora pravilno pokazati fallback na
// tekstovni vnos", kar besedilni vnos vedno je).
// ============================================================================

interface SpeechRecognitionAlternative {
  readonly transcript: string;
  readonly confidence: number;
}

interface SpeechRecognitionResult {
  readonly isFinal: boolean;
  readonly length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  readonly resultIndex: number;
  readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  /** "no-speech" | "not-allowed" | "aborted" | "network" | "audio-capture" | ... */
  readonly error: string;
  readonly message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror: ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionConstructor {
  new (): SpeechRecognition;
  prototype: SpeechRecognition;
}

/**
 * Okrepitev Window vmesnika (merge z lib.dom.d.ts) — brskalnikovi STT
 * konstruktorji. Opcijska (: undefined) — v nepodprtih brskalnikih
 * LASTNOST NE OBSTAJA, kar je pravilen signal za feature detection.
 */
interface Window {
  /** Standardno ime (novejši Chrome/Edge/Safari). */
  SpeechRecognition?: SpeechRecognitionConstructor;
  /** Predponska različica (starejši Chrome/Safari). */
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}
