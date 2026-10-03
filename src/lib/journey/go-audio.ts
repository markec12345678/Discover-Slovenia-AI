// ============================================================================
// W7 — VOICE VODIČ V GO MODE (Issue #15, val V2; vrzel W7 iz workflow
// benchmarka UX-WORKFLOW-BENCHMARK-2026-09-27.md §4)
// ============================================================================
// »Preberi postanek« / »Kaj je v bližini« — glasovni vodik MED POTOVANJEM
// (telefon v žepu, hoja proti postanku): isto znanje kot zaslon, povedano
// z brskalniškim glasom. Benchmark: »TTS ✓ danes v klepetu → Go mode
// »preberi postanek« / »kaj je v bližini« gumb (speechSynthesis +
// geolocation)« — naravna razširitev obstoječe TTS plasti (Issue #2 §7,
// TASK 89/91, planner-audio) NA površino, kjer je glas najbolj uporaben.
//
// SLOJI (ista disciplina kot itinerary-audio.ts):
//   1. TA DATOTEKA — čiste funkcije (0 omrežja, 0 React, 0 AI žetonov):
//      gradnja pripovedi IZKLJUČNO iz strukturiranih dejstev kartice Go
//      Mode + destinacijskega dataseta (38 destinacij, isti vir kot
//      /zemljevid). Klientu prijazna tudi BREZ signala — destinacije so
//      v paketu, zato »kaj je v bližini« deluje tudi offline (Go Mode
//      obljuba iz o-strani: načrt na napravi).
//   2. go-audio-button.tsx — gumb, ki izgovarja po koseh (chunkNarration).
//
// ISKRENOST (kanon 71/74/77/88 + W7 varovala benchmarka):
//  - pripoved postanka SAMO iz dejstev, ki obstajajo (naslov, ponudnik,
//    termin, lokacija, GPS-razdalja s »premica« razkritjem, trajanje);
//    manjkajoče dejstvo → manjka poved (NE izmišljujemo);
//  - razdalja je PREMICA — izrecno povedana (ne vožnja, kot na zaslonu);
//  - »kaj je v bližini«: destinacije, ki so geo-blizu današnjih postankov
//    dneva, se IZVZAMEJO (diskoveri, ne ponavljanje poti — W8 načelo
//    razpršitve); brez GPS → gumba NI (iskrena odsotnost, kanon
//    DistanceChip); nič znotraj radija → gumba NI;
//  - SL številke v BESEDAH (ista izmera kot itinerary-audio: števke v
//    številskem zapisu TTS glasi kot angleške besede sredi SL stavka);
//    EN pusti števke (nativna izgovorjava).
// ============================================================================

import { haversineKm } from "@/lib/geo-distance";
import {
  bearingDeg,
  cardinalLabel,
  type GoEntryCard,
  type GoPosition,
} from "@/lib/journey/go-view";
import { speechTime } from "@/lib/itinerary-audio";
import { DESTINATIONS } from "@/lib/slovenia-data";
// ISSUE #24 Sklop 8 (1.170.0): 6-jezični glasovni vodik (faza 2 — polni
// prevodi pripovedi IT/DE/FR/ES; TTS oznako glasa razreši speechLanguageTag).
import { GL, type GoLang, type GoStrings } from "./go-lang";

// ─── Omejitve (zod vrata — varujejo pošteno dolžino pripovedi) ────────────

export const GO_AUDIO_LIMITS = {
  /** Radij »kaj je v bližini« (km, premica) — izven tega NI »v bližini«. */
  nearbyRadiusKm: 100,
  /** Zgornja meja naštetih destinacij (govor NE razlaga vseh 38). */
  nearbyMaxCount: 4,
  /** Izvzem destinacije, ki so geo-ob postankih dneva (km, premica). */
  excludeNearKm: 2,
  /** Zgornja meja dolžine naslova (zod vrata). */
  maxTitleChars: 160,
  /** Zgornja meja dolžine ponudnika (zod vrata). */
  maxProviderChars: 80,
  /** Zgornja meja dolžine lokacije (zod vrata). */
  maxLocationChars: 120,
  /** Zgornja meja števila ur v besedah (5h+ → števke, redki robni). */
  maxSpokenHours: 6,
} as const;

