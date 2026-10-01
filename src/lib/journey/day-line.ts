// ============================================================================
// TASK 102 — GO MODE DAILY OVERVIEW: SHEMA DNEVA + ZEMLJEVID DNEVA (1.160.0)
// ============================================================================
// Celoten dan na en pogled — odgovor na najmočnejšo prednost vodilnih
// (Wanderlog: vizualni pregled poti na zemljevidu) z ISKRENIM pristopom,
// ki deluje TUDI BREZ OMREŽJA:
//
//  - SHEMA DNEVA (GoDayLineItem): zaporedje postankov dneva po vrstnem redu
//    načrta z živimi stanji (opravljen/preskočen/trenutni/prihodnji) —
//    čista projekcija istih podatkov, ki jih že nosi GoView (0 novih virov
//    resnice). Vizualna hierarhija Issue #21 §10: ZDAJ → NASLEDNJE → …
//  - ZEMLJEVID DNEVA (buildDayMapUrl): IZRECNO ZUNANJI handoff celotnega
//    dneva (Google Maps Directions URL API z vmesnimi točkami) — enak kanon
//    kot go-nav.ts (NAVIGIRAJ): platforma NE izumlja lastne karte; polno
//    zemljevidno izkušnjo prevzame uporabnikova izbrana aplikacija.
//
// ISKRENOST (isti kanon kot go-nav/go-view):
//  - postanek brez veljavnih koordinat V ZEMLJEVID NE GRE (fail-closed
//    po postanku — ostali se nanj ne sesujejo);
//  - URL nosi SAMO validirana števila (0 uporabniškega besedila —
//    injekcija nemogoča);
//  - čez 10 točk URL NE nosi (uradna meja API) — iskreno dokumentirano,
//    ne tiho obrezano;
//  - shema je SHAMATSKA (vrstni red, ne geografija) — to POMO, ker je
//    "kaj je naslednje" vprašanje reda, ne zemljepisa.
// ČISTO: 0 omrežja, 0 db, 0 localStorage — testirljivo.
// ============================================================================

// ---------------------------------------------------------------------------
// SHEMA DNEVA — vrstni red + stanja (projekcija GoView)
// ---------------------------------------------------------------------------

/** Stanje postanka na shemi dneva (deterministično iz GoView podatkov). */
export type DayLineState =
  | "done" // opravljen (uporabnikov klik)
  | "skipped" // uporabniško preskočen
  | "current" // naslednji relevantni cilj (brez GPS prihoda)
  | "arrived" // trenutni + STABILEN GPS prihod (§7)
  | "upcoming"; // prihodnji postanek dneva

/** En postanek na shemi dneva (minimalna projekcija — brez teže TripEntry). */
export interface GoDayLineItem {
  key: string;
  icon: string;
  title: string;
  /** Realen čas začetka (SAMO iz vira — sicer ga ni). */
  timeStart?: string;
  state: DayLineState;
  /** Premica do postanka v m — SAMO za trenutnega, SAMO z živim GPS. */
  distanceM?: number;
  /** Koordinate postanka (SAMO kjer jih vir nosi — za zunanji zemljevid). */
  lat?: number;
  lng?: number;
}

// ---------------------------------------------------------------------------
// ZEMLJEVID DNEVA — zunanji handoff celotnega dneva (Maps URL API)
// ---------------------------------------------------------------------------

/** Uradna meja Maps URL API (destination + največ 9 waypoints = 10 točk). */
export const DAY_MAP_MAX_STOPS = 10;

/** Točka za buildDayMapUrl (strukturno združljiva s TripEntry izrezkom). */
export interface DayMapStop {
  lat?: number;
  lng?: number;
}

/** Veljavna WGS84 koordinata (isti kanon kot go-nav — ±90/±180, končna). */
function isValidCoord(lat: number | undefined, lng: number | undefined): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

/** Koordinata v fiksnem 6-mestnem formatu (0 eksponentov/lokal). */
function fixed6(n: number): string {
  return n.toFixed(6);
}

