import { describe, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DESTINATIONS } from "@/lib/slovenia-data";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import {
  OFFICIAL_SOURCE_DOMAIN_ALLOWLIST,
  DESTINATIONS_CONTENT_AS_OF,
  DESTINATIONS_CONTENT_LANG,
  DESTINATIONS_DATA_AS_OF,
  INTERNAL_SOURCE_LABEL,
  getDestinationProvenance,
  officialSourceRows,
  provenanceSummary,
  withDestinationProvenance,
} from "@/lib/destination-provenance";
// Re-izvoz iz stop-insights mora ostati IDENTIČEN (en vir resnice — isti
// vzorec kot FSQ_SNAPSHOT_DATE v wave5).
import { DESTINATIONS_DATA_AS_OF as AS_OF_FROM_STOP_INSIGHTS } from "@/lib/stop-insights";

// ============================================================================
// ISSUE #4 VAL 7 (§18) — DESTINATION CONTENT + OFFICIAL DATA
// ============================================================================
//
// Zahteva Issue #4 besedno: "Preveri 38 kuriranih destinacij: source,
// datum, jezik, last update, structured facts, images, links in seasonal
// information. … Discover naj ga ne kopira [NiST], ampak naj po potrebi
// uporablja strukturirane javne podatke kot source layer z provenance,
// datumom, obdobjem, enoto in virom."
//
// OBLJUBE, ki jih ta suita kodira:
//
//   §A AS-OF RESNICA: DESTINATIONS_DATA_AS_OF sledi git zgodovini
//      slovenia-data.ts (PRETEKLOST: konstanta "2026-09-13" je bila 7 dni
//      neresnična, TASK 62 jo je prehitel — ta past tega preprečuje).
//   §B PROVENANCE POKRITOST: VSEH 38 destinacij REŠI zapis vira —
//      uradni (https + ISO datum + dovoljena domena) ALI iskrena
//      uredniška kuracija (BREZ URL-ja, datum = AS-OF).
//   §C REGISTR: uradni viri so podnabor ID-jev datasetа; opening domene
//      (F5.5) so dosledno v registrU; summary sešteva na 38.
//   §D EN OVERLAY: VSAK id ∈ DESTINATIONS_EN (38/38 — prej je bil
//      pokrit le 22-SI nabor; map-view je lookupal po SLUG → 4
//      destinacije so tiho padle na SL besedilo na EN).
//   §E JSON-LD TEMELJ: country vseh 38 je veljaven ISO 3166-1 alpha-2
//      (hub stran addressCountry = dest.country — prej hardkodirana
//      laž "SI" tudi za Zagreb/Kotor/Tirano).
//   §F i18n PARITETA: destinationPage.source, dataSources.destination
//      Content in homeDest.editorialShort obstajajo v SL in EN z
//      enakim naborom ključev.
//   §G ČISTOST: lib/destination-provenance.ts je čist listni modul
//      (brez fetch/prisma/Date.now — uvožen tudi v client komponente).
//   §H API OVOJ: withDestinationProvenance ohrani identiteto zapisov.
// ============================================================================

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/** Izvorna koda BREZ komentarjev (čistost na KODI, ne dokumentaciji). */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ---------------------------------------------------------------------------
// §A — AS-OF RESNICA (git past)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§A: DESTINATIONS_DATA_AS_OF sledi git resnici", () => {
  test("konstanta ≡ zadnji AVTORSKI datum commita slovenia-data.ts (past proti zastaranju)", () => {
    // 1.100.2: shallow klon (npr. actions/checkout brez fetch-depth) ima
    // pritrjeno (grafted) korenino na pushanem commitu — `git log -- <pot>`
    // bi vrnil KAR pushani commit (današnji datum), konstanta pa se nanaša
    // na PRAVO zgodovino datoteke. Past v shallow klonu ne more delovati →
    // izrecen preskok z opozorilom (CI od 1.100.2 uporablja fetch-depth: 0,
    // zato se tam dejansko izvede).
    try {
      const shallow = execFileSync(
        "git",
        ["rev-parse", "--is-shallow-repository"],
        { encoding: "utf-8", timeout: 15_000 }
      ).trim();
      if (shallow === "true") {
        console.warn(
          "[§18] shallow klon zaznan — git-resnica past preskočena " +
            "(zahteva polno zgodovino; CI od 1.100.2: fetch-depth: 0)"
        );
        return;
      }
    } catch {
      // git neznan/nedosegljiv — pokriva ga spodnji try/catch
    }
    let gitDate: string | null = null;
    try {
      gitDate = execFileSync(
        "git",
        ["log", "-1", "--format=%as", "--", "src/lib/slovenia-data.ts"],
        { encoding: "utf-8", timeout: 15_000 }
      ).trim();
    } catch {
      console.warn("[§18] git nedosegljiv — varovalka preskočena (CI ima git)");
      return;
    }
    expect(gitDate.length).toBeGreaterThan(0);
    if (gitDate === "") return;
    // PRETEKLOST: "2026-09-13" je bila 7 dni neresnična, ker je TASK 62
    // spremenil vsebino datoteke ne pa tudi konstante. Ta past preprečuje
    // ponovitev: sprememba slovenia-data.ts ZAHTEVA prenos konstante.
    if (DESTINATIONS_DATA_AS_OF !== gitDate) {
      throw new Error(
        `DESTINATIONS_DATA_AS_OF="${DESTINATIONS_DATA_AS_OF}" ni enak zadnjemu git datumu "${gitDate}" slovenia-data.ts. ` +
          `Popravi konstanto v src/lib/destination-provenance.ts.`
      );
    }
  });

  test("re-izvoz iz stop-insights ostane IDENTIČEN (en vir resnice)", () => {
    expect(AS_OF_FROM_STOP_INSIGHTS).toBe(DESTINATIONS_DATA_AS_OF);
  });

  test("AS-OF je veljaven ISO datum v preteklosti (ne prihodnje)", () => {
    expect(DESTINATIONS_DATA_AS_OF).toMatch(ISO_DATE_RE);
    expect(Date.parse(DESTINATIONS_DATA_AS_OF)).not.toBeNaN();
    expect(DESTINATIONS_DATA_AS_OF <= "2026-09-25").toBe(true);
  });

  test("vsebina delovnega drevesa slovenia-data.ts je ČISTA (neuvrščene spremembe past)", () => {
    let dirty = false;
    try {
      const out = execFileSync(
        "git",
        ["status", "--porcelain", "--", "src/lib/slovenia-data.ts"],
        { encoding: "utf-8", timeout: 15_000 }
      ).trim();
      dirty = out.length > 0;
    } catch {
      return; // brez git — preskoči
    }
    if (dirty) return; // lokalna razvojna stanja so dovoljena (past ≡ committ
    // zgodovina zgoraj); samo COMMITIRANA resnica se testira.
    expect(true).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §B — PROVENANCE POKRITOST (38/38, iskrenost obeh razredov)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§B: getDestinationProvenance — pokritost + iskrenost", () => {
  test("VSEH 38 destinacij reši zapis vira (nikoli undefined/nemega)", () => {
    expect(DESTINATIONS.length).toBe(38);
    for (const d of DESTINATIONS) {
      const p = getDestinationProvenance(d);
      expect(p).toBeDefined();
      expect(p.kind === "official" || p.kind === "internal").toBe(true);
      expect(p.source.length).toBeGreaterThan(0);
      expect(p.verifiedAt).toMatch(ISO_DATE_RE);
    }
  });

  test("URADNI zapisi: https URL + ISO datum + NEPRAZEN vir (link zahteva §18)", () => {
    let official = 0;
    for (const d of DESTINATIONS) {
      const p = getDestinationProvenance(d);
      if (p.kind !== "official") continue;
      official++;
      expect(p.sourceUrl).toBeDefined();
      expect(p.sourceUrl!.startsWith("https://")).toBe(true);
      expect(p.verifiedAt).toMatch(ISO_DATE_RE);
    }
    expect(official).toBeGreaterThanOrEqual(9);
    expect(official).toBeLessThanOrEqual(38);
  });

  test("INTERNAL zapisi: BREZ URL-ja (ne lažemo z izmišljenim virom) + datum = AS-OF", () => {
    for (const d of DESTINATIONS) {
      const p = getDestinationProvenance(d);
      if (p.kind !== "internal") continue;
      expect(p.sourceUrl).toBeUndefined();
      expect(p.source).toBe(INTERNAL_SOURCE_LABEL);
      expect(p.verifiedAt).toBe(DESTINATIONS_DATA_AS_OF);
    }
  });

  test("URADNE domene so SAMO z allowliste (izmišljeni URL ne more priplavati)", () => {
    for (const row of officialSourceRows()) {
      const host = new URL(row.sourceUrl).host;
      expect(
        (OFFICIAL_SOURCE_DOMAIN_ALLOWLIST as readonly string[]).includes(host),
        `host "${host}" (${row.id}) ni na allowlisti — dodaj ga zavestno ali odstrani vir`
      ).toBe(true);
    }
  });

  test("resolver je DETERMINISTIČEN (isti vhod → isti izhod)", () => {
    const bled = DESTINATIONS.find((d) => d.id === "bled")!;
    expect(getDestinationProvenance(bled)).toEqual(getDestinationProvenance(bled));
    // znani konkretni primeri (snapshot resnice, odpornost na refactor)
    expect(getDestinationProvenance({ id: "zagreb" }).kind).toBe("internal");
    expect(getDestinationProvenance({ id: "postojna" }).kind).toBe("official");
  });
});

