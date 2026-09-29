import type { Itinerary } from "@/lib/types";
import { PL, type PlannerLang } from "@/lib/planner-lang";

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
  /** W1-2b-2: 4-jezično (PL pogodba — glasovni povzetek v jeziku UI);
   *  W12-faza-2b: 6-jezično (fr/es — glasova fr-FR/es-ES izbere voice.ts). */
  locale: PlannerLang;
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

/** Seznami imen: SL "A, B in C" / IT "A, B e C" / FR "A, B et C" /
 *  ES "A, B y C" / ostalo "A, B and C". W12-faza-2b: FR/ES veznika. */
function joinFor(lang: PlannerLang, names: string[]): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0];
  const conj =
    lang === "sl" ? " in " : lang === "it" ? " e " : lang === "fr" ? " et " : lang === "es" ? " y " : " and ";
  return `${names.slice(0, -1).join(", ")}${conj}${names[names.length - 1]}`;
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

  const lang = locale;
  const budget = Math.round(itinerary.total_budget);
  const dayWord = PL(lang, {
    sl: days.length === 1 ? "dan" : "dni",
    en: days.length === 1 ? "day" : "days",
    it: days.length === 1 ? "giorno" : "giorni",
    de: days.length === 1 ? "Tag" : "Tage",
    // W12-faza-2b: FR/ES
    fr: days.length === 1 ? "jour" : "jours",
    es: days.length === 1 ? "día" : "días",
  });

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
    return PL(lang, {
      sl: ` Približno ${r} kilometrov vožnje.`,
      en: ` About ${r} kilometers of driving.`,
      it: ` Circa ${r} chilometri di guida.`,
      de: ` Etwa ${r} Kilometer Fahrt.`,
      fr: ` Environ ${r} kilomètres de conduite.`,
      es: ` Aproximadamente ${r} kilómetros de conducción.`,
    });
  };

  function build(maxNames: number, includeKm: boolean): string {
    const intro = PL(lang, {
      sl:
        `Tvoje potovanje po Sloveniji traja ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Potuješ sam. "
          : `Skupaj vas je ${groupSize} ${slOseb(groupSize)}. `) +
        `Okvirni proračun je ${budget} evrov.`,
      en:
        `Your trip around Slovenia lasts ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "You are traveling solo. "
          : `There are ${groupSize} of you on this trip. `) +
        `The estimated budget is ${budget} euros.`,
      it:
        `Il tuo viaggio in Slovenia dura ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Viaggi da solo. "
          : `Siete in ${groupSize} persone in questo viaggio. `) +
        `Il budget stimato è di ${budget} euro.`,
      de:
        `Deine Reise durch Slowenien dauert ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Du reist allein. "
          : `Ihr seid ${groupSize} Personen auf dieser Reise. `) +
        `Das geschätzte Budget beträgt ${budget} Euro.`,
      // W12-faza-2b: FR/ES intro
      fr:
        `Ton voyage en Slovénie dure ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Tu voyages seul. "
          : `Vous êtes ${groupSize} personnes pour ce voyage. `) +
        `Le budget estimé est de ${budget} euros.`,
      es:
        `Tu viaje por Eslovenia dura ${days.length} ${dayWord}. ` +
        (groupSize === 1
          ? "Viajas solo. "
          : `Son ${groupSize} personas en este viaje. `) +
        `El presupuesto estimado es de ${budget} euros.`,
    });

    const daySentences = days.map((d, i) => {
      const all = namesPerDay[i];
      const names = all.slice(0, maxNames);
      const extra = all.length - names.length;
      const namesText =
        extra > 0
          ? PL(lang, {
              sl: `${joinFor(lang, names)} in še ${extra} ${extra === 1 ? "postanek" : extra < 5 ? "postanke" : "postankov"}.`,
              en: `${joinFor(lang, names)} and ${extra} more stop${extra > 1 ? "s" : ""}.`,
              it: `${joinFor(lang, names)} e altre ${extra} ${extra === 1 ? "tappa" : "tappe"}.`,
              de: `${joinFor(lang, names)} und ${extra} weitere Stopps.`,
              fr: `${joinFor(lang, names)} et ${extra} ${extra === 1 ? "étape" : "étapes"} de plus.`,
              es: `${joinFor(lang, names)} y ${extra} ${extra === 1 ? "parada" : "paradas"} más.`,
            })
          : `${joinFor(lang, names)}.`;
      const km = includeKm ? withKm(d.day, dayKm[d.day]) : "";
      return PL(lang, {
        sl: `Dan ${d.day}: ${namesText}${km}`,
        en: `Day ${d.day}: ${namesText}${km}`,
        it: `Giorno ${d.day}: ${namesText}${km}`,
        de: `Tag ${d.day}: ${namesText}${km}`,
        fr: `Jour ${d.day} : ${namesText}${km}`,
        es: `Día ${d.day}: ${namesText}${km}`,
      });
    });

    const outro = PL(lang, {
      sl: "Lepo potovanje!",
      en: "Have a great trip!",
      it: "Buon viaggio!",
      de: "Gute Reise!",
      fr: "Bon voyage !",
      es: "¡Buen viaje!",
    });
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
