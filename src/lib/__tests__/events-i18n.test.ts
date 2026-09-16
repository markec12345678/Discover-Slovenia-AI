import { describe, test, expect } from "bun:test";
import { EVENTS, formatEventDate } from "@/lib/events-data";
import { EVENTS_EN, EVENT_CATEGORY_LABELS_EN } from "@/lib/events-data-en";
import { matchEventsForItinerary } from "@/lib/events-match";

// ============================================================================
// 1.29.0 (uporabnikova revizija #13): EN dogodki — pariteta in preslikava.
//
// EVENTS_EN je prekrivna plast (Partial po id) → tukaj je REGRESIJSKI
// VAROVALKA: vsak nov dogodek v EVENTS mora priti z EN prevodom (ime +
// opis), sicer EN načrt tiho pade nazaj na slovenščino.
// ============================================================================

describe("EVENTS_EN pariteta (prekrivna plast)", () => {
  test("vsak od 30 dogodkov ima EN vnos z nepraznim imenom in opisom", () => {
    expect(EVENTS.length).toBe(30);
    for (const e of EVENTS) {
      const en = EVENTS_EN[e.id];
      expect(en, `EVENTS_EN manjka vnos za "${e.id}"`).toBeDefined();
      expect(en!.name.trim().length).toBeGreaterThan(0);
      expect(en!.description.trim().length).toBeGreaterThan(0);
    }
  });

  test("v EN slovarju ni tujih ID-jev (kateri koli vnos se dejansko uporabi)", () => {
    const ids = new Set(EVENTS.map((e) => e.id));
    for (const id of Object.keys(EVENTS_EN)) {
      expect(ids.has(id), `EVENTS_EN ima vnos za neobstoječi dogodek "${id}"`).toBe(true);
    }
  });

  test("EN opisi se razlikujejo od SL (resni prevodi, ne kopije)", () => {
    // IMENA so lahko identična (Lastnosti lastnih imen: "Ljubljana Festival",
    // "Piran Music Nights" …) — opisi pa so vedno resnični prevodi.
    for (const e of EVENTS) {
      const en = EVENTS_EN[e.id]!;
      expect(en.description).not.toBe(e.description);
    }
  });

  test("vseh 6 kategorij ima EN oznako", () => {
    const categories = new Set(EVENTS.map((e) => e.category));
    expect(categories.size).toBe(6);
    for (const c of categories) {
      expect(EVENT_CATEGORY_LABELS_EN[c]?.trim().length ?? 0).toBeGreaterThan(0);
    }
  });
});

describe("matchEventsForItinerary — jezikovna preslikava", () => {
  // Dan na Bledu → direktni zadetki vključujejo blejske dogodke
  const bledDays = [
    {
      day: 1,
      locations: [
        { destination_id: "bled", destination_name: "Bled" },
      ],
    },
  ];

  test("privzeto (brez lang) → slovensko ime in opis (nazaj kompatibilno)", () => {
    const events = matchEventsForItinerary(bledDays, 3);
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      const sl = EVENTS.find((e) => e.id === ev.id)!;
      expect(ev.name).toBe(sl.name);
      expect(ev.description).toBe(sl.description);
    }
  });

  test('lang="en" → prevedeno ime in opis iz EVENTS_EN', () => {
    const events = matchEventsForItinerary(bledDays, 3, null, "en");
    expect(events.length).toBeGreaterThan(0);
    for (const ev of events) {
      const en = EVENTS_EN[ev.id]!;
      expect(ev.name).toBe(en.name);
      expect(ev.description).toBe(en.description);
    }
  });

  test('lang="en" → identifikatorji/datumi/ključi ostanejo skupni (EN ne zlomi ujemanja)', () => {
    const sl = matchEventsForItinerary(bledDays, 6);
    const en = matchEventsForItinerary(bledDays, 6, null, "en");
    expect(en.map((e) => e.id)).toEqual(sl.map((e) => e.id));
    expect(en.map((e) => e.date)).toEqual(sl.map((e) => e.date));
    expect(en.map((e) => e.category)).toEqual(sl.map((e) => e.category));
    expect(en.map((e) => e.priceRange)).toEqual(sl.map((e) => e.priceRange));
  });
});

describe("formatEventDate — jezikovno odvisen format", () => {
  test("SL: pike po številkah dni + slovenski mesec", () => {
    expect(formatEventDate("2027-01-15")).toBe("15. jan 2027");
    expect(formatEventDate("2027-01-15", "2027-01-26")).toBe("15. – 26. jan 2027");
    expect(formatEventDate("2027-07-01", "2027-08-31")).toBe("1. jul – 31. avg 2027");
  });

  test("EN: brez pik + angleški mesec", () => {
    expect(formatEventDate("2027-01-15", undefined, "en")).toBe("15 Jan 2027");
    expect(formatEventDate("2027-01-15", "2027-01-26", "en")).toBe("15 – 26 Jan 2027");
    expect(formatEventDate("2027-07-01", "2027-08-31", "en")).toBe("1 Jul – 31 Aug 2027");
  });

  test("različni leti — oba jezika izpisujeta leti na obeh koncih", () => {
    expect(formatEventDate("2026-12-29", "2027-01-06")).toBe(
      "29. dec 2026 – 6. jan 2027"
    );
    expect(formatEventDate("2026-12-29", "2027-01-06", "en")).toBe(
      "29 Dec 2026 – 6 Jan 2027"
    );
  });
});
