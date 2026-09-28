import { EVENTS } from "@/lib/events-data";
import { EVENTS_EN } from "@/lib/events-data-en";
// W1-faza-2b (Issue #15): IT/DE prekrivni plasti dogodkov (LLM prevod z
// jezikovno varovalko — vira EN/SL, isti vzorec kot DESTINATIONS_EN)
import { EVENTS_IT } from "@/lib/events-data-it";
import { EVENTS_DE } from "@/lib/events-data-de";
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

/**
 * Danes ob 00:00 — referenca za "prihajajoče".
 * TZ-FIX (revizija 1.33.0, 16-d P3): prej je uporabljal SERVERSKI lokalni
 * čas (na Vercelu UTC) — meja "prihajajoče vs preteklo" je bila ob robnih
 * urah zamaknjena za 1–2 h glede na slovenski dan obiskovalca. Zdaj isti
 * vzorec kot weather-utils.ts: koledarski dan v pasu Europe/Ljubljana.
 */
function startOfToday(): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Ljubljana",
  }).format(new Date()); // YYYY-MM-DD
  const [y, m, d] = iso.split("-").map(Number);
  // Datum v slovenskem pasu predstavimo kot UTC polnoč ISTEGA koledarskega
  // dne — parseDateMs spodaj dela enako (lokalna polnoč ISO datuma), torej
  // sta obe strani primerjave v isti (koledarski) referenci.
  return new Date(Date.UTC(y, m - 1, d)).getTime();
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
  tripWindow?: TripWindow | null,
  /** 1.29.0 (revizija #13): "en" → ime/opis iz EVENTS_EN prekrivne plasti.
   * W1-faza-2b: "it"/"de" → EVENTS_IT/EVENTS_DE (isti vzorec). */
  lang: "sl" | "en" | "it" | "de" = "sl"
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
  // 1.29.0 (revizija #13): EN prekrivna plast — dogodki v EN načrtu dobijo
  // prevedeno ime/opis; identifikatorji/datumi/ključi ostanejo skupni
  // (isti vzorec kot DESTINATIONS_EN v stop-insights/refine-actions).
  return scored.slice(0, Math.max(0, limit)).map(({ event }) => {
    // W1-faza-2b: jezikovna prekrivna plast (SL izvirnik; EN/IT/DE overlay)
    const overlay =
      lang === "en"
        ? EVENTS_EN[event.id]
        : lang === "it"
        ? EVENTS_IT[event.id]
        : lang === "de"
        ? EVENTS_DE[event.id]
        : undefined;
    return {
      id: event.id,
      name: overlay?.name ?? event.name,
      date: event.date,
      endDate: event.endDate,
      location: event.location,
      category: event.category,
      priceRange: event.priceRange,
      description: overlay?.description ?? event.description,
      website: event.website,
    };
  });
}

// ============================================================================
// W6 (Issue #15, 1.136.0): BRSKALNI PAS "Kaj se dogaja izven tvojih datumov"
// ============================================================================
// Mindtrip Events vzorec (raziskava Task 19-b): prosto brskanje dogodkov
// poleg datumsko vezanih. Po našem kanonu:
//   - ISTI nabor kandidatov kot matchEventsForItinerary (destinacije/regije
//     itinererja) — brskamo NAD istim vsebinskim videnjem, ne splošnega;
//   - KOMPLEMENT okvirja: dogodki, ki se s potovanjem NE prekrivajo
//     (varovalo benchmarka: datumsko ujemanje ostane PRIMARNO — ta plast
//     je dodaten pas, nikoli nadomestilo);
//   - izključeni so tudi dogodki, ki jih glavna sekcija ŽE prikazuje;
//   - samo PRIHAJAJOČI (niso se končali) znotraj 12-mesečnega obzorja —
//     "premisli datume ali načrtuj nov obisk", ne arhiv;
//   - brez okvirja potovanja ni "izven datumov" → praznina (iskrena meja).
// ============================================================================

export function matchEventsOutsideTrip(
  days: MatchableDay[] | null | undefined,
  /** ID-ji dogodkov, ki jih glavna sekcija ŽE prikazuje (izključimo). */
  excludeIds: string[] | Set<string>,
  tripWindow: TripWindow | null | undefined,
  limit = 6,
  lang: "sl" | "en" | "it" | "de" = "sl"
): ItineraryEvent[] {
  // Iskrena meja: "izven tvojih datumov" potrebuje okvir potovanja
  if (tripWindow == null) return [];
  if (!Array.isArray(days) || days.length === 0) return [];

  const exclude =
    excludeIds instanceof Set ? excludeIds : new Set(excludeIds);

  // 1–2. Unikatni destination_id-ji + regije (ISTA logika kot glavni match)
  const destIds = new Set<string>();
  for (const day of days) {
    if (!day || !Array.isArray(day.locations)) continue;
    for (const loc of day.locations) {
      const id = loc?.destination_id;
      if (typeof id === "string" && id.trim()) destIds.add(id.trim());
    }
  }
  if (destIds.size === 0) return [];

  const regions = new Set<string>();
  for (const id of destIds) {
    const dest = DESTINATIONS.find((d) => d.id === id);
    if (dest) regions.add(dest.region);
  }

  // 3. Direktne zadetke + regijski fallback (ista pragmatika < 3)
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

  type Scored = {
    event: (typeof EVENTS)[number];
    startMs: number;
  };
  const scored: Scored[] = [];

  for (const event of pool) {
    if (exclude.has(event.id)) continue;
    const startMs = parseDateMs(event.date);
    if (startMs === null) continue;
    const endMs = parseDateMs(event.endDate) ?? startMs;

    // KOMPLEMENT: prekrivanje z okvirjem potovanja → IZVEN pasu NE sodi
    // (to je definicija "izven tvojih datumov")
    const overlapsTrip =
      startMs <= tripWindow.endMs && endMs >= tripWindow.startMs;
    if (overlapsTrip) continue;

    // Samo prihajajoči (se še ni končal) v 12-mesečnem obzorju — brskanje
    // za prihodnje odločitve, ne arhiv preteklih dogodkov
    if (endMs < todayMs) continue;
    if (startMs > horizonMs) continue;

    scored.push({ event, startMs });
  }

  // Razvrstitev: featured prvi, nato najbližji datum naraščajoče
  scored.sort((a, b) => {
    if (a.event.featured !== b.event.featured) {
      return a.event.featured ? -1 : 1;
    }
    return a.startMs - b.startMs;
  });

  return scored.slice(0, Math.max(0, limit)).map(({ event }) => {
    const overlay =
      lang === "en"
        ? EVENTS_EN[event.id]
        : lang === "it"
        ? EVENTS_IT[event.id]
        : lang === "de"
        ? EVENTS_DE[event.id]
        : undefined;
    return {
      id: event.id,
      name: overlay?.name ?? event.name,
      date: event.date,
      endDate: event.endDate,
      location: event.location,
      category: event.category,
      priceRange: event.priceRange,
      description: overlay?.description ?? event.description,
      website: event.website,
    };
  });
}
