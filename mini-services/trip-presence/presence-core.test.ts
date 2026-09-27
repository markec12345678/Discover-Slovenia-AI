// ============================================================================
// ISSUE #13 / P2-2 (UX-BENCHMARK 2026 §4 G2) — trip-presence ČISTA LOGIKA
// ----------------------------------------------------------------------------
// presence-core.ts je ZERO-dep (brez socket.io) → ta test teče v glavnem
// CI-ju (`bun test` iz roota najde datoteko). Socket.io ovoj (index.ts) je
// pokrit prek source-contract testa v src/lib/__tests__/task13-p2-*.test.ts
// (isti razlog kot TASK 8: glavni package.json nima socket.io odvisnosti).
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  BROADCAST_INTERVAL_MS,
  EDIT_TTL_MS,
  buildState,
  isEditing,
  isValidShareId,
  sanitizeName,
  type PresencePeer,
} from "./presence-core";

const peer = (over: Partial<PresencePeer>): PresencePeer => ({
  socketId: "s1",
  name: null,
  editingAt: 0,
  ...over,
});

describe("sanitizeName — iskrenost (NE izmišljamo imen)", () => {
  test("ne-niz → null (obiskovalec brez imena)", () => {
    expect(sanitizeName(undefined)).toBeNull();
    expect(sanitizeName(42)).toBeNull();
    expect(sanitizeName(null)).toBeNull();
  });

  test("prazen/whitespace → null (anonimen)", () => {
    expect(sanitizeName("")).toBeNull();
    expect(sanitizeName("   ")).toBeNull();
    expect(sanitizeName("\n\t")).toBeNull();
  });

  test("veljavno ime → trim + ohrani", () => {
    expect(sanitizeName("  Anja Novak ")).toBe("Anja Novak");
    expect(sanitizeName("Jože")).toBe("Jože");
  });

  test("max 40 znakov + kontrolni znaki ven", () => {
    expect(sanitizeName("a".repeat(60)).length).toBe(40);
    expect(sanitizeName("Anja\u0000\u001fNovak")).toBe("AnjaNovak");
  });
});

describe("isValidShareId — isti kanon kot /pot stran", () => {
  test("hex/alnum 1–32 veljaven", () => {
    expect(isValidShareId("e2eg3test1")).toBe(true);
    expect(isValidShareId("a")).toBe(true);
    expect(isValidShareId("a".repeat(32))).toBe(true); // točno 32 → meja velja
  });

  test("velike črke/presledki/predolg/ne-niz → zavrnjen", () => {
    expect(isValidShareId("ABC123")).toBe(false);
    expect(isValidShareId("a b")).toBe(false);
    expect(isValidShareId("")).toBe(false);
    expect(isValidShareId(123)).toBe(false);
    expect(isValidShareId("../evil")).toBe(false);
  });
});

describe("buildState — agregat BREZ socket ID-jev", () => {
  const T0 = 1_000_000;

  test("prazna soba → 0 gledalcev, 0 urejevalcev", () => {
    expect(buildState([], T0)).toEqual({ viewers: 0, editors: [] });
  });

  test("gledalci štejejo VSE (vključno z anonimnimi brez imena)", () => {
    const peers = [
      peer({ socketId: "a", name: "Anja" }),
      peer({ socketId: "b", name: null }),
      peer({ socketId: "c", name: "Bojan", editingAt: 0 }),
    ];
    const state = buildState(peers, T0);
    expect(state.viewers).toBe(3);
    expect(state.editors).toEqual([]);
  });

  test("editing signal velja EDIT_TTL_MS, potem izteče", () => {
    const editors = [peer({ socketId: "a", name: "Anja", editingAt: T0 - 1_000 })];
    expect(buildState(editors, T0).editors).toEqual([{ name: "Anja" }]);
    // točno na meji TTL še velja (strogo manj kot TTL)
    expect(buildState(editors, T0 - 1_000 + EDIT_TTL_MS - 1).editors).toHaveLength(1);
    // po TTL ne ve
    expect(buildState(editors, T0 - 1_000 + EDIT_TTL_MS).editors).toEqual([]);
  });

  test("editingAt = 0 (nikoli) NIKOLI ne šteje — tudi ne pri now=0", () => {
    expect(buildState([peer({ editingAt: 0 })], 0).editors).toEqual([]);
  });

  test("izhod vsebuje SAMO {name} — brez socketId/editingAt", () => {
    const state = buildState(
      [peer({ socketId: "secret", name: "Anja", editingAt: Date.now() })],
      Date.now()
    );
    expect(state.editors).toEqual([{ name: "Anja" }]);
    expect(JSON.stringify(state)).not.toContain("secret");
    expect(JSON.stringify(state)).not.toContain("socketId");
    expect(JSON.stringify(state)).not.toContain("editingAt");
  });

  test("več urejevalcev istočasno (soba 2+ urejevalcev)", () => {
    const now = Date.now();
    const state = buildState(
      [
        peer({ socketId: "a", name: "Anja", editingAt: now - 500 }),
        peer({ socketId: "b", name: "Bojan", editingAt: now - 1_000 }),
        peer({ socketId: "c", name: null, editingAt: now - 2_000 }),
      ],
      now
    );
    expect(state.viewers).toBe(3);
    expect(state.editors).toEqual([{ name: "Anja" }, { name: "Bojan" }, { name: null }]);
  });
});

describe("isEditing — izpostavljena meja TTL", () => {
  test("meja je EDIT_TTL_MS (6 s) — kanon iz načrta", () => {
    expect(EDIT_TTL_MS).toBe(6_000);
    expect(BROADCAST_INTERVAL_MS).toBe(2_000);
    expect(isEditing(peer({ editingAt: 100 }), 100 + EDIT_TTL_MS - 1)).toBe(true);
    expect(isEditing(peer({ editingAt: 100 }), 100 + EDIT_TTL_MS)).toBe(false);
  });
});
