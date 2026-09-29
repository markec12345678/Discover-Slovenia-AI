// W1 KPI (Issue #15, 1.139.0): JEZIKOVNI DOGADEK SEJE — regresijska varovalka.
//
// Pokriva:
//  1. TELEMETRIJA (kanon W3 pariteta): session_locale v klientnem union-u IN
//     strežniški VALID_EVENTS listi + vrstica v docs/ANALYTICS-EVENTS.md.
//  2. FUNKCIONALNO (mock sessionStorage + fetch, vzorec task8-f3cd):
//     enkrat na (seja, locale) par — dvojni klic → EN fetch; preklop
//     srednje-seje (sl → it) → drug dogodek (oba jezika šteta, benchmark
//     §6 meri "delež sej, ki so uporabile locale X"); persistenca ključa
//     dsa_planner_locale_seen; fail-open ob metanji sessionStorage (v-spominu
//     Set prepreči ponovitev na vsakem kliku — enkrat na nalaganje strani);
//     pokvarjen JSON → obravnavan kot neviden (0 izgubljenih meritev).
//  3. SOURCE-CONTRACT komponente: SessionLocaleKpi je "use client", bere
//     useLocale() (NE navigator.language — klient ne ugiba, kanon proxy.ts),
//     effect odvisen samo od [locale], vrača null (0 UI, 0 CLS); montirana v
//     root layoutu ZNOTRAJ NextIntlClientProvider (mt-notice vzorec).
//  4. LIJAK (benchmark §6 vrstici 1+2): session_locale (delež sej po jeziku)
//     + planner_started{locale} (konverzija po jeziku) — par, ki skupaj
//     zapre W1 KPI načrt.
//
// NAMEN testnega vrstnega reda: vsak funkcionalni blok uporablja SVOJ locale
// ("sl"/"it"/"de"/"en" + sintetični "fr" za pokvarjen-JSON primer) — v-spominu
// Set stanja modula preživi med bloki, zato si blovi NE delijo vrednosti
// (lib funkcija je totalna nad nizi; restrikcija na 4 locale je v klicniku
// useLocale, ne v lib plasti — sintetična vrednost je legitimna za unit).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { trackSessionLocale } from "@/lib/planner-analytics";

const ANALYTICS_SRC = readFileSync(
  new URL("../../lib/planner-analytics.ts", import.meta.url),
  "utf8"
);
const ROUTE_SRC = readFileSync(
  new URL("../../app/api/analytics/event/route.ts", import.meta.url),
  "utf8"
);
const COMPONENT_SRC = readFileSync(
  new URL("../../components/session-locale-kpi.tsx", import.meta.url),
  "utf8"
);
const LAYOUT_SRC = readFileSync(
  new URL("../../app/layout.tsx", import.meta.url),
  "utf8"
);
const EVENTS_DOC = readFileSync(
  new URL("../../../docs/ANALYTICS-EVENTS.md", import.meta.url),
  "utf8"
);
const PLANNER_SRC = readFileSync(
  new URL("../../components/sections/itinerary-planner.tsx", import.meta.url),
  "utf8"
);

