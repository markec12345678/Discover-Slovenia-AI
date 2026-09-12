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
  Smartphone,
  TrainFront,
  CarTaxiFront,
  TicketCheck,
  Compass,
} from "lucide-react";
import { getTranslations } from "next-intl/server";
import { PARTNER_LABELS, insurancePartnerName } from "@/lib/affiliate";

// Affiliate partnerji na homepageu — vsi linki gredo prek /go/[provider]
// redirecta, ki strežniško izmeri klik (AnalyticsEvent "affiliate_click" +
// funnel korak) in prilepi affiliate ID-je iz STREŽNIŠKIH env spremenljivk
// (fail-closed: brez nastavljenega ID-ja povezava ni predstavljena kot
// monetizirana — glej src/lib/affiliate.ts).
//
// PROVIZIJSKI ODSTOTKI NISO PRIKAZANI: prejšnji "70% / 5% / 8% / 40% / PPQ"
// je odstranjen, ker so bili zavajajoči — odstotki so delež PARTNERJEVEGA
// dobička (ne cene rezervacije), osnova pa se določi šele z aktivacijo
// posameznega partnerskega računa.
const partners = [
  {
    id: "cars",
    name: PARTNER_LABELS.cars,
    labelKey: "carsLabel",
    icon: Car,
    descriptionKey: "carsDesc",
    href: "/go/cars?dest=Ljubljana",
    ariaKey: "carsAria",
    accent: "text-primary",
  },
  {
    id: "hotels",
    name: PARTNER_LABELS.hotels,
    labelKey: "hotelsLabel",
    icon: BedDouble,
    descriptionKey: "hotelsDesc",
    href: "/go/hotels?dest=Ljubljana",
    ariaKey: "hotelsAria",
    accent: "text-primary",
  },
  {
    id: "activities",
    name: PARTNER_LABELS.activities,
    labelKey: "activitiesLabel",
    icon: Ticket,
    descriptionKey: "activitiesDesc",
    href: "/go/activities?dest=Bled",
    ariaKey: "activitiesAria",
    accent: "text-primary",
  },
  {
    id: "viator",
    name: PARTNER_LABELS.viator,
    labelKey: "viatorLabel",
    icon: Compass,
    descriptionKey: "viatorDesc",
    href: "/go/viator?dest=Bled",
    ariaKey: "viatorAria",
    accent: "text-primary",
  },
  {
    id: "flights",
    name: PARTNER_LABELS.flights,
    labelKey: "flightsLabel",
    icon: Plane,
    descriptionKey: "flightsDesc",
    href: "/go/flights?dest=Ljubljana",
    ariaKey: "flightsAria",
    accent: "text-primary",
  },
  {
    id: "insurance",
    // Ime AKTIVNEGA partnerja (strežniško env branje — če je namesto
    // World Nomads aktiven SafetyWing, kartica ne sme lagati o partnerju)
    name: insurancePartnerName(),
    labelKey: "insuranceLabel",
    icon: ShieldCheck,
    descriptionKey: "insuranceDesc",
    href: "/go/insurance?days=7",
    ariaKey: "insuranceAria",
    accent: "text-primary",
  },
  {
    id: "esim",
    name: PARTNER_LABELS.esim,
    labelKey: "esimLabel",
    icon: Smartphone,
    descriptionKey: "esimDesc",
    href: "/go/esim",
    ariaKey: "esimAria",
    accent: "text-primary",
  },
  {
    id: "transfers",
    name: PARTNER_LABELS.transfers,
    labelKey: "transfersLabel",
    icon: CarTaxiFront,
    descriptionKey: "transfersDesc",
    href: "/go/transfers?dest=Ljubljana",
    ariaKey: "transfersAria",
    accent: "text-primary",
  },
  {
    id: "transport",
    name: PARTNER_LABELS.transport,
    labelKey: "transportLabel",
    icon: TrainFront,
    descriptionKey: "transportDesc",
    href: "/go/transport?dest=Ljubljana",
    ariaKey: "transportAria",
    accent: "text-primary",
  },
  {
    id: "tickets",
    name: PARTNER_LABELS.tickets,
    labelKey: "ticketsLabel",
    icon: TicketCheck,
    descriptionKey: "ticketsDesc",
    href: "/go/tickets?dest=Bled",
    ariaKey: "ticketsAria",
    accent: "text-primary",
  },
];

export async function AffiliateSection() {
  const t = await getTranslations("affiliate");

  return (
    <section id="rezerviraj" className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-3">
            {t("badge")}
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            {t("title")}
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            {t("subtitle")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 10 partnerjev; isti vzorec kartice — brez novih sekcij, brez
              spremembe vizualnega jezika */}
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
                      {t("partnerBadge")}
                    </Badge>
                  </div>

                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {t(p.labelKey)}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{p.name}</h3>
                  <p className="text-sm text-muted-foreground flex-grow">
                    {t(p.descriptionKey)}
                  </p>

                  {/* /go/ redirect — kliks se izmeri strežniško (AnalyticsEvent + funnel) */}
                  <Button
                    asChild
                    className="mt-6 w-full group-hover:bg-primary/90"
                  >
                    <a
                      href={p.href}
                      target="_blank"
                      rel="sponsored noopener noreferrer"
                      aria-label={t(p.ariaKey)}
                    >
                      {t("book")}
                      <ExternalLink className="ml-2 size-4" />
                    </a>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* EU disclosure — označba partnerskih povezav */}
        <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          {t("disclosure")}
        </p>
      </div>
    </section>
  );
}
