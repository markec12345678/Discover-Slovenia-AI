// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: CONFLICT DETECTION (čista plast, §6)
// ============================================================================
// Deterministično zaznajanje ČASOVNIH/IZVEDBENIH konfliktov aktivnega dne.
// Vsak konflikt nosi strukturo, ki jo zahteva issue §6:
//   FACTS (dejstva) → REASON (razlog) → IMPACT (posledica) → ACTIONS (ukrepi).
//
// VHODI SO DEJSTVA (§3): GPS + natančnost, ura, vrstni red postankov,
// časi terminov (time.start — SAMO realni viri), trajanja postankov, kjer so
// definirana (durationMin), noge tras (legFromPrev: OSRM/hevristika),
// odpiralni časi (parser openingStatusAt — ISTA resnica kot UI žeton),
// rezervacijski statusi (bookingRows — SAMO za prikaz, rezervacij NE pišemo).
//
// ISKRENOST:
//  - konflikt izračunamo SAMO, če podatki dejansko podpirajo sklep
//    (npr. prekrivanje terminov brez trajanja dokaza NE trdi);
//  - CANCELLED rezervacija vpliva SAMO na prikaz/predlog akcije — nikoli
//    ne pišemo rezervacijskih statusov (invarianta #21 §3);
//  - odpovedi/zunanje povezave ne sledimo samodejno (brez provider flowa).
//
// DETERMINIZEM: 0 omrežja, 0 db, 0 localStorage; `now` je parameter.
// ============================================================================

import { openingStatusAt, type OpeningMoment } from "@/lib/opening-hours";
import type { GoEntryCard, GoView } from "./go-view";
import { hhmmToMinutes, minutesToHhmm, type TimeReserve } from "./time-reserve";

// ---------------------------------------------------------------------------
// TIPI
// ---------------------------------------------------------------------------

/** Akcija, ki jo Guardian predlaga uporabniku (izvaja jih Go Mode UX). */
export type GuardianActionId =
  | "NAVIGATE" // odpri zunanjo navigacijo (goNavLinks — #21)
  | "SKIP" // preskoči postanek (toggleSkip — obstoječe)
  | "ADJUST_PLAN" // prilagodi mojo pot (nazaj na načrt)
  | "VIEW_BOOKING" // odpri rezervacijo pri ponudniku
  | "COMPLETE"; // opravi postanek (toggleDone — obstoječe)

/** Vrste konfliktov (§6 — vse obvezne + prikazna CANCELLED). */
export type GuardianConflictKind =
  | "AT_RISK_BOOKING" // predviden prihod ZA terminom (§6-1)
  | "TIGHT_BOOKING" // ozek, a izvedljiv prihod (rezerva 0–15 min)
  | "OVERLAP_FIXED" // prekrivanje dveh fiksnih terminov (§6-2)
  | "TOO_TIGHT_LEG" // prekratek čas med postanki glede na traso (§6-3)
  | "STARTED_BOOKING" // termin je že začel teči (§6-4)
  | "PAST_BOOKING" // termin je časovno ogrožen — močno pretekel (§6-5)
  | "MISSING_GEO" // manjkajoča lokacija pri točki (§6-6)
  | "UNKNOWN_ROUTE" // neznan route duration (§6-7)
  | "CLOSED_ON_ARRIVAL" // odpiralni čas v konfliktu s prihodom (§6-8)
  | "CANCELLED_BOOKING"; // preklicana rezervacija (§7 — prikaz, ne odpoved)

/** Resnost: attention = POTREBUJE POZORNOST; warning = opozorilo; info = poštena opomba. */
export type ConflictSeverity = "attention" | "warning" | "info";

