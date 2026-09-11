import { DESTINATIONS } from "./slovenia-data";

// ============================================================================
// AFFILIATE MONETIZACIJA — strežniška konfiguracija (fail-closed)
// ============================================================================
//
// NAČELA (affiliate hardening, 2026-09):
// 1. ID-ji ŽIVIJO SAMO v strežniških env spremenljivkah (NIKOLI NEXT_PUBLIC_,
//    nikoli hardcoded v komponentah). Vsa generiranja URL-jev potekajo
//    strežniško (route /go/[provider], cron emaili) — klient dobi samo /go/.
// 2. FAIL-CLOSED: če partnerjev ID ni nastavljen, NE izmišljemo privzetka
//    ("slovenia-demo", "1234567" — odstranjeno!). Povezava pelje na čisto
//    partnerjevo stran (uporabna vrednost) in se izrecno označi
//    monetized:false v analitiki — nikoli "affiliate-looking link", ki bi
//    pretentaval sledenje.
// 3. PARAMETRI SOPOJO Z URADNO DOKUMENTACIJO (vir naveden pri vsakem
//    partnerju; spodaj v glavah funkcij).
//
// ENV SPREMENLJIVKE (.env.example vsebuje razlage):
//   DISCOVERCARS_AFFILIATE_CODE    → a_aid
//   BOOKING_AFFILIATE_ID           → aid
//   GETYOURGUIDE_PARTNER_ID        → partner_id
//   SKYSCANNER_MEDIA_PARTNER_ID    → mediaPartnerId
//   WORLDNOMADS_AFFILIATE_URL      → celoten tracking URL (program teče na CJ)
// ============================================================================

export const AFFILIATE_PROVIDERS = ["hotels", "cars", "activities", "flights", "insurance"] as const;
export type AffiliateProvider = (typeof AFFILIATE_PROVIDERS)[number];

export interface PartnerUrlResult {
  /** Končni URL za preusmeritev (vedno https, vedno dovoljen host). */
  url: string;
  /** true SAMO kadar je partnerjev tracking dejansko konfiguriran. */
  monetized: boolean;
}

export interface PartnerStatus {
  configured: boolean;
  /** Ime env spremenljivke, ki poganja partnerja (za admin/dashboard). */
  envVar: string;
}

/** Privzeti datumi (14 dni naprej) — enako obnašanje kot prej. */
function defaultDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}

// ----------------------------------------------------------------------------
// CANONICAL DESTINACIJSKA WHITELISTA (FAZA 5)
// ----------------------------------------------------------------------------
// Slepo "${dest}" v partner URL NE SME priti mimo whitelist — če dest ne
// ustreza nobeni znani slovenski destinaciji, uporabimo kanonski fallback
// "Slovenija" (partner-approve generična destinacija). Tako nikoli ne more
// priti do arbitrary URL/path injectiona v partnerjev naslov.

const CANONICAL_FALLBACK = "Slovenija";

/** Ujemanje po slugu ALI imenu (case-insensitive) → kanonično ime, sicer fallback. */
export function canonicalDest(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return CANONICAL_FALLBACK;
  const needle = trimmed.toLowerCase();
  const match = DESTINATIONS.find(
    (d) => d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  );
  return match ? match.name : CANONICAL_FALLBACK;
}

/** Ali je dest prepoznan (NE fallback)? Za teste/diagnostiko. */
export function isKnownDest(raw: string): boolean {
  const needle = raw.trim().toLowerCase();
  return DESTINATIONS.some(
    (d) => d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  );
}

/**
 * Skyscanner destinacijski slug: whitelist slug iz slovenia-data, z IATA
 * override za mesta z lastnim letališčem (dokumentirani format uporablja
 * IATA kode — developers.skyscanner.net/docs/referrals/flights-parameters).
 * Neznan vnos → "lju" (edino mednarodno letališče v državi).
 */
const SKYSCANNER_IATA: Record<string, string> = {
  ljubljana: "lju",
  "nova-gorica": "lju",
  maribor: "lju",
};
function skyscannerSlug(raw: string): string {
  const needle = raw.trim().toLowerCase();
  const match = DESTINATIONS.find(
    (d) => d.slug.toLowerCase() === needle || d.name.toLowerCase() === needle,
  );
  if (!match) return SKYSCANNER_IATA.ljubljana;
  return SKYSCANNER_IATA[match.slug] ?? match.slug;
}

// ----------------------------------------------------------------------------
// STATUS PARTNERJEV (FAZA 3 + FAZA 15)
// ----------------------------------------------------------------------------

