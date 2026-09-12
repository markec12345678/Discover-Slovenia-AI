import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * /vir-podatkov — seznam virov podatkov (E-E-A-T).
 *
 * FW4.3-2 (dvojezičnost, vzorec /o-strani):
 * - Server komponenta; vsa besedila prek `getTranslations("dataSources")`.
 * - Imena virov in URL-ji so locale-invariantni (znamke) → ostajajo v
 *   `SOURCES` tabeli; opisi (`desc`) in vrste (`type`) se prevajajo.
 * - Zunanje povezave ostajajo navadni `<a target="_blank">`.
 * - generateMetadata je locale-zaveden (canonical/hreflang/og:locale).
 * - Sporočila živijo v src/i18n/fragments/dataSources.{sl,en}.json.
 */

const PATH = "/vir-podatkov";

/** Viri podatkov — ime/URL invariantna, prevodi po `sources.<id>.*`. */
const SOURCES = [
  { id: "osm", name: "OpenStreetMap", url: "https://www.openstreetmap.org" },
  { id: "wikipedia", name: "Wikipedia / Wikidata", url: "https://www.wikimedia.org" },
  { id: "openMeteo", name: "Open-Meteo", url: "https://open-meteo.com" },
  { id: "zai", name: "z-ai-web-dev-sdk (GLM)", url: "https://z.ai" },
  { id: "booking", name: "Booking.com Affiliate", url: "https://www.booking.com" },
  { id: "discoverCars", name: "DiscoverCars Affiliate", url: "https://www.discovercars.com" },
  { id: "getYourGuide", name: "GetYourGuide Affiliate", url: "https://www.getyourguide.com" },
  { id: "skyscanner", name: "Skyscanner Affiliate", url: "https://www.skyscanner.net" },
  { id: "worldNomads", name: "World Nomads Affiliate", url: "https://www.worldnomads.com" },
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("dataSources");
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

export default async function DataSourcePage() {
  const t = await getTranslations("dataSources");

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path="/vir-podatkov" />
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-6">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("intro")}</p>

        <div className="space-y-4">
          {SOURCES.map((s) => (
            <div key={s.name} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    {t(`sources.${s.id}.desc`)}
                  </p>
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded shrink-0">
                  {t(`sources.${s.id}.type`)}
                </span>
              </div>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">
                {s.url} →
              </a>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">{t("providersTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("providersText")}</p>
        </div>
      </div>
    </div>
  );
}
