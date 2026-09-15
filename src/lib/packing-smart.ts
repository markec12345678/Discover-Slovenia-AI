// ============================================================================
// PAMETEN PAKIRNI SEZNAM (F6.1) — vreme + dejanske postanke na načrtu
// ============================================================================
//
// NADGRADNJA legacy `buildPackingList` (src/lib/packing-list.ts): sezonski
// hevristiki. Nova plast gradi iz DVEH realnih virov, ki jih načrt že ima:
//
//   1. days[].weather — DNEVNA napoved Open-Meteo (pripeta ob generiranju,
//      glej enrichWithRealWeather v /api/itinerary): dež → dežna jakna,
//      sneg → zimska oprema, temp ≥ 25 → SPF 50 + voda, min ≤ 5 → sloji …
//   2. days[].locations → DESTINATIONS[type] — jezero/obala/reka → kopalke,
//      soteska/gora → pohodniški čevlji, jama → topla plast (v jamah je
//      8–12 °C VSE leto), terme → kopalke vse leto (notranji bazeni) …
//
// PRIMERJALNI KONTEKST (docs/COMPETITIVE-ANALYSIS-MINDTRIP.md): Stippl
// prodaja "trip-integrated packing list" kot jedro diferencatorja; naš
// odgovor gre dlje — vsak predmet nosi RAZLOG iz konkretnega dneva/stopa
// in RAZKRITO METODO (napoved vs sezonska), ker napoved obstaja le do
// ~16 dni naprej. Iskrenost kot znamka.
//
// Deterministična čista funkcija (enak input = enak output) — teče na
// clientu (planner + /pot iz shranjenih načrtov, isto za VSE stare načrte —
// nič sprememb API) in bi lahko tudi na strežniku. Brez stranskih učinkov.
// ============================================================================

import { DESTINATIONS } from "@/lib/slovenia-data";
import type { DayPlan, Itinerary, PlannerInput } from "@/lib/types";

// --- Vrste -------------------------------------------------------------

export type PackingCategory =
  | "clothing"
  | "weather"
  | "activity"
  | "tech"
  | "documents"
  | "health"
  | "kids";

export type PackingMethod = "forecast" | "season";

export interface SmartPackingItem {
  /** Stabilni ID (slug) — ključ za persist odkljukov */
  id: string;
  /** Oznaka v izbranem jeziku */
  label: string;
  category: PackingCategory;
  /** KRATEK razlog iz konkretnih podatkov ("Dan 2: dež (napoved)") */
  reason?: string;
  /** Količinski namig ("× 6") */
  quantity?: string;
}

export interface SmartPackingList {
  items: SmartPackingItem[];
  /** Vir odločitev — razkrit uporabniku (badge + opomba) */
  method: PackingMethod;
  /** Iskrena opomba metode (zakaj ne napoved / omejitve) */
  methodNote: string;
}

export interface SmartPackingInput {
  itinerary: Itinerary;
  /** Interesi/tip skupine (planner ga ima, shranjeni načrti ne — opcijsko) */
  input?: PlannerInput | null;
  lang?: "sl" | "en";
}

// --- Konstante ----------------------------------------------------------

/** Kap elementov (berljivost; kategorije omogočijo več kot legacy 14) */
const MAX_ITEMS = 18;

/** Domet Open-Meteo dnevne napovedi (dni) — po tem je le sezonska ocena. */
const FORECAST_HORIZON_DAYS = 16;

/** Pogoji z dežem (SL+EN izpis weatherCodeToText / weatherCodeToTextEn). */
const RAINY = new Set(["dež", "plohe", "nevihta", "rain", "showers", "thunderstorm"]);
/** Pogoji s snegom. */
const SNOWY = new Set(["sneg", "snežne plohe", "snow", "snow showers"]);

/** Dvodnevni prah v razlogih — omeni največ prva 2 dneva. */
const MAX_REASON_DAYS = 2;

// --- Pomožniki ----------------------------------------------------------

