// ============================================================================
// ISSUE #5 / T5-B (H1) — SMARTSEARCH NAVIGACIJA: rezultati niso več mrtvi kliki
// ============================================================================
// Vrzel (revizija T5-a2 #1, HIGH): navigation.tsx:420 je izrisoval
// <SmartSearch> BREZ onSelectDestination → klik na destinacijo je bil no-op
// (optional chaining v komponenti), listings/izdelki/doživetja pa so imeli
// onClick = samo handleClose(). Edino globalno iskanje platforme je konvergiralo
// v slepo ulico — discover → detail lijak je bil prelomljen.
//
// Fix (T5-b2): ena točka resnice za preslikavo v src/lib/search-result-nav.ts
// (čista funkcija, 0 uvozov), navigation.tsx priklopi onSelectDestination
// (locale-zaveden router iz @/i18n/navigation), komponenta pa navigira VSE
// štiri skupine. Ta test varuje:
//   1. preslikavo (unit — vse vrste + neznan tip → null),
//   2. kanonične slug-e iz DESTINATIONS (id ≠ slug primeri),
//   3. priklop v navigation.tsx + vse štiri skupine v smart-search.tsx
//      (source-contract, vzorec fa-acceptance-fixes.test.ts),
//   4. strežniško slug preslikavo v /api/smart-search (AI NE izmišlja slug-a).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  destinationHref,
  searchResultHref,
  type SmartSearchResultRef,
} from "@/lib/search-result-nav";
import { DESTINATIONS } from "@/lib/slovenia-data";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const navigationSrc = read("src/components/sections/navigation.tsx");
const smartSearchSrc = read("src/components/smart-search.tsx");
const smartSearchRouteSrc = read("src/app/api/smart-search/route.ts");

// ─────────────────────────────────────────────────────────────────────────
// 1. Preslikava — unit (čista funkcija, brez Reacta)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/H1: searchResultHref preslikava (en vir resnice)", () => {
  test("destinacija s slug-om → /destinacija/[slug]", () => {
    expect(
      searchResultHref({ kind: "destination", id: "bled", slug: "bled" })
    ).toBe("/destinacija/bled");
  });

  test("destinacija z id ≠ slug → slug je PREDNOSTEN (4 od 38 primerov)", () => {
    // postojna → postojnska-jama je realen id≠slug par (revizija T5-a2/a3)
    expect(
      searchResultHref({
        kind: "destination",
        id: "postojna",
        slug: "postojnska-jama",
      })
    ).toBe("/destinacija/postojnska-jama");
  });

  test("destinacija brez slug-a → id je veljavna rezerva", () => {
    expect(searchResultHref({ kind: "destination", id: "bled", slug: null })).toBe(
      "/destinacija/bled"
    );
  });

  test("listing → /lokali (imenik — modal nima globoke povezave)", () => {
    expect(searchResultHref({ kind: "listing", id: "l-1" })).toBe("/lokali");
  });

  test("product → /trznica (privzeti zavihek izdelkov)", () => {
    expect(searchResultHref({ kind: "product", id: "p-1" })).toBe("/trznica");
  });

  test("experience → /dozivetja", () => {
    expect(searchResultHref({ kind: "experience", id: "e-1" })).toBe("/dozivetja");
  });

  test("neznan tip → null (klical naj NE navigira — defenzivna rezerva)", () => {
    const unknown = { kind: "future-kind", id: "x" } as unknown as SmartSearchResultRef;
    expect(searchResultHref(unknown)).toBeNull();
  });

  test("destinationHref kodira segment (encodeURIComponent)", () => {
    expect(destinationHref("neki rod s presledkom")).toBe(
      "/destinacija/neki%20rod%20s%20presledkom"
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. Kanonični podatki — vsaka destinacija ima uporaben slug
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/H1: DESTINATIONS slug resnica", () => {
  test("vsaka destinacija ima neprazen slug", () => {
    for (const d of DESTINATIONS) {
      expect(typeof d.slug === "string" && d.slug.length > 0).toBe(true);
    }
  });

  test("preslikava za VSE destinacje da kanonski /destinacija/[slug]", () => {
    for (const d of DESTINATIONS) {
      expect(searchResultHref({ kind: "destination", id: d.id, slug: d.slug })).toBe(
        `/destinacija/${d.slug}`
      );
    }
  });

  test("obstaja vsaj ena destinacija z id ≠ slug (razlog za prednost slug-a)", () => {
    const differing = DESTINATIONS.filter((d) => d.id !== d.slug);
    expect(differing.length).toBeGreaterThan(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. Priklop v komponente (source-contract)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/H1: priklop navigacije (source-contract)", () => {
  test("navigation.tsx podaja onSelectDestination komponenti SmartSearch", () => {
    expect(navigationSrc).toContain("onSelectDestination={handleSearchSelectDestination}");
    expect(navigationSrc).toContain("router.push(destinationHref(destIdOrSlug))");
    // router je locale-zaveden (EN uporabnik ob kliku NE izgubi jezika)
    expect(navigationSrc).toContain('useRouter } from "@/i18n/navigation"');
  });

  test("smart-search.tsx: destinacija — zunanja ključka PREDNOSTNO, rezerva navigateResult", () => {
    expect(smartSearchSrc).toContain("onSelectDestination(d.slug ?? d.id)");
    expect(smartSearchSrc).toContain(
      'navigateResult({ kind: "destination", id: d.id, slug: d.slug ?? null })'
    );
  });

  test("smart-search.tsx: listings niso več mrtev klik (navigateResult + close)", () => {
    expect(smartSearchSrc).toContain('navigateResult({ kind: "listing", id: l.id })');
  });

  test("smart-search.tsx: izdelki niso več mrtev klik", () => {
    expect(smartSearchSrc).toContain('navigateResult({ kind: "product", id: p.id })');
  });

  test("smart-search.tsx: doživetja niso več mrtev klik", () => {
    expect(smartSearchSrc).toContain('navigateResult({ kind: "experience", id: e.id })');
  });

  test("stare mrtve veje (onClick: () => handleClose()) ne obstajajo več", () => {
    expect(smartSearchSrc).not.toContain("onClick: () => handleClose()");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 4. Strežniška slug preslikava (AI NE izmišlja slug-a)
// ─────────────────────────────────────────────────────────────────────────

describe("T5-B/H1: /api/smart-search strežniško prilepi slug", () => {
  test("id → slug preslikava iz kanonskega dataseta (destSlugById)", () => {
    expect(smartSearchRouteSrc).toContain(
      "const destSlugById = new Map(DESTINATIONS.map((d) => [d.id, d.slug] as const))"
    );
    expect(smartSearchRouteSrc).toContain("slug: destSlugById.get(d.id) ?? d.id");
  });

  test("fallback (keyword) pot vrača slug enako kot AI pot", () => {
    expect(smartSearchRouteSrc).toContain("slug,");
  });

  test("odgovor deklarira slug v destinacijskih rezultatih (interface)", () => {
    expect(smartSearchRouteSrc).toMatch(/destinations:\s*Array<\{/);
    expect(smartSearchRouteSrc).toContain("slug: string;");
  });
});
