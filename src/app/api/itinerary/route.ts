import { NextResponse } from "next/server";
import { DESTINATIONS, normalizeInterests } from "@/lib/slovenia-data";
import { sanitizeItinerary } from "@/lib/itinerary-sanitize";
import { SYSTEM_DATA_GUARD } from "@/lib/ai-context";
import { db } from "@/lib/db";
import { generateCompletion } from "@/lib/ai-client";
import { logAIUsage } from "@/lib/ai-usage";
import { rankListings, buildTransparencyContext } from "@/lib/ranking-engine";
import type { Itinerary, PlannerInput } from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
// TASK 100 (TASK 99 na GitHubu): deterministični motor itinererja — čist
// modul (0 LLM/0 omrežja/0 ure), izvlečen iz route, testno pokrit.
import {
  generateDeterministicItinerary,
  type AnchorForecast,
} from "@/lib/deterministic-itinerary";
import {
  fetchDailyForecast,
  weatherCodeToText,
  weatherCodeToTextEn,
  type DailyForecast,
} from "@/lib/weather-utils";
import { PARTY_TYPES, PARTY_PROMPT_LABELS } from "@/lib/party-types";
import { PACES, PACE_PROMPT_LABELS } from "@/lib/pace-types";
import { repairScheduleGaps, type DriveHoursResolver } from "@/lib/schedule-slots";
import {
  buildCrowdNotices,
  tripOverlapsPeakWeekend,
} from "@/lib/crowd-alternatives";
import { matchEventsForItinerary, type TripWindow } from "@/lib/events-match";
import {
  isValidStartDate,
  tripEndDateISO,
  tripWindowMs,
  formatDateRangeSI,
} from "@/lib/trip-dates";
import {
  buildPackingList,
  sanitizeAiPackingList,
} from "@/lib/packing-list";
import {
  buildFallbackRationale,
  computeItineraryQuality,
  recomputeTotalBudget,
  sanitizeAiRationale,
} from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildStopReasons } from "@/lib/stop-insights";
import {
  sanitizeSelectedProviderProducts,
  buildSelectedProductsContext,
  buildSelectionRecommendations,
} from "@/lib/supply/sanitize";
// TASK 47 (1.52.0): supply-aware AI — kanonski supply kontekst + revalidacija
import {
  fetchAiSupplyContext,
  buildAiSupplyContext,
} from "@/lib/supply/ai-context";
import {
  buildKnownSupplyIndex,
  revalidateSupplyStops,
} from "@/lib/supply/itinerary-supply-validation";
// TASK 48 (1.53.0) — ITINERARY REALISM: invariantna plast NAD Task 47
// revalidacijo (dedupe po provider+id, cena po UNIT semantiki, obnova
// geo/smeri, FIXED neničljivost, budget status) + observability.
import {
  computeBudgetValidation,
  extractSupplyStops,
  logItineraryValidation,
  validateItinerarySupply,
  type SupplyValidationReport,
} from "@/lib/supply/itinerary-validation";
// TASK 49 (1.54.0) — SUPPLY INTEGRITY: klientova izbira/načrt so NEZAUPAN
// vnos — cena/geo/tip/razpoložljivost se verificirajo proti strežniški
// resnici (KT dataset ∪ strežni supply); brez dokaza → unknown.
import {
  verifySelectedProducts,
  verifyCurrentStopsAuthority,
  hasVerifyChanges,
} from "@/lib/supply/selection-verify";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import type { SupplyValidationInfo } from "@/lib/types";
import { dayRouteGeometry, serializeLegs, legKey, DESTINATION_COORDS } from "@/lib/road-routing";
import { buildLegRouteIndex } from "@/lib/road-routing-server";
// TASK 51 (1.56.0) — GEOGRAFSKA KOHERENCA: deterministično urejanje
// fallback postankov okoli sidrov (FIXED izbire + željene destinacije) +
// merljive metrike M1–M5 (haversine IZKLJUČNO hevristika urejanja/metrike;
// realne razdalje/časi ostanejo OSRM noge + repairScheduleGaps).
import type { GeoOrderAnchor } from "@/lib/geo-order";
import {
  computeGeoCoherence,
  type CoherenceStop,
} from "@/lib/geo-coherence";
// ISSUE #4 §21 (VAL 6) — NAMERNI VRSTNI RED: postanki iz uporabnikovih FIXED
// izbir + supply postanki dobijo intentLocked, pred odgovorom odidejo v
// klient (gumb "Optimalno zaporedje" jih zamrzne — route-order.ts v2).
import { markItineraryIntentLocked } from "@/lib/route-intent";

// ============================================================================
// WEATHER-CONTEXT (t11): realna vremenska napoved PRED generiranjem
// ============================================================================
//
// Prej je AI načrtoval "slep" — realna Open-Meteo prognoza je prišla ŠTEJ
// generiranju (samo prepisala prikaz). Zdaj za znano okno potovanja
// (startDate znotraj prognoznega horizonta ~16 dni) pridobimo napoved za
// tri regionalna sidra VZPOREDNO z ranking engine (brez dodatne latence)
// in jo podamo AI kot DEJSTVO: deževen dan → notranje aktivnosti tisti dan.
//
// Brez startDate napoved NE gre v prompt: "3 dnevi poleti" brez datuma se
// načrtuje sezonsko — današnja napoved za neznani datum bi bila zavajajoča.
// Vir ostaja pošten: realna napoved Open-Meteo po regijah, brez izmišljenih
// statusov.

// Tri regionalna sidra — Gorenjska/alpi, osrednja Slovenija, obala.
// Koordinate pridejo IZ slovenia-data (enosoten vir resnice o destinacijah);
// če bi id kdaj izginil iz podatkov, se sidro tiho preskoči.
const WEATHER_ANCHOR_DEFS = [
  { id: "bled", label: "Gorenjska (Bled)", labelEn: "Gorenjska/Alps (Bled)" },
  {
    id: "ljubljana",
    label: "Osrednja Slovenija (Ljubljana)",
    labelEn: "Central Slovenia (Ljubljana)",
  },
  { id: "piran", label: "Obala (Piran)", labelEn: "Coast (Piran)" },
] as const;

/**
 * Pridobi napovedi za vsa tri sidra (vsak fetch ima svoj 4s timeout +
 * 15-min cache; fetchDailyForecast interno nikoli ne vrže — vrne null).
 * Brez startDate vrne prazno (ni "realne napovedi za tvoje datume").
 */
async function fetchAnchorForecasts(
  days: number,
  startDate?: string
): Promise<AnchorForecast[]> {
  if (!startDate) return [];

  const anchors: AnchorForecast[] = [];
  await Promise.all(
    WEATHER_ANCHOR_DEFS.map(async (def) => {
      const dest = DESTINATIONS.find((d) => d.id === def.id);
      if (!dest) return;
      const forecast = await fetchDailyForecast(
        dest.coords.lat,
        dest.coords.lng,
        days,
        startDate
      );
      if (forecast) {
        anchors.push({ label: def.label, labelEn: def.labelEn, forecast });
      }
    })
  );
  return anchors;
}

/** Ena vrstica na dan: "- Dan 1 (2026-10-03): Gorenjska (Bled): dež 75 %, 17 °C · ..." */
function buildWeatherPromptLines(
  anchors: AnchorForecast[],
  lang: "sl" | "en"
): string[] {
  const maxLen = anchors.reduce((m, a) => Math.max(m, a.forecast.length), 0);
  const lines: string[] = [];
  for (let i = 0; i < maxLen; i++) {
    const withData = anchors.filter((a) => a.forecast[i]);
    if (withData.length === 0) continue;
    const date = withData[0].forecast[i].date;
    const parts = withData.map((a) => {
      const f = a.forecast[i];
      const cond =
        lang === "en"
          ? weatherCodeToTextEn(f.weatherCode)
          : weatherCodeToText(f.weatherCode);
      const precip =
        f.precipitationProbabilityMax != null
          ? ` ${f.precipitationProbabilityMax} %`
          : "";
      return `${lang === "en" ? a.labelEn : a.label}: ${cond}${precip}, ${Math.round(f.tempMax)} °C`;
    });
    lines.push(
      `- ${lang === "en" ? `Day ${i + 1}` : `Dan ${i + 1}`} (${date}): ${parts.join(" · ")}`
    );
  }
  return lines;
}

