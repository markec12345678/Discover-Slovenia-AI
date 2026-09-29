import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  routing,
  isFrEsRoute,
  isLocaleRoute,
  FRES_STATIC_ROUTES,
} from "@/i18n/routing";
import {
  COUNTRIES_FR,
  REGIONS_FR,
  INTERESTS_FR,
  BEST_FOR_FR,
  COUNTRIES_ES,
  REGIONS_ES,
  INTERESTS_ES,
  BEST_FOR_ES,
  withFrOverlay,
  withEsOverlay,
} from "@/lib/slovenia-labels-fr-es";
import { withLocaleOverlay, ogLocaleFor } from "@/lib/slovenia-labels-it-de";
import { pick } from "@/lib/i18n-pick";
import { speechLanguageTag } from "@/lib/voice";
import { hreflangForPath } from "@/components/seo";
import { getAllSitemapUrls, getTotalSitemapUrlCount } from "@/lib/sitemap-urls";
import { TAXONOMY } from "@/lib/supply/taxonomy";
import { deterministicSearch, tokenize } from "@/lib/deterministic-search";
import { getFrDestination } from "@/lib/slovenia-data-fr";
import { getEsDestination as getEsDest } from "@/lib/slovenia-data-es";
import { DESTINATIONS, REGIONS } from "@/lib/slovenia-data";
import type { Destination } from "@/lib/types";
import {
  WISHLIST_THEME_LABELS,
  WISHLIST_OTHER_LABEL,
  type WishlistLang,
} from "@/lib/wishlist-collections";

/**
 * W12 (smer 2, faza 1 — 1.144.0; faza 2a — 1.145.0): regresijska varovalka
 * FR/ES jezikov.
 *
 * Pogodba (vzorec 1:1 po W1 — IT/DE, 1.126.0/1.127.0):
 * - FR/ES živita SAMO na FR/ES whitelisti: jedro odkrivanja + svetovanja
 *   (9 statičnih poti) + faza 2a: /zemljevid + destinacijske pod-poti
 *   (/destinacija/* ×38 — 5 vzorcev); vse ostale poti → isFrEsRoute false
 *   (proxy 308 na SL, P4-8: nikoli mešanja jezikov);
 * - /nacrtuj je NAMERNO izven (faza 2b — iskrena meja);
 * - oznake (države/regije/interesi/bestFor) imata FR/ES različici;
 * - destinacijski overlayji (slovenia-data-fr/-es) pokrivajo destinacije;
 * - sitemap/hreflang/ogLocale/voice se zavedata fr/es;
 * - wishlist (globalni krom) podpira fr/es;
 * - klepet: klient pošlje fr/es, strežnik preslika na EN (referenčni jezik);
 * - FAZA 2a: zemljevid 6-jezičen (map-view/map-section/hero T slovarji,
 *   taksonomija ×6, PRIMARY_CATEGORIES ×6, ProviderPanel + statusLabel ×6),
 *   iskanje na zemljevidu razume FR/ES sinonime + stopbesede + razloge
 *   zadetkov v UI jeziku (isti kanon kot W1 faza 2a za IT/DE).
 */

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const FRES_PATHS = [
  "/",
  "/destinacije",
  "/primerjava",
  "/o-strani",
  "/kontakt",
  "/pogoji-uporabe",
  "/politika-zasebnosti",
  "/vir-podatkov",
  "/zaupanje-in-varnost",
  // W12 faza 2a (1.145.0): zemljevid — POI so jezikovno nevtralni viri
  "/zemljevid",
];

/** Destinacijske pod-poti faze 2a (×38 destinacij — 5 vzorcev). */
const FRES_SUBROUTE_SAMPLES = [
  "/destinacija/bled",
  "/destinacija/bled/things-to-do",
  "/destinacija/bled/itinerary/vikend",
  "/destinacija/bled/best-time-to-visit/pomlad",
  "/destinacija/bled/guide/romanticni-pobeg",
];

