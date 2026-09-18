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
import { activeProviders } from "./registry";
import { dedupeProducts } from "./dedupe";
import { clampZoom, maxProductsForZoom, typesVisibleAtZoom } from "./zoom";
import { runAdapter, type SupplyAdapter } from "./adapter";
import { createOsmAdapter } from "./osm-adapter";

/** Privzeti adapterji (iz registra: aktivni). */
export function defaultAdapters(): SupplyAdapter[] {
  return activeProviders()
    .filter((p) => p.slug === "osm")
    .map((p) => createOsmAdapter(p));
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
/** Največja površina viewporta (deg²) — ~6°×6° (celotna Slovenija ×4). */
const MAX_BBOX_AREA = 36;

export function parseSupplyQuery(params: {
  bbox?: string | null;
  zoom?: string | null;
  cats?: string | null;
  date?: string | null;
  pax?: string | null;
  locale?: string | null;
}): ParsedSupplyQueryResult {
  const locale: "sl" | "en" = params.locale === "en" ? "en" : "sl";

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
    if ((n - s) * (e - w) > MAX_BBOX_AREA) return { ok: false, error: "bbox-area" };
    bbox = [s, w, n, e];
  }

  const zoom = clampZoom(Number(params.zoom ?? "8"));

  let cats: ProductType[] = [];
  if (params.cats) {
    for (const raw of params.cats.split(",")) {
      const t = raw.trim();
      if (t && isProductType(t)) cats.push(t);
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

  // 2+3) Izvedba AKTIVNIH adapterjev izolirano.
  const runnable = adapters.filter((a) => {
    const z = Math.floor(zoom);
    if (z < a.entry.minZoom) return false;
    // Adapter se kliče, če prekriva vsaj eno VIDNO kategorijo (ali so
    // kategorije prazne zaradi nizkega zoom-a → nikomur ni treba teči).
    if (visibleCats.length === 0) return false;
    return a.entry.types.some((t) => visibleCats.includes(t));
  });

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

  // Neizvedeni aktivni adapterji (zoom prag / kategorije) — transparentno
  // poročamo, da se niso pognali ZARADI gatinga (ne kot napaka).
  for (const a of adapters) {
    if (runnable.includes(a)) continue;
    adaptersInfo.push({
      slug: a.entry.slug,
      status: a.entry.status,
      ok: true,
      ms: 0,
      count: 0,
      cached: false,
      note: "zoom-gated",
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