// ─── SL številke v besedah (izmera TTS — glej zgornjo glavo) ───────────────

/** Osnovne besede 1–20 + desetice + 100 (moski zacetek; zenski obliki
 *  se razlikujeta SAMO pri 1 in 2 — slCardinal(gender) popravi). */
const SL_ONES_M = [
  "", "en", "dva", "tri", "štiri", "pet", "šest", "sedem", "osem", "devet",
  "deset", "enajst", "dvanajst", "trinajst", "štirinajst", "petnajst",
  "šestnajst", "sedemnajst", "osemnajst", "devetnajst",
] as const;

const SL_ONES_F = [
  "", "ena", "dve", "tri", "štiri", "pet", "šest", "sedem", "osem", "devet",
  "deset", "enajst", "dvanajst", "trinajst", "štirinajst", "petnajst",
  "šestnajst", "sedemnajst", "osemnajst", "devetnajst",
] as const;

const SL_TENS = [
  "", "", "dvajset", "trideset", "štirideset", "petdeset", "šestdeset",
  "sedemdeset", "osemdeset", "devetdeset",
] as const;

/** Kardinalni števnik 1–100 v besedah; 0 → "nič", >100 → null (klicalec
 *  ima svoj padec — iskreno NE zvonimo z besedami, ki jih ne znamo). */
export function slCardinal(n: number, gender: "m" | "f" = "m"): string | null {
  if (!Number.isInteger(n) || n < 0) return null;
  if (n === 0) return "nič";
  if (n === 100) return "sto";
  if (n > 100) return null;
  const ones = n % 10;
  const tens = Math.floor(n / 10);
  if (n < 20) {
    return gender === "f" ? SL_ONES_F[n] : SL_ONES_M[n];
  }
  if (n % 10 === 0) {
    return SL_TENS[tens];
  }
  // 21–99: enice + »in« + desetice (enaindvajset, dvainštirideset …).
  // V SESTAVLJENI obliki je »1« vedno »ena« (enaindvajset, enaintrideset,
  // enaindevetdeset …) — tudi pri moškem rodu (samo stoječi »1« je »en«).
  const oneWord =
    ones === 1
      ? "ena"
      : gender === "f"
        ? SL_ONES_F[ones]
        : SL_ONES_M[ones];
  return `${oneWord}in${SL_TENS[tens]}`;
}

/** SL fraza za razdaljo: »manj kot kilometer« / »en kilometer« /
 *  »dva kilometra« / »tri kilometre« / »pet kilometrov« … (do 100). */
export function slKmPhrase(roundedKm: number): string {
  if (roundedKm <= 0) return "manj kot kilometer";
  if (roundedKm === 1) return "en kilometer";
  if (roundedKm === 2) return "dva kilometra";
  const w = slCardinal(roundedKm);
  if (w == null) return `${roundedKm} kilometrov`; // >100: števke (redki rob)
  return roundedKm <= 4 ? `${w} kilometre` : `${w} kilometrov`;
}

/** SL fraza za trajanje v minutah (do 100 v besedah): »ena minuta« /
 *  »dve minuti« / »tri minute« / »pet minut« … */
export function slMinPhrase(min: number): string {
  if (min === 1) return "ena minuta";
  if (min === 2) return "dve minuti";
  const w = slCardinal(min, "f");
  if (w == null) return `${min} minut`; // >100: števke (redki rob)
  return min <= 4 ? `${w} minute` : `${w} minut`;
}

/** SL fraza za trajanje v urah (točno N ur): »eno uro« / »dve uri« /
 *  »tri ure« / »pet ur« … do 6h. */
function slHourPhrase(hours: number): string | null {
  if (hours === 1) return "eno uro";
  if (hours === 2) return "dve uri";
  if (hours === 3) return "tri ure";
  if (hours === 4) return "štiri ure";
  if (hours === 5 || hours === GO_AUDIO_LIMITS.maxSpokenHours) {
    return `${slCardinal(hours)} ur`;
  }
  return null; // 0 ali >6 → ni fraze (klicatelj pade na minute)
}

