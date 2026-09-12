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
import { Calendar, Clock, Users, ArrowRight, Sparkles } from "lucide-react";

/**
 * /destinacija/[slug]/itinerary/[duration] — programatska SEO stran
 * (itinererji po trajanju).
 *
 * FW4.3-2: dvojezična stran (server vzorec iz /o-strani):
 * - DURATIONS/TRAVELER_TYPES label+desc prek fragmenta "itineraryPage"
 *   (slugi/days/ikone ostanejo skupni),
 * - telesa strani (intro, dnevi, sekcije) prek t() z interpolacijo
 *   {name}/{duration}/{days},
 * - kadar je locale "en", se destinacijska polja (tagline/description/
 *   highlights) prekrijejo z EN overlay-jem getEnDestination(),
 * - notranje povezave vodijo prek Link iz @/i18n/navigation,
 * - canonical/hreflang/og:locale so locale-zavedni.
 */

// Možnosti trajanja (labelKey/descKey → ključi v "itineraryPage" fragmentu)
const DURATIONS = [
  { slug: "1-dan", days: 1, labelKey: "durations.1-dan.label", descKey: "durations.1-dan.desc" },
  { slug: "vikend", days: 2, labelKey: "durations.vikend.label", descKey: "durations.vikend.desc" },
  { slug: "3-dnevi", days: 3, labelKey: "durations.3-dnevi.label", descKey: "durations.3-dnevi.desc" },
  { slug: "5-dnevi", days: 5, labelKey: "durations.5-dnevi.label", descKey: "durations.5-dnevi.desc" },
  { slug: "7-dnevi", days: 7, labelKey: "durations.7-dnevi.label", descKey: "durations.7-dnevi.desc" },
];

// Tipi popotnika (labelKey/descKey → ključi v "itineraryPage" fragmentu)
const TRAVELER_TYPES = [
  { slug: "pari", labelKey: "travelerTypes.pari.label", descKey: "travelerTypes.pari.desc" },
  { slug: "druzina", labelKey: "travelerTypes.druzina.label", descKey: "travelerTypes.druzina.desc" },
  { slug: "solo", labelKey: "travelerTypes.solo.label", descKey: "travelerTypes.solo.desc" },
  { slug: "avanturist", labelKey: "travelerTypes.avanturist.label", descKey: "travelerTypes.avanturist.desc" },
];

export async function generateStaticParams() {
  const params: { slug: string; duration: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const dur of DURATIONS) {
      params.push({ slug: dest.slug, duration: dur.slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; duration: string }>;
}): Promise<Metadata> {
  const { slug, duration } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const dur = DURATIONS.find((d) => d.slug === duration);
  const t = await getTranslations("itineraryPage");
  const locale = await getLocale();
  if (!dest || !dur) return { title: t("meta.notFound") };
  // FW4.3-2: EN overlay za tekstovna polja (id/slug/name/slike/cene ostanejo izvirni)
  const en = locale === "en" ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const durLabel = t(dur.labelKey);
  const durDesc = t(dur.descKey);
  const region = locale === "en" ? (REGIONS_EN[dest.region] ?? dest.region) : dest.region;
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju
  const base = await currentBaseUrl();
  return {
    title: t("meta.title", { duration: durLabel, name: dest.name, desc: durDesc }),
    description: t("meta.description", {
      durationLower: durLabel.toLowerCase(),
      name: dest.name,
      tagline,
      desc: durDesc,
      days: dur.days,
    }),
    keywords:
      locale === "en"
        ? [dest.name, "itinerary", durLabel, "travel", "Slovenia", "plan", region]
        : [dest.name, "itinerer", durLabel, "potovanje", "Slovenija", "načrt", dest.region],
    openGraph: {
      title: t("headline", { duration: durLabel, name: dest.name }),
      description: t("meta.ogDescription", { duration: durLabel }),
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
    alternates: {
      canonical: `${base}${localePrefix(locale)}/destinacija/${dest.slug}/itinerary/${dur.slug}`,
      languages: hreflangForPath(`/destinacija/${dest.slug}/itinerary/${dur.slug}`, base),
    },
  };
}

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ slug: string; duration: string }>;
}) {
  const { slug, duration } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const dur = DURATIONS.find((d) => d.slug === duration);
  if (!dest || !dur) notFound();

  const locale = await getLocale();
  const t = await getTranslations("itineraryPage");

  // FW4.3-2: EN overlay — tagline/description/highlights v angleščini,
  // identifikatorji/slike/cene ostanejo iz slovenskega vira resnice.
  const en = locale === "en" ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const description = en?.description ?? dest.description;
  const highlights = en?.highlights ?? dest.highlights;

  const durLabel = t(dur.labelKey);
  const durDesc = t(dur.descKey);
  const headline = t("headline", { duration: durLabel, name: dest.name });

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: headline,
    description: `${durDesc} — ${description}`,
    touristDestination: { "@type": "TouristDestination", name: dest.name },
    image: dest.image,
  };

  const title = headline;

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path={`/destinacija/${dest.slug}/itinerary/${duration}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={`/destinacija/${dest.slug}/itinerary/${dur.slug}`} title={title} />

      <div className="relative h-[350px] w-full overflow-hidden">
        <img src={dest.image} alt={dest.name} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">{durLabel}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
            {headline}
          </h1>
          <p className="mt-2 text-white/90">{durDesc} — {tagline}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("overviewTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Calendar className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dur.days}</div>
                  <div className="text-sm text-muted-foreground">{dur.days === 1 ? t("unitDay") : t("unitDays")}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dest.costPerPerson * dur.days}€</div>
                  <div className="text-sm text-muted-foreground">{t("costLabel")}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Sparkles className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dest.rating}★</div>
                  <div className="text-sm text-muted-foreground">{t("ratingLabel")}</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("daysTitle")}</h2>
          <div className="space-y-4">
            {Array.from({ length: dur.days }).map((_, dayIdx) => (
              <Card key={dayIdx}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                      {dayIdx + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{t("dayLabel", { day: dayIdx + 1 })}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {dayIdx === 0
                          ? t("dayFirst", { name: dest.name })
                          : dayIdx === dur.days - 1
                            ? t("dayLast")
                            : t("dayMiddle")}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {highlights.slice(dayIdx * 2, (dayIdx + 1) * 2).map((h) => (
                          <Badge key={h} variant="secondary">{h}</Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="size-3.5" /> {t("hoursLabel")}</span>
                        <span className="flex items-center gap-1"><Users className="size-3.5" /> {dest.costPerPerson}{t("perPerson")}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("travelerTypesTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TRAVELER_TYPES.map((tt) => (
              <Card key={tt.slug} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-1">{t(tt.labelKey)}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{t(tt.descKey)}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/načrtuj`}>
                      {t("generateButton")} <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("otherDestinationsTitle")}</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id).slice(0, 10).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/itinerary/${dur.slug}`}>{d.name}</Link>
              </Button>
            ))}
          </div>
        </section>

        {/* Affiliate CTA — popotnik z itinererjem v rokah → rezervira nastanitev, avto, izkušnje */}
        <AffiliateCtaBlock destination={dest.name} variant="full" />

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-3">{t("personalizedTitle")}</h2>
          <p className="text-muted-foreground mb-5">
            {t("personalizedText")}
          </p>
          <Button asChild size="lg">
            <Link href="/nacrtuj">
              <Sparkles className="size-4 mr-2" />
              {t("personalizedButton")}
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
