import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Footprints } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { GoMode } from "@/components/sections/go-mode";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
// ISSUE #24 Sklop 8 (1.170.0): FAZA 2 — hero + meta v vseh 6 jezikih
// (prej faza 1: it/de/fr/es dedijo EN; P4-8 neizprosen).
import { GL, goLangOf, type GoStrings } from "@/lib/journey/go-lang";

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
  badge: {
    sl: "Go Mode — med potovanjem",
    en: "Go Mode — while traveling",
    it: "Go Mode — durante il viaggio",
    de: "Go Mode — unterwegs",
    fr: "Go Mode — en voyage",
    es: "Go Mode — durante el viaje",
  } as GoStrings,
  title: {
    sl: "Na poti: kaj je zdaj, kaj je naslednje",
    en: "On the road: what's now, what's next",
    it: "In viaggio: cosa c'è ora, cosa viene dopo",
    de: "Unterwegs: Was ist jetzt, was kommt als Nächstes",
    fr: "En route : ce qu'il y a maintenant, ce qui vient ensuite",
    es: "En camino: qué hay ahora, qué viene después",
  } as GoStrings,
  subtitle: {
    // TASK 8 / F2-B (§24 GO MODE — „calm and focused“): vidni podnaslov je
    // pomirjen na eno vrstico (prej 3-vrstični zid besedila — šum pred NOW
    // kartico). Meta opis (SEO) ostaja popoln — nespremenjen spodaj.
    sl: "Kaj je zdaj, kaj je naslednje. Načrt je na tvoji napravi — deluje tudi brez signala.",
    en: "What's now, what's next. Your plan lives on your device — it works offline too.",
    it: "Cosa c'è ora, cosa viene dopo. Il piano è sul tuo dispositivo — funziona anche senza segnale.",
    de: "Was ist jetzt, was kommt als Nächstes. Der Plan liegt auf deinem Gerät — er funktioniert auch offline.",
    fr: "Ce qu'il y a maintenant, ce qui vient ensuite. Le plan est sur ton appareil — il fonctionne aussi hors ligne.",
    es: "Qué hay ahora, qué viene después. El plan está en tu dispositivo — también funciona sin conexión.",
  } as GoStrings,
  metaTitle: {
    sl: "Na poti — Go Mode sopotnik med potovanjem",
    en: "On the road — Go Mode travel companion",
    it: "In viaggio — Go Mode, compagno di viaggio",
    de: "Unterwegs — Go Mode Reisebegleiter",
    fr: "En route — Go Mode compagnon de voyage",
    es: "En camino — Go Mode compañero de viaje",
  } as GoStrings,
  metaDescription: {
    sl: "Med potovanjem: naslednja postanka tvojega načrta, razdalja in smer do nje (GPS), opravljene postanke. Načrt je shranjen na tvoji napravi in deluje tudi brez signala.",
    en: "While traveling: the next stop on your plan, distance and direction to it (GPS), completed stops. The plan is stored on your device and works offline too.",
    it: "Durante il viaggio: la prossima tappa del tuo piano, distanza e direzione (GPS), tappe completate. Il piano è salvato sul tuo dispositivo e funziona anche senza segnale.",
    de: "Unterwegs: die nächste Station deines Plans, Entfernung und Richtung dorthin (GPS), erledigte Stationen. Der Plan ist auf deinem Gerät gespeichert und funktioniert auch offline.",
    fr: "En voyage : le prochain arrêt de ton plan, distance et direction (GPS), arrêts terminés. Le plan est enregistré sur ton appareil et fonctionne aussi hors ligne.",
    es: "Durante el viaje: la próxima parada de tu plan, distancia y dirección (GPS), paradas completadas. El plan está guardado en tu dispositivo y también funciona sin conexión.",
  } as GoStrings,
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  // ISSUE #24 Sklop 8 (1.170.0): resolucija po goLangOf — vsi javni jeziki
  // živijo; neprevedena enota bi dedila EN prek GL (nikoli SL — P4-8).
  const lang = goLangOf(locale);
  const base = await currentBaseUrl();
  return {
    title: GL(lang, L.metaTitle),
    description: GL(lang, L.metaDescription),
    alternates: {
      canonical: `${base}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function NaPotiPage() {
  const locale = await getLocale();
  // ISSUE #24 Sklop 8 (1.170.0): ista resolucija kot zgoraj (faza 2).
  const lang = goLangOf(locale);
  return (
    <>
      <div className="print:hidden">
        <Navigation />
      </div>
      <main id="vsebina" className="min-h-[60vh]">
        <section className="border-b bg-gradient-to-b from-emerald-50/60 to-background py-8 sm:py-12 dark:from-emerald-950/20">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            <Badge variant="outline" className="mb-3 gap-1.5">
              <Footprints className="h-3.5 w-3.5" /> {GL(lang, L.badge)}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {GL(lang, L.title)}
            </h1>
            <p className="mt-3 max-w-xl text-muted-foreground">
              {GL(lang, L.subtitle)}
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
      </div>
    </>
  );
}
