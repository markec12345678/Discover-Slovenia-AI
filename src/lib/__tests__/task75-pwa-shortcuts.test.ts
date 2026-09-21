import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

// ============================================================================
// TASK 75 — PWA SHORTCUTS ISKRENOST (nadaljevanje PWA drobnosti)
//
// Manifest shortcuts (dolgi pritisk ikone aplikacije) so obljubili
// „/?section=načrtuj" vzorec iz časov ENOSTRANSKE aplikacije — danes so to
// LOČENE strani (/nacrtuj, /zemljevid, /trznica, /destinacije). Uporabnik,
// ki je izbral shortcut „Zemljevid", je pristal na domači strani BREZ
// zemljevida — prazna obljuba (isti kanon kot TASK 71 „1 klik").
//
// Ta test TRAJNO varuje:
//   A) vsak shortcut URL vodi na DEJANSKO obstoječo stran (fs check),
//   B) stari „?section=" vzorec se ne more vrniti (utrulec),
//   C) shortcut ikone + manifest ikone/screenshots obstajajo in imajo
//      DEJANSKE dimenzije, kot manifest trdi (PNG glava),
//   D) vsak shortcut ima ime + opis (obljuba z vsebino).
// ============================================================================

const ROOT = process.cwd();
const MANIFEST = JSON.parse(
  readFileSync(path.join(ROOT, "public", "manifest.json"), "utf-8")
) as {
  shortcuts?: { name: string; short_name?: string; description?: string; url: string; icons?: { src: string; sizes: string }[] }[];
  icons?: { src: string; sizes: string; type: string; purpose?: string }[];
  screenshots?: { src: string; sizes: string; form_factor: string }[];
};

/** Prebere dimenzije PNG iz glave (IHDR) — 0×0 pomeni „ni veljaven PNG". */
function pngSize(file: string): { w: number; h: number } {
  const b = readFileSync(file);
  if (b.length < 24 || b.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    return { w: 0, h: 0 };
  }
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** Ali shortcut URL ustreza obstoječi App Router strani?
 *  Podpira samo korenaste poti ( „/zemljevid") — to je edini vzorec,
 *  ki ga shortcuts smejo obljubiti (ločene strani, ne query sekcije). */
function pageExists(url: string): boolean {
  if (!/^\/[a-z0-9-]*$/.test(url)) return false;
  const page = path.join(ROOT, "src", "app", url.slice(1), "page.tsx");
  return existsSync(page);
}

describe("TASK 75: PWA shortcuts — obljuba mora držati", () => {
  test("① vsak shortcut URL vodi na DEJANSKO obstoječo stran", () => {
    expect(MANIFEST.shortcuts?.length).toBeGreaterThanOrEqual(4);
    for (const s of MANIFEST.shortcuts!) {
      expect(
        pageExists(s.url),
        `shortcut „${s.name}" obljublja ${s.url}, a stran ne obstaja`
      ).toBe(true);
    }
  });

  test("② stari ?section= vzorec se NI vrnil (utrulec)", () => {
    for (const s of MANIFEST.shortcuts!) {
      expect(s.url.includes("?")).toBe(false);
      expect(s.url.includes("section=")).toBe(false);
    }
  });

  test("③ štiri znane shortcuts kažejo na prave cilje", () => {
    const byName = new Map(MANIFEST.shortcuts!.map((s) => [s.name, s.url]));
    expect(byName.get("AI načrtovalec")).toBe("/nacrtuj");
    expect(byName.get("Zemljevid")).toBe("/zemljevid");
    expect(byName.get("Tržnica")).toBe("/trznica");
    expect(byName.get("Destinacije")).toBe("/destinacije");
  });

  test("④ vsak shortcut ima ime + opis (obljuba z vsebino)", () => {
    for (const s of MANIFEST.shortcuts!) {
      expect(s.name.length).toBeGreaterThan(2);
      expect((s.description ?? "").length).toBeGreaterThan(5);
    }
  });

  test("⑤ shortcut ikone obstajajo", () => {
    for (const s of MANIFEST.shortcuts!) {
      for (const ic of s.icons ?? []) {
        expect(
          existsSync(path.join(ROOT, "public", ic.src.replace(/^\//, ""))),
          `ikona ${ic.src} manjka`
        ).toBe(true);
      }
    }
  });
});

describe("TASK 75: manifest ikone/screenshots — dimenzije morajo držati", () => {
  test("⑥ vse manifest ikone obstajajo in imajo DEJANSKE dimenzije", () => {
    expect(MANIFEST.icons?.length).toBeGreaterThanOrEqual(4);
    for (const ic of MANIFEST.icons!) {
      const file = path.join(ROOT, "public", ic.src.replace(/^\//, ""));
      expect(existsSync(file), `ikona ${ic.src} manjka`).toBe(true);
      const [w, h] = ic.sizes.split("x").map(Number);
      const real = pngSize(file);
      expect(
        real.w === w && real.h === h,
        `${ic.src}: manifest trdi ${ic.sizes}, PNG glava pa ${real.w}x${real.h}`
      ).toBe(true);
    }
  });

  test("⑦ screenshots obstajajo in imajo DEJANSKE dimenzije + form_factor", () => {
    expect(MANIFEST.screenshots?.length).toBeGreaterThanOrEqual(2);
    const factors = new Set<string>();
    for (const sc of MANIFEST.screenshots!) {
      const file = path.join(ROOT, "public", sc.src.replace(/^\//, ""));
      expect(existsSync(file), `screenshot ${sc.src} manjka`).toBe(true);
      const [w, h] = sc.sizes.split("x").map(Number);
      const real = pngSize(file);
      expect(
        real.w === w && real.h === h,
        `${sc.src}: manifest trdi ${sc.sizes}, PNG glava pa ${real.w}x${real.h}`
      ).toBe(true);
      factors.add(sc.form_factor);
    }
    // Install promo potrebuje wide + narrow (Chrome zahteva vsaj enega,
    // mi obljubljiva oba — to je del že obstoječe vsebine).
    expect(factors.has("wide")).toBe(true);
    expect(factors.has("narrow")).toBe(true);
  });
});
