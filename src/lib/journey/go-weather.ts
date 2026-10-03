// ============================================================================
// TASK 65 — GO MODE VREME: čista plast za „Na poti" (1.65.0)
// ============================================================================
// Iz pogleda Go Mode izpelje CILJ vremena (geo naslednjega postanka) in
// striktno validira odgovor /api/weather. ČISTO — 0 omrežja, 0 db, 0
// localStorage (fetch živi v komponenti) — testirljivo brez brskalnika.
//
// ISKRENOST (isti kanon kot go-view §TASK 64):
//  - Vreme prikažemo SAMO za naslednji postanek Z geo podatkom — postanek
//    brez geo → preprosto NI vremena (ne izmišljujemo „blizu").
//  - Vreme je pri naslednji postanki, NE pri uporabniku — odločitveno
//    relevantno (kaj me čaka TAM), napačna alternativa bi bila laž.
//  - Odgovor API-ja validiramo polje po polju — neveljaven → null →
//    iskrena opomba „ni na voljo" (nikoli praznih števil).
//  - „danes do X° / padavine Y %" SAMO iz daily bloka vira — vir lahko vrne
//    null verjetnost → del izpisa se izpusti (NEZNANO ≠ 0 %).
//  - Vir je izrecno naveden (Open-Meteo) + čas meritve vira (observedAt).
// ============================================================================

import type { GoView } from "./go-view";
import type {
  CurrentWeatherPayload,
  TodayOutlookPayload,
} from "@/lib/weather-utils";

// ---------------------------------------------------------------------------
// CILJ VREMENA (kateri postanek?)
// ---------------------------------------------------------------------------

/** Geo cilj vremena — koordinate naslednjega postanka. */
export interface GoWeatherTarget {
  lat: number;
  lng: number;
}

/**
 * Iz pogleda Go Mode izpelje cilj vremena: geo naslednjega (prvega
 * ne-opravljenega) postanka. Brez naslednjega postanka ali brez geo na
 * njem → null (vreme se NE prikaže — iskrena odsotnost, kot DistanceChip).
 */
export function goWeatherTarget(view: GoView): GoWeatherTarget | null {
  const entry = view.next?.entry;
  if (!entry) return null;
  if (entry.lat == null || entry.lng == null) return null;
  if (
    typeof entry.lat !== "number" ||
    !Number.isFinite(entry.lat) ||
    typeof entry.lng !== "number" ||
    !Number.isFinite(entry.lng)
  ) {
    return null;
  }
  return { lat: entry.lat, lng: entry.lng };
}

// ---------------------------------------------------------------------------
// VALIDACIJA ODGOVORA /api/weather (striktna — fail-closed)
// ---------------------------------------------------------------------------

/** Veljavno vreme za Go Mode (trenutno + neobvezna današnja napoved). */
export type GoWeather = CurrentWeatherPayload & { today?: TodayOutlookPayload };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

/**
 * Striktna validacija JSON odgovora /api/weather?…&daily=1.
 *
 * Trenutni del: vsa števila + nizi morajo biti pravi tipi, sicer null.
 * Današnji del (today): če obstaja in je neveljaven → se IZPUSTI
 * (trenutno vreme ostane — daily je neobvezna dopnitev, ne pogoj).
 */
