// ============================================================================
// F9 — PLAN Q&A: deterministično odgovarjanje na vprašanja O NAČRTU
// ============================================================================
//
// MindTrip je "chat-first": uporabnik se pogovarja z načrtom. Naš odgovor
// (vrzel #9 konkurenčne analize): vprašanje se NAJPREJ obdela
// DETERMINISTIČNO — namen (intent) se prepona z regex vzorci (SL+EN,
// diakritika-neobčutljivo), odgovor pa se sestavi IZ IZRAČUNANIH dejstev
// (plan-facts.ts — iste čiste funkcije kot prikaz). Deluje tudi brez AI
// žetonov (kot hitre akcije refine). Šele če namen ni prepoznan, vprašanje
// + list dejstev gresta k AI z STROGIM navodilom: odgovarjaj IZKLJUČNO iz
// dejstev.
//
// Čista funkcija — isto na strani strežnika in klienta (testirano).
//

import type { Itinerary, PlannerInput } from "@/lib/types";
import { buildPlanFacts, renderFactsSheet, type PlanFacts, type PlanLang } from "@/lib/plan-facts";
import { formatDrivingMinutes } from "@/lib/itinerary-quality";
import { buildSmartPackingList } from "@/lib/packing-smart";
import { DESTINATIONS } from "@/lib/slovenia-data";

// ---------------------------------------------------------------------------
// Tipi
// ---------------------------------------------------------------------------

/** Deterministični odgovor (namen + besedilo). */
export interface PlanQaAnswer {
  intent: string;
  text: string;
}

/** Živa dnevna napoved, poravnana z dnevi načrta (strežnik jo pridobi
 *  iz Open-Meteo, če je odhod znotraj ~16-dnevnega horizonta). */
export interface PlanForecastDay {
  day: number;
  text: string;
  tempMax: number;
  /** Max verjetnost padavin (%) — null, če vir ne vrne. */
  rainProb: number | null;
}

export interface PlanQaInput {
  /** Uporabnikovo vprašanje (SL ali EN, prost tekst). */
  question: string;
  itinerary: Itinerary;
  input?: PlannerInput | null;
  lang?: PlanLang;
  /** Opcijsko: živa napoved za dneve načrta (obogati vremenski odgovor). */
  forecast?: PlanForecastDay[] | null;
}

// ---------------------------------------------------------------------------
// Normalizacija vprašanja (SL+EN, diakritika-neobčutljivo)
// ---------------------------------------------------------------------------

/** Odstrani slovenske diakritike za neobčutljivo ujemanje. */
function stripDiacritics(s: string): string {
  return s
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/ž/g, "z")
    .replace(/š/g, "s")
    .replace(/đ/g, "d");
}

// ---------------------------------------------------------------------------
// Prepoznavanje dneva ("dan 2", "2. dan", "day 3", "zadnji dan" ...)
// ---------------------------------------------------------------------------

const ORDINALS: Record<string, number> = {
  prvi: 1, prva: 1, prvo: 1, first: 1,
  drugi: 2, druga: 2, drugo: 2, second: 2,
  tretji: 3, tretja: 3, tretje: 3, third: 3,
  cetrti: 4, cetrta: 4, cetrto: 4, fourth: 4,
  peti: 5, peta: 5, peto: 5, fifth: 5,
};

