import { safeJsonLd } from "@/lib/security";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { getEnDestination, REGIONS_EN } from "@/lib/slovenia-data-en";
import { LanguageToggle } from "@/components/language-toggle";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Star, ArrowRight, Ticket } from "lucide-react";
import { faqJsonLd, breadcrumbJsonLd, destinationSchema, hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { getFaqForPage } from "@/lib/seo-faq";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AffiliateCtaBlock } from "@/components/sections/affiliate-cta-block";
import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import {
  SeoExperienceCard,
  SeoListingCard,
  type SeoListingInput,
} from "@/components/sections/seo-conversion";
import type { Experience } from "@/lib/marketplace-types";
import type { PartnerStatus } from "@/components/partner-badge";

/**
 * /destinacija/[slug]/things-to-do — programatska SEO stran (kaj početi).
 *
 * FW4.3-2: dvojezična stran (server vzorec iz /o-strani):
 * - vsa (vidna) besedila prek getTranslations("thingsToDo"),
 * - kadar je locale "en", se destinacijska tekstovna polja (tagline,
 *   description, highlights) prekrijejo z EN overlay-jem getEnDestination(),
 * - DB sekcije (listings/experiences/products → kartice z imeni ponudnikov)
 *   se na EN NE izrisujejo (P4-8 — vsebina v bazi je slovenska, mešanje
 *   jezikov je prepovedano); enako velja za AI-generirane slovenske FAQ,
 * - AffiliateCtaBlock ostaja v obeh jezikih (lastnik prevoda: T2),
 * - canonical/hreflang/og:locale so locale-zavedni.
 */

