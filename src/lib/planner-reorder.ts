// ============================================================================
// PRESTAVLJANJE POSTANKA V DNEVU — čista deterministična operacija
// (Issue #5 / T5-D / M7 — drag/drop + puščice)
// ============================================================================
// NAMEN: planner je imel SAMO (a) optimalno zaporedje (optimizeDayOrder) in
// (b) NL "prestavi X na dan 2" (AI). ROČNEGA prestavljanja (drag/drop,
// puščice ↑/↓ — tipkovnica/dotik) ni bilo (vrzel M7, rg draggable = 0).
//
// SEMANTIKA (deterministično zapisana, ogledalo kanona route-order.ts):
//  · postanek se premakne z položaja FROM na položaj TO (array move);
//  · TERMINI so PERMUTACIJA položajev (isti kanon kot optimizeDayOrder):
//    vsi razpoznavni termini dneva se uredijo po začetku in razdelijo po
//    NOVIH položajih — zaporedje ostane kronološko koherentno; kadar
//    KATERIKOLI termin ni razpoznaven, vsak postanek obdrži SVOJEGA
//    (iskrena varovalka, ista kot v route-order.ts);
//  · intentLocked POTUJE s postankom — ročno prestavljanje je IZRECNA
//    uporabnikova namernost (§21: samo SAMODEJNI optimizatorji zamrznejo
//    zaklenjene postanke, uporabnikove roke ne);
//  · invalidacija (ista kot applyOptimalOrder): day.routeGeometry →
//    undefined (OSRM geometrija je vezana na staro zaporedje) +
//    itinerary.quality/geoValidation/legs → undefined (preračun na mestu
//    uporabe, hevristika, odkrito).
//
// Čista funkcija: enak vhod → enak izhod; 0 omrežja; 0 ure; bun-testabilna.
// ============================================================================

import type { Itinerary, DayPlan, LocationVisit } from "./types";

