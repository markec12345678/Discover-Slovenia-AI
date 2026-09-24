/**
 * DETERMINISTIČNI MOTOR ITINERERJA (TASK 100 / TASK 99 na GitHubu)
 * ============================================================================
 *
 * Izvleček iz /api/itinerary/route.ts, kjer je ta logika živela kot
 * "fallback generator" (dosegljiv SAMO ob odpovedi AI). Naloga TASK 99
 * ("odstrani odvisnost od generativnega AI modela, kjer ni potreben") ga
 * dviguje v FIRST-CLASS motor: PlannerInput.engine = "deterministic"
 * pokliče TOLE pot NARAVNO (0 LLM žetonov), ne kot rezervo.
 *
 * Cevovod (brez generativnega modela, 100 % reproducibilno):
 *   strukturiran vnos → sezonski filter → zaprtja (F5.5) →
 *   ocena interesov (+2,5 za željene) → deževna logika (WEATHER-CONTEXT) →
 *   geografsko urejanje okoli FIXED sidrov (TASK 51) →
 *   drive-aware sloti (TASK 50) → dnevni načrti → Itinerary.
 *
 * Čistost modula (testno varovana, glej task100-deterministic-engine.test):
 *   - NI uvozov ai-client / z-ai-web-dev-sdk / generateCompletion
 *   - NI omrežja, NI baze, NI ure (Date.now / Math.random)
 *   - isti vhod (+ isti sidrni podatki) → bitno-identičen izhod
 */

import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import { PACE_FALLBACK } from "@/lib/pace-types";
import { nextSlot, type SlotCursor } from "@/lib/schedule-slots";
import { parseISODateLocal } from "@/lib/trip-dates";
import { orderAroundAnchors, type GeoOrderAnchor } from "@/lib/geo-order";
import type { DailyForecast } from "@/lib/weather-utils";
import type {
  DestinationOpening,
  Itinerary,
  PlannerInput,
  DayPlan,
  LocationVisit,
} from "@/lib/types";

// ============================================================================
// VREMENSKI SIDRI (tip — definicije/klici ostajajo v route; tu samo oblika)
// ============================================================================

export interface AnchorForecast {
  /** SL oznaka regije za prompt */
  label: string;
  /** EN oznaka regije za prompt */
  labelEn: string;
  forecast: DailyForecast[];
}

/**
 * Deževen dan za deterministični motor: večina sidra (≥ 2 od tistih s
 * podatki) kaže ≥ 60 % verjetnost padavin. Konservativno — motor ne pozna
 * regije dneva, zato preureja samo izrazito mokre dneve.
 */
export function isRainyDay(anchors: AnchorForecast[], dayIndex: number): boolean {
  const withData = anchors.filter((a) => a.forecast[dayIndex]);
  if (withData.length < 2) return false;
  const rainy = withData.filter(
    (a) => (a.forecast[dayIndex].precipitationProbabilityMax ?? 0) >= 60
  ).length;
  return rainy >= 2;
}

// ============================================================================
// ISSUE #4 §10 (VAL 4, 1.96.0) — DETERMINISTIČNA PERSONALIZACIJA
// ============================================================================
// Naročnik: "Če je odločitev mogoče sprejeti deterministično, ne sme
// zahtevati LLM." Trije domeni, ki so bili prej SAMO v AI promptu, so zdaj
// ČISTE funkcije motorja (0 žetonov, 0 omrežja, popolnoma reproducibilne):
//   1. BUDGET — dnevni proračun vpliva na IZBOR postankov (ne samo post-hoc
//      validacija);
//   2. PARTY TYPE — pohostnitev nad bestFor (prej prompt pravilo 13);
//   3. TEDENSKA ZAPRTJA — zaprtje destinacije na ravni dneva-v-tednu jo
//      izloči iz bazena (isted logika kot mesečna zaprtja F5.5).
// ============================================================================

