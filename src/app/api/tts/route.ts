import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  NARRATION_LIMITS,
  buildDayNarrationScript,
  chunkNarration,
  narrationCacheKey,
  type NarrationDayInput,
} from "@/lib/itinerary-audio";
import {
  TtsEngineError,
  synthesizeChunks,
  ttsCache,
} from "@/lib/tts-engine";
import { logCacheUsage } from "@/lib/ai-usage";

// ============================================================================
// TASK 89 — /api/tts: ZVOČNI POVZETEK DNEVA (1.80.0)
// TASK 92 — konsolidacija na skupno jedro src/lib/tts-engine.ts (1.82.0):
//   glas/klient/timeout/predpomnilnik zdaj živijo v ENEM jedru, ki ga
//   deli z /api/itinerary/tts (skupni proračun 32 MB LRU).
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
//     zlorabo); zod vrata kapajo obseg (meja postankov iz NARRATION_LIMITS
//     — 16 od TASK 91: dan 1 MY TRIP združi prihod + vse izbrane postavke,
//     globino varuje maxChunks, dolžine polj).
//   - VIR: z-ai-web-dev-sdk (platformski SDK, BREZ uporabniških
//     poverilnic — nadaljevanje direktive »najprej vse brez ključa«).
//     Glasovi (jedro): sl → tongtong (slovenske besede fonetično),
//     en → jam (nativni angleški) — IZBRANO z ASR povratno zanko
//     2026-09-24.
//   - PREDPOMNILNIK: zvok dneva je determinističen (isti vhod → isti
//     zvok) → skupni LRU po bajtih (32 MB, tts-engine); ponovni
//     poslušalci/deljeni načrt ne plačajo novih TTS klicev.
//   - RATE LIMIT (TASK 92): 6 sintez/min na IP — SAMO na poti ZAMUD
//     (predpomnjene odgovore strežnik razda brez stroška vira; zloraba
//     dražje poti je tako omejena, legitimno ponovno poslušanje pa
//     prosto).
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

  // Predpomnilnik (skupno jedro): isti dan → isti zvok, 0 TTS klicev.
  const cacheKey = narrationCacheKey(dayInput, lang);
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    // ISSUE #4 §11: zadetek predpomnilnika je del resnice o stroških.
    logCacheUsage("tts", 0, { metadata: { bytes: cached.length } });
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

  // ZGREŠITEV predpomnilnika (dragocena sinteza) → dosleden rate limit
  // (ista disciplina kot /api/itinerary/tts; odgovori iz predpomnilnika
  // zgoraj so prosti — 0 stroška vira).
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 60000,
    key: "api-tts",
  });
  if (limited) return limited;

  const chunks = chunkNarration(script);
  if (chunks.length === 0) {
    return NextResponse.json({ error: "no_stops" }, { status: 400 });
  }
  if (chunks.length > NARRATION_LIMITS.maxChunks) {
    // Vrhunec zod kapov — praktično nedosegljivo, a iskrena varovalka.
    return NextResponse.json({ error: "script_too_long" }, { status: 413 });
  }

  try {
    // Jedro: zaporedni klici (≤ 4 × ~2 s ≈ najslabše ~8 s na dan),
    // glas po jeziku, pravi timeout na klic, RIFF spajanje.
    const { wav, calls, voice } = await synthesizeChunks(chunks, lang);

    ttsCache.put(cacheKey, wav);

    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        "X-TTS-Cache": "miss",
        // Iskrenost: koliko klicev vira + kateri glas (preverljivost).
        "X-Audio-Chunks": String(calls),
        "X-Audio-Voice": voice,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    if (err instanceof TtsEngineError) {
      console.error("[api/tts] TTS jedro:", err.kind, err.message);
    } else {
      console.error("[api/tts] TTS generiranje ni uspelo:", err);
    }
    return NextResponse.json({ error: "tts_unavailable" }, { status: 503 });
  }
}

// GET ni podprt (namenska POST pot; zvok se gradi iz podatkov dneva)
export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
