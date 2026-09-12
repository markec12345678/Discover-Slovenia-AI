import { safeJsonLd } from "@/lib/security";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { getEnDestination, REGIONS_EN } from "@/lib/slovenia-data-en";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AffiliateCtaBlock } from "@/components/sections/affiliate-cta-block";
import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import { Calendar, Sun, Leaf, Snowflake, Cloud, ArrowRight, Sparkles, MapPin } from "lucide-react";

/**
 * /destinacija/[slug]/best-time-to-visit/[season] — programatska SEO stran
 * (najboljši čas obiska po sezonah).
 *
 * FW4.3-2: dvojezična stran (server vzorec iz /o-strani):
 * - SEASONS labele/mesci/opisi + vsa telesa strani (vključno s FAQ)
 *   prek fragmenta "bestTime",
 * - kadar je locale "en", se destinacijska polja (tagline) prekrijejo
 *   z EN overlay-jem getEnDestination(),
 * - notranje povezave vodijo prek Link iz @/i18n/navigation,
 * - canonical/hreflang/og:locale so locale-zavedni.
 */

// Sezone (labelKey/monthsKey/descKey → ključi v "bestTime" fragmentu)
const SEASONS = [
  { slug: "pomlad", icon: Leaf, temp: "10-20°C", labelKey: "seasons.pomlad.label", monthsKey: "seasons.pomlad.months", descKey: "seasons.pomlad.desc" },
  { slug: "poletje", icon: Sun, temp: "20-30°C", labelKey: "seasons.poletje.label", monthsKey: "seasons.poletje.months", descKey: "seasons.poletje.desc" },
  { slug: "jesen", icon: Cloud, temp: "10-20°C", labelKey: "seasons.jesen.label", monthsKey: "seasons.jesen.months", descKey: "seasons.jesen.desc" },
  { slug: "zima", icon: Snowflake, temp: "0-5°C", labelKey: "seasons.zima.label", monthsKey: "seasons.zima.months", descKey: "seasons.zima.desc" },
];

const SEASON_MAP: Record<string, string> = {
  pomlad: "spring", poletje: "summer", jesen: "autumn", zima: "winter",
};

