// ============================================================================
// ISSUE #13 / P2 val (UX-BENCHMARK 2026 §4) — G9 drag ghost/snap + G2
// prisotnost + P2-3 mobilna bottom-nav · source-contract
// ----------------------------------------------------------------------------
// Pokriva tretji (zadnji) implementacijski val Issue #13:
//  1. G9 (P2-1): drag ghost + drop-snap duša (itinerary-planner +
//     globals.css .dsa-drag-ghost/.dsa-drop-snap) z prefers-reduced-motion
//     varovalom; ZERO LOSS puščic ↑/↓ (trije vhodi kanon).
//  2. G2 (P2-2): mini-services/trip-presence (socket.io port 3003) +
//     use-trip-presence hook (LAZY socket.io-client, RELATIVNA povezava
//     XTransformPort — NIKOLI absolutna URL) + TripPresence indikator na
//     /pot (self-suppression, praznina je poštena, fail-silent).
//  3. P2-3: MobileTabBar ŽE izpolnjuje specifikacijo (TASK 8/D8-E — 5
//     zavihkov ≥44px, safe-area, FAB dvig); ta test dokumentira dokaz.
// Source-contract (readFileSync) — brez uvozov @/app → brez TASK 76
// obveznosti (kanon Task 28/33/34/35).
// ============================================================================
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(ROOT, rel), "utf8");

const plannerSrc = read("src/components/sections/itinerary-planner.tsx");
const globalsSrc = read("src/app/globals.css");
const presenceCoreSrc = read("mini-services/trip-presence/presence-core.ts");
const presenceSrvSrc = read("mini-services/trip-presence/index.ts");
const presenceHookSrc = read("src/hooks/use-trip-presence.ts");
// W2 (1.131.0): konfiguracija povezave (LAZY import, path "", XTransformPort,
// omejeni reconnect) je prestavljena v DELJEN singleton
// src/lib/trip-presence-socket.ts — ena povezava na brskalnik (prisotnost +
// skupinski klepet), da števec prisotnih ostane iskren.
const presenceSocketLibSrc = read("src/lib/trip-presence-socket.ts");
const presenceCompSrc = read("src/components/trip-presence.tsx");
// D7 (1.140.0): lupina + izris /pot seje živita v skupnem SharedTripScreen
// (page.tsx je tanka ovojnica) — source-contract bere zaslon.
const potPageSrc = read("src/app/pot/shared-trip-screen.tsx");
const tabbarSrc = read("src/components/mobile-tab-bar.tsx");
const pkgSrc = read("package.json");

/** Koda brez komentarjev — literalni testi ne smejo pasti zaradi pojasnil
 *  (kanon task32). */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
}

// ─────────────────────────────────────────────────────────────────────────
// 1. G9 — DRAG GHOST + SNAP (P2-1)
// ─────────────────────────────────────────────────────────────────────────

describe("G9 (P2-1): drag ghost + drop snap — CSS duša", () => {
  test("globals.css ima .dsa-drag-ghost (opacity + rotate) in .dsa-drop-snap (150ms)", () => {
    expect(globalsSrc).toContain(".dsa-drag-ghost");
    expect(globalsSrc).toContain(".dsa-drop-snap");
    expect(globalsSrc).toContain("@keyframes dsa-drop-snap");
    // Spec načrta Issue #13: ghost = opacity-60 rotate-2.
    expect(globalsSrc).toContain("opacity: 0.6");
    expect(globalsSrc).toContain("rotate(2deg)");
    // Snap = 150 ms ease.
    expect(globalsSrc).toContain("animation: dsa-drop-snap 150ms ease-out");
  });

  test("VAROVALO: prefers-reduced-motion izklopi rotacijo in snap animacijo", () => {
    // Načrt P2-1: „prefers-reduced-motion → brez animacij".
    const reduced = globalsSrc.slice(
      globalsSrc.lastIndexOf("@media (prefers-reduced-motion: reduce)")
    );
    expect(reduced).toContain(".dsa-drag-ghost");
    expect(reduced).toContain("transform: none");
    expect(reduced).toContain(".dsa-drop-snap");
    expect(reduced).toContain("animation: none");
  });
});

