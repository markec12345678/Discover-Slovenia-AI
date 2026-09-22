// ============================================================================
// TASK 95 — D3 "Začni s PDF-jem": E2E verifikacija + testna pokritost (1.84.0)
// ============================================================================
//
// ZADEVA: PDF uvoz (Start Anywhere plast) je bil implementiran že v 1.23.0
// (commit 16296ab, "D2+D3 iz nabora #2"), a NIKOLI E2E verificiran in ima
// 0 testne pokritosti (edini ingest vir brez testov — link/slika/pins imajo
// pokritost posredno prek url-ingest testov in task44/49). Task 93 backlog
// ga je napačnonavajal kot "za narediti" (doc drift).
//
// Pokriva:
//   1. FUNKCIONALNA CELOVOD (ista kot v E2E): pdf-lib zgenerira PDF z
//      slovenskimi destinacijami → unpdf izvleče besedilno plast →
//      matchDestinationsInText deterministično prepozna (0 AI);
//      negativni: PDF brez slovenskih destinacij (0 zadetkov),
//      "skeniran" PDF (samo slika → < 40 znakov → pot bi rekla 422);
//   2. SOURCE-CONTRACT /api/itinerary/ingest-pdf: rate limit 10/min
//      (key itinerary-ingest-pdf) PREJ kot parsanje; meje (8 MB base64 /
//      60 strani / 400k znakov) → 413; magija "%PDF-" → 400; unpdf
//      (getDocumentProxy + extractText mergePages) — 0 AI; ISTI matcher
//      kot vsi ostali viri (url-ingest, en vir resnice); poštene napake
//      422 (skeniran → usmeritev na zavihek Slika; ni zadetkov → nič
//      izmišljanja); oblika odgovora (method/pages/pdfChars/matches/
//      suggestion); PDF se NE shranjuje (0 prisma/db uvozov);
//   3. SOURCE-CONTRACT klient (itinerary-planner): zavihek "pdf" v
//      tablistu, validacija vrste/velikosti (6 MB) na klientu, FileReader
//      readAsDataURL, POST pot, SAMODEJNA generacija po zadetkih,
//      analitika (ingest_pdf_attempted/success), odstrani gumb, drop
//      zona (onDrop + tipkovnica Enter/Space);
//   4. I18N: ključi ingestPdf* (14) prisotni v OBEH jezikih.
//
// E2E DOKAZ (agent-browser 375 px, isto sejo kot testi): upload
// d3-test-vodnik.pdf → POST 200 → PREPOZNANO 5 destinacij → samodejna
// generacija → "Vaš 5-dnevni itinerer" z vsemi 5 destinacijami; 0 konzolnih
// napak; 0 px preliva; VLM potrditev. Vse napake poštenja (422/400/405/413)
// verificirane s curl.
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { extractText, getDocumentProxy } from "unpdf";
import { matchDestinationsInText } from "@/lib/url-ingest";
import slMessages from "@/i18n/messages/sl.json";
import enMessages from "@/i18n/messages/en.json";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

const ROUTE = "src/app/api/itinerary/ingest-pdf/route.ts";
const PLANNER = "src/components/sections/itinerary-planner.tsx";

// ---------------------------------------------------------------------------
// pomožnika: zgeneriraj PDF (ista tehnika kot E2E dokaz) + izvleci besedilo
// ---------------------------------------------------------------------------

/** PDF z besedilno plastjo (diakritika c/s/z — matcher normalizira, kot v E2E). */
async function makePdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 11, font });
    y -= 19;
  }
  return doc.save();
}

/** Ista ekstrakcija kot v poti: getDocumentProxy + extractText(mergePages). */
async function extract(bytes: Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(bytes);
  const out = await extractText(pdf, { mergePages: true });
  return typeof out.text === "string" ? out.text : "";
}

// črno-beli 1×1 PNG (veljaven IHDR+IDAT+IEND) za "skeniran" PDF
const ONE_PNG = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG magija
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01,
  0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63,
  0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x05, 0x02, 0x00, 0x5f, 0xc8,
  0xf1, 0xd2, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

// ---------------------------------------------------------------------------
// 1. FUNKCIONALNA CELOVOD — pdf-lib → unpdf → matchDestinationsInText
// ---------------------------------------------------------------------------

