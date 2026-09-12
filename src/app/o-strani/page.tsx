import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mountain, Sparkles, Globe, Users } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * /o-strani — info stran (E-E-A-T).
 *
 * FW4.3-2 REFERENČNI VZOREC za dvojezične strani:
 * - Vsa besedila prek `getTranslations("about")` (server komponenta).
 * - Bogate oznake (strong/povezave) prek `t.rich` z ICU placeholderji.
 * - Notranje povezave prek `Link` iz `@/i18n/navigation` (samodejno doda
 *   `/en` prefix, kadar je aktiven locale "en").
 * - `generateMetadata` je locale-zaveden: naslov/opis iz prevodov,
 *   canonical na DEJANSKI pote z locale prefix-om, hreflang prek
 *   `hreflangForPath` (sam zazna EN whitelist), og:locale.
 * - Sporočila živijo v src/i18n/fragments/about.{sl,en}.json (merge v
 *   messages/ ob integraciji).
 */

const PATH = "/o-strani";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("about");
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

export default async function AboutPage() {
  const t = await getTranslations("about");

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path="/o-strani" />
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="mb-4">{t("badge")}</Badge>
        <h1 className="text-4xl font-bold mb-6">{t("title")}</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p className="text-lg text-muted-foreground">
            {t.rich("intro", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>

          <h2 className="text-2xl font-bold mt-8">{t("offerTitle")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardContent className="p-5">
                <Sparkles className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">{t("offerCards.plannerTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("offerCards.plannerDesc")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Mountain className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">{t("offerCards.destinationsTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("offerCards.destinationsDesc")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Users className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">{t("offerCards.providersTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("offerCards.providersDesc")}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Globe className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">{t("offerCards.languagesTitle")}</h3>
                <p className="text-sm text-muted-foreground">
                  {t("offerCards.languagesDesc")}
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl font-bold mt-8">{t("howTitle")}</h2>
          <p>{t("howP1")}</p>
          <p>
            {t.rich("howP2", {
              sdk: (chunks) => <strong>{chunks}</strong>,
              osm: (chunks) => <strong>{chunks}</strong>,
              wiki: (chunks) => <strong>{chunks}</strong>,
              meteo: (chunks) => <strong>{chunks}</strong>,
            })}
          </p>

          <h2 className="text-2xl font-bold mt-8">{t("contactTitle")}</h2>
          <p>
            {/* next-intl v4 uradni vzorec: tag v sporočilu (<email>…</email>)
                + chunk handler. Funkcije/elementi za preprost {placeholder}
                v v4 niso podprti. */}
            {t.rich("contactP", {
              email: (chunks) => (
                <a
                  key="email"
                  href="mailto:info@discoverslovenia.ai"
                  className="text-primary underline"
                >
                  {chunks}
                </a>
              ),
              contactPage: (chunks) => (
                <Link key="contactPage" href="/kontakt" className="text-primary underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>

          <h2 className="text-2xl font-bold mt-8">{t("dataTitle")}</h2>
          <p>
            <strong>{t("dataTech")}</strong> {t("dataValues.tech")}<br />
            <strong>{t("dataAi")}</strong> {t("dataValues.ai")}<br />
            <strong>{t("dataMap")}</strong> {t("dataValues.map")}<br />
            <strong>{t("dataDb")}</strong> {t("dataValues.db")}<br />
            <strong>{t("dataLicense")}</strong> {t("dataValues.license")}<br />
            <strong>{t("dataRepo")}</strong>{" "}
            <a
              href="https://github.com/markec12345678/i-feel-slovenia"
              className="text-primary underline"
            >
              GitHub
            </a>
          </p>

          <div className="flex gap-3 mt-8">
            <Link href="/politika-zasebnosti" className="text-sm text-muted-foreground underline">
              {t("linkPrivacy")}
            </Link>
            <Link href="/pogoji-uporabe" className="text-sm text-muted-foreground underline">
              {t("linkTerms")}
            </Link>
            <Link href="/vir-podatkov" className="text-sm text-muted-foreground underline">
              {t("linkSources")}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