/** Začetni minute termina "HH:MM-HH:MM" (null, če nerazpoznaven). */
function slotStartMinutes(slot: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/**
 * Prestavi postanek z indeksa fromIdx na toIdx v določenem dnevu.
 * Če karkoli ne štima (dan ne obstaja / indeksi izven / from===to),
 * vrne VHODNEKO referenco (no-op — klicatelj lahko vedno zapiše izhod).
 */
export function reorderStopInItinerary(
  it: Itinerary,
  dayNumber: number,
  fromIdx: number,
  toIdx: number
): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  const dayIdx = it.days.findIndex((d) => d.day === dayNumber);
  if (dayIdx < 0) return it;
  const day = it.days[dayIdx];
  const locations = Array.isArray(day.locations) ? day.locations : [];
  if (
    fromIdx === toIdx ||
    fromIdx < 0 ||
    toIdx < 0 ||
    fromIdx >= locations.length ||
    toIdx >= locations.length
  ) {
    return it;
  }

  // Array move (splice kanon — brez mutantiranja vhoda):
  const moved = locations.slice();
  const [stop] = moved.splice(fromIdx, 1);
  moved.splice(toIdx, 0, stop);

  // Termini = PERMUTACIJA položajev (kanon route-order.ts; tu brez zamrzo-
  // vanja — ROČNO prestavljanje je izrecna uporabnikova namernost):
  const slots = locations.map((l) => (l.time_slot ?? "").trim());
  const starts = slots.map((s) => slotStartMinutes(s));
  const allParsed = starts.every((s) => s !== null);
  let nextLocations: LocationVisit[];
  if (allParsed && slots.every((s) => s.length > 0)) {
    const sorted = slots
      .slice()
      .sort((a, b) => (slotStartMinutes(a) ?? 0) - (slotStartMinutes(b) ?? 0));
    nextLocations = moved.map((loc, i) => ({
      ...loc,
      time_slot: sorted[i] || loc.time_slot,
    }));
  } else {
    // Nerazpoznaven katerikoli termin → vsak obdrži svojega (varovalka).
    nextLocations = moved;
  }

  const nextDay: DayPlan = {
    ...day,
    locations: nextLocations,
    // OSRM geometrija je vezana na staro zaporedje — pošteno umaknjena
    // (zemljevid izriše premice; isto kot applyOptimalOrder).
    routeGeometry: undefined,
  };

  const nextDays = it.days.slice();
  nextDays[dayIdx] = nextDay;

  return {
    ...it,
    days: nextDays,
    // Strukturne metrike so bile izračunane za STARO zaporedje — umaknjene,
    // kartice jih preračunajo na mestu uporabe (hevristika, odkrito).
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
}

// ============================================================================
// PRESTAVLJANJE POSTANKA MED DNEVI (Issue #6 / D6-B — M7+ zaključek)
// ============================================================================
// NAMEN: ročno prestavljanje je bilo omejeno na ZNOTRAJ dneva (↑/↓ + drag);
// med dnevi je bilo možno SAMO prek NL ukaza AI („prestavi X na dan 2").
// Ta operacija je čista, deterministična (0 AI, 0 omrežja) razširitev istega
// kanona.
//
// SEMANTIKA:
//  · postanek se odstrani iz IZVORNEGA dneva in PRIPNE NA KONEC ciljnega
//    (priloga na konec je izrecna — termini se NE prerazporejajo, ker
//    ciljni dan ima svojo kronologijo; toast opomni, da preveri vrstni red);
//  · postanek obdrži VSA svoja polja (tudi intentLocked — §21 ročna
//    namernost potuje z uporabnikovim postankom, isto kot znotraj dneva);
//  · invalidacija: routeGeometry OBEH dotaknjenih dni (geometrija je vezana
//    na staro sestavo postankov) + itinerary.quality/geoValidation/legs
//    (kanon applyOptimalOrder).
// ============================================================================

/**
 * Prestavi postanek iz dneva dayNumber (indeks stopIndex) v ciljni dan
 * targetDayNumber — prine NA KONEC njegovih postankov, z vsemi polji
 * (tudi intentLocked). Termini ciljnega dneva se ne prerazporejajo.
 *
 * Varovalke (vračajo VHODNO referenco — no-op, klicatelj lahko vedno
 * zapiše izhod): ciljni dan ne obstaja, target === source dan, izvor ne
 * obstaja, indeks izven meja.
 */
export function moveStopToDay(
  it: Itinerary,
  dayNumber: number,
  stopIndex: number,
  targetDayNumber: number
): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  if (targetDayNumber === dayNumber) return it;
  const dayIdx = it.days.findIndex((d) => d.day === dayNumber);
  if (dayIdx < 0) return it;
  const targetIdx = it.days.findIndex((d) => d.day === targetDayNumber);
  if (targetIdx < 0) return it; // ciljni dan ne obstaja (meja / luknja)

  const day = it.days[dayIdx];
  const target = it.days[targetIdx];
  const locations = Array.isArray(day.locations) ? day.locations : [];
  const targetLocations = Array.isArray(target.locations)
    ? target.locations
    : [];
  if (stopIndex < 0 || stopIndex >= locations.length) return it;

  // Array move brez mutantiranja vhoda (splice kanon):
  const moved = locations.slice();
  const [stop] = moved.splice(stopIndex, 1);

  // Izgorni dan: krajši seznam; geometrija je vezana na staro sestavo.
  const sourceDay: DayPlan = {
    ...day,
    locations: moved,
    routeGeometry: undefined,
  };
  // Ciljni dan: postanek PRIPNEM na konec (vsa polja + intentLocked potujejo
  // z njim — nikoli ne delamo kopije z izgubljenimi polji):
  const nextTargetDay: DayPlan = {
    ...target,
    locations: [...targetLocations, stop],
    routeGeometry: undefined,
  };

  const nextDays = it.days.slice();
  nextDays[dayIdx] = sourceDay;
  nextDays[targetIdx] = nextTargetDay;

  return {
    ...it,
    days: nextDays,
    // Strukturne metrike so bile izračunane za STARO sestavo — umaknjene,
    // kartice jih preračunajo na mestu uporabe (hevristika, odkrito).
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
}

// ============================================================================
// PRESTAVLJANJE POSTANKA MED DNEVI Z VLEČENJEM (Issue #13 / P0-1 / G1 —
// UX BENCHMARK 2026: cross-day drag & drop, Wanderlog/Mindtrip vzorec)
// ============================================================================
// NAMEN: drag & drop je bil (M7 + D6-B) omejen na ZNOTRAJ dneva; med dnevi
// sta obstajala SAMO puščici (prejšnji/naslednji dan) in NL ukaz. Vrzel G1
// benchmarka je MIŠKO vlečenje postanka na DRUG dan — ta čista funkcija je
// drag dvojnik moveStopToDay (ISTI kanon invalidacije, ista varovalna
// slovnika no-op vračil).
//
// SEMANTIKA (ogledalo D6-B + kanon termina chat-add 1.42.0):
//  · postanek se odstrani iz IZVORNEGA dneva in vstavi na toIdx v CILJNI
//    dan (toIdx ≥ dolžina cilja → priloga na konec — primarni drag UX:
//    spust kjerkoli na dnevu pomeni „na konec tega dneva");
//  · TERMIN prestavljenega postanka se PRERAČUNA po kanonu chat-add 1.42.0
//    (appendSlotAfter): nov termin začne po koncu PREDHODNIKA v ciljnem
//    dnevu (+30 min premora, najkasneje 23:30 konec, sloti se NIKOLI ne
//    prekrivajo). Pri vstavitvi na sredino se konec prilagodi pred
//    NASLEDVNIKA; če vrzel ne zadošča (≤30 min), postanek pošteno obdrži
//    SVOJEGA (varovalka — ne stlačimo termina). Trajanje se prebere iz
//    postankovega termina (nerazpoznaven → 2 h, kanon povprečnega obiska);
//  · VSA ostala polja potujejo (intentLocked — §21 ročna namernost);
//  · termini OSTALIH postankov ciljnega dneva se NE prerazporejajo
//    (kronologija cilja ostane — isti kanon kot D6-B moveStopToDay);
//  · invalidacija: routeGeometry OBEH dni + itinerary.quality/
//    geoValidation/legs (kanon applyOptimalOrder / moveStopToDay).
//
// Čista funkcija: enak vhod → enak izhod; 0 omrežja; 0 ure; bun-testabilna.
// ============================================================================

/** Začetek termina "HH:MM-HH:MM" v urah (null, če nerazpoznaven). */
function slotStartHours(slot: string): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

/** Konec termina "HH:MM-HH:MM" v urah (null, če nerazpoznaven). */
function slotEndHours(slot: string): number | null {
  const m = /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!m) return null;
  const h = Number(m[3]);
  const min = Number(m[4]);
  if (h > 23 || min > 59) return null;
  return h + min / 60;
}

