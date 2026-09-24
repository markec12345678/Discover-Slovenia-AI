// ============================================================================
// TASK 92 — TTS ENGINE: skupno jedro obeh strežniških TTS poti (1.82.0)
// ============================================================================
//
// Pred konsolidacijo sta obstajali DVE ločeni implementaciji istega dela:
//   1. /api/itinerary/tts (D2 »Poslušaj svoj načrt«, nabor #2) — svoj razrez
//      besedila, svoj WAV parser/spajalnik (~90 vrstic duplikata), vedno
//      glas "tongtong" (tudi za ANGLEŠKI tekst!), nova SDK instanca na
//      vsak klic, BREZ predpomnilnika in AbortController, katerega signal
//      SDK nikoli ni prejel (navidezna varovalka).
//   2. /api/tts (TASK 89 zvočni povzetek dneva, 1.80.0) — singleton klient,
//      LRU predpomnilnik, glas po jeziku, pravi timeout.
//
// Ta datoteka je ENO jedro, ki ga uporabljata obe poti:
//   - SDK klient: ena instanca na proces (getTtsClient, odpoved se ne
//     zapomni — naslednji poskus znova);
//   - glas po jeziku: sl → tongtong, en → jam (empirična izbira z ASR
//     povratno zanko 2026-09-24 — števke v tonduangu zvenijo angleško,
//     jam izgovarja nativno);
//   - LRU predpomnilnik po BAJTIH (32 MB) — skupen proračun obeh poti:
//     ponovno poslušanje istega dne/načrta ne plača novih TTS klicev;
//   - ZAPOREDNI klici (ne vzporedni): prijazno do limitov vira; časovni
//     proračun na klic s PRAVIM timeoutom (Promise.race, počiščen timer);
//   - spajanje WAV: concatWavBufferjev iz itinerary-audio.ts (NE-standardne
//     glave vira — fmt+AIGC+LIST+data — moramo parsati po RIFF kosih).
//
// STROGO strežniško: datoteko smejo uvažati SAMO route handlerji (SDK z
// poverilnicami platforme nikoli v klientni kodi).
// ============================================================================

import { concatWavBuffers } from "@/lib/itinerary-audio";
import { logAIUsage } from "@/lib/ai-usage";

// ── Jezik → glas (ENA resnica za obe poti) ────────────────────────────────

export type TtsLang = "sl" | "en";

/** Glas po jeziku (izbrano empirično z ASR povratno zanko — glej zgornjo
 *  opombo; prej je D2 pot za EN uporabnike govorila tongtong). */
export const VOICE_FOR_LANG: Record<TtsLang, string> = {
  sl: "tongtong",
  en: "jam",
};

/** Časovni proračun ENEGA TTS klica (izmerjeno ~2 s; 30 s varovalka). */
export const TTS_CALL_TIMEOUT_MS = 30_000;

// ── Napake jedra (iskreno razlikovanje vzrokov) ───────────────────────────

export type TtsEngineErrorKind =
  | "timeout" // klic vira ni odgovoril v roku
  | "unavailable" // SDK napaka / prazen odgovor
  | "invalid_wav"; // vir je vrnil nekaj, kar ni (skladnega) PCM WAV

export class TtsEngineError extends Error {
  readonly kind: TtsEngineErrorKind;

  constructor(kind: TtsEngineErrorKind, message: string) {
    super(message);
    this.name = "TtsEngineError";
    this.kind = kind;
  }
}

// ── LRU predpomnilnik po skupnih bajtih (varovalka pomnilnika) ────────────

export interface ByteLruStats {
  entries: number;
  bytes: number;
  maxBytes: number;
}

/**
 * LRU predpomnilnik z omejitvijo po SKUPNIH bajtih (ne števcu vnosov).
 *
 * Map vstavljalnega vrstnega reda = LRU: get() osveži pozicijo, put()
 * izriva najstarejše vnose, dokler skupna velikost ne pade pod proračun.
 * Razred je čist (0 odvisnosti) — testi si namestijo svojo instanco.
 */
export class ByteLruCache {
  private readonly map = new Map<string, Buffer>();

  constructor(readonly maxBytes: number) {}

  get(key: string): Buffer | null {
    const hit = this.map.get(key);
    if (hit === undefined) return null;
    // osveži LRU pozicijo (izbriši + vstavi na konec)
    this.map.delete(key);
    this.map.set(key, hit);
    return hit;
  }

  put(key: string, buf: Buffer): void {
    if (buf.length > this.maxBytes) return; // neizvedljiv vnos — ne shranimo
    this.map.delete(key);
    this.map.set(key, buf);
    // skupna velikost VSIH vnosov (novi je že v mapi — šteje se ENKRAT)
    let total = 0;
    for (const v of this.map.values()) total += v.length;
    // Izrivaj NAJSTAREJŠE vnose (vrstni red vstavljanja = LRU starost),
    // dokler skupna velikost ne pade pod proračun. Nov vnos NIKOLI ne
    // izriva samega sebe (preskočen v zanki).
    while (total > this.maxBytes) {
      let evicted = false;
      for (const [k, v] of this.map) {
        if (k === key) continue;
        this.map.delete(k);
        total -= v.length;
        evicted = true;
        break; // prvi v vrstnem redu = najstarejši
      }
      if (!evicted) break; // ostal je samo nov vnos (ali prazna mapa)
    }
  }