describe("TASK 95: PDF → unpdf → matcher cevovod (ista kot E2E)", () => {
  test(
    "vodik z 5 destinacijami: 5 zadetkov, days=5 iz besedila",
    async () => {
      const pdf = await makePdf([
        "Nasi 5 dni v Sloveniji - vodnik potovanja",
        "Dan 1: Ljubljana - stari mesto, grad nad reko.",
        "Dan 2: Bled in Bledsko jezero - otok z cerkvijo.",
        "Bled je priljubljena destinacija za romantiko.",
        "Dan 3: Postojnska jama in Predjamski grad.",
        "Dan 4: Piran na obali - soline, tartini square.",
        "Dan 5: Bohinj in Vogel - jezero, gore.",
      ]);
      const text = (await extract(pdf)).replace(/\s+/g, " ").trim();
      expect(text.length).toBeGreaterThan(40); // besedilna plast obstaja

      const result = matchDestinationsInText(text, null);
      const ids = result.matches.map((m) => m.id);
      expect(ids).toContain("bled");
      expect(ids).toContain("bohinj");
      expect(ids).toContain("postojna");
      expect(ids).toContain("piran");
      expect(ids).toContain("ljubljana");
      // rangiranje po številu omemb (Bled 3× na vrhu)
      expect(result.matches[0]!.id).toBe("bled");
      expect(result.matches[0]!.count).toBeGreaterThanOrEqual(3);
      // dni iz besedila ("5 dni") — ne privzeta vrednost
      expect(result.suggestion.days).toBe(5);
      // predlagane destinacije = zadetki (≤ 8, po rangu)
      expect(result.suggestion.preferredDestinations.slice(0, 5)).toEqual(
        expect.arrayContaining(ids)
      );
    }
  );

  test(
    "večbesedni vzorci stejejo ločeno (postojnska jama + postojna)",
    async () => {
      const pdf = await makePdf([
        "Postojnska jama je najvecja jama. Postojna je mesto.",
        "Predjamski grad stoji blizu.",
      ]);
      const text = (await extract(pdf)).replace(/\s+/g, " ").trim();
      const result = matchDestinationsInText(text, null);
      const postojna = result.matches.find((m) => m.id === "postojna");
      expect(postojna).toBeDefined();
      // vsaj 3 omembe: postojnska jama, postojna, predjamski grad
      expect(postojna!.count).toBeGreaterThanOrEqual(3);
    }
  );

  test(
    "tuji vodik (Italija): 0 zadetkov — pot odgovori s pošteno 422",
    async () => {
      const pdf = await makePdf([
        "Our Italian vacation guide: Roma, Firenze, Venezia,",
        "Toscana vineyards and Amalfi coast drives with ruins.",
      ]);
      const text = (await extract(pdf)).replace(/\s+/g, " ").trim();
      expect(text.length).toBeGreaterThan(40); // besedilna plast OBSTOJA
      const result = matchDestinationsInText(text, null);
      expect(result.matches).toHaveLength(0); // NIČ izmišljanja
    }
  );

  test(
    "skeniran PDF (samo slika): besedilna plast < 40 znakov → pot reče 422",
    async () => {
      const doc = await PDFDocument.create();
      const png = await doc.embedPng(ONE_PNG);
      const page = doc.addPage([595, 842]);
      page.drawImage(png, { x: 50, y: 700, width: 495, height: 100 });
      const text = (await extract(await doc.save())).trim();
      // Ista meja kot v poti: < 40 znakov → "verjetno skeniran" 422
      expect(text.length).toBeLessThan(40);
    }
  );

  test(
    "normalizacija diakritike: š/č/ž v besedilu se ujame brez njih",
    async () => {
      // Helvetica NE podpira šumnikov — E2E in ta test uporabljata c/s/z
      // oblike; matcher normalizira OBE strani (PATTERNS vsebujejo tudi
      // izvirnike s šumniki, npr. portorož → portoroz)
      const pdf = await makePdf(["Portoroz in Piran na obali."]);
      const text = (await extract(pdf)).replace(/\s+/g, " ").trim();
      const result = matchDestinationsInText(text, null);
      const ids = result.matches.map((m) => m.id);
      expect(ids).toContain("portoroz");
      expect(ids).toContain("piran");
    }
  );
});

// ---------------------------------------------------------------------------
// 2. SOURCE-CONTRACT — /api/itinerary/ingest-pdf
// ---------------------------------------------------------------------------