export async function generateStaticParams() {
  const params: { slug: string; season: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const season of SEASONS) {
      params.push({ slug: dest.slug, season: season.slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}): Promise<Metadata> {
  const { slug, season } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const s = SEASONS.find((x) => x.slug === season);
  const t = await getTranslations("bestTime");
  const locale = await getLocale();
  if (!dest || !s) return { title: t("meta.notFound") };
  const seasonLabel = t(s.labelKey);
  const seasonMonths = t(s.monthsKey);
  const seasonDesc = t(s.descKey);
  const region = locale === "en" ? (REGIONS_EN[dest.region] ?? dest.region) : dest.region;
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju
  const base = await currentBaseUrl();
  return {
    title: t("meta.title", { name: dest.name, season: seasonLabel }),
    description: t("meta.description", {
      name: dest.name,
      season: seasonLabel,
      months: seasonMonths,
      desc: seasonDesc,
      temp: s.temp,
      seasonLower: seasonLabel.toLowerCase(),
    }),
    keywords:
      locale === "en"
        ? [dest.name, "best time", seasonLabel, "when to visit", "weather", "Slovenia", region]
        : [dest.name, "najboljši čas", seasonLabel, "kdaj obiskati", "vreme", "Slovenija", dest.region],
    openGraph: {
      title: t("meta.title", { name: dest.name, season: seasonLabel }),
      description: t("meta.ogDescription", {
        desc: seasonDesc,
        temp: s.temp,
        name: dest.name,
        seasonLower: seasonLabel.toLowerCase(),
      }),
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
    alternates: {
      canonical: `${base}${localePrefix(locale)}/destinacija/${dest.slug}/best-time-to-visit/${s.slug}`,
      languages: hreflangForPath(`/destinacija/${dest.slug}/best-time-to-visit/${s.slug}`, base),
    },
  };
}

export default async function BestTimeToVisitPage({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}) {
  const { slug, season } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const s = SEASONS.find((x) => x.slug === season);
  if (!dest || !s) notFound();

  const locale = await getLocale();
  const t = await getTranslations("bestTime");

  // FW4.3-2: EN overlay — tagline v angleščini (identifikatorji/slike/cene
  // ostanejo iz slovenskega vira resnice).
  const en = locale === "en" ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;

  const seasonLabel = t(s.labelKey);
  const seasonLower = seasonLabel.toLowerCase();
  const seasonMonths = t(s.monthsKey);
  const seasonDesc = t(s.descKey);

  const seasonKey = SEASON_MAP[season] || "summer";
  const isBestSeason = dest.bestSeason.includes(seasonKey as any);
  const Icon = s.icon;
  // SEO-2: host-zavedni breadcrumb JSON-LD
  const base = await currentBaseUrl();

  // FW4.3-2: FAQ v jeziku strani (prek fragmenta, z interpolacijo)
  const faqs = [
    { q: t("faq.q1", { name: dest.name }), a: t("faq.a1", { season: seasonLabel, name: dest.name, temp: s.temp }) },
    { q: t("faq.q2", { name: dest.name, seasonLower }), a: t("faq.a2", { seasonLower, name: dest.name, temp: s.temp }) },
    { q: t("faq.q3", { name: dest.name, seasonLower }), a: t("faq.a3", { season: seasonLabel, name: dest.name }) },
    { q: t("faq.q4", { name: dest.name }), a: t("faq.a4") },
  ];

  // JSON-LD: FAQPage + BreadcrumbList
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: t("breadcrumbHome"), item: `${base}/` },
      { "@type": "ListItem", position: 2, name: dest.name, item: `${base}/destinacija/${dest.slug}/things-to-do` },
      { "@type": "ListItem", position: 3, name: t("breadcrumbCurrent", { season: seasonLabel }) },
    ],
  };

  const title = t("meta.title", { name: dest.name, season: seasonLabel });

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path={`/destinacija/${dest.slug}/best-time-to-visit/${season}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbJsonLd) }} />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={`/destinacija/${dest.slug}/best-time-to-visit/${s.slug}`} title={title} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-4xl px-4 pt-6">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">{t("breadcrumbHome")}</Link>
          <span>/</span>
          <Link href={`/destinacija/${dest.slug}/things-to-do`} className="hover:text-foreground">{dest.name}</Link>
          <span>/</span>
          <span className="text-foreground">{t("breadcrumbCurrent", { season: seasonLabel })}</span>
        </nav>
      </div>

      {/* Hero */}
      <div className="relative h-[300px] w-full overflow-hidden mt-4">
        <img src={dest.image} alt={`${dest.name} ${seasonLabel}`} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className={`mb-3 ${isBestSeason ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {isBestSeason ? t("bestSeasonBadge") : `${seasonLabel}`}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
            {t("heroTitle", { name: dest.name })}
          </h1>
          <p className="mt-2 text-white/90 text-lg">{seasonLabel} · {seasonMonths} · {s.temp}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Pregled sezone */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t("overviewTitle", { name: dest.name, seasonLower })}</h2>
              <p className="text-sm text-muted-foreground">{seasonDesc}</p>
            </div>
          </div>

          {isBestSeason ? (
            <Card className="border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Sparkles className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {t("bestCardTitle", { season: seasonLabel, name: dest.name })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("bestCardText", { name: dest.name, taglineLower: tagline.toLowerCase() })}
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Calendar className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    {t("offCardTitle", { season: seasonLabel, name: dest.name })}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t("offCardText")}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Ostale sezone */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">{t("allSeasonsTitle", { name: dest.name })}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SEASONS.map((other) => {
              const OtherIcon = other.icon;
              const otherBest = dest.bestSeason.includes(SEASON_MAP[other.slug] as any);
              const isActive = other.slug === s.slug;
              return (
                <Link key={other.slug} href={`/destinacija/${dest.slug}/best-time-to-visit/${other.slug}`}>
                  <Card className={`cursor-pointer transition-all hover:shadow-md ${isActive ? "border-primary" : ""}`}>
                    <CardContent className="p-4 text-center">
                      <OtherIcon className={`size-6 mx-auto mb-2 ${otherBest ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <p className="font-medium text-sm">{t(other.labelKey)}</p>
                      <p className="text-xs text-muted-foreground">{other.temp}</p>
                      {otherBest && <Badge className="mt-1 text-[10px] bg-emerald-500 text-white">{t("bestBadge")}</Badge>}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">{t("faqTitle")}</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 flex items-start gap-2">
                    <span className="text-primary font-bold">Q:</span>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary font-bold">A:</span>
                    {faq.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Affiliate CTA — kdaj obiskati → nastanitev + najem avta */}
        <AffiliateCtaBlock destination={dest.name} variant="hotels-cars" />

        {/* CTA */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-3">{t("ctaTitle", { seasonLower, name: dest.name })}</h2>
          <p className="text-muted-foreground mb-5">
            {t("ctaText")}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/nacrtuj">
                <Sparkles className="size-4 mr-2" />
                {t("ctaButton")}
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                {t("ctaThingsToDo", { name: dest.name })}
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Related destinations */}
        <section className="mt-12">
          <h2 className="text-xl font-bold mb-4">{t("exploreTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id && d.bestSeason.includes(seasonKey as any)).slice(0, 8).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/best-time-to-visit/${s.slug}`}>
                  <MapPin className="size-3.5 mr-1" />
                  {d.name}
                </Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
