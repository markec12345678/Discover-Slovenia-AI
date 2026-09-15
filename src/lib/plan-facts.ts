// ============================================================================
// F9 — PLAN FACTS: deterministični list dejstev o uporabnikovem načrtu
// ============================================================================
//
// MindTrip-ova prednost je "chat-first" načrtovanje: pogovor z načrtom.
// Naš odgovor (vrzel #9 iz konkurenčne analize): klepet, v katerem so
// VSI številkI IZRAČUNANI — iz ISTIH čistih funkcij kot prikaz
// (geo-validacija, stroški vožnje F5.3), AI pa LE prebere list dejstev
// in ga sfrazi. Nič številk se ne izumišljuje.
//
// Ta modul je ČISTA FUNKCIJA (isto na strani strežnika in klienta) —
// uporablja jo /api/itinerary/ask (deterministični odgovori + AI kontekst).
//

import type {
  Itinerary,
  PlannerInput,
  GeoValidation,
  DriveCosts,
} from "@/lib/types";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { computeTripDriveCosts } from "@/lib/trip-costs";

export type PlanLang = "sl" | "en";

/** Dejstva o enem dnevu načrta (vse številke izračunane, ne ugibane). */
export interface PlanDayFacts {
  day: number;
  /** ISO datum (samo z znanim datumom odhoda). */
  date?: string;
  /** Število postankov. */
  stops: number;
  /** Imena postankov v zaporedju. */
  names: string[];
  /** Km dneva (geo-validacija: OSRM noge ali hevristika — razkrito). */
  km: number;
  /** Minute vožnje dneva. */
  drivingMinutes: number;
  /** Minute aktivnosti (seštevek duration). */
  activityMinutes: number;
  /** Obseg dneva = vožnja + aktivnosti (merilo "natrpanosti"). */
  loadMinutes: number;
  /** Seštevek estimated_cost postankov dneva (EUR). */
  cost: number;
  /** Vreme, ki je bilo zadeto v načrt ob generiranju (ocena, ne napoved). */
  weather: string;
  temp: number;
  /** Število geo opozoril tega dneva (warn + error). */
  warnings: number;
}

/** Celoten deterministični list dejstev o načrtu. */
export interface PlanFacts {
  days: number;
  groupSize: number;
  /** Vir načrta — "ai" | "fallback" (razkritje). */
  source: "ai" | "fallback";
  /** Skupni km poti (geo-validacija). */
  tripKm: number;
  /** Skupne minute vožnje. */
  drivingMinutes: number;
  /** Metoda razdalj — razkritje ("osrm" = realne ceste, "heuristic" = ocena). */
  routingMethod?: "osrm" | "heuristic" | "mixed";
  /** Seštevek cen atrakcij (EUR) — NE vsebuje nočitev/hrane. */
  estimatedCost: number;
  /** Stroški vožnje (gorivo + e-vinjeta) — null, če koordinate niso znane. */
  driveCosts: DriveCosts | null;
  /** Uporabnikov proračunski cilj iz obrazca (EUR) — opcijsko. */
  budgetGoal?: number;
  perDay: PlanDayFacts[];
  /** Dan z največjim obsegom (vožnja + aktivnosti) — izračunano. */
  busiest?: PlanDayFacts;
  /** Dan z najmanjšim obsegom (med dnevi z ≥1 postankom). */
  quietest?: PlanDayFacts;
  /** Skupno število postankov. */
  totalStops: number;
  /** Geo opozorila: warn št., error št., skupaj. */
  warnings: number;
  errors: number;
  /** Opozorila o zaprtju (F5.5 — odpiralni časi): dan + sporočilo. */
  closedNotices: Array<{ day: number; message: string }>;
  /** Datum odhoda (ISO), če je znan. */
  tripStartDate?: string;
}

/** Defenzivni seštevek cene dneva. */
function dayCost(day: {
  locations?: Array<{ estimated_cost?: unknown }>;
}): number {
  let sum = 0;
  for (const loc of day?.locations ?? []) {
    const c = loc?.estimated_cost;
    if (typeof c === "number" && Number.isFinite(c) && c > 0) sum += c;
  }
  return Math.round(sum);
}

