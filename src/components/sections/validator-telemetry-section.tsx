"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Activity,
  CalendarDays,
  ClipboardCheck,
  ExternalLink,
  History,
  LockKeyhole,
  Repeat2,
  Route,
  Server,
  Sigma,
  Timer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { ValidatorPublicStats } from "@/lib/validator-stats";

// ============================================================================
// VALIDATOR TELEMETRY SECTION — "Koliko napak ujame naš preverjevalnik?" (F17)
// ============================================================================
//
// Backlog #2 ( sekcija 22): "stran z našimi realnimi številkami + citati
// javnih študij ( Tow 37/67/94 %, BBC 37/33 %, MEM 43,2 %) z viri".
// MEM je to naredil za 356 potovanj in postal referenca — poštenost kot
// marketing je naš diferencator, zato jo štejemo tudi sami.
//
// Postavitev: TAKOJ za "Preveri svoj načrt" ( nadaljevanje zgodbe: preveri
// načrt → glej, kaj preverjevalnik dejansko ujame).
//
// Vsebina:
//   1. ŽIVE številke iz GET /api/plan-check/stats ( strežniško štetje,
//      60 s predpomnilnik, brez PII) — 6 kartic + razčlenitev po pravilih
//   2. JAVNE ŠTUDIJE ( statične, z viri) — MEM 43,2 %, BBC 37/33 %,
//      Tow 37–94 % — ISTI viri kot v poročilu F13 ( en vir resnice)
//   3. KAKO ŠTEJEMO ( pošteno): dokončana preverjanja, od 1.21.0, brez PII,
//      predpomnilnik — + povezavi na /vir-podatkov in #preveri-nacrt
//
// Stanja: nalaganje ( skelet), nedosegljivo ( opozorilo — študije ostanejo),
// prazno ( iskreno "še 0 preverjanj" — številke bodo rasle).
//
// Namerno NE uvažamo SOURCES iz plan-check.ts: ta modul vleče slovenia-data
// ( težek) v klient — 3 URL-je podvajamo tukaj ( enako kot poročilo F13).
// ============================================================================

interface StatsResponse {
  generatedAt: string;
  stats: ValidatorPublicStats;
}

/** Javne študije — ISTI URL-ji kot SOURCES v src/lib/plan-check.ts (F13). */
const STUDIES = [
  {
    key: "mem",
    url: "https://monkeyeatingmango.com/research/ai-itinerary-errors-data-study/",
  },
  {
    key: "bbc",
    url: "https://www.bbc.com/travel/article/20250926-the-perils-of-letting-ai-plan-your-next-trip",
  },
  {
    key: "tow",
    url: "https://www.travelanywhere.blog/blog/ai-hotel-hallucination-rate-chatgpt-gemini-perplexity-2026-tested",
  },
] as const;

/** Vrste pravil, ki jih javna stran zna poimenovati ( ostale pokaže surovo). */
const RULE_KEYS = [
  "day_km",
  "day_stops",
  "leg_distance",
  "day_overload",
  "schedule_gap",
  "schedule_overlap",
  "duplicate_stop",
  "missing_coords",
  "closed_month",
  "closed_weekday",
] as const;

type RuleKey = (typeof RULE_KEYS)[number];

function isRuleKey(rule: string): rule is RuleKey {
  return (RULE_KEYS as readonly string[]).includes(rule);
}

interface StatCardData {
  icon: LucideIcon;
  value: string;
  label: string;
  sub: string;
}

