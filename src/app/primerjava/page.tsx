import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath, faqJsonLd } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { safeJsonLd } from "@/lib/security";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// TASK 8 / D8-E (P-NAV-1): enotna lupina — Navigation solid + Footer;
// LanguageToggle odstranjen (/primerjava je na EN whitelisti —
// EN_STATIC_ROUTES — LanguageSwitcher v Navigation pokriva isto SL⇄EN).
import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { PageViewTracker } from "@/components/page-view-tracker";
import {
  Globe,
  Plane,
  Users,
  Sparkles,
  AlertTriangle,
  Check,
  Minus,
  X,
} from "lucide-react";

/**
 * /primerjava — OPP-1 (okno priložnosti po padcu Mindtripovega weba,
 * 17. 9. 2026): iskrena uredniška primerjava splošnih AI načrtovalcev
 * (Mindtrip, Layla, Wanderlog, ChatGPT) s specializom za Slovenijo.
 *
 * Načela (E-E-A-T + naša blagovna znamka iskrenosti):
 * - priznamo, kje so GENERALISTI boljši (4 kartice na začetku),
 * - pasti generalistov dokumentiramo (recenzije 2025–2026), ne trdimo,
 * - primerjalna tabela ima vrstico, kjer MI izgubimo ("izven Slovenije"),
 * - FAQ vsebina je VIDNA na strani in 1:1 v FAQPage JSON-LD (Google pravila).
 *
 * Vzorec: /o-strani (server komponenta, getTranslations, hreflang,
 * canonical z locale prefix-om). Vsa besedila: i18n ns "comparison"
 * (fragments/comparison.{sl,en}.json, zlito v messages).
 */

const PATH = "/primerjava";

/** Vrstice primerjalne tabele in pošten status naše strani (ikona). */
const TABLE_ROWS = [
  { key: "focus", status: "win" },
  { key: "account", status: "win" },
  { key: "validation", status: "win" },
  { key: "feasibility", status: "win" },
  { key: "language", status: "win" },
  { key: "booking", status: "neutral" },
  { key: "offline", status: "win" },
  { key: "beyond", status: "lose" },
] as const;

