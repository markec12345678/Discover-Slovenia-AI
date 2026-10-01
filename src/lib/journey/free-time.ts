// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: SMART FREE-TIME ENGINE (čista plast, §9–§11)
// ============================================================================
// Prepoznavanje PROSTEGA ČASOVNEGA OKNA in varnega izbire kandidatov
// »Kaj lahko narediš v bližini?« (§30.F uporabniška predstavitev).
//
// OKNO (§9) obstaja SAMO, kadar ga podatki podpirajo:
//  - vezni dogodek = NASLEDNJI postanek s FIKSNIM terminom (time.start v
//    prihodnosti) — brez termina ni meje, zato okna NI (ne izmišljujemo);
//  - okno = termin − zdaj − (ocena vožnje do termina) − VARNOSTNA REZERVA.
//
// VARNOSTNA PRAVILO (§10 — nikoli ne porabimo celotne luknje):
//  safety = base (15 min) + 10 % surovega okna — KONFIGURABILNO, testno
//  zaklenjeno. Neznan route time (brez GPS) → okna NI (fail-closed, ne
//  "verjamemo, da bo šlo"). Slaba natančnost → kakovost pada na STALE.
//
// KANDIDATI (§9/§11 — majhno število relevantnih):
//  vsak kandidat mora po ZNANIH podatkih ugosti celotno zanko:
//    vožnja do kandidata + obisk + vožnja od kandidata do NASLEDNJEGA
//  termina ≤ okno. Kdor te zanke ne zmore, NI predlagan (issue §9:
//  "Ne predlagaj aktivnosti, zaradi katere bi uporabnik zamudil naslednjo
//  rezervacijo"). Odpiralni časi: preverjeni ob prihodu, KJER jih vir
//  podaja (parser openingStatusAt); neznane ure pošteno nosijo UNKNOWN.
//
// DETERMINIZEM: 0 omrežja, 0 db, 0 localStorage; `now` je parameter.
// ============================================================================

import { heuristicLeg } from "@/lib/road-routing";
import { haversineKm } from "@/lib/geo-corridor";
import { openingStatusAt, type OpeningMoment } from "@/lib/opening-hours";
import type { ProductType } from "@/lib/supply/types";
import type { GoView } from "./go-view";
import { hhmmToMinutes, type DataQuality } from "./time-reserve";

// ---------------------------------------------------------------------------
// TIP — OKNO
// ---------------------------------------------------------------------------

/** Kje v dnevu je prosto okno nastalo. */
export type FreeTimeKind = "BEFORE_DRIVE" | "AT_STOP_EARLY";

export interface FreeTimeWindow {
  /** Koliko minut lahko uporabnik DEJANSKO izkoristi (po varnostni rezervi). */
  minutes: number;
  /** Vezni termin "HH:MM" (naslednja rezervacija). */
  endsAtHhmm: string;
  /** Koliko minut smo pridržali (transparentnost — §10). */
  safetyMin: number;
  /** Surovo okno (termin − zdaj − vožnja) pred rezervo. */
  rawMin: number;
  kind: FreeTimeKind;
  quality: DataQuality;
}

// ---------------------------------------------------------------------------
// TIP — KANDIDATI
// ---------------------------------------------------------------------------

/** Uporabniške kategorije (§30.F: Znamenitosti/Hrana/Kava/Sprehod). */
export type GuardianNearbyCategory = "sight" | "food" | "drink" | "walk";

export interface NearbyCandidate {
  key: string;
  title: string;
  lat: number;
  lng: number;
  category: GuardianNearbyCategory;
  /** Odpiralni časi vira (raw — kjer jih vir podaja). */
  openingHours?: string;
  /** Čas obiska iz vira (kjer obstaja) — sicer privzetek kategorije. */
  durationMin?: number;
}

