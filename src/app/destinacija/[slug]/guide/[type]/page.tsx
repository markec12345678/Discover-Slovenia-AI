import { safeJsonLd } from "@/lib/security";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import type {
  Listing as DbListing,
  Experience as DbExperience,
} from "@prisma/client";
import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { getEnDestination, REGIONS_EN } from "@/lib/slovenia-data-en";
import { LanguageToggle } from "@/components/language-toggle";
import {
  GUIDE_TYPES,
  GUIDE_TYPE_META,
  type GuideType,
} from "@/lib/sitemap-urls";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Users,
  Wallet,
  CalendarDays,
  MapPin,
  Star,
  ArrowRight,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Mountain,
  Clock,
} from "lucide-react";
import { faqJsonLd, breadcrumbJsonLd, hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AffiliateCtaBlock } from "@/components/sections/affiliate-cta-block";
import {
  SeoExperienceCard,
  SeoListingCard,
  type SeoListingInput,
} from "@/components/sections/seo-conversion";
import type { Experience } from "@/lib/marketplace-types";
import type { PartnerStatus } from "@/components/partner-badge";

/**
 * /destinacija/[slug]/guide/[type] — programatski vodniki (22 × 4 = 88).
 *
 * FW4.3-2: dvojezična stran (SL + EN) po vzorcu /o-strani:
 * - Vsa besedila prek `getTranslations("guidePage")` (server komponenta);
 *   fragment: src/i18n/fragments/guidePage.{sl,en}.json.
 * - Label/shortLabel/description/durationLabel/priceRange/bestFor/title/
 *   intro/FAQ/poudarki so v `guidePage.guideTypes.<type>.*` (ključi = slugi
 *   tipov iz sitemap-urls.ts); emoji in kategorije ostanejo v kodi.
 * - dest.tagline/highlights na EN iz EN prekrivne plasti (getEnDestination).
 * - DB sekcije (SeoExperienceCard/SeoListingCard — imena ponudnikov iz baze)
 *   se na EN NE izrisujejo (P4-8: nikoli mešanja jezikov); na EN se sploh
 *   ne povprašuje po bazi.
 * - Notranje povezave prek `Link` iz `@/i18n/navigation` (samodejni /en
 *   prefix). JSON-LD (FAQ/Breadcrumb/TouristTrip) uporablja ISTE vrednosti,
 *   ki jih stran izpisuje.
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

// 4 tipi vodnikov — ikona + kategorije za pridobivanje iz baze
// (besedila: durationLabel/priceRange/bestFor so v guidePage fragmentu)
const GUIDE_DETAILS: Record<
  GuideType,
  {
    icon: typeof Heart;
    /** Priporočene kategorije Listing/Experience za pridobivanje iz baze */
    listingCategories: string[];
    experienceCategories: string[];
  }
> = {
  "romanticni-pobeg": {
    icon: Heart,
    listingCategories: ["hotel", "restaurant", "bar"],
    experienceCategories: ["tasting", "wellness", "cultural"],
  },
  druzinski: {
    icon: Users,
    listingCategories: ["hotel", "restaurant", "activity"],
    experienceCategories: ["outdoor", "workshop", "cultural"],
  },
  budget: {
    icon: Wallet,
    listingCategories: ["restaurant", "activity", "transport"],
    experienceCategories: ["outdoor", "cultural", "workshop"],
  },
  vikend: {
    icon: CalendarDays,
    listingCategories: ["hotel", "restaurant", "activity", "bar"],
    experienceCategories: ["tour", "tasting", "outdoor", "cultural"],
  },
};

// Ikone 3 poudarjenih aktivnosti glede na tip vodnika (vrstni red h1→h3)
const HIGHLIGHT_ICONS: Record<GuideType, typeof Heart[]> = {
  "romanticni-pobeg": [Heart, Sparkles, UtensilsCrossed],
  druzinski: [Mountain, Users, UtensilsCrossed],
  budget: [MapPin, Wallet, Mountain],
  vikend: [CalendarDays, Star, Clock],
};

/**
 * Label v levem kontekstu: SL — cela oznaka malo (kot v izvirniku),
 * EN — samo prva črka mala (naravno sredini stavka).
 */
function lowerLabel(label: string, locale: string): string {
  return locale === "sl"
    ? label.toLowerCase()
    : label.charAt(0).toLowerCase() + label.slice(1);
}

