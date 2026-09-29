import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { MapPin } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { MapSection } from "@/components/sections/map-section";
import { MapOpenedTracker } from "@/components/map-opened-tracker";
import { Badge } from "@/components/ui/badge";
import { localePrefix } from "@/i18n/routing";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { DESTINATIONS } from "@/lib/slovenia-data";

/**
 * /zemljevid — interaktivni zemljevid Slovenije in zahodnega Balkana
 * (FW3: AI-first hierarhija; 1.95.1: regija).
 *
 * Zemljevid je preseljen z homepagea na lastno stran: privzeti pogled je
 * CELA regija (38 destinacij TASK 62: SI+HR+ME+AL) + STATIČNI FSQ sloj
 * (125.445 točk — bencinske, restavracije, nastanitve, trgovine … iz
 * Foursquare Open Places, Apache-2.0) in — če je uporabnik ravno
 * sestavil AI itinerer — tudi pot svojega potovanja (routeCoords/
 * routeByDay iz app store).
 *
 * 1.48: stran je na EN whitelisti (src/i18n/routing.ts) — prej je gumb
 * "Map" v /en navigaciji vodil na 308 → slovensko stran. Vsi nizi sledijo
 * L vzorcu (map-section/map-view/poi-modal uporabljajo isti vzorec).
 */

const PATH = "/zemljevid";

/** Dvojezični nizi heroja (server komponenta — getLocale iz next-intl). */
// W12 faza 2a (1.145.0): + fr/es — isti kanon kot W1 faza 2a za IT/DE.
const L = {
  badge: { sl: "Zemljevid", en: "Map", it: "Mappa", de: "Karte", fr: "Carte", es: "Mapa" },
  title: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
    it: "Mappa interattiva della Slovenia e dei Balcani",
    de: "Interaktive Karte von Slowenien und dem Balkan",
    fr: "Carte interactive de la Slovénie et des Balkans",
    es: "Mapa interactivo de Eslovenia y los Balcanes",
  },
  subtitle: {
    sl: (n: number) =>
      `${n} destinacij od Alp do Albanije na enem zemljevidu — z bencinskimi postajami, restavracijami, nastanitvami in drugimi lokalnimi točkami, s podrobnostmi o vsaki lokaciji in potjo vašega AI itinererja.`,
    en: (n: number) =>
      `${n} destinations from the Alps to Albania on a single map — with petrol stations, restaurants, stays and other local places, details for every location and your AI itinerary route once you build one.`,
    it: (n: number) =>
      `${n} destinazioni dalle Alpi all'Albania su un'unica mappa — con stazioni di benzina, ristoranti, alloggi e altri luoghi locali, dettagli per ogni posizione e il percorso del tuo itinerario AI.`,
    de: (n: number) =>
      `${n} Reiseziele von den Alpen bis Albanien auf einer Karte — mit Tankstellen, Restaurants, Unterkünften und weiteren lokalen Orten, Details zu jeder Position und der Route deiner KI-Reiseroute.`,
    fr: (n: number) =>
      `${n} destinations des Alpes à l'Albanie sur une seule carte — avec stations-service, restaurants, hébergements et autres lieux locaux, des détails pour chaque position et l'itinéraire de votre voyage IA.`,
    es: (n: number) =>
      `${n} destinos de los Alpes a Albania en un solo mapa — con gasolineras, restaurantes, alojamientos y otros lugares locales, detalles de cada posición y la ruta de tu itinerario IA.`,
  },
  hint: {
    sl: "Kliknite marker za podrobnosti · Brez prijave",
    en: "Tap a marker for details · No sign-up required",
    it: "Tocca un marker per i dettagli · Senza registrazione",
    de: "Tippe auf einen Marker für Details · Ohne Registrierung",
    fr: "Touchez un marqueur pour les détails · Sans inscription",
    es: "Toca un marcador para ver los detalles · Sin registro",
  },
  metaTitle: {
    sl: "Interaktivni zemljevid Slovenije in Balkana",
    en: "Interactive map of Slovenia & the Balkans",
    it: "Mappa interattiva della Slovenia e dei Balcani",
    de: "Interaktive Karte von Slowenien und dem Balkan",
    fr: "Carte interactive de la Slovénie et des Balkans",
    es: "Mapa interactivo de Eslovenia y los Balcanes",
  },
  metaDescription: {
    sl: "Raziščite Slovenijo in Balkan na interaktivnem zemljevidu — destinacije, bencinske postaje, restavracije, nastanitve, lokalne ponudnike in pot svojega AI itinererja.",
    en: "Explore Slovenia and the Balkans on an interactive map — destinations, petrol stations, restaurants, stays, local providers and your AI itinerary route.",
    it: "Esplora Slovenia e Balcani su una mappa interattiva — destinazioni, stazioni di benzina, ristoranti, alloggi, fornitori locali e il percorso del tuo itinerario AI.",
    de: "Entdecke Slowenien und den Balkan auf einer interaktiven Karte — Reiseziele, Tankstellen, Restaurants, Unterkünfte, lokale Anbieter und die Route deiner KI-Reiseroute.",
    fr: "Explorez la Slovénie et les Balkans sur une carte interactive — destinations, stations-service, restaurants, hébergements, prestataires locaux et l'itinéraire de votre voyage IA.",
    es: "Explora Eslovenia y los Balcanes en un mapa interactivo — destinos, gasolineras, restaurantes, alojamientos, proveedores locales y la ruta de tu itinerario IA.",
  },
} as const;

type PageLang = keyof typeof L.badge;

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  // W12 faza 2a (1.145.0): 6 javnih jezikov
  const lang: PageLang =
    locale === "en" || locale === "it" || locale === "de" || locale === "fr" || locale === "es"
      ? locale
      : "sl";
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
  // W12 faza 2a (1.145.0): 6 javnih jezikov
  const lang: PageLang =
    locale === "en" || locale === "it" || locale === "de" || locale === "fr" || locale === "es"
      ? locale
      : "sl";

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
    </div>
  );
}
