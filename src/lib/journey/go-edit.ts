// ============================================================================
// ISSUE #22 — TRAVEL GUARDIAN: GO TRIP UREDITEV (čista projekcija zapisa)
// ============================================================================
// Dodajanje nearby kandidata v AKTIVNI dan Go Mode potovanja (§9 E2E-8
// "add one nearby option"). ČISTA funkcija: sprejme zapis, vrne NOV zapis
// (0 mutacij, 0 I/O) — persistanco opravi klicnik (saveItineraryGoTrip).
//
// PRAVILA (iskrenost + #21 kanon):
//  - SAMO v2 zapisi (AI itinerer — MyTripView): v1 (kanonična TravelJourney
//    pot iz /potovanje) se NE mutira (izbire živijo v selectedIds —
//    kandidat iz zemljevida NI produkt te poti; vrnemo null → UX pokaže
//    iskreno opombo + povezavo na zemljevid);
//  - nov postanek se doda NA KONEC aktivnega dneva (vrstni red obstoječih
//    postankov se NE spremeni — ZERO reordering brez uporabnikove odločitve);
//  - ISSUE #24 Sklop 9 (1.171.0) — SREDI DNEVA (TripIt Nearby vzorec): kadar
//    dodajanje pride iz PROSTEGA ČASOVNEGA OKNA, klicnik poda `beforeKey`
//    (naslednji postanek s terminom) → kandidat se vstavi PRED NJEGA na
//    trenutni položaj v dnevu (uporabnik ga obišče ZDAJ, ne čez tri postanke);
//    vrstni red obstoječih postankov se TUDI TU ne spremeni (vstavek ≠
//    preurejanje); `beforeKey`, ki NI v dnevu → pošten konec dneva;
//    varnostna rezerva okna ostaja NESPREMENJENA (zanka ≤ okno, §9/§10 —
//    free-time.ts filter pred dodajanjem ŽE matematično zagotavlja, da
//    termin ostane dosegljiv);
//  - ključ je unikaten (`nearby:{id}`) in vsebuje izvor — stabilni ključi
//    #21 §19 (preurejanje načrta NE razveljavi napredka);
//  - nov zapis nosi savedAt trenutka (ISTO semantiko kot save).
// ============================================================================

import type { GoTripRecord, GoTripRecordV2 } from "./go-persist";
import type { TripEntry } from "./trip-view";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import type { ProductType } from "@/lib/supply/types";
import { CATEGORY_TO_PRODUCT_TYPES, type GuardianNearbyCategory } from "./free-time";

// ---------------------------------------------------------------------------
// TIP
// ---------------------------------------------------------------------------

/** Kandidat za dodajanje (iz /api/map/pins — Minimalna oblika). */
export interface NearbyAddCandidate {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: GuardianNearbyCategory;
}

// ---------------------------------------------------------------------------
// GLAVNA FUNKCIJA
// ---------------------------------------------------------------------------

/** Možnosti dodajanja (ISSUE #24 Sklop 9 — sredi dneva, TripIt Nearby). */
export interface NearbyAddOptions {
  /** Ključ vnosa, PRED katerega se kandidat vstavi (naslednji postanek z
   *  terminom iz prostega časa). null/undefined/ni v dnevu → konec dneva
   *  (staro vedenje — kompatibilnost). Vstavek NE preureja obstoječih. */
  beforeKey?: string | null;
}

/**
 * Doda nearby kandidata v aktivni dan (ČISTO — nov zapis).
 *
 *  - brez možnosti (ali `beforeKey` ni najden v dnevu): NA KONEC dneva
   *    (vrstni red obstoječih se ne spremeni — kanon #22);
 *  - z veljavnim `beforeKey` (Sklop 9): VSTAVI PRED ta vnos — kandidat iz
   *    prostega časa se obišče ZDAJ (na trenutnem položaju v dnevu), ne
   *    čez tri postanke; obstoječi vrstni red ostane NETAKNJEN.
 *
 * Vrne null, kadar dodajanje NI mogoče:
 *  - v1 zapis (kanonična pot — ne mutiramo izbire selectedIds);
 *  - neveljaven indeks dneva ali prazen dan;
 *  - kandidat brez veljavnih koordinat (fail-closed).
 */
export function addNearbyStopToRecord(
  record: GoTripRecord,
  candidate: NearbyAddCandidate,
  activeDayIndex: number,
  opts?: NearbyAddOptions
): GoTripRecordV2 | null {
  if (record.version !== 2) return null; // v1: iskrena zavrnitev (UX pove zakaj)
  if (!Number.isInteger(activeDayIndex) || activeDayIndex < 0) return null;
  if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) return null;

  const days = record.view.days;
  if (activeDayIndex >= days.length) return null;

  const entry = nearbyCandidateToEntry(candidate);
  const day = days[activeDayIndex];

  const insertAt = nearbyInsertIndex(day.entries, opts?.beforeKey);
  const newEntries = [...day.entries];
  newEntries.splice(insertAt, 0, entry);

  const newDays = days.map((d, i) =>
    i === activeDayIndex ? { ...d, entries: newEntries } : d
  );

  return {
    ...record,
    savedAt: new Date().toISOString(),
    view: { ...record.view, days: newDays },
  };
}