/** Trajanje termina v urah (null, če nerazpoznaven ali nestreten). */
function slotDurationHours(slot: string): number | null {
  const m = /(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})/.exec(slot.trim());
  if (!m) return null;
  const start = Number(m[1]) + Number(m[2]) / 60;
  const end = Number(m[3]) + Number(m[4]) / 60;
  if (end <= start) return null;
  return end - start;
}

/** Ura "H" → "HH:MM" (kanon chat-add 1.42.0 appendSlotAfter). */
function formatSlot(h: number): string {
  const hh = Math.min(23, Math.floor(h));
  const mm = Math.round((h - Math.floor(h)) * 60);
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

/**
 * Nov termin za VLEČENI postanek po kanonu chat-add (1.42.0): začne po
 * predhodniku (+0,5 h premora). Vrne null, če termin ne gre pošteno v vrzel
 * — klicatelj potem obdrži postankov SVOJ termin (varovalka, isti kanon
 * kot znotraj-dnevni ročni prestavki: ne stlačimo termina samodejno).
 *
 *  · brez predhodnika in nasledvnika (prazen ciljni dan): večerni termin
 *    19:00+ (kanon chat-add za prazen dan; obreznitev ob 23:30 zamakne
 *    start — sloti se nikoli ne prekrivajo);
 *  · ČISTA PRILOGA na konec (s predhodnikom, brez nasledvnika): kanon
 *    appendSlotAfter dobesedno — start = max(predhodnikov konec + 0,5 h,
 *    12), konec najkasneje 23:30, obreznjen konec zamakne start;
 *  · VSTAVITEV NA SREDINO (z nasledvnikom): termin mora pasti V CELOTI
 *    (začetek 9:00 brez predhodnika / predhodnikov konec + 0,5 h; konec
 *    strogo pred nasledvnikovim začetkom) — sicer null (varovalka;
 *    2 h postanek v 30 min vrzeli bi bil zavajajoč).
 */
function draggedSlotAfter(
  predecessor: LocationVisit | undefined,
  successor: LocationVisit | undefined,
  durationH: number
): string | null {
  const prevEnd = predecessor
    ? slotEndHours(predecessor.time_slot ?? "")
    : null;
  const nextStart = successor
    ? slotStartHours(successor.time_slot ?? "")
    : null;

  // Brez predhodnika: prazen dan → večer (chat-add); začetek dneva → 9:00.
  let start: number;
  if (prevEnd != null) {
    start = successor ? prevEnd + 0.5 : Math.max(prevEnd + 0.5, 12);
  } else {
    start = successor ? 9 : 19;
  }

  let end = Math.min(23.5, start + durationH);
  if (!successor) {
    // Čista priloga na konec (chat-add kanon): obreznjen konec zamakne
    // start — tudi obrezan slot NIKOLI ne prekriva predhodnika.
    if (end < start + durationH) {
      start = Math.max(start, end - durationH);
    }
  } else {
    // Vstavitev na sredino: NE prekrivaj nasledvnika in NE stlači termina —
    // vrzel mora sprejeti CELOTNO trajanje, sicer varovalka (null).
    if (nextStart != null && end > nextStart) return null;
  }
  // Vrzel, ki ne zadošča (≤ 0,5 h) → null (klicatelj obdrži svoj termin).
  if (end - start < 0.5) return null;
  return `${formatSlot(start)}-${formatSlot(end)}`;
}

/**
 * Prestavi postanek iz dneva fromDay (indeks fromIdx) v ciljni dan toDay na
 * položaj toIdx (toIdx ≥ dolžina cilja → priloga na konec). Termin vlečenega
 * postanka se preračuna po kanonu chat-add 1.42.0 („za zadnjim postankom");
 * vsa ostala polja (tudi intentLocked) potujejo; termini ostalih postankov
 * cilja se ne prerazporejajo; invalidacija obeh dni + strukturnih metrik.
 *
 * Varovalke (vračajo VHODNO referenco — no-op): cilj/izvor ne obstaja,
 * target === source, indeks izven meja.
 */
export function moveStopAcrossDays(
  it: Itinerary,
  fromDay: number,
  fromIdx: number,
  toDay: number,
  toIdx: number
): Itinerary {
  if (!it || !Array.isArray(it.days)) return it;
  if (toDay === fromDay) return it; // isti dan → znotraj-dnevni kanon (M7)
  const dayIdx = it.days.findIndex((d) => d.day === fromDay);
  if (dayIdx < 0) return it;
  const targetIdx = it.days.findIndex((d) => d.day === toDay);
  if (targetIdx < 0) return it; // ciljni dan ne obstaja (meja / luknja)

  const day = it.days[dayIdx];
  const target = it.days[targetIdx];
  const locations = Array.isArray(day.locations) ? day.locations : [];
  const targetLocations = Array.isArray(target.locations)
    ? target.locations
    : [];
  if (fromIdx < 0 || fromIdx >= locations.length) return it;

  // Vstavitveni položaj v cilju (negativen/prehoden → varovalka no-op,
  // prevelik → priloga na konec — primarni drag UX):
  if (toIdx < 0) return it;
  const insertAt = Math.min(toIdx, targetLocations.length);

  // Array move brez mutantiranja vhoda (splice kanon):
  const movedSource = locations.slice();
  const [stop] = movedSource.splice(fromIdx, 1);

  // Termin vlečenega postanka — kanon chat-add 1.42.0 (glej zgoraj):
  const duration = slotDurationHours(stop.time_slot ?? "") ?? 2;
  const newSlot = draggedSlotAfter(
    insertAt > 0 ? targetLocations[insertAt - 1] : undefined,
    insertAt < targetLocations.length
      ? targetLocations[insertAt]
      : undefined,
    duration
  );
  const stopWithSlot: LocationVisit =
    newSlot != null ? { ...stop, time_slot: newSlot } : stop;

  // Izgorni dan: krajši seznam; geometrija je vezana na staro sestavo.
  const sourceDay: DayPlan = {
    ...day,
    locations: movedSource,
    routeGeometry: undefined,
  };
  // Ciljni dan: postanek vstavljen na položaj (vsa polja + intentLocked
  // potujejo z njim — nikoli ne delamo kopije z izgubljenimi polji):
  const nextTargetLocations = targetLocations.slice();
  nextTargetLocations.splice(insertAt, 0, stopWithSlot);
  const nextTargetDay: DayPlan = {
    ...target,
    locations: nextTargetLocations,
    routeGeometry: undefined,
  };

  const nextDays = it.days.slice();
  nextDays[dayIdx] = sourceDay;
  nextDays[targetIdx] = nextTargetDay;

  return {
    ...it,
    days: nextDays,
    // Strukturne metrike so bile izračunane za STARO sestavo — umaknjene,
    // kartice jih preračunajo na mestu uporabe (hevristika, odkrito).
    quality: undefined,
    geoValidation: undefined,
    legs: undefined,
  };
}
