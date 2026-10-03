// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: DYNAMIC TRIP RECOVERY (čista plast, §7 + §8)
// ============================================================================
// Ko se načrt med potovanjem moti, Guardian NE pusti uporabnika z neuporabnim
// itinererjem: izračuna RECOVERY PLAN — kaj se je spremenilo, kaj je prizadeto,
// kaj ostaja veljavno, kaj je ogroženo, naslednji IZVEDLJIV cilj in katere
// spremembe zahtevajo UPORABNIKOVO POTRDITEV (§8 — uporabnik je končni
// odločevalec; Discover nikoli ne skrije spremembe).
//
// Obravnavani sprožilci (§7 — vsi):
//  - zamujen postanek (MISSED_STOP)     §7-1
//  - preskočena aktivnost (SKIPPED_STOP) §7-2
//  - uporabnik dlje od cilja + ogrožen termin (OFF_ROUTE) §7-3
//  - preklicana rezervacija (CANCELLED_BOOKING) §7-4
//  - časovni zamik dneva (DELAYED_DAY) §7-7 (ročni redosled §7-6 in shareId
//    sprememba §7-20 pokriva #21 rekonsilijacija — tu ne podvajamo)
//
// SVETE PRAVILO (§7/§20): Discover NE odpoveduje zunanjih rezervacij in NE
// spreminja kanoničnega booking state — vsi predlogi so SAMO predlogi, ki
// jih izvede uporabnik (nadaljuj/preskoči/preuredi) prek obstoječih
// mehanizmov #21 (toggleSkip/toggleDone + navigacija + planer).
//
// DETERMINIZEM: 0 omrežja, 0 db, 0 localStorage; `now` je parameter.
// ============================================================================

import type { GoView } from "./go-view";
import type { GuardianConflict } from "./conflict-detect";
// ISSUE #24 Sklop 8 (1.170.0): 6-jezične oznake (faza 2).
import type { GoStrings } from "./go-lang";

// ---------------------------------------------------------------------------
// TIPI
// ---------------------------------------------------------------------------

/** Kaj je sprožilo recovery (strojno izpeljano iz dejstev). */
export type RecoveryTrigger =
  | "MISSED_STOP" // termin je močno pretekel, postanek ni opravljen
  | "SKIPPED_STOP" // uporabnik je preskočil aktivnost — učinki na danes
  | "CANCELLED_BOOKING" // ponudnik je preklical rezervacijo
  | "OFF_ROUTE" // daleč od cilja + termin ogrožen
  | "DELAYED_DAY"; // dan se je zamaknil (naslednji termini prizadeti)

/** Predlagana akcija (izvede jo uporabnik — §8 njegova odločitev). */
export type RecoverySuggestionAction =
  | "CONTINUE" // nadaljuj kljub temu (poišči/poizkusi)
  | "SKIP" // preskoči prizadeti postanek
  | "ADJUST_PLAN" // preuredi mojo pot (planer)
  | "VIEW_BOOKING"; // odpri rezervacijo pri ponudniku (pokliči/dogovor)

export interface RecoveryStopRef {
  key: string;
  title: string;
}

/** Celoten recovery plan (projekcija — 0 persistiranj). */
export interface RecoveryPlan {
  trigger: RecoveryTrigger;
  /** Naslov, ki ga uporabnik vidi (§30.G — jasna izjava problema). */
  headline: GoStrings;
  /** Kaj se je spremenilo (dejstva). */
  changed: GoStrings;
  /** Prizadeti postanki. */
  affected: RecoveryStopRef[];
  /** Postanki, ki ostajajo veljavni (neizvedeni, izvedljivi). */
  stillValid: RecoveryStopRef[];
  /** Ogroženi/neizvedljivi postanki. */
  atRisk: RecoveryStopRef[];
  /** Naslednji IZVEDLJIVI cilj (prvi odprt z navigabilnim geo). */
  nextViable: RecoveryStopRef | null;
  /** Predlogi — vsak zahteva uporabnikovo potrditev (§8). */
  suggestions: { action: RecoverySuggestionAction; stopKey: string }[];
}

// ---------------------------------------------------------------------------
// KONFIGURACIJA
// ---------------------------------------------------------------------------

export interface RecoveryConfig {
  /** Termin pretekel > toliko min → MISSED_STOP (isti kanon kot PAST_BOOKING). */
  missedAfterMin: number;
  /** Razdalja do cilja (km, premica), ki šteje za »mnogo dlje« (§7-3). */
  offRouteKm: number;
}

