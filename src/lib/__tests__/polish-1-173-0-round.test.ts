import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// ============================================================================
// POLISH 1.173.0 — RAZISKOVALNO-ANALITIČNI KROG (QA obhod žive aplikacije)
// ============================================================================
// Vir: produkcijski QA obhod (Render 1.172.2, mobilni 390×844) + revizija
// i18n slovarjev. Ugotovitve → popravki → TA datoteka jih zaklene.
//
// Ugotovitve (vse potrjene na živi aplikaciji):
//  ① Mobilni Sheet (Več): klik na jezikovni preklopnik je ZAPRL Sheet —
//     dropdown se ni odprl (Radix portal na document.body je IZVEN Sheet
//     vsebine → outside-interaction handler zapre Sheet prej). Enako za
//     dostopnostne nastavitve. → INLINE sekciji (LanguageSheetRow +
//     A11ySheetSection); namizni header dropdowna nedotaknjena.
//  ② SL slovar je mešal vikanje (31 nizov "vaš/vam") s tikanjem — DE/IT/ES
//     prevodi so vsi INFORMALNI (du/tu); SL je bil izjema. → poenoten
//     tikanje (razen privacy/terms — pravni register ostane formalen).
//  ③ 404 stran ni nastavila naslova zavihka (generični title).
//  ④ demoScenarios.title je podvajal hero h1 ("Kaj želiš doživeti?").
//  ⑤ 38 destinacijskih hub strani (/destinacija/[slug]) je bilo iz
//     kataloga NEDOSEGLJIVIH (kartice → samo modal → partnerji; 0 internih
//     povezav). → povezava na kartici + v modalu.
//  ⑥ aria "Izberi jezik — trenutno X" je bila vedno slovenska (tudi /en).
// ============================================================================

const root = "src";
const read = (p: string) => readFileSync(`${root}/${p}`, "utf-8");

const LANG_SRC = read("components/language-switcher.tsx");
const A11Y_SRC = read("components/a11y-controls.tsx");
const NAV_SRC = read("components/sections/navigation.tsx");
const MODAL_SRC = read("components/sections/destination-modal.tsx");
const DEST_SRC = read("components/sections/destinations.tsx");
const NOT_FOUND_SRC = read("app/not-found.tsx");

// --- i18n slovarji (vseh 6 jezikov) ---
const sl = JSON.parse(read("i18n/messages/sl.json"));
const en = JSON.parse(read("i18n/messages/en.json"));
const de = JSON.parse(read("i18n/messages/de.json"));
const it = JSON.parse(read("i18n/messages/it.json"));
const fr = JSON.parse(read("i18n/messages/fr.json"));
const es = JSON.parse(read("i18n/messages/es.json"));
const ALL_LOCALES: Record<string, Record<string, unknown>> = { sl, en, de, it, fr, es };

// --- fragmenti (usklajenost z messages — prihodnje spajanje ne sme povrniti tona) ---
const FRAG_COMPARISON = JSON.parse(read("i18n/fragments/comparison.sl.json"));
const FRAG_GUIDE = JSON.parse(read("i18n/fragments/guidePage.sl.json"));

// ---------------------------------------------------------------------------
// ① MOBILNI SHEET — inline namesto pokvarjenih vgnezdenih dropdownov
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ① mobilni Sheet: jezik + dostopnost INLINE", () => {
  const sheetStart = NAV_SRC.indexOf("<SheetContent");
  const sheet = sheetStart >= 0 ? NAV_SRC.slice(sheetStart) : "";

  test("Sheet izrisuje LanguageSheetRow + A11ySheetSection (novi inline komponenti)", () => {
    expect(sheet).toContain("<LanguageSheetRow />");
    expect(sheet).toContain("<A11ySheetSection />");
  });

  test("Sheet NE vsebuje vgnezdenih dropdownov več (korenski vzrok hrošča)", () => {
    // LanguageSwitcher/A11yControls (dropdown) sta dovoljena SAMO v namiznem
    // header delu Navigation — v Sheet regiji ne smeta obstajati
    expect(sheet).not.toContain("<LanguageSwitcher />");
    expect(sheet).not.toContain("<A11yControls scrolled />");
  });

  test("namizni header ohranja dropdowna (isto funkcionalnost, druga lupina)", () => {
    const header = NAV_SRC.slice(0, sheetStart);
    expect(header).toContain("<LanguageSwitcher />");
    expect(header).toContain("<A11yControls scrolled={glass} />");
  });

  test("preklop teme ostaja v Sheetu (deluje že prej — navaden gumb brez portala)", () => {
    expect(sheet).toContain("toggleTheme");
  });
});

