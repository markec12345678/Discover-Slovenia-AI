import { Button } from "@/components/ui/button";
import {
  BedDouble,
  Plane,
  Ticket,
  ShieldCheck,
  ExternalLink,
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
//
// PREMIUM-VIZ (P2): prej 10 enakih "PARTNER"-kartic v mreži (občutek
// affiliate marketplace-a), zdaj umirjene tematske skupine (Bivanje /
// Na pot / Doživetja / Varna pot) v urejeniških vrsticah. VSI href-i,
// rel/atributi, aria oznake, razkritje in strežniško sledenje so
// NESPREMENJENI — sprememba je čisto predstavitev.

interface Partner {
  id: string;
  name: string;
  labelKey: string;
  descriptionKey: string;
  href: string;
  ariaKey: string;
}

/** Vsi partnerji — popolnoma isti href-i kot prej (sledenje nespremenjeno). */
const partners: Partner[] = [
  {
    id: "hotels",
    name: PARTNER_LABELS.hotels,
    labelKey: "hotelsLabel",
    descriptionKey: "hotelsDesc",
    href: "/go/hotels?dest=Ljubljana",
    ariaKey: "hotelsAria",
  },
  {
    id: "flights",
    name: PARTNER_LABELS.flights,
    labelKey: "flightsLabel",
    descriptionKey: "flightsDesc",
    href: "/go/flights?dest=Ljubljana",
    ariaKey: "flightsAria",
  },
  {
    id: "cars",
    name: PARTNER_LABELS.cars,
    labelKey: "carsLabel",
    descriptionKey: "carsDesc",
    href: "/go/cars?dest=Ljubljana",
    ariaKey: "carsAria",
  },
  {
    id: "transfers",
    name: PARTNER_LABELS.transfers,
    labelKey: "transfersLabel",
    descriptionKey: "transfersDesc",
    href: "/go/transfers?dest=Ljubljana",
    ariaKey: "transfersAria",
  },
  {
    id: "transport",
    name: PARTNER_LABELS.transport,
    labelKey: "transportLabel",
    descriptionKey: "transportDesc",
    href: "/go/transport?dest=Ljubljana",
    ariaKey: "transportAria",
  },
  {
    id: "activities",
    name: PARTNER_LABELS.activities,
    labelKey: "activitiesLabel",
    descriptionKey: "activitiesDesc",
    href: "/go/activities?dest=Bled",
    ariaKey: "activitiesAria",
  },
  {
    id: "viator",
    name: PARTNER_LABELS.viator,
    labelKey: "viatorLabel",
    descriptionKey: "viatorDesc",
    href: "/go/viator?dest=Bled",
    ariaKey: "viatorAria",
  },
  {
    id: "tickets",
    name: PARTNER_LABELS.tickets,
    labelKey: "ticketsLabel",
    descriptionKey: "ticketsDesc",
    href: "/go/tickets?dest=Bled",
    ariaKey: "ticketsAria",
  },
  {
    id: "insurance",
    // Ime AKTIVNEGA partnerja (strežniško env branje — če je namesto
    // World Nomads aktiven SafetyWing, kartica ne sme lagati o partnerju)
    name: insurancePartnerName(),
    labelKey: "insuranceLabel",
    descriptionKey: "insuranceDesc",
    href: "/go/insurance?days=7",
    ariaKey: "insuranceAria",
  },
  {
    id: "esim",
    name: PARTNER_LABELS.esim,
    labelKey: "esimLabel",
    descriptionKey: "esimDesc",
    href: "/go/esim",
    ariaKey: "esimAria",
  },
];

/** Tematske skupine — vizualna struktira, ne funkcionalna. */
const GROUPS: {
  id: string;
  titleKey: string;
  icon: typeof BedDouble;
  partnerIds: string[];
}[] = [
  {
    id: "stay",
    titleKey: "stayGroup",
    icon: BedDouble,
    partnerIds: ["hotels"],
  },
  {
    id: "move",
    titleKey: "moveGroup",
    icon: Plane,
    partnerIds: ["flights", "cars", "transfers", "transport"],
  },
  {
    id: "experience",
    titleKey: "experienceGroup",
    icon: Ticket,
    partnerIds: ["activities", "viator", "tickets"],
  },
  {
    id: "essentials",
    titleKey: "essentialsGroup",
    icon: ShieldCheck,
    partnerIds: ["insurance", "esim"],
  },
];

export async function AffiliateSection() {
  const t = await getTranslations("affiliate");

  return (
    <section id="rezerviraj" className="scroll-mt-20 bg-muted/30 py-16 sm:py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            {t("badge")}
          </span>
          <h2 className="text-balance text-3xl font-bold tracking-tight sm:text-4xl">
            {t("title")}
          </h2>
          <p className="mt-3 text-balance text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* Tematske skupine — urejeniške vrstice z las ločnicami */}
        <div className="mt-12 space-y-10">
          {GROUPS.map((group) => {
            const GroupIcon = group.icon;
            const groupPartners = group.partnerIds
              .map((id) => partners.find((p) => p.id === id))
              .filter((p): p is Partner => p !== undefined);
            if (groupPartners.length === 0) return null;
            return (
              <div key={group.id}>
                <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
                  <GroupIcon className="size-4" aria-hidden="true" />
                  {t(group.titleKey)}
                </div>
                <ul className="divide-y divide-border/70 border-y border-border/70">
                  {groupPartners.map((p) => (
                    <li
                      key={p.id}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
                    >
                      <div className="min-w-0 sm:max-w-md">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t(p.labelKey)}
                        </div>
                        <div className="mt-0.5 text-base font-semibold text-foreground">
                          {p.name}
                        </div>
                        <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
                          {t(p.descriptionKey)}
                        </p>
                      </div>

                      {/* /go/ redirect — kliks se izmeri strežniško (AnalyticsEvent + funnel) */}
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="shrink-0 gap-1.5 self-start sm:self-center"
                      >
                        <a
                          href={p.href}
                          target="_blank"
                          rel="sponsored noopener noreferrer"
                          aria-label={t(p.ariaKey)}
                        >
                          {t("book")}
                          <ExternalLink className="size-3.5" aria-hidden="true" />
                        </a>
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* EU disclosure — označba partnerskih povezav (nespremenjeno) */}
        <p className="mt-8 text-center text-xs leading-relaxed text-muted-foreground">
          {t("disclosure")}
        </p>
      </div>
    </section>
  );
}
