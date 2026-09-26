// TASK 8 / F3-C + F3-D (issue #8 — Discovery UX 2.0, audit §3 START
// ANYWHERE + §4 WISHLIST→TRIP BRIDGE): source-contract + čiste-funkcije
// testi.
//
// 1. FUNKCIONALNO: wishlist-trip-bridge (groupWishlistByDestination —
//    razrešljivo ime/slug → ID; nerazrešljivo → undefined; števci; vrstni
//    red; wishlistTripItemOf — identiteta kind:refId/href/source enaka
//    ročni preslikavi v wishlist-sheet).
// 2. SOURCE-CONTRACT F3-C: planner above-the-fold povezava + zložen
//    PlannerSummaryBar + hashchange + ingest atribucija (4 točke uspeha),
//    footer pariteta, mobilni Sheet "Več", /nacrtuj USP vrstica, i18n.
// 3. SOURCE-CONTRACT F3-D: MyTripView trak "Iz priljubljenih" (isti
//    prefill dogodek + quick-add + iskren /trznica fallback),
//    PlannerMyTripStrip handleUse vključi destinacije iz priljubljenih.
// 4. ZERO-LOSS markerji (noga/Sheet/planner trak/pogled ostajajo celotni).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import {
  groupWishlistByDestination,
  wishlistTripItemOf,
} from "../wishlist-trip-bridge";
import { trackIngestCompleted } from "../planner-analytics";
import type { WishlistEntry } from "../wishlist-storage";

const PLANNER_SRC = readFileSync(
  new URL("../../components/sections/itinerary-planner.tsx", import.meta.url),
  "utf8",
);
const SUMMARY_BAR_SRC = readFileSync(
  new URL("../../components/planner-summary-bar.tsx", import.meta.url),
  "utf8",
);
const FOOTER_SRC = readFileSync(
  new URL("../../components/sections/footer.tsx", import.meta.url),
  "utf8",
);
const NAV_SRC = readFileSync(
  new URL("../../components/sections/navigation.tsx", import.meta.url),
  "utf8",
);
const NACRTUJ_PAGE_SRC = readFileSync(
  new URL("../../app/nacrtuj/page.tsx", import.meta.url),
  "utf8",
);
const MY_TRIP_VIEW_SRC = readFileSync(
  new URL("../../components/my-trip-view.tsx", import.meta.url),
  "utf8",
);
const STRIP_SRC = readFileSync(
  new URL("../../components/planner-my-trip-strip.tsx", import.meta.url),
  "utf8",
);
const WISHLIST_SHEET_SRC = readFileSync(
  new URL("../../components/wishlist-sheet.tsx", import.meta.url),
  "utf8",
);
const BRIDGE_SRC = readFileSync(
  new URL("../../lib/wishlist-trip-bridge.ts", import.meta.url),
  "utf8",
);
const ANALYTICS_SRC = readFileSync(
  new URL("../../lib/planner-analytics.ts", import.meta.url),
  "utf8",
);
const SL = JSON.parse(
  readFileSync(new URL("../../i18n/messages/sl.json", import.meta.url), "utf8")
);
const EN = JSON.parse(
  readFileSync(new URL("../../i18n/messages/en.json", import.meta.url), "utf8")
);

