// ============================================================================
// TASK 89 — ZVOČNI POVZETEK DNEVA (1.80.0): čista lib plast
// ============================================================================
//
// »Poslušaj dan« — TTS pripoved dnevnega načrta. Konkurenčna analiza
// (docs/AI/MINDTRIP-ANALIZA-2026-09-AGENT.md, inventar funkcij) je to
// izrecno označila kot vrzeli: Mindtrip ima audio predvajanje itinerarja,
// mi ne — in priložnost (»TTS priložnost!«). Ta plast omogoča:
//
//   popotnik na poti (telefon v žepu, hoja proti prvemu postanku) in
//   uporabniki z okvarjenim vidom namesto BRANJA dneva poslušajo načrt.
//
// Vir zvoka: z-ai-web-dev-sdk (platformski SDK, BREZ uporabniških
// poverilnic — nadaljevanje direktive »najprej vse brez ključa«).
//
// SLOJI (vzorec itinerary-weather.ts TASK 88):
//   1. TA DATOTEKA — čiste funkcije (0 omrežja, 0 db, 0 React): gradnja
//      pripovedi IZKLJUČNO iz dejstev dneva, razrez na kose ≤ 1024 znakov
//      (omejitev TTS API-ja), spajanje WAV bufferjev (ne-standardni
//      AIGC/LIST kose v glavi vira moramo PARSIRATI po RIFF kosih, ne
//      44-bajtna predpostavka — izmerjeno 2026-09-24).
//   2. /api/tts — strežniška pot (zod vrata + SDK + predpomnilnik).
//   3. itinerary-audio.tsx — gumb v glavi dneva (TripTimeline + SharedTrip).
//
// ISKRENOST (kanon 71/74/77/88): pripoved je zgrajena SAMO iz podatkov,
// ki dejansko obstajajo (imena, termini, opisi, datum). Prazen dan →
// null → GUMB SE NE IZRIŠE (0 izmišljenih pripovedi). Podaljšano
// besedilo se NE tiho reže — razreže se na kose po stavkih in se spoji
// nazaj (celotna vsebina, le v več klicih).
// ============================================================================

import type { DayPlan } from "@/lib/types";

// ─── Vrati (ista disciplina kot vse lib plasti) ───────────────────────────

/** Termin/ime/opis posameznega postanka za pripoved. */
export interface NarrationStopInput {
  /** time_slot iz načrta (npr. "09:00" | "zjutraj" | "09:00-11:00"). */
  time: string;
  /** Ime destinacije/kraja. */
  name: string;
  /** Opombe AI/fallbacka — izpuščene, če ne obstajajo. */
  description?: string;
}

/** Dan za pripoved (datum je opcijsen — starejši načrti brez okvira). */
export interface NarrationDayInput {
  dayNumber: number;
  /** Lokaliziran datum dneva (npr. „četrtek, 24. septembra") ali null. */
  dateLabel?: string | null;
  stops: ReadonlyArray<NarrationStopInput>;
}

export type NarrationLang = "sl" | "en";

// ─── Omejitve (zrcalijo zod vrata /api/tts — ENA resnica v testih) ────────

export const NARRATION_LIMITS = {
  /** API TTS sprejme največ 1024 znakov na klic. */
  maxChunkChars: 1024,
  /** Varnostna meja razreza (stavki so lahko dolgi). */
  chunkTargetChars: 960,
  /** Zgornja meja postankov na dan (zod vrata). */
  maxStops: 8,
  /** Zgornja meja dolžine imena (zod vrata). */
  maxNameChars: 160,
  /** Zgornja meja dolžine opisa (zod vrata). */
  maxDescriptionChars: 300,
  /** Zgornja meja termina (zod vrata). */
  maxTimeChars: 24,
  /** Zgornja meja datumske oznake (zod vrata). */
  maxDateLabelChars: 80,
  /** Koliko TTS klicev je še razumno na EN dan (varovalka zlorabe). */
  maxChunks: 4,
} as const;

// ─── Prevodi (vzorec TRIP_WEATHER_LABELS — lang ključ, en vir resnice) ────

export const NARRATION_LABELS: Record<
  NarrationLang,
  {
    button: string;
    buttonAria: (dayNumber: number) => string;
    stopButton: string;
    stopButtonAria: (dayNumber: number) => string;
    loading: string;
    error: string;
  }