export function parseGoWeatherResponse(json: unknown): GoWeather | null {
  if (!isRecord(json)) return null;

  const temp = json.temp;
  const humidity = json.humidity;
  const windSpeed = json.windSpeed;
  const condition = json.condition;
  const icon = json.icon;
  if (
    typeof temp !== "number" ||
    !Number.isFinite(temp) ||
    typeof humidity !== "number" ||
    !Number.isFinite(humidity) ||
    typeof windSpeed !== "number" ||
    !Number.isFinite(windSpeed) ||
    typeof condition !== "string" ||
    condition.length === 0 ||
    typeof icon !== "string" ||
    icon.length === 0
  ) {
    return null;
  }

  const out: GoWeather = {
    condition,
    icon,
    temp,
    humidity,
    windSpeed,
  };
  const observedAt = json.observedAt;
  if (typeof observedAt === "string" && observedAt.length > 0) {
    out.observedAt = observedAt;
  }

  const today = json.today;
  if (isRecord(today)) {
    const tMax = today.tempMax;
    const tCond = today.condition;
    const tIcon = today.icon;
    const tPrecip = today.precipitationProbabilityMax;
    if (
      typeof tMax === "number" &&
      Number.isFinite(tMax) &&
      typeof tCond === "string" &&
      tCond.length > 0 &&
      typeof tIcon === "string" &&
      tIcon.length > 0 &&
      (tPrecip === null ||
        (typeof tPrecip === "number" && Number.isFinite(tPrecip)))
    ) {
      out.today = {
        condition: tCond,
        icon: tIcon,
        tempMax: tMax,
        precipitationProbabilityMax:
          typeof tPrecip === "number" && Number.isFinite(tPrecip)
            ? tPrecip
            : null,
      };
    }
    // Neveljaven today → izpuščen (trenutno vreme ostane veljavno).
  }

  return out;
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

/** Čas meritve vira „HH:MM" iz ISO niza (npr. 2026-09-21T08:15 → 08:15). */
export function observedTimeLabel(iso: string): string | null {
  const m = /T(\d{2}:\d{2})/.exec(iso);
  return m ? m[1] : null;
}

// 6-jezično (ISSUE #24 Sklop 8 faza 2 — polni prevodi Go Mode površine).
export const GO_WEATHER_LABELS = {
  /** Naslov traku — izrecno PRI naslednji postanki (ne pri uporabniku). */
  title: {
    sl: "Vreme pri naslednji postanki",
    en: "Weather at your next stop",
    it: "Meteo alla prossima tappa",
    de: "Wetter an deiner nächsten Station",
    fr: "Météo au prochain arrêt",
    es: "Tiempo en tu próxima parada",
  },
  /** Današnja napoved — „danes do 26°, padavine 10 %". */
  today: {
    sl: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `danes do ${t.tempMax} °C · padavine ${t.precipitationProbabilityMax} %`
        : `danes do ${t.tempMax} °C`,
    en: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `today up to ${t.tempMax} °C · rain ${t.precipitationProbabilityMax} %`
        : `today up to ${t.tempMax} °C`,
    it: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `oggi fino a ${t.tempMax} °C · pioggia ${t.precipitationProbabilityMax} %`
        : `oggi fino a ${t.tempMax} °C`,
    de: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `heute bis ${t.tempMax} °C · Regen ${t.precipitationProbabilityMax} %`
        : `heute bis ${t.tempMax} °C`,
    fr: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `aujourd'hui jusqu'à ${t.tempMax} °C · pluie ${t.precipitationProbabilityMax} %`
        : `aujourd'hui jusqu'à ${t.tempMax} °C`,
    es: (t: TodayOutlookPayload) =>
      t.precipitationProbabilityMax != null
        ? `hoy hasta ${t.tempMax} °C · lluvia ${t.precipitationProbabilityMax} %`
        : `hoy hasta ${t.tempMax} °C`,
  },
  /** Meritev vira — „meritev ob 08:15". */
  observed: {
    sl: (hhmm: string) => `meritev ob ${hhmm}`,
    en: (hhmm: string) => `measured at ${hhmm}`,
    it: (hhmm: string) => `rilevato alle ${hhmm}`,
    de: (hhmm: string) => `gemessen um ${hhmm} Uhr`,
    fr: (hhmm: string) => `mesuré à ${hhmm}`,
    es: (hhmm: string) => `medido a las ${hhmm}`,
  },
  /** Vir (label izrecno — isti kanon kot zemljevid/destinacije). */
  source: {
    sl: "vir: Open-Meteo",
    en: "source: Open-Meteo",
    it: "fonte: Open-Meteo",
    de: "Quelle: Open-Meteo",
    fr: "source\u00a0: Open-Meteo",
    es: "fuente: Open-Meteo",
  },
  /** Brez signala / napaka vira — načrt SAM še vedno deluje. */
  unavailable: {
    sl: "Vreme trenutno ni na voljo (morda brez signala) — načrt pa dela naprej.",
    en: "Weather is not available right now (maybe no signal) — the plan keeps working.",
    it: "Il meteo non è disponibile al momento (forse senza segnale) — il piano continua a funzionare.",
    de: "Das Wetter ist gerade nicht verfügbar (vielleicht kein Signal) — der Plan funktioniert weiter.",
    fr: "La météo n'est pas disponible pour le moment (peut-être pas de signal) — le plan continue de fonctionner.",
    es: "El tiempo no está disponible ahora mismo (quizás sin señal) — el plan sigue funcionando.",
  },
} as const;
