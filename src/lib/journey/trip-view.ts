// ============================================================================
// TASK 58 §20–§21 — "MY TRIP" pogled + POTRDITVENI DOKUMENT (čista plast)
// ============================================================================
// Gradi ENO časovnico potovanja iz kanonskega TravelJourney + uporabnikovih
// izbir. ČISTA, deterministična funkcija (0 omrežja, 0 db) — testirljiva.
//
// ISKRENOST (§20 "Every item must show its real status", §21, §23):
//  - ČAS se pokaže SAMO tam, kjer je realen podatek (uporabnikov vpis prihoda,
//    trajanje transferja IZ vira, datum dogodka IZ vira, odpiralni časi OSM).
//    NIKOLI ne izmislimo check-in ure večerne rezervacije ipd. — polje
//    timeNote pove ZAKAJ časa ni.
//  - STATUS je izpeljan iz zmožnosti rezervacije produkta (EXTERNAL za
//    affiliate/api-external tok, INFO za info_only). Potrjene rezervacije
//    (CONFIRMED) obstajajo SAMO iz providerjevega odgovora — danes 0
//    (0 API_BOOKING ponudnikov) → dokument pokaže "zunanja rezervacija",
//    NIKOLI "potrjena rezervacija".
//  - BOOKING ID: SAMO iz dejanskega JourneyBooking zapisa (danes vedno null
//    — številke potrditve NE izdelujemo, §21).
// ============================================================================

import type {
  JourneyCategoryKey,
  JourneyProduct,
  TravelJourney,
} from "./types";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import { getProvider } from "@/lib/supply/registry";
import type { PriceInfo } from "@/lib/supply/types";

/** Status postavke potovanja (realen — nikoli "CONFIRMED" brez dokaza). */
export type TripItemStatus =
  | "EXTERNAL" // rezervacija/plačilo/potrditev pri ponudniku
  | "INFO" // informacija (ni rezervacije)
  | "CONFIRMED" // SAMO iz providerjevega odgovora (JourneyBooking)
  | "PENDING"
  | "FAILED"
  | "CANCELLED"
  | "UNKNOWN";

/** Enota časovnice (vsa dvojezična polja — L vzorec). */
export interface TripEntry {
  key: string;
  category: JourneyCategoryKey | "arrival";
  icon: string;
  title: string;
  providerLabel: { sl: string; en: string };
  /** ISO datum — SAMO realen (dogodek iz vira / datum prihoda uporabnika). */
  date?: string;
  /** Čas — SAMO realen (vpis uporabnika / trajanje iz vira). */
  time?: { start: string; end?: string };
  /** Zakaj časa NI (iskrena opomba namesto izumljene ure). */
  timeNote?: { sl: string; en: string };
  location?: string;
  /** Geo koordinate (TASK 64 Go Mode — razdalja/smer med potovanjem; SAMO kjer ima vir geo). */
  lat?: number;
  lng?: number;
  /** Surovi odpiralni časi vira (OSM opening_hours — nikoli parsrani). */
  openingHours?: string;
  /** Telefon vira (uporabno med potovanjem — pokliči). */
  phone?: string;
  durationMin?: number;
  price?: PriceInfo;
  status: TripItemStatus;
  statusLabel: { sl: string; en: string };
  bookingUrl?: string;
  sourceUrl?: string;
  /** ID produkta pri ponudniku (kanonski — za potrditveni dokument §21). */
  providerProductId?: string;
  /** Preklic (§21) — pošteno, ker nimamo pogodb o preklicu ponudnikov. */
  cancellation: { sl: string; en: string };
  /** Številka rezervacije — SAMO iz providerjevega odgovora (danes null). */
  bookingId: string | null;
}

export interface MyTripDay {
  dateLabel: { sl: string; en: string };
  date?: string;
  entries: TripEntry[];
}

export interface MyTripView {
  title: { sl: string; en: string };
  days: MyTripDay[];
  /** Zunanje kategorije (najem avta) — affiliate kartice, NE inventar. */
  externalCards: TripEntry[];
  /** Potrditveni dokument (§21) — globalna poštenost. */
  confirmation: {
    confirmedCount: number;
    note: { sl: string; en: string };
  };
  generatedAt: string;
}

