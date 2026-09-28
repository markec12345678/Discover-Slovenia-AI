import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  chatDiffusionAlternatives,
  chatDiffusionHint,
  HIGH_DEMAND_IDS,
} from "@/lib/crowd-alternatives";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { haversineKm } from "@/lib/geo-distance";
import { buildDomainAnswer } from "@/lib/chat-domain-fallback";

/**
 * W8 (Issue #15, 1.137.0): RAZPRŠITEV KOT AI NAČELO — namig v klepet
 * odgovorih (vrzel W8 iz benchmarka: Alma usmerja v manj znane regije;
 * mi smo imeli »Brez gužve« čip, ne pa razpršitvenih AI odgovorov).
 *
 * Verifikacijska merila (docs/UX-WORKFLOW-BENCHMARK-2026-09-27.md §3 W8):
 *  (1) AI sistemski namig naj pri gužvi predlaga alternativne regije →
 *      UNIT: chatDiffusionHint za vrhunske točke vrne iskren namig z
 *      alternativami; SOURCE CONTRACT: buildDomainAnswer ga pripne.
 *  (2) BREZ spreminjanja izbire uporabnika → UNIT: glavni odgovor o
 *      UPORABNIKOVI destinaciji ostane popoln (ime, ocena, trajanje,
 *      strošek) — namig je DODATEN odstavek, ki destinacijo IMENUJE.
 *  (3) varovalo: nikoli skrito preusmerjanje → namig alternativne ponudi
 *      kot PREDLOG (»če želiš manj gneče«) z imenom + razdaljo — nikoli
 *      ne zamenja ali skrije uporabnikove destinacije.
 *
 * Iskrenost (kanon crowd-alternatives): trditev o gneči je UREDNIŠKA,
 * javno dokumentirana (julij/avgust + vikendi na 5 imenovanih točkah) —
 * namig se NE izmišljuje za ne-vrhunske destinacije (null).
 */

// __tests/ → src/lib/__tests/; koren projekta je TRI ravni višje
const ROOT = new URL("../../../", import.meta.url);
const read = (p: string) =>
  readFileSync(new URL(p, ROOT), "utf-8") as string;

const FALLBACK_SRC = read("src/lib/chat-domain-fallback.ts");
const CROWD_SRC = read("src/lib/crowd-alternatives.ts");

// Prazn kontekst — buildDomainAnswer mora delovati brez njega (destinacijska
// plast ne potrebuje listings/products — te so pogojene z intentom).
const EMPTY_CONTEXT = {
  listings: [],
  products: [],
  experiences: [],
  osmPlaces: [],
  stoSources: [],
};

// ---------------------------------------------------------------------------
// 1. chatDiffusionAlternatives / chatDiffusionHint — čista deterministika
// ---------------------------------------------------------------------------

describe("W8: chatDiffusionAlternatives — 2 najbližji ne-vrhunski (≤60 km)", () => {
  test("za VSE vrhunske točke vrne točno 2 alternativi (dataset jih ima v radiju)", () => {
    for (const id of HIGH_DEMAND_IDS) {
      const alts = chatDiffusionAlternatives(id);
      expect(alts.length, `destinacija ${id}`).toBe(2);
    }
  });

  test("alternative NISO vrhunske točke in so znotraj 60 km (iskrena bližina)", () => {
    for (const id of HIGH_DEMAND_IDS) {
      const origin = DESTINATIONS.find((d) => d.id === id)!;
      for (const alt of chatDiffusionAlternatives(id)) {
        expect(HIGH_DEMAND_IDS.has(alt.destination_id)).toBe(false);
        const target = DESTINATIONS.find(
          (d) => d.id === alt.destination_id
        )!;
        expect(
          haversineKm(origin.coords, target.coords)
        ).toBeLessThanOrEqual(60);
        expect(alt.distanceKm).toBeGreaterThan(0);
      }
    }
  });

  test("razvrstitev po bližini (najbližja prva) — deterministično", () => {
    for (const id of HIGH_DEMAND_IDS) {
      const alts = chatDiffusionAlternatives(id);
      expect(alts[0].distanceKm).toBeLessThanOrEqual(alts[1].distanceKm);
    }
  });

  test("ne-vrhunska destinacija → PRAZNA tabela (ni izmišljevanja gneče)", () => {
    expect(chatDiffusionAlternatives("soca")).toEqual([]);
    expect(chatDiffusionAlternatives("bohinj")).toEqual([]);
    expect(chatDiffusionAlternatives("ne-obstojeca")).toEqual([]);
  });
});

