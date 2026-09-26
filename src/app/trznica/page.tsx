import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { ShoppingBag } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { MarketplaceSection } from "@/components/sections/marketplace";
import { Reveal } from "@/components/reveal";
import { Badge } from "@/components/ui/badge";

/**
 * /trznica — tržnica lokalnih izdelkov in doživetij (FW3: AI-first
 * hierarhija).
 *
 * Tržnica je preseljena z homepagea na lastno stran. Odpre se s privzetim
 * zavihkom izdelkov; zavihek izkušenj vodi na /dozivetja, kjer je pripet.
 *
 * TASK 8 / F4-A (issue #8 Phase 4 — EN razširitev SL-only površin): glava
 * strani in metadata sta zdaj dvojezična — L vzorec + generateMetadata z
 * getLocale (isti kanon kot /potovanje). Jedro tržnice ima svoj L slovar
 * (components/sections/marketplace.tsx).
 */
const L = {
  badge: { sl: "Tržnica", en: "Marketplace" },
  title: {
    sl: "Tržnica lokalnih izdelkov in doživetij",
    en: "Marketplace of local products & experiences",
  },
  subtitle: {
    sl: "Med, vina, obrti, rafting in gastro doživetja — izdelki in doživetja neposredno od slovenskih ponudnikov, brez posrednikov.",
    en: "Honey, wines, crafts, rafting and gastro experiences — products and experiences straight from Slovenian providers, with no middlemen.",
  },
  trustLine: {
    sl: "Neposredno od slovenskih ponudnikov · Brez skritih stroškov",
    en: "Straight from Slovenian providers · No hidden costs",
  },
  metaTitle: {
    sl: "Tržnica lokalnih izdelkov in doživetij",
    en: "Marketplace of local products & experiences",
  },
  metaDescription: {
    sl: "Lokalni izdelki in doživetja neposredno od slovenskih ponudnikov — med, vina, obrti, rafting in gastro doživetja.",
    en: "Local products and experiences straight from Slovenian providers — honey, wines, crafts, rafting and gastro experiences.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: { canonical: "/trznica" },
  };
}

export default async function MarketplacePage() {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Glava strani */}
        <section
          className="py-12 sm:py-16"
          aria-labelledby="trznica-page-title"
        >
          <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
            <Badge variant="outline" className="mb-4 gap-1.5 px-3 py-1 text-xs">
              <ShoppingBag className="size-3.5 text-primary" aria-hidden="true" />
              {L.badge[lang]}
            </Badge>
            <h1
              id="trznica-page-title"
              className="text-balance text-3xl font-bold tracking-tight sm:text-5xl"
            >
              {L.title[lang]}
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-balance text-base text-muted-foreground sm:text-lg">
              {L.subtitle[lang]}
            </p>
            <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ShoppingBag className="size-3.5 text-primary" aria-hidden="true" />
              {L.trustLine[lang]}
            </p>
          </div>
        </section>

        {/* Tržnica: izdelki in doživetja s filtri */}
        <Reveal>
          <MarketplaceSection />
        </Reveal>
      </main>
      <Footer />
      <Chatbot />
    </div>
  );
}
