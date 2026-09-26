import { NextResponse } from "next/server";
import { DESTINATIONS, normalizeInterests } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { hasItineraryShape } from "@/lib/itinerary-sanitize";
// ISSUE #4 §21 (VAL 6) — NAMERNI VRSTNI RED na refinu: klientov načrt nosi
// intentLocked oznake; refine izhod jih OHRANI po destination_id (nova
// AI dodane postanke pusti proste — predlogi niso namerna izbira).
import { refineIntentLocked } from "@/lib/route-intent";
import { db } from "@/lib/db";
import { logFallbackUsage } from "@/lib/ai-usage";
import type {
  Itinerary,
  PlannerInput,
  DayPlan,
  LocationVisit,
  QuickActionId,
  RefineChange,
  RefineValidation,
  GeoValidation,
  GeoValidationSnapshot,
} from "@/lib/types";
import { rateLimit } from "@/lib/rate-limit";
import { recomputeTotalBudget } from "@/lib/itinerary-quality";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { buildCrowdNotices } from "@/lib/crowd-alternatives";
import { matchEventsForItinerary } from "@/lib/events-match";
import { tripWindowMs } from "@/lib/trip-dates";
import { isPartyType } from "@/lib/party-types";
import { applyQuickAction, QUICK_ACTIONS } from "@/lib/refine-actions";
import {
  parseRefineCommand,
  pickDefaultDay,
  type RefineCommand,
} from "@/lib/refine-command-parser";
import { buildStopReasons } from "@/lib/stop-insights";
import { dayRouteGeometry, serializeLegs, legKey } from "@/lib/road-routing";
import { buildLegRouteIndex } from "@/lib/road-routing-server";
import { repairScheduleGaps, type DriveHoursResolver } from "@/lib/schedule-slots";
import { sanitizeSelectedProviderProducts } from "@/lib/supply/sanitize";
import {
  computeBudgetValidation,
  extractSupplyStops,
  logItineraryValidation,
  validateItinerarySupply,
  type SupplyValidationReport,
} from "@/lib/supply/itinerary-validation";
// TASK 49 (1.54.0) — SUPPLY INTEGRITY na refine poti: klientov payload
// (izbira + trenutni načrt) je NEZAUPAN vnos — cena/geo/naslov/tip se
// verificirajo proti strežniški resnici (KT dataset); brez dokaza → unknown.
import {
  verifySelectedProducts,
  verifyCurrentStopsAuthority,
  hasVerifyChanges,
} from "@/lib/supply/selection-verify";
import type { SupplyValidationInfo } from "@/lib/types";

// POST /api/itinerary/refine — Multi-turn popravki obstoječega itinererja.
//
// Uporabnik pošlje trenutni itinerer + naravnojezični ukaz (npr. "Dodaj več
// pohodov", "Naj bo primerno za otroke", "Cenejša varianta"), AI pa vrne
// posodobljen itinerer v istem JSON formatu.
//
// To je močna demonstracija AI — uporabnik lahko iterativno izboljšuje
// načrt potovanja brez ponovnega izpolnjevanja obrazca.

interface RefineRequest {
  itinerary: Itinerary;
  formData: PlannerInput;
  instruction: string;
  history?: string[]; // prejšnji ukazi za kontekst
  // FAZA 4-2 ("Prilagodi ta dan"): kanonična hitra akcija + številka dneva.
  // Opcijsko — klasični naravnojezikovni refine deluje nespremenjeno.
  // Ko je podana, jo fallback pot obdela DETERMINISTIČNO (glej
  // src/lib/refine-actions.ts) — tudi brez AI žetona se akcija dejansko
  // izvede; AI pot dobi isto akcijo kot del naravnojezičnega ukaza.
  action?: QuickActionId;
  day?: number;
}

const VALID_ACTIONS = new Set<string>(QUICK_ACTIONS.map((a) => a.id));

// ---------------------------------------------------------------------------
// P0.1 (recenzija) — struktuirani validacijski dokaz vsakega refine odgovora
// ---------------------------------------------------------------------------
//
// "Deterministični fallback, ki spremeni dan, še ni isto kot validator, ki
// dokaže, da je novi dan izvedljiv." Zato vsak odgovor (AI + deterministična
// pot) vsebuje before → mutation (changes) → after iz ISTE validacijske plasti
// kot prikaz, s statusom pass | warn | still_failing in opombo, če dan/pot po
// spremembi še vedno ni realno izvedljiva (NE samo "uspešen 200 in lep tekst").

