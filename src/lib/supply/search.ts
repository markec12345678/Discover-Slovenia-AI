// ============================================================================
// TRAVEL SUPPLY MAP — SUPPLY SEARCH RUNNER (F1, 1.49.0)
// ============================================================================
// Tok: viewport → bbox → supply query → aktivni adapterji (izolirano) →
// dedupe → zoom gating → cap → odgovor s stanji adapterjev (degraded[]).
//
// OSM/lokalna plast je VEDNO prisotna (graceful degradation): če komercialni
// adapter odpade, odgovor izrecno navaja degraded[], lokalni viri pa
// ostanejo — obratno (OSM pade) tudi ne sesuje odgovora (prazno + degraded).
//
// Testi vbrizgajo lastne adapterje (dependency injection) — produkcijska
// pot dobi privzete (danes: samo OSM; komercialni se priklapljajo ŠTEVILEN
// po dejanskem dostopu, nikoli "na silo").
// ============================================================================

import type {
  AdapterRunInfo,
  ProductType,
  ProviderSlug,
  SupplyQuery,
  SupplySearchResponse,
  ProviderProduct,
} from "./types";
import { isProductType } from "./taxonomy";
import { DEFAULT_SUPPLY_TYPES } from "./taxonomy";
import { activeProviders, type ProviderRegistryEntry } from "./registry";
import { dedupeProducts } from "./dedupe";
import { clampZoom, maxProductsForZoom, typesVisibleAtZoom } from "./zoom";
import { runAdapter, type SupplyAdapter } from "./adapter";
import { createOsmAdapter } from "./osm-adapter";
import { createKiwiTaxiAdapter } from "./providers/kiwitaxi/adapter";
import { createViatorAdapter } from "./providers/viator/adapter";

/**
 * Tovarna adapterjev po slug-u (iz registra: AKTIVNI). Adapter, ki nima
 * svojega podatka (dataset ni nameščen), se pošteno izprazni — nikoli
 * „na silo" priklopljen inventar.
 */
const ADAPTER_FACTORIES: Partial<
  Record<string, (entry: ProviderRegistryEntry) => SupplyAdapter>
> = {
  osm: createOsmAdapter,
  kiwitaxi: createKiwiTaxiAdapter, // TASK 43: prvi realni komercialni adapter
  viator: createViatorAdapter, // TASK 45: drugi realni adapter (runtime capability gate)
};

/** Privzeti adapterji (iz registra: aktivni). */
export function defaultAdapters(): SupplyAdapter[] {
  return activeProviders()
    .map((p) => {
      const factory = ADAPTER_FACTORIES[p.slug];
      return factory ? factory(p) : null;
    })
    .filter((a): a is SupplyAdapter => a != null);
}

// ---------------------------------------------------------------------------
// STREŽNIŠKI OMEJEVALNIK KLICOV NA PROVIDERJA (audit 42, točka 3 — rate
// limit v pogodbi adapterja). Drseče okno v pomnilniku (vzorec rate-limit.ts,
// per-instanca). maxCallsPerMin = 0 → neomejeno.
// ---------------------------------------------------------------------------
const providerCallTimes = new Map<string, number[]>();

export function providerRateLimited(entry: ProviderRegistryEntry): boolean {
  const cap = entry.maxCallsPerMin;
  if (!cap || cap <= 0) return false;
  const now = Date.now();
  const win = providerCallTimes.get(entry.slug) ?? [];
  const fresh = win.filter((t) => now - t < 60_000);
  if (fresh.length >= cap) {
    providerCallTimes.set(entry.slug, fresh);
    return true;
  }
  fresh.push(now);
  providerCallTimes.set(entry.slug, fresh);
  return false;
}

/** Počisti okna (testi). */
export function clearProviderRateLimits(): void {
  providerCallTimes.clear();
}

