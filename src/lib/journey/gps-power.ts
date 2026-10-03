// ============================================================================
// ISSUE #24 SKLOP 10 (1.172.0) — PRILAGODLJIVA GPS NATANČNOST (BATERIJA)
// ============================================================================
// Polarsteps vzorec (<4 % baterije/dan): Go Mode ne potrebuje polne GPS
// natančnosti VES DAN — daleč od naslednjega postanka položajne približke
// (mrežno/wifi pozicioniranje, enableHighAccuracy:false) povsem zadostijo
// za razdaljo/smer; PRED postankom pa se vklopi polna natančnost, da
// GEOFENCE PRIHOD (§7: prag ≤ 150 m + hystereza 75 m + stabilnost 8 s)
// ostane NETAKNJEN.
//
// VARNOSTNA GEOMETRIJA (zakaj 2 km zadostuje — matematična zagotovitev):
//  - prihod je mogoč SAMO znotraj ~225 m od postanka (150 m prag +
//    75 m hystereza); »Približuješ se« pas je 300 m;
//  - na 2 km je pri 50 km/h še ~2,4 min vožnje (avtocesta 130 km/h:
//    ~55 s) — GPS (po mrežnem zagonu) ponavadi ponovno prime v
//    sekundah, kar pušča velik rezervni rob pred geofence;
//  - LAŽNI prihod iz grobe fiksacije je izključen s SAMO mehanizmom
//    stabilnosti (#21 §7): groba fiksacija, ki pokaže ≤ 2 km, TEGA
//    TRENUTKA preklopi način na »high« — prihod mora nato VZDRŽATI 8 s
//    v natančnih fiksacijah znotraj praga; če je bila groba fiksacija
//    zmota, jo natančne takoj prevotijo (stanje pade z »arrived« še
//    preden je stabilen → izpiše se iskreno »Približuješ se«);
//  - KO NI več odprtih postankov (dan zaključen) ničesar ne more
//    priti — varčen način brez izgube.
//
// DETERMINIZEM (kanon #21/#22): 0 omrežja, 0 db, 0 localStorage, 0 ure —
// čista preslikava vhodov (razdalja + ali obstaja naslednji postanek) v
// način. Fail-safe: NEZNANA razdalja → VISOKA natančnost (nikoli ne
// prihranimo baterije na račun neznanja — iskrenost pred varčevanjem).
// ============================================================================

// ISSUE #24 Sklop 8 (1.170.0): 6-jezične oznake (faza 2 — polni prevodi).
import type { GoStrings } from "./go-lang";

// ---------------------------------------------------------------------------
// TIP + KONFIGURACIJA (testno zaklenjena)
// ---------------------------------------------------------------------------

/**
 * Način GPS zajemanja:
 *  - "high"     — enableHighAccuracy: true (polni GPS čip; geofence varnost)
 *  - "balanced" — enableHighAccuracy: false (mrežno/wifi; Polarsteps baterija)
 */
export type GpsPowerMode = "high" | "balanced";

/** Kanon projekta (testno zaklenjen — sprememba zahteva osvežitev testov). */
export const GPS_POWER_CONFIG = {
  /** Znotraj te razdalje (m) do naslednjega postanka → VISOKA natančnost
   *  (geofence prihodi + pas »Približuješ se«). Glej geometrijo zgoraj. */
  highAccuracyWithinM: 2_000,
} as const;

// ---------------------------------------------------------------------------
// RESOLUCIJA (čista)
// ---------------------------------------------------------------------------

/** Vhod resolucije — projekcija obstoječih podatkov (0 novih virov resnice). */
export interface GpsPowerInput {
  /** Ali v dnevu sploh obstaja naslednji odprti postanek (view.next). */
  hasPendingStop: boolean;
  /** Razdalja do naslednjega postanka v METRIH (null = neznana — brez GPS
   *  ali postanek brez veljavnega geo; fail-safe → high). */
  distanceToNextStopM: number | null;
}

/**
 * Izračunaj način GPS zajemanja (ČISTO, deterministično):
 *  1. ni odprtega postanka → »balanced« (približek zadostuje; prihoda ni);
 *  2. razdalja NEZNANA → »high« (fail-safe: neznanje varčuje zadnje);
 *  3. razdalja ≤ highAccuracyWithinM → »high« (geofence ± preklopni rob);
 *  4. sicer → »balanced« (Polarsteps baterija; polna natančnost se vrne
 *     SAMO seboj, takoj ko se približaš — brez uporabnikovega posega).
 */
export function resolveGpsPowerMode(input: GpsPowerInput): GpsPowerMode {
  if (!input.hasPendingStop) return "balanced";
  if (input.distanceToNextStopM == null) return "high"; // fail-safe
  return input.distanceToNextStopM <= GPS_POWER_CONFIG.highAccuracyWithinM
    ? "high"
    : "balanced";
}

// ---------------------------------------------------------------------------
// UI OZNAKE (6-jezične — Sklop 8 kanon; prikaz SAMO dejavnega varčnega načina)
// ---------------------------------------------------------------------------

export const GPS_POWER_LABELS = {
  /** Čip ob statusu GPS (SAMO kadar je varčni način dejaven — iskreno
   *  razkritje, zakaj je natančnost groba daleč stran; polna natančnost
   *  se pokaže prek obstoječega ±X m + razreda natančnosti). */
  balanced: {
    sl: "varčni GPS",
    en: "battery-saving GPS",
    it: "GPS a risparmio",
    de: "stromsparendes GPS",
    fr: "GPS économe",
    es: "GPS ahorro de batería",
  },
  /** Razlaga pod statusom (eden stavek — kaj se samodejno zgodi). */
  balancedHint: {
    sl: "Daleč stran varčimo baterijo — natančen GPS se samodejno vklopi, ko se približaš naslednjemu postanku.",
    en: "Far from your stop we save battery — precise GPS turns on automatically as you approach the next stop.",
    it: "Lontano dalla tappa risparmiamo la batteria — il GPS preciso si attiva automaticamente quando ti avvicini.",
    de: "Fern der Station sparen wir Akku — das präzise GPS schaltet sich automatisch ein, wenn du dich näherst.",
    fr: "Loin de l'arrêt nous économisons la batterie — le GPS précis s'active automatiquement à l'approche.",
    es: "Lejos de la parada ahorramos batería — el GPS preciso se activa automáticamente al acercarte.",
  },
} as const satisfies Record<string, GoStrings>;
