import { DESTINATIONS } from "@/lib/slovenia-data";
import type { DayPlan, LocationVisit } from "@/lib/types";

// ============================================================================
// W11-A „DAN V ŽEPU" — izvoz dneva kot Google Maps navigacijska povezava
// ============================================================================
//
// Raziskava 29. 9. 2026 (svež konkurenčni benchmark, vir:
// monkeytravel.app „Wanderlog vs Mindtrip 2026", posod. 8. 9. 2026):
//   · Wanderlog je „Google Maps export" premaknil V PLACLJIV Pro tier
//     ($39.99/leto) — med glavnimi razlogi, da uporabniki plačajo;
//   · Mindtrip gumb za navigacijo do posameznega kraja, ne pa CELEG dneva.
//
// Mi imamo koordinate vseh postankov (T1 dataset + lastne iz supply/klepeta)
// in dnevni vrstni red (engine Taska 50/51 že jamči geo-koherenco dneva —
// 0 cik-cak). Ta modul to pretvori v ENO povezavo, ki uporabnika popelje
// po celotnem dnevu v aplikaciji, ki jo za navigacijo itak uporablja.
//
// ZDRAVA MEJA (iskrena, ne marketinška): povezava je NAMENJENA navigaciji
// po dan, ne arhiviranju — Google Maps URL API podpira največ 9 vmesnih
// točk (+ izhodišče + cilj = 11 postankov). Naši dnevi imajo 3–6 postankov;
// če jih je kdaj več, obdržimo PRVIH 10 + ZADNJIGA (zadnji postanek je
// pomembnejši od sredinskih — „kje končam dan") in to izrecno sporočimo
// prek `truncated` v telemetriji.
//
// 0 odvisnosti, 0 AI, 0 omrežnih klicev — čista URL konstrukcija
// (uradni Maps URLs API: https://developers.google.com/maps/documentation/urls)
// ============================================================================

/** T1 koordinate (isti vir kot geo-validation.ts coordsOfStop — ena resnica). */
const T1_COORDS = new Map(DESTINATIONS.map((d) => [d.id, d.coords]));

/** Google Maps URL API: origin + 9 waypoints + destination. */
export const GMAPS_MAX_STOPS = 11;

/**
 * Koordinate postanka — T1 dataset ALI lastne (supply/klepet postanki nosijo
 * lastne lat/lng). TOČNO (0,0) je null island (geo sentinel „ni podatka") —
 * enaka semantika kot coordsOfStop v geo-validation.ts: iskreno preskočimo,
 * namesto absurdnih razdalj. */
function coordsOfVisit(visit: LocationVisit): { lat: number; lng: number } | null {
  const t1 = T1_COORDS.get(visit.destination_id);
  if (t1) return t1;
  if (
    typeof visit.lat === "number" &&
    typeof visit.lng === "number" &&
    Number.isFinite(visit.lat) &&
    Number.isFinite(visit.lng) &&
    !(visit.lat === 0 && visit.lng === 0)
  ) {
    return { lat: visit.lat, lng: visit.lng };
  }
  return null;
}

/** Fiksno 6 decimalk (≈ 11 cm natančnost — obilno za navigacijo). */
function fixed6(n: number): string {
  return n.toFixed(6);
}

export interface GmapsDayResult {
  /** Navigacijska povezava za cel dan (null, če dneva ni mogoče sestaviti). */
  url: string | null;
  /** Št. postankov, vključenih v povezavo (0 = ni povezave). */
  stops: number;
  /** Št. postankov dneva, katerih koordinate niso znane (preskočeni). */
  skipped: number;
  /** True, če je bilo več kot GMAPS_MAX_STOPS postankov in smo skrajšali. */
  truncated: boolean;
}

/**
 * Sestavi Google Maps navigacijsko povezavo za EN dan itinererja.
 *
 * · <2 znanih koordinat → url null (ni česa navigirati — en postanek/nič;
 *   enoten postanek uporabniku ne koristi povezava, ker Maps za eno točko
 *   ne sestavi poti);
 * · 2 postanka → origin + destination;
 * · 3+ → vmesne točke kot waypoints (%7C ločene);
 * · >11 → prvih 10 + zadnji (glej zgornjo zdravo mejo).
 */
export function gmapsDayUrl(day: Pick<DayPlan, "locations">): GmapsDayResult {
  const resolved = day.locations.map(coordsOfVisit);
  const known = resolved.filter((c): c is { lat: number; lng: number } => c !== null);
  const skipped = resolved.length - known.length;

  if (known.length < 2) {
    return { url: null, stops: 0, skipped, truncated: false };
  }

  // Zdrava meja: obdrži prvih (MAX-1) + zadnjega.
  let truncated = false;
  let pts = known;
  if (known.length > GMAPS_MAX_STOPS) {
    pts = [...known.slice(0, GMAPS_MAX_STOPS - 1), known[known.length - 1]];
    truncated = true;
  }

  const origin = pts[0];
  const destination = pts[pts.length - 1];
  const waypoints = pts.slice(1, -1);

  const parts = [
    "https://www.google.com/maps/dir/?api=1",
    `origin=${fixed6(origin.lat)},${fixed6(origin.lng)}`,
    `destination=${fixed6(destination.lat)},${fixed6(destination.lng)}`,
  ];
  if (waypoints.length > 0) {
    parts.push(
      `waypoints=${waypoints
        .map((p) => `${fixed6(p.lat)},${fixed6(p.lng)}`)
        .join("%7C")}`
    );
  }

  return { url: parts.join("&"), stops: pts.length, skipped, truncated };
}
