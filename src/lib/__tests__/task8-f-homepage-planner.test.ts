// ============================================================================
// TASK 8 / D8-F — ISSUE #8 (§7 + §5): hierarhija domače strani + trak
// "Iz moje poti" + razbremenitev akcijske vrstice načrtovalnika
// ============================================================================
// SOURCE-CONTRACT (precedent TASK 78/82/100 — trditve o DEJANSKI odposlani
// datoteki, obnašanje dokazuje browser QA):
//
//  1. HOMEPAGE (issue §7 — declutter, ZERO LOSS): vrstni red blokov po
//     D8-B §7 (WelcomeBackWrapper NAD destinacijami), vstopna vrstica s 5
//     žetoni, PlanCheck + ValidatorTelemetry zložena v native <details>,
//     StickyMobileCTA upokojen na domači strani, VSI ostali bloki prisotni.
//  2. TRAK "IZ MOJE POTI": komponenta obstaja, bere useMyTrip, gumba
//     "Uporabi v načrtu" + "Počisti" (z razveljavitvijo), dogodki izrecno
//     NE razporejajo (iskrena opomba namesto lažnega schedulinga).
//  3. AKCIJSKA VRSTICA: handlerji handleSaveShare/handleStartGoMode/
//     handleIcsDownload/handleListenClick/setEmailOpen + DropdownMenu "Več"
//     (zero loss, issue §42 — vse akcije ostanejo dosegljive).
//  4. MOBILNO: vstopna vrstica ima horizontalni snap scroll (mobilno) in
//     flex wrap (sm+).
//
// NAMERNE SPREMEMBE (issue §52): StickyMobileCTA je ODSTRANJEN iz domače
// strani (mobilni tab bar ga pokriva — D8-B §6.2; "Za ponudnike" živi v
// nogi + meniju); E-pošta/.ics/Poslušaj so PRESTAVLJENI v meni "Več"
// (akcije načrtovalnika prestavljene v meni Več — vse ostajajo dosegljive).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const HOME_SOURCE = readFileSync("src/app/page.tsx", "utf8");
const ENTRY_ROW_SOURCE = readFileSync(
  "src/components/home-entry-row.tsx",
  "utf8"
);
const STRIP_SOURCE = readFileSync(
  "src/components/planner-my-trip-strip.tsx",
  "utf8"
);
const PLANNER_SOURCE = readFileSync(
  "src/components/sections/itinerary-planner.tsx",
  "utf8"
);
const SL = JSON.parse(readFileSync("src/i18n/messages/sl.json", "utf8")) as {
  planner: Record<string, string>;
};
const EN = JSON.parse(readFileSync("src/i18n/messages/en.json", "utf8")) as {
  planner: Record<string, string>;
};