function StatusIcon({ status }: { status: "win" | "neutral" | "lose" }) {
  if (status === "win")
    return <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />;
  if (status === "neutral")
    return <Minus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
  return <X className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />;
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("comparison");
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

export default async function ComparisonPage() {
  const t = await getTranslations("comparison");

  const faqs = ([1, 2, 3, 4, 5] as const).map((i) => ({
    q: t(`faq.q${i}` as const),
    a: t(`faq.a${i}` as const),
  }));

  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* TASK 8 / D8-E (P-NAV-1): enotna lupina (Navigation + Footer). */}
      <Navigation solid />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: safeJsonLd(faqJsonLd(faqs)) }}
      />
      <PageViewTracker path={PATH} title={t("title")} />

      <main className="mx-auto flex-grow w-full max-w-4xl px-4 py-14 sm:px-6 sm:py-16 lg:px-8">
        {/* Glava */}
        <Badge className="mb-4">{t("badge")}</Badge>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h1>
        <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
          {t("intro")}
        </p>
        <p className="mt-2 text-xs text-muted-foreground/80">{t("updated")}</p>

        {/* 1. Kaj generalisti delajo odlično (iskrenost najprej) */}
        <section className="mt-12" aria-labelledby="generalists-title">
          <h2 id="generalists-title" className="text-2xl font-bold">
            {t("generalistsTitle")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("generalistsIntro")}</p>
          <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {(
              [
                ["coverage", Globe],
                ["booking", Plane],
                ["collab", Users],
                ["scale", Sparkles],
              ] as const
            ).map(([key, Icon]) => (
              <Card key={key}>
                <CardContent className="p-5">
                  <Icon className="size-6 text-primary mb-2" aria-hidden="true" />
                  <h3 className="font-semibold mb-1">
                    {t(`generalists.${key}Title` as const)}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {t(`generalists.${key}Desc` as const)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 2. Kje generalisti razočarajo */}
        <section className="mt-12" aria-labelledby="problems-title">
          <h2 id="problems-title" className="text-2xl font-bold">
            {t("problemsTitle")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("problemsIntro")}</p>
          <div className="mt-5 space-y-4">
            {(["price", "closed", "generic"] as const).map((key) => (
              <Card key={key}>
                <CardContent className="flex gap-4 p-5">
                  <AlertTriangle
                    className="size-5 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400"
                    aria-hidden="true"
                  />
                  <div>
                    <h3 className="font-semibold mb-1">
                      {t(`problems.${key}Title` as const)}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {t(`problems.${key}Desc` as const)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* 3. Primerjalna tabela */}
        <section className="mt-12" aria-labelledby="table-title">
          <h2 id="table-title" className="text-2xl font-bold">
            {t("tableTitle")}
          </h2>
          <div className="mt-5 overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[680px] text-sm">
              <caption className="sr-only">{t("table.caption")}</caption>
              <thead>
                <tr className="border-b bg-muted/50 text-left">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("table.colWhat")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("table.colGeneral")}
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    {t("table.colOurs")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {TABLE_ROWS.map(({ key, status }, i) => (
                  <tr
                    key={key}
                    className={i % 2 === 0 ? "bg-transparent" : "bg-muted/20"}
                  >
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {t(`table.rows.${key}.label` as const)}
                    </th>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t(`table.rows.${key}.general` as const)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="flex items-start gap-2">
                        <StatusIcon status={status} />
                        <span>{t(`table.rows.${key}.ours` as const)}</span>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{t("table.note")}</p>
        </section>

        {/* 4. Kaj to pomeni v praksi */}
        <section className="mt-12" aria-labelledby="practice-title">
          <h2 id="practice-title" className="text-2xl font-bold">
            {t("practiceTitle")}
          </h2>
          <ol className="mt-5 space-y-4">
            {(["ex1", "ex2", "ex3"] as const).map((key, i) => (
              <li key={key} className="flex gap-4">
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <div>
                  <h3 className="font-semibold">{t(`practice.${key}Title` as const)}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {t(`practice.${key}Desc` as const)}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* 5. Kdaj NISMO pravi (iskrenost) */}
        <section className="mt-12" aria-labelledby="notforyou-title">
          <Card className="border-dashed">
            <CardContent className="p-6">
              <h2 id="notforyou-title" className="text-xl font-bold">
                {t("notForYouTitle")}
              </h2>
              <p className="mt-2 leading-relaxed text-muted-foreground">
                {t("notForYouBody")}
              </p>
            </CardContent>
          </Card>
        </section>

        {/* 6. CTA */}
        <section className="mt-12" aria-labelledby="cta-title">
          <Card className="border-primary/30 bg-muted/30">
            <CardContent className="p-6 sm:p-8">
              <h2 id="cta-title" className="text-2xl font-bold">
                {t("ctaTitle")}
              </h2>
              <p className="mt-2 text-muted-foreground">{t("ctaBody")}</p>
              <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg">
                  <Link href="/nacrtuj">{t("ctaPrimary")}</Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/destinacije">{t("ctaSecondary")}</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 7. FAQ (vidna vsebina = JSON-LD vsebina) */}
        <section className="mt-12" aria-labelledby="faq-title">
          <h2 id="faq-title" className="text-2xl font-bold">
            {t("faqTitle")}
          </h2>
          <div className="mt-5 space-y-6">
            {faqs.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {f.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Viri (E-E-A-T notranje povezave) */}
        <p className="mt-10 text-sm text-muted-foreground">
          {t.rich("sources", {
            linkSources: (chunks) => (
              <Link href="/vir-podatkov" className="text-primary underline">
                {chunks}
              </Link>
            ),
            linkTrust: (chunks) => (
              <Link href="/zaupanje-in-varnost" className="text-primary underline">
                {chunks}
              </Link>
            ),
            linkAbout: (chunks) => (
              <Link href="/o-strani" className="text-primary underline">
                {chunks}
              </Link>
            ),
          })}
        </p>
      </main>
      <Footer />
    </div>
  );
}
