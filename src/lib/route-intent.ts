import type { Itinerary, LocationVisit } from "@/lib/types";

// ============================================================================
// ISSUE #4 §21 (VAL 6) — OZNAČEVANJE NAMERNOSTI POSTANKOV (strežniško)
// ============================================================================
//
// Zahteva §21: "Posebej preveri, da optimizacija NE uniči uporabnikovega
// NAMERNEGA vrstnega reda." Optimizator (route-order.ts optimizeDayOrder)
// je ČIST in NE VE, kateri postanki so uporabnikova izrecna želja — ta
// modul je edini vir te resnice:
//
//   1. FIXED izbire z zemljevida ponudbe (selectedProviderProducts,
//      selectionState "fixed" — strežnik jih pozna na /api/itinerary iz
//      VERIFICIRANE izbire, Task 49; v načrtu živijo kot postanki z
//      destination_id "provider:productId");
//   2. uporabniku dodani supply postanki (category "supply" — insertProduct
//      stop-insert.ts) oz. postanki s konkretnim izdelkom (booking_provider
//      — tudi AI odmev FIXED izbire, ki ga Task 48 popravi do produkta).
//
// Oznaka intentLocked: true potem potuje Z načrtom (JSON blob) do klienta,
// kjer gumb "Optimalno zaporedje" zamrzne te postanke (pozicija + termin).
// Starim shranjenim načrtom brez oznake se NE dodaja retroaktivno nobena
// ločena resnica — vsi njihovi postanki ostanejo prosti (nazaj kompatibilno).
//
// Ta datoteka je ČIST LISTNI modul (vzorec route-order.ts / data-freshness.ts):
// brez omrežja, brez baze, brez LLM, brez ure (Date.now) — deterministično,
// isto obnašanje na serverju in v testih. NE mutira vhodov (vedno nove
// objekte za spremenjene postanke; nespremenjeni ostanejo referenčno enaki).
// ============================================================================

/** Vhod za markIntentLocked: dnevi načrta + ID-ji FIXED izbir (vrstni red
 *  izbire je pomemben drugje — geo sidra; tu potrebujemo samo množico). */
export interface IntentMarkInput {
  days: { locations: LocationVisit[] }[];
  fixedDestinationIds: string[];
}

/** Ali je TA postanek uporabnikova NAMERNA izbira (§21 → zamrznjen). */
function isUserIntentStop(
  l: LocationVisit,
  fixedIds: ReadonlySet<string>
): boolean {
  // 1) FIXED izbira (id v formatu "provider:productId" — vnaša jo Task 48
  //    invariantna plast ali AI odmev izbire);
  if (fixedIds.has(l.destination_id)) return true;
  // 2) uporabnikovo dodan supply postanek (zemljevid ponudbe → V načrt);
  if (l.category === "supply") return true;
  // 3) postanek s KONKRETNIM izdelkom (booking_provider) — Task 48 popravi
  //    AI odmeve FIXED izbir do produkta; to je uporabnikov izdelek, ne
  //    uredniški predlog.
  if (typeof l.booking_provider === "string" && l.booking_provider.length > 0) {
    return true;
  }
  return false;
}

/**
 * Označi NAMERNE postanke (intentLocked: true) po dnevih. ČISTA funkcija:
 * vhodov NE mutira — označeni postanki so NOVI objekti, neoznačeni ostanejo
 * referenčno enaki. Niz fixedDestinationIds pretvori v množico (iskanje O(1)).
 */
export function markIntentLocked(input: IntentMarkInput): LocationVisit[][] {
  const fixedIds = new Set(
    Array.isArray(input.fixedDestinationIds) ? input.fixedDestinationIds : []
  );
  const days = Array.isArray(input.days) ? input.days : [];
  return days.map((day) => {
    const locations = Array.isArray(day?.locations) ? day.locations : [];
    return locations.map((l) =>
      isUserIntentStop(l, fixedIds) ? { ...l, intentLocked: true } : l
    );
  });
}

/**
 * Označi NAMERNE postanke na CELEM itinererju (iste oznake kot
 * markIntentLocked; dan-objekti se preslikajo z novimi locations — ostala
 * polja dneva se prenesejo). Uporaba: /api/itinerary tik pred odgovorom
 * (AI pot + deterministična/fallback pot — ISTA resnica na obeh).
 */