// ---------------------------------------------------------------------------
// pomožniki — minimalni wishlist vnosi (funkcija bere SAMO id/type/name/
// image/price/destination/slug)
// ---------------------------------------------------------------------------
function entry(over: Partial<WishlistEntry>): WishlistEntry {
  return {
    id: over.id ?? "e1",
    type: over.type ?? "experience",
    name: over.name ?? "Zipline čez Sočo",
    image: over.image ?? null,
    price: over.price ?? null,
    destination: over.destination ?? null,
    slug: over.slug ?? null,
    savedAt: over.savedAt ?? new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// 1. FUNKCIONALNO: groupWishlistByDestination (domena)
// ---------------------------------------------------------------------------
describe("F3-D groupWishlistByDestination (domena)", () => {
  test("razrešljivo ime (case-insensitive) → ID + kanonično ime", () => {
    const groups = groupWishlistByDestination([
      entry({ id: "a", destination: "Bled" }),
      entry({ id: "b", destination: "bled" }), // mala črka — isti ID
    ]);
    expect(groups.length).toBe(1);
    expect(groups[0].destinationId).toBe("bled");
    expect(groups[0].destinationName).toBe("Bled");
    expect(groups[0].count).toBe(2);
  });

  test("slug ujemanje deluje tudi, ko se ime razlikuje od slug-a", () => {
    // postojnska-jama = slug; ime = "Postojnska jama" (id postojna)
    const bySlug = groupWishlistByDestination([
      entry({ id: "a", destination: "postojnska-jama" }),
    ]);
    expect(bySlug[0].destinationId).toBe("postojna");
    const byName = groupWishlistByDestination([
      entry({ id: "b", destination: "Postojnska jama" }),
    ]);
    expect(byName[0].destinationId).toBe("postojna");
    // ime in slug se združita v ENO skupino (isti ID)
    const merged = groupWishlistByDestination([
      entry({ id: "a", destination: "postojnska-jama" }),
      entry({ id: "b", destination: "Postojnska jama" }),
    ]);
    expect(merged.length).toBe(1);
    expect(merged[0].count).toBe(2);
  });

  test("NERAZREŠLJIVO besedilo → undefined ID + iskreno surovo ime (brez izmišljanja)", () => {
    const groups = groupWishlistByDestination([
      entry({ id: "a", destination: "Nepoznana vasica" }),
      entry({ id: "b", destination: "nepoznana vasica" }), // ista skupina
    ]);
    expect(groups[0].destinationId).toBeUndefined();
    expect(groups[0].destinationName).toBe("Nepoznana vasica");
    expect(groups[0].count).toBe(2);
  });

  test("BREZ destinacije → undefined ID + Drugo/Other glede na labelo", () => {
    const sl = groupWishlistByDestination([entry({ id: "a", destination: null })]);
    expect(sl[0].destinationId).toBeUndefined();
    expect(sl[0].destinationName).toBe("Drugo"); // privzeta SL labela
    const en = groupWishlistByDestination(
      [entry({ id: "a", destination: null })],
      "Other"
    );
    expect(en[0].destinationName).toBe("Other");
  });

  test("števci + vrstni red padajoče (največja skupina prva)", () => {
    const groups = groupWishlistByDestination([
      entry({ id: "1", destination: "Piran" }),
      entry({ id: "2", destination: "Bled" }),
      entry({ id: "3", destination: "Bled" }),
      entry({ id: "4", destination: "Bled" }),
      entry({ id: "5", destination: null }),
      entry({ id: "6", destination: "Bled" }),
    ]);
    expect(groups.map((g) => g.destinationId)).toEqual([
      "bled",
      "piran",
      undefined,
    ]);
    expect(groups.map((g) => g.count)).toEqual([4, 1, 1]);
  });

  test("prazen seznam → prazen rezultat (tiho za nove uporabnike)", () => {
    expect(groupWishlistByDestination([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. FUNKCIONALNO: wishlistTripItemOf (identiteta = wishlist-sheet preslikava)
// ---------------------------------------------------------------------------
describe("F3-D wishlistTripItemOf (identiteta)", () => {
  test("kind/refId/title/href/source + podnaslov destinacija · cena", () => {
    const item = wishlistTripItemOf(
      entry({
        id: "cuid123",
        type: "product",
        name: "Kremšnita",
        image: "https://img.example/kremsnita.jpg",
        price: 45,
        destination: "Bled",
      })
    );
    expect(item.kind).toBe("product");
    expect(item.refId).toBe("cuid123");
    expect(item.title).toBe("Kremšnita");
    expect(item.href).toBe("/trznica");
    expect(item.source).toBe("priljubljene");
    expect(item.image).toBe("https://img.example/kremsnita.jpg");
    expect(item.subtitle).toContain("Bled");
    expect(item.subtitle).toContain("€"); // formatPrice (sl-SI)
  });

  test("brez destinacije/cene → podnaslov undefined (brez izmišljanja)", () => {
    const item = wishlistTripItemOf(entry({ id: "x", destination: null, price: null }));
    expect(item.subtitle).toBeUndefined();
  });

  test("IDENTITETA se ujema z wishlist-sheet.tsx preslikavo (isti literali v obeh virih)", () => {
    // ročni most (wishlist-sheet.tsx wishlistTripItem) — NE spreminjamo ga,
    // lib kopija MORA nositi iste identitetne literale (dedup čez površine):
    for (const literal of [
      "kind: entry.type,",
      "refId: entry.id,",
      'href: "/trznica",',
      'source: "priljubljene",',
    ]) {
      expect(WISHLIST_SHEET_SRC).toContain(literal);
      expect(BRIDGE_SRC).toContain(literal);
    }
    // isti izvor podnaslova (destinacija · cena, filter Boolean, join " · ")
    expect(WISHLIST_SHEET_SRC).toContain('entry.destination ?? undefined');
    expect(BRIDGE_SRC).toContain('entry.destination ?? undefined');
    expect(BRIDGE_SRC).toContain('formatPrice(entry.price)');
  });

  test("lib je ČIST (0 React odvisnosti — unit-testabilen)", () => {
    expect(BRIDGE_SRC).not.toContain('"react"');
    expect(BRIDGE_SRC).not.toContain("use client");
    // mostna semantika dokumentirana: plast zbirke, NO silent AI
    expect(BRIDGE_SRC).toContain("NO AI generiranje, NO razporejanje");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT F3-C: itinerary-planner (above-the-fold + atribucija)
// ---------------------------------------------------------------------------
describe("F3-C itinerary-planner (source-contract)", () => {
  test("above-the-fold: tiha povezava v zglavlju obrazca razširi + pomakne na #start-kjerkoli", () => {
    // povezava v CardHeader (vidna TUDI ko je obrazec edina stvar nad zvitkom)
    expect(PLANNER_SRC).toContain('t("startSourcesLink")');
    expect(PLANNER_SRC).toContain('aria-label={t("startSourcesAria")}');
    // isti vzorec kot mount razširitev hash-a: setFormExpanded + scrollIntoView
    expect(PLANNER_SRC).toContain("onClick={handleStartAnywhereJump}");
    expect(PLANNER_SRC).toContain("const handleStartAnywhereJump = useCallback(() => {");
    expect(PLANNER_SRC).toContain('getElementById("start-kjerkoli")');
    // UTIŠAN: text-xs + muted (sekundarno od AI vprašanja, ne glavna akcija)
    const linkIdx = PLANNER_SRC.indexOf('t("startSourcesLink")');
    const btnStart = PLANNER_SRC.lastIndexOf("<button", linkIdx);
    const btnEnd = PLANNER_SRC.indexOf(">", linkIdx);
    const buttonClass = PLANNER_SRC.slice(btnStart, btnEnd);
    expect(buttonClass).toContain("text-xs");
    expect(buttonClass).toContain("text-muted-foreground");
  });

  test("zložen načrt: PlannerSummaryBar dobi isto tiho pot (onStartAnywhere)", () => {
    expect(PLANNER_SRC).toContain("onStartAnywhere={handleStartAnywhereJump}");
    expect(SUMMARY_BAR_SRC).toContain("onStartAnywhere?: () => void;");
    expect(SUMMARY_BAR_SRC).toContain("onClick={onStartAnywhere}");
    expect(SUMMARY_BAR_SRC).toContain('t("startSourcesLink")');
    // opcionalen prop — obstoječi klicatelji brez njega ostanejo veljavni
    expect(SUMMARY_BAR_SRC).toContain("onStartAnywhere,\n}: PlannerSummaryBarProps)");
  });

  test("hashchange: istostranske #start-kjerkoli povezave delujejo (noga/Sheet/USP z istega računa)", () => {
    expect(PLANNER_SRC).toContain('window.addEventListener("hashchange", handleStartAnywhereHash)');
    expect(PLANNER_SRC).toContain('hash === "#start-kjerkoli" || hash === "#start-anywhere"');
  });

  test("atribucija vnosa: ingest_completed z mode propom na VSEH 4 poteh uspeha", () => {
    // povezava (F5.4) / slika (F8) / PDF (D3) / pins (F14)
    expect(PLANNER_SRC).toContain('trackIngestCompleted("link")');
    expect(PLANNER_SRC).toContain('trackIngestCompleted("image")');
    expect(PLANNER_SRC).toContain('trackIngestCompleted("pins")');
    expect(PLANNER_SRC).toContain('trackIngestCompleted("pdf")');
    // obstoječi ingest_*_success dogodki ostanejo (dodatek, ne zamenjava)
    expect(PLANNER_SRC).toContain('trackPlannerEvent("ingest_url_success"');
    expect(PLANNER_SRC).toContain('trackPlannerEvent("ingest_image_success"');
    expect(PLANNER_SRC).toContain('trackPlannerEvent("ingest_pins_success"');
    expect(PLANNER_SRC).toContain('trackPlannerEvent("ingest_pdf_success"');
  });
});

// ---------------------------------------------------------------------------
// 4. SOURCE-CONTRACT F3-C: planner-analytics (merilna priključnica)
// ---------------------------------------------------------------------------
describe("F3-C planner-analytics (source-contract + funkcionalno)", () => {
  test("ingest_completed je član unije PlannerEventName + trackIngestCompleted izvožen", () => {
    expect(ANALYTICS_SRC).toContain('| "ingest_completed"');
    expect(ANALYTICS_SRC).toContain("export function trackIngestCompleted(mode: IngestMode): void");
    expect(ANALYTICS_SRC).toContain("dsa_planner_ingest_count");
  });

  test("števec seje: sessionStorage šteje vnose po načinu (fail-open brez storage)", () => {
    // bun test: globalni sessionStorage mock (vzorec task8-my-trip-core)
    const store = new Map<string, string>();
    (globalThis as Record<string, unknown>).sessionStorage = {
      getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    };
    // fetch stub — trackPlannerEvent je fire-and-forget (nikoli ne vrže)
    (globalThis as Record<string, unknown>).fetch = () =>
      Promise.resolve({ ok: true } as Response);

    trackIngestCompleted("link");
    trackIngestCompleted("link");
    trackIngestCompleted("pdf");

    const counts = JSON.parse(
      store.get("dsa_planner_ingest_count") as string
    ) as Record<string, number>;
    expect(counts.link).toBe(2);
    expect(counts.pdf).toBe(1);
    expect(counts.image).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 5. SOURCE-CONTRACT F3-C: footer + navigation Sheet + /nacrtuj USP vrstica
// ---------------------------------------------------------------------------
describe("F3-C footer + navigation + nacrtuj/page (source-contract)", () => {
  test("noga: planStartAnywhere ZA planQuiz v koloni Načrtuj", () => {
    expect(FOOTER_SRC).toContain('{ href: "/nacrtuj#kviz", key: "planQuiz" }');
    expect(FOOTER_SRC).toContain('{ href: "/nacrtuj#start-kjerkoli", key: "planStartAnywhere" }');
    const quizIdx = FOOTER_SRC.indexOf('key: "planQuiz"');
    const startIdx = FOOTER_SRC.indexOf('key: "planStartAnywhere"');
    expect(startIdx).toBeGreaterThan(quizIdx);
  });

  test("mobilni Sheet \"Več\": startAnywhere ZA /potovanje (F3-A vrstica ostaja)", () => {
    expect(NAV_SRC).toContain('{ href: "/na-poti", label: t("goMode") }');
    expect(NAV_SRC).toContain('{ href: "/potovanje", label: t("journey") }');
    expect(NAV_SRC).toContain('{ href: "/nacrtuj#start-kjerkoli", label: t("startAnywhere") }');
    const journeyIdx = NAV_SRC.indexOf('{ href: "/potovanje", label: t("journey") }');
    const startIdx = NAV_SRC.indexOf('{ href: "/nacrtuj#start-kjerkoli", label: t("startAnywhere") }');
    expect(startIdx).toBeGreaterThan(journeyIdx);
  });

  test("/nacrtuj USP: druga tiha vrstica z ISTIM besedilom kot hero (hero.startAnywhere)", () => {
    expect(NACRTUJ_PAGE_SRC).toContain('getTranslations("hero")');
    expect(NACRTUJ_PAGE_SRC).toContain('tHero("startAnywhere")');
    expect(NACRTUJ_PAGE_SRC).toContain('href="/nacrtuj#start-kjerkoli"');
    // tiho: text-xs + muted, pod primarno USP vrstico (Wand2 ostaja prva)
    const uspIdx = NACRTUJ_PAGE_SRC.indexOf('t("usp")');
    const startIdx = NACRTUJ_PAGE_SRC.indexOf('tHero("startAnywhere")');
    expect(startIdx).toBeGreaterThan(uspIdx);
    expect(NACRTUJ_PAGE_SRC).toContain("text-xs text-muted-foreground");
  });

  test("i18n: nav.startAnywhere + footer.planStartAnywhere + planner ključi — SL + EN", () => {
    expect(SL.nav.startAnywhere).toBe("Začni kjerkoli");
    expect(EN.nav.startAnywhere).toBe("Start anywhere");
    expect(SL.footer.planStartAnywhere).toBe("Začni kjerkoli (povezava, slika, PDF)");
    expect(EN.footer.planStartAnywhere).toBe("Start anywhere (link, image, PDF)");
    // planner povezava v zglavlju/zloženem povzetku
    expect(SL.planner.startSourcesLink).toBe("Začni s svojimi viri");
    expect(EN.planner.startSourcesLink).toBe("Start from your own sources");
    expect(SL.planner.startSourcesAria.length).toBeGreaterThan(10);
    expect(EN.planner.startSourcesAria.length).toBeGreaterThan(10);
    // hero besedilo obstaja v obeh jezikih (isti slovar kot USP vrstica)
    expect(SL.hero.startAnywhere).toContain("povezava");
    expect(EN.hero.startAnywhere).toContain("link");
  });
});

// ---------------------------------------------------------------------------
// 6. SOURCE-CONTRACT F3-D: MyTripView trak "Iz priljubljenih"
// ---------------------------------------------------------------------------
describe("F3-D my-trip-view (source-contract)", () => {
  test("trak Iz priljubljenih: naslov + števec + čipi destinacij z nadstevci", () => {
    expect(MY_TRIP_VIEW_SRC).toContain('title: "Iz priljubljenih"');
    expect(MY_TRIP_VIEW_SRC).toContain('title: "From favourites"');
    expect(MY_TRIP_VIEW_SRC).toContain("wishlistEntries.length");
    // vizualna slovnica PlannerMyTripStrip: rounded-lg border bg-muted/40 p-3
    expect(MY_TRIP_VIEW_SRC).toContain("rounded-lg border border-border/70 bg-muted/40 p-3");
    // gumb pokriva quick-add + prefill
    expect(MY_TRIP_VIEW_SRC).toContain('use: "Uporabi v načrtu"');
    expect(MY_TRIP_VIEW_SRC).toContain('use: "Use in my plan"');
  });

  test("Uporabi v načrtu: ISTI dai:my-trip-prefill dogodek + quick-add vseh vnosov", () => {
    expect(MY_TRIP_VIEW_SRC).toContain(
      'import { MY_TRIP_PREFILL_EVENT, type MyTripPrefillDetail } from "@/components/planner-my-trip-strip"'
    );
    expect(MY_TRIP_VIEW_SRC).toContain(
      "new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT,"
    );
    expect(MY_TRIP_VIEW_SRC).toContain("addMyTripItem(wishlistTripItemOf(entry))");
    // samo RAZREŠENI ID-ji grejo v prefill (nerazrešljivi ne prispevajo)
    expect(MY_TRIP_VIEW_SRC).toContain(".filter((id): id is string => typeof id === \"string\")");
  });

  test("iskren toast + ToastAction nadaljevanja (zbirka ≠ razporejevalnik)", () => {
    expect(MY_TRIP_VIEW_SRC).toContain('appliedTitle: "Uporabljeno v načrtu"');
    expect(MY_TRIP_VIEW_SRC).toContain("s.wishlist.appliedNote(wishlistEntries.length)");
    // NO silent AI meja je zapisana v besedilu traku
    expect(MY_TRIP_VIEW_SRC).toContain("brez tihega AI");
    expect(MY_TRIP_VIEW_SRC).toContain("no silent AI");
  });

  test("nerazrešljivo besedilo → čip BREZ prefilla + /trznica CTA fallback", () => {
    expect(MY_TRIP_VIEW_SRC).toContain('href="/trznica"');
    expect(MY_TRIP_VIEW_SRC).toContain('openMarket: "Odpri v tržnici"');
    // čip vedno izrise nadstevce ×N
    expect(MY_TRIP_VIEW_SRC).toContain("×{group.count}");
  });

  test("wishlist hook: javni useWishlist (hidratacijsko varen, isti vir kot srček)", () => {
    expect(MY_TRIP_VIEW_SRC).toContain('import { useWishlist } from "@/hooks/use-wishlist"');
    const hookSrc = readFileSync(
      new URL("../../hooks/use-wishlist.ts", import.meta.url),
      "utf8"
    );
    expect(hookSrc).toContain("getWishlist");
    expect(hookSrc).toContain("subscribeWishlist");
    expect(hookSrc).toContain('"use client"');
  });

  test("ZERO-LOSS: pogled ostaja collection-gated + obstoječe akcije", () => {
    expect(MY_TRIP_VIEW_SRC).toContain("if (count === 0) return null;");
    expect(MY_TRIP_VIEW_SRC).toContain('continue: "Nadaljuj načrtovanje"');
    expect(MY_TRIP_VIEW_SRC).toContain("setMyTripHandoff()");
    expect(MY_TRIP_VIEW_SRC).toContain("clearMyTripItems()");
  });
});

// ---------------------------------------------------------------------------
// 7. SOURCE-CONTRACT F3-D: PlannerMyTripStrip handleUse vključi priljubljene
// ---------------------------------------------------------------------------
describe("F3-D planner-my-trip-strip (source-contract)", () => {
  test("handleUse prebere wishlist SVEŽE ob kliku + razreši destinacije", () => {
    expect(STRIP_SRC).toContain('import { getWishlist } from "@/lib/wishlist-storage"');
    expect(STRIP_SRC).toContain('import { groupWishlistByDestination } from "@/lib/wishlist-trip-bridge"');
    expect(STRIP_SRC).toContain("const wishlist = getWishlist();");
    expect(STRIP_SRC).toContain("groupWishlistByDestination(");
    // dodani so SAMO razrešljivi ID-ji (iskrenost: nerazrešljivo ne prispeva)
    expect(STRIP_SRC).toContain("if (group.destinationId && !seenIds.has(group.destinationId))");
  });

  test("en gumb pokrije zbirko + priljubljene — toast omenja vir (iskren povzetek)", () => {
    expect(STRIP_SRC).toContain("if (wishlistDestinationCount > 0) parts.push(s.appliedWishlist);");
    expect(STRIP_SRC).toContain('appliedWishlist: "vključno z destinacijami iz priljubljenih"');
    expect(STRIP_SRC).toContain('appliedWishlist: "including destinations from your favourites"');
  });

  test("ZERO-LOSS: prefill dogodek + izbira ponudbe handoff ostajajo", () => {
    expect(STRIP_SRC).toContain('export const MY_TRIP_PREFILL_EVENT = "dai:my-trip-prefill";');
    expect(STRIP_SRC).toContain(
      "new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT,"
    );
    expect(STRIP_SRC).toContain("useAppStore.getState().setSelectedProducts(next)");
    expect(STRIP_SRC).toContain("persistSelection(next)");
    // NO silent AI meja iz dokumentacije traku ostaja (vrstica 47-48 vzorec:
    // "no silent actions" / "brez tihe AI regeneracije")
    expect(STRIP_SRC).toContain("no silent");
  });
});

// ---------------------------------------------------------------------------
// 8. ZERO-LOSS markerji: noga/Sheet/planner (nič ni umaknjeno)
// ---------------------------------------------------------------------------
describe("F3-C/D ZERO-LOSS markerji", () => {
  test("noga: planQuiz/planJourney/planGoMode vrstice ostajajo", () => {
    expect(FOOTER_SRC).toContain('key: "planQuiz"');
    expect(FOOTER_SRC).toContain('key: "planJourney"');
    expect(FOOTER_SRC).toContain('key: "planGoMode"');
    expect(FOOTER_SRC).toContain('key: "planPlanner"');
  });

  test("navigacija: /na-poti + /potovanje sekundarni povezavi ostajata", () => {
    expect(NAV_SRC).toContain('{ href: "/na-poti", label: t("goMode") }');
    expect(NAV_SRC).toContain('{ href: "/potovanje", label: t("journey") }');
  });

  test("planner: NL-first vhod + start-kjerkoli blok 4 zavihkov ostajajo", () => {
    expect(PLANNER_SRC).toContain('id="start-kjerkoli"');
    expect(PLANNER_SRC).toContain('id: "link"');
    expect(PLANNER_SRC).toContain('id: "image"');
    expect(PLANNER_SRC).toContain('id: "pdf"');
    expect(PLANNER_SRC).toContain('id: "pins"');
    expect(PLANNER_SRC).toContain("fireStartedOnce()");
    // hero import NI postal glavna akcija (homepage se ni dotaknil)
    expect(readFileSync(
      new URL("../../components/hero-quick-input.tsx", import.meta.url),
      "utf8"
    )).toContain('t("startAnywhere")');
  });
});
