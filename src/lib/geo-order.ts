// ============================================================================
// TASK 51 (§6/§7/§8) — DETERMINISTIČNO GEOGRAFSKO UREJANJE FALLBACK POSTANKOV.
//
// VZROK (dokazan v repro TASK 50 P2, B2/B3): generateFallbackItinerary je
// obiskoval destinacije V OCUSTNEM VRSTNEM REDU PO OCENI (interesi +
// rating) — geografija ni sodelovala NIC. Rezultat: 1115/1650 km cik-cak
// (Triglav → Soča → Bohinj → Postojna → Vintgar → Kobarid → Slovenj
// Gradec → Novo mesto → Črnomelj → Dravograd — realne OSRM noge).
//
// POPRAVEK (root cause, minimalen): IZBIRA postankov ostaja POPOLNOMA
// enaka (iskrena ocena interesov, sezonski filter, zaprtja, deževni dnevi
// → notranji). Spremeni se SAMO VRSTNI RED: dnevi/urnik prejmejo istične
// postanke v geografsko koherentnem zaporedju okoli sidrov.
//
// MODEL SIDROV (§7 — ANCHORS):
//   1. VERIFICIRANE FIXED izbire (selection vrstni red — §8 F2: vrstni red
//      FIXED se NE spremeni) — kanonske koordinate iz strežniške plasti
//      (Task 49 selection-verify; klientove koordinate NIKOLI ne pridejo
//      do sem — test G-A10).
//   2. Uporabničeve izrecne destinacije (input vrstni red) — SAMO tiste,
//      ki so res izbrane v nabor (sezonsko zaprte ne sidra).
//   Ostali postanki se razporedijo OKOLI sidrov: vsak pade v gručo
//   najbližjega sidra (haversine), gruče se izpišejo po vrstnem redu
//   hrbtenice sidrov, znotraj gruče veriga najbližjih-sosedov od sidra.
//
// BREZ SIDROV: verica najbližjih-sosedov, začeta pri postanku, najbližjem
// težišču IZBRANIH postankov (podatkovno izpeljan referenč — NE trdimo,
// da uporabnik začenja v Ljubljani; deterministično brez trdne kode).
//
// VREMENSKA VEZNOST (iskrenost Task 50): dnevi z deževno napovedjo obdržijo
// SVOJ nabor notranjih postankov — urejanje deluje znotraj vremenskih
// blokov (zaporedni dnevi z enako "deževnostjo"), med bloki pa se pozicijski
// kazalec prenese (nadaljujemo od tam, kjer je prejšnji blok končal).
//
// HAVERSINE (§5): tu je IZKLJUČNO hevristika UREJANJA (determinizem, 0
// omrežja). NI in SME biti predstavljena kot realni čas/razdalja vožnje —
// realne noge ostanejo OSRM + repairScheduleGaps nad njimi (Task 50).
//
// DETERMINIZEM: vsi pari razdalj; remoji razbijamo po poolIndex (vrstni
// red v DESTINATIONS datasetu). Nekončne koordinate → razdalja +Infinity
// (postanek potone na konec verige; nikoli crash — G-A9 robustnost).
//
// NE_OPTIMIZIRAMO: to NI TSP solver — poštena požrešna veriga (greedy
// nearest-neighbor) daje koherenco, ne matematični optimum (§1 TASK 51).
// ============================================================================

import { coherenceHaversineKm } from "./geo-coherence";

/** Sidro hrbtenice: koordinata + stabilni id (FIXED izbira ali destinacija). */
export interface GeoOrderAnchor {
  id: string;
  lat: number;
  lng: number;
}

/** Postanek, ki ga urejamo (id + koordinate + poolIndex za izenačenja). */
export interface OrderableStop {
  id: string;
  lat: number;
  lng: number;
  /** Vrstni red v datasetu — DETERMINISTIČNO razbijanje izenačenj. */
  poolIndex: number;
}

export interface OrderAroundAnchorsParams {
  /** Izbrani nabori po dnevih (iskrena izbira — NE spreminja se). */
  daySets: OrderableStop[][];
  /** Deževnost dneva (index 0 = dan 1) — veže notranje naboje na dneve. */
  rainyDays: boolean[];
  /** Urejena hrbtenica sidrov (FIXED vrstni red izbire, potem željene). */
  anchors: GeoOrderAnchor[];
}