/** Trajanje v govoru: cele ure (60–360) v besedah, sicer minute. */
export function slDurationPhrase(min: number): string {
  if (min >= 60 && min % 60 === 0) {
    const h = slHourPhrase(min / 60);
    if (h != null) return h;
  }
  return slMinPhrase(min);
}

// ─── UI oznake (vzorec GO_LABELS / NARRATION_LABELS — en vir na jezik) ─────

export interface GoAudioLabels {
  /** Gumb na kartici postanka (kratko — prostor v glavi kartice). */
  readStop: string;
  readStopAria: (title: string) => string;
  stopPlayback: string;
  stopPlaybackAria: (title: string) => string;
  /** Gumb »kaj je v bližini« (GPS kartica). */
  nearby: string;
  nearbyAria: string;
  stopNearby: string;
  error: string;
  /** Tekstovni padec (brskalnik brez speechSynthesis) — vzorec TASK 89. */
  showText: string;
  hideText: string;
  voiceUnavailable: string;
}

export const GO_AUDIO_LABELS: Record<GoLang, GoAudioLabels> = {
  sl: {
    readStop: "Preberi",
    readStopAria: (title) => `Preberi postanek na glas: ${title}`,
    stopPlayback: "Ustavi",
    stopPlaybackAria: (title) => `Ustavi branje postanka: ${title}`,
    nearby: "Kaj je v bližini",
    nearbyAria: "Preberi na glas, katere destinacije so v tvoji bližini",
    stopNearby: "Ustavi",
    error: "Branje na glas trenutno ni na voljo.",
    showText: "Prikaži besedilo",
    hideText: "Skrij besedilo",
    voiceUnavailable:
      "Računalniški glas ni na voljo — besedilo je prikazano spodaj.",
  },
  en: {
    readStop: "Listen",
    readStopAria: (title) => `Read this stop aloud: ${title}`,
    stopPlayback: "Stop",
    stopPlaybackAria: (title) => `Stop reading this stop: ${title}`,
    nearby: "What's nearby",
    nearbyAria: "Read aloud which destinations are near you",
    stopNearby: "Stop",
    error: "Reading aloud is currently unavailable.",
    showText: "Show text",
    hideText: "Hide text",
    voiceUnavailable:
      "Computer voice unavailable — the text is shown below.",
  },
  it: {
    readStop: "Ascolta",
    readStopAria: (title) => `Leggi questa tappa ad alta voce: ${title}`,
    stopPlayback: "Ferma",
    stopPlaybackAria: (title) => `Ferma la lettura della tappa: ${title}`,
    nearby: "Cosa c'è vicino",
    nearbyAria: "Leggi ad alta voce quali destinazioni sono vicino a te",
    stopNearby: "Ferma",
    error: "La lettura ad alta voce non è al momento disponibile.",
    showText: "Mostra testo",
    hideText: "Nascondi testo",
    voiceUnavailable:
      "Voce del computer non disponibile — il testo è mostrato qui sotto.",
  },
  de: {
    readStop: "Anhören",
    readStopAria: (title) => `Diese Station vorlesen: ${title}`,
    stopPlayback: "Stopp",
    stopPlaybackAria: (title) => `Vorlesen dieser Station stoppen: ${title}`,
    nearby: "Was ist in der Nähe",
    nearbyAria: "Vorlesen, welche Ziele in deiner Nähe sind",
    stopNearby: "Stopp",
    error: "Das Vorlesen ist derzeit nicht verfügbar.",
    showText: "Text anzeigen",
    hideText: "Text ausblenden",
    voiceUnavailable:
      "Computerstimme nicht verfügbar — der Text steht unten.",
  },
  fr: {
    readStop: "Écouter",
    readStopAria: (title) => `Lire cet arrêt à voix haute : ${title}`,
    stopPlayback: "Arrêter",
    stopPlaybackAria: (title) => `Arrêter la lecture de l'arrêt : ${title}`,
    nearby: "Qu'y a-t-il à proximité",
    nearbyAria: "Lire à voix haute quelles destinations sont près de toi",
    stopNearby: "Arrêter",
    error: "La lecture à voix haute n'est pas disponible pour le moment.",
    showText: "Afficher le texte",
    hideText: "Masquer le texte",
    voiceUnavailable:
      "Voix de synthèse indisponible — le texte est affiché ci-dessous.",
  },
  es: {
    readStop: "Escuchar",
    readStopAria: (title) => `Leer esta parada en voz alta: ${title}`,
    stopPlayback: "Detener",
    stopPlaybackAria: (title) => `Detener la lectura de la parada: ${title}`,
    nearby: "Qué hay cerca",
    nearbyAria: "Leer en voz alta qué destinos están cerca de ti",
    stopNearby: "Detener",
    error: "La lectura en voz alta no está disponible ahora mismo.",
    showText: "Mostrar texto",
    hideText: "Ocultar texto",
    voiceUnavailable:
      "Voz del ordenador no disponible — el texto se muestra abajo.",
  },
};