  stats(): ByteLruStats {
    let bytes = 0;
    for (const v of this.map.values()) bytes += v.length;
    return { entries: this.map.size, bytes, maxBytes: this.maxBytes };
  }
}

/** Skupni proračun predpomnilnika OBEH TTS poti (32 MB; en dan ≈ 1–3 MB,
 *  cel načrt ≈ do ~4,5 MB zvoka). */
export const TTS_CACHE_MAX_BYTES = 32 * 1024 * 1024;

/** Edina instanca predpomnilnika na proces (delita jo /api/tts in
 *  /api/itinerary/tts — skupen proračun, skupna izraba). */
export const ttsCache = new ByteLruCache(TTS_CACHE_MAX_BYTES);

/** Observabilnost (dnevniki/zdravje) — brez sprememba stanja. */
export function ttsCacheStats(): ByteLruStats {
  return ttsCache.stats();
}

// ── SDK klient (singleton na proces; odpoved se NE zapomni) ───────────────

type ZAIModule = typeof import("z-ai-web-dev-sdk");
type ZAIClass = ZAIModule["default"];
type TtsClient = Awaited<ReturnType<ZAIClass["create"]>>;

let ttsClientPromise: Promise<TtsClient> | null = null;

async function getTtsClient(): Promise<TtsClient> {
  if (!ttsClientPromise) {
    ttsClientPromise = (async () => {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      return ZAI.create();
    })();
    // Odpadle inicializacije ne smemo zapomniti (naslednji poskus znova)
    ttsClientPromise.catch(() => {
      ttsClientPromise = null;
    });
  }
  return ttsClientPromise;
}

/** En klic vira → WAV buffer (prazen odgovor = napaka, ne tiho navidezno
 *  uspešen zvok). */
async function ttsChunk(text: string, voice: string): Promise<Buffer> {
  const zai = await getTtsClient();
  const res = await zai.audio.tts.create({
    input: text,
    voice,
    speed: 1.0,
    response_format: "wav",
    stream: false,
  });
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(new Uint8Array(arrayBuffer));
  if (buf.length === 0) {
    throw new TtsEngineError("unavailable", "prazen TTS odgovor");
  }
  return buf;
}

// ── Timeout (PRAVI — Promise.race s počiščenim timerjem) ──────────────────

/**
 * Časovna ograja obljubi: če se `p` ne razreši v `ms`, vrže tipizirano
 * TtsEngineError("timeout"). Timer se počišči v obeh primerih (ne pušča
 * obešene reference do konca življenjske dobe procesa).
 */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(
      () => reject(new TtsEngineError("timeout", `timeout ${ms} ms`)),
      ms
    );
  });
  return Promise.race([p, timeout]).finally(() => {
    if (timer !== undefined) clearTimeout(timer);
  }) as Promise<T>;
}

// ── Sinteza (visokonivojsko — kaj poti dejansko potrebujejo) ──────────────

export interface SynthesizedAudio {
  /** Končni WAV (kanonična glava; en kos → glava vira nespremenjena). */
  wav: Buffer;
  /** Število klicev vira, ki so sestavili ta zvok (iskrenost v glavi
   *  odgovora poti — X-Audio-Chunks). */
  calls: number;
  /** Glas, uporabljen za ta jezik (X-Audio-Voice). */
  voice: string;
}

/**
 * Izgovori vse kose pripovedi v EN WAV.
 *
 * - kosi gredo ZAPOREDNO (ne vzporedno) — prijazno do limitov vira;
 * - vsak klic ima svoj časovni proračun (TTS_CALL_TIMEOUT_MS);
 * - spajanje z istim RIFF parserjem kot TASK 89 (concatWavBuffers):
 *   neveljavna/mešana oblika → TtsEngineError("invalid_wav") — raje
 *   iskrena napaka kot pokvarjen zvok;
 * - SDK odpoved → TtsEngineError("unavailable").
 */
export async function synthesizeChunks(
  chunks: ReadonlyArray<string>,
  lang: TtsLang
): Promise<SynthesizedAudio> {
  if (chunks.length === 0) {
    throw new TtsEngineError("unavailable", "ni kosov za izgovor");
  }
  const voice = VOICE_FOR_LANG[lang];
  const buffers: Buffer[] = [];
  try {
    for (const chunk of chunks) {
      buffers.push(
        await withTimeout(ttsChunk(chunk, voice), TTS_CALL_TIMEOUT_MS)
      );
    }
  } catch (err) {
    if (err instanceof TtsEngineError) throw err;
    throw new TtsEngineError(
      "unavailable",
      err instanceof Error ? err.message : "neznana napaka vira"
    );
  }

  const wav = concatWavBuffers(buffers);
  if (wav === null) {
    throw new TtsEngineError(
      "invalid_wav",
      "TTS je vrnil neveljaven ali mešan zvok"
    );
  }
  // ISSUE #4 §11 (val 1): metering PRAVE sinteze (z-ai-sdk vir; zadetki
  // LRU predpomnilnika se zapišejo na straneh rut — X-TTS-Cache: hit).
  // Strošek 0,00 (razvojni sandbox) — žetoni/znaki so v metadata.
  logAIUsage({
    feature: "tts",
    source: "z-ai-sdk",
    success: true,
    responseTimeMs: 0,
    metadata: { calls: buffers.length, bytes: wav.length, voice },
  });
  return { wav, calls: buffers.length, voice };
}