export function ValidatorTelemetrySection() {
  const t = useTranslations("validatorTelemetry");
  const locale = useLocale();
  const isEn = locale === "en";

  const [stats, setStats] = useState<ValidatorPublicStats | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/plan-check/stats");
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as StatsResponse;
        if (!cancelled) setStats(data.stats);
      } catch {
        if (!cancelled) setUnavailable(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const nf = new Intl.NumberFormat(isEn ? "en-GB" : "sl-SI");

  const sinceLabel = stats?.since
    ? new Date(`${stats.since}T00:00:00`).toLocaleDateString(
        isEn ? "en-GB" : "sl-SI",
        { day: "numeric", month: "long", year: "numeric" }
      )
    : null;

  const avgLabel = stats
    ? stats.avgIssuesPerPlan.toFixed(1).replace(".", isEn ? "." : ",")
    : "";

  const cards: StatCardData[] = stats
    ? [
        {
          icon: ClipboardCheck,
          value: nf.format(stats.plansChecked),
          label: t("stats.plansLabel"),
          sub: sinceLabel
            ? t("stats.plansSince", { date: sinceLabel })
            : t("stats.noSince"),
        },
        {
          icon: TriangleAlert,
          value: nf.format(stats.issuesTotal),
          label: t("stats.issuesLabel"),
          sub: t("stats.issuesSplit", {
            errors: nf.format(stats.issuesError),
            warns: nf.format(stats.issuesWarn),
          }),
        },
        {
          icon: Sigma,
          value: avgLabel,
          label: t("stats.avgLabel"),
          sub: t("stats.avgSub"),
        },
        {
          icon: Route,
          value: nf.format(stats.zigzagDays),
          label: t("stats.zigzagLabel"),
          sub: t("stats.zigzagSaved", {
            km: nf.format(stats.zigzagSavedKm),
          }),
        },
        {
          icon: Repeat2,
          value: nf.format(stats.crossDayDuplicates),
          label: t("stats.duplicatesLabel"),
          sub: t("stats.duplicatesSub"),
        },
        {
          icon: CalendarDays,
          value: nf.format(stats.daysParsed),
          label: t("stats.daysLabel"),
          sub: t("stats.daysSub", {
            stops: nf.format(stats.stopsRecognized),
          }),
        },
      ]
    : [];

  const maxRuleCount = stats && stats.rules.length > 0 ? stats.rules[0].count : 0;

  const methodPoints: { icon: LucideIcon; text: string }[] = [
    { icon: Server, text: t("method.counting") },
    { icon: History, text: t("method.start") },
    { icon: LockKeyhole, text: t("method.privacy") },
    { icon: Timer, text: t("method.cache") },
  ];

  return (
    <section
      id="telemetrija-validatorja"
      aria-label={t("sectionAriaLabel")}
      className="relative overflow-hidden py-16 sm:py-20"
    >
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.45_0.12_150/6%),transparent)]"
        aria-hidden="true"
      />
      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        {/* Glava sekcije ( isti motiv kot plan-check nad njo) */}
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
            <Activity className="size-3.5 text-primary" aria-hidden="true" />
            {t("eyebrow")}
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-balance text-muted-foreground sm:text-lg">
            {t("subtitle")}
          </p>
        </div>

        {/* Žive številke: nalaganje → skelet kartic */}
        {stats === null && !unavailable && (
          <>
            <p role="status" className="sr-only">
              {t("states.loading")}
            </p>
            <div className="mx-auto mt-8 grid max-w-6xl grid-cols-2 gap-3 sm:mt-10 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="border-border/70" aria-hidden="true">
                  <CardContent className="p-4 sm:p-5">
                    <div className="h-3.5 w-20 animate-pulse rounded bg-muted" />
                    <div className="mt-3 h-8 w-14 animate-pulse rounded bg-muted" />
                    <div className="mt-2 h-2.5 w-24 animate-pulse rounded bg-muted/70" />
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}

        {/* Žive številke: podatki */}
        {stats !== null && (
          <div className="mx-auto mt-8 max-w-6xl sm:mt-10">
            <h3 className="text-center text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t("liveTitle")}
            </h3>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
              {cards.map((card) => (
                <Card
                  key={card.label}
                  className="border-border/70 bg-card shadow-sm"
                >
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <card.icon
                        className="size-4 shrink-0 text-primary"
                        aria-hidden="true"
                      />
                      <span className="text-xs font-medium leading-tight">
                        {card.label}
                      </span>
                    </div>
                    <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">
                      {card.value}
                    </p>
                    <p className="mt-1 text-xs leading-snug text-muted-foreground">
                      {card.sub}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {/* Pošteno prazno stanje ( štetje se šele pričenja) */}
        {stats !== null && stats.plansChecked === 0 && (
          <p className="mx-auto mt-6 max-w-3xl rounded-lg border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
            {t("states.empty")}
          </p>
        )}

        {/* Nedosegljivo ( fail-open: študije spodaj ostanejo) */}
        {unavailable && (
          <p
            role="alert"
            className="mx-auto mt-6 max-w-3xl rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-center text-sm text-destructive"
          >
            {t("states.unavailable")}
          </p>
        )}

        {/* Razčlenitev po pravilih ( horizontalni stolpci) */}
        {stats !== null && stats.rules.length > 0 && (
          <div className="mx-auto mt-10 max-w-3xl">
            <h3 className="text-lg font-semibold">{t("rules.title")}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("rules.subtitle")}
            </p>
            <ul className="mt-4 space-y-3">
              {stats.rules.slice(0, 6).map((r) => {
                const pct =
                  maxRuleCount > 0
                    ? Math.max(4, Math.round((r.count / maxRuleCount) * 100))
                    : 0;
                return (
                  <li key={r.rule}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="font-medium">
                        {isRuleKey(r.rule) ? t(`rules.${r.rule}`) : r.rule}
                      </span>
                      <span className="tabular-nums text-muted-foreground">
                        {nf.format(r.count)}
                      </span>
                    </div>
                    <div
                      className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full bg-primary/70"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Javne študije + kako štejemo */}
        <div className="mx-auto mt-10 grid max-w-5xl items-start gap-4 lg:grid-cols-2 lg:gap-6">
          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <h3 className="text-lg font-semibold">{t("studies.title")}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t("studies.subtitle")}
              </p>
              <ul className="mt-4 space-y-3.5">
                {STUDIES.map((s) => (
                  <li key={s.key}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group inline-flex items-start gap-1.5 text-sm font-medium underline decoration-border underline-offset-4 hover:decoration-primary"
                    >
                      {t(`studies.${s.key}.label`)}
                      <ExternalLink
                        className="mt-0.5 size-3.5 shrink-0 text-muted-foreground group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </a>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {t(`studies.${s.key}.note`)}
                    </p>
                  </li>
                ))}
              </ul>
              <p className="mt-5 border-t border-border/70 pt-4 text-xs leading-relaxed text-muted-foreground">
                {t("studies.note")}
              </p>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardContent className="p-5 sm:p-6">
              <h3 className="text-lg font-semibold">{t("method.title")}</h3>
              <ul className="mt-4 space-y-3">
                {methodPoints.map((point, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2.5 text-sm leading-snug"
                  >
                    <point.icon
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{point.text}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 border-t border-border/70 pt-4 text-sm">
                <a
                  href={isEn ? "/en/vir-podatkov" : "/vir-podatkov"}
                  className="font-medium text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
                >
                  {t("method.dataLink")}
                </a>
                <a
                  href="#preveri-nacrt"
                  className="font-medium text-primary underline decoration-border underline-offset-4 hover:decoration-primary"
                >
                  {t("method.cta")}
                </a>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
