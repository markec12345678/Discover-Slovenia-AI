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
} from "lucide-react";
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
    label: "Najem avta",
    icon: Car,
    description: "Iskanje po 10.000+ lokacijah. Brezplačna odpoved večinoma.",
    href: "/go/cars?dest=Ljubljana",
    aria: "Najemi avto prek DiscoverCars — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "hotels",
    name: PARTNER_LABELS.hotels,
    label: "Hoteli & nastanitve",
    icon: BedDouble,
    description: "28 mio nastanitev po vsem svetu. Brezplačna odpoved večinoma.",
    href: "/go/hotels?dest=Ljubljana",
    aria: "Rezerviraj nastanitev na Booking.com — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "activities",
    name: PARTNER_LABELS.activities,
    label: "Aktivnosti & izleti",
    icon: Ticket,
    description: "300.000+ izkušenj in turov. Brezplačna odpoved do 24h pred.",
    href: "/go/activities?dest=Bled",
    aria: "Rezerviraj izlete in izkušnje prek GetYourGuide — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "flights",
    name: PARTNER_LABELS.flights,
    label: "Leti",
    icon: Plane,
    description: "Primerjava letov 1.200+ letalskih družb. Najnižje cene.",
    href: "/go/flights?dest=Ljubljana",
    aria: "Poišči lete prek Skyscannerja — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "insurance",
    // Ime AKTIVNEGA partnerja (strežniško env branje — če je namesto
    // World Nomads aktiven SafetyWing, kartica ne sme lagati o partnerju)
    name: insurancePartnerName(),
    label: "Potno zavarovanje",
    icon: ShieldCheck,
    description: "Zavarovanje za pustolovske aktivnosti (rafting, pohodništvo).",
    href: "/go/insurance?days=7",
    aria: "Skleni potno zavarovanje — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "esim",
    name: PARTNER_LABELS.esim,
    label: "eSIM za Slovenijo",
    icon: Smartphone,
    description:
      "Internet takoj ob prihodu — brez fizične SIM kartice in brez dražjega roaminga.",
    href: "/go/esim",
    aria: "Kupi eSIM prek Airala — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "transfers",
    name: PARTNER_LABELS.transfers,
    label: "Transferji",
    icon: CarTaxiFront,
    description:
      "Letališčki in medkrajevni transferji — udobje brez najema avta.",
    href: "/go/transfers?dest=Ljubljana",
    aria: "Rezerviraj transfer prek Kiwitaxija — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "transport",
    name: PARTNER_LABELS.transport,
    label: "Vlaki & avtobusi",
    icon: TrainFront,
    description:
      "Medkrajevni prevozi po Sloveniji — za potnike brez avta.",
    href: "/go/transport?dest=Ljubljana",
    aria: "Poišči vlake in avtobuse prek Omiya — odpre partnersko povezavo",
    accent: "text-primary",
  },
  {
    id: "tickets",
    name: PARTNER_LABELS.tickets,
    label: "Vstopnice",
    icon: TicketCheck,
    description:
      "Vstopnice za znamenitosti (Postojna, Grad Bled …) — brez čakalnih vrst.",
    href: "/go/tickets?dest=Bled",
    aria: "Kupi vstopnice prek Tiqetsa — odpre partnersko povezavo",
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
            Rezervacijo opravite neposredno pri partnerskem ponudniku.
            Discover Slovenia vam za uporabo povezave ne zaračuna ničesar.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 9 partnerjev = 3×3 na desktopu; isti vzorec kartice — brez
              novih sekcij, brez spremembe vizualnega jezika */}
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
                      Partnerska ponudba
                    </Badge>
                  </div>

                  <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                    {p.label}
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{p.name}</h3>
                  <p className="text-sm text-muted-foreground flex-grow">
                    {p.description}
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
                      aria-label={p.aria}
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

        {/* EU disclosure — označba partnerskih povezav */}
        <p className="mt-8 text-center text-xs text-muted-foreground max-w-2xl mx-auto">
          Nekatere povezave so partnerske povezave. Če prek njih opravite
          rezervacijo, lahko Discover Slovenia prejme partnersko provizijo.
          Cena za vas se zaradi tega ne poveča.
        </p>
      </div>
    </section>
  );
}