export function affiliateStatus(): Record<AffiliateProvider, PartnerStatus> {
  return {
    hotels: {
      configured: Boolean(process.env.BOOKING_AFFILIATE_ID?.trim()),
      envVar: "BOOKING_AFFILIATE_ID",
    },
    cars: {
      configured: Boolean(process.env.DISCOVERCARS_AFFILIATE_CODE?.trim()),
      envVar: "DISCOVERCARS_AFFILIATE_CODE",
    },
    activities: {
      configured: Boolean(process.env.GETYOURGUIDE_PARTNER_ID?.trim()),
      envVar: "GETYOURGUIDE_PARTNER_ID",
    },
    flights: {
      configured: Boolean(process.env.SKYSCANNER_MEDIA_PARTNER_ID?.trim()),
      envVar: "SKYSCANNER_MEDIA_PARTNER_ID",
    },
    insurance: {
      configured: isValidHttpsUrl(process.env.WORLDNOMADS_AFFILIATE_URL?.trim() || ""),
      envVar: "WORLDNOMADS_AFFILIATE_URL",
    },
  };
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.includes(".");
  } catch {
    return false;
  }
}

// ----------------------------------------------------------------------------
// GENERIRANJE PARTNER URL-jev (FAZA 3-5)
// ----------------------------------------------------------------------------

/**
 * Booking.com — klasični affiliate tracking z `aid` (Affiliate ID).
 * Vir: affiliates.support.booking.com — "An affiliate link includes a unique
 * Affiliate ID (AID), which allows Booking.com to track reservations made
 * through your link and credit commissions accordingly."
 * Deep-link: searchresults.html?ss=<destinacija>&aid=<ID>.
 * Program v2 se registrira prek uradnih affiliate omrežij (partnerhub);
 * aid mehanizem ostaja dokumentiran način sledenja povezav.
 *
 * NOT_CONFIGURED fallback: čista Booking iskalna stran BREZ aid parametra.
 */
export function getBookingUrl(destination: string): PartnerUrlResult {
  const aid = process.env.BOOKING_AFFILIATE_ID?.trim();
  const dest = canonicalDest(destination);
  const params = new URLSearchParams({
    ss: dest,
    lang: "sl",
    group_adults: "2",
    no_rooms: "1",
    selected_currency: "EUR",
  });
  if (aid) params.set("aid", aid);
  return {
    url: `https://www.booking.com/searchresults.html?${params.toString()}`,
    monetized: Boolean(aid),
  };
}

/**
 * DiscoverCars — tracking parameter je `a_aid` (affiliate aid).
 * Vir: uradna programska stran (discovercars.com/affiliate) navaja "each link
 * contains a unique tracking code"; realne affiliate povezave uporabljajo
 * ?a_aid=<username> (preverjeno na več živih partnerskih povezavah).
 * Pozor: `?affiliate=` ni njihov tracking parameter (odstranjeno — bila je
 * mrtva sledilka).
 * Provizija: 70 % DiscoverCarsovega dobička pri najemu + 30 % pri Full
 * Coverage (T&C 3.1) — procenat dobička, NE vrednosti rezervacije.
 * Piškot: 365 dni.
 *
 * NOT_CONFIGURED fallback: čista iskalna stran BREZ a_aid.
 */
export function getDiscoverCarsUrl(pickupLocation: string): PartnerUrlResult {
  const code = process.env.DISCOVERCARS_AFFILIATE_CODE?.trim();
  const dest = canonicalDest(pickupLocation);
  const params = new URLSearchParams({
    pickuplocation: dest,
    pickupdate: defaultDate(14),
    returndate: defaultDate(21),
    driverage: "25",
    language: "en",
    currency: "EUR",
  });
  if (code) params.set("a_aid", code);
  return {
    url: `https://www.discovercars.com/?${params.toString()}`,
    monetized: Boolean(code),
  };
}

/**
 * GetYourGuide — tracking parameter je `partner_id` (Cookie ID / Partner ID,
 * dodeljen ob vstopu v program prek partner.getyourguide.com).
 * Vir: partner.getyourguide.support — "Our Cookie ID, also known as a Partner
 * ID, is a unique identifier assigned to each affiliate partner".
 * Deep-link: getyourguide.com/s/<poizvedba>?partner_id=<ID> (iskalni URL).
 *
 * NOT_CONFIGURED fallback: čista iskalna stran BREZ partner_id.
 */
