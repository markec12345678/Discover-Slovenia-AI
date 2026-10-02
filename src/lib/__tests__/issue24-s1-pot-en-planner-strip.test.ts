// ============================================================================
// ISSUE #24 — SKLOP 1 (1.164.0): /pot DVOJEZIČNOST + TRAK NA /nacrtuj
// ============================================================================
// Zaklene implementacijsko fazo benchmarka UI/UX 2026-10-02 (P2-a + P2-b):
//
//   P2-a  Skupnostna površina /pot/[shareId] (+ embed) je zdaj na EN
//         whitelisti — /en/pot/[shareId] živi (prej 308 na slovensko, ker je
//         bila celotna površina SL-only). VSE komponente površine so L-vzorec
//         {sl,en}; AI svetovalec odgovarja v jeziku površine; dogodki dobijo
//         EN prekrivno plast (isti vir kot /en/nacrtuj).
//
//   P2-b  Vodeni trak (GuidanceStrip) živi zdaj TUDI na načrtovalniku
//         (površina "planner") — skriti NEW_USER (first-run kartica je
//         domača pristojnost) in TRIP_BUILDING (primarna akcija bi bila
//         samopovezava na /nacrtuj; add-toast že pokriva ta korak).
//
// Vzorec: source-contract + funkcijski testi (issue23-guidance-ux/core).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { isEnRoute, isLocaleRoute } from "@/i18n/routing";

const ROOT = join(import.meta.dir, "../../..");
const read = (rel: string): string =>
  readFileSync(join(ROOT, rel), "utf-8");

const ROUTING = read("src/i18n/routing.ts");
const PLANNER_PAGE = read("src/app/nacrtuj/page.tsx");
const HOME_PAGE = read("src/app/page.tsx");
const SCREEN = read("src/app/pot/shared-trip-screen.tsx");
const SHARED_TRIP = read("src/components/shared-trip.tsx");
const TRIP_SOCIAL = read("src/components/trip-social.tsx");
const TRIP_CHAT_LIB = read("src/lib/trip-chat.ts");
const USE_TRIP_CHAT = read("src/hooks/use-trip-chat.ts");
const AI_REPLY = read("src/app/api/trip-comments/ai-reply/route.ts");
const FULL_PAGE = read("src/app/pot/[shareId]/page.tsx");
const EMBED_PAGE = read("src/app/pot/embed/[shareId]/page.tsx");

/** Vse plošče površine /pot — vsaka mora nositi L-vzorec {sl,en}. */
const POT_PANELS: [string, string][] = [
  ["TripSocial (klepet + všečki)", "src/components/trip-social.tsx"],
  ["SharedTrip (itinerer)", "src/components/shared-trip.tsx"],
  ["TripCollaboration (sodelovanje)", "src/components/trip-collaboration.tsx"],
  ["TripReservations (rezervacije)", "src/components/trip-reservations.tsx"],
  ["TripBudgetCard (proračun)", "src/components/trip-budget-card.tsx"],
  ["TripDocumentsCard (dokumenti)", "src/components/trip-documents-card.tsx"],
  ["TripGuide (vodnik)", "src/components/trip-guide.tsx"],
  ["TripDiary (dnevnik)", "src/components/trip-diary.tsx"],
  ["TripPolls (ankete)", "src/components/trip-polls.tsx"],
  ["TripPushCard (opomniki)", "src/components/trip-push-card.tsx"],
  ["PrintQr (PDF nogica)", "src/app/pot/[shareId]/print-qr.tsx"],
];