describe("W8: chatDiffusionHint — iskren namig (4 jeziki)", () => {
  test("vrhunska točka: namig vsebuje IME destinacije, vzorec (julij/avgust) in alternativi z razdaljo", () => {
    const hint = chatDiffusionHint("bled", "sl");
    expect(hint).toBeTruthy();
    expect(hint!).toContain("Bled");
    expect(hint!).toContain("julija in avgusta");
    // alternative z razdaljo (Bohinj/Triglav — 2 najbližji)
    expect(hint!).toMatch(/Bohinj \(19 km\)/);
    expect(hint!).toMatch(/Triglav \(19 km\)/);
    // varovalo: predlog, ne ukaz
    expect(hint!).toContain("če želiš manj gneče");
  });

  test("4 jeziki: vsi vrnejo namig z imenom + alternativami (isti pomen)", () => {
    for (const lang of ["sl", "en", "it", "de"] as const) {
      const hint = chatDiffusionHint("piran", lang);
      expect(hint, `jezik ${lang}`).toBeTruthy();
      expect(hint!).toContain("Piran");
      // Portorož je 2 km od Pirana — najbližja alternativa
      expect(hint!).toContain("Portorož");
      // vzorec obiskanosti je izrečen v vseh jezikih
      expect(hint!.toLowerCase()).toMatch(/jul|juli|luglio|juli/i);
    }
  });

  test("ne-vrhunska destinacija → null (brez izmišljenih trditev o gneči)", () => {
    expect(chatDiffusionHint("soca", "sl")).toBeNull();
    expect(chatDiffusionHint("bohinj", "en")).toBeNull();
    expect(chatDiffusionHint("ne-obstojeca", "de")).toBeNull();
  });

  test("slovenska sklanjatev: ženski rod (Ljubljana → obiskana, Postojna → obiskana)", () => {
    expect(chatDiffusionHint("ljubljana", "sl")).toContain("obiskana");
    // moški rod: Bled → obiskan (brez končnice -a)
    expect(chatDiffusionHint("bled", "sl")).toContain("obiskan ");
  });
});

// ---------------------------------------------------------------------------
// 2. buildDomainAnswer — razpršitev v AI odgovorih (integration, 0 LLM)
// ---------------------------------------------------------------------------