// ─── Gradnja pripovedi ─────────────────────────────────────────────────────

/** Prva črka velika (»ob desetih« → »Ob desetih.«). */
function cap(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── ISSUE #24 Sklop 8 (1.170.0): PER-JEZIKOVNI PAKETI Pripovedi ───────────
// SL/EN paketa izrecno ohranjata DOSLEDNO dosedanje izpise (regresija w7);
// IT/DE/FR/ES so novi polni prevodi. Števila: SL v BESEDAH (izmera TTS —
// števke bi glasil kot angleške besede sredi SL stavka), vsi drugi jeziki
// puščajo števke (nativna izgovorjava TTS glasu v tem jeziku).

/** Termin v govoru za tuje jezike (števke — nativna izgovorjava). */
function goSpeechTimeForeign(time: string, lang: "it" | "de" | "fr" | "es"): string {
  const t = time.trim();
  if (t === "") return "";
  const range = /^(\d{1,2}):(\d{2})\s*[-–—]\s*(\d{1,2}):(\d{2})$/.exec(t);
  if (range) {
    const h1 = Number(range[1]);
    const m1 = Number(range[2]);
    const h2 = Number(range[3]);
    const m2 = Number(range[4]);
    const a = `${h1}:${String(m1).padStart(2, "0")}`;
    const b = `${h2}:${String(m2).padStart(2, "0")}`;
    if (lang === "it") return `dalle ${a} alle ${b}`;
    if (lang === "de") return `von ${a} bis ${b} Uhr`;
    if (lang === "fr") return `de ${a} à ${b}`;
    return `de ${a} a ${b}`;
  }
  const single = /^(\d{1,2}):(\d{2})$/.exec(t);
  if (single) {
    const h = Number(single[1]);
    const m = Number(single[2]);
    const hhmm = `${h}:${String(m).padStart(2, "0")}`;
    if (lang === "it") return `alle ${hhmm}`;
    if (lang === "de") return `um ${hhmm} Uhr`;
    if (lang === "fr") return `à ${hhmm}`;
    return `a las ${hhmm}`;
  }
  return t; // besedni termini gredo nespremenjeni skozi (že so govor)
}

/** Razdalja v govoru (tuji jeziki — števke, nativno izgovorjene). */
function foreignKmPhrase(km: number, lang: "it" | "de" | "fr" | "es"): string {
  if (lang === "it") return km === 1 ? "circa un chilometro" : `circa ${km} chilometri`;
  if (lang === "de") return km === 1 ? "etwa ein Kilometer" : `etwa ${km} Kilometer`;
  if (lang === "fr") return km === 1 ? "environ un kilomètre" : `environ ${km} kilomètres`;
  return km === 1 ? "un kilómetro aproximadamente" : `unos ${km} kilómetros`;
}

/** Trajanje v govoru (tuji jeziki — števke). */
function foreignDurationPhrase(min: number, lang: "it" | "de" | "fr" | "es"): string {
  if (min >= 60 && min % 60 === 0) {
    const h = min / 60;
    if (lang === "it") return h === 1 ? "circa un'ora" : `circa ${h} ore`;
    if (lang === "de") return h === 1 ? "etwa eine Stunde" : `etwa ${h} Stunden`;
    if (lang === "fr") return h === 1 ? "environ une heure" : `environ ${h} heures`;
    return h === 1 ? "una hora aproximadamente" : `unas ${h} horas`;
  }
  if (lang === "it") return min === 1 ? "circa un minuto" : `circa ${min} minuti`;
  if (lang === "de") return min === 1 ? "etwa eine Minute" : `etwa ${min} Minuten`;
  if (lang === "fr") return min === 1 ? "environ une minute" : `environ ${min} minutes`;
  return min === 1 ? "un minuto aproximadamente" : `unos ${min} minutos`;
}

/** Paket stavkov pripovedi ENEGA postanka (en jezik = en paket). */
interface StopNarrationPack {
  stopIntro: (title: string) => string;
  providerLine: (provider: string) => string;
  locationLine: (location: string) => string;
  /** (razdalja v besedah, smer) → poved z razkritjem PREMICE. */
  kmBearingLine: (kmText: string, bearing: string) => string;
  nearArrivalLine: (m: number) => string;
  arrivedLine: () => string;
  durationLine: (dText: string) => string;
  timeText: (t: string) => string;
  kmText: (km: number) => string;
  durationText: (min: number) => string;
}

const NARRATION_PACKS: Record<GoLang, StopNarrationPack> = {
  sl: {
    stopIntro: (title) => `Postanek: ${title}.`,
    providerLine: (provider) => `Pri ponudniku: ${provider}.`,
    locationLine: (location) => `Lokacija: ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} proti ${bearing}, premica.`,
    nearArrivalLine: (m) => `Kmalu boš tam — približno ${m} metrov.`,
    arrivedLine: () => "Prišel si na lokacijo.",
    durationLine: (d) => `Priporočeno trajanje: ${d}.`,
    timeText: (t) => speechTime(t, "sl"),
    kmText: (km) => slKmPhrase(km),
    durationText: (min) => slDurationPhrase(min),
  },
  en: {
    stopIntro: (title) => `Stop: ${title}.`,
    providerLine: (provider) => `Provider: ${provider}.`,
    locationLine: (location) => `Location: ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} toward the ${bearing}, as the crow flies.`,
    nearArrivalLine: (m) => `Almost there — about ${m} meters.`,
    arrivedLine: () => "You have arrived at the location.",
    durationLine: (d) => `Recommended duration: ${d}.`,
    timeText: (t) => speechTime(t, "en"),
    kmText: (km) => (km === 1 ? "about 1 kilometer" : `about ${km} kilometers`),
    durationText: (min) =>
      min >= 60 && min % 60 === 0
        ? min / 60 === 1
          ? "about 1 hour"
          : `about ${min / 60} hours`
        : min === 1
          ? "about 1 minute"
          : `about ${min} minutes`,
  },
  it: {
    stopIntro: (title) => `Tappa: ${title}.`,
    providerLine: (provider) => `Presso il fornitore: ${provider}.`,
    locationLine: (location) => `Posizione: ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} verso ${bearing}, in linea d'aria.`,
    nearArrivalLine: (m) => `Ci siamo quasi — circa ${m} metri.`,
    arrivedLine: () => "Sei arrivato sulla posizione.",
    durationLine: (d) => `Durata consigliata: ${d}.`,
    timeText: (t) => goSpeechTimeForeign(t, "it"),
    kmText: (km) => foreignKmPhrase(km, "it"),
    durationText: (min) => foreignDurationPhrase(min, "it"),
  },
  de: {
    stopIntro: (title) => `Station: ${title}.`,
    providerLine: (provider) => `Beim Anbieter: ${provider}.`,
    locationLine: (location) => `Standort: ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} Richtung ${bearing}, Luftlinie.`,
    nearArrivalLine: (m) => `Fast da — etwa ${m} Meter.`,
    arrivedLine: () => "Du bist am Ziel angekommen.",
    durationLine: (d) => `Empfohlene Dauer: ${d}.`,
    timeText: (t) => goSpeechTimeForeign(t, "de"),
    kmText: (km) => foreignKmPhrase(km, "de"),
    durationText: (min) => foreignDurationPhrase(min, "de"),
  },
  fr: {
    stopIntro: (title) => `Arrêt : ${title}.`,
    providerLine: (provider) => `Chez le prestataire : ${provider}.`,
    locationLine: (location) => `Emplacement : ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} vers le ${bearing}, à vol d'oiseau.`,
    nearArrivalLine: (m) => `Presque arrivé — environ ${m} mètres.`,
    arrivedLine: () => "Tu es arrivé à destination.",
    durationLine: (d) => `Durée recommandée : ${d}.`,
    timeText: (t) => goSpeechTimeForeign(t, "fr"),
    kmText: (km) => foreignKmPhrase(km, "fr"),
    durationText: (min) => foreignDurationPhrase(min, "fr"),
  },
  es: {
    stopIntro: (title) => `Parada: ${title}.`,
    providerLine: (provider) => `En el proveedor: ${provider}.`,
    locationLine: (location) => `Ubicación: ${location}.`,
    kmBearingLine: (kmText, bearing) => `${cap(kmText)} hacia el ${bearing}, en línea recta.`,
    nearArrivalLine: (m) => `Casi llegas — unos ${m} metros.`,
    arrivedLine: () => "Has llegado a la ubicación.",
    durationLine: (d) => `Duración recomendada: ${d}.`,
    timeText: (t) => goSpeechTimeForeign(t, "es"),
    kmText: (km) => foreignKmPhrase(km, "es"),
    durationText: (min) => foreignDurationPhrase(min, "es"),
  },
};

/**
 * Pripoved ENEGA postanka Go Mode — IZKLJUČNO iz dejstev kartice.
 *
 * Struktura (per jezik — NARRATION_PACKS): uvod + ponudnik + termin +
 * lokacija + razdalja/smer (PREMICA razkrita) + navigacijska dejstva +
 * priporočeno trajanje. Manjkajoče dejstvo → manjka poved (NE izmišljujemo
 * termina/lokacije/razdalje). Prazan naslov → null (fail-closed — gumba
 * ni, kanon TASK 89).
 *
 * timeNote se NE pripoveduje (meta-razlaga, zakaj časa ni — zaslon jo
 * pokaže, govor so samo dejstva; isti kanon kot MY TRIP TASK 91).
 */
export function buildStopNarration(
  card: GoEntryCard,
  lang: GoLang
): string | null {
  const e = card.entry;
  const title = (e.title ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxTitleChars);
  if (title === "") return null;

  const p = NARRATION_PACKS[lang];
  const parts: string[] = [];

  parts.push(p.stopIntro(title));
  // Podatkovni par {sl,en} (jezikovno nevtralen zapis) — tuji jeziki
  // dedijo EN stran (isti kanon kot izris; P4-8: nikoli SL za tuje).
  const providerRaw =
    e.providerLabel?.[lang === "sl" ? "sl" : "en"] ?? "";
  const provider = providerRaw.trim().slice(0, GO_AUDIO_LIMITS.maxProviderChars);
  if (provider !== "") parts.push(p.providerLine(provider));
  if (e.time?.start) {
    const t = p.timeText(e.time.start);
    if (t !== "") parts.push(`${cap(t)}.`);
  }
  const location = (e.location ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxLocationChars);
  if (location !== "") parts.push(p.locationLine(location));
  if (card.distanceKm != null && card.bearingLabel) {
    const km = Math.round(card.distanceKm);
    parts.push(p.kmBearingLine(p.kmText(km), GL(lang, card.bearingLabel)));
  }
  // ISSUE #21 §14 — živa navigacijska dejstva (deterministično iz travel
  // state; SAMO dejstva, ki jih GPS dejansko podpira).
  if (
    card.travel?.status === "near_destination" &&
    card.travel.arrivalM != null
  ) {
    parts.push(p.nearArrivalLine(card.travel.arrivalM));
  }
  if (card.travel?.status === "arrived") {
    parts.push(p.arrivedLine());
  }
  if (e.durationMin != null && e.durationMin > 0) {
    parts.push(p.durationLine(p.durationText(e.durationMin)));
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ─── »Kaj je v bližini« (diskoveri okoli GPS — W8 načelo razpršitve) ───────

/** Ena destinacija v bližini (za pripoved + teste). */
export interface NearbyDestination {
  /** Ime (lastno ime — enako v vseh jezikih, kot v datasetu). */
  name: string;
  /** Razdalja v celih km (brez lažne natančnosti desetin v govoru). */
  km: number;
  /** Kardinalna smer od GPS (iste oznake kot DistanceChip — 6 jezikov). */
  bearing: GoStrings;
}

/**
 * Destinacije v bližini GPS položaja — deterministicno iz dataseta
 * (haversine premica, naraščajoče, ≤ radij, ≤ maxCount). Destinacije,
 * ki so geo-ob postankih dneva (≤ excludeNearKm), se IZVZAMEJO: »v
 * bližini« je za ODKRIVANJE, ne ponavljanje dneva (W8 razpršitev).
 *
 * ISKRENO: niz → prazen seznam (klicatelj gumba NE izriše — ni
 * »v bližini«, ne izmišljujemo).
 */
export function nearbyDestinations(
  position: GoPosition,
  excludeNear?: ReadonlyArray<{ lat: number; lng: number }>,
  maxCount: number = GO_AUDIO_LIMITS.nearbyMaxCount,
  radiusKm: number = GO_AUDIO_LIMITS.nearbyRadiusKm
): NearbyDestination[] {
  const exclude = excludeNear ?? [];
  const out: NearbyDestination[] = [];
  for (const d of DESTINATIONS) {
    const km = haversineKm(
      { lat: position.lat, lng: position.lng },
      d.coords
    );
    if (km > radiusKm) continue;
    // Izvzem destinacije »na postanku« (geo-blizu vnosa dneva).
    const atStop = exclude.some(
      (p) => haversineKm(p, d.coords) <= GO_AUDIO_LIMITS.excludeNearKm
    );
    if (atStop) continue;
    out.push({
      name: d.name,
      km: Math.round(km),
      bearing: cardinalLabel(
        bearingDeg(
          { lat: position.lat, lng: position.lng },
          d.coords
        )
      ),
    });
  }
  out.sort((a, b) => a.km - b.km || a.name.localeCompare(b.name));
  return out.slice(0, Math.max(0, maxCount));
}

/** Naslov »kaj je v bližini« + postavitev enega imena (per jezik). */
const NEARBY_PACKS: Record<
  GoLang,
  { intro: string; item: (name: string, km: number, bearing: string) => string }
> = {
  sl: {
    intro: "V tvoji bližini:",
    item: (name, km, bearing) => `${name}, ${slKmPhrase(km)} proti ${bearing}.`,
  },
  en: {
    intro: "Near you:",
    item: (name, km, bearing) =>
      `${name}, ${km === 1 ? "about 1 kilometer" : `about ${km} kilometers`} to the ${bearing}.`,
  },
  it: {
    intro: "Nelle tue vicinanze:",
    item: (name, km, bearing) =>
      `${name}, ${km === 1 ? "circa un chilometro" : `circa ${km} chilometri`} verso ${bearing}.`,
  },
  de: {
    intro: "In deiner Nähe:",
    item: (name, km, bearing) =>
      `${name}, ${km === 1 ? "etwa ein Kilometer" : `etwa ${km} Kilometer`} Richtung ${bearing}.`,
  },
  fr: {
    intro: "À proximité :",
    item: (name, km, bearing) =>
      `${name}, ${km === 1 ? "environ un kilomètre" : `environ ${km} kilomètres`} vers le ${bearing}.`,
  },
  es: {
    intro: "Cerca de ti:",
    item: (name, km, bearing) =>
      `${name}, ${km === 1 ? "un kilómetro aproximadamente" : `unos ${km} kilómetros`} hacia el ${bearing}.`,
  },
};

/**
 * Pripoved »kaj je v bližini« — imena destinacij + razdalja (cela km) +
 * smer. SL razdalje v BESEDAH (slKmPhrase), drugi jeziki s števkami
 * (nativna izgovorjava TTS glasu v tem jeziku).
 *
 * Fail-closed: 0 destinacij → null (gumba NI — iskrena odsotnost).
 */
export function buildNearbyNarration(
  position: GoPosition,
  lang: GoLang,
  excludeNear?: ReadonlyArray<{ lat: number; lng: number }>
): string | null {
  const near = nearbyDestinations(position, excludeNear);
  if (near.length === 0) return null;

  const p = NEARBY_PACKS[lang];
  const parts: string[] = [p.intro];
  for (const n of near) {
    parts.push(p.item(n.name, n.km, GL(lang, n.bearing)));
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
