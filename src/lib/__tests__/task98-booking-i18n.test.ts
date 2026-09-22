// ============================================================================
// TASK 98 — BOOKING PANEL I18N: testi (1.85.0)
// ============================================================================
//
// Kontekst: BookingPanel (glavna booking površina načrtovalnika — 4 zavihki,
// 9 affiliate partnerjev + lokalne kartice) je bila SL-hardcoded, čeprav
// /nacrtuj ŽIVI tudi na /en/nacrtuj (EN whitelist) — EN uporabniki so videli
// slovenske naslove, zavihke, CTA-je in opise. Ta datoteka varuje:
//
//   1. SPOROČILNA PARITETA: planner.booking (33 ključev) obstaja v SL in EN
//      z IDENTIČNIMI keyseti, nepraznimi vrednostmi in ENAKIMI ICU
//      placeholderji ({dest}/{days}/{price}) — nikoli razpada enega jezika;
//   2. VSEBINA: SL besedila so nespremenjena glede na prejšnjo hardcoded
//      različico (vključno TASK 97 semantiko "{days}-dnevno potovanje"),
//      EN prevodi so smiselni ("Book this day", "€{price}/person");
//   3. SOURCE-CONTRACT: VSA uporabniku vidna besedila prihajajo iz t() —
//      0 hardcoded cta="/description="/text=" propov, 0 slovenskih literalov
//      v kodi (brez komentarjev), kontakt-helperji vračajo prevodne ključe;
//   4. DRIFT GUARD: vsi t() ključi, uporabljeni v komponentah, OBSTOJAJO v
//      obeh jezikih (poznejša odstranitev ključa iz JSON razbije build
//      testno, ne v produkciji);
//   5. AFFILIATE BADGE (partner-badge.tsx, uporabljen na panelu): kratka
//      oznaka + tooltip prevedena; veliki badge ostane ime partnerja.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Koda brez komentarjev — testi literalov ne smejo pasti zaradi pojasnil. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const panel = stripComments(source("src/components/sections/booking-panel.tsx"));
const badge = stripComments(source("src/components/partner-badge.tsx"));
const routing = source("src/i18n/routing.ts");

const slBooking = (slMessages as Record<string, Record<string, unknown>>).planner
  .booking as Record<string, string>;
const enBooking = (enMessages as Record<string, Record<string, unknown>>).planner
  .booking as Record<string, string>;
const slAff = (slMessages as unknown as Record<string, Record<string, string>>).affiliate;
const enAff = (enMessages as unknown as Record<string, Record<string, string>>).affiliate;