describe("POLISH 1.173.0 ① LanguageSheetRow/A11ySheetSection delita jedro z dropdownom", () => {
  test("language-switcher: en skupni vir resnice (useLanguageOptions) za obe lupini", () => {
    expect(LANG_SRC).toContain("function useLanguageOptions");
    expect(LANG_SRC).toContain("export function LanguageSwitcher");
    expect(LANG_SRC).toContain("export function LanguageSheetRow");
    // obe lupini pokličeta isti hook
    const uses = LANG_SRC.match(/useLanguageOptions\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
  });

  test("language-switcher: Sheet vrstica je tipke ≥44px + aria-current za aktivni jezik", () => {
    const rowStart = LANG_SRC.indexOf("export function LanguageSheetRow");
    const row = LANG_SRC.slice(rowStart);
    expect(row).toContain("min-h-[44px]");
    expect(row).toContain('aria-current={active ? "true" : undefined}');
    expect(row).toContain('role="group"');
  });

  test("a11y-controls: en skupni vir stanja (useA11ySwitchState) + deljeni stikali", () => {
    expect(A11Y_SRC).toContain("function useA11ySwitchState");
    expect(A11Y_SRC).toContain("function A11ySwitchList");
    expect(A11Y_SRC).toContain("export function A11ySheetSection");
    // obe lupini pokličeta isti hook
    const uses = A11Y_SRC.match(/useA11ySwitchState\(\)/g) ?? [];
    expect(uses.length).toBeGreaterThanOrEqual(2);
    // idPrefix ločuje id-je (header in Sheet sta hkrati montirana)
    expect(A11Y_SRC).toContain("idPrefix: string");
    expect(A11Y_SRC).toContain('idPrefix="a11y"');
    expect(A11Y_SRC).toContain('idPrefix="a11y-sheet"');
  });

  test("a11y-controls: Sheet sekcija je bez dropdown mehanizma (navadna skupina)", () => {
    const section = A11Y_SRC.slice(A11Y_SRC.indexOf("export function A11ySheetSection"));
    expect(section).not.toContain("DropdownMenu");
    expect(section).toContain('role="group"');
  });
});

// ---------------------------------------------------------------------------
// ② SL TON — vikanje → tikanje (TRAJNA VAROVALKA)
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ② SL ton: vikanje iztrebljeno iz B2C slovarja", () => {
  // Pridevniki/konstante, ki se končajo kot velelniki a niso (lažni pozitivi).
  // POZOR: JS \w ne vključuje š/č/ž → "čudovite" ujame kot "udovite";
  // primerjava poteka po MALEH črki (pokrije "Skrite"/"Kremšnite").
  const FALSE_POSITIVE = new Set([
    "skrite", "kremšnite", "elitne", "izredne", "običajne", "hitre",
    "prisotne", "različne", "razpoložljive", "sqlite", "posodobite",
    "prijetne", "čudovite", "udovite", "prijazne", "priljubljene",
    "namenske", "odprte", "zaprtih", "sproščeno", "kakšne", "vrtne",
  ]);
  const VOS = /\b[Vv]aš(ega|emu|i|e|a|ih|im)?\b|\b[Vv]am\b|\b[Vv]as\b/;
  // Unicode-zaveden velelnik (š/č/ž so del besede — "čudovite" se ne razbije
  // na "udovite", "kremšnite" ne na "nite")
  const IMPER = /[\p{L}]+(ajte|ejte|ite|jte)\b/gu;

  function vikanjeIn(obj: unknown, path = ""): string[] {
    const bad: string[] = [];
    if (obj && typeof obj === "object") {
      for (const [k, v] of Object.entries(obj)) {
        bad.push(...vikanjeIn(v, path ? `${path}.${k}` : k));
      }
    } else if (typeof obj === "string") {
      const hits: string[] = [];
      if (VOS.test(obj)) hits.push("vaš/vam/vas");
      for (const m of obj.matchAll(IMPER)) {
        // normalizacija: male črke brez šumnikov-spotik (čudovite → udite? NE —
        // najprej preveri izvorno besedo spodnječrkovljeno, nato golo ujemanje
        const word = m[0].toLowerCase();
        if (!FALSE_POSITIVE.has(word) && !FALSE_POSITIVE.has(m[0])) {
          hits.push(m[0]);
        }
      }
      if (hits.length) bad.push(`${path} [${hits.join(",")}] :: ${obj.slice(0, 60)}`);
    }
    return bad;
  }

  test("messages/sl.json: 0 vikanja izven privacy.*/terms.* (pravni register ostaja formalen)", () => {
    const all = vikanjeIn(sl);
    const b2c = all.filter((l) => !/^privacy\.|^terms\./.test(l));
    // diagnostika: izpiši preostanke, če kdaj kdo vnese novo vikanje
    if (b2c.length) console.error("PREOSTALO VIKANJE:\n" + b2c.join("\n"));
    expect(b2c).toEqual([]);
  });

  test("kanonski nizi so tikanje (vzorčne točke po celotnem popravku)", () => {
    expect(sl.nav.sheetSlogan).toBe("AI ti sestavi itinerer v sekundah.");
    expect(sl.planner.resultTitle).toBe("Tvoj {days}-dnevni itinerer");
    expect(sl.chatbot.welcome).toContain("Kako ti lahko pomagam?");
    expect(sl.comparison.ctaTitle).toBe("Poskusi brez prijave");
    expect(sl.comparison.faq.q4).toBe("Kako zanesljivi so tvoji podatki?");
    expect(sl.destinationsPage.meta.description).toMatch(/^Razišči 38 destinacij/);
    expect(sl.homeDest.titleAll).toBe("Razišči destinacije");
    expect(sl.footer.providersBecomePartner).toBe("Postani partner");
  });

  test("trdo kodirani nizi v komponentah so tikanje (vzorčne točke)", () => {
    expect(DEST_SRC + MODAL_SRC).not.toContain("Raziščite");
    expect(MODAL_SRC).not.toContain("za vas.");
    const mojaView = read("app/moja-potovanja/moja-potovanja-view.tsx");
    expect(mojaView).not.toContain("Pozdravljeni");
    expect(mojaView).toContain('"Pozdravljen,"');
    expect(mojaView).toContain("Nimaš še shranjenih potovanj");
    const zemljevid = read("app/zemljevid/page.tsx");
    expect(zemljevid).not.toContain("Raziščite");
    expect(zemljevid).toContain("Klikni marker za podrobnosti");
  });

  test("fragmenti so usklajeni z messages (ponovni merge ne povrne vikanja)", () => {
    // primerjava vzorčnih ključev messages ↔ fragment
    expect(FRAG_COMPARISON.comparison.ctaTitle).toBe(sl.comparison.ctaTitle);
    expect(FRAG_COMPARISON.comparison.faq.q4).toBe(sl.comparison.faq.q4);
    expect(FRAG_GUIDE.guidePage.faqs.ai.q).toBe(sl.guidePage.faqs.ai.q);
    expect(FRAG_COMPARISON.comparison.notForYouBody).toBe(
      sl.comparison.notForYouBody
    );
  });

  test("B2B/pravni registri OSTAJAJO formalni (namerna odločitev, ne vrzel)", () => {
    // privacy/terms telesa so pravni dokumenti — formalni register je standard
    expect(String(sl.privacy.sections.s8.title)).toContain("Vaše pravice");
    // B2B površine (pitch-deck za lastnike lokalov) govorijo ponudniku formalno
    const pitch = read("components/sections/pitch-deck.tsx");
    expect(pitch).toContain("vaš lokal");
  });
});

