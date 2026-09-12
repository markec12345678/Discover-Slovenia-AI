import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MapPin, Globe, Shield } from "lucide-react";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * /kontakt — kontaktna stran.
 *
 * FW4.3-2 (dvojezičnost, vzorec /o-strani):
 * - Server komponenta; vsa besedila prek `getTranslations("contact")`.
 * - generateMetadata je locale-zaveden (canonical/hreflang/og:locale).
 * - Email naslovi so locale-invariantni → ostanejo hardkodirani.
 * - Notranja povezava na B2B portal prek `Link` iz `@/i18n/navigation`
 *   (EN klik gre prek proxyja na slovenski portal — isti vzorec kot footer).
 * - Sporočila živijo v src/i18n/fragments/contact.{sl,en}.json.
 */

const PATH = "/kontakt";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("contact");
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

export default async function ContactPage() {
  const t = await getTranslations("contact");

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path="/kontakt" />
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-6">{t("title")}</h1>
        <p className="text-muted-foreground mb-8">{t("intro")}</p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <Mail className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">{t("cards.emailTitle")}</h3>
              <a href="mailto:info@discoverslovenia.ai" className="text-sm text-primary underline">
                info@discoverslovenia.ai
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <MapPin className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">{t("cards.locationTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("cards.locationValue")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Globe className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">{t("cards.languagesTitle")}</h3>
              <p className="text-sm text-muted-foreground">{t("cards.languagesValue")}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Shield className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">{t("cards.supportTitle")}</h3>
              <a href="mailto:podpora@discoverslovenia.ai" className="text-sm text-primary underline">
                podpora@discoverslovenia.ai
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">{t("providersTitle")}</h2>
          <p className="text-sm text-muted-foreground mb-3">{t("providersText")}</p>
          <Link href="/owner/prijava" className="text-primary underline text-sm">
            {t("providersLink")}
          </Link>
        </div>
      </div>
    </div>
  );
}
