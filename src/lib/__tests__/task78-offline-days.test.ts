// ============================================================================
// TASK 78 (1.73.5) — offline.html: realni datumi dni + tipkarska popravka.
// 14 testov / 39 pričakovanj. SOURCE-CONTRACT pristop: testi izvlečejo
// SAMOZADOSTEN blok iz public/offline.html (izvorna, odposlana koda — ne
// kopija!) in ga izvedejo prek new Function; strukturne trditve (klicna
// mesta, CSS, tipka) pa preverjajo samo datoteko, ki se res odpošlje.
// ============================================================================
// Pokriva: validacijo ISO datumov (roll-over zavrnjen), koledarsko
// aritmetiko dneva N (DST-varna — ms seštevanje čez preklop na zimski čas
// bi pokazal napačen datum), genitivne slovenske oznake (ista tabela kot
// src/lib/trip-dates.ts), EN obliko, iskrene zavrnitve (brez starta → brez
// datuma, NIKOLI izmišljenega) in regresijo tipke "Vači"→"Vaši".
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const html = readFileSync("public/offline.html", "utf8");

// --- Izvleček samozadostnega TASK 78 bloka iz IZVIRNE datoteke -----------
const blockMatch =
  /\/\/ === TASK 78 \(1\.73\.5\): realni datumi dni =+\n([\s\S]*?)\/\/ === \/TASK 78 =+/.exec(
    html
  );

const api = new Function(`
  "use strict";
  ${blockMatch ? blockMatch[1] : ""}
  return { parseLocalDate: parseLocalDate, fmtDayLabel: fmtDayLabel, dayDateLabel: dayDateLabel };
`)();

describe("TASK 78 — source-contract: blok obstaja in se izvede", () => {
  test("① blok je izvlečljiv (datoteka brez njega ne gre skozi CI)", () => {
    expect(blockMatch).not.toBeNull();
    expect(blockMatch?.[1].length ?? 0).toBeGreaterThan(300);
  });

  test("② renderItinerary DEJANSKO klika testirano funkcijo (isti vir)", () => {
    expect(html).toContain("dayDateLabel(itin.tripStartDate, day.day, LANG)");
    // CSS razred + uporaba v oznaki dneva (muted datum ob "Dan N")
    expect((html.match(/day-date/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  test("③ tipka »Vači« je odstranjena; »Vaši« v statičnem bannerju IN i18n", () => {
    expect(html.includes("Vači")).toBe(false);
    expect((html.match(/Vaši shranjeni načrti/g) ?? []).length).toBe(2);
  });
});

describe("TASK 78 — parseLocalDate (validacija ISO, roll-over zavrnjen)", () => {
  test("① veljaven datum → koledarski deli {y, mo, d}", () => {
    expect(api.parseLocalDate("2026-09-21")).toEqual({ y: 2026, mo: 9, d: 21 });
    expect(api.parseLocalDate("2025-12-31")).toEqual({ y: 2025, mo: 12, d: 31 });
  });

  test("② fail-closed: roll-over, napačna oblika, ne- nizi → null", () => {
    expect(api.parseLocalDate("2026-02-31")).toBeNull(); // 31. februar
    expect(api.parseLocalDate("2026-13-01")).toBeNull(); // 13. mesec
    expect(api.parseLocalDate("2026-9-21")).toBeNull(); // ni 2-mestno
    expect(api.parseLocalDate("abc")).toBeNull();
    expect(api.parseLocalDate("")).toBeNull();
    expect(api.parseLocalDate(null)).toBeNull();
    expect(api.parseLocalDate(20260921)).toBeNull();
    expect(api.parseLocalDate(undefined)).toBeNull();
  });
});

describe("TASK 78 — dayDateLabel SL (genitiv, kot online planner)", () => {
  test("① dan 1 = start; dan 3 = start + 2 (2026-09-21 je ponedeljek)", () => {
    expect(api.dayDateLabel("2026-09-21", 1, "sl")).toBe(
      "ponedeljek, 21. septembra"
    );
    expect(api.dayDateLabel("2026-09-21", 3, "sl")).toBe("sreda, 23. septembra");
  });

  test("② preklop meseca in preklop leta", () => {
    expect(api.dayDateLabel("2026-09-30", 2, "sl")).toBe("četrtek, 1. oktobra");
    expect(api.dayDateLabel("2025-12-31", 2, "sl")).toBe("četrtek, 1. januarja");
  });

  test("③ DST-VARNOST: preklop na zimski čas (25 h dan, 2026-10-25)", () => {
    // ms aritmetika (start + N×24 h) bi tukaj vrnila NAPAČEN datum
    // (25-urni dan) — koledarska aritmetika mora ostati pravilna.
    expect(api.dayDateLabel("2026-10-25", 2, "sl")).toBe(
      "ponedeljek, 26. oktobra"
    );
    // start PRED preklopnim dnem: dan 4 = 27. okt. (torek) — ms seštevanje
    // bi čez noč 25→26 pokazalo 26. okt. namesto 27.
    expect(api.dayDateLabel("2026-10-24", 4, "sl")).toBe("torek, 27. oktobra");
  });

  test("④ DST preklop na poletni čas (23 h dan, 2026-03-29)", () => {
    expect(api.dayDateLabel("2026-03-29", 2, "sl")).toBe(
      "ponedeljek, 30. marca"
    );
  });
});

describe("TASK 78 — dayDateLabel EN (en-GB,olerantno na ločila ICU)", () => {
  test("① angleška oznaka vsebuje delavnika in datum", () => {
    const en = api.dayDateLabel("2026-09-21", 1, "en");
    expect(en).toContain("Monday");
    expect(en).toContain("21 September");
  });
});

describe("TASK 78 — iskrenost (brez izmišljenih datumov)", () => {
  test("① brez tripStartDate → PRAZNA oznaka (ne ugibamo)", () => {
    expect(api.dayDateLabel(undefined, 3, "sl")).toBe("");
    expect(api.dayDateLabel(null, 3, "sl")).toBe("");
    expect(api.dayDateLabel("", 3, "sl")).toBe("");
  });

  test("② neveljaven start (roll-over/oblika) → PRAZNA oznaka", () => {
    expect(api.dayDateLabel("2026-02-31", 1, "sl")).toBe("");
    expect(api.dayDateLabel("2026-13-01", 1, "sl")).toBe("");
    expect(api.dayDateLabel("nij-znan-datum", 2, "sl")).toBe("");
  });

  test("③ neveljaven dan (0, negativen, NaN, ne-št.) → PRAZNA oznaka", () => {
    expect(api.dayDateLabel("2026-09-21", 0, "sl")).toBe("");
    expect(api.dayDateLabel("2026-09-21", -2, "sl")).toBe("");
    expect(api.dayDateLabel("2026-09-21", Number.NaN, "sl")).toBe("");
    expect(api.dayDateLabel("2026-09-21", Number.POSITIVE_INFINITY, "sl")).toBe("");
    expect(api.dayDateLabel("2026-09-21", "3", "sl")).toBe("");
    expect(api.dayDateLabel("2026-09-21", null, "sl")).toBe("");
  });

  test("④ veljaven dan vrne NE-PRAZNO (nadzor proti preveč strogim)", () => {
    expect(api.dayDateLabel("2026-09-21", 2, "sl").length).toBeGreaterThan(5);
    expect(api.dayDateLabel("2026-09-21", 14, "sl")).toBe(
      "nedelja, 4. oktobra"
    );
  });
});
