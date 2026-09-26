// TASK 8 / F3-B (issue #8 §31–§34, D8-A P-STATE-2 „~58 površin, vsaka svoja
// slovnica stanj"): testi DRUŽINE stanj (loading / empty / error) + rollout
// dokazi na vrhnjih površinah + i18n varnost ("Nalagam …" uhodi).
//
// 1. DRUŽINA (src/components/states/): "use client", dostopnostne pogodbe
//    (role="status"/aria-live="polite" na nalaganju, role="alert" na napaki,
//    skeleti aria-hidden, CTA ≥44px), Skeleton iz obstoječe UI knjižnice,
//    EmptyState BREZ hardcodanega uporabniškega besedila (title/desc so
//    props), L-pattern privzete oznake v OBEH jezikih.
// 2. ROLLOUT (source-contract): journey-planner (skeleti kategorij +
//    ErrorState z retry), moja-potovanja (LoadingState/ErrorState/
//    EmptyState + iztrebljena hardcoded aria oznaka), marketplace +
//    listings (LoadingState + poenotena EmptyState/ErrorState, skeleton
//    mreži ostanejo), shared-trip (zemljevid prek LoadingState), wishlist
//    sheet (prazno stanje s CTA v tržnico), events-calendar / destinations /
//    owner dashboard (kloni poenoteni z istim besedilom/akcijami).
// 3. I18N: vsaka nova oznaka obstaja v SL in EN različici znotraj komponent
//    (trdi predpogoj za F3-E EN razširitev — D8-A §13).
// 4. ZERO-LOSS markerji za vsako dotaknjeno površino.

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const LOADING_SRC = read("components/states/loading-state.tsx");
const EMPTY_SRC = read("components/states/empty-state.tsx");
const ERROR_SRC = read("components/states/error-state.tsx");
const BARREL_SRC = read("components/states/index.ts");
const JOURNEY_SRC = read("components/sections/journey-planner.tsx");
const MOJA_SRC = read("app/moja-potovanja/moja-potovanja-view.tsx");
const MARKET_SRC = read("components/sections/marketplace.tsx");
const LISTINGS_SRC = read("components/sections/listings.tsx");
const SHARED_SRC = read("components/shared-trip.tsx");
const WISHLIST_SRC = read("components/wishlist-sheet.tsx");
const EVENTS_SRC = read("components/sections/events-calendar.tsx");
const DEST_SRC = read("components/sections/destinations.tsx");
const OWNER_SRC = read("app/owner/dashboard/page.tsx");
const ORDERS_SRC = read("components/my-orders-section.tsx");
const DIARY_SRC = read("components/trip-diary.tsx");
const POLLS_SRC = read("components/trip-polls.tsx");
const COLLAB_SRC = read("components/trip-collaboration.tsx");

// ---------------------------------------------------------------------------
// 1. DRUŽINA — src/components/states/
// ---------------------------------------------------------------------------
describe("F3-B družina: LoadingState (zlati standard TASK 77/80 slovnica)", () => {
  test('začne z "use client" (uporablja useLocale)', () => {
    expect(LOADING_SRC.startsWith('"use client"')).toBe(true);
    expect(LOADING_SRC).toContain("useLocale");
  });

  test("dostopnost: role=status + aria-live=polite + dekorativni skeleti", () => {
    expect(LOADING_SRC).toContain('role="status"');
    expect(LOADING_SRC).toContain('aria-live="polite"');
    expect(LOADING_SRC).toContain('aria-hidden="true"');
  });

  test("uporablja obstoječi Skeleton primitive (ne svojega pulse div-a)", () => {
    expect(LOADING_SRC).toContain(
      'import { Skeleton } from "@/components/ui/skeleton"'
    );
    expect(LOADING_SRC).toContain("Loader2");
  });

  test("L-pattern privzeta oznaka v SL in EN (i18n varna, F3-E predpogoj)", () => {
    expect(LOADING_SRC).toContain('loading: "Nalagam …"');
    expect(LOADING_SRC).toContain('loading: "Loading …"');
    expect(LOADING_SRC).toContain("sl:");
    expect(LOADING_SRC).toContain("en:");
  });

  test("SSR-varna pot: `lang` prop obide useLocale (strežniški klicatelji)", () => {
    expect(LOADING_SRC).toContain("lang?:");
    expect(LOADING_SRC).toContain("lang ??");
  });

  test("varianti inline + block + rows + label so deli API-ja", () => {
    expect(LOADING_SRC).toContain('"inline" | "block"');
    expect(LOADING_SRC).toContain("rows = 0");
    expect(LOADING_SRC).toContain("label?: string");
  });
});