// ---------------------------------------------------------------------------
// Pomožne (čiste)
// ---------------------------------------------------------------------------

const MONTHS_SL = [
  "januar", "februar", "marec", "april", "maj", "junij",
  "julij", "avgust", "september", "oktober", "november", "december",
];
const MONTHS_EN = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateLabel(iso: string): { sl: string; en: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return { sl: iso, en: iso };
  const [, y, mm, dd] = m;
  const mi = Number(mm) - 1;
  return {
    sl: `${Number(dd)}. ${MONTHS_SL[mi] ?? mm} ${y}`,
    en: `${MONTHS_EN[mi] ?? mm} ${Number(dd)}, ${y}`,
  };
}

function addMinutes(hhmm: string, minutes: number): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return hhmm;
  const total = Number(m[1]) * 60 + Number(m[2]) + minutes;
  const hh = Math.floor((total / 60) % 24);
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/** Status iz zmožnosti rezervacije produkta (nikoli glede na željo). */
function statusOfProduct(
  p: JourneyProduct
): { status: TripItemStatus; label: { sl: string; en: string } } {
  if (p.booking.flow === "external_affiliate" || p.booking.flow === "api_booking") {
    // API_BOOKING: dokler provider NE vrne potrditve, je stanje zunanje
    // (SELECTED → uporabnik še rezervira pri ponudniku). CONFIRMED samo iz
    // JourneyBooking zapisa (validateConfirmationRecord meja).
    return {
      status: "EXTERNAL",
      label: {
        sl: "Zunanja rezervacija — pri ponudniku",
        en: "External booking — at the provider",
      },
    };
  }
  return {
    status: "INFO",
    label: { sl: "Samo informacija — brez rezervacije", en: "Information only — no booking" },
  };
}

/** Oznaka ponudnika IZ registra (provider-agnostic — §24; ni if-provider). */
function providerLabelOf(p: JourneyProduct): { sl: string; en: string } {
  if (p.provider === "events") {
    return { sl: "Lokalni koledar dogodkov", en: "Local events calendar" };
  }
  const entry = getProvider(p.provider);
  return entry ? entry.labels : { sl: String(p.provider), en: String(p.provider) };
}

const CANCELLATION_EXTERNAL = {
  sl: "Pogoji preklica in vračila veljajo pri ponudniku — pred rezervacijo preveri njihove pogoje.",
  en: "Cancellation and refund terms apply at the provider — check their terms before booking.",
};
const CANCELLATION_INFO = {
  sl: "Ni rezervacije — nič za preklicati.",
  en: "No booking — nothing to cancel.",
};

function productToEntry(p: JourneyProduct): TripEntry {
  const status = statusOfProduct(p);
  return {
    key: p.id,
    category: p.category,
    icon: taxonomyOf(p.type).icon,
    title: p.title,
    providerLabel: providerLabelOf(p),
    ...(p.address ? { location: p.address } : {}),
    ...(p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : {}),
    ...(p.openingHours ? { openingHours: p.openingHours } : {}),
    ...(p.phone ? { phone: p.phone } : {}),
    ...(p.durationMin != null ? { durationMin: p.durationMin } : {}),
    ...(p.price ? { price: p.price } : {}),
    status: status.status,
    statusLabel: status.label,
    ...(p.bookingUrl ? { bookingUrl: p.bookingUrl } : {}),
    ...(p.sourceUrl ? { sourceUrl: p.sourceUrl } : {}),
    providerProductId: p.providerProductId,
    cancellation:
      status.status === "EXTERNAL" ? CANCELLATION_EXTERNAL : CANCELLATION_INFO,
    bookingId: null, // SAMO iz JourneyBooking (danes 0 zapisov — §21 iskrenost)
  };
}

// ---------------------------------------------------------------------------
// GLAVNI GRADILNIK
// ---------------------------------------------------------------------------