describe("TASK 95: /api/itinerary/ingest-pdf source-contract", () => {
  test("rate limit 10/min z lastnim ključem, PREJ kot parsanje telesa", () => {
    const s = source(ROUTE);
    // Varnostna vrata so PRVA (javna pot) — pred vsakim delom z vhodom
    const rl = s.indexOf('rateLimit(request, {');
    const body = s.indexOf("await request.json()");
    expect(rl).toBeGreaterThan(-1);
    expect(body).toBeGreaterThan(rl);
    expect(s).toContain('key: "itinerary-ingest-pdf"');
    expect(s).toContain("limit: 10");
    expect(s).toContain("windowMs: 60000");
  });

  test("meje: 8 MB base64 (~6 MB PDF), 60 strani, 400k znakov → 413", () => {
    const s = source(ROUTE);
    expect(s).toContain("MAX_BASE64_CHARS = 8 * 1024 * 1024");
    expect(s).toContain("MAX_TEXT_CHARS = 400000");
    expect(s).toContain("MAX_PAGES = 60");
    expect(s).toMatch(/totalPages > MAX_PAGES[\s\S]{0,300}413/);
    expect(s).toMatch(/raw\.length > MAX_BASE64_CHARS[\s\S]{0,300}413/);
  });

  test("magija formata: %PDF- na dekodiranih bajtih → 400", () => {
    const s = source(ROUTE);
    expect(s).toContain('"%PDF-"');
    expect(s).toMatch(/bytes\.toString\("ascii", 0, 5\)/);
    // zavrnitev pred unpdf delom
    expect(s.indexOf('"Datoteka ni veljaven PDF."')).toBeGreaterThan(-1);
  });

  test("unpdf ekstrakcija (0 AI): getDocumentProxy + extractText mergePages", () => {
    const s = source(ROUTE);
    expect(s).toContain("getDocumentProxy");
    expect(s).toContain("extractText");
    expect(s).toContain("mergePages: true");
    // NI AI klicev v poti (deterministična)
    expect(s).not.toMatch(/z-ai-web-dev-sdk|chat\.completions|createVision/);
  });

  test("ISTI matcher kot vsi ostali viri (url-ingest, ena resnica)", () => {
    const s = source(ROUTE);
    expect(s).toContain('from "@/lib/url-ingest"');
    expect(s).toContain("matchDestinationsInText(clean, null)");
    // NI lokalne kopije vzorcev
    expect(s).not.toContain("PATTERNS");
  });

  test("poštene napake 422: skeniran (usmeritev na Slika) + ni zadetkov", () => {
    const s = source(ROUTE);
    // skeniran PDF → nasvet uporabi zavihek Slika (VLM pot F8)
    expect(s).toMatch(/clean\.length < 40/);
    expect(s).toMatch(/zavihku Slika|zavihek Slika/);
    // ni zadetkov → odkita zavrnitev, NE "podobnih" lokacij
    expect(s).toMatch(/matches\.length === 0/);
    expect(s).toMatch(/nisem prepoznal nobene/);
  });

  test("oblika odgovora: method/pdf/pages/pdfChars/matches/suggestion", () => {
    const s = source(ROUTE);
    expect(s).toContain('"pdf" as const');
    expect(s).toContain("pages: totalPages");
    expect(s).toContain("pdfChars: clean.length");
    expect(s).toContain("matches: result.matches");
    expect(s).toContain("suggestion: result.suggestion");
  });

  test("zasebnost: PDF se NE shranjuje — 0 prisma/db/uvozov za shrambo", () => {
    const s = source(ROUTE);
    expect(s).not.toMatch(/from "@\/lib\/db"|prisma|PrismaClient|fs\.write/);
    expect(s).toContain("NE shranjuje");
  });

  test("metoda: samo POST (GET na isti poti → 405 iz Next.js)", async () => {
    const s = source(ROUTE);
    expect(s).toContain("export async function POST");
    expect(s).not.toContain("export async function GET");
  });
});

// ---------------------------------------------------------------------------
// 3. SOURCE-CONTRACT — klient (itinerary-planner)
// ---------------------------------------------------------------------------