describe("W12 faza 1+2a: routing — FR/ES javna jezika na svoji whitelisti", () => {
  test("routing.locales vsebuje 6 jezikov (+fr, +es — W12)", () => {
    expect(routing.locales).toEqual(["sl", "en", "it", "de", "fr", "es"]);
    expect(routing.defaultLocale).toBe("sl");
  });

  test("FRES_STATIC_ROUTES = 10 poti (jedro + svetovanje + zemljevid — faza 2a)", () => {
    expect(FRES_STATIC_ROUTES.size).toBe(10);
    for (const p of FRES_PATHS) {
      expect(FRES_STATIC_ROUTES.has(p), `manjka "${p}"`).toBe(true);
    }
  });

  test("isFrEsRoute: whitelist poti → true", () => {
    for (const p of FRES_PATHS) {
      expect(isFrEsRoute(p), `"${p}" bi moral biti FR/ES`).toBe(true);
    }
  });

  test("isFrEsRoute: destinacijske pod-poti faze 2a → true (×5 vzorcev)", () => {
    for (const p of FRES_SUBROUTE_SAMPLES) {
      expect(isFrEsRoute(p), `"${p}" bi moral biti FR/ES (faza 2a)`).toBe(true);
    }
  });

  test("isFrEsRoute: izven whitelist → false (P4-8 — 308 varuje proxy)", () => {
    const offLimits = [
      "/nacrtuj",
      "/destinacija/bled/nepoznana-podpot",
      "/trznica",
      "/dozivetja",
      "/lokali",
      "/dogodki",
      "/potovanje",
      "/na-poti",
      "/vodici",
      "/vodici/jadranska-obala",
      "/pot/abc123",
      "/blog/naslov",
      "/moja-potovanja",
      "/admin",
    ];
    for (const p of offLimits) {
      expect(isFrEsRoute(p), `"${p}" NE sme biti FR/ES (faza 2b ali SL-only)`).toBe(false);
    }
  });

  test("isLocaleRoute: fr/es spoštujeta whitelist; SL vedno true", () => {
    expect(isLocaleRoute("/", "fr")).toBe(true);
    expect(isLocaleRoute("/destinacije", "es")).toBe(true);
    expect(isLocaleRoute("/zemljevid", "fr")).toBe(true);
    expect(isLocaleRoute("/destinacija/bled", "es")).toBe(true);
    expect(isLocaleRoute("/nacrtuj", "fr")).toBe(false);
    expect(isLocaleRoute("/trznica", "es")).toBe(false);
    expect(isLocaleRoute("/blog/xyz", "fr")).toBe(false);
    expect(isLocaleRoute("/nacrtuj", "sl")).toBe(true);
  });

  test("FR/ES whitelist je podmnožica IT/DE (jedro odkrivanja — gruča hreflang popolna)", () => {
    // Vse FRES poti imajo tudi IT/DE različico → hreflang gruča na sitemapu
    // je vedno sl+en+it+de+fr+es (nikoli delna glede fr/es).
    for (const p of [...FRES_PATHS, ...FRES_SUBROUTE_SAMPLES]) {
      expect(isLocaleRoute(p, "it"), `"${p}" tudi IT`).toBe(true);
      expect(isLocaleRoute(p, "de"), `"${p}" tudi DE`).toBe(true);
    }
  });
});

