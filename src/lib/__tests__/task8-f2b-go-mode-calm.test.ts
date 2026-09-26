// ============================================================================
// TASK 8 / F2-B (Issue #8 §24 GO MODE — "calm and focused") — pomiritev
// ============================================================================
// Spremembe, ki jih ta datoteka varuje:
//   1. /na-poti hero: vidni podnaslov POMIRJEN na eno vrstico (prej
//      3-vrstični zid besedila — šum pred NOW kartico); meta opis (SEO)
//      ostaja nespremenjen;
//   2. go-mode.tsx: hierarhija NOW → NEXT → HOW — GPS NADZOR kartica je
//      premaknjena POD naslednjo (NEXT) kartico (prej je prekinjala
//      primarni tok med dnevno navigacijo in NASLEDNJE);
//   3. ZERO-LOSS: vsa obstoječa Go Mode zmožnostja ostajajo (GPS
//      start/stop, natančnost, ETA, vreme, ure, zamudi opomba, navigacija,
//      opravljanje, dnevi, pot dneva, preostali postanki).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const pageSrc = read("src/app/na-poti/page.tsx");
const goModeSrc = read("src/components/sections/go-mode.tsx");

describe("TASK 8 / F2-B: Go Mode pomiritev — source contract", () => {
  test("hero podnaslov: ena pomirjena vrstica (SL + EN), brez starega zidu besedila", () => {
    // Nova pomirjena verzija
    expect(pageSrc).toContain(
      "Kaj je zdaj, kaj je naslednje. Načrt je na tvoji napravi — deluje tudi brez signala."
    );
    expect(pageSrc).toContain(
      "What's now, what's next. Your plan lives on your device — it works offline too."
    );
    // Stari 3-vrstični zid je ODSTRANJEN iz vidnega podnaslova
    expect(pageSrc).not.toContain("Tvoj sopotnik med potovanjem po Sloveniji");
    expect(pageSrc).not.toContain(
      "Your companion while traveling across Slovenia, Croatia, Montenegro and Albania"
    );
  });

  test("SEO meta opis ostaja POPOLN (zero-loss na odkritju)", () => {
    // metaDescription nosi celoten opis (ni skrajšan)
    expect(pageSrc).toContain("metaDescription");
    expect(pageSrc).toContain(
      "Med potovanjem: naslednja postanka tvojega načrta, razdalja in smer do nje (GPS), opravljene postanke."
    );
    expect(pageSrc).toContain("generateMetadata");
    expect(pageSrc).toContain("hreflangForPath");
  });

  test("hierarhija: GPS NADZOR (HOW) je ZA NASLEDNJO (NEXT) kartico", () => {
    const nextIdx = goModeSrc.indexOf("NASLEDNJE (hero kartica)");
    const gpsIdx = goModeSrc.indexOf("GPS NADZOR (HOW)");
    expect(nextIdx).toBeGreaterThan(-1);
    expect(gpsIdx).toBeGreaterThan(-1);
    // GPS blok se pojavi PO bloku NASLEDNJE v izvorni zaporedju JSX
    expect(gpsIdx).toBeGreaterThan(nextIdx);
  });

  test("ZERO-LOSS: glava (NOW) ostaja prva kartica komponente", () => {
    const glavaIdx = goModeSrc.indexOf("GLAVA: naslov + živa ura + aktivni dan");
    const nextIdx = goModeSrc.indexOf("NASLEDNJE (hero kartica)");
    expect(glavaIdx).toBeGreaterThan(-1);
    expect(nextIdx).toBeGreaterThan(glavaIdx);
  });

  test("ZERO-LOSS: GPS zmožnosti nespremenjene (start/stop/natančnost/hint)", () => {
    expect(goModeSrc).toContain("geo.start");
    expect(goModeSrc).toContain("geo.stop");
    expect(goModeSrc).toContain("L.gps.accuracy");
    expect(goModeSrc).toContain("GO_LABELS.positionHint");
    expect(goModeSrc).toContain("GO_LABELS.noPosition");
  });

  test("ZERO-LOSS: ostale Go Mode sekcije prisotne (dan/ETA/vreme/ure/ostanek)", () => {
    expect(goModeSrc).toContain("DNEVNA NAVIGACIJA");
    expect(goModeSrc).toContain("PREDVIDEN PRIHOD (ETA)");
    expect(goModeSrc).toContain("VREME PRI NASLEDNJI POSTANKI");
    expect(goModeSrc).toContain("POT DNEVA");
    expect(goModeSrc).toContain("OSTALE POSTANKE DNEVA");
    expect(goModeSrc).toContain("ZAMUDE/PROMET");
  });
});