/**
 * Greedy najbližji-sosed iz `start` nad `remaining` (mutira remaining).
 * Izenačenja po (razdalja, poolIndex) — deterministično.
 */
function greedyChain(
  start: { lat: number; lng: number },
  remaining: OrderableStop[]
): OrderableStop[] {
  const chain: OrderableStop[] = [];
  let cur = start;
  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const d = coherenceHaversineKm(cur, remaining[i]);
      if (d < bestDist || (d === bestDist && remaining[i].poolIndex < remaining[bestIdx].poolIndex)) {
        bestDist = d;
        bestIdx = i;
      }
    }
    const next = remaining.splice(bestIdx, 1)[0];
    chain.push(next);
    cur = next;
  }
  return chain;
}

/** Težišče (aritmetična sredina) končnih koordinat — podatkovni referenč. */
function centroidOf(stops: OrderableStop[]): { lat: number; lng: number } | null {
  let lat = 0;
  let lng = 0;
  let n = 0;
  for (const s of stops) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lng)) continue;
    lat += s.lat;
    lng += s.lng;
    n += 1;
  }
  return n > 0 ? { lat: lat / n, lng: lng / n } : null;
}

/**
 * Postanek, najbližji referenci (haversine, izenačenja po poolIndex).
 * Vrne null, če ni nobenega postanka s končnimi koordinatami.
 */
