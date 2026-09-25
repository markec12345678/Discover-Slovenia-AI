// ============================================================================
// ISSUE #6 / D6-B (M1+) — ROBNI PRIMERI: DETERMINISTIČNA PARSERJA REZERVACIJ
// ============================================================================
// Issue #6 izrecno zahteva robne primere za OBA deterministična parserja:
//  · besedilnega (lib/reservation-text-parse.ts — Issue #5 / T5-D / M1);
//  · ICS (lib/reservation-ics-parse.ts — Issue #6 / D6-B, NOV): .ics vsebina
//    prilepljena v zavihek Besedilo; rezerva rute jo razbere z VEVENT
//    parserjem PREJ generičnega besedilnega (specifično pred splošnim).
//
// Pokriti robni primeri (kot jih našteva Issue #6):
//  1. NASPROTNA datuma (konec pred začetkom) — parser NE validira vrstnega
//     reda: oba SUROVA niza sta prisotna (validacija je naloga uporabnika v
//     predogledu; needsConfirmation pravilo normalizatorja preverja samo
//     ponudnik + kdaj/številko, NE vrstni red);
//  2. časovni pas / DST prehod (20261025T020000Z vs brez Z) — SUROVA
//     prepustitev, NO izmišljene pretvorbe (niti TZID parameter se ne spoji);
//  3. več rezervacij v enem besedilu — PRVI/najmočnejši zadetek, deterministično
//     (ICS: prvi VEVENT s številčnim UID + countIcsEvents > 1 za iskrenost);
//  4. podvojena št. rezervacije — enojen rezultat, deterministično;
//  5. malformed ICS (BEGIN brez END, prelomljene vrstice, manjkajoči
//     DTSTART) — iskrene null vrednosti, NIKOLI izjema;
//  6. VEVENT brez števk v UID — koledar NI potrdilo → isReservationParseEmpty
//     → ruta odgovori iskren 422 (nasvet: ročni vnos);
//  7. source-contract rute: ICS zaznavanje PREJ generičnega besedilnega
//     parserja + IDENTIČNA odgovorna pogodba (method/via/…/persisted).
//
// TASK 76 higiena: datoteka dinamično uvaža route handler (@/app/api/…) →
// troši žetone deljenega omejevalnika runnerja → okno OBVEZNO čistimo
// (konvencija suite-a, varuje task76-suite-hygiene.test.ts).
// ============================================================================
import { afterAll, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
// TASK 76 higiena (glej zgornjo opombo) — uvoz + klic v beforeEach.
import { clearProviderRateLimits } from "@/lib/supply/search";
import {
  parseReservationText,
  isReservationParseEmpty,
} from "@/lib/reservation-text-parse";
import {
  parseIcsReservation,
  countIcsEvents,
  isIcsInput,
} from "@/lib/reservation-ics-parse";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const routeSrc = read("src/app/api/journey/bookings/parse/route.ts");

// ─────────────────────────────────────────────────────────────────────────
// 1. ICS parser — srečna pot + hevristika vhoda
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 D6-B: parseIcsReservation — srečna pot", () => {
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Test//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    "UID:408921371224@booking.com",
    "DTSTAMP:20260101T000000Z",
    "DTSTART:20260814T140000Z",
    "DTEND:20260816T100000Z",
    "SUMMARY:Booking.com \\, Hotel Park \\; Bled",
    "LOCATION:Hotel Slon\\, Ljubljana",
    "DESCRIPTION:Vodeni ogled z zajtrkom\\nKontakt: +386 1 234 5678\\nE-pošta: support@booking.com",
    "URL:https://www.booking.com/reservation/408921371224",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  test("polen VEVENT: vsa izrecna polja + unescape (\\, \\; \\n)", () => {
    const r = parseIcsReservation(ics);
    // SUMMARY → znamka (ISTI seznam PROVIDER_BRANDS kot besedilni parser)
    expect(r.providerName).toBe("Booking.com");
    // UID → št. rezervacije V CELIOTI (≥1 števka — iskrenostna disciplina)
    expect(r.reservationNumber).toBe("408921371224@booking.com");
    // DTSTART/DTEND → SUROVA niza (Z oblika ohrani Z)
    expect(r.startDateTime).toBe("20260814T140000Z");
    expect(r.endDateTime).toBe("20260816T100000Z");
    // LOCATION → unescape vejice
    expect(r.locationName).toBe("Hotel Slon, Ljubljana");
    // DESCRIPTION → stik (e-pošta je eksplicitna)
    expect(r.contact).toBe("support@booking.com");
    // URL → bookingUrl (izrecen http(s))
    expect(r.bookingUrl).toBe(
      "https://www.booking.com/reservation/408921371224"
    );
    // notes = DOBESEDEN citat prve vrstice opisa (ne sinteza)
    expect(r.notes).toBe("Vodeni ogled z zajtrkom");
    // ICS nima vira za ceno/gosta → null (ne izmišljujemo)
    expect(r.price).toBeNull();
    expect(r.currency).toBeNull();
    expect(r.guestName).toBeNull();
    expect(r.cancellationDeadline).toBeNull();
    // ponudnik + datum + številka → zanesljiv DRAFT-grade izhod
    expect(r.needsConfirmation).toBe(false);
    expect(isReservationParseEmpty(r)).toBe(false);
  });

  test("determinizem: enak vhod → enak izhod (2 klica, deep equal)", () => {
    expect(parseIcsReservation(ics)).toEqual(parseIcsReservation(ics));
  });

  test("označena telefonska številka v opisu (brez e-pošte) → contact", () => {
    const telIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:GYG-123456@getyourguide",
      "SUMMARY:GetYourGuide — vodeni ogled",
      "DESCRIPTION:Zbor na vhodu\\nKontakt: +386 1 555 1234",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const r = parseIcsReservation(telIcs);
    expect(r.providerName).toBe("GetYourGuide");
    expect(r.reservationNumber).toBe("GYG-123456@getyourguide");
    expect(r.contact).toBe("+386 1 555 1234");
    expect(r.bookingUrl).toBeNull(); // URL ni izrecen → null
  });

  test("X-BOOKING-URL ima prednost pred URL (bolj specifična lastnost)", () => {
    const urlIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1234567@viator",
      "SUMMARY:Viator tour",
      "URL:https://www.viator.com/tours/1234567",
      "X-BOOKING-URL:https://bookings.viator.com/1234567",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcsReservation(urlIcs).bookingUrl).toBe(
      "https://bookings.viator.com/1234567"
    );
  });

  test("URL, ki NI http(s) (mailto:…) → bookingUrl null (ne izmišljujemo)", () => {
    const mailIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1234567@viator",
      "SUMMARY:Viator tour",
      "URL:mailto:support@viator.com",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcsReservation(mailIcs).bookingUrl).toBeNull();
  });

  test("znamka v SUMMARY manjka → iskanje po opisu dogodka (isti seznam)", () => {
    const descBrandIcs = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:99887766@agoda",
      "SUMMARY:Hotel Park — 2 noči",
      "DESCRIPTION:Potrditev rezervacije Agoda. Št. 99887766.",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcsReservation(descBrandIcs).providerName).toBe("Agoda");
  });
});

