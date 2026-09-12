import { Map, Users, Calendar, TreePine, Sparkles, Percent, BadgeCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { CountUp } from "@/components/count-up";
import { Reveal } from "@/components/reveal";

/**
 * StatsSection — bento grid z animiranimi številkami.
 *
 * P4-5 (raziskava: bento grid trend + micro-interactions):
 * - Asimetrični bento layout (1 velika + 3 male kartice) namesto ploske vrstice
 * - CountUp animacija ob scroll-u (subtilna živost)
 * - Zadnji 2 kartici = strateška diferenciatorja iz konkurenčne analize
 *   (0 % na direktnih rezervacijah — najpoštenejši model na trgu)
 */
export async function StatsSection() {
  const t = await getTranslations("stats");

  return (
    <section
      id="stats"
      className="relative overflow-hidden py-16 sm:py-20"
      aria-label={t("sectionAriaLabel")}
    >
      {/* Mehka radialna dekoracija v ozadju */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_0%,oklch(0.45_0.12_150/6%),transparent)]"
        aria-hidden="true"
      />

      <div className="container relative mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:grid-rows-2">
          {/* Velika kartica — destinacije (spans 2 cols na velikih zaslonih) */}
          <Reveal className="col-span-2 lg:row-span-2" delay={0}>
            <div className="group relative flex h-full min-h-[13rem] flex-col justify-between overflow-hidden rounded-2xl bg-primary p-6 text-primary-foreground shadow-lg transition-shadow hover:shadow-xl sm:p-8">
              <Map
                className="absolute -bottom-6 -right-6 size-36 text-primary-foreground/10 transition-transform duration-500 group-hover:scale-110 group-hover:rotate-6"
                aria-hidden="true"
              />
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary-foreground/70">
                <BadgeCheck className="size-4" aria-hidden="true" />
                {t("coverageEyebrow")}
              </div>
              <div>
                <div className="text-5xl font-bold tabular-nums tracking-tight sm:text-6xl">
                  <CountUp value={22} />
                </div>
                <div className="mt-1 text-sm font-medium text-primary-foreground/85 sm:text-base">
                  {t("destinationsLabel")}
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={80}>
            <StatCard
              icon={Users}
              value={<CountUp value={2.4} decimals={1} suffix=" mio" />}
              label={t("visitorsLabel")}
            />
          </Reveal>

          <Reveal delay={140}>
            <StatCard
              icon={TreePine}
              value={<CountUp value={60} suffix=" %" />}
              label={t("forestLabel")}
            />
          </Reveal>

          <Reveal delay={200}>
            <StatCard
              icon={Calendar}
              value={<CountUp value={4} />}
              label={t("seasonsLabel")}
            />
          </Reveal>

          {/* Diferenciator kartica — 0 % provizija (konkurenčna prednost) */}
          <Reveal delay={260}>
            <div className="relative flex h-full flex-col justify-between overflow-hidden rounded-2xl border border-emerald-200/60 bg-gradient-to-br from-emerald-50 to-emerald-50/40 p-5 dark:border-emerald-900/50 dark:from-emerald-950/40 dark:to-emerald-950/10">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
                <Percent className="size-4" aria-hidden="true" />
                {t("fairEyebrow")}
              </div>
              <div>
                <div className="text-3xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 sm:text-4xl">
                  {t("fairValue")}<span className="text-lg font-semibold text-emerald-600/80 dark:text-emerald-500/80"> {t("fairUnit")}</span>
                </div>
                <div className="mt-0.5 text-xs text-emerald-800/70 dark:text-emerald-300/70 sm:text-sm">
                  {t("fairNote")}
                </div>
              </div>
            </div>
          </Reveal>
        </div>

        {/* Podnapis — AI kanal poštenost */}
        <Reveal delay={320}>
          <p className="mt-6 flex flex-wrap items-center justify-center gap-1.5 text-center text-sm text-muted-foreground">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            {t("commissionLead")} <strong className="font-semibold text-foreground">{t("commissionRate")}</strong> {t("commissionVerb")}
            <strong className="font-semibold text-foreground"> {t("commissionEmphasis")}</strong>
            {t("commissionTail")}
          </p>
        </Reveal>
      </div>
    </section>
  );
}

/**
 * Manjša bento kartica — statistika z ikono.
 */
function StatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Users;
  value: React.ReactNode;
  label: string;
}) {
  return (
    <div className="group flex h-full flex-col justify-between rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary transition-transform duration-300 group-hover:scale-110">
        <Icon className="size-5" aria-hidden="true" />
      </div>
      <div>
        <div className="text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
          {value}
        </div>
        <div className="mt-0.5 text-xs text-muted-foreground sm:text-sm">
          {label}
        </div>
      </div>
    </div>
  );
}

export default StatsSection;