describe("G9 (P2-1): itinerary-planner — ghost na izvoru, snap na ciljih", () => {
  const code = stripComments(plannerSrc);

  test("stanje snapDrop + triggerSnap + timeout cleanup", () => {
    expect(code).toContain("snapDrop");
    expect(code).toContain("triggerSnap");
    // Timeout počiščen ob unmountu (brez setState na mrtvi komponenti).
    expect(code).toContain("clearTimeout(snapTimer.current)");
  });

  test("ghost razred na IZVORNI kartici (dragging ujemanje day+idx)", () => {
    expect(code).toContain('"dsa-drag-ghost"');
    // Izvor: dragging.day === day.day && dragging.idx === idx.
    expect(code).toMatch(
      /dragging &&\s*dragging\.day === day\.day &&\s*dragging\.idx === idx &&\s*"dsa-drag-ghost"/
    );
  });

  test("snap razred na ciljnih karticah (within-day postavka + cross-day dan)", () => {
    expect(code).toContain('"dsa-drop-snap"');
    // Within-day: stop-row (ciljni idx).
    expect(code).toMatch(/snapDrop\?\.day === day\.day &&\s*snapDrop\.idx === idx &&\s*"dsa-drop-snap"/);
    // Cross-day: kartica dneva (idx -1 = sentinel celi dan — handler vidi
    // še STARO day.locations.length, render pa NOVO, zato ne indeksiramo).
    expect(code).toMatch(
      /snapDrop\?\.day === day\.day &&\s*snapDrop\.idx === -1 &&\s*"dsa-drop-snap"/
    );
  });

  test("triggerSnap kličejo OBE drop poti (M7 within-day + G1 cross-day)", () => {
    const withDay = code.indexOf("applyStopReorder(day, dragging.idx, idx)");
    expect(withDay).toBeGreaterThan(0);
    expect(code.indexOf("triggerSnap(day.day, idx)", withDay)).toBeGreaterThan(withDay);

    const crossDay = code.indexOf("applyStopCrossDayDrop(dragging.day, dragging.idx, day)");
    expect(crossDay).toBeGreaterThan(0);
    expect(code.indexOf("triggerSnap(day.day, -1)", crossDay)).toBeGreaterThan(crossDay);
  });

  test("ZERO LOSS: puščici ↑/↓ (tipkovnica/dotik/AI — trije vhodi) ostanejo", () => {
    expect(code).toContain("applyStopReorder(day, idx, idx - 1)");
    expect(code).toContain("applyStopReorder(day, idx, idx + 1)");
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 2. G2 — PRISOTNOST (P2-2)
// ─────────────────────────────────────────────────────────────────────────

describe("G2 (P2-2): mini-service trip-presence — strežnik", () => {
  test("socket.io na KONSTANTNEM portu 3003 (kanon mini-servisov)", () => {
    expect(stripComments(presenceSrvSrc)).toContain("PORT = 3003");
  });

  test("path '/' (kanon gatewaya: io('/?XTransformPort=…'))", () => {
    expect(stripComments(presenceSrvSrc)).toContain('path: "/"');
  });

  test("dogodki: presence:join / presence:editing / presence:state / disconnect", () => {
    const code = stripComments(presenceSrvSrc);
    expect(code).toContain('"presence:join"');
    expect(code).toContain('"presence:editing"');
    expect(code).toContain('"presence:state"');
    expect(code).toContain('"disconnect"');
  });

  test("soba = trip:{shareId}; veljavna soba prek isValidShareId (isti RE kanon /pot)", () => {
    const code = stripComments(presenceSrvSrc);
    expect(code).toContain("`trip:${shareId}`");
    expect(code).toContain("isValidShareId");
  });
});

describe("G2 (P2-2): presence-core — čista logika (zero-dep)", () => {
  test("TTL urejanja 6 s + heartbeat 2 s (kanon iz načrta)", () => {
    expect(stripComments(presenceCoreSrc)).toContain("EDIT_TTL_MS = 6_000");
    expect(stripComments(presenceCoreSrc)).toContain("BROADCAST_INTERVAL_MS = 2_000");
  });

  test("sanitizeName + isValidShareId + buildState izvoženi (testabilnost)", () => {
    const code = stripComments(presenceCoreSrc);
    expect(code).toContain("export function sanitizeName");
    expect(code).toContain("export function isValidShareId");
    expect(code).toContain("export function buildState");
  });

  test("unit test obstaja ob core datoteki (glavni CI ga najde iz roota)", () => {
    expect(() => read("mini-services/trip-presence/presence-core.test.ts")).not.toThrow();
  });
});

describe("G2 (P2-2): use-trip-presence — klient (fail-silent kanon)", () => {
  const code = stripComments(presenceHookSrc);
  // W2: povezavo hrani deljen singleton — konfiguracija se preverja tam.
  const socketLib = stripComments(presenceSocketLibSrc);

  test("LAZY dynamic import socket.io-client (teža šele na /pot)", () => {
    // W2: LAZY import živi v singleton knjižnici (edini lastnik povezave).
    expect(socketLib).toContain('import("socket.io-client")');
  });

  test("RELATIVNA povezava: path '/' + XTransformPort query — NIKOLI absolutna URL", () => {
    expect(socketLib).toContain('path: "/"');
    expect(socketLib).toContain("XTransformPort");
    // Prepoved absolutnih naslovov (kanon gatewaya) — v obeh plasteh.
    expect(socketLib).not.toMatch(/(http|ws):\/\/localhost/);
    expect(socketLib).not.toMatch(/io\(\s*["']http/);
    expect(code).not.toMatch(/(http|ws):\/\/localhost/);
    expect(code).not.toMatch(/io\(\s*["']http/);
  });

  test("OMEJENI reconnect (kozmetična plast — po 4 poskusih tiho odneha)", () => {
    expect(socketLib).toContain("reconnectionAttempts");
    expect(socketLib).toMatch(/RECONNECT_ATTEMPTS = 4/);
  });

  test("W2: DELJEN singleton povezave (iskren števec prisotnih)", () => {
    // ena povezava na brskalnik — acquire/release z referenčnim štetjem
    expect(socketLib).toContain("acquireTripSocket");
    expect(socketLib).toContain("releaseTripSocket");
    expect(code).toContain("acquireTripSocket()");
    expect(code).toContain("releaseTripSocket()");
    // hook NIKOLI ne zapre/čisti SO-CONSUMERJEVIH listenerjev
    expect(code).not.toContain("removeAllListeners()");
  });

  test("editing signal debauncan 1 s + poslan SAMO na povezan socket", () => {
    expect(code).toContain("EDITING_DEBOUNCE_MS");
    expect(code).toMatch(/EDITING_DEBOUNCE_MS = 1_000/);
    expect(code).toContain("sock.connected");
  });

  test("disconnect → prisotnost POŠTENO pade na 0 (brez stale podatkov)", () => {
    expect(code).toContain("setViewers(0)");
    expect(code).toContain("setEditors([])");
  });

  test("glavni package.json ima socket.io-client (frontend odvisnost)", () => {
    expect(pkgSrc).toContain('"socket.io-client"');
  });
});

describe("G2 (P2-2): TripPresence komponenta — iskren indikator", () => {
  const code = stripComments(presenceCompSrc);

  test("SL/EN dvojezičnost (vzorec L objekta MobileTabBar)", () => {
    expect(code).toContain("editingOne");
    expect(code).toContain("editingGuest");
    expect(code).toContain("editingMany");
    expect(code).toContain("viewers");
    expect(code).toContain('locale === "en" ? "en" : "sl"');
  });

  test("PRAZNINA JE POŠTENA: 1 obiskovalec brez urejanja → null", () => {
    expect(code).toContain("visibleEditors.length === 0 && viewers < 2");
    expect(code).toContain("return null");
  });

  test("self-suppression: edini urejevalec z mojim imenom → brez chipa", () => {
    expect(code).toContain("soleEditorIsMe");
    expect(code).toContain("editors[0]?.name === myName");
  });

  test("editing signal SAMO iz dejanskih vnosov (document input, ne klik)", () => {
    expect(code).toContain('addEventListener("input"');
    expect(code).not.toContain('addEventListener("click"');
  });

  test("dostopnost: aria-live polite (mehka informacija)", () => {
    expect(code).toContain('aria-live="polite"');
  });

  test("utrip ikone samo z motion-safe (vestibularno varno)", () => {
    expect(code).toContain("motion-safe:animate-pulse");
  });
});

describe("G2 (P2-2): /pot stran — vpenjanje indikatorja", () => {
  test("TripPresence vpeta NAD sekcijo sodelovanja", () => {
    const comp = potPageSrc.indexOf("<TripPresence shareId={shareId} />");
    const collab = potPageSrc.indexOf("<TripCollaboration");
    expect(comp).toBeGreaterThan(0);
    expect(collab).toBeGreaterThan(comp);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// 3. P2-3 — MOBILNA BOTTOM-NAV (dokaz obstoječe pokritosti)
// ─────────────────────────────────────────────────────────────────────────

describe("P2-3: MobileTabBar ŽE izpolnjuje specifikacijo (dokaz TASK 8/D8-E)", () => {
  const code = stripComments(tabbarSrc);
  const tabbarGlobals = globalsSrc.slice(
    globalsSrc.indexOf('body[data-mobile-tabbar="true"]')
  );

  test("4+ slotov: Odkrij · Zemljevid · Moja pot · Pojdi · Več (nad spec 4-slot; Issue #16 model)", () => {
    for (const label of ["explore", "map", "myTrip", "go", "more"]) {
      expect(code).toContain(label);
    }
  });

  test("dot-tarče ≥44px + safe-area inset + aria-current (spec P2-3)", () => {
    expect(code).toContain("min-h-[44px]");
    expect(code).toContain("pb-[env(safe-area-inset-bottom,0px)]");
    expect(code).toContain('aria-current={active ? "page" : undefined}');
  });

  test("VAROVALO spec P2-3: chat FAB se dvigne nad vrstico (globals.css)", () => {
    expect(tabbarGlobals).toContain(".dsa-chat-fab");
    expect(tabbarGlobals).toContain(".dsa-chat-panel");
  });

  test("/pot živi pod lupino z MobileTabBar (isti shell kot TASK 8 D8-E)", () => {
    expect(potPageSrc).toContain('from "@/components/sections/navigation"');
    // (Navigation izrisuje MobileTabBar — pokrito v task8-e testu.)
  });
});
