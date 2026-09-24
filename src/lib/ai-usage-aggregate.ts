// ============================================================================
// AI USAGE AGREGACIJA — čista plast za admin bralnik (Issue #4 §11, val 1)
// ============================================================================
// Iz vrstic AIUsageLog izračuna agregate po feature (klici, uspešnost,
// povprečni odzivni čas, žetoni iz metadata.tokens, stroški, razcep po
// virih) + izlušči zadnje odpovedi z vidnostjo poskusov verige.
// Izločeno iz /api/admin/ai-ute-wrapper ruta v LIB, ker je čista funkcija
// (brez Next/Request odvisnosti) — pokrita z enotskimi testi.
// ============================================================================

export interface UsageRowInput {
  feature: string;
  source: string;
  success: boolean;
  responseTime: number;
  costEur: number;
  metadata: string | null;
  createdAt: Date | string;
}

export interface FeatureAgg {
  feature: string;
  calls: number;
  successRate: number;
  avgResponseTimeMs: number;
  totalCostEur: number;
  promptTokens: number;
  completionTokens: number;
  bySource: { source: string; calls: number; successRate: number }[];
}

export interface FailureRow {
  feature: string;
  source: string;
  responseTimeMs: number;
  createdAt: Date | string;
  model?: string;
  attempts: string[];
}

/** Metadata JSON vrstice (model/žetoni/poskusi) — obrambno, nikoli ne vrže. */
export function parseUsageMetadata(
  metadata: string | null
): { model?: string; promptTokens?: number; completionTokens?: number; attempts?: string[] } {
  if (!metadata) return {};
  try {
    const parsed = JSON.parse(metadata) as {
      model?: unknown;
      tokens?: {
        promptTokens?: unknown;
        completionTokens?: unknown;
      };
      attempts?: unknown;
    };
    const num = (v: unknown) =>
      typeof v === "number" && Number.isFinite(v) ? v : undefined;
    const attempts = Array.isArray(parsed.attempts)
      ? parsed.attempts.filter((a): a is string => typeof a === "string")
      : [];
    return {
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      promptTokens: num(parsed.tokens?.promptTokens),
      completionTokens: num(parsed.tokens?.completionTokens),
      attempts,
    };
  } catch {
    // pokvarjen JSON — iskrena odsotnost (števci ostanejo pravilni)
    return {};
  }
}

/** Agregati po funkciji (klici, uspešnost, čas, žetoni, stroški, viri). */
export function aggregateAiUsage(rows: UsageRowInput[]): FeatureAgg[] {
  const byFeature = new Map<string, UsageRowInput[]>();
  for (const r of rows) {
    const list = byFeature.get(r.feature) ?? [];
    list.push(r);
    byFeature.set(r.feature, list);
  }
  const out: FeatureAgg[] = [];
  for (const [feature, list] of byFeature) {
    let promptTokens = 0;
    let completionTokens = 0;
    const bySource = new Map<string, { calls: number; ok: number }>();
    for (const r of list) {
      const meta = parseUsageMetadata(r.metadata);
      promptTokens += meta.promptTokens ?? 0;
      completionTokens += meta.completionTokens ?? 0;
      const s = bySource.get(r.source) ?? { calls: 0, ok: 0 };
      s.calls += 1;
      if (r.success) s.ok += 1;
      bySource.set(r.source, s);
    }
    const avg =
      list.reduce((sum, r) => sum + r.responseTime, 0) / Math.max(1, list.length);
    out.push({
      feature,
      calls: list.length,
      successRate:
        list.filter((r) => r.success).length / Math.max(1, list.length),
      avgResponseTimeMs: Math.round(avg),
      totalCostEur:
        Math.round(list.reduce((sum, r) => sum + (r.costEur ?? 0), 0) * 10_000) /
        10_000,
      promptTokens,
      completionTokens,
      bySource: [...bySource.entries()]
        .map(([source, s]) => ({
          source,
          calls: s.calls,
          successRate: s.ok / Math.max(1, s.calls),
        }))
        .sort((a, b) => b.calls - a.calls),
    });
  }
  return out.sort((a, b) => b.calls - a.calls);
}

/** Zadnje odpovedi z vidnostjo poskusov verige (retry vidnost). */
export function usageFailureRows(rows: UsageRowInput[]): FailureRow[] {
  return rows.map((r) => {
    const meta = parseUsageMetadata(r.metadata);
    return {
      feature: r.feature,
      source: r.source,
      responseTimeMs: r.responseTime,
      createdAt: r.createdAt,
      model: meta.model,
      attempts: meta.attempts ?? [],
    };
  });
}
