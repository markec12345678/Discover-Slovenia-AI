import { safeJsonLd } from "@/lib/security";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getLocale, getTranslations } from "next-intl/server";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { BEST_FOR_EN, getEnDestination, REGIONS_EN } from "@/lib/slovenia-data-en";
import { getDestinationProvenance } from "@/lib/destination-provenance";
import { LanguageToggle } from "@/components/language-toggle";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Star,
  ArrowRight,
  Ticket,
  MapPin,
  Clock,
  Wallet,
  Users,
  CalendarDays,
  Sparkles,
  BadgeCheck,
  ExternalLink,
} from "lucide-react";
import { breadcrumbJsonLd, hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { PageViewTracker } from "@/components/page-view-tracker";
import { AffiliateCtaBlock } from "@/components/sections/affiliate-cta-block";
import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import {
  DURATION_SLUGS,
  GUIDE_TYPES,
  GUIDE_TYPE_META,
} from "@/lib/sitemap-urls";

/**
 * /destinacija/[slug] — NADREJENA hub stran destinacije (GEO-A).
 *
 * Do GEO-A (2026-09-14) je ta pot vračala 404 — kljub temu da so jo
 * referencirali: llms.txt + llms-full.txt (22× »Spletna stran destinacije«),
 * JSON-LD in opengraph-image.tsx. AI agenti, ki sledijo povezavam iz
 * lastne AI-datoteke, so pristali na mrtvi poti.
 *
 * Vloga strani: povezovalni VOZEL (ne duplikat vsebine):
 * - pove vse, kar AIagent/uporabnik potrebuje za odločitev (opis, dejstva),
 * - poveže VSE podstrani (things-to-do / 4 vodnike / 5 itinererjev /
 *   4 sezone) na enem mestu,
 * - notranje povezave do sosednjih destinacij v isti regiji,
 * - TouristDestination JSON-LD z lastno potjo (prej je schema obstajala
 *   samo na things-to-do podstrani).
 *
 * Arhitektura: 1:1 vzorec things-to-do (FW4.3-2 dvojezičnost z EN overlay,
 * locale-zavedni canonical/hreflang, PageViewTracker, AffiliateCtaBlock).
 * NI poizvedb po bazi — čisti hub iz slovenia-data.ts (single source of
 * truth), zato stran nima SEO-CACHE odvisnosti in je vedno hitra.
 */

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
  const t = await getTranslations("destinationPage");
  const locale = await getLocale();
  if (!dest) return { title: t("meta.notFound") };
  // FW4.3-2: EN overlay za tekstovna polja (id/slug/name/slike/cene ostanejo izvirni)
  const en = locale === "en" ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const duration = en?.duration ?? dest.duration;
  // SEO-2: canonical/hreflang na DEJANSKEM gostitelju (ne statična domena)
  const base = await currentBaseUrl();
  return {
    title: t("meta.title", { name: dest.name, tagline }),
    description: t("meta.description", {
      name: dest.name,
      tagline,
      duration,
      highlights: dest.highlights.slice(0, 3).join(", "),
    }),
    keywords:
      locale === "en"
        ? [dest.name, "Slovenia", "travel guide", "itinerary", "best time to visit", ...dest.highlights]
        : [dest.name, "Slovenija", "vodnik", "itinerer", "kaj početi", "najboljši čas obiska", ...dest.highlights],
    // OG sliko generira datotečna konvencija opengraph-image.tsx (namenska
    // 1200×630 z imenom/taglinom/dejstvi — močnejša od generične fotografije)
    openGraph: {
      title: t("meta.ogTitle", { name: dest.name }),
      description: t("meta.ogDescription", { name: dest.name, tagline }),
      type: "website",
      locale: locale === "en" ? "en_US" : "sl_SI",
    },
    alternates: {
      canonical: `${base}${localePrefix(locale)}/destinacija/${dest.slug}`,
      languages: hreflangForPath(`/destinacija/${dest.slug}`, base),
    },
  };
}

