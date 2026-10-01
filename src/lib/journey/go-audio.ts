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

export const GO_AUDIO_LABELS: Record<"sl" | "en", GoAudioLabels> = {
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
};

// ─── Gradnja pripovedi ─────────────────────────────────────────────────────

/** Prva črka velika (»ob desetih« → »Ob desetih.«). */
function cap(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Pripoved ENEGA postanka Go Mode — IZKLJUČNO iz dejstev kartice.
 *
 * Struktura: „Postanek: {naslov}. Pri ponudniku: X. Ob {termin}. Lokacija:
 * X. {km} proti {smer}, premica. Priporočeno trajanje: X."
 * Manjkajoče dejstvo → manjka poved (NE izmišljujemo termina/lokacije/
 * razdalje). Prazn naslov → null (fail-closed — gumba ni, kanon TASK 89).
 *
 * timeNote se NE pripoveduje (meta-razlaga, zakaj časa ni — zaslon jo
 * pokaže, govor so samo dejstva; isti kanon kot MY TRIP TASK 91).
 */
export function buildStopNarration(
  card: GoEntryCard,
  lang: "sl" | "en"
): string | null {
  const e = card.entry;
  const title = (e.title ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxTitleChars);
  if (title === "") return null;

  const parts: string[] = [];

  if (lang === "sl") {
    parts.push(`Postanek: ${title}.`);
    const provider = (e.providerLabel?.sl ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxProviderChars);
    if (provider !== "") parts.push(`Pri ponudniku: ${provider}.`);
    if (e.time?.start) {
      const t = speechTime(e.time.start, "sl");
      if (t !== "") parts.push(`${cap(t)}.`);
    }
    const location = (e.location ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxLocationChars);
    if (location !== "") parts.push(`Lokacija: ${location}.`);
    if (card.distanceKm != null && card.bearingLabel) {
      const km = Math.round(card.distanceKm);
      parts.push(
        `${cap(slKmPhrase(km))} proti ${card.bearingLabel.sl}, premica.`
      );
    }
    // ISSUE #21 §14 — živa navigacijska dejstva (deterministično iz travel
    // state; SAMO dejstva, ki jih GPS dejansko podpira).
    if (
      card.travel?.status === "near_destination" &&
      card.travel.arrivalM != null
    ) {
      parts.push(`Kmalu boš tam — približno ${card.travel.arrivalM} metrov.`);
    }
    if (card.travel?.status === "arrived") {
      parts.push("Prišel si na lokacijo.");
    }
    if (e.durationMin != null && e.durationMin > 0) {
      parts.push(`Priporočeno trajanje: ${slDurationPhrase(e.durationMin)}.`);
    }
  } else {
    parts.push(`Stop: ${title}.`);
    const provider = (e.providerLabel?.en ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxProviderChars);
    if (provider !== "") parts.push(`Provider: ${provider}.`);
    if (e.time?.start) {
      const t = speechTime(e.time.start, "en");
      if (t !== "") parts.push(`${cap(t)}.`);
    }
    const location = (e.location ?? "").trim().slice(0, GO_AUDIO_LIMITS.maxLocationChars);
    if (location !== "") parts.push(`Location: ${location}.`);
    if (card.distanceKm != null && card.bearingLabel) {
      const km = Math.round(card.distanceKm);
      const kmText = km === 1 ? "about 1 kilometer" : `about ${km} kilometers`;
      parts.push(`${cap(kmText)} toward the ${card.bearingLabel.en}, as the crow flies.`);
    }
    // ISSUE #21 §14 — arrival facts (deterministic, from travel state only).
    if (
      card.travel?.status === "near_destination" &&
      card.travel.arrivalM != null
    ) {
      parts.push(`Almost there — about ${card.travel.arrivalM} meters.`);
    }
    if (card.travel?.status === "arrived") {
      parts.push("You have arrived at the location.");
    }
    if (e.durationMin != null && e.durationMin > 0) {
      if (e.durationMin >= 60 && e.durationMin % 60 === 0) {
        const h = e.durationMin / 60;
        const hText = h === 1 ? "about 1 hour" : `about ${h} hours`;
        parts.push(`Recommended duration: ${hText}.`);
      } else {
        const m = e.durationMin;
        const mText = m === 1 ? "about 1 minute" : `about ${m} minutes`;
        parts.push(`Recommended duration: ${mText}.`);
      }
    }
  }

  return parts.join(" ").replace(/\s+/g, " ").trim();
}

// ─── »Kaj je v bližini« (diskoveri okoli GPS — W8 načelo razpršitve) ───────

/** Ena destinacija v bližini (za pripoved + teste). */
export interface NearbyDestination {
  /** Ime (lastno ime — enako v obeh jezikih, kot v datasetu). */
  name: string;
  /** Razdalja v celih km (brez lažne natančnosti desetin v govoru). */
  km: number;
  /** Kardinalna smer od GPS (iste oznake kot DistanceChip). */
  bearing: { sl: string; en: string };
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

/**
 * Pripoved »kaj je v bližini« — imena destinacij + razdalja (cela km) +
 * smer. SL razdalje v BESEDAH (slKmPhrase), EN s števkami (nativno).
 *
 * Fail-closed: 0 destinacij → null (gumba NI — iskrena odsotnost).
 */
export function buildNearbyNarration(
  position: GoPosition,
  lang: "sl" | "en",
  excludeNear?: ReadonlyArray<{ lat: number; lng: number }>
): string | null {
  const near = nearbyDestinations(position, excludeNear);
  if (near.length === 0) return null;

  const parts: string[] = [];
  if (lang === "sl") {
    parts.push("V tvoji bližini:");
    for (const n of near) {
      parts.push(`${n.name}, ${slKmPhrase(n.km)} proti ${n.bearing.sl}.`);
    }
  } else {
    parts.push("Near you:");
    for (const n of near) {
      const kmText =
        n.km === 1 ? "about 1 kilometer" : `about ${n.km} kilometers`;
      parts.push(`${n.name}, ${kmText} to the ${n.bearing.en}.`);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}
