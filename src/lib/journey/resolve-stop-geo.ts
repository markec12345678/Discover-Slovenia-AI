// ============================================================================
// ISSUE #21 §4 — GEO DATA CONTRACT: resolucija in klasifikacija (1.161.0)
// ============================================================================
// ENA sama kanonska funkcija za geo resolucijo VSAKEGA postanka, ki sodeluje
// v Live Trip Navigatorju. Vsa mesta, ki berejo koordinate postanka (Go Mode
// kartice, danes shema, navigacijski handoff), gredo čeznjo — nikoli več
// razpršeno preverjanje po modulih (§19: ena resnica o lokaciji objekta).
//
// §4 zahteva za vsak fizični objekt:
//   latitude, longitude, canonical address (kjer je na voljo), source/provider,
//   source ID (kjer obstaja), geo precision/status, validacijo koordinat.
//
// KLASIFIKACIJA PRECISION (iskrena, zasnovana na dokazih — ne na željah):
//  - exact       — SAMO lastna tržnica (provider "own"): koordinate so šle
//                  čez obvezno validacijo forme (TASK 85: trda vrata ±90/±180,
//                  polovični vnos blokiran) IN adapter fail-closed filter —
//                  edini vir, kjer je validacija od konca do konca naša;
//  - approximate — vsi zunajnji viri (osm/fsq/sto/events + komercialni
//                  providerji): koordinate so strukturno veljavne, a niso
//                  per-objekt preverjene. Dokaz iz #20: 0/20 objavljenih
//                  zunanjih zapisov ima popravljene koordinate prek lastne
//                  tržnice — zato iskreno „približno“, ne „preverjeno“;
//  - missing     - koordinat ni (vir jih nikoli ni podal) → navigacijski
//                  cilj NI mogoč (§4 fail-closed);
//  - invalid     - koordinate SO, a ne prenesejo validacije (polovični par,
//                  NaN, zunaj ±90/±180, null-island 0/0) → isto kot missing
//                  + izrecna oznaka, da je PODATEK VIRJA napaken.
//
// FAIL-CLOSED (§4): objekt brez veljavnih koordinat NE postane navigacijski
// cilj, NE dobi arrival statusa in NI predstavljen kot geografsko natančen.
//
// ČISTO: 0 stranskih učinkov, 0 omrežja, 0 localStorage — deterministična
// projekcija vnosa (isti vhod → vedno isti izhod; §22-8).
// ============================================================================

import { hasValidStopGeo } from "./travel-state";

// ---------------------------------------------------------------------------
// TIP — GEO PRECISION (§4: exact / approximate / missing / invalid)
// ---------------------------------------------------------------------------

/** Iskrena klasifikacija zanesljivosti lokacije objekta (§4). */
export type GeoPrecision = "exact" | "approximate" | "missing" | "invalid";

/** Strukturni vhod — združljiv s TripEntry (brez krožnega uvoza). */
export interface StopGeoSource {
  lat?: number;
  lng?: number;
  /** Kanonski naslov (kjer ga vir ima — drugje ga NI, ne izmišljujemo). */
  location?: string;
  /** Kanonski slug ponudnika (TASK 99; undefined = neznan vir). */
  provider?: string;
  /** ID objekta pri viru (kjer obstaja). */
  providerProductId?: string;
}

/** Kanonska geo projekcija postanka (§4 — vedno ista oblika za vse poglede). */
export interface StopGeo {
  /** Veljavne koordinate — SAMO pri precision exact | approximate. */
  lat?: number;
  lng?: number;
  /** Kanonski naslov objekta (prenos iz vnosa, kjer je na voljo). */
  canonicalAddress?: string;
  /** Vir koordinat (provider slug; "unknown" kadar vnos ne nosi ponudnika). */
  source: string;
  /** ID objekta pri viru (kjer obstaja). */
  sourceId?: string;
  precision: GeoPrecision;
}

// ---------------------------------------------------------------------------
// RESOLUCIJA (ena resnica o geo vsakega postanka — §4, §19)
// ---------------------------------------------------------------------------

/** Provider lastne tržnice — edini vir z validacijo od konca do konca. */
const OWN_PROVIDER = "own";