/** Izlušči sklic na dan iz vprašanja; veljaven ali izven obsega. */
function extractDayRef(
  q: string,
  days: number
): { day?: number; outOfRange?: number } {
  // "dan 2" / "dnevu 3" / "day 4" / "on day 5"
  const m1 = q.match(/(?:\bdan\b|\bdneva\b|\bdnevu\b|\bday\b)\s*0?(\d{1,2})\b/);
  if (m1) {
    const n = Number(m1[1]);
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  // "2. dan" / "3. dnev" / "2nd day"
  const m2 = q.match(/0?(\d{1,2})(?:\.|st|nd|rd|th)\s*(?:dan|dnev|day)/);
  if (m2) {
    const n = Number(m2[1]);
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  // "prvi dan" / "zadnji dan" / "first day" / "last day"
  if (/(prvi|prva|zadnji|zadnja|first|last)\s+(dan|dnev|day)/.test(q)) {
    const last = /(zadnji|zadnja|last)/.test(q);
    const n = last ? days : 1;
    if (n >= 1 && n <= days) return { day: n };
  }
  // "drugi dan" / "tretji dan" ...
  const m3 = q.match(
    /(prvi|drugi|tretji|cetrti|peti|prva|druga|tretja|cetrta|peta)\s+(dan|dnev|day)/
  );
  if (m3 && ORDINALS[m3[1]]) {
    const n = ORDINALS[m3[1]];
    if (n >= 1 && n <= days) return { day: n };
    return { outOfRange: n };
  }
  return {};
}

// ---------------------------------------------------------------------------
// Predlogi vprašanj (žetoni v UI + iskren fallback)
// ---------------------------------------------------------------------------

export const EXAMPLE_QUESTIONS: Record<"sl" | "en", string[]> = {
  sl: [
    "Koliko km in vožnje je na celotni poti?",
    "Kateri dan je najbolj natrpan?",
    "Koliko bo stalo (skupaj in na osebo)?",
    "Kaj je na dan 1?",
    "Kaj naj pakiram?",
  ],
  en: [
    "How many km and driving overall?",
    "Which day is the busiest?",
    "How much will it cost (total and per person)?",
    "What's on day 1?",
    "What should I pack?",
  ],
};

/** Iskren odgovor, ko namen ni prepoznan in AI ni na voljo. */
export function buildUnknownAnswer(lang: PlanLang): string {
  const isEn = lang === "en";
  const examples = EXAMPLE_QUESTIONS[lang]
    .slice(0, 3)
    .map((q) => `„${q}“`)
    .join(isEn ? "; " : "; ");
  return isEn
    ? `I can't answer that from the computed plan facts — and I won't guess. Try one of these: ${examples}. (For changes to the plan, use “Adjust the itinerary” below.)`
    : `Na to ne morem odgovoriti iz izračunanih dejstev o načrtu — ugibati pa ne bom. Poskusi: ${examples}. (Za spremembe načrta uporabi „Prilagodi itinerer“ spodaj.)`;
}

// ---------------------------------------------------------------------------
// Slovenska dvojina/množina (jezikovna kakovost — SL aplikacija)
// ---------------------------------------------------------------------------

/** Število postankov z pravilno obliko (1 postanek, 2 postanka, 3–4 postanki, 5+ postankov). */
function stopsWord(n: number, isEn: boolean): string {
  if (isEn) return n === 1 ? "stop" : "stops";
  if (n === 1) return "postanek";
  if (n === 2) return "postanka";
  if (n >= 3 && n <= 4) return "postanki";
  return "postankov";
}

/** Število dni s pravilno obliko (1 dan, 2 dni, 3–4 dnevi, 5+ dni). */
function daysWord(n: number, isEn: boolean): string {
  if (isEn) return n === 1 ? "day" : "days";
  if (n === 1) return "dan";
  if (n === 2) return "dni";
  if (n >= 3 && n <= 4) return "dnevi";
  return "dni";
}

// ---------------------------------------------------------------------------
// Pomožniki za izpis
// ---------------------------------------------------------------------------

function eur(n: number): string {
  return `${Math.round(n)} €`;
}

function drivingLabel(minutes: number, isEn: boolean): string {
  const f = formatDrivingMinutes(minutes);
  return f === "—" ? (isEn ? "no driving" : "brez vožnje") : `~${f}`;
}

function routingNote(facts: PlanFacts, isEn: boolean): string {
  if (facts.routingMethod === "osrm") {
    return isEn ? "real roads (OSRM)" : "realne ceste (OSRM)";
  }
  if (facts.routingMethod === "mixed") {
    return isEn ? "mixed OSRM + estimate" : "mešano OSRM + ocena";
  }
  return isEn ? "estimate, haversine × 1.3" : "ocena, haversine × 1.3";
}

// ---------------------------------------------------------------------------
// Namenski vzorci (vrstni red = specifičnost)
// ---------------------------------------------------------------------------

interface IntentPattern {
  intent: string;
  re: RegExp;
  /** Zahteva veljaven sklic na dan (sicer vzorec ne velja). */
  needsDay?: boolean;
}

const PATTERNS: IntentPattern[] = [
  { intent: "help", re: /(kaj (lahko )?vprasam|kaj znas|kaj lahko vpras|pomoc|help|what can i ask|how (does|do|to use))|\bkako deluje/ },
  { intent: "packing", re: /(pakir|prtljag|kaj (si )?vzeti s|what to pack|should i pack|do i need to pack|packing list|luggage|kaj vzeti|kaj s sabo|what.*to bring)/ },
  { intent: "weather", re: /(vreme|vremensk|\bdez\b|padavin|weather|\brain\b|forecast|napoved)/ },
  { intent: "busiest", re: /(natrpan|najbolj poln|najbolj utruj|utrujal|busiest|most packed|most tiring|most intense|heaviest day|najzahtevne)/ },
  { intent: "warnings", re: /(opozoril|izvedljiv|feasib|warning|težav|tezav|problem|zapr|closure|closed|izvedljivost)/ },
  { intent: "family", re: /(otrok|otroc|druzin|family|\bkids\b|children|starost)/ },
  { intent: "stops_total", re: /(koliko postank|how many stops|how many places|how many locations|postankov skupaj|stevilo postank)/ },
  { intent: "drive_day", re: /(\bkm\b|kilomet|razdalj|distance|voznj|driving|how long|kako dolgo|vozila|vozim)/, needsDay: true },
  { intent: "drive_total", re: /(\bkm\b|kilomet|razdalj|distance|voznj|driving|how long|kako dolgo|vozila|vozim)/ },
  { intent: "cost_day", re: /(stane|stalo|cena|ceno|how much|cost|budget|proracun|drago|expensive)/, needsDay: true },
  { intent: "cost_total", re: /(stane|stalo|cena|ceno|how much|cost|budget|proracun|drago|expensive)/ },
  { intent: "day_plan", re: /(kaj|what|plan|program|schedule|dela|do|see|poglej)/, needsDay: true },
];

// ---------------------------------------------------------------------------
// Gradi odgovore (SL+EN) — vsi iz dejstev
// ---------------------------------------------------------------------------

function answerHelp(lang: PlanLang): string {
  const isEn = lang === "en";
  const ex = EXAMPLE_QUESTIONS[lang]
    .map((q) => `„${q}“`)
    .join(isEn ? " · " : " · ");
  return isEn
    ? `I answer from computed plan facts — every number is calculated, never guessed. Ask me about: total driving/km, the busiest day, costs (attractions + driving), a specific day, the weather in the plan, packing, or feasibility warnings. Examples: ${ex}`
    : `Odgovarjam iz izračunanih dejstev o tvojem načrtu — vsaka številka je preračunana, ne ugibana. Vprašaj me o: skupni vožnji/km, najbolj natrpanem dnevu, stroških (atrakcije + vožnja), posameznem dnevu, vremenu v načrtu, pakiranju ali opozorilih o izvedljivosti. Primeri: ${ex}`;
}

function answerDrive(facts: PlanFacts, lang: PlanLang, day?: number): string {
  const isEn = lang === "en";
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return isEn
      ? `Day ${d.day}: ~${d.km} km of driving, ${drivingLabel(d.drivingMinutes, true)} between ${d.stops} ${stopsWord(d.stops, true)}: ${d.names.join(", ")}. (${routingNote(facts, true)} — same source as the feasibility panel.)`
      : `Dan ${d.day}: ~${d.km} km vožnje, ${drivingLabel(d.drivingMinutes, false)} med ${d.stops} ${stopsWord(d.stops, false)}: ${d.names.join(", ")}. (${routingNote(facts, false)} — isti vir kot plošča izvedljivosti.)`;
  }
  const avg = facts.days > 0 ? Math.round(facts.drivingMinutes / facts.days) : 0;
  const longest = facts.perDay.reduce<(PlanFacts["perDay"][number] | null)>(
    (a, b) => (b.drivingMinutes > (a?.drivingMinutes ?? -1) ? b : a),
    null
  );
  const longestLine = longest
    ? isEn
      ? ` Longest behind the wheel: day ${longest.day} (${longest.km} km).`
      : ` Največ za volanom: dan ${longest.day} (${longest.km} km).`
    : "";
  return isEn
    ? `Whole trip: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, true)} across ${facts.days} ${daysWord(facts.days, true)} — on average ${drivingLabel(avg, true)} per day.${longestLine} (${routingNote(facts, true)}.)`
    : `Celotna pot: ~${facts.tripKm} km, ${drivingLabel(facts.drivingMinutes, false)} na ${facts.days} ${daysWord(facts.days, false)} — povprečno ${drivingLabel(avg, false)} na dan.${longestLine} (${routingNote(facts, false)}.)`;
}

function answerBusiest(facts: PlanFacts, lang: PlanLang): string {
  const isEn = lang === "en";
  if (!facts.busiest) {
    return isEn
      ? "I can't rank days by load with this plan (only one day has stops)."
      : "Ne morem razvrstiti dni po obsegu — samo en dan ima postanke.";
  }
  const b = facts.busiest;
  const q = facts.quietest;
  const quietLine = q
    ? isEn
      ? ` The lightest is day ${q.day} (${formatDrivingMinutes(q.loadMinutes)} total).`
      : ` Najlažji je dan ${q.day} (${formatDrivingMinutes(q.loadMinutes)} skupaj).`
    : "";
  return isEn
    ? `The busiest day is day ${b.day}: ${b.stops} ${stopsWord(b.stops, true)} [${b.names.join(", ")}], ${b.km} km + activities = ${formatDrivingMinutes(b.loadMinutes)} of total load.${quietLine} “Load” = driving + activities, computed — not a feeling. If it's too much, use the quick action “Slower pace”.`
    : `Najbolj natrpan je dan ${b.day}: ${b.stops} ${stopsWord(b.stops, false)} [${b.names.join(", ")}], ${b.km} km + aktivnosti = ${formatDrivingMinutes(b.loadMinutes)} skupnega obsega.${quietLine} „Obseg“ = vožnja + aktivnosti, izračunano — ne občutek. Če je preveč, uporabi hitro akcijo „Počasnejši tempo“.`;
}

function answerCost(facts: PlanFacts, lang: PlanLang, day?: number): string {
  const isEn = lang === "en";
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return isEn
      ? `Day ${d.day}: attractions cost ${eur(d.cost)} (${d.names.join(", ")}). Accommodation, food and shopping are NOT included.`
      : `Dan ${d.day}: atrakcije ${eur(d.cost)} (${d.names.join(", ")}). Nočitev, hrana in nakupi NISO vključeni.`;
  }
  const perPerson = facts.groupSize > 0 ? facts.estimatedCost / facts.groupSize : facts.estimatedCost;
  const drive = facts.driveCosts;
  const total = facts.estimatedCost + (drive?.totalEur ?? 0);
  const lines: string[] = [];
  lines.push(
    isEn
      ? `Attractions: ${eur(facts.estimatedCost)} → ${eur(perPerson)} per person (${facts.groupSize}).`
      : `Atrakcije: ${eur(facts.estimatedCost)} → ${eur(perPerson)} na osebo (${facts.groupSize} oseb).`
  );
  if (drive) {
    lines.push(
      isEn
        ? `Driving: fuel ${eur(drive.fuelEur)} + vignette ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (AMZS/DARS tariffs — vignette only if you use motorways).`
        : `Vožnja: gorivo ${eur(drive.fuelEur)} + vinjeta ${eur(drive.vignetteEur)} = ${eur(drive.totalEur)} (tarife AMZS/DARS — vinjeta samo ob avtocestah).`
    );
    lines.push(
      isEn ? `Plan total ≈ ${eur(total)}.` : `Skupaj načrt ≈ ${eur(total)}.`
    );
  } else {
    lines.push(
      isEn
        ? `Driving costs: unknown — the plan has no coordinates, and I won't guess.`
        : `Stroški vožnje: neznani — načrt nima koordinat in ne ugibam.`
    );
  }
  lines.push(
    isEn
      ? `Accommodation, food and shopping are NOT included.`
      : `Nočitev, hrana in nakupi NISO vključeni.`
  );
  if (facts.budgetGoal) {
    const diff = facts.budgetGoal - facts.estimatedCost;
    lines.push(
      diff >= 0
        ? isEn
          ? `Your budget goal: €${facts.budgetGoal} — attractions fit with ${eur(diff)} to spare.`
          : `Tvoj proračunski cilj: ${facts.budgetGoal} € — atrakcije se izidejo, ostane še ${eur(diff)}.`
        : isEn
          ? `Your budget goal: €${facts.budgetGoal} — attractions alone are ${eur(-diff)} over.`
          : `Tvoj proračunski cilj: ${facts.budgetGoal} € — samo atrakcije so že ${eur(-diff)} čez.`
    );
  }
  return lines.join(" ");
}

