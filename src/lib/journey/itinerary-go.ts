// ============================================================================
// TASK 4 / K-7 (UX FIX PASS, 1.91.0) — ITINERARY → GO MODE PREMOSTITEV
// ============================================================================
// Živi dokaz revizije (korak GO MODE zlate poti): /na-poti pričakuje
// potovanje, zgrajeno na /potovanje (TravelJourney — booking usmerjen koncept);
// pravkar shranjen AI itinerer NI bil povezan z Go Mode — deljena stran ni
// imela NOBENE povezave do /na-poti, uporabnik pa bi moral potovanje zgraditi
// znova. Zadnji člen verige DISCOVER → PLAN → BOOK → GO je bil LOČEN otok.
//
// Rešitev (po auditu): čista pretvorba Itinerary → MyTripView (ISTA oblika,
// ki jo GoMode že izrisuje prek buildGoView) + persistenca kot dai:go-trip
// zapis različice 2 (glej go-persist.ts). Postanki/dnevi/časi/koordinate že
// obstajajo v itinererju — 0 novih konceptov, 0 omrežja, 0 db.
//
// ISKRENOST (isti kanon kot trip-view §20):
//  - ČAS postanka je TERMIN IZ NAČRTA (time_slot "09:00-13:00" uporabnika) —
//    ne izmišljen;
//  - STATUS vsakega postanka je INFO/načrtovan (nikoli "rezervirano");
//  - GEO samo tam, kjer jo ima vir (T1 dataset ali lastne koordinate
//    postanka) — brez geo → razdalja/smer preprosto NI (GoMode kanon);
//  - CONFIRMATION izrecno pove, da rezervacije ostajajo pri ponudnikih.
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import { dayISOForDayNumber } from "@/lib/trip-dates";
import { legKey } from "@/lib/road-routing";
import type { Itinerary, LocationVisit } from "@/lib/types";
import type {
  DayRouteSummary,
  MyTripDay,
  MyTripView,
  TripEntry,
} from "./trip-view";

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

/** Geo postanka: LASTNE koordinate (supply/OSM/CHAT kraji) → T1 dataset → null. */
function coordsOfLoc(
  loc: LocationVisit
): { lat: number; lng: number } | null {
  if (
    typeof loc.lat === "number" &&
    typeof loc.lng === "number" &&
    Number.isFinite(loc.lat) &&
    Number.isFinite(loc.lng) &&
    (loc.lat !== 0 || loc.lng !== 0) // null island = manjkajoče
  ) {
    return { lat: loc.lat, lng: loc.lng };
  }
  const d = DESTINATIONS.find((x) => x.id === loc.destination_id);
  if (d) return { lat: d.coords.lat, lng: d.coords.lng };
  return null;
}

/** Termin "09:00-13:00" → { start, end } (neparsable → null — ne ugibamo). */
function parseTimeSlot(
  slot: string | undefined
): { start: string; end?: string } | null {
  if (typeof slot !== "string") return null;
  const m = /^(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})$/.exec(slot.trim());
  if (!m) return null;
  return { start: m[1], end: m[2] };
}

/** Emoji ikona po tipu destinacije (ISTE vrednosti kot T1 dataset). */
const TYPE_ICONS: Record<string, string> = {
  lake: "🏞️",
  mountain: "⛰️",
  city: "🏛️",
  gorge: "🏞️",
  cave: "🕳️",
  coast: "🏖️",
  castle: "🏰",
  river: "🌊",
  waterfal: "💦",
  waterfall: "💦",
  spa: "♨️",
  forest: "🌲",
  museum: "🖼️",
  wine: "🍷",
  island: "🏝️",
  medieval: "🏰",
  npark: "🌲",
};

function iconForLoc(loc: LocationVisit): string {
  const d = DESTINATIONS.find((x) => x.id === loc.destination_id);
  if (d && TYPE_ICONS[d.type]) return TYPE_ICONS[d.type];
  return "📍";
}