> = {
  sl: {
    button: "Poslušaj",
    buttonAria: (n) => `Poslušaj zvočni povzetek dneva ${n}`,
    stopButton: "Ustavi",
    stopButtonAria: (n) => `Ustavi zvočni povzetek dneva ${n}`,
    loading: "Nalagam zvok …",
    error: "Zvočni povzetek trenutno ni na voljo.",
  },
  en: {
    button: "Listen",
    buttonAria: (n) => `Listen to the audio summary of day ${n}`,
    stopButton: "Stop",
    stopButtonAria: (n) => `Stop the audio summary of day ${n}`,
    loading: "Loading audio …",
    error: "Audio summary is currently unavailable.",
  },
};

// ─── Zvoku prijazne številke (IZMERJENO 2026-09-24, ASR povratna zanka) ────
//
// Tongtong glasi ŠTEVKE v številskem zapisu kot ANGLEŠKE besede (»nine«,
// »fourteen«) tudi sredi slovenskega stavka — merjeno z ASR povratno zanko.
// Slovenske BESEDE pa izgovori fonetično razumljivo (»ob devetih« →
// »Ab Dveiti«). Zato SL pripoved zapiše ure/dneve z besedami; EN glasu
// (jam) pusti števke — izgovarja jih nativno (»Friday the twenty fifth of
// September« iz »Friday, 25 September« — ista povratna zanka).

/** Ure 0–23 v ločevalniku (»ob devetih«, »od devetih do enajstih«). */
const SL_HOUR_LOCATIVE = [
  "", "enih", "dveh", "treh", "štirih", "petih", "šestih", "sedmih", "osmih",
  "devetih", "desetih", "enajstih", "dvanajstih", "trinajstih", "štirinajstih",
  "petnajstih", "šestnajstih", "sedemnajstih", "osmnajstih", "devetnajstih",
  "dvajsetih", "enaindvajsetih", "dvaindvajsetih", "triindvajsetih",
] as const;

/** Vrstilni števniki 1–31 (»Dan drugi.«) — zgornja meja dni načrta. */
const SL_ORDINAL_NOM = [
  "", "prvi", "drugi", "tretji", "četrti", "peti", "šesti", "sedmi", "osmi",
  "deveti", "deseti", "enajsti", "dvanajsti", "trinajsti", "štirinajsti",
  "petnajsti", "šestnajsti", "sedemnajsti", "osemnajsti", "devetnajsti",
  "dvajseti", "enaindvajseti", "dvaindvajseti", "triindvajseti",
  "štiriindvajseti", "petindvajseti", "šestindvajseti", "sedemindvajseti",
  "osemindvajseti", "devetindvajseti", "trideseti", "enaintrideseti",
] as const;

/** Vrstilni števniki v rodilniku 1–31 (»dvaindvajsetega septembra«). */
const SL_ORDINAL_GEN = [
  "", "prvega", "drugega", "tretjega", "četrtega", "petega", "šestega",
  "sedmega", "osmega", "devetega", "desetega", "enajstega", "dvanajstega",
  "trinajstega", "štirinajstega", "petnajstega", "šestnajstega",
  "sedemnajstega", "osemnajstega", "devetnajstega", "dvajsetega",
  "enaindvajsetega", "dvaindvajsetega", "triindvajsetega", "štiriindvajsetega",
  "petindvajsetega", "šestindvajsetega", "sedemindvajsetega",
  "osemindvajsetega", "devetindvajsetega", "tridesetega", "enaintridesetega",
] as const;

/** Minute v zvezi s uro (30 → »in pol«, 0 → nič, ostalo → »in N minut«). */
function slMinutePhrase(m: number): string {
  if (m === 0) return "";
  if (m === 30) return " in pol";
  return ` in ${m} minut`;
}

const TIME_RANGE_RE =
  /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/;
const TIME_SINGLE_RE = /^(\d{1,2}):(\d{2})$/;

/**
 * Termin v obliki, ki jo TTS izgovori razumljivo.
 *
 * SL: »09:00-13:00« → »od devetih do trinajstih«; »14:30« → »ob
 * štirinajstih in pol« (števke bi glasil kot angleške besede — glej
 * zgornjo izmero). EN: »09:00-13:00« → »from 9 to 13«; »14:30« →
 * »at 14:30« (jam izgovarja števke nativno).
 * Besedni termini (»zjutraj« / »morning«) in neznane oblike gredo
 * NESPREMENJENI skozi — že so govor.
 */
