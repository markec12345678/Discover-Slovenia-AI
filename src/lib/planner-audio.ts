import type { Itinerary } from "@/lib/types";

// ============================================================================
// D2 "Poslušaj svoj načrt" (nabor #2, Mindtrip aitravel.tools) — ČISTA
// funkcija za zvočni povzetek itinerarja: iz obstoječih podatkov načrta
// deterministično sestavi besedilo za IZGOVOR. NIČ AI žetonov, nič
// skrivanja: isto besedilo, ki ga vidi uporabnik na zaslonu (dnevi,
// postanki, km iz geo-validacije, skupina, proračun).
//
// Vir zvoka (ISSUE #9 ZERO-AI): BRKALNIŠKI GLAS (window.speechSynthesis)
// — nekdanja strežniška TTS pot (/api/itinerary/tts + tts-engine) je
// ODSTRANJENA; komponenta skript izgovori NA KLIENTU po koseh
// (chunkNarration, lib/itinerary-audio.ts).
//
// Načrt poštenosti:
//  - km so zaokrožena na 5 in OZNAČENA kot "približno" (ista praksa kot
//    značke ~km na karticah dni — src/lib/road-routing.ts round5)
//  - dolžina skripta je OMEJENA (~1000 znakov): poslušanje je POVZETEK
//    po dnevh (ne vsa vsebina kartic) — izrecen kompromis, ne napaka
//  - slovenščina: dvojina/množčina (1 dan / 2 dni / 5 dni; 1 oseba /
//    2 osebi / 3-4 osebe / 5+ oseb)
// ============================================================================

/** Trdna zgornja meja skripta — poslušanje je POVZETEK (kompromis je
 *  izrecen), ne nadomestilo branja; komponenta kose izgovori po stavkih. */
export const AUDIO_SCRIPT_MAX_CHARS = 1000;

// ── Strukturno minimalen načrt (ista disciplina kot TripEntryLike
//    v itinerary-audio.ts): skript se gradi iz STRUKTURIRANIH podatkov
//    (ne prostega besedila); Itinerary iz types.ts to strukturo ZADOVOLJUJE.

/** Dan v minimalni obliki za zvočni povzetek (imena postankov). */
export interface AudioScriptDay {
  day: number;
  locations: ReadonlyArray<{ destination_name: string }>;
}

/** Načrt v minimalni obliki za zvočni povzetek (dnevi + proračun). */
export interface AudioScriptItinerary {
  total_budget: number;
  days: ReadonlyArray<AudioScriptDay>;
}

interface AudioScriptInput {
  itinerary: Itinerary | AudioScriptItinerary;
  /** km po dnevih iz geo-validacije (isti vir kot značke ~km dni) */
  dayKm: Record<number, number>;
  /** velikost skupine iz obrazca (samo za uvodno poved) */
  groupSize: number;
  locale: "sl" | "en";
}

export interface AudioScript {
  text: string;
  chars: number;
}

/** Slovenska mnočina za osebe: 1 oseba, 2 osebi, 3-4 osebe, 5+ oseb. */
function slOseb(n: number): string {
  if (n === 1) return "oseba";
  if (n === 2) return "osebi";
  if (n >= 3 && n <= 4) return "osebe";
  return "oseb";
}

/** Seznam imen v Slovenščini: "A, B in C" (zadnji veznik). */
function slJoin(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} in ${names[names.length - 1]}`;
}

/** Angleško: "A, B and C". */
function enJoin(names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Zaokroži km na 5 — brez lažne natančnosti (ista praksa kot road-routing). */
function round5(n: number): number {
  return Math.round(n / 5) * 5;
}

/**
 * Sestavi zvočni povzetek načrta (deterministično, 0 AI).
 *
 * Struktura: uvod (dnevi/skupina/proračun) → po dan ena poved (imena
 * postankov + približni km) → zaključek. Če skript preseže mejo, se
 * NAJPREJ odstranijo km-povedi (deterministična degradacija — imena
 * postankov so jedro povzetka), nato skrajšajo seznami imen.
 */
export function buildItineraryAudioScript(
  input: AudioScriptInput
): AudioScript | null {
  const { itinerary, dayKm, groupSize, locale } = input;
  const days = itinerary.days;
  if (days.length === 0) return null;

  const isSl = locale === "sl";
  const budget = Math.round(itinerary.total_budget);
  const dayWord = isSl ? (days.length === 1 ? "dan" : "dni") : days.length === 1 ? "day" : "days";

  // Seznami imen postankov po dnevih (deduplicirani znotraj dneva, redni vrstni red)
  const namesPerDay: string[][] = days.map((d) => {
    const seen = new Set<string>();
    const names: string[] = [];
    for (const loc of d.locations) {
      if (loc.destination_name && !seen.has(loc.destination_name)) {
        seen.add(loc.destination_name);
        names.push(loc.destination_name);
      }
    }
    return names;
  });

  const withKm = (dayNum: number, km: number | undefined): string => {
    if (km === undefined || !Number.isFinite(km) || km <= 0) return "";
    const r = round5(km);
    if (r <= 0) return "";
    return isSl
      ? ` Približno ${r} kilometrov vožnje.`
      : ` About ${r} kilometers of driving.`;
  };

  function build(maxNames: number, includeKm: boolean): string {
    const intro = isSl
      ? `Tvoje potovanje po Sloveniji traja ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Potuješ sam. "
          : `Skupaj vas je ${groupSize} ${slOseb(groupSize)}. `) +
        `Okvirni proračun je ${budget} evrov.`
      : `Your trip around Slovenia lasts ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "You are traveling solo. "
          : `There are ${groupSize} of you on this trip. `) +
        `The estimated budget is ${budget} euros.`;

    const daySentences = days.map((d, i) => {
      const all = namesPerDay[i];
      const names = all.slice(0, maxNames);
      const extra = all.length - names.length;
      const namesText =
        extra > 0
          ? isSl
            ? `${slJoin(names)} in še ${extra} ${extra === 1 ? "postanek" : extra < 5 ? "postanke" : "postankov"}.`
            : `${enJoin(names)} and ${extra} more stop${extra > 1 ? "s" : ""}.`
          : isSl
            ? `${slJoin(names)}.`
            : `${enJoin(names)}.`;
      const km = includeKm ? withKm(d.day, dayKm[d.day]) : "";
      return isSl ? `Dan ${d.day}: ${namesText}${km}` : `Day ${d.day}: ${namesText}${km}`;
    });

    const outro = isSl ? "Lepo potovanje!" : "Have a great trip!";
    return `${intro} ${daySentences.join(" ")} ${outro}`;
  }

  // Deterministična degradacija, dokler ne gre pod mejo:
  // 1) polne različice (vsak postanek + km) → 2) brez km → 3) brez km, max 4
  // imena/dan → 4) brez km, max 2 imeni/dan. Nadaljnje krajšanje NE smisla
  // (15-dnevni načrt z 2 imeni/dan ostane pod ~1000 znakov).
  let text = build(99, true);
  if (text.length > AUDIO_SCRIPT_MAX_CHARS) text = build(99, false);
  if (text.length > AUDIO_SCRIPT_MAX_CHARS) text = build(4, false);
  if (text.length > AUDIO_SCRIPT_MAX_CHARS) text = build(2, false);

  return { text, chars: text.length };
}
