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
// W1-faza-2b-2 (1.129.0): PlanLang je zdaj 4-jezičen (planner-lang kanon) —
// geo-validacija (2b-1) sprejema it/de, izpis lista pa sledi PL() pogodbi.
//
// W12-faza-2b: PlanLang je 6-jezičen (fr/es) — izpis lista sledi isti PL()
// pogodbi („Jour X“ / „Día X“ vzorec za dneve; decimalna vejica × 1,3).
//

import type {
  Itinerary,
  PlannerInput,
  GeoValidation,
  DriveCosts,
} from "@/lib/types";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { computeTripDriveCosts } from "@/lib/trip-costs";
import { PL, type PlannerLang } from "@/lib/planner-lang";

/** W1-faza-2b-2: javna povezava ostaja `PlanLang` (nazaj-kompatibilno). */
export type { PlannerLang as PlanLang } from "@/lib/planner-lang";

type PlanLang = PlannerLang;

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
  // W12-faza-2b: geo-validation Lang je razširjen na 6 jezikov —
  // PlannerLang se zdaj prelije BREZ prehodnega kasta (varovalka, ki jo je
  // dodal Agent 1, je odstranjena; opozorila so za fr/es eksplicitno
  // lokalizirana).
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
 * W1-faza-2b-2: 4-jezično (PL pogodba).
 * W12-faza-2b: 6-jezično (fr/es eksplicitna po isti PL pogodbi).
 */