export function getGetYourGuideUrl(destination: string): PartnerUrlResult {
  const pid = process.env.GETYOURGUIDE_PARTNER_ID?.trim();
  const dest = canonicalDest(destination);
  const params = new URLSearchParams({
    q: dest,
    utm_source: "discoverslovenia",
  });
  if (pid) params.set("partner_id", pid);
  return {
    url: `https://www.getyourguide.com/s?${params.toString()}`,
    monetized: Boolean(pid),
  };
}

/**
 * Skyscanner — sledenje teče prek Impact: `mediaPartnerId` (Impact partner
 * ID) je OBVEZEN parameter; `utm_term` neobvezen dodatni alfanumerični
 * tracking; legacy `associateid` je deprecated.
 * Vir: developers.skyscanner.net/docs/referrals/tracking ("mediaPartnerId
 * REQUIRED — Your Impact partner ID as found at Impact.com").
 * Dokumentacija IZRECNO opozarja, da tracking URL-jev ne sme biti
 * ponovno napačno enkodiran — zato slug vzamemo IZ WHITELIST (ASCII) in
 * ga NE prekodiramo dodatno.
 * Deep-link: skyscanner.net/transport/flights-to/<slug|IATA>/?<tracking>.
 *
 * NOT_CONFIGURED fallback: čista iskalna stran BREZ mediaPartnerId.
 */
export function getSkyscannerUrl(destination: string): PartnerUrlResult {
  const mpid = process.env.SKYSCANNER_MEDIA_PARTNER_ID?.trim();
  const slug = skyscannerSlug(destination);
  const params = new URLSearchParams({ adults: "1" });
  if (mpid) params.set("mediaPartnerId", mpid);
  return {
    url: `https://www.skyscanner.net/transport/flights-to/${slug}/?${params.toString()}`,
    monetized: Boolean(mpid),
  };
}

/**
 * World Nomads — affiliate program od novembra 2022 teče na CJ (Commission
 * Junction); starejše neposredno sledenje z ?affiliate= je bilo UGASNJENO
 * (31. 1. 2023, uradna stran programa). CJ povezave so OPAQNE celotne URL-je,
// ki se generirajo v CJ vmesniku — zato konfiguracija sprejme CEL URL.
 * Vir: worldnomads.com/affiliate ("If you joined our program prior to
 * 16 November 2022, tracking will be removed on 31 January 2023, and you
 * will need to reapply via CJ").
 *
 * Parametra `days` NI več moč vgraditi v CJ povezavo generično — izpuščen.
 * NOT_CONFIGURED fallback: čista stran produkta BREZ lažnega trackinga.
 */
export function getWorldNomadsUrl(): PartnerUrlResult {
  const url = process.env.WORLDNOMADS_AFFILIATE_URL?.trim() || "";
  if (isValidHttpsUrl(url)) {
    return { url, monetized: true };
  }
  return {
    url: "https://www.worldnomads.com/travel-insurance",
    monetized: false,
  };
}

/** Centralni razrez za /go/ route (FAZA 4). */
export function buildPartnerUrl(
  provider: AffiliateProvider,
  destination: string,
  days?: number,
): PartnerUrlResult {
  switch (provider) {
    case "hotels":
      return getBookingUrl(destination);
    case "cars":
      return getDiscoverCarsUrl(destination);
    case "activities":
      return getGetYourGuideUrl(destination);
    case "flights":
      return getSkyscannerUrl(destination);
    case "insurance":
      return getWorldNomadsUrl();
  }
}

// ----------------------------------------------------------------------------
// UI PRESENTACIJA (FAZA 8) — BREZ zavajajočih provizijskih odstotkov
// ----------------------------------------------------------------------------
// Prejšnji COMMISSION_INFO ("70 %", "5 %", "8 %", "40 %", "PPQ") je ODSTRANJEN:
// - 70 % / 40 % sta deleža PARTNERJEVEGA dobička, ne vrednosti rezervacije
//   (DiscoverCars T&C 3.1; Skyscanner deli provizijo z vlagatelji prometa);
// - 5 % / 8 % nista dokumentirani osnovi za naš račun;
// - "PPQ" je interna metrika (plačilo na potrjen quote) in uporabniku nič
//   ne pove.
// UI zdaj kaže nevtralno oznako "Partnerska ponudba"; provizije niso več
// predstavljene kot odstotek cene.
export const PARTNER_LABELS: Record<AffiliateProvider, string> = {
  hotels: "Booking.com",
  cars: "DiscoverCars",
  activities: "GetYourGuide",
  flights: "Skyscanner",
  insurance: "World Nomads",
} as const;
