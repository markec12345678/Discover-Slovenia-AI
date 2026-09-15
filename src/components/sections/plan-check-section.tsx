"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  BadgeCheck,
  CalendarDays,
  CircleCheck,
  ExternalLink,
  Fuel,
  Info,
  Lightbulb,
  Loader2,
  MapPin,
  OctagonAlert,
  Route,
  ShieldCheck,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import type { PlanCheckReport } from "@/lib/plan-check";
import { cn } from "@/lib/utils";

// ============================================================================
// PLAN-CHECK SECTION — "Preveri svoj načrt" (F13) na glavni strani
// ============================================================================
//
// Raziskovalna ugotovitev ( sekcije 18–22): uporabniki, ki so ŽE dobili
// načrt od ChatGPTja/Mindtripa/Layle, na forumih zamigujejo nekoga, ki ga
// PREVERI. Ta sekcija je naš odgovor — 100 % deterministično, 0 AI žetonov,
// z žetoni virov ( študije o napakah AI načrtov + naša metodologija).
//
// Pretok: prilepi/naloži besedilo → POST /api/plan-check → poročilo
// ( verdikt, prepoznani dnevi, opozorila, cik-cak preureditve, duplikati,
// stroški vožnje, viri). Brez računa, brez shranjevanja.
// ============================================================================

const MIN_CHARS = 50;
const MAX_CHARS = 20000;

/** Demo z NAMERNIMI napakami: Ptuj ob ponedeljku ( zaprt), predolga etapa
 *  Piran → Ljubljana, ~180 km dan, duplikat Piran ( dneva 2 in 3). */
const EXAMPLE_SL = `Potovalni načrt: Slovenija, 4 dni (odhod 21. 9. 2026)

1. dan: Ptuj in Maribor
Zjutraj obisk Ptujskega gradu, popoldne sprehod po Mariboru.

2. dan: proti obali in nazaj
Piran zjutraj, nato vožnja v Ljubljano na kosilo, odtam Bled
za sprehod ob jezeru, ob sončnem zahodu spet Piran.

3. dan: morje
Sproščujoč dopoldne v Piranu, popoldne v Portorožu.

4. dan: domov
Še Vintgarska soteska na poti domov.`;

const EXAMPLE_EN = `Travel plan: Slovenia, 4 days (departure: September 21, 2026)

Day 1: Ptuj and Maribor
Morning at Ptuj Castle, afternoon stroll through Maribor.

Day 2: To the coast and back
Piran in the morning, then drive to Ljubljana for lunch, onward
to Bled for a lakeside walk, and back to Piran for sunset.

Day 3: Seaside
Relaxed morning in Piran, afternoon in Portorož.

Day 4: Homeward bound
One last stop at Vintgar Gorge on the way home.`;

/** Format minut vožnje: "3 h 20" / "45 min". */
function formatDriveMinutes(minutes: number, lang: string): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h <= 0) return `${m} min`;
  return lang === "en"
    ? `${h} h ${m > 0 ? `${m} min` : ""}`.trim()
    : `${h} h ${m > 0 ? `${m} min` : ""}`.trim();
}

