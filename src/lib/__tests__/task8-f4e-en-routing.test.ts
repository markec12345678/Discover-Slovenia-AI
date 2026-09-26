import { describe, expect, test } from "bun:test";

// ============================================================================
// ISSUE #8 — Faza 4 / F4-E (1.115.0): EN razširitev SL-only površin —
// INTEGRACIJSKA VRATA (main agent).
//
// Štirje vzporedni agenti (4-a tržnica, 4-b booking stack, 4-c Moja
// potovanja, 4-d raziskovalne površine) so površine prevedli (L-vzorec);
// TA test pa dokazuje INTEGRACIJO: whitelist vrata v routing.ts odprejo
// EN LIJAK (proxy 308 ne pošlje več nazaj, jezikovna stikala se pokažejo,
// hreflang alternati + sitemap EN URL-ji se izdajo samodejno — en vir
// resnice: isEnRoute).
//
// Dodatno: §38 iskrene meje — katalog tržnice/lokalov je PODATEK ponudnikov
// v SL (DB brez EN stolpcev); EN okvir nosi tiho resnično vrstico (EN-only,
// namerno IZVEN L slovarjev, da paritetna pogodba {sl, en} ostane čista).
// ============================================================================

import {
  EN_STATIC_ROUTES,
  isEnRoute,
} from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { readFileSync } from "node:fs";

const ROOT = process.cwd();
const MARKET_SRC = readFileSync(
  `${ROOT}/src/components/sections/marketplace.tsx`,
  "utf8",
);
const LISTINGS_SRC = readFileSync(
  `${ROOT}/src/components/sections/listings.tsx`,
  "utf8",
);
const ROUTING_SRC = readFileSync(`${ROOT}/src/i18n/routing.ts`, "utf8");

/** Poti, ki jih je Faza 4 dodala na EN whitelisto (F4-E). */
const F4E_ROUTES = [
  "/trznica",
  "/dozivetja",
  "/lokali",
  "/dogodki",
  "/moja-potovanja",
] as const;

describe("F4-E integracija: EN whitelista odpre lijak (en vir resnice)", () => {
  test("vseh 5 F4-E poti je na EN whitelisti (EN_STATIC_ROUTES)", () => {
    for (const p of F4E_ROUTES) {
      expect(EN_STATIC_ROUTES.has(p), `whitelist manjka ${p}`).toBe(true);
    }
  });

  test("isEnRoute prizna F4-E poti (proxy 308 + jezikovno stikalo + hreflang vir)", () => {
    for (const p of F4E_ROUTES) {
      expect(isEnRoute(p), `isEnRoute(${p}) = false`).toBe(true);
    }
    // negativna kontrola: nepooblaščena pot ŠE VEDNO ni EN (P4-8 kanon)
    expect(isEnRoute("/admin")).toBe(false);
    expect(isEnRoute("/za-ponudnike")).toBe(false);
    expect(isEnRoute("/prijava")).toBe(false);
  });

  test("hreflangForPath izda en-US alternat za F4-E poti (x-default ostane SL)", () => {
    for (const p of F4E_ROUTES) {
      const langs = hreflangForPath(p, "https://example.com");
      expect(langs["sl-SI"], `sl-SI manjka za ${p}`).toBe(
        `https://example.com${p}`,
      );
      expect(langs["en-US"], `en-US alternat manjka za ${p}`).toBe(
        `https://example.com/en${p}`,
      );
      expect(langs["x-default"]).toBe(`https://example.com${p}`);
    }
  });

  test("routing.ts komentira iskreno mejo kataloga (dokumentirana odločitev, ne tiha)", () => {
    expect(ROUTING_SRC).toContain("PODATKI ponudnikov");
    expect(ROUTING_SRC).toContain("lastna naloga");
  });
});

describe("F4-E §38 iskrene meje: tiha EN-only vrstica (katalog = SL podatki)", () => {
  test("marketplace: EN-only nota živi IZVEN L slovarja + je lang-gated (SL je ne vidi)", () => {
    // definicija kot modulna konstanta (ne v L — pariteta {sl,en} ostane čista)
    expect(MARKET_SRC).toContain("const DATA_LANGUAGE_NOTE_EN =");
    // render SAMO na EN
    expect(MARKET_SRC).toContain('lang === "en" && (');
    expect(MARKET_SRC).toContain("{DATA_LANGUAGE_NOTE_EN}");
    // nota pošteno razloži mejo (cena/rezervacija delujeta, opisi so SL)
    expect(MARKET_SRC).toContain(
      "prices, filters and booking work in English",
    );
  });

  test("listings: isti kanon (EN-only nota izven L + lang-gated)", () => {
    expect(LISTINGS_SRC).toContain("const DATA_LANGUAGE_NOTE_EN =");
    expect(LISTINGS_SRC).toContain("{DATA_LANGUAGE_NOTE_EN}");
    expect(LISTINGS_SRC).toContain(
      "filters and opening hours work in English",
    );
  });

  test("dogodki so edina F4-E površina s CELIM EN podatkovnim slojem (dogodki ≠ katalog)", () => {
    // 4-d: EVENTS_EN prekrivna plast — 30 dogodkov z EN imeni/opisi
    // (events-i18n.test.ts je lastnik podrobnosti; tukaj samo kanon povezave)
    const cal = readFileSync(
      `${ROOT}/src/components/sections/events-calendar.tsx`,
      "utf8",
    );
    expect(cal).toContain("EVENTS_EN");
    expect(cal).toContain("EVENT_CATEGORY_LABELS_EN");
  });
});

describe("F4-E zero-loss: stari kanoni ostajajo (nič ni odstranjeno)", () => {
  test("jedro lijaka iz prejšnjih faz ostaja na whitelisti", () => {
    for (const p of [
      "/",
      "/nacrtuj",
      "/destinacije",
      "/zemljevid",
      "/potovanje",
      "/na-poti",
    ]) {
      expect(EN_STATIC_ROUTES.has(p)).toBe(true);
    }
  });

  test("ADRIA + destinacijske podpoti niso dotaknjene (regex kanoni)", () => {
    expect(isEnRoute("/vodici/jadranska-istra")).toBe(true);
    expect(isEnRoute("/destinacija/bled")).toBe(true);
    expect(isEnRoute("/destinacija/bled/things-to-do")).toBe(true);
    expect(isEnRoute("/destinacija/bled/guide/1-dan")).toBe(true);
    // random destinacijska pod-pot, ki NI v kanonu, ostane SL
    expect(isEnRoute("/destinacija/bled/nepoznana-podpot")).toBe(false);
  });
});