/** ISO datum → Date brez časovnega pasu (lokalna polnoč). */
function parseISO(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dan v letu meseca (1–12) ali null. */
function monthOf(iso: string): number | null {
  const d = parseISO(iso);
  return d ? d.getMonth() + 1 : null;
}

/** Sezona iz meseca (dec–feb zima, mar–maj pomlad, jun–avg poletje, sep–nov jesen). */
function seasonFromMonth(m: number): "winter" | "spring" | "summer" | "autumn" {
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

/** Vrstni red kategorij v izpisu (obleka → vreme → aktivnost → …). */
const CATEGORY_ORDER: PackingCategory[] = [
  "clothing",
  "weather",
  "activity",
  "tech",
  "health",
  "documents",
  "kids",
];

/** Locale-neodvisen slug ID. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// --- Jedro --------------------------------------------------------------

/**
 * Presoja, ali je days[].weather REALNA dnevna napoved ali sezonska
 * ograda (fallback v /api/itinerary, ko napoved ni na voljo).
 *
* Zanesljivi signaturi sezonske ograje (enak vir kode):
 *   - "sončno" nastane SAMO v fallbacku (realna napoved za jasno vreme
 *     izpiše "jasno"/"clear")
 *   - zimski fallback = "sneg" + temp točno 2, ENAKO na vseh dnevih
 * Poleg tega: odhod več kot 16 dni naprej ali v preteklosti → napoved
 * ob generiranju ni mogla obstajati (ali je zdaj zastarela).
 */
function detectMethod(days: DayPlan[]): "forecast" | "season" {
  const weathers = days
    .map((d) => d?.weather)
    .filter((w): w is NonNullable<typeof w> => Boolean(w));
  if (weathers.length === 0) return "season";

  // 1) Explicitna sezonska signatura
  if (weathers.some((w) => w.condition === "sončno")) return "season";
  const allIdenticalWinter =
    weathers.length > 0 &&
    weathers.every((w) => w.condition === "sneg" && w.temp === 2);
  if (allIdenticalWinter) return "season";

  return "forecast";
}

interface DayWeatherFacts {
  rainDays: number[]; // indeksi dni (0-based) z dežjem
  snowDays: number[];
  maxTemp: number | null;
  minTemp: number | null;
}

function readWeatherFacts(days: DayPlan[]): DayWeatherFacts {
  const rainDays: number[] = [];
  const snowDays: number[] = [];
  let maxTemp: number | null = null;
  let minTemp: number | null = null;
  days.forEach((d, i) => {
    const w = d?.weather;
    if (!w) return;
    const cond = (w.condition ?? "").toString().trim().toLowerCase();
    if (RAINY.has(cond)) rainDays.push(i);
    if (SNOWY.has(cond)) snowDays.push(i);
    const t = Number(w.temp);
    if (Number.isFinite(t)) {
      maxTemp = maxTemp === null ? t : Math.max(maxTemp, t);
      minTemp = minTemp === null ? t : Math.min(minTemp, t);
    }
  });
  return { rainDays, snowDays, maxTemp, minTemp };
}

/** "Dan 2" / "Day 2" za razloge. */
function dayRef(i: number, isEn: boolean): string {
  return isEn ? `Day ${i + 1}` : `Dan ${i + 1}`;
}

/** Razlog "Dan 1, Dan 3: dež (napoved)" — kap prvih 2 dni. */
function daysReason(idxs: number[], isEn: boolean, fact: string): string {
  const daysPart = idxs
    .slice(0, MAX_REASON_DAYS)
    .map((i) => dayRef(i, isEn))
    .join(", ");
  return `${daysPart}: ${fact}`;
}

interface StopTypeFacts {
  /** Vsi tipi destinacij na načrtu (dedup) */
  types: Set<string>;
  /** Imena tipov z dnevom za razloge: type → [dayIdx, name][] */
  typed: Map<string, { day: number; name: string }[]>;
}

function readStopTypes(days: DayPlan[]): StopTypeFacts {
  const types = new Set<string>();
  const typed = new Map<string, { day: number; name: string }[]>();
  days.forEach((d, dayIdx) => {
    const locs = Array.isArray(d?.locations) ? d.locations : [];
    locs.forEach((loc) => {
      const dest = DESTINATIONS.find((x) => x.id === loc?.destination_id);
      if (!dest) return;
      types.add(dest.type);
      const arr = typed.get(dest.type) ?? [];
      arr.push({ day: dayIdx, name: dest.name });
      typed.set(dest.type, arr);
    });
  });
  return { types, typed };
}

/** Razlog za tip destinacije: "Dan 1: Bled (jezero)". */
function typeReason(
  facts: StopTypeFacts,
  type: string,
  typeLabel: string,
  isEn: boolean
): string {
  const entries = facts.typed.get(type) ?? [];
  const shown = entries.slice(0, MAX_REASON_DAYS);
  const part = shown
    .map((e) => `${dayRef(e.day, isEn)}: ${e.name}`)
    .join(isEn ? "; " : "; ");
  return `${part} (${typeLabel})`;
}

// --- Glavna funkcija ------------------------------------------------------

export function buildSmartPackingList(
  input: SmartPackingInput
): SmartPackingList | null {
  const days = Array.isArray(input?.itinerary?.days)
    ? input.itinerary.days
    : [];
  if (days.length === 0) return null;

  const isEn = input?.lang === "en";
  const planner = input?.input ?? null;
  const interests = Array.isArray(planner?.interests)
    ? planner.interests.map((i) => i.toString().trim().toLowerCase())
    : [];
  const partyType = (planner?.partyType ?? "").toString().toLowerCase();
  const groupHaystack = [...interests, partyType].join(" ");

  // --- Metoda (iskrenost) -----------------------------------------------
  let method = detectMethod(days);
  const startISO = input?.itinerary?.tripStartDate;
  let horizonNote = false;
  let pastNote = false;
  if (startISO) {
    const start = parseISO(startISO);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start) {
      const diffDays = Math.round((start.getTime() - today.getTime()) / 86400000);
      if (diffDays > FORECAST_HORIZON_DAYS) {
        method = "season";
        horizonNote = true;
      } else if (diffDays < 0) {
        method = "season";
        pastNote = true;
      }
    }
  }

  const methodNote = isEn
    ? method === "forecast"
      ? "Built from the daily forecast attached to this plan (Open-Meteo, at generation time)."
      : horizonNote
        ? `Departure is more than ${FORECAST_HORIZON_DAYS} days away — no daily forecast exists yet. These are seasonal recommendations and will not update automatically.`
        : pastNote
          ? "The trip date has already passed — seasonal recommendations."
          : "No departure date on this plan — seasonal recommendations."
    : method === "forecast"
      ? "Sestavljeno iz dnevne napovedi, priložene temu načrtu (Open-Meteo, ob generiranju)."
      : horizonNote
        ? `Odhod je več kot ${FORECAST_HORIZON_DAYS} dni stran — dnevna napoved še ne obstaja. Priporočila so sezonska in se ne bodo samodejno posodobila.`
        : pastNote
          ? "Datum potovanja je že mimo — sezonska priporočila."
          : "Načrt brez datuma odhoda — sezonska priporočila.";

  // --- Sezona (fallback iz meseca datuma ali input) ----------------------
  const month = startISO ? monthOf(startISO) : null;
  const season: string =
    (month ? seasonFromMonth(month) : (planner?.season ?? "")) || "";

  // --- Dejstva -------------------------------------------------------------
  const weather = readWeatherFacts(days);
  const stops = readStopTypes(days);

  // --- Predmeti (vrstni red po kategorijah, dedup po ID) -------------------
  const items: SmartPackingItem[] = [];
  const seen = new Set<string>();
  const push = (item: SmartPackingItem) => {
    if (seen.has(item.id)) {
      // Dedup: dopolni razlog obstoječega (prvi razlog zmaga — vrstni red je pomemben)
      return;
    }
    seen.add(item.id);
    items.push(item);
  };

  // === OBLAČILA (osnova + količine) ===
  const daysCount = days.length;
  push({
    id: "clothes-base",
    label: isEn ? "Clothes for the trip (+1 spare set)" : "Oblačila za potovanje (+1 rezervni komplet)",
    category: "clothing",
    quantity: `× ${daysCount + 1}`,
    reason: isEn
      ? `${daysCount}-day plan — pack one spare set`
      : `načrt na ${daysCount} ${daysCount === 1 ? "dan" : daysCount === 2 ? "dneva" : "dni"} — en rezervni komplet`,
  });

  const tempSpread =
    weather.maxTemp !== null && weather.minTemp !== null
      ? weather.maxTemp - weather.minTemp
      : null;
  if (tempSpread !== null && tempSpread >= 12) {
    push({
      id: "layers-mix",
      label: isEn ? "Layered clothing (big day-to-day swings)" : "Oblačila v slojih (velike razlike med dnevi)",
      category: "clothing",
      reason: isEn
        ? `forecast range ${weather.minTemp}–${weather.maxTemp} °C across days`
        : `napoved ${weather.minTemp}–${weather.maxTemp} °C med dnevi`,
    });
  } else if (method === "season" && (season === "spring" || season === "autumn")) {
    push({
      id: "layers-season",
      label: isEn ? "Layers for changeable weather" : "Sloji za spremenljivo vreme",
      category: "clothing",
      reason: isEn ? "spring/autumn season" : "pomlad/jesenska sezona",
    });
  }

  if (
    (weather.minTemp !== null && weather.minTemp <= 5) ||
    (method === "season" && season === "winter")
  ) {
    push({
      id: "thermal",
      label: isEn ? "Thermal base layers + hat and gloves" : "Termično spodnje perilo + kapa in rokavice",
      category: "clothing",
      reason:
        weather.minTemp !== null && weather.minTemp <= 5
          ? isEn
            ? `coldest day: ${weather.minTemp} °C`
            : `najhladnejši dan: ${weather.minTemp} °C`
          : isEn
            ? "winter season"
            : "zimska sezona",
    });
  }

  // === VREME (iz dnevne napovedi / sezone) ===
  if (weather.rainDays.length > 0) {
    push({
      id: "rain-jacket",
      label: isEn ? "Rain jacket (compact)" : "Dežna jakna (kompaktna)",
      category: "weather",
      reason: daysReason(
        weather.rainDays,
        isEn,
        isEn ? "rain in forecast" : "dež v napovedi"
      ),
    });
  } else if (method === "season" && (season === "autumn" || season === "spring")) {
    push({
      id: "rain-jacket",
      label: isEn ? "Rain jacket (compact)" : "Dežna jakna (kompaktna)",
      category: "weather",
      reason: isEn ? "autumn/spring rain is common" : "jesensko/pomladno deževje je pogosto",
    });
  }

  if (weather.snowDays.length > 0 || (method === "season" && season === "winter")) {
    push({
      id: "winter-footwear",
      label: isEn ? "Winter footwear (snow-ready)" : "Zimska obutev (primerna za sneg)",
      category: "weather",
      reason:
        weather.snowDays.length > 0
          ? daysReason(
              weather.snowDays,
              isEn,
              isEn ? "snow in forecast" : "sneg v napovedi"
            )
          : isEn
            ? "winter season"
            : "zimska sezona",
    });
  }

  const hot =
    (weather.maxTemp !== null && weather.maxTemp >= 25) ||
    (method === "season" && season === "summer");
  if (hot) {
    push({
      id: "sun-cream",
      label: isEn ? "Sunscreen SPF 50 + sun hat" : "Sončna krema SPF 50 + kapa za sonce",
      category: "health",
      reason:
        weather.maxTemp !== null && weather.maxTemp >= 25
          ? isEn
            ? `warmest day: ${weather.maxTemp} °C`
            : `najtoplejši dan: ${weather.maxTemp} °C`
          : isEn
            ? "summer season"
            : "poletna sezona",
    });
  }

  // === AKTIVNOSTI (iz DEJANSKIH postankov na načrtu) ===
  const typeLabel = (t: string): string =>
    ({
      lake: isEn ? "lake" : "jezero",
      city: isEn ? "city" : "mesto",
      mountain: isEn ? "mountain" : "gora",
      cave: isEn ? "cave" : "jama",
      coast: isEn ? "coast" : "obala",
      river: isEn ? "river" : "reka",
      spa: isEn ? "thermal spa" : "terme",
      gorge: isEn ? "gorge" : "soteska",
      castle: isEn ? "castle" : "grad",
    })[t] ?? t;

  const hasWater = ["lake", "coast", "river"].some((t) => stops.types.has(t));
  const hasSpa = stops.types.has("spa");
  if ((hasWater && (hot || method === "forecast")) || hasSpa) {
    push({
      id: "swimwear",
      label: isEn ? "Swimwear + quick-dry towel" : "Kopalke + hitro sušeča brisača",
      category: "activity",
      reason: hasSpa
        ? typeReason(stops, "spa", typeLabel("spa"), isEn) +
            (isEn ? " — indoor pools, year-round" : " — notranji bazeni, vse leto")
        : [
            ...(["lake", "coast", "river"] as const)
              .filter((t) => stops.types.has(t))
              .flatMap((t) =>
                (stops.typed.get(t) ?? []).slice(0, 1).map(
                  (e) => `${dayRef(e.day, isEn)}: ${e.name}`
                )
              ),
          ].join("; ") + ` (${isEn ? "water on the plan" : "voda na načrtu"})`,
    });
  } else if (hasWater && method === "season" && season === "summer") {
    push({
      id: "swimwear",
      label: isEn ? "Swimwear + quick-dry towel" : "Kopalke + hitro sušeča brisača",
      category: "activity",
      reason: isEn ? "water stops + summer season" : "vodni postanki + poletna sezona",
    });
  }

  if (stops.types.has("gorge") || stops.types.has("mountain")) {
    const first = stops.types.has("gorge") ? "gorge" : "mountain";
    push({
      id: "hiking-boots",
      label: isEn ? "Sturdy hiking footwear" : "Čvrsta pohodniška obutev",
      category: "activity",
      reason: typeReason(stops, first, typeLabel(first), isEn),
    });
    push({
      id: "water-bottle",
      label: isEn ? "Water bottle (0.5–1 l per person)" : "Flaša vode (0,5–1 l na osebo)",
      category: "health",
      reason: isEn
        ? "mountain/gorge stops — drinking water matters on trails"
        : "gorski/soteski postanki — pitna voda je na poti pomembna",
    });
  }

  if (stops.types.has("cave")) {
    push({
      id: "cave-warm-layer",
      label: isEn ? "Warm layer for caves (8–12 °C year-round)" : "Topla plast za jame (8–12 °C vse leto)",
      category: "activity",
      reason: typeReason(stops, "cave", typeLabel("cave"), isEn),
    });
  }

  if (stops.types.has("city") || stops.types.has("castle")) {
    push({
      id: "walking-shoes",
      label: isEn ? "Comfortable walking shoes" : "Udobje za hojo (superge)",
      category: "activity",
      reason:
        stops.types.has("city")
          ? typeReason(stops, "city", typeLabel("city"), isEn)
          : typeReason(stops, "castle", typeLabel("castle"), isEn),
    });
  }

  // === INTERESI / SKUPINA (iz inputa, če je na voljo) ===
  if (/dru[žz]in|otrok|family|kids|children/.test(groupHaystack) || partyType === "family") {
    push({
      id: "kids-kit",
      label: isEn ? "Kids' kit (car games, wet wipes, snacks)" : "Otroški pripomočki (igrice za vožnjo, vlažilne robčki, prigrizki)",
      category: "kids",
    });
  }
  if (/kulinar|hran|jest|gastro|vino|food|cuisine|wine/.test(groupHaystack)) {
    push({
      id: "luggage-room",
      label: isEn ? "A little spare luggage room for local treats" : "Rahel prtljačni prostor za lokalne dobrote",
      category: "other" as PackingCategory,
    });
  }

  // === DOLŽINA / TEHNIKA ===
  if (daysCount > 5) {
    push({
      id: "power-bank",
      label: isEn ? "Power bank" : "Power bank",
      category: "tech",
      reason: isEn ? `${daysCount}-day plan` : `načrt na ${daysCount} dni`,
    });
    push({
      id: "laundry",
      label: isEn ? "Plan a laundry stop mid-trip" : "Načrtuj pralni servis na polovici potovanja",
      category: "clothing",
      reason: isEn ? "pack light, wash once" : "pakiraj lahko, enkrat operi",
    });
  }

  // === VEDNO ===
  push({
    id: "cash-eur",
    label: isEn ? "Euros in cash (smaller local spots)" : "Gotovina v evrih (manjši lokalci)",
    category: "documents",
  });
  push({
    id: "eu-plugs",
    label: isEn ? "EU sockets — no adapter needed" : "VTIČNICE EU — adapter ni potreben",
    category: "tech",
  });
  push({
    id: "foldable-bag",
    label: isEn ? "Foldable bag for souvenirs" : "Zložljiva torba za spominke",
    category: "other" as PackingCategory,
  });
  push({
    id: "id-doc",
    label: isEn ? "ID card / passport" : "Osebni dokument / potni list",
    category: "documents",
  });

  // --- Kategorizacija "other" → najbližja obstoječa (tipizirano) ----------
  const normalized: SmartPackingItem[] = items.map((i) => ({
    ...i,
    category: CATEGORY_ORDER.includes(i.category) ? i.category : "documents",
  }));

  // --- Sortiraj po vrstnem redu kategorij, kap --------------------------------
  const withOrder = normalized.map((item) => ({
    item,
    catIdx: CATEGORY_ORDER.indexOf(item.category),
  }));
  withOrder.sort(
    (a, b) =>
      (a.catIdx === -1 ? 99 : a.catIdx) - (b.catIdx === -1 ? 99 : b.catIdx)
  );
  const finalItems = withOrder.slice(0, MAX_ITEMS).map((x) => x.item);

  return { items: finalItems, method, methodNote };
}

/** Podpis seznama (stabilen ključ za persist odkljukov). */
export function smartPackingSignature(list: SmartPackingList): string {
  return list.items.map((i) => i.id).join("|");
}
