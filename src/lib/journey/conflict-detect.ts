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
// ISSUE #24 Sklop 8 (1.170.0): 6-jezični razlogi/oznake (faza 2).
import { GL, type GoLang, type GoStrings } from "./go-lang";

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
  /** DEJSTVA — samo realne številke/časi iz virov (6-jezično — Sklop 8). */
  facts: GoStrings;
  /** RAZLOG — zakaj je to konflikt. */
  reason: GoStrings;
  /** POSLEDICA — kaj to pomeni za uporabnika. */
  impact: GoStrings;
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
        it: "La fonte non ha fornito coordinate valide per questa tappa.",
        de: "Die Quelle hat für diese Station keine gültigen Koordinaten geliefert.",
        fr: "La source n'a pas fourni de coordonnées valides pour cet arrêt.",
        es: "La fuente no ha proporcionado coordenadas válidas para esta parada.",
      },
      reason: {
        sl: "Brez lokacije ni navigacije niti ocene prihoda.",
        en: "Without a location there is no navigation or arrival estimate.",
        it: "Senza una posizione non ci sono navigazione né stima dell'arrivo.",
        de: "Ohne Standort gibt es keine Navigation und keine Ankunftsschätzung.",
        fr: "Sans emplacement, pas de navigation ni d'estimation d'arrivée.",
        es: "Sin ubicación no hay navegación ni estimación de llegada.",
      },
      impact: {
        sl: "Postanek ostaja v načrtu, a ga ne moremo usmerjati.",
        en: "The stop stays in the plan, but we cannot guide you to it.",
        it: "La tappa resta nel piano, ma non possiamo guidarti fino a essa.",
        de: "Die Station bleibt im Plan, aber wir können dich nicht dorthin lotsen.",
        fr: "L'arrêt reste dans le plan, mais nous ne pouvons pas te guider jusqu'à lui.",
        es: "La parada permanece en el plan, pero no podemos guiarte hasta ella.",
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
        it: `Prenotazione alle ${reserve.bookingStart} · arrivo previsto ~${reserve.eta.hhmm} (${Math.abs(reserve.reserveMin)} min di ritardo).`,
        de: `Buchung um ${reserve.bookingStart} · voraussichtliche Ankunft ~${reserve.eta.hhmm} (${Math.abs(reserve.reserveMin)} Min. Verspätung).`,
        fr: `Réservation à ${reserve.bookingStart} · arrivée estimée ~${reserve.eta.hhmm} (${Math.abs(reserve.reserveMin)} min de retard).`,
        es: `Reserva a las ${reserve.bookingStart} · llegada estimada ~${reserve.eta.hhmm} (${Math.abs(reserve.reserveMin)} min de retraso).`,
      },
      reason: {
        sl: "Po trenutni lokaciji in oceni vožnje bi prispel po začetku termina.",
        en: "Based on your current location and the drive estimate you would arrive after the booking starts.",
        it: "In base alla posizione attuale e alla stima del viaggio arriveresti dopo l'inizio della prenotazione.",
        de: "Basierend auf deinem aktuellen Standort und der Fahrtschätzung würdest du nach Beginn der Buchung ankommen.",
        fr: "D'après ta position actuelle et l'estimation du trajet, tu arriverais après le début de la réservation.",
        es: "Según tu ubicación actual y la estimación del trayecto, llegarías después del inicio de la reserva.",
      },
      impact: {
        sl: "Rezervacija je lahko ogrožena — pokliči ponudnika ali prilagodi načrt.",
        en: "The booking may be at risk — call the provider or adjust the plan.",
        it: "La prenotazione potrebbe essere a rischio — chiama il fornitore o modifica il piano.",
        de: "Die Buchung könnte gefährdet sein — ruf den Anbieter an oder passe den Plan an.",
        fr: "La réservation peut être menacée — appelle le prestataire ou ajuste le plan.",
        es: "La reserva puede estar en riesgo — llama al proveedor o ajusta el plan.",
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
        it: `Prenotazione alle ${reserve.bookingStart} · arrivo previsto ~${reserve.eta.hhmm} (${reserve.reserveMin} min di margine).`,
        de: `Buchung um ${reserve.bookingStart} · voraussichtliche Ankunft ~${reserve.eta.hhmm} (${reserve.reserveMin} Min. Puffer).`,
        fr: `Réservation à ${reserve.bookingStart} · arrivée estimée ~${reserve.eta.hhmm} (${reserve.reserveMin} min de marge).`,
        es: `Reserva a las ${reserve.bookingStart} · llegada estimada ~${reserve.eta.hhmm} (${reserve.reserveMin} min de margen).`,
      },
      reason: {
        sl: "Prihod je izvedljiv, a z ozko rezervo.",
        en: "The arrival is feasible, but with a tight margin.",
        it: "L'arrivo è fattibile, ma con un margine stretto.",
        de: "Die Ankunft ist machbar, aber mit knappem Puffer.",
        fr: "L'arrivée est faisable, mais avec une marge juste.",
        es: "La llegada es factible, pero con un margen ajustado.",
      },
      impact: {
        sl: "Kakršna koli zamuda lahko ogrozi termin.",
        en: "Any delay may put the booking at risk.",
        it: "Qualsiasi ritardo può mettere a rischio la prenotazione.",
        de: "Jede Verzögerung kann die Buchung gefährden.",
        fr: "Tout retard peut mettre la réservation en danger.",
        es: "Cualquier retraso puede poner en riesgo la reserva.",
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
            it: `La prenotazione delle ${reserve.bookingStart} è iniziata ${overMin} min fa.`,
            de: `Die Buchung um ${reserve.bookingStart} hat vor ${overMin} Min. begonnen.`,
            fr: `La réservation de ${reserve.bookingStart} a commencé il y a ${overMin} min.`,
            es: `La reserva de las ${reserve.bookingStart} empezó hace ${overMin} min.`,
          },
          reason: {
            sl: "Termin je časovno ogrožen — teče že dlje časa.",
            en: "The booking is time at risk — it has been running for a while.",
            it: "La prenotazione è a rischio temporale — è in corso da un po'.",
            de: "Die Buchung ist zeitlich gefährdet — sie läuft schon eine Weile.",
            fr: "La réservation est menacée dans le temps — elle est en cours depuis un moment.",
            es: "La reserva está en riesgo temporal — lleva un tiempo en curso.",
          },
          impact: {
            sl: "Preveri pri ponudniku, ali termin še velja.",
            en: "Check with the provider whether the booking still holds.",
            it: "Verifica con il fornitore se la prenotazione è ancora valida.",
            de: "Prüfe beim Anbieter, ob die Buchung noch gilt.",
            fr: "Vérifie auprès du prestataire si la réservation tient toujours.",
            es: "Verifica con el proveedor si la reserva sigue en pie.",
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
            it: `La prenotazione delle ${reserve.bookingStart} è già iniziata (${overMin} min fa).`,
            de: `Die Buchung um ${reserve.bookingStart} läuft bereits (seit ${overMin} Min.).`,
            fr: `La réservation de ${reserve.bookingStart} a déjà commencé (il y a ${overMin} min).`,
            es: `La reserva de las ${reserve.bookingStart} ya ha empezado (hace ${overMin} min).`,
          },
          reason: {
            sl: "Termin teče — vstop je še mogoč, a čas teče.",
            en: "The booking is running — entry is still possible, but time passes.",
            it: "La prenotazione è in corso — l'ingresso è ancora possibile, ma il tempo passa.",
            de: "Die Buchung läuft — der Eintritt ist noch möglich, aber die Zeit läuft.",
            fr: "La réservation est en cours — l'entrée est encore possible, mais le temps passe.",
            es: "La reserva está en curso — todavía se puede entrar, pero el tiempo pasa.",
          },
          impact: {
            sl: "Priporočamo takojšnjo navigacijo do lokacije.",
            en: "We recommend navigating to the location right away.",
            it: "Consigliamo di navigare subito verso la posizione.",
            de: "Wir empfehlen, sofort zum Ort zu navigieren.",
            fr: "Nous recommandons de naviguer immédiatement vers le lieu.",
            es: "Recomendamos navegar de inmediato hasta la ubicación.",
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
          it: `${a.card.entry.title} alle ${a.card.entry.time?.start} e ${b.card.entry.title} alle ${b.card.entry.time?.start}.`,
          de: `${a.card.entry.title} um ${a.card.entry.time?.start} und ${b.card.entry.title} um ${b.card.entry.time?.start}.`,
          fr: `${a.card.entry.title} à ${a.card.entry.time?.start} et ${b.card.entry.title} à ${b.card.entry.time?.start}.`,
          es: `${a.card.entry.title} a las ${a.card.entry.time?.start} y ${b.card.entry.title} a las ${b.card.entry.time?.start}.`,
        },
        reason: {
          sl: "Dva fiksna termina se časovno prekrivata.",
          en: "Two fixed bookings overlap in time.",
          it: "Due prenotazioni fisse si sovrappongono nel tempo.",
          de: "Zwei feste Buchungen überschneiden sich zeitlich.",
          fr: "Deux réservations fixes se chevauchent dans le temps.",
          es: "Dos reservas fijas se solapan en el tiempo.",
        },
        impact: {
          sl: "Enega od terminov bo treba prestaviti ali preskočiti.",
          en: "One of the bookings will need to be moved or skipped.",
          it: "Una delle due prenotazioni dovrà essere spostata o saltata.",
          de: "Eine der Buchungen muss verschoben oder übersprungen werden.",
          fr: "L'une des réservations devra être déplacée ou passée.",
          es: "Habrá que mover u omitir una de las dos reservas.",
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
          it: `Tra le ${prev.entry.time?.start} e le ${cur.entry.time?.start} ci sono ${gapMin} min; percorso + tappa richiedono ~${requiredMin} min.`,
          de: `Zwischen ${prev.entry.time?.start} und ${cur.entry.time?.start} liegen ${gapMin} Min.; Route + Station brauchen ~${requiredMin} Min.`,
          fr: `Entre ${prev.entry.time?.start} et ${cur.entry.time?.start}, il y a ${gapMin} min ; trajet + arrêt exigent ~${requiredMin} min.`,
          es: `Entre las ${prev.entry.time?.start} y las ${cur.entry.time?.start} hay ${gapMin} min; ruta + parada requieren ~${requiredMin} min.`,
        },
        reason: {
          sl: `Znana trasa (${labelOfLegSource(leg.source, "sl")}) ne spravi obeh terminov.`,
          en: `The known route (${labelOfLegSource(leg.source, "en")}) cannot fit both bookings.`,
          it: `Il percorso noto (${labelOfLegSource(leg.source, "it")}) non riesce a far entrare entrambe le prenotazioni.`,
          de: `Die bekannte Route (${labelOfLegSource(leg.source, "de")}) schafft beide Buchungen nicht.`,
          fr: `L'itinéraire connu (${labelOfLegSource(leg.source, "fr")}) ne peut pas faire tenir les deux réservations.`,
          es: `La ruta conocida (${labelOfLegSource(leg.source, "es")}) no logra encajar ambas reservas.`,
        },
        impact: {
          sl: "Drug termin je v nevarnosti, če se pri prvem zadržiš polno trajanje.",
          en: "The second booking is at risk if you stay the full duration at the first.",
          it: "La seconda prenotazione è a rischio se resti per tutta la durata alla prima.",
          de: "Die zweite Buchung ist gefährdet, wenn du bei der ersten die volle Dauer bleibst.",
          fr: "La deuxième réservation est menacée si tu restes toute la durée à la première.",
          es: "La segunda reserva está en riesgo si te quedas toda la duración en la primera.",
        },
        actions: ["NAVIGATE", "ADJUST_PLAN", "SKIP"],
      });
    }
  }
}

