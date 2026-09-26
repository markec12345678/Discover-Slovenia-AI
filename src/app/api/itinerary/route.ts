import { NextResponse } from "next/server";
import { DESTINATIONS, normalizeInterests } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { logAIUsage } from "@/lib/ai-usage";
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
import { PARTY_TYPES } from "@/lib/party-types";
import { PACES } from "@/lib/pace-types";
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
import { buildPackingList } from "@/lib/packing-list";
import {
  buildFallbackRationale,
  computeItineraryQuality,
  recomputeTotalBudget,
} from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildStopReasons } from "@/lib/stop-insights";
import {
  sanitizeSelectedProviderProducts,
  buildSelectionRecommendations,
} from "@/lib/supply/sanitize";
// TASK 47 (1.52.0): supply-aware — kanonski strežni supply kontekst (0 AI)
import { fetchAiSupplyContext } from "@/lib/supply/ai-context";
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
import { enrichWithMarketplaceExperiences } from "@/lib/marketplace-stop-enrichment";

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

  // TASK 100 + ISSUE #9: izbira motorja — nazaj kompatibilno: "auto" in
  // "deterministic" pomenita ISTO (deterministični motor je edina pot;
  // AI veriga je odstranjena). Polje ostaja zaradi starih klientov.
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
  // (§10 — obstoječi searchSupply runner, 0 AI).
  //
  // ISSUE #9: ranking DB poizvedba (rankListings/buildTransparencyContext)
  // je bila potrebna SAMO za AI prompt (partner kontekst) — z odstranjeno
  // AI potjo je ni več (0 odvečnih DB poizvedb na generiranju).
  const [anchorForecasts, aiSupply] = await Promise.all([
    fetchAnchorForecasts(input.days, input.startDate),
    // NIKOLI ne vrže (interna varovalka — odpoved supply = prazen kontekst)
    fetchAiSupplyContext({
      pax: input.groupSize,
      date: input.startDate,
      locale: lang,
    }),
  ]);

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
  // ------------------------------------------------------------------
  // ISSUE #9 (ZERO-AI / deterministic-first): DETERMINISTIČNI MOTOR JE
  // KANONSKA POT. Nekdanja AI generacija (LLM JSON → sanitize →
  // revalidacija) je ODSTRANJENA — engine "auto" in "deterministic"
  // (nazaj kompatibilno) pomenita ISTO: čist deterministični motor
  // (0 žetonov, 100 % reproducibilno), obogatitev pa teče ISTA veriga
  // (supply invariantna plast, realno vreme, OSRM noge + repair,
  // geo-validacija, kakovost, razlage postankov). Odgovor pošteno nosi
  // source "deterministic" — NI AI načrt in se ne dela takega.
  // ------------------------------------------------------------------
  console.log(
    "[itinerary] ISSUE #9: deterministični motor je kanonska pot (0 LLM žetonov, engine=" +
      (input.engine ?? "auto") +
      ")"
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

    // ISSUE #11 (D1): TRŽNICA NA POSTANKU — realne cene lastnih izkušenj
    // (Experience.pricePerPerson, published, isti destinationId-pri prostor).
    // ISTA fail-open filozofija kot enrichWithRealWeather: DB nedosegljiva
    // → načrt NESPREMENJEN (brez polja, brez napake). ISKRENOST: fromPrice
    // je »od« cena; estimated_cost ocena ostane (ocena ≠ cena — nikoli
    // mešano; trip-budget vedrice nedotaknjene).
    const withMarketplace = await enrichWithMarketplaceExperiences(withIntent);

    return NextResponse.json(withMarketplace);
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
