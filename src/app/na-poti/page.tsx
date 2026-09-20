import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Footprints } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { StickyMobileCTA } from "@/components/sticky-mobile-cta";
import { GoMode } from "@/components/sections/go-mode";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

// /na-poti — GO MODE: NOW & NEXT SOPOTNIK MED POTOVANJEM (TASK 64).
//
// Ko je načrt iz /potovanje enkrat shranjen na napravi (gumb „Zaženi Na
// poti"), ta stran deluje kot sopotnik na telefonu: živa ura, naslednja
// postanka, razdalja/smer do nje (GPS, PREMICA — iskrena, ne vozna),
// ostale postanke dneva, opravljanje z enim prstom. 100 % client-side —
// načrt deluje tudi BREZ signala (vse je na napravi), rezervacije in
// potrditve ostanejo PRI PONUDNIKU (isti kanon iskrenosti kot MY TRIP).
//
// Zasebnost: GPS živi samo v pomnilniku seje (ne shranjujemo sledi);
// načrt so javni podatki virov + uporabnikove izbire na tej napravi.

const PATH = "/na-poti";

const L = {
  badge: { sl: "Go Mode — med potovanjem", en: "Go Mode — while traveling" },
  title: {
    sl: "Na poti: kaj je zdaj, kaj je naslednje",
    en: "On the road: what's now, what's next",
  },
  subtitle: {
    sl: "Tvoj sopotnik med potovanjem po Sloveniji, Hrvaški, Črni gori in Albaniji: naslednja postanka načrta, razdalja in smer do nje (GPS), opravljene postanke in prihodnji dnevi. Načrt je na tvoji napravi — deluje tudi brez signala.",
    en: "Your companion while traveling across Slovenia, Croatia, Montenegro and Albania: the next stop on your plan, distance and direction to it (GPS), completed stops and coming days. The plan lives on your device — it works offline too.",
  },
  metaTitle: {
    sl: "Na poti — Go Mode sopotnik med potovanjem",
    en: "On the road — Go Mode travel companion",
  },
  metaDescription: {
    sl: "Med potovanjem: naslednja postanka tvojega načrta, razdalja in smer do nje (GPS), opravljene postanke. Načrt je shranjen na tvoji napravi in deluje tudi brez signala.",
    en: "While traveling: the next stop on your plan, distance and direction to it (GPS), completed stops. The plan is stored on your device and works offline too.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
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

export default async function NaPotiPage() {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
  return (
    <>
      <div className="print:hidden">
        <Navigation />
      </div>
      <main id="vsebina" className="min-h-[60vh]">
        <section className="border-b bg-gradient-to-b from-emerald-50/60 to-background py-8 sm:py-12 dark:from-emerald-950/20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <Badge variant="outline" className="mb-3 gap-1.5">
              <Footprints className="h-3.5 w-3.5" /> {L.badge[lang]}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {L.title[lang]}
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              {L.subtitle[lang]}
            </p>
          </div>
        </section>

        {/* Ozka, telefonska-prva postavitev (max-w-2xl) — Go Mode je izkušnja
            z enim palcem na poti. */}
        <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
          <GoMode />
        </div>
      </main>
      <div className="print:hidden">
        <Footer />
        <Chatbot />
        <StickyMobileCTA />
      </div>
    </>
  );
}