describe("W12 faza 1: oznake (labels-fr-es)", () => {
  test("države FR/ES — vse 4 države (SI/HR/ME/AL)", () => {
    expect(COUNTRIES_FR.SI).toBe("Slovénie");
    expect(COUNTRIES_FR.HR).toBe("Croatie");
    expect(COUNTRIES_FR.ME).toBe("Monténégro");
    expect(COUNTRIES_FR.AL).toBe("Albanie");
    expect(COUNTRIES_ES.SI).toBe("Eslovenia");
    expect(COUNTRIES_ES.HR).toBe("Croacia");
    expect(COUNTRIES_ES.ME).toBe("Montenegro");
    expect(COUNTRIES_ES.AL).toBe("Albania");
  });

  test("regije FR/ES — popolna pariteta s SL kanonom REGIONS (20)", () => {
    // Vir resnice je SL REGIONS iz slovenia-data.ts (20 regij: 9 SI + 5 HR +
    // 4 ME + 2 AL) — IT (W1 kanon), FR in ES morajo pokrivati NATANČNO ta
    // nabor. Prejšnja iteracija tega testa je trdila 21 (tipkarska napaka —
    // noben kanon nima 21. regije); pariteta množic je močnejša trditev.
    const slKeys = REGIONS.map((r) => r.value).sort();
    expect(Object.keys(REGIONS_FR).length).toBe(slKeys.length);
    expect(Object.keys(REGIONS_ES).length).toBe(slKeys.length);
    expect(Object.keys(REGIONS_FR).sort()).toEqual(slKeys);
    expect(Object.keys(REGIONS_ES).sort()).toEqual(slKeys);
    expect(REGIONS_FR.gorenjska).toBe("Haute-Carniole");
    expect(REGIONS_ES.gorenjska).toBe("Alta Carniola");
    expect(REGIONS_FR["boka-kotorska"]).toBe("Bouches de Kotor");
    expect(REGIONS_ES["boka-kotorska"]).toBe("Bahía de Kotor");
  });

  test("interesi + bestFor FR/ES — 8 + 20 ključev (isti nabor kot IT)", () => {
    expect(Object.keys(INTERESTS_FR).length).toBe(8);
    expect(Object.keys(BEST_FOR_FR).length).toBe(20);
    expect(Object.keys(INTERESTS_ES).length).toBe(8);
    expect(Object.keys(BEST_FOR_ES).length).toBe(20);
    expect(INTERESTS_FR.narava).toBe("Nature");
    expect(INTERESTS_ES.narava).toBe("Naturaleza");
    expect(BEST_FOR_FR.pohodništvo).toBe("Randonnée");
    expect(BEST_FOR_ES.pohodništvo).toBe("Senderismo");
  });

  test("neznan ključ → identiteta (ne izmišljena oznaka — P4-8 kanon _EN/_IT/_DE)", () => {
    // Preskus prek withFrOverlay/withEsOverlay na id-ju, ki ga ni:
    const ghost: Destination = {
      ...(DESTINATIONS[0] as Destination),
      id: "ne-obstojeci-id",
      tagline: "izvirna tagline",
    };
    expect(withFrOverlay(ghost).tagline).toBe("izvirna tagline");
    expect(withEsOverlay(ghost).tagline).toBe("izvirna tagline");
  });
});

describe("W12 faza 1: destinacijski overlayji (slovenia-data-fr/-es)", () => {
  test("pokritost ≥ 38/38 destinacij × 2 jezika (polna plast faze 1)", () => {
    const frIds = DESTINATIONS.filter((d) => getFrDestination(d.id) !== null);
    const esIds = DESTINATIONS.filter((d) => getEsDest(d.id) !== null);
    expect(frIds.length).toBe(DESTINATIONS.length);
    expect(esIds.length).toBe(DESTINATIONS.length);
  });

  test("overlay zamenja tekstovna polja, identifikatorji ostanejo (bled)", () => {
    const bled = DESTINATIONS.find((d) => d.id === "bled");
    if (!bled) throw new Error("bled manjka v DESTINATIONS");
    const fr = withLocaleOverlay(bled, "fr");
    const es = withLocaleOverlay(bled, "es");
    expect(fr.tagline).not.toBe(bled.tagline);
    expect(es.tagline).not.toBe(bled.tagline);
    expect(fr.id).toBe("bled");
    expect(es.slug).toBe(bled.slug);
    expect(fr.coords).toEqual(bled.coords);
    expect(es.costPerPerson).toBe(bled.costPerPerson);
    expect(fr.highlights.length).toBe(bled.highlights.length);
    expect(es.activities.length).toBe(bled.activities.length);
  });

  test("SL/EN/IT/DE poti withLocaleOverlay ostanejo nespremenjene (zero regression)", () => {
    const bled = DESTINATIONS.find((d) => d.id === "bled");
    if (!bled) throw new Error("bled manjka");
    expect(withLocaleOverlay(bled, "sl")).toBe(bled); // identiteta
    expect(withLocaleOverlay(bled, "xx")).toBe(bled); // neznan → SL
  });
});

