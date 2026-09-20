import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { MapPin } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { MapSection } from "@/components/sections/map-section";
import { MapOpenedTracker } from "@/components/map-opened-tracker";
import { Badge } from "@/components/ui/badge";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { DESTINATIONS } from "@/lib/slovenia-data";

/**
 * /zemljevid — interaktivni zemljevid Slovenije (FW3: AI-first hierarhija).
 *
 * Zemljevid je preseljen z homepagea na lastno stran: prikaže 38 destinacij
 * (TASK 62: SI+HR+ME+AL),
 * lokalne ponudnike in — če je uporabnik ravno sestavil AI itinerer —
 * tudi pot svojega potovanja (routeCoords/routeByDay iz app store).
 *
 * 1.48: stran je na EN whitelisti (src/i18n/routing.ts) — prej je gumb
 * "Map" v /en navigaciji vodil na 308 → slovensko stran. Vsi nizi sledijo
 * L vzorcu (map-section/map-view/poi-modal uporabljajo isti vzorec).
 */

const PATH = "/zemljevid";

/** Dvojezični nizi heroja (server komponenta — getLocale iz next-intl). */
const L = {
  badge: { sl: "Zemljevid", en: "Map" },
  title: {
    sl: "Interaktivni zemljevid Slovenije",
    en: "Interactive map of Slovenia",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Jadrana na enem zemljevidu — s podrobnostmi o vsaki lokaciji in potjo vašega AI itinererja, ko ga sestavite.`,
    en: (n: number) =>
      `${n} destinations from the Alps to the Adriatic on a single map — with details for every location and your AI itinerary route once you build one.`,
  },
  hint: {
    sl: "Kliknite marker za podrobnosti · Brez prijave",
    en: "Tap a marker for details · No sign-up required",
  },
  metaTitle: {
    sl: "Interaktivni zemljevid Slovenije",
    en: "Interactive map of Slovenia",
  },
  metaDescription: {
    sl: "Raziščite Slovenijo na interaktivnem zemljevidu — destinacije, lokalne ponudnike in pot svojega AI itinererja.",
    en: "Explore Slovenia on an interactive map — destinations, local providers and your AI itinerary route.",
  },
} as const;

type PageLang = keyof typeof L.badge;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  const base = await currentBaseUrl();
  const prefixed = `${localePrefix(locale)}${PATH}`;

  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: {
      canonical: `${base}${prefixed}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function MapPage() {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="zemljevid-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              {L.badge[lang]}
            </Badge>
            <h1
              id="zemljevid-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {L.title[lang]}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {L.subtitle[lang](DESTINATIONS.length)}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MapPin className="size-3.5 text-primary" aria-hidden="true" />
              {L.hint[lang]}
            </p>
          </div>
        </section>

        {/* Interaktivni zemljevid s potjo AI itinererja — hideHeader: stran
            ima ŽE lastno glavo zgoraj, notranja glava sekcije bi bila
            duplikat (UX-CMP #4: manj mrtvega prostora) */}
        <MapSection hideHeader />
        {/* Faza 4 (pilotna analitika): map_opened ob prihodu na stran zemljevida */}
        <MapOpenedTracker />
      </main>
      <Footer />
      <Chatbot />
      <StickyMobileCTA />
    </div>
  );
}