/** Vsi ICU placeholderji ključa (urejeni) — za primerjavo med jeziki. */
function placeholders(s: string): string[] {
  return [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
}

// ---------------------------------------------------------------------------
// 1. Sporocilna pariteta — planner.booking v obeh jezikih
// ---------------------------------------------------------------------------

describe("TASK 98: planner.booking — pariteta sporocil SL/EN", () => {
  test("imenski prostor obstaja v obeh jezikih z identicnimi keyseti (33)", () => {
    expect(Object.keys(slBooking).length).toBe(33);
    expect(Object.keys(enBooking).length).toBe(33);
    expect(Object.keys(slBooking).sort()).toEqual(Object.keys(enBooking).sort());
  });

  test("vse vrednosti so neprazni stringi v OBEH jezikih", () => {
    for (const [k, v] of Object.entries(slBooking)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
    for (const [k, v] of Object.entries(enBooking)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });

  test("ICU placeholderji so enaki v obeh jezikih (nikoli razpad enega jezika)", () => {
    for (const [k, sl] of Object.entries(slBooking)) {
      expect(placeholders(sl)).toEqual(placeholders(enBooking[k]));
    }
  });

  test("{dest} na 5 karticah, {days} na zavarovanju, {price} na izkusnjah", () => {
    const destKeys = Object.entries(slBooking).filter(([, v]) =>
      placeholders(v).includes("dest"),
    );
    expect(destKeys.map(([k]) => k).sort()).toEqual(
      [
        "activitiesDesc",
        "activitiesEmpty",
        "carsDesc",
        "diningEmpty",
        "hotelsDesc",
        "hotelsEmpty",
        "transferDesc",
      ].sort(),
    );
    expect(placeholders(slBooking.insuranceDaysDesc)).toEqual(["days"]);
    expect(placeholders(enBooking.insuranceDaysDesc)).toEqual(["days"]);
    expect(placeholders(slBooking.pricePerPerson)).toEqual(["price"]);
    expect(placeholders(enBooking.pricePerPerson)).toEqual(["price"]);
  });
});

// ---------------------------------------------------------------------------
// 2. Vsebina — SL nespremenjen, EN smiselen
// ---------------------------------------------------------------------------

describe("TASK 98: vsebina sporocil", () => {
  test("SL: naslov + intro ostajata nespremenjena (parity s prej hardcodano verzijo)", () => {
    expect(slBooking.heading).toBe("Rezerviraj ta dan");
    expect(slBooking.intro).toBe(
      "Nastanitev, aktivnosti, prehrano in transport rezerviraj neposredno prek naših partnerjev ali lokalnih ponudnikov.",
    );
  });

  test("SL: TASK 97 semantika zavarovanja se ohranja ({days}-dnevno potovanje)", () => {
    expect(slBooking.insuranceDaysDesc).toContain("{days}-dnevno potovanje");
    expect(slBooking.insuranceDaysDesc).toContain("pustolovske aktivnosti");
    expect(slBooking.insuranceDesc).not.toContain("{days}");
  });

  test("SL: vse CTA + zavihki + oznake ( parity s hardcodano verzijo)", () => {
    expect(slBooking.ctaSearch).toBe("Iskanje");
    expect(slBooking.ctaTickets).toBe("Vstopnice");
    expect(slBooking.ctaRental).toBe("Najem");
    expect(slBooking.ctaTransfer).toBe("Transfer");
    expect(slBooking.ctaEsim).toBe("eSIM");
    expect(slBooking.ctaInsurance).toBe("Zavarovanje");
    expect(slBooking.tabAccommodation).toBe("Nastanitev");
    expect(slBooking.tabDining).toBe("Hrana");
    expect(slBooking.contactWebsite).toBe("Spletna stran");
    expect(slBooking.badgeLocal).toBe("Lokalno");
    expect(slBooking.pricePerPerson).toBe("€{price}/osebo");
  });

  test("EN: naslov, zavihki, CTA-ji, cena — smiselni prevodi", () => {
    expect(enBooking.heading).toBe("Book this day");
    expect(enBooking.tabAccommodation).toBe("Stay");
    expect(enBooking.tabActivities).toBe("Activities");
    expect(enBooking.tabDining).toBe("Dining");
    expect(enBooking.ctaSearch).toBe("Search");
    expect(enBooking.ctaTickets).toBe("Tickets");
    expect(enBooking.ctaInsurance).toBe("Insurance");
    expect(enBooking.pricePerPerson).toBe("€{price}/person");
    expect(enBooking.contactPhone).toBe("Call");
  });

  test("EN: opisi partnerjev vsebujejo {dest} interpolacijo in angleško besedilo", () => {
    expect(enBooking.hotelsDesc).toBe("Search hotels and apartments in {dest}");
    expect(enBooking.ticketsDesc).toContain("skip the line");
    expect(enBooking.flightsDesc).toContain("Jože Pučnik Airport");
    expect(enBooking.transferDesc).toContain("Airport transfer from Ljubljana to {dest}");
  });
});

// ---------------------------------------------------------------------------
// 3. Source-contract — vsa besedila iz t(), 0 hardcoded
// ---------------------------------------------------------------------------

describe("TASK 98: BookingPanel source-contract (i18n)", () => {
  test("useTranslations('planner.booking') v glavni + 4 pod-komponentah", () => {
    // BookingPanel, FeaturedVerifiedBadges, ListingCard, ExperienceCard, ProductCard
    const uses = panel.match(/useTranslations\("planner\.booking"\)/g) ?? [];
    expect(uses.length).toBe(5);
  });

  test("0 hardcoded cta=/description=/text= propov (vsak iz t())", () => {
    expect(panel).not.toMatch(/\bcta="/);
    expect(panel).not.toMatch(/\bdescription="/);
    expect(panel).not.toMatch(/\btext="/);
  });

  test("0 slovenskih literalov v KODI (brez komentarjev) — diakritiki", () => {
    expect(panel).not.toMatch(/[čšžČŠŽ]/);
  });

  test("0 specificnih SL besedil, ki jih prej niso pokrili diakritiki", () => {
    // Brez diakritikov: "Vstopnice", "Zavarovanje", "Iskanje", "Najem",
    // "Transfer" kot CTA, "/osebo", prazna stanja, intro ...
    for (const lit of [
      "Vstopnice",
      "Zavarovanje",
      "Iskanje",
      "Najem avta",
      "/osebo",
      "V bazi",
      "dnevno potovanje",
      "brez avta",
      "primerjava cen",
      "fizicne SIM".replace("c", "č").length > 0 ? "fizične SIM" : "",
      "neposredno prek",
    ]) {
      if (lit) expect(panel).not.toContain(lit);
    }
  });

  test("kontakt-helperji vračajo PREVODNE KLJUCE (labelKey), ne besedila", () => {
    expect(panel).toContain(
      'export type ContactLabelKey = "contactWebsite" | "contactEmail" | "contactPhone"',
    );
    expect(panel).not.toMatch(/label:\s*string/);
    expect(panel).toContain('labelKey: "contactWebsite"');
    expect(panel).toContain('labelKey: "contactEmail"');
    expect(panel).toContain('labelKey: "contactPhone"');
    // Kartice prevajajo prek kljuca (ne ploscno besedilo)
    expect(panel.match(/\{t\(contact\.labelKey\)\}/g)?.length).toBe(3);
  });

  test("cena izkušnje interpolirana prek ICU ({price})", () => {
    expect(panel).toContain('t("pricePerPerson", { price: exp.pricePerPerson })');
  });

  test("zavarovanje: days interpolacija + generični fallback brez days", () => {
    expect(panel).toContain('t("insuranceDaysDesc", { days: insuranceDays })');
    expect(panel).toContain('t("insuranceDesc")');
  });

  test("imena partnerjev ostanejo hardcodana (blagovne znamke, NE prevod)", () => {
    for (const brand of [
      'partnerName="Booking.com"',
      'partnerName="GetYourGuide"',
      'partnerName="Tiqets"',
      'partnerName="DiscoverCars"',
      'partnerName="Omio"',
      'partnerName="Kiwitaxi"',
      'partnerName="Airalo"',
      'partnerName="Skyscanner"',
      'partnerName="World Nomads"',
    ]) {
      expect(panel).toContain(brand);
    }
  });

  test("TASK 97 klient-varnost se ohranja (0 @/lib/affiliate, 0 process.env)", () => {
    expect(panel).not.toContain('from "@/lib/affiliate');
    expect(panel).not.toContain("process.env");
  });
});

// ---------------------------------------------------------------------------
// 4. Drift guard — vsi t() ključi komponent obstoje v sporocilih
// ---------------------------------------------------------------------------

describe("TASK 98: drift guard t() ključi ↔ sporocila", () => {
  test("vsak t(\"…\") iz BookingPanel obstaja v planner.booking (SL in EN)", () => {
    const keys = [...panel.matchAll(/\bt\("([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(25);
    const missing: string[] = [];
    for (const k of keys) {
      if (!(k in slBooking)) missing.push(`sl:${k}`);
      if (!(k in enBooking)) missing.push(`en:${k}`);
    }
    expect(missing).toEqual([]);
  });

  test("vsak t(\"…\", {…}) interpoliran kljuc iz panela obstaja v obeh jezikih", () => {
    const keys = [
      ...panel.matchAll(/\bt\("([a-zA-Z]+)",\s*\{/g),
    ].map((m) => m[1]);
    expect(keys.sort()).toEqual(
      [
        "activitiesDesc",
        "activitiesEmpty",
        "carsDesc",
        "diningEmpty",
        "hotelsDesc",
        "hotelsEmpty",
        "insuranceDaysDesc",
        "pricePerPerson",
        "transferDesc",
      ].sort(),
    );
    for (const k of keys) {
      expect(slBooking[k]).toBeDefined();
      expect(enBooking[k]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// 5. AffiliateBadge (partner-badge.tsx) — badge na panelu je dvojezičen
// ---------------------------------------------------------------------------

describe("TASK 98: AffiliateBadge i18n (partner-badge.tsx)", () => {
  test("badgeShort + tooltip obstajata v obeh jezikih", () => {
    for (const aff of [slAff, enAff]) {
      expect(typeof aff.badgeShort).toBe("string");
      expect(aff.badgeShort.length).toBeGreaterThan(0);
      expect(typeof aff.tooltip).toBe("string");
      expect(aff.tooltip.length).toBeGreaterThan(20);
    }
  });

  test("EN tooltip je dejansko angleški (ne kopija SL)", () => {
    expect(enAff.tooltip).toContain("Affiliate link");
    expect(enAff.tooltip).not.toContain("Preusmerjeni");
    expect(enAff.tooltip).not.toBe(slAff.tooltip);
  });

  test("source-contract: useTranslations + prevajan tooltip + kratka oznaka", () => {
    expect(badge).toContain('useTranslations("affiliate")');
    expect(badge).toContain('title={t("tooltip")}');
    expect(badge).toContain('t("badgeShort")');
    // Veliki badge (md/lg) ostane ime partnerja (blagovna znamka)
    expect(badge).toContain("AFFILIATE_LABELS[type]");
    expect(badge).not.toMatch(/title="Partnerska povezava/);
    expect(badge).not.toContain('? "Partner" :');
  });
});

// ---------------------------------------------------------------------------
// 6. Utemeljitev površine — /nacrtuj živi tudi na /en (EN whitelist)
// ---------------------------------------------------------------------------

describe("TASK 98: EN površina načrtovalnika", () => {
  test("/nacrtuj je na EN whitelisti (routing.ts) — panel se dejansko vidi v EN", () => {
    expect(routing).toContain('"/nacrtuj"');
  });
});