// generateStaticParams: 22 destinacij × 4 tipi = 88 kombinacij
export async function generateStaticParams() {
  const params: { slug: string; type: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const type of GUIDE_TYPES) {
      params.push({ slug: dest.slug, type });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; type: string }>;
}): Promise<Metadata> {
  const { slug, type } = await params;
  const dest =
    getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const guideType = GUIDE_TYPES.find((x) => x === type) as GuideType | undefined;
  const t = await getTranslations("guidePage");
  if (!dest || !guideType) return { title: t("metaNotFound") };

  const locale = await getLocale();
  const name = dest.name;
  const label = t(`guideTypes.${guideType}.label`);
  const labelLower = lowerLabel(label, locale);
  const title = t(`guideTypes.${guideType}.title`, { name });
  const tagline =
    locale === "en"
      ? (getEnDestination(dest.id)?.tagline ?? dest.tagline)
      : dest.tagline;
  const intro = t(`guideTypes.${guideType}.intro`, {
    name,
    // SL izpis privatnega uvoda je z malo začetnico (kot v izvirniku)
    tagline: locale === "sl" ? tagline.toLowerCase() : tagline,
  });
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju (FW4.3-2: + locale prefix)
  const base = await currentBaseUrl();
  const canonicalPath = `/destinacija/${dest.slug}/guide/${guideType}`;
  const prefixed = `${localePrefix(locale)}${canonicalPath}`;

  return {
    title: t("meta.title", { title, label, labelLower }),
    description: `${intro.slice(0, 155)}...`,
    keywords: [
      name,
      label,
      t("meta.keywordGuide"),
      t("meta.keywordTravel"),
      t("meta.keywordSlovenia"),
      t(`guideTypes.${guideType}.metaKeyword`),
      locale === "en"
        ? (REGIONS_EN[dest.region] ?? dest.region)
        : dest.region,
    ].filter(Boolean),
    openGraph: {
      title: `${title} — Discover Slovenia AI`,
      description: t("meta.ogDescription", {
        description: t(`guideTypes.${guideType}.description`),
        name,
      }),
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
      url: `${base}${prefixed}`,
    },
    alternates: {
      canonical: `${base}${prefixed}`,
      languages: hreflangForPath(canonicalPath, base),
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string; type: string }>;
}) {
  const { slug, type } = await params;
  const dest =
    getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const guideType = GUIDE_TYPES.find((x) => x === type) as GuideType | undefined;
  if (!dest || !guideType) notFound();

  // FW4.3-2: vsa besedila prek fragmenta guidePage; locale iz proxy headerja
  const t = await getTranslations("guidePage");
  const locale = await getLocale();
  const isEn = locale === "en";

  const meta = GUIDE_TYPE_META[guideType]; // emoji (skupen za oba jezika)
  const details = GUIDE_DETAILS[guideType];
  const Icon = details.icon;

  const name = dest.name;
  const label = t(`guideTypes.${guideType}.label`);
  const labelLower = lowerLabel(label, locale);
  const tagline = isEn
    ? (getEnDestination(dest.id)?.tagline ?? dest.tagline)
    : dest.tagline;
  const title = t(`guideTypes.${guideType}.title`, { name });
  const intro = t(`guideTypes.${guideType}.intro`, {
    name,
    // SL izpis privatnega uvoda je z malo začetnico (kot v izvirniku)
    tagline: isEn ? tagline : tagline.toLowerCase(),
  });
  const durationLabel = t(`guideTypes.${guideType}.durationLabel`);
  const priceRange = t(`guideTypes.${guideType}.priceRange`);
  const typeDescription = t(`guideTypes.${guideType}.description`);

  // Poudarki destinacije — na EN iz EN prekrivne plasti
  const destHighlights = isEn
    ? (getEnDestination(dest.id)?.highlights ?? dest.highlights)
    : dest.highlights;
  const fallbackHl = t("fallbackHighlight");
  const pickHl = (i: number) =>
    destHighlights[i] ??
    destHighlights[i % destHighlights.length] ??
    fallbackHl;
  const hl1 = pickHl(0);
  const hl2 = pickHl(1);
  const hl3 = pickHl(2);
  // SL izpis uporablja male začetnice poudarkov (kot v izvirniku); EN poudarki
  // so lastna imena in ostanejo z veliko začetnico — zato dve vrednosti.
  const lowerHl = (s: string) => (isEn ? s : s.toLowerCase());
  const hlParams = {
    name,
    hl1,
    hl1Lower: lowerHl(hl1),
    hl2,
    hl2Lower: lowerHl(hl2),
    hl3,
  };

  // Poudarjene aktivnosti (3 predlogi) glede na tip vodnika
  const highlights = (["h1", "h2", "h3"] as const).map((hk, i) => ({
    title: t(`guideTypes.${guideType}.${hk}.title`, hlParams),
    description: t(`guideTypes.${guideType}.${hk}.description`, hlParams),
    icon: HIGHLIGHT_ICONS[guideType][i],
  }));

  // FAQ — ISTI vir kot FAQPage JSON-LD (na EN prevedena vprašanja)
  const faqParams = { name, price: priceRange };
  const faqs = (["q1", "q2", "q3", "q4"] as const).map((qk, i) => ({
    q: t(`faqs.${guideType}.${qk}`, faqParams),
    a: t(`faqs.${guideType}.a${i + 1}`, faqParams),
  }));
  faqs.push({
    q: t("faqs.ai.q", faqParams),
    a: t("faqs.ai.a", faqParams),
  });

  // SEO-2: host-zavedni breadcrumb JSON-LD (FW4.3-2: EN poti z /en prefixom)
  const base = await currentBaseUrl();
  const canonicalPath = `/destinacija/${dest.slug}/guide/${guideType}`;
  const prefixedPath = `${localePrefix(locale)}${canonicalPath}`;

  // Pridobi povezane lokale in izkušnje iz baze (filtrirano po tipu vodnika).
  // P4-8: DB vsebina (imena ponudnikov) je slovenska — na EN sekcij NE
  // izrisujemo in sploh ne povprašujemo po bazi.
  let listings: DbListing[] = [];
  let experiences: DbExperience[] = [];
  if (!isEn) {
    [listings, experiences] = await Promise.all([
      db.listing.findMany({
        where: {
          destinationId: dest.id,
          category: { in: details.listingCategories },
        },
        take: 6,
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
      }),
      db.experience.findMany({
        where: {
          destinationId: dest.id,
          category: { in: details.experienceCategories },
        },
        take: 4,
        orderBy: [{ featured: "desc" }, { rating: "desc" }],
      }),
    ]);
  }

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

  // JSON-LD: FAQPage + BreadcrumbList + TouristTrip (prevedene vrednosti)
  const breadcrumbs = breadcrumbJsonLd([
    { name: t("breadcrumbHome"), url: `${base}${localePrefix(locale)}/` },
    {
      name: dest.name,
      url: `${base}${localePrefix(locale)}/destinacija/${dest.slug}/things-to-do`,
    },
    { name: label },
  ]);

  const touristTrip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: title,
    description: intro,
    image: dest.image,
    touristDestination: {
      "@type": "TouristDestination",
      name: dest.name,
      address: {
        "@type": "PostalAddress",
        addressCountry: "SI",
        addressRegion: isEn
          ? (REGIONS_EN[dest.region] ?? dest.region)
          : dest.region,
      },
    },
    offers: {
      "@type": "Offer",
      priceRange: priceRange,
      priceCurrency: "EUR",
    },
  };

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path={`/destinacija/${dest.slug}/guide/${guideType}`} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faqs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(touristTrip) }}
      />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={prefixedPath} title={title} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <nav
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-label={t("breadcrumbAria")}
        >
          <Link href="/" className="hover:text-foreground">
            {t("breadcrumbHome")}
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/destinacija/${dest.slug}/things-to-do`}
            className="hover:text-foreground"
          >
            {dest.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{label}</span>
        </nav>
      </div>

      {/* Hero */}
      <div className="relative h-[400px] w-full overflow-hidden mt-4">
        <img
          src={dest.image}
          alt={`${name} — ${label}`}
          className="size-full object-cover"
        />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">
            <Icon className="size-3.5 mr-1" aria-hidden="true" />
            {label} · {meta.emoji}
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-bold text-white drop-shadow-lg">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-white/90 text-base sm:text-lg">
            {tagline}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Clock className="size-3 mr-1" aria-hidden="true" />
              {durationLabel}
            </Badge>
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Wallet className="size-3 mr-1" aria-hidden="true" />
              {priceRange}
            </Badge>
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Star
                className="size-3 mr-1 fill-amber-400 text-amber-400"
                aria-hidden="true"
              />
              {t("editorialRating", { rating: String(dest.rating) })}
            </Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Ostali tipi vodnikov (preklopi) */}
        <section className="mb-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GUIDE_TYPES.map((otherType) => {
              const OtherIcon = GUIDE_DETAILS[otherType].icon;
              const isActive = otherType === guideType;

              return (
                <Link
                  key={otherType}
                  href={`/destinacija/${dest.slug}/guide/${otherType}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md h-full ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <CardContent className="p-3 text-center">
                      <OtherIcon
                        className={`size-5 mx-auto mb-1 ${
                          isActive ? "text-primary" : "text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      />
                      <p className="text-xs font-medium">
                        {t(`guideTypes.${otherType}.shortLabel`)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Uvodni opis */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span aria-hidden="true">{meta.emoji}</span>
            {t("introHeading", { label, name })}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-4">{intro}</p>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Sparkles
                className="size-5 text-primary shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-sm">
                  {t(`guideTypes.${guideType}.bestFor`)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {t("metaLine", { duration: durationLabel, price: priceRange })}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Poudarjene aktivnosti (3 predlogi) */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("highlightsTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {highlights.map((h, i) => {
              const HIcon = h.icon;
              return (
                <Card key={i} className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <HIcon className="size-5 text-primary" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold">{h.title}</h3>
                    <p className="text-sm text-muted-foreground">{h.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Povezane izkušnje iz baze — REALNA rezervacijska pot (P4-8: samo SL) */}
        {seoExperiences.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {t("experiencesTitle", { name, labelLower })}
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                  {t("allExperiences")}
                  <ArrowRight className="size-3.5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {seoExperiences.map((exp) => (
                <SeoExperienceCard key={exp.id} experience={exp} />
              ))}
            </div>
          </section>
        )}

        {/* Lokalci — REALNI lead capture (povpraševanje ponudniku; P4-8: samo SL) */}
        {seoListings.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                {t("listingsTitle", { name })}
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                  {t("allListings")}
                  <ArrowRight className="size-3.5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {seoListings.map((l) => (
                <SeoListingCard key={l.id} listing={l} />
              ))}
            </div>
          </section>
        )}

        {/* Cross-linking — najboljši čas in things-to-do */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("relatedTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="hover:border-primary/40 transition-colors">
              <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="size-6 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {t("thingsToDoTitle", { name })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("thingsToDoDesc", {
                        count: destHighlights.length,
                        name,
                      })}
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardContent>
              </Link>
            </Card>
            <Card className="hover:border-primary/40 transition-colors">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/pomlad`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <CalendarDays
                      className="size-6 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      {t("bestTimeTitle", { name })}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {t("bestTimeDesc")}
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardContent>
              </Link>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("faqTitle")}</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 flex items-start gap-2">
                    <span className="text-primary font-bold" aria-hidden="true">
                      Q:
                    </span>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary font-bold" aria-hidden="true">
                      A:
                    </span>
                    {faq.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Affiliate CTA — vodniki = fokus na izkušnje in najem avta */}
        <AffiliateCtaBlock destination={dest.name} variant="activities-cars" />

        {/* CTA za AI itinerer */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">
            {t("ctaTitle", { labelLower, name })}
          </h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            {t("ctaP", { description: typeDescription })}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/nacrtuj">
                <Ticket className="size-4 mr-2" aria-hidden="true" />
                {t("ctaPlanner")}
                <ArrowRight className="size-4 ml-2" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/destinacija/${dest.slug}/itinerary/vikend`}>
                <CalendarDays className="size-4 mr-2" aria-hidden="true" />
                {t("ctaItineraries")}
              </Link>
            </Button>
          </div>
        </section>

        {/* Ostale destinacije — ista tipa vodnika */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-4">
            {t("elsewhereTitle", { label })}
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            {t("elsewhereDesc", { labelLower })}
          </p>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id)
              .slice(0, 10)
              .map((d) => (
                <Button key={d.id} asChild variant="outline" size="sm">
                  <Link href={`/destinacija/${d.slug}/guide/${guideType}`}>
                    <MapPin className="size-3.5 mr-1" aria-hidden="true" />
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
