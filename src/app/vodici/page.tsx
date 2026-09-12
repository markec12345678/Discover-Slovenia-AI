import type { Metadata } from "next";
import { BookOpen, Compass, Calendar, Route } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { BlogSection } from "@/components/sections/blog";
import { AskLocal } from "@/components/sections/ask-local";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { ADRIA_GUIDES } from "@/lib/adria-guides";
import { ADRIA_GUIDES_EN } from "@/lib/adria-guides-en";
import { currentBaseUrl } from "@/lib/host";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { Link } from "@/i18n/navigation";

/**
 * /vodici — vodiči in nasveti (FW3: AI-first hierarhija; ADRIA-1: jadranski
 * wedge; ADRIA-EN: EN različica).
 *
 * Blog (zgodbe in vodičniki s filtri po kategorijah) je preseljen s
 * homepagea. Nad njim je "Jadranska potovanja" (ADRIA-1): cross-border
 * vodniki, ki iz slovenske blagovne znamke zajamejo jadranske poizvedbe.
 * Pod njim je "Vprašaj lokalca" — za obiskovalce, ki raje vprašajo kot
 * iščejo.
 *
 * ADRIA-EN: na EN se izriše glava + jadranski vodniki (full prevodi);
 * BlogSection in AskLocal (slovenska uredniška/DB vsebina) se NE izrišeta
 * (P4-8: nikoli mešanja jezikov).
 */

const COUNTRY_FLAG: Record<string, string> = {
  SI: "🇸🇮",
  HR: "🇭🇷",
  BA: "🇧🇦",
  ME: "🇲🇪",
  AL: "🇦🇱",
};

function fmtKm(km: number, locale: string): string {
  return km.toLocaleString(locale === "en" ? "en-GB" : "sl-SI");
}

const PATH = "/vodici";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("vodiciPage");
  const locale = await getLocale();
  const base = await currentBaseUrl();
  return {
    title: t("meta.title"),
    description: t("meta.description"),
    alternates: {
      canonical: `${base}${localePrefix(locale)}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function GuidesPage() {
  const t = await getTranslations("vodiciPage");
  const locale = await getLocale();
  const guides = locale === "en" ? ADRIA_GUIDES_EN : ADRIA_GUIDES;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="vodici-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              {t("badge")}
            </Badge>
            <h1
              id="vodici-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {t("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {t("intro")}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <BookOpen className="size-3.5 text-primary" aria-hidden="true" />
              {t("editorsLine")}
            </p>
          </div>
        </section>

        {/* Jadranska potovanja — cross-border vodniki (ADRIA-1 / ADRIA-EN) */}
        <section
          aria-labelledby="adria-list-title"
          className="bg-accent/40 py-12 sm:py-16"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
            <div className="mb-8 text-center">
              <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
                <Compass className="size-3.5 text-primary" aria-hidden="true" />
                🇸🇮🇭🇷🇧🇦🇲🇪🇦🇱 {t("adria.badge")}
              </Badge>
              <h2
                id="adria-list-title"
                className="text-balance text-2xl font-bold tracking-tight sm:text-3xl"
              >
                {t("adria.title")}
              </h2>
              <p className="mx-auto mt-3 max-w-2xl text-balance text-sm text-muted-foreground sm:text-base">
                {t("adria.description")}
              </p>
            </div>
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {guides.map((g) => (
                <li key={g.slug}>
                  <Link
                    href={`/vodici/${g.slug}`}
                    className="group flex h-full flex-col rounded-xl border bg-background p-5 transition-colors hover:border-primary/40 hover:shadow-sm"
                  >
                    <div
                      className="mb-2 flex items-center gap-1.5 text-lg"
                      aria-label={t("adria.countriesAria", {
                        countries: g.countries.join(", "),
                      })}
                    >
                      {g.countries.map((c) => (
                        <span key={c}>{COUNTRY_FLAG[c]}</span>
                      ))}
                    </div>
                    <h3 className="font-semibold leading-snug group-hover:text-primary">
                      {g.metaTitle}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-muted-foreground">
                      {g.excerpt}
                    </p>
                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t pt-3 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="size-3.5 text-primary" aria-hidden="true" />
                        {g.days} {locale === "en" ? (g.days === 1 ? "day" : "days") : g.days === 1 ? "dan" : "dni"}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Route className="size-3.5 text-primary" aria-hidden="true" />
                        {fmtKm(g.km, locale)} km
                      </span>
                      <span className="ml-auto font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
                        {t("adria.readMore")}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Blog z vodičiniki in zgodbami (SL only — P4-8) */}
        {locale !== "en" && <BlogSection />}

        {/* Vprašaj lokalca — odgovori skupnosti (SL only — P4-8) */}
        {locale !== "en" && (
          <Reveal>
            <AskLocal />
          </Reveal>
        )}
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
