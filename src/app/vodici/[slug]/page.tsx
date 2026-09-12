import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  MapPin,
  Calendar,
  Route,
  Clock,
  User,
  Compass,
  ArrowRight,
  Ticket,
  BedDouble,
  CheckCircle2,
} from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import {
  ADRIA_GUIDES,
  getAdriaGuideBySlug,
  getRelatedAdriaGuides,
  COUNTRY_LABELS,
} from "@/lib/adria-guides";
import { ADRIA_GUIDES_EN, getAdriaGuideBySlugEn, COUNTRY_LABELS_EN } from "@/lib/adria-guides-en";
import { getHeroCredit } from "@/lib/adria-guides/hero-credits";
import { getDestinationById } from "@/lib/slovenia-data";
import { safeJsonLd } from "@/lib/security";
import { faqJsonLd, breadcrumbJsonLd, articleJsonLd, hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { localePrefix } from "@/i18n/routing";
import { Link } from "@/i18n/navigation";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AffiliateCtaBlock } from "@/components/sections/affiliate-cta-block";
import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

/**
 * /vodici/[slug] — jadranski (cross-border) vodniki (ADRIA-1, ADRIA-EN).
 *
 * PRAVE SSR strani (ne modal): 10 vodnikov ~100 strani vsebine, ki iz
 * obstoječe blagovne znamke zajamejo jadranske poizvedbe (HR/BA/ME/AL)
 * in prek povezav vračajo promet v slovenski del platforme.
 *
 * ADRIA-EN: EN različice (full prevodi, isti slugi) živijo na
 * /en/vodici/[slug] — dataset izbira getLocale(); UI krom prek
 * adriaGuidePage fragmenta; povezave prek LocaleLink (auto /en prefix).
 */

const COUNTRY_FLAG: Record<string, string> = {
  SI: "🇸🇮",
  HR: "🇭🇷",
  BA: "🇧🇦",
  ME: "🇲🇪",
  AL: "🇦🇱",
};

function fmtDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString(locale === "en" ? "en-GB" : "sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function fmtKm(km: number, locale: string): string {
  return km.toLocaleString(locale === "en" ? "en-GB" : "sl-SI");
}

/** Mnočina za nočitve (SL: 1 nočitev, 2 nočitvi, 3–4 nočitve, 5+ nočitev). */
function nightsLabel(n: number, locale: string): string {
  if (locale === "en") return n === 1 ? "night" : "nights";
  if (n === 1) return "nočitev";
  if (n === 2) return "nočitvi";
  if (n >= 3 && n <= 4) return "nočitve";
  return "nočitev";
}

/** Mnočina za dneve (SL: 1 dan, 2+ dni; EN: 1 day, 2+ days). */
function daysLabel(n: number, locale: string): string {
  if (locale === "en") return n === 1 ? "day" : "days";
  return n === 1 ? "dan" : "dni";
}

/** Rodilnik za "prek" (SL: 1 države, 2+ držav; EN: 1 country, 2+ countries). */
function countryWord(n: number, locale: string): string {
  if (locale === "en") return n === 1 ? "country" : "countries";
  if (n === 1) return "države";
  return "držav";
}

export function generateStaticParams() {
  // Slugi so skupni SL ⇄ EN (isti dataset vrstni red) — en parameter.
  return ADRIA_GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const guide = locale === "en" ? getAdriaGuideBySlugEn(slug) : getAdriaGuideBySlug(slug);
  const t = await getTranslations("adriaGuidePage");
  if (!guide) return { title: t("meta.notFound") };
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju (ne statična domena)
  const base = await currentBaseUrl();
  const path = `/vodici/${guide.slug}`;
  const labels = locale === "en" ? COUNTRY_LABELS_EN : COUNTRY_LABELS;
  return {
    title: guide.metaTitle,
    description: guide.description,
    keywords: [
      ...guide.countries.map((c) => labels[c] ?? c),
      "road trip",
      locale === "en" ? "driving" : "potovanje z avtom",
      locale === "en" ? "Slovenia" : "Slovenija",
      guide.stops.map((s) => s.name).slice(0, 5).join(", "),
    ],
    openGraph: {
      title: `${guide.metaTitle} — Discover Slovenia AI`,
      description: guide.description,
      images: guide.heroImage
        ? [{ url: `${base}${guide.heroImage}`, width: 1344, height: 768, alt: guide.heroAlt }]
        : undefined,
      type: "article",
      locale: locale === "en" ? "en_US" : "sl_SI",
      publishedTime: guide.date,
      authors: [guide.author],
    },
    alternates: {
      canonical: `${base}${localePrefix(locale)}${path}`,
      languages: hreflangForPath(path, base),
    },
  };
}