/** Pohostnitve partyType nad bestFor oznakami (kanonski podatki — nikoli
 *  izmišljene ustreznosti). Družina → družini prijazno, par → romantika,
 *  prijatelji → avantura/adrenalin, sam → mir/sprostitev.
 *  Vrednosti so NAMERNO pod 1,0 (ena zadetek interesa = 1,0): partyType je
 *  REFINAMENT vrstnega reda, NIKOLI dominator nad uporabnikovimi interesi
 *  ( test: interesi smučanje/pohodništvo + family → interesi zmagajo). */
const PARTY_TYPE_BOOST: Record<
  NonNullable<PlannerInput["partyType"]>,
  Record<string, number>
> = {
  family: { "družina": 0.75 },
  couple: { "romantika": 0.5 },
  friends: { "avantura": 0.4, "adrenalin": 0.4 },
  solo: { "mir": 0.4, "sprostitev": 0.4 },
};

/** Minimalna oblika destinacije za izračun tedenskih zaprtij (čista
 *  funkcija — testabilna s sintetičnimi vnosi). */
export interface WeekdayClosureInput {
  id: string;
  opening?: DestinationOpening;
}

/** ISSUE #4 §10: dnevi-v-tednu, ko je DESTINACIJA (closureLevel
 *  "destination") zaprta med potovanjem → izločijo se iz bazena.
 *  mainAttraction zaprtja NE izločajo (mesto je odprto — validator pošteno
 *  opozori WARN, enako kot pri mesečnih zaprtjih). Deterministično iz
 *  startDate + dolžine poti (0 ure — parseISODateLocal je čist). */
export function weekdayClosedIds(
  destinations: readonly WeekdayClosureInput[],
  startDate: string | undefined,
  days: number
): Set<string> {
  const closed = new Set<string>();
  if (!startDate) return closed;
  const startMs = parseISODateLocal(startDate);
  if (startMs === null) return closed;
  // Dnevi-v-tednu celotne poti (JS getDay: 0=ned … 6=sob)
  const weekdays = new Set<number>();
  for (let i = 0; i < days; i++) {
    weekdays.add(new Date(startMs + i * 86400000).getDay());
  }
  for (const d of destinations) {
    const opening = d.opening;
    if (
      opening?.closureLevel === "destination" &&
      opening.closedWeekdays?.some((w) => weekdays.has(w))
    ) {
      closed.add(d.id);
    }
  }
  return closed;
}

// ============================================================================
// DETERMINISTIČNI GENERATOR
// ============================================================================

// WEATHER-CONTEXT: če so na voljo realne sidrne napovedi (samo z datumom
// odhoda znotraj prognoznega horizonta), deževni dnevi — večina sidra
// ≥ 60 % verjetnosti padavin — dobijo prednostno NOTRANJE/prilagodljive
// destinacije (jame, terme, mestna jedra). Razvrstitev izhaja IZ tipa
// destinacije v slovenia-data — poštena, deterministična, brez izmišljenih
// statusov. Brez napovedi je zaporedje izbire IDENTIČNO.
const INDOOR_TYPES = new Set(["cave", "spa", "city"]);

export interface DeterministicEngineOptions {
  /**
   * Označka vira na izhodnem itinererju:
   *  - "deterministic" — uporabnik je IZRECNO zahteval deterministični motor
   *    (PlannerInput.engine; TASK 100)
   *  - "fallback" — isti motor, dosežen ob odpovedi AI (iskrena degradacija;
   *    dosedanja semantika, nespremenjena zaradi analitike/testov)
   */
  source?: "deterministic" | "fallback";
}

/**
 * Deterministični itinerer iz kanonskih podatkov (0 AI žetonov).
 *
 * WEATHER-CONTEXT: če so na voljo realne sidrne napovedi (samo z datumom
 * odhoda znotraj prognoznega horizonta), deževni dnevi — večina sidra
 * ≥ 60 % verjetnosti padavin — dobijo prednostno NOTRANJE/prilagodljive
 * destinacije (jame, terme, mestna jedra). Razvrstitev izhaja IZ tipa
 * destinacije v slovenia-data — poštena, deterministična, brez izmišljenih
 * statusov. Brez napovedi je zaporedje izbire IDENTIČNO prejšnjemu.
 *
 * Prej znano kot generateFallbackItinerary (route.ts) — logika nespremenjena,
 * samo izvlečena v čist modul + parametriziran source (TASK 100).
 */