// ---------------------------------------------------------------------------
// P2-a · 1. ROUTING: /pot na EN whitelisti (funkcijsko)
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 1 — routing: EN whitelist za /pot", () => {
  test("① isEnRoute sprejme veljavne deljene pote (/pot/[shareId], /pot/embed/[shareId])", () => {
    expect(isEnRoute("/pot/abc123def4")).toBe(true);
    expect(isEnRoute("/pot/embed/abc123def4")).toBe(true);
  });

  test("② isEnRoute ZAVRNE neobstoječe oblike (/pot brez ID-ja, 3+ segmenti)", () => {
    expect(isEnRoute("/pot")).toBe(false);
    expect(isEnRoute("/pot/")).toBe(false);
    expect(isEnRoute("/pot/abc/extra")).toBe(false);
    // Opomba: /pot/embed (brez ID-ja) ujame whitelistni regex — nedolžno:
    // te strani NI (samo /pot/embed/[shareId]) → 404 v obeh jezikih,
    // nikoli mešane vsebine (P4-8 ohranjen). Regex namerno preprost.
  });

  test("③ IT/DE/FR/ES za /pot ŠE VEDNO ne obstajajo (iskrena meja — 308 ostane)", () => {
    for (const loc of ["it", "de", "fr", "es"] as const) {
      expect(isLocaleRoute("/pot/abc123def4", loc)).toBe(false);
      expect(isLocaleRoute("/pot/embed/abc123def4", loc)).toBe(false);
    }
    // SL (default) je vedno res — izvirnik.
    expect(isLocaleRoute("/pot/abc123def4", "sl")).toBe(true);
  });

  test("④ whitelist deklaracija EN_POT_ROUTES obstaja v viru (dokumentacija živi ob kodi)", () => {
    expect(ROUTING).toContain("EN_POT_ROUTES");
    expect(ROUTING).toMatch(/\/\^\\\/pot\\\/\[\^\/\]\+\$\/,/);
    expect(ROUTING).toContain("EN_POT_ROUTES.some((re) => re.test(pathname))");
  });

  test("⑤ ostale whitelistne poti so NEDOTAKNJENE (jedro lijaka); ne-whitelistne ostanejo izven", () => {
    for (const p of ["/", "/nacrtuj", "/destinacije", "/zemljevid", "/moja-potovanja"]) {
      expect(isEnRoute(p)).toBe(true);
    }
    // /blog ni (in ni bil) na EN whitelisti — 308 kanon ostaja.
    expect(isEnRoute("/blog")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// P2-a · 2. VSE POVRŠINSKE PLOŠČE SO L-VZOREC {sl,en}
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 1 — /pot plošče: L-vzorec {sl,en}", () => {
  for (const [label, rel] of POT_PANELS) {
    test(`⑥ ${label}: marker #24 + dvojezični slovar + useLocale`, () => {
      const src = read(rel);
      // marker implementacijske faze (dokumentacija v kodi)
      expect(src).toContain("ISSUE #24 Sklop 1 (1.164.0)");
      // jezikovna izbira prek next-intl (klient useLocale / RSC getLocale)
      const hasLocaleHook =
        src.includes("useLocale") ||
        src.includes("getLocale") ||
        // guide je bil že prej dvojezičen prek isEn ternarijev → kanoniziran
        (rel.endsWith("trip-guide.tsx") && src.includes('locale === "en"'));
      expect(hasLocaleHook).toBe(true);
      // oba jezika prisotna v slovarju (per-jezik ali per-ključ oblika).
      // parity ključev SL/EN so agenti potrdili izčrpno; tukaj zaklenemo
      // prisotnost obeh jezikov + marker + jezikovni priklop (štetje po
      // regexu bi dalo lažne zadetke — npr. »neuspešen:" znotraj niza).
      const slCount = (src.match(/\bsl:\s*["{(]/g) ?? []).length;
      const enCount = (src.match(/\ben:\s*["{(]/g) ?? []).length;
      expect(slCount).toBeGreaterThan(0);
      expect(enCount).toBeGreaterThan(0);
    });
  }

  test("⑦ TripPresence je NEspremenjen kanon (referenca vzorca — 1.126.0, izven #24)", () => {
    const src = read("src/components/trip-presence.tsx");
    expect(src).not.toContain("ISSUE #24 Sklop 1");
    expect(src).toContain('L[locale === "en" ? "en" : "sl"]');
  });
});

// ---------------------------------------------------------------------------
// P2-a · 3. TRIP SOCIAL: klepet z @AI sledi jeziku površine
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 1 — skupinski klepet z @AI", () => {
  test("⑧ trip-chat lib: kanonično SL ime (DB) + EN prikazno ime", () => {
    expect(TRIP_CHAT_LIB).toContain('export const AI_ADVISOR_NAME = "AI svetovalec";');
    expect(TRIP_CHAT_LIB).toContain('export const AI_ADVISOR_NAME_EN = "AI Advisor";');
    // rezervirana imena še vedno varujejo značko (ponarejanje ni mogoče)
    expect(TRIP_CHAT_LIB).toContain('"ai advisor"');
  });

  test("⑨ use-trip-chat: askAi sprejme locale in ga pošlje strežniku", () => {
    expect(USE_TRIP_CHAT).toContain('locale?: "sl" | "en"');
    expect(USE_TRIP_CHAT).toContain('locale: "en"');
  });

  test("⑩ ai-reply API: strog validacijski varovalni oblok (samo sl|en) + pogon v jeziku", () => {
    expect(AI_REPLY).toMatch(/b\.locale === "en" \? "en" : "sl"/);
    expect(AI_REPLY).toContain("answerChatQuestion(question, reqLang)");
    // glava ne trdi več, da je površina SL-only
    expect(AI_REPLY).not.toContain("odgovori so v slovenščini");
  });

  test("⑪ TripSocial: vstavljanje krajev + vprašanje @AI nosita jezik površine", () => {
    expect(TRIP_SOCIAL).toContain("askAi(body, lang)");
    expect(TRIP_SOCIAL).toContain("{ locale: lang }");
    // EN prikazno ime svetovalca na EN površini (DB ostane kanoničen)
    expect(TRIP_SOCIAL).toContain("AI_ADVISOR_NAME_EN");
  });
});

// ---------------------------------------------------------------------------
// P2-a · 4. RSC PLAŠČ + METADATA + DOGODKI
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 1 — RSC plašč in metadata", () => {
  test("⑫ shared-trip-screen: getLocale + dogodki v jeziku površine + dvojezične oznake dni", () => {
    expect(SCREEN).toContain('from "next-intl/server"');
    expect(SCREEN).toMatch(/matchEventsForItinerary\(\s*[\s\S]*?lang\s*[,)]/);
    expect(SCREEN).toContain("ISSUE #24 Sklop 1 (1.164.0)");
    // oznake dni "Dan N"/"Day N" izhajajo iz istega L slovarja
    expect(SCREEN.match(/dayLabel/)).not.toBeNull();
  });

  test("⑬ SharedTrip: »Dan N« → »Day N« (sidra/ID-ji ostanejo nespremenjeni)", () => {
    // oznaka dneva kot funkcija v obeh jezikih L slovarja
    expect(SHARED_TRIP).toContain("dayLabel: (n: number) => `Dan ${n}`");
    expect(SHARED_TRIP).toContain("dayLabel: (n: number) => `Day ${n}`");
    // sidra dni ostajajo jezikovno nevtralna (URL-ji se NE spreminjajo)
    expect(SHARED_TRIP).toMatch(/dan-\$\{|`dan-|"dan-"/);
  });

  test("⑭ obe generateMetadata (polna stran + embed) čutita locale", () => {
    // Polna stran: naslov + opis v jeziku površine.
    expect(FULL_PAGE).toContain("getLocale");
    expect(FULL_PAGE).toContain("Itinerary does not exist");
    expect(FULL_PAGE).toContain("travel plan around Slovenia");
    // Embed: SAMO naslov (opis nikoli ni obstajal — embed je brez opisa);
    // kanonična pot ostaja slovenska ne glede na jezik (iskalnik → vir).
    expect(EMBED_PAGE).toContain("getLocale");
    expect(EMBED_PAGE).toContain("Itinerary does not exist");
    expect(EMBED_PAGE).toContain('canonical: `/pot/${shareId}`');
  });
});

// ---------------------------------------------------------------------------
// P2-b · 5. VODENI TRAK NA NAČRTOVALNIKU
// ---------------------------------------------------------------------------

describe("ISSUE #24 Sklop 1 — GuidanceStrip na /nacrtuj (planner)", () => {
  test("⑮ trak je montiran z gladko površino »planner« in skritima NEW_USER + TRIP_BUILDING", () => {
    expect(PLANNER_PAGE).toContain('surface="planner"');
    expect(PLANNER_PAGE).toContain('hideStates={["NEW_USER", "TRIP_BUILDING"]}');
  });

  test("⑯ montažni red: trak je NAD jedrom načrtovalnika (viden pred obrazcem)", () => {
    const stripIdx = PLANNER_PAGE.indexOf('<GuidanceStrip');
    const plannerIdx = PLANNER_PAGE.indexOf("<ItineraryPlanner />");
    expect(stripIdx).toBeGreaterThan(-1);
    expect(plannerIdx).toBeGreaterThan(stripIdx);
  });

  test("⑰ domači trak je NEspremenjen (home skriva NEW_USER — first-run kartica nad njim)", () => {
    expect(HOME_PAGE).toContain('<GuidanceStrip surface="home" hideStates={["NEW_USER"]} />');
  });

  test("⑱ telemetrija traku že nosi površino (guidance_shown/interaction — KPI #24 merljiv)", () => {
    const strip = read("src/components/guidance/guidance-strip.tsx");
    expect(strip).toContain("trackPlannerEvent(\"guidance_shown\"");
    expect(strip).toContain("surface,");
  });
});