// ---------------------------------------------------------------------------
// CACHE-CONTROL ODGOVORA (audit 42, točka 13 — cache NI globalni TTL):
// izpeljan IZklJUČNO iz registrov AKTIVNIH adapterjev. Vsak aktivni vir z
// cacheTtlMs=0 (živa razpoložljivost!) → no-store; sicer kratek skupni
// s-maxage = min(60 s, najkrajši TTL med aktivnimi) + stale-while-revalidate.
// ---------------------------------------------------------------------------
export function supplyResponseCacheControl(
  entries: ProviderRegistryEntry[]
): string {
  const active = entries.filter((e) => e.active);
  if (active.length === 0) return "no-store";
  if (active.some((e) => e.cacheTtlMs <= 0)) return "no-store";
  const minTtlSec = Math.min(...active.map((e) => Math.floor(e.cacheTtlMs / 1000)));
  const sMaxage = Math.max(1, Math.min(60, minTtlSec));
  return `public, s-maxage=${sMaxage}, stale-while-revalidate=${Math.max(60, sMaxage * 5)}`;
}

/** Parsing + validacija query nizov (route tanek plašč nad tem). */
export interface ParsedSupplyQuery {
  ok: true;
  query: SupplyQuery;
}
export type ParsedSupplyQueryResult =
  | ParsedSupplyQuery
  | { ok: false; error: string };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Največja površina viewporta (deg²) PO ZOOM RAVNI (audit 42, 42-e F5 —
 *  prej fletna meja 36 deg²: sestavljeni zoom=14 + 6°×6° bbox je gnal
 *  drago državno poizvedbo). Realne višine viewportov po zoomu:
 *  z≤9 državni (~6°), z10–11 ~3–4°, z12–13 ~1–2°, z14+ ulični <0.5°.
 *  Meje so RADODARNE (2× tipično), da legitimni široki zasloni minejo. */
function maxBboxAreaForZoom(z: number): number {
  if (z < 10) return 36;
  if (z < 12) return 16;
  if (z < 14) return 9;
  return 4;
}

/** Največje št. kategorij (dedupe + kap — audit 42, 42-e F4). */
const MAX_CATS = 32;

export function parseSupplyQuery(params: {
  bbox?: string | null;
  zoom?: string | null;
  cats?: string | null;
  date?: string | null;
  pax?: string | null;
  locale?: string | null;
}): ParsedSupplyQueryResult {
  const locale: "sl" | "en" = params.locale === "en" ? "en" : "sl";

  // Zoom NAJPREJ — meja površine je odvisna od njega.
  const zoom = clampZoom(Number(params.zoom ?? "8"));

  let bbox: [number, number, number, number] | undefined;
  if (params.bbox) {
    const parts = params.bbox.split(",").map(Number);
    if (
      parts.length !== 4 ||
      parts.some((n) => !Number.isFinite(n))
    ) {
      return { ok: false, error: "bbox" };
    }
    const [s, w, n, e] = parts;
    if (s >= n || w >= e) return { ok: false, error: "bbox" };
    if (s < -90 || n > 90 || w < -180 || e > 180) return { ok: false, error: "bbox" };
    if ((n - s) * (e - w) > maxBboxAreaForZoom(zoom)) return { ok: false, error: "bbox-area" };
    bbox = [s, w, n, e];
  }

  let cats: ProductType[] = [];
  if (params.cats) {
    const seen = new Set<string>();
    for (const raw of params.cats.split(",")) {
      const t = raw.trim();
      // DEDUPE kategorij (ponovitve napihujejo cache ključ + echo) in KAP
      // (nosilnost ~32 tipov je čez vse realne rabе).
      if (t && isProductType(t) && !seen.has(t) && seen.size < MAX_CATS) {
        seen.add(t);
        cats.push(t);
      }
    }
    if (cats.length === 0) return { ok: false, error: "cats" };
  }

  let date: string | undefined;
  if (params.date) {
    if (!ISO_DATE_RE.test(params.date) || Number.isNaN(Date.parse(params.date))) {
      return { ok: false, error: "date" };
    }
    date = params.date;
  }

  let pax: number | undefined;
  if (params.pax != null && params.pax !== "") {
    const n = Number(params.pax);
    if (!Number.isInteger(n) || n < 1 || n > 20) return { ok: false, error: "pax" };
    pax = n;
  }

  return {
    ok: true,
    query: { bbox, zoom, cats, date, pax, locale },
  };
}

/**
 * Glavni runner. Koraki:
 *  1. kategorije: izrecne ali privzete → zoom gating (vidne pri zoom-u)
 *  2. adapterji: samo AKTIVNI z vsaj eno vidno kategorijo in zoom ≥ minZoom
 *  3. izvedba: Promise.allSettled (izolacija) — napaka enega = degraded
 *  4. dedupe (čez-vir) → cap (zoom) → counts
 */
