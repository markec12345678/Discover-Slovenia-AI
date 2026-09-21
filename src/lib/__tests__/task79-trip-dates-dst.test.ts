// ============================================================================
// TASK 79 (1.74.1) — trip-dates.ts: DST-varna koledarska aritmetika dni.
// ============================================================================
// REPRODUCIRANA NAPAKA: dayISOForDayNumber/tripEndDateISO/tripWindowMs so
// uporabljali ms seštevanje (start + N×24 h). V DST pasu uporabnikov
// (Europe/Ljubljana — client komponente tečejo v brskalnikovem pasu!) ms
// pot čez preklop na zimski čas (25-urni dan) pristane na 23:00 PREDHOD-
// NJEGA koledarskega dne → PODVOJEN datum dneva (dan 2 in dan 3 bi kazala
// isti datum; od tod napačni dnevi v tednu za geo-validacijo zaprtij in
// matching dodanih dogodkov po dneh).
//
// PRISTOP: celoten file teče s process.env.TZ = "Europe/Ljubljana" (Bun
// podpira dinamično nastavitev; vrnitev na "" NE razveljavi — zato
// eksplicitna vrnitev na "UTC", sistemski pas sandboxa/CI). Sentinel
// predtest ⓪ DOKAZUJE, da pas dejansko velja — v UTC bi namreč stara
// (buggy) koda šla skozi iste trditve, testi pa ne bi dokazovali nič.
//
// CROSS-CONTRACT: offline.html TASK 78 blok (referenčna DST-varna
// implementacija) se izvede V ISTEM PROCESU/PASU in se primerja z online
// izhodom — online in offline prikaz MORATA kazati isti datum dneva.
// ============================================================================

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  dayISOForDayNumber,
  tripEndDateISO,
  tripWindowMs,
  isValidStartDate,
  formatDayLabelSI,
  parseISODateLocal,
} from "../trip-dates";

// --- Pas: cel file pod Europe/Ljubljana, po file-u vrnitev na sistemski --
beforeAll(() => {
  process.env.TZ = "Europe/Ljubljana";
});
afterAll(() => {
  // Bun si prvi nastavljeni TZ zapomni; vrnitev na "" ne razveljavi.
  // Sistemski pas sandboxa/CI je UTC → eksplicitna vrnitev nanj.
  process.env.TZ = "UTC";
});

// --- Izvleček offline referenčnega bloka (ISTA datoteka, ki se odpošlje) --
const html = readFileSync("public/offline.html", "utf8");
const blockMatch =
  /\/\/ === TASK 78 \(1\.73\.5\): realni datumi dni =+\n([\s\S]*?)\/\/ === \/TASK 78 =+/.exec(
    html
  );
const offlineApi = new Function(`
  "use strict";
  ${blockMatch ? blockMatch[1] : ""}
  return { dayDateLabel: dayDateLabel };
`)();

/** Date → ISO (lokalni koledarski dan) — pomoč za dinamične "danes" dneve. */
function isoOf(dt: Date): string {
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
}

describe("TASK 79 — predpogoj pasu (sentinel)", () => {
  test("⓪ file DEJANSKO teče v Europe/Ljubljana (sicer ti testi ne dokazujejo nič)", () => {
    // 24. 10. 2026 00:00 local = +02:00 (poletni čas, pred preklopom)
    expect(new Date(2026, 9, 24).getTime()).toBe(
      Date.parse("2026-10-23T22:00:00Z")
    );
    // 26. 10. 2026 00:00 local = +01:00 (zimski čas, po preklopu 25. 10.)
    expect(new Date(2026, 9, 26).getTime()).toBe(
      Date.parse("2026-10-25T23:00:00Z")
    );
  });
});

