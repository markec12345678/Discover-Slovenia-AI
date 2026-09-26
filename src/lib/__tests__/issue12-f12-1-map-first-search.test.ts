// ============================================================================
// ISSUE #12 (F12-1 + F12-2 + F12-3, 1.118.0 → 1.119.0) — MAP-FIRST DISCOVERY
// ----------------------------------------------------------------------------
// F12-1 (issue §2 + §12 + guardrail matrika):
//  1. SOURCE-CONTRACT — Pokaži/Skrij POI gumb ODSTRANJEN (showPois/togglePois/
//     EyeOff izginili iz map-view); supply poizvedba IZVEDENA iz konteksta
//     (enabled: supplyActive = searchResults ‖ catsTouched); glavno iskanje
//     („Kaj iščeš?") živi NAD zemljevidom; fly-to + zlati poudarni marker;
//     loading/zoom/error badgeji le ob kontekstu; loadingPois literal ostaja
//     (kompatibilen s task8-f3b pinom).
//  2. SOURCE-CONTRACT (ruta) — /api/smart-search selekta lat/lng/slug
//     (Listing/Experience) in dopolni zadetke (additive, nazaj kompatibilno).
//  3. SOURCE-CONTRACT (analytics) — map_search_submitted +
//     map_search_result_selected na OBEH whitelistah.
//  4. FUNKCIONALNO — POST /api/smart-search (dbReachable varovalka, vzorec
//     task31/33): geo zadetki nosijo lat/lng/slug iz DB; destinacije VEDNO
//     nosijo koordinate (statični dataset); izdelki ostanejo brez geo
//     (iskreno — Product nima geo stolpcev).
// F12-2 (issue §4 + §6 + guardrail):
//  5. SOURCE-CONTRACT — PRIMARNE kategorije (5 skupin + „+ Več" expander,
//     vseh 12 čipov dosegljivih — 0 izgub); toggleGroup multi-select.
//  6. SOURCE-CONTRACT — marker RESULT CARD: ★ ocena POGOJNA, PRIMARNA
//     akcija „+ Dodaj v mojo pot" (isti selection.ts tok), sekundarni
//     Podrobnosti + Navigiraj (Google Maps, noopener).
// F12-3 (issue §7 + §13):
//  7. SOURCE-CONTRACT — POI terminologija IZGLAVLJENA iz glavnega
//     uporabniškega jezika (chipsAria/loading/badge; interni identifikatorji
//     POI_CATEGORIES/data-poi-id ostanejo — niso uporabniški tekst).
//  8. SOURCE-CONTRACT — stanja v uporabniškem jeziku (issue §13 primer:
//     degradedHint; zoomHint brez tehnične ravni; errorPois mrtva koda
//     ODSTRANJENA).
//  9. SOURCE-CONTRACT — ProviderPanel DEMOTION (§7/§16-7): ikonski
//     sprožilec z aria-label + title (dostopnost celovita), panel OSTANE
//     (Sheet z viri/statusi/atribucijo — napredna površina).
// 10. SOURCE-CONTRACT — i18n glavni jezik (exploreHub.mapDesc +
//     about.offerCards.destinationsDesc) brez POI; transparentnostne
//     površine (dataSources/about.howP2) POI ZADRŽEJO (dovoljeno §13).
// ============================================================================
import { beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { db } from "@/lib/db";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { deterministicSearch } from "@/lib/deterministic-search";
// TASK 76 higiena: funkcionalni blok dinamično uvaža route handler prek
// @/app/api (žetoni deljenega omejevalnika runnerja) → okno OBVEZNO
// počistimo (konvencija suite-a, glej task76-suite-hygiene.test.ts).
import { clearProviderRateLimits } from "@/lib/supply/search";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const mapViewSrc = read("src/components/sections/map-view.tsx");
const smartSearchRouteSrc = read("src/app/api/smart-search/route.ts");
const plannerAnalyticsSrc = read("src/lib/planner-analytics.ts");
const analyticsRouteSrc = read("src/app/api/analytics/event/route.ts");
const useSupplyQuerySrc = read("src/lib/supply/use-supply-query.ts");
const providerPanelSrc = read("src/components/supply/provider-panel.tsx");
const i18nSl = read("src/i18n/messages/sl.json");
const i18nEn = read("src/i18n/messages/en.json");

// ─────────────────────────────────────────────────────────────────────────
// 1. SOURCE-CONTRACT — map-view (gumb odstranjen, kontekst izveden)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: Pokaži/Skrij POI gumb ODSTRANJEN (mentalni model)", () => {
  test("showPois state + togglePois + EyeOff ikona so IZGINILI iz map-view", () => {
    // Nobena od teh konstrukcij ne sme več obstajati (ne samo skriti gumb):
    expect(mapViewSrc).not.toContain("const [showPois, setShowPois]");
    expect(mapViewSrc).not.toContain("togglePois");
    expect(mapViewSrc).not.toContain("aria-pressed={showPois}");
    expect(mapViewSrc).not.toContain("EyeOff");
    // T niza sta odstranjena (ne samo neuporabljena — izbrisana):
    expect(mapViewSrc).not.toContain('showPois: { sl: "Pokaži POI"');
    expect(mapViewSrc).not.toContain('hidePois: { sl: "Skrij POI"');
  });

  test("supply poizvedba je IZVEDENA iz konteksta: enabled: supplyActive", () => {
    expect(mapViewSrc).toContain("enabled: supplyActive");
    expect(mapViewSrc).toContain(
      "const supplyActive = searchResults !== null || catsTouched;"
    );
    // Kontekst se postavi ob kliku čipa (filter) in ob uspehu iskanja:
    expect(mapViewSrc).toContain("setCatsTouched(true);");
  });

  test("glavno iskanje živi NAD zemljevidom (placeholder + debounce + fly-to)", () => {
    expect(mapViewSrc).toContain("searchPlaceholder");
    expect(mapViewSrc).toContain('"/api/smart-search"');
    expect(mapViewSrc).toContain("}, 600);"); // debounce (isti ritem kot SmartSearch)
    expect(mapViewSrc).toContain("map.flyTo([lat, lng], zoom ?? 13");
    // Zlati poudarni marker — ISTI kanon kot deep-link highlight:
    expect(mapViewSrc).toContain("zIndexOffset: 1000");
    expect(mapViewSrc).toContain('className: "map-search-highlight"');
  });

  test("kategorije iskanja → kanonski čipi (ISKRENA preslikava, samo enakovredne)", () => {
    expect(mapViewSrc).toContain("SEARCH_CATEGORY_TO_TYPE");
    // Semantično enakovredne preslikave:
    expect(mapViewSrc).toContain('hotel: "accommodation"');
    expect(mapViewSrc).toContain('restaurant: "restaurant"');
    expect(mapViewSrc).toContain('tour: "tour"');
    // NEENAKOVREDNE kategorije se NE preslikajo (wellness/workshop/tasting
    // nimajo čipa — iskanje NE aktivira izmišljenih kategorij):
    expect(mapViewSrc).not.toContain("wellness:");
    expect(mapViewSrc).not.toContain("workshop:");
    expect(mapViewSrc).not.toContain("tasting:");
  });

  test("badgeji so vezani na kontekst (loading/zoom/error) — ne na gumb", () => {
    expect(mapViewSrc).toContain("supply.loading && supplyActive");
    expect(mapViewSrc).toContain(
      "const zoomTooLow = supplyActive && Math.floor(viewport.zoom) < SUPPLY_MIN_ZOOM;"
    );
    expect(mapViewSrc).toContain("supply.error && supplyActive");
  });

  test("loadingPois literal OSTAJA v dvojezičnem slovarju (pin task8-f3b)", () => {
    // F12-3: besedilo je zdaj UPORABNIŠKI jezik („POI“ umaknjen iz §7);
    // pin ščiti dvojezičnost slovarja (task8-f3b namensko posodobljen).
    expect(mapViewSrc).toContain('loadingPois: { sl: "Nalagam lokalna mesta…"');
  });

  test("zoom-gating ostaja NEDOTAKNJEN (samozaščita gostote — z ≥ 10)", () => {
    // Hook pogodba nespremenjena: enabled je nadzorovalna vrata, z≥10 + cats
    // zahteve ostajajo (pan-storm varnost issue #12 §11):
    expect(useSupplyQuerySrc).toContain("enabled &&");
    expect(useSupplyQuerySrc).toContain("SUPPLY_MIN_ZOOM");
  });

  test("reset → IZHOD iz konteksta (svež obisk brez supply poizvedb)", () => {
    expect(mapViewSrc).toContain("setCatsTouched(false);");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. SOURCE-CONTRACT — /api/smart-search geo razširitev
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: smart-search geo razširitev (additive)", () => {
  test("select vključuje lat/lng (Listing + Experience) in slug (vsi trije)", () => {
    expect(smartSearchRouteSrc).toContain("slug: true, lat: true, lng: true,");
    // Dve poizvedbi z geo (listing + experience), product samo slug:
    const geoSelects = smartSearchRouteSrc.match(/slug: true, lat: true, lng: true,/g);
    expect(geoSelects?.length).toBe(2);
  });

  test("dopolnitev zadetkov: id → geo/slug mape + izpeljava na ruti (ne v iskalniku)", () => {
    expect(smartSearchRouteSrc).toContain("destGeoById");
    expect(smartSearchRouteSrc).toContain("listingById");
    expect(smartSearchRouteSrc).toContain("experienceById");
    // Iskalni moduli ostanejo čisti (dopolnitev je odgovornost rute):
    expect(smartSearchRouteSrc).toContain(
      "Iskalni moduli ostanejo ČISTI"
    );
  });

  test("destinacije VEDNO nosijo koordinate (statični dataset — fly-to)", () => {
    expect(smartSearchRouteSrc).toContain("lat: geo?.lat ?? 0");
    expect(smartSearchRouteSrc).toContain("lng: geo?.lng ?? 0");
  });

  test("izdelki ostanejo BREZ geo (iskreno — Product nima geo stolpcev)", () => {
    const productsMap = smartSearchRouteSrc.match(
      /products: results\.products\.map\(\(item\) => \(\{[^}]*\}\)\)/
    );
    expect(productsMap).toBeTruthy();
    expect(productsMap![0]).not.toContain("lat:");
    expect(productsMap![0]).toContain("slug: productById.get(item.id)?.slug ?? null");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. SOURCE-CONTRACT — analytics whitelist (klient + strežnik)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-1: analytics dogodki na OBEH whitelistah", () => {
  test("map_search_submitted + map_search_result_selected (klient)", () => {
    expect(plannerAnalyticsSrc).toContain('"map_search_submitted"');
    expect(plannerAnalyticsSrc).toContain('"map_search_result_selected"');
  });

  test("map_search_submitted + map_search_result_selected (strežnik)", () => {
    expect(analyticsRouteSrc).toContain('"map_search_submitted"');
    expect(analyticsRouteSrc).toContain('"map_search_result_selected"');
  });

  test("map-view dejansko izstreli oba dogodka", () => {
    expect(mapViewSrc).toContain('trackPlannerEvent("map_search_submitted"');
    expect(mapViewSrc).toContain('trackPlannerEvent("map_search_result_selected"');
  });

  test("PII disciplina: telemetrija NE nosi besedila poizvedbe (samo query_len)", () => {
    const submittedCall = mapViewSrc.match(
      /trackPlannerEvent\("map_search_submitted", \{[^}]*\}/
    );
    expect(submittedCall).toBeTruthy();
    expect(submittedCall![0]).toContain("query_len");
    expect(submittedCall![0]).not.toContain("query:");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. FUNKCIONALNO — geo zadetki iz PRAVE baze (dbReachable varovalka)
// ─────────────────────────────────────────────────────────────────────────

let dbReachable = false;

beforeAll(async () => {
  try {
    await db.savedItinerary.count();
    dbReachable = true;
  } catch {
    dbReachable = false;
  }
});

// TASK 76: počisti okno deljenega omejevalnika pred vsakim testom
beforeEach(() => {
  clearProviderRateLimits();
});

describe("ISSUE #12 F12-1: funkcionalno — POST /api/smart-search z geo", () => {
  test("destinacijski zadetki nosijo lat/lng ≡ slovenia-data (fly-to vir)", async () => {
    if (!dbReachable) {
      console.log("[issue12-f12-1] DB ni dosegljiva — preskakujem (vzorec task33)");
      return;
    }
    clearProviderRateLimits();
    const { POST } = await import("@/app/api/smart-search/route");
    // Iskanje po znani kanonski destinaciji (Bled) — unikatna beseda,
    // ki ne kolidira z drugimi vrsticami:
    const req = new Request("http://localhost/api/smart-search", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-real-ip": "10.12.20.1",
      },
      body: JSON.stringify({ query: "Bled", limit: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      destinations: Array<{ id: string; lat: number; lng: number; slug: string }>;
      listings: Array<{ id: string; lat?: number | null; slug?: string | null }>;
      experiences: Array<{ id: string; lat?: number | null; slug?: string | null }>;
      products: Array<{ id: string; slug?: string | null; lat?: unknown }>;
      source: string;
    };
    expect(data.source).toBe("deterministic");
    expect(data.destinations.length).toBeGreaterThan(0);

    // Destinacijski zadetki: koordinate ≡ kanonski dataset (NEODVISNO).
    const bled = data.destinations.find((d) => d.id === "bled");
    expect(bled).toBeDefined();
    const canonical = DESTINATIONS.find((d) => d.id === "bled");
    expect(bled!.lat).toBe(canonical!.coords.lat);
    expect(bled!.lng).toBe(canonical!.coords.lng);
    expect(bled!.slug).toBe(canonical!.slug);

    // Nazaj kompatibilna oblika: vrstični zadetki imajo OPCIJSKA polja
    // (izdelki brez geo — Product nima stolpcev; iskreno null/undefined):
    for (const p of data.products) {
      expect(p.lat === undefined || p.lat === null).toBe(true);
    }
    // Listing/Experience: polje je število ali null (nikoli niz):
    for (const l of [...data.listings, ...data.experiences]) {
      expect(
        l.lat === null || l.lat === undefined || typeof l.lat === "number"
      ).toBe(true);
    }
  });
});

describe("ISSUE #12 F12-3: EN razlogi zadetkov (uporabniški jezik na /en)", () => {
  const deterministicSearchSrc = read("src/lib/deterministic-search.ts");

  test("SOURCE-CONTRACT: iskalnik sprejema locale (4. arg, privzeto SL)", () => {
    expect(deterministicSearchSrc).toContain(
      'locale: "sl" | "en" = "sl"'
    );
    // Dvojezična razlaga zadetka (prej SL-only tudi na /en):
    expect(deterministicSearchSrc).toContain('"Matches your search"');
    expect(deterministicSearchSrc).toContain('"Ujema se z iskalnim nizom"');
    // Vsa štiri mesta klica buildReason nosijo locale:
    expect(deterministicSearchSrc.match(/buildReason\([^)]*locale\)/g)?.length).toBe(4);
  });

  test("SOURCE-CONTRACT: ruta sprejema locale + map-view ga pošilja v telesu", () => {
    expect(smartSearchRouteSrc).toContain('locale?: "sl" | "en"');
    expect(smartSearchRouteSrc).toContain('const reasonLocale = body.locale === "en" ? "en" : "sl"');
    expect(smartSearchRouteSrc).toContain("reasonLocale");
    expect(mapViewSrc).toContain("{ query: q, limit: 3, locale: lang }");
  });

  test("FUNKCIONALNO: locale=en → EN razlogi; privzeto (3 args) → SL nazaj kompatibilno", () => {
    const DS = {
      listings: [] as Array<{ id: string; name: string; category: string; destinationName: string | null; description: string | null; rating: number | null; priceRange: string | null }>,
      products: [] as Array<{ id: string; name: string; category: string; destinationName: string | null; description: string | null; price: number | null; rating: number | null }>,
      experiences: [] as Array<{ id: string; name: string; category: string; destinationName: string | null; description: string | null; pricePerPerson: number | null; rating: number | null; familyFriendly: boolean; durationHours: number | null }>,
    };
    const en = deterministicSearch("bled", DS, 3, "en");
    const sl = deterministicSearch("bled", DS, 3);
    expect(en.destinations.length).toBeGreaterThan(0);
    // EN razlog:
    expect(en.destinations[0]!.reason).toContain("Matches your search");
    // Privzeti (brez 4. arg) — SL razlog (nazaj kompatibilno):
    expect(sl.destinations[0]!.reason).toContain("Ujema se z iskalnim nizom");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 11. SOURCE-CONTRACT — F12-4: §9/§10 layout (stack nad zemljevidom,
//     mobilni horizontalni scroll, izmenjava dropdown↔čipi, bottom sheet)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-4 (§16): HITRE NAMERE nad zemljevidom (stack layout)", () => {
  test("kategorije NISO več na dnu — vertikalni stack pod iskalno vrstico", () => {
    // PREJ: absolute bottom-12 left-3 (lebdene na dnu, pod zemljevidom).
    expect(mapViewSrc).not.toContain("absolute bottom-12 left-3");
    // ZDAJ: stack na vrhu (top-[3.75rem] = tik pod iskalno vrstico).
    expect(mapViewSrc).toContain("top-[3.75rem]");
    // Hierarhija §16 v vertikalnem redu: iskanje (top-3) → namere (3.75rem).
    expect(mapViewSrc).toContain("absolute left-3 top-3 z-[1001]");
  });

  test("mobile: HORIZONTALNI scroll primarnih kategorij (§10 — ena vrstica)", () => {
    // Primarna vrstica: nowrap + overflow-x-auto na mobilnem, wrap na sm+:
    expect(mapViewSrc).toContain(
      "flex gap-1 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
    );
    // Natančni čipi (Več) — isti mobilni vzorec:
    expect(mapViewSrc).toContain(
      "mt-1 flex gap-1 overflow-x-auto border-t border-border/60 pb-0.5 pt-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0 [&::-webkit-scrollbar]:hidden"
    );
  });

  test("wrapper pointer-events-none — zemljevid vlečljiv med paneli stacka", () => {
    expect(mapViewSrc).toContain("pointer-events-none absolute left-3 top-[3.75rem]");
    expect(mapViewSrc).toContain('className="pointer-events-auto max-w-full rounded-md');
  });

  test("stanja (loading/zoom/error) v toku stacka — ne fiksni top-16/top-24", () => {
    // Prej: absolute left-3 top-16 / top-24 (trčila bi s stackom):
    expect(mapViewSrc).not.toContain("absolute left-3 top-16 z-[1000]");
    expect(mapViewSrc).not.toContain("absolute left-3 top-24 z-[1000]");
    // Pogoji stanj ostanejo vezani na kontekst (F12-1 invarianta):
    expect(mapViewSrc).toContain("supply.loading && supplyActive");
    expect(mapViewSrc).toContain("zoomTooLow && !supply.loading");
    expect(mapViewSrc).toContain("supply.error && supplyActive");
  });
});

describe("ISSUE #12 F12-4 (§9/§10): izmenjava dropdown ↔ čipi (resultsOpen)", () => {
  test("dropdown viden LE ob resultsOpen (prostor si deli s kategorijami)", () => {
    expect(mapViewSrc).toContain("const [resultsOpen, setResultsOpen] = useState(false);");
    expect(mapViewSrc).toContain("(searchResults || searchError) && resultsOpen ?");
    // Čipi skriti med odprtim dropdownom:
    expect(mapViewSrc).toContain("!((searchResults || searchError) && resultsOpen) ?");
  });

  test("izbira zadetka ZAPRE dropdown — kontekst OSTA (supplyActive živi)", () => {
    // handleResultDestination/handleResultGeoItem: setResultsOpen(false),
    // searchResults NE čistimo (supply sloj + izpeljane kategorije žive):
    expect(mapViewSrc).toMatch(
      /const handleResultDestination[\s\S]{0,400}setResultsOpen\(false\);/
    );
    expect(mapViewSrc).toMatch(
      /const handleResultGeoItem[\s\S]{0,400}setResultsOpen\(false\);/
    );
    // Nov vnos ponovno odpre dropdown:
    expect(mapViewSrc).toMatch(/setTimeout\(async \(\) => \{[\s\S]{0,300}setResultsOpen\(true\);/);
    // Clear = popoln reset:
    expect(mapViewSrc).toMatch(/const handleClearSearch[\s\S]{0,400}setResultsOpen\(false\);/);
  });
});

describe("ISSUE #12 F12-4: zoom kontrola bottomright + mobilni sheet CSS", () => {
  test("zoom kontrola PREMAKNJENA na bottomright (prej mrtva pod iskanjem)", () => {
    // F12-1 je iskanje postavil na top-levi — privzeta Leaflet zoom kontrola
    // (top-left) je bila prekrita. Google Maps vzorec = bottomright.
    expect(mapViewSrc).toContain("zoomControl: false");
    expect(mapViewSrc).toContain('L.control.zoom({ position: "bottomright" })');
  });

  test("globals.css: mobilni REZULTATNI SHEET (§10) + safe area + :has() badge", () => {
    const globalsCss = read("src/app/globals.css");
    // Media query za mobile sheet:
    expect(globalsCss).toContain("@media (max-width: 639px)");
    expect(globalsCss).toContain(".leaflet-popup {");
    expect(globalsCss).toContain("position: fixed !important;");
    expect(globalsCss).toContain("bottom: 0 !important;");
    expect(globalsCss).toContain("transform: none !important;");
    // Safe area (iOS home bar) — obvezno pravilo baze:
    expect(globalsCss).toContain("env(safe-area-inset-bottom, 0px)");
    // Sheet look: zaobljeni zgornji vogali + skrit tip (puščica):
    expect(globalsCss).toContain("border-radius: 1rem 1rem 0 0 !important;");
    expect(globalsCss).toContain(".leaflet-popup-tip {");
    // Info badge se umakne, ko je sheet odprt (:has()):
    expect(globalsCss).toContain(".map-shell:has(.leaflet-popup) .map-info-badge");
    // map-shell/map-info-badge razreda dejansko dodana v map-view:
    expect(mapViewSrc).toContain('className="map-shell relative h-full w-full"');
    expect(mapViewSrc).toContain("map-info-badge absolute bottom-3 left-3");
  });

  test("popup-pane REPARENT na mobilnem (transform prednik = containing block)", () => {
    // .leaflet-popup-pane privzeto živi v .leaflet-map-pane, ki ga Leaflet
    // premika s transform → fixed potomec bi se strnil na 0×0 (listič
    // dokazan v E2E). Na mobilnem prestavimo pane k containerju:
    expect(mapViewSrc).toContain('window.matchMedia("(max-width: 639px)")');
    expect(mapViewSrc).toContain("map.getPanes().popupPane");
    expect(mapViewSrc).toContain("containerRef.current?.appendChild(popupPane)");
    // Desktop: pane se VRNE v map-pane (Leafletova pozicioniranja) +
    // odprt popup se ob preklopu pošteno zapre:
    expect(mapViewSrc).toContain("mapPane.appendChild(popupPane)");
    expect(mapViewSrc).toContain("map.closePopup()");
    // Poslušalec se počisti (higiena efekta):
    expect(mapViewSrc).toContain(
      'mobileMq.removeEventListener("change", syncPopupPane)'
    );
  });
});



describe("ISSUE #12 F12-2: primarne kategorije (5 skupin + expander Več)", () => {
  test("PRIMARY_CATEGORIES: 5 skupin + expander Več (vseh 12 dosegljivih)", () => {
    expect(mapViewSrc).toContain("const PRIMARY_CATEGORIES");
    for (const key of ["food", "stay", "sights", "nature", "activities"]) {
      expect(mapViewSrc).toContain(`key: "${key}"`);
    }
    // „+ Več" expander razkrije vseh 12 originalnih čipov (0 izgub —
    // petrol/shop/transfer so dosegljivi SAMO prek sekundarne ravni):
    expect(mapViewSrc).toContain("moreCatsOpen");
    expect(mapViewSrc).toContain("setMoreCatsOpen");
    expect(mapViewSrc).toContain("POI_CATEGORIES.map");
    expect(mapViewSrc).toContain('moreCats: { sl: "Več", en: "More" }');
    expect(mapViewSrc).toContain('fewerCats: { sl: "Manj", en: "Less" }');
  });

  test("toggleGroup: multi-select nad skupino (vklop VSEH tipov + kontekst)", () => {
    expect(mapViewSrc).toContain("const toggleGroup");
    expect(mapViewSrc).toContain("group.types.every((t) => activeCats.has(t))");
    // Klik skupine prav tako postavi kontekst (F12-1 invarianta):
    expect(mapViewSrc).toMatch(/const toggleGroup[\s\S]{0,600}setCatsTouched\(true\);/);
  });

  test("primarni skupinski čip ima števec SKUPNO prek tipov skupine", () => {
    expect(mapViewSrc).toContain(
      "supply.products.filter((p) => types.includes(p.type)).length"
    );
  });
});

describe("ISSUE #12 F12-2: marker result card (issue §6 struktura)", () => {
  test("primarna akcija: Dodaj v mojo pot gumb v popupu (data-poi-add)", () => {
    expect(mapViewSrc).toContain('class="map-poi-cta map-poi-add"');
    expect(mapViewSrc).toContain("data-poi-add=");
    expect(mapViewSrc).toContain("+ ${T.addToTrip[lang]}");
    expect(mapViewSrc).toContain('addToTrip: { sl: "Dodaj v mojo pot"');
  });

  test("delegacija: map-poi-add → addProductToSelection z iskrenim odzivom", () => {
    expect(mapViewSrc).toContain(
      'target.classList.contains("map-poi-add")'
    );
    expect(mapViewSrc).toMatch(
      /map-poi-add[\s\S]{0,400}addProductToSelection\(product, \{ locale: lang \}\)/
    );
    // Iskreni odzivi: dodano/duplikat → ✓; limit → besedilo (popup NE zapre):
    expect(mapViewSrc).toContain('addedToTrip: { sl: "✓ Dodano"');
    expect(mapViewSrc).toContain('addLimitReached: { sl: "Doseženih največ izbir"');
    // Podrobnosti ostane (sekundarna) — modal pot:
    expect(mapViewSrc).toContain("setSelectedProduct(product)");
  });

  test("★ ocena POGOJNA (brez ocene → vrstice NI — ne izmišljujemo)", () => {
    expect(mapViewSrc).toContain("product.rating != null");
    expect(mapViewSrc).toContain('reviewsUnit: { sl: "mnenj"');
  });

  test("Navigiraj: Google Maps iz koordinat (target _blank + noopener)", () => {
    expect(mapViewSrc).toContain(
      "https://www.google.com/maps/dir/?api=1&destination="
    );
    expect(mapViewSrc).toContain('rel="noopener noreferrer"');
    expect(mapViewSrc).toContain('navigate: { sl: "Navigiraj"');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7.–10. SOURCE-CONTRACT — F12-3: §7 (POI umik + ProviderPanel demotion)
//                                    §13 (stanja v uporabniškem jeziku)
// ─────────────────────────────────────────────────────────────────────────

describe("ISSUE #12 F12-3 (§7): POI terminologija IZGLAVLJENA iz glavnega jezika", () => {
  test("uporabniški nizi brez „POI“ (loading/aria/badge) — interni ID-ji ostanejo", () => {
    // Uporabniški tekst (T slovar + badge) — POI izglavljen:
    expect(mapViewSrc).not.toContain('Nalagam POI');
    expect(mapViewSrc).not.toContain('POI-jev ni mogoče');
    expect(mapViewSrc).not.toContain('Filtriranje POI');
    expect(mapViewSrc).not.toContain('} POI · {');
    // INTERNI identifikatorji (niso uporabniški tekst) ostanejo namerno:
    expect(mapViewSrc).toContain("POI_CATEGORIES");
    expect(mapViewSrc).toContain('class="map-poi-cta map-poi-add"');
  });

  test("badge supply sloja: rezultati v uporabniškem jeziku + atribucija OSTANE", () => {
    expect(mapViewSrc).toContain('supplyUnit: { sl: "rezultatov", en: "results" }');
    expect(mapViewSrc).toContain("{supply.products.length} {T.supplyUnit[lang]} · {sourcesLabel}");
    // Transparentnost virov (issue §7: atribucija mora ostati dostopna):
    expect(mapViewSrc).toContain("sourcesLabel");
  });

  test("mrtvi errorPois ODSTRANJEN (stanja streže networkHint/degradedHint)", () => {
    expect(mapViewSrc).not.toContain("errorPois");
    // Dejanski error tokovi ostanejo (TASK 99-a iskrenost):
    expect(mapViewSrc).toContain("T.networkHint[lang]");
    expect(mapViewSrc).toContain("T.degradedHint[lang]");
  });
});

describe("ISSUE #12 F12-3 (§13): stanja v uporabniškem jeziku", () => {
  test("degradedHint = PRIMER IZ ISSUEJA („Nekaterih lokalnih mest … prikazati“)", () => {
    expect(mapViewSrc).toContain(
      'sl: "Nekaterih lokalnih mest trenutno ni mogoče prikazati — destinacije ostajajo."'
    );
    expect(mapViewSrc).toContain(
      'en: "Some local places can\'t be shown right now — destinations remain."'
    );
  });

  test("zoomHint BREZ tehnične ravni „z ≥ 10“ (razlog ostane v hooku/kodu)", () => {
    expect(mapViewSrc).not.toContain('lokalne točke (z ≥ 10)');
    expect(mapViewSrc).toContain('sl: "Približajte zemljevid za lokalne točke."');
    // Zoom-gating tehnično OSTAJA (samozaščita gostote — F12-1 test zgoraj):
    expect(useSupplyQuerySrc).toContain("SUPPLY_MIN_ZOOM");
  });

  test("loading v uporabniškem jeziku (mesta, ne POI) + offline ostaja iskren", () => {
    expect(mapViewSrc).toContain('loadingPois: { sl: "Nalagam lokalna mesta…", en: "Loading local places…" }');
    expect(mapViewSrc).toContain('sl: "Ni internetne povezave — destinacije ostajajo na voljo."');
  });

  test("zastareli komentar „gumb Pokaži POI“ odstranjen iz hook pogodbe", () => {
    expect(useSupplyQuerySrc).not.toContain("gumb Pokaži POI");
    expect(useSupplyQuerySrc).toContain("NE iz gumba");
  });
});

describe("ISSUE #12 F12-3 (§7/§16-7): ProviderPanel DEMOTION, dostopnost OSTANE", () => {
  test("sprožilec je SAMO IKONA (vzorec Google Maps Layers) z aria-label + title", () => {
    expect(providerPanelSrc).toContain('size="icon"');
    expect(providerPanelSrc).toContain("aria-label={L.triggerAria[lang]}");
    expect(providerPanelSrc).toContain("title={L.triggerAria[lang]}");
    expect(providerPanelSrc).not.toContain("{L.trigger[lang]}");
  });

  test("panel OSTAJA dostopen (Sheet + viri + statusi + atribucija — §14 F)", () => {
    expect(providerPanelSrc).toContain("SheetContent");
    expect(providerPanelSrc).toContain("localProviders()");
    expect(providerPanelSrc).toContain("PROVIDER_REGISTRY");
    expect(providerPanelSrc).toContain("statusLegend");
    // Iskrenost napake ostaja (degraded obvestilo v panelu):
    expect(providerPanelSrc).toContain("productsDegraded");
  });
});

describe("ISSUE #12 F12-3: i18n glavni jezik brez POI (transparentnost zadrži)", () => {
  test("exploreHub.mapDesc + about.offerCards.destinationsDesc brez „POI“", () => {
    for (const src of [i18nSl, i18nEn]) {
      const mapDesc = src.match(/"mapDesc": "([^"]*)"/)?.[1] ?? "";
      expect(mapDesc).not.toContain("POI");
      const destDesc =
        src.match(/"destinationsDesc": "([^"]*)"/)?.[1] ?? "";
      expect(destDesc).not.toContain("POI");
      expect(destDesc.length).toBeGreaterThan(0);
    }
  });

  test("transparentnostne površine POI ZADRŽEJO (§13: tehnični razlog dostopen v podrobnostih)", () => {
    // dataSources (stran vir-podatkov) + about.howP2 (razlaga motorja) —
    // POI je tam URADEN tehnični izraz (POI baza / točke interesa) in
    // NAMERNO ostane (issue §13 dovoljuje tehnični jezik v podrobnostih).
    expect(i18nSl).toContain('"type": "POI baza"');
    expect(i18nEn).toContain('"type": "POI database"');
    expect(i18nSl).toContain("howP2");
  });
});
