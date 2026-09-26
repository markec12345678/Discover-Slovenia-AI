// TASK 8 / D8-D — SOURCE-CONTRACT testi: kanonski AddToTripButton v vseh
// površinah odkrivanja (Issue #8 §3.3 / D8-B arhitektura).
//
// Vzorec: readFileSync dejanskih datotek (isto kot task86-map-deep-link) —
// varovalke pred (a) nehote odstranjenim kanonskim dodajanjem, (b) izgubo
// obstoječih akcij (ZERO FEATURE LOSS), (c) razpadom write-through vezav na
// zemljevidu.
//
// NAMERNE spremembe besedil (issue #8 §52):
//  - supply/product-modal: "Dodaj v moj načrt" → kanonski "Dodaj v mojo pot"
//    (AddToTripButton ima lastne oznake SL/EN; detajlne oznake mehanike
//    postanek/izbira/duplikat ostanejo kot vrstica pod gumbom).
//  - journey-planner: "Dodaj v načrt" badge-toggle → isti kanonski gumb
//    (mehanika toggleProduct nespremenjena).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { supplyTripItem, supplyTripKind } from "@/lib/supply/my-trip-item";
import type { ProductType } from "@/lib/supply/types";

const ROOT = join(import.meta.dir, "../../..");

function source(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. KANONSKI GUMB — prisoten v VSEH površinah odkrivanja (D8-A mrtvi konci)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / D8-D: AddToTripButton v površinah odkrivanja", () => {
  test("destination-modal: full varianta NAD 'Zgradi novo pot' (kind destination)", () => {
    const src = source("src/components/sections/destination-modal.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton");
    expect(src).toContain('variant="full"');
    expect(src).toContain('kind: "destination"');
    expect(src).toContain('refId: destination.slug');
    expect(src).toContain('source: "destination-modal"');
    // kanonski gumb je NAD napredno regeneracijsko potjo
    expect(src.indexOf("<AddToTripButton")).toBeLessThan(
      src.indexOf("Zgradi novo pot okoli")
    );
  });

  test("destination hub + things-to-do: client ovojnik (server strani) + priklop obeh strani", () => {
    const wrapper = source("src/components/destination-add-to-trip.tsx");
    expect(wrapper).toContain('"use client"');
    expect(wrapper).toContain('from "@/components/add-to-trip-button"');
    expect(wrapper).toContain('<AddToTripButton variant="full"');
    expect(wrapper).toContain('kind: "destination"');

    const hub = source("src/app/destinacija/[slug]/page.tsx");
    expect(hub).toContain('DestinationAddToTrip } from "@/components/destination-add-to-trip"');
    expect(hub).toContain("<DestinationAddToTrip");

    const thingsToDo = source("src/app/destinacija/[slug]/things-to-do/page.tsx");
    expect(thingsToDo).toContain('DestinationAddToTrip } from "@/components/destination-add-to-trip"');
    expect(thingsToDo).toContain("<DestinationAddToTrip");
    expect(thingsToDo).toContain('source="destinacija-things-to-do"');
  });

  test("smart-search: kompaktstni dodaj na vrsticah vseh 4 skupin (P-SEARCH-1)", () => {
    const src = source("src/components/smart-search.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton");
    expect(src).toContain('variant="compact"');
    expect(src).toContain('source: "smart-search"');
    // href vrstice = ISTA pot, kamor vrstica navigira (searchResultHref)
    expect(src).toContain('href: searchResultHref({ kind: "destination"');
    expect(src).toContain('href: searchResultHref({ kind: "listing"');
    expect(src).toContain('href: searchResultHref({ kind: "product"');
    expect(src).toContain('href: searchResultHref({ kind: "experience"');
    // vrstica NI vgnezdjen gumb v gumbu (neveljaven HTML) — sosedje
    expect(src).toContain("tripItem?: MyTripInput");
    expect(src).toContain('item={item.tripItem}');
  });

  test("events-calendar (EventCard): kompaktstni dodaj, kind event, iskren /dogodki", () => {
    const src = source("src/components/sections/events-calendar.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton");
    expect(src).toContain('kind: "event"');
    expect(src).toContain('href: "/dogodki"');
    expect(src).toContain('source: "dogodki"');
  });

  test("listing-modal: full dodaj ob rezervacijskih CTA (kind listing, /lokali)", () => {
    const src = source("src/components/sections/listing-modal.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain('variant="full"');
    expect(src).toContain('kind: "listing"');
    expect(src).toContain('href: "/lokali"');
    expect(src).toContain('source: "lokali"');
  });

  test("listings (ListingCard): kompaktstni dodaj pod obstoječo CTA vrstico", () => {
    const src = source("src/components/sections/listings.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain('variant="compact"');
    expect(src).toContain('kind: "listing"');
    // obstoječi akciji sta pred dodajanjem (ZERO loss vrstni red)
    expect(src.indexOf("Podrobnosti")).toBeLessThan(
      src.indexOf("<AddToTripButton")
    );
  });

  test("experience-modal: full dodaj nad BookingSection (kind experience)", () => {
    const src = source("src/components/sections/experience-modal.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain('variant="full"');
    expect(src).toContain('kind: "experience"');
    expect(src).toContain('refId: experience.id');
    expect(src).toContain('source: "dozivetja"');
    // dodaj je NAD rezervacijo (blizu naslova, pred booking sekcijo)
    expect(src.indexOf("<AddToTripButton")).toBeLessThan(
      src.indexOf("<BookingSection")
    );
  });

  test("wishlist-sheet: MOST priljubljene → Moja pot (kompaktstni + ikonski)", () => {
    const src = source("src/components/wishlist-sheet.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("<AddToTripButton");
    expect(src).toContain('variant="compact"');
    expect(src).toContain('variant="icon"');
    expect(src).toContain("wishlistTripItem");
    expect(src).toContain('href: "/trznica"');
    expect(src).toContain('kind: entry.type');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. WRITE-THROUGH pogodbe (kontrolirani način — zemljevid / potovanje)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / D8-D: write-through pogodbe (kontrolirani način)", () => {
  test("supply/product-modal: KONTROLIRAN gumb (added + onToggle) čez obstoječo mehaniko", () => {
    const src = source("src/components/supply/product-modal.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    // kontrolirana izvedba (ne nekontrolirana!)
    expect(src).toContain("added={addedState !== null || isSelected}");
    expect(src).toContain("onToggle={handleToggleTrip}");
    // dodaj: obstoječa mehanika (addProductToSelection prek handleAdd) + zbirka
    expect(src).toContain("addProductToSelection(product, { locale: lang })");
    expect(src).toContain('addMyTripItem(supplyTripItem(product, lang, "zemljevid"))');
    // odstrani: removeSelectedProduct + removeMyTripItem
    expect(src).toContain("removeSelectedProduct(product.provider, product.providerProductId)");
    expect(src).toContain("removeMyTripItem(");
    // detajlne oznake mehanike ostajajo (iskren odziv postanek/izbira/duplikat)
    expect(src).toContain("L.addedStop[lang]");
    expect(src).toContain("L.addedSelection[lang]");
    expect(src).toContain("L.dup[lang]");
  });

  test("supply/product-card: KONTROLIRAN kompaktstni gumb čez onAdd starša", () => {
    const src = source("src/components/supply/product-card.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("added={selected}");
    expect(src).toContain("onToggle={(next)");
    // dodaj: obstoječi starševski tok + registracija
    expect(src).toContain("onAdd(product)");
    expect(src).toContain('addMyTripItem(supplyTripItem(product, lang, "zemljevid"))');
    // odstrani: removeSelectedProduct + removeMyTripItem
    expect(src).toContain("removeSelectedProduct(product.provider, product.providerProductId)");
    expect(src).toContain("removeMyTripItem(supplyTripKind(product.type), product.id)");
  });

  test("journey-planner: mehanika toggleProduct NESPREMENJENA + registracija zbirke", () => {
    const src = source("src/components/sections/journey-planner.tsx");
    expect(src).toContain('from "@/components/add-to-trip-button"');
    expect(src).toContain("added={isSelected}");
    expect(src).toContain("toggleProduct(p.id)");
    expect(src).toContain('supplyTripItem(p, lang, "potovanje", "/potovanje")');
    expect(src).toContain("removeMyTripItem(supplyTripKind(p.type), p.id)");
  });

  test("itinerary-events: write-through SAMO ob dodajanju v načrt (zbirka ≠ razpored)", () => {
    const src = source("src/components/itinerary-events.tsx");
    expect(src).toContain('addMyTripItem } from "@/lib/my-trip"');
    expect(src).toContain("onToggle(event)");
    // SAMO dodajanje — ob odstranitvi iz načrta zbirke NE smemo dotakniti
    expect(src).toContain("if (!added) {");
    expect(src).toContain('kind: "event"');
    expect(src).toContain('href: "/dogodki"');
    expect(src).not.toContain("removeMyTripItem");
    // gumbova lastna stanja ostajajo (s.addToMyTrip/s.inYourTrip)
    expect(src).toContain("s.addToMyTrip");
    expect(src).toContain("s.inYourTrip");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. REGRESIJSKE VAROVALKE (ZERO FEATURE LOSS)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / D8-D: regresijske varovalke (nič izgubljenih akcij)", () => {
  test("destination-modal: 'Zgradi novo pot okoli' + heroQuery prenos ostajata", () => {
    const src = source("src/components/sections/destination-modal.tsx");
    expect(src).toContain("Zgradi novo pot okoli {destination.name}");
    expect(src).toContain('"heroQuery"');
    expect(src).toContain('trackFunnel("listing_click", `/nacrtuj?dest=${destination.id}`)');
  });

  test("experience-modal: rezervacijski CTA 'Rezerviraj termin' + 'Pri ponudniku' nedotaknjena", () => {
    const src = source("src/components/sections/experience-modal.tsx");
    expect(src).toContain("Rezerviraj termin");
    expect(src).toContain("Pri ponudniku");
    expect(src).toContain("<BookingSection");
    expect(src).toContain("<WishlistHeartButton");
  });

  test("listing-modal: 'Obišči spletno stran' + AI Booking Assistant nedotaknjena", () => {
    const src = source("src/components/sections/listing-modal.tsx");
    expect(src).toContain("Obišči spletno stran");
    expect(src).toContain("<BookingAssistant");
  });

  test("supply/product-modal: 'Preveri ponudbo' (/go veriga) nedotaknjena", () => {
    const src = source("src/components/supply/product-modal.tsx");
    expect(src).toContain("{L.checkOffer[lang]}");
    expect(src).toContain("offerHref");
  });

  test("events-calendar: obstoječa CTA (spletna stran / razišči destinacijo) ostajata", () => {
    const src = source("src/components/sections/events-calendar.tsx");
    expect(src).toContain("Spletna stran");
    expect(src).toContain("Razišči destinacijo");
  });

  test("smart-search: H1 navigacijske pogodbe ostajajo (4 skupine + zunanjaa ključka)", () => {
    const src = source("src/components/smart-search.tsx");
    expect(src).toContain("onSelectDestination(d.slug ?? d.id)");
    expect(src).toContain('navigateResult({ kind: "destination", id: d.id, slug: d.slug ?? null })');
    expect(src).toContain('navigateResult({ kind: "listing", id: l.id })');
    expect(src).toContain('navigateResult({ kind: "product", id: p.id })');
    expect(src).toContain('navigateResult({ kind: "experience", id: e.id })');
    expect(src).not.toContain("onClick: () => handleClose()");
  });

  test("supply/product-modal: NAMERNA sprememba besedila — 'Dodaj v moj načrt' zamenjan s kanonskim", () => {
    // TASK 8 / D8-D: namerna sprememba besedila na kanonski Dodaj v mojo pot
    // (issue #8 §52) — upokojena oznaka NE sme več priti do RENDER plasti
    // (niti L slovar niti JSX); zgodovinske/reference komentarje o spremembi
    // pa PRÍČAKUJEMO (dokumentirana namernost).
    const src = source("src/components/supply/product-modal.tsx");
    expect(src).not.toContain("L.addPlan");
    expect(src).not.toContain("addPlan:");
    expect(src).not.toContain("addPlanAcc");
    expect(src).toContain("issue #8 §52");
  });

  test("wishlist-sheet: 'Odpri v tržnici' vedenje (glavni gumb vrstice) ostaja", () => {
    const src = source("src/components/wishlist-sheet.tsx");
    expect(src).toContain("openFromWishlist({ type: item.type, id: item.id, slug: item.slug })");
    expect(src).toContain("Odpri ${item.name} v tržnici");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. ENOTA: preslikava supply produkta → predmet zbirke (my-trip-item.ts)
// ─────────────────────────────────────────────────────────────────────────

describe("TASK 8 / D8-D: supplyTripKind / supplyTripItem (enota)", () => {
  test("vrsta → skupina zbirke: aktivnost/tura/vstopnica = doživetje, dogodek = dogodek, ostalo = izdelek", () => {
    expect(supplyTripKind("activity" as ProductType)).toBe("experience");
    expect(supplyTripKind("tour" as ProductType)).toBe("experience");
    expect(supplyTripKind("ticket" as ProductType)).toBe("experience");
    expect(supplyTripKind("event" as ProductType)).toBe("event");
    expect(supplyTripKind("restaurant" as ProductType)).toBe("product");
    expect(supplyTripKind("accommodation" as ProductType)).toBe("product");
  });

  test("geo produkt → glob-povezava /zemljevid?lat&lng&zoom&label (TASK 86 vzorec)", () => {
    const item = supplyTripItem(
      {
        id: "osm:node-123",
        type: "restaurant" as ProductType,
        title: "Gostilna Pri Lipi",
        address: "Ljubljana 1",
        lat: 46.05,
        lng: 14.5,
      },
      "sl",
      "zemljevid"
    );
    expect(item.kind).toBe("product");
    expect(item.refId).toBe("osm:node-123");
    expect(item.href).toContain("/zemljevid?lat=46.05&lng=14.5&zoom=13&label=");
    expect(item.subtitle).toContain("Restavracija");
    expect(item.source).toBe("zemljevid");
  });

  test("produkt brez geo → iskren fallback (privzeto /zemljevid, /potovanje za journey)", () => {
    const base = { id: "viator:abc", type: "tour" as ProductType, title: "Tur" };
    expect(supplyTripItem(base, "sl", "zemljevid").href).toBe("/zemljevid");
    expect(supplyTripItem(base, "sl", "potovanje", "/potovanje").href).toBe("/potovanje");
    // tura = doživetje
    expect(supplyTripItem(base, "sl", "potovanje", "/potovanje").kind).toBe("experience");
  });

  test("SLIKA: http(s) meja (AUDIT 42) — javascript: shema se ZAVRNE", () => {
    const evil = supplyTripItem(
      { id: "x:y", type: "shop" as ProductType, title: "T", image: "javascript:alert(1)" },
      "sl",
      "zemljevid"
    );
    expect(evil.image).toBeUndefined();
    const ok = supplyTripItem(
      { id: "x:y", type: "shop" as ProductType, title: "T", image: "https://img.example/a.jpg" },
      "sl",
      "zemljevid"
    );
    expect(ok.image).toBe("https://img.example/a.jpg");
  });
});