const STATUS_PLANNED = {
  status: "INFO" as const,
  label: {
    sl: "Načrtovani postanek — brez rezervacije",
    en: "Planned stop — no booking",
  },
};

// ISSUE #4 §3 na GO površini: postanek s preverjeno /go povezavo do
// ponudnika nosi EXTERNAL statusni žeton (enak kot časovnica VAL 1) —
// klik = handoff, NIKOLI „rezervirano”.
const STATUS_BOOKABLE = {
  status: "EXTERNAL" as const,
  label: {
    sl: "Zunanja rezervacija — pri ponudniku",
    en: "External booking — at the provider",
  },
};

const CANCELLATION_EXTERNAL = {
  sl: "Pogoji preklica in vračila veljajo pri ponudniku — pred rezervacijo preveri njihove pogoje.",
  en: "Cancellation and refund terms apply at the provider — check their terms before booking.",
};

const CANCELLATION_INFO = {
  sl: "Ni rezervacije — nič za preklicati.",
  en: "No booking — nothing to cancel.",
};

// ---------------------------------------------------------------------------
// GLAVNI GRADILNIK (čist — 0 stranskih učinkov)
// ---------------------------------------------------------------------------

export interface ItineraryGoOptions {
  lang: "sl" | "en";
  /** Ime načrta (npr. deriveSavedTripName) — opcijsko, za naslov. */
  name?: string | null;
}

/**
 * Pretvori AI itinerer v MY TRIP pogled (ISTA oblika kot buildMyTrip —
 * GoMode ga izrisuje prek buildGoView brez sprememb). Dan N = datum iz
 * tripStartDate (če je znan); termini postankov so IZ NAČRTA.
 *
 * ISSUE #4 §8 (val 2): nosi NOGE (itinerary.legs → legFromPrev na vsakem
 * postanku + route povzetek dneva) in §3 rezervacijska polja
 * (booking_provider/product_id/url iz VAL 1) — Go Mode s tem pokaže
 * vozni čas do naslednjega postanka, pot dneva in gumb Rezerviraj.
 * Vse ostalo ostaja po istem kanonu iskrenosti.
 */