/** Odstrani komentarje (佟esto vir — ne smemo zaupati komentarjem). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const HOME = stripComments(HOME_SOURCE);
const ENTRY_ROW = stripComments(ENTRY_ROW_SOURCE);
const STRIP = stripComments(STRIP_SOURCE);
const PLANNER = stripComments(PLANNER_SOURCE);

// ---------------------------------------------------------------------------
// 1. HOMEPAGE — vrstni red + zero loss (issue §7, D8-B §7)
// ---------------------------------------------------------------------------

describe("TASK 8 / D8-F — homepage hierarhija (issue #7)", () => {
  test("WelcomeBackWrapper stoji NAD DestinationsSection (kontinuacija na vrhu)", () => {
    const welcome = HOME.indexOf("<WelcomeBackWrapper />");
    const destinations = HOME.indexOf("<DestinationsSection");
    expect(welcome).toBeGreaterThanOrEqual(0);
    expect(destinations).toBeGreaterThanOrEqual(0);
    expect(welcome).toBeLessThan(destinations);
  });

  test("Hero stoji PRVI (nad WelcomeBackWrapper in HomeEntryRow)", () => {
    const hero = HOME.indexOf("<Hero />");
    const welcome = HOME.indexOf("<WelcomeBackWrapper />");
    const entryRow = HOME.indexOf("<HomeEntryRow />");
    expect(hero).toBeGreaterThanOrEqual(0);
    expect(hero).toBeLessThan(welcome);
    expect(hero).toBeLessThan(entryRow);
  });

  test("HomeEntryRow stoji med WelcomeBackWrapper in DestinationsSection", () => {
    const welcome = HOME.indexOf("<WelcomeBackWrapper />");
    const entryRow = HOME.indexOf("<HomeEntryRow />");
    const destinations = HOME.indexOf("<DestinationsSection");
    expect(welcome).toBeLessThan(entryRow);
    expect(entryRow).toBeLessThan(destinations);
  });

  test("urejenost uredniškega odkrivanja: destinacije → doživetja → AI poti → hub", () => {
    const order = [
      "<DestinationsSection",
      "<ExperiencesSection",
      "<PreGeneratedItinerariesWrapper",
      "<ExploreHub",
    ].map((tag) => HOME.indexOf(tag));
    for (const idx of order) expect(idx).toBeGreaterThanOrEqual(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("PlanCheckSection in ValidatorTelemetrySection sta zložena v <details> (progresivno razkrivanje)", () => {
    const planCheck = HOME.indexOf("<PlanCheckSection />");
    const telemetry = HOME.indexOf("<ValidatorTelemetrySection />");
    expect(planCheck).toBeGreaterThanOrEqual(0);
    expect(telemetry).toBeGreaterThanOrEqual(0);
    // vsak blok je OBJET v svoj <details> (odprtje pred, zaprtje za) z <summary>
    for (const [name, idx] of [
      ["PlanCheckSection", planCheck],
      ["ValidatorTelemetrySection", telemetry],
    ] as const) {
      const open = HOME.lastIndexOf("<details", idx);
      const close = HOME.indexOf("</details>", idx);
      const summary = HOME.lastIndexOf("<summary", idx);
      expect(open).toBeGreaterThan(-1);
      expect(close).toBeGreaterThan(idx);
      expect(summary).toBeGreaterThan(open);
      expect(summary).toBeLessThan(idx);
      // zaprt po privzetem: ta <details> NIMA atributa open
      expect(HOME.slice(open, open + 40)).not.toMatch(/\bopen\b/);
    }
    // povzetka poznata obe jezika
    expect(HOME_SOURCE).toContain("Preveri svoj obstoječi načrt");
    expect(HOME_SOURCE).toContain("Verify an existing plan");
    expect(HOME_SOURCE).toContain("Telemetrija validatorja");
    expect(HOME_SOURCE).toContain("Validator telemetry");
  });

  test("StickyMobileCTA NI več referenciran na domači strani (mobilni tab bar ga pokriva)", () => {
    // TASK 8 / D8-F: akcije načrtovalnika prestavljene v meni Več (issue #8 §52)
    // + StickyMobileCTA upokojen na homepage (D8-B §6.2) — vse ostaja
    // dosegljivo prek tab bara/noge. (Primerjava po BREZ-KOMENTARNEM viru —
    // dokumentacijski komentar sme odločitev imenovati, uvoz/rukovanje NE.)
    expect(HOME).not.toContain("StickyMobileCTA");
    expect(HOME_SOURCE).not.toContain('from "@/components/sticky-mobile-cta"');
    expect(HOME).not.toContain("<StickyMobileCTA />");
  });

  test("ZERO LOSS: vsi ostali homepage bloki ostajajo prisotni", () => {
    const blocks = [
      "<Hero />",
      "<WelcomeBackWrapper />",
      "<HomeEntryRow />",
      "<DestinationsSection",
      "<ExperiencesSection",
      "<PreGeneratedItinerariesWrapper",
      "<ExploreHub",
      "<PlanCheckSection />",
      "<ValidatorTelemetrySection />",
      "<StatsSection",
      "<DemoScenariosWrapper",
      "<AffiliateSection",
      "<NewsletterSection",
      "<BetaBanner",
      "<Footer",
      "<Chatbot",
      "<LegacyHashRedirect",
      "<Navigation",
      "<FunnelTracker",
    ];
    for (const block of blocks) {
      expect(HOME).toContain(block);
    }
  });

  test("BetaBanner je premaknjen POD NewsletterSection (D8-B §7 točka 8)", () => {
    const newsletter = HOME.indexOf("<NewsletterSection");
    const beta = HOME.indexOf("<BetaBanner");
    expect(newsletter).toBeGreaterThanOrEqual(0);
    expect(beta).toBeGreaterThan(newsletter);
  });
});

// ---------------------------------------------------------------------------
// 1b. HOME ENTRY ROW — 5 žetonov + mobilni scroll/wrap
// ---------------------------------------------------------------------------

describe("TASK 8 / D8-F — vstopna vrstica (home-entry-row)", () => {
  test("5 žetonov: Narava, Hrana, Mesta, Doživetja, Dogodki (SL + EN)", () => {
    expect(ENTRY_ROW_SOURCE).toContain("Narava");
    expect(ENTRY_ROW_SOURCE).toContain("Hrana");
    expect(ENTRY_ROW_SOURCE).toContain("Mesta");
    expect(ENTRY_ROW_SOURCE).toContain("Doživetja");
    expect(ENTRY_ROW_SOURCE).toContain("Dogodki");
    expect(ENTRY_ROW_SOURCE).toContain("Nature");
    expect(ENTRY_ROW_SOURCE).toContain("Food");
    expect(ENTRY_ROW_SOURCE).toContain("Cities");
    expect(ENTRY_ROW_SOURCE).toContain("Experiences");
    expect(ENTRY_ROW_SOURCE).toContain("Events");
  });

  test("povezave vodijo na obstoječe strani (destinacije, lokali, doživetja, dogodki)", () => {
    expect(ENTRY_ROW).toContain('"/destinacije"');
    expect(ENTRY_ROW).toContain('"/lokali"');
    expect(ENTRY_ROW).toContain('"/dozivetja"');
    expect(ENTRY_ROW).toContain('"/dogodki"');
  });

  test("mobilno: horizontalni snap scroll; sm+: flex wrap", () => {
    expect(ENTRY_ROW).toContain("overflow-x-auto");
    expect(ENTRY_ROW).toContain("snap-x");
    expect(ENTRY_ROW).toContain("sm:flex-wrap");
  });

  test("44px+ dotik tarč + aria-label na vsakem žetonu", () => {
    expect(ENTRY_ROW).toContain("min-h-11");
    expect(ENTRY_ROW).toContain("aria-label={s.aria[key]}");
  });
});

// ---------------------------------------------------------------------------
// 2. TRAK "IZ MOJE POTI" (D8-B §5)
// ---------------------------------------------------------------------------

describe("TASK 8 / D8-F — trak \"Iz moje poti\" (planner-my-trip-strip)", () => {
  test("komponenta obstaja, je klient in bere useMyTrip", () => {
    expect(STRIP_SOURCE.startsWith('"use client";')).toBe(true);
    expect(STRIP_SOURCE).toContain("useMyTrip()");
  });

  test("gumba \"Uporabi v načrtu\" + \"Počisti\" (SL/EN), Počisti z razveljavitvijo", () => {
    expect(STRIP_SOURCE).toContain("Uporabi v načrtu");
    expect(STRIP_SOURCE).toContain("Use in my plan");
    expect(STRIP_SOURCE).toContain("Počisti");
    expect(STRIP_SOURCE).toContain("Clear");
    expect(STRIP_SOURCE).toContain("clearMyTripItems");
    expect(STRIP_SOURCE).toContain("addMyTripItem");
  });

  test("POŠTEN prenos: NE generira načrta — prefill zgolj destinacij/izdelkov", () => {
    // destinacije → CustomEvent (posluša ga planner, zapolni PRAZNO izbiro)
    expect(STRIP_SOURCE).toContain("dai:my-trip-prefill");
    expect(STRIP_SOURCE).toContain("MY_TRIP_PREFILL_EVENT");
    // izdelki → obstoječa izbira (store + sessionStorage — handoff kanon)
    expect(STRIP_SOURCE).toContain("setSelectedProducts");
    expect(STRIP_SOURCE).toContain("persistSelection");
    // NI klica generiranja AI iz traku (samo v KODI — brez komentarjev)
    expect(STRIP).not.toContain("generateItinerary");
    expect(STRIP).not.toContain("/api/itinerary");
  });

  test("dogodki: iskrena opomba namesto lažnega razporejanja (no fake data)", () => {
    expect(STRIP_SOURCE).toContain(
      "Dogodki se dodajo v načrt po generiranju."
    );
    expect(STRIP_SOURCE).toContain(
      "Events are added to the plan after generation."
    );
    // NE konstrukcije ItineraryEvent iz zbirke (manjkali bi datum/kategorija
    // — izmišljevanje je prepovedano) — samo v KODI (komentarji dokumentirajo
    // odločitev, zato primerjamo brez-komentarni vir)
    expect(STRIP).not.toContain("ItineraryEvent");
    expect(STRIP).not.toContain("addedEvents");
    expect(STRIP).not.toContain("setItinerary");
  });

  test("zbirka po uporabi OSTANE (odstranjevanje le prek ✕ / Počisti) + toast", () => {
    expect(STRIP_SOURCE).toContain("Uporabljeno v načrtu");
    expect(STRIP_SOURCE).toContain("Applied to your plan");
    // Po handleUse NE čistimo zbirke
    const handleUse = STRIP_SOURCE.slice(
      STRIP_SOURCE.indexOf("const handleUse"),
      STRIP_SOURCE.indexOf("return (")
    );
    expect(handleUse).not.toContain("clearMyTripItems");
  });

  test("trak je vstavljen v obrazec načrtovalnika (NAD NL vnosom/blokom destinacij)", () => {
    const strip = PLANNER.indexOf("<PlannerMyTripStrip />");
    const form = PLANNER.indexOf('<CardContent className="space-y-5">');
    const nlInput = PLANNER.indexOf('id="planner-nl"');
    expect(strip).toBeGreaterThan(form);
    expect(strip).toBeLessThan(nlInput);
  });

  test("planner posluša prefill dogodek in spoštuje uporabnikovo izbiro (IF EMPTY)", () => {
    expect(PLANNER_SOURCE).toContain("MY_TRIP_PREFILL_EVENT");
    expect(PLANNER_SOURCE).toContain("handleMyTripPrefill");
    // NIKOLI ne prepiše obstoječe izbire (prazna = edina izpolnjena)
    expect(PLANNER_SOURCE).toContain("prev.preferredDestinations");
    // NO avtomatsko generiranje ob prefillu
    const listener = PLANNER_SOURCE.slice(
      PLANNER_SOURCE.indexOf("handleMyTripPrefill"),
      PLANNER_SOURCE.indexOf("=== 1.42 (GEO → NAČRT)")
    );
    expect(listener).not.toContain("generateItinerary");
  });
});

// ---------------------------------------------------------------------------
// 3. AKCIJSKA VRSTICA — zero loss + meni "Več" (issue §42/§5)
// ---------------------------------------------------------------------------

describe("TASK 8 / D8-F — akcijska vrstica načrtovalnika (meni Več)", () => {
  test("primarna (Shrani in deli) + sekundarna (Zaženi Na poti) sta ostala", () => {
    expect(PLANNER).toContain("onClick={handleSaveShare}");
    expect(PLANNER).toContain("onClick={handleStartGoMode}");
    // TASK 8 / D8-F: oznaka je v ternariju (saving ? saving : saveShare) —
    // preverjamo prisotnost ključa, ne dobesedne JSF sintakse.
    expect(PLANNER).toContain('t("saveShare")');
    expect(PLANNER).toContain('{t("goModeButton")}');
  });

  test("VSI handlerji ostajajo: e-pošta, .ics, Poslušaj (zero loss)", () => {
    // TASK 8 / D8-F: akcije načrtovalnika prestavljene v meni Več (issue #8
    // §52) — vse ostajajo dosegljive.
    expect(PLANNER).toContain("setEmailOpen((v) => !v)");
    expect(PLANNER).toContain("handleIcsDownload");
    expect(PLANNER).toContain("handleListenClick");
    // pogoj Poslušaj ostaja: samo ko obstaja audioScript
    expect(PLANNER).toContain("{audioScript && (");
    // aria-labels preneseni v meni
    expect(PLANNER).toContain('aria-label={t("emailButtonAriaLabel")}');
    expect(PLANNER).toContain('aria-label={t("icsButtonAria")}');
    expect(PLANNER).toContain('aria-label={t("listenButtonAria")}');
  });

  test("DropdownMenu \"Več\" je izrisan (E-pošta, .ics, Poslušaj znotraj)", () => {
    expect(PLANNER).toContain("<DropdownMenu>");
    expect(PLANNER).toContain("<DropdownMenuTrigger asChild>");
    expect(PLANNER).toContain("<DropdownMenuItem");
    expect(PLANNER).toContain('{t("moreActions")}');
    expect(PLANNER).toContain('{t("emailMenu")}');
    expect(PLANNER).toContain('{t("icsMenu")}');
    // TASK 8 / D8-F: oznaka je v ternariju (audioLoading ? generating : listen)
    expect(PLANNER).toContain('t("listenButton")');
  });

  test("i18n: novi ključi so v obeh jezikih (pariteta)", () => {
    const keys = [
      "moreActions",
      "emailMenu",
      "icsMenu",
      "myTripPrefillApplied",
      "myTripPrefillKept",
      "myTripPrefillSource",
    ];
    for (const key of keys) {
      expect(typeof SL.planner[key]).toBe("string");
      expect(typeof EN.planner[key]).toBe("string");
    }
    expect(SL.planner.moreActions).toBe("Več");
    expect(EN.planner.moreActions).toBe("More");
    expect(SL.planner.icsMenu).toContain(".ics");
  });
});

// ---------------------------------------------------------------------------
// 4. TRIP TIMELINE — dokumentirana meja faze (NI dotaknjen)
// ---------------------------------------------------------------------------

describe("TASK 8 / D8-F — trip-timeline (faza 2, nedotaknjen)", () => {
  test("trip-timeline nima vzporedne 5-CTA vrstice (mikro akcije po postanku ostanejo)", () => {
    const timeline = readFileSync("src/components/trip-timeline.tsx", "utf8");
    expect(timeline).not.toContain("handleIcsDownload");
    expect(timeline).not.toContain("handleListenClick");
    // TASK 8 / D8-F: paralelna akcijska vrstica trip-timeline (save/navigate
    // na postanku) je kontekstualna mikro akcija — izrecno ODLOŽENA v fazo 2.
  });
});
