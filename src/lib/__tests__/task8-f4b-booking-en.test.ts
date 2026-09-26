// TASK 8 / F4-B (issue #8 Faza 4 — EN razširitev BOOKING sklada): testi
// dvojezičnosti booking sklada — product-modal, experience-modal,
// cart-drawer, checkout-modal (L-pattern slovarji) + booking-panel
// (next-intl planner.booking — TASK 98, tu samo regresijske pogodbe).
//
// 1. L-PARITETA: vsak L list ima NE-PRAZEN sl IN en (števca `sl:`/`en:`
//    se izenačita — vsak nov list mora biti par; enovrstični pari
//    `sl: "…", en: "…"` so strukturno preverjeni; prazni nizi prepovedani).
// 2. BREZ hardcoded SL markerjev: stari JSX/nizovi (gumbi, oznake,
//    placeholderji, validacije, arija) so ZAMENJANI z {L…[lang]} — negativne
//    source pogodbe za visoko-tvežane nize ("Rezerviraj", "Skupaj",
//    "Plačaj", "Napaka", "Zasedeno", "Trajanje", "Ni na zalogi" …).
// 3. RESNIČNOSTNI BESEDJAK (§38 — najvišja stava na booking površinah):
//    "od" ↔ "from" (od-cena), "Ni na zalogi" ↔ "Out of stock",
//    "zaseden" ↔ "sold out" (kapaciteta dneva), "Potrjena" ↔ "Confirmed",
//    "Plačano" ↔ "Paid", "Skupaj za plačilo" ↔ "Total due" — para v OBEH
//    jezikih z EXAKTNO ohranitvijo pomena; demo iskrenost ostaja izrecna.
// 4. ZERO-LOSS markerji: handlerji/veje/akcije ostajajo (handleAddToCart,
//    handlePayment, BookingSection, košarica stores, funnel eventi …).
// 5. LANG WIRING priporočil ostaja (`&lang=` v fetch URL constructorju).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";

const read = (path: string) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

const BOOKING_PANEL = read("components/sections/booking-panel.tsx");
const PRODUCT_MODAL = read("components/sections/product-modal.tsx");
const EXPERIENCE_MODAL = read("components/sections/experience-modal.tsx");
const CART_DRAWER = read("components/cart-drawer.tsx");
const CHECKOUT_MODAL = read("components/checkout-modal.tsx");

const count = (src: string, needle: string) => src.split(needle).length - 1;

/** Število `sl:` / `en:` listov (vsak par => 1 + 1). */
const leafCount = (src: string, key: "sl" | "en") =>
  (src.match(new RegExp(`\\b${key}:`, "g")) ?? []).length;

