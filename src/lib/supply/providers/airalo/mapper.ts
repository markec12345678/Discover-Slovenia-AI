// ============================================================================
// TRAVEL SUPPLY MAP — AIRALO: KANONSKA PRESLIKAVA (Task 53, 1.58.0)
// ============================================================================
// AiraloPackagesResponse → ProviderProduct (tip "esim"). Kanonski model
// se NE spremeni — vse airalo specifike ostanejo v tej mapi (izjema po
// arhitekturi: (provider, providerProductId) JE ključ nazaj pri ponudniku).
//
// PRESLIKAVA (vsaka odločitev dokumentirana iz vira):
//  - type:            vedno "esim" (državni eSIM paketi vira)
//  - geo:             pin = KANONSKI center Slovenije {46.15, 14.47},
//                     geoPrecision "country" — ISKRENA predstavitev
//                     DRŽAVNEGA produkta (eSIM pokriva državo, ne točko;
//                     isti kanonski center SI že uporablja viator
//                     destinations fallback). Koordinate NISO iz odgovora
//                     vira (packages jih nimajo) — to je dokumentirana
//                     kanonska odločitev, NE izmišljena točka.
//  - title:           title vira + volume + days (surovi podatki vira;
//                     naša oznaka „dni"/„days" je LASTNA).
//  - cena:            POŠTENA ODLOČITEV VALUTE [DOCUMENTED-ASSUMPTION]:
//     dokumentacija navaja net_price v USD. Preslikamo ceno SAMO kadar
//     vir IZRECNO poda currency === "EUR" (velike/male črke). Vse
//     drugače (USD, odsotna valuta) → ceno IZPUSTIMO (price undefined)
//     + opomba v opisu — NIKOLI ne pretvarjamo (brez tečaja NI poštene
//     konverzije; iznos v EUR bi bila LAŽ). Prednost polj: net_price,
//     nato amount (samo numerično, > 0 — NIKOLI 0 kot lažna cena).
//  - razpoložljivost: "unknown" (vir koncept ima — nakup pri ponudniku;
//     NE preverjamo) — NIKOLI "available"
//  - slika:           image[] vira — prvi https URL (sicer BREZ slike)
//  - bookingMode:     affiliate_redirect; bookingUrl = /go/esim
//                     (obstoječa affiliate ruta — NAŠA konstrukcija)
//  - licenca:         "Airalo Partner API" / "© Airalo"
// ============================================================================

import type { ProviderProduct } from "../../types";
import type { AiraloPackage, AiraloPackagesResponse } from "./types";
import { isAiraloPackage } from "./types";

/** Kapica rezultatov adapterja (gostota pod nadzorom). */
export const AIRALO_MAX_RESULTS = 48;

/** Kanonski center Slovenije (isti center kot viator fallback). */
export const AIRALO_SI_CENTER = { lat: 46.15, lng: 14.47 } as const;

/** Opomba cene EUR (limit sanitize MAX_NOTE=60). */
const PRICE_NOTE = {
  sl: "cena paketa eSIM (skupaj)",
  en: "eSIM package price (total)",
} as const;

/** Opomba ob izpuščeni ceni (valuta vira NI EUR). */
const CURRENCY_NOTE = {
  sl: "cena v USD pri viru (konverzija ob aktivaciji)",
  en: "price in USD at source (conversion on activation)",
} as const;

const AVAILABILITY_NOTE = {
  sl: "razpoložljivost se preveri pri ponudniku",
  en: "availability confirmed with the provider",
} as const;

// ---------------------------------------------------------------------------
// ČIŠČENJE BESEDILA NEZAUPANEGA VIRA (§22 — isti vzorec kot viator mapper:
// React escaping je DRUGA plast, meja adapterja je PRVA — namerno OBA)
// ---------------------------------------------------------------------------

const TITLE_MAX_LEN = 200;
const DESCRIPTION_MAX_LEN = 1200;