export function speechTime(time: string, lang: NarrationLang): string {
  const t = time.trim();
  if (t === "") return "";

  const range = TIME_RANGE_RE.exec(t);
  if (range) {
    const [, h1s, m1s, h2s, m2s] = range;
    const h1 = Number(h1s), m1 = Number(m1s), h2 = Number(h2s), m2 = Number(m2s);
    if (lang === "sl") {
      const a = SL_HOUR_LOCATIVE[h1] ?? null;
      const b = SL_HOUR_LOCATIVE[h2] ?? null;
      if (a && b) {
        return `od ${a} do ${b}${m2 === 0 ? "" : m2 === 30 ? " in pol" : ` in ${m2} minut`}`;
      }
      return t; // nenavadna ura (>23) — iskreno izvirnik
    }
    return `from ${h1}${m1 ? `:${String(m1).padStart(2, "0")}` : ""} to ${h2}${m2 ? `:${String(m2).padStart(2, "0")}` : ""}`;
  }

  const single = TIME_SINGLE_RE.exec(t);
  if (single) {
    const h = Number(single[1]), m = Number(single[2]);
    if (lang === "sl") {
      const a = SL_HOUR_LOCATIVE[h] ?? null;
      return a ? `ob ${a}${slMinutePhrase(m)}` : t;
    }
    return `at ${h}${m ? `:${String(m).padStart(2, "0")}` : " o'clock"}`;
  }

  return t;
}

/**
 * Datumna oznaka v izgovorljivi obliki (SL): »petek, 25. septembra« →
 * »petek, petindvajsetega septembra« (brez angleško izgovorjenih
 * števk sredi slovenskega stavka). EN pusti, kot je — jam glasi
 * »Friday, 25 September« nativno.
 */
export function speechDateLabel(
  dateLabel: string,
  lang: NarrationLang
): string {
  if (lang !== "sl") return dateLabel;
  return dateLabel.replace(/(^|\D)(\d{1,2})\.\s/g, (_all, pre: string, num: string) => {
    const n = Number(num);
    const word = n >= 1 && n <= 31 ? SL_ORDINAL_GEN[n] : null;
    return word ? `${pre}${word} ` : `${pre}${num}. `;
  });
}

// ─── Gradnja pripovedi ────────────────────────────────────────────────────

/**
 * Preslikava LocationVisit[] v vnose pripovedi (oba površina uporabljata
 * isto preslikavo — termin/ime/opis se ne spremenita v nič drugega).
 */
export function narrationStopsFromDay(
  locations: ReadonlyArray<DayPlan["locations"][number]>
): NarrationStopInput[] {
  return locations
    .filter((v) => typeof v.destination_name === "string" && v.destination_name.trim() !== "")
    .map((v) => ({
      time: typeof v.time_slot === "string" ? v.time_slot.trim() : "",
      name: v.destination_name.trim(),
      description:
        typeof v.notes === "string" && v.notes.trim() !== ""
          ? v.notes.trim()
          : undefined,
    }));
}

/**
 * Skript pripovedi dneva — IZKLJUČNO iz dejstev.
 *
 * Struktura: „Dan N. {datum}. Ob {termin}, {ime}. {opis}. Ob …"
 * - datum in opisi samo kadar obstajajo (brez izmišljenega);
 * - termin izpuščen, če je prazen (postanki brez termina ostanejo
 *   imenovani — ne tiho skriti);
 * - vrstni red postankov ohranjen (kronologija dneva).
 *
 * Fail-closed: 0 uporabnih postankov → null (klicalec gumba ne izriše).
 */
