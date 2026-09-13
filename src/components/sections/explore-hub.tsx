import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";

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
 *
 * PREMIUM-VIZ (P2): prej 6-ikonska kartična mreža (dashboard občutek),
 * zdaj tipografski uredniški indeks — vdolžinske številke, las ločnice,
 * veliko belega prostora. Iste povezave, isti prevodi, nič fotografij
 * (hitrost + umirjen ritem po fotografiji bogatih sekcijah nad njim).
 */
const HUB_ITEMS = [
  {
    href: "/zemljevid",
    titleKey: "mapTitle",
    descriptionKey: "mapDesc",
  },
  {
    href: "/dogodki",
    titleKey: "eventsTitle",
    descriptionKey: "eventsDesc",
  },
  {
    href: "/lokali",
    titleKey: "localTitle",
    descriptionKey: "localDesc",
  },
  {
    href: "/vodici",
    titleKey: "guidesTitle",
    descriptionKey: "guidesDesc",
  },
  {
    href: "/trznica",
    titleKey: "marketTitle",
    descriptionKey: "marketDesc",
  },
  {
    href: "/slovenia-pass",
    titleKey: "passTitle",
    descriptionKey: "passDesc",
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
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <span className="mb-3 inline-block text-xs font-semibold uppercase tracking-[0.22em] text-primary">
            {t("badge")}
          </span>
          <h2
            id="razisci-title"
            className="text-balance text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {t("title")}
          </h2>
          <p className="mt-3 text-balance text-base text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>

        {/* Uredniški indeks — vdolčinske številke + las ločnice */}
        <Reveal className="mt-12">
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {HUB_ITEMS.map((item, i) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="group grid grid-cols-[2.5rem,1fr,auto] items-baseline gap-x-3 py-5 transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[3rem,1fr,auto] sm:gap-x-5 sm:py-6"
                >
                  {/* Vdoljinska številka */}
                  <span
                    className="text-xl font-light tabular-nums text-muted-foreground/50 transition-colors group-hover:text-primary sm:text-2xl"
                    aria-hidden="true"
                  >
                    {String(i + 1).padStart(2, "0")}
                  </span>

                  <span className="min-w-0">
                    <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                      {t(item.titleKey)}
                    </span>
                    <span className="mt-0.5 block max-w-prose text-sm leading-relaxed text-muted-foreground">
                      {t(item.descriptionKey)}
                    </span>
                  </span>

                  <ArrowRight
                    className="size-5 -translate-x-1 self-center text-muted-foreground/35 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-primary group-focus-visible:translate-x-0.5 group-focus-visible:text-primary"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export default ExploreHub;