export interface GuardianConflict {
  kind: GuardianConflictKind;
  severity: ConflictSeverity;
  /** Ključ postanka, na katerega se konflikt nanaša. */
  stopKey: string;
  stopTitle: string;
  /** DEJSTVA — samo realne številke/časi iz virov (bilingvalno). */
  facts: { sl: string; en: string };
  /** RAZLOG — zakaj je to konflikt. */
  reason: { sl: string; en: string };
  /** POSLEDICA — kaj to pomeni za uporabnika. */
  impact: { sl: string; en: string };
  /** UKREPI — kaj Discover ponudi (izvede Go Mode UX). */
  actions: GuardianActionId[];
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA (konfigurabilna — testno zaklenjena)
// ---------------------------------------------------------------------------

export interface ConflictConfig {
  /** Termin, ki teče že več kot toliko min → PAST_BOOKING (ne več STARTED). */
  startedGraceMin: number;
  /** Koliko minute štejemo za vstop v objekt po prihodu (minimalna izvedljivost). */
  arrivalBufferMin: number;
}

export const DEFAULT_CONFLICT_CONFIG: ConflictConfig = {
  startedGraceMin: 30,
  arrivalBufferMin: 5,
};

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface ConflictInput {
  view: GoView;
  now: Date;
  /** Izračun rezerve za naslednji postanek (evaluateTimeReserve). */
  reserve: TimeReserve;
  /** Dejavne JourneyBooking vrstice (ključ "provider:productId" → status). */
  bookingRows?: readonly { key: string; status: string }[];
  /** Živi GPS (z GPS je rezerva do naslednjega termina izračunljiva iz
   *  hevristike — UNKNOWN_ROUTE takrat NI pošten izpis). */
  position?: { lat: number; lng: number; accuracyM?: number; timestamp: number } | null;
  config?: ConflictConfig;
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ---------------------------------------------------------------------------

/**
 * Zaznaj vse deterministično izračunljive konflikte aktivnega dne (ČISTO).
 * Vrstni red: po resnosti (attention → warning → info), znotraj po vrstnem
 * redu postankov — prvi konflikt je tisti, ki ga banner izpiše.
 */
export function detectConflicts(input: ConflictInput): GuardianConflict[] {
  const cfg = input.config ?? DEFAULT_CONFLICT_CONFIG;
  const out: GuardianConflict[] = [];
  const next = input.view.next;
  if (next == null) return out; // dan brez odprtih postankov — ni konfliktov

  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  const open = [next, ...input.view.remaining];
  const bookingByKey = new Map(
    (input.bookingRows ?? []).map((r) => [r.key, r.status] as const)
  );

  // --- §6-1/5: termin ogrožen / ozek / že teče / zamujen (naslednji postanek)
  pushNextStopConflicts(out, input, cfg, nowMin);

  // --- §6-2: prekrivanje dveh fiksnih terminov (samo dokazljivo)
  pushOverlapConflicts(out, open, nowMin);

  // --- §6-3: prekratek čas med postanki glede na znano traso
  pushTightLegConflicts(out, open);

  // --- §6-6: manjkajoča lokacija (naslednji postanek — izvedljivost)
  if (!isNavigableCard(next)) {
    out.push({
      kind: "MISSING_GEO",
      severity: "info",
      stopKey: next.entry.key,
      stopTitle: next.entry.title,
      facts: {
        sl: "Vir lokacije za ta postanek ni podal veljavnih koordinat.",
        en: "The source has not provided valid coordinates for this stop.",
      },
      reason: {
        sl: "Brez lokacije ni navigacije niti ocene prihoda.",
        en: "Without a location there is no navigation or arrival estimate.",
      },
      impact: {
        sl: "Postanek ostaja v načrtu, a ga ne moremo usmerjati.",
        en: "The stop stays in the plan, but we cannot guide you to it.",
      },
      actions: ["ADJUST_PLAN", "SKIP"],
    });
  }

  // --- §6-7: neznan route duration (dan s termini, a brez kakršnih koli nog
  //     IN brez GPS — z živo pozicijo hevristika pokriva rezervo naslednjega)
  if (input.position == null) {
    pushUnknownRouteConflict(out, input.view, next);
  }

  // --- §6-8: odpiralni čas v konfliktu s predvidenim prihodom
  pushClosedOnArrivalConflict(out, input, next, nowMin);

  // --- §7: preklicana rezervacija (SAMO prikaz — nikoli ne odpovedujemo)
  pushCancelledConflicts(out, open, bookingByKey);

  // Ureditev: attention → warning → info (stabilno znotraj vrste).
  const order: Record<ConflictSeverity, number> = { attention: 0, warning: 1, info: 2 };
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}

// ---------------------------------------------------------------------------
// ZASEBNE POMOŽNE
// ---------------------------------------------------------------------------

function isNavigableCard(card: GoEntryCard): boolean {
  return card.geo.precision === "exact" || card.geo.precision === "approximate";
}

/** Dejanski rezervacijski status postanka (iz bookingRows — samo za prikaz). */
function bookingStatusOf(
  card: GoEntryCard,
  bookingByKey: Map<string, string>
): string | null {
  const e = card.entry;
  if (e.provider == null || e.providerProductId == null) return null;
  return bookingByKey.get(`${e.provider}:${e.providerProductId}`) ?? null;
}

/** §6-1/4/5: konflikti okrog termina NASLEDNJEGA postanka. */
function pushNextStopConflicts(
  out: GuardianConflict[],
  input: ConflictInput,
  cfg: ConflictConfig,
  nowMin: number
): void {
  const next = input.view.next!;
  const reserve = input.reserve;
  const title = next.entry.title;

  // Rezerva izračunljiva → AT_RISK / TIGHT iz dejanskih številk.
  if (reserve.status === "LATE" && reserve.reserveMin != null && reserve.eta) {
    out.push({
      kind: "AT_RISK_BOOKING",
      severity: "attention",
      stopKey: next.entry.key,
      stopTitle: title,
      facts: {
        sl: `Termin ob ${reserve.bookingStart} · predviden prihod ~${reserve.eta.hhmm} (zamuda ${Math.abs(reserve.reserveMin)} min).`,
        en: `Booking at ${reserve.bookingStart} · estimated arrival ~${reserve.eta.hhmm} (${Math.abs(reserve.reserveMin)} min late).`,
      },
      reason: {
        sl: "Po trenutni lokaciji in oceni vožnje bi prispel po začetku termina.",
        en: "Based on your current location and the drive estimate you would arrive after the booking starts.",
      },
      impact: {
        sl: "Rezervacija je lahko ogrožena — pokliči ponudnika ali prilagodi načrt.",
        en: "The booking may be at risk — call the provider or adjust the plan.",
      },
      actions: ["NAVIGATE", "ADJUST_PLAN", "SKIP", "VIEW_BOOKING"],
    });
    return; // LATE prevlada nad STARTED/PAST (isti termin)
  }
  if (reserve.status === "TIGHT" && reserve.reserveMin != null && reserve.eta) {
    out.push({
      kind: "TIGHT_BOOKING",
      severity: "warning",
      stopKey: next.entry.key,
      stopTitle: title,
      facts: {
        sl: `Termin ob ${reserve.bookingStart} · predviden prihod ~${reserve.eta.hhmm} (rezerva ${reserve.reserveMin} min).`,
        en: `Booking at ${reserve.bookingStart} · estimated arrival ~${reserve.eta.hhmm} (${reserve.reserveMin} min to spare).`,
      },
      reason: {
        sl: "Prihod je izvedljiv, a z ozko rezervo.",
        en: "The arrival is feasible, but with a tight margin.",
      },
      impact: {
        sl: "Kakršna koli zamuda lahko ogrozi termin.",
        en: "Any delay may put the booking at risk.",
      },
      actions: ["NAVIGATE"],
    });
  }

  // Termin, ki že teče / je zamujen (neodvisno od GPS — dejstvo ure).
  if (reserve.terminal === "fixed_start" && reserve.bookingStart != null) {
    const startMin = hhmmToMinutes(reserve.bookingStart);
    if (startMin != null) {
      const overMin = nowMin - startMin;
      if (overMin > cfg.startedGraceMin) {
        out.push({
          kind: "PAST_BOOKING",
          severity: "attention",
          stopKey: next.entry.key,
          stopTitle: title,
          facts: {
            sl: `Termin ob ${reserve.bookingStart} se je začel pred ${overMin} min.`,
            en: `The ${reserve.bookingStart} booking started ${overMin} min ago.`,
          },
          reason: {
            sl: "Termin je časovno ogrožen — teče že dlje časa.",
            en: "The booking is time at risk — it has been running for a while.",
          },
          impact: {
            sl: "Preveri pri ponudniku, ali termin še velja.",
            en: "Check with the provider whether the booking still holds.",
          },
          actions: ["VIEW_BOOKING", "ADJUST_PLAN", "SKIP"],
        });
      } else if (overMin >= 0) {
        out.push({
          kind: "STARTED_BOOKING",
          severity: "warning",
          stopKey: next.entry.key,
          stopTitle: title,
          facts: {
            sl: `Termin ob ${reserve.bookingStart} je že začel teči (pred ${overMin} min).`,
            en: `The ${reserve.bookingStart} booking has already started (${overMin} min ago).`,
          },
          reason: {
            sl: "Termin teče — vstop je še mogoč, a čas teče.",
            en: "The booking is running — entry is still possible, but time passes.",
          },
          impact: {
            sl: "Priporočamo takojšnjo navigacijo do lokacije.",
            en: "We recommend navigating to the location right away.",
          },
          actions: ["NAVIGATE"],
        });
      }
    }
  }
}

/** §6-2: prekrivanje fiksnih terminov (SAMO z dokazljivim trajanjem). */
function pushOverlapConflicts(
  out: GuardianConflict[],
  open: GoEntryCard[],
  _nowMin: number
): void {
  const fixed = open
    .map((c) => ({ card: c, start: hhmmToMinutes(c.entry.time?.start ?? "") }))
    .filter((x): x is { card: GoEntryCard; start: number } => x.start != null)
    .sort((a, b) => a.start - b.start);

  for (let i = 1; i < fixed.length; i++) {
    const a = fixed[i - 1];
    const b = fixed[i];
    const aEnd =
      a.card.entry.time?.end != null
        ? hhmmToMinutes(a.card.entry.time.end)
        : a.card.entry.durationMin != null
          ? a.start + a.card.entry.durationMin
          : a.start; // brez trajanja dokaza NI — ne trdimo prekrivanja
    if (b.start < (aEnd ?? a.start) || b.start === a.start) {
      out.push({
        kind: "OVERLAP_FIXED",
        severity: "attention",
        stopKey: b.card.entry.key,
        stopTitle: b.card.entry.title,
        facts: {
          sl: `${a.card.entry.title} ob ${a.card.entry.time?.start} in ${b.card.entry.title} ob ${b.card.entry.time?.start}.`,
          en: `${a.card.entry.title} at ${a.card.entry.time?.start} and ${b.card.entry.title} at ${b.card.entry.time?.start}.`,
        },
        reason: {
          sl: "Dva fiksna termina se časovno prekrivata.",
          en: "Two fixed bookings overlap in time.",
        },
        impact: {
          sl: "Enega od terminov bo treba prestaviti ali preskočiti.",
          en: "One of the bookings will need to be moved or skipped.",
        },
        actions: ["ADJUST_PLAN", "SKIP", "VIEW_BOOKING"],
      });
    }
  }
}

/** §6-3: prekratek čas med ZAPOREDNIMA postankoma glede na znano traso. */
function pushTightLegConflicts(out: GuardianConflict[], open: GoEntryCard[]): void {
  for (let i = 1; i < open.length; i++) {
    const prev = open[i - 1];
    const cur = open[i];
    const leg = cur.entry.legFromPrev;
    if (leg == null) continue; // nobena znana noga — ne trdimo ničesar
    const startPrev = hhmmToMinutes(prev.entry.time?.start ?? "");
    const startCur = hhmmToMinutes(cur.entry.time?.start ?? "");
    if (startPrev == null || startCur == null) continue;

    const requiredMin =
      leg.min + (prev.entry.durationMin ?? 0) + (prev.entry.time?.end != null ? 0 : 0);
    const gapMin = startCur - startPrev;
    if (gapMin <= 0) continue; // prekrivanje že pokriva ta primer (§6-2)
    if (requiredMin > gapMin) {
      out.push({
        kind: "TOO_TIGHT_LEG",
        severity: "warning",
        stopKey: cur.entry.key,
        stopTitle: cur.entry.title,
        facts: {
          sl: `Med ${prev.entry.time?.start} in ${cur.entry.time?.start} je ${gapMin} min; trasa + postanek zahtevata ~${requiredMin} min.`,
          en: `${gapMin} min between ${prev.entry.time?.start} and ${cur.entry.time?.start}; the route + stop need ~${requiredMin} min.`,
        },
        reason: {
          sl: `Znana trasa (${labelOfLegSource(leg.source)}) ne spravi obeh terminov.`,
          en: `The known route (${labelOfLegSource(leg.source)}) cannot fit both bookings.`,
        },
        impact: {
          sl: "Drug termin je v nevarnosti, če se pri prvem zadržiš polno trajanje.",
          en: "The second booking is at risk if you stay the full duration at the first.",
        },
        actions: ["NAVIGATE", "ADJUST_PLAN", "SKIP"],
      });
    }
  }
}

function labelOfLegSource(source: "osrm" | "heuristic"): string {
  return source === "osrm" ? "OSRM" : "ocena";
}

/** §6-7: dan s termini, a brez KAKRŠNIH KOLI podatkov o trajanju in brez GPS. */
function pushUnknownRouteConflict(
  out: GuardianConflict[],
  view: GoView,
  next: GoEntryCard
): void {
  const fixedCount =
    1 + // naslednji (šteje se, če ima termin — preverimo spodaj)
    view.remaining.filter((c) => c.entry.time?.start != null).length;
  if (fixedCount < 2) return;
  if (next.entry.time?.start == null) return;
  const anyLeg =
    view.remaining.some((c) => c.entry.legFromPrev != null) ||
    next.entry.legFromPrev != null;
  if (anyLeg) return; // vsaj ena noga obstaja — UNKNOWN_ROUTE ne velja
  out.push({
    kind: "UNKNOWN_ROUTE",
    severity: "info",
    stopKey: next.entry.key,
    stopTitle: next.entry.title,
    facts: {
      sl: "Dan ima več fiksnih terminov, a trajanja med postanki niso znana.",
      en: "The day has several fixed times, but durations between stops are unknown.",
    },
    reason: {
      sl: "Brez znanega trajanja med postanki rezerv ne moremo preveriti.",
      en: "Without known durations between stops we cannot verify the reserves.",
    },
    impact: {
      sl: "Vklopi GPS — ocena iz trenutne lokacije omogoči vsaj rezervo do naslednjega termina.",
      en: "Turn on GPS — an estimate from your position gives at least the reserve to the next booking.",
    },
    actions: ["NAVIGATE"],
  });
}

/** §6-8: odpiralni čas cilja v konfliktu s predvidenim prihodom. */
function pushClosedOnArrivalConflict(
  out: GuardianConflict[],
  input: ConflictInput,
  next: GoEntryCard,
  nowMin: number
): void {
  const eta = input.reserve.eta;
  const raw = next.entry.openingHours;
  if (eta == null || raw == null || raw.trim() === "") return;

  const etaAbs = nowMin + eta.min;
  const moment: OpeningMoment = {
    weekday: (input.now.getDay() + Math.floor(etaAbs / 1440)) % 7,
    minutes: etaAbs % 1440,
  };
  const status = openingStatusAt(raw, moment);
  if (status.status !== "CLOSED") return;

  out.push({
    kind: "CLOSED_ON_ARRIVAL",
    severity: "attention",
    stopKey: next.entry.key,
    stopTitle: next.entry.title,
    facts: {
      sl: `Predviden prihod ~${eta.hhmm} · ob tem času bo zaprto.`,
      en: `Estimated arrival ~${eta.hhmm} · closed at that time.`,
    },
    reason: {
      sl: `Odpiralni časi vira (${raw}) ne pokrivajo predvidenega prihoda.`,
      en: `The source opening hours (${raw}) do not cover the estimated arrival.`,
    },
    impact: {
      sl: "Ob tem prihodu cilj ne bo odprt — premakni obisk ali potuj prej.",
      en: "The destination will be closed on this arrival — move the visit or travel earlier.",
    },
    actions: ["ADJUST_PLAN", "SKIP", "NAVIGATE"],
  });
}

/** §7: preklicana rezervacija na odprtem postanku (SAMO prikaz — §20). */
function pushCancelledConflicts(
  out: GuardianConflict[],
  open: GoEntryCard[],
  bookingByKey: Map<string, string>
): void {
  for (const card of open) {
    const status = bookingStatusOf(card, bookingByKey);
    if (status !== "CANCELLED") continue;
    const isNext = card === open[0];
    out.push({
      kind: "CANCELLED_BOOKING",
      severity: isNext ? "attention" : "warning",
      stopKey: card.entry.key,
      stopTitle: card.entry.title,
      facts: {
        sl: "Rezervacija pri ponudniku je PREKlicANA.",
        en: "The booking at the provider is CANCELLED.",
      },
      reason: {
        sl: "Ponudnik je rezervacijo preklical — stanje je zabeleženo v tvojem potrdilnem dokumentu.",
        en: "The provider cancelled the booking — the state is recorded in your confirmation document.",
      },
      impact: {
        sl: "Obisk brez rezervacije morda ni mogoč — preuredi pot ali se dogovori neposredno.",
        en: "A visit without a booking may not be possible — rearrange the plan or arrange directly.",
      },
      actions: isNext
        ? ["VIEW_BOOKING", "ADJUST_PLAN", "SKIP"]
        : ["ADJUST_PLAN", "SKIP"],
    });
  }
}

// ---------------------------------------------------------------------------
// UI OZNAKE (naslovi vrst konfliktov — za izpis/enote)
// ---------------------------------------------------------------------------

export const CONFLICT_LABELS: Record<GuardianConflictKind, { sl: string; en: string }> = {
  AT_RISK_BOOKING: { sl: "Termin je ogrožen", en: "Booking at risk" },
  TIGHT_BOOKING: { sl: "Ozek prihod", en: "Tight arrival" },
  OVERLAP_FIXED: { sl: "Prekrivanje terminov", en: "Overlapping bookings" },
  TOO_TIGHT_LEG: { sl: "Prekratek prehod", en: "Too tight a transfer" },
  STARTED_BOOKING: { sl: "Termin že teče", en: "Booking already started" },
  PAST_BOOKING: { sl: "Termin je zamujen", en: "Booking missed" },
  MISSING_GEO: { sl: "Lokacija ni znana", en: "Location unknown" },
  UNKNOWN_ROUTE: { sl: "Trajanje ni znano", en: "Duration unknown" },
  CLOSED_ON_ARRIVAL: { sl: "Zaprto ob prihodu", en: "Closed on arrival" },
  CANCELLED_BOOKING: { sl: "Rezervacija preklicana", en: "Booking cancelled" },
} as const;

/** Izpis dejanj (Go Mode gumbi — ISTA imena kot obstoječi UX kanon). */
export const GUARDIAN_ACTION_LABELS: Record<
  GuardianActionId,
  { sl: string; en: string }
> = {
  NAVIGATE: { sl: "Navigiraj", en: "Navigate" },
  SKIP: { sl: "Preskoči", en: "Skip" },
  ADJUST_PLAN: { sl: "Prilagodi mojo pot", en: "Adjust my trip" },
  VIEW_BOOKING: { sl: "Odpri rezervacijo", en: "Open booking" },
  COMPLETE: { sl: "Opravi", en: "Complete" },
} as const;

/** Pomožna za izpis HH:MM iz minut (uporabljajo testen/UX — čista). */
export { minutesToHhmm };
