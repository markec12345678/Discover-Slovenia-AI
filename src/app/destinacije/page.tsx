import type { Metadata } from "next";
import { Map } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { DestinationsSection } from "@/components/sections/destinations";
import { CollectionsSection } from "@/components/sections/collections";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /destinacije — vseh 22 slovenskih destinacij (FW3: AI-first hierarhija).
 *
 * Homepage prikaže samo 6 priljubljenih destinacij (featured mode); ta stran
 * je polni imenik s 5 filtri (regija, interesi, tip, cena, ocena) in modali
 * s podrobnostmi. Zbirke (kurirane sezname) pod njim ponudijo alternativni
 * vstop za tiste, ki ne vedo, kje začeti.
 *
 * FW4.3-2: dvojezično (server vzorec iz /o-strani) — vsa besedila prek
 * getTranslations("destinationsPage"), canonical/hreflang/og locale-zavedni.
 */
const PATH = "/destinacije";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("destinationsPage");
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

export default async function DestinationsPage() {
  const t = await getTranslations("destinationsPage");

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="destinacije-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Map className="size-3.5 text-primary" aria-hidden="true" />
              {t("badge")}
            </Badge>
            <h1
              id="destinacije-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {t("title")}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {t("subtitle")}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Map className="size-3.5 text-primary" aria-hidden="true" />
              {t("statsLine")}
            </p>
          </div>
        </section>

        {/* Polni imenik destinacij s filtri in modalom */}
        <DestinationsSection />

        {/* Kurirane zbirke za alternativni vstop */}
        <Reveal>
          <CollectionsSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