describe("W12 faza 1+2a: SEO + sitemap (hreflang/og/števec)", () => {
  test("hreflangForPath: FR/ES alternata na whitelist poteh (faza 2a: + zemljevid + destinacije)", () => {
    const home = hreflangForPath("/", "https://example.com");
    expect(home["fr-FR"]).toBe("https://example.com/fr");
    expect(home["es-ES"]).toBe("https://example.com/es");
    const dest = hreflangForPath("/destinacije", "https://example.com");
    expect(dest["fr-FR"]).toBe("https://example.com/fr/destinacije");
    expect(dest["es-ES"]).toBe("https://example.com/es/destinacije");
    const map = hreflangForPath("/zemljevid", "https://example.com");
    expect(map["fr-FR"]).toBe("https://example.com/fr/zemljevid");
    expect(map["es-ES"]).toBe("https://example.com/es/zemljevid");
    const bled = hreflangForPath("/destinacija/bled", "https://example.com");
    expect(bled["fr-FR"]).toBe("https://example.com/fr/destinacija/bled");
    expect(bled["es-ES"]).toBe("https://example.com/es/destinacija/bled");

    const plan = hreflangForPath("/nacrtuj", "https://example.com");
    expect(plan["fr-FR"]).toBeUndefined();
    expect(plan["es-ES"]).toBeUndefined();
    const trznica = hreflangForPath("/trznica", "https://example.com");
    expect(trznica["fr-FR"]).toBeUndefined();
  });

  test("ogLocaleFor: fr → fr-FR, es → es-ES (kanon OG)", () => {
    expect(ogLocaleFor("fr")).toBe("fr_FR");
    expect(ogLocaleFor("es")).toBe("es_ES");
    expect(ogLocaleFor("sl")).toBe("sl_SI");
  });

  test("sitemap: FR/ES URL-ji = 10 statičnih + 570 destinacijskih = 580 na jezik (faza 2a)", () => {
    const urls = getAllSitemapUrls("https://example.com");
    const frPaths = urls.filter((u) => u.path === "/fr" || u.path.startsWith("/fr/"));
    const esPaths = urls.filter((u) => u.path === "/es" || u.path.startsWith("/es/"));
    // 10 statičnih (9 + /zemljevid) + 38 destinacij × 15 pod-poti = 580
    expect(frPaths.length).toBe(580);
    expect(esPaths.length).toBe(580);
    expect(frPaths.map((u) => u.path)).toContain("/fr/destinacije");
    expect(frPaths.map((u) => u.path)).toContain("/fr/zemljevid");
    expect(esPaths.map((u) => u.path)).toContain("/es/primerjava");
    expect(esPaths.map((u) => u.path)).toContain("/es/destinacija/bled/things-to-do");
    expect(frPaths.map((u) => u.path)).toContain("/fr/destinacija/bled/guide/romanticni-pobeg");

    // hreflang gruča: slovenska pot / vključi vseh 6 jezikov + x-default
    const slHome = urls.find((u) => u.path === "/");
    const hreflangs = (slHome?.alternates ?? []).map((a) => a.hreflang);
    expect(hreflangs).toContain("fr-FR");
    expect(hreflangs).toContain("es-ES");
    expect(hreflangs).toContain("x-default");
    expect(hreflangs.length).toBe(7);

    // FR/ES URL-ji nosijo ISTO gručo (alternati so simetrični)
    const frHome = urls.find((u) => u.path === "/fr");
    expect(frHome?.alternates?.length).toBe(7);

    // destinacijski hub ima PRAV tako popolno gručo (faza 2a)
    const slBled = urls.find((u) => u.path === "/destinacija/bled");
    const bledHrefs = (slBled?.alternates ?? []).map((a) => a.hreflang);
    expect(bledHrefs).toContain("fr-FR");
    expect(bledHrefs).toContain("es-ES");
    expect(bledHrefs.length).toBe(7);
  });

  test("getTotalSitemapUrlCount = dejansko število URL-jev (formula ≥ seznam)", () => {
    const urls = getAllSitemapUrls("https://example.com");
    expect(getTotalSitemapUrlCount()).toBe(urls.length);
  });

  test("SEO schema: knowsLanguage + inLanguage vključujeta fr/es (W12)", () => {
    const seo = source("src/components/seo.tsx");
    expect(seo).toContain('"French", "Spanish"');
    expect(seo).toContain('"fr-FR", "es-ES"');
    expect(seo).toContain('"fr", "es"');
  });
});

