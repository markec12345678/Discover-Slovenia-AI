// ============================================================================
// ISSUE #16 (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE LOSS)
// faza 2 — MOJA POT HUB · source-contract
// ----------------------------------------------------------------------------
// Issue §2 (MOJA POT = osrednji trip hub): „Uporabnik mora imeti en jasen
// odgovor na vprašanje: Kaj je moja pot in kaj je naslednji korak?"
//
//  1. MyTripView (src/components/my-trip-view.tsx) je VEDNO viden — prazna
//     zbirka NI več tišina (prej: `if (count === 0) return null;`), ampak
//     okvir naslednjega koraka ODKRIJ („Odkrij destinacije" → /destinacije).
//  2. Korak POJDI: trak NA POTI s primarnim CTA „Kam zdaj?" → /na-poti, ko
//     je v localStorage aktivna pot (dai:go-trip) — prej hub NI imel
//     NOBENEGA vhoda v Go Mode (največja vrzel audita #16 za hub).
//  3. Korak NAČRTUJ: „Nadaljuj načrtovanje" (obstoječi handoff tok) ostaja
//     glavna akcija, ko zbirka ni prazna in pot ni v teku (zero loss).
//  4. Hydration-varnost: goActive se bere SAMO v efektu (SSR brez
//     localStorage — isti kanon kot useMyTrip/useWishlist).
//  5. L tabela sl/en pariteta novih nizov (prazno stanje + GO trak).
//
// Source-contract (readFileSync) — brez uvozov @/app (kanon Task 28/33/34).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const VIEW_SRC = readFileSync(
  new URL("../../components/my-trip-view.tsx", import.meta.url),
  "utf8",
);
const HUB_PAGE_SRC = readFileSync(
  new URL("../../app/moja-potovanja/moja-potovanja-view.tsx", import.meta.url),
  "utf8",
);

describe("ISSUE #16 faza 2: MyTripView — hub je VEDNO viden", () => {
  test("ZERO-LOSS nasprotje: zgodnji return null je ODSTRANJEN (prej: tišina ob prazni zbirki)", () => {
    expect(VIEW_SRC).not.toContain("if (count === 0) return null;");
    expect(VIEW_SRC).not.toContain("return null;");
  });

  test("prazno stanje: okvir ODKRIJ s CTA na /destinacije (SL + EN)", () => {
    // SL nizi
    expect(VIEW_SRC).toContain('title: "Zbirka je še prazna"');
    expect(VIEW_SRC).toContain(
      'body: "Razišči Slovenijo in z gumbom „Dodaj v mojo pot“ shrani, kar te zanima — vse se steka sem."'
    );
    expect(VIEW_SRC).toContain('cta: "Odkrij destinacije"');
    expect(VIEW_SRC).toContain('ctaAria: "Odpri seznam destinacij in začni odkrivati"');
    // EN nizi (pariteta)
    expect(VIEW_SRC).toContain('title: "Your collection is empty"');
    expect(VIEW_SRC).toContain('cta: "Discover destinations"');
    expect(VIEW_SRC).toContain('ctaAria: "Open the destinations list and start exploring"');
    // CTA vodi na korak ODKRIJ
    expect(VIEW_SRC).toContain('href="/destinacije"');
  });

  test("prazno stanje: izris je pogojen s count === 0 (subtitle + kartica)", () => {
    expect(VIEW_SRC).toContain("count === 0 ? s.empty.subtitle : s.subtitle(count)");
    expect(VIEW_SRC).toContain("{count === 0 && (");
  });

  test("header akcije (Počisti + Nadaljuj) samo pri neprazni zbirki — prazno stanje brez hrupa", () => {
    expect(VIEW_SRC).toContain("{count > 0 && (");
  });
});

describe("ISSUE #16 faza 2: korak POJDI — trak NA POTI (dai:go-trip)", () => {
  test("detekcija aktivne poti prek loadGoTrip (go-persist vir resnice)", () => {
    expect(VIEW_SRC).toContain('from "@/lib/journey/go-persist"');
    expect(VIEW_SRC).toContain("loadGoTrip() !== null");
    expect(VIEW_SRC).toContain("setGoActive");
  });

  test("hydration-varnost: goActive se bere SAMO v efektu (SSR brez localStorage)", () => {
    // useState(false) izhodišče + useEffect branje — isti kanon kot useMyTrip
    expect(VIEW_SRC).toContain("const [goActive, setGoActive] = useState(false)");
    expect(VIEW_SRC).toContain("useEffect(() => {");
  });

  test("trak NA POTI: oznaka + naslov + CTA „Kam zdaj?“ → /na-poti (SL + EN)", () => {
    // SL
    expect(VIEW_SRC).toContain('label: "Na poti"');
    expect(VIEW_SRC).toContain('title: "Tvoja pot je v teku"');
    expect(VIEW_SRC).toContain('cta: "Kam zdaj?"');
    // EN
    expect(VIEW_SRC).toContain('label: "On the road"');
    expect(VIEW_SRC).toContain('title: "Your trip is underway"');
    expect(VIEW_SRC).toContain('cta: "Where to now?"');
    // CTA vodi na korak POJDI (/na-poti) — prej hub NI imel NOBENEGA vhoda
    expect(VIEW_SRC).toContain('href="/na-poti"');
    // izris pogojen z goActive
    expect(VIEW_SRC).toContain("{goActive && (");
  });

  test("trak je vizualno ločen (primary tint + Navigation ikona — POJDI model)", () => {
    expect(VIEW_SRC).toContain("border-primary/30 bg-primary/5");
    expect(VIEW_SRC).toContain("<Navigation");
  });
});

describe("ISSUE #16 faza 2: zero-loss — obstoječi tokovi huba", () => {
  test("korak NAČRTUJ ostaja: Nadaljuj načrtovanje (handoff) + Počisti z undo", () => {
    expect(VIEW_SRC).toContain('continue: "Nadaljuj načrtovanje"');
    expect(VIEW_SRC).toContain("setMyTripHandoff()");
    expect(VIEW_SRC).toContain('clear: "Počisti"');
    expect(VIEW_SRC).toContain("clearMyTripItems()");
    expect(VIEW_SRC).toContain('continue: "Continue planning"');
  });

  test("wishlist trak (F3-D most) ostaja viden TUDI ob prazni zbirki (korak DODAJ)", () => {
    // pogoj je wishlistEntries.length > 0 — NE count > 0 (prazna zbirka +
    // priljubljene = most deluje)
    expect(VIEW_SRC).toContain("{wishlistEntries.length > 0 && (");
    expect(VIEW_SRC).not.toContain("count > 0 && wishlistEntries.length");
  });

  test("skupine zbirke se izrisujejo samo pri neprazni zbirki (brez praznega bloka)", () => {
    expect(VIEW_SRC).toContain('{count > 0 && (\n      <div className="mt-4 space-y-5">');
  });

  test("/moja-potovanja še vedno izrisuje MyTripView (hub lupina — zero loss)", () => {
    expect(HUB_PAGE_SRC).toContain("<MyTripView");
  });

  test("44px dot-tarče na novih CTA (prazno stanje + GO trak — kanon primitiv)", () => {
    expect(VIEW_SRC).toContain("min-h-11");
  });
});