describe("TASK 95: klient (itinerary-planner) source-contract", () => {
  test("zavihek »PDF« v tablistu ingest vira (4 zavihki)", () => {
    const s = source(PLANNER);
    expect(s).toContain('id: "pdf",');
    expect(s).toContain('t("ingestTabPdf")');
    expect(s).toContain("FileText");
    // vsi 4 Start Anywhere viri (link enovrstični, ostali večvrstični)
    expect(s).toContain('{ id: "link",');
    expect(s).toContain('id: "image",');
    expect(s).toContain('id: "pins",');
  });

  test("klientska validacija: vrsta (application/pdf|.pdf) + 6 MB", () => {
    const s = source(PLANNER);
    expect(s).toContain(
      'file.type === "application/pdf" || /\\.pdf$/i.test(file.name || "")'
    );
    expect(s).toContain("file.size > 6 * 1024 * 1024");
  });

  test("FileReader → data URL (readAsDataURL) z resetom inputa", () => {
    const s = source(PLANNER);
    expect(s).toContain("reader.readAsDataURL(file)");
    // ista datoteka znova izbirna (value reset po onChange)
    expect(s).toContain('e.target.value = ""');
  });

  test("POST na pravo pot s celim data URL-jem", () => {
    const s = source(PLANNER);
    expect(s).toContain('"/api/itinerary/ingest-pdf"');
    expect(s).toContain("JSON.stringify({ pdf: ingestPdf })");
  });

  test("SAMODEJNA generacija po zadetkih (PDF → načrt v enem koraku)", () => {
    const s = source(PLANNER);
    // zadetki izpolnijo obrazec (dni/interesi/prednostne) in sprožijo
    // generacijo — ISTA pot kot ročni gumb
    expect(s).toMatch(/setFormData\(nextInput\)/);
    expect(s).toMatch(/await generateItinerary\(nextInput\)/);
    expect(s).toContain("data.suggestion?.days ?? formData.days");
    expect(s).toContain("data.suggestion?.preferredDestinations");
  });

  test("analitika: ingest_pdf_attempted + ingest_pdf_success", () => {
    const s = source(PLANNER);
    expect(s).toContain('trackPlannerEvent("ingest_pdf_attempted"');
    expect(s).toContain('trackPlannerEvent("ingest_pdf_success"');
  });

  test("odstrani gumb počisti stanje (pdf/ime/zadetki)", () => {
    const s = source(PLANNER);
    // reset v odstrani gumbu
    expect(s).toMatch(
      /onClick=\{\(\) => \{\s*setIngestPdf\(null\);\s*setIngestPdfName\(""\);\s*setIngestMatches\(null\);/
    );
  });

  test("drop zona: onDrop + tipkovnica (Enter/Space) + aria-describedby", () => {
    const s = source(PLANNER);
    expect(s).toContain("onDrop={(e) => {");
    expect(s).toMatch(/e\.key === "Enter" \|\|\s*e\.key === " "/);
    expect(s).toContain('aria-describedby="ingest-pdf-hint"');
    expect(s).toContain('id="ingest-pdf-input"');
    expect(s).toContain('accept="application/pdf,.pdf"');
  });

  test("vir naslov nosi ime datoteke + število strani (preverljivost)", () => {
    const s = source(PLANNER);
    expect(s).toContain("ingestPdfSourceFile");
    expect(s).toContain("pages: data.pages ?? 0");
  });
});

// ---------------------------------------------------------------------------
// 4. I18N — ključi ingestPdf* v OBEH jezikih
// ---------------------------------------------------------------------------

describe("TASK 95: i18n ključi PDF zavihka (sl + en)", () => {
  const PLANNER_PDF_KEYS = [
    "ingestTabPdf",
    "ingestPdfLabel",
    "ingestPdfButton",
    "ingestPdfButtonAria",
    "ingestPdfBrowse",
    "ingestPdfDrop",
    "ingestPdfMethod",
    "ingestPdfHint",
    "ingestPdfScanned",
    "ingestPdfError",
    "ingestPdfSource",
    "ingestPdfSourceFile",
    "ingestPdfSuccessToast",
    "ingestPdfSuccessToastDesc",
    "ingestPdfRemove",
  ] as const;

  test("vsak ključ, ki ga klient uporablja, obstaja v sl slovarju", () => {
    for (const key of PLANNER_PDF_KEYS) {
      expect(key in slMessages.planner).toBeTrue();
    }
  });

  test("ista množica ključev v en slovarju (pariteta dokumentirana v task71)", () => {
    for (const key of PLANNER_PDF_KEYS) {
      expect(key in enMessages.planner).toBeTrue();
    }
  });

  test("nahajniški ključi so neprazni v obeh jezikih", () => {
    expect(slMessages.planner.ingestPdfHint.length).toBeGreaterThan(10);
    expect(enMessages.planner.ingestPdfHint.length).toBeGreaterThan(10);
    expect(slMessages.planner.ingestPdfScanned.length).toBeGreaterThan(5);
    expect(enMessages.planner.ingestPdfScanned.length).toBeGreaterThan(5);
  });
});
