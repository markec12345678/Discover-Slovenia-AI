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

interface AffiliateCardConfig {
  icon: typeof BedDouble;
  label: string;
  title: string;
  description: (destination: string) => string;
  cta: string;
  ariaLabel: (destination: string) => string;
  href: (destination: string) => string;
}

// Partnerji: Booking.com (hoteli), DiscoverCars (najem), GetYourGuide (izkušnje).
// rel="sponsored" je Googlejev signal za partnerske povezave; noopener/noreferrer
// varuje pred tab-nabbing.
const CARDS: Record<"hotels" | "cars" | "activities", AffiliateCardConfig> = {
  hotels: {
    icon: BedDouble,
    label: "Nastanitev",
    title: "Hoteli in apartmaji",
    description: (d) => `Poiščite hotele in apartmaje v ${d}.`,
    cta: "Poišči nastanitev",
    ariaLabel: (d) =>
      `Poišči nastanitev v ${d} — odpre Booking.com (partnerska povezava)`,
    href: (d) => `/go/hotels?dest=${encodeURIComponent(d)}`,
  },
  cars: {
    icon: Car,
    label: "Najem avta",
    title: "Primerjaj ponudnike",
    description: () => `Brezplačna odpoved in primerjava ponudb na enem mestu.`,
    cta: "Najemi avto",
    ariaLabel: (d) =>
      `Najemi avto za ${d} — odpre DiscoverCars (partnerska povezava)`,
    href: (d) => `/go/cars?dest=${encodeURIComponent(d)}`,
  },
  activities: {
    icon: Ticket,
    label: "Turi in izkušnje",
    title: "Vodeni izleti",
    description: () => `Vodeni izleti in aktivnosti z lokalnimi ponudniki.`,
    cta: "Poglej izlete",
    ariaLabel: (d) =>
      `Poglej ture in izkušnje za ${d} — odpre GetYourGuide (partnerska povezava)`,
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

export function AffiliateCtaBlock({
  destination,
  variant = "full",
}: AffiliateCtaBlockProps) {
  const keys = VARIANTS[variant];

  return (
    <section
      className="mb-10 rounded-2xl border border-primary/30 bg-primary/5 p-6 sm:p-8"
      aria-label={`Rezervacija za ${destination}`}
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold mb-2">
          Rezervirajte svoj obisk {destination}
        </h2>
        <p className="text-sm text-muted-foreground max-w-xl mx-auto">
          Povežemo vas z preverjenimi partnerji — rezervirate direktno pri njih,
          brez posrednikov in brez dodatnih stroškov.
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
                  {card.label}
                </div>
                <h3 className="font-semibold">{card.title}</h3>
                <p className="text-sm text-muted-foreground flex-1">
                  {card.description(destination)}
                </p>
                <Button asChild className="mt-2 w-full">
                  <a
                    href={card.href(destination)}
                    target="_blank"
                    rel="sponsored noopener noreferrer"
                    aria-label={card.ariaLabel(destination)}
                  >
                    {card.cta}
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
        Partnerske povezave: Booking.com, DiscoverCars, GetYourGuide. Zaslužimo
        majhen delež — za vas je cena enaka.
      </p>
    </section>
  );
}
