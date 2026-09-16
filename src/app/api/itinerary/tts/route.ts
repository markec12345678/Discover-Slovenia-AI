import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { AUDIO_SCRIPT_MAX_CHARS } from "@/lib/planner-audio";

// ============================================================================
// POST /api/itinerary/tts — D2 "Poslušaj svoj načrt" (nabor #2)
// ============================================================================
//
// Zvočni povzetek itinerarja (Mindtrip ga ima; nihče na trgu nima
// slovenskega). Besedilo ZDAJ sestavi client ČISTO deterministično iz
// podatkov načrta (src/lib/planner-audio.ts — 0 AI žetonov); ta ruta
// besedilo samo IZGOVORI prek TTS (z-ai-web-dev-sdk, strežniško).
//
// Omejitve (iskrene, v glavi odgovora):
//  - TTS API: največ 1024 znaka NA KLIC → besedilo razbijemo na povedi
//    (≤ 1000 znakov na kos) in kose ZDRUŽIMO v en WAV (PCM concat po
//    RIFF hoje — ista oblika: 24 kHz, 16-bit, mono)
//  - MP3 trenutno NI podprt (API napaka 1214) → WAV (~4,2 KB/znak) →
//    skript je zato OMEJEN na ~1000 znakov (~1,5 min zvoka) — povzetek
//    po dnevih, ne branje celotnih kartic
//  - hitrost govora 1.0, glas "tongtong" (preizkušen na SL+EN besedilu)
//
// Varnost / poštenost:
//  - rate limit 6 klicev/min na IP (odprta javna pot, TTS je dražji od
//    HTML prenosov)
//  - besedilo NE shranjujemo nikamor; zvok se generira v pomnilniku in
//    takoj vrne (Cache-Control: no-store)
//  - glava X-Audio-Chunks razkrije število TTS klicev (enakovredno
//    "via" pri F8 sliki — preverljivost)
// ============================================================================

const MAX_TEXT_CHARS = AUDIO_SCRIPT_MAX_CHARS + 100; // ~1100: trdna meja
const CHUNK_TARGET = 1000; // varnostna margina pod API mejo 1024
const TTS_TIMEOUT_MS = 30000;

/** Razbij besedilo na kose po povedeh (≤ target znakov). Trdno pravilo:
 *  posamezna poved, daljša od target, se razreže na meji (ne zgubi se). */
function splitIntoChunks(text: string, target = CHUNK_TARGET): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["']?\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if (current.length + sentence.length <= target) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      if (sentence.length <= target) {
        current = sentence;
      } else {
        // Zelo dolga poved (brez ločil) — razrežemo na besedah
        let rest = sentence.trim();
        while (rest.length > target) {
          let cut = rest.lastIndexOf(" ", target);
          if (cut <= 0) cut = target;
          chunks.push(rest.slice(0, cut).trim());
          rest = rest.slice(cut).trim();
        }
        current = rest;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

/** Izvleci PCM payload iz WAV bufferja — hoje po RIFF chunkih (robustno:
 *  nekateri encoderji pred "data" vstavijo LIST/extra chunke). */
function wavDataPayload(buf: Buffer): Buffer | null {
  if (buf.length < 44) return null;
  if (buf.toString("ascii", 0, 4) !== "RIFF") return null;
  if (buf.toString("ascii", 8, 12) !== "WAVE") return null;
  let offset = 12;
  while (offset + 8 <= buf.length) {
    const chunkId = buf.toString("ascii", offset, offset + 4);
    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      const end = Math.min(offset + 8 + chunkSize, buf.length);
      return buf.subarray(offset + 8, end);
    }
    offset += 8 + chunkSize + (chunkSize % 2); // chunki so 2-bajtno poravnani
  }
  return null;
}

/** Parametri oblike iz fmt chunka (validacija: vsi kosi morajo biti isti). */
function wavFormat(buf: Buffer): {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
} | null {
  if (buf.toString("ascii", 12, 16) !== "fmt ") return null;
  const chunkSize = buf.readUInt32LE(16);
  if (chunkSize < 16) return null;
  const audioFormat = buf.readUInt16LE(20);
  if (audioFormat !== 1) return null; // samo čisti PCM
  return {
    channels: buf.readUInt16LE(22),
    sampleRate: buf.readUInt32LE(24),
    bitsPerSample: buf.readUInt16LE(34),
  };
}

