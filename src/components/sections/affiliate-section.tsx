import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Car,
  Plane,
  BedDouble,
  Ticket,
  ShieldCheck,
  ExternalLink,
} from "lucide-react";
import { COMMISSION_INFO } from "@/lib/affiliate";

const partners = [
  {
    id: "cars",
    name: "DiscoverCars",
    label: "Najem avta",
    icon: Car,
    description: "70% provizija — najvišja v industriji. Iskanje po 10.000+ lokacijah.",
    commission: COMMISSION_INFO.cars,
    href: "https://www.discovercars.com/?affiliate=slovenia-demo&utm_source=discoverslovenia",
    accent: "text-primary",
  },
  {
    id: "hotels",
    name: "Booking.com",
    label: "Hoteli & nastanitve",
    icon: BedDouble,
    description: "28 mio nastanitev po vsem svetu. Brezplačna odpoved večinoma.",
    commission: COMMISSION_INFO.hotels,
    href: "https://www.booking.com/?aid=slovenia-demo",
    accent: "text-primary",
  },
  {
    id: "activities",
    name: "Viator",
    label: "Aktivnosti & izleti",
    icon: Ticket,
    description: "300.000+ izkušenj in turov. Brezplačna odpoved do 24h pred.",
    commission: COMMISSION_INFO.activities,
    href: "https://www.viator.com/?pid=slovenia-demo",
    accent: "text-primary",
  },
  {
    id: "flights",
    name: "Skyscanner",
    label: "Leti",
    icon: Plane,
    description: "Primerjava letov 1.200+ letalskih družb. Najnižje cene.",
    commission: COMMISSION_INFO.flights,
    href: "https://www.skyscanner.net/?utm_source=discoverslovenia",
    accent: "text-primary",
  },
  {
    id: "insurance",
    name: "World Nomads",
    label: "Potno zavarovanje",
    icon: ShieldCheck,
    description: "Zavarovanje za pustolovske aktivnosti (rafting, pohodništvo).",
    commission: COMMISSION_INFO.insurance,
    href: "https://www.worldnomads.com/?affiliate=slovenia-demo",
    accent: "text-primary",
  },
];

export function AffiliateSection() {
  return (
    <section id="rezerviraj" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-3">
            Rezerviraj direktno
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Vse za vaše potovanje na enem mestu
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Povežemo vas z najboljšimi partnerji. Rezervirate direktno pri njih —
            brez posrednikov, brez dodatnih stroškov.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {partners.map((p) => {
            const Icon = p.icon;
            return (
              <Card
                key={p.id}
                className="group hover:shadow-lg transition-shadow border-border/60"
              >
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-4">
                    <div className="size-12 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className={`size-6 ${p.accent}`} />
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {p.commission.rate}
                    </Badge>
                  </div>

                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {p.label}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{p.name}</h3>
                  <p className="text-sm text-muted-foreground flex-grow">
                    {p.description}
                  </p>

                  <Button
                    asChild
                    className="mt-6 w-full group-hover:bg-primary/90"
                  >
                    <a
                      href={p.href}
                      target="_blank"
                      rel="noopener noreferrer sponsored"
                    >
                      Rezerviraj
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Affiliate povezave — pri rezervacijah preko teh povezav zaslužimo
          provizijo. Za vas brez dodatnih stroškov. Hvala za podporo projektu.
        </p>
      </div>
    </section>
  );
}