type Lang = "sl" | "en";

function snapshotFor(geo: GeoValidation, day?: number): GeoValidationSnapshot {
  if (day !== undefined) {
    const metrics = geo.days.find((d) => d.day === day);
    const issues = geo.issues.filter((i) => i.day === day);
    const errors = issues.filter((i) => i.level === "error").length;
    return {
      km: metrics?.km ?? 0,
      worst: errors > 0 ? "error" : issues.length > 0 ? "warn" : "ok",
      issues: issues.length,
      errors,
    };
  }
  return {
    km: geo.tripKm,
    worst: geo.worst,
    issues: geo.issues.length,
    errors: geo.issues.filter((i) => i.level === "error").length,
  };
}

function buildValidationEvidence(
  before: GeoValidation,
  after: GeoValidation,
  scope: "day" | "trip",
  day: number | undefined,
  lang: Lang
): RefineValidation {
  const beforeSnap = snapshotFor(before, day);
  const afterSnap = snapshotFor(after, day);
  const status: RefineValidation["status"] =
    afterSnap.errors > 0 ? "still_failing" : afterSnap.issues > 0 ? "warn" : "pass";

  let statusNote: string | undefined;
  if (status === "still_failing") {
    statusNote =
      scope === "day"
        ? lang === "en"
          ? `Day ${day}: still not realistically doable after this change — see the feasibility warnings below the plan.`
          : `Dan ${day}: po spremembi je še vedno ni realno izvedljivo — poglej opozorila o izvedljivosti pod načrtom.`
        : lang === "en"
          ? `The itinerary still has error-level feasibility warnings after this change — see the panel below the plan.`
          : `Načrt ima po spremembi še vedno opozorila ravni ERROR o izvedljivosti — poglej ploščo pod načrtom.`;
  } else if (status === "warn") {
    statusNote =
      scope === "day"
        ? lang === "en"
          ? `Day ${day} is doable after the change, but ${afterSnap.issues} warning(s) remain — see the feasibility panel.`
          : `Dan ${day} je po spremembi izvedljiv, a ostaja ${afterSnap.issues} opozoril — poglej ploščo izvedljivosti.`
        : lang === "en"
          ? `Doable after the change, but ${afterSnap.issues} warning(s) remain — see the feasibility panel.`
          : `Po spremembi je izvedljivo, a ostaja ${afterSnap.issues} opozoril — poglej ploščo izvedljivosti.`;
  }

  return { scope, day, before: beforeSnap, after: afterSnap, status, statusNote };
}

// ============================================================================
// TASK 48 (1.53.0): povzetek supply poročila → serializabilno polje načrta
// ( SupplyValidationInfo v types.ts — brez Map struktur kanonskih cen).
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