describe("F3-B družina: EmptyState (ikona + naslov + opis + CTA ≥44px)", () => {
  test('začne z "use client"', () => {
    expect(EMPTY_SRC.startsWith('"use client"')).toBe(true);
  });

  test("BREZ hardcodanega uporabniškega besedila — naslov/opis/akcija so props", () => {
    // besedilo prinese Klicatelj — komponenta je tako sama po sebi i18n varna
    expect(EMPTY_SRC).toContain("title: string");
    expect(EMPTY_SRC).toContain("description?: string");
    expect(EMPTY_SRC).toContain("label: string");
    expect(EMPTY_SRC).toContain("href?: string");
    expect(EMPTY_SRC).toContain("onClick?: () => void");
    // NE sme vsebovati svojih "Ni …" stringov (samo struktura/ikone)
    expect(EMPTY_SRC).not.toMatch(/>\s*Ni [a-zčšž]/);
    expect(EMPTY_SRC).not.toMatch(/title\s*=\s*"Ni/);
  });

  test("CTA ≥44px dotik (Button + min-h)", () => {
    expect(EMPTY_SRC).toContain('from "@/components/ui/button"');
    expect(EMPTY_SRC).toContain("min-h-[44px]");
  });

  test("črtkasta slovnica (destinations / moja-potovanja vzorec) + ikona", () => {
    expect(EMPTY_SRC).toContain("border-dashed");
    expect(EMPTY_SRC).toContain("LucideIcon");
  });

  test("akcija podpira disabled (lastniški limit) in ikono (isti vizuali)", () => {
    expect(EMPTY_SRC).toContain("disabled?: boolean");
    expect(EMPTY_SRC).toContain("icon?: LucideIcon");
  });
});

describe("F3-B družina: ErrorState (iskren — nikoli ne laže o uspehu)", () => {
  test('začne z "use client"', () => {
    expect(ERROR_SRC.startsWith('"use client"')).toBe(true);
  });

  test("role=alert na OBEH slovnicah (destructive Alert + amber vrstica)", () => {
    expect(ERROR_SRC).toContain('role="alert"');
    expect(ERROR_SRC).toContain('variant="destructive"');
    expect(ERROR_SRC).toContain('"warning"');
  });

  test("L-pattern privzeti naslov + ponovitev v SL in EN", () => {
    expect(ERROR_SRC).toContain('title: "Nekaj ni uspelo"');
    expect(ERROR_SRC).toContain('title: "Something went wrong"');
    expect(ERROR_SRC).toContain('retry: "Poskusi znova"');
    expect(ERROR_SRC).toContain('retry: "Try again"');
  });

  test("ponovitev ≥44px + sporočilo/akcija sta resnični (props)", () => {
    expect(ERROR_SRC).toContain("message: string");
    expect(ERROR_SRC).toContain("onRetry?: () => void");
    expect(ERROR_SRC).toContain("min-h-[44px]");
  });

  test("uporablja obstoječi ui/alert primitive (ista slovnica kot planner)", () => {
    expect(ERROR_SRC).toContain(
      'import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"'
    );
  });
});

describe("F3-B družina: barrel izvoz", () => {
  test("index.ts izvozi vse tri komponente", () => {
    expect(BARREL_SRC).toContain("export { LoadingState }");
    expect(BARREL_SRC).toContain("export { EmptyState }");
    expect(BARREL_SRC).toContain("export { ErrorState }");
  });
});

// ---------------------------------------------------------------------------
// 2. ROLLOUT — /potovanje (največja vrzel: nenadna zamenjava stolpcev)
// ---------------------------------------------------------------------------
describe("F3-B rollout: journey-planner (/potovanje)", () => {
  test("uvozi družino ErrorState + LoadingState + Skeleton primitive", () => {
    expect(JOURNEY_SRC).toContain(
      'import { Skeleton } from "@/components/ui/skeleton"'
    );
    expect(JOURNEY_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(JOURNEY_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
  });

  test("golo rdeče <p role=alert> napaka je ZAMENJANA z ErrorState + retry", () => {
    expect(JOURNEY_SRC).not.toContain('<p role="alert"');
    expect(JOURNEY_SRC).toContain("<ErrorState");
    expect(JOURNEY_SRC).toContain('onRetry={() => void plan()}');
  });

  test("skeleti kategorij med PRVIM iskanjem (2 kartici na vido kategorijo)", () => {
    expect(JOURNEY_SRC).toContain("loading && !journey");
    expect(JOURNEY_SRC).toContain("ALL_CATS.filter((c) => cats.includes(c))");
    expect(JOURNEY_SRC).toContain("{ length: 2 }");
    // skeleti so dekorativni, obvestilo nosi statusna vrstica (TASK 77)
    expect(JOURNEY_SRC).toContain('aria-hidden="true"');
    expect(JOURNEY_SRC).toContain('aria-busy="true"');
    // oznaka = besedje površine ("Iskanje po virih …")
    expect(JOURNEY_SRC).toContain('label={t(L.form.planning)}');
  });

  test("ZERO-LOSS: write-through + handoff + Go Mode + print + totals", () => {
    expect(JOURNEY_SRC).toContain("AddToTripButton");
    expect(JOURNEY_SRC).toContain("addMyTripItem(");
    expect(JOURNEY_SRC).toContain("journeyProductsToSelection");
    expect(JOURNEY_SRC).toContain("persistSelection(items)");
    expect(JOURNEY_SRC).toContain("saveGoTrip(journey, [...selected])");
    expect(JOURNEY_SRC).toContain("printConfirmation");
    expect(JOURNEY_SRC).toContain("describeTotals(journey.totals, lang)");
    expect(JOURNEY_SRC).toContain("recordExternalHandoff");
    expect(JOURNEY_SRC).toContain("OpeningHoursStatus");
  });
});

// ---------------------------------------------------------------------------
// 3. ROLLOUT — /moja-potovanja
// ---------------------------------------------------------------------------
describe("F3-B rollout: moja-potovanja-view", () => {
  test("družina na vseh treh stanjih (LoadingState ×3, ErrorState, EmptyState)", () => {
    expect(MOJA_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(MOJA_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(MOJA_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(MOJA_SRC.match(/<LoadingState/g)?.length).toBeGreaterThanOrEqual(3);
    expect(MOJA_SRC).toContain("<ErrorState");
    expect(MOJA_SRC.match(/<EmptyState/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('hardcoded "Nalagam potovanja" aria (in vsak "Nalagam" niz) je IZTREBLJEN', () => {
    expect(MOJA_SRC).not.toContain("Nalagam potovanja");
    expect(MOJA_SRC).not.toContain("Nalagam");
  });

  test("lokalni EmptyState klon je odstranjen (družina na 3 mestih, isto besedilo)", () => {
    expect(MOJA_SRC).not.toContain("function EmptyState");
    // F4-C (EN razširitev): oznaki akcij sta zdaj L-pattern SL/EN — ISTI
    // semantični pogodbi (prazno stanje + CTA /nacrtuj in /#vprasi-lokalca),
    // posodobljeno po vzorcu task99-marketplace posodobitve iz F3-B.
    expect(MOJA_SRC).toContain(
      'action={{ label: L.trips.emptyAction[lang], href: "/nacrtuj" }'
    );
    expect(MOJA_SRC).toContain('emptyAction: { sl: "Načrtuj potovanje", en: "Plan a trip" }');
    expect(MOJA_SRC).toContain(
      'action={{ label: L.consult.emptyAction[lang], href: "/#vprasi-lokalca" }}'
    );
    expect(MOJA_SRC).toContain(
      'emptyAction: { sl: "Brezplačna konzultacija", en: "Free consultation" }'
    );
  });

  test("ZERO-LOSS: MyTripView + MyOrdersSection + sekcije ostanejo", () => {
    expect(MOJA_SRC).toContain("<MyTripView");
    expect(MOJA_SRC).toContain("<MyOrdersSection");
    expect(MOJA_SRC).toContain('signOut({ callbackUrl: "/" })');
    expect(MOJA_SRC).toContain("Shranjena potovanja");
    expect(MOJA_SRC).toContain("Moje AI konzultacije");
    expect(MOJA_SRC).toContain("syncMyTripToServer");
  });
});

// ---------------------------------------------------------------------------
// 4. ROLLOUT — /trznica (marketplace)
// ---------------------------------------------------------------------------
describe("F3-B rollout: marketplace (/trznica)", () => {
  test("hardcoded 'Nalagam izdelke/izkušnje...' niza ni več — LoadingState + L", () => {
    expect(MARKET_SRC).not.toContain('"Nalagam izdelke..."');
    expect(MARKET_SRC).not.toContain('"Nalagam izkušnje..."');
    expect(MARKET_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(MARKET_SRC).toContain("label={L.loadingProducts[lang]}");
    expect(MARKET_SRC).toContain("label={L.loadingExperiences[lang]}");
  });

  test("L oznake obstajajo v SL in EN (i18n varnost)", () => {
    expect(MARKET_SRC).toContain('sl: "Nalagam izdelke …"');
    expect(MARKET_SRC).toContain('en: "Loading products …"');
    expect(MARKET_SRC).toContain('sl: "Nalagam izkušnje …"');
    expect(MARKET_SRC).toContain('en: "Loading experiences …"');
  });

  test("EmptyState poenotena (družina), NO_LIVE_DATA iskrenost ohranjena", () => {
    expect(MARKET_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(MARKET_SRC).not.toContain("function EmptyState");
    expect(MARKET_SRC).toContain("Ni še živih ponudb (NO_LIVE_DATA)");
    expect(MARKET_SRC).toContain("Ni najdenih rezultatov.");
  });

  test("ErrorState poenotena (družina) — lokalna črtkasta škatla odstranjena", () => {
    expect(MARKET_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(MARKET_SRC).not.toContain("function ErrorState");
    expect(MARKET_SRC).toContain("<ErrorState");
  });

  test("ZERO-LOSS: skeleton mreži (dobro hoteni zlati standardi) ostajata", () => {
    expect(MARKET_SRC).toContain("function ProductSkeleton()");
    expect(MARKET_SRC).toContain("function ExperienceSkeleton()");
    expect(MARKET_SRC).toContain("{ length: 6 }");
    expect(MARKET_SRC).toContain("WishlistHeartButton");
  });
});

// ---------------------------------------------------------------------------
// 5. ROLLOUT — /lokali (listings)
// ---------------------------------------------------------------------------
describe("F3-B rollout: listings (/lokali)", () => {
  test("LoadingState + L oznaka namesto hardcoded 'Nalagam lokal...'", () => {
    expect(LISTINGS_SRC).not.toContain('"Nalagam lokale..."');
    expect(LISTINGS_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(LISTINGS_SRC).toContain('sl: "Nalagam lokale …"');
    expect(LISTINGS_SRC).toContain('en: "Loading venues …"');
  });

  test("EmptyState + ErrorState poenotena (družina), isti besedili/akciji", () => {
    expect(LISTINGS_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(LISTINGS_SRC).toContain(
      'import { ErrorState } from "@/components/states/error-state"'
    );
    expect(LISTINGS_SRC).not.toContain("function EmptyState");
    expect(LISTINGS_SRC).toContain("Ni lokalov za izbrane filtre.");
    expect(LISTINGS_SRC).toContain("onRetry={() => void fetchListings()}");
  });

  test("ZERO-LOSS: 6× ListingSkeleton mreža + števec + kanonski dodaj", () => {
    expect(LISTINGS_SRC).toContain("function ListingSkeleton()");
    expect(LISTINGS_SRC).toContain("{ length: 6 }");
    expect(LISTINGS_SRC).toContain("Prikazujem");
    expect(LISTINGS_SRC).toContain("AddToTripButton");
  });
});

// ---------------------------------------------------------------------------
// 6. ROLLOUT — /pot/[shareId] (shared-trip zemljevid + trip-* kartice)
// ---------------------------------------------------------------------------
describe("F3-B rollout: shared-trip + trip-* kartice", () => {
  test("shared-trip: zemljevid prek LoadingState (block) z L oznako", () => {
    expect(SHARED_SRC).not.toContain('<p className="text-sm">Nalagam zemljevid…</p>');
    expect(SHARED_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(SHARED_SRC).toContain("MapLoadingState");
    expect(SHARED_SRC).toContain('sl: "Nalagam zemljevid …"');
    expect(SHARED_SRC).toContain('en: "Loading map …"');
  });

  test("shared-trip ZERO-LOSS: fork + glasovanje ostajata", () => {
    expect(SHARED_SRC).toContain("TripForkButton");
    expect(SHARED_SRC).toContain("getVoterId");
  });

  test("trip-diary: hydration placeholder v L-pattern (SL + EN)", () => {
    expect(DIARY_SRC).not.toContain('"Nalagam dnevnik…"');
    expect(DIARY_SRC).toContain('sl: "Nalagam dnevnik …"');
    expect(DIARY_SRC).toContain('en: "Loading diary …"');
  });

  test("trip-polls: hydration placeholder v L-pattern (SL + EN)", () => {
    expect(POLLS_SRC).not.toContain('"Nalagam ankete…"');
    expect(POLLS_SRC).toContain('sl: "Nalagam ankete …"');
    expect(POLLS_SRC).toContain('en: "Loading polls …"');
  });

  test("trip-collaboration: zgodovina verzij v L-pattern (SL + EN)", () => {
    expect(COLLAB_SRC).not.toContain("Nalagam zgodovino…\n");
    expect(COLLAB_SRC).toContain('sl: "Nalagam zgodovino …"');
    expect(COLLAB_SRC).toContain('en: "Loading history …"');
  });

  test("my-orders-section: aria oznaki nalaganja v L-pattern (SL + EN)", () => {
    expect(ORDERS_SRC).not.toContain('aria-label="Nalagam naročila"');
    expect(ORDERS_SRC).not.toContain('aria-label="Nalagam rezervacije"');
    expect(ORDERS_SRC).toContain('sl: "Nalagam naročila"');
    expect(ORDERS_SRC).toContain('en: "Loading orders"');
    expect(ORDERS_SRC).toContain('sl: "Nalagam rezervacije"');
    expect(ORDERS_SRC).toContain('en: "Loading reservations"');
    expect(ORDERS_SRC).toContain("aria-label={L.loadingOrders[lang]}");
    expect(ORDERS_SRC).toContain("aria-label={L.loadingBookings[lang]}");
  });
});

// ---------------------------------------------------------------------------
// 7. ROLLOUT — wishlist sheet (SAMO prazno stanje — most ima 38-c)
// ---------------------------------------------------------------------------
describe("F3-B rollout: wishlist-sheet prazno stanje", () => {
  test("družinska EmptyState s CTA v tržnico (naslednje dejanje, ≥44px)", () => {
    expect(WISHLIST_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    // TASK 8 / F4-A: wishlist href je locale-zavedajoč (localePrefix) —
    // identitetni href "/trznica" ostaja v wishlistTripItem (most v zbirko).
    expect(WISHLIST_SRC).toContain('href: "/trznica"');
    // TASK 8 / F4-A: naslov praznega stanja je zdaj dvojezičen (WL L-pattern)
    // — prej pinjen SL literal title="Ni še nič shranjenega." (isti naslov
    // v SL veji, zdaj kot WL.emptyTitle.sl).
    expect(WISHLIST_SRC).toContain('emptyTitle: { sl: "Ni še nič shranjenega.", en: "Nothing saved yet." }');
  });

  test("CTA oznaka v L-pattern (SL + EN)", () => {
    expect(WISHLIST_SRC).toContain('sl: "Razišči tržnico"');
    expect(WISHLIST_SRC).toContain('en: "Explore the marketplace"');
  });

  test("ZERO-LOSS: most v Moja pot + vrstice + srček ostajajo nedotaknjeni", () => {
    expect(WISHLIST_SRC).toContain("wishlistTripItem");
    expect(WISHLIST_SRC).toContain("AddToTripButton");
    expect(WISHLIST_SRC).toContain("openFromWishlist({ type: item.type, id: item.id, slug: item.slug })");
    expect(WISHLIST_SRC).toContain("WishlistHeartButton");
    expect(WISHLIST_SRC).toContain('label: WL.exploreCta[lang]');
  });
});

// ---------------------------------------------------------------------------
// 8. ROLLOUT — poenotenje lokalnih EmptyState klonov (nizko tveganje)
// ---------------------------------------------------------------------------
describe("F3-B rollout: EmptyState kloni poenoteni (isti besedili/akcije)", () => {
  test("events-calendar: družina, lokalni klon odstranjen, isto besedilo", () => {
    expect(EVENTS_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(EVENTS_SRC).not.toContain("function EmptyState");
    // TASK 8 / F4-D: naslov praznega stanja je prešel v L-slovar površine
    // (title={L.emptyTitle[lang]}) — SL besedilo ostaja dobesedno prisotno.
    expect(EVENTS_SRC).toContain("Ni dogodkov za izbrane filtre.");
    expect(EVENTS_SRC).toContain("CalendarX");
  });

  test("destinations: družina z i18n ključi homeDest (dvojezično samo po sebi)", () => {
    expect(DEST_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(DEST_SRC).not.toContain("function EmptyState");
    expect(DEST_SRC).toContain('title={t("emptyTitle")}');
    expect(DEST_SRC).toContain('label: t("clearFilters")');
  });

  test("owner dashboard: družina (disabled akcija!) + obe oznaki nalaganja", () => {
    expect(OWNER_SRC).toContain(
      'import { EmptyState } from "@/components/states/empty-state"'
    );
    expect(OWNER_SRC).toContain(
      'import { LoadingState } from "@/components/states/loading-state"'
    );
    expect(OWNER_SRC).not.toContain("function EmptyState");
    expect(OWNER_SRC).not.toContain("Nalagam portal...");
    expect(OWNER_SRC).not.toContain("Nalagam...");
    expect(OWNER_SRC).toContain('title="Nimate še lokalov"');
    expect(OWNER_SRC).toContain('label: "Dodaj svoj prvi lokal"');
    expect(OWNER_SRC).toContain("disabled: !canAdd");
  });
});

// ---------------------------------------------------------------------------
// 9. I18N — nobena dotaknjena površina ne pušča enojezičnih "Nalagam" nizov
// ---------------------------------------------------------------------------
describe("F3-B i18n: SL/EN pariteta novih oznak (predpogoj za F3-E)", () => {
  test("družina: vse privzete oznake imajo SL in EN vrednost", () => {
    // loading-state
    expect(LOADING_SRC.match(/sl: \{/g)?.length).toBeGreaterThanOrEqual(1);
    expect(LOADING_SRC.match(/en: \{/g)?.length).toBeGreaterThanOrEqual(1);
    // error-state
    expect(ERROR_SRC.match(/sl: \{/g)?.length).toBeGreaterThanOrEqual(1);
    expect(ERROR_SRC.match(/en: \{/g)?.length).toBeGreaterThanOrEqual(1);
  });

  test("vsak L {...} v rollout datotekah nosi sl in en vej skupaj", () => {
    const files: [string, string][] = [
      ["marketplace", MARKET_SRC],
      ["listings", LISTINGS_SRC],
      ["my-orders-section", ORDERS_SRC],
      ["trip-diary", DIARY_SRC],
      ["trip-polls", POLLS_SRC],
      ["trip-collaboration", COLLAB_SRC],
    ];
    for (const [name, src] of files) {
      const slCount = (src.match(/sl: "/g) ?? []).length;
      const enCount = (src.match(/en: "/g) ?? []).length;
      expect(slCount).toBeGreaterThan(0);
      expect(enCount).toBe(slCount);
      expect(enCount).toBeGreaterThan(0);
      // vsaka EN vrednost je neprazen prevod (ne kopija SL)
      const enVals = src.match(/en: "Loading [^"]+"/g) ?? [];
      expect(enVals.length).toBeGreaterThan(0);
      void name;
    }
  });

  test("chatbot / map-view (zlati standardi) NISTA bila dotaknjena v tem valu", () => {
    // chatbot ima že svoj i18n besednjak (t("thinking")), map-view oznaka
    // je že dvojezična — ohranjena namerno (ne regresiramo).
    // ISSUE #12 (F12-3, §7): literal NAMERNO posodobljen — „POI“ tehnični
    // izraz se umakne iz glavnega uporabniškega jezika (pin ščiti
    // DVOJEZIČNOST slovarja, ne staro besedilo).
    const chatbotSrc = read("components/chatbot.tsx");
    expect(chatbotSrc).toContain('t("thinking")');
    const mapSrc = read("components/sections/map-view.tsx");
    expect(mapSrc).toContain(
      'loadingPois: { sl: "Nalagam lokalna mesta…", en: "Loading local places…" }'
    );
  });
});
