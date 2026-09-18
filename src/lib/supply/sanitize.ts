// ============================================================================
// TRAVEL SUPPLY MAP — SANITIZE IZBRANIH PRODUKTOV ZA AI (F1, 1.49.0)
// ============================================================================
// selectedProviderProducts[] gre OD KLIENTA v /api/itinerary → to je
// meja zaupanja (isti vzorec kot preferredDestinations clean v isti
// routi). Tu: provider whitelist (register), enumi, dolžine, cene,
// datumi. bookingUrl IZRECNO odstranimo — rezervacija teče prek /go ob
// kliku, ne prek AI prompta (površina za injekcijo URL-jev ostaja zaprta).
// ============================================================================

import { isProviderSlug } from "./registry";
import { isProductType } from "./taxonomy";
import type {
  PriceInfo,
  ProductType,
  ProviderSlug,
  SelectedProviderProduct,
  SelectionState,
} from "./types";

/** Največje št. izbranih produktov v enem načrtu. */
export const MAX_SELECTED_PRODUCTS = 20;
const MAX_TITLE = 120;
const MAX_SOURCE = 60;
const MAX_LOCATION_NAME = 80;
const MAX_PRICE = 100_000;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function sanitizePrice(raw: unknown): PriceInfo | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const p = raw as Partial<PriceInfo>;
  if (typeof p.amount !== "number" || !Number.isFinite(p.amount)) return undefined;
  if (p.amount <= 0 || p.amount > MAX_PRICE) return undefined;
  const unit =
    p.unit === "total" ||
    p.unit === "per_person" ||
    p.unit === "per_day" ||
    p.unit === "per_vehicle"
      ? p.unit
      : undefined;
  if (!unit) return undefined;
  return { amount: Math.round(p.amount * 100) / 100, currency: "EUR", unit };
}

function sanitizeDate(raw: unknown): string | undefined {
  return typeof raw === "string" && ISO_DATE_RE.test(raw) && !Number.isNaN(Date.parse(raw))
    ? raw
    : undefined;
}

/**
 * Validacija + sanitizacija seznama izbranih produktov (vhod: unknown).
 * Napačni vnosi se TIHO odstranijo (isti vzorec kot preferredDestinations).
 */
