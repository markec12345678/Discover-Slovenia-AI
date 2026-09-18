import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { LanguageToggle } from "@/components/language-toggle";
import { Footer } from "@/components/sections/footer";
import {
  PROVIDER_REGISTRY,
  statusLabel,
  type ProviderRegistryEntry,
} from "@/lib/supply/registry";

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
 *
 * F1 (Supply Map, 1.49.0): NOVA sekcija "Ponudniki potovanj" se izpelje
 * IZ PROVIDER_REGISTRY (src/lib/supply/registry.ts) — en vir resnice.
 * Popravek audita 40: stara ročna lista je bila ZASTARELA (5/10 affiliate
 * virov, manjkali Airalo/Kiwitaxi/Omio/Tiqets/Viator). Register je
 * client-varen (samo imena env spremenljivk, nikoli vrednosti).
 */

const PATH = "/vir-podatkov";

/** Neponudniški viri podatkov platforme — affiliate ponudniki so zdaj
 *  izključno v registrom gnani sekciji spodaj (nikoli več ročno vzdržani). */
const SOURCES = [
  { id: "osm", name: "OpenStreetMap", url: "https://www.openstreetmap.org" },
  { id: "sloveniaInfo", name: "I feel Slovenia (STO) — slovenia.info", url: "https://www.slovenia.info" },
  { id: "wikipedia", name: "Wikipedia / Wikidata", url: "https://www.wikimedia.org" },
  { id: "openMeteo", name: "Open-Meteo", url: "https://open-meteo.com" },
  { id: "zai", name: "z-ai-web-dev-sdk (GLM)", url: "https://z.ai" },
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

/** Statusna značka (barva IZPELJANA iz stanja, ne iz želja — iskrenost). */
const STATUS_BADGE_CLASS: Record<ProviderRegistryEntry["status"], string> = {
  local: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  live: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  search: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  affiliate: "bg-muted text-muted-foreground",
};

/** Skupine registra (lokalni odprti viri / lastna tržnica / partnerji). */
const REGISTRY_GROUPS = ["local", "own", "commercial"] as const;

export default async function DataSourcePage() {
  const t = await getTranslations("dataSources");
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <LanguageToggle path="/vir-podatkov" />
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6 lg:px-8">
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

        {/* F1 (Supply Map): registrom gnana sekcija — en vir resnice.
            Ko se v prihodnji fazi priključi adapter (npr. KiwiTaxi v F2),
            se ta seznam samodejno posodobi — nikoli več zastarel. */}
        <section aria-labelledby="supply-registry" className="mt-12">
          <h2 id="supply-registry" className="text-2xl font-bold mb-3">
            {t("supplyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mb-6">{t("supplyIntro")}</p>

          <div className="space-y-8">
            {REGISTRY_GROUPS.map((group) => {
              const entries = PROVIDER_REGISTRY.filter((p) => p.group === group);
              if (entries.length === 0) return null;
              return (
                <div key={group}>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    {t(`supplyGroup.${group}`)}
                  </h3>
                  <div className="space-y-3">
                    {entries.map((p) => {
                      const badge = statusLabel(p.status);
                      return (
                        <div key={p.slug} className="rounded-lg border border-border p-4">
                          <div className="flex items-start justify-between gap-3">
                            <h4 className="font-semibold">{p.labels[lang]}</h4>
                            <span
                              className={`text-xs px-2 py-1 rounded shrink-0 font-medium ${STATUS_BADGE_CLASS[p.status]}`}
                            >
                              {badge[lang]}
                            </span>
                          </div>
                          {p.accessNote && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {p.accessNote[lang]}
                            </p>
                          )}
                          {p.docsUrl && (
                            <a
                              href={p.docsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-primary underline mt-2 inline-block"
                            >
                              {t("supplyDocs")} →
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">{t("providersTitle")}</h2>
          <p className="text-sm text-muted-foreground">{t("providersText")}</p>
        </div>
      </div>
      <Footer />
    </div>
  );
}