export function buildDayNarrationScript(
  day: NarrationDayInput,
  lang: NarrationLang
): string | null {
  const stops = day.stops.filter(
    (s) => typeof s.name === "string" && s.name.trim() !== ""
  );
  if (stops.length === 0) return null;

  const parts: string[] = [];

  // SL: »Dan drugi.« (vrstilni števnik — glava naj ne bo »Dan 2.« z
  // angleško izgovorjeno števko); EN: »Day 2.« (jam glasi števke nativno).
  const ordinal =
    lang === "sl" && day.dayNumber >= 1 && day.dayNumber <= 31
      ? SL_ORDINAL_NOM[day.dayNumber]
      : null;
  const intro =
    lang === "sl"
      ? `Dan ${ordinal ?? day.dayNumber}.`
      : `Day ${day.dayNumber}.`;
  const dateLabel =
    typeof day.dateLabel === "string" ? day.dateLabel.trim() : "";
  parts.push(
    dateLabel
      ? `${intro} ${speechDateLabel(dateLabel, lang)}.`
      : intro
  );

  for (const stop of stops) {
    const name = stop.name.trim().slice(0, NARRATION_LIMITS.maxNameChars);
    const time = speechTime(
      (stop.time ?? "").trim().slice(0, NARRATION_LIMITS.maxTimeChars),
      lang
    );
    parts.push(time !== "" ? `${time}, ${name}.` : `${name}.`);

    const description = (stop.description ?? "").trim();
    if (description !== "") {
      // Opis pripovedimo v celoti (brez tihih rezov); zod vrata zgoraj
      // varujejo pred zlorabo dolžine, chunker poskrbi za mejo API-ja.
      parts.push(
        description.replace(/\s+/g, " ").slice(0, NARRATION_LIMITS.maxDescriptionChars)
      );
    }
  }

  return parts
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Razrez na kose (omejitev TTS API: 1024 znakov na klic) ──────────────

/**
 * Razrez besedila na kose ≤ maxLength, po stavčnih mejah, ko gre.
 *
 * - najprej po [.!?…] + presledek (celi stavki skupaj, kjer se da);
 * - če je posamezen stavek sam daljši od meje → trda meja (besedna,
 *   če se da) — besedilo NIKOLI ne izgine;
 * - prazen vnos → [] (klicalec ne pokliče TTS).
 */
export function chunkNarration(
  text: string,
  maxLength: number = NARRATION_LIMITS.chunkTargetChars
): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean === "") return [];
  if (maxLength < 1) return [];

  const chunks: string[] = [];
  // Stavki: do končnega ločila VKLJUČNO (ločilo ostane s stavkom).
  const sentences = clean.match(/[^.!?…]+[.!?…]+["»']?\s*|[^.!?…]+$/g) ?? [clean];

  let current = "";
  const pushCurrent = () => {
    const t = current.trim();
    if (t !== "") chunks.push(t);
    current = "";
  };

  for (const sentence of sentences) {
    const s = sentence.trim();
    if (s === "") continue;

    if (s.length > maxLength) {
      // Prekomerno dolg stavek: najprej izpluni zbrano, nato razreži stavek.
      pushCurrent();
      let rest = s;
      while (rest.length > maxLength) {
        // Besedna meja znotraj okna (ali trda, če tudi beseda ni vdrljiva)
        let cut = rest.lastIndexOf(" ", maxLength);
        if (cut <= 0) cut = maxLength;
        chunks.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest !== "") current = rest;
      continue;
    }

    if (current.length + s.length + 1 <= maxLength) {
      current = current === "" ? s : `${current} ${s}`;
    } else {
      pushCurrent();
      current = s;
    }
  }
  pushCurrent();

  return chunks;
}

// ─── Spajanje WAV bufferjev ───────────────────────────────────────────────

interface WavInfo {
  /** PCM podatki (brez glave). */
  pcm: Buffer;
  audioFormat: number;
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
}

/**
 * RIFF hoja po kosih: TTS vir NE piše kanonične 44-bajtne glave —
 * izmerjeno (2026-09-24): fmt(16) + AIGC(250) + LIST(26) + data. Zato
 * iščemo `fmt ` in `data` po pravih kosih z besedno poravnavo (pad byte
 * pri lihih velikostih — RIFF spec).
 */
function parseWav(buf: Buffer): WavInfo | null {
  if (buf.length < 44) return null;
  if (buf.readUInt32BE(0) !== 0x52494646) return null; // "RIFF"
  if (buf.readUInt32BE(8) !== 0x57415645) return null; // "WAVE"

  let off = 12;
  let fmt: WavInfo | null = null;
  let pcm: Buffer | null = null;

  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    const dataOff = off + 8;
    if (dataOff + size > buf.length) return null; // pokvarjen kos

    if (id === "fmt " && size >= 16) {
      fmt = {
        pcm: Buffer.alloc(0),
        audioFormat: buf.readUInt16LE(dataOff),
        channels: buf.readUInt16LE(dataOff + 2),
        sampleRate: buf.readUInt32LE(dataOff + 4),
        bitsPerSample: buf.readUInt16LE(dataOff + 14),
      };
    } else if (id === "data") {
      pcm = buf.subarray(dataOff, dataOff + size);
    }

    off = dataOff + size + (size % 2); // word-aligned naslednji kos
  }

  if (!fmt || !pcm) return null;
  return { ...fmt, pcm };
}

