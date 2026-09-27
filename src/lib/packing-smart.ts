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
import { PL, type PlannerLang } from "@/lib/planner-lang";

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
  /** W1-2b-2: 4-jezično (PL pogodba). */
  lang?: PlannerLang;
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

/** "Dan 2" / "Day 2" / "Giorno 2" / "Tag 2" za razloge. */
function dayRef(i: number, lang: PlannerLang): string {
  return PL(lang, {
    sl: `Dan ${i + 1}`,
    en: `Day ${i + 1}`,
    it: `Giorno ${i + 1}`,
    de: `Tag ${i + 1}`,
  });
}

/** Razlog "Dan 1, Dan 3: dež (napoved)" — kap prvih 2 dni. */
function daysReason(idxs: number[], lang: PlannerLang, fact: string): string {
  const daysPart = idxs
    .slice(0, MAX_REASON_DAYS)
    .map((i) => dayRef(i, lang))
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
  lang: PlannerLang
): string {
  const entries = facts.typed.get(type) ?? [];
  const shown = entries.slice(0, MAX_REASON_DAYS);
  const part = shown
    .map((e) => `${dayRef(e.day, lang)}: ${e.name}`)
    .join("; ");
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

  const lang: PlannerLang =
    input?.lang === "en" || input?.lang === "it" || input?.lang === "de"
      ? input.lang
      : "sl";
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

  const methodNote =
    method === "forecast"
      ? PL(lang, {
          sl: "Sestavljeno iz dnevne napovedi, priložene temu načrtu (Open-Meteo, ob generiranju).",
          en: "Built from the daily forecast attached to this plan (Open-Meteo, at generation time).",
          it: "Composta dalla previsione giornaliera allegata a questo piano (Open-Meteo, alla generazione).",
          de: "Erstellt aus der Tagesvorhersage, die an diesem Plan hängt (Open-Meteo, zum Erstellungszeitpunkt).",
        })
      : horizonNote
        ? PL(lang, {
            sl: `Odhod je več kot ${FORECAST_HORIZON_DAYS} dni stran — dnevna napoved še ne obstaja. Priporočila so sezonska in se ne bodo samodejno posodobila.`,
            en: `Departure is more than ${FORECAST_HORIZON_DAYS} days away — no daily forecast exists yet. These are seasonal recommendations and will not update automatically.`,
            it: `La partenza è tra più di ${FORECAST_HORIZON_DAYS} giorni — la previsione giornaliera non esiste ancora. Questi sono consigli stagionali e non si aggiorneranno automaticamente.`,
            de: `Der Abflug liegt mehr als ${FORECAST_HORIZON_DAYS} Tage entfernt — es gibt noch keine Tagesvorhersage. Dies sind Saisonempfehlungen und aktualisieren sich nicht automatisch.`,
          })
        : pastNote
          ? PL(lang, {
              sl: "Datum potovanja je že mimo — sezonska priporočila.",
              en: "The trip date has already passed — seasonal recommendations.",
              it: "La data del viaggio è già passata — consigli stagionali.",
              de: "Das Reisedatum ist bereits vergangen — Saisonempfehlungen.",
            })
          : PL(lang, {
              sl: "Načrt brez datuma odhoda — sezonska priporočila.",
              en: "No departure date on this plan — seasonal recommendations.",
              it: "Piano senza data di partenza — consigli stagionali.",
              de: "Plan ohne Abreisedatum — Saisonempfehlungen.",
            });

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
  const daysWordSl =
    daysCount === 1 ? "dan" : daysCount === 2 ? "dneva" : "dni";
  push({
    id: "clothes-base",
    label: PL(lang, {
      sl: "Oblačila za potovanje (+1 rezervni komplet)",
      en: "Clothes for the trip (+1 spare set)",
      it: "Vestiti per il viaggio (+1 completo di riserva)",
      de: "Kleidung für die Reise (+1 Wechselset)",
    }),
    category: "clothing",
    quantity: `× ${daysCount + 1}`,
    reason: PL(lang, {
      sl: `načrt na ${daysCount} ${daysWordSl} — en rezervni komplet`,
      en: `${daysCount}-day plan — pack one spare set`,
      it: `piano di ${daysCount} ${daysCount === 1 ? "giorno" : "giorni"} — un completo di riserva`,
      de: `${daysCount}-Tage-Plan — ein Wechselset einpacken`,
    }),
  });

  const tempSpread =
    weather.maxTemp !== null && weather.minTemp !== null
      ? weather.maxTemp - weather.minTemp
      : null;
  if (tempSpread !== null && tempSpread >= 12) {
    push({
      id: "layers-mix",
      label: PL(lang, {
        sl: "Oblačila v slojih (velike razlike med dnevi)",
        en: "Layered clothing (big day-to-day swings)",
        it: "Vestiti a strati (forti escursioni termiche)",
        de: "Zwiebellook (große Tagesschwankungen)",
      }),
      category: "clothing",
      reason: PL(lang, {
        sl: `napoved ${weather.minTemp}–${weather.maxTemp} °C med dnevi`,
        en: `forecast range ${weather.minTemp}–${weather.maxTemp} °C across days`,
        it: `intervallo previsto ${weather.minTemp}–${weather.maxTemp} °C tra i giorni`,
        de: `Vorhersagebereich ${weather.minTemp}–${weather.maxTemp} °C über die Tage`,
      }),
    });
  } else if (method === "season" && (season === "spring" || season === "autumn")) {
    push({
      id: "layers-season",
      label: PL(lang, {
        sl: "Sloji za spremenljivo vreme",
        en: "Layers for changeable weather",
        it: "Strati per meteo variabile",
        de: "Schichten für wechselhaftes Wetter",
      }),
      category: "clothing",
      reason: PL(lang, {
        sl: "pomlad/jesenska sezona",
        en: "spring/autumn season",
        it: "stagione primaverile/autunnale",
        de: "Frühlings-/Herbstsaison",
      }),
    });
  }

  if (
    (weather.minTemp !== null && weather.minTemp <= 5) ||
    (method === "season" && season === "winter")
  ) {
    push({
      id: "thermal",
      label: PL(lang, {
        sl: "Termično spodnje perilo + kapa in rokavice",
        en: "Thermal base layers + hat and gloves",
        it: "Intimo termico + cappello e guanti",
        de: "Thermounterwäsche + Mütze und Handschuhe",
      }),
      category: "clothing",
      reason:
        weather.minTemp !== null && weather.minTemp <= 5
          ? PL(lang, {
              sl: `najhladnejši dan: ${weather.minTemp} °C`,
              en: `coldest day: ${weather.minTemp} °C`,
              it: `giorno più freddo: ${weather.minTemp} °C`,
              de: `kältester Tag: ${weather.minTemp} °C`,
            })
          : PL(lang, {
              sl: "zimska sezona",
              en: "winter season",
              it: "stagione invernale",
              de: "Wintersaison",
            }),
    });
  }

  // === VREME (iz dnevne napovedi / sezone) ===
  if (weather.rainDays.length > 0) {
    push({
      id: "rain-jacket",
      label: PL(lang, {
        sl: "Dežna jakna (kompaktna)",
        en: "Rain jacket (compact)",
        it: "Giacca antipioggia (compatta)",
        de: "Regenjacke (kompakt)",
      }),
      category: "weather",
      reason: daysReason(
        weather.rainDays,
        lang,
        PL(lang, {
          sl: "dež v napovedi",
          en: "rain in forecast",
          it: "pioggia in previsione",
          de: "Regen in der Vorhersage",
        })
      ),
    });
  } else if (method === "season" && (season === "autumn" || season === "spring")) {
    push({
      id: "rain-jacket",
      label: PL(lang, {
        sl: "Dežna jakna (kompaktna)",
        en: "Rain jacket (compact)",
        it: "Giacca antipioggia (compatta)",
        de: "Regenjacke (kompakt)",
      }),
      category: "weather",
      reason: PL(lang, {
        sl: "jesensko/pomladno deževje je pogosto",
        en: "autumn/spring rain is common",
        it: "in autunno/primavera la pioggia è frequente",
        de: "Herbst-/Frühlingsregen ist häufig",
      }),
    });
  }

  if (weather.snowDays.length > 0 || (method === "season" && season === "winter")) {
    push({
      id: "winter-footwear",
      label: PL(lang, {
        sl: "Zimska obutev (primerna za sneg)",
        en: "Winter footwear (snow-ready)",
        it: "Calzature invernali (adatte alla neve)",
        de: "Winter footwear (schneetauglich)",
      }),
      category: "weather",
      reason:
        weather.snowDays.length > 0
          ? daysReason(
              weather.snowDays,
              lang,
              PL(lang, {
                sl: "sneg v napovedi",
                en: "snow in forecast",
                it: "neve in previsione",
                de: "Schnee in der Vorhersage",
              })
            )
          : PL(lang, {
              sl: "zimska sezona",
              en: "winter season",
              it: "stagione invernale",
              de: "Wintersaison",
            }),
    });
  }

  const hot =
    (weather.maxTemp !== null && weather.maxTemp >= 25) ||
    (method === "season" && season === "summer");
  if (hot) {
    push({
      id: "sun-cream",
      label: PL(lang, {
        sl: "Sončna krema SPF 50 + kapa za sonce",
        en: "Sunscreen SPF 50 + sun hat",
        it: "Crema solare SPF 50 + cappello da sole",
        de: "Sonnencreme SPF 50 + Sonnenhut",
      }),
      category: "health",
      reason:
        weather.maxTemp !== null && weather.maxTemp >= 25
          ? PL(lang, {
              sl: `najtoplejši dan: ${weather.maxTemp} °C`,
              en: `warmest day: ${weather.maxTemp} °C`,
              it: `giorno più caldo: ${weather.maxTemp} °C`,
              de: `wärmster Tag: ${weather.maxTemp} °C`,
            })
          : PL(lang, {
              sl: "poletna sezona",
              en: "summer season",
              it: "stagione estiva",
              de: "Sommersaison",
            }),
    });
  }

  // === AKTIVNOSTI (iz DEJANSKIH postankov na načrtu) ===
  const typeLabel = (t: string): string =>
    ({
      lake: PL(lang, { sl: "jezero", en: "lake", it: "lago", de: "See" }),
      city: PL(lang, { sl: "mesto", en: "city", it: "città", de: "Stadt" }),
      mountain: PL(lang, { sl: "gora", en: "mountain", it: "montagna", de: "Berg" }),
      cave: PL(lang, { sl: "jama", en: "cave", it: "grotta", de: "Höhle" }),
      coast: PL(lang, { sl: "obala", en: "coast", it: "costa", de: "Küste" }),
      river: PL(lang, { sl: "reka", en: "river", it: "fiume", de: "Fluss" }),
      spa: PL(lang, { sl: "terme", en: "thermal spa", it: "terme", de: "Thermalbad" }),
      gorge: PL(lang, { sl: "soteska", en: "gorge", it: "gorge", de: "Schlucht" }),
      castle: PL(lang, { sl: "grad", en: "castle", it: "castello", de: "Burg" }),
    })[t] ?? t;

  const hasWater = ["lake", "coast", "river"].some((t) => stops.types.has(t));
  const hasSpa = stops.types.has("spa");
  if ((hasWater && (hot || method === "forecast")) || hasSpa) {
    push({
      id: "swimwear",
      label: PL(lang, {
        sl: "Kopalke + hitro sušeča brisača",
        en: "Swimwear + quick-dry towel",
        it: "Costume + asciugamano veloce",
        de: "Badekleidung + schnell trocknendes Handtuch",
      }),
      category: "activity",
      reason: hasSpa
        ? typeReason(stops, "spa", typeLabel("spa"), lang) +
            PL(lang, {
              sl: " — notranji bazeni, vse leto",
              en: " — indoor pools, year-round",
              it: " — piscine interne, tutto l'anno",
              de: " — Innenpools, ganzjährig",
            })
        : [
            ...(["lake", "coast", "river"] as const)
              .filter((t) => stops.types.has(t))
              .flatMap((t) =>
                (stops.typed.get(t) ?? []).slice(0, 1).map(
                  (e) => `${dayRef(e.day, lang)}: ${e.name}`
                )
              ),
          ].join("; ") +
            ` (${PL(lang, {
              sl: "voda na načrtu",
              en: "water on the plan",
              it: "acqua nel piano",
              de: "Wasser im Plan",
            })})`,
    });
  } else if (hasWater && method === "season" && season === "summer") {
    push({
      id: "swimwear",
      label: PL(lang, {
        sl: "Kopalke + hitro sušeča brisača",
        en: "Swimwear + quick-dry towel",
        it: "Costume + asciugamano veloce",
        de: "Badekleidung + schnell trocknendes Handtuch",
      }),
      category: "activity",
      reason: PL(lang, {
        sl: "vodni postanki + poletna sezona",
        en: "water stops + summer season",
        it: "tappe d'acqua + stagione estiva",
        de: "Wasser-Stopps + Sommersaison",
      }),
    });
  }

  if (stops.types.has("gorge") || stops.types.has("mountain")) {
    const first = stops.types.has("gorge") ? "gorge" : "mountain";
    push({
      id: "hiking-boots",
      label: PL(lang, {
        sl: "Čvrsta pohodniška obutev",
        en: "Sturdy hiking footwear",
        it: "Calzature da trekking robuste",
        de: "Robustes Schuhwerk zum Wandern",
      }),
      category: "activity",
      reason: typeReason(stops, first, typeLabel(first), lang),
    });
    push({
      id: "water-bottle",
      label: PL(lang, {
        sl: "Flaša vode (0,5–1 l na osebo)",
        en: "Water bottle (0.5–1 l per person)",
        it: "Bottiglia d'acqua (0,5–1 l a persona)",
        de: "Wasserflasche (0,5–1 l pro Person)",
      }),
      category: "health",
      reason: PL(lang, {
        sl: "gorski/soteski postanki — pitna voda je na poti pomembna",
        en: "mountain/gorge stops — drinking water matters on trails",
        it: "tappe in montagna/nelle gorge — l'acqua conta sui sentieri",
        de: "Berg-/Schlucht-Stopps — Trinkwasser zählt auf Wegen",
      }),
    });
  }

  if (stops.types.has("cave")) {
    push({
      id: "cave-warm-layer",
      label: PL(lang, {
        sl: "Topla plast za jame (8–12 °C vse leto)",
        en: "Warm layer for caves (8–12 °C year-round)",
        it: "Strato caldo per le grotte (8–12 °C tutto l'anno)",
        de: "Warme Schicht für Höhlen (8–12 °C ganzjährig)",
      }),
      category: "activity",
      reason: typeReason(stops, "cave", typeLabel("cave"), lang),
    });
  }

  if (stops.types.has("city") || stops.types.has("castle")) {
    push({
      id: "walking-shoes",
      label: PL(lang, {
        sl: "Udobje za hojo (superge)",
        en: "Comfortable walking shoes",
        it: "Scarpe comode per camminare",
        de: "Bequeme Schuhe zum Laufen",
      }),
      category: "activity",
      reason:
        stops.types.has("city")
          ? typeReason(stops, "city", typeLabel("city"), lang)
          : typeReason(stops, "castle", typeLabel("castle"), lang),
    });
  }

  // === INTERESI / SKUPINA (iz inputa, če je na voljo) ===
  if (/dru[žz]in|otrok|family|kids|children|famigli|bambin|kinder|familien/.test(groupHaystack) || partyType === "family") {
    push({
      id: "kids-kit",
      label: PL(lang, {
        sl: "Otroški pripomočki (igrice za vožnjo, vlažilne robčki, prigrizki)",
        en: "Kids' kit (car games, wet wipes, snacks)",
        it: "Kit per bambini (giochi in auto, salviette, spuntini)",
        de: "Kinder-Set (Autospiele, Feuchttücher, Snacks)",
      }),
      category: "kids",
    });
  }
  if (/kulinar|hran|jest|gastro|vino|food|cuisine|wine|cucina|gastronom|essen|kuche|wein/.test(groupHaystack)) {
    push({
      id: "luggage-room",
      label: PL(lang, {
        sl: "Rahel prtljačni prostor za lokalne dobrote",
        en: "A little spare luggage room for local treats",
        it: "Un po' di spazio in valigia per le specialità locali",
        de: "Etwas Platz im Gepäck für lokale Schmankerl",
      }),
      category: "other" as PackingCategory,
    });
  }

  // === DOLŽINA / TEHNIKA ===
  if (daysCount > 5) {
    push({
      id: "power-bank",
      label: PL(lang, { sl: "Power bank", en: "Power bank", it: "Power bank", de: "Powerbank" }),
      category: "tech",
      reason: PL(lang, {
        sl: `načrt na ${daysCount} dni`,
        en: `${daysCount}-day plan`,
        it: `piano di ${daysCount} giorni`,
        de: `${daysCount}-Tage-Plan`,
      }),
    });
    push({
      id: "laundry",
      label: PL(lang, {
        sl: "Načrtuj pralni servis na polovici potovanja",
        en: "Plan a laundry stop mid-trip",
        it: "Prevedi una lavanderia a metà viaggio",
        de: "Wäschestopp in der Reisemitte einplanen",
      }),
      category: "clothing",
      reason: PL(lang, {
        sl: "pakiraj lahko, enkrat operi",
        en: "pack light, wash once",
        it: "fai bagaglio leggero, lava una volta",
        de: "leicht packen, einmal waschen",
      }),
    });
  }

  // === VEDNO ===
  push({
    id: "cash-eur",
    label: PL(lang, {
      sl: "Gotovina v evrih (manjši lokalci)",
      en: "Euros in cash (smaller local spots)",
      it: "Contanti in euro (posti locali più piccoli)",
      de: "Bargeld in Euro (kleinere lokale Betriebe)",
    }),
    category: "documents",
  });
  push({
    id: "eu-plugs",
    label: PL(lang, {
      sl: "VTIČNICE EU — adapter ni potreben",
      en: "EU sockets — no adapter needed",
      it: "PRESESE EU — nessun adattatore necessario",
      de: "EU-STECKDOSEN — kein Adapter nötig",
    }),
    category: "tech",
  });
  push({
    id: "foldable-bag",
    label: PL(lang, {
      sl: "Zložljiva torba za spominke",
      en: "Foldable bag for souvenirs",
      it: "Borsa pieghevole per i ricordi",
      de: "Faltbare Tasche für Souvenirs",
    }),
    category: "other" as PackingCategory,
  });
  push({
    id: "id-doc",
    label: PL(lang, {
      sl: "Osebni dokument / potni list",
      en: "ID card / passport",
      it: "Documento d'identità / passaporto",
      de: "Ausweis / Reisepass",
    }),
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