// ---------------------------------------------------------------------------
// ③ 404 — naslov zavihka
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ③ 404 naslov zavihka", () => {
  test("not-found nastavi dokument.title z \"404 —\" predpono (dvojezično)", () => {
    expect(NOT_FOUND_SRC).toContain("document.title");
    expect(NOT_FOUND_SRC).toContain("404 — Te strani (še) ni na zemljevidu");
    expect(NOT_FOUND_SRC).toContain("404 — This page is not on the map yet");
  });

  test("dvojezična detekcija ostaja (isti kanon kot telo strani)", () => {
    expect(NOT_FOUND_SRC).toContain('window.location.pathname.startsWith("/en")');
  });
});

// ---------------------------------------------------------------------------
// ④ demoScenarios naslov — ne podvaja hero h1
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ④ demoScenarios.title je unikaten", () => {
  test("SL: naslov sekcije ≠ hero h1 (oba sta vidna na isti strani)", () => {
    expect(sl.demoScenarios.title).toBe("Sestavi načrt v 30 sekundah");
    expect(sl.hero.title).not.toBe(sl.demoScenarios.title);
  });
  test("EN: enak kanon", () => {
    expect(en.demoScenarios.title).toBe("Build a plan in 30 seconds");
    expect(en.hero.title).not.toBe(en.demoScenarios.title);
  });
});