/** JSON string iz Prisma → string[] (robustno ob neveljavnih podatkih). */
function parseJsonArray(raw: string): string[] {
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? (v as string[]) : [];
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  return DESTINATIONS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const t = await getTranslations("thingsToDo");
  const locale = await getLocale();
  if (!dest) return { title: t("meta.notFound") };
  // FW4.3-2: EN overlay za tekstovna polja (id/slug/name/slike/cene ostanejo izvirni)
  const en = locale === "en" ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const highlights = en?.highlights ?? dest.highlights;
  const region = locale === "en" ? (REGIONS_EN[dest.region] ?? dest.region) : dest.region;
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju (ne statična domena)
  const base = await currentBaseUrl();
  return {
    title: t("meta.title", { name: dest.name }),
    description: t("meta.description", {
      name: dest.name,
      tagline,
      count: highlights.length,
    }),
    keywords:
      locale === "en"
        ? [dest.name, "things to do", "activities", "attractions", "Slovenia", region, ...highlights]
        : [dest.name, "kaj početi", "aktivnosti", "znamenitosti", "Slovenija", dest.region, ...dest.highlights],
    openGraph: {
      title: t("meta.ogTitle", { name: dest.name }),
      description: t("meta.ogDescription", {
        count: highlights.length,
        name: dest.name,
      }),
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
    alternates: {
      canonical: `${base}${localePrefix(locale)}/destinacija/${dest.slug}/things-to-do`,
      languages: hreflangForPath(`/destinacija/${dest.slug}/things-to-do`, base),
    },
  };
}

export default async function ThingsToDoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  if (!dest) notFound();

  const locale = await getLocale();
  const t = await getTranslations("thingsToDo");
  const isEn = locale === "en";

  // FW4.3-2: EN overlay — tagline/description/highlights v angleščini,
  // identifikatorji/slike/cene ostanejo iz slovenskega vira resnice.
  const en = isEn ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const description = en?.description ?? dest.description;
  const highlights = en?.highlights ?? dest.highlights;
  const regionBadge = isEn ? (REGIONS_EN[dest.region] ?? dest.region) : dest.region;

  // Pridobi povezane lokale, izkušnje in izdelke iz baze
  // (P4-8: na EN se te sekcije NE izrisujejo — vsebina v bazi je slovenska —
  // zato se na EN sploh NE povprašuje po bazi; enak vzorec kot guide/[type])
  let listings: import("@prisma/client").Listing[] = [];
  let experiences: import("@prisma/client").Experience[] = [];
  let products: import("@prisma/client").Product[] = [];
  if (!isEn) {
    [listings, experiences, products] = await Promise.all([
      db.listing.findMany({ where: { destinationId: dest.id }, take: 6, orderBy: { featured: "desc" } }),
      db.experience.findMany({ where: { destinationId: dest.id }, take: 6, orderBy: { featured: "desc" } }),
      db.product.findMany({ where: { destinationId: dest.id }, take: 4, orderBy: { featured: "desc" } }),
    ]);
  }

  const totalActivities = listings.length + experiences.length;
  // SEO-2: host-zavedni JSON-LD (breadcrumb items + destinationSchema)
  const base = await currentBaseUrl();

  // Mapiranje v client-safe tipe (images/languages so v DB JSON string-i)
  const seoExperiences: Experience[] = experiences.map((e) => ({
    ...e,
    images: parseJsonArray(e.images),
    languages: parseJsonArray(e.languages),
    category: e.category as Experience["category"],
  }));
  const seoListings: SeoListingInput[] = listings.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    description: l.description,
    address: l.address,
    rating: l.rating,
    reviewCount: l.reviewCount,
    plan: l.plan,
    featured: l.featured,
    partnerStatus: (l.partnerStatus as PartnerStatus | null) ?? "standard",
    destinationName: l.destinationName ?? dest.name,
  }));

  // FW4.3-2: JSON-LD description/tagline/highlights v jeziku strani (EN overlay)
  const jsonLd = destinationSchema(
    isEn && en ? { ...dest, ...en } : dest,
    base
  );

  // AI-generirane FAQ za SEO rich snippets (z 90-dnevnim cache-om).
  // P4-8: AI FAQ vsebina je slovenska — na EN se NE izrisuje niti ne
  // generira (prepovedano mešanje jezikov).
  const aiFaqs = isEn
    ? []
    : (await getFaqForPage(dest.slug, dest.name, "things-to-do")).faqs;

  const faqs = aiFaqs.map((f) => ({ q: f.question, a: f.answer }));

  const breadcrumbs = breadcrumbJsonLd([
    { name: t("breadcrumbHome"), url: `${base}/` },
    { name: dest.name, url: `${base}/destinacija/${dest.slug}/things-to-do` },
  ]);

  const title = t("trackerTitle", { name: dest.name });

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path={`/destinacija/${dest.slug}/things-to-do`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      {faqs.length > 0 ? (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faqs)) }} />
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }} />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={`/destinacija/${dest.slug}/things-to-do`} title={title} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">{t("breadcrumbHome")}</Link>
          <span>/</span>
          <span className="text-foreground">{dest.name}</span>
        </nav>
      </div>

      {/* Hero */}
      <div className="relative h-[400px] w-full overflow-hidden">
        <img src={dest.image} alt={dest.name} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">{regionBadge}</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-white drop-shadow-lg">
            {t("heroTitle", { name: dest.name })}
          </h1>
          <p className="mt-3 max-w-2xl text-white/90 text-lg">{tagline}</p>
          <p className="mt-2 text-white/70 text-sm">
            {t("heroStats", {
              highlights: highlights.length,
              activities: totalActivities,
              rating: dest.rating.toString(),
            })}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Opis */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">{t("aboutTitle", { name: dest.name })}</h2>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </section>

        {/* Glavne znamenitosti */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">{t("highlightsTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {highlights.map((h) => (
              <Card key={h}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Star className="size-5 text-primary" />
                  </div>
                  <span className="font-medium">{h}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Aktivnosti / Izkušnje — REALNA rezervacijska pot (enaka kot homepage) */}
        {/* P4-8: DB vsebina (imena ponudnikov) je slovenska — na EN skrito */}
        {!isEn && seoExperiences.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t("experiencesTitle", { name: dest.name })}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {seoExperiences.map((exp) => (
                <SeoExperienceCard key={exp.id} experience={exp} />
              ))}
            </div>
          </section>
        )}

        {/* Lokalci — REALNI lead capture (povpraševanje ponudniku) */}
        {/* P4-8: DB vsebina (imena ponudnikov) je slovenska — na EN skrito */}
        {!isEn && seoListings.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t("listingsTitle", { name: dest.name })}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {seoListings.map((l) => (
                <SeoListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        )}

        {/* Lokalni izdelki */}
        {/* P4-8: DB vsebina (imena izdelkov) je slovenska — na EN skrito */}
        {!isEn && products.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t("productsTitle", { name: dest.name })}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-1">{p.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{p.description}</p>
                    <span className="font-bold text-primary">{p.price}€</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Best time to visit */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">{t("bestTimeTitle", { name: dest.name })}</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/pomlad`}>🌸 {t("seasons.pomlad")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/poletje`}>☀️ {t("seasons.poletje")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/jesen`}>🍂 {t("seasons.jesen")}</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/zima`}>❄️ {t("seasons.zima")}</Link>
            </Button>
          </div>
        </section>

        {/* FAQ (P4-8: AI-generirana slovenska vsebina — na EN skrito) */}
        {faqs.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">{t("faqTitle")}</h2>
            <div className="space-y-3">
              {faqs.map((faq, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-2">{faq.q}</h3>
                    <p className="text-sm text-muted-foreground">{faq.a}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Affiliate CTA — booking intent NAD AI CTA (monetizacija organskega prometa) */}
        <AffiliateCtaBlock destination={dest.name} variant="full" />

        {/* CTA: AI itinerer */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">{t("planTitle", { name: dest.name })}</h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            {t("planText", { name: dest.name })}
          </p>
          <Button asChild size="lg">
            <Link href="/nacrtuj">
              <Ticket className="size-4 mr-2" />
              {t("planButton")}
              <ArrowRight className="size-4 ml-2" />
            </Link>
          </Button>
        </section>

        {/* Ostale destinacije */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-6">{t("exploreTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id).slice(0, 8).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/things-to-do`}>{d.name}</Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