describe("W1 KPI telemetrija: session_locale (kanon paritete W3)", () => {
  test("session_locale je član PlannerEventName union-a", () => {
    expect(ANALYTICS_SRC).toContain('| "session_locale"');
  });

  test("session_locale je v strežniški VALID_EVENTS (0 tihih 400)", () => {
    // Past revizije 1.132.0: 18 dogodkov je tiho dobivalo 400 — w3 pariteta
    // test pokriva vse člane union-a; tu eksplicitno za nov dogodek.
    expect(ROUTE_SRC).toContain('"session_locale"');
  });

  test("trackSessionLocale je izvožen + ključ sessionStorage po vzorcu", () => {
    expect(ANALYTICS_SRC).toContain(
      "export function trackSessionLocale(locale: string): void"
    );
    expect(ANALYTICS_SRC).toContain('"dsa_planner_locale_seen"');
    // sessionStorage (NE localStorage) — enkrat NA SEJO brskalnika:
    expect(ANALYTICS_SRC).toContain(
      "sessionStorage.setItem(LOCALE_SEEN_KEY"
    );
  });

  test("vrstica v docs/ANALYTICS-EVENTS.md (dokumentirana metrika)", () => {
    // W12 (1.144.0): vrstica razširjena s fr/es — zgodovinski W1 prefix
    // ostane kot sidro + nova pričakovanja.
    expect(EVENTS_DOC).toContain("`session_locale` (1.139.0, W1 KPI; 1.144.0 W12 +fr/es)");
    expect(EVENTS_DOC).toContain("delež sej v it/de (W1) + fr/es (W12) locale");
    expect(EVENTS_DOC).toContain("`sl`/`en`/`it`/`de`/`fr`/`es`");
  });

  test("lijak: planner_started že nosi locale (konverzija po jeziku)", () => {
    // Benchmark §6 W1 vrstica 2: "konverzija it/de sej → generiran načrt"
    // je pokrita z obstoječim planner_started{locale} → planner_submitted
    // (klic je v itinerary-planner.tsx, ne v lib plasti).
    expect(PLANNER_SRC).toMatch(
      /trackPlannerEvent\("planner_started",\s*\{\s*locale/u
    );
  });
});

describe("W1 KPI funkcionalno: enkrat na (seja, locale)", () => {
  // globalni mock (vzorec task8-f3cd): store + zajem fetch klicev
  const setupStore = (impl?: {
    getItem?: (k: string) => string | null;
    setItem?: (k: string, v: string) => void;
  }) => {
    const store = new Map<string, string>();
    const calls: { name: string; props: Record<string, unknown> }[] = [];
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: impl?.getItem ?? ((k: string) => (store.has(k) ? (store.get(k) as string) : null)),
      setItem: impl?.setItem ?? ((k: string, v: string) => void store.set(k, v)),
    };
    (globalThis as Record<string, unknown>).fetch = (
      _url: unknown,
      init?: { body?: string }
    ) => {
      try {
        const body = JSON.parse((init?.body as string) ?? "{}");
        calls.push({ name: body.name, props: body.props });
      } catch {
        calls.push({ name: "unparsable", props: {} });
      }
      return Promise.resolve({ ok: true } as Response);
    };
    return { store, calls };
  };

  test("dvojni klic istega locale-a → EN dogodek s pravilnim telesom", () => {
    const { calls } = setupStore();
    trackSessionLocale("sl");
    trackSessionLocale("sl");
    expect(calls.length).toBe(1);
    expect(calls[0]?.name).toBe("session_locale");
    expect(calls[0]?.props).toEqual({ locale: "sl" });
  });

  test("preklop srednje-seje: drug locale → drug dogodek (oba šteta)", () => {
    const { calls } = setupStore();
    trackSessionLocale("it"); // "sl" je že v spominu prejšnjega bloka — "it" je
    trackSessionLocale("it"); // svež: preklop SL → IT srednje-seje se šteje v IT
    expect(calls.length).toBe(1);
    expect(calls[0]?.props).toEqual({ locale: "it" });
  });

  test("persistenca ključa dsa_planner_locale_seen v sessionStorage", () => {
    const { store, calls } = setupStore();
    trackSessionLocale("de");
    expect(store.get("dsa_planner_locale_seen")).toBe('{"de":true}');
    trackSessionLocale("de"); // drugi klic NE izstreli (isti ključ)
    expect(calls.length).toBe(1);
  });

  test("fail-open: sessionStorage meče → dogodek se vseeno izstreli, ENKRAT na nalaganje", () => {
    // Zasebni način: storage nedostenčen — meritev ne sme tiho izpasti (isti
    // precedens kot bumpIngestCount), A v-spominu Set prepreči spam na vsakem
    // kliku znotraj enega nalaganja strani.
    const { calls } = setupStore({
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("SecurityError");
      },
    });
    trackSessionLocale("en");
    trackSessionLocale("en");
    expect(calls.length).toBe(1);
    expect(calls[0]?.props).toEqual({ locale: "en" });
  });

  test("pokvarjen JSON v storage → neviden (0 izgubljenih meritev)", () => {
    const { calls } = setupStore({
      getItem: () => "{pokvarjen json",
      setItem: () => {
        /* tiho — v produkciji bi zapisal; tukaj samo ne meče */
      },
    });
    // sintetični locale: vsi 4 pravi so že v spominu modula (vrstni red
    // blokov zgoraj); lib funkcija je totalna nad nizi
    trackSessionLocale("fr");
    expect(calls.length).toBe(1);
    expect(calls[0]?.props).toEqual({ locale: "fr" });
  });
});

describe("W1 KPI source-contract: SessionLocaleKpi komponenta + layout", () => {
  test("komponenta: use client, useLocale (NE navigator.language), effect [locale], vrne null", () => {
    expect(COMPONENT_SRC).toContain('"use client"');
    expect(COMPONENT_SRC).toContain("useLocale");
    expect(COMPONENT_SRC).toContain("trackSessionLocale(locale)");
    // klient NE ugiba jezika (determinizem kanona — proxy.ts URL prefix):
    expect(COMPONENT_SRC).not.toContain("navigator.language");
    expect(COMPONENT_SRC).not.toContain("navigator.languages");
    // effect odvisen SAMO od locale (brez zanke):
    expect(COMPONENT_SRC).toContain("}, [locale]);");
    // BREZ UI — vrne null (0 CLS, 0 layoutnega premika):
    expect(COMPONENT_SRC).toContain("return null;");
  });

  test("layout: montirana v root layoutu znotraj NextIntlClientProvider", () => {
    expect(LAYOUT_SRC).toContain(
      'import { SessionLocaleKpi } from "@/components/session-locale-kpi";'
    );
    const mountedIdx = LAYOUT_SRC.indexOf("<SessionLocaleKpi />");
    const providerIdx = LAYOUT_SRC.indexOf("<NextIntlClientProvider");
    expect(mountedIdx).toBeGreaterThan(providerIdx);
    expect(mountedIdx).toBeGreaterThan(-1);
  });

  test("brez UI stranskih učinkov: komponenta ne izriše ničesar", () => {
    // edini return v komponenti je null (ni JSX elementov):
    expect(COMPONENT_SRC.match(/return null;/g)?.length).toBe(1);
    expect(COMPONENT_SRC).not.toMatch(/return\s*</);
  });
});
