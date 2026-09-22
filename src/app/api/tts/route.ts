import { NextResponse } from "next/server";
import { z } from "zod";
import {
  NARRATION_LIMITS,
  buildDayNarrationScript,
  chunkNarration,
  concatWavBuffers,
  narrationCacheKey,
  type NarrationDayInput,
} from "@/lib/itinerary-audio";

// ============================================================================
// TASK 89 — /api/tts: ZVOČNI POVZETEK DNEVA (1.80.0)
// ============================================================================
//
// POST { lang, day: { dayNumber, dateLabel?, stops: [{time, name,
//               description?}] } } → audio/wav (celoten dan, spojen iz
//               kosov ≤ 1024 znakov — omejitev TTS API-ja).
//
// ZASNOVA:
//   - VHOD SO STRUKTURIRANI PODATKI DNEVA, NE PROSTO BESEDILO — strežnik
//     skript pripovedi zgradi SAM (ista čista lib funkcija kot klient),
//     zato API NI splošni "text-to-speech kot storitev" (varuje pred
//     zlorabo); zod vrata kapajo obseg (8 postankov, dolžine polj).
//   - VIR: z-ai-web-dev-sdk (platformski SDK, BREZ uporabniških
//     poverilnic — nadaljevanje direktive »najprej vse brez ključa«).
//     Glasovi: sl → tongtong (slovenske besede fonetično), en → jam
//     (nativni angleški) — IZBRANO z ASR povratno zanko 2026-09-24.
//   - PREDPOMNILNIK: zvok dneva je determinističen (isti vhod → isti
//     zvok) → LRU po bajtih (32 MB); ponovni poslušalci/deljeni načrt
//     ne plačajo novih TTS klicev.
//   - ISKRENOST: vsaka odpoved (SDK/timeout/spajanje) → 503 z jasno
//     JSON napako; klient pokaže iskreno opombo. Prazen dan → 400
//     (gumb se v klientu sploh ne izriše — fail-closed na obeh koncih).
// ============================================================================

// ── Zod vrata (zrcalijo NARRATION_LIMITS — en vir v testih) ────────────────

const stopSchema = z.object({
  time: z.string().max(NARRATION_LIMITS.maxTimeChars).default(""),
  name: z.string().min(1).max(NARRATION_LIMITS.maxNameChars),
  description: z.string().max(NARRATION_LIMITS.maxDescriptionChars).optional(),
});

const bodySchema = z.object({
  lang: z.enum(["sl", "en"]),
  day: z.object({
    dayNumber: z.number().int().min(1).max(30),
    dateLabel: z.string().max(NARRATION_LIMITS.maxDateLabelChars).nullish(),
    stops: z.array(stopSchema).min(1).max(NARRATION_LIMITS.maxStops),
  }),
});

// ── Predpomnilnik (LRU po skupnih bajtih — varovalka pomnilnika) ──────────

const CACHE_MAX_BYTES = 32 * 1024 * 1024; // 32 MB (dan ≈ 1–3 MB zvoka)
const cache = new Map<string, Buffer>(); // vstavljalni vrstni red = LRU

function cacheGet(key: string): Buffer | null {
  const hit = cache.get(key);
  if (hit === undefined) return null;
  // osveži LRU pozicijo
  cache.delete(key);
  cache.set(key, hit);
  return hit;
}

function cachePut(key: string, buf: Buffer): void {
  cache.delete(key);
  cache.set(key, buf);
  let total = buf.length;
  const evict: string[] = [];
  for (const [k, v] of cache) {
    if (k === key) continue;
    total += v.length;
    if (total > CACHE_MAX_BYTES) evict.push(k);
  }
  for (const k of evict) cache.delete(k);
}

// ── TTS vir (z-ai-web-dev-sdk — SAMO strežniško, ena instanca) ────────────

/** Glas po jeziku (izbrano empirično — glej zgornjo opombo). */
const VOICE_FOR_LANG: Record<"sl" | "en", string> = {
  sl: "tongtong",
  en: "jam",
};

/** Časovni proračun ENEGA TTS klica (izmerjeno ~2 s; 30 s varovalka). */
const TTS_CALL_TIMEOUT_MS = 30_000;

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
    // Odpovedle inicializacije ne smemo zapomniti (naslednji poskus znova)
    ttsClientPromise.catch(() => {
      ttsClientPromise = null;
    });
  }
  return ttsClientPromise;
}

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
  if (buf.length === 0) throw new Error("prazen TTS odgovor");
  return buf;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_resolve, reject) =>
      setTimeout(() => reject(new Error(`timeout ${ms} ms`)), ms)
    ),
  ]);
}

// ── Glavna pot ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let parsedJson: unknown;
  try {
    parsedJson = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(parsedJson);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_day" }, { status: 400 });
  }

  const { lang, day } = parsed.data;
  const dayInput: NarrationDayInput = {
    dayNumber: day.dayNumber,
    dateLabel: day.dateLabel ?? null,
    stops: day.stops.map((s) => ({
      time: s.time,
      name: s.name,
      description: s.description,
    })),
  };

  // Skript gradi STREŽNIK iz strukturiranih podatkov (NE zaupaj klientu
  // prostega besedila) — ista čista funkcija kot v klientu.
  const script = buildDayNarrationScript(dayInput, lang);
  if (script === null) {
    return NextResponse.json({ error: "no_stops" }, { status: 400 });
  }

  // Predpomnilnik: isti dan → isti zvok, 0 TTS klicev.
  const cacheKey = narrationCacheKey(dayInput, lang);
  const cached = cacheGet(cacheKey);
  if (cached) {
    return new NextResponse(new Uint8Array(cached), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(cached.length),
        "X-TTS-Cache": "hit",
        "Cache-Control": "no-store",
      },
    });
  }

  const chunks = chunkNarration(script);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "no_stops" }, { status: 400 });
  }
  if (chunks.length > NARRATION_LIMITS.maxChunks) {
    // Vrhunec zod kapov — praktično nedosegljivo, a iskrena varovalka.
    return NextResponse.json({ error: "script_too_long" }, { status: 413 });
  }

  const voice = VOICE_FOR_LANG[lang];
  try {
    // Zaporedno (ne vzporedno): prijazno do limitov klicev vira; ≤ 4 kosi
    // po ~2 s ≈ najslabše ~8 s na dan.
    const buffers: Buffer[] = [];
    for (const chunk of chunks) {
      buffers.push(await withTimeout(ttsChunk(chunk, voice), TTS_CALL_TIMEOUT_MS));
    }

    const wav = concatWavBuffers(buffers);
    if (wav === null) {
      return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
    }

    cachePut(cacheKey, wav);

    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "X-TTS-Cache": "miss",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/tts] TTS generiranje ni uspelo:", err);
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
}

// GET ni podprt (namenska POST pot; zvok se gradi iz podatkov dneva)
export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