function answerWeather(
  facts: PlanFacts,
  lang: PlanLang,
  forecast?: PlanForecastDay[] | null
): string {
  const isEn = lang === "en";
  const lines: string[] = [];

  if (forecast && forecast.length > 0) {
    lines.push(
      isEn
        ? `Live forecast for your dates (Open-Meteo, ~16-day horizon):`
        : `Živa napoved za tvoje datume (Open-Meteo, horizont ~16 dni):`
    );
    for (const f of forecast.slice(0, 5)) {
      const rain =
        f.rainProb !== null ? ` · ${f.rainProb} % ${isEn ? "rain" : "padavin"}` : "";
      lines.push(`• ${isEn ? `Day ${f.day}` : `Dan ${f.day}`}: ${f.text}, ${f.tempMax} °C${rain}`);
    }
    const rainy = forecast.filter((f) => (f.rainProb ?? 0) >= 50);
    if (rainy.length > 0) {
      lines.push(
        isEn
          ? `Rain likely on day(s) ${rainy.map((r) => r.day).join(", ")} — the quick action “Rain-suitable” swaps outdoor stops on that day.`
          : `Dež verjeten na dan(e) ${rainy.map((r) => r.day).join(", ")} — hitra akcija „Primerno za dež“ zamenja zunanje postanke tega dneva.`
      );
    }
  } else {
    lines.push(
      isEn
        ? `Weather baked into the plan (estimate at generation time — NOT a live forecast):`
        : `Vreme, zadeto v načrt (ocena ob generiranju — NI živa napoved):`
    );
    for (const d of facts.perDay.slice(0, 5)) {
      if (d.weather) {
        lines.push(`• ${isEn ? `Day ${d.day}` : `Dan ${d.day}`}: ${d.weather}, ${d.temp} °C`);
      }
    }
    if (facts.tripStartDate) {
      lines.push(
        isEn
          ? `A live forecast for your departure date isn't available right now (or it's beyond the ~16-day horizon).`
          : `Žive napovedi za tvoj odhod trenutno ni na voljo (ali je čez horizont ~16 dni).`
      );
    }
  }
  return lines.join(" ");
}

