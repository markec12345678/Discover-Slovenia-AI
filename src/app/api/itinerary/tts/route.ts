import { NextResponse } from "next/server";
import { z } from "zod";
import { rateLimit } from "@/lib/rate-limit";
import {
  AUDIO_SCRIPT_MAX_CHARS,
  buildItineraryAudioScript,
  planAudioCacheKey,
} from "@/lib/planner-audio";
import { NARRATION_LIMITS, chunkNarration } from "@/lib/itinerary-audio";
import {
  TtsEngineError,
  synthesizeChunks,
  ttsCache,
} from "@/lib/tts-engine";
import { logCacheUsage } from "@/lib/ai-usage";

// ============================================================================
// POST /api/itinerary/tts — D2 "Poslušaj svoj načrt" (nabor #2)
// TASK 92 (1.82.0): KONSOLIDACIJA na skupno jedro src/lib/tts-engine.ts.
// ============================================================================
//
// Zvočni povzetek CELEGA načrta (planner): uvod (dnevi/skupina/proračun) →
// ena poved na dan (imena postankov + približni km) → zaključek.
//
// SPREMEMBA VZORCA (ista filozofija kot /api/tts TASK 89):
//   - VHOD SO STRUKTURIRANI PODATKI NAČRTA (itinerary + dayKm + groupSize +
//     locale), NE več prosto besedilo — skript ZDAJ zgradi STREŽNIK s to
//     isto čisto funkcijo (buildItineraryAudioScript), ki jo klient uporablja
//     za prikaz razpoložljivosti. Prejšnja oblika { text, locale } je bila
//     DE FAKTO odprta "TTS kot storitev" (vsakdo je lahko izgovoril
//     poljubno besedilo do ~1100 znakov) — ta površina je zdaj ZAPRTA.
//   - GLAS PO JEZIKU (popravek): prej je pot vedno govorila "tongtong",
//     tudi ANGLEŠKEMU besedilu (EN uporabniki so poslušali kitajski naglas);
//     zdaj sl → tongtong, en → jam (empirična izbira TASK 89, ASR zanka).
//   - PREDPOMNILNIK: isti načrt → isti zvok — skupni LRU po bajtih (32 MB,
//     tts-engine, deli ga z /api/tts); ponovno poslušanje/zamenjava jezikov
//     nazaj je 0 novih TTS klicev.
//   - RATE LIMIT: 6 sintez/min na IP — SAMO na poti zgrešitve predpomnilnika
//     (prej: vsak klik, tudi replay, je porabil limit; zdaj replay prosto).
//   - SDK/timeout/spajanje: skupno jedro (singleton klient na proces,
//     PRAVI timeout na klic — prejšnji AbortController nikoli ni prejel
//     signala od SDK-ja, bil je navidezen; RIFF spajanje po kosih, ker vir
//     piše NE-standardno glavo fmt+AIGC+LIST+data).
//
// Omejitve (iskrene, v glavah odgovora):
//  - TTS API: največ 1024 znaka NA KLIC → razrez po povedeh (chunkNarration,
//    ≤ 960 znakov na kos) in spajanje nazaj v EN WAV;
//  - skript OMEJEN na ~1000 znakov (~1,5 min zvoka) — povzetek po dnevih,
//    ne branje celotnih kartic (deterministična degradacija v čisti funkciji:
//    najprej odpadejo km, nato imena — jedro povzetka so imena);
//  - hitrost govora 1.0.
//
// Varnost / poštenost:
//  - zvok se NE shranjuje nikamor trajno (generira v pomnilniku, takoj
//    vrne; Cache-Control: no-store; LRU je samo pomnilniška varovalka);
//  - glave X-Audio-Chunks/X-Audio-Voice/X-TTS-Cache razkrijejo sestavo
//    zvoka (preverljivost, vzorec "via" pri F8 sliki).
// ============================================================================

// ── Zod vrata (strukturirani vhod — kapajo obseg) ──────────────────────────

const locationSchema = z.object({
  // ime postanka: jedro povzetka (ista meja kot dnevna pripoved). PRAZNO
  // ime ne zavrne celotne zahteve — čista funkcija ga izpusti iz povzetka
  // (fail-closed na vsebini, ne na vhodu robov).
  destination_name: z.string().max(NARRATION_LIMITS.maxNameChars),
});

const daySchema = z.object({
  day: z.number().int().min(1).max(30),
  locations: z.array(locationSchema).max(24), // build deduplicira
});

