// ============================================================================
// ISSUE #23 — GUIDED PLATFORM EXPERIENCE: deterministic selection engine
// ============================================================================
// En kanonični odgovor na vprašanje: "Kaj mora Discover uporabniku pokazati
// zdaj?" (issue §8). ČISTA funkcija — brez I/O, brez Date.now(), brez
// skritega stanja: isti vhodi VEDNO → isti izhod (testirano).
//
// Vzorec: trip-health.ts (#22) — dejstva → stanje, brez mnenj.
// Površina vpliva SAMO na razpoložljivost akcij, nikoli na stanje
// (ena resnica o stanju, §33).
//
// PRIORITETNI RED (§32, preverjeno združljiv z #21/#22):
//   BLOCKED(100) > NEEDS_ATTENTION(90) > ARRIVED(80) > NAVIGATING(70) >
//   RECOVERY(60) > FREE_TIME(50) > COMPLETED(45) > TRIP_STARTED(40) >
//   TRIP_READY(30) > BOOKING_PENDING(25) > TRIP_BUILDING(20) >
//   DISCOVERING(10) > NEW_USER(5) > UNKNOWN(0)
// ============================================================================

import type {
  ChainStep,
  Guidance,
  GuidanceAction,
  GuidanceActionId,
  GuidanceInput,
  GuidanceState,
} from "./types";

/** Relativne poti dejanj (montira jih komponenta prek i18n Link). */
const ACTION_HREFS: Partial<Record<GuidanceActionId, string>> = {
  discover: "/destinacije",
  plan: "/nacrtuj",
  open_trips: "/moja-potovanja",
  book: "/nacrtuj",
  start_trip: "/moja-potovanja",
  go_mode: "/na-poti",
  navigate: "/na-poti#naslednje",
  complete_stop: "/na-poti#naslednje",
  free_time: "/na-poti",
  recovery: "/na-poti",
  new_trip: "/nacrtuj",
};

function action(id: GuidanceActionId, kind: "primary" | "secondary"): GuidanceAction {
  return { id, href: ACTION_HREFS[id], kind };
}

const CHAIN_ORDER: readonly ChainStep[] = ["discover", "plan", "book", "go", "finish"];

function chainOf(step: ChainStep): Guidance["chain"] {
  const index = CHAIN_ORDER.indexOf(step) + 1;
  return { current: step, index, total: CHAIN_ORDER.length };
}

/** Kritična stanja, ki jih uporabnik NE sme trajno skriti (§40.20). */
const NOT_DISMISSIBLE: ReadonlySet<GuidanceState> = new Set([
  "BLOCKED",
  "NEEDS_ATTENTION",
  "ARRIVED",
  "RECOVERY",
]);

/**
 * Izberi trenutno vodeno stanje iz kanoničnih dejstev.
 *
 * Pravila (dokumentirana v docs/GUIDANCE-STATE-MATRIX.md):
 * 1. Go Mode aktiven → sredina poti (živi kontekst, če je na voljo, sicer
 *    iskerno TRIP_STARTED — trak izven /na-poti živih kontekstov NIMA in
 *    si ga ne izmišljuje);
 * 2. zaključek: zadnji dan, 0 preostalih, 1+ obdelanih → COMPLETED;
 * 3. shranjen načrt (in brez aktivnega Go) → TRIP_READY oz. BOOKING_PENDING
 *    (samo, kadar živi kontekst dejansko odkrije odprte rezervacije —
 *    brez podatkov NE trdimo "pending", §30/§31);
 * 4. zbirka 1+ → TRIP_BUILDING;
 * 5. prazna zbirka → NEW_USER (prva seja) / DISCOVERING (vračajoči).
 */
