// ============================================================================
// ISSUE #23 — GUIDED PLATFORM EXPERIENCE: kanonični tipi (1.163.0)
// ============================================================================
// "Discover mora biti vodič po lastni platformi." Ta modul definira
// TIPE vodene plasti. Jedro (guide-engine.ts) je ČISTO in deterministično
// (isti vhodi → isti izhod; ura je parameter, NIČ I/O).
//
// ARHITEKTURA (revizija Faze A + issue-23-implementation-plan.md):
// - 0 novih virov resnice — GuidanceInput se izpelje IZKLJUČNO iz
//   kanoničnih bralcev (my-trip, my-trips-storage, go-persist, go-view);
// - stanja so usklajena z #21 (Live Trip Navigator) in #22 (Travel
//   Guardian) — TravelStatus/ConfirmationStatus ostajata ločena;
// - GPS pozicija NI vhod traku (zasebnost §16/§30 — trak ne bere lokacije);
// - UNKNOWN ostaja UNKNOWN (iskrena negotovost — brez izmišljanja).
// ============================================================================

/** Stanja vodene plasti (issue §9, usklajena z #21/#22). */
export type GuidanceState =
  | "NEW_USER" // prva seja, nič zbranega
  | "DISCOVERING" // vračajoči uporabnik, zbirka prazna
  | "TRIP_BUILDING" // zbirka ima 1+ predmetov, načrt še ni shranjen
  | "BOOKING_PENDING" // načrt shranjen, rezervacije odkrite kot odprte (živi kontekst)
  | "TRIP_READY" // načrt shranjen, pripravljen na zagon
  | "TRIP_STARTED" // Go Mode aktiven (dai:go-trip)
  | "NAVIGATING" // živi kontekst: približevanje cilju
  | "ARRIVED" // živi kontekst: prihod potrjen (GPS)
  | "FREE_TIME" // živi kontekst: okno prostega časa (#22)
  | "NEEDS_ATTENTION" // živi kontekst: časovna ogroženost (#22)
  | "BLOCKED" // živi kontekst: kritična zaporeta (#22)
  | "RECOVERY" // živi kontekst: obnova v teku (#22 recovery)
  | "COMPLETED" // zadnji postanek zadnjega dne opravljen (terminalno stanje)
  | "UNKNOWN"; // podatka ni mogoče prebrati — iskrena negotovost (§30)

/** Površina, na kateri se vodena plast izrisuje. */
export type GuidanceSurface = "home" | "hub" | "planner" | "go";

/** Koraki verige ODKRIJ → NAČRTUJ → REZERVIRAJ → NA POTI → ZAKLJUČI. */
export type ChainStep = "discover" | "plan" | "book" | "go" | "finish";

/** Dejanja, ki jih vodena plast ponudi (en primarni na trenutek — §10). */
export type GuidanceActionId =
  | "discover" // → /destinacije
  | "plan" // → /nacrtuj
  | "open_trips" // → /moja-potovanja
  | "book" // → /nacrtuj (booking paneli po dnevih)
  | "start_trip" // → /moja-potovanja (izbira poti + Nadaljuj na poti)
  | "go_mode" // → /na-poti
  | "navigate" // → /na-poti#naslednje
  | "complete_stop" // → /na-poti#naslednje (Opravi)
  | "free_time" // → /na-poti (PROST ČAS razdelek)
  | "recovery" // → /na-poti (Guardian konflikt kartica)
  | "new_trip" // → /nacrtuj (nov načrt po zaključku)
  | "ask_discover"; // odpre klepet z vnaprej pripravljenim vprašanjem (chat:ask)

export interface GuidanceAction {
  id: GuidanceActionId;
  /** Relativna notranja pot (brez locale prefixa — Link iz i18n/navigation). */
  href?: string;
  kind: "primary" | "secondary";
}

/** Dejstva Go Mode (izpeljana iz buildGoView projekcije — NI novo stanje). */
export interface GuidanceGoFacts {
  active: boolean;
  /** Neopravljeni in nepreskočeni postanki AKTIVNEGA dneva. */
  remainingToday: number;
  /** Opravljeni postanki aktivnega dneva. */
  doneToday: number;
  /** Uporabniško preskočeni postanki aktivnega dneva (#21). */
  skippedToday: number;
  /** Vsota postankov kasnejših dni (0 = zadnji dan). */
  laterDayStops: number;
  /** Ime naslednjega postanka (null = ni naslednjega). */
  nextStopTitle: string | null;
  /** Ali ima naslednji postanek veljavne koordinate (fail-closed §4). */
  nextStopGeoKnown: boolean | null;
}

/**
 * Živi Go Mode kontekst — obstaja SAMO znotraj /na-poti seje (v pomnilniku,
 * nikoli persistiran — isti izhodiščni pogoj kot ArrivalContext iz #21).
 * Trak izven /na-poti tega nima → stanja ostanejo iskreno nižja.
 */
export interface GuidanceLiveContext {
  arrivalState?:
    | "approaching"
    | "near_destination"
    | "arrived"
    | "uncertain"
    | null;
  health?: "ON_TRACK" | "NEEDS_ATTENTION" | "BLOCKED" | "UNKNOWN" | null;
  hasConflicts?: boolean;
  freeTimeMinutes?: number | null;
  /** #22 recovery foldout odprt (uporabnik v obnovi). */
  recoveryActive?: boolean;
  /** Ali živi kontekst dejansko vidi ODPRETE rezervacije (za BOOKING_PENDING
   *  — brez tega podatka stanja NE izrečemo, §30/§31). */
  hasOpenBookings?: boolean;
  /** Kvaliteta podatkov (§30) — unknown izreče iskreno negotovost. */
  dataQuality?: "known" | "unknown";
}

/** Vhod vodene plasti — vedno poda klicatelj (determinizem). */
export interface GuidanceInput {
  surface: GuidanceSurface;
  /** Prva seja (visitCount ≤ 1 in brez first-run zastavice). */
  firstSession: boolean;
  /** Vračajoči uporabnik (2+ seje). */
  returningUser: boolean;
  myTripCount: number;
  savedTripsCount: number;
  /** Go Mode dejstva (null = ni aktivnega potovanja). */
  go: GuidanceGoFacts | null;
  /** Živi kontekst (samo /na-poti; drugje null/undefined). */
  live?: GuidanceLiveContext | null;
}

/** Interpolacijska dejstva za sporočila (i18n ICU parametri). */
export interface GuidanceFacts {
  myTripCount: number;
  savedTripsCount: number;
  nextStopTitle: string | null;
  laterDayStops: number;
  doneToday: number;
  skippedToday: number;
  freeTimeMinutes: number | null;
}

/** Izhod vodene plasti — ENA razlaga + ENA primarna akcija (§4/§10). */
export interface Guidance {
  state: GuidanceState;
  /** Trenutni korak verige (5-stopenjski napredek). */
  chain: { current: ChainStep; index: number; total: number };
  facts: GuidanceFacts;
  primaryAction: GuidanceAction | null;
  secondaryActions: GuidanceAction[];
  /** Stabilen ključ sporočila (ns guidance.msg.* — komponenta preslika). */
  messageKey: string;
  /** Ali lahko uporabnik trak zapre (§7/§33; kritično stanje NI dismissible). */
  dismissible: boolean;
  /** Deterministična prioriteta (višja = pomembnejša; §32). */
  priority: number;
}