describe("Issue #6 D6-B: isIcsInput / countIcsEvents — hevristika in iskrenost", () => {
  test("isIcsInput: BEGIN:VCALENDAR (case-insensitive, CRLF/LF)", () => {
    expect(isIcsInput("BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT")).toBe(true);
    expect(isIcsInput("begin:vcalendar\r\nversion:2.0")).toBe(true);
    // navadna e-pošta NI koledar (niti z besedo "reservation")
    expect(isIcsInput("Booking.com — Št. rezervacije: 408.921.371.224")).toBe(
      false
    );
    expect(isIcsInput("")).toBe(false);
    expect(isIcsInput("Lorem ipsum dolor sit amet.")).toBe(false);
  });

  test("countIcsEvents: 0 za ne-ICS / prazen koledar, N za N dogodkov", () => {
    expect(countIcsEvents("navadno besedilo")).toBe(0);
    expect(countIcsEvents("BEGIN:VCALENDAR\nEND:VCALENDAR")).toBe(0);
    expect(
      countIcsEvents(
        "BEGIN:VCALENDAR\nBEGIN:VEVENT\nEND:VEVENT\nBEGIN:VEVENT\nEND:VEVENT\nEND:VCALENDAR"
      )
    ).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. ROBNI PRIMER #1 — nasprotna datuma (konec pred začetkom)
//    Parser NE validira vrstnega reda: oba SUROVA niza sta prisotna.
//    (needsConfirmation pravilo v normalizatorju preverja GOSTOTO ključnih
//    polj — ponudnik + kdaj/številka — NE vrstni red datumov; vrstni red
//    uporabnik preveri v predogledu pred potrditvijo uvoza.)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: nasprotna datuma (konec pred začetkom)", () => {
  test("BESEDILO: prijava 14.07 > odjava 12.07 — oba surova niza", () => {
    const text = [
      "Booking.com — potrditev",
      "Št. rezervacije: 408.921.371.224",
      "Prijavitev: 14.07.2026",
      "Odjavitev: 12.07.2026",
    ].join("\n");
    const r = parseReservationText(text);
    // parser NE validira vrstnega reda — surovi vrednosti ostanejo:
    expect(r.startDateTime).toBe("14.07.2026");
    expect(r.endDateTime).toBe("12.07.2026");
    // ključna polja so gostota → needsConfirmation false (vrstni red NI
    // del pravila — to je naloga uporabnikovega pregleda v UI)
    expect(r.needsConfirmation).toBe(false);
  });

  test("ICS: DTSTART 16.08 > DTEND 14.08 — oba surova niza", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "SUMMARY:Booking.com",
      "DTSTART:20260816T100000Z",
      "DTEND:20260814T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const r = parseIcsReservation(ics);
    expect(r.startDateTime).toBe("20260816T100000Z");
    expect(r.endDateTime).toBe("20260814T090000Z");
    expect(r.needsConfirmation).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. ROBNI PRIMER #2 — časovni pas / DST prehod: SUROVA prepustitev
//    (25. 10. 2025/2026 02:00 je prehod iz ZOČ na ZSZ — klasična past za
//    parserje, ki "pomagajo" s pretvorbo. MI NE PRETVARJAMO.)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: časovni pas / DST meja — surova prepustitev", () => {
  const boundaryIcs = (dt: string) =>
    [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:777001@kiwitaxi",
      "SUMMARY:KiwiTaxi transfer",
      `DTSTART:${dt}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

  test("Z oblika (UTC): 20261025T020000Z ostane DOBESEDNO", () => {
    const r = parseIcsReservation(boundaryIcs("20261025T020000Z"));
    expect(r.startDateTime).toBe("20261025T020000Z");
    // NO izmišljene pretvorbe (niti pripon "+02:00" niti ISO oblika):
    expect(r.startDateTime).not.toContain("+");
    expect(r.startDateTime).not.toContain("-");
  });

  test("ne-Z (lokalna) oblika: 20261025T020000 ostane brez Z", () => {
    const r = parseIcsReservation(boundaryIcs("20261025T020000"));
    expect(r.startDateTime).toBe("20261025T020000");
    // razlika ZGEDAJ samo v priponi Z — nobenemu ni dodan/odvzet pas:
    const z = parseIcsReservation(boundaryIcs("20261025T020000Z"));
    expect(z.startDateTime).toBe(`${r.startDateTime}Z`);
  });

  test("TZID parameter se NE spoji z vrednostjo (pas NE pretvorimo)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:777001@kiwitaxi",
      "SUMMARY:KiwiTaxi transfer",
      "DTSTART;TZID=Europe/Ljubljana:20261025T020000",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    // surova VREDNOST (brez parametra) — spojiti pas bi bilo ugibanje:
    expect(parseIcsReservation(ics).startDateTime).toBe("20261025T020000");
  });

  test("BESEDILO: ISO zapis z časom ostane surov (brez izmišljenega pasu)", () => {
    const r = parseReservationText(
      "Departure: 2026-10-25 02:00\nBooking reference: XK7L2P"
    );
    expect(r.startDateTime).toBe("2026-10-25 02:00");
    expect(r.reservationNumber).toBe("XK7L2P");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. ROBNI PRIMER #3 — več rezervacij v enem besedilu
//    (določenost: PRVI/najmočnejši zadetek; ICS: prvi VEVENT s številčnim
//    UID + countIcsEvents > 1 razkrije, da jih je več)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: več rezervacij v enem besedilu", () => {
  test("BESEDILO: dve potrditvi → PRVI/najmočnejši zadetek, deterministično", () => {
    const text = [
      "Vaša rezervacija pri Booking.com je potrjena.",
      "Št. rezervacije: 408.921.371.224",
      "Prijavitev: 12.07.2026",
      "Skupaj: 1.250,00 EUR",
      "--- posredovano sporočilo ---",
      "Agoda — booking confirmed",
      "Confirmation number: 90123456",
      "Check-in: July 12, 2026",
      "Total: £89",
    ].join("\n");
    const r = parseReservationText(text);
    // znamka po PRIORITETI seznama (Booking.com pred Agodo) + številka po
    // PRVI pojavitvi v besedilu — vedno isti rezultat:
    expect(r.providerName).toBe("Booking.com");
    expect(r.reservationNumber).toBe("408.921.371.224");
    expect(r.startDateTime).toBe("12.07.2026");
    expect(r.price).toBe(1250);
    // determinizem (Issue #6: "deterministically"):
    expect(parseReservationText(text)).toEqual(parseReservationText(text));
  });

  test("ICS: prvi VEVENT s številčnim UID + countIcsEvents > 1", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      // prvi dogodek BREZ števk v UID → NI kandidat (koledarski dogodek)
      "BEGIN:VEVENT",
      "UID:team-meeting@calendar-x",
      "SUMMARY:Team meeting",
      "DTSTART:20260801T100000Z",
      "END:VEVENT",
      // drugi dogodek S števkami → PRVI kandidat → izbran
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "SUMMARY:Booking.com — Hotel Park",
      "DTSTART:20260814T140000Z",
      "END:VEVENT",
      // tretji kandidat → ignoriran (samo prvi se prebere)
      "BEGIN:VEVENT",
      "UID:90123456@agoda",
      "SUMMARY:Agoda confirmation",
      "DTSTART:20260820T090000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const count = countIcsEvents(ics);
    expect(count).toBe(3); // iskrenost: več dogodkov je razkrito
    const r = parseIcsReservation(ics);
    expect(r.providerName).toBe("Booking.com");
    expect(r.reservationNumber).toBe("408921371224@booking.com");
    expect(r.startDateTime).toBe("20260814T140000Z");
    // determinizem tudi pri izbiri med več kandidati:
    expect(parseIcsReservation(ics)).toEqual(parseIcsReservation(ics));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 5. ROBNI PRIMER #4 — podvojena št. rezervacije (en rezultat, deterministično)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: podvojena št. rezervacije", () => {
  test("BESEDILO: isti št. rezervacije dvakrat → enojen rezultat", () => {
    const text = [
      "Wizz Air — booking confirmed",
      "Booking reference: XK7L2P",
      "Departure: 12.07.2026, 14:30",
      "Ponovitev potrdila: Booking reference XK7L2P (dvojni klik)",
    ].join("\n");
    const r = parseReservationText(text);
    expect(r.reservationNumber).toBe("XK7L2P");
    expect(r.providerName).toBe("Wizz Air");
    expect(parseReservationText(text)).toEqual(parseReservationText(text));
  });

  test("ICS: dva VEVENTa z ISTIM UID → enojen rezultat (prvi dogodek)", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "SUMMARY:Booking.com — Hotel Park",
      "DTSTART:20260814T140000Z",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "SUMMARY:Booking.com — Hotel Park (sinhronizacija)",
      "DTSTART:20260814T140000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(countIcsEvents(ics)).toBe(2);
    const r = parseIcsReservation(ics);
    expect(r.reservationNumber).toBe("408921371224@booking.com");
    expect(r.startDateTime).toBe("20260814T140000Z");
    expect(parseIcsReservation(ics)).toEqual(parseIcsReservation(ics));
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 6. ROBNI PRIMER #5 — malformed ICS: null vrednosti, NIKOLI izjema
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: malformed ICS (ne sesuje se)", () => {
  test("BEGIN:VEVENT brez END (odrezana datoteka) — polja se vseeno preberejo", () => {
    const truncated = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:12345@viator",
      "SUMMARY:Viator tour",
      "DTSTART:20260814T090000Z",
      // END:VEVENT / END:VCALENDAR MANJKATA
    ].join("\n");
    expect(() => parseIcsReservation(truncated)).not.toThrow();
    const r = parseIcsReservation(truncated);
    expect(r.providerName).toBe("Viator");
    expect(r.reservationNumber).toBe("12345@viator");
    expect(r.startDateTime).toBe("20260814T090000Z");
    expect(countIcsEvents(truncated)).toBe(1);
  });

  test("prelomljene vrstice (RFC 5545 folding) — vrednost se ZDRUŽI", () => {
    const folded = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:GYG-123456@getyourguide",
      "SUMMARY:GetYourGuide — vodeni ogled",
      "LOCATION:Hotel Slon\\, Ljubljana\\, Slove",
      " nija", // nadaljevalna vrstica (presledek po CRLF)
      "DTSTART:20261025",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const r = parseIcsReservation(folded);
    expect(r.locationName).toBe("Hotel Slon, Ljubljana, Slovenija");
    expect(r.startDateTime).toBe("20261025"); // DATE oblika (brez časa)
    expect(r.reservationNumber).toBe("GYG-123456@getyourguide");
  });

  test("manjkajoči DTSTART → startDateTime null (ostalo se prebere)", () => {
    const noDt = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:99887766@agoda",
      "SUMMARY:Agoda confirmation",
      "LOCATION:Hotel Park, Bled",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(() => parseIcsReservation(noDt)).not.toThrow();
    const r = parseIcsReservation(noDt);
    expect(r.startDateTime).toBeNull();
    expect(r.endDateTime).toBeNull();
    expect(r.reservationNumber).toBe("99887766@agoda");
    expect(r.providerName).toBe("Agoda");
    expect(r.locationName).toBe("Hotel Park, Bled");
  });

  test("neveljavna vrednost DTSTART (ne-ICS zapis) → null, ne izjema", () => {
    const bad = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:1234567@expedia",
      "SUMMARY:Expedia stay",
      "DTSTART:jutri zjutraj",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const r = parseIcsReservation(bad);
    expect(r.startDateTime).toBeNull();
    expect(r.reservationNumber).toBe("1234567@expedia");
  });

  test("prazen / ne-ICS vhod → prazna ekstrakcija (brez izjeme)", () => {
    expect(() => parseIcsReservation("")).not.toThrow();
    expect(isReservationParseEmpty(parseIcsReservation(""))).toBe(true);
    expect(
      isReservationParseEmpty(parseIcsReservation("navadno besedilo"))
    ).toBe(true);
    expect(
      isReservationParseEmpty(parseIcsReservation("BEGIN:VCALENDAR\nEND:VCALENDAR"))
    ).toBe(true); // koledar brez dogodkov → nič
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 7. ROBNI PRIMER #6 — VEVENT brez števk v UID → PRAZNA ekstrakcija → 422
//    (koledarski izvoz brez številke rezervacije NI potrdilo — sicer bi
//     redna srečanja/rojstni dnevi postali "rezervacije" z datumom)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 robni: VEVENT brez števk v UID (ni rezervacija)", () => {
  const noDigitIcs = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "BEGIN:VEVENT",
    "UID:team-meeting@calendar-x",
    "SUMMARY:Team meeting",
    "DTSTART:20260801T100000Z",
    "LOCATION:Pisarna",
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\n");

  test("isReservationParseEmpty === true (vsa ključna polja null)", () => {
    const r = parseIcsReservation(noDigitIcs);
    // STROGA DISCIPLINA: tudi čeprav ima dogodek datum/lokacijo, brez
    // številke rezervacije to ni potrdilo → PRAZNA ekstrakcija:
    expect(r.providerName).toBeNull();
    expect(r.reservationNumber).toBeNull();
    expect(r.startDateTime).toBeNull();
    expect(isReservationParseEmpty(r)).toBe(true);
    // (funkcionalni dokaz, da ruta res odgovori 422, je spodaj v razdelku 9
    //  — z ODBITOJO vseh AI klicev, da je test determinističen brez ključev)
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 8. Source-contract rute — ICS PREJ generičnim + IDENTIČNA pogodba
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 D6-B: source-contract /api/journey/bookings/parse", () => {
  test("ICS zaznavanje se zgodi PREJ generičnemu besedilnemu parserju", () => {
    // uvoz ICS parserja + hevristike:
    expect(routeSrc).toContain("reservation-ics-parse");
    expect(routeSrc).toContain("isIcsInput");
    expect(routeSrc).toContain("parseIcsReservation");
    // klicna mesta ZNOTRAJ deterministicParseResponse (ne drugje):
    const fnIdx = routeSrc.indexOf("function deterministicParseResponse");
    const icsProbeIdx = routeSrc.indexOf("isIcsInput(text)");
    const icsCallIdx = routeSrc.indexOf("parseIcsReservation(text)");
    const textCallIdx = routeSrc.indexOf("parseReservationText(text)");
    expect(fnIdx).toBeGreaterThanOrEqual(0);
    expect(icsProbeIdx).toBeGreaterThan(fnIdx);
    expect(icsCallIdx).toBeGreaterThan(fnIdx);
    expect(textCallIdx).toBeGreaterThan(fnIdx);
    // SPECIFIČNO PREJ SPLOŠNIM (vrstni red v isti funkciji):
    expect(icsProbeIdx).toBeLessThan(icsCallIdx);
    expect(icsCallIdx).toBeLessThan(textCallIdx);
    // generični parser je ŠE VEDNO rezerva za navadno besedilo:
    expect(routeSrc).toContain("parseReservationText");
  });

  test("odgovorna pogodba je IDENTIČNA (method/via/fields/persisted)", () => {
    expect(routeSrc).toContain('method: "deterministic"');
    expect(routeSrc).toContain('via: "fallback"');
    expect(routeSrc).toContain("persisted: false");
    expect(routeSrc).toContain("needsConfirmation: fields.needsConfirmation");
    // obe obstoječi poti rezerve (PDF + besedilo) ohranjeni:
    expect(routeSrc).toContain("return deterministicParseResponse(pdfText)");
    expect(routeSrc).toContain("return deterministicParseResponse(text)");
    // iskren 422 za ne-prepoznavo ostaja:
    expect(routeSrc).toContain("isReservationParseEmpty");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 9. Funkcionalno — odpoved VSEH AI providerjev → ICS rezerva ODGOVORI
//    (plain-text .ics skozi TEXT kanal; 0 AI žetonov; isti vzorec kot
//     issue5-t5d: globalThis.fetch odbija, NO mock.module)
// ─────────────────────────────────────────────────────────────────────────

describe("Issue #6 D6-B: funkcionalno — odpoved vseh AI providerjev (ICS)", () => {
  const originalFetch = globalThis.fetch;
  let seq = 0;

  beforeEach(() => {
    seq += 1;
    // TASK 76 higiena: dinamični uvoz route handlerja troši žetone
    // deljenega omejevalnika runnerja → okno OBVEZNO počistimo.
    clearProviderRateLimits();
    // VSI omrežni klici odbijejo → generateCompletion vrne null → REZERVA
    // → znotraj nje ICS zaznavanje → parseIcsReservation.
    globalThis.fetch = (async () => {
      throw new Error(`test-offline-ics-${seq}`);
    }) as unknown as typeof fetch;
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  test("ICS besedilo: 200 + method deterministic + via fallback (0 AI)", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:408921371224@booking.com",
      "DTSTART:20260814T140000Z",
      "DTEND:20260816T100000Z",
      "SUMMARY:Booking.com \\, Hotel Park",
      "LOCATION:Hotel Slon\\, Ljubljana",
      "URL:https://www.booking.com/reservation/408921371224",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request("http://localhost/api/journey/bookings/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // unikatni IP — rate limit (6/min) med testi nikoli ne pade
        "x-forwarded-for": `10.99.91.${seq}`,
      },
      body: JSON.stringify({ text: ics }),
    });
    const res = await POST(request);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      method: string;
      via: string;
      persisted: boolean;
      providerSlug: string;
      fields: {
        providerName: string | null;
        reservationNumber: string | null;
        startDateTime: string | null;
        endDateTime: string | null;
        locationName: string | null;
        bookingUrl?: string | null;
      };
    };
    expect(body.method).toBe("deterministic");
    expect(body.via).toBe("fallback");
    expect(body.persisted).toBe(false);
    expect(body.providerSlug).toBe("booking");
    expect(body.fields.providerName).toBe("Booking.com");
    expect(body.fields.reservationNumber).toBe("408921371224@booking.com");
    expect(body.fields.startDateTime).toBe("20260814T140000Z");
    expect(body.fields.endDateTime).toBe("20260816T100000Z");
    expect(body.fields.locationName).toBe("Hotel Slon, Ljubljana");
    expect(body.fields.bookingUrl).toBe(
      "https://www.booking.com/reservation/408921371224"
    );
  }, 30_000);

  test("ICS brez števk v UID: iskren 422 z nasvetom (ročni vnos)", async () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "UID:moj-rojstni-dan@calendar",
      "SUMMARY:Birthday party",
      "DTSTART:20260801T180000Z",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");

    const { POST } = await import("@/app/api/journey/bookings/parse/route");
    const request = new Request("http://localhost/api/journey/bookings/parse", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `10.99.92.${seq}`,
      },
      body: JSON.stringify({ text: ics }),
    });
    const res = await POST(request);
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("ročno");
  }, 30_000);
});
