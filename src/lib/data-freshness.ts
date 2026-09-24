// ============================================================================
// ISSUE #4 §17+§19 — ENOTEN KONCEPT SVEŽINE PODATKOV (VAL 5, sklop A)
// ============================================================================
// LISTNI modul (čisti tipi + čiste funkcije, brez omrežja/baze/LLM) —
// varen za uvoz v CLIENT plasti (stop-insights.tsx, map-pins-client …) in
// SERVER plasti (vir-podatkov/page.tsx, adapterji). Nikoli ne uvaža
// ai-client/prisma/db — vzorec availability-note.ts (Task 47).
//
// §17 (DISCOVERY DATA QUALITY + FRESHNESS): "Za weather, opening hours,
// events, POI, transfer prices, affiliate offers in destination content
// uvedi enoten koncept FRESH / STALE / UNKNOWN / LIVE." Posnetek množice
// (npr. 125.445 FSQ krajev iz snapshot 2025-02-06) NI isto kot živi kraji —
// ta modul je jezik, s katerim UI to odkrito pove.
//
// §19 (SOURCE / PROVENANCE): "source, timestamp, provider, confidence,
// data age in source type LIVE/STATIC/USER/PROVIDER/GENERATED." SourceClass
// nosi §17 razred (en nabor pragov na razred), SourceType pa §19 kanonik
// vira; preslikava med njima je dokumentirana spodaj.
//
// ČISTOST (izrecna): modul NIMA lastne ure — `now` VEDNO injicira klicalnik
// (Date.now() na klicnem mestu, fiksna vrednost v testih). Brez injicirane
// ure NE SODIMO o svežini → "unknown" (negotovost ostane negotovost).
// ============================================================================

// ---------------------------------------------------------------------------
// §17 — SVEŽINA (FRESH / STALE / UNKNOWN / LIVE)
// ---------------------------------------------------------------------------

/**
 * Enotna oznaka svežine (§17):
 *  - "live"    — podatek je bil ŽIVO preverjen ob prikazu (izrecna
 *                atestacija klicalnika: liveChecked, vzorec
 *                availability.checkedAt pri live_* statusih);
 *  - "fresh"   — starost zajema ≤ prag razreda;
 *  - "stale"   — starost zajema > prag razreda (iskreno: zastarelo);
 *  - "unknown" — čas zajema ni znan / ni mogoče določiti (NIKOLI ugibamo).
 */
export type DataFreshness = "fresh" | "stale" | "unknown" | "live";

/**
 * §17 enumeracija podatkovnih razredov — en nabor pragov na razred.
 * Razred določa, KAKO HITRO podatek te vrste zastara (display truth):
 * vreme zastara v urah, urniki v tednih, posnetek POI-jev v mesecih.
 */
export type SourceClass =
  | "weather"
  | "openingHours"
  | "events"
  | "poi"
  | "transferPrices"
  | "affiliateOffers"
  | "destinationContent"
  | "supplyProduct";

// ---------------------------------------------------------------------------
// §19 — VRSTA VIRA (LIVE / STATIC / USER / PROVIDER / GENERATED)
// ---------------------------------------------------------------------------

/**
 * Kanonska vrsta vira (§19). Za vsako pomembno dejstvo mora biti mogoče
 * ugotoviti, IZ KATEREGA VIRA je prišlo — preslikavo iz razreda nosi
 * sourceTypeForSourceClass() spodaj.
 */
export type SourceType = "LIVE" | "STATIC" | "USER" | "PROVIDER" | "GENERATED";

// ---------------------------------------------------------------------------
// FSQ POSNETEK — EN VIR RESNICE (§17)
// ---------------------------------------------------------------------------

/**
 * Datum FSQ posnetka (snapshot), iz katerega je bila množica nameščena.
 * Prej je obstajal SAMO v komentarju dataset.ts + accessNote registra —
 * zdaj ima en vir resnice tukaj (§17: provider + snapshot date sta
 * metapodatka, ne priložnostna komentarja). OB NOVEM INGESTU (bun run
 * fsq:ingest, runbook korak 4 v dataset.ts) se konstanto ročno posodobi.
 */
