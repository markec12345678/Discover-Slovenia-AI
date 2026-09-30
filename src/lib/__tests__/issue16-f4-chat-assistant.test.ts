// ============================================================================
// ISSUE #16 (UX/IA KONSOLIDACIJA — ONE JOURNEY, ONE HOME, ZERO FEATURE LOSS)
// faza 4 — KLEPET KOT ASISTENT ZNOTRAJ POTOVANJA · source-contract
// ----------------------------------------------------------------------------
// Issue §Klepet: „Klepet naj ne postane še en ločen ›izdelek‹ znotraj
// aplikacije. Ostane ASISTENT ZNOTRAJ UPORABNIKOVEGA POTOVANJA."
//
// Audit #16 vrzel #6: Chatbot je montiran na 18 straneh z AddToTrip na
// karticah krajev — MANJKAL je na /moja-potovanja (hub brez asistentnika)
// in /pot/[shareId] (deljena pot). Faza 4 zapre obe zadnji površini
// (18 → 20 strani).
//
// Source-contract (readFileSync) — brez uvozov @/app (kanon Task 28/33/34).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const HUB_PAGE_SRC = readFileSync(
  new URL("../../app/moja-potovanja/page.tsx", import.meta.url),
  "utf8",
);
const SHARED_TRIP_SRC = readFileSync(
  new URL("../../app/pot/shared-trip-screen.tsx", import.meta.url),
  "utf8",
);

/** 20 strani z montiranim Chatbotom (18 obstoječih + 2 novi iz #16 faze 4). */
const CHATBOT_PAGES: string[] = [
  "src/app/page.tsx",
  "src/app/destinacije/page.tsx",
  "src/app/dozivetja/page.tsx",
  "src/app/dogodki/page.tsx",
  "src/app/lokali/page.tsx",
  "src/app/trznica/page.tsx",
  "src/app/zemljevid/page.tsx",
  "src/app/slovenia-pass/page.tsx",
  "src/app/vodici/page.tsx",
  "src/app/vodici/[slug]/page.tsx",
  "src/app/nacrtuj/page.tsx",
  "src/app/potovanje/page.tsx",
  "src/app/na-poti/page.tsx",
  "src/app/destinacija/[slug]/page.tsx",
  "src/app/destinacija/[slug]/things-to-do/page.tsx",
  "src/app/destinacija/[slug]/guide/[type]/page.tsx",
  "src/app/destinacija/[slug]/itinerary/[duration]/page.tsx",
  "src/app/destinacija/[slug]/best-time-to-visit/[season]/page.tsx",
  // ISSUE #16 faza 4 — zadnji 2 površini:
  "src/app/moja-potovanja/page.tsx",
  "src/app/pot/shared-trip-screen.tsx",
];

describe("ISSUE #16 faza 4: klepet kot asistent — zadnji 2 površini", () => {
  test("/moja-potovanja (hub): Chatbot montiran za Footerjem", () => {
    expect(HUB_PAGE_SRC).toContain('import { Chatbot } from "@/components/chatbot"');
    expect(HUB_PAGE_SRC).toContain("<Chatbot />");
    // za Footerjem (lupina ostaja: Navigation solid + view + Footer + klepet)
    const footerIdx = HUB_PAGE_SRC.indexOf("<Footer />");
    const chatIdx = HUB_PAGE_SRC.indexOf("<Chatbot />");
    expect(chatIdx).toBeGreaterThan(footerIdx);
    // dokumentiran namen (#16 §Klepet — asistent znotraj potovanja)
    expect(HUB_PAGE_SRC).toContain("ISSUE #16 faza 4");
  });

  test("/pot/[shareId] (deljena pot): Chatbot montiran + print:hidden (PDF čist)", () => {
    expect(SHARED_TRIP_SRC).toContain('import { Chatbot } from "@/components/chatbot"');
    expect(SHARED_TRIP_SRC).toContain("<Chatbot />");
    // PDF izvoz ostane čist — .pot-page kanon (URL nogica edina v printu)
    const wrapIdx = SHARED_TRIP_SRC.indexOf('className="print:hidden"');
    const chatIdx = SHARED_TRIP_SRC.indexOf("<Chatbot />");
    expect(wrapIdx).toBeGreaterThan(-1);
    expect(chatIdx).toBeGreaterThan(wrapIdx);
    // za Footerjem
    const footerIdx = SHARED_TRIP_SRC.lastIndexOf("<Footer />");
    expect(chatIdx).toBeGreaterThan(footerIdx);
  });
});

describe("ISSUE #16 faza 4: zero-loss — vseh 20 strani z asistentom", () => {
  for (const page of CHATBOT_PAGES) {
    test(`${page} ima montiran Chatbot`, () => {
      const src = readFileSync(
        new URL(`../../${page.replace("src/app/", "app/")}`, import.meta.url),
        "utf8",
      );
      expect(src).toContain("<Chatbot");
    });
  }
});
