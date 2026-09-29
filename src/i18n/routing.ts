import { defineRouting } from "next-intl/routing";

/**
 * Next-intl routing konfiguracija.
 *
 * FW4.3-2 (EN Phase 2): javno sta zdaj slovenščina (default, brez prefix-a)
 * IN angleščina (`/en` prefix) — a LE za poti na EN whitelisti spodaj
 * (jedro lijaka: domov, načrtuj, destinacije s programatskimi podstranmi,
 * info/E-E-A-T strani). Vse ostale poti (ADRIA vodniki, blog,
 * admin/owner/auth …) ostanejo izključno slovenske — proxy
 * zahteve `/en/<nedovoljena-pot>` trajno (308) preusmeri na slovensko pot
 * (P4-8: nikoli mešanja jezikov, nikoli 404).
 *
 * Zgodovina (P4-8, Phase 1): prej so bile javno dostopne delno prevedene
 * strani (/en, /de, /it — prevedena navigacija + noga, hardcoded slovenska
 * vsebina). TASK 32 (Tier 1 #5): mrtvi delni prevodi de.json/it.json so
 * ODSTRANJENI (request.ts je nikoli ni nalagal — locales so samo sl+en;
 * de.json je celo trdil "22 Reiseziele", destinacij je 38). /de in /it
 * URL-ji ostanejo legacy (308 na slovensko pot) — stare zunanje povezave
 * ne smejo biti 404; celoviti prevodi (če kdaj) pridejo kot lastna naloga.
 *
 * `localePrefix: "as-needed"`: default locale ("sl") NIMA prefix-a (URL je
 * `/`); "en" ga ima (`/en/…`).
 */
export const routing = defineRouting({
  locales: ["sl", "en", "it", "de", "fr", "es"],
  defaultLocale: "sl",
  localePrefix: "as-needed",
});

export type Locale = (typeof routing.locales)[number];

// ============================================================================
// EN WHITELISTA (FW4.3-2) — edini vir resnice o tem, kje angleščina ŽIVI.
// Uporabniki: src/proxy.ts (308 guard), language-switcher (vidnost),
// hreflangForPath (alternati), sitemap-urls.ts (EN URL-ji), strani sami
// (skrivanje DB sekcij na EN).
// ============================================================================

/** Destinacijske pod-poti, ki so EN-različice (×38 destinacij — TASK 62). */
const EN_DESTINATION_SUBROUTES = [
  // GEO-A: nadrejena hub stran (do 2026-09-14 je bila 404 — zdaj živi,
  // zato je tudi njena EN različica na whitelisti; 308 proxy preusmeritev
  // je padla na slovensko 404 stran)
  /^\/destinacija\/[^/]+$/,
  /^\/destinacija\/[^/]+\/things-to-do$/,
  /^\/destinacija\/[^/]+\/itinerary\/[^/]+$/,
  /^\/destinacija\/[^/]+\/best-time-to-visit\/[^/]+$/,
  /^\/destinacija\/[^/]+\/guide\/[^/]+$/,
];

/**
 * ADRIA-EN: jadranski vodniki — seznam + 10 detail strani (EN različice
 * obstajajo kot full prevodi v src/lib/adria-guides-en; isti slugi).
 */
const EN_ADRIA_ROUTES = [/^\/vodici\/[a-z0-9-]+$/];

/** Statične poti z EN različico (jedro lijaka + info/E-E-A-T strani). */
export const EN_STATIC_ROUTES = new Set([
  "/",
  "/nacrtuj",
  "/destinacije",
  "/vodici",
  // OPP-1: iskrena primerjava AI načrtovalcev (lov na "mindtrip alternative"
  // dolg rep po njihovem padcu weba 17. 9. 2026) — tudi EN, ker je ta
  // poizvedba pretežno angleška
  "/primerjava",
  "/o-strani",
  "/kontakt",
  "/pogoji-uporabe",
  "/politika-zasebnosti",
  "/vir-podatkov",
  "/zaupanje-in-varnost",
  // 1.48: zemljevid je v GLAVNI navigaciji z že prevedeno oznako ("Map") —
  // EN uporabnik bi sicer kliknil angleški gumb in pristal na slovenski
  // strani (308 nazaj na /zemljevid). Zemljevid je ravno za tuje turiste
  // najbolj uporabna površina (vsebina: imena POI + OSM so jezikovno
  // nevtralni). Komponente: L vzorec (map-section je bil že dvojezičen).
  "/zemljevid",
  // TASK 58 (potovanja): celotno potovanje čez vse ponudnike — jedro
  // lijaka za tuje turiste (prihod → transfer → nastanitev → …). Komponenta
  // journey-planner je dvojezična (L vzorec).
  "/potovanje",
  // TASK 64 (Go Mode): Now&Next sopotnik MED potovanjem — za tuje turiste
  // najbolj uporabna ravno na telefonu na poti (komponenta go-mode je
  // dvojezična, L vzorec; isti kanon kot /potovanje).
  "/na-poti",
  // ISSUE #8 F4-E (Faza 4, 1.115.0): raziskovalne + zbirka + BOOK korak
  // lijaka zdaj dvojezični (UI L-vzorec; dogodki imajo celo EN podatkovno
  // plast EVENTS_EN). Iskrena meja, vidna v UI: imena/opisi izdelkov,
  // izkušenj in lokalov so PODATKI ponudnikov v slovenščini (DB brez EN
  // stolpcev — vsebina je lastna naloga, ne UI) — na /en/trznica in
  // /en/lokali stoji zato tiha resnična vrstica (isti §38 kanon kot
  // NO_LIVE_DATA).
  "/trznica",
  "/dozivetja",
  "/lokali",
  "/dogodki",
  // Osebna zbirka: orodje uporabnika — okvir popolnoma EN; imena shranjenih
  // postavk so uporabnikovi lastni viri (jezik neodvisen).
  "/moja-potovanja",
]);