export function selectGuidance(input: GuidanceInput): Guidance {
  const live = input.live ?? null;
  const facts = {
    myTripCount: input.myTripCount,
    savedTripsCount: input.savedTripsCount,
    nextStopTitle: input.go?.nextStopTitle ?? null,
    laterDayStops: input.go?.laterDayStops ?? 0,
    doneToday: input.go?.doneToday ?? 0,
    skippedToday: input.go?.skippedToday ?? 0,
    freeTimeMinutes: typeof live?.freeTimeMinutes === "number" ? live.freeTimeMinutes : null,
  };

  // --- 0. Iskrena negotovost (§30) — samo izrecno, brez ugibanj. ---
  if (live?.dataQuality === "unknown") {
    return {
      state: "UNKNOWN",
      chain: chainOf("discover"),
      facts,
      primaryAction: null,
      secondaryActions: [action("discover", "secondary")],
      messageKey: "unknown",
      dismissible: true,
      priority: 0,
    };
  }

  // --- 1. Sredi poti (Go Mode aktiven). ---
  if (input.go?.active) {
    const allDone =
      input.go.remainingToday === 0 &&
      input.go.laterDayStops === 0 &&
      input.go.doneToday + input.go.skippedToday > 0;

    if (allDone) {
      // Terminalno stanje (revizija: največja vrzel verige — poprej golo
      // "ni več postankov").
      return {
        state: "COMPLETED",
        chain: chainOf("finish"),
        facts,
        primaryAction: action("new_trip", "primary"),
        secondaryActions: [action("open_trips", "secondary")],
        messageKey: "completed",
        dismissible: true,
        priority: 45,
      };
    }

    // Živi kontekst (samo /na-poti seja — #21/#22 projekcije).
    if (live?.health === "BLOCKED") {
      return {
        state: "BLOCKED",
        chain: chainOf("go"),
        facts,
        primaryAction: action("recovery", "primary"),
        secondaryActions: [action("go_mode", "secondary")],
        messageKey: "blocked",
        dismissible: false,
        priority: 100,
      };
    }
    if (live?.recoveryActive) {
      return {
        state: "RECOVERY",
        chain: chainOf("go"),
        facts,
        primaryAction: action("recovery", "primary"),
        secondaryActions: [],
        messageKey: "recovery",
        dismissible: false,
        priority: 60,
      };
    }
    if (live?.health === "NEEDS_ATTENTION" || live?.hasConflicts) {
      return {
        state: "NEEDS_ATTENTION",
        chain: chainOf("go"),
        facts,
        primaryAction: action("recovery", "primary"),
        secondaryActions: [action("go_mode", "secondary")],
        messageKey: "needsAttention",
        dismissible: false,
        priority: 90,
      };
    }
    if (live?.arrivalState === "arrived") {
      return {
        state: "ARRIVED",
        chain: chainOf("go"),
        facts,
        primaryAction: action("complete_stop", "primary"),
        secondaryActions: [action("go_mode", "secondary")],
        messageKey: "arrived",
        dismissible: false,
        priority: 80,
      };
    }
    if (live?.arrivalState === "approaching" || live?.arrivalState === "near_destination") {
      return {
        state: "NAVIGATING",
        chain: chainOf("go"),
        facts,
        primaryAction: action("navigate", "primary"),
        secondaryActions: [action("go_mode", "secondary")],
        messageKey: "navigating",
        dismissible: true,
        priority: 70,
      };
    }
    if (typeof live?.freeTimeMinutes === "number" && live.freeTimeMinutes >= 15) {
      return {
        state: "FREE_TIME",
        chain: chainOf("go"),
        facts,
        primaryAction: action("free_time", "primary"),
        secondaryActions: [action("go_mode", "secondary")],
        messageKey: "freeTime",
        dismissible: true,
        priority: 50,
      };
    }

    // Stabilno sredi poti — iskreno sporočilo tudi brez imena cilja
    // (konec dneva z nadaljnjimi dnevi ≠ konec poti).
    return {
      state: "TRIP_STARTED",
      chain: chainOf("go"),
      facts,
      primaryAction: action("go_mode", "primary"),
      secondaryActions: [action("open_trips", "secondary")],
      messageKey: input.go.nextStopTitle ? "started" : "startedNextDay",
      dismissible: true,
      priority: 40,
    };
  }

  // --- 2. Načrt shranjen, pot še ni zagnana. ---
  if (input.savedTripsCount > 0) {
    // BOOKING_PENDING ZAHTeva dejanski podatek o odprtih rezervacijah —
    // brez njega NE trdimo (lažni status je prepovedan, §31).
    if (live?.hasOpenBookings === true) {
      return {
        state: "BOOKING_PENDING",
        chain: chainOf("book"),
        facts,
        primaryAction: action("book", "primary"),
        secondaryActions: [action("start_trip", "secondary")],
        messageKey: "bookingPending",
        dismissible: true,
        priority: 25,
      };
    }
    return {
      state: "TRIP_READY",
      chain: chainOf("book"),
      facts,
      primaryAction: action("start_trip", "primary"),
      secondaryActions: [action("book", "secondary")],
      messageKey: "ready",
      dismissible: true,
      priority: 30,
    };
  }

  // --- 3. Zbirka ima predmete → načrtovanje je naslednji korak. ---
  if (input.myTripCount > 0) {
    return {
      state: "TRIP_BUILDING",
      chain: chainOf("plan"),
      facts,
      primaryAction: action("plan", "primary"),
      secondaryActions: [action("discover", "secondary")],
      messageKey: "building",
      dismissible: true,
      priority: 20,
    };
  }

  // --- 4. Prazna zbirka: prvi obisk oz. vračajoči uporabnik. ---
  if (input.firstSession) {
    return {
      state: "NEW_USER",
      chain: chainOf("discover"),
      facts,
      primaryAction: action("discover", "primary"),
      secondaryActions: [action("plan", "secondary")],
      messageKey: "newUser",
      dismissible: true,
      priority: 5,
    };
  }
  return {
    state: "DISCOVERING",
    chain: chainOf("discover"),
    facts,
    primaryAction: action("discover", "primary"),
    secondaryActions: [action("plan", "secondary")],
    messageKey: "discovering",
    dismissible: true,
    priority: 10,
  };
}