export const FSQ_SNAPSHOT_DATE = "2025-02-06";

// ---------------------------------------------------------------------------
// PRAGI SVEŽINE PO RAZREDU (§17 — display truth, konzervativno + iskreno)
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Prag "sveže" po razredu (max starost zajema v ms) ali null, kadar razred
 * NIHČE ne more biti "svež" po času (affiliateOffers — brez živih podatkov).
 *
 * Utemeljitve (pošteni prikazi, ne marketing):
 *  - weather           6 h — napoved je kratkotrajna; older snapshot v
 *                          itinererju je že zastarel za prikaz "kot zdaj";
 *  - openingHours     30 d — kurirani statični urniki s uradnih strani
 *                          (5 destinacij, F5.5); sezonske spremembe ~2×/leto;
 *  - events            7 d — dogodki hitro zastarajo (datum prireditve
 *                          preteče); kurirani statični nabor (events-data);
 *  - poi             180 d — statični FSQ posnetek: kraji se spreminjajo
 *                          počasi, a POZOR — posnetek je sam po sebi statičen
 *                          in trenutni posnetek (2025-02-06) je zastarel ŽE OB
 *                          namestitvi; to je iskrena posledica §17;
 *  - transferPrices   90 d — cene transferjev se premikajo sezonsko;
 *                          brez živega API citata je starost neznana;
 *  - affiliateOffers  null — partner ima samo povezavo, MI nimamo
 *                          preverjenih podatkov → VEDNO "unknown" (razen
 *                          izrecne žive preverbe v prihodnosti);
 *  - destinationContent 180 d — uredniški vodnik (git sled sprememb
 *                          slovenia-data.ts, DESTINATIONS_DATA_AS_OF);
 *  - supplyProduct    24 h — lastUpdated je FETCH čas (dokumentirano v
 *                          ProviderProduct: NI čas vira samoga) — po enem
 *                          dnevu pridobljeni produkt čedalje manj "svež".
 */
const FRESHNESS_MAX_AGE_MS: Readonly<Record<SourceClass, number | null>> = {
  weather: 6 * HOUR_MS,
  openingHours: 30 * DAY_MS,
  events: 7 * DAY_MS,
  poi: 180 * DAY_MS,
  transferPrices: 90 * DAY_MS,
  affiliateOffers: null,
  destinationContent: 180 * DAY_MS,
  supplyProduct: 24 * HOUR_MS,
};

/** Toleranca za urini odmik klicalnika (manjši odmik v prihodnost ≠ napaka). */
const FUTURE_TOLERANCE_MS = HOUR_MS;

/**
 * Opcije klasifikacije svežine (§17).
 *
 * - timestamp   — ISO 8601 čas ZAJEMA podatka (snapshot date / importedAt /
 *                 FETCH čas / checkedAt). null/undefined → "unknown";
 * - liveChecked — izrecna atestacija klicalnika, da je bila ŽIVA preverba
 *                 izvedena (vzorec availability.live_* + checkedAt);
 *                 short-circuit → "live" (prioriteta nad starostjo);
 * - now         — injicirana ura KLICALNIKA (modul nima lastne ure!).
 */
export interface FreshnessOpts {
  timestamp?: string | null;
  liveChecked?: boolean;
  now?: number;
}

/**
 * Klasificiraj svežino podatka razreda `sourceClass` (§17).
 *
 * Čistost: `now` VEDNO injicira klicalnik — brez njega NE sodimo (vrnemo
 * "unknown"), saj modul po konstrukciji nima lastne ure. Neveljaven ISO,
 * odsoten čas zajema, razred brez praga (affiliateOffers) ali nelogičen
 * čas v prihodnosti (> 1 uro) → "unknown" (negotovost ostane negotovost).
 */