/**
 * Ali ima ta POT (brez locale prefix-a!) angleško različico.
 * Uporablja se na REWRITTEN poti (kar vrne usePathname() / notranja pot
 * rendera), NIKAKOR ne na URL-ju z `/en` prefix-om.
 */
export function isEnRoute(pathname: string): boolean {
  if (EN_STATIC_ROUTES.has(pathname)) return true;
  if (EN_ADRIA_ROUTES.some((re) => re.test(pathname))) return true;
  return EN_DESTINATION_SUBROUTES.some((re) => re.test(pathname));
}

// ============================================================================
// W1 IT/DE WHITELISTA (Issue #15 V0, 1.126.0; faza 2a — 1.127.0; faza
// 2b-2 — 1.129.0) — edini vir resnice o tem, kje italijanščina in nemščina
// ŽIVITA.
// FAZA 1 (1.126.0): jedro odkrivanja + svetovanja (statične poti).
// FAZA 2a (1.127.0): + destinacijske plasti (/destinacija/* ×38 — podatkovni
// overlayji slovenia-data-it/-de iz 1.126.0 so zdaj živi tudi na straneh)
// + /zemljevid (jezikovno nevtralni POI-ji; UI 4-jezičen).
// FAZA 2b-2 (1.129.0): + /nacrtuj — planner POGON je 4-jezičen (2b-1:
// /api/itinerary jedro; 2b-2: plan-qa, packing-smart, refine-actions,
// ukazni parser SL+EN+IT+DE, planner-audio, ICS izvoz, komponente).
// Namerno ŠE VEDNO IZVEN (iskrena meja — proxy 308 na slovensko):
//   L-vzorčne poti (/trznica, /dozivetja, /lokali, /dogodki, /potovanje,
//   /na-poti, /moja-potovanja — inline SL/EN slovarji v komponentah), /vodici
//   (vsebinska plast ADRIA-EN), /pot (skupnost — SL kanon).
// Uporabniki: src/proxy.ts (308 guard), language-switcher (vidnost),
// hreflangForPath (alternati), sitemap-urls.ts (IT/DE URL-ji).
// ============================================================================

/** Statične poti z IT/DE različico (jedro odkrivanja + svetovanja). */
export const ITDE_STATIC_ROUTES = new Set([
  "/",
  "/destinacije",
  "/primerjava",
  "/o-strani",
  "/kontakt",
  "/pogoji-uporabe",
  "/politika-zasebnosti",
  "/vir-podatkov",
  "/zaupanje-in-varnost",
  // W1 faza 2a: zemljevid — POI imena so jezikovno nevtralni viri (OSM/FSQ),
  // UI (T slovar) je 4-jezičen, iskanje ima IT/DE razloge zadetkov.
  "/zemljevid",
  // W1 faza 2b-2 (1.129.0): načrtovalnik — pogon (deterministični motor,
  // Q&A, pakirni seznam, hitre akcije, NL ukazi, izvozi) je 4-jezičen.
  "/nacrtuj",
]);

/**
 * Destinacijske pod-poti z IT/DE različico (faza 2a — enake kot EN
 * whitelistna GEO-A: hub + things-to-do + itinererji + sezone + vodniki;
 * ×38 destinacij). Vsebino pokrivajo slovenia-data-it/-de overlayji
 * (tagline/description/highlights/activities/duration — 1.126.0).
 */
const ITDE_DESTINATION_SUBROUTES = [
  /^\/destinacija\/[^/]+$/,
  /^\/destinacija\/[^/]+\/things-to-do$/,
  /^\/destinacija\/[^/]+\/itinerary\/[^/]+$/,
  /^\/destinacija\/[^/]+\/best-time-to-visit\/[^/]+$/,
  /^\/destinacija\/[^/]+\/guide\/[^/]+$/,
];

/** Ali ima ta POT (brez locale prefix-a!) IT/DE različico (W1 faza 2a). */
export function isItDeRoute(pathname: string): boolean {
  if (ITDE_STATIC_ROUTES.has(pathname)) return true;
  return ITDE_DESTINATION_SUBROUTES.some((re) => re.test(pathname));
}

