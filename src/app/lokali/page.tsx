import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Store } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { ListingsSection } from "@/components/sections/listings";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /lokali — lokalni ponudniki (FW3: AI-first hierarhija).
 *
 * Imenik preverjenih lokalov (hoteli, restavracije, znamenitosti,
 * aktivnosti) je preseljen z homepagea. Rezervacija poteka direktno pri
 * ponudniku — brez posrednikov in brez provizije.
 *
 * TASK 8 / F4-D (issue #8 Faza 4 / F3-E): glava strani + metadata v
 * L-pattern (server komponenta — getLocale, isti kanon kot /potovanje).
 */

const PATH = "/lokali";

/** Dvojezični nizi heroja + metadata (server komponenta — getLocale). */
const L = {
  badge: { sl: "Lokalni ponudniki", en: "Local providers" },
  title: { sl: "Lokalni ponudniki", en: "Local providers" },
  subtitle: {
    sl: "Hoteli, restavracije, znamenitosti in aktivnosti preverjenih lokalnih partnerjev — rezervirajte direktno pri ponudniku, brez provizije.",
    en: "Hotels, restaurants, sights and activities from verified local partners — book directly with the provider, with no commission.",
  },
  hint: {
    sl: "Rezervacija direktno pri ponudniku · 0 % provizije",
    en: "Book directly with the provider · 0 % commission",
  },
  metaTitle: {
    sl: "Lokalni ponudniki",
    en: "Local providers in Slovenia",
  },
  metaDescription: {
    sl: "Hoteli, restavracije, znamenitosti in aktivnosti preverjenih lokalnih partnerjev — rezervacija direktno pri ponudniku, brez provizije.",
    en: "Hotels, restaurants, sights and activities from verified local partners in Slovenia — book directly with the provider, commission-free.",
  },
} as const;

type PageLang = keyof typeof L.badge;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  const base = await currentBaseUrl();

  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: {
      canonical: `${base}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function ListingsPage() {
  const locale = await getLocale();
  const lang: PageLang = locale === "en" ? "en" : "sl";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani — F4-D: hero v jeziku zahteve */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="lokali-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <Store className="size-3.5 text-primary" aria-hidden="true" />
              {L.badge[lang]}
            </Badge>
            <h1
              id="lokali-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {L.title[lang]}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {L.subtitle[lang]}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Store className="size-3.5 text-primary" aria-hidden="true" />
              {L.hint[lang]}
            </p>
          </div>
        </section>

        {/* Imenik lokalov s filtri in modalom */}
        <Reveal>
          <ListingsSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
}
