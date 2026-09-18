// ============================================================================
// TRAVEL SUPPLY MAP — ADAPTER VMESNIK (F1, 1.49.0; utrjen audit 42)
// ============================================================================
// Providerji so ADAPTERJI, ne ločeni UI sistemi (zahteva naročnika).
// Vsak adapter normalizira svojo ponudbo v kanonski ProviderProduct.
//
// Vzorce črpamo iz treh dokazanih plasti projekta:
//  - overpass.ts    → retry + mirror failover + časovni budget
//  - road-routing   → TTL predpomnilnik + varovalka + fail-open
//  - ai-client      → izolacija napak ponudnika (nikoli ne podre celote)
//
// GRACEFUL DEGRADATION (zahteva naročnika): odpoved komercialnega
// adapterja NIKOLI ne odstrani OSM/lokalne plasti — vsak adapter teče
// izolirano (Promise.allSettled v search.ts), padli pridejo v degraded[].
//
// AUDIT 42, točka 3 — POVEČANA POGODBA:
//  - TIMEOUT (entry.timeoutMs): runner uveljavi zgornjo mejo izvedbe tudi
//    če adapter sam ne vrača (obrnjena pogodba — obesek NIKOLI ne odloži
//    celotnega /api/supply/search; prej je bil hang možen).
//  - ABORT (q.signal): preklic odjemalca se širi do adapterja (OSM prekine
//    nodo-https + retry zanko); runner odpoved klasificira kot "aborted".
//  - PARTIAL RESULT: adapter poroča skipped (zavrnjeni elementi vira) prek
//    opcijskega lastRunSkipped() — iskrena telemetrija.
//  - PAGINATION (dokumentirana odločitev): viewport model je BEZ-STANJA in
//    kapiran (maxProductsForZoom) — kurzor/tokene NE potrebujemo; bodoči
//    paginirani API-ji adapter interno seštejejo strani do kapa.
// ============================================================================

import type {
  AdapterRunInfo,
  ProviderProduct,
  SupplyQuery,
} from "./types";
import type { ProviderRegistryEntry } from "./registry";

export interface SupplyAdapter {
  /** Register vstop (zmožnosti, status, TTL, minZoom, timeoutMs …). */
  entry: ProviderRegistryEntry;
  /**
   * Iskanje po viewportu. VEDNO vrača normalizirane ProviderProduct ali
   * prazen seznam — mehke napake ujame runner (degraded[]), izjeme v
   * try/catch tu (adapter samo pošteno pove, da trenutno ni podatkov).
   * q.signal (preklic odjemalca) naj adapter spoštuje, kjer lahko.
   */
  search(q: SupplyQuery): Promise<ProviderProduct[]>;
  /** Ali je bil ZADNJI uspešen zadetek iz predpomnilnika (telemetrija). */
  lastRunCached(): boolean;
  /** Št. elementov vira, ki jih je ZADNJI zagon zavrgel ob normalizaciji
   *  (brez imena/geo/tipa) — opcijsko, za iskren "partial result". */
  lastRunSkipped?(): number;
}

export interface AdapterRun {
  info: AdapterRunInfo;
  products: ProviderProduct[];
}

/**
 * Izvedi ENEGA adapterja z izolacijo napak + meritvijo časa + timeoutom +
 * preklicem. Klicalec (search.ts) se odloči PREJ, ali se adapter sploh
 * pokliče (zoom prag, aktivnost, vidne kategorije, rate limit) — tu je
 * samo izvedba.
 */
export async function runAdapter(
  adapter: SupplyAdapter,
  q: SupplyQuery
): Promise<AdapterRun> {
  const started = Date.now();
  const { entry } = adapter;
  const timeoutMs = Math.max(1, entry.timeoutMs || 10_000);

  const fail = (note: string): AdapterRun => ({
    info: {
      slug: entry.slug,
      status: entry.status,
      ok: false,
      ms: Date.now() - started,
      count: 0,
      cached: false,
      note,
    },
    products: [],
  });

  try {
    // Timeout dira: adapter, ki obesi, DEGRADED (ne hang celotnega endpointa).
    // Signal: preklic odjemalca (AbortController v use-supply-query →
    // request.signal v routi) prekine tudi izvedbo adapterja.
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("adapter-timeout")), timeoutMs);
    });
    const abort = new Promise<never>((_, reject) => {
      if (q.signal?.aborted) reject(new Error("adapter-aborted"));
      else q.signal?.addEventListener(
        "abort",
        () => reject(new Error("adapter-aborted")),
        { once: true }
      );
    });

    let products: ProviderProduct[];
    try {
      products = await Promise.race([
        adapter.search(q),
        timeout,
        abort,
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }

    return {
      info: {
        slug: entry.slug,
        status: entry.status,
        ok: true,
        ms: Date.now() - started,
        count: products.length,
        cached: adapter.lastRunCached(),
        skipped: adapter.lastRunSkipped?.() ?? undefined,
      },
      products,
    };
  } catch (e) {
    // Fail-open: adapter odpovedal → degraded, ostali nadaljujejo.
    // Timeout/preklic ločeno označena (telemetrija razlikuje vzrok).
    const msg = e instanceof Error ? e.message : "";
    const note =
      msg === "adapter-timeout"
        ? "timeout"
        : msg === "adapter-aborted"
          ? "aborted"
          : "adapter-error";
    return fail(note);
  }
}