function answerDayPlan(facts: PlanFacts, lang: PlanLang, day: number): string {
  const isEn = lang === "en";
  const d = facts.perDay.find((p) => p.day === day);
  if (!d) return buildUnknownAnswer(lang);
  const dateStr = d.date ? ` (${d.date})` : "";
  const stops =
    d.names.length > 0
      ? d.names.map((n, i) => `${i + 1}. ${n}`).join("; ")
      : isEn
        ? "no stops"
        : "brez postankov";
  return isEn
    ? `Day ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, true)} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, true)} driving, ${d.activityMinutes} min of activities, ${eur(d.cost)}. Weather estimate: ${d.weather || "—"} ${d.temp} °C.${d.warnings > 0 ? ` ${d.warnings} feasibility warning(s).` : ""}`
    : `Dan ${d.day}${dateStr}: ${d.stops} ${stopsWord(d.stops, false)} — ${stops}. ~${d.km} km, ${drivingLabel(d.drivingMinutes, false)} vožnje, ${d.activityMinutes} min aktivnosti, ${eur(d.cost)}. Vreme (ocena): ${d.weather || "—"} ${d.temp} °C.${d.warnings > 0 ? ` ${d.warnings} opozoril o izvedljivosti.` : ""}`;
}

function answerPacking(
  input: PlanQaInput,
  lang: PlanLang
): string {
  const isEn = lang === "en";
  const list = buildSmartPackingList({
    itinerary: input.itinerary,
    input: input.input ?? null,
    lang,
  });
  if (!list) {
    return isEn
      ? "The smart packing list couldn't be computed for this plan."
      : "Pametnega pakirnega seznama ni bilo mogoče izračunati za ta načrt.";
  }
  const items = list.items.slice(0, 5);
  const detail = items
    .map(
      (i) =>
        `• ${i.label}${i.reason ? ` — ${i.reason}` : ""}`
    )
    .join("\n");
  return isEn
    ? `The smart packing list (same one rendered below the plan) recommends ${list.items.length} items. Top picks with reasons:\n${detail}\nMethod: ${list.method === "forecast" ? "from the daily forecast (if departure is within ~16 days)" : "seasonal (no live forecast for these dates)"} — disclosed, not guessed.`
    : `Pametni pakirni seznam (isti, kot se izriše pod načrtom) priporoča ${list.items.length} predmetov. Vrh z razlogi:\n${detail}\nMetoda: ${list.method === "forecast" ? "iz dnevne napovedi (če je odhod znotraj ~16 dni)" : "sezonska (za te datume ni žive napovedi)"} — razkrito, ne ugibano.`;
}

