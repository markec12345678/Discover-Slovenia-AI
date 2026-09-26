"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  TrendingUp,
  Lightbulb,
  AlertTriangle,
  Target,
  Loader2,
  RefreshCw,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Insight {
  type: "trend" | "recommendation" | "anomaly" | "opportunity";
  title: string;
  description: string;
  priority: "high" | "medium" | "low";
}

interface InsightsResponse {
  insights: Insight[];
  summary: string;
  source: "deterministic";
}

interface InsightsPanelProps {
  type: "admin" | "owner";
  ownerId?: string;
  adminPassword?: string;
}

const TYPE_META: Record<Insight["type"], { icon: typeof TrendingUp; color: string; label: string }> = {
  trend: { icon: TrendingUp, color: "text-blue-600 dark:text-blue-400", label: "Trend" },
  recommendation: { icon: Lightbulb, color: "text-amber-600 dark:text-amber-400", label: "Priporočilo" },
  anomaly: { icon: AlertTriangle, color: "text-red-600 dark:text-red-400", label: "Anomalija" },
  opportunity: { icon: Target, color: "text-emerald-600 dark:text-emerald-400", label: "Priložnost" },
};

const PRIORITY_META: Record<Insight["priority"], string> = {
  high: "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
};

const PRIORITY_LABEL: Record<Insight["priority"], string> = {
  high: "Visoka",
  medium: "Srednja",
  low: "Nizka",
};

/**
 * InsightsPanel — DETERMINISTIČNI poslovni vpogledi za admin/owner
 * dashboard (Issue #9 ZERO-AI: izračunani iz statistike baze — 0 AI).
 *
 * Prikazuje vpoglede, izračunane iz statistike:
 * - Trendi (rast/padec)
 * - Priporočila (kaj izboljšati)
 * - Anomalije (nenavadni vzorci)
 * - Priložnosti (neizkoriščeni potenciali)
 *
 * Nove oznake: i18n ključi v imenskem prostoru "adminInsights" (glej
 * docs/audit/issue9-report-b.md — vrednosti SL/EN za sporočilne datoteke);
 * t.has() varovalka prepreči surove ključe, dokler JSON ni popolnjen.
 */
export function InsightsPanel({ type, ownerId, adminPassword }: InsightsPanelProps) {
  const [data, setData] = useState<InsightsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const t = useTranslations("adminInsights");
  // i18n z dvojno varovalko: dokler ključ ni v messages/*.json, velja SL literal
  const panelTitle = t.has("title") ? t("title") : "Vpogledi";
  const sourceBadge = t.has("badge") ? t("badge") : "Izračunano iz statistike";
  const emptyLabel = t.has("empty") ? t("empty") : "Ni vpogledov na voljo.";

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ type });
      if (ownerId) params.set("ownerId", ownerId);

      const headers: Record<string, string> = {};
      if (adminPassword) headers["x-admin-password"] = adminPassword;

      const res = await fetch(`/api/insights?${params.toString()}`, { headers });
      if (!res.ok) throw new Error("Napaka");
      const result: InsightsResponse = await res.json();
      setData(result);
    } catch {
      setData({
        insights: [],
        summary: "Vpogledi trenutno niso na voljo.",
        source: "deterministic",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInsights();
  }, [type, ownerId]);

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
              <Sparkles className="size-5 text-primary" aria-hidden="true" />
            </div>
            {panelTitle}
          </CardTitle>
          <div className="flex items-center gap-2">
            {data && (
              <Badge
                variant="secondary"
                className="bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
              >
                {sourceBadge}
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={fetchInsights}
              disabled={loading}
              className="size-8"
              aria-label="Osveži vpoglede"
            >
              <RefreshCw className={cn("size-4", loading && "animate-spin")} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : data && data.insights.length > 0 ? (
          <>
            {/* AI summary */}
            {data.summary && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                <p className="text-sm text-foreground">{data.summary}</p>
              </div>
            )}

            {/* Insights list */}
            <div className="space-y-2">
              {data.insights.map((insight, i) => {
                const meta = TYPE_META[insight.type];
                const Icon = meta.icon;
                return (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3"
                  >
                    <div className={cn("mt-0.5 shrink-0", meta.color)}>
                      <Icon className="size-4" aria-hidden="true" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold">{insight.title}</h4>
                        <Badge
                          variant="secondary"
                          className={cn("shrink-0 text-[9px]", PRIORITY_META[insight.priority])}
                        >
                          {PRIORITY_LABEL[insight.priority]}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {insight.description}
                      </p>
                      <Badge variant="outline" className="mt-1 text-[9px]">
                        {meta.label}
                      </Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Sparkles className="mb-2 size-8 text-muted-foreground/40" aria-hidden="true" />
            <p className="text-sm text-muted-foreground">
              {emptyLabel}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