export function classifyFreshness(
  sourceClass: SourceClass,
  opts: FreshnessOpts = {}
): DataFreshness {
  // 1) Živa preverba — izrecna atestacija (short-circuit, starost nepomembna).
  if (opts.liveChecked === true) return "live";

  // 2) Brez časa zajema → neznano (NE izmišljujemo starosti).
  const ts = opts.timestamp;
  if (ts == null) return "unknown";

  // 3) Brez injicirane ure → neznano (modul nima lastne ure — glej glavo).
  const now = opts.now;
  if (now == null || !Number.isFinite(now)) return "unknown";

  // 4) Neveljaven ISO → neznano.
  const t = Date.parse(String(ts));
  if (!Number.isFinite(t)) return "unknown";

  // 5) Razred brez praga (affiliateOffers) → VEDNO neznano po času.
  const maxAge = FRESHNESS_MAX_AGE_MS[sourceClass];
  if (maxAge == null) return "unknown";

  // 6) Čas očitno v prihodnosti (več kot ura odmika) → neuveljavljen zapis.
  const ageMs = now - t;
  if (ageMs < -FUTURE_TOLERANCE_MS) return "unknown";

  return ageMs <= maxAge ? "fresh" : "stale";
}

// ---------------------------------------------------------------------------
// OZNAKE (SL/EN) — ton usklajen z availability-note.ts (iskrene, male črke)
// ---------------------------------------------------------------------------

/**
 * Človeška oznaka svežine (§17). SL: "sveže"/"zastarelo"/"neznano"/"živo"
 * (tone: "razpoložljivost: živo potrjena" iz availability-note.ts —
 * male črke, brez vzklikov). EN: fresh/stale/unknown/live.
 */
export function freshnessLabel(
  f: DataFreshness,
  locale: "sl" | "en"
): string {
  if (locale === "en") {
    switch (f) {
      case "fresh":
        return "fresh";
      case "stale":
        return "stale";
      case "live":
        return "live";
      default:
        return "unknown";
    }
  }
  switch (f) {
    case "fresh":
      return "sveže";
    case "stale":
      return "zastarelo";
    case "live":
      return "živo";
    default:
      return "neznano";
  }
}

// ---------------------------------------------------------------------------
// §19 DATA AGE — relativna starost (čista, ura injicirana)
// ---------------------------------------------------------------------------

/** Slovenščina: oblika števca (1 → ednina, 2 → dvojina, 3-4 → množina,
 *  0/5+ → množina; 11–14 → vedno množina). Standardno slovensko pravilo. */
function slCount(n: number, one: string, two: string, few: string): string {
  if (n % 100 >= 11 && n % 100 <= 14) return few;
  if (n % 10 === 1) return one;
  if (n % 10 === 2) return two;
  return few;
}

/**
 * Relativna starost podatka (§19 data age) — "pred 3 minutami" / "3 days
 * ago". Čista funkcija: `now` VEDNO injicira klicalnik.
 *
 *  - < 1 min   → "pravkar" / "just now";
 *  - minute/ure/dnevi → slovensko pravilno (ednina/dvojina/množina);
 *  - > 30 dni  → SAMO datum YYYY-MM-DD (jezikovno nevtralen ISO — natančna
 *               starost tedaj ni pomembna, pomemben je dan zajema);
 *  - null/undefined/neveljaven ISO/prihodnost > 1 h → null (NE ugibamo).
 */