export function markItineraryIntentLocked(
  it: Itinerary,
  fixedDestinationIds: string[]
): Itinerary {
  const marked = markIntentLocked({
    days: (it.days ?? []).map((d) => ({ locations: d.locations })),
    fixedDestinationIds,
  });
  return {
    ...it,
    days: (it.days ?? []).map((d, i) => ({ ...d, locations: marked[i] ?? [] })),
  };
}

/**
 * §21 na REFINU: klientov načrt že nosi intentLocked oznake; refine (AI
 * ali deterministična transformacija) lahko postanke premika/dodaja/odstranjuje
 * — oznake se NANAŠAJO NAZAJ po ujemanju destination_id iz VHODNIH postankov.
 * Novi AI-postanki (predlogi) ostanejo PROSTI — iskreno: predlog ni namerna
 * izbira. Čista funkcija, fail-open (prazen/čuden vhod → nespremenjen
 * načrt — nikoli ne blokira refinanja).
 */
export function preserveIntentLocked(
  next: Itinerary,
  incoming: Itinerary
): Itinerary {
  // Množica ID-jev, ki so bili v VHODNEM načrtu zamrznjeni (duplikati istega
  // ID-ja: zadostuje ENA zamrznjena pojavitev — smeri varnosti: uporabnikova
  // izbira se ne sprosti zaradi podvojitve).
  const lockedIds = new Set<string>();
  for (const d of incoming.days ?? []) {
    for (const l of (d?.locations ?? []) as LocationVisit[]) {
      if (l?.intentLocked === true && typeof l.destination_id === "string") {
        lockedIds.add(l.destination_id);
      }
    }
  }
  if (lockedIds.size === 0) {
    return next; // nič za ohraniti (stari načrti brez oznak — nazaj kompatibilno)
  }
  return {
    ...next,
    days: (next.days ?? []).map((d) => ({
      ...d,
      locations: (d.locations ?? []).map((l) =>
        l.intentLocked !== true && lockedIds.has(l.destination_id)
          ? { ...l, intentLocked: true }
          : l
      ),
    })),
  };
}

/**
 * §21 REFINA v enem klicu (krajša pot za API ruto): (1) ohrani obstoječe
 * oznake iz VHODNEGA načrta po destination_id, (2) ODSTRANI oznake s
 * postankov, ki jih vhod NI poznal kot namerne in niso sveže FIXED izbire
 * (AI odmev si lahko sam "izmisliti" intentLocked — nezaupan vhod NI dokaz
 * o namernosti; postanek ostane PROST), (3) nanese sveže FIXED izbire
 * (kanonski "provider:productId" — uporabnik je izdelek izbral NA REFINU).
 * Novi AI predlogi ostanejo prosti. Čista, fail-open: prazen vhod →
 * smiselno nespremenjen izhod (nikoli ne blokira refinanja).
 */
export function refineIntentLocked(
  next: Itinerary,
  incoming: Itinerary,
  fixedDestinationIds: string[]
): Itinerary {
  // 1) množica namernih ID-jev iz VHODA (edini dokaz o prejšnji namernosti)
  const lockedIds = new Set<string>();
  for (const d of incoming.days ?? []) {
    for (const l of (d?.locations ?? []) as LocationVisit[]) {
      if (l?.intentLocked === true && typeof l.destination_id === "string") {
        lockedIds.add(l.destination_id);
      }
    }
  }
  // 2) sveže FIXED izbire s refina (isti vir kot generacija)
  for (const id of Array.isArray(fixedDestinationIds)
    ? fixedDestinationIds
    : []) {
    lockedIds.add(id);
  }
  // 3) nanesi po destination_id (novi AI predlogi brez ujemanja ostanejo
  //    prosti); morebitne "izmisljene" oznake na izhodu se pošteno odstranijo.
  return {
    ...next,
    days: (next.days ?? []).map((d) => ({
      ...d,
      locations: (d.locations ?? []).map((l) => {
        if (lockedIds.has(l.destination_id)) {
          return l.intentLocked === true ? l : { ...l, intentLocked: true };
        }
        if (l.intentLocked !== true) return l;
        // Oznaka brez dokaza o namernosti (AI odmev/Nezaupan vhod) → PROST
        const { intentLocked: _spurious, ...rest } = l;
        return rest;
      }),
    })),
  };
}