/**
 * Resolvira in klasificira geo podatke ENEGA postanka (čista projekcija).
 *
 * Vrstni red odločitev (deterministično):
 *  1. obe koordinati manjkata              → missing;
 *  2. samo ena izmed njiju                 → invalid (polovični par);
 *  3. koordinate ne prenesejo validacije   → invalid (±90/±180, NaN, 0/0);
 *  4. veljavne + provider "own"            → exact;
 *  5. veljavne + katerikoli drugi/neznan vir → approximate.
 */
export function resolveStopGeo(entry: StopGeoSource): StopGeo {
  const { lat, lng, location, provider, providerProductId } = entry;
  const source = provider ?? "unknown";

  const base: Omit<StopGeo, "precision"> = {
    ...(location != null && location !== "" ? { canonicalAddress: location } : {}),
    source,
    ...(providerProductId != null && providerProductId !== ""
      ? { sourceId: providerProductId }
      : {}),
  };

  // 1 + 2 — odsotnost / polovičnost (razlikujemo: „vir ni podal“ ≠ „podal je
  // napako“ — uporabniška sporočila sta različni, §18 vrstici 7 in 8).
  if (lat == null && lng == null) {
    return { ...base, precision: "missing" };
  }
  if (lat == null || lng == null) {
    return { ...base, precision: "invalid" };
  }

  // 3 — validacija (isti kanon kot arrival: hasValidStopGeo, ±90/±180,
  // končni, ne null-island — ena funkcija resnice, ne dve).
  if (!hasValidStopGeo({ lat, lng })) {
    return { ...base, precision: "invalid" };
  }

  // 4 + 5 — veljavne koordinate: zaupanje glede na vir (dokaz #20:
  // edini per-objekt preverjen vir je lastna tržnica).
  return {
    ...base,
    lat,
    lng,
    precision: source === OWN_PROVIDER ? "exact" : "approximate",
  };
}

/**
 * Ali geo predstavlja uporaben NAVIGACIJSKI cilj (§4 fail-closed: samo
 * veljavne koordinate — missing/invalid nikoli). Uporabljajo ga prikazi,
 * ki odločajo o NAVIGIRAJ / zemljevidu dneva, da je pogoj povsod isti.
 */
export function isNavigableGeo(geo: StopGeo): boolean {
  return geo.precision === "exact" || geo.precision === "approximate";
}

// ---------------------------------------------------------------------------
// UI OZNAKE (6-jezične — ISSUE #24 Sklop 8 faza 2, ISKRENE)
// ---------------------------------------------------------------------------

export const STOP_GEO_LABELS = {
  /** Preverjena lokacija (samo own — ne izmišljujemo „preverjeno“ zunanjim). */
  exact: {
    sl: "Preverjena lokacija",
    en: "Verified location",
    it: "Posizione verificata",
    de: "Überprüfter Standort",
    fr: "Emplacement vérifié",
    es: "Ubicación verificada",
  },
  /** Približna lokacija — vir poimenovan (uporabnik ve, čemur zaupa). */
  approximate: {
    sl: (source: string) => `Približna lokacija (vir: ${source})`,
    en: (source: string) => `Approximate location (source: ${source})`,
    it: (source: string) => `Posizione approssimativa (fonte: ${source})`,
    de: (source: string) => `Ungefährer Standort (Quelle: ${source})`,
    fr: (source: string) => `Emplacement approximatif (source\u00a0: ${source})`,
    es: (source: string) => `Ubicación aproximada (fuente: ${source})`,
  },
  /** Vir lokacije ni podal — navigacija NI na voljo (§18 vrstica 7). */
  missing: {
    sl: "Lokacija ni znana — navigacija ni na voljo",
    en: "Location unknown — navigation unavailable",
    it: "Posizione sconosciuta — navigazione non disponibile",
    de: "Standort unbekannt — Navigation nicht verfügbar",
    fr: "Emplacement inconnu — navigation indisponible",
    es: "Ubicación desconocida — navegación no disponible",
  },
  /** Vir je podal napačne koordinate — iskreno DRUGAČNO od „ni znana“ (§18-8). */
  invalid: {
    sl: "Lokacijski podatki vira so napačni — navigacija ni na voljo",
    en: "Source location data is invalid — navigation unavailable",
    it: "I dati di posizione della fonte non sono validi — navigazione non disponibile",
    de: "Die Standortdaten der Quelle sind ungültig — Navigation nicht verfügbar",
    fr: "Les données d'emplacement de la source sont invalides — navigation indisponible",
    es: "Los datos de ubicación de la fuente no son válidos — navegación no disponible",
  },
} as const;