function answerWarnings(facts: PlanFacts, lang: PlanLang): string {
  const isEn = lang === "en";
  if (facts.warnings === 0 && facts.closedNotices.length === 0) {
    return isEn
      ? `The feasibility panel reports no warnings for this plan — every day passes the geo-validation rules (km per day, stop count, schedule gaps).`
      : `Plošča izvedljivosti za ta načrt ne poroča opozoril — vsak dan gre skozi geo-validacijska pravila (km na dan, število postankov, vrzeli v urniku).`;
  }
  const lines: string[] = [];
  if (facts.warnings > 0) {
    lines.push(
      isEn
        ? `${facts.warnings} warning(s), ${facts.errors} of them error-level:`
        : `${facts.warnings} opozoril, od tega ${facts.errors} ravni ERROR:`
    );
  }
  for (const c of facts.closedNotices.slice(0, 3)) {
    lines.push(`• ${c.message}`);
  }
  if (facts.closedNotices.length > 3) {
    lines.push(
      isEn
        ? `…and ${facts.closedNotices.length - 3} more — see the feasibility panel.`
        : `…in še ${facts.closedNotices.length - 3} — poglej ploščo izvedljivosti.`
    );
  }
  lines.push(
    isEn
      ? `Source: the same geo-validation layer that renders below the plan.`
      : `Vir: ista geo-validacijska plast, ki se izriše pod načrtom.`
  );
  return lines.join("\n");
}

