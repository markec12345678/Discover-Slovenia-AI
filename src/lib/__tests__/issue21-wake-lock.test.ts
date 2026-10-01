// ============================================================================
// ISSUE #21 §10 (1.161.0) — SCREEN WAKE LOCK: testi (vedenjski + source)
// ============================================================================
// Wake Lock API v bun/jsdom okolju ni na voljo — vedenjski del pokrije
// isWakeLockSupported() z/brz namestitve mocka (pošteno Stanje), celotna
// logika hooka (request/release/visibility/re-request) pa je zajeta v
// source-contract testih (isti kanon kot use-geolocation iz 1.159.0).
// ============================================================================

import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isWakeLockSupported } from "@/lib/journey/use-wake-lock";

// ---------------------------------------------------------------------------
// 1 — PODPORA (iskrena: brez API-ja NI obljube)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §10: isWakeLockSupported", () => {
  test("① brez wakeLock imenskega prostora → false (SSR/starejši brskalniki)", () => {
    // bun okolje nima navigator.wakeLock — pravo življenjsko stanje
    expect(isWakeLockSupported()).toBe(false);
  });

  test("② z veljavnim request() → true (strukturna preverba, ne try/catch glede)", () => {
    const nav = navigator as unknown as Record<string, unknown>;
    const sentinel = { release: async () => {}, released: false };
    nav.wakeLock = { request: async () => sentinel };
    try {
      expect(isWakeLockSupported()).toBe(true);
    } finally {
      delete nav.wakeLock;
    }
  });

  test("③ wakeLock BREZ funkcije request → false (delna implementacija ne šteje)", () => {
    const nav = navigator as unknown as Record<string, unknown>;
    nav.wakeLock = {};
    try {
      expect(isWakeLockSupported()).toBe(false);
    } finally {
      delete nav.wakeLock;
    }
  });
});

// ---------------------------------------------------------------------------
// 2 — SOURCE CONTRACT: življenjski cikel hooka (ista disciplina kot GPS)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §10: useWakeLock — source contract", () => {
  const src = readFileSync(
    join(import.meta.dir, "../journey/use-wake-lock.ts"),
    "utf8"
  );

  test("① SAMO screen tip (ne zvok/system — minimalen vpliv na baterijo)", () => {
    expect(src).toContain('request("screen")');
  });

  test("② sprostitev ob active=false + cleanup ob unmount (0 puščanja)", () => {
    // ref posodobitev SAMO znotraj efekta (react-hooks/refs — ne med renderjem):
    // natanko ENA pojavnost in ta je v useEffect telesu
    expect(src.match(/activeRef\.current = active/g)).toHaveLength(1);
    expect(src).toMatch(/useEffect\(\(\) => \{\s*activeRef\.current = active;\s*\}, \[active\]\);/);
    expect(src).toMatch(/void release\(\)/);
    // cleanup pot sprosti sentinel tudi kadar request še teče (disposed)
    expect(src).toContain("disposed = true");
  });

  test("③ visibilitychange → ponovni poskus SAMO dokler je active res true", () => {
    expect(src).toContain('"visibilitychange"');
    expect(src).toContain('document.visibilityState === "visible"');
    expect(src).toContain("activeRef.current");
  });

  test("④ zavrnitev request() NE sesuje (battery saver/vidnost — iskreno brez)", () => {
    expect(src).toMatch(/catch\s*\{/);
  });

  test("⑤ podpora se preverja STRUCTURNO (typeof funkcija — ne Goljufija z True)", () => {
    expect(src).toContain('typeof nav.wakeLock?.request === "function"');
  });

  test("⑥ NIČ se ne shranjuje (zasebnost — isti kanon kot GPS hook)", () => {
    expect(src).not.toContain("localStorage");
  });
});

// ---------------------------------------------------------------------------
// 3 — SOURCE CONTRACT: Go Mode integracija (delta D1)
// ---------------------------------------------------------------------------

describe("ISSUE #21 §10: go-mode.tsx — wake lock integracija", () => {
  const src = readFileSync(
    join(import.meta.dir, "../../components/sections/go-mode.tsx"),
    "utf8"
  );

  test("① hook se aktivira SAMO z aktivnim GPS watchem (uporabnikov začetek)", () => {
    expect(src).toContain('useWakeLock(geo.status === "active")');
  });

  test("② prikaz SAMO dejanskega stanja held (brez lažnih obljub)", () => {
    expect(src).toContain("wake.held");
    // supported-obljuba se NE prikazuje (brskalnik lahko odvzame)
    expect(src).not.toContain("wake.supported &&");
  });
});