/** Oznaka vira noge — 6-jezična (vstavlja se v reason stavek; prej je
 *  SL »ocena« puščala cel v EN stavek — Sklop 8 popravek). */
function labelOfLegSource(source: "osrm" | "heuristic", lang: GoLang): string {
  if (source === "osrm") return "OSRM"; // lastno ime — jezikovno nevtralno
  return GL(lang, LEG_SOURCE_HEURISTIC);
}

const LEG_SOURCE_HEURISTIC: GoStrings = {
  sl: "ocena",
  en: "estimate",
  it: "stima",
  de: "Schätzung",
  fr: "estimation",
  es: "estimación",
};

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
      it: "La giornata ha diversi orari fissi, ma le durate tra le tappe non sono note.",
      de: "Der Tag hat mehrere feste Zeiten, aber die Dauer zwischen den Stationen ist unbekannt.",
      fr: "La journée compte plusieurs horaires fixes, mais les durées entre les arrêts sont inconnues.",
      es: "El día tiene varios horarios fijos, pero las duraciones entre paradas se desconocen.",
    },
    reason: {
      sl: "Brez znanega trajanja med postanki rezerv ne moremo preveriti.",
      en: "Without known durations between stops we cannot verify the reserves.",
      it: "Senza durate note tra le tappe non possiamo verificare i margini.",
      de: "Ohne bekannte Dauer zwischen den Stationen können wir die Reserven nicht prüfen.",
      fr: "Sans durées connues entre les arrêts, nous ne pouvons pas vérifier les marges.",
      es: "Sin duraciones conocidas entre paradas no podemos verificar los márgenes.",
    },
    impact: {
      sl: "Vklopi GPS — ocena iz trenutne lokacije omogoči vsaj rezervo do naslednjega termina.",
      en: "Turn on GPS — an estimate from your position gives at least the reserve to the next booking.",
      it: "Attiva il GPS — una stima dalla tua posizione dà almeno il margine fino alla prossima prenotazione.",
      de: "Aktiviere das GPS — eine Schätzung von deiner Position ergibt mindestens die Reserve bis zur nächsten Buchung.",
      fr: "Active le GPS — une estimation depuis ta position donne au moins la marge jusqu'à la prochaine réservation.",
      es: "Activa el GPS — una estimación desde tu posición da al menos el margen hasta la próxima reserva.",
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
      it: `Arrivo previsto ~${eta.hhmm} · chiuso a quell'ora.`,
      de: `Voraussichtliche Ankunft ~${eta.hhmm} · zu dieser Zeit geschlossen.`,
      fr: `Arrivée estimée ~${eta.hhmm} · fermé à cette heure.`,
      es: `Llegada estimada ~${eta.hhmm} · cerrado a esa hora.`,
    },
    reason: {
      sl: `Odpiralni časi vira (${raw}) ne pokrivajo predvidenega prihoda.`,
      en: `The source opening hours (${raw}) do not cover the estimated arrival.`,
      it: `Gli orari di apertura della fonte (${raw}) non coprono l'arrivo previsto.`,
      de: `Die Öffnungszeiten der Quelle (${raw}) decken die voraussichtliche Ankunft nicht ab.`,
      fr: `Les horaires d'ouverture de la source (${raw}) ne couvrent pas l'arrivée estimée.`,
      es: `El horario de la fuente (${raw}) no cubre la llegada estimada.`,
    },
    impact: {
      sl: "Ob tem prihodu cilj ne bo odprt — premakni obisk ali potuj prej.",
      en: "The destination will be closed on this arrival — move the visit or travel earlier.",
      it: "A questo arrivo la destinazione sarà chiusa — sposta la visita o parti prima.",
      de: "Bei dieser Ankunft ist das Ziel geschlossen — verschiebe den Besuch oder fahre früher los.",
      fr: "À cette arrivée, la destination sera fermée — déplace la visite ou pars plus tôt.",
      es: "Con esta llegada el destino estará cerrado — mueve la visita o viaja antes.",
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
        it: "La prenotazione presso il fornitore è CANCELLATA.",
        de: "Die Buchung beim Anbieter ist STORNIERT.",
        fr: "La réservation chez le prestataire est ANNULÉE.",
        es: "La reserva en el proveedor está CANCELADA.",
      },
      reason: {
        sl: "Ponudnik je rezervacijo preklical — stanje je zabeleženo v tvojem potrdilnem dokumentu.",
        en: "The provider cancelled the booking — the state is recorded in your confirmation document.",
        it: "Il fornitore ha cancellato la prenotazione — lo stato è registrato nel tuo documento di conferma.",
        de: "Der Anbieter hat die Buchung storniert — der Status ist in deinem Bestätigungsdokument vermerkt.",
        fr: "Le prestataire a annulé la réservation — l'état est consigné dans ton document de confirmation.",
        es: "El proveedor ha cancelado la reserva — el estado consta en tu documento de confirmación.",
      },
      impact: {
        sl: "Obisk brez rezervacije morda ni mogoč — preuredi pot ali se dogovori neposredno.",
        en: "A visit without a booking may not be possible — rearrange the plan or arrange directly.",
        it: "Una visita senza prenotazione potrebbe non essere possibile — riorganizza il piano o accordati direttamente.",
        de: "Ein Besuch ohne Buchung ist vielleicht nicht möglich — plane um oder vereinbare direkt.",
        fr: "Une visite sans réservation peut être impossible — réorganise le plan ou arrange-toi directement.",
        es: "Una visita sin reserva quizás no sea posible — reorganiza el plan o acuerda directamente.",
      },
      actions: isNext
        ? ["VIEW_BOOKING", "ADJUST_PLAN", "SKIP"]
        : ["ADJUST_PLAN", "SKIP"],
    });
  }
}