/** Očisti prosti tekst vira (kontrolni znaki + injekcijski nabor). */
function cleanAiraloText(raw: string, maxLen: number): string {
  return raw
    // kontrolni znaki (vključno DEL) — lomijo izris/dnevnike
    .replace(/[\u0000-\u001f\u007f]/g, "")
    // HTML/js injekcijski znaki (enak nabor kot viator cleanViatorText)
    .replace(/[<>"'`{}$\\]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

// ---------------------------------------------------------------------------
// SLIKA — image[] vira (prvi https URL; sicer BREZ)
// ---------------------------------------------------------------------------

/** Izlušči prvi https URL slike iz image polja vira [ASSUMPTION oblika]. */
function pickPackageImageUrl(image: unknown): string | undefined {
  if (!Array.isArray(image)) return undefined;
  for (const entry of image) {
    if (!entry || typeof entry !== "object") continue;
    const url = (entry as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    const trimmed = url.trim();
    if (trimmed.length === 0 || trimmed.length > 1000) continue;
    if (!trimmed.startsWith("https://")) continue;
    try {
      return new URL(trimmed).toString();
    } catch {
      // neveljaven URL → poskusi naslednji vnos
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// CENA — POŠTENA ODLOČITEV (nikoli lažna konverzija)
// ---------------------------------------------------------------------------

interface ResolvedPrice {
  amount: number;
}

/**
 * Cena paketa SAMO kadar vir IZRECNO potrjuje EUR (currency polje).
 * Prednost: net_price (dokumentirano ime polja), nato amount. Vrača
 * undefined → ceno izpustimo + opomba v opisu (glej CURRENCY_NOTE).
 */
function resolveEurPrice(pkg: AiraloPackage): ResolvedPrice | undefined {
  const currency =
    typeof pkg.currency === "string" ? pkg.currency.trim().toLowerCase() : "";
  if (currency !== "eur") return undefined;
  const candidates = [pkg.net_price, pkg.amount];
  for (const c of candidates) {
    if (
      typeof c === "number" &&
      Number.isFinite(c) &&
      c > 0
    ) {
      return { amount: Math.round(c * 100) / 100 };
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// GLAVNA PRESLIKAVA
// ---------------------------------------------------------------------------

export interface AiraloMapperContext {
  locale: "sl" | "en";
  /** ISO čas uspešnega pridobitve od vira (semantika lastUpdated). */
  fetchedAt: string;
}

export interface AiraloMapResult {
  products: ProviderProduct[];
  skipped: number;
  /** Npr. "capped" (presežena zgornja meja rezultatov). */
  note?: string;
}

/**
 * Preslikaj pakete eSIM v kanonske produktne zapise. STRICT fail-closed:
 * zapis brez veljavnega id-ja ALI naslova se PRESKOČI in prešteje —
 * nikoli delno izmišljen. Cena je opcijska (SAMO ob potrjeni EUR valuti
 * vira — nikoli pretvorba, nikoli 0 kot lažna cena).
 */
export function mapAiraloPackages(
  raw: AiraloPackagesResponse,
  ctx: AiraloMapperContext
): AiraloMapResult {
  const { locale, fetchedAt } = ctx;
  const packages = Array.isArray(raw.data) ? raw.data : [];

  const products: ProviderProduct[] = [];
  let skipped = 0;
  let capped = false;

  const countryName = locale === "en" ? "Slovenia" : "Slovenija";

  for (const item of packages) {
    if (products.length >= AIRALO_MAX_RESULTS) {
      // Presežene kapice: preostali veljavni zapisi se zavrnejo (iskren
      // števec skipped + opomba "capped").
      capped = true;
      skipped++;
      continue;
    }
    if (!isAiraloPackage(item)) {
      skipped++;
      continue;
    }

    // === Naslov: naslov vira + volume/days (surovi podatki) ===
    const baseTitle = cleanAiraloText(item.title, TITLE_MAX_LEN);
    if (baseTitle.length === 0) {
      skipped++;
      continue;
    }
    const parts: string[] = [baseTitle];
    if (typeof item.volume === "string" && item.volume.trim().length > 0) {
      parts.push(cleanAiraloText(item.volume, 40));
    }
    if (
      typeof item.days === "number" &&
      Number.isFinite(item.days) &&
      item.days > 0
    ) {
      parts.push(`${Math.round(item.days)}${locale === "en" ? " days" : " dni"}`);
    }
    const title = cleanAiraloText(parts.join(" · "), TITLE_MAX_LEN);

    // === Cena (SAMO ob potrjeni EUR valuti vira — sicer izpust) ===
    const price = resolveEurPrice(item);

    // === Opis: IZKLJUČNO iz podatkov vira + lastne oznake ===
    const descParts: string[] = [];
    if (
      typeof item.description === "string" &&
      item.description.trim().length > 0
    ) {
      descParts.push(cleanAiraloText(item.description, DESCRIPTION_MAX_LEN));
    }
    const typeLabel =
      item.type === "local"
        ? locale === "en"
          ? "Local package"
          : "Lokalni paket"
        : item.type === "regional"
          ? locale === "en"
            ? "Regional package"
            : "Regionalni paket"
          : item.type === "global"
            ? locale === "en"
              ? "Global package"
              : "Globalni paket"
            : null;
    if (typeLabel) descParts.push(typeLabel);
    if (item.is_unlimited === true) {
      descParts.push(
        locale === "en" ? "Unlimited data" : "Neomejen prenos podatkov"
      );
    }
    if (!price) {
      // Iskrena opomba: cena obstaja pri viru, a v nereprezentativni
      // valuti (dokumentirano USD) — NE pretvarjamo brez tečaja.
      descParts.push(CURRENCY_NOTE[locale]);
    }
    const description =
      descParts.length > 0
        ? descParts.join("\n").slice(0, DESCRIPTION_MAX_LEN)
        : undefined;

    // === Slika (image[] vira — prvi https) ===
    const image = pickPackageImageUrl(item.image);

    const product: ProviderProduct = {
      id: `airalo:${String(item.id)}`,
      provider: "airalo",
      providerProductId: String(item.id),
      type: "esim",
      title,
      ...(description ? { description } : {}),
      // geo: KANONSKI center SI — geoPrecision "country" (državni paket)
      lat: AIRALO_SI_CENTER.lat,
      lng: AIRALO_SI_CENTER.lng,
      geoPrecision: "country" as const,
      address: countryName,
      ...(image ? { image, imageCredit: "© Airalo" } : {}),
      ...(price
        ? {
            price: {
              amount: price.amount,
              currency: "EUR" as const,
              unit: "total" as const,
              note: PRICE_NOTE[locale],
            },
          }
        : {}),
      availability: {
        status: "unknown" as const,
        note: AVAILABILITY_NOTE[locale],
      },
      bookingMode: "affiliate_redirect" as const,
      // NAŠA konstrukcija (CTA arhitektura teče prek /go — obstoječa
      // affiliate ruta /go/esim razreši sledenje).
      bookingUrl: "/go/esim",
      lastUpdated: fetchedAt,
      license: {
        source: "Airalo Partner API",
        attribution: "© Airalo",
      },
    };

    products.push(product);
  }

  return {
    products,
    skipped,
    ...(capped ? { note: "capped" } : {}),
  };
}
