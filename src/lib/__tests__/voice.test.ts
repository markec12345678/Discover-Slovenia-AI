// ============================================================================
// ISSUE #2 §6/§7/§8 — REGRESIJSKI TESTI: glasovna plast brez AI API ključa
// ============================================================================
// Zahteva: brskalnikov STT (SpeechRecognition) za vhod, brskalniški TTS
// (speechSynthesis) za izhod, celi glasovni klepet = STT → besedilo →
// /api/chat → odgovor → TTS. Vse BREZ AI ključa. Nepodprt brskalnik →
// pravilen fallback na besedilni vnos (STT helper vrne false/null).
// ============================================================================
import { describe, expect, test } from "bun:test";
import {
  sttSupported,
  ttsSupported,
  speechRecognitionCtor,
  speechLanguageTag,
  speechTextForUtterance,
  shouldAutoSpeak,
} from "@/lib/voice";

describe("voice — zaznavanje podpore (Issue #2 §6/§7)", () => {
  test("① brez window (SSR/nepodprto): STT in TTS sta NEpodprta — besedilni vnos je fallback", () => {
    expect(sttSupported()).toBe(false);
    expect(ttsSupported()).toBe(false);
    expect(speechRecognitionCtor()).toBeNull();
  });

  test("② podprt STT (webkit predpona) se prepozna skozi window", () => {
    const Fake = class {
      lang = "";
      continuous = false;
      interimResults = false;
      maxAlternatives = 1;
      start() {}
      stop() {}
      abort() {}
      addEventListener() {}
    };
    const g = globalThis as Record<string, unknown>;
    const prev = g.window;
    g.window = { webkitSpeechRecognition: Fake };
    expect(sttSupported()).toBe(true);
    expect(speechRecognitionCtor()).toBe(
      Fake as unknown as SpeechRecognitionConstructor
    );
    g.window = prev;
  });

  test("③ podprt TTS (speechSynthesis na window) se prepozna", () => {
    const g = globalThis as Record<string, unknown>;
    const prev = g.window;
    g.window = { speechSynthesis: {} };
    expect(ttsSupported()).toBe(true);
    g.window = prev;
  });
});

describe("voice — jezikovne oznake (BCP-47)", () => {
  test("④ locale → jezikovna oznaka za STT/TTS", () => {
    expect(speechLanguageTag("sl")).toBe("sl-SI");
    expect(speechLanguageTag("en")).toBe("en-US");
    expect(speechLanguageTag("de")).toBe("de-DE");
    expect(speechLanguageTag("it")).toBe("it-IT");
    expect(speechLanguageTag("whatever")).toBe("sl-SI"); // varno privzeto
  });
});

describe("voice — besedilo za izgovor (TTS čistitev)", () => {
  test("⑤ citatne oznake, markdown, URL-ji, emoji in vrstičniki se odstranijo", () => {
    const out = speechTextForUtterance(
      "Piran 🌊 je *čudovit* [1]. Več: https://example.com/piran •• obišči /destinacija/piran"
    );
    expect(out).not.toContain("[1]");
    expect(out).not.toContain("*");
    expect(out).not.toContain("https://");
    expect(out).not.toContain("🌊");
    expect(out).not.toContain("•");
    expect(out).toContain("Piran");
    expect(out).toContain("/destinacija/piran"); // poti ostanejo (berljive)
    expect(out).not.toMatch(/\s{2,}/); // brez podvojenih presledkov
  });

  test("⑥ prazno/samo-šum besedilo → prazen izgovor (gumb ne govori nič)", () => {
    expect(speechTextForUtterance("🌊 [1] *** https://x.y")).toBe("");
    expect(speechTextForUtterance("   ")).toBe("");
  });
});

describe("voice — semantika samodejnega izgovora (§8 celi klepet)", () => {
  test("⑦ samodejni izgovor SAMO za izgovorjena (STT) sporočila, ne tipkovnice", () => {
    expect(shouldAutoSpeak(true)).toBe(true);
    expect(shouldAutoSpeak(false)).toBe(false);
  });
});
