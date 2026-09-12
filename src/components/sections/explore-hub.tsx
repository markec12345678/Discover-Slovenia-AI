import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Map as MapIcon,
  CalendarDays,
  Store,
  BookOpen,
  ShoppingBag,
  Award,
  ArrowRight,
  Compass,
} from "lucide-react";

import { Reveal } from "@/components/reveal";

/**
 * ExploreHub — "Razišči Slovenijo" (FW3: AI-first hierarhija).
 *
 * Most med nivoji: homepage pokaže AI + vrhunske vsebine, ta hub pa
 * uporabniku odkrije preostale funkcije platforme (nivo 2 — raziskovanje):
 * zemljevid, dogodki, lokali, vodiči, tržnica, Slovenia Pass.
 *
 * Namen: nobena funkcija ni skrita — vse ostanejo en klik stran, a ne
 * obremenjujejo primarnega toka. "Ne zmanjšuj funkcionalnosti,
 * zmanjšaj kognitivno obremenitev."
 */
const HUB_ITEMS = [
  {
    href: "/zemljevid",
    icon: MapIcon,
    titleKey: "mapTitle",
    descriptionKey: "mapDesc",
    accent: "bg-primary/10 text-primary",
  },
  {
    href: "/dogodki",
    icon: CalendarDays,
    titleKey: "eventsTitle",
    descriptionKey: "eventsDesc",
    accent: "bg-accent text-accent-foreground",
  },
  {
    href: "/lokali",
    icon: Store,
    titleKey: "localTitle",
    descriptionKey: "localDesc",
    accent: "bg-primary/10 text-primary",
  },
  {
    href: "/vodici",
    icon: BookOpen,
    titleKey: "guidesTitle",
    descriptionKey: "guidesDesc",
    accent: "bg-accent text-accent-foreground",
  },
  {
    href: "/trznica",
    icon: ShoppingBag,
    titleKey: "marketTitle",
    descriptionKey: "marketDesc",
    accent: "bg-primary/10 text-primary",
  },
  {
    href: "/slovenia-pass",
    icon: Award,
    titleKey: "passTitle",
    descriptionKey: "passDesc",
    accent: "bg-accent text-accent-foreground",
  },
] as const;

export async function ExploreHub() {
  const t = await getTranslations("exploreHub");

  return (
    <section
      id="razisci"
      className="scroll-mt-20 bg-muted/30 py-16 sm:py-20"
      aria-labelledby="razisci-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1 text-xs font-medium text-muted-foreground">
            <Compass className="size-3 text-primary" aria-hidden="true" />
            {t("badge")}
          </div>
          <h2
            id="razisci-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* Grid hub kartic */}
        <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {HUB_ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <Reveal key={item.href} delay={i * 60}>
                <Link
                  href={item.href}
                  className="group flex h-full flex-col gap-4 rounded-2xl border border-border/60 bg-background p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:p-6"
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`flex size-11 items-center justify-center rounded-xl ${item.accent}`}
                      aria-hidden="true"
                    >
                      <Icon className="size-5" />
                    </span>
                    <ArrowRight
                      className="size-5 text-muted-foreground/60 transition-all group-hover:translate-x-1 group-hover:text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h3 className="text-base font-semibold sm:text-lg">
                      {t(item.titleKey)}
                    </h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {t(item.descriptionKey)}
                    </p>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default ExploreHub;
