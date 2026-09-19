// ============================================================================
// TRAVEL SUPPLY MAP — AIRALO: POGODBENE VRSTE (Task 53, 1.58.0)
// ============================================================================
// VRSTE SO PRESLIKAVE IZ URADNE DOKUMENTACIJE Airalo Partner API v2
// (developers.partners.airalo.com / Airalo zendesk). Polja, ki jih
// dokumentacija ne definira, so OPCIJSKA — nikoli jih ne izmišljujemo.
//
// POGODBA (stanje preverbe, 19. 9. 2026):
//  - Produkcija: https://api.airalo.com [DOCUMENTED — DNS-blokirana s
//    tega peskovnika (dokumentirana omeitev okolja, NE pogodbena
//    dejstva)]
//  - Sandbox: https://sandbox.airalo.com [LIVE-VERIFIED]
//  - GET /api/v2/countries → 200 PRAVI JSON SEZNAM (GOLI array, brez
//    ovoja data — LIVE-VERIFIED danes na sandboxu: id, slug, title,
//    image{width,height,url}, seo, package_count, location_illustration,
//    title_en, is_banned)
//  - GET /api/v2/packages?country_slug=… [DOCUMENTED-ASSUMPTION —
//    sandbox brez žetona vrne HTML 404 (route zahteva auth); oblika
//    paketov je iz uradne dokumentacije "Get Packages v2", NE živo
//    preverjena → STRICT fail-closed mapper + PONOVNO PREVERI ob
//    aktivaciji poverilnic]
//  - Auth: OAuth2 client credentials — POST žetonski endpoint s
//    client_id + client_secret → {"data":{"access_token":…,
//    "token_type":"Bearer","expires_in":…}} [DOCUMENTED; natančna pot
//    žetona je portalno dokumentirana, NE preverjena s peskovnika —
//    uporabljamo "/api/v2/oauth/token" kot dokumentirano konstanto]
// ============================================================================

/** Država iz GET /api/v2/countries — LIVE-VERIFIED oblika (sandbox). */
export interface AiraloCountry {
  id: number;
  slug: string;
  title: string;
  image?: { width?: number; height?: number; url?: string } | null;
  seo?: unknown;
  package_count?: number;
  location_illustration?: unknown;
  title_en?: string;
  /** null = ni suspendirana (LIVE-VERIFIED: null za aktivne države). */
  is_banned?: boolean | null;
}

/** GET /api/v2/countries — GOLI JSON array (LIVE-VERIFIED, brez ovoja). */
export type AiraloCountryListResponse = AiraloCountry[];

/**
 * Paket eSIM iz GET /api/v2/packages — DOCUMENTED-ASSUMPTION oblika
 * (uradna dokumentacija "Get Packages v2"; NE živo preverjena — sandbox
 * brez žetona = 404). STRICT mapper: manjkajoča kritična polja (id,
 * title) → zapis PRESKOČEN in preštet, NIKOLI delno izmišljen.
 */
export interface AiraloPackage {
  id: number | string;
  slug?: string;
  title?: string;
  description?: string;
  /**
   * Neto cena partnerja [DOCUMENTED: v USD po dokumentaciji —
   * DOCUMENTED-ASSUMPTION]. Preslikamo JOŽ samo, če vir poda
   * currency === "EUR" (nikoli NE pretvarjamo — glej mapper).
   */
  net_price?: number;
  /** Druga numerična cenovna polja vira (isti varnostni predpogoj). */
  amount?: number;
  /** Valuta cenovnih polj vira (kdaj jo vir poda). */
  currency?: string;
  days?: number;
  volume?: string;
  is_unlimited?: boolean;
  type?: "local" | "regional" | "global" | string;
  country?: unknown;
  image?: unknown;
  created_at?: string;
}

/** GET /api/v2/packages — odgovor z ovojem data [DOCUMENTED-ASSUMPTION]. */
export interface AiraloPackagesResponse {
  data?: AiraloPackage[];
}

/** Odgovor žetonskega endpointa [DOCUMENTED]. */
export interface AiraloTokenResponse {
  data?: {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/types.ts — en slab
// zapis NE sme podreti celotne plasti; §22 meja zaupanja na VHODU)
// ---------------------------------------------------------------------------

/** Veljavna država iz seznama (id + slug — drugo je opcijsko). */
export function isAiraloCountry(v: unknown): v is AiraloCountry {
  if (!v || typeof v !== "object") return false;
  const c = v as Partial<AiraloCountry>;
  return (
    typeof c.id === "number" &&
    Number.isFinite(c.id) &&
    c.id > 0 &&
    typeof c.slug === "string" &&
    c.slug.trim().length > 0
  );
}

/**
 * Veljaven paket: id (številčen ali neprazen niz) + neprazen naslov.
 * Brez teh kritičnih polj zapis ODPADe (preštet v skipped).
 */
export function isAiraloPackage(
  v: unknown
): v is AiraloPackage & { title: string } {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<AiraloPackage>;
  const idOk =
    (typeof p.id === "number" && Number.isFinite(p.id) && p.id > 0) ||
    (typeof p.id === "string" && p.id.trim().length > 0 && p.id.length <= 100);
  const titleOk = typeof p.title === "string" && p.title.trim().length > 0;
  return idOk && titleOk;
}
