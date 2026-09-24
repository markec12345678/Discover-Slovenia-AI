// ============================================================================
// AI METERING — pisanje v AIUsageLog (Issue #4 §11, implementacijski val 1)
// ============================================================================
// Stanje pred valom 1 (baseline, docs/ISSUE4-BASELINE.md D.3): model
// AIUsageLog obstaja (feature/source/success/responseTime/costEur/userId/
// sessionId/metadata + 4 indeksi), a NIČ runtime kode vanj ni pisalo —
// 0 vrstic od sprejetja. Ta modul je SKUPNI zapisovalni kanon za vse AI
// površine (ai-client veriga, vizija, TTS, priporočila, fallback).
//
// DISCIPLINA (ista kot handoff-record.ts):
//  · metering je OPCIJSKO — klic, ki ne poda `usageLog`, ne piše NIČ
//    (testi/mocki ostanejo hermetični);
//  · zapis je FIRE-AND-FORGET: napaka pisanja NIKOLI ne pade v odgovor
//    uporabniku (izgubi se samo vrstica v dnevniku, ne funkcionalnost);
//  · `@/lib/db` se uvaža DINAMIČNO šele ob zapisu — modul ostane primerljiv
//    v klientnem grafu brez Prisma odvisnosti na nivoju uvoza.
//
// STROŠKI (costEur): vsi danes aktivni viri so BREZPLAČNA stopnja
// (OpenRouter :free modeli, Gemini AI Studio free tier, Puter free,
// z-ai dev sandbox) → 0,00 EUR pošteno. NE izmišljujemo stroškov: ko bodo
// plačljivi ključi aktivirani, se cenik doda v MODEL_PRICES in stolpec
// začne nositi resnico (žetoni se že zapisujejo v metadata.tokens).
// ============================================================================

export interface AIUsageTokens {
  promptTokens?: number;
  completionTokens?: number;
}

export interface AIUsageLogEntry {
  /** Klicalo/plast: "itinerary" | "refine" | "chat" | "search" | … */
  feature: string;
  /** Zmagovalni provider verige ("openrouter"|"gemini"|"puter"|"z-ai-sdk")
   *  | "fallback" (deterministični motor) | "cache" | "none" (veriga padla). */
  source: string;
  /** Ali je klic uporabniku DEJANSKO uspešno služil (fallback/cache = true). */
  success: boolean;
  responseTimeMs: number;
  /** Model, ki je dejansko odgovoril (npr. "nex-agi/nex-n2.5-pro:free"). */
  model?: string;
  usage?: AIUsageTokens;
  userId?: string;
  sessionId?: string;
  /** Dodatno: poskusi verige (retry vidnost), žetoni, lokalni kontekst. */
  metadata?: Record<string, unknown>;
}

/** Cenik na 1M žetonov (EUR) — PRAZEN danes (samo :free/free-tier viri).
 *  Ko se aktivira plačljiv ključ, se tu dodata vhod/izhod cena in
 *  estimateCostEur začne računati; do takrat 0,00 JE resnica. */
const MODEL_PRICES_EUR_PER_1M: Record<
  string,
  { input: number; output: number }
> = {};

/** Iskren strošek klica: 0 za :free/free-tier/sandbox/fallback/cache;
 *  iz cenika za plačljive modele; 0 kadar žetonov ni (ne izmišljujemo). */
export function estimateCostEur(
  source: string,
  model?: string,
  usage?: AIUsageTokens
): number {
  if (!model || !usage) return 0;
  const price = MODEL_PRICES_EUR_PER_1M[model];
  if (!price) return 0;
  const prompt = usage.promptTokens ?? 0;
  const completion = usage.completionTokens ?? 0;
  return (
    (prompt / 1_000_000) * price.input +
    (completion / 1_000_000) * price.output
  );
}

/** Čista izgradnja VRSTICE (testljivo brez baze) — ena resnica za obliko. */
export function buildAIUsageRow(entry: AIUsageLogEntry) {
  return {
    feature: entry.feature,
    source: entry.source,
    success: entry.success,
    responseTime: Math.max(0, Math.round(entry.responseTimeMs)),
    costEur: estimateCostEur(entry.source, entry.model, entry.usage),
    userId: entry.userId ?? null,
    sessionId: entry.sessionId ?? null,
    metadata: JSON.stringify({
      ...(entry.model ? { model: entry.model } : {}),
      ...(entry.usage ? { tokens: entry.usage } : {}),
      ...(entry.metadata ?? {}),
    }),
  };
}

/**
 * Zapiše vrstico porabe (fire-and-forget, NIKOLI ne vrže).
 * Dinamičen db uvoz — pisanje odpove tiho (console.warn), odgovor
 * uporabniku ostane nespremenjen.
 */
export function logAIUsage(entry: AIUsageLogEntry): void {
  try {
    void (async () => {
      const { db } = await import("@/lib/db");
      const row = buildAIUsageRow(entry);
      await db.aIUsageLog.create({ data: row });
    })().catch((err: unknown) => {
      console.warn(
        "[ai-usage] zapis ni uspel (metering tiho izpuščen):",
        err instanceof Error ? err.message : err
      );
    });
  } catch {
    // sinhrona napaka (npr. JSON.stringify cikel) — tiho, isti kanon.
  }
}

/**
 * Zapis DEJANSKO izvedenega fallbacka (deterministični motor je služil
 * uporabniku; AI veriga ni). `source: "fallback"` je del semantike stolpca
 * (komentar v shemi ga našteva) — ločeno od success=false vrstic verige,
 * ki povedo SAMO da je AI padel; ta vrstica pove, kdo je dejansko odgovoril.
 */
export function logFallbackUsage(
  feature: string,
  responseTimeMs: number,
  opts?: {
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  logAIUsage({
    feature,
    source: "fallback",
    success: true,
    responseTimeMs,
    ...opts,
  });
}

/** Zapis zadetka predpomnilnika (0 stroškov, a VIDNO — cache je del
 *  odgovornosti stroškov). */
export function logCacheUsage(
  feature: string,
  responseTimeMs: number,
  opts?: {
    userId?: string;
    sessionId?: string;
    metadata?: Record<string, unknown>;
  }
): void {
  logAIUsage({
    feature,
    source: "cache",
    success: true,
    responseTimeMs,
    ...opts,
  });
}
