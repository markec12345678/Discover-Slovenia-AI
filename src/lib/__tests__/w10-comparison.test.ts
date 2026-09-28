// W10 (Issue #15, 1.133.0): ČASOVNO OKNO »MINDTRIP ALTERNATIVA« — regresijska
// varovalka za /primerjava (OPP-1 stran, W10 okrepitev).
//
// Pokriva (verifikacijska merila iz issue #15):
//  1. PARITETA 4 JEZIKOV: terenska sekcija (fieldBadge/fieldTitle/fieldIntro/
//     field.{mindtrip,layla,google}{Title,Desc}/fieldNote), novi FAQ q6/a6 in
//     CTA gumbi (ctaMap/ctaCommunity) so neprazni v SL/EN/IT/DE (task71
//     varuje strukturo ploščih ključev — tu varujemo NEPRAZNOST vsebine).
//  2. FAQ INTEGRITETA: q1–q6 + a1–a6 vsi neprazni (stran izrisuje 1..6).
//  3. G4 KANON (iskreni števci):
//     a) faq.a5 NE trdi več, da je »iOS aplikacija na voljo« (trditev, ki je
//        nismo preverili — odstranjena v W10); vsebuje datum preverbe 2026;
//     b) terenska sekcija vsebuje DATUM (28. 9. 2026) in preverjeno dejstvo
//        (»Under Construction«) ter NOC izmišljenih števcev (brez %/★/M+).
//  4. META/SEO: naslov v vsakem jeziku cilja poizvedbo »Mindtrip
//     alternativa/alternative/alternativa« (merilo 2).
//  5. ZLATE POTI: stran linka na /nacrtuj + /zemljevid + /nacrtuj#skupnost
//     (merilo 3 — skupnostna galerija na načrtovalniku je živi /pot kanal:
//     kartice vodijo v /pot/[shareId]; preverjeno v produkciji 1.132.0).
//  6. SVEŽINA: »updated« nosi datum preverbe (28 + 2026) v vseh jezikih
//     (merilo 4 — teren se premika, iskrenost zahteva datum).
//  7. W1 DOSLEDNOST: tabela + CTA govorita o 4 jezikih (stran je nastala
//     pred W1 — W10 odprav zastarel »slovenščina ali angleščina«).
//  8. AVTORIZACIJA: fragments/comparison.{sl,en}.json == ista ns v
//     messages/{sl,en}.json (merge kanon).

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";
import itMessages from "@/i18n/messages/it.json";
import deMessages from "@/i18n/messages/de.json";
import slFragment from "@/i18n/fragments/comparison.sl.json";
import enFragment from "@/i18n/fragments/comparison.en.json";

type Dict = Record<string, string>;

const LOCALES: { code: string; msg: Dict; altWord: string; lang4: string }[] = [
  {
    code: "sl",
    msg: slMessages.comparison as unknown as Dict,
    altWord: "alternativa",
    lang4: "italijanščina",
  },
  {
    code: "en",
    msg: enMessages.comparison as unknown as Dict,
    altWord: "alternative",
    lang4: "Italian",
  },
  {
    code: "it",
    msg: itMessages.comparison as unknown as Dict,
    altWord: "alternativa",
    lang4: "italiano",
  },
  {
    code: "de",
    msg: deMessages.comparison as unknown as Dict,
    altWord: "alternative",
    lang4: "Italienisch",
  },
];

const PAGE_SRC = readFileSync(
  new URL("../../app/primerjava/page.tsx", import.meta.url),
  "utf-8",
);

/** Plošča razširitev gnezdenih slovarjev v "ns.kljuc" → vrednost. */
function flat(obj: unknown, prefix = ""): Dict {
  const out: Dict = {};
  if (typeof obj !== "object" || obj === null) return out;
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null) {
      Object.assign(out, flat(value, path));
    } else {
      out[path] = String(value);
    }
  }
  return out;
}