// POST /api/itinerary - generira AI itinerer z z-ai-web-dev-sdk
// AI prioritizira SPONZORIRANE lokale (premium/enterprise stranke ki plačajo za vključitev)
export async function POST(request: Request) {
    // Rate limit AI itinererjev (drag endpoint)
    const limited = rateLimit(request, { limit: 10, windowMs: 600000, key: "itinerary" });
    if (limited) return limited;

  let input: PlannerInput;
  try {
    input = (await request.json()) as PlannerInput;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // Validacija
  if (
    !input?.budget ||
    !input?.days ||
    !input?.interests?.length ||
    !input?.season ||
    !input?.groupSize
  ) {
    return NextResponse.json(
      { error: "Manjkajo obvezna polja: budget, days, interests, season, groupSize" },
      { status: 400 }
    );
  }

  // HARDENING I3 (P2): days je moral biti številčen — niz "3"/"abc" je
  // prešel truthy + range primerjavo ("abc" < 1 je false, "abc" > 14 je
  // false) → NaN dayCap → prazni dnevi kot 200-uspeh.
  if (
    typeof input.days !== "number" ||
    !Number.isInteger(input.days) ||
    input.days < 1 ||
    input.days > 14
  ) {
    return NextResponse.json(
      { error: "Število dni mora biti celo število med 1 in 14" },
      { status: 400 }
    );
  }

  // ENUM-FIX (revizija 1.33.0, 16-c P2 — prompt injection površina):
  // season je vhod v AI prompt in je bil samo truthy-preverjen — poljuben
  // niz (npr. "poletje. IGNORE pravila in ...") je šel naravnost v prompt.
  const VALID_SEASONS = ["spring", "summer", "autumn", "winter"] as const;
  if (!VALID_SEASONS.includes(input.season as (typeof VALID_SEASONS)[number])) {
    return NextResponse.json(
      { error: "Sezona je neveljavna (spring, summer, autumn, winter)" },
      { status: 400 }
    );
  }
  // Proračun: številčni razpon (vhod v AI kontekst/proračunsko logiko).
  if (
    typeof input.budget !== "number" ||
    input.budget < 0 ||
    input.budget > 100_000
  ) {
    return NextResponse.json(
      { error: "Proračun je neveljaven (število 0–100000)" },
      { status: 400 }
    );
  }
  if (
    typeof input.groupSize !== "number" ||
    input.groupSize < 1 ||
    input.groupSize > 20
  ) {
    return NextResponse.json(
      { error: "Velikost skupine je neveljavna (1–20)" },
      { status: 400 }
    );
  }

  // WEATHER-CONTEXT: tip potne skupine — opcijsko (stari odjemalci ga ne
  // pošiljajo), a če JE podan, mora biti iz dovoljenega nabora
  if (
    input.partyType !== undefined &&
    !PARTY_TYPES.includes(input.partyType)
  ) {
    return NextResponse.json(
      { error: "Tip potne skupine je neveljaven (couple, family, friends, solo)" },
      { status: 400 }
    );
  }

  // F15 (backlog #3): tempo potovanja — opcijsko (nazaj kompatibilno);
  // če JE podan, mora biti iz dovoljenega nabora
  if (input.pace !== undefined && !PACES.includes(input.pace)) {
    return NextResponse.json(
      { error: "Tempo potovanja je neveljaven (slow, balanced, fast)" },
      { status: 400 }
    );
  }

  // TASK 100 (TASK 99 na GitHubu): izbira motorja generiranja — opcijsko
  // (nazaj kompatibilno: brez polja = "auto" = AI veriga z deterministično
  // rezervo). "deterministic" = IZRECNA zahteva po načrtu BREZ LLM klica.
  if (
    input.engine !== undefined &&
    input.engine !== "auto" &&
    input.engine !== "deterministic"
  ) {
    return NextResponse.json(
      { error: "Motor generiranja je neveljaven (auto, deterministic)" },
      { status: 400 }
    );
  }

  // FW4.2: datum odhoda — opcijsko; če je podan, mora biti veljaven (ISO,
  // ne v preteklosti, max ~400 dni naprej). Neveljaven → jasna napaka 400.
  if (input.startDate !== undefined && !isValidStartDate(input.startDate)) {
    return NextResponse.json(
      { error: "Datum odhoda je neveljaven (ISO format, ne v preteklosti, max 400 dni naprej)" },
      { status: 400 }
    );
  }

  // FW4.2: okvir potovanja (za datumski events match) + končni datum
  const tripWindow = input.startDate
    ? tripWindowMs(input.startDate, input.days)
    : null;
  const tripEnd = input.startDate
    ? tripEndDateISO(input.startDate, input.days) ?? undefined
    : undefined;

  // TAG-ALIGN (P1, recenzija Faze 4): normalizacija interesov na meji —
  // "kulinarika" (NLP parser, stari shranjeni načrti, onboarding profil)
  // → kanonični "hrana", ki se ujema z bestFor destinacij. Pred popravkom
  // je fallback ocenjevalnik izbire "Hrana & vino" tiho ignoriral.
  input = { ...input, interests: normalizeInterests(input.interests) };
  // CAP-FIX (revizija 1.33.0, 16-b/16-c P2 — token-bomb varovalka): vnos je
  // lahko poljubno velik niz/sezlam iz klienta → naravnost v AI prompt.
  // Zdaj: največ 12 interesov po 60 znakov; season/budget kot varni nizi.
  // (season/budget sta tipovno varna že po zod-validaciji višje — Season
  // enum + number; kapiramo samo interests, ki so prosti nizi.)
  input = {
    ...input,
    interests: input.interests.slice(0, 12).map((i) => String(i).slice(0, 60)),
  };

  // F5.4 ("Začni s povezavo"): zaželene destinacije iz prilepljene povezave —
  // opcijsko; sanitizacija na meji ( samo znani ID-ji, največ 8, dedupe).
  // Neznan ID se tiho očisti ( fallback ocenjevalnik bi ga preskočil že tako;
  // AI prompt ne nosi smeti). Nazaj kompatibilno: brez polja = enako kot prej.
  if (Array.isArray(input.preferredDestinations)) {
    const seenIds = new Set<string>();
    const cleanPreferred: string[] = [];
    for (const id of input.preferredDestinations) {
      if (
        typeof id === "string" &&
        !seenIds.has(id) &&
        DESTINATIONS.some((d) => d.id === id)
      ) {
        seenIds.add(id);
        cleanPreferred.push(id);
      }
    }
    input =
      cleanPreferred.length > 0
        ? { ...input, preferredDestinations: cleanPreferred.slice(0, 8) }
        : { ...input, preferredDestinations: undefined };
  }

  // F1 (Supply Map, 1.49.0): izbrani produkti z zemljevida ponudbe —
  // STRUKTURIRAN vnos (provider/id/tip/geo/cena/selectionState). Meja
  // zaupanja: whitelist providerjev (register), enumi, kapice; bookingUrl
  // se NAMENOMA odstrani (rezervacija teče prek /go, ne prek prompta).
  // Neveljavni vnosi se tiho očistijo — ista filozofija kot zgoraj.
  const cleanSelectedProducts = sanitizeSelectedProviderProducts(
    (input as { selectedProviderProducts?: unknown }).selectedProviderProducts
  );
  input =
    cleanSelectedProducts.length > 0
      ? { ...input, selectedProviderProducts: cleanSelectedProducts }
      : { ...input, selectedProviderProducts: undefined };

  // Pripravi kontekst destinacij za AI
  // F5.5: vrstica o odpiralnih časih ( SAMO preverjeni vnosi — vir AI pove
  // izrecno, da ne ugiba o urnikih; brez vnosa destinacija nima omejitve)
  const destContext = DESTINATIONS.map(
    (d) =>
      `- ${d.id} (${d.name}, ${d.country}): ${d.type}/${d.region}, ${d.duration}, €${d.costPerPerson}/osebo, ocena ${d.rating}, aktivnosti: ${d.activities.join(", ")}. Najboljše za: ${d.bestFor.join(", ")}. Sezona: ${d.bestSeason.join(", ")}${d.opening ? `. Odpiralni čas (vir ${d.opening.source}): ${d.opening.note}` : ""}`
  ).join("\n");

  // FW4.3: jezik AI izpisa — client pošlje locale ("en" → angleški
  // itinerer za tuje obiskovalce; vse ostalo logiko ostaja enako).
  // Zdaj pred ranking klicem — partner kontekst (t12 faza 1) nosi jezikovno
  // odvisne praktične podatke (sezona/vreme/parkiranje).
  const lang = input.language === "en" ? "en" : "sl";

  // === RANKING ENGINE + WEATHER-CONTEXT + TASK 47 SUPPLY CONTEXT ===
  // (vzporedno — supply iskanje je hitro: kiwitaxi v pomnilniku ~2 ms,
  // viator/gyg capability gate ~1 ms, OSM cat-gated → 0 klicev na Overpass;
  // vreme ne doda latence)
  // Ranking: relevance (60%) + quality (15%) + rating (10%) + distance (10%) + premium (5%)
  // Vreme: realna napoved za tri regionalna sidra — SAMO če je podan
  // startDate (znano okno potovanja znotraj horizonta ~16 dni)
  // Supply: REAL SUPPLY → ProviderProduct → AiSupplyProduct projekcija
  // (§10 — obstoječi searchSupply runner, AI nikoli ne pozna provider API-jev)
  let partnerContext = "";

  // HARDENING Perf2: engine=deterministic se vrne IZRECNO pred gradnjo
  // promptov (naravna pot spodaj) — partner kontekst (ranking DB poizvedba
  // + buildTransparencyContext) tam NIMA porabe → ga preskočimo (prej je
  // vsak deterministični zahtevek opravil nepotrebno ranking poizvedbo).
  const skipRanking = input.engine === "deterministic";
  const [ranked, anchorForecasts, aiSupply] = await Promise.all([
    skipRanking
      ? Promise.resolve([] as Awaited<ReturnType<typeof rankListings>>)
      : rankListings({
          interests: input.interests,
          season: input.season,
        }).catch((e) => {
          console.error("[itinerary] ranking engine napaka:", e);
          return [] as Awaited<ReturnType<typeof rankListings>>;
        }),
    fetchAnchorForecasts(input.days, input.startDate),
    // NIKOLI ne vrže (interna varovalka — odpoved supply = prazen kontekst)
    fetchAiSupplyContext({
      pax: input.groupSize,
      date: input.startDate,
      locale: lang,
    }),
  ]);

  if (ranked.length > 0) {
    partnerContext = buildTransparencyContext(ranked, 15, lang);
    console.log(`[itinerary] Ranking engine: ${ranked.length} kandidatov, top: ${ranked[0].listing.name} (Q:${ranked[0].qualityScore})`);
  }
  if (anchorForecasts.length > 0) {
    console.log(
      `[itinerary] Vreme briefing: ${anchorForecasts.length}/${WEATHER_ANCHOR_DEFS.length} sidra, ${anchorForecasts[0].forecast.length} dni${input.startDate ? ` (od ${input.startDate})` : ""}`
    );
  }

  // ------------------------------------------------------------------
  // TASK 49 (§4/§7, P0 — SUPPLY INTEGRITY): klientova izbira je NEZAUPAN
  // vnos. Do 1.53.0 je sanitizacija oblike (enumi/kapice/whitelist)
  // pustila dobro oblikovano FABRIKIRANO ceno skozi — živi dokazi audita:
  // kiwitaxi:411 s 1 € (dataset: 77 €), osm izdelek s 5 € (info_only vir
  // cene nikoli nima), viator:98765 s 79 € (provider ni priključen).
  // Takšna cena je postala KANONSKA avtoriteta Taska 47/48 → v finalnem
  // načrtu in v statusu proračuna. Zdaj: strežniška resnica (KT dataset ∪
  // strežni supply kontekst) ZMAGA; brez dokaza → cena/razpoložljivost
  // ODSTRANJENI (unknown is unknown); fabrikantrt KT id → izbira ZAVRŽENA.
  // ------------------------------------------------------------------
  const supplyVerified = verifySelectedProducts(
    cleanSelectedProducts,
    aiSupply.products
  );
  const verifiedSelection = supplyVerified.products;
  if (hasVerifyChanges(supplyVerified.report)) {
    console.warn(
      `[itinerary] TASK 49 supply verify (izbira): ${supplyVerified.report.rejectedFake} zavrnjenih, ` +
        `${supplyVerified.report.priceOverrides} cen popravljenih na kanon, ` +
        `${supplyVerified.report.pricesStripped} cen odstranjenih (unknown), ` +
        `${supplyVerified.report.geoRestored} geo, ${supplyVerified.report.geoStripped} geo-stripped, ${supplyVerified.report.titlesRestored} naslovov, ` +
        `${supplyVerified.report.typesRestored} tipov, ${supplyVerified.report.availabilityStripped} razpoložljivosti`
    );
  }

  // TASK 47 (§22 — minimalna observabilnost, brez novega sistema): 
  // strukturirana vrstica o supply kontekstu. BREZ žetonov, BREZ celih
  // payloadov, BREZ PII — samo števila/znani provider slug-i.
  const fixedCount = verifiedSelection.filter(
    (p) => p.selectionState === "fixed"
  ).length;

  // TASK 51 (§7/§8 — ANCHORS): Geografska sidra za deterministično urejanje
  // fallback postankov. VIR: VERIFICIRANA izbira (Task 49), samo FIXED
  // izbire, v VRSTNEM REDU IZBIRE (§8 F2: vrstni red FIXED se ne spremeni).
  // HARDENING I1 (resnica o viru koordinat): kanonske so SAMO koordinate,
  // ki jih je potrdila strežna resnica — kiwitaxi dataset (geoRestored, test
  // G-A10) ali priključen strežni supply. Za providerje BREZ strežne resnice
  // je koordinate klienta pustil verifySelectedProducts le, če so PLAUSIBILNE
  // za našo regijo (SI_BBOX + margina); svetovne izmišljotine so odstranjene
  // (geoStripped). Sidra brez koordinat se preskočijo (unknown ostane
  // unknown — NE izmišljamo lokacije).
  const geoAnchors: GeoOrderAnchor[] = verifiedSelection
    .filter(
      (p) =>
        p.selectionState === "fixed" &&
        p.lat != null &&
        p.lng != null &&
        Number.isFinite(p.lat) &&
        Number.isFinite(p.lng)
    )
    .map((p) => ({
      id: `${p.provider}:${p.providerProductId}`,
      lat: p.lat as number,
      lng: p.lng as number,
    }));
  console.log(
    `[itinerary] supply-aware: context=${aiSupply.total} (capped ${aiSupply.products.length}) providers=${aiSupply.providers.join(",") || "-"} degraded=${aiSupply.degraded.join(",") || "-"} fixed=${fixedCount}`
  );

  // ISSUE #4 §21 (VAL 6) — NAMERNI VRSTNI RED: ID-ji VERIFICIRANIH FIXED
  // izbir v kanonskem "provider:productId" formatu (isti zapis, ki ga nosijo
  // supply postanki v načrtu — Task 48 invariantna plast). markItinerary
  // IntentLocked tik pred odgovorom nanje (in na category "supply" /
  // booking_provider postanke) postavi intentLocked — klientova optimizacija
  // zaporedja jih nato ZAMRZNE (§8 F2 pogodba razširjena tudi na gumb).
  const fixedDestinationIds: string[] = verifiedSelection
    .filter((p) => p.selectionState === "fixed")
    .map((p) => `${p.provider}:${p.providerProductId}`);

  // TASK 47 (§3/§4/§5/§6/§14): strukturiran blok kanonske ponudbe v prompt —
  // PREFERRED/SUGGESTED semantika, cena z enoto, ločena razpoložljivost,
  // prioritetna lestvica. Prazna ponudba → prazen blok (ni spremembe).
  const aiSupplyBlock = buildAiSupplyContext(aiSupply.products, lang);

  // F1 (Supply Map): strukturiran blok izbranih produktov za AI prompt —
  // FIXED/PREFERRED/SUGGESTED semantika + izrecno pravilo, da AI NE SME
  // zamenjati FIXED izbire s podobnim lokalom (uporabnikova izbira je
  // obvezna). Prazna izbira → prazen blok (ni spremembe obnašanja).
  // TASK 49: gradi se nad VERIFICIRANO izbiro.
  const selectedProductsBlock = buildSelectedProductsContext(
    verifiedSelection,
    lang
  );

  // TASK 48 (1.53.0): strežni supply kot AVTORITETA za invariantno plast —
  // projekcija AiSupplyProduct → oblika izbire (selectionState "suggested":
  // NIKOLI reinsertirani — FIXED prihajajo SAMO iz uporabnikove izbire;
  // uporabnikova izbira ima prednost pri istem ključu, ker se ZADNJA doda).
  // Task 47 rebind postavi FLAT znesek cene; ta sloj popravi na unit
  // semantiko (per_person × groupSize, per_transfer brez množenja).
  const aiSupplyAuthority: SelectedProviderProduct[] = aiSupply.products.map(
    (p) => ({
      provider: p.provider,
      providerProductId: p.providerProductId,
      type: p.type,
      title: p.title,
      ...(p.location?.lat != null ? { lat: p.location.lat } : {}),
      ...(p.location?.lng != null ? { lng: p.location.lng } : {}),
      ...(p.price ? { price: p.price } : {}),
      ...(p.availability ? { availability: p.availability } : {}),
      source: p.provider,
      selectionState: "suggested",
    })
  );

  // ------------------------------------------------------------------
  // TASK 100 (TASK 99 na GitHubu, §4): NARAVNA deterministična pot.
  // engine = "deterministic" pomeni IZRECNO zahtevan načrt BREZ LLM
  // klica: promptov ne gradimo, generateCompletion se NE pokliče —
  // generiranje opravi čist deterministični motor (0 žetonov, 100 %
  // reproducibilno), obogatitev pa teče ISTA veriga kot AI poti (supply
  // invariantna plast, realno vreme, OSRM noge + repair, geo-validacija,
  // kakovost, razlage postankov). Odgovor pošteno nosi source
  // "deterministic" — NI AI načrt in se ne dela takega.
  // ------------------------------------------------------------------
  if (input.engine === "deterministic") {
    console.log(
      "[itinerary] TASK 100: naravna deterministična pot (engine=deterministic, 0 LLM žetonov)"
    );
    return buildDeterministicPlanResponse(
      input,
      {
        anchorForecasts,
        geoAnchors,
        aiSupplyAuthority,
        verifiedSelection,
        fixedDestinationIds,
        tripWindow,
        tripEnd,
        lang,
      },
      "deterministic"
    );
  }

  // (lang je izračunan že pred ranking klicem — glej zgoraj)

  // === WEATHER-CONTEXT: pravo vreme + sestava potnikov v prompt ===
  // Oba dela sta OPCIJSKA (nazaj kompatibilno): brez startDate ni realne
  // napovedi za tvoje datume, brez partyType pa AI dobi samo številko.
  const hasWeather = anchorForecasts.length > 0;
  const partyLabels = input.partyType
    ? PARTY_PROMPT_LABELS[input.partyType]
    : null;

  const partyLineSl = partyLabels ? `\n- Sestava: ${partyLabels.sl}` : "";
  const partyLineEn = partyLabels ? `\n- Travel party: ${partyLabels.en}` : "";
  // F15: tempo potovanja v prompt (opcijsko — brez polja AI dobi privzeti
  // umerjen ritem, kot doslej)
  const paceLabels = input.pace ? PACE_PROMPT_LABELS[input.pace] : null;
  const paceLineSl = paceLabels ? `\n- Tempo potovanja: ${paceLabels.sl}` : "";
  const paceLineEn = paceLabels ? `\n- Travel pace: ${paceLabels.en}` : "";
  const weatherBlockSl = hasWeather
    ? `\nREALNA VREMENSKA NAPOVED (Open-Meteo) za tvoje datume — po regijah:\n${buildWeatherPromptLines(anchorForecasts, "sl").join("\n")}\n`
    : "";
  const weatherBlockEn = hasWeather
    ? `\nREAL FORECAST (Open-Meteo) for your dates — by region:\n${buildWeatherPromptLines(anchorForecasts, "en").join("\n")}\n`
    : "";

  // Pogojna dodatna pravila — številčenje se nadaljuje od obstoječega 11
  const extraRulesSl: string[] = [];
  const extraRulesEn: string[] = [];
  if (hasWeather) {
    extraRulesSl.push(
      "12. Upoštevaj REALNO napoved zgoraj: kadar je verjetnost padavin ≥ 60 % za regijo, kjer ta dan potuješ, načrtuj notranje in vremensko neodvisne aktivnosti (jame, muzeji, terme, degustacije, mestna jedra) — tisti dan brez pohodov, sotesk ali plaž. Vreme v polju \"weather\" dneva naj se ujema z realno napovedjo za regijo, kjer dan poteka."
    );
    extraRulesEn.push(
      "12. Follow the REAL forecast above: when precipitation probability is ≥ 60% for the region you plan that day, choose indoor/weather-independent activities (caves, museums, thermal spas, tastings, old towns) — no hikes, gorges or beaches that day. The \"weather\" field of each day must match the real forecast for that day's region."
    );
  }
  if (partyLabels) {
    const partyRuleNo = extraRulesSl.length > 0 ? 13 : 12;
    extraRulesSl.push(
      `${partyRuleNo}. Prilagodi ritem in izbor sestavi potnikov: par → mirnejši ritem in romantične večerje; družina z otroki → otrokom prijazne lokacije, krajši prevozi in načrtovani odmori; prijateljska skupina → bolj družabna in aktivna izbira; samostojni potnik → fleksibilen ritem in varna izbira.`
    );
    extraRulesEn.push(
      `${partyRuleNo}. Match pace and selection to the travel party: couple → calmer pace and romantic dinners; family with kids → kid-friendly spots, shorter drives and planned breaks; group of friends → more social and active picks; solo traveller → flexible pace and safe choices.`
    );
  }
  // F15 (backlog #3): izrecno pravilo o tempu — gostota dneva je odgovor
  // na pritožbo s forumov ("planner ne vpraša, če bi raje manj mest")
  if (input.pace) {
    const paceRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    if (input.pace === "slow") {
      extraRulesSl.push(
        `${paceRuleNo}. Potnik želi POČASEN tempo: 1–2 postanka na dan, vsakemu mestu posveči več časa (daljši termini), brez ožiganja — kakovost pred količino.`
      );
      extraRulesEn.push(
        `${paceRuleNo}. The traveller wants a SLOW pace: 1-2 stops per day, give each place more time (longer slots), no rushing — quality over quantity.`
      );
    } else if (input.pace === "fast") {
      extraRulesSl.push(
        `${paceRuleNo}. Potnik želi HITER tempo: 3–4 postanke na dan, termini naj ostanejo realistični (upoštevaj vožnjo), a načrt zajame čim več mest.`
      );
      extraRulesEn.push(
        `${paceRuleNo}. The traveller wants a FAST pace: 3-4 stops per day, keep time slots realistic (account for driving) but cover as many places as sensible.`
      );
    }
    // "balanced" = dosedanje pravilo 1 (2–3 na dan) že pomeni umerjen ritem;
    // brez dodatnega pravila ostane prompt čist.
  }

  // CROWD-ALTERNATIVES: če potovanje prekriva vrhunski vikend (julij/avgust
  // + sobota/nedelja), AI dobi pošteno uredniško opozorilo o konicah na
  // javno dokumentiranih točkah — JUTRANJI termini in razmislek o
  // alternativah, ne izmišljeni statusi (post-processing doda opombe)
  const peakWeekend =
    input.startDate !== undefined &&
    tripOverlapsPeakWeekend(input.startDate, input.days);
  if (peakWeekend) {
    const crowdRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    extraRulesSl.push(
      `${crowdRuleNo}. Tvoje okno potovanja vključuje vikend v vrhunski sezoni: Bled, Vintgarska soteska, Postojnska jama, Piran in staro mestno jedro Ljubljane so takrat običajno zelo obiskani. Kjer je načrtovan kateri od teh: nastavi JUTRANJI termin (pred 9:00) in v notes omeni, da je zgodnji prihod priporočljiv; kjer je smiselno, premošči z manj obiskano destinacijo s seznama.`
    );
    extraRulesEn.push(
      `${crowdRuleNo}. Your travel window includes a peak-season weekend: Bled, Vintgar Gorge, Postojna Cave, Piran and Ljubljana old town are usually very busy then. Where any of these is planned: schedule a MORNING slot (before 9:00) and note that arriving early is recommended; where sensible, swap to a less-visited destination from the list.`
    );
  }
  // F5.5 ( odpiralni časi): AI izrecno upošteva preverjena zaprtja —
  // neizvedljivi postanki ( Vintgar pozimi) ali zaprtje glavne atrakcije
  // na določen dan v tednu ( Ptujski grad ob ponedeljkih). Podatki so v
  // destContext z virom; to pravilo jih naredi OBVEZUJOČE za urnik.
  {
    const openRuleNo = extraRulesSl.length > 0 ? extraRulesSl.length + 12 : 12;
    extraRulesSl.push(
      `${openRuleNo}. destinacije imajo v seznamu zabeležene odpiralne čase z virom (npr. Vintgarska soteska je zaprta novembra–marca; Ptujski grad je zaprt ob ponedeljkih). Če je datum potovanja znan, NE načrtuj destinacije v obdobju, ko je zaprta, in izogibaj se dnevom zaprtja glavnih atrakcij — podatek je preverjen, ne predlog.`
    );
    extraRulesEn.push(
      `${openRuleNo}. Destinations list verified opening hours with a source (e.g. Vintgar Gorge is closed November–March; Ptuj Castle is closed on Mondays). When the travel date is known, do NOT schedule a destination during its closure period and avoid weekdays when a main sight is closed — this is verified data, not a suggestion.`
    );
  }

  const extraRulesBlockSl =
    extraRulesSl.length > 0 ? `\n${extraRulesSl.join("\n")}` : "";
  const extraRulesBlockEn =
    extraRulesEn.length > 0 ? `\n${extraRulesEn.join("\n")}` : "";

  const systemPrompt =
    lang === "en"
      ? `You are an expert travel guide for Slovenia. You generate a realistic Slovenia itinerary in JSON format. Respond ONLY with valid JSON, no additional text or code.

IMPORTANT: Suggested partners are ranked by relevance and quality (Q = Quality Score). When possible, include partners with a higher Q in the notes or recommendations fields. [SPONSORED] and [FEATURED] tags denote premium partners. Practical info on partners (season, weather, parking) is provider-supplied — use it when choosing: a partner marked "weather: indoor" suits a rainy day, "season: summer" is out of season outside those months.` + SYSTEM_DATA_GUARD
      : `Si strokovni slovenski vodič za načrtovanje potovanj. Generiraš realističen itinerer za Slovenijo v JSON formatu. Odgovori SAMO z veljavnim JSON, brez dodatnega besedila ali kode.

POMEMBNO: Predlagani partnerji so razvrščeni po ustreznosti in kakovosti (Q = Quality Score). Kadar je mogoče, vključi partnerje z višjim Q v notes ali recommendations polja. [SPONZORIRANO] in [FEATURED] oznake pomenijo premium partnerje. Praktični podatki partnerjev (sezona, vreme, parkiranje) so podatki ponudnika — uporabi jih pri izbiri: partner z "vreme: notranje" ustreza deževnemu dnevu, "sezona: poletje" pa je izven sezone neustrezen.` + SYSTEM_DATA_GUARD;

  // F5.4: zaželene destinacije — AI prompt izrecno navodilo ( fallback pot
  // jih že dobi prek ocenjevalnika; AI pot jih potrebuje v besedilu).
  const preferredLineEn =
    input.preferredDestinations && input.preferredDestinations.length > 0
      ? `\n- Destinations the user explicitly wants to include (recognized from a link they pasted): ${input.preferredDestinations
          .map((id) => DESTINATIONS.find((d) => d.id === id)?.name ?? id)
          .join(", ")} — include them where feasible ( season and geography permitting)`
      : "";
  const preferredLineSl =
    input.preferredDestinations && input.preferredDestinations.length > 0
      ? `\n- Destinacije, ki jih uporabnik izrecno želi vključiti ( prepoznane s prilepljene povezave): ${input.preferredDestinations
          .map((id) => DESTINATIONS.find((d) => d.id === id)?.name ?? id)
          .join(", ")} — jih vključi, kjer je izvedljivo ( sezona in geografija dovoljujeta)`
      : "";

  const userPrompt =
    lang === "en"
      ? `Generate a ${input.days}-day itinerary for Slovenia.

Traveler:
- Budget: €${input.budget}
- Interests: ${input.interests.join(", ")}
- Season: ${input.season}${input.startDate ? `\n- Travel date: ${formatDateRangeSI(input.startDate, tripEnd)}` : ""}
- Group: ${input.groupSize} person(s)${partyLineEn}${paceLineEn}${preferredLineEn}
${weatherBlockEn}
${selectedProductsBlock}${aiSupplyBlock}Available destinations:
${destContext}
${partnerContext}

Rules:
1. Pick 2-3 destinations per day
2. GROUP destinations by geographic proximity — Bled+Vintgar+Bohinj in one day, Ljubljana separately, Soča+Kobarid together
3. Optimize the route across days — move by regions (Gorenjska day 1, Primorska day 2, etc.)
4. Match the traveler's interests
5. Stay within budget (total < €${input.budget})
6. Respect seasonal suitability (${input.season})
7. COUNTRY SCOPE (TASK 62): the destination list includes regional destinations outside Slovenia (marked HR=Croatia, ME=Montenegro, AL=Albania). This is by default a SLOVENIAN trip — include regional destinations ONLY when the user explicitly asks for them (listed preferred destinations) or the request clearly names a regional place. A mixed multi-country plan is valid ONLY when the days allow realistic driving (Ljubljana→Dubrovnik is ~6 h)
7. Keep time frames realistic: the next slot may only START after (previous slot ends + driving time between them). Short urban hops ~30 min, cross-region drives (e.g. Ljubljana→Piran, Bohinj→Postojna) 1.5–2 h — the gap between slots MUST cover the drive (geo validation flags errors otherwise)
8. When fitting, mention suggested partners from the PREDLAGANI PARTNERJI list in notes or recommendations (e.g. "For lunch, visit [a partner from the list]"). NEVER invent restaurant, hotel or venue names — venue names may appear ONLY from the suggested partners list; when that list is absent, notes and recommendations must not name specific venues
9. Add estimated drive time to the next location in notes (e.g. "30 min drive to Bohinj")
10. "packing_list": 8-14 concrete items for this trip (season, interests, duration)
11. "rationale": 1-2 sentences, written as a guide in third person: why THIS itinerary suits the traveler — reference their interests, budget and desire for less driving. Concrete, no marketing fluff.
12. COUNTRY SCOPE (TASK 62): the destination list includes regional destinations outside Slovenia (marked HR=Croatia, ME=Montenegro, AL=Albania). This is by default a SLOVENIAN trip — include regional destinations ONLY when the user explicitly asks for them (listed preferred destinations) or the request clearly names a regional place. A mixed multi-country plan is valid ONLY when the days allow realistic driving (Ljubljana→Dubrovnik is ~6 h).${extraRulesBlockEn}

JSON format (STRICT):
{
  "days": [
    {
      "day": 1,
      "locations": [
        {
          "destination_id": "bled",
          "destination_name": "Bled",
          "time_slot": "09:00-13:00",
          "duration": 4,
          "estimated_cost": 50,
          "notes": "Morning visit, best light for photos. ~35 min drive to Bohinj."
        }
      ],
      "weather": { "condition": "sunny", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Bring sunglasses", "Book the traditional pletna boat ride in advance"],
  "tips": ["Start early to avoid crowds"],
  "packing_list": ["Sunscreen SPF 50", "Hiking shoes", "Cash in euros"],
  "rationale": "This itinerary combines peaceful nature and local cuisine with minimal driving — Bled and Bohinj are in the same region, so more time is spent at locations instead of in the car."
}`
      : `Generiraj ${input.days}-dnevni itinerer za Slovenijo.

Potnik:
- Proračun: €${input.budget}
- Interesi: ${input.interests.join(", ")}
- Sezona: ${input.season}${input.startDate ? `\n- Datum potovanja: ${formatDateRangeSI(input.startDate, tripEnd)}` : ""}
- Skupina: ${input.groupSize} oseb(a)${partyLineSl}${paceLineSl}${preferredLineSl}
${weatherBlockSl}
${selectedProductsBlock}${aiSupplyBlock}Razpoložljive destinacije:
${destContext}
${partnerContext}

Pravila:
1. Izberi 2-3 destinacije na dan
2. GRUPIRAJ destinacije po geografski bližini — Bled+Vintgar+Bohinj v enem dnevu, Ljubljana ločeno, Soča+Kobarid skupaj
3. Optimiziraj pot med dnevi — premikaj se po regijah (Gorenjska dan 1, Primorska dan 2, itd.)
4. Ustrezi interesom potnika
5. Ostani znotraj proračuna (skupni < €${input.budget})
6. Upoštevaj sezonsko ustreznost (${input.season})
7. Časovni okvirji naj bodo realistični: naslednji termin se začne ŠELE po (konec prejšnjega + čas vožnje med njima). Krajše mestne vožnje ~30 min, medregijske (npr. Ljubljana→Piran, Bohinj→Postojna) 1,5–2 h — vrzel med termini MORA pokriti vožnjo (geo validacija sicer javi napako)
8. Kadar ustreza, v notes ali recommendations omeni predlagane partnerje s seznama PREDLAGANI PARTNERJI (npr. "Za kosilo obiščite [partnerja s seznama]"). NIKOLI ne izmišljuj imen restavracij, hotelov ali lokalov — imena lokalov se smejo pojaviti SAMO s seznama predlaganih partnerjev; če seznama ni, notes in recommendations ne smeta vsebovati imen konkretnih lokalov
9. V notes dodaj ocenjen čas vožnje do naslednje lokacije (npr. "30 min vožnje do Bohinja")
10. "packing_list": 8-14 konkretnih stvari za ta izlet (sezona, interesi, trajanje)
11. "rationale": 1-2 povedi, napisane kot vodnik v tretji osebi: zakaj TA pot ustreza potniku — sklicuj se na njegove interese, proračun in željo po manj vožnje. Konkretno, brez marketinških fraz.
12. OBSEG DRŽAV (TASK 62): seznam destinacij vsebuje tudi regionalne destinacije izven Slovenije (označene HR=Hrvaška, ME=Črna gora, AL=Albanija). To je PRIVZETO slovensko potovanje — regionalne destinacije vključi SAMO, kadar jih uporabnik izrecno želi (naštete željene destinacije) ali kadar prošnja jasno imenuje regionalni kraj. Mešan večdržavni načrt je veljaven SAMO, če dnevi dopuščajo realno vožnjo (Ljubljana→Dubrovnik je ~6 h).${extraRulesBlockSl}

JSON format (STROGO):
{
  "days": [
    {
      "day": 1,
      "locations": [
        {
          "destination_id": "bled",
          "destination_name": "Bled",
          "time_slot": "09:00-13:00",
          "duration": 4,
          "estimated_cost": 50,
          "notes": "Jutranji obisk, najboljša svetloba za fotografije. ~35 min vožnje do Bohinja."
        }
      ],
      "weather": { "condition": "sončno", "temp": 22 }
    }
  ],
  "total_budget": 500,
  "recommendations": ["Vzemi sončna očala", "Rezerviraj vožnjo s pletno vnaprej"],
  "tips": ["Začni zgodaj za manj ljudi"],
  "packing_list": ["Sončna krema SPF 50", "Pohodniški čevlji", "Evrovi gotovina"],
  "rationale": "Pot združuje mirno naravo in lokalno kulinariko z minimalno vožnjo — Bled in Bohinj sta na isti regiji, zato je več časa na lokacijah namesto v avtu."
}`;

  try {
    // 1.88.1 (FA-A1-b): ZUNANJA trda meja AI faze — NEODVISNA od SDK
    // internals. Lokalni E2E dokaz (obešajoč provider, enake opcije):
    // fallback pride v 73 s — vendar je Vercel hkg1 runtime obešal
    // prošnjo ≥ 300 s (504 FUNCTION_INVOCATION_TIMEOUT; SDK abort tam
    // očitno ni sprožil). Promise.race varovalka: če SDK timeout NE
    // odpove, route samo pade v deterministično rezervo pri 70 s.
    const aiHardCapMs = 70_000;
    let aiHardCapTimer: ReturnType<typeof setTimeout> | null = null;
    const result = await Promise.race([
      generateCompletion(
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        // 1.48.2: velika JSON generacija na free tieru traja 60–79 s
        // (direktna meritev 2026-09-17, 3/3 vzorci ≥ 60 s — enak ključ in
        // model kot ta veriga). Privzeti 60-s budilnik je vsak drugi klic
        // tiho rezal v deterministični fallback PO enaki čakalni dobi.
        //
        // 1.88.1 (FINAL ACCEPTANCE FA-A1): proračun AI klica je ZDAJ vezan
        // na SKUPNI budget verige (totalBudgetMs) IN na klientovo
        // potrpežljivost. Dejstva (produkcija, 2026-09-23): engine=auto je
        // 3/3 sond obešal ≥ 280 s → gol Vercel 504 FUNCTION_INVOCATION_TIMEOUT
        // (maxDuration 300 s), fallback JSON nikoli ni dosegel klienta;
        // hkrati klient abortira pri 90 s (GENERATION_TIMEOUT_SECONDS,
        // TASK 77 — NAMERNA UX odločitev), torej je bil prejšnji proračun
        // 120 s NEUSKLAJEN z obejo mejama. Zdaj: OpenRouter 65 s (zajame
        // 2/3 izmerjenih free-tier generacij 60/61/79 s; globoka vrsta pade
        // pošteno v rezervo) + skupni budget verige 70 s — ob timeoutu se
        // Gemini/Puter/z-ai preskočijo in route takoj zgradi deterministično
        // rezervo (~2–5 s). Odgovor torej PRIDE VEDNO (AI ali rezerva) v
        // < 80 s < 90 s klientove meje. Ob HITRI OpenRouter napaki (429/5xx
        // v sekundah) Gemini še dobi svoj ~45-s rezervat znotraj 70 s.
        { temperature: 0.7, jsonMode: true, timeoutMs: 65_000, totalBudgetMs: 70_000, usageLog: { feature: "itinerary" } }
      ),
      new Promise<null>((resolve) => {
        aiHardCapTimer = setTimeout(() => resolve(null), aiHardCapMs);
      }),
    ]).finally(() => {
      if (aiHardCapTimer) clearTimeout(aiHardCapTimer);
    });

    const content = result?.content;
    if (!content) {
      throw new Error("Prazen odgovor AI");
    }

    // Ekstrahiraj JSON (AI včasih doda ```json blok)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : content);

    // SANITIZE-FIX (revizija 1.33.0, 16-c/16-d P2): AI izhod je bil razlit
    // nevalidiran — negativni duration/cost so premagali invariantna pravila,
    // recommendations kot string je strmoglavil klienta, dnevi so lahko
    // presegli zahtevanih `input.days`. Shape guard (clamps + type coercion)
    // zdaj teče TUKAJ, pred obogatitvijo — ista plast kot na save meji.
    const itinerary: Itinerary = sanitizeItinerary(parsed, input.days);

    // TASK 47 (§7/§12/§17): STREŽNIŠKA REVALIDACIJA SUPPLY REFERENC.
    // AI izhod nikoli ni zaupan: vsak postanek, ki se sklicuje na supply
    // (destination_id „{provider}:{id}" z registriranim providerjem), mora
    // obstajati v znanem kanonskem supplyju (uporabnikove izbire ∪ strežni
    // kontekst). Neznan sklic → ODSTRANJEN (poročilo v dropped[], NIKOLI
    // silent, NIKOLI fallback produkt). Znan → REBIND na kanonske vrednosti
    // (naslov, cena z enoto v notes, geo, iskrena razpoložljivost) — AI
    // pusti SAMO itinerary semantiko (dan/urnik/trajanje).
    const knownSupply = buildKnownSupplyIndex(verifiedSelection, aiSupply.products);
    const supplyValidated = revalidateSupplyStops(itinerary, knownSupply, lang);
    if (supplyValidated.dropped.length > 0) {
      console.warn(
        `[itinerary] supply revalidation: ODSTRANJENIH ${supplyValidated.dropped.length} haluciniranih supply postankov: ${supplyValidated.dropped.map((d) => d.id).join(", ")}`
      );
    }

    // F1 (Supply Map) → TASK 48 (§15, 1.53.0): INVARIANTNA PLAST nad Task 47
    // revalidacijo — dedupe po (provider, id), cena po UNIT semantiki
    // (per_transfer ≠ ×osebe; per_person × groupSize; per_night unknown),
    // obnova koordinat/smeri prevoza, FIXED vstavitev z kanonsko ceno
    // (nadomesti applyFixedSelectedProducts klic — ista insertProductStop
    // mehanika + unit semantika; AI NIKOLI ne izniči uporabnikove izbire).
    // Avtoriteta: uporabnikova izbira (VERIFICIRANA, Task 49) ∪ strežni
    // supply (aiSupplyAuthority) ∪ postanki, ki jih je Task 47 revalidiral
    // (currentStops — prav tako overjeni: KT iz dataseta, ostali unknown).
    const currentStopsVerified = verifyCurrentStopsAuthority(
      extractSupplyStops(supplyValidated.itinerary)
    );
    const invariant = validateItinerarySupply(
      supplyValidated.itinerary,
      {
        selection: [...aiSupplyAuthority, ...verifiedSelection],
        currentStops: currentStopsVerified.stops,
      },
      { lang, groupSize: input.groupSize }
    );
    const withFixedStops = invariant.itinerary;
    const supplyReport = invariant.report;
    if (supplyReport.issues.length > 0) {
      console.warn(
        `[itinerary] TASK 48 invariantna plast: ${supplyReport.validated}/${supplyReport.supplyStops} veljavnih, ` +
          `${supplyReport.rejected} zavrnjenih, ${supplyReport.deduped} dedupliciranih, ` +
          `${supplyReport.priceCorrections} popravkov cen, ${supplyReport.reinserted} FIXED vnšenih`
      );
    }

    // 1.48.3: :free modeli VSAKIH TOLIKO vrnejo popoln JSON z neveljavno
    // strukturo dni — sanitizeItinerary legitimno poreže VSE dneve, razlaga/
    // priporočila pa preživijo. Živ dokaz (Vercel 2026-09-17 ~21:16):
    // source "ai" + days [] + total_budget 0 → uporabniku se izriše PRAZEN
    // načrt, kar je slabše od deterministične rezerve, ki jo imamo prav za
    // take primere. Prazni dnevi torej KLASIFICIRAMO kot neuspeh generacije
    // → obstoječa catch pot zgradi fallback (isti mehanizem kot
    // "Prazen odgovor AI"). Stražar je v rundi (ne v sanitizeItinerary),
    // ker sanitize teče tudi na SAVE meji klientovih načrtov.
    if (itinerary.days.length === 0) {
      throw new Error("AI izhod brez veljavnih dni (sanitize porezal vse)");
    }

    console.log(`[itinerary] AI uspešno (source: ${result.source}; supply rebound=${supplyValidated.rebound} dropped=${supplyValidated.dropped.length})`);

    // Pakirni seznam — AI predlog (validirana) ali hevristika, če AI izpusti/neveljavna
    // (P4-8: hevristika spoštuje jezik itinererja)
    withFixedStops.packingList =
      sanitizeAiPackingList(parsed.packing_list) ??
      buildPackingList({
        season: input.season,
        interests: input.interests,
        days: input.days,
        lang,
      });

    // PRAVO vreme — vreme iz AI izhoda prepišemo z realno Open-Meteo prognozo
    // (WEATHER-CONTEXT: poravnano z datumom odhoda + jezikom izpisa)
    // F1: enriched izhodišče = načrt Z urejenimi FIXED postanki.
    const enriched = await enrichWithRealWeather(
      withFixedStops,
      input.startDate,
      lang
    );

    // Dogodki na obiskanih destinacijah (neodvisno od vremena — ločeno polje)
    // FW4.2: z okvirom potovanja — dogodki, ki se zgodijo MED obiskom,
    // pridejo na prvih mestih
    enriched.events = matchEventsForItinerary(enriched.days, 6, tripWindow, lang);

    // FW4.2: okvir potovanja shrani Z načrtom (svež datumski match na
    // /pot/[shareId], prikaz datumov na dnevih, deljenje z datumi)
    if (input.startDate) {
      enriched.tripStartDate = input.startDate;
      enriched.tripEndDate = tripEnd;
    }

    // FW4.1: strukturne metrike (deterministično) + AI utemeljitev
    // (sanitizirana, fallback determinističen) — isto enrich mesto kot vreme
    //
    // P0.2 (recenzija): total_budget se PRERAČUNA iz dejanskih postankov —
    // AI JSON prinese svojo številko, ki pa ni preverjena; prikaz mora
    // temeljiti na postankih, ki so DEJANSKO v načrtu (isti vzorec kot
    // fallback in refine).
    const budgetSynced = recomputeTotalBudget(enriched);

    // ------------------------------------------------------------------
    // TASK 48 (§12): STATUS PRORAČUNA iz ZNANIH stroškov + povzetek supply
    // validacije (§21) — oba se priložita načrtu (BudgetPanel prikaz,
    // analitika). "within" zahteva, da so VSE cene znane in da ni "od"
    // cen — sicer "uncertain" (nikoli "znotraj", česar ne moremo dokazati).
    // ------------------------------------------------------------------
    const budgetValidation = computeBudgetValidation(budgetSynced, {
      budget: input.budget,
      groupSize: input.groupSize,
      canonicalCosts: supplyReport.canonicalCosts,
    });
    budgetSynced.budgetValidation = budgetValidation;
    budgetSynced.supplyValidation = supplySummaryOf(supplyReport);

    // §18: strežniška observability dogodka (neblokirajoče, brez PII)
    void logItineraryValidation(db, {
      path: "generate",
      source: "ai",
      supply_stops: supplyReport.supplyStops,
      validated: supplyReport.validated,
      rejected: supplyReport.rejected,
      deduped: supplyReport.deduped,
      price_corrections: supplyReport.priceCorrections,
      geo_restored: supplyReport.geoRestored,
      directions_fixed: supplyReport.directionsFixed,
      reinserted: supplyReport.reinserted,
      fixed_count: verifiedSelection.filter((p) => p.selectionState === "fixed").length,
      budget_status: budgetValidation.status,
      issues: supplyReport.issues.length,
    });

    // F5.6 (ROAD ROUTING): realne cestne razdalje/časi (OSRM) za VSE plasti —
    // kvaliteta, geo-validacija, stroški, razlage postankov, geometrija za
    // zemljevid. Best-effort: ob nedosegljivem OSRM hevristika (razkrito v
    // geoValidation.method / quality.routingMethod). NIKOLI ne vrže in ne
    // zavlačuje mimo ~3 s (sočasnost 4 × timeout 2,5 s).
    const legs = await buildLegRouteIndex(budgetSynced);

    // TASK 50 (§14/§15 — REPAIR SCHEDULE GAPS, tudi AI POT): AI izhod lahko
    // vsebuje nemogoče urnike (živi dokazi: A3 Ljubljana→Piran 1 h vrzel
    // prek 1,5 h vožnje; F4 prekrivanje 12:00/13:00). §15: invalid schedule
    // NE SME priti skozi neopazim. Konzervativna repair plast (premakne LE
    // nemogoče začetke terminov; trajanja/vršni red/cene/ID-ji ostanejo)
    // poravna urnik z REALNIMI vožnjami. Kar ostane (neparsable termini,
    // dnevi čez polnoč) geo validacija pošteno javi — flag-only ostaja za
    // vse, česar ni mogoče popraviti brez izmišljevanja.
    const aiLegDriveH: DriveHoursResolver = (aId, bId) => {
      const leg = legs.get(legKey(aId, bId));
      return leg ? leg.min / 60 : null;
    };
    const aiScheduleRepaired = repairScheduleGaps(budgetSynced.days, aiLegDriveH);
    budgetSynced.days = aiScheduleRepaired.days;
    if (aiScheduleRepaired.report.shifted + aiScheduleRepaired.report.overlapShifted > 0) {
      console.log(
        `[itinerary] TASK 50 schedule repair (AI): ${aiScheduleRepaired.report.shifted} terminov premaknjenih za vožnjo, ${aiScheduleRepaired.report.overlapShifted} zaradi prekrivanja`
      );
    }

    budgetSynced.quality = computeItineraryQuality(budgetSynced, input, legs);
    budgetSynced.rationale =
      sanitizeAiRationale(parsed.rationale) ??
      buildFallbackRationale(input, budgetSynced.quality, lang);

    // P0.2 GEO-VALIDACIJA: izvedljivost nad končno strukturo (deterministično,
    // iz realnih koordinat — km/dan, zaporedne razdalje, obseg dneva, urnik,
    // duplikati, manjkajoči ID-ji). Sporočila locena prek lang.
    // F5.6: noge iz OSRM indeksa — realne cestne razdalje/časi.
    budgetSynced.geoValidation = validateItineraryGeo(budgetSynced, lang, legs);

    // CROWD-ALTERNATIVES: poštene opombe o gneči + alternative (deterministično)
    budgetSynced.crowdNotices = buildCrowdNotices(budgetSynced, input, lang);

    // FAZA 4-1 ("Zakaj je to priporočeno?"): vsak postanek dobi kratko,
    // podatkovno utemeljeno razlago (interesi, tip skupine, razdalja,
    // vreme, sezona — izključno dejstva, brez marketinga). Deterministično
    // na obeh poteh — AI izbira postankov, razlago pa sestavijo isti
    // preverljivi podatki. F5.6: razdalje iz OSRM nog, kadar so na voljo.
    const withReasons = buildStopReasons(budgetSynced, input, lang, legs);

    // F5.6: geometrija poti po realnih cestah (za zemljevid na /nacrtuj) —
    // po razlagah, da ohranimo isti vrstni red enrichinga (struktura se ne
    // spremeni, samo doda routeGeometry polje, kadar OSRM Geometrija obstaja).
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));

    // UI sprint (točka D): noge serializiramo v itinerer — povezovalniki med
    // postanki na clientu uporabijo ISTE številke kot značke ~km dni.
    withReasons.legs = serializeLegs(legs);

    // ISSUE #4 §21 (VAL 6): ZADNJA plast pred odgovorom — namerni vrstni red
    // (FIXED izbire + supply postanki) dobi intentLocked, da klientova
    // optimizacija zaporedja teh postankov NE premakne (iskrena pogodba:
    // označeni so SAMO uporabnikovi akti, ne uredniški predlogi).
    const withIntent = markItineraryIntentLocked(
      withReasons,
      fixedDestinationIds
    );

    return NextResponse.json(withIntent);
  } catch (error) {
    console.error("[itinerary] AI napaka, uporabljam fallback:", error);
    // WEATHER-CONTEXT + TASK 51 geo sidra + TASK 48 invariantna plast:
    // ISTA veriga kot naravna deterministična pot (TASK 100) — razlika
    // je IZKLJUČNO v oznaki vira: "fallback" = iskrena degradacija ob
    // odpovedi AI (dosedanja semantika, nespremenjena).
    return buildDeterministicPlanResponse(
      input,
      {
        anchorForecasts,
        geoAnchors,
        aiSupplyAuthority,
        verifiedSelection,
        fixedDestinationIds,
        tripWindow,
        tripEnd,
        lang,
      },
      "fallback"
    );
  }
}