function answerStopsTotal(facts: PlanFacts, lang: PlanLang, day?: number): string {
  const isEn = lang === "en";
  if (day !== undefined) {
    const d = facts.perDay.find((p) => p.day === day);
    if (!d) return buildUnknownAnswer(lang);
    return isEn
      ? `Day ${d.day} has ${d.stops} ${stopsWord(d.stops, true)}: ${d.names.join(", ")}.`
      : `Dan ${d.day} ima ${d.stops} ${stopsWord(d.stops, false)}: ${d.names.join(", ")}.`;
  }
  const avg = facts.days > 0 ? (facts.totalStops / facts.days).toFixed(1) : "0";
  const most = facts.perDay.reduce<(PlanFacts["perDay"][number] | null)>(
    (a, b) => (b.stops > (a?.stops ?? -1) ? b : a),
    null
  );
  const mostLine = most
    ? isEn
      ? ` Most stops: day ${most.day} (${most.stops}).`
      : ` Največ postankov: dan ${most.day} (${most.stops}).`
    : "";
  return isEn
    ? `${facts.totalStops} ${stopsWord(facts.totalStops, true)} across ${facts.days} ${daysWord(facts.days, true)} — on average ${avg} per day.${mostLine}`
    : `${facts.totalStops} ${stopsWord(facts.totalStops, false)} na ${facts.days} ${daysWord(facts.days, false)} — povprečno ${avg} na dan.${mostLine}`;
}