export function formatDataAge(
  timestampIso: string | undefined | null,
  now: number,
  locale: "sl" | "en"
): string | null {
  if (timestampIso == null) return null;
  const t = Date.parse(String(timestampIso));
  if (!Number.isFinite(t)) return null;
  if (!Number.isFinite(now)) return null;

  const ageMs = now - t;
  // Čas očitno v prihodnosti (> 1 uro odmika) → neuveljavljen zapis → null.
  if (ageMs < -FUTURE_TOLERANCE_MS) return null;

  const sec = Math.max(0, Math.floor(ageMs / 1000));
  if (sec < 60) return locale === "en" ? "just now" : "pravkar";

  const min = Math.floor(sec / 60);
  if (min < 60) {
    return locale === "en"
      ? `${min} minute${min === 1 ? "" : "s"} ago`
      : `pred ${min} ${slCount(min, "minuto", "minutama", "minutami")}`;
  }

  const hours = Math.floor(min / 60);
  if (hours < 24) {
    return locale === "en"
      ? `${hours} hour${hours === 1 ? "" : "s"} ago`
      : `pred ${hours} ${slCount(hours, "uro", "urama", "urami")}`;
  }

  const days = Math.floor(hours / 24);
  if (days <= 30) {
    return locale === "en"
      ? `${days} day${days === 1 ? "" : "s"} ago`
      : `pred ${days} ${slCount(days, "dnevom", "dnevoma", "dnevi")}`;
  }

  // > 30 dni: samo datum zajema (ISO YYYY-MM-DD, jezikovno nevtralen).
  return new Date(t).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// §19 — PRESLIKAVA RAZRED → VRSTA VIRA (dokumentirana, majhna)
// ---------------------------------------------------------------------------

/**
 * Opcije preslikave §19.
 *
 * - liveChecked — živa preverba je bila izvedena (→ LIVE);
 * - estimated   — SAMO za weather: sezonska/AI ocena (weatherEstimated ===
 *                 true v Itinerary) → GENERATED (§19: za AI odgovore mora
 *                 biti mogoče ugotoviti, da je dejstvo generirano).
 */
export interface SourceTypeOpts {
  liveChecked?: boolean;
  estimated?: boolean;
}

/**
 * Dokumentirana preslikava §17 razreda v §19 vrsto vira.
 *
 *  - poi               → STATIC   (FSQ posnetek, Apache-2.0; OSM Overpass
 *                                  poizvedba je živa → liveChecked: LIVE)
 *  - weather           → LIVE SAMO ob liveChecked (živi Open-Meteo klic s
 *                        predpomnilnikom 10–15 min); shranjen posnetek v
 *                        itinererju → STATIC; sezonska/AI ocena
 *                        (estimated) → GENERATED
 *  - openingHours      → STATIC   (kurirano z uradnih strani, F5.5)
 *  - events            → STATIC   (kurirani statični nabor, events-data)
 *  - transferPrices    → STATIC   (statični inventar; živi citat bi bil
 *                                  liveChecked: LIVE — ga ni)
 *  - affiliateOffers   → PROVIDER (partnerjeva povezava — MI nimamo
 *                        preverjenih podatkov, zato je svežina neznana)
 *  - destinationContent→ STATIC   (uredniški vodnik, git sled)
 *  - supplyProduct     → PROVIDER (iz ponudnikovega API-ja/množice;
 *                        adapter-specifična statičnost (fsq) izrazi klicalnik)
 *  - "userContent"     → USER     (§19: uporabnikovi zapisi — TripExpense /
 *                        TripDocument / uvožene rezervacije; NI §17 razred
 *                        odkrivanja, zato je izrecen dokumentiran parameter)
 *
 * Uporabniški zapisi so USER TUDI ob liveChecked — uporabnikova izjava NI
 * živa preverba ponudnika (vzorec "dokument je atestacija", VAL 3 §4).
 */
export function sourceTypeForSourceClass(
  sourceClass: SourceClass | "userContent",
  opts: SourceTypeOpts = {}
): SourceType {
  // Uporabniški zapisi: USER vedno (izjava uporabnika ni živa preverba).
  if (sourceClass === "userContent") return "USER";

  // Živa preverba → LIVE (izrecna atestacija klicalnika).
  if (opts.liveChecked === true) return "LIVE";

  switch (sourceClass) {
    case "weather":
      // Sezonska/AI ocena vremena → GENERATED (§19 sledljivost AI dejstev).
      return opts.estimated === true ? "GENERATED" : "STATIC";
    case "openingHours":
    case "events":
    case "poi":
    case "transferPrices":
    case "destinationContent":
      return "STATIC";
    case "affiliateOffers":
    case "supplyProduct":
      return "PROVIDER";
    default:
      // Tehnično nedosegljivo (izčrpna switch) — a fail-safe vrača PROVIDER
      // ne bi bila iskrena; TypeScript exhaustiveness prepreči ta primer.
      throw new Error(`Neznan SourceClass: ${String(sourceClass)}`);
  }
}