export async function POST(request: Request) {
    // ISSUE #4 §11 (val 1): route-level časovnik — za zapis DEJANSKO
    // izvedenih fallbackov (deterministična akcija / echo originala).
    const routeStartedAt = Date.now();
    // Rate limit AI refine klicev
    const limited = rateLimit(request, { limit: 20, windowMs: 600000, key: "itinerary-refine" });
    if (limited) return limited;

  let body: RefineRequest;
  try {
    body = (await request.json()) as RefineRequest;
  } catch {
    return NextResponse.json({ error: "Neveljaven JSON" }, { status: 400 });
  }

  // Validacija
  if (!body?.itinerary?.days?.length) {
    return NextResponse.json(
      { error: "Manjka itinerer (itinerary.days)" },
      { status: 400 }
    );
  }
  if (!body?.instruction?.trim()) {
    return NextResponse.json(
      { error: "Manjka ukaz (instruction)" },
      { status: 400 }
    );
  }

  const instruction = body.instruction.trim().slice(0, 500); // omejitev dolžine
  const current = body.itinerary;
  const formData = body.formData;

  // HARDENING I5 (P2): klientov `current` je NEZAUPAN payload — oblika je
  // varovana na drugih mejah (generacija: sanitize po JSON.parse; save:
  // sanitize pred persistenco), refine pa ga je uporabljal SUROVEGA v
  // quick-action/echo vejah (točno razred hrošča shape guarda: notes:{}
  // → React crash; days brez arraya → TypeError .map). Veljavni payloadi
  // gredo nespremenjeni ( polja, ki se na echo poti ne preračunavajo —
  // events/quality — ostanejo); pokvarjeni se zavrnejo z 400.
  if (!hasItineraryShape(current)) {
    return NextResponse.json(
      { error: "Neveljavna struktura itinererja (days/locations/notes)" },
      { status: 400 }
    );
  }

  // 19c-4 (revizija 1.36.0, P2): formData (season, interests, budget,
  // groupSize, partyType, pace) gre v SYSTEM prompt — prej surovi client
  // vnosi (zrcali /api/itinerary, ki to validira; refine je bil preskočen).
  // Isti vzorec: enum sezona, numerične meje, kapirani interesi.
  if (formData !== null && typeof formData === "object") {
    const fd = formData as unknown as Record<string, unknown>;
    const VALID_SEASONS = ["spring", "summer", "autumn", "winter"];
    if (
      fd.season !== undefined &&
      (typeof fd.season !== "string" || !VALID_SEASONS.includes(fd.season))
    ) {
      return NextResponse.json(
        { error: "Sezona je neveljavna (spring, summer, autumn, winter)" },
        { status: 400 }
      );
    }
    if (
      fd.budget !== undefined &&
      (typeof fd.budget !== "number" ||
        !Number.isFinite(fd.budget) ||
        fd.budget < 0 ||
        fd.budget > 100_000)
    ) {
      return NextResponse.json(
        { error: "Proračun je neveljaven (število 0–100000)" },
        { status: 400 }
      );
    }
    if (
      fd.groupSize !== undefined &&
      (typeof fd.groupSize !== "number" ||
        !Number.isInteger(fd.groupSize) ||
        fd.groupSize < 1 ||
        fd.groupSize > 20)
    ) {
      return NextResponse.json(
        { error: "Velikost skupine je neveljavna (1–20)" },
        { status: 400 }
      );
    }
    if (
      fd.interests !== undefined &&
      (!Array.isArray(fd.interests) ||
        fd.interests.length > 12 ||
        fd.interests.some(
          (i) => typeof i !== "string" || i.length > 60
        ))
    ) {
      return NextResponse.json(
        { error: "Interesi: največ 12 po 60 znakov" },
        { status: 400 }
      );
    }
    if (fd.partyType !== undefined && !isPartyType(fd.partyType)) {
      return NextResponse.json(
        { error: "Neveljaven tip potne skupine" },
        { status: 400 }
      );
    }
  }

  // FAZA 4-2: validacija hitre akcije (če je podana)
  const action =
    typeof body.action === "string" && VALID_ACTIONS.has(body.action)
      ? (body.action as QuickActionId)
      : undefined;
  const day =
    typeof body.day === "number" && Number.isInteger(body.day) && body.day >= 1 && body.day <= 14
      ? body.day
      : undefined;

  // FW4.3/P4-8 (EN-fallback fix): jezik — prej SL prompt + SL opomba tudi
  // za EN uporabnike (refine je vračal slovenske odgovore EN potnikom)
  const isEn = formData?.language === "en";

  // FAZA 4-1/4-2: defenzivni vhod za obogatitev razlag in hitre akcije, če
  // klient ne pošlje formData (naš UI ga vedno pošlje — to je samo varnostna
  // mreža za ročne klice; v tem primeru razlaga izpusti interpolacijo
  // interesov, kar je še vedno pošteno)
  const currentAsFallbackInput: PlannerInput = formData ?? {
    budget: current.total_budget,
    days: current.days.length,
    interests: [],
    season: "summer",
    groupSize: 2,
    language: isEn ? "en" : "sl",
  };
  // TAG-ALIGN (P1, recenzija Faze 4): normalizacija interesov na meji —
  // hitre akcije (npr. "Več hrane") ocenjujejo kandidate z istim bestFor
  // ujemanjem kot generacija; "kulinarika" iz starih shranjenih načrtov
  // se tu preslika na kanonični "hrana" (AI prompt pa dobi čistejši vnos).
  const refineInput: PlannerInput = formData
    ? { ...formData, interests: normalizeInterests(formData.interests ?? []) }
    : currentAsFallbackInput;

  // ------------------------------------------------------------------
  // TASK 48 (§14 — P0 REFINEMENT BYPASS FIX, 1.53.0): kanonska izbira z
  // zemljevida se pošlje TUDI z refine zahtevo ( klient jo priloži iz
  // store-a — isti vzorec kot generacija). Meja zaupanja: isti sanitize
  // kot /api/itinerary (provider whitelist, enumi, kapice).
  // ------------------------------------------------------------------
  const cleanSelectedProducts = sanitizeSelectedProviderProducts(
    (formData as { selectedProviderProducts?: unknown } | null | undefined)
      ?.selectedProviderProducts
  );
  // TASK 49 (§4/§7, P0): klientova izbira NA REFINU je prav tako NEZAUPAN
  // vnos — isti verify sloj kot generacija (KT dataset zmaga; brez dokaza
  // → unknown; fabrikantrt KT id → izbira zavrnjena). Strežni supply
  // kontekst se na refinu NE pridobiva (0 dodatnih remote klicev) — KT
  // dataset v pomnilniku pokriva edinega priključenega komercialnega vira.
  const supplyVerified = verifySelectedProducts(cleanSelectedProducts);
  const verifiedSelection = supplyVerified.products;
  // ISSUE #4 §21 (VAL 6): ID-ji VERIFICIRANIH FIXED izbir (kanonski
  // "provider:productId" — isti zapis kot postanki v načrtu) — refine izhod
  // jih označi kot NAMERNE (isti vir resnice kot /api/itinerary).
  const fixedDestinationIds: string[] = verifiedSelection
    .filter((p) => p.selectionState === "fixed")
    .map((p) => `${p.provider}:${p.providerProductId}`);
  if (hasVerifyChanges(supplyVerified.report)) {
    console.warn(
      `[itinerary/refine] TASK 49 supply verify (izbira): ${supplyVerified.report.rejectedFake} zavrnjenih, ` +
        `${supplyVerified.report.priceOverrides} cen popravljenih na kanon, ` +
        `${supplyVerified.report.pricesStripped} cen odstranjenih (unknown), ` +
        `${supplyVerified.report.geoRestored} geo, ${supplyVerified.report.titlesRestored} naslovov, ` +
        `${supplyVerified.report.typesRestored} tipov, ${supplyVerified.report.availabilityStripped} razpoložljivosti`
    );
  }
  // Kanonska avtoriteta obstoječih supply postankov (refine pot): načrt
  // PRED spremembo — AI odmev ne more tiho zbrisati/spremeniti refa, cene
  // ali koordinat, ki jih uporabnik že vidi v svojem načrtu.
  // TASK 49 (P0): TI postanki so klientov payload → overjeni proti
  // strežniški resnici (KT cena/naslov/geo iz dataseta; fabrikantrt KT id
  // → izvzet → Task 48 plast ga zavrže kot fake_supply_ref; ostali →
  // cena unknown/NaN, ki Number.isFinite obravnava pošteno).
  const currentStopsVerified = verifyCurrentStopsAuthority(
    extractSupplyStops(current)
  );
  const currentStops = currentStopsVerified.stops;

  // P0.2 (recenzija): datumska konteksta za PONOVEN izračun dogodkov in opomb
  // o gneči po spremembi — startDate iz obrazca, sicer okvir, shranjen s
  // trenutnim načrtom (refine spreminja postanke, ne datumov odhoda).
  const refineInputWithDates: PlannerInput = {
    ...refineInput,
    startDate: refineInput.startDate ?? current.tripStartDate ?? undefined,
  };
  const refineTripWindow = tripWindowMs(
    refineInputWithDates.startDate ?? null,
    current.days.length
  );

  // ------------------------------------------------------------------
  // ISSUE #4 §10 + ISSUE #9 §7 — DETERMINISTIČNA IZVEDBA VSIH UKAZOV (0 LLM)
  // ------------------------------------------------------------------
  // Čipi (action + day) imajo POPOLNO deterministično izvedbo (Ø4 §10).
  // ISSUE #9 (ZERO-AI): tudi PROSTOJEZIKOVNI ukazi se razčlenijo
  // DETERMINISTIČNO (src/lib/refine-command-parser.ts — slovar sinonimov
  // SL+EN, dodajanje/odstranjevanje destinacij, dnevni cilji) in preslikajo
  // na ISTE transformacije + ISTO validacijsko plast. Nekdanja AI noga
  // (LLM mutacija prostega besedila) je ODSTRANJENA — 0 žetonov, 0 omrežja
  // (razen OSRM/Open-Meteo validacijskih plasti, ki so bile tu že prej).
  // Neprepoznan/nepodprt ukaz → ISKRENA odklonitev s seznamom podprtih
  // ukazov (Issue #9 §47) — načrt ostane INTACT.
  // ------------------------------------------------------------------
  const command: RefineCommand = action
    ? { kind: "unknown" } // čip že nosi action + day — parser ne runnable
    : parseRefineCommand(instruction, {
        lang: isEn ? "en" : "sl",
        tripStartDate: current.tripStartDate ?? null,
        daysCount: current.days.length,
      });

  /**
   * Skupna deterministična izvedbena veriga — ISTA plast za čipe,
   * parserjeve hitre akcije in dodajanje/odstranjevanje krajev
   * (Issue #9 §25/§27: ena koda, ena resnica):
   *   supply validacija (fail-closed) → dogodki/gneča → OSRM noge →
   *   repair urnika → geo validacija → razlage → geometrija → proračun →
   *   dokaz before/after → namernost (refineIntentLocked) → odgovor.
   */
  const runDeterministicMutation = async (
    mutation: { itinerary: Itinerary; changes: RefineChange[]; note: string },
    meta: { action: string; day: number; logPath: string }
  ): Promise<NextResponse> => {
    let mutated = mutation.itinerary;

    // TASK 48 (§14): tudi DETERMINISTIČNA pot gre skozi isto validacijsko
    // plast (defense in depth — transformacije so čiste, a sloj zagotavlja
    // invariant tukaj). reinsertFixed: NE — odstranitev postanka je
    // EKSPlicitNA uporabnikova intencija (stop_removed).
    const quickValidated = validateItinerarySupply(
      mutated,
      { selection: verifiedSelection, currentStops },
      {
        lang: isEn ? "en" : "sl",
        groupSize: formData?.groupSize,
        reinsertFixed: false,
      }
    );
    mutated = quickValidated.itinerary;
    const quickReport = quickValidated.report;
    // P0.2 (recenzija): dogodki + opombe o gneči se preračunata tudi na
    // deterministični poti (zamenjava/odstranitev postanka spremeni oba)
    mutated.events = matchEventsForItinerary(
      mutated.days,
      6,
      refineTripWindow,
      isEn ? "en" : "sl"
    );
    mutated.crowdNotices = buildCrowdNotices(
      mutated,
      refineInputWithDates,
      isEn ? "en" : "sl"
    );
    // P0.2 GEO-VALIDACIJA: transformacija spremeni strukturo dneva —
    // preračunaj (isto čisto funkcijo). F5.6: realne ceste (OSRM).
    const legs = await buildLegRouteIndex(mutated);

    // TASK 50 (§14, P1 — REPAIR SCHEDULE GAPS): termini se poravnajo z
    // REALNIMI nogami (premakne se LE začetek termina).
    const quickLegDriveH: DriveHoursResolver = (aId, bId) => {
      const leg = legs.get(legKey(aId, bId));
      return leg ? leg.min / 60 : null;
    };
    const quickRepaired = repairScheduleGaps(mutated.days, quickLegDriveH);
    mutated.days = quickRepaired.days;

    mutated.geoValidation = validateItineraryGeo(
      mutated,
      isEn ? "en" : "sl",
      legs
    );
    const withReasons = buildStopReasons(
      mutated,
      refineInput,
      isEn ? "en" : "sl",
      legs
    );
    // F5.6: sveža geometrija po spremembi strukture + sveže noge za UI
    withReasons.days = withReasons.days.map((d) => ({
      ...d,
      routeGeometry: dayRouteGeometry(d.locations, legs) ?? undefined,
    }));
    withReasons.legs = serializeLegs(legs);

    // TASK 48 (§12): status proračuna + povzetek supply validacije
    withReasons.budgetValidation = computeBudgetValidation(withReasons, {
      budget: formData?.budget,
      groupSize: formData?.groupSize,
      canonicalCosts: quickReport.canonicalCosts,
    });
    withReasons.supplyValidation = supplySummaryOf(quickReport);

    // §18: strežniška observability dogodka (neblokirajoče, brez PII)
    void logItineraryValidation(db, {
      path: "refine",
      source: "quick_action",
      supply_stops: quickReport.supplyStops,
      validated: quickReport.validated,
      rejected: quickReport.rejected,
      deduped: quickReport.deduped,
      price_corrections: quickReport.priceCorrections,
      geo_restored: quickReport.geoRestored,
      directions_fixed: quickReport.directionsFixed,
      reinserted: quickReport.reinserted,
      fixed_count: verifiedSelection.filter((p) => p.selectionState === "fixed").length,
      budget_status: withReasons.budgetValidation.status,
      issues: quickReport.issues.length,
    });

    // P0.1 (recenzija): before → mutation → after iz ISTE validacijske plasti
    // kot prikaz — dokaz, da je dan po spremembi izvedljiv.
    const beforeGeo = validateItineraryGeo(current, isEn ? "en" : "sl", legs);
    const validation = buildValidationEvidence(
      beforeGeo,
      mutated.geoValidation,
      "day",
      meta.day,
      isEn ? "en" : "sl"
    );

    logFallbackUsage("refine", Date.now() - routeStartedAt, {
      metadata: { path: meta.logPath, action: meta.action },
    });
    // ISSUE #4 §21: transformacija načrta — namernost (vhodne oznake +
    // sveže FIXED izbire) se nanese NAZAJ (novi postanki prosti).
    const withIntent = refineIntentLocked(withReasons, current, fixedDestinationIds);
    return NextResponse.json({
      itinerary: withIntent,
      instruction,
      source: "deterministic",
      applied: true,
      action: meta.action,
      day: meta.day,
      changes: mutation.changes satisfies RefineChange[],
      note: mutation.note,
      validation,
    });
  };

  /**
   * ISKRENA odklonitev (Issue #9 §47): vrne strežniško validiran ORIGINAL
   * (ISTA integritetna plast kot izvedbene poti — klientov podatek NI
   * kanonski) + opozorilo z razlogom. Nikoli ne vrže.
   */
  const echoOriginal = async (warningText: string, logPath: string): Promise<NextResponse> => {
    const echoValidated = validateItinerarySupply(
      current,
      { selection: verifiedSelection, currentStops },
      {
        lang: isEn ? "en" : "sl",
        groupSize: formData?.groupSize,
        reinsertFixed: false,
      }
    );
    const echoItinerary = echoValidated.itinerary;
    const echoReport = echoValidated.report;
    if (echoReport.issues.length > 0) {
      console.warn(
        `[itinerary/refine] echo validacija: ${echoReport.validated}/${echoReport.supplyStops} veljavnih, ` +
          `${echoReport.rejected} zavrnjenih, ${echoReport.deduped} dedupliciranih, ` +
          `${echoReport.priceCorrections} popravkov cen`
      );
    }
    // P0.2/P0.1: sveža geo validacija na (popravljeni) strukturi + OSRM noge.
    const echoLegs = await buildLegRouteIndex(echoItinerary);
    const echoLegDriveH: DriveHoursResolver = (aId, bId) => {
      const leg = echoLegs.get(legKey(aId, bId));
      return leg ? leg.min / 60 : null;
    };
    const echoRepaired = repairScheduleGaps(echoItinerary.days, echoLegDriveH);
    echoItinerary.days = echoRepaired.days;
    echoItinerary.geoValidation = validateItineraryGeo(
      echoItinerary,
      isEn ? "en" : "sl",
      echoLegs
    );
    const echoBudgetSynced = recomputeTotalBudget(echoItinerary);
    echoBudgetSynced.budgetValidation = computeBudgetValidation(
      echoBudgetSynced,
      {
        budget: formData?.budget,
        groupSize: formData?.groupSize,
        canonicalCosts: echoReport.canonicalCosts,
      }
    );
    echoBudgetSynced.supplyValidation = supplySummaryOf(echoReport);
    echoBudgetSynced.legs = serializeLegs(echoLegs);

    void logItineraryValidation(db, {
      path: "refine",
      source: "fallback_echo",
      supply_stops: echoReport.supplyStops,
      validated: echoReport.validated,
      rejected: echoReport.rejected,
      deduped: echoReport.deduped,
      price_corrections: echoReport.priceCorrections,
      geo_restored: echoReport.geoRestored,
      directions_fixed: echoReport.directionsFixed,
      reinserted: echoReport.reinserted,
      fixed_count: verifiedSelection.filter((p) => p.selectionState === "fixed").length,
      budget_status: echoBudgetSynced.budgetValidation.status,
      issues: echoReport.issues.length,
    });

    logFallbackUsage("refine", Date.now() - routeStartedAt, {
      metadata: { path: logPath },
    });
    const echoWithIntent = refineIntentLocked(
      echoBudgetSynced,
      current,
      fixedDestinationIds
    );
    return NextResponse.json(
      {
        itinerary: echoWithIntent,
        instruction,
        source: "fallback",
        warning: warningText,
      },
      { status: 200 }
    );
  };

  // --- 1) Čipi (action + day) — deterministično PRIMA (Ø4 §10) ---
  if (action && day) {
    const result = applyQuickAction(current, refineInput, action, day, isEn ? "en" : "sl");
    console.log(
      `[itinerary/refine] Hitra akcija "${action}" (dan ${day}) deterministično-PRIMA (§10, 0 LLM): ${result.changes.length} sprememb`
    );
    return runDeterministicMutation(result, {
      action,
      day,
      logPath: "fast-action-deterministic-primary",
    });
  }

  // --- 2) Parser: hitra akcija iz prostega besedila (ISSUE #9 §7) ---
  if (command.kind === "quick-action") {
    const cmdDay = command.day ?? pickDefaultDay(current, command.action);
    const result = applyQuickAction(
      current,
      refineInput,
      command.action,
      cmdDay,
      isEn ? "en" : "sl"
    );
    console.log(
      `[itinerary/refine] Prosti ukaz → hitra akcija "${command.action}" (dan ${cmdDay}) — DETERMINISTIČNO (ISSUE #9, 0 LLM): ${result.changes.length} sprememb`
    );
    return runDeterministicMutation(result, {
      action: command.action,
      day: cmdDay,
      logPath: "parser-quick-action",
    });
  }

  // --- 3) Parser: ODSTRANI destinacijo (deterministično, kanon datasetta) ---
  if (command.kind === "remove-place") {
    const dayTarget = command.day ?? null;
    const changes: RefineChange[] = [];
    let removed = 0;
    const days: DayPlan[] = current.days.map((d, i) => {
      if (dayTarget !== null && i + 1 !== dayTarget) return d;
      const locs = d.locations.filter((l) => l.destination_id !== command.placeId);
      if (locs.length === d.locations.length) return d;
      removed += d.locations.length - locs.length;
      changes.push({
        kind: "stop_removed",
        day: i + 1,
        destination_id: command.placeId,
        destination_name: command.placeName,
      });
      return { ...d, locations: locs };
    });
    if (removed === 0) {
      return echoOriginal(
        isEn
          ? `${command.placeName} is not in your current itinerary.`
          : `${command.placeName} ni v trenutnem načrtu.`,
        "parser-remove-place-missing"
      );
    }
    const itinerary = recomputeTotalBudget({ ...current, days });
    return runDeterministicMutation(
      {
        itinerary,
        changes,
        note: isEn
          ? `Removed ${command.placeName} (${removed} stop${removed > 1 ? "s" : ""}).`
          : `Odstranjen postanek ${command.placeName}${removed > 1 ? ` (${removed}×)` : ""}.`,
      },
      {
        action: "remove-place",
        day: dayTarget ?? changes[0]?.day ?? 1,
        logPath: "parser-remove-place",
      }
    );
  }

  // --- 4) Parser: DODAJ destinacijo (deterministično, kanon datasetta) ---
  if (command.kind === "add-place") {
    const dest = DESTINATIONS.find((d) => d.id === command.placeId);
    const alreadyIn = current.days.some((d) =>
      d.locations.some((l) => l.destination_id === command.placeId)
    );
    if (!dest || alreadyIn) {
      return echoOriginal(
        alreadyIn
          ? isEn
            ? `${command.placeName} is already in your itinerary.`
            : `${command.placeName} je že v načrtu.`
          : isEn
            ? `${command.placeName} is not in our destination dataset.`
            : `${command.placeName} ni v našem naboru destinacij.`,
        alreadyIn ? "parser-add-place-duplicate" : "parser-add-place-unknown"
      );
    }
    // Dan: ekspliciten, sicer tisti z najmanj postanki (največ prostora) —
    // popolnoma deterministično iz načrta.
    const dayIdx =
      command.day !== undefined &&
      command.day >= 1 &&
      command.day <= current.days.length
        ? command.day - 1
        : current.days.reduce(
            (best, d, i) =>
              (d.locations?.length ?? 0) < (current.days[best]?.locations?.length ?? 0)
                ? i
                : best,
            0
          );
    const targetDay = current.days[dayIdx];
    // Prost termin: 09:00–13:00 / 14:00–18:00 / 18:00–22:00 (prvi prost;
    // repairScheduleGaps v verigi poravna z realno vožnjo).
    const taken = new Set((targetDay?.locations ?? []).map((l) => l.time_slot));
    const slot =
      ["09:00-13:00", "14:00-18:00", "18:00-22:00"].find((t) => !taken.has(t)) ??
      "14:00-18:00";
    const groupSize = formData?.groupSize ?? 2;
    const tagline = isEn
      ? DESTINATIONS_EN[dest.id]?.tagline ?? dest.tagline
      : dest.tagline;
    const newVisit: LocationVisit = {
      destination_id: dest.id,
      destination_name: dest.name,
      time_slot: slot,
      duration: 4,
      estimated_cost: dest.costPerPerson * groupSize,
      notes: tagline,
    };
    const days: DayPlan[] = current.days.map((d, i) =>
      i === dayIdx ? { ...d, locations: [...d.locations, newVisit] } : d
    );
    const itinerary = recomputeTotalBudget({ ...current, days });
    return runDeterministicMutation(
      {
        itinerary,
        changes: [
          {
            kind: "stop_added",
            day: dayIdx + 1,
            destination_id: dest.id,
            destination_name: dest.name,
          },
        ],
        note: isEn
          ? `Added ${dest.name} to Day ${dayIdx + 1} (${slot}).`
          : `Dodan ${dest.name} v dan ${dayIdx + 1} (${slot}).`,
      },
      {
        action: "add-place",
        day: dayIdx + 1,
        logPath: "parser-add-place",
      }
    );
  }

  // --- 5) NEPODPRT (prepoznan) namen — iskrena odklonitev ---
  if (command.kind === "unsupported") {
    const intentLabels: Record<string, { sl: string; en: string }> = {
      "move-day": { sl: "prestavljanje dni", en: "moving days" },
      "swap-activity": { sl: "zamenjava posamezne aktivnosti", en: "swapping an individual activity" },
      duration: { sl: "sprememba trajanja potovanja", en: "changing trip duration" },
      "party-type": { sl: "sprememba sestave skupine", en: "changing party type" },
      "outdoor-only": { sl: "samo zunanji program", en: "outdoor-only program" },
    };
    const label = intentLabels[command.matchedIntent]?.[isEn ? "en" : "sl"] ?? command.matchedIntent;
    return echoOriginal(
      isEn
        ? `"${label}" is recognized, but deterministic execution does not support it yet. Supported commands: cheaper · pricier · more nature · more food · more active · less driving · slower pace · rain-suitable · family-friendly · add <destination> · remove <destination> · day <n>.`
        : `"${label}" je prepoznan, a deterministična izvedba ga (še) ne podpira. Podprti ukazi: ceneje · dražje · več narave · več hrane · bolj aktivno · manj vožnje · počasnejši tempo · primerno za dež · za družino · dodaj <destinacija> · odstrani <destinacija> · dan <n>.`,
      "parser-unsupported"
    );
  }

  // --- 6) NEPREPOZNAN ukaz — iskrena odklonitev s seznamom (§47) ---
  return echoOriginal(
    isEn
      ? `Command not recognized — the plan is unchanged. Supported commands: cheaper · pricier · more nature · more food · more active · less driving · slower pace · rain-suitable · family-friendly · add <destination> · remove <destination> · day <n>.`
      : `Ukaz ni prepoznan — načrt je nespremenjen. Podprti ukazi: ceneje · dražje · več narave · več hrane · bolj aktivno · manj vožnje · počasnejši tempo · primerno za dež · za družino · dodaj <destinacija> · odstrani <destinacija> · dan <n>.`,
    "parser-unknown"
  );
}
