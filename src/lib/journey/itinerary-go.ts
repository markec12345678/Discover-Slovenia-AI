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
import type { Itinerary, LocationVisit } from "@/lib/types";
import type { MyTripDay, MyTripView, TripEntry } from "./trip-view";

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
 */
export function buildItineraryGoView(
  itinerary: Itinerary,
  opts: ItineraryGoOptions
): MyTripView {
  const days: MyTripDay[] = [];

  for (const day of Array.isArray(itinerary.days) ? itinerary.days : []) {
    const dayNo = typeof day.day === "number" ? day.day : days.length + 1;
    const iso =
      typeof itinerary.tripStartDate === "string"
        ? dayISOForDayNumber(itinerary.tripStartDate, dayNo)
        : null;

    const entries: TripEntry[] = (
      Array.isArray(day.locations) ? day.locations : []
    ).map((loc, idx) => {
      const coords = coordsOfLoc(loc);
      const time = parseTimeSlot(loc.time_slot);
      return {
        key: `itin-d${dayNo}-i${idx}-${loc.destination_id}`,
        category: "attractions" as const,
        icon: iconForLoc(loc),
        title: loc.destination_name || loc.destination_id,
        providerLabel: {
          sl: "AI načrt potovanja",
          en: "AI travel plan",
        },
        ...(iso ? { date: iso } : {}),
        ...(time ? { time } : {}),
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        ...(typeof loc.duration === "number" && loc.duration > 0
          ? { durationMin: Math.round(loc.duration * 60) }
          : {}),
        status: STATUS_PLANNED.status,
        statusLabel: STATUS_PLANNED.label,
        cancellation: CANCELLATION_INFO,
        bookingId: null,
      } satisfies TripEntry;
    });

    days.push({
      ...(iso ? { date: iso } : {}),
      dateLabel: iso
        ? formatDateLabel(iso)
        : {
            sl: `Dan ${dayNo}`,
            en: `Day ${dayNo}`,
          },
      entries,
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