export default async function DestinationHubPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  if (!dest) notFound();

  const locale = await getLocale();
  const t = await getTranslations("destinationPage");
  // Vodniški tipi: oznake/opisi so v guidePage.guideTypes (dvojezični vir
  // resnice — GUIDE_TYPE_META opisi so samo slovenski, P4-8)
  const tg = await getTranslations("guidePage");
  const isEn = locale === "en";

  // FW4.3-2: EN overlay — tagline/description/highlights/duration v angleščini,
  // identifikatorji/slike/cene ostanejo iz slovenskega vira resnice.
  const en = isEn ? getEnDestination(dest.id) : undefined;
  const tagline = en?.tagline ?? dest.tagline;
  const description = en?.description ?? dest.description;
  const highlights = en?.highlights ?? dest.highlights;
  const duration = en?.duration ?? dest.duration;
  const regionBadge = isEn ? (REGIONS_EN[dest.region] ?? dest.region) : dest.region;
  // bestFor vsebuje slovenske besede (romantika, družina …) — na EN se
  // preslikajo (P4-8: nikoli mešanja jezikov)
  const bestFor = isEn
    ? dest.bestFor.map((b) => BEST_FOR_EN[b] ?? b)
    : dest.bestFor;

  const base = await currentBaseUrl();

  // Sezonske oznake: bestSeason vsebuje ključe spring/summer/autumn/winter
  const seasonLabels: Record<string, string> = isEn
    ? { spring: "Spring", summer: "Summer", autumn: "Autumn", winter: "Winter" }
    : { spring: "Pomlad", summer: "Poletje", autumn: "Jesen", winter: "Zima" };

  // Trajanja itinererjev: ključi iz DURATION_SLUGS, oznake iz i18n
  const durationLabels: Record<string, string> = {
    "1-dan": t("durations.d1"),
    vikend: t("durations.weekend"),
    "3-dnevi": t("durations.d3"),
    "5-dnevi": t("durations.d5"),
    "7-dnevi": t("durations.d7"),
  };

  // Sosednje destinacije v isti regiji — notranje povezave med hub stranimi
  const nearby = DESTINATIONS.filter((d) => d.region === dest.region && d.id !== dest.id);

  // ISSUE #4 §18 (VAL 7): provenance vsebine destinacije (vir + datum) —
  // prikaz uporabniku na hub strani; isto resnica kot API/ /vir-podatkov.
  const provenance = getDestinationProvenance(dest);

  // §18: formatirana datumova vrstica (ISO yyyy-mm-dd → prikaz).
  const verifiedAtLabel = provenance.verifiedAt.replaceAll("-", ". ");

  // JSON-LD: TouristDestination z LASTNO potjo (hub) — GEO-A: prej je
  // schema obstajala samo na things-to-do; hub zdaj drži kanonični zapis
  // s povezavami na vse podstrani (AI agenti sledijo containsPlace).
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": ["TouristDestination", "Place"],
    "@id": `${base}/destinacija/${dest.slug}#destination`,
    name: dest.name,
    description,
    tagline,
    image: {
      "@type": "ImageObject",
      url: dest.image,
      width: 1200,
      height: 800,
    },
    geo: {
      "@type": "GeoCoordinates",
      latitude: dest.coords.lat,
      longitude: dest.coords.lng,
    },
    address: {
      "@type": "PostalAddress",
      // ISSUE #4 §18 (VAL 7) BUGFIX: prej hardkodiran "SI" — LAŽ za 16
      // HR/ME/AL destinacij (Zagreb, Kotor, Tirana …) v JSON-LD. CountryCode
      // je že ISO 3166-1 alpha-2 — uporabimo dejansko državo zapisa.
      addressCountry: dest.country,
      addressRegion: dest.region,
    },
    // OPOMBA: aggregateRating NAMENOMA izpuščen — destinacije nimajo
    // pravih uporabniških recenzij (izmišljen reviewCount = napihnjen
    // social proof + tveganje za Google rich-results kazni).
    touristType: bestFor.map((b) => b.charAt(0).toUpperCase() + b.slice(1)),
    availableLanguage: ["Slovenian", "English", "German", "Italian"],
    isAccessibleForFree: dest.costPerPerson === 0,
    publicAccess: true,
    url: `${base}/destinacija/${dest.slug}`,
    // GEO-A (jedro): podstrani kot containsPlace — AI-jem in iskalnikom
    // pove celotno strukturo vsebine destinacije na enem mestu
    containsPlace: [
      {
        "@type": "Place",
        name: isEn ? `Things to do in ${dest.name}` : `Kaj početi v ${dest.name}`,
        url: `${base}/destinacija/${dest.slug}/things-to-do`,
      },
      ...GUIDE_TYPES.map((g) => ({
        "@type": "Place",
        name: tg(`guideTypes.${g}.label`),
        url: `${base}/destinacija/${dest.slug}/guide/${g}`,
      })),
      ...DURATION_SLUGS.map((dur) => ({
        "@type": "Place",
        name: durationLabels[dur],
        url: `${base}/destinacija/${dest.slug}/itinerary/${dur}`,
      })),
    ],
    // Sosednje destinacije iste regije — notranja povezavnost
    ...(nearby.length > 0
      ? {
          includedInDescriptionArea: nearby.slice(0, 5).map((d) => ({
            "@type": "TouristDestination",
            name: d.name,
            url: `${base}/destinacija/${d.slug}`,
          })),
        }
      : {}),
    sameAs: [
      `https://en.wikipedia.org/wiki/${dest.name.replace(/\s/g, "_")}`,
      "https://www.slovenia.info/en/destinations",
    ],
  };

  const breadcrumbs = breadcrumbJsonLd([
    { name: t("breadcrumbHome"), url: `${base}/` },
    { name: t("breadcrumbDestinations"), url: `${base}/destinacije` },
    { name: dest.name, url: `${base}/destinacija/${dest.slug}` },
  ]);

  const title = t("trackerTitle", { name: dest.name });

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path={`/destinacija/${dest.slug}`} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: safeJsonLd(breadcrumbs) }} />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={`/destinacija/${dest.slug}`} title={title} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">{t("breadcrumbHome")}</Link>
          <span>/</span>
          <Link href="/destinacije" className="hover:text-foreground">{t("breadcrumbDestinations")}</Link>
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
            {dest.name}
          </h1>
          <p className="mt-3 max-w-2xl text-white/90 text-lg">{tagline}</p>
          <p className="mt-2 text-white/70 text-sm">
            {t("heroStats", {
              highlights: highlights.length,
              duration,
              budget: dest.budget,
            })}
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Opis */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("aboutTitle", { name: dest.name })}</h2>
          <p className="text-muted-foreground leading-relaxed">{description}</p>
        </section>

        {/* Ključna dejstva */}
        <section className="mb-10">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Clock className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("facts.duration")}</p>
                  <p className="font-medium truncate">{duration}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Wallet className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("facts.budget")}</p>
                  <p className="font-medium truncate">
                    {dest.budget} · ~{dest.costPerPerson} €/{t("facts.person")}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Users className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("facts.bestFor")}</p>
                  <p className="font-medium truncate">{bestFor.join(", ")}</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <CalendarDays className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{t("facts.season")}</p>
                  <p className="font-medium truncate">
                    {dest.bestSeason.map((s) => seasonLabels[s] ?? s).join(", ")}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Glavne znamenitosti */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("highlightsTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {highlights.map((h) => (
              <Card key={h}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Star className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <span className="font-medium">{h}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* === ISSUE #4 §18 (VAL 7): VIR VSEBINE + ODIPIRALNI ČAS === */}
        {/* Prej: hub ni pokazal NE vira NE datuma NE opening (kljub temu da
            opening obstaja za 5 destinacij od F5.5). Sedaj: poštena vrstica
            vira (uradna stran ↔ uredniška kuracija) + "posodobljeno" +
            odpiralni časi z virom, kjer obstajajo. */}
        <section className="mb-10" aria-labelledby="destination-content-source">
          <Card className="border-border/60 bg-muted/20">
            <CardContent className="p-5">
              <h2
                id="destination-content-source"
                className="mb-3 flex items-center gap-2 text-base font-semibold"
              >
                <BadgeCheck className="size-4 text-primary" aria-hidden="true" />
                {t("source.title")}
              </h2>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-medium text-foreground/80">
                    {t("source.sourceLabel")}:
                  </span>
                  {provenance.kind === "official" && provenance.sourceUrl ? (
                    <a
                      href={provenance.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 font-medium text-primary underline-offset-2 hover:underline"
                    >
                      {provenance.source}
                      <ExternalLink className="size-3" aria-hidden="true" />
                      <span className="sr-only">
                        {t("source.externalSr")}
                      </span>
                    </a>
                  ) : (
                    <span>{provenance.source}</span>
                  )}
                </p>
                <p className="flex flex-wrap items-center gap-x-1.5">
                  <span className="font-medium text-foreground/80">
                    {t("source.updatedLabel")}:
                  </span>
                  <time dateTime={provenance.verifiedAt}>
                    {verifiedAtLabel}
                  </time>
                </p>
                {dest.opening ? (
                  <p className="flex flex-wrap items-start gap-x-1.5">
                    <span className="font-medium text-foreground/80">
                      {t("source.openingLabel")}:
                    </span>
                    <span>
                      {isEn ? dest.opening.noteEn : dest.opening.note}{" "}
                      <span className="text-muted-foreground/80">
                        ({t("source.sourceShort").toLowerCase()}:{" "}
                        {dest.opening.source})
                      </span>
                    </span>
                  </p>
                ) : null}
                <p className="pt-1 text-xs text-muted-foreground/70">
                  {t("source.langNote")}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* === HUB: povezave na vse podstrani (jedro GEO-A) === */}

        {/* Kaj početi — glavna podstran */}
        <section className="mb-10">
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-6">
              <h2 className="text-2xl font-bold mb-2">{t("thingsToDo.title", { name: dest.name })}</h2>
              <p className="text-muted-foreground mb-4">
                {t("thingsToDo.text", { name: dest.name, highlights: highlights.length })}
              </p>
              <Button asChild size="lg">
                <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                  <Sparkles className="size-4 mr-2" aria-hidden="true" />
                  {t("thingsToDo.button", { name: dest.name })}
                  <ArrowRight className="size-4 ml-2" aria-hidden="true" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        </section>

        {/* Pripravljeni itinererji */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("itineraries.title", { name: dest.name })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            {DURATION_SLUGS.map((dur) => (
              <Button key={dur} asChild variant="outline" className="h-auto flex-col gap-1 py-3">
                <Link href={`/destinacija/${dest.slug}/itinerary/${dur}`}>
                  <MapPin className="size-4 mb-1 text-primary" aria-hidden="true" />
                  <span className="font-medium">{durationLabels[dur]}</span>
                </Link>
              </Button>
            ))}
          </div>
        </section>

        {/* Vodniki po tipu */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">{t("guides.title", { name: dest.name })}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {GUIDE_TYPES.map((g) => (
              <Card key={g} className="group transition-colors hover:border-primary/40">
                <CardContent className="p-5">
                  <Link
                    href={`/destinacija/${dest.slug}/guide/${g}`}
                    className="block focus:outline-none"
                  >
                    <span className="flex items-center justify-between mb-2">
                      <span className="text-xl" aria-hidden="true">{GUIDE_TYPE_META[g].emoji}</span>
                      <ArrowRight
                        className="size-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-primary"
                        aria-hidden="true"
                      />
                    </span>
                    <span className="block font-semibold mb-1">
                      {tg(`guideTypes.${g}.label`)}
                    </span>
                    <span className="block text-sm text-muted-foreground line-clamp-2">
                      {tg(`guideTypes.${g}.description`)}
                    </span>
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Najboljši čas obiska */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">{t("bestTime.title", { name: dest.name })}</h2>
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

        {/* Affiliate CTA — booking intent (enaka logika kot things-to-do) */}
        <AffiliateCtaBlock destination={dest.name} variant="full" />

        {/* CTA: AI itinerer */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">{t("plan.title", { name: dest.name })}</h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            {t("plan.text", { name: dest.name })}
          </p>
          <Button asChild size="lg">
            <Link href="/nacrtuj">
              <Ticket className="size-4 mr-2" aria-hidden="true" />
              {t("plan.button")}
              <ArrowRight className="size-4 ml-2" aria-hidden="true" />
            </Link>
          </Button>
        </section>

        {/* Sosednje destinacije v isti regiji — notranje povezave */}
        {nearby.length > 0 && (
          <section className="mt-10">
            <h2 className="text-2xl font-bold mb-6">{t("nearby.title", { region: regionBadge })}</h2>
            <div className="flex flex-wrap gap-2">
              {nearby.map((d) => (
                <Button key={d.id} asChild variant="outline" size="sm">
                  <Link href={`/destinacija/${d.slug}`}>{d.name}</Link>
                </Button>
              ))}
            </div>
          </section>
        )}

        {/* Vse destinacije */}
        <section className="mt-10">
          <h2 className="text-2xl font-bold mb-6">{t("explore.title")}</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id && d.region !== dest.region)
              .slice(0, 8)
              .map((d) => (
                <Button key={d.id} asChild variant="ghost" size="sm">
                  <Link href={`/destinacija/${d.slug}`}>{d.name}</Link>
                </Button>
              ))}
            <Button asChild variant="outline" size="sm">
              <Link href="/destinacije">{t("explore.all")}</Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