/**
 * Zgradi MY TRIP pogled (§20) iz potovanja + izbranih ID-jev produktov.
 * Dan 1 = datum prihoda (vpis uporabnika): prihod (ura vpisana), transferji
 * (trajanje IZ vira), nato izbrane nastanitve/restavracije/bencin BREZ
 * izumljenih ur (timeNote pove zakaj). Dogodki na SVOJIH realnih datumih.
 * Najem = zunanja kartica (affiliate ≠ inventar).
 */
export function buildMyTrip(
  journey: TravelJourney,
  selectedIds: ReadonlySet<string>
): MyTripView {
  const selected = (p: JourneyProduct) => selectedIds.has(p.id);

  const arrivalEntry: TripEntry = {
    key: "arrival",
    category: "arrival",
    icon: "✈️",
    title:
      journey.lang === "en"
        ? `Arrival: ${journey.origin.label}`
        : `Prihod: ${journey.origin.label}`,
    providerLabel: { sl: "Vpis popotnika", en: "Traveler input" },
    ...(journey.startDate ? { date: journey.startDate } : {}),
    ...(journey.arrivalTime
      ? { time: { start: journey.arrivalTime } }
      : {
          timeNote: {
            sl: "Ura prihoda ni vnesena.",
            en: "Arrival time not entered.",
          },
        }),
    ...(journey.origin.lat != null && journey.origin.lng != null
      ? {
          location: `${journey.origin.lat.toFixed(4)}, ${journey.origin.lng.toFixed(4)}`,
          lat: journey.origin.lat,
          lng: journey.origin.lng,
        }
      : {}),
    status: "INFO",
    statusLabel: { sl: "Vpis popotnika", en: "Traveler input" },
    cancellation: CANCELLATION_INFO,
    bookingId: null,
  };

  // --- Dan 1: prihod + transferji (realni časi) + ostalo brez ur ---
  const day1: TripEntry[] = [arrivalEntry];

  const transfers = journey.categories.transfer.products.filter(selected);
  for (const t of transfers) {
    const entry = productToEntry(t);
    if (t.durationMin != null && journey.arrivalTime) {
      entry.time = {
        start: journey.arrivalTime,
        end: addMinutes(journey.arrivalTime, t.durationMin),
      };
    } else {
      entry.timeNote = {
        sl: "Trajanje ni znano iz vira.",
        en: "Duration not known from the source.",
      };
    }
    day1.push(entry);
  }

  const hotels = journey.categories.accommodation.products.filter(selected);
  for (const h of hotels) {
    const entry = productToEntry(h);
    entry.timeNote = h.openingHours
      ? { sl: `Odpiralni čas vira: ${h.openingHours}`, en: `Source opening hours: ${h.openingHours}` }
      : {
          sl: "Ura prihoda/oddaje ni objavljena v viru.",
          en: "Check-in/check-out time not published by the source.",
        };
    day1.push(entry);
  }

  const restaurants = journey.categories.restaurants.products.filter(selected);
  for (const r of restaurants) {
    const entry = productToEntry(r);
    entry.timeNote = r.openingHours
      ? { sl: `Odpiralni čas vira: ${r.openingHours}`, en: `Source opening hours: ${r.openingHours}` }
      : {
          sl: "Ura ni objavljena v viru.",
          en: "Time not published by the source.",
        };
    day1.push(entry);
  }

  const petrols = journey.categories.petrol.products.filter(selected);
  for (const p of petrols) {
    const entry = productToEntry(p);
    entry.timeNote = p.openingHours
      ? { sl: `Odpiralni čas vira: ${p.openingHours}`, en: `Source opening hours: ${p.openingHours}` }
      : undefined;
    day1.push(entry);
  }

  // TASK 63: znamenitosti — izbrane things-to-do točke (info_only, brez
  // rezervacije). Čas SAMO iz objavljenih odpiralnih ur vira; sicer
  // timeNote iskreno pove, zakaj časa ni (nikoli izumljenega urnika).
  const attractions = journey.categories.attractions?.products.filter(selected) ?? [];
  for (const a of attractions) {
    const entry = productToEntry(a);
    entry.timeNote = a.openingHours
      ? { sl: `Odpiralni čas vira: ${a.openingHours}`, en: `Source opening hours: ${a.openingHours}` }
      : {
          sl: "Odpiralni časi niso objavljeni v viru — načrtuj obisk po lastni želji.",
          en: "Opening hours are not published by the source — plan the visit at your own pace.",
        };
    day1.push(entry);
  }

  // --- Dogodki: SVOJI realni datumi (urna ni v viru — ne izmišljujemo) ---
  const eventEntries = journey.categories.events.products
    .filter(selected)
    .map((e) => {
      const entry = productToEntry(e);
      if (e.eventDate) {
        entry.date = e.eventDate.start;
        entry.timeNote = {
          sl: "Ura dogodka ni objavljena v viru (datum je).",
          en: "Event time not published by the source (date is).",
        };
      }
      return entry;
    });

  const eventDays: MyTripDay[] = [];
  for (const e of eventEntries) {
    if (!e.date) continue;
    const existing = eventDays.find((d) => d.date === e.date);
    if (existing) existing.entries.push(e);
    else
      eventDays.push({
        date: e.date,
        dateLabel: formatDateLabel(e.date),
        entries: [e],
      });
  }

  // --- Zunanje kartice (najem — affiliate, NE inventar) ---
  const externalCards: TripEntry[] = journey.categories.rental.providers.map(
    (prov) => ({
      key: `rental:${prov.provider}`,
      category: "rental" as const,
      icon: taxonomyOf("car_rental").icon,
      title: prov.label.sl,
      providerLabel: prov.label,
      status: "EXTERNAL" as const,
      statusLabel: {
        sl: "Zunanja rezervacija — pri ponudniku",
        en: "External booking — at the provider",
      },
      ...(prov.url ? { bookingUrl: prov.url } : {}),
      ...(prov.note ? { timeNote: prov.note } : {}),
      cancellation: CANCELLATION_EXTERNAL,
      bookingId: null,
    })
  );

  // TASK 72 — KRONOLOŠKI vrstni red dni: vir dogodke razvršča po pomembnosti
  // ( prekrivanje → prihajajoči → pretekli), ne po datumu — brez tega bi
  // časovnica in potrditveni dokument lahko kazali dni v napačnem zaporedju.
  // ISO datum se ureja leksikografsko = kronološko; dan brez datuma (prihod
  // brez vnosa) se s "" uredi PRVI (sidro časovnice). Stabilno: isti datum
  // ohrani vrstni red vstavljanja ( dan prihoda pred dogodkom istega dne).
  const dayOne: MyTripDay = {
    ...(journey.startDate ? { date: journey.startDate } : {}),
    dateLabel: journey.startDate
      ? formatDateLabel(journey.startDate)
      : { sl: "Datum prihoda ni vnesen", en: "Arrival date not entered" },
    entries: day1,
  };
  const days = [dayOne, ...eventDays].sort((a, b) =>
    (a.date ?? "").localeCompare(b.date ?? "")
  );

  const title = {
    sl: `MOJA POT — ${journey.destination.label.toUpperCase()}`,
    en: `MY TRIP — ${journey.destination.label.toUpperCase()}`,
  };

  return {
    title,
    days,
    externalCards,
    confirmation: {
      // Potrjene rezervacije obstajajo SAMO iz JourneyBooking zapisov
      // (CONFIRMED/PAID). Danes 0 — iskrenoporačilo, ne "confirmed".
      confirmedCount: 0,
      note: {
        sl: "Ni še potrjenih rezervacij prek API-ja. Rezervacije, plačila in potrditve za zunanje postavke se opravijo PRI PONUDNIKU (povezava spodaj) — Discover Slovenia ne izdaja številk rezervacij.",
        en: "No API-confirmed bookings yet. Bookings, payments and confirmations for external items happen AT THE PROVIDER (link below) — Discover Slovenia does not issue booking numbers.",
      },
    },
    generatedAt: new Date().toISOString(),
  };
}