// ============================================================================
// PRAVO Vreme v itinererju (post-processing)
// ============================================================================
//
// AI lahko v JSON izpljune izmišljeno vreme ("sončno 22°") — to je LAŽ.
// Po generiranju (AI ali fallback) zato itinerer obogatimo z realno DAILY
// prognozo Open-Meteo za koordinate prve lokacije:
//   - day.weather = { condition, temp } iz realne prognoze
//   - ob verjetnosti padavin >= 60 % dodamo dež-alternativo v tips
//
// Gracefully: ob napaki/timeoutu (4 s) izpusta Open-Meteo se obdrži vreme,
// ki je bilo že v objektu (pri fallbacku = sezonska ocena, glej spodaj).
//
// WEATHER-CONTEXT: napoved je zdaj poravnana z datumom odhoda (startDate —
// prej je dan i dobil "i-ti dan od danes", tudi za potovanje čez teden) in
// izpisana v jeziku itinererja (lang). Vpliv na SAMO IZBIRO destinacij se
// zgodi prej, v promptu (glej fetchAnchorForecasts zgoraj).
async function enrichWithRealWeather(
  itinerary: Itinerary,
  startDate?: string,
  lang: "sl" | "en" = "sl"
): Promise<Itinerary> {
  try {
    const firstLoc = itinerary.days[0]?.locations?.[0];
    if (!firstLoc?.destination_id) return itinerary;

    const dest = DESTINATIONS.find((d) => d.id === firstLoc.destination_id);
    if (!dest) return itinerary;

    const daily = await fetchDailyForecast(
      dest.coords.lat,
      dest.coords.lng,
      itinerary.days.length,
      startDate
    );
    if (!daily) {
      // TASK 4 / K-2 (UX FIX PASS): Open-Meteo ni dosegljiv — obstoječe
      // vreme (AI-izmišljeno ali sezonska ocena iz determinističnega motorja)
      // NI realna napoved, zato ga izrecno označimo kot oceno. TrustLine
      // zaradi tega NE izriše "✓ Vreme preverjeno" (živi dokaz audita:
      // Render /api/weather → error, itinerer pa je trdil "sončno 22°" —
      // realno je bilo megla/nevhta). ISKRENOST > lep prikaz.
      return {
        ...itinerary,
        days: itinerary.days.map((d) => ({ ...d, weatherEstimated: true })),
      };
    }

    const tips = Array.isArray(itinerary.tips) ? [...itinerary.tips] : [];

    for (let i = 0; i < itinerary.days.length; i++) {
      const forecast = daily[i];
      // Če prognoza nima dneva i (krajša od itinererja), obdrži obstoječe vreme
      // — a označi kot oceno (tega dne napoved NI bila preverjena).
      if (!forecast) {
        itinerary.days[i] = { ...itinerary.days[i], weatherEstimated: true };
        continue;
      }

      itinerary.days[i] = {
        ...itinerary.days[i],
        weather: {
          condition:
            lang === "en"
              ? weatherCodeToTextEn(forecast.weatherCode)
              : weatherCodeToText(forecast.weatherCode),
          temp: Math.round(forecast.tempMax),
        },
        // TASK 4 / K-2: realna Open-Meteo napoved — izrecni marker za
        // TrustLine (✓ sme se izrisati SAMO nad tem).
        weatherEstimated: false,
      };

      // Dež alternative — dodaj v tips, če je verjetnost padavin visoka
      // (P4-8: EN uporabnik dobi EN tip)
      if ((forecast.precipitationProbabilityMax ?? 0) >= 60) {
        const tip =
          lang === "en"
            ? `Day ${i + 1}: rain likely — alternatives: Postojna/Škocjan Caves, museums, Terme Olimia thermal spa.`
            : `Dan ${i + 1}: verjeten dež — alternative: Postojnska/Škocjanske jame, muzeji, terme Terme Olimia.`;
        if (!tips.includes(tip)) tips.push(tip);
      }
    }

    itinerary.tips = tips;
    return itinerary;
  } catch (error) {
    console.error("[itinerary] enrichWithRealWeather napaka:", error);
    return itinerary;
  }
}