export default async function AdriaGuidePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const guide = locale === "en" ? getAdriaGuideBySlugEn(slug) : getAdriaGuideBySlug(slug);
  if (!guide) notFound();

  const t = await getTranslations("adriaGuidePage");
  const labels = locale === "en" ? COUNTRY_LABELS_EN : COUNTRY_LABELS;

  const base = await currentBaseUrl();
  const path = `/vodici/${guide.slug}`;
  const related = getRelatedAdriaGuides(guide);
  const sloveniaDests = guide.relatedSloveniaIds
    .map((id) => getDestinationById(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  // JSON-LD: Article + FAQ + Breadcrumb (host-honest, SEO-2)
  const article = articleJsonLd(
    {
      title: guide.metaTitle,
      description: guide.description,
      image: guide.heroImage ? `${base}${guide.heroImage}` : `${base}/icon-192.png`,
      datePublished: guide.date,
      author: guide.author,
      url: `${base}${localePrefix(locale)}${path}`,
    },
    base,
  );
  const faqs = guide.faqs.map((f) => ({ q: f.question, a: f.answer }));
  const breadcrumbs = breadcrumbJsonLd([
    { name: t("breadcrumb.home"), url: `${base}/` },
    { name: t("breadcrumb.guides"), url: `${base}${localePrefix(locale)}/vodici` },
    { name: guide.title, url: `${base}${localePrefix(locale)}${path}` },
  ]);

  // Affiliate destinacija = postaja z največ nočitvami (najmočnejši booking intent)
  const topStop = [...guide.stops].sort((a, b) => b.nights - a.nights)[0];

  // Atribucija hero fotografije (CC BY/BY-SA)
  const heroCredit = getHeroCredit(guide.slug);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(article) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faqs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }} />

      <PageViewTracker path={path} title={guide.metaTitle} />

      <Navigation solid />

      <main className="flex-grow">
        {/* Hero */}
        <section className="relative">
          <div className="relative h-[340px] w-full overflow-hidden sm:h-[420px]">
            {guide.heroImage ? (
              <img
                src={guide.heroImage}
                alt={guide.heroAlt}
                className="size-full object-cover"
                width={1344}
                height={768}
              />
            ) : (
              /* Gradient fallback za vodnike brez slike */
              <div className="size-full bg-gradient-to-br from-primary/80 via-primary to-primary/70" />
            )}
            <div className="hero-overlay absolute inset-0" />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center">
              <div
                className="mb-3 flex items-center gap-1.5 text-2xl"
                aria-label={t("hero.countriesAria", {
                  countries: guide.countries.map((c) => labels[c]).join(", "),
                })}
              >
                {guide.countries.map((c) => (
                  <span key={c} title={labels[c]}>
                    {COUNTRY_FLAG[c]}
                  </span>
                ))}
              </div>
              <h1 className="text-balance text-3xl font-bold tracking-tight text-white drop-shadow-lg sm:text-4xl lg:text-5xl">
                {guide.title}
              </h1>
              <p className="mt-3 max-w-2xl text-balance text-sm text-white/90 sm:text-base">
                {guide.excerpt}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-xs text-white/90">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
                  <Calendar className="size-3.5" aria-hidden="true" />
                  {guide.days} {daysLabel(guide.days, locale)}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
                  <Route className="size-3.5" aria-hidden="true" />
                  {fmtKm(guide.km, locale)} km
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 backdrop-blur-sm">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {guide.readTime} {t("hero.readTime")}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* Atribucija hero fotografije (CC licence zahtevajo navedbo) */}
        {heroCredit && (
          <p className="mx-auto max-w-3xl px-4 pt-4 text-right text-xs text-muted-foreground/80 sm:px-6 lg:px-8">
            {t("credit.photo")} {heroCredit.author} · {heroCredit.source} · {heroCredit.license}
          </p>
        )}

        <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 lg:px-8">
          {/* Breadcrumbs + meta */}
          <nav
            aria-label={t("breadcrumb.aria")}
            className="mb-6 flex flex-wrap items-center gap-2 text-sm text-muted-foreground"
          >
            <Link href="/" className="hover:text-foreground">{t("breadcrumb.home")}</Link>
            <span aria-hidden="true">/</span>
            <Link href="/vodici" className="hover:text-foreground">{t("breadcrumb.guides")}</Link>
            <span aria-hidden="true">/</span>
            <span className="text-foreground">{guide.metaTitle}</span>
          </nav>
          <div className="mb-10 flex flex-wrap items-center justify-between gap-3 border-b pb-6 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <User className="size-4" aria-hidden="true" />
              {guide.author} · {fmtDate(guide.date, locale)}
            </span>
            <span className="inline-flex items-center gap-2">
              <Compass className="size-4" aria-hidden="true" />
              {guide.route}
            </span>
          </div>

          {/* Pot — timeline postaj */}
          <section aria-labelledby="adria-route" className="mb-12">
            <h2 id="adria-route" className="mb-2 text-2xl font-bold">{t("route.title")}</h2>
            <p className="mb-6 text-muted-foreground">
              {t("route.intro", {
                days: guide.days,
                daysWord: daysLabel(guide.days, locale),
                count: guide.countries.length,
                countryWord: countryWord(guide.countries.length, locale),
                km: fmtKm(guide.km, locale),
              })}
            </p>
            <ol className="relative">
              {guide.stops.map((stop, i) => (
                <li key={`${stop.name}-${i}`} className="relative flex gap-4 pb-6 last:pb-0">
                  {/* Vertikalna črta timeline */}
                  {i < guide.stops.length - 1 && (
                    <span
                      aria-hidden="true"
                      className="absolute left-[17px] top-9 h-full w-0.5 bg-border"
                    />
                  )}
                  <div className="relative z-10 flex size-9 shrink-0 items-center justify-center rounded-full border bg-background text-sm">
                    {COUNTRY_FLAG[stop.country] ?? "🚗"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{stop.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {labels[stop.country] ?? stop.country}
                      </span>
                      {stop.nights > 0 ? (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <BedDouble className="size-3" aria-hidden="true" />
                          {stop.nights} {nightsLabel(stop.nights, locale)}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">
                          {t("hero.startingPoint")}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {stop.highlight}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          {/* Vsebinske sekcije */}
          {guide.sections.map((sec) => (
            <section key={sec.heading} className="mb-12">
              <h2 className="mb-4 text-2xl font-bold">{sec.heading}</h2>
              {sec.body.map((p, i) => (
                <p key={i} className="mb-4 leading-relaxed text-muted-foreground">
                  {p}
                </p>
              ))}
              {sec.list && sec.list.length > 0 && (
                <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {sec.list.map((item) => (
                    <Card key={item.title} className="border-primary/20">
                      <CardContent className="p-4">
                        <h3 className="mb-1.5 flex items-center gap-2 font-semibold">
                          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
                          {item.title}
                        </h3>
                        <p className="text-sm leading-relaxed text-muted-foreground">{item.text}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </section>
          ))}

          {/* Praktično */}
          <section aria-labelledby="adria-practical" className="mb-12">
            <h2 id="adria-practical" className="mb-6 text-2xl font-bold">{t("practical.title")}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {guide.practical.map((p) => (
                <Card key={p.title} className="border-border">
                  <CardContent className="p-4">
                    <h3 className="mb-1.5 flex items-start gap-2 font-semibold">
                      <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                      {p.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{p.text}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* FAQ */}
          <section aria-labelledby="adria-faq" className="mb-12">
            <h2 id="adria-faq" className="mb-6 text-2xl font-bold">{t("faq.title")}</h2>
            <div className="space-y-3">
              {guide.faqs.map((faq, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <h3 className="mb-2 font-semibold">{faq.question}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          {/* Affiliate CTA — booking intent (fail-closed brez ID-jev) */}
          <AffiliateCtaBlock destination={topStop.name} variant="full" />

          {/* CTA: AI itinerer — vrača promet v jedro platforme */}
          <section className="mt-12 rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
            <h2 className="mb-3 text-2xl font-bold">{t("aiCta.title")}</h2>
            <p className="mx-auto mb-5 max-w-xl text-muted-foreground">
              {t("aiCta.body")}
            </p>
            <Button asChild size="lg">
              <Link href="/nacrtuj">
                <Ticket className="mr-2 size-4" aria-hidden="true" />
                {t("aiCta.button")}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Link>
            </Button>
          </section>

          {/* Sorodni jadranski vodniki */}
          {related.length > 0 && (
            <section aria-labelledby="adria-related" className="mt-12">
              <h2 id="adria-related" className="mb-6 text-2xl font-bold">{t("related.title")}</h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {related.map((r) => {
                  const rGuide =
                    locale === "en" ? getAdriaGuideBySlugEn(r.slug) : r;
                  const rShown = rGuide ?? r;
                  return (
                    <Link
                      key={r.slug}
                      href={`/vodici/${r.slug}`}
                      className="group rounded-xl border p-4 transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-lg" aria-hidden="true">
                        {r.countries.map((c) => COUNTRY_FLAG[c]).join("")}
                      </div>
                      <h3 className="font-semibold leading-snug group-hover:text-primary">
                        {rShown.metaTitle}
                      </h3>
                      <p className="mt-1.5 line-clamp-2 text-sm text-muted-foreground">{rShown.excerpt}</p>
                      <p className="mt-2 text-xs font-medium text-primary">
                        {t("related.meta", {
                          days: r.days,
                          daysWord: daysLabel(r.days, locale),
                          km: fmtKm(r.km, locale),
                        })}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* Slovenska stran poti — notranje povezave v jedro platforme */}
          {sloveniaDests.length > 0 && (
            <section aria-labelledby="adria-slo" className="mt-12">
              <h2 id="adria-slo" className="mb-2 text-2xl font-bold">
                {t("slovenia.title")}
              </h2>
              <p className="mb-6 text-muted-foreground">
                {t("slovenia.description")}
              </p>
              <div className="flex flex-wrap gap-2">
                {sloveniaDests.map((d) => (
                  <Button key={d.id} asChild variant="outline" size="sm">
                    <Link href={`/destinacija/${d.slug}/things-to-do`}>{d.name}</Link>
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