export function renderFactsSheet(facts: PlanFacts, lang: PlanLang): string {
  const lines: string[] = [];

  lines.push(
    PL(lang, {
      sl: `DEJSTVA O NAČRTU (izračunano — EDINI dovoljen vir številk):`,
      en: `PLAN FACTS (computed — the ONLY source of numbers allowed):`,
      it: `DATI DEL PIANO (calcolati — l'UNICA fonte di numeri ammessa):`,
      de: `PLANFAKTEN (berechnet — die EINZIG erlaubte Zahlenquelle):`,
      fr: `FAITS DU PLAN (calculés — la SEULE source de chiffres autorisée) :`,
      es: `DATOS DEL PLAN (calculados — la ÚNICA fuente de números permitida):`,
    })
  );
  lines.push(
    PL(lang, {
      sl: `- ${facts.days} dni, skupina ${facts.groupSize} oseb, skupaj ${facts.totalStops} postankov`,
      en: `- ${facts.days} day(s), group of ${facts.groupSize}, ${facts.totalStops} stop(s) total`,
      it: `- ${facts.days} giorno/i, gruppo di ${facts.groupSize} persone, ${facts.totalStops} tappe in totale`,
      de: `- ${facts.days} Tag/e, Gruppe von ${facts.groupSize} Personen, insgesamt ${facts.totalStops} Stopps`,
      fr: `- ${facts.days} jour(s), groupe de ${facts.groupSize} personnes, ${facts.totalStops} étapes au total`,
      es: `- ${facts.days} día(s), grupo de ${facts.groupSize} personas, ${facts.totalStops} paradas en total`,
    })
  );

  const routing =
    facts.routingMethod === "osrm"
      ? PL(lang, {
          sl: "realne ceste (OSRM)",
          en: "real roads (OSRM)",
          it: "strade reali (OSRM)",
          de: "echte Straßen (OSRM)",
          fr: "routes réelles (OSRM)",
          es: "carreteras reales (OSRM)",
        })
      : facts.routingMethod === "mixed"
        ? PL(lang, {
            sl: "mešano (OSRM + ocena)",
            en: "mixed (OSRM + estimate)",
            it: "misto (OSRM + stima)",
            de: "gemischt (OSRM + Schätzung)",
            fr: "mixte (OSRM + estimation)",
            es: "mixto (OSRM + estimación)",
          })
        : PL(lang, {
            sl: "ocena (haversine × 1.3)",
            en: "estimate (haversine × 1.3)",
            it: "stima (haversine × 1,3)",
            de: "Schätzung (Haversine × 1,3)",
            fr: "estimation (haversine × 1,3)",
            es: "estimación (haversine × 1,3)",
          });

  lines.push(
    PL(lang, {
      sl: `- skupna vožnja: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`,
      en: `- total driving: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`,
      it: `- guida totale: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`,
      de: `- Gesamtfahrt: ${facts.tripKm} km, ${facts.drivingMinutes} Min (${routing})`,
      fr: `- conduite totale : ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`,
      es: `- conducción total: ${facts.tripKm} km, ${facts.drivingMinutes} min (${routing})`,
    })
  );

  lines.push(
    PL(lang, {
      sl: `- stroški atrakcij: €${facts.estimatedCost} (BREZ nočitev, hrane, nakupov)`,
      en: `- attractions cost: €${facts.estimatedCost} (excludes accommodation, food, shopping)`,
      it: `- costi attrazioni: ${facts.estimatedCost} € (ESCLUSI pernottamento, cibo, acquisti)`,
      de: `- Kosten der Sehenswürdigkeiten: ${facts.estimatedCost} € (OHNE Übernachtung, Essen, Einkäufe)`,
      fr: `- coûts des attractions : ${facts.estimatedCost} € (SANS hébergement, repas, achats)`,
      es: `- costes de las atracciones: ${facts.estimatedCost} € (SIN alojamiento, comida, compras)`,
    })
  );

  if (facts.driveCosts) {
    lines.push(
      PL(lang, {
        sl: `- stroški vožnje: gorivo ${facts.driveCosts.fuelEur} € + vinjeta ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (tarife AMZS/DARS)`,
        en: `- driving costs: fuel €${facts.driveCosts.fuelEur} + vignette €${facts.driveCosts.vignetteEur} = €${facts.driveCosts.totalEur} (AMZS/DARS tariffs)`,
        it: `- costi di guida: carburante ${facts.driveCosts.fuelEur} € + vignetta ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (tariffe AMZS/DARS)`,
        de: `- Fahrkosten: Kraftstoff ${facts.driveCosts.fuelEur} € + Vignette ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (AMZS/DARS-Tarife)`,
        fr: `- coûts de conduite : carburant ${facts.driveCosts.fuelEur} € + vignette ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (tarifs AMZS/DARS)`,
        es: `- costes de conducción: combustible ${facts.driveCosts.fuelEur} € + viñeta ${facts.driveCosts.vignetteEur} € = ${facts.driveCosts.totalEur} € (tarifas AMZS/DARS)`,
      })
    );
  } else {
    lines.push(
      PL(lang, {
        sl: `- stroški vožnje: neznani (načrt nima koordinat — NE ugibaj)`,
        en: `- driving costs: unknown (no coordinates in plan — do NOT guess)`,
        it: `- costi di guida: sconosciuti (il piano non ha coordinate — NON indovinare)`,
        de: `- Fahrkosten: unbekannt (keine Koordinaten im Plan — NICHT raten)`,
        fr: `- coûts de conduite : inconnus (le plan n'a pas de coordonnées — NE PAS deviner)`,
        es: `- costes de conducción: desconocidos (el plan no tiene coordenadas — NO adivines)`,
      })
    );
  }

  if (facts.budgetGoal) {
    lines.push(
      PL(lang, {
        sl: `- uporabnikov proračunski cilj: ${facts.budgetGoal} €`,
        en: `- user's budget goal: €${facts.budgetGoal}`,
        it: `- obiettivo di budget dell'utente: ${facts.budgetGoal} €`,
        de: `- Budgetziel des Nutzers: ${facts.budgetGoal} €`,
        fr: `- objectif de budget de l'utilisateur : ${facts.budgetGoal} €`,
        es: `- objetivo de presupuesto del usuario: ${facts.budgetGoal} €`,
      })
    );
  }

  if (facts.busiest) {
    lines.push(
      PL(lang, {
        sl: `- najbolj natrpan dan: ${facts.busiest.day}. (${facts.busiest.loadMinutes} min skupnega obsega)`,
        en: `- busiest day: day ${facts.busiest.day} (${facts.busiest.loadMinutes} min total load)`,
        it: `- giorno più intenso: giorno ${facts.busiest.day} (${facts.busiest.loadMinutes} min di carico totale)`,
        de: `- vollster Tag: Tag ${facts.busiest.day} (${facts.busiest.loadMinutes} Min Gesamtlast)`,
        fr: `- jour le plus chargé : jour ${facts.busiest.day} (${facts.busiest.loadMinutes} min de charge totale)`,
        es: `- día más intenso: día ${facts.busiest.day} (${facts.busiest.loadMinutes} min de carga total)`,
      })
    );
  }

  if (facts.warnings > 0) {
    lines.push(
      PL(lang, {
        sl: `- opozorila o izvedljivosti: ${facts.warnings} (od tega ${facts.errors} ravni ERROR)`,
        en: `- feasibility warnings: ${facts.warnings} (${facts.errors} error-level)`,
        it: `- avvisi di fattibilità: ${facts.warnings} (di cui ${facts.errors} di livello ERROR)`,
        de: `- Machbarkeitswarnungen: ${facts.warnings} (davon ${facts.errors} auf ERROR-Niveau)`,
        fr: `- avertissements de faisabilité : ${facts.warnings} (dont ${facts.errors} de niveau ERROR)`,
        es: `- avisos de viabilidad: ${facts.warnings} (de los cuales ${facts.errors} de nivel ERROR)`,
      })
    );
  } else {
    lines.push(
      PL(lang, {
        sl: `- opozorila o izvedljivosti: brez`,
        en: `- feasibility warnings: none`,
        it: `- avvisi di fattibilità: nessuno`,
        de: `- Machbarkeitswarnungen: keine`,
        fr: `- avertissements de faisabilité : aucun`,
        es: `- avisos de viabilidad: ninguno`,
      })
    );
  }

  for (const c of facts.closedNotices) {
    lines.push(
      PL(lang, {
        sl: `- zaprtje: ${c.message}`,
        en: `- closure: ${c.message}`,
        it: `- chiusura: ${c.message}`,
        de: `- Schließung: ${c.message}`,
        fr: `- fermeture : ${c.message}`,
        es: `- cierre: ${c.message}`,
      })
    );
  }

  lines.push(
    PL(lang, {
      sl: `Po dnevih:`,
      en: `Per day:`,
      it: `Per giorno:`,
      de: `Pro Tag:`,
      // W12-faza-2b: FR/ES („Jour X“ / „Día X“ vzorec spodaj)
      fr: `Par jour :`,
      es: `Por día:`,
    })
  );
  for (const d of facts.perDay) {
    const dateStr = d.date ? ` (${d.date})` : "";
    lines.push(
      PL(lang, {
        sl: `- Dan ${d.day}${dateStr}: ${d.stops} postankov [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min vožnje, ${d.activityMinutes} min aktivnosti, ${d.cost} €, vreme: ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} opozoril` : ""}`,
        en: `- Day ${d.day}${dateStr}: ${d.stops} stop(s) [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min driving, ${d.activityMinutes} min activities, €${d.cost}, weather: ${d.weather} ${d.temp}°C${d.warnings > 0 ? `, ${d.warnings} warning(s)` : ""}`,
        it: `- Giorno ${d.day}${dateStr}: ${d.stops} tappe [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min di guida, ${d.activityMinutes} min di attività, ${d.cost} €, meteo: ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} avvisi` : ""}`,
        de: `- Tag ${d.day}${dateStr}: ${d.stops} Stopps [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} Min Fahrt, ${d.activityMinutes} Min Aktivitäten, ${d.cost} €, Wetter: ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} Warnungen` : ""}`,
        fr: `- Jour ${d.day}${dateStr} : ${d.stops} étapes [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min de conduite, ${d.activityMinutes} min d'activités, ${d.cost} €, météo : ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} avertissements` : ""}`,
        es: `- Día ${d.day}${dateStr}: ${d.stops} paradas [${d.names.join(", ")}], ${d.km} km, ${d.drivingMinutes} min de conducción, ${d.activityMinutes} min de actividades, ${d.cost} €, clima: ${d.weather} ${d.temp} °C${d.warnings > 0 ? `, ${d.warnings} avisos` : ""}`,
      })
    );
  }

  lines.push(
    PL(lang, {
      sl: `Vrednosti vremena zgoraj so ocene, zadete v načrt ob generiranju — NISO živa napoved.`,
      en: `Weather values above are the estimates baked into the plan at generation time — NOT a live forecast.`,
      it: `I valori del meteo sopra sono stime inserite nel piano alla generazione — NON sono una previsione live.`,
      de: `Die Wetterwerte oben sind Schätzungen aus der Planerstellung — KEINE Live-Vorhersage.`,
      fr: `Les valeurs météo ci-dessus sont des estimations intégrées au plan à la génération — CE NE SONT PAS des prévisions en direct.`,
      es: `Los valores de clima de arriba son estimaciones integradas en el plan al generarlo — NO son un pronóstico en vivo.`,
    })
  );

  return lines.join("\n");
}