export function sanitizeSelectedProviderProducts(
  input: unknown
): SelectedProviderProduct[] {
  if (!Array.isArray(input)) return [];
  const out: SelectedProviderProduct[] = [];
  const seen = new Set<string>();

  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    if (out.length >= MAX_SELECTED_PRODUCTS) break;
    const p = raw as Partial<SelectedProviderProduct>;

    if (!isProviderSlug(p.provider)) continue;
    if (typeof p.providerProductId !== "string" || p.providerProductId.length === 0 || p.providerProductId.length > 80) {
      continue;
    }
    if (!isProductType(p.type)) continue;
    if (typeof p.title !== "string" || p.title.trim().length === 0) continue;

    const key = `${p.provider}:${p.providerProductId}`;
    if (seen.has(key)) continue; // dedupe (isti produkt dvakrat)

    const lat = typeof p.lat === "number" && Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 ? p.lat : undefined;
    const lng = typeof p.lng === "number" && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180 ? p.lng : undefined;

    const selectionState: SelectionState =
      p.selectionState === "fixed" || p.selectionState === "preferred" || p.selectionState === "suggested"
        ? p.selectionState
        : "fixed"; // privzeto: uporabnikova izbira je OBVEZNA

    const dates = (p.dates && typeof p.dates === "object")
      ? {
          start: sanitizeDate((p.dates as { start?: unknown }).start),
          end: sanitizeDate((p.dates as { end?: unknown }).end),
        }
      : undefined;

    seen.add(key);
    out.push({
      provider: p.provider as ProviderSlug,
      providerProductId: p.providerProductId.slice(0, 80),
      type: p.type as ProductType,
      title: p.title.trim().slice(0, MAX_TITLE),
      lat,
      lng,
      locationName:
        typeof p.locationName === "string" && p.locationName.trim().length > 0
          ? p.locationName.trim().slice(0, MAX_LOCATION_NAME)
          : undefined,
      price: sanitizePrice(p.price),
      dates: dates && (dates.start || dates.end) ? dates : undefined,
      source:
        typeof p.source === "string" && p.source.trim().length > 0
          ? p.source.trim().slice(0, MAX_SOURCE)
          : "Supply Map",
      // bookingUrl NAMENOMA izpuščen — rezervacija gre prek /go ob kliku.
      selectionState,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// AI KONTEKST — strukturiran blok (ne samo tekst; zahteva naročnika)
// ---------------------------------------------------------------------------

/**
 * Zgradi strukturiran blok za AI prompt iz izbranih produktov.
 * FIXED: AI NE SME zamenjati izdelka s podobnim (izbrani hotel ostane
        TA hotel) — izrecno pravilo v obeh jezikih.
 */
export function buildSelectedProductsContext(
  products: SelectedProviderProduct[],
  lang: "sl" | "en"
): string {
  if (products.length === 0) return "";

  const fmtPrice = (p: PriceInfo | undefined): string =>
    p ? `€${p.amount} (${p.unit.replace("_", " ")})` : "-";

  const lines = products.map((p, i) => {
    const geo =
      p.lat != null && p.lng != null
        ? `lat=${p.lat.toFixed(5)}, lng=${p.lng.toFixed(5)}`
        : p.locationName || "no-geo";
    const dates = p.dates?.start
      ? `, dates: ${p.dates.start}${p.dates.end ? `→${p.dates.end}` : ""}`
      : "";
    return `${i + 1}. [${p.selectionState.toUpperCase()}] ${p.title} — provider: ${p.provider}, id: ${p.providerProductId}, type: ${p.type}, geo: ${geo}, price: ${fmtPrice(p.price)}${dates}`;
  });

  if (lang === "en") {
    return `
USER-SELECTED PRODUCTS (from the Travel Supply Map — structured selection, NOT text):
${lines.join("\n")}

SELECTION SEMANTICS (MANDATORY):
- FIXED products MUST be included in the itinerary EXACTLY as selected — the SAME product (same title and provider id). Do NOT replace a FIXED product with a similar venue: if the user selected a specific hotel, that hotel stays; if a specific tour, that tour stays. Schedule it on the most fitting day (respect its dates if given).
- PREFERRED products: include unless there is a strong reason not to (state the reason in notes).
- SUGGESTED products: include only if they fit the traveler's interests and pace.
- For products with coordinates, set destination_id to the product id ("${"{provider}:{providerProductId}"}"), include lat/lng fields and mention the provider and price (if any) in notes.
- For products WITHOUT coordinates (e.g. insurance, eSIM, flights), do NOT force them as stops — reference them in recommendations/notes instead.
`;
  }
  return `
IZBRANI PRODUKTI UPORABNIKA (iz zemljevida ponudbe — strukturirana izbira, NE tekst):
${lines.join("\n")}

SEMANTIKA IZBIRE (OBVEZNO):
- FIXED produkti MORAJO biti v itinererju NATANKO tako, kot so izbrani — ISTI produkt (isti naslov in provider id). NE zamenjuj FIXED produkta s podobnim lokalom: če je uporabnik izbral določen hotel, ostane TA hotel; če določeno turo, ostane TA tura. Razporedi ga v najbolj primeren dan (upoštevaj datume, če so podani).
- PREFERRED produkti: vključi, razen če imaš močen razlog (razlog navedi v notes).
- SUGGESTED produkti: vključi samo, če ustrezajo interesom in tempu potnika.
- Pri produktih s koordinatami nastavi destination_id na id produkta ("${"{provider}:{providerProductId}"}"), vključi polji lat/lng ter v notes omeni ponudnika in ceno (če obstaja).
- Pri produktih BREZ koordinat (npr. zavarovanje, eSIM, leti) jih NE sil kot postanke — omeni jih v recommendations/notes.
`;
}