describe("W12 faza 1: globalni krom (switcher/mt-notice/tab-bar/wishlist/voice)", () => {
  test("language-switcher ponudi fr/es (vidno SAMO na FR/ES poteh — isLocaleRoute)", () => {
    const src = source("src/components/language-switcher.tsx");
    expect(src).toContain('code: "fr"');
    expect(src).toContain('code: "es"');
    expect(src).toContain("Français");
    expect(src).toContain("Español");
    expect(src).toContain("isLocaleRoute");
  });

  test("mt-notice se prikaže za fr/es (strojni prevod — iskrena nota)", () => {
    const src = source("src/components/mt-notice.tsx");
    expect(src).toContain('locale !== "fr" && locale !== "es"');
  });

  test("mobile-tab-bar in wishlist podpirata fr/es (krom na vseh poteh)", () => {
    const bar = source("src/components/mobile-tab-bar.tsx");
    expect(bar).toContain('locale === "fr" || locale === "es"');
    const wl = source("src/components/wishlist-sheet.tsx");
    expect(wl).toContain('locale === "fr" || locale === "es"');
    // Tip WL slovarja razširjen na 6 jezikov
    const coll = source("src/lib/wishlist-collections.ts");
    expect(coll).toContain('"sl" | "en" | "it" | "de" | "fr" | "es"');
  });

  test("WISHLIST_THEME_LABELS + OTHER imata fr/es vrednosti za VSE teme", () => {
    const themes = Object.keys(WISHLIST_THEME_LABELS) as (keyof typeof WISHLIST_THEME_LABELS)[];
    for (const theme of themes) {
      expect(WISHLIST_THEME_LABELS[theme].fr?.length ?? 0).toBeGreaterThan(2);
      expect(WISHLIST_THEME_LABELS[theme].es?.length ?? 0).toBeGreaterThan(2);
    }
    expect(WISHLIST_OTHER_LABEL.fr).toBe("Autre");
    expect(WISHLIST_OTHER_LABEL.es).toBe("Otro");
  });

  test("voice: speechLanguageTag fr → fr-FR, es → es-ES", () => {
    expect(speechLanguageTag("fr")).toBe("fr-FR");
    expect(speechLanguageTag("es")).toBe("es-ES");
    expect(speechLanguageTag("sl")).toBe("sl-SI");
  });

  test("i18n-pick: 6 jezikov; manjkajoč fr/es ključ pade na SL", () => {
    expect(pick("fr", { sl: "a", en: "b", it: "c", de: "d", fr: "e", es: "f" })).toBe("e");
    expect(pick("es", { sl: "a", en: "b", it: "c", de: "d", fr: "e", es: "f" })).toBe("f");
    expect(pick("xx", { sl: "a", en: "b", it: "c", de: "d", fr: "e", es: "f" })).toBe("a");
  });
});

describe("W12 faza 1: klepet — fr/es pošlje locale, strežnik odgovori v EN", () => {
  test("klient pošlje DEJANSKI locale (fr/es vključno) — validacijski seznam 6", () => {
    const src = source("src/components/chatbot.tsx");
    expect(src).toContain('"sl", "en", "it", "de", "fr", "es"');
  });

  test("strežnik: ChatRequest sprejme fr/es; preslikava na EN (referenčni jezik)", () => {
    const src = source("src/app/api/chat/route.ts");
    // tip dovoljuje fr/es …
    expect(src).toContain('"sl" | "en" | "it" | "de" | "fr" | "es"');
    // … preslikava fr/es → "en" (NE slovensko — P4-8 za FR/ES uporabnika)
    expect(src).toContain('requested === "fr" || requested === "es"');
    expect(src).toContain('? "en"');
  });
});