/**
 * Indeks vstavitve v dnevu (ČISTO): ključ `beforeKey` najden v dnevu → njegov
 * indeks (vstavek PRED njim); sicer (null/undefined/ni v dnevu/prazen dan)
 * → dolžina dneva (konec — staro vedenje). Vojaško preprosto, brez
 * preurejanja: obstoječi vrstni red ostane identičen v OBEH primerih.
 */
export function nearbyInsertIndex(
  dayEntries: ReadonlyArray<{ key: string }>,
  beforeKey: string | null | undefined
): number {
  if (beforeKey == null) return dayEntries.length;
  const i = dayEntries.findIndex((e) => e.key === beforeKey);
  return i === -1 ? dayEntries.length : i;
}

/** Ali zapis sploh dovoljuje dodajanje (v2 — za UX pogoj). */
export function canAddNearbyStops(record: GoTripRecord): boolean {
  return record.version === 2;
}

// ---------------------------------------------------------------------------
// KANDIDAT → TRIP ENTRY (čista preslikava)
// ---------------------------------------------------------------------------

/** Kanonski ProductType kategorije (prvi tip — ikona taksonomije). */
function productTypeOfCategory(category: GuardianNearbyCategory): ProductType {
  return CATEGORY_TO_PRODUCT_TYPES[category][0];
}

/**
 * Preslikava kandidata v pošten TripEntry:
 *  - vir je IZRECNO razkrit (providerLabel "Zemljevid (v bližini)" —
 *    uporabnik ve, odkod je postanek);
 *  - status INFO (ni rezervacije — nič ne izmišljujemo);
 *  - brez časa (timeNote pove, da je bil dodan med potjo);
 *  - geo po #21 pogodbi (lat/lng prisotna — map pins jih imajo vedno).
 */
export function nearbyCandidateToEntry(candidate: NearbyAddCandidate): TripEntry {
  const type = productTypeOfCategory(candidate.category);
  return {
    key: `nearby:${candidate.id}`,
    category: type === "restaurant" ? "restaurants" : "attractions",
    icon: taxonomyOf(type).icon,
    title: candidate.name,
    providerLabel: { sl: "Zemljevid (v bližini)", en: "Map (nearby)" },
    timeNote: {
      sl: "Dodano med potjo iz zemljevida — brez fiksnega termina.",
      en: "Added during the trip from the map — no fixed time.",
    },
    lat: candidate.lat,
    lng: candidate.lng,
    status: "INFO",
    statusLabel: { sl: "Samo informacija — brez rezervacije", en: "Information only — no booking" },
    cancellation: { sl: "Ni rezervacije — nič za preklicati.", en: "No booking — nothing to cancel." },
    bookingId: null,
  };
}

// ---------------------------------------------------------------------------
// UI OZNAKE (6-jezične — ISSUE #24 Sklop 8 faza 2)
// ---------------------------------------------------------------------------

export const GO_EDIT_LABELS = {
  added: {
    sl: (title: string) => `✓ ${title} dodan na konec dneva.`,
    en: (title: string) => `✓ ${title} added to the end of the day.`,
    it: (title: string) => `✓ ${title} aggiunto alla fine della giornata.`,
    de: (title: string) => `✓ ${title} am Ende des Tages hinzugefügt.`,
    fr: (title: string) => `✓ ${title} ajouté à la fin de la journée.`,
    es: (title: string) => `✓ ${title} añadido al final del día.`,
  },
  // ISSUE #24 Sklop 9 (1.171.0): dodajanje SREDI dneva (iz prostega časa —
  // vstavek pred naslednji postanek; TripIt Nearby vzorec).
  addedMid: {
    sl: (title: string) => `✓ ${title} dodan pred naslednji postanek.`,
    en: (title: string) => `✓ ${title} added before your next stop.`,
    it: (title: string) => `✓ ${title} aggiunto prima della prossima tappa.`,
    de: (title: string) => `✓ ${title} vor der nächsten Station hinzugefügt.`,
    fr: (title: string) => `✓ ${title} ajouté avant le prochain arrêt.`,
    es: (title: string) => `✓ ${title} añadido antes de la siguiente parada.`,
  },
  notPossibleV1: {
    sl: "Ta pot je kanonična (iz načrtovalnika potovanj) — dodajanje med potjo ni mogoče. Odpri lokacijo na zemljevidu.",
    en: "This trip is canonical (from the journey planner) — adding stops mid-trip is not possible. Open the location on the map.",
    it: "Questo viaggio è canonico (dal pianificatore di viaggio) — aggiungere tappe durante il viaggio non è possibile. Apri la posizione sulla mappa.",
    de: "Diese Reise ist kanonisch (aus dem Reiseplaner) — Hinzufügen von Stationen unterwegs ist nicht möglich. Öffne den Ort auf der Karte.",
    fr: "Ce voyage est canonique (du planificateur de voyage) — ajouter des arrêts en cours de route n'est pas possible. Ouvre le lieu sur la carte.",
    es: "Este viaje es canónico (del planificador de viajes) — añadir paradas durante el trayecto no es posible. Abre la ubicación en el mapa.",
  },
  mapLink: {
    sl: "Odpri na zemljevidu",
    en: "Open on the map",
    it: "Apri sulla mappa",
    de: "Auf der Karte öffnen",
    fr: "Ouvrir sur la carte",
    es: "Abrir en el mapa",
  },
} as const;
