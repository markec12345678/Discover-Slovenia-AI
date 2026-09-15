import { EVENTS } from "@/lib/events-data";
import { DESTINATIONS } from "@/lib/slovenia-data";
import type { ItineraryEvent } from "@/lib/types";

// ============================================================================
// EVENTS MATCHING — dogodki, ki se zgodijo na destinacijah itinererja
// ============================================================================
//
// Uporaba:
//   - /api/itinerary (ob generiranju AI/fallback načrta)
//   - /pot/[shareId] (SVEŽE ob vsakem renderju — shranjen JSON je lahko star)
//
// Logika:
//   1. Zberi unikatne destination_id-je iz dni itinererja
//   2. Direktne zadetke: EVENTS z destinationId v tem naboru
//   3. Če je direktnih zadetkov < 3 → dodaj regijske zadetke (event.region
//      se ujema z regijo katere od obiskanih destinacij)
//   4. FW4.2: če je podan okvir potovanja (tripWindow), pridejo NAJPREJ
//      dogodki, ki se s potovanjem PREKRIVAJO ("med tvojim obiskom"),
//      ostali razvrstitvi pa ostanejo kot spodaj (upcoming → featured)
//   5. Razvrsti: PRIHAJAJOČI (datum >= danes) najprej, nato izpostavljeni
//      (featured); prednost dogodkom v naslednjih 12 mesecih
//   6. Preslikaj v ItineraryEvent subset + omeji na `limit`
// ============================================================================

/** Minimalna oblika dneva, ki jo potrebujemo (dovoljuje DayPlan iz JSON-a). */
interface MatchableDay {
  locations?: { destination_id?: unknown }[] | null;
}

const DAY_MS = 86_400_000;
/** Okno "prihodnost": naslednjih ~12 mesecev. */
const HORIZON_MS = 365 * DAY_MS;
/** Dogodki, ki so se končali pred več kot toliko dnevi, ne pridejo v poštev. */
const PAST_GRACE_MS = 60 * DAY_MS;

/** Danes ob 00:00 lokalnega časa — referenca za "prihajajoče". */
function startOfToday(): number {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
}

function parseDateMs(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  // FW4.2: ISO datum (YYYY-MM-DD[…]) → LOKALNA polnoč — konzistentno s
  // trip-dates.ts (sicer UTC/local odmik v primerjavah z okvirom potovanja
  // povzroči, da dogodek na zadnjem dnevu poti zgreši tier "med obiskom")
  const m = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    return new Date(
      Number(m[1]),
      Number(m[2]) - 1,
      Number(m[3])
    ).getTime();
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

/** Okvir potovanja za datumsko ujemanje (FW4.2; glej trip-dates.ts). */
export interface TripWindow {
  startMs: number;
  endMs: number;
}

export function matchEventsForItinerary(
  days: MatchableDay[] | null | undefined,
  limit = 6,
  tripWindow?: TripWindow | null
): ItineraryEvent[] {
  if (!Array.isArray(days) || days.length === 0) return [];

  // 1. Unikatni destination_id-ji
  const destIds = new Set<string>();
  for (const day of days) {
    if (!day || !Array.isArray(day.locations)) continue;
    for (const loc of day.locations) {
      const id = loc?.destination_id;
      if (typeof id === "string" && id.trim()) destIds.add(id.trim());
    }
  }
  if (destIds.size === 0) return [];

  // 2. Regije obiskanih destinacij (za fallback ujemanje)
  const regions = new Set<string>();
  for (const id of destIds) {
    const dest = DESTINATIONS.find((d) => d.id === id);
    if (dest) regions.add(dest.region);
  }

  // 3. Direktni zadetki (destinationId) + regijski fallback, če jih je < 3
  const direct = EVENTS.filter(
    (e) => typeof e.destinationId === "string" && destIds.has(e.destinationId)
  );

  const pool =
    direct.length < 3
      ? [
          ...direct,
          ...EVENTS.filter(
            (e) => regions.has(e.region) && !destIds.has(e.destinationId ?? "")
          ),
        ]
      : direct;

  const todayMs = startOfToday();
  const horizonMs = todayMs + HORIZON_MS;

  // 4. Razvrstitev: prekrivajoči okvir potovanja (FW4.2, tier -1) →
  //    prihajajoči (datum >= danes) → featured → datum naraščajoče
  type Scored = {
    event: (typeof EVENTS)[number];
    startMs: number;
    tier: number;
  };

  const scored: Scored[] = [];
  for (const event of pool) {
    const startMs = parseDateMs(event.date);
    if (startMs === null) continue;
    const endMs = parseDateMs(event.endDate) ?? startMs;

    // Zastarel dogodek (končal se je pred več kot 60 dnevi) → izpusti
    if (endMs < todayMs - PAST_GRACE_MS) continue;

    // FW4.2: prekrivanje z okvirom potovanja — dogodek teče (vsaj delno)
    // med tvojim obiskom → NAJVIŠJA prednost (tier -1)
    const overlapsTrip =
      tripWindow != null && startMs <= tripWindow.endMs && endMs >= tripWindow.startMs;

    // "Prihajajoči": se še ni končal ali se še ni začel
    const upcoming = startMs >= todayMs || endMs >= todayMs;
    const inWindow = startMs <= horizonMs; // začne se v naslednjih ~12 mesecih

    // Tier: -1 = med tvojim obiskom (prekrivanje s potovanjem),
    // 0 = prihajajoč + v 12-mesečnem oknu, 1 = prihajajoč (dlje),
    // 2 = (nedavno) pretekli featured, 3 = pretekli
    const tier = overlapsTrip
      ? -1
      : upcoming
        ? inWindow ? 0 : 1
        : event.featured ? 2 : 3;

    scored.push({ event, startMs, tier });
  }

  scored.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    // Znotraj tierja: featured prvi, nato datum (najprej bližnji)
    if (a.event.featured !== b.event.featured) {
      return a.event.featured ? -1 : 1;
    }
    // Prihajajoči naraščajoče (najprej najbližji), pretekli padajoče
    // (najprej nedavno končani).
    if (a.tier <= 1) return a.startMs - b.startMs;
    return b.startMs - a.startMs;
  });

  // 5. Preslikava v ItineraryEvent subset
  return scored.slice(0, Math.max(0, limit)).map(({ event }) => ({
    id: event.id,
    name: event.name,
    date: event.date,
    endDate: event.endDate,
    location: event.location,
    category: event.category,
    priceRange: event.priceRange,
    description: event.description,
    website: event.website,
  }));
}