const bodySchema = z.object({
  locale: z.enum(["sl", "en"]),
  groupSize: z.number().int().min(1).max(20),
  // km po dnevih iz geo-validacije (ključi so JSON nizi števil dni)
  dayKm: z.record(z.string(), z.number().min(0).max(2000)),
  itinerary: z.object({
    total_budget: z.number().min(0).max(1_000_000),
    days: z.array(daySchema).min(1).max(30),
  }),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    // Stara klientna oblika { text, locale } tu prav tako odpade —
    // struktura je javna pogodba novega klienta (isti commit).
    return NextResponse.json(
      { error: "Manjkajoči ali neveljavni podatki načrta." },
      { status: 400 }
    );
  }

  const { locale, groupSize, dayKm, itinerary } = parsed.data;
  const lang = locale === "en" ? "en" : "sl";

  // Skript gradi STREŽNIK iz strukturiranih podatkov (ista čista funkcija
  // kot v klientu — deterministično, 0 AI žetonov).
  const script = buildItineraryAudioScript({
    itinerary,
    dayKm,
    groupSize,
    locale: lang,
  });
  if (script === null) {
    return NextResponse.json(
      { error: "Načrt brez dni — nič za izgovor." },
      { status: 400 }
    );
  }
  if (script.chars > AUDIO_SCRIPT_MAX_CHARS + 100) {
    // Čista funkcija degradira do meje; varovalka za nepričakovano.
    return NextResponse.json(
      {
        error: `Besedilo je predolgo (največ ${AUDIO_SCRIPT_MAX_CHARS + 100} znakov — zvočni povzetek je po namenu kratek).`,
      },
      { status: 413 }
    );
  }

  // Predpomnilnik (skupno jedro): isti načrt → isti zvok, 0 TTS klicev.
  const cacheKey = planAudioCacheKey({ itinerary, dayKm, groupSize, locale: lang });
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
        "X-Audio-Locale": lang,
        "Cache-Control": "no-store",
      },
    });
  }

  // ZGREŠITEV predpomnilnika (dragocena sinteza) → rate limit (6/min na
  // IP; odgovori iz predpomnilnika zgoraj so prosti — replay ne porabi).
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 60000,
    key: "itinerary-tts",
  });
  if (limited) return limited;

  // Razrez po povedeh (ista funkcija kot dnevna pripoved — ≤ 960/kos).
  const chunks = chunkNarration(script.text);
  if (chunks.length === 0) {
    return NextResponse.json(
      { error: "Prazen povzetek — nič za izgovor." },
      { status: 400 }
    );
  }
  if (chunks.length > NARRATION_LIMITS.maxChunks) {
    // Skript ≤ ~1100 znakov → ≤ 2 kosa; iskrena varovalka kljub temu.
    return NextResponse.json(
      { error: "Povzetek presega dovoljeno dolžino." },
      { status: 413 }
    );
  }

  try {
    // Jedro: glas po jeziku (sl tongtong / en jam), zaporedni klici,
    // pravi timeout, spajanje WAV po RIFF kosih.
    const { wav, calls, voice } = await synthesizeChunks(chunks, lang);

    ttsCache.put(cacheKey, wav);

    return new NextResponse(new Uint8Array(wav), {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(wav.length),
        // Iskrenost: koliko TTS klicev je sestavilo ta zvok + jezik govora
        "X-Audio-Chunks": String(calls),
        "X-Audio-Locale": lang,
        "X-Audio-Voice": voice,
        "X-TTS-Cache": "miss",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    // Preslikava jedrovih vzrokov v iskrena SL sporočila (stara disciplina
    // te poti: uporabnik ve, ali je timeout ali nedosegljivost).
    if (err instanceof TtsEngineError) {
      console.error("[itinerary/tts] TTS jedro:", err.kind, err.message);
      if (err.kind === "timeout") {
        return NextResponse.json(
          { error: "Govor se ni uspel ustvariti v roku (poskusi znova)." },
          { status: 502 }
        );
      }
      if (err.kind === "invalid_wav") {
        return NextResponse.json(
          { error: "TTS je vrnil neveljaven zvok — poskusi znova." },
          { status: 502 }
        );
      }
      return NextResponse.json(
        {
          error:
            "Zvoka trenutno ni mogoče ustvariti (TTS storitev ni dosegljiva).",
        },
        { status: 502 }
      );
    }
    console.error("[itinerary/tts] TTS napaka:", err);
    return NextResponse.json(
      {
        error:
          "Zvoka trenutno ni mogoče ustvariti (TTS storitev ni dosegljiva).",
      },
      { status: 502 }
    );
  }
}

// GET ni podprt (namenska POST pot; zvok se gradi iz podatkov načrta)
export function GET() {
  return NextResponse.json({ error: "method_not_allowed" }, { status: 405 });
}