/** Ocena ustreznosti kandidata (vodeni izpis + testi). */
export interface NearbyFit {
  candidate: NearbyCandidate;
  /** Celotna zanka v minutah: vožnja tam + obisk + vožnja do termina. */
  loopMin: number;
  driveThereMin: number;
  visitMin: number;
  driveBackMin: number;
  distanceKm: number;
  /** Status ob prihodu (SAMO iz vira; neznano iskreno). */
  opening: "OPEN" | "CLOSED" | "UNKNOWN";
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA (konfigurabilna — testno zaklenjena, §10)
// ---------------------------------------------------------------------------

export interface FreeTimeConfig {
  /** Najmanjše izkoristljivo okno (pod tem predlogov NI — prekratko). */
  minUsableMin: number;
  /** Osnovna varnostna rezerva (min). */
  safetyBaseMin: number;
  /** Delež surovega okna, ki se pridrži (0.1 = 10 %). */
  safetyRatio: number;
  /** Največ prikazanih kandidatov (§11: majhno število). */
  maxCandidates: number;
  /** Radij iskanja kandidatov (km premice — bbox za /api/map/pins). */
  searchRadiusKm: number;
  /** Privzeto trajanje obiska po kategoriji (min — kjer vir ne ponuja). */
  defaultVisitMin: Record<GuardianNearbyCategory, number>;
}

/** Kanon projekta (testno zaklenjen — sprememba zahteva osvežitev testov). */
export const DEFAULT_FREE_TIME_CONFIG: FreeTimeConfig = {
  minUsableMin: 30,
  safetyBaseMin: 15,
  safetyRatio: 0.1,
  maxCandidates: 4,
  searchRadiusKm: 5,
  defaultVisitMin: { sight: 45, food: 60, drink: 25, walk: 30 },
};

/** Preslikava kanonskih ProductType → uporabniške kategorije (§30.F). */
export const NEARBY_CATEGORY_OF: Partial<Record<ProductType, GuardianNearbyCategory>> = {
  attraction: "sight",
  museum: "sight",
  religious: "sight",
  viewpoint: "sight",
  restaurant: "food",
  shop: "drink",
  natural: "walk",
};

/** Kategorije za /api/map/pins `cats` parameter (po uporabški izbiri). */
export const CATEGORY_TO_PRODUCT_TYPES: Record<
  GuardianNearbyCategory,
  ProductType[]
> = {
  sight: ["attraction", "museum", "religious", "viewpoint"],
  food: ["restaurant"],
  drink: ["shop"],
  walk: ["natural", "viewpoint"],
};

export const NEARBY_CATEGORY_LABELS: Record<
  GuardianNearbyCategory,
  { sl: string; en: string }
> = {
  sight: { sl: "Znamenitosti", en: "Sights" },
  food: { sl: "Hrana", en: "Food" },
  drink: { sl: "Kava", en: "Coffee" },
  walk: { sl: "Sprehod", en: "Walk" },
} as const;

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface FreeTimeInput {
  view: GoView;
  now: Date;
  /** Živi GPS (brez njega vožnje ne poznamo → okna NI — fail-closed). */
  position: { lat: number; lng: number; accuracyM?: number; timestamp: number } | null;
  /** Ali je uporabnik ŽE na lokaciji naslednjega postanka (#21 arrival). */
  arrived?: boolean;
  config?: FreeTimeConfig;
}

// ---------------------------------------------------------------------------
// OKNO (§9 + §10)
// ---------------------------------------------------------------------------

/**
 * Prepozna prostotno okno pred naslednjo rezervacijo (ČISTO).
 *
 * Pravila:
 *  1. naslednji postanek ima FIKSEN termin v PRIHODNOSTI (drugače ni meje);
 *  2. AT_STOP_EARLY (prispel preuranjeno): okno = termin − zdaj − rezerva;
 *  3. BEFORE_DRIVE: okno = termin − zdaj − ocena vožnje do termina − rezerva
 *     (ocena = hevristika premica ×1,3 / 55 km/h — kanon Go Mode);
 *  4. brez GPS (in nisi prisoten) → okna NI (vožnje ne poznamo — §10);
 *  5. okno − rezerva ≥ minUsableMin, sicer okna NI (prekratko za karkoli);
 *  6. rezerva = safetyBaseMin + safetyRatio × surovo okno (NIKOLI 0).
 */
export function detectFreeTimeWindow(input: FreeTimeInput): FreeTimeWindow | null {
  const cfg = input.config ?? DEFAULT_FREE_TIME_CONFIG;
  const next = input.view.next;
  if (next == null) return null;

  const startHhmm = next.entry.time?.start;
  if (startHhmm == null) return null; // flexible naslednji — meje ni
  const startMin = hhmmToMinutes(startHhmm);
  if (startMin == null) return null;

  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  const untilStartMin = startMin - nowMin;
  if (untilStartMin <= 0) return null; // termin teče/je pretekel — ni okna

  let rawMin: number;
  let kind: FreeTimeKind;
  let quality: DataQuality;

  if (input.arrived) {
    // Prispel sem zgodaj — okno na lokaciji (vožnje ni).
    rawMin = untilStartMin;
    kind = "AT_STOP_EARLY";
    quality = "VERIFIED"; // termin + ura sta dejstvi
  } else {
    if (input.position == null) return null; // vožnje ne poznamo (§10)
    if (next.geo.lat == null || next.geo.lng == null) return null;
    const leg = heuristicLeg(
      { lat: input.position.lat, lng: input.position.lng },
      { lat: next.geo.lat, lng: next.geo.lng }
    );
    rawMin = untilStartMin - leg.min;
    kind = "BEFORE_DRIVE";
    quality = "ESTIMATED"; // hevristika — nikoli VERIFIED
    if (rawMin <= 0) return null; // do termina se komaj da — ni prostega časa
  }

  const safetyMin = Math.round(cfg.safetyBaseMin + cfg.safetyRatio * rawMin);
  const usable = rawMin - safetyMin;
  if (usable < cfg.minUsableMin) return null; // prekratko za smiseln predlog

  return { minutes: usable, endsAtHhmm: startHhmm, safetyMin, rawMin, kind, quality };
}

// ---------------------------------------------------------------------------
// FILTRIRANJE KANDIDATOV (§9 + §11)
// ---------------------------------------------------------------------------

export interface NearbyFilterInput {
  candidates: readonly NearbyCandidate[];
  position: { lat: number; lng: number };
  window: FreeTimeWindow;
  now: Date;
  /** Geo točke današnjih postankov (W8: bližina je za ODKRIVANJE). */
  exclude: ReadonlyArray<{ lat: number; lng: number }>;
  /** Geo NASLEDNJEGA termina (za povratno nogo zanke). */
  nextStop: { lat: number; lng: number } | null;
  /** Filter uporabnika (null = vse kategorije). */
  category?: GuardianNearbyCategory | null;
  config?: FreeTimeConfig;
}

/**
 * Zavrti kandidate skozi varnostna vrata (ČISTO):
 *  1. kategorija (če je uporabnik izbral) + razdalja ≤ searchRadiusKm;
 *  2. izvzem današnje postanke (~100 m okrog vsakega — W8 načelo);
 *  3. zanka = vožnja tam + obisk + vožnja do termina ≤ okno (§9 prepoved
 *     ogrožanja rezervacije — MATHEMATIČNO zagotovljeno z zanko);
 *  4. odpiralni čas ob prihodu (kjer vir podaja): CLOSED → izpade;
 *  5. uredi po zanki, vzemi maxCandidates.
 *
 * Vrne DOSEGLJIV KANDIDATOV (prenešeni vsem preskusom) + odprte ure.
 */
export function filterNearbyCandidates(input: NearbyFilterInput): NearbyFit[] {
  const cfg = input.config ?? DEFAULT_FREE_TIME_CONFIG;
  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  const fits: NearbyFit[] = [];

  for (const c of input.candidates) {
    if (input.category != null && c.category !== input.category) continue;

    const distanceKm = haversineKm(
      input.position.lat,
      input.position.lng,
      c.lat,
      c.lng
    );
    if (distanceKm > cfg.searchRadiusKm) continue;

    // W8: današnji postanki se NE ponujajo kot "odkritje".
    const isTodayStop = input.exclude.some(
      (p) => haversineKm(p.lat, p.lng, c.lat, c.lng) <= 0.1
    );
    if (isTodayStop) continue;

    const driveThereMin = heuristicLeg(input.position, { lat: c.lat, lng: c.lng }).min;
    const visitMin = c.durationMin ?? cfg.defaultVisitMin[c.category];
    // Povratna noga do NASLEDNJEGA termina (AT_STOP_EARLY: tam že sem → 0).
    const driveBackMin =
      input.window.kind === "AT_STOP_EARLY" || input.nextStop == null
        ? 0
        : heuristicLeg({ lat: c.lat, lng: c.lng }, input.nextStop).min;
    const loopMin = driveThereMin + visitMin + driveBackMin;
    if (loopMin > input.window.minutes) continue; // §9: zamudil bi — NI predlog

    // Odpiralni časi ob PRIHODU (kjer vir podaja; drugje UNKNOWN — pošteno).
    let opening: NearbyFit["opening"] = "UNKNOWN";
    if (c.openingHours != null && c.openingHours.trim() !== "") {
      const arriveAbs = nowMin + driveThereMin;
      const moment: OpeningMoment = {
        weekday: (input.now.getDay() + Math.floor(arriveAbs / 1440)) % 7,
        minutes: arriveAbs % 1440,
      };
      const status = openingStatusAt(c.openingHours, moment);
      if (status.status === "CLOSED") continue; // prišel bi pred zaprtimi vrati
      opening = status.status === "OPEN" ? "OPEN" : "UNKNOWN";
    }

    fits.push({
      candidate: c,
      loopMin,
      driveThereMin,
      visitMin,
      driveBackMin,
      distanceKm: Math.round(distanceKm * 10) / 10,
      opening,
    });
  }

  return fits.sort((a, b) => a.loopMin - b.loopMin).slice(0, cfg.maxCandidates);
}

// ---------------------------------------------------------------------------
// BBOX (za /api/map/pins — čista pomožna)
// ---------------------------------------------------------------------------

/** bbox "south,west,north,east" okoli pozicije (radij v km — približno). */
export function nearbyBbox(
  position: { lat: number; lng: number },
  radiusKm: number
): string {
  const dLat = radiusKm / 111;
  const cos = Math.max(0.2, Math.cos((position.lat * Math.PI) / 180));
  const dLng = radiusKm / (111 * cos);
  const s = position.lat - dLat;
  const w = position.lng - dLng;
  const n = position.lat + dLat;
  const e = position.lng + dLng;
  return `${s.toFixed(4)},${w.toFixed(4)},${n.toFixed(4)},${e.toFixed(4)}`;
}

// ---------------------------------------------------------------------------
// UI OZNAKE (§30.F uporabniška imena)
// ---------------------------------------------------------------------------

export const FREE_TIME_LABELS = {
  title: { sl: "PROST ČAS", en: "FREE TIME" },
  headline: {
    sl: (min: number) => `Imaš približno ${min} min prostega časa`,
    en: (min: number) => `You have about ${min} minutes to spare`,
  },
  question: { sl: "Kaj lahko narediš v bližini?", en: "What can you do nearby?" },
  until: {
    sl: (hhmm: string) => `do naslednje rezervacije ob ${hhmm}`,
    en: (hhmm: string) => `until the next booking at ${hhmm}`,
  },
  safety: {
    sl: (min: number) =>
      `Prihranili smo ${min} min varnostne rezerve — predlogi ti ne bodo povzročili zamude.`,
    en: (min: number) =>
      `We kept a ${min} min safety reserve — none of these suggestions will make you late.`,
  },
  fitLine: {
    sl: (o: { drive: number; visit: number; back: number }) =>
      `${o.drive} min tja · ${o.visit} min obiska${o.back > 0 ? ` · ${o.back} min do termina` : ""}`,
    en: (o: { drive: number; visit: number; back: number }) =>
      `${o.drive} min there · ${o.visit} min visit${o.back > 0 ? ` · ${o.back} min to the booking` : ""}`,
  },
  openNow: { sl: "odprto ob prihodu", en: "open on arrival" },
  closedUnknown: {
    sl: "odpiralni čas neznan — preveri pred obiskom",
    en: "opening hours unknown — check before visiting",
  },
  empty: {
    sl: "V bližini ni ničesar, kar bi se še spravilo v tvoje okno.",
    en: "Nothing nearby fits your window in time.",
  },
  unavailable: {
    sl: "Predlogi v bližini potrebujejo povezavo — načrt in časovnica delujejo tudi brez nje.",
    en: "Nearby suggestions need a connection — the plan and timeline work without it too.",
  },
} as const;