function answerFamily(
  input: PlanQaInput,
  lang: PlanLang
): string {
  const isEn = lang === "en";
  const days = Array.isArray(input.itinerary?.days) ? input.itinerary.days : [];
  const familyStops: string[] = [];
  const otherStops: string[] = [];
  for (const d of days) {
    for (const loc of d?.locations ?? []) {
      const dest = DESTINATIONS.find((x) => x.id === loc?.destination_id);
      if (dest?.bestFor?.some((b) => b.toLowerCase().includes("družina") || b.toLowerCase().includes("family"))) {
        familyStops.push(loc.destination_name);
      } else {
        otherStops.push(loc.destination_name);
      }
    }
  }
  if (familyStops.length === 0 && otherStops.length === 0) {
    return buildUnknownAnswer(lang);
  }
  const lines: string[] = [];
  if (familyStops.length > 0) {
    lines.push(
      isEn
        ? `Stops tagged family-friendly in our dataset: ${familyStops.join(", ")}.`
        : `Postanki z oznako „družina“ v našem nizu: ${familyStops.join(", ")}.`
    );
  }
  if (otherStops.length > 0) {
    lines.push(
      isEn
        ? `Without the family tag: ${otherStops.join(", ")} — check each stop's “why” note for suitability.`
        : `Brez oznake „družina“: ${otherStops.join(", ")} — primernost preveri pri razlagi vsakega postanka.`
    );
  }
  lines.push(
    isEn
      ? `For a family rhythm (shorter drives), use the quick action “Family friendly”.`
      : `Za družinski ritem (krajše vožnje) uporabi hitro akcijo „Za družino“.`
  );
  return lines.join(" ");
}

// ---------------------------------------------------------------------------
// Glavna funkcija: deterministični poskus odgovora
// ---------------------------------------------------------------------------

/**
 * Poskusi odgovoriti DETERMINISTIČNO (brez AI).
 * Vrne null, če namen ni prepoznan (klicalec naj poskusi AI pot).
 */
export function answerPlanQuestion(input: PlanQaInput): PlanQaAnswer | null {
  const lang: PlanLang = input.lang === "en" ? "en" : "sl";
  const isEn = lang === "en";
  const days = Array.isArray(input.itinerary?.days) ? input.itinerary.days : [];
  if (days.length === 0) return null;

  const q = stripDiacritics(
    typeof input.question === "string" ? input.question : ""
  ).replace(/\s+/g, " ");

  if (q.trim().length < 3) return null;

  const facts = buildPlanFacts(input.itinerary, input.input ?? null, lang);
  const { day, outOfRange } = extractDayRef(q, facts.days);

  // Dan izven obsega — iskreno popravi uporabnika PREJ kot kateri koli namen
  // („kaj je na dan 7“ nima smisla, če ima načrt 2 dni — ne izmišljujmo dneva)
  if (day === undefined && outOfRange !== undefined) {
    return {
      intent: "out_of_range",
      text: isEn
        ? `The plan only has ${facts.days} ${daysWord(facts.days, true)} — there is no day ${outOfRange}.`
        : `Načrt ima samo ${facts.days} ${daysWord(facts.days, false)} — dneva ${outOfRange} ni.`,
    };
  }

  // Namensko ujemanje — prvi zadetek v vrstnem redu specifičnosti
  let matched: IntentPattern | undefined;
  for (const p of PATTERNS) {
    if (p.re.test(q)) {
      if (p.needsDay && day === undefined) continue;
      matched = p;
      break;
    }
  }

  if (!matched) return null;

  switch (matched.intent) {
    case "help":
      return { intent: "help", text: answerHelp(lang) };
    case "packing":
      return { intent: "packing", text: answerPacking(input, lang) };
    case "weather":
      return {
        intent: "weather",
        text: answerWeather(facts, lang, input.forecast ?? null),
      };
    case "busiest":
      return { intent: "busiest", text: answerBusiest(facts, lang) };
    case "warnings":
      return { intent: "warnings", text: answerWarnings(facts, lang) };
    case "family":
      return { intent: "family", text: answerFamily(input, lang) };
    case "stops_total":
      return { intent: "stops_total", text: answerStopsTotal(facts, lang, day) };
    case "drive_day":
      return { intent: "drive_day", text: answerDrive(facts, lang, day) };
    case "drive_total":
      return { intent: "drive_total", text: answerDrive(facts, lang, undefined) };
    case "cost_day":
      return { intent: "cost_day", text: answerCost(facts, lang, day) };
    case "cost_total":
      return { intent: "cost_total", text: answerCost(facts, lang, undefined) };
    case "day_plan":
      return { intent: "day_plan", text: answerDayPlan(facts, lang, day!) };
    default:
      return null;
  }
}

/** Re-export za route (AI kontekst iz istega vira). */
export { buildPlanFacts, renderFactsSheet };
export type { PlanFacts, PlanLang };