/**
 * Spajanje VEČ WAV bufferjev istega formata v EN zapis.
 *
 * - en sam kos → vrnjen NESPREMENJEN (glava vira je veljavna);
 * - različni formati (sampleRate/kanali/bit) → null (ne mešamo
 *   nestandardnih zmes — iskrena napaka namesto pokvarjenega zvoka);
 * - napačen/pokvarjen vhod → null;
 * - izhod: čista kanonična glava RIFF(12) + fmt(16) + data.
 */
export function concatWavBuffers(buffers: ReadonlyArray<Buffer>): Buffer | null {
  if (buffers.length === 0) return null;
  // Tudi en sam kos mora biti veljaven WAV (vhod je lahko smeti —
  // vrata morajo zadržati ne-zvok, ne pa ga potisnil naprej).
  if (buffers.some((b) => parseWav(b) == null)) return null;
  if (buffers.length === 1) return buffers[0];

  const parsed: WavInfo[] = [];
  for (const b of buffers) {
    const info = parseWav(b);
    if (!info) return null;
    parsed.push(info);
  }

  const first = parsed[0];
  for (const p of parsed.slice(1)) {
    if (
      p.sampleRate !== first.sampleRate ||
      p.channels !== first.channels ||
      p.bitsPerSample !== first.bitsPerSample ||
      p.audioFormat !== first.audioFormat
    ) {
      return null;
    }
  }

  const totalData = parsed.reduce((sum, p) => sum + p.pcm.length, 0);
  const byteRate = first.sampleRate * first.channels * (first.bitsPerSample / 8);
  const blockAlign = first.channels * (first.bitsPerSample / 8);

  const out = Buffer.alloc(44 + totalData);
  out.write("RIFF", 0, "ascii");
  out.writeUInt32LE(36 + totalData, 4); // velikost za to oznako + data
  out.write("WAVE", 8, "ascii");
  out.write("fmt ", 12, "ascii");
  out.writeUInt32LE(16, 16); // velikost fmt kosa
  out.writeUInt16LE(first.audioFormat, 20);
  out.writeUInt16LE(first.channels, 22);
  out.writeUInt32LE(first.sampleRate, 24);
  out.writeUInt32LE(byteRate, 28);
  out.writeUInt16LE(blockAlign, 32);
  out.writeUInt16LE(first.bitsPerSample, 34);
  out.write("data", 36, "ascii");
  out.writeUInt32LE(totalData, 40);

  let cursor = 44;
  for (const p of parsed) {
    p.pcm.copy(out, cursor);
    cursor += p.pcm.length;
  }

  return out;
}

// ─── Ključ predpomnilnika ─────────────────────────────────────────────────

/**
 * Deterministični ključ za predpomnilnik (strežniški LRU + klientni blob).
 * djb2 nad kanonično JSON obliko vhoda + jezik — isti dan vedno isti zvok.
 */
export function narrationCacheKey(
  day: NarrationDayInput,
  lang: NarrationLang
): string {
  const canonical = JSON.stringify({
    d: day.dayNumber,
    date: typeof day.dateLabel === "string" ? day.dateLabel.trim() : "",
    s: day.stops
      .map((s) => [
        (s.time ?? "").trim(),
        s.name.trim(),
        (s.description ?? "").replace(/\s+/g, " ").trim(),
      ])
      .filter((s) => s[1] !== ""),
    lang,
  });
  let h = 5381;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h * 33) ^ canonical.charCodeAt(i)) >>> 0;
  }
  return `n${h.toString(36)}`;
}
