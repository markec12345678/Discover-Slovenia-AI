// ============================================================================
// TRAVEL SUPPLY MAP — TRAVELPAYOUTS: POGODBENE VRSTE (TASK 53, 1.58.0)
// ============================================================================
// VRSTE SO PRESLIKANE IZ JAVNO DOKUMENTIRANE sheme Travelpayouts Data API
// (support.travelpayouts.com/hc/en-us/categories/200358578-API-and-data +
// ogledala travelpayouts.github.io — prebrano 19. 9. 2026). Polja, ki jih
// dokumentacija ne definira za ta odgovor, so OPCIJSKA — nikoli jih ne
// izmišljujemo.
//
// POGODBA:
//  - LIVE-VERIFIED (curl, 19. 9. 2026): GET
//    https://api.travelpayouts.com/aviasales/v3/prices_for_dates?origin=LJU
//    &destination=CDG&currency=eur → HTTP 401 „Unauthorized“ BREZ žetona
//    (vrata so ŽIVA in odklonijo nepooblaščene klice).
//  - Auth (DOCUMENTED — support.travelpayouts.com): žeton v glavi
//    „X-Access-Token“ ALI v query parametru „token“. Mi uporabljamo GLAVO
//    (žeton NE konča v URL-ju/dnevnikih). Žeton je SELF-SERVE:
//    travelpayouts.com/developers/api po registraciji računa → provider je
//    NOT_CONFIGURED (ne „partner-approval“).
//  - Endpoint /aviasales/v3/prices_for_dates (DOCUMENTED): query parametri
//    origin (IATA), destination (IATA), currency (eur), departure_at
//    (YYYY-MM ali YYYY-MM-DD), return_at, direct (true/false), limit
//    (default 30), sorting (price), one_way (true).
//  - Odgovor (DOCUMENTED): {"success": true, "data": [ … ], "currency":
//    "eur", …}. Elementi „data“ so spodaj tipizirani.
//  - SEMANTIKA CEN (DOCUMENTED, pomembno za iskrenost): Data API streže
//    PREDPOMNJENE najnižje cene (agregirane/predpomnjene pri viru) — to
//    NISO živi citati. Preslikava to odkriva v price.note.
// ============================================================================

/** Element data[] — predpomnjena najcenejša povezava za datum. */
export interface TravelpayoutsPriceItem {
  /** IATA mesta izhodišča (npr. „LJU“) — KRITIČNO polje. */
  origin: string;
  /** IATA mesta cilja (npr. „CDG“) — KRITIČNO polje. */
  destination: string;
  /** IATA specifičnega letališča izhodišča (npr. „CDG“ za Pariz). */
  origin_airport?: string;
  /** IATA specifičnega letališča cilja. */
  destination_airport?: string;
  /** Cena (število v valuti odgovora — zahtevamo eur). 0/undefined NI cena. */
  price?: number;
  /** Letalska družba (IATA koda, npr. „AF“). */
  airline?: string;
  /** Številka leta (npr. „1234“). */
  flight_number?: string;
  /** ISO datum/čas odhoda (npr. „2026-10-01T09:35:00+03:00“). */
  departure_at?: string;
  /** ISO datum/čas povratka (samo pri povratnih iskanjih — mi vprašamo one_way). */
  return_at?: string;
  /** Št. prestopov v smeri tja. */
  transfers?: number;
  /** Št. prestopov nazaj (povratna smer). */
  return_transfers?: number;
  /** Skupno trajanje v MINUTAH (DOCUMENTED-ASSUMPTION: enota minute — ni
   *  izrecno zapisana v primeru odgovora; preslikamo SAMO kot besedilo). */
  duration?: number;
  /** Trajanje v smeri tja (minute — isti DOCUMENTED-ASSUMPTION). */
  duration_to?: number;
  /** RELATIVNA pot iskanja pri viru („/search/…“) — NE uporabimo (glej mapper). */
  link?: string;
}

/** Odgovor GET /aviasales/v3/prices_for_dates (dokumentirana oblika). */
export interface TravelpayoutsPricesResponse {
  success: boolean;
  data: TravelpayoutsPriceItem[];
  /** Valuta cen odgovora (zahtevamo „eur“ — sicer cene NE preslikamo). */
  currency?: string;
  /** Ostala polja odgovora (_metadata …) NE uporabljamo. */
}

/** Query parametri endpointa (podnabor, ki ga adapter pošlje). */
export interface TravelpayoutsPricesParams {
  origin: string;
  destination: string;
  currency: string;
  one_way: boolean;
  sorting: string;
  limit: number;
  /** YYYY-MM-DD (datum uporabnika) ali YYYY-MM — kadar znan. */
  departure_at?: string;
}

// ---------------------------------------------------------------------------
// FAIL-SAFE VARNOSTNI VZORCI (isti vzorec kot viator/types.ts — Task 44 §4:
// en slab zapis NE sme podreti celotne plasti)
// ---------------------------------------------------------------------------

/**
 * IATA koda mesta: 3 črke (A–Z, obrambno sprejmemo male — normaliziramo v
 * mapperju). Krajše/daljše/neresnične vhode ZAVRNEMO (fail-closed).
 */
export const IATA_CODE_RE = /^[A-Za-z]{3}$/;

/**
 * Minimalna veljavnost elementa: origin + destination (IATA) — BREZ teh
 * dveh polj povezava NI določljiva (produkt ne obstaja) → zapis odpade +
 * števec skipped. Vsa ostala polja so opcijska: manjkajoča cena pomeni
 * produkt BREZ cene (NE izmišljujemo 0), manjkajoč departure_at pomeni
 * manj določen ID (hash zadostni v mapperju).
 */
export function isTravelpayoutsPriceItem(v: unknown): v is TravelpayoutsPriceItem {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<TravelpayoutsPriceItem>;
  return (
    typeof p.origin === "string" &&
    IATA_CODE_RE.test(p.origin.trim()) &&
    typeof p.destination === "string" &&
    IATA_CODE_RE.test(p.destination.trim())
  );
}

/** Obrambno preverjanje seznama elementov (slabi odpadejo + števec). */
export function filterValidPriceItems(
  raw: unknown
): { valid: TravelpayoutsPriceItem[]; skipped: number } {
  if (!Array.isArray(raw)) return { valid: [], skipped: 0 };
  const valid: TravelpayoutsPriceItem[] = [];
  let skipped = 0;
  for (const item of raw) {
    if (isTravelpayoutsPriceItem(item)) valid.push(item);
    else skipped++;
  }
  return { valid, skipped };
}