export async function searchSupply(
  query: SupplyQuery,
  adapters: SupplyAdapter[] = defaultAdapters()
): Promise<SupplySearchResponse> {
  const zoom = clampZoom(query.zoom);

  // 1) Kategorije: prazne → privzete; nato zoom gating po taksonomiji.
  const requestedCats =
    query.cats.length > 0 ? query.cats : DEFAULT_SUPPLY_TYPES;
  const visibleCats = typesVisibleAtZoom(zoom, requestedCats);

  const adaptersInfo: AdapterRunInfo[] = [];
  const degraded: ProviderSlug[] = [];
  let all: ProviderProduct[] = [];

  // 2+3) Izvedba AKTIVNIH adapterjev izolirano (zoom prag → kategorije →
  // strežniški rate limit). Rate-limited NI napaka vira (note, ne degraded).
  const runnable: SupplyAdapter[] = [];
  const rateLimited: SupplyAdapter[] = [];
  for (const a of adapters) {
    const z = Math.floor(zoom);
    if (z < a.entry.minZoom) continue;
    if (visibleCats.length === 0) continue;
    if (!a.entry.types.some((t) => visibleCats.includes(t))) continue;
    if (providerRateLimited(a.entry)) {
      rateLimited.push(a);
      continue;
    }
    runnable.push(a);
  }

  if (runnable.length > 0) {
    const settled = await Promise.allSettled(
      runnable.map((a) => runAdapter(a, { ...query, zoom, cats: visibleCats }))
    );
    for (let i = 0; i < settled.length; i++) {
      const res = settled[i];
      const adapter = runnable[i];
      if (res.status === "fulfilled") {
        adaptersInfo.push(res.value.info);
        if (!res.value.info.ok) degraded.push(adapter.entry.slug);
        all = all.concat(res.value.products);
      } else {
        // runAdapter lovi izjeme — to je čista varovalka.
        degraded.push(adapter.entry.slug);
        adaptersInfo.push({
          slug: adapter.entry.slug,
          status: adapter.entry.status,
          ok: false,
          ms: 0,
          count: 0,
          cached: false,
          note: "settled-rejected",
        });
      }
    }
  }

  // Neizvedeni aktivni adapterji — transparentno poročamo RAZLOG izpada
  // izvedbe (ne kot napako). TASK 44: razločeni vzroki — "zoom-gated"
  // (zoom pod pragom adapterja ALI pod globalnim SUPPLY_MIN_ZOOM, ki
  // požene prazne kategorije) in "cat-gated" (adapterjevi tipi se ne
  // sekajo z vidnimi kategorijami — npr. cats=transfer ne pokliče OSM).
  for (const a of adapters) {
    if (runnable.includes(a) || rateLimited.includes(a)) continue;
    const z = Math.floor(zoom);
    const gated = z < a.entry.minZoom || visibleCats.length === 0 ? "zoom-gated" : "cat-gated";
    adaptersInfo.push({
      slug: a.entry.slug,
      status: a.entry.status,
      ok: true,
      ms: 0,
      count: 0,
      cached: false,
      note: gated,
    });
  }
  for (const a of rateLimited) {
    adaptersInfo.push({
      slug: a.entry.slug,
      status: a.entry.status,
      ok: true,
      ms: 0,
      count: 0,
      cached: false,
      note: "rate-limited",
    });
  }

  // 4) Dedupe (čez-vir arhitektura) + cap po zoom-u.
  const { products: deduped, duplicates } = dedupeProducts(all);
  const cap = maxProductsForZoom(zoom);
  const capped =
    deduped.length > cap ? deduped.slice(0, cap) : deduped;

  // Counts (po tipu + po ponudniku).
  const byType: Partial<Record<ProductType, number>> = {};
  const byProvider: Partial<Record<ProviderSlug, number>> = {};
  for (const p of capped) {
    byType[p.type] = (byType[p.type] ?? 0) + 1;
    byProvider[p.provider] = (byProvider[p.provider] ?? 0) + 1;
  }

  return {
    products: capped,
    counts: { byType, byProvider },
    adapters: adaptersInfo,
    degraded,
    duplicates,
    query: {
      bbox: query.bbox,
      zoom,
      cats: visibleCats,
      date: query.date,
      pax: query.pax,
    },
    generatedAt: new Date().toISOString(),
  };
}
