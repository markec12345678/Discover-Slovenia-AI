import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BedDouble, Car, Ticket, Info, ExternalLink } from "lucide-react";

// Kontekstualni affiliate CTA blok za SEO strani destinacij.
//
// SERVER komponenta — nič client JS: vsak klik gre prek /go/[provider]
// redirecta, ki strežniško zapiše AnalyticsEvent ("affiliate_click") in
// funnel korak. Zato tukaj uporabljamo navadni <a> (in ne next/link):
// Link bi ob vstopu v viewport prefetchal /go/ URL in sprožil lažne
// affiliate_klike (route handler + tracking bi se zagnal ob prefetchu).
//
// Stil je usklajen z obstoječim "Načrtujte potovanje" CTA na SEO straneh
// (rounded-2xl border border-primary/30 bg-primary/5), paleta primary/emerald,
// brez modre/indigo.
//
// FW4.3-2: besedila živijo v fragmentih affiliateCta.{sl,en}.json —
// `destination` je prop in se interpolira ({destination}).

interface AffiliateCardConfig {
  icon: typeof BedDouble;
  labelKey: string;
  titleKey: string;
  descKey: string;
  ctaKey: string;
  ariaKey: string;
  href: (destination: string) => string;
}

// Partnerji: Booking.com (hoteli), DiscoverCars (najem), GetYourGuide (izkušnje).
// rel="sponsored" je Googlejev signal za partnerske povezave; noopener/noreferrer
// varuje pred tab-nabbing.
const CARDS: Record<"hotels" | "cars" | "activities", AffiliateCardConfig> = {
  hotels: {
    icon: BedDouble,
    labelKey: "hotels.label",
    titleKey: "hotels.title",
    descKey: "hotels.desc",
    ctaKey: "hotels.cta",
    ariaKey: "hotels.aria",
    href: (d) => `/go/hotels?dest=${encodeURIComponent(d)}`,
  },
  cars: {
    icon: Car,
    labelKey: "cars.label",
    titleKey: "cars.title",
    descKey: "cars.desc",
    ctaKey: "cars.cta",
    ariaKey: "cars.aria",
    href: (d) => `/go/cars?dest=${encodeURIComponent(d)}`,
  },
  activities: {
    icon: Ticket,
    labelKey: "activities.label",
    titleKey: "activities.title",
    descKey: "activities.desc",
    ctaKey: "activities.cta",
    ariaKey: "activities.aria",
    href: (d) => `/go/activities?dest=${encodeURIComponent(d)}`,
  },
};

// Variante po tipu strani: full (glavna/things-to-do/itinerary),
// hotels-cars (kdaj iti → nastanitev + avto), activities-cars (vodniki → izkušnje).
const VARIANTS: Record<Variant, Array<"hotels" | "cars" | "activities">> = {
  full: ["hotels", "cars", "activities"],
  "hotels-cars": ["hotels", "cars"],
  "activities-cars": ["activities", "cars"],
};

type Variant = "full" | "hotels-cars" | "activities-cars";

export interface AffiliateCtaBlockProps {
  /** Ime destinacije (nominativ, npr. "Bled") — gre v copy + /go/?dest= */
  destination: string;
  /** full = 3 kartice, hotels-cars / activities-cars = 2 kartice */
  variant?: Variant;
}

export async function AffiliateCtaBlock({
  destination,
  variant = "full",
}: AffiliateCtaBlockProps) {
  const t = await getTranslations("affiliateCta");
  const keys = VARIANTS[variant];

  return (
    <section
      className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8"
      aria-label={t("sectionAria", { destination })}
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold mb-2">
          {t("title", { destination })}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          {t("subtitle")}
        </p>
      </div>

      <div
        className={`grid grid-cols-1 gap-4 ${
          keys.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"
        }`}
      >
        {keys.map((key) => {
          const card = CARDS[key];
          const Icon = card.icon;
          return (
            <Card
              key={key}
              className="border-border/60 transition-all hover:-translate-y-1 hover:shadow-lg"
            >
              <CardContent className="p-5 flex flex-col gap-2 h-full">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div className="text-xs uppercase tracking-wide text-muted-foreground mt-1">
                  {t(card.labelKey)}
                </div>
                <h3 className="font-semibold">{t(card.titleKey)}</h3>
                <p className="text-sm text-muted-foreground flex-1">
                  {t(card.descKey, { destination })}
                </p>
                <Button asChild className="mt-2 w-full">
                  <a
                    href={card.href(destination)}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                    aria-label={t(card.ariaKey, { destination })}
                  >
                    {t(card.ctaKey)}
                    <ExternalLink className="ml-2 size-4" aria-hidden="true" />
                  </a>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* EU disclosure (pravno obvezna označba partnerskih povezav) */}
      <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
        <Info className="size-3.5 shrink-0" aria-hidden="true" />
        {t("disclosure")}
      </p>
    </section>
  );
}
