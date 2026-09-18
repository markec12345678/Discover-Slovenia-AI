// ============================================================================
// TRAVEL SUPPLY MAP — ADAPTER VMESNIK (F1, 1.49.0)
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
// ============================================================================

import type {
  AdapterRunInfo,
  ProviderProduct,
  SupplyQuery,
} from "./types";
import type { ProviderRegistryEntry } from "./registry";

export interface SupplyAdapter {
  /** Register vstop (zmožnosti, status, TTL, minZoom …). */
  entry: ProviderRegistryEntry;
  /**
   * Iskanje po viewportu. VEDNO vrača normalizirane ProviderProduct ali
   * prazen seznam — mehke napake ujame runner (degraded[]), izjeme v
   * try/catch tu (adapter samo pošteno pove, da trenutno ni podatkov).
   */
  search(q: SupplyQuery): Promise<ProviderProduct[]>;
  /** Ali je bil ZADNJI uspešen zadetek iz predpomnilnika (telemetrija). */
  lastRunCached(): boolean;
}

export interface AdapterRun {
  info: AdapterRunInfo;
  products: ProviderProduct[];
}

/**
 * Izvedi ENEGA adapterja z izolacijo napak + meritvijo časa.
 * Klicalec (search.ts) se odloči PREJ, ali se adapter sploh pokliče
 * (zoom prag, aktivnost, vidne kategorije) — tu je samo izvedba.
 */
export async function runAdapter(
  adapter: SupplyAdapter,
  q: SupplyQuery
): Promise<AdapterRun> {
  const started = Date.now();
  const { entry } = adapter;
  try {
    const products = await adapter.search(q);
    return {
      info: {
        slug: entry.slug,
        status: entry.status,
        ok: true,
        ms: Date.now() - started,
        count: products.length,
        cached: adapter.lastRunCached(),
      },
      products,
    };
  } catch {
    // Fail-open: adapter odpovedal → degraded, ostali nadaljujejo.
    return {
      info: {
        slug: entry.slug,
        status: entry.status,
        ok: false,
        ms: Date.now() - started,
        count: 0,
        cached: false,
        note: "adapter-error",
      },
      products: [],
    };
  }
}