describe("W10 — /primerjava (Mindtrip alternativa okno)", () => {
  test("1. terenska sekcija + novi ključi so neprazni v 4 jezikih", () => {
    const newKeys = [
      "fieldBadge",
      "fieldTitle",
      "fieldIntro",
      "field.mindtripTitle",
      "field.mindtripDesc",
      "field.laylaTitle",
      "field.laylaDesc",
      "field.googleTitle",
      "field.googleDesc",
      "fieldNote",
      "faq.q6",
      "faq.a6",
      "ctaMap",
      "ctaCommunity",
    ];
    for (const { code, msg } of LOCALES) {
      const f = flat(msg);
      for (const key of newKeys) {
        expect(f[key], `[${code}] ${key} manjka ali prazen`).toBeTruthy();
        expect(f[key].length, `[${code}] ${key} sumljivo kratek`).toBeGreaterThan(8);
      }
    }
  });

  test("2. FAQ q1–q6 + a1–a6 vsi neprazni (stran izrisuje 1..6)", () => {
    for (const { code, msg } of LOCALES) {
      const f = flat(msg);
      for (let i = 1; i <= 6; i++) {
        expect(f[`faq.q${i}`], `[${code}] faq.q${i}`).toBeTruthy();
        expect(f[`faq.a${i}`], `[${code}] faq.a${i}`).toBeTruthy();
        expect(f[`faq.a${i}`].length, `[${code}] faq.a${i} sumljivo kratek`).toBeGreaterThan(40);
      }
    }
  });

  test("3a. G4: faq.a5 brez nepreverjene iOS trditve, z datumom preverbe", () => {
    for (const { code, msg } of LOCALES) {
      const f = flat(msg);
      expect(f["faq.a5"].toLowerCase(), `[${code}] iOS trditev mora biti odstranjena`).not.toContain("ios");
      expect(f["faq.a5"], `[${code}] a5 mora nositi leto preverbe`).toContain("2026");
    }
  });

  test("3b. G4: terenska sekcija — datum + preverjeno dejstvo, brez izmišljenih števcev", () => {
    for (const { code, msg } of LOCALES) {
      const f = flat(msg);
      // Datum preverbe (28. september 2026 v ustrezni lokalizaciji)
      expect(f["field.mindtripDesc"], `[${code}] mindtripDesc potrebuje dan 28`).toContain("28");
      expect(f["field.mindtripDesc"], `[${code}] mindtripDesc potrebuje leto 2026`).toContain("2026");
      // Preverjeno dejstvo (naslov strani, ki smo jo živo ujeli)
      expect(f["field.mindtripDesc"].toLowerCase(), `[${code}] mindtripDesc citira Under Construction`).toContain("under construction");
      // Brez izmišljenih števcev v terenski sekciji (G4 kanon)
      const fieldText = [f["field.mindtripDesc"], f["field.laylaDesc"], f["field.googleDesc"], f["fieldNote"]].join(" ");
      expect(fieldText, `[${code}] teren brez odstotkov`).not.toContain("%");
      expect(fieldText, `[${code}] teren brez zvezdic`).not.toContain("★");
      expect(fieldText, `[${code}] teren brez M+ števcev`).not.toMatch(/\d+\s*M\b/);
      // Iskrena meja: ne ugibamo o vzroku (besedilo to eksplicitno pove,
      // v jeziku strani)
      const noSpeculation: Record<string, string[]> = {
        sl: ["ne ugibamo"],
        en: ["won't guess", "don't speculate"],
        it: ["Non speculiamo"],
        de: ["raten wir nicht", "spekulieren wir nicht"],
      };
      expect(
        noSpeculation[code].some((p) => f["field.mindtripDesc"].includes(p)),
        `[${code}] izrecno ne-ugibanje o vzroku`
      ).toBe(true);
    }
  });

  test("4. meta.title cilja poizvedbo Mindtrip alternativa (SEO osnova)", () => {
    for (const { code, msg, altWord } of LOCALES) {
      const title = flat(msg)["meta.title"].toLowerCase();
      expect(title, `[${code}] naslov vsebuje mindtrip`).toContain("mindtrip");
      expect(title, `[${code}] naslov vsebuje ${altWord}`).toContain(altWord);
      // Meta opis omenja datirano preverbo (iskrena svežina)
      const desc = flat(msg)["meta.description"];
      expect(desc, `[${code}] opis omenja leto`).toContain("2026");
    }
  });

  test("5. zlate poti: stran linka na /nacrtuj + /zemljevid + skupnost", () => {
    expect(PAGE_SRC, "CTA na načrtovalnika").toContain('href="/nacrtuj"');
    expect(PAGE_SRC, "CTA na zemljevid (W10)").toContain('href="/zemljevid"');
    // Skupnostna galerija živi na /nacrtuj#skupnost (CommunityTrips sekcija;
    // kartice vodijo v /pot/[shareId] — preverjeno v produkciji 1.132.0)
    expect(PAGE_SRC, "CTA na skupnostno sekcijo (W10)").toContain('href="/nacrtuj#skupnost"');
    // FAQ izrisuje 6 vprašanj (q6 nov)
    expect(PAGE_SRC, "FAQ 1..6").toContain("[1, 2, 3, 4, 5, 6]");
    // Terenska sekcija izrisana znotraj strani
    expect(PAGE_SRC, "terenska sekcija").toContain('t("fieldTitle")');
  });

  test("6. svežina: updated nosi datum preverbe 28. 9. 2026", () => {
    for (const { code, msg } of LOCALES) {
      const updated = flat(msg)["updated"];
      expect(updated, `[${code}] updated dan 28`).toContain("28");
      expect(updated, `[${code}] updated leto 2026`).toContain("2026");
    }
  });

  test("7. W1 doslednost: 4 jeziki v tabeli in CTA telesu", () => {
    for (const { code, msg, lang4 } of LOCALES) {
      const f = flat(msg);
      expect(f["table.rows.language.ours"], `[${code}] jezikovna vrstica našteva 4 jezike`).toContain("SL/EN/IT/DE");
      expect(f["ctaBody"], `[${code}] ctaBody našteva 4. jezik`).toContain(lang4);
    }
  });

  test("8. avtorizacija: fragment == messages ns (SL/EN merge kanon)", () => {
    expect(slFragment.comparison, "SL fragment == messages").toEqual(slMessages.comparison);
    expect(enFragment.comparison, "EN fragment == messages").toEqual(enMessages.comparison);
  });

  test("llms.txt opisuje Mindtrip-alternativo in datirano preverbo", () => {
    const llms = readFileSync(
      new URL("../../app/llms.txt/route.ts", import.meta.url),
      "utf-8",
    );
    expect(llms).toContain("Mindtrip alternativa");
    expect(llms).toContain("4 jeziki");
    expect(llms).toContain("28. 9. 2026");
  });
});
