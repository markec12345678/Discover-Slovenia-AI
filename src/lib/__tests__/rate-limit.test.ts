import { describe, test, expect } from "bun:test";
import {
  buildLoginRateKey,
  hitLimit,
} from "@/lib/rate-limit";

// ============================================================================
// 1.28.0 (uporabnikova revizija #7): login rate limit — HIBRID ip+email.
//
// Prej `login:<email>`: napadalec je z 10 poskusi iz katerega koli IP
// blokiral prijavo žrtvi (trivialen DoS). Testi spodaj dobesedno kodirajo
// popravljeni vektor: napadalčev IP ima svoje vedro, žrtvin drug IP ni
// prizadet.
// ============================================================================

describe("buildLoginRateKey (hibrid ip+email)", () => {
  test("z IP: format login:<ip>:<email>", () => {
    expect(buildLoginRateKey("zrtev@test.si", "203.0.113.7")).toBe(
      "login:203.0.113.7:zrtev@test.si"
    );
  });

  test("brez IP (fallback): star vedenje login:<email>", () => {
    expect(buildLoginRateKey("zrtev@test.si", null)).toBe("login:zrtev@test.si");
  });

  test("email normaliziran (velike črke + presledki → lowercase/trim)", () => {
    expect(buildLoginRateKey("  Zrtev@Test.SI  ", "1.2.3.4")).toBe(
      "login:1.2.3.4:zrtev@test.si"
    );
  });

  test("IPv6 naslovi (dvopičja) ne zdrobijo formata ključa", () => {
    const key = buildLoginRateKey("a@b.si", "2001:db8::1");
    expect(key).toBe("login:2001:db8::1:a@b.si");
    // ključ je neprozoren niz za Map — dvopičja so varna
    expect(key.startsWith("login:2001:db8::1:")).toBe(true);
  });

  test("različen IP → različen ključ (istemail)", () => {
    expect(buildLoginRateKey("x@y.si", "1.1.1.1")).not.toBe(
      buildLoginRateKey("x@y.si", "2.2.2.2")
    );
  });
});

describe("hitLimit — DoS vektor odstranjen (revizija #7)", () => {
  test("napadalec iz enega IP porabi vedro; žrtev iz drugega IP NI blokirana", () => {
    const email = "zrtev-dos@test.si";
    const attacker = buildLoginRateKey(email, "203.0.113.77");
    const victim = buildLoginRateKey(email, "198.51.100.42");

    // Napadalec: 10 poskusov (dovoljenih), 11. zavrnjen
    for (let i = 0; i < 10; i++) {
      expect(hitLimit(attacker, 10, 15 * 60_000)).toBe(false);
    }
    expect(hitLimit(attacker, 10, 15 * 60_000)).toBe(true);

    // Žrtev iz DRUGAČNEGA IP: sveže vedro → prvi poskus dovoljen
    // (prej bi ta klic padel v napadalčevo izčrpano vedro email-only)
    expect(hitLimit(victim, 10, 15 * 60_000)).toBe(false);
  });

  test("isti IP, drug račun → ločeno vedro (ugibanje cilja na en račun)", () => {
    const ip = "203.0.113.99";
    const first = buildLoginRateKey("prvi@test.si", ip);
    const second = buildLoginRateKey("drugi@test.si", ip);

    for (let i = 0; i < 10; i++) hitLimit(first, 10, 15 * 60_000);
    expect(hitLimit(first, 10, 15 * 60_000)).toBe(true);
    expect(hitLimit(second, 10, 15 * 60_000)).toBe(false);
  });
});