// ============================================================================
// W12 FR/ES WHITELISTA (smer 2, faza 1 — 1.144.0; faza 2a — 1.145.0; faza
// 2b — 1.146.0) — edini vir resnice o tem, kje francoščina in španščina
// ŽIVITA. Vzorec 1:1 po W1 fazah 1/2a/2b (IT/DE, 1.126.0/1.127.0/1.129.0).
// Trgi: FR — francosko govoreča Zahodna Evropa (med največjimi virnimi
// turističnimi trgi za Slovenijo); ES — španijsko govoreči jug Evrope +
// Latinska Amerika (najhitreje rastoče skupine poizvedb o „Eslovenia").
// Oba jezika sta v benchmarku Alma (STB) naslednja po IT/DE.
// Namerno ŠE VEDNO IZVEN (iskrena meja — proxy 308 na slovensko):
//   L-vzorčne poti (/trznica, /dozivetja, /lokali, /dogodki, /potovanje,
//   /na-poti, /moja-potovanja), /vodici, /pot.
// FAZA 2a (1.145.0): + /zemljevid (POI imena so jezikovno nevtralni viri
// OSM/FSQ; UI T slovarji ×6; iskanje ima FR/ES razloge zadetkov) +
// destinacijske pod-poti (/destinacija/* ×38 — overlayji slovenia-data-fr/-es
// iz 1.144.0 so zdaj živi tudi na straneh, ne samo v karticah).
// FAZA 2b (1.146.0): + /nacrtuj — planner POGON je 6-jezičen (plan-qa,
// packing-smart, refine-actions, ukazni parser, planner-audio, ICS izvoz,
// komponente; dogodki FR/ES dedijo EVENTS_EN po §38 kanonu — isti mejnik
// kot W1 faza 2b-2 za /it+/de/nacrtuj v 1.129.0).
// Uporabniki: src/proxy.ts (308 guard), language-switcher (vidnost),
// hreflangForPath (alternati), sitemap-urls.ts (FR/ES URL-ji).
// ============================================================================

/** Statične poti s FR/ES različico (jedro + svetovanje + zemljevid + načrtovalnik). */
export const FRES_STATIC_ROUTES = new Set([
  "/",
  "/destinacije",
  "/primerjava",
  "/o-strani",
  "/kontakt",
  "/pogoji-uporabe",
  "/politika-zasebnosti",
  "/vir-podatkov",
  "/zaupanje-in-varnost",
  // W12 faza 2a: zemljevid — POI imena so jezikovno nevtralni viri (OSM/FSQ),
  // UI (T slovarji map-view/map-section/hero) je 6-jezičen, iskanje ima
  // FR/ES sinonime + razloge zadetkov (isti kanon kot W1 faza 2a za IT/DE).
  "/zemljevid",
  // W12 faza 2b (1.146.0): načrtovalnik — pogon (deterministični motor,
  // Q&A, pakirni seznam, hitre akcije, NL ukazi, izvozi) je 6-jezičen.
  "/nacrtuj",
]);

/**
 * Destinacijske pod-poti s FR/ES različico (faza 2a — enake kot IT/DE
 * whitelistna GEO-A: hub + things-to-do + itinererji + sezone + vodniki;
 * ×38 destinacij). Vsebino pokrivajo slovenia-data-fr/-es overlayji
 * (tagline/description/highlights/activities/duration — 1.144.0).
 */
const FRES_DESTINATION_SUBROUTES = [
  /^\/destinacija\/[^/]+$/,
  /^\/destinacija\/[^/]+\/things-to-do$/,
  /^\/destinacija\/[^/]+\/itinerary\/[^/]+$/,
  /^\/destinacija\/[^/]+\/best-time-to-visit\/[^/]+$/,
  /^\/destinacija\/[^/]+\/guide\/[^/]+$/,
];

/** Ali ima ta POT (brez locale prefix-a!) FR/ES različico (W12 faza 2a). */
export function isFrEsRoute(pathname: string): boolean {
  if (FRES_STATIC_ROUTES.has(pathname)) return true;
  return FRES_DESTINATION_SUBROUTES.some((re) => re.test(pathname));
}

/**
 * Ali ima ta POT (brez locale prefix-a!) različico v podanem JAVNEM jeziku.
 * Generalizacija isEnRoute (W1): default vedno res (SL je izvirnik),
 * "en" po EN whitelisti, "it"/"de" po IT/DE whitelisti (faza 1).
 * W12 (smer 2, faza 1): "fr"/"es" po FR/ES whitelisti.
 */
export function isLocaleRoute(pathname: string, locale: string): boolean {
  if (locale === routing.defaultLocale) return true;
  if (locale === "en") return isEnRoute(pathname);
  if (locale === "it" || locale === "de") return isItDeRoute(pathname);
  if (locale === "fr" || locale === "es") return isFrEsRoute(pathname);
  return false;
}

/** Locale prefix za URL-je: "" za default ("sl"), "/en" za angleščino. */
export function localePrefix(locale: string): string {
  return locale === routing.defaultLocale ? "" : `/${locale}`;
}