/** ISO datum dneva N (dan 1 = tripStartDate) — brez časovnega pasu. */
function dayDateISO(startISO: string | undefined, day: number): string | undefined {
  if (!startISO || !/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return undefined;
  const ms = Date.parse(`${startISO}T00:00:00Z`);
  if (!Number.isFinite(ms)) return undefined;
  return new Date(ms + (day - 1) * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Zgradi list dejstev o načrtu (čisto, deterministično).
 *
 * @param itinerary trenutni načrt (kot ga vidi uporabnik)
 * @param input     obrazec (groupSize, budget) — opcijsko, defenzivno
 * @param lang      jezik sporočil geo-validacije (opozorila so lokalizirana)
 */
export function buildPlanFacts(
  itinerary: Itinerary,
  input?: PlannerInput | null,
  lang: PlanLang = "sl"
): PlanFacts {
  const days = Array.isArray(itinerary?.days) ? itinerary.days : [];

  // Geo-validacija = ISTA plast kot prikaz (km, minute, opozorila). Brez
  // indeksa nog → hevristika, pošteno razkrita prek routingMethod.
  const geo: GeoValidation = validateItineraryGeo(itinerary, lang);

  // Stroški vožnje (F5.3): gorivo + e-vinjeta — ISTA čista funkcija kot
  // kartica kvalitete / proračunski panel. Null → koordinate manjkajo.
  const driveCosts = computeTripDriveCosts(itinerary);

  const groupSize =
    Number.isFinite(input?.groupSize) && (input?.groupSize ?? 0) > 0
      ? Math.round(input!.groupSize)
      : 1;

  const budgetGoal =
    Number.isFinite(input?.budget) && (input?.budget ?? 0) > 0
      ? Math.round(input!.budget)
      : undefined;

  const perDay: PlanDayFacts[] = days.map((d) => {
    const metrics = geo.days.find((m) => m.day === d.day);
    const warnings = geo.issues.filter((i) => i.day === d.day).length;
    return {
      day: d.day,
      date: dayDateISO(itinerary.tripStartDate, d.day),
      stops: Array.isArray(d.locations) ? d.locations.length : 0,
      names: (d.locations ?? [])
        .map((l) => l?.destination_name)
        .filter((n): n is string => typeof n === "string" && n.trim() !== ""),
      km: metrics?.km ?? 0,
      drivingMinutes: metrics?.drivingMinutes ?? 0,
      activityMinutes: metrics?.activityMinutes ?? 0,
      loadMinutes: metrics?.loadMinutes ?? 0,
      cost: dayCost(d),
      weather: d?.weather?.condition ?? "",
      temp: typeof d?.weather?.temp === "number" ? d.weather.temp : 0,
      warnings,
    };
  });

  // Najbolj natrpan / najmirnejši dan — čisto iz obsega (loadMinutes),
  // samo med dnevi z vsaj enim postankom (prazen dan ni "miran", je prazen).
  const nonEmpty = perDay.filter((d) => d.stops > 0);
  const busiest =
    nonEmpty.length > 1
      ? nonEmpty.reduce((a, b) => (b.loadMinutes > a.loadMinutes ? b : a))
      : undefined;
  const quietest =
    nonEmpty.length > 1
      ? nonEmpty.reduce((a, b) => (b.loadMinutes < a.loadMinutes ? b : a))
      : undefined;

  // Opozorila o zaprtju (F5.5) — samo ta dva rule ID-ja; sporočila so že
  // lokalizirana (geo-validation, lang parameter zgoraj).
  const closedNotices = geo.issues
    .filter((i) => i.rule === "closed_month" || i.rule === "closed_weekday")
    .map((i) => ({ day: i.day, message: i.message }));

  return {
    days: days.length,
    groupSize,
    source: itinerary?.source === "ai" ? "ai" : "fallback",
    tripKm: geo.tripKm,
    drivingMinutes: geo.days.reduce((s, d) => s + (d.drivingMinutes ?? 0), 0),
    routingMethod: geo.method,
    estimatedCost: perDay.reduce((s, d) => s + d.cost, 0),
    driveCosts,
    budgetGoal,
    perDay,
    busiest,
    quietest,
    totalStops: perDay.reduce((s, d) => s + d.stops, 0),
    warnings: geo.issues.length,
    errors: geo.issues.filter((i) => i.level === "error").length,
    closedNotices,
    tripStartDate: itinerary?.tripStartDate,
  };
}

/**
 * List dejstev kot TEKSTOVNI list za AI kontekst (grounding).
 * AI dobe ISTE številke kot deterministični odgovori — nič drugega ne sme
 * izmišljevati (strežniški sistemski prompt to izrecno zahteva).
 */
export function renderFactsSheet(facts: PlanFacts, lang: PlanLang): string {
  const isEn = lang === "en";
  const lines: string[] = [];

  lines.push(
    isEn
      ? `PLAN FACTS (computed — the ONLY source of numbers allowed):`
      : `DEJSTVA O NAČRTU (izračunano — EDINI dovoljen vir številk):`
  );
  lines.push(
    isEn
      ? `- ${facts.days} day(s), group of ${facts.groupSize}, ${facts.totalStops} stop(s) total`
      : `- ${facts.days} dni, skupina ${facts.groupSize} oseb, skupaj ${facts.totalStops} postankov`
  );

  const routing =
    facts.routingMethod === "osrm"
      ? isEn
        ? "real roads (OSRM)"
        : "realne ceste (OSRM)"
      : facts.routingMethod === "mixed"
        ? isEn
          ? "mixed (OSRM + estimate)"
          : "mešano (OSRM + ocena)"
        : isEn
          ? "estimate (haversine × 1.3)"
          : "ocena (haversine × 1.3)";

  lines.push(
    isEn
      ? `- total driving: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`
      : `- skupna vožnja: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`
  );

  lines.push(
    isEn
      ? `- attractions cost: €${facts.estimatedCost} (excludes accommodation, food, shopping)`
      : `- stroški atrakcij: €${facts.estimatedCost} (BREZ nočitev, hrane, nakupov)`
  );

  if (facts.driveCosts) {
    lines.push(
      isEn
        ? `- driving costs: fuel €${facts.driveCosts.fuelEur} + vignette €${facts.driveCosts.vignetteEur} = €${facts.driveCosts.totalEur} (AMZS/DARS tariffs)`
        : `- stroški vožnje: gorivo ${facts.driveCosts.fuelEur} € + vinjeta ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (tarife AMZS/DARS)`
    );
  } else {
    lines.push(
      isEn
        ? `- driving costs: unknown (no coordinates in plan — do NOT guess)`
        : `- stroški vožnje: neznani (načrt nima koordinat — NE ugibaj)`
    );
  }

  if (facts.budgetGoal) {
    lines.push(
      isEn
        ? `- user's budget goal: €${facts.budgetGoal}`
        : `- uporabnikov proračunski cilj: ${facts.budgetGoal} €`
    );
  }

  if (facts.busiest) {
    lines.push(
      isEn
        ? `- busiest day: day ${facts.busiest.day} (${facts.busiest.loadMinutes} min total load)`
        : `- najbolj natrpan dan: ${facts.busiest.day}. (${facts.busiest.loadMinutes} min skupnega obsega)`
    );
  }

  if (facts.warnings > 0) {
    lines.push(
      isEn
        ? `- feasibility warnings: ${facts.warnings} (${facts.errors} error-level)`
        : `- opozorila o izvedljivosti: ${facts.warnings} (od tega ${facts.errors} ravni ERROR)`
    );
  } else {
    lines.push(
      isEn
        ? `- feasibility warnings: none`
        : `- opozorila o izvedljivosti: brez`
    );
  }

  for (const c of facts.closedNotices) {
    lines.push(isEn ? `- closure: ${c.message}` : `- zaprtje: ${c.message}`);
  }

  lines.push(isEn ? `Per day:` : `Po dnevih:`);
  for (const d of facts.perDay) {
    const dateStr = d.date ? ` (${d.date})` : "";
    lines.push(
      isEn
        ? `- Day ${d.day}${dateStr}: ${d.stops} stop(s) [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min driving, ${d.activityMinutes} min activities, €${d.cost}, weather: ${d.weather} ${d.temp}°C${d.warnings > 0 ? `, ${d.warnings} warning(s)` : ""}`
        : `- Dan ${d.day}${dateStr}: ${d.stops} postankov [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min vožnje, ${d.activityMinutes} min aktivnosti, ${d.cost} €, vreme: ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} opozoril` : ""}`
    );
  }

  lines.push(
    isEn
      ? `Weather values above are the estimates baked into the plan at generation time — NOT a live forecast.`
      : `Vrednosti vremena zgoraj so ocene, zadete v načrt ob generiranju — NISO živa napoved.`
  );

  return lines.join("\n");
}
