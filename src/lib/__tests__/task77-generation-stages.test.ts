// ============================================================================
// TASK 77 (1.73.4) — generation-stages: čista logika povratne informacije
// generiranja. 17 testov / 56 pričakovanj.
// ============================================================================
// Pokriva: meje faz (tipični začetki), števec m:ss (kleščenje negativnih/
// neveljavnih/drobih vrednosti), abort razločevalce (preklic ≠ timeout ≠
// tuji abort) in varovalke konstant (timeout ≥ 2× tipična zgornja meja,
// faze urejene naraščajoče, ključi enolični).
// ============================================================================

import { describe, expect, test } from "bun:test";

import {
  ABORT_REASON_CANCEL,
  ABORT_REASON_TIMEOUT,
  GENERATION_STAGES,
  GENERATION_TIMEOUT_SECONDS,
  formatGenerationElapsed,
  generationStageFor,
  isCancelledAbort,
  isTimeoutAbort,
  type GenerationStageKey,
} from "../generation-stages";

describe("TASK 77 — generationStageFor (meje faz)", () => {
  test("① 0 s in prve sekunde → supply (vreme+supply+ranking)", () => {
    expect(generationStageFor(0).key).toBe("supply");
    expect(generationStageFor(1).key).toBe("supply");
    expect(generationStageFor(7).key).toBe("supply");
    expect(generationStageFor(7.9).key).toBe("supply");
  });

  test("② na meji 8 s → compose (AI sestavljanje, najdaljša faza)", () => {
    expect(generationStageFor(8).key).toBe("compose");
    expect(generationStageFor(20).key).toBe("compose");
    expect(generationStageFor(29.99).key).toBe("compose");
  });

  test("③ na meji 30 s → verify (supply rebound + geo preverjanje)", () => {
    expect(generationStageFor(30).key).toBe("verify");
    expect(generationStageFor(89).key).toBe("verify");
    expect(generationStageFor(600).key).toBe("verify");
  });

  test("④ fail-closed: negativni/neveljavni vnosi → supply pri 0 s", () => {
    expect(generationStageFor(-5).key).toBe("supply");
    expect(generationStageFor(-0.1).key).toBe("supply");
    expect(generationStageFor(Number.NaN).key).toBe("supply");
    expect(generationStageFor(Number.POSITIVE_INFINITY).key).toBe("supply");
  });

  test("⑤ cela vrsta tipičnih časov se preslika po pričakovanih fazah", () => {
    const cases: Array<[number, GenerationStageKey]> = [
      [0, "supply"],
      [3, "supply"],
      [8, "compose"],
      [15, "compose"],
      [30, "verify"],
      [45, "verify"],
    ];
    for (const [elapsed, expected] of cases) {
      expect(generationStageFor(elapsed).key).toBe(expected);
    }
    expect(cases.length).toBe(6);
  });
});

describe("TASK 77 — formatGenerationElapsed (števec m:ss)", () => {
  test("① nič in prvi minute se izpišejo z ničlo pred sekundami", () => {
    expect(formatGenerationElapsed(0)).toBe("0:00");
    expect(formatGenerationElapsed(7)).toBe("0:07");
    expect(formatGenerationElapsed(9)).toBe("0:09");
  });

  test("② enomestne sekunde po minuti dobijo vodečo ničlo (1:05)", () => {
    expect(formatGenerationElapsed(65)).toBe("1:05");
    expect(formatGenerationElapsed(119)).toBe("1:59");
    expect(formatGenerationElapsed(90)).toBe("1:30");
  });

  test("③ večje vrednosti ostanejo m:ss (12:00), ne ure", () => {
    expect(formatGenerationElapsed(720)).toBe("12:00");
    expect(formatGenerationElapsed(601)).toBe("10:01");
  });

  test("④ fail-closed: drobni/negativni/neveljavni vnosi → 0:00", () => {
    expect(formatGenerationElapsed(7.9)).toBe("0:07");
    expect(formatGenerationElapsed(-3)).toBe("0:00");
    expect(formatGenerationElapsed(Number.NaN)).toBe("0:00");
    expect(formatGenerationElapsed(Number.NEGATIVE_INFINITY)).toBe("0:00");
  });
});

describe("TASK 77 — abort razločevalci (preklic ≠ timeout)", () => {
  test("① uporabnikov preklic: aborted + reason=cancel → isCancelledAbort", () => {
    const c = new AbortController();
    expect(isCancelledAbort(c.signal)).toBe(false);
    c.abort(ABORT_REASON_CANCEL);
    expect(isCancelledAbort(c.signal)).toBe(true);
    expect(isTimeoutAbort(c.signal)).toBe(false);
  });

  test("② odmor: aborted + reason=timeout → isTimeoutAbort, NE preklic", () => {
    const c = new AbortController();
    c.abort(ABORT_REASON_TIMEOUT);
    expect(isTimeoutAbort(c.signal)).toBe(true);
    expect(isCancelledAbort(c.signal)).toBe(false);
  });

  test("③ tuji abort (brez razloga / drug razlog) → NE preklic, NE timeout", () => {
    const bare = new AbortController();
    bare.abort();
    expect(isCancelledAbort(bare.signal)).toBe(false);
    expect(isTimeoutAbort(bare.signal)).toBe(false);

    const foreign = new AbortController();
    foreign.abort("neki-drugo");
    expect(isCancelledAbort(foreign.signal)).toBe(false);
    expect(isTimeoutAbort(foreign.signal)).toBe(false);
  });

  test("④ razločevalca se NE sekata (razloga sta različna niza)", () => {
    expect(ABORT_REASON_CANCEL).not.toBe(ABORT_REASON_TIMEOUT);
    expect(ABORT_REASON_CANCEL.length).toBeGreaterThan(0);
    expect(ABORT_REASON_TIMEOUT.length).toBeGreaterThan(0);
  });
});

describe("TASK 77 — varovalke konstant (trajnostne nespremenljivke)", () => {
  test("① timeout 90 s ≥ 2× zgornja tipična meja (40 s) — zadosten zgib", () => {
    expect(GENERATION_TIMEOUT_SECONDS).toBe(90);
    expect(GENERATION_TIMEOUT_SECONDS).toBeGreaterThanOrEqual(80);
  });

  test("② faze so naraščajoče in se začnejo pri 0 (brez lukenj/preklopov)", () => {
    expect(GENERATION_STAGES[0]?.typicalStartSeconds).toBe(0);
    for (let i = 1; i < GENERATION_STAGES.length; i += 1) {
      expect(
        (GENERATION_STAGES[i] as { typicalStartSeconds: number })
          .typicalStartSeconds
      ).toBeGreaterThan(
        GENERATION_STAGES[i - 1]?.typicalStartSeconds ?? Number.NaN
      );
    }
    expect(GENERATION_STAGES.length).toBe(3);
  });

  test("③ ključi faz so enolični in pokrivajo supply/compose/verify", () => {
    const keys = GENERATION_STAGES.map((s) => s.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
    expect(keys).toContain("supply");
    expect(keys).toContain("compose");
    expect(keys).toContain("verify");
  });

  test("④ zadnja faza se konča PREJ kot timeout (90 s > 30 s začetek verify)", () => {
    const last = GENERATION_STAGES[GENERATION_STAGES.length - 1];
    expect(last?.typicalStartSeconds).toBeLessThan(GENERATION_TIMEOUT_SECONDS);
  });
});