describe("W12 faza 2a (1.145.0): ZEMLJEVID 6-jezičen + destinacijske strani", () => {
  test("map-view T slovar ×6 (iskanje, kategorije, stanja, pini)", () => {
    const src = source("src/components/sections/map-view.tsx");
    // iskanje
    expect(src).toContain('fr: "Que cherchez-vous ? (ex. restaurants à Ljubljana)"');
    expect(src).toContain('es: "¿Qué buscas? (ej. restaurantes en Liubliana)"');
    // kategorije
    expect(src).toContain('fr: "Toutes les destinations"');
    expect(src).toContain('es: "Todos los destinos"');
    // akcija „dodaj v mojo pot"
    expect(src).toContain('fr: "Ajouter à mon voyage"');
    expect(src).toContain('es: "Añadir a mi viaje"');
    // stanja (iskrenost)
    expect(src).toContain('fr: "Vous semblez être hors ligne');
    expect(src).toContain('es: "Parece que estás sin conexión');
    // pini
    expect(src).toContain('fr: (n: number) => `${n} lieux dans cette zone`');
    expect(src).toContain('es: (n: number) => `${n} lugares en esta zona`');
  });

  test("zemljevid hero + map-section L slovarja ×6", () => {
    const page = source("src/app/zemljevid/page.tsx");
    expect(page).toContain('fr: "Carte interactive de la Slovénie et des Balkans"');
    expect(page).toContain('es: "Mapa interactivo de Eslovenia y los Balcanes"');
    const section = source("src/components/sections/map-section.tsx");
    expect(section).toContain('fr: "Découvrez la Slovénie et les Balkans sur la carte"');
    expect(section).toContain('es: "Descubre Eslovenia y los Balcanes en el mapa"');
    // jezikovna ločilnika ×6 v obeh
    for (const f of [page, section]) {
      expect(f).toContain('locale === "en" || locale === "it" || locale === "de" || locale === "fr" || locale === "es"');
    }
  });

  test("TAKSONOMIJA: VSI tipi imajo oznako ×6 (popup badge-i na zemljevidu)", () => {
    const entries = Object.values(TAXONOMY);
    expect(entries.length).toBeGreaterThanOrEqual(20);
    for (const e of entries) {
      expect(e.label.fr?.length ?? 0, `${e.type}.fr`).toBeGreaterThan(1);
      expect(e.label.es?.length ?? 0, `${e.type}.es`).toBeGreaterThan(1);
      expect(e.label.it?.length ?? 0, `${e.type}.it`).toBeGreaterThan(1);
      expect(e.label.de?.length ?? 0, `${e.type}.de`).toBeGreaterThan(1);
    }
    expect(TAXONOMY.petrol.label.fr).toBe("Station-service");
    expect(TAXONOMY.petrol.label.es).toBe("Gasolinera");
    expect(TAXONOMY.restaurant.label.fr).toBe("Restaurant");
  });

  test("PRIMARY_CATEGORIES (5 skupin čipov) ×6 + ProviderPanel + statusLabel ×6", () => {
    const mapView = source("src/components/sections/map-view.tsx");
    expect(mapView).toContain('label: Record<MapLang, string>');
    expect(mapView).toContain('fr: "Restauration", es: "Comida"');
    const panel = source("src/components/supply/provider-panel.tsx");
    expect(panel).toContain('fr: "Offre et sources (avancé)"');
    expect(panel).toContain('es: "Oferta y fuentes (avanzado)"');
    expect(panel).toContain('lang: "sl" | "en" | "it" | "de" | "fr" | "es"');
    const registry = source("src/lib/supply/registry.ts");
    expect(registry).toContain('fr: "Source locale"');
    expect(registry).toContain('es: "Fuente local"');
    expect(registry).toContain('fr: "Inventaire en direct"');
    expect(registry).toContain('es: "Inventario en vivo"');
  });

  test("ISKANJE: FR/ES sinonimi + stopbesede (CATEGORY_ALIASES/STOPWORDS)", () => {
    const src = source("src/lib/deterministic-search.ts");
    // FR/ES sinonimi za vseh 10 kategorij (vzorec ~90 IT/DE iz W1 2a)
    for (const alias of [
      "randonnee", "musee", "chateau", "bienetre", "hebergement",
      "gite", "vignoble", "bistro", "brasserie", "piscine",
      "senderismo", "bodega", "castillo", "bienestar", "alojamiento",
      "esqui", "naturaleza", "cueva", "tapas", "taberna",
    ]) {
      expect(src).toContain(`"${alias}"`);
    }
    // stopbesede (vprašalnice/predlogi — nikoli ime destinacije)
    for (const sw of ["\"ou\"", "\"quoi\"", "\"comment\"", "\"donde\"", "\"como\"", "\"busco\""]) {
      expect(src).toContain(sw);
    }
    // tokenizacija: FR/ES stopbesede se odstranijo („où“ → „ou“)
    expect(tokenize("où manger à Ljubljana")).not.toContain("ou");
    expect(tokenize("¿dónde está el museo?")).not.toContain("donde");
  });

  test("ISKANJE: razlogi zadetkov v FR/ES (buildReason — UI jezik, P4-8)", () => {
    const empty: { listings: never[]; products: never[]; experiences: never[] } = {
      listings: [], products: [], experiences: [],
    };
    // zadetek po imenu destinacije → razlog v jeziku UI
    const fr = deterministicSearch("bled", empty, 3, "fr");
    expect(fr.destinations.length).toBeGreaterThan(0);
    expect(fr.destinations[0].reason).toContain("Correspond à votre recherche");
    expect(fr.destinations[0].reason).toContain("mots-clés");
    const es = deterministicSearch("bled", empty, 3, "es");
    expect(es.destinations[0].reason).toContain("Coincide con tu búsqueda");
    expect(es.destinations[0].reason).toContain("palabras clave");
    // nazaj kompatibilno: privzeta veja ostane SL
    const sl = deterministicSearch("bled", empty, 3);
    expect(sl.destinations[0].reason).toContain("Ujema se z iskalnim nizom");
  });

  test("SUPPLY sloj: FR/ES dedita EN (isti kanon kot IT/DE — §38)", () => {
    const search = source("src/lib/supply/search.ts");
    expect(search).toContain(
      'params.locale === "en" ||\n    params.locale === "it" ||\n    params.locale === "de" ||\n    params.locale === "fr" ||\n    params.locale === "es"'
    );
    const hook = source("src/lib/supply/use-supply-query.ts");
    expect(hook).toContain('locale: "sl" | "en" | "it" | "de" | "fr" | "es"');
  });

  test("DESTINACIJSKE STRANI: keywords/sezone/naslovi ×6 (hub + 3 pod-poti)", () => {
    const hub = source("src/app/destinacija/[slug]/page.tsx");
    expect(hub).toContain('"guide de voyage", "itinéraire", "meilleure période"');
    expect(hub).toContain('"guía de viaje", "itinerario", "mejor época"');
    expect(hub).toContain('spring: "Printemps"');
    expect(hub).toContain('spring: "Primavera", summer: "Verano"');
    expect(hub).toContain('`Que faire à ${dest.name}`');
    expect(hub).toContain('`Qué hacer en ${dest.name}`');
    const ttd = source("src/app/destinacija/[slug]/things-to-do/page.tsx");
    expect(ttd).toContain('"que faire", "activités"');
    expect(ttd).toContain('"qué hacer", "actividades"');
    const itin = source("src/app/destinacija/[slug]/itinerary/[duration]/page.tsx");
    expect(itin).toContain('"itinéraire", durLabel, "voyage", "Slovénie"');
    expect(itin).toContain('"itinerario", durLabel, "viaje", "Eslovenia"');
    const best = source("src/app/destinacija/[slug]/best-time-to-visit/[season]/page.tsx");
    expect(best).toContain('"meilleure période", seasonLabel, "quand visiter"');
    expect(best).toContain('"mejor época", seasonLabel, "cuándo visitar"');
  });
});

describe("W12 faza 1: prevajalna skripta (translate-locale) — hrošč W1-2b popravljen", () => {
  test("rebuild() ohranja POLJA kot polja (ne združuje v niz)", () => {
    const src = source("scripts/translate-locale.ts");
    expect(src).toContain("if (Array.isArray(template))");
    expect(src).toContain("template.map((item, i)");
  });

  test("skripti podpirata fr/es cilja (LANG_NAMES)", () => {
    const locale = source("scripts/translate-locale.ts");
    expect(locale).toContain('fr: "French');
    expect(locale).toContain('es: "Spanish');
    const dest = source("scripts/translate-destinations.ts");
    expect(dest).toContain('fr: "French');
    expect(dest).toContain('es: "Spanish');
  });
});