describe("TASK 79 — preklop na ZIMSKI čas (25-urni dan, nedelja 2026-10-25)", () => {
  test("① REPRODUKCIJA: start 2026-10-24 → dan 3 je 26. (ms pot bi podvojila 25.)", () => {
    expect(dayISOForDayNumber("2026-10-24", 1)).toBe("2026-10-24");
    expect(dayISOForDayNumber("2026-10-24", 2)).toBe("2026-10-25");
    // ms aritmetika bi tukaj vrnila "2026-10-25" (23:00 predhodnega dne)
    expect(dayISOForDayNumber("2026-10-24", 3)).toBe("2026-10-26");
    expect(dayISOForDayNumber("2026-10-24", 4)).toBe("2026-10-27");
  });

  test("② start NA preklopnem dnevu (2026-10-25) → dan 2 je 26.", () => {
    expect(dayISOForDayNumber("2026-10-25", 1)).toBe("2026-10-25");
    // ms aritmetika: 25. 10. 00:00 (+02) + 24 h = 25. 10. 23:00 (+01) → podvojen
    expect(dayISOForDayNumber("2026-10-25", 2)).toBe("2026-10-26");
  });

  test("③ lastnost: 10-dnevna pot od 2026-10-20 ima 10 RAZLIČNIH, naraščajočih datumov", () => {
    const isos = Array.from({ length: 10 }, (_, i) =>
      dayISOForDayNumber("2026-10-20", i + 1)
    );
    expect(new Set(isos).size).toBe(10); // 0 podvojitev čez preklop
    for (let i = 1; i < isos.length; i++) {
      expect(isos[i]! > isos[i - 1]!).toBe(true);
    }
    expect(isos[9]).toBe("2026-10-29");
  });

  test("④ tripEndDateISO čez preklop: (2026-10-24, 4 dni) → 2026-10-27", () => {
    // ms aritmetika bi vrnila "2026-10-26"
    expect(tripEndDateISO("2026-10-24", 4)).toBe("2026-10-27");
  });

  test("⑤ tripWindowMs: endMs = lokalna polnoč ZADNJEGA koledarskega dne", () => {
    const w = tripWindowMs("2026-10-24", 4);
    expect(w).not.toBeNull();
    expect(w!.startMs).toBe(new Date(2026, 9, 24).getTime());
    expect(w!.endMs).toBe(new Date(2026, 9, 27).getTime());
    // dogodki na zadnjem dnevu (27. 10. 00:00 local) morajo pasti V okvir
    expect(w!.endMs).toBeGreaterThanOrEqual(
      parseISODateLocal("2026-10-27") ?? Number.NEGATIVE_INFINITY
    );
  });

  test("⑥ oznaka dneva (end-to-end): dan 3 = ponedeljek, 26. oktobra", () => {
    // ms pot bi za dan 3 pokazala "nedelja, 25. oktobra" — podvojena oznaka
    expect(formatDayLabelSI(dayISOForDayNumber("2026-10-24", 3)!)).toBe(
      "ponedeljek, 26. oktobra"
    );
    expect(formatDayLabelSI(dayISOForDayNumber("2026-10-24", 2)!)).toBe(
      "nedelja, 25. oktobra"
    );
    expect(formatDayLabelSI(dayISOForDayNumber("2026-10-24", 4)!)).toBe(
      "torek, 27. oktobra"
    );
  });
});

describe("TASK 79 — preklop na POLETNI čas (23-urni dan, nedelja 2026-03-29)", () => {
  test("⑦ datumi ostanejo pravilni tudi čez pomladanski preklop", () => {
    expect(dayISOForDayNumber("2026-03-29", 2)).toBe("2026-03-30");
    expect(dayISOForDayNumber("2026-03-28", 3)).toBe("2026-03-30");
    expect(formatDayLabelSI(dayISOForDayNumber("2026-03-29", 2)!)).toBe(
      "ponedeljek, 30. marca"
    );
  });
});