/** Enovrstični par `sl: "…", en: "…"`. */
const INLINE_PAIR = /sl:\s*"[^"]+"\s*,\s*en:\s*"[^"]+"/g;

// Vsa 4 L-pattern ogrodja: [ime, izvor, pričakovani parov, inline parov]
const L_FILES = [
  ["product-modal", PRODUCT_MODAL, 40, 30],
  ["experience-modal", EXPERIENCE_MODAL, 86, 55],
  ["cart-drawer", CART_DRAWER, 21, 15],
  ["checkout-modal", CHECKOUT_MODAL, 62, 45],
] as const;

// ---------------------------------------------------------------------------
// 1. L-PARITETA — vsak list ima sl + en
// ---------------------------------------------------------------------------
describe("F4-B L-pariteta: vsak list slovarja ima ne-prazen SL in EN", () => {
  for (const [name, src, pairs, inline] of L_FILES) {
    test(`${name}: števec sl: === števec en: (vsak list je par)`, () => {
      expect(leafCount(src, "sl")).toBe(pairs);
      expect(leafCount(src, "en")).toBe(pairs);
    });

    test(`${name}: vsaj ${inline} enovrstičnih parov sl:"…", en:"…"`, () => {
      expect((src.match(INLINE_PAIR) ?? []).length).toBeGreaterThanOrEqual(
        inline
      );
    });

    test(`${name}: NOEmpty listi (prazen SL ali EN niz) so prepovedani`, () => {
      expect(src).not.toMatch(/\bsl:\s*""/);
      expect(src).not.toMatch(/\ben:\s*""/);
      expect(src).not.toMatch(/\bsl:\s*``/);
      expect(src).not.toMatch(/\ben:\s*``/);
    });

    test(`${name}: uporablja useLocale + lang odvod (L-pattern zlati standard)`, () => {
      expect(src).toContain("useLocale");
      expect(src).toContain('locale === "en" ? "en" : "sl"');
      expect(src).toContain('const lang: "sl" | "en"');
    });
  }
});

// ---------------------------------------------------------------------------
// 2. BREZ HARDCODED SL MARKERJEV (stari JSX nizi so zamenjani)
// ---------------------------------------------------------------------------
describe("F4-B brez hardcoded SL: product-modal chrome", () => {
  test("toasti: 'Ni na zalogi' / 'Dodano v košarico' sta L lista", () => {
    expect(PRODUCT_MODAL).toContain('sl: "Ni na zalogi", en: "Out of stock"');
    expect(PRODUCT_MODAL).toContain(
      'sl: "Dodano v košarico", en: "Added to cart"'
    );
    // stari hardcoded toast nizi so odstranjeni
    expect(PRODUCT_MODAL).not.toMatch(/title:\s*"Ni na zalogi"/);
    expect(PRODUCT_MODAL).not.toMatch(/title:\s*"Dodano v košarico"/);
    expect(PRODUCT_MODAL).not.toContain('description: "Ta izdelek je trenutno razprodan."');
  });

  test("spec nalepke InfoItem/StatCard so L lista (ne label=\"…\")", () => {
    expect(PRODUCT_MODAL).not.toMatch(/label="(Kategorija|Lokacija|Zaloga|Teža)"/);
    expect(PRODUCT_MODAL).not.toMatch(/label="(Ogledov|Prodanih)"/);
    expect(PRODUCT_MODAL).toContain('category: { sl: "Kategorija", en: "Category" }');
    expect(PRODUCT_MODAL).toContain('stock: { sl: "Zaloga", en: "Stock" }');
    expect(PRODUCT_MODAL).toContain('weight: { sl: "Teža", en: "Weight" }');
  });

  test("razdelki + atributi + CTA gumbi niso več goli SL nizi", () => {
    expect(PRODUCT_MODAL).not.toMatch(/>\s*Atributi\s*</);
    expect(PRODUCT_MODAL).not.toMatch(/>\s*Prodajalec\s*</);
    expect(PRODUCT_MODAL).not.toMatch(/>\s*Morda vam je všeč\s*</);
    expect(PRODUCT_MODAL).not.toMatch(/>\s*(Izpostavljeno|Ekološko|Vegansko)\s*</);
    expect(PRODUCT_MODAL).not.toMatch(/>\s*(Obišči prodajalca|Povpraševanje pri prodajalcu)\s*</);
    expect(PRODUCT_MODAL).not.toMatch(/aria-label="Overjen izdelek"/);
    expect(PRODUCT_MODAL).not.toMatch(/aria-label="`?Odpri galerijo slik/);
    expect(PRODUCT_MODAL).not.toContain("V košarico — ${formatPrice");
  });

  test("število slik/onError ni spremenjeno (task99a pogodba ostaja)", () => {
    expect(count(PRODUCT_MODAL, "<img")).toBe(3);
    expect(count(PRODUCT_MODAL, "onError")).toBe(3);
  });
});

describe("F4-B brez hardcoded SL: experience-modal chrome", () => {
  test("spec nalepke 'Trajanje/Lokacija/Jeziki/Skupina' so L lista", () => {
    expect(EXPERIENCE_MODAL).not.toMatch(/label="(Trajanje|Lokacija|Jeziki|Skupina)"/);
    expect(EXPERIENCE_MODAL).toContain('duration: { sl: "Trajanje", en: "Duration" }');
    expect(EXPERIENCE_MODAL).toContain('location: { sl: "Lokacija", en: "Location" }');
    expect(EXPERIENCE_MODAL).toContain('languages: { sl: "Jeziki", en: "Languages" }');
  });

  test("rezervacijski CTA + obrazec sta prevedena (star JSX odstranjen)", () => {
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Rezerviraj termin\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Pri ponudniku\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Prekliči\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Potrdi rezervacijo\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Rezerviram…\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/placeholder="(ime@primer\.si|Janez Novak)"/);
    expect(EXPERIENCE_MODAL).not.toMatch(/aria-label="(Zmanjšaj|Povečaj) število oseb"/);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Točka srečanja\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Prikaži na zemljevidu\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*(Ponudnik|Spletna stran)\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/aria-label="Overjena izkušnja"/);
  });

  test("validacijske napake so prevedene (stari SL nizi samo kot L listi)", () => {
    // L listi (para) obstajajo …
    expect(EXPERIENCE_MODAL).toContain(
      'sl: "Vnesite ime in priimek (vsaj 2 znaka).",'
    );
    expect(EXPERIENCE_MODAL).toContain(
      'en: "Enter your full name (at least 2 characters).",'
    );
    // … stari hardcoded ogovor validate() pa ne sme več obstajati
    expect(EXPERIENCE_MODAL).not.toMatch(/next\.date = "Izberite/);
    expect(EXPERIENCE_MODAL).not.toMatch(/next\.groupSize = "Vnesite/);
    expect(EXPERIENCE_MODAL).not.toMatch(/next\.name = "Vnesite/);
    expect(EXPERIENCE_MODAL).not.toMatch(/next\.email = "Vnesite/);
    expect(EXPERIENCE_MODAL).not.toMatch(/next\.phone = "Vnesite/);
  });

  test("uspešni pogled rezervacije je preveden", () => {
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Rezervacija potrjena!?\s*</);
    expect(EXPERIENCE_MODAL).not.toMatch(/>\s*Nova rezervacija\s*</);
    expect(EXPERIENCE_MODAL).toContain('sl: "Številka rezervacije", en: "Booking number"');
    expect(EXPERIENCE_MODAL).toContain('sl: "Nova rezervacija", en: "New booking"');
  });

  test("število slik/onError ni spremenjeno (task99a pogodba ostaja)", () => {
    expect(count(EXPERIENCE_MODAL, "<img")).toBe(3);
    expect(count(EXPERIENCE_MODAL, "onError")).toBe(3);
  });
});

describe("F4-B brez hardcoded SL: cart-drawer chrome", () => {
  test("nagovod/vrstice/povzetek/CTA so L lista", () => {
    expect(CART_DRAWER).not.toMatch(/>\s*Košarica\s*</);
    expect(CART_DRAWER).not.toMatch(/>\s*Skupaj\s*</);
    expect(CART_DRAWER).not.toMatch(/>\s*Zaključi nakup\s*</);
    expect(CART_DRAWER).not.toMatch(/>\s*Izprazni košarico\s*</);
    expect(CART_DRAWER).not.toMatch(/>\s*Košarica je prazna\s*</);
    expect(CART_DRAWER).not.toMatch(/>\s*Nazaj v tržnico\s*</);
    expect(CART_DRAWER).not.toContain('label="Vrednost izdelkov"');
    expect(CART_DRAWER).not.toContain('label="Dostava"');
    expect(CART_DRAWER).not.toMatch(/aria-label="Zapri košarico"/);
    expect(CART_DRAWER).not.toMatch(/>\s*Brezplačna dostava!/);
    expect(CART_DRAWER).not.toContain('} / kos');
  });
});

describe("F4-B brez hardcoded SL: checkout-modal chrome", () => {
  test("obrazec: labels + placeholderji so L lista", () => {
    expect(CHECKOUT_MODAL).not.toMatch(
      /label="(E-pošta|Ime in priimek|Telefon|Poštna številka|Naslov|Mesto|Država)"/
    );
    expect(CHECKOUT_MODAL).not.toMatch(/placeholder="(ime@primer\.si|Janez Novak|Slovenija)"/);
    expect(CHECKOUT_MODAL).toContain('email: { sl: "E-pošta", en: "Email" }');
    expect(CHECKOUT_MODAL).toContain('postalCode: { sl: "Poštna številka", en: "Postal code" }');
  });

  test("validacije: stari SL nizi v validateBuyer() so odstranjeni", () => {
    expect(CHECKOUT_MODAL).not.toMatch(/next\.email = "E-pošta je obvezna"/);
    expect(CHECKOUT_MODAL).not.toMatch(/next\.name = "Ime in priimek/);
    expect(CHECKOUT_MODAL).not.toMatch(/next\.city = "Mesto/);
    expect(CHECKOUT_MODAL).not.toMatch(/setErrorMessage\("Košarica je prazana?\."\)/);
    expect(CHECKOUT_MODAL).not.toContain('setErrorMessage("Košarica je prazna.")');
    expect(CHECKOUT_MODAL).toContain('emptyCart: { sl: "Košarica je prazna.", en: "Your cart is empty." }');
  });

  test("pregled + plačilo + potrditev so prevedeni", () => {
    expect(CHECKOUT_MODAL).not.toMatch(/>\s*(Naročilo uspešno!|Naročilo potrjeno|Napaka pri plačilu)\s*</);
    expect(CHECKOUT_MODAL).not.toMatch(/>\s*(Nazaj|Zapri)\s*</);
    expect(CHECKOUT_MODAL).not.toMatch(/>\s*(Demo način|Plačano)\s*</);
    expect(CHECKOUT_MODAL).not.toMatch(/>\s*(Obdelava plačila|Poskusite znova\.)\s*</);
    expect(CHECKOUT_MODAL).not.toContain("Potrdi in plačaj {formatEUR(total)}");
    expect(CHECKOUT_MODAL).not.toMatch(/>\s*Varna povezava\s*</);
  });
});

// ---------------------------------------------------------------------------
// 3. RESNIČNOSTNI BESEDJAK (§38) — cene / zaloge / statusi
// ---------------------------------------------------------------------------
describe("F4-B resničnostni besedjak: od-cena, zaloga, zasedenost, statusi", () => {
  test("experience-modal: 'od' ↔ 'from' (od-cena per osebi)", () => {
    expect(EXPERIENCE_MODAL).toContain('from: { sl: "od", en: "from" }');
    expect(EXPERIENCE_MODAL).toContain(
      'perPerson: { sl: "/ osebo", en: "per person" }'
    );
  });

  test("product-modal: 'Ni na zalogi' ↔ 'Out of stock' (3 površine)", () => {
    // toast naslov + InfoItem vrednost + onemogočen CTA — isti par
    expect(count(PRODUCT_MODAL, 'sl: "Ni na zalogi", en: "Out of stock"')).toBe(
      2
    );
    expect(PRODUCT_MODAL).toContain('sl: "Ta izdelek je trenutno razprodan.",');
  });

  test("experience-modal: zasedenost ↔ sold out (validacija + proaktivni status)", () => {
    expect(EXPERIENCE_MODAL).toContain(
      'sl: "Ta datum je zaseden — kapaciteta dneva je dosežena.",'
    );
    expect(EXPERIENCE_MODAL).toContain(
      'en: "This date is sold out — day capacity is reached.",'
    );
    expect(EXPERIENCE_MODAL).toContain(
      'sl: "Zaseden dan — kapaciteta dneva je dosežena.",'
    );
    expect(EXPERIENCE_MODAL).toContain(
      'en: "Sold out — day capacity is reached.",'
    );
  });

  test("experience-modal: status rezervacije 'Potrjena' ↔ 'Confirmed'", () => {
    expect(EXPERIENCE_MODAL).toContain(
      'statusConfirmed: { sl: "Potrjena", en: "Confirmed" }'
    );
    expect(EXPERIENCE_MODAL).toContain(
      'successTitle: { sl: "Rezervacija potrjena!", en: "Booking confirmed!" }'
    );
  });

  test("cart-drawer + checkout-modal: 'Skupaj' ↔ 'Total', 'Plačano' ↔ 'Paid'", () => {
    expect(CART_DRAWER).toContain('total: { sl: "Skupaj", en: "Total" }');
    expect(CART_DRAWER).toContain('free: { sl: "Brezplačna", en: "Free" }');
    expect(CHECKOUT_MODAL).toContain(
      'totalDue: { sl: "Skupaj za plačilo", en: "Total due" }'
    );
    expect(CHECKOUT_MODAL).toContain('paid: { sl: "Plačano", en: "Paid" }');
  });

  test("demo iskrenost: NE zaračuna — v OBEH jezikih izrecno", () => {
    expect(EXPERIENCE_MODAL).toContain('sl: "Demo način: rezervacija se takoj');
    expect(EXPERIENCE_MODAL).toContain(
      'en: "Demo mode: the booking is confirmed instantly and no payment is charged.'
    );
    expect(CHECKOUT_MODAL).toContain("NE bo zaračunalo");
    expect(CHECKOUT_MODAL).toContain("no real payment will be charged");
  });

  test("cart-drawer: 'Vse cene so v EUR' ↔ 'All prices are in EUR' (ne laže o valuti)", () => {
    expect(CART_DRAWER).toContain(
      'sl: "Vse cene so v EUR. Dostava se obračuna pri plačilu.",'
    );
    expect(CART_DRAWER).toContain(
      'en: "All prices are in EUR. Shipping is charged at payment.",'
    );
  });
});

// ---------------------------------------------------------------------------
// 4. ZERO-LOSS MARKERJI — handlerji/veje/integracije ostajajo
// ---------------------------------------------------------------------------
describe("F4-B zero-loss: handlerji in integracije nedotaknjene", () => {
  test("product-modal: košarica + wishlist + lightbox + priporočila", () => {
    expect(PRODUCT_MODAL).toContain("handleAddToCart");
    expect(PRODUCT_MODAL).toContain('trackFunnel("add_to_cart")');
    expect(PRODUCT_MODAL).toContain("<WishlistHeartButton");
    expect(PRODUCT_MODAL).toContain("<ImageLightbox");
    expect(PRODUCT_MODAL).toContain("<ReviewSection");
    expect(PRODUCT_MODAL).toContain("RecommendationsSection");
    expect(PRODUCT_MODAL).toContain("disabled={product.stock <= 0}");
  });

  test("experience-modal: BookingSection + Dodaj v mojo pot + atribucija", () => {
    expect(EXPERIENCE_MODAL).toContain("<BookingSection");
    expect(EXPERIENCE_MODAL).toContain("<AddToTripButton");
    expect(EXPERIENCE_MODAL).toContain("<WishlistHeartButton");
    expect(EXPERIENCE_MODAL).toContain('trackFunnel("experience_booked")');
    expect(EXPERIENCE_MODAL).toContain("addBooking(data.bookingNumber)");
    expect(EXPERIENCE_MODAL).toContain("clearConsultationRef()");
    expect(EXPERIENCE_MODAL).toContain("hasConsultationRef()");
    expect(EXPERIENCE_MODAL).toContain("availability?month=");
    expect(EXPERIENCE_MODAL).toContain("selectedAvail");
  });

  test("cart-drawer: količine/brisanje/checkout prenos", () => {
    expect(CART_DRAWER).toContain("handleCheckout");
    expect(CART_DRAWER).toContain("updateQuantity");
    expect(CART_DRAWER).toContain("removeItem");
    expect(CART_DRAWER).toContain("clearCart");
    expect(CART_DRAWER).toContain("<CheckoutModal");
    expect(CART_DRAWER).toContain("FREE_SHIPPING_THRESHOLD");
  });

  test("checkout-modal: plačilo + FW2-C zgodovina naročil", () => {
    expect(CHECKOUT_MODAL).toContain("handlePayment");
    expect(CHECKOUT_MODAL).toContain('"/api/checkout"');
    expect(CHECKOUT_MODAL).toContain("addOrderNumber(data.orderNumber)");
    expect(CHECKOUT_MODAL).toContain("rememberCheckoutEmail(buyer.email)");
    expect(CHECKOUT_MODAL).toContain('trackFunnel("checkout_completed")');
    expect(CHECKOUT_MODAL).toContain("setPaidTotal");
    expect(CHECKOUT_MODAL).toContain('country: "Slovenija"');
  });
});

// ---------------------------------------------------------------------------
// 5. LANG WIRING priporočil (§20) ostaja
// ---------------------------------------------------------------------------
describe("F4-B lang wiring priporočil (API lang parameter)", () => {
  test("oba modala pošljeta lang v fetch URL constructor", () => {
    for (const src of [PRODUCT_MODAL, EXPERIENCE_MODAL]) {
      expect(src).toContain('&lang=${locale === "en" ? "en" : "sl"}');
      expect(src).toContain('useTranslations("marketplace")');
      expect(src).toContain('t("recsWhy", { why:');
      expect(src).toContain('t("recsWhyFromData")');
      expect(src).toContain('=== "deterministic"');
    }
  });

  test("experience-modal: AddToTripButton podnaslov je že jezikovno varen", () => {
    expect(EXPERIENCE_MODAL).toContain(
      '${locale === "en" ? "from" : "od"}'
    );
  });

  test("številska/datumska oblika sledi jeziku (toLocaleString/localeDateString)", () => {
    expect(PRODUCT_MODAL).toContain('lang === "en" ? "en-US" : "sl-SI"');
    expect(EXPERIENCE_MODAL).toContain('lang === "en" ? "en-US" : "sl-SI"');
    expect(EXPERIENCE_MODAL).toContain(
      'lang === "en" ? "en-GB" : "sl-SI"'
    );
  });
});

// ---------------------------------------------------------------------------
// 6. BOOKING-PANEL (next-intl, TASK 98) — regresijske pogodbe
// ---------------------------------------------------------------------------
describe("F4-B booking-panel: dvojezičen prek next-intl (planner.booking)", () => {
  const slBooking = (slMessages as unknown as { planner: { booking: Record<string, string> } })
    .planner.booking;
  const enBooking = (enMessages as unknown as { planner: { booking: Record<string, string> } })
    .planner.booking;

  test("komponenta uporablja planner.booking namespace (5 komponent)", () => {
    expect(count(BOOKING_PANEL, 'useTranslations("planner.booking")')).toBe(5);
    // dinamični kontakt labelKey (contactWebsite/Email/Phone)
    expect(BOOKING_PANEL).toContain("{t(contact.labelKey)}");
  });

  test("vsak t(\"…\") ključ v izvoru obstaja v SL in EN sporočilih (ne-prazen)", () => {
    const staticKeys = [...BOOKING_PANEL.matchAll(/\bt\("([a-zA-Z]+)"/g)].map(
      (m) => m[1]
    );
    expect(staticKeys.length).toBeGreaterThanOrEqual(20);
    const dynamicKeys = ["contactWebsite", "contactEmail", "contactPhone"];
    for (const key of [...staticKeys, ...dynamicKeys]) {
      expect(slBooking[key]?.trim().length, `SL planner.booking.${key}`).toBeGreaterThan(0);
      expect(enBooking[key]?.trim().length, `EN planner.booking.${key}`).toBeGreaterThan(0);
    }
  });

  test("namespace pariteta: identični nabor ključev v SL in EN", () => {
    expect(Object.keys(slBooking).sort()).toEqual(Object.keys(enBooking).sort());
    expect(Object.keys(slBooking).length).toBeGreaterThanOrEqual(36);
  });

  test("resničnostne dvojice v sporočilih: od-cene/from-prices, Rezerviraj/Book", () => {
    expect(slBooking.handoffTransferNote).toContain("od-cene");
    expect(enBooking.handoffTransferNote).toContain("from-prices");
    expect(slBooking.heading).toContain("Rezerviraj");
    expect(enBooking.heading).toContain("Book");
    expect(slBooking.hotelsEmpty).toContain("Rezervirajte");
    expect(enBooking.hotelsEmpty).toContain("Book");
    // iskrene affiliate opombe: NI živih cen v aplikaciji — v obeh jezikih
    expect(slBooking.handoffFlightNote).toContain("brez živih cen");
    expect(enBooking.handoffFlightNote).toContain("no live flight prices");
  });

  test("zero-loss: zavihki + helperji + tracking ostajajo", () => {
    expect(BOOKING_PANEL).toContain("insuranceGoHref");
    expect(BOOKING_PANEL).toContain("clampInsuranceDays");
    expect(BOOKING_PANEL).toContain("dsa:booking-tab");
    expect(BOOKING_PANEL).toContain('trackFunnel("listing_click"');
    expect(BOOKING_PANEL).toContain("export function BookingPanel");
    expect(BOOKING_PANEL).toContain("export default BookingPanel");
  });
});
