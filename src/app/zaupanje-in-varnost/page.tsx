import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, BadgeCheck, Sparkles, Eye, Lock, FileCheck, Users, AlertCircle } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * /zaupanje-in-varnost — trust & varnost (E-E-A-T).
 *
 * FW4.3-2 (dvojezičnost, vzorec /o-strani):
 * - Server komponenta; vsa besedila prek `getTranslations("trustSafety")`.
 * - Dimenzije AI rankinga: `label`/`weight` sta tehnična angleška termina
 *   (ista v obeh jezikih, kot v izvirniku) → ostajata v tabeli; opisi se
 *   prevajajo. Oznake transparentnosti (badge + opis) se prevajajo.
 * - generateMetadata je locale-zaveden (canonical/hreflang/og:locale).
 * - Sporočila živijo v src/i18n/fragments/trustSafety.{sl,en}.json.
 */

const PATH = "/zaupanje-in-varnost";

/** Dimenzije AI rankinga — label/weight invariantna, opisi po `ranking.dimensions.<id>`. */
const RANKING_DIMENSIONS = [
  { id: "relevance", label: "Relevance", weight: "60%" },
  { id: "quality", label: "Quality Score", weight: "15%" },
  { id: "rating", label: "Rating", weight: "10%" },
  { id: "distance", label: "Distance", weight: "10%" },
  { id: "premiumBoost", label: "Premium Boost", weight: "5%" },
] as const;

/** Oznake transparentnosti — badge/desc po `transparency.labels.<id>.*`, barve invariantne. */
const TRANSPARENCY_LABELS = [
  { id: "featured", color: "bg-amber-100 text-amber-800" },
  { id: "premium", color: "bg-violet-100 text-violet-800" },
  { id: "verified", color: "bg-emerald-100 text-emerald-800" },
  { id: "affiliate", color: "bg-blue-100 text-blue-800" },
  { id: "organic", color: "bg-muted text-muted-foreground" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("trustSafety");
  const locale = await getLocale();
  const base = await currentBaseUrl();
  const prefixed = `${localePrefix(locale)}${PATH}`;

  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: `${base}${prefixed}`,
      languages: hreflangForPath(PATH, base),
    },
    openGraph: {
      title: `${t("meta.title")} — Discover Slovenia AI`,
      description: t("meta.description"),
      url: `${base}${prefixed}`,
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
  };
}

export default async function TrustSafetyPage() {
  const t = await getTranslations("trustSafety");

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path="/zaupanje-in-varnost" />
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-background py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldCheck className="size-7 text-primary" aria-hidden="true" />
              </div>
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">
              {t("hero.title")}
            </h1>
            <p className="mt-4 text-muted-foreground">
              {t("hero.subtitle")}
            </p>
          </div>
        </div>
      </section>

      {/* Partner verification */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">{t("partner.title")}</h2>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <BadgeCheck className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">{t("partner.adminApproval.title")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("partner.adminApproval.body")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">{t("partner.qualityScore.title")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("partner.qualityScore.body")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="size-3" /> {t("partner.qualityScore.badgeVerified")}
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        {t("partner.qualityScore.badgePremium")}
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        {t("partner.qualityScore.badgeFeatured")}
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Eye className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">{t("partner.vlm.title")}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {t("partner.vlm.body")}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Ranking transparency */}
      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">{t("ranking.title")}</h2>
            <p className="text-muted-foreground">
              {t("ranking.intro")}
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {RANKING_DIMENSIONS.map((item) => (
                <Card key={item.label} className="border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.label}</span>
                      <Badge variant="default" className="text-xs">{item.weight}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{t(`ranking.dimensions.${item.id}`)}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    {t("ranking.warningTitle")}
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                    {t("ranking.warningText")}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparency labels */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">{t("transparency.title")}</h2>
            <p className="text-muted-foreground">
              {t("transparency.intro")}
            </p>

            <div className="space-y-3">
              {TRANSPARENCY_LABELS.map((item) => (
                <div key={item.id} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                  <Badge className={`shrink-0 ${item.color}`}>
                    {t(`transparency.labels.${item.id}.badge`)}
                  </Badge>
                  <p className="text-sm text-muted-foreground">
                    {t(`transparency.labels.${item.id}.desc`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Data protection */}
      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">{t("dataProtection.title")}</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">{t("dataProtection.gdpr.title")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dataProtection.gdpr.desc")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <FileCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">{t("dataProtection.free.title")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dataProtection.free.desc")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">{t("dataProtection.noMiddlemen.title")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dataProtection.noMiddlemen.desc")}
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">{t("dataProtection.auditLog.title")}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t("dataProtection.auditLog.desc")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