describe("TASK 79 — cross-contract: online === offline (ISTA pas, ISTI proces)", () => {
  test("⑧ offline TASK 78 blok kaže ISTE datume kot online trip-dates", () => {
    expect(blockMatch).not.toBeNull(); // offline blok je še vedno na mestu
    const cases: Array<[string, number]> = [
      ["2026-10-25", 2], // start na preklopnem dnevu
      ["2026-10-24", 4], // preklop znotraj poti
      ["2026-03-29", 2], // pomladanski preklop
    ];
    for (const [start, day] of cases) {
      const online = formatDayLabelSI(dayISOForDayNumber(start, day)!);
      const offline = offlineApi.dayDateLabel(start, day, "sl");
      expect(offline).toBe(online);
    }
    // konkretno (ms pot bi podvojila 25. oktober):
    expect(offlineApi.dayDateLabel("2026-10-25", 2, "sl")).toBe(
      "ponedeljek, 26. oktobra"
    );
  });
});

describe("TASK 79 — fail-closed tudi pod DST", () => {
  test("⑨ neveljaven start/dan → null (NIKOLI izmišljenega datuma)", () => {
    // start: roll-over, oblika, ne-niz
    expect(dayISOForDayNumber("2026-02-31", 1)).toBeNull();
    expect(dayISOForDayNumber("2026-13-01", 1)).toBeNull();
    expect(dayISOForDayNumber("2026-9-21", 1)).toBeNull();
    expect(dayISOForDayNumber("ni-datum", 2)).toBeNull();
    expect(dayISOForDayNumber("", 2)).toBeNull();
    // dan: 0, negativen, NaN, ±Infinity, ne-št.
    expect(dayISOForDayNumber("2026-10-24", 0)).toBeNull();
    expect(dayISOForDayNumber("2026-10-24", -1)).toBeNull();
    expect(dayISOForDayNumber("2026-10-24", Number.NaN)).toBeNull();
    expect(dayISOForDayNumber("2026-10-24", Number.POSITIVE_INFINITY)).toBeNull();
    // ne-tipni vhodi (namerno — preverjamo zavrnitev ob IZVAJANJU):
    expect(dayISOForDayNumber("2026-10-24", "3" as unknown as number)).toBeNull();
    expect(dayISOForDayNumber("2026-10-24", null as unknown as number)).toBeNull();
    // absurdno velik dan → Invalid Date varovalka → null (ne "NaN-NaN-NaN")
    expect(dayISOForDayNumber("2026-10-24", 1e15)).toBeNull();
    expect(tripWindowMs("2026-10-24", 1e15)).toBeNull();
  });
});

describe("TASK 79 — regresije (veljajo v vsakem pasu; tu pod Ljubljano = strožje)", () => {
  test("⑩ osnova: dan 1 = start; preklop meseca in leta", () => {
    expect(dayISOForDayNumber("2026-09-21", 1)).toBe("2026-09-21");
    expect(dayISOForDayNumber("2026-09-30", 2)).toBe("2026-10-01");
    expect(dayISOForDayNumber("2026-09-30", 3)).toBe("2026-10-02");
    expect(dayISOForDayNumber("2025-12-31", 2)).toBe("2026-01-01");
    expect(parseISODateLocal("2026-10-25")).toBe(
      new Date(2026, 9, 25).getTime()
    );
  });

  test("⑪ enodnevna pot: konec = start; okvir startMs === endMs", () => {
    expect(tripEndDateISO("2026-10-24", 1)).toBe("2026-10-24");
    const w = tripWindowMs("2026-10-24", 1);
    expect(w).not.toBeNull();
    expect(w!.startMs).toBe(w!.endMs);
  });

  test("⑫ isValidStartDate: danes ✓, včeraj ✗, +400 ✓ (meja), +401 ✗, roll-over ✗", () => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    expect(isValidStartDate(isoOf(today))).toBe(true);
    expect(
      isValidStartDate(isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)))
    ).toBe(false);
    expect(
      isValidStartDate(isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 400)))
    ).toBe(true);
    expect(
      isValidStartDate(isoOf(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 401)))
    ).toBe(false);
    expect(isValidStartDate("2026-02-31")).toBe(false);
    expect(isValidStartDate(20260921)).toBe(false);
  });
});