export function generateDeterministicItinerary(
  input: PlannerInput,
  anchors: AnchorForecast[] = [],
  geoAnchors: GeoOrderAnchor[] = [],
  opts: DeterministicEngineOptions = {}
): Itinerary {
  const source = opts.source ?? "fallback";
  // P4-8 (EN-fallback fix): jezik vsega determinističnega besedila — prej
  // je izpisoval slovensko tudi za EN uporabnike (mešanje jezikov)
  const isEn = input.language === "en";
  const taglineOf = (d: (typeof DESTINATIONS)[number]): string =>
    isEn ? (DESTINATIONS_EN[d.id]?.tagline ?? d.tagline) : d.tagline;

  // TASK 62: PRIVZETI bazen ostane SLOVENSKI (znamba platforme + geo-koherentna
  // sidra TASK 51). Regionalne destinacije (HR/ME/AL) vstopijo SAMO z izrecna
  // uporabnikovo željo (preferredDestinations) — čezmejno potovanje je
  // premišljena odločitev, ne naključje ocenjevalnika (G5-1 dokaz: mešan
  // bazen bi sestavil Ljubljana→Tirana noge in razbil ≤60 km koherenco).
  const preferredRegional = new Set(
    (input.preferredDestinations ?? []).filter((id) =>
      DESTINATIONS.some((d) => d.id === id && d.country !== "SI")
    )
  );
  const inDefaultPool = (d: (typeof DESTINATIONS)[number]) =>
    d.country === "SI" || preferredRegional.has(d.id);

  // Filtriraj sezonsko ustrezne destinacije
  const suitable = DESTINATIONS.filter(
    (d) => inDefaultPool(d) && d.bestSeason.includes(input.season)
  );
  const pool =
    suitable.length >= input.days * 2
      ? suitable
      : DESTINATIONS.filter(inDefaultPool);

  // F5.5 ( odpiralni časi): če je datum odhoda znan, mesečno zaprtje na
  // ravni DESTINACIJE ( Vintgar nov–mar) izloči destinacijo iz bazena —
  // deterministično PREPREČIMO neizvedljiv postanek, ne zgolj opozorimo.
  // Zaprtje na ravni ATRAKCIJE ( Ptujski grad ob ponedeljkih) NE izloča —
  // mesto je odprto, validator pošteno opozori (WARN) glede dneva.
  const closedInTripMonths = new Set<string>();
  if (input.startDate) {
    const startMs = parseISODateLocal(input.startDate);
    if (startMs !== null) {
      const months = new Set<number>();
      for (let i = 0; i < input.days; i++) {
        months.add(new Date(startMs + i * 86400000).getMonth() + 1);
      }
      for (const d of DESTINATIONS) {
        if (
          d.opening?.closureLevel === "destination" &&
          d.opening.closedMonths?.some((m) => months.has(m))
        ) {
          closedInTripMonths.add(d.id);
        }
      }
    }
  }
  const openPool = closedInTripMonths.size > 0
    ? pool.filter((d) => !closedInTripMonths.has(d.id))
    : pool;
  // Če bi s filtrom ostalo premalo ( robn primer), ostane izvorni pool —
  // validator tak načrt pošteno označi ( ERROR) in refine ga lahko popravi.
  const effectivePool = openPool.length >= input.days ? openPool : pool;

  // ISSUE #4 §10 (VAL 4): TEDENSKA ZAPRTJA (dnevi-v-tednu) — enaka
  // fail-closed logika kot mesečna zaprtja zgoraj: destinacija, zaprta na
  // ravni "destination" na dan potovanja, se iz bazena IZLOČI ( Glej
  // weekdayClosedIds — čista funkcija, testabilna). mainAttraction zaprtja
  // ( Ptujski grad ob ponedeljkih) NE izločajo — mesto je odprto, geo
  // validator pošteno opozori WARN glede dneva.
  const closedOnTripWeekdays = weekdayClosedIds(
    DESTINATIONS,
    input.startDate,
    input.days
  );
  const weekdayOpenPool =
    closedOnTripWeekdays.size > 0
      ? effectivePool.filter((d) => !closedOnTripWeekdays.has(d.id))
      : effectivePool;
  const finalPool =
    weekdayOpenPool.length >= input.days ? weekdayOpenPool : effectivePool;

  // Ocenjevalnik: ujemanje interesov + F5.4 pohitritev za izrecno zaželene
  // destinacije ( iz prilepljene povezave — "Start Anywhere"). Pohitritev
  // ( +2,5) dominira nad oceno/všečnostjo, a NE nad sezonskim filtrom in
  // deževno-logiko — vreme in sezona ostajata iskreni prednost.
  // ISSUE #4 §10 (VAL 4): + partyType pohostnitev nad bestFor (prej SAMO
  // AI prompt pravilo 13 — zdaj deterministično, enako za oba motorja
  // poti). Skromne vrednosti: interesi uporabnika ostanejo glavna sila.
  const partyBoost = input.partyType ? PARTY_TYPE_BOOST[input.partyType] : null;
  const score = (d: (typeof DESTINATIONS)[number]) =>
    d.bestFor.filter((b) => input.interests.includes(b)).length +
    d.rating / 10 +
    (input.preferredDestinations?.includes(d.id) ? 2.5 : 0) +
    (partyBoost
      ? d.bestFor.reduce((sum, b) => sum + (partyBoost[b] ?? 0), 0)
      : 0);

  const ranked = [...finalPool].sort((a, b) => score(b) - score(a));
  const indoor = ranked.filter((d) => INDOOR_TYPES.has(d.type));

  // ISSUE #4 §10 (VAL 4): BUDGET-AWARE IZBIRA. Dnevni proračun (skupinski
  // znesek — ISTA semantika kot computeBudgetValidation: cena postanka =
  // costPerPerson × groupSize) vpliva DETERMINISTIČNO na izbor:
  //  - najprej cenovno dosegljivi kandidati (dayCost ≤ preostanek dneva);
  //  - če ni dosegljivih → NAJCENEJŠI neizrabljen kandidat (iskreno —
  //    načrt preseže, budgetValidation ga označi; NE skrivamo stroškov
  //    in NE pišemo lažnih €0);
  //  - brez proračuna (0/negativen) → zaporedje IDENTIČNO prejšnjemu.
  const dailyBudget =
    Number.isFinite(input.budget) && input.budget > 0
      ? input.budget / input.days
      : null;
  const dayCost = (d: (typeof DESTINATIONS)[number]) =>
    d.costPerPerson * input.groupSize;

  // Zaporedni izbor z razstrupljanjem (brez vremena: isto zaporedje kot prej)
  const used = new Set<string>();
  const pickDest = (
    preferred: typeof ranked,
    remainingBudget: number | null
  ) => {
    // 1) cenovno dosegljivi iz prednostnega niza (ocena še vedno odloča)
    const affordable =
      remainingBudget == null
        ? preferred
        : preferred.filter((d) => dayCost(d) <= remainingBudget);
    if (affordable.length > 0) {
      for (const d of affordable) {
        if (!used.has(d.id)) {
          used.add(d.id);
          return d;
        }
      }
    }
    if (remainingBudget == null) {
      // brez proračuna: PRVOTNA logika (bitno-identična prejšnji)
      // primarna zalogovnica izčrpana → splošni niz po vrsti
      for (const d of ranked) {
        if (!used.has(d.id)) {
          used.add(d.id);
          return d;
        }
      }
    } else {
      // 2) dosegljivi iz splošnega niza — NAJCENEJŠI (deterministično:
      // cena, nato vrstni red niza)
      const affordableRanked = ranked.filter(
        (d) => dayCost(d) <= remainingBudget && !used.has(d.id)
      );
      if (affordableRanked.length > 0) {
        const cheapest = [...affordableRanked].sort(
          (a, b) => dayCost(a) - dayCost(b)
        )[0];
        used.add(cheapest.id);
        return cheapest;
      }
      // 3) NIČ dosegljivega → najcenejši neizrabljen sploh (iskren presežek;
      //    budgetValidation pošteno označi exceeded — nikoli lažni €0)
      const unused = ranked.filter((d) => !used.has(d.id));
      if (unused.length > 0) {
        const cheapest = [...unused].sort(
          (a, b) => dayCost(a) - dayCost(b)
        )[0];
        used.add(cheapest.id);
        return cheapest;
      }
    }
    // vse porabljene → reset (zaporedje ostaja deterministično)
    used.clear();
    const d = ranked[0];
    if (d) used.add(d.id);
    return d;
  };

  const days: DayPlan[] = [];
  let totalCost = 0;

  // F15 (backlog #3): gostota dneva iz tempa potovanja — slow → 2 × 5 h,
  // balanced → 2 × 4 h (dosedanji izpis, nespremenjeno), fast → 3 × 3 h.
  // Deterministično: isti vhod → isti načrt (0 AI žetonov).
  const pacePlan = PACE_FALLBACK[input.pace ?? "balanced"];

  // ------------------------------------------------------------------
  // TASK 51 (§6/§7) — FAZA 1: IZBIRA postankov (POPOLNOMA enaka prejšnji
  // logiki: ocena interesov, sezonski filter, zaprtja, deževni dnevi →
  // notranji). Spremeni se SAMO VRSTNI RED (faza 2) — izbira ostaja
  // iskrena in reveribilno enaka TASK 50.
  // ------------------------------------------------------------------
  const rainyByDay: boolean[] = [];
  const daySetDests: (typeof DESTINATIONS)[number][][] = [];
  for (let day = 1; day <= input.days; day++) {
    const rainy = isRainyDay(anchors, day - 1);
    rainyByDay.push(rainy);
    const set: (typeof DESTINATIONS)[number][] = [];
    // §10: dnevni proračun se OBNOVLJA z vsakim dnem (isti znesek na dan;
    // neporabljeni del se NE prenaša — preprosto in deterministicno)
    let remainingToday = dailyBudget;
    for (let i = 0; i < pacePlan.stopsPerDay; i++) {
      const pick = pickDest(rainy ? indoor : ranked, remainingToday);
      set.push(pick);
      if (remainingToday != null && pick) {
        remainingToday = Math.max(0, remainingToday - dayCost(pick));
      }
    }
    daySetDests.push(set);
  }

  // ------------------------------------------------------------------
  // TASK 51 (§6/§7) — FAZA 2: GEOGRAFSKO UREJANJE (deterministično, brez
  // omrežja). VZROK TASK 50 P2 (dokazan repro): obiskovali smo destinacije
  // V VRSTNEM REDU PO OCENI (B2 1115 km / B3 1650 km cik-cak — realne OSRM
  // noge). Sidra: VERIFICIRANE FIXED izbire (vrstni red izbire — §8 F2) +
  // uporabniško željene destinacije, ki so RES izbrane. Haversine je tu
  // IZKLJUČNO hevristika urejanja — realne noge/urnik ostanejo OSRM +
  // repairScheduleGaps (Task 50). Vremenski bloki ohranijo notranje nabori
  // na svojih dneh (iskrenost deževne logike).
  // ------------------------------------------------------------------
  const poolIndexById = new Map(
    DESTINATIONS.map((d, i) => [d.id, i] as const)
  );
  // SIDRA = SAMO VERIFICIRANE FIXED izbire (vrstni red izbire — §8 F2).
  // Željene destinacije (preferredDestinations) NISO urejevalna sidra:
  // +2,5 pohitritev izbire (obstoječe) jih zajamči v nabor, njihova
  // umeščanje pa zaupa NN/verigi — vhodni VRSTNI RED želja NIMA geografske
  // semantike (adversarialni dokaz G-A3: sidranje po vhodnem redu bi
  // prisililo NW → NE → NW vračanje, kar §4 izrecno prepoveduje).
  const orderedSets = orderAroundAnchors({
    daySets: daySetDests.map((set) =>
      set.map((d) => ({
        id: d.id,
        lat: d.coords.lat,
        lng: d.coords.lng,
        poolIndex: poolIndexById.get(d.id) ?? 0,
      }))
    ),
    rainyDays: rainyByDay,
    anchors: geoAnchors,
  });
  const destById = new Map(
    DESTINATIONS.map((d) => [d.id, d] as const)
  );

  // FAZA 3: IZGRADNJA — sloti/cene/zapiski (ISTA logika kot prej, samo nad
  // UREJENIMI nabori; vsi invarianti Task 48/49/50 ostajajo netaknjeni).
  for (let day = 1; day <= input.days; day++) {
    const rainy = rainyByDay[day - 1] ?? false;
    const locations: LocationVisit[] = [];

    // TASK 50 (§14, P1 — drive-aware sloti): prej fiksni ritem 09:00/14:00
    // (vrzel TOČNO 1 h) neodvisno od vožnje — geo validacija je upravičeno
    // sprožila schedule_gap ERROR (14/19 scenarijev harnessa). Zdaj: začetek
    // vsakega termina = max(ritem, prejšnji konec + konzervativna vožnja +
    // 30 min), zaokroženo navzgor (glej src/lib/schedule-slots.ts).
    let slotCursor: SlotCursor = { prevEndH: null, prevCoords: null };

    const ordered = orderedSets[day - 1] ?? [];
    for (let i = 0; i < ordered.length; i++) {
      const dest = destById.get(ordered[i].id);
      if (!dest) continue; // nedosegljivo (izbira vedno iz DESTINATIONS)
      const cost = dest.costPerPerson * input.groupSize;
      totalCost += cost;
      const { label: timeSlot, cursor } = nextSlot(
        slotCursor,
        { lat: dest.coords.lat, lng: dest.coords.lng },
        9 + i * pacePlan.spacingHours,
        pacePlan.durationHours
      );
      slotCursor = cursor;
      locations.push({
        destination_id: dest.id,
        destination_name: dest.name,
        time_slot: timeSlot,
        duration: pacePlan.durationHours,
        estimated_cost: cost,
        // Deževen dan: transparenten razlog notranje izbire (resnična
        // večinska napoved sidr — ne izmišljen status); P4-8: EN različica
        notes: rainy
          ? `${taglineOf(dest)} — ${isEn ? "rainy day, so an indoor/flexible pick" : "deževen dan, zato notranja/prilagodljiva izbira"}`
          : taglineOf(dest),
      });
    }

    days.push({
      day,
      locations,
      // OPOMBA: sezonska ocena vremena (zima → sneg, sicer sončno) je
      // poštena GRACEFUL FALLBACK — uporabi se SAMO, če Open-Meteo ni
      // dosegljiv (glej enrichWithRealWeather v route, ki jo sicer prepiše
      // z realno prognozo). Ni več lažna "dnevna" napoved, ampak izrecno
      // sezonsko povprečje.
      // TASK 4 / K-2: weatherEstimated=true pomeni, da to NI realna napoved —
      // enrichWithRealWeather ga ob uspehu preklopi na realnega (false);
      // TrustLine na podlagi tega ne izriše "✓ Vreme preverjeno".
      weather: { condition: input.season === "winter" ? "sneg" : "sončno", temp: input.season === "winter" ? 2 : 22 },
      weatherEstimated: true,
    });
  }

  return {
    days,
    total_budget: totalCost,
    recommendations: isEn
      ? [
          "Book accommodation at least 2 weeks ahead",
          "Download an offline map for hiking",
          "Bring water bottles — tap water is drinkable everywhere",
        ]
      : [
          "Rezerviraj nastanitev vsaj 2 tedna vnaprej",
          "Prenesi offline zemljevid za pohode",
          "Vzemi plastenke za vodo — pitna voda je povsod",
        ],
    tips: isEn
      ? [
          "Start early in the morning for fewer crowds and better light",
          "Check the mountain weather on the day itself",
          "Local shops have the best prices for snacks",
        ]
      : [
          "Začni zgodaj zjutraj za manj ljudi in boljšo svetlobo",
          "V gorah preveri vreme isti dan",
          "Lokalni marketi imajo najboljše cene za prigrizke",
        ],
    source,
  };
}