// ---------------------------------------------------------------------------
// UI OZNAKE (naslovi vrst konfliktov — 6-jezično, Sklop 8 faza 2)
// ---------------------------------------------------------------------------

export const CONFLICT_LABELS: Record<GuardianConflictKind, GoStrings> = {
  AT_RISK_BOOKING: {
    sl: "Termin je ogrožen",
    en: "Booking at risk",
    it: "Prenotazione a rischio",
    de: "Buchung gefährdet",
    fr: "Réservation menacée",
    es: "Reserva en riesgo",
  },
  TIGHT_BOOKING: {
    sl: "Ozek prihod",
    en: "Tight arrival",
    it: "Arrivo stretto",
    de: "Knappe Ankunft",
    fr: "Arrivée juste",
    es: "Llegada ajustada",
  },
  OVERLAP_FIXED: {
    sl: "Prekrivanje terminov",
    en: "Overlapping bookings",
    it: "Prenotazioni sovrapposte",
    de: "Überschneidende Buchungen",
    fr: "Réservations qui se chevauchent",
    es: "Reservas solapadas",
  },
  TOO_TIGHT_LEG: {
    sl: "Prekratek prehod",
    en: "Too tight a transfer",
    it: "Trasferimento troppo stretto",
    de: "Zu knapper Übergang",
    fr: "Transfert trop juste",
    es: "Translado demasiado ajustado",
  },
  STARTED_BOOKING: {
    sl: "Termin že teče",
    en: "Booking already started",
    it: "Prenotazione già iniziata",
    de: "Buchung läuft bereits",
    fr: "Réservation déjà commencée",
    es: "Reserva ya iniciada",
  },
  PAST_BOOKING: {
    sl: "Termin je zamujen",
    en: "Booking missed",
    it: "Prenotazione mancata",
    de: "Buchung verpasst",
    fr: "Réservation manquée",
    es: "Reserva perdida",
  },
  MISSING_GEO: {
    sl: "Lokacija ni znana",
    en: "Location unknown",
    it: "Posizione sconosciuta",
    de: "Standort unbekannt",
    fr: "Emplacement inconnu",
    es: "Ubicación desconocida",
  },
  UNKNOWN_ROUTE: {
    sl: "Trajanje ni znano",
    en: "Duration unknown",
    it: "Durata sconosciuta",
    de: "Dauer unbekannt",
    fr: "Durée inconnue",
    es: "Duración desconocida",
  },
  CLOSED_ON_ARRIVAL: {
    sl: "Zaprto ob prihodu",
    en: "Closed on arrival",
    it: "Chiuso all'arrivo",
    de: "Bei Ankunft geschlossen",
    fr: "Fermé à l'arrivée",
    es: "Cerrado a la llegada",
  },
  CANCELLED_BOOKING: {
    sl: "Rezervacija preklicana",
    en: "Booking cancelled",
    it: "Prenotazione cancellata",
    de: "Buchung storniert",
    fr: "Réservation annulée",
    es: "Reserva cancelada",
  },
} as const;

/** Izpis dejanj (Go Mode gumbi — ISTA imena kot obstoječi UX kanon). */
export const GUARDIAN_ACTION_LABELS: Record<
  GuardianActionId,
  GoStrings
> = {
  NAVIGATE: {
    sl: "Navigiraj",
    en: "Navigate",
    it: "Naviga",
    de: "Navigieren",
    fr: "Naviguer",
    es: "Navegar",
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
    sl: "Prilagodi mojo pot",
    en: "Adjust my trip",
    it: "Modifica il mio viaggio",
    de: "Meine Reise anpassen",
    fr: "Ajuster mon voyage",
    es: "Ajustar mi viaje",
  },
  VIEW_BOOKING: {
    sl: "Odpri rezervacijo",
    en: "Open booking",
    it: "Apri la prenotazione",
    de: "Buchung öffnen",
    fr: "Ouvrir la réservation",
    es: "Abrir la reserva",
  },
  COMPLETE: {
    sl: "Opravi",
    en: "Complete",
    it: "Completa",
    de: "Abschließen",
    fr: "Terminer",
    es: "Completar",
  },
} as const;

/** Pomožna za izpis HH:MM iz minut (uporabljajo testen/UX — čista). */
export { minutesToHhmm };