// ---------------------------------------------------------------------------
// ⑤ DESTINACIJSKE STRANI dosegljive iz kataloga (internal linking)
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ⑤ katalog → destinacijske strani (povezave)", () => {
  test("modal vsebuje vidno povezavo na hub stran (vseh 6 jezikov)", () => {
    expect(MODAL_SRC).toContain(
      "href={`/destinacija/${encodeURIComponent(destination.slug)}`}"
    );
    // lokalizirana oznaka (pick kanon komponente)
    expect(MODAL_SRC).toContain("Odpri celoten vodnik: ${destination.name}");
    expect(MODAL_SRC).toContain("Open the full guide: ${destination.name}");
  });

  test("kartica kataloga ima pravi <Link> na destinacijsko stran", () => {
    expect(DEST_SRC).toContain(
      "href={`/destinacija/${encodeURIComponent(destination.slug)}`}"
    );
    expect(DEST_SRC).toContain('t("guideLink")');
    // povezava ne sproži modala (klik se ne širi na kartico)
    expect(DEST_SRC).toContain("onClick={(e) => e.stopPropagation()}");
  });

  test("homeDest.guideLink obstaja v VSEH 6 jezikih (neprazen)", () => {
    for (const [code, dict] of Object.entries(ALL_LOCALES)) {
      const v = (dict as Record<string, Record<string, string>>).homeDest?.guideLink;
      expect(v, `homeDest.guideLink za ${code}`).toBeTruthy();
      expect(v.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// ⑥ jezikovni aria — lokaliziran (ne več vedno slovensko)
// ---------------------------------------------------------------------------
describe("POLISH 1.173.0 ⑥ languageAria lokalizacija", () => {
  test("nav.languageAria + languageHeading + languageSheetHint v vseh 6 jezikih", () => {
    for (const [code, dict] of Object.entries(ALL_LOCALES)) {
      const nav = (dict as Record<string, Record<string, string>>).nav ?? {};
      expect(nav.languageAria, `nav.languageAria za ${code}`).toBeTruthy();
      expect(nav.languageAria).toContain("{current}");
      expect(nav.languageHeading, `nav.languageHeading za ${code}`).toBeTruthy();
      expect(nav.languageSheetHint, `nav.languageSheetHint za ${code}`).toBeTruthy();
    }
  });

  test("komponenta uporablja slovarske ključe (ne hardcoded SL aria)", () => {
    expect(LANG_SRC).toContain('t("languageAria"');
    expect(LANG_SRC).not.toContain("aria-label={`Izberi jezik");
  });
});
