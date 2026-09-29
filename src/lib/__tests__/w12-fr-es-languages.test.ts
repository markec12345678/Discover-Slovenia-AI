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
 * W12 (smer 2, faza 1 — 1.144.0): regresijska varovalka FR/ES jezikov.
 *
 * Pogodba (vzorec 1:1 po W1 fazi 1 — IT/DE, 1.126.0):
 * - FR/ES živita SAMO na FR/ES whitelisti (jedro odkrivanja + svetovanja —
 *   9 statičnih poti); vse ostale poti → isFrEsRoute false (proxy 308 na SL,
 *   P4-8: nikoli mešanja jezikov);
 * - /nacrtuj in /zemljevid sta NAMERNO izven (faza 2a/2b — iskrena meja);
 * - oznake (države/regije/interesi/bestFor) imata FR/ES različici;
 * - destinacijski overlayji (slovenia-data-fr/-es) pokrivajo destinacije;
 * - sitemap/hréflang/ogLocale/voice se zavedata fr/es;
 * - wishlist (globalni krom) podpira fr/es;
 * - klepet: klient pošlje fr/es, strežnik preslika na EN (referenčni jezik).
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
];

describe("W12 faza 1: routing — FR/ES javna jezika na svoji whitelisti", () => {
  test("routing.locales vsebuje 6 jezikov (+fr, +es — W12)", () => {
    expect(routing.locales).toEqual(["sl", "en", "it", "de", "fr", "es"]);
    expect(routing.defaultLocale).toBe("sl");
  });

  test("FRES_STATIC_ROUTES = 9 poti jedra odkrivanja + svetovanja", () => {
    expect(FRES_STATIC_ROUTES.size).toBe(9);
    for (const p of FRES_PATHS) {
      expect(FRES_STATIC_ROUTES.has(p), `manjka "${p}"`).toBe(true);
    }
  });

  test("isFrEsRoute: whitelist poti → true", () => {
    for (const p of FRES_PATHS) {
      expect(isFrEsRoute(p), `"${p}" bi moral biti FR/ES`).toBe(true);
    }
  });

  test("isFrEsRoute: izven whitelist → false (P4-8 — 308 varuje proxy)", () => {
    const offLimits = [
      "/nacrtuj",
      "/zemljevid",
      "/destinacija/bled",
      "/destinacija/bled/things-to-do",
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
      expect(isFrEsRoute(p), `"${p}" NE sme biti FR/ES (faza 2a/2b ali SL-only)`).toBe(false);
    }
  });

  test("isLocaleRoute: fr/es spoštujeta whitelist; SL vedno true", () => {
    expect(isLocaleRoute("/", "fr")).toBe(true);
    expect(isLocaleRoute("/destinacije", "es")).toBe(true);
    expect(isLocaleRoute("/nacrtuj", "fr")).toBe(false);
    expect(isLocaleRoute("/trznica", "es")).toBe(false);
    expect(isLocaleRoute("/blog/xyz", "fr")).toBe(false);
    expect(isLocaleRoute("/nacrtuj", "sl")).toBe(true);
  });

  test("FR/ES whitelist je podmnožica IT/DE (jedro odkrivanja — gruča hreflang popolna)", () => {
    // Vse FRES poti imajo tudi IT/DE različico → hreflang gruča na sitemapu
    // je vedno sl+en+it+de+fr+es (nikoli delna glede fr/es).
    for (const p of FRES_PATHS) {
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

describe("W12 faza 1: SEO + sitemap (hreflang/og/števec)", () => {
  test("hreflangForPath: FR/ES alternata SAMO na whitelist poteh", () => {
    const home = hreflangForPath("/", "https://example.com");
    expect(home["fr-FR"]).toBe("https://example.com/fr");
    expect(home["es-ES"]).toBe("https://example.com/es");
    const dest = hreflangForPath("/destinacije", "https://example.com");
    expect(dest["fr-FR"]).toBe("https://example.com/fr/destinacije");
    expect(dest["es-ES"]).toBe("https://example.com/es/destinacije");

    const plan = hreflangForPath("/nacrtuj", "https://example.com");
    expect(plan["fr-FR"]).toBeUndefined();
    expect(plan["es-ES"]).toBeUndefined();
    const detail = hreflangForPath("/destinacija/bled", "https://example.com");
    expect(detail["fr-FR"]).toBeUndefined();
  });

  test("ogLocaleFor: fr → fr-FR, es → es-ES (kanon OG)", () => {
    expect(ogLocaleFor("fr")).toBe("fr_FR");
    expect(ogLocaleFor("es")).toBe("es_ES");
    expect(ogLocaleFor("sl")).toBe("sl_SI");
  });

  test("sitemap: 18 FR/ES URL-jev (9 poti × 2) + hreflang gruča vključi fr-FR/es-ES", () => {
    const urls = getAllSitemapUrls("https://example.com");
    const frPaths = urls.filter((u) => u.path === "/fr" || u.path.startsWith("/fr/"));
    const esPaths = urls.filter((u) => u.path === "/es" || u.path.startsWith("/es/"));
    expect(frPaths.length).toBe(9);
    expect(esPaths.length).toBe(9);
    expect(frPaths.map((u) => u.path)).toContain("/fr/destinacije");
    expect(esPaths.map((u) => u.path)).toContain("/es/primerjava");

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