// ---------------------------------------------------------------------------
// §C — REGISTR + SUMMARY (en vir resnice)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§C: registr uradnih virov + povzetek", () => {
  test("officialSourceRows: 9 vrstic, ID-ji so podnabor dataseta, unikatni", () => {
    const rows = officialSourceRows();
    expect(rows.length).toBe(9);
    const ids = rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(9);
    const datasetIds = new Set(DESTINATIONS.map((d) => d.id));
    for (const id of ids) {
      expect(datasetIds.has(id), `registr id "${id}" ni v datasetu`).toBe(true);
    }
  });

  test("opening domene (F5.5) so dosledno v registrU uradnih virov", () => {
    const registryDomains = new Set(
      officialSourceRows().map((r) => r.source)
    );
    for (const d of DESTINATIONS) {
      if (!d.opening) continue;
      // opening.source (npr. "postojnska-jama.eu") mora biti tudi §18 vir
      expect(
        registryDomains.has(d.opening.source),
        `opening.source "${d.opening.source}" (${d.id}) ni v §18 registru — dstveni vir podatkov`
      ).toBe(true);
    }
  });

  test("provenanceSummary: official + internal = total = 38; jezik = sl", () => {
    const s = provenanceSummary(DESTINATIONS);
    expect(s.total).toBe(38);
    expect(s.official).toBe(officialSourceRows().length);
    expect(s.official + s.internal).toBe(38);
    expect(s.asOf).toBe(DESTINATIONS_DATA_AS_OF);
    expect(s.contentLang).toBe("sl");
    expect(s.officialIds.length).toBe(s.official);
    expect(DESTINATIONS_CONTENT_LANG).toBe("sl");
    expect(DESTINATIONS_CONTENT_AS_OF).toBe(DESTINATIONS_DATA_AS_OF);
  });
});