// ============================================================================
// TASK 100: SKUPNA deterministična obogatitvena veriga
// ============================================================================
//
// Dva vhoda v ISTO verigo (ena koda, ena resnica — nikoli dve plasti):
//   1. NARAVNA pot: PlannerInput.engine = "deterministic" — uporabnik
//      IZRECNO zahteva motor brez LLM (source "deterministic");
//   2. FALLBACK pot: AI odpoved/timeout/prazen izhod — iskrena
//      degradacija (source "fallback", dosedanja semantika za analitiko
//      in teste, nespremenjena).
//
// Generiranje opravi čist modul generateDeterministicItinerary (0 LLM
// žetonov, 0 ure, 0 naključja — isti vhod → bitno-identičen izhod);
// obogatitev je IDENTIČNA AI poti, razen vira načrta: supply invariantna
// plast (TASK 48) nad kanoničnimi podatki, FIXED izbire vstavljene
// naravnost (motor ne pozna AI prompta), realno vreme Open-Meteo, OSRM
// noge + repairScheduleGaps (TASK 50), geo-validacija, kakovost, razlage
// postankov, geometrija za zemljevid.
async function buildDeterministicPlanResponse(
  input: PlannerInput,
  ctx: {
    anchorForecasts: AnchorForecast[];
    geoAnchors: GeoOrderAnchor[];
    aiSupplyAuthority: SelectedProviderProduct[];
    verifiedSelection: SelectedProviderProduct[];
    fixedDestinationIds: string[];
    tripWindow: TripWindow | null;
    tripEnd: string | undefined;
    lang: "sl" | "en";
  },
  source: "fallback" | "deterministic"
): Promise<NextResponse> {
  // ISSUE #4 §11 (val 1): metering determinističnega odgovora — source
  // pove, KDO je služil uporabnika: "fallback" (AI veriga je padla) ali
  // "deterministic" (izrecna izbira motorja, 0 žetonov). Merjen je čas
  // GRADNJE načrta (deterministična veriga + obogatitve).
  const meteringStartedAt = Date.now();
  const {
    anchorForecasts,
    geoAnchors,
    aiSupplyAuthority,
    verifiedSelection,
    fixedDestinationIds,
    tripWindow,
    tripEnd,
    lang,
  } = ctx;

    // WEATHER-CONTEXT: motor prejme sidrne napovedi — deževni dnevi
    // dobijo notranje/prilagodljive destinacije (glej deterministic-itinerary)
    // TASK 51: geoAnchors = VERIFICIRANE FIXED izbire (kanonske koordinate,
    // vrstni red izbire) — deterministično geografsko urejanje okoli njih.
    let plan = await enrichWithRealWeather(
      generateDeterministicItinerary(
        input,
        anchorForecasts,
        geoAnchors,
        { source }
      ),
      input.startDate,
      lang
    );

    // F1 (Supply Map) → TASK 48 (§15): FIXED izbire tudi na deterministični
    // poti — ISTA invariantna plast kot AI pot (dedupe, unit cena, geo,
    // smer, FIXED vstavitev s kanonsko ceno; avtoriteta = VERIFICIRANA izbira
    // ∪ strežni supply — Task 49). Fallback ne pozna AI prompta, zato se
    // vnesejo naravnost.
    const planValidated = validateItinerarySupply(
      plan,
      { selection: [...aiSupplyAuthority, ...verifiedSelection] },
      { lang, groupSize: input.groupSize }
    );
    plan = planValidated.itinerary;
    const supplyReport = planValidated.report;

    // AUDIT 42 (42-d YELLOW #2): PREFERRED/SUGGESTED/nastanitve/brez-geo
    // izbire na plan poti prej TIHO IZGINILE — zdaj gredo v
    // recommendations (deterministično, iskreno, brez AI).
    const selectionRecs = buildSelectionRecommendations(verifiedSelection, lang);
    if (selectionRecs.length > 0) {
      plan.recommendations = [
        ...selectionRecs,
        ...(plan.recommendations ?? []),
      ];
    }

    // Plan: hevristični pakirni seznam + dogodki (isti enrich kot AI pot)
    // (P4-8: jezik itinererja — EN uporabnik dobi EN seznam)
    plan.packingList = buildPackingList({
      season: input.season,
      interests: input.interests,
      days: input.days,
      lang,
    });
    plan.events = matchEventsForItinerary(plan.days, 6, tripWindow, lang);

    // FW4.2: okvir potovanja tudi na determinističnem načrtu (isti enrich kot AI pot)
    if (input.startDate) {
      plan.tripStartDate = input.startDate;
      plan.tripEndDate = tripEnd;
    }

    // FW4.1: metrike + deterministična utemeljitev (motor nima AI rationale)
    // (P4-8: jezik itinererja) + F5.6 realne ceste (ista obogatitev kot AI pot)
    const legs = await buildLegRouteIndex(plan);

    // TASK 50 (§14, P1 — REPAIR SCHEDULE GAPS): termini iz generateFallback
    // itinererja so hevristični (haversine ×1,5 — gorski pari podcenjeni:
    // Triglav→Soča 0,28 h prek OSRM 1,5 h). Po izgradnji REALNIH nog še
    // enkrat poravnamo termine (premakne se LE začetek; vrstni red/ID-ji/
    // cene/trajanja ostanejo) — deterministična pot je s tem izvedljiva
    // PO KONSTRUKCIJI, ne le označena. AI pot ostaja flag-only (avtorski
    // časi AI izpisa; geo validacija jih javi —Task 48 dizajn).
    const legDriveH: DriveHoursResolver = (aId, bId) => {
      const leg = legs.get(legKey(aId, bId));
      return leg ? leg.min / 60 : null;
    };
    const scheduleRepaired = repairScheduleGaps(plan.days, legDriveH);
    plan.days = scheduleRepaired.days;
    if (scheduleRepaired.report.shifted + scheduleRepaired.report.overlapShifted > 0) {
      console.log(
        `[itinerary] TASK 50 schedule repair (${source}): ${scheduleRepaired.report.shifted} terminov premaknjenih za vožnjo, ${scheduleRepaired.report.overlapShifted} zaradi prekrivanja`
      );
    }

    plan.quality = computeItineraryQuality(plan, input, legs);
    plan.rationale = buildFallbackRationale(input, plan.quality, lang);

    // TASK 48 (§12): total_budget se PRERAČUNA tudi na deterministični poti — vstavljeni
    // FIXED postanki (iz validacijske plasti) prej niso bili v seštevku (drift
    // prikaza), status proračuna pa izhaja iz ZNANIH stroškov (ista plast kot
    // AI pot — plan je enako preverljiv).
    const planBudgetSynced = recomputeTotalBudget(plan);
    plan = planBudgetSynced;
    const planBudgetValidation = computeBudgetValidation(plan, {
      budget: input.budget,
      groupSize: input.groupSize,
      canonicalCosts: supplyReport.canonicalCosts,
    });
    plan.budgetValidation = planBudgetValidation;
    plan.supplyValidation = supplySummaryOf(supplyReport);

    // §18: strežniška observability dogodka (neblokirajoče, brez PII)
    void logItineraryValidation(db, {
      path: "generate",
      source,
      supply_stops: supplyReport.supplyStops,
      validated: supplyReport.validated,
      rejected: supplyReport.rejected,
      deduped: supplyReport.deduped,
      price_corrections: supplyReport.priceCorrections,
      geo_restored: supplyReport.geoRestored,
      directions_fixed: supplyReport.directionsFixed,
      reinserted: supplyReport.reinserted,
      fixed_count: verifiedSelection.filter((p) => p.selectionState === "fixed").length,
      budget_status: planBudgetValidation.status,
      issues: supplyReport.issues.length,
    });

    // P0.2 GEO-VALIDACIJA: isto preverjanje izvedljivosti kot na AI poti —
    // deterministični itinerar mora biti enako preverljiv kot AI izpisa.
    // F5.6: noge iz OSRM indeksa — realne cestne razdalje/časi.
    plan.geoValidation = validateItineraryGeo(plan, lang, legs);

    // CROWD-ALTERNATIVES: iste poštene opombe kot na AI poti
    plan.crowdNotices = buildCrowdNotices(plan, input, lang);

    // FAZA 4-1: razlage postankov (ista deterministična obogatitev kot AI pot)
    // F5.6: razdalje iz OSRM nog + geometrija dneva za zemljevid.
    const withReasons = buildStopReasons(plan, input, lang, legs);
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));

    // UI sprint (točka D): noge tudi na plan poti (isti vir številk)
    withReasons.legs = serializeLegs(legs);

    // TASK 51 (§4): meritve geografske koherence determinističnega načrta nad
    // REALNIMI nogami (M1 skupne km z odkritim deležem OSRM/hevristika,
    // M2 najdaljša noga, M3 deterministični backtracking). Merljivo in
    // reproducibilno (isti vhod → isti izpis) — živo dokazno sredstvo.
    const coherenceStops: CoherenceStop[] = [];
    for (const d of plan.days) {
      for (const loc of d.locations) {
        const c =
          DESTINATION_COORDS.get(loc.destination_id) ??
          (loc.lat != null && loc.lng != null
            ? { lat: loc.lat, lng: loc.lng }
            : null);
        coherenceStops.push({
          id: loc.destination_id,
          name: loc.destination_name,
          lat: c?.lat ?? Number.NaN,
          lng: c?.lng ?? Number.NaN,
        });
      }
    }
    const coherence = computeGeoCoherence(coherenceStops, (a, b) => {
      const leg = legs.get(legKey(a.id, b.id));
      return leg ? { km: leg.km, source: leg.source } : null;
    });
    console.log(
      `[itinerary] TASK 51 geo coherence (${source}): stops=${coherence.stops} ` +
        `km=${coherence.totalDistanceKm} ` +
        `(osrm=${coherence.osrmLegs}/heuristic=${coherence.heuristicLegs}) ` +
        `longest=${coherence.longestLegKm}km [${coherence.longestLegSource ?? "-"}] ` +
        `backtracking=${coherence.backtrackingEvents.length} anchors=${geoAnchors.length}`
    );

    // ISSUE #4 §11: vrstica AIUsageLog za deterministični odgovor (isti
    // stolpci kot AI vrstice — success=true, ker je uporabnik dobil veljaven
    // načrt; source loči od AI zmagovalcev).
    logAIUsage({
      feature: "itinerary",
      source,
      success: true,
      responseTimeMs: Date.now() - meteringStartedAt,
      metadata: { engine: source },
    });

    // ISSUE #4 §21 (VAL 6): ISTA namerna-plast kot AI pot — FIXED izbire +
    // supply postanki dobijo intentLocked pred odgovorom (en kodni vir:
    // markItineraryIntentLocked; deterministična/fallback pot je enako
    // zavezana pogodbi o uporabnikovem vrstnem redu kot AI pot).
    const withIntent = markItineraryIntentLocked(
      withReasons,
      fixedDestinationIds
    );

    return NextResponse.json(withIntent);
}

// ============================================================================
// TASK 48 (1.53.0): povzetek supply poročila → serializabilno polje načrta
// (SupplyValidationInfo v types.ts — brez Map struktur kanonskih cen).
// ============================================================================
function supplySummaryOf(r: SupplyValidationReport): SupplyValidationInfo {
  return {
    supplyStops: r.supplyStops,
    validated: r.validated,
    rejected: r.rejected,
    deduped: r.deduped,
    priceCorrections: r.priceCorrections,
    geoRestored: r.geoRestored,
    directionsFixed: r.directionsFixed,
    reinserted: r.reinserted,
  };
}