describe("W8: buildDomainAnswer — razpršitveni namig v destinacijskih odgovorih", () => {
  test("vprašanje o VRHUNSKI točki (Bled): odgovor vsebuje namig + alternativi, glavni podatki ostanejo", async () => {
    const answer = await buildDomainAnswer(
      "Kaj videti in doživeti na Bledu?",
      "sl",
      EMPTY_CONTEXT
    );
    // GLAVNI odgovor o uporabnikovi izbiri ostane POPOLN (varovalo 2)
    expect(answer.message).toContain("Bled");
    expect(answer.message).toContain("4.8/5");
    expect(answer.message).toContain("Biser Alp");
    // W8: namig o gneči + alternative
    expect(answer.message).toContain("Opomba o gneči");
    expect(answer.message).toContain("Bohinj");
    expect(answer.message).toContain("Triglav");
    // kanonična zaključna vrstica ostane zadnja (namig je PRED njo)
    expect(answer.message).toContain("Več o Bled: /destinacija/bled");
  });

  test("vprašanje o NE-vrhunski točki (Soča): odgovor BREZ namiga (ni izmišljevanja)", async () => {
    const answer = await buildDomainAnswer(
      "Kaj videti in doživeti ob reki Soči?",
      "sl",
      EMPTY_CONTEXT
    );
    expect(answer.message).toContain("Reka Soča");
    expect(answer.message).not.toContain("Opomba o gneči");
    expect(answer.message).not.toContain("manj gneče");
  });

  test("EN vprašanje o vrhunski točki: namig v angleščini z alternativami", async () => {
    const answer = await buildDomainAnswer(
      "What to see and experience in Bled?",
      "en",
      EMPTY_CONTEXT
    );
    expect(answer.message).toContain("Crowd note");
    expect(answer.message).toContain("if you'd prefer fewer crowds nearby");
    expect(answer.message).toContain("Bohinj");
    // glavni odgovor ostaja (varovalo 2)
    expect(answer.message).toContain("Rated 4.8/5");
  });

  test("IT vprašanje o vrhunski točki: namig v italijanščini", async () => {
    const answer = await buildDomainAnswer(
      "Cosa vedere e vivere a Bled?",
      "it",
      EMPTY_CONTEXT
    );
    expect(answer.message).toContain("Nota sull'affollamento");
    expect(answer.message).toContain("Bohinj");
  });

  test("DE vprašanje o vrhunski točki: namig v nemščini", async () => {
    const answer = await buildDomainAnswer(
      "Was kann man in Bled sehen und erleben?",
      "de",
      EMPTY_CONTEXT
    );
    expect(answer.message).toContain("Hinweis zum Andrang");
    expect(answer.message).toContain("Bohinj");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE CONTRACT — varovala in infrastrukturna nedotaknjenost
// ---------------------------------------------------------------------------

describe("W8: source contract — varovala (nikoli skrito preusmerjanje)", () => {
  test("buildDomainAnswer pripne namig prek chatDiffusionHint PRED zaključno vrstico linkov", () => {
    expect(FALLBACK_SRC).toContain("chatDiffusionHint(dest.id, lang)");
    expect(FALLBACK_SRC).toContain("if (diffusion) lines.push(diffusion)");
    // namig je na koncu destinacijskega bloka (pred "Več o" zaključkom)
    const diffusionIdx = FALLBACK_SRC.indexOf(
      "const diffusion = chatDiffusionHint(dest.id, lang);"
    );
    const linksIdx = FALLBACK_SRC.indexOf("Več o ${dest.name}");
    expect(diffusionIdx).toBeGreaterThan(-1);
    expect(diffusionIdx).toBeLessThan(linksIdx);
  });

  test("VAROVALO: namig alternativne ponudi kot PREDLOG — fraza »če želiš manj gneče« / jezikovni ekvivalenti", () => {
    expect(CROWD_SRC).toContain("če želiš manj gneče");
    expect(CROWD_SRC).toContain("if you'd prefer fewer crowds nearby");
    expect(CROWD_SRC).toContain("se preferisci meno folla");
    expect(CROWD_SRC).toContain("weniger Trubel");
    // namig IMENUJE uporabnikovo destinacijo (nikoli zamenjava)
    expect(CROWD_SRC).toContain("${origin.name}");
  });

  test("VAROVALO: obstoječa crowd-alternatives plast (itinerer) ostaja nespremenjena", () => {
    // 5 dokumentiranih vrhunskih točk — isti kanonični nabor
    expect([...HIGH_DEMAND_IDS].sort()).toEqual([
      "bled",
      "ljubljana",
      "piran",
      "postojna",
      "vintgar",
    ]);
    // buildCrowdNotices (plast načrta) ostaja izvožena in z istimi varovali
    expect(CROWD_SRC).toContain("export function buildCrowdNotices(");
    expect(CROWD_SRC).toContain("if (!input.startDate) return [];");
  });

  test("ISTA plast za OSEBNI in SKUPINSKI klepet — chat-engine porablja buildDomainAnswer", () => {
    const ENGINE_SRC = read("src/lib/chat-engine.ts");
    expect(ENGINE_SRC).toContain("buildDomainAnswer");
  });
});
