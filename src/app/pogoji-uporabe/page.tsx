import { Fragment } from "react";
import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { LanguageToggle } from "@/components/language-toggle";

/**
 * /pogoji-uporabe — pravno-informativna stran.
 *
 * FW4.3-2 (dvojezičnost, vzorec /o-strani):
 * - Server komponenta; vsa besedila prek `getTranslations("terms")`.
 * - Sekcije s1–s10 se izrisujejo v fiksnem vrstnem redu (naslovi z
 *   številkami so del prevodov) — DOM ostane identičen izvirniku.
 * - Email v s10 prek ICU TAG-a `<email>…</email>` + chunks handler (kanonični
 *   next-intl vzorec). Preverjeno na next-intl 4.7: fn handler za NAVADEN
 *   `{placeholder}` se NE pokliče (vrže 500 "Functions are not valid as a
 *   child"), tag handler s chunks pa deluje — enako kot <strong> v howP2.
 * - generateMetadata je locale-zaveden (canonical/hreflang/og:locale).
 * - Sporočila živijo v src/i18n/fragments/terms.{sl,en}.json.
 */

const PATH = "/pogoji-uporabe";

/** Fiksni vrstni red sekcij (ključi v `terms.sections`). */
const SECTION_IDS = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("terms");
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

export default async function TermsPage() {
  const t = await getTranslations("terms");

  return (
    <div className="min-h-screen bg-background">
      <LanguageToggle path="/pogoji-uporabe" />
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">{t("title")}</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-4 text-sm">
          <p>
            <strong>{t("lastUpdated")}</strong> 2025
          </p>

          {SECTION_IDS.map((id) => (
            <Fragment key={id}>
              <h2 className="text-xl font-bold">{t(`sections.${id}.title`)}</h2>
              {id === "s10" ? (
                <p>
                  {t.rich(`sections.${id}.body`, {
                    email: (chunks) => (
                      <a
                        href="mailto:info@discoverslovenia.ai"
                        className="underline"
                      >
                        {chunks}
                      </a>
                    ),
                  })}
                </p>
              ) : (
                <p>{t(`sections.${id}.body`)}</p>
              )}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