/** Združi PCM payloade v en WAV s kanonično 44-bajtno glavo. */
function concatWav(
  payloads: Buffer[],
  format: { sampleRate: number; channels: number; bitsPerSample: number }
): Buffer {
  const data = Buffer.concat(payloads);
  const { sampleRate, channels, bitsPerSample } = format;
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // velikost fmt chunka (PCM)
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE((sampleRate * channels * bitsPerSample) / 8, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export async function POST(request: Request) {
  // Odprta javna pot → dosleden rate limit (TTS strošek)
  const limited = rateLimit(request, {
    limit: 6,
    windowMs: 60000,
    key: "itinerary-tts",
  });
  if (limited) return limited;

  let body: { text?: unknown; locale?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const locale = body.locale === "en" ? "en" : "sl";

  if (text.length < 10) {
    return NextResponse.json(
      { error: "Manjka ali prekratko besedilo za izgovor." },
      { status: 400 }
    );
  }
  if (text.length > MAX_TEXT_CHARS) {
    return NextResponse.json(
      {
        error: `Besedilo je predolgo (največ ${MAX_TEXT_CHARS} znakov — zvočni povzetek je po namenu kratek).`,
      },
      { status: 413 }
    );
  }

  // TTS (STREŽNIŠKO — z-ai-web-dev-sdk nikoli v client kodi)
  const chunks = splitIntoChunks(text);
  const buffers: Buffer[] = [];
  try {
    const ZAI = (await import("z-ai-web-dev-sdk")).default;
    const zai = await ZAI.create();

    for (const chunk of chunks) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
      try {
        const response = await zai.audio.tts.create({
          input: chunk,
          voice: "tongtong",
          speed: 1.0,
          response_format: "wav",
          stream: false,
        });
        const arrayBuffer = await response.arrayBuffer();
        buffers.push(Buffer.from(new Uint8Array(arrayBuffer)));
      } finally {
        clearTimeout(timer);
      }
    }
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === "AbortError" || err.message.includes("abort"));
    console.error("[itinerary/tts] TTS napaka:", err);
    return NextResponse.json(
      {
        error: isTimeout
          ? "Govor se ni uspel ustvariti v roku (poskusi znova)."
          : "Zvoka trenutno ni mogoče ustvariti (TTS storitev ni dosegljiva).",
      },
      { status: 502 }
    );
  }

  // Validacija + konkatenacija (isti format pri vseh kosih)
  const payloads: Buffer[] = [];
  let format: { sampleRate: number; channels: number; bitsPerSample: number } | null =
    null;
  for (const buf of buffers) {
    const payload = wavDataPayload(buf);
    const fmt = wavFormat(buf);
    if (!payload || !fmt || payload.length === 0) {
      console.error("[itinerary/tts] neveljaven WAV odgovor (RIFF/fmt/data)");
      return NextResponse.json(
        { error: "TTS je vrnil neveljaven zvok — poskusi znova." },
        { status: 502 }
      );
    }
    if (format === null) {
      format = fmt;
    } else if (
      format.sampleRate !== fmt.sampleRate ||
      format.channels !== fmt.channels ||
      format.bitsPerSample !== fmt.bitsPerSample
    ) {
      console.error("[itinerary/tts] nedosledna WAV oblika med kosi");
      return NextResponse.json(
        { error: "TTS je vrnil nedosleden zvok — poskusi znova." },
        { status: 502 }
      );
    }
    payloads.push(payload);
  }
  if (payloads.length === 0 || format === null) {
    return NextResponse.json(
      { error: "TTS ni vrnil zvoka — poskusi znova." },
      { status: 502 }
    );
  }

  const wav = concatWav(payloads, format);
  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "Content-Type": "audio/wav",
      "Content-Length": String(wav.length),
      // Iskrenost: koliko TTS klicev je sestavilo ta zvok + jezik govora
      "X-Audio-Chunks": String(chunks.length),
      "X-Audio-Locale": locale,
      "Cache-Control": "no-store",
    },
  });
}