export const DEFAULT_RECOVERY_CONFIG: RecoveryConfig = {
  missedAfterMin: 30,
  offRouteKm: 80,
};

// ---------------------------------------------------------------------------
// VHOD
// ---------------------------------------------------------------------------

export interface RecoveryInput {
  view: GoView;
  now: Date;
  /** Konflikti (detectConflicts) — vir resnice o ogroženosti. */
  conflicts: GuardianConflict[];
  /** Živi GPS (za OFF_ROUTE razdaljo). */
  position: { lat: number; lng: number; accuracyM?: number; timestamp: number } | null;
  config?: RecoveryConfig;
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ---------------------------------------------------------------------------

/**
 * Oceni, ali aktivni dan potrebuje RECOVERY MODE, in zgradi plan (ČISTO).
 *
 * Prioriteta sprožilcev (prvi zadeti zmaga — najbolj stopenjsko resen):
 *  1. CANCELLED_BOOKING (zunanji dogodek — ponudnik);
 *  2. MISSED_STOP (termin močno pretekel, nič opravljeno);
 *  3. OFF_ROUTE (daleč + naslednji termin ogrožen);
 *  4. DELAYED_DAY (kasen zamik dneva — naslednji fiksni termin kmalu);
 *  5. SKIPPED_STOP (mehkejši — danes preskočeno z učinki).
 *
 * Vrne null, ko načrt teče brez motenj (Go Mode recovery sekcije ne izriše).
 */
export function assessRecovery(input: RecoveryInput): RecoveryPlan | null {
  const cfg = input.config ?? DEFAULT_RECOVERY_CONFIG;
  const view = input.view;
  if (view.next == null) return null; // nič odprtega — ni recoveryja

  const nowMin = input.now.getHours() * 60 + input.now.getMinutes();
  const nextKey = view.next.entry.key;

  // 1 — preklicana rezervacija na naslednjem postanku (zunanji dogodek).
  const cancelled = input.conflicts.find(
    (c) => c.kind === "CANCELLED_BOOKING" && c.stopKey === nextKey
  );
  if (cancelled != null) {
    return buildPlan(view, {
      trigger: "CANCELLED_BOOKING",
      headline: {
        sl: "Rezervacija za naslednji postanek je preklicana.",
        en: "The booking for the next stop has been cancelled.",
        it: "La prenotazione per la prossima tappa è stata cancellata.",
        de: "Die Buchung für die nächste Station wurde storniert.",
        fr: "La réservation pour le prochain arrêt a été annulée.",
        es: "La reserva para la próxima parada ha sido cancelada.",
      },
      changed: cancelled.facts,
      affectedKeys: [nextKey],
      atRiskKeys: [nextKey],
      suggestions: [
        { action: "VIEW_BOOKING", stopKey: nextKey },
        { action: "SKIP", stopKey: nextKey },
        { action: "ADJUST_PLAN", stopKey: nextKey },
      ],
    });
  }

  // 2 — zamujen postanek (termin močno pretekel, ni opravljen).
  const past = input.conflicts.find((c) => c.kind === "PAST_BOOKING");
  if (past != null) {
    return buildPlan(view, {
      trigger: "MISSED_STOP",
      headline: {
        sl: "Termin je zamujen — kaj zdaj?",
        en: "The booking has been missed — what now?",
        it: "La prenotazione è mancata — e adesso?",
        de: "Die Buchung ist verpasst — was nun?",
        fr: "La réservation est manquée — et maintenant ?",
        es: "La reserva está perdida — ¿y ahora qué?",
      },
      changed: past.facts,
      affectedKeys: [past.stopKey],
      atRiskKeys: [past.stopKey],
      suggestions: [
        { action: "CONTINUE", stopKey: past.stopKey },
        { action: "SKIP", stopKey: past.stopKey },
        { action: "ADJUST_PLAN", stopKey: past.stopKey },
      ],
    });
  }

  // 3 — daleč od cilja IN naslednji termin ogrožen (§7-3: oboje skupaj).
  const atRisk = input.conflicts.find((c) => c.kind === "AT_RISK_BOOKING");
  const farKm =
    input.position != null && view.next.distanceKm != null
      ? view.next.distanceKm
      : null;
  if (atRisk != null && farKm != null && farKm >= cfg.offRouteKm) {
    return buildPlan(view, {
      trigger: "OFF_ROUTE",
      headline: {
        sl: `Pred teboj je ${Math.round(farKm)} km do termina, ki je ogrožen.`,
        en: `${Math.round(farKm)} km to a booking that is now at risk.`,
        it: `Davanti a te ci sono ${Math.round(farKm)} km fino a una prenotazione ormai a rischio.`,
        de: `Vor dir liegen ${Math.round(farKm)} km bis zu einer Buchung, die jetzt gefährdet ist.`,
        fr: `Tu as encore ${Math.round(farKm)} km jusqu'à une réservation désormais menacée.`,
        es: `Te quedan ${Math.round(farKm)} km hasta una reserva que ya está en riesgo.`,
      },
      changed: atRisk.facts,
      affectedKeys: [nextKey],
      atRiskKeys: [nextKey],
      suggestions: [
        { action: "CONTINUE", stopKey: nextKey },
        { action: "SKIP", stopKey: nextKey },
        { action: "ADJUST_PLAN", stopKey: nextKey },
      ],
    });
  }

  // 4 — časovni zamik dneva: fiksni termin NASLEDNJEGA postanka kmalu teče
  //     ali že teče (STARTED) — dan se je zamaknil, a še ni zamujen.
  const started = input.conflicts.find((c) => c.kind === "STARTED_BOOKING");
  if (started != null) {
    return buildPlan(view, {
      trigger: "DELAYED_DAY",
      headline: {
        sl: "Dan se je zamaknil — termin že teče.",
        en: "The day has slipped — a booking is already running.",
        it: "La giornata è slittata — una prenotazione è già in corso.",
        de: "Der Tag hat sich verschoben — eine Buchung läuft bereits.",
        fr: "La journée a glissé — une réservation est déjà en cours.",
        es: "El día se ha retrasado — una reserva ya está en curso.",
      },
      changed: started.facts,
      affectedKeys: [started.stopKey],
      atRiskKeys: [],
      suggestions: [
        { action: "CONTINUE", stopKey: started.stopKey },
        { action: "SKIP", stopKey: started.stopKey },
        { action: "ADJUST_PLAN", stopKey: started.stopKey },
      ],
    });
  }

  // 5 — preskočena aktivnost z učinki na danes (mehak sprožilec).
  if (view.skipped.length > 0) {
    const skippedFixed = view.skipped.filter((s) => s.entry.time?.start != null);
    if (skippedFixed.length > 0) {
      const s = skippedFixed[skippedFixed.length - 1];
      return buildPlan(view, {
        trigger: "SKIPPED_STOP",
        headline: {
          sl: `Preskočil si terminirani postanek ${s.entry.title}.`,
          en: `You skipped the timed stop ${s.entry.title}.`,
          it: `Hai saltato la tappa con orario ${s.entry.title}.`,
          de: `Du hast die terminierte Station ${s.entry.title} übersprungen.`,
          fr: `Tu as passé l'arrêt horodaté ${s.entry.title}.`,
          es: `Has omitido la parada con horario ${s.entry.title}.`,
        },
        changed: {
          sl: `Postanek ${s.entry.title} (termin ${s.entry.time?.start}) je izpadel iz dneva.`,
          en: `The stop ${s.entry.title} (time ${s.entry.time?.start}) dropped out of the day.`,
          it: `La tappa ${s.entry.title} (orario ${s.entry.time?.start}) è uscita dalla giornata.`,
          de: `Die Station ${s.entry.title} (Zeit ${s.entry.time?.start}) ist aus dem Tag gefallen.`,
          fr: `L'arrêt ${s.entry.title} (horaire ${s.entry.time?.start}) a disparu de la journée.`,
          es: `La parada ${s.entry.title} (horario ${s.entry.time?.start}) ha salido del día.`,
        },
        affectedKeys: [s.entry.key],
        atRiskKeys: [],
        suggestions: [
          { action: "CONTINUE", stopKey: view.next.entry.key },
          { action: "ADJUST_PLAN", stopKey: s.entry.key },
        ],
      });
    }
  }

  return null; // načrt teče brez motenj — recovery sekcije NI
}

// ---------------------------------------------------------------------------
// ZASEBNE POMOŽNE
// ---------------------------------------------------------------------------

function buildPlan(
  view: GoView,
  parts: {
    trigger: RecoveryTrigger;
    headline: GoStrings;
    changed: GoStrings;
    affectedKeys: string[];
    atRiskKeys: string[];
    suggestions: { action: RecoverySuggestionAction; stopKey: string }[];
  }
): RecoveryPlan {
  const affectedSet = new Set(parts.affectedKeys);
  const atRiskSet = new Set(parts.atRiskKeys);

  const refOf = (key: string, title: string): RecoveryStopRef => ({ key, title });

  // Kaj ostaja veljavno: odprti postanki, ki niso prizadeti (po vrstnem redu).
  const open = [view.next, ...view.remaining].filter((c) => c != null);
  const stillValid = open
    .filter((c) => !affectedSet.has(c.entry.key) && !atRiskSet.has(c.entry.key))
    .map((c) => refOf(c.entry.key, c.entry.title));

  // Naslednji izvedljivi cilj: prvi odprt, ki ni ogrožen in ima navigabilen geo.
  const nextViable =
    open.find(
      (c) =>
        !atRiskSet.has(c.entry.key) &&
        (c.geo.precision === "exact" || c.geo.precision === "approximate")
    ) ?? null;

  return {
    trigger: parts.trigger,
    headline: parts.headline,
    changed: parts.changed,
    affected: parts.affectedKeys.map((k) => {
      const c = open.find((x) => x.entry.key === k) ?? view.done.find((d) => d.entry.key === k);
      return refOf(k, c?.entry.title ?? k);
    }),
    stillValid,
    atRisk: parts.atRiskKeys.map((k) => {
      const c = open.find((x) => x.entry.key === k);
      return refOf(k, c?.entry.title ?? k);
    }),
    nextViable: nextViable ? refOf(nextViable.entry.key, nextViable.entry.title) : null,
    suggestions: parts.suggestions,
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (§30.G uporabniška imena akcij — ne tehniški izrazi; 6-jezično)
// ---------------------------------------------------------------------------

export const RECOVERY_ACTION_LABELS: Record<
  RecoverySuggestionAction,
  GoStrings
> = {
  CONTINUE: {
    sl: "Nadaljuj",
    en: "Continue",
    it: "Continua",
    de: "Weiter",
    fr: "Continuer",
    es: "Continuar",
  },
  SKIP: {
    sl: "Preskoči",
    en: "Skip",
    it: "Salta",
    de: "Überspringen",
    fr: "Passer",
    es: "Omitir",
  },
  ADJUST_PLAN: {
    sl: "Preuredi mojo pot",
    en: "Rearrange my trip",
    it: "Riorganizza il mio viaggio",
    de: "Meine Reise umplanen",
    fr: "Réorganiser mon voyage",
    es: "Reorganizar mi viaje",
  },
  VIEW_BOOKING: {
    sl: "Odpri rezervacijo",
    en: "Open booking",
    it: "Apri la prenotazione",
    de: "Buchung öffnen",
    fr: "Ouvrir la réservation",
    es: "Abrir la reserva",
  },
} as const;

export const RECOVERY_LABELS = {
  affected: {
    sl: "Prizadeto",
    en: "Affected",
    it: "Interessato",
    de: "Betroffen",
    fr: "Touché",
    es: "Afectado",
  },
  stillValid: {
    sl: "Še velja",
    en: "Still valid",
    it: "Ancora valido",
    de: "Weiterhin gültig",
    fr: "Toujours valable",
    es: "Todavía válido",
  },
  atRisk: {
    sl: "Ogroženo",
    en: "At risk",
    it: "A rischio",
    de: "Gefährdet",
    fr: "Menacé",
    es: "En riesgo",
  },
  nextViable: {
    sl: "Naslednji izvedljivi cilj",
    en: "Next feasible stop",
    it: "Prossima tappa fattibile",
    de: "Nächste machbare Station",
    fr: "Prochain arrêt faisable",
    es: "Próxima parada viable",
  },
  yourCall: {
    sl: "Odločiš ti — Discover ne spreminja rezervacij namesto tebe.",
    en: "Your call — Discover does not change bookings on your behalf.",
    it: "Decidi tu — Discover non modifica le prenotazioni al posto tuo.",
    de: "Deine Entscheidung — Discover ändert keine Buchungen an deiner Stelle.",
    fr: "C'est à toi de décider — Discover ne modifie pas les réservations à ta place.",
    es: "Tú decides — Discover no cambia las reservas en tu nombre.",
  },
} as const;