function nearestTo(
  ref: { lat: number; lng: number } | null,
  stops: OrderableStop[]
): OrderableStop | null {
  if (stops.length === 0) return null;
  let best: OrderableStop | null = null;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const s of stops) {
    if (ref == null) {
      // Brez referenč: prvi po poolIndex (deterministično).
      if (best === null || s.poolIndex < best.poolIndex) best = s;
      continue;
    }
    const d = coherenceHaversineKm(ref, s);
    if (d < bestDist || (d === bestDist && (best === null || s.poolIndex < best.poolIndex))) {
      bestDist = d;
      best = s;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// OUTLIER prag: postanek, ki je od VSAKEGA sidra oddaljen več kot
// OUTLIER_KM, NE pripada nobeni gruči. Utemeljitev: „razporedi ostale
// destinacije OKOLI sidrov“ pomeni znotraj ≈ ene regije (~60 km haversine
// ≈ 75 km ceste ≈ 1 h vožnje — isti red velikosti kot M5 sidro-dan in
// R_VISIT/D_LEFT v geo-coherence.ts). Dokazano vzročno (G5-4 debug):
// vlečenje oddaljenih postankov v »najbližjo« gručo je ustvarilo
// vzhod → zahod → vzhod vračanje (ljubljana/triglav/piran so bili od obeh
// NE sidrov 100–200 km stran, a »najbližje« mariboru → gruča jih je
// odnesla zahod, nato se je ptujeva gruča vrnila vzhod).
// ---------------------------------------------------------------------------
export const OUTLIER_KM = 60;

/**
 * Glavna funkcija: vrne PREUREJENE naboje dni (ISTI nabori postankov na
 * istih vremenskih blokih — samo zaporedje znotraj bloka se spremeni).
 */
export function orderAroundAnchors(
  params: OrderAroundAnchorsParams
): OrderableStop[][] {
  const { daySets, rainyDays, anchors } = params;
  if (daySets.length === 0) return [];
  const n = daySets.length;

  // 1) Vremenski bloki (zaporedni dnevi z enako deževnostjo)
  const blocks: { from: number; to: number; rainy: boolean }[] = [];
  for (let i = 0; i < n; i++) {
    const rainy = rainyDays[i] === true;
    const last = blocks[blocks.length - 1];
    if (last && last.rainy === rainy) last.to = i;
    else blocks.push({ from: i, to: i, rainy });
  }

  // 2) Veljavna sidra (končne koordinate so)
  const validAnchors = anchors.filter(
    (a) => Number.isFinite(a.lat) && Number.isFinite(a.lng)
  );

  const result: OrderableStop[][] = [];
  // Pozicijski kazalec — konec prejšnjega bloka (nadaljevanje poti).
  let cursor: { lat: number; lng: number } | null = null;

  for (const block of blocks) {
    const blockDays: OrderableStop[][] = [];
    for (let d = block.from; d <= block.to; d++) blockDays.push(daySets[d]);
    const stops = blockDays.flat();
    const daySizes = blockDays.map((s) => s.length);
    // Postanki brez končnih koordinat ne morejo sodelovati v razdaljah;
    // obdržimo jih (iskrenost — izbira se ne sme spremeniti), urejajo se
    // pasivno (razdalja +Infinity → potonejo na konec verige).
    let chain: OrderableStop[];

    if (validAnchors.length === 0) {
      // --- Brez sidrov: verica NN od postanka najbližjega težišču ---
      const startRef = cursor ?? centroidOf(stops);
      const start = nearestTo(startRef, stops);
      const remaining = stops.filter((s) => s !== start);
      chain = start
        ? [start, ...greedyChain(start, remaining)]
        : greedyChain({ lat: 0, lng: 0 }, stops); // prazna/varna veja (ne dosegljivo z n>0)
    } else {
      // --- Sidra: gruče OKOLI sidrov (znotraj OUTLIER_KM najbližjega),
      // izpis po hrbtenici; ODDALJENI (> OUTLIER_KM od vseh) so PROSTI —
      // verižijo se ZA gručami kot nadaljevanje poti (prepreči vzhod →
      // zahod → vzhod cik-cak iz G5-4 debug dokaza). ---
      const anchorOf = new Map<number, OrderableStop[]>();
      const free: OrderableStop[] = [];
      for (const s of stops) {
        let bestA = -1;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let a = 0; a < validAnchors.length; a++) {
          const d = coherenceHaversineKm(validAnchors[a], s);
          if (d < bestDist) {
            bestDist = d;
            bestA = a;
          }
        }
        if (bestA === -1 || bestDist > OUTLIER_KM) {
          // PROSTI postanek (nekončne koordinate prav tako — pasivno).
          free.push(s);
        } else {
          const bucket = anchorOf.get(bestA) ?? [];
          bucket.push(s);
          anchorOf.set(bestA, bucket);
        }
      }

      // Sidrni postanki (destinacija, ki je hkrati sidro) so v svoji gruči
      // PRVI — njihovo mesto na hrbtenici je uporabniška želja (§7).
      const chainParts: OrderableStop[][] = [];
      for (let a = 0; a < validAnchors.length; a++) {
        const bucket = anchorOf.get(a) ?? [];
        if (bucket.length === 0) continue;
        const anchorStopIds = new Set(
          validAnchors.filter((x, idx) => idx === a).map((x) => x.id)
        );
        const anchorStops = bucket.filter((s) => anchorStopIds.has(s.id));
        const rest = bucket.filter((s) => !anchorStopIds.has(s.id));
        // Verica od sidra: najprej sidrni postanki (poolIndex), potem NN.
        const anchor = validAnchors[a];
        const startStops = [...anchorStops].sort((x, y) => x.poolIndex - y.poolIndex);
        let localChain: OrderableStop[] = [];
        let localCur: { lat: number; lng: number } = anchor;
        if (startStops.length > 0) {
          localChain = [...startStops];
          localCur = startStops[startStops.length - 1];
        }
        localChain = [...localChain, ...greedyChain(localCur, [...rest])];
        chainParts.push(localChain);
      }
      let chained = chainParts.flat();
      // PROSTI postanki: nadaljevanje verige od zadnjega postavljenega
      // (konec zadnje gruče), sicer od kursorja prejšnjega bloka, sicer od
      // težišča prostih — enaka NN logika kot pot brez sidrov.
      if (free.length > 0) {
        const startRef =
          chained.length > 0
            ? chained[chained.length - 1]
            : (cursor ?? centroidOf(free));
        const freeStart = nearestTo(startRef, free);
        if (freeStart) {
          const rest = free.filter((s) => s !== freeStart);
          chained = [...chained, freeStart, ...greedyChain(freeStart, rest)];
        } else {
          chained = [...chained, ...greedyChain(startRef ?? { lat: 0, lng: 0 }, free)];
        }
      }
      chain = chained;
    }

    // 3) Razrez verice nazaj v dneve bloka (ISTE velikosti dni).
    let idx = 0;
    for (let d = block.from; d <= block.to; d++) {
      const size = daySizes[d - block.from];
      result[d] = chain.slice(idx, idx + size);
      idx += size;
    }
    const lastOfChain = chain[chain.length - 1];
    if (lastOfChain && Number.isFinite(lastOfChain.lat) && Number.isFinite(lastOfChain.lng)) {
      cursor = { lat: lastOfChain.lat, lng: lastOfChain.lng };
    }
  }

  return result;
}