export function buildItineraryGoView(
  itinerary: Itinerary,
  opts: ItineraryGoOptions
): MyTripView {
  const days: MyTripDay[] = [];

  // Noge iz načrta (ključi "idA|idB" — isto kot serializeLegs).
  const legs =
    itinerary.legs && typeof itinerary.legs === "object"
      ? (itinerary.legs as Record<string, { km: number; min: number; source: "osrm" | "heuristic" }>)
      : {};
  const legOf = (aId: string, bId: string) => {
    const l = legs[legKey(aId, bId)];
    if (
      l &&
      typeof l.km === "number" &&
      Number.isFinite(l.km) &&
      typeof l.min === "number" &&
      Number.isFinite(l.min)
    ) {
      return {
        km: l.km,
        min: l.min,
        source: l.source === "osrm" ? ("osrm" as const) : ("heuristic" as const),
      };
    }
    return null;
  };

  for (const day of Array.isArray(itinerary.days) ? itinerary.days : []) {
    const dayNo = typeof day.day === "number" ? day.day : days.length + 1;
    const iso =
      typeof itinerary.tripStartDate === "string"
        ? dayISOForDayNumber(itinerary.tripStartDate, dayNo)
        : null;

    const locations = Array.isArray(day.locations) ? day.locations : [];

    const entries: TripEntry[] = locations.map((loc, idx) => {
      const coords = coordsOfLoc(loc);
      const time = parseTimeSlot(loc.time_slot);
      // §3 VAL 1 polja — strežniško validirana /go pot (samo relativne
      // poti preživijo sanitize). Klik na GoMode = isti handoff kanal.
      const bookable =
        typeof loc.booking_url === "string" &&
        loc.booking_url.startsWith("/go/") &&
        typeof loc.booking_provider === "string";
      // §8: noga od prejšnjega postanka (PO VRSTNEM REDU načrta).
      const leg =
        idx > 0
          ? legOf(locations[idx - 1].destination_id, loc.destination_id)
          : null;
      return {
        key: `itin-d${dayNo}-i${idx}-${loc.destination_id}`,
        category: "attractions" as const,
        icon: iconForLoc(loc),
        title: loc.destination_name || loc.destination_id,
        providerLabel: {
          sl: "AI načrt potovanja",
          en: "AI travel plan",
        },
        ...(bookable ? { provider: loc.booking_provider } : {}),
        ...(bookable ? { providerProductId: loc.booking_product_id } : {}),
        ...(bookable ? { bookingUrl: loc.booking_url } : {}),
        ...(iso ? { date: iso } : {}),
        ...(time ? { time } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        ...(typeof loc.duration === "number" && loc.duration > 0
          ? { durationMin: Math.round(loc.duration * 60) }
          : {}),
        ...(leg ? { legFromPrev: leg } : {}),
        status: bookable ? STATUS_BOOKABLE.status : STATUS_PLANNED.status,
        statusLabel: bookable ? STATUS_BOOKABLE.label : STATUS_PLANNED.label,
        cancellation: bookable ? CANCELLATION_EXTERNAL : CANCELLATION_INFO,
        bookingId: null,
      } satisfies TripEntry;
    });

    // §8: povzetek poti dneva (samo znane noge; delna ocena je pošteno
    // razkrita prek legsKnown/legsTotal).
    let route: DayRouteSummary | undefined;
    if (locations.length >= 2) {
      let km = 0;
      let min = 0;
      let known = 0;
      let osrm = 0;
      let heur = 0;
      for (let i = 1; i < locations.length; i++) {
        const l = legOf(locations[i - 1].destination_id, locations[i].destination_id);
        if (!l) continue;
        known++;
        km += l.km;
        min += l.min;
        if (l.source === "osrm") osrm++;
        else heur++;
      }
      if (known > 0) {
        route = {
          km: Math.round(km),
          min: Math.round(min),
          legsKnown: known,
          legsTotal: locations.length - 1,
          method:
            heur === 0 ? "osrm" : osrm === 0 ? "heuristic" : "mixed",
        };
      }
    }

    days.push({
      ...(iso ? { date: iso } : {}),
      dateLabel: iso
        ? formatDateLabel(iso)
        : {
            sl: `Dan ${dayNo}`,
            en: `Day ${dayNo}`,
          },
      entries,
      ...(route ? { route } : {}),
    });
  }

  // Naslov: ime načrta ali prvi kraji (isti vzorec kot deriveSavedTripName)
  const stopNames: string[] = [];
  for (const day of itinerary.days) {
    for (const loc of day.locations) {
      const n = loc.destination_name?.trim();
      if (n && !stopNames.includes(n)) stopNames.push(n);
      if (stopNames.length >= 3) break;
    }
  }
  const titleBase =
    opts.name?.trim() ||
    (stopNames.length > 0 ? stopNames.join(" · ") : "Slovenija");

  return {
    title: {
      sl: `MOJA POT — ${titleBase.toUpperCase()}`,
      en: `MY TRIP — ${titleBase.toUpperCase()}`,
    },
    days,
    externalCards: [],
    confirmation: {
      // Iskrenost: Go Mode nad AI itinererjem NE nosi rezervacij — vse
      // rezervacije ostajajo pri ponudnikih (BookingPanel na /nacrtuj).
      confirmedCount: 0,
      note: {
        sl: "Ni rezervacij — postanki so načrtovani. Rezervacije nastanitve, vstopnic in prevozov se opravijo pri ponudnikih (plošča Rezerviraj na načrtovalniku).",
        en: "No bookings — stops are planned. Accommodation, ticket and transfer bookings happen at the providers (the booking panel on the planner).",
      },
    },
    generatedAt: new Date().toISOString(),
  };
}