/**
 * Zunanja povezava na zemljevid CELOGA dneva:
 * `https://www.google.com/maps/dir/?api=1&destination=…&waypoints=a|b|c`
 * (+ `origin` kadar je živi GPS znan — enak pomen kot go-nav buildWebNavUrl).
 *
 * Semantika poti: zadnji postanek = cilj, vsi prejšnji = vmesne točke po
 * vrstnem redu načrta → aplikacija vodi [tvoja lokacija] → 1. → 2. → … →
 * zadnji postanek. Brez GPS izhodišča NE podajamo (aplikacija uporabi svojo
 * trenutno lokacijo — pošteno, ker ne vemo, kje si).
 *
 * Pravila (fail-closed po postanku, ne po celem dnevu):
 *  - postanki brez veljavnih koordinat se IZPUSTJO (ne ustavijo ostalih);
 *  - < 2 veljavna postanka → null (ena točka ni "dan na zemljevidu" —
 *    za eno točko že obstaja NAVIGIRAJ na hero kartici);
 *  - več kot DAY_MAP_MAX_STOPS → prvih 10 po vrstnem redu načrta
 *    (uradna meja URL API; iskerno zabeleženo v labeli);
 *  - v URL gredo SAMO številke — naslovi se NE vstavljajo (injekcijsko
 *    varno, kanon go-nav §ISKRENOST).
 */
export function buildDayMapUrl(
  stops: ReadonlyArray<DayMapStop>,
  origin?: { lat: number; lng: number } | null
): string | null {
  const valid = stops.filter(
    (s): s is { lat: number; lng: number } => isValidCoord(s.lat, s.lng)
  );
  if (valid.length < 2) return null;

  const capped = valid.slice(0, DAY_MAP_MAX_STOPS);
  const [dest, ...rest] = [...capped].reverse(); // zadnji postanek = cilj
  const waypoints = rest.reverse(); // vrstni red načrta (brez zadnjega)

  let url =
    `https://www.google.com/maps/dir/?api=1` +
    `&destination=${fixed6(dest.lat)},${fixed6(dest.lng)}`;
  if (waypoints.length > 0) {
    url +=
      "&waypoints=" +
      waypoints.map((w) => `${fixed6(w.lat)},${fixed6(w.lng)}`).join("|");
  }
  if (origin && isValidCoord(origin.lat, origin.lng)) {
    url += `&origin=${fixed6(origin.lat)},${fixed6(origin.lng)}`;
  }
  return url;
}

// ---------------------------------------------------------------------------
// UI OZNAKE (L vzorec — dvojezične, ISKRENE)
// ---------------------------------------------------------------------------

export const DAY_LINE_LABELS = {
  title: {
    sl: "Zaporedje dneva",
    en: "Order of the day",
  },
  /** Shema je vrstni red, ne geografija — to POMO rečemo. */
  schematicHint: {
    sl: "Shematski prikaz po vrstnem redu načrta — ne zemljevid.",
    en: "Schematic view in plan order — not a map.",
  },
  state: {
    done: { sl: "opravljeno", en: "done" },
    skipped: { sl: "preskočeno", en: "skipped" },
    current: { sl: "trenutni cilj", en: "current target" },
    arrived: { sl: "prišel si", en: "arrived" },
    upcoming: { sl: "prihodnje", en: "upcoming" },
  } satisfies Record<DayLineState, { sl: string; en: string }>,
} as const;

export const DAY_MAP_LABELS = {
  open: {
    sl: (n: number) => `Odpri dan v zemljevidu (${n} postankov)`,
    en: (n: number) => `Open the day in Maps (${n} stops)`,
  },
  /** IZRECNO zunanja aplikacija (kanon go-nav GO_NAV_LABELS.external). */
  external: {
    sl: "Odpre zunanjo zemljevidno aplikacijo (cel dan kot pot z vmesnimi točkami)",
    en: "Opens an external map app (the whole day as a route with stops)",
  },
  /** Iskrena meja URL API (>10 točk obrezano po vrstnem redu načrta). */
  cappedHint: {
    sl: (max: number) =>
      `Zemljevid nosi največ ${max} postankov — prikazani so prvi po vrstnem redu.`,
    en: (max: number) =>
      `The map carries at most ${max} stops — the first ones in plan order are shown.`,
  },
  /** Brez para veljavnih koordinat povezave NI (fail-closed). */
  unavailable: {
    sl: "Dan nima dovolj točk z znanimi koordinatami za prikaz v zemljevidu.",
    en: "The day does not have enough stops with known coordinates to show on a map.",
  },
} as const;