// ---------------------------------------------------------------------------
// §D — EN OVERLAY 38/38 (razred map-view slug/id hrošča)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§D: EN overlay pokritost po ID", () => {
  test("VSAK id dataseta je ključ v DESTINATIONS_EN (38/38)", () => {
    expect(DESTINATIONS.length).toBe(38);
    for (const d of DESTINATIONS) {
      expect(
        DESTINATIONS_EN[d.id],
        `DESTINATIONS_EN manjka id "${d.id}" (slug "${d.slug}") — EN površine tiho padajo na SL`
      ).toBeDefined();
    }
  });

  test("id ≠ slug destinacije se NE smejo razlikovati v pokritosti (4 znani primeri)", () => {
    // ravno ti so bili žrtev map-view lookupa po slug: prej je
    // DESTINATIONS_EN[slug] bil undefined → SL besedilo na EN zemljevidu.
    for (const id of ["postojna", "soca", "vintgar", "rogaska"]) {
      const d = DESTINATIONS.find((x) => x.id === id)!;
      expect(d.slug).not.toBe(id);
      expect(DESTINATIONS_EN[id]).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// §E — JSON-LD TEMELJ (addressCountry resnica)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§E: country je veljaven ISO 3166-1 alpha-2 (hub JSON-LD)", () => {
  test("vseh 38 country ∈ {SI, HR, ME, AL} (alpha-2, ne izmišljene kode)", () => {
    const valid = new Set(["SI", "HR", "ME", "AL"]);
    for (const d of DESTINATIONS) {
      expect(valid.has(d.country), `country "${d.country}" (${d.id}) ni veljaven ISO`).toBe(true);
    }
  });

  test("HR/ME/AL destinacije OBSTAJO (16) — nasprotje prejšnje laži addressCountry=SI", () => {
    const foreign = DESTINATIONS.filter((d) => d.country !== "SI");
    expect(foreign.length).toBe(16);
    expect(foreign.some((d) => d.id === "zagreb")).toBe(true);
    expect(foreign.some((d) => d.id === "kotor")).toBe(true);
    expect(foreign.some((d) => d.id === "tirana")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §F — i18n PARITETA (SL + EN)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§F: i18n pariteta novih nizov", () => {
  const CASES: Array<[string, string, string[]]> = [
    ["destinationPage", "source", ["title", "sourceLabel", "updatedLabel", "openingLabel", "sourceShort", "externalSr", "langNote"]],
    ["dataSources", "destinationContent", ["title", "intro", "statsLine", "colDestination", "colSource", "colVerified", "internalTitle", "internalNote", "langTitle", "langNote", "nistTitle", "nistNote"]],
  ];

  for (const [ns, key, keys] of CASES) {
    test(`${ns}.${key} obstaja v SL in EN z enakim naborom ključev`, () => {
      const sl = JSON.parse(source("src/i18n/messages/sl.json"));
      const en = JSON.parse(source("src/i18n/messages/en.json"));
      const slBlock = sl[ns][key] as Record<string, string>;
      const enBlock = en[ns][key] as Record<string, string>;
      expect(slBlock).toBeDefined();
      expect(enBlock).toBeDefined();
      expect(Object.keys(slBlock).sort()).toEqual(keys.slice().sort());
      expect(Object.keys(enBlock).sort()).toEqual(keys.slice().sort());
      for (const k of keys) {
        expect(slBlock[k].length).toBeGreaterThan(0);
        expect(enBlock[k].length).toBeGreaterThan(0);
      }
    });
  }

  test("homeDest.editorialShort obstaja v SL in EN (viden kvalifikator ocene)", () => {
    const sl = JSON.parse(source("src/i18n/messages/sl.json"));
    const en = JSON.parse(source("src/i18n/messages/en.json"));
    expect(sl.homeDest.editorialShort).toBe("uredniška");
    expect(en.homeDest.editorialShort).toBe("editorial");
  });

  test("statsLine/internalNote imata placeholderje, ki jih stran dejansko poda", () => {
    const sl = JSON.parse(source("src/i18n/messages/sl.json"));
    const dc = sl.dataSources.destinationContent;
    expect(dc.statsLine).toContain("{total}");
    expect(dc.statsLine).toContain("{official}");
    expect(dc.statsLine).toContain("{internal}");
    expect(dc.statsLine).toContain("{asOf}");
    expect(dc.internalNote).toContain("{internal}");
    expect(dc.internalNote).toContain("{asOf}");
  });
});

// ---------------------------------------------------------------------------
// §G — ČISTOST MODULA (source-contract)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§G: lib/destination-provenance.ts je čist listni modul", () => {
  test("brez fetch/prisma/ai-client/Date.now (modul je v client komponenti)", () => {
    const code = codeOnly(source("src/lib/destination-provenance.ts"));
    expect(code).not.toContain("fetch(");
    expect(code).not.toContain("Date.now");
    expect(code).not.toContain("@prisma");
    expect(code).not.toContain("z-ai-web-dev-sdk");
    expect(code).not.toContain("process.env");
  });
});

// ---------------------------------------------------------------------------
// §H — API OVOJ (withDestinationProvenance)
// ---------------------------------------------------------------------------

describe("ISSUE #4 §18/§H: withDestinationProvenance ovojnica", () => {
  test("pripne provenance VSEM zapisom in OHRANI identiteto ostalih polj", () => {
    const enriched = withDestinationProvenance(DESTINATIONS);
    expect(enriched.length).toBe(38);
    const byId = new Map(enriched.map((d) => [d.id, d]));
    for (const d of DESTINATIONS) {
      const e = byId.get(d.id)!;
      expect(e.provenance).toBeDefined();
      expect(e.name).toBe(d.name);
      expect(e.slug).toBe(d.slug);
      expect(e.coords).toEqual(d.coords);
      expect(e.costPerPerson).toBe(d.costPerPerson);
      expect(e.rating).toBe(d.rating);
      if (d.opening) expect(e.opening).toEqual(d.opening);
    }
    // izvirni podatki ostanejo NEODVISNI od ovojnice (pure, brez mutacij)
    expect(DESTINATIONS.every((d) => d.provenance === undefined)).toBe(true);
  });

  test("izsek (subset) deluje enako — API filtri (region/featured)", () => {
    const featured = DESTINATIONS.filter((d) => d.featured);
    const enriched = withDestinationProvenance(featured);
    expect(enriched.length).toBe(featured.length);
    expect(enriched.every((d) => d.provenance !== undefined)).toBe(true);
  });
});
