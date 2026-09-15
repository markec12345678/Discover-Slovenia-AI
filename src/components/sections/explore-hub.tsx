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
 * zdaj tipografski uredniški indeks — vdolčinske številke, las ločnice,
 * veliko belega prostora. Iste povezave, isti prevodi, nič fotografij
 * (hitrost + umirjen ritem po fotografiji bogatih sekcijah nad njim).
 *
 * t8 (poceni hub varianta): ISTI 6 povezav v 3 namenskih skupinah —
 * NAČRTUJ (zemljevid + vodiči) / DOŽIVI (dogodki + lokali + tržnica) /
 * VEČ (Slovenia Pass). Skupinske kice umirjeno razdeljujejo indeks po
 * uporabnikovem namenu, NE dodaja pa nobene nove povezave — AI načrtovalnik
 * ostaja izključno v hero CTA (brez duplikacije), Tržnica in Slovenia Pass
 * pa ostajata vidni (namenoma ohranjeni). Številčenje 01–06 teče čez
 * skupine (uredniška kontinuiteta).
 */
const HUB_GROUPS = [
  {
    groupKey: "groupPlan",
    items: [
      {
        href: "/zemljevid",
        titleKey: "mapTitle",
        descriptionKey: "mapDesc",
      },
      {
        href: "/vodici",
        titleKey: "guidesTitle",
        descriptionKey: "guidesDesc",
      },
    ],
  },
  {
    groupKey: "groupExperience",
    items: [
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
        href: "/trznica",
        titleKey: "marketTitle",
        descriptionKey: "marketDesc",
      },
    ],
  },
  {
    groupKey: "groupMore",
    items: [
      {
        href: "/slovenia-pass",
        titleKey: "passTitle",
        descriptionKey: "passDesc",
      },
    ],
  },
] as const;

// Ploskočni model vrstic: skupinska glava + elementi z globalnim števcem
// (vdoljinske številke 01–06 tečejo čez skupine).
type HubRow =
  | { kind: "group"; groupKey: string }
  | {
      kind: "item";
      n: number;
      href: string;
      titleKey: string;
      descriptionKey: string;
    };

const HUB_ROWS: HubRow[] = (() => {
  const rows: HubRow[] = [];
  let n = 0;
  for (const group of HUB_GROUPS) {
    rows.push({ kind: "group", groupKey: group.groupKey });
    for (const item of group.items) {
      rows.push({
        kind: "item",
        n: n++,
        href: item.href,
        titleKey: item.titleKey,
        descriptionKey: item.descriptionKey,
      });
    }
  }
  return rows;
})();

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

        {/* Uredniški indeks — skupine po namenu + vdoljinske številke +
            las ločnice (t8: isti 6 povezav, 3 umirjene skupine) */}
        <Reveal className="mt-12">
          <ul className="divide-y divide-border/70 border-y border-border/70">
            {HUB_ROWS.map((row) =>
              row.kind === "group" ? (
                <li key={`group-${row.groupKey}`} className="pt-7 first:pt-0 sm:pt-9">
                  <span className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground/70">
                    {t(row.groupKey)}
                  </span>
                </li>
              ) : (
                <li key={row.href}>
                  <Link
                    href={row.href}
                    className="group grid grid-cols-[2.5rem,1fr,auto] items-baseline gap-x-3 py-5 transition-colors hover:bg-background/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:grid-cols-[3rem,1fr,auto] sm:gap-x-5 sm:py-6"
                  >
                    {/* Vdoljinska številka */}
                    <span
                      className="text-xl font-light tabular-nums text-muted-foreground/50 transition-colors group-hover:text-primary sm:text-2xl"
                      aria-hidden="true"
                    >
                      {String(row.n + 1).padStart(2, "0")}
                    </span>

                    <span className="min-w-0">
                      <span className="text-base font-semibold text-foreground transition-colors group-hover:text-primary sm:text-lg">
                        {t(row.titleKey)}
                      </span>
                      <span className="mt-0.5 block max-w-prose text-sm leading-relaxed text-muted-foreground">
                        {t(row.descriptionKey)}
                      </span>
                    </span>

                    <ArrowRight
                      className="size-5 -translate-x-1 self-center text-muted-foreground/35 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-primary group-focus-visible:translate-x-0.5 group-focus-visible:text-primary"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              )
            )}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}

export default ExploreHub;