export function PlanCheckSection() {
  const t = useTranslations("planCheck");
  const locale = useLocale();
  const isEn = locale === "en";

  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<PlanCheckReport | null>(null);
  const reportRef = useRef<HTMLDivElement | null>(null);

  const submit = useCallback(async () => {
    const trimmed = text.trim();
    if (trimmed.length < MIN_CHARS || loading) return;
    setLoading(true);
    setError(null);
    trackPlannerEvent("plan_check_submitted", {
      chars: trimmed.length,
      lang: isEn ? "en" : "sl",
    });
    try {
      const res = await fetch("/api/plan-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed, lang: isEn ? "en" : "sl" }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        setReport(null);
        setError(
          typeof (data as { error?: unknown })?.error === "string"
            ? (data as { error: string }).error
            : t("errors.generic")
        );
        return;
      }
      setReport(data as PlanCheckReport);
      trackPlannerEvent("plan_check_completed", {
        worst:
          (data as PlanCheckReport)?.validation?.worst ?? ("unknown" as string),
      });
    } catch {
      setError(t("errors.network"));
    } finally {
      setLoading(false);
    }
  }, [text, loading, isEn, t]);

  // Ob uspehu pomakni poročilo v vid ( mobilni telefoni — dolga besedila)
  useEffect(() => {
    if (report && reportRef.current) {
      reportRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [report]);

  const errorsCount =
    report?.validation.issues.filter((i) => i.level === "error").length ?? 0;
  const warnsCount =
    report?.validation.issues.filter((i) => i.level === "warn").length ?? 0;

  return (
    <section
      id="preveri-nacrt"
      aria-label={t("sectionAriaLabel")}
      className="relative overflow-hidden py-16 sm:py-20"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.45_0.12_150/6%),transparent)]"
        aria-hidden="true"
      />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-balance text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </div>

        <div className="mx-auto mt-8 max-w-3xl">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-4 sm:p-6">
              <label htmlFor="plan-check-input" className="sr-only">
                {t("inputLabel")}
              </label>
              <Textarea
                id="plan-check-input"
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                placeholder={t("placeholder")}
                rows={7}
                className="min-h-[10rem] resize-y font-mono text-[13px] leading-relaxed"
                aria-describedby="plan-check-hint"
              />
              <p
                id="plan-check-hint"
                className="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground"
              >
                <span>{t("hint")}</span>
                <span className="tabular-nums">
                  {text.length} / {MAX_CHARS}
                </span>
              </p>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setText(isEn ? EXAMPLE_EN : EXAMPLE_SL);
                    setReport(null);
                    setError(null);
                  }}
                  className="justify-start text-muted-foreground"
                >
                  <Wand2 className="size-4" aria-hidden="true" />
                  {t("tryExample")}
                </Button>
                <Button
                  type="button"
                  size="default"
                  onClick={submit}
                  disabled={loading || text.trim().length < MIN_CHARS}
                  className="font-semibold"
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      {t("checking")}
                    </>
                  ) : (
                    <>
                      <BadgeCheck className="size-4" aria-hidden="true" />
                      {t("submit")}
                    </>
                  )}
                </Button>
              </div>

              {error && (
                <div
                  role="alert"
                  className="mt-4 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <TriangleAlert
                    className="mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {report && (
          <div
            ref={reportRef}
            className="mx-auto mt-6 max-w-3xl scroll-mt-24 space-y-4"
          >
            {/* === VERDICT === */}
            <div
              className={cn(
                "flex items-start gap-3 rounded-xl border p-4 sm:p-5",
                report.validation.worst === "error" &&
                  "border-destructive/40 bg-destructive/5",
                report.validation.worst === "warn" &&
                  "border-amber-500/40 bg-amber-500/5",
                report.validation.worst === "ok" &&
                  "border-emerald-500/40 bg-emerald-500/5"
              )}
              role="status"
            >
              {report.validation.worst === "error" ? (
                <OctagonAlert
                  className="mt-0.5 size-5 shrink-0 text-destructive"
                  aria-hidden="true"
                />
              ) : report.validation.worst === "warn" ? (
                <TriangleAlert
                  className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400"
                  aria-hidden="true"
                />
              ) : (
                <CircleCheck
                  className="mt-0.5 size-5 shrink-0 text-emerald-600 dark:text-emerald-400"
                  aria-hidden="true"
                />
              )}
              <div className="min-w-0">
                <p className="font-semibold">
                  {report.validation.worst === "error"
                    ? t("verdict.errorTitle", { count: errorsCount })
                    : report.validation.worst === "warn"
                      ? t("verdict.warnTitle", { count: warnsCount })
                      : t("verdict.okTitle")}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {t("verdict.stats", {
                    errors: errorsCount,
                    warns: warnsCount,
                    zigzags: report.zigzag.length,
                    duplicates: report.duplicates.length,
                  })}
                </p>
              </div>
            </div>

            {/* === PREPOZNAN NAČRT ( preverljivost: pokaži, kaj smo prebrali) === */}
            <Card>
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Route className="size-4 text-primary" aria-hidden="true" />
                    {t("parsed.title")}
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {report.validation.method === "osrm" && (
                      <Badge
                        variant="outline"
                        className="gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400"
                      >
                        <MapPin className="size-3" aria-hidden="true" />
                        {t("parsed.methodOsrm")}
                      </Badge>
                    )}
                    {report.validation.method === "heuristic" && (
                      <Badge variant="outline" className="gap-1">
                        <MapPin className="size-3" aria-hidden="true" />
                        {t("parsed.methodHeuristic")}
                      </Badge>
                    )}
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("parsed.stops")}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {report.parsed.totalStops}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("parsed.days")}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      {report.parsed.days.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("parsed.km")}
                    </dt>
                    <dd className="font-semibold tabular-nums">
                      ~
                      {report.driveCosts
                        ? report.driveCosts.km
                        : report.validation.tripKm}{" "}
                      km
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {t("parsed.startDate")}
                    </dt>
                    <dd className="flex items-center gap-1 font-semibold tabular-nums">
                      <CalendarDays
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {report.parsed.tripStartDate ?? t("parsed.noDate")}
                    </dd>
                  </div>
                </dl>

                <ul className="mt-4 space-y-1.5">
                  {report.parsed.days.map((d) => (
                    <li
                      key={d.day}
                      className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-sm"
                    >
                      <span className="font-semibold">{t("dayLabel")}</span>
                      <span className="font-semibold tabular-nums">
                        {d.day}:
                      </span>
                      <span className="text-muted-foreground">
                        {d.stops.map((s) => s.name).join(" → ")}
                      </span>
                    </li>
                  ))}
                </ul>

                {!report.parsed.dayHeadersFound && (
                  <p className="mt-3 flex items-start gap-2 rounded-lg bg-muted/60 p-2.5 text-xs text-muted-foreground">
                    <Info
                      className="mt-0.5 size-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {t("parsed.noHeadersNote")}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* === OPOZORILA ( geo-validacija — sporočila so že lokalizirana) === */}
            {report.validation.issues.length > 0 && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="text-sm font-semibold">{t("issues.title")}</p>
                  <ul className="mt-3 space-y-2">
                    {[...report.validation.issues]
                      .sort((a, b) =>
                        a.level === b.level
                          ? a.day - b.day
                          : a.level === "error"
                            ? -1
                            : 1
                      )
                      .map((issue, i) => (
                        <li
                          key={`${issue.day}-${issue.rule}-${i}`}
                          className={cn(
                            "border-l-2 pl-3 text-sm",
                            issue.level === "error"
                              ? "border-l-destructive/70"
                              : "border-l-amber-500/70"
                          )}
                        >
                          <span
                            className={cn(
                              "mr-2 inline-flex items-center gap-1 text-xs font-semibold",
                              issue.level === "error"
                                ? "text-destructive"
                                : "text-amber-600 dark:text-amber-400"
                            )}
                          >
                            {issue.level === "error" ? (
                              <OctagonAlert
                                className="size-3"
                                aria-hidden="true"
                              />
                            ) : (
                              <TriangleAlert
                                className="size-3"
                                aria-hidden="true"
                              />
                            )}
                            {t("dayLabel")} {issue.day}
                          </span>
                          <span className="text-foreground/90">
                            {issue.message}
                          </span>
                        </li>
                      ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {/* === CIK-CAK PREUREDITVE ( deterministični 2-opt) === */}
            {report.zigzag.length > 0 && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Lightbulb
                      className="size-4 text-amber-600 dark:text-amber-400"
                      aria-hidden="true"
                    />
                    {t("zigzag.title")}
                  </p>
                  <ul className="mt-3 space-y-3">
                    {report.zigzag.map((z) => (
                      <li
                        key={z.day}
                        className="rounded-lg border bg-muted/40 p-3"
                      >
                        <p className="text-sm">
                          <span className="font-semibold">
                            {t("dayLabel")} {z.day}:
                          </span>{" "}
                          <span className="text-muted-foreground">
                            {t("zigzag.saving", {
                              saved: z.savedKm,
                              current: z.currentKm,
                              optimized: z.optimizedKm,
                            })}
                          </span>
                        </p>
                        <p className="mt-1.5 text-sm">
                          <span className="text-xs uppercase tracking-wide text-muted-foreground">
                            {t("zigzag.order")}{" "}
                          </span>
                          <span className="font-medium">
                            {z.order.join(" → ")}
                          </span>
                        </p>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("zigzag.note")}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* === DUPLIKATI PREK DNI === */}
            {report.duplicates.length > 0 && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Info className="size-4 text-primary" aria-hidden="true" />
                    {t("duplicates.title")}
                  </p>
                  <ul className="mt-3 space-y-1.5 text-sm">
                    {report.duplicates.map((dup) => (
                      <li key={dup.id}>
                        <span className="font-medium">{dup.name}</span>{" "}
                        <span className="text-muted-foreground">
                          {t("duplicates.line", {
                            days: dup.days.join(", "),
                          })}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("duplicates.note")}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* === STROŠKI VOŽNJE === */}
            {report.driveCosts && (
              <Card>
                <CardContent className="p-4 sm:p-5">
                  <p className="flex items-center gap-2 text-sm font-semibold">
                    <Fuel className="size-4 text-primary" aria-hidden="true" />
                    {t("costs.title")}
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {t("costs.line", {
                      km: report.driveCosts.km,
                      fuelEur: report.driveCosts.fuelEur,
                      vignetteEur: report.driveCosts.vignetteEur.toFixed(2),
                    })}
                  </p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {t("costs.note")}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* === VIRI ( žetoni — dokazljivost) === */}
            <div className="rounded-xl border border-dashed p-4 text-xs text-muted-foreground sm:p-5">
              <p className="font-semibold text-foreground/80">
                {t("sources.title")}
              </p>
              <ul className="mt-2 space-y-1">
                {report.sources.map((s) => (
                  <li key={s.url}>
                    {s.url.startsWith("/") ? (
                      <a
                        href={s.url}
                        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        {s.label}
                      </a>
                    ) : (
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline decoration-dotted underline-offset-2 hover:text-foreground"
                      >
                        {s.label}
                        <ExternalLink
                          className="ml-1 inline size-3 align-baseline"
                          aria-hidden="true"
                        />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              <p className="mt-3">{t("sources.limitation")}</p>
              <p className="mt-1">{t("sources.limitationDuration")}</p>
              <p className="mt-1">{t("sources.zeroAi")}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
