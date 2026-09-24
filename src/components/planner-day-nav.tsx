"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Bookmark, PencilLine } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DayPlan } from "@/lib/types";

// ============================================================================
// PLANNER DAY NAV — mobilna/tabletna navigacija po dnevih potovanja (P0-4)
// ============================================================================
//
// Problem (mobilna validacija): rezultat itinererja je na mobilnem ~3000px
// visok stolpec — kakovostna kartica, refiner, dnevi, priporočila, dogodki,
// pakirni seznam, timeline in šele na koncu akcije "Shrani in deli".
// Uporabnik nima hitrega preskoka med dnevi ne bližnjice do "Prilagodi"
// (VERIFY/ADJUST korak) ali shranjevanja (konverzija) — vse je globoko
// pod foldom in zahteva dolgo drsenje.
//
// Rešitev — lepljiva vrstica TIK pod glavo (65px = h-16 navigacija + meja):
//   [✎ Prilagodi] [🔖 Shrani] │ [Dan 1][Dan 2][Dan 3 …]
//
// - Dnevni tabi: vodoravno drsenje s scroll-snap (podpira do 14 dni),
//   scroll-spy (IntersectionObserver) označuje AKTIVEN dan med branjem,
//   klik = mehak preskok na kartico dneva
// - Prilagodi/Shrani: bližnjice do OBSTOJEČIH delov strani (id sidra) —
//   nič novih funkcij, čista navigacija po dolgem rezultatu
// - Vidna samo < lg (mobilni + tablični enostolpčni pogled; desktop ima
//   dvostolpčni layout z rezultatom ob obrazcu)
// - Samo ≥ 2 dni — enodnevni načrt je kratek, vrstica bi bila šum
// - prefers-reduced-motion: preskok brez animacije
// ============================================================================

/** Višina lepljive glave strani (h-16 + 1px meja) — vrstica se prime tik pod njo. */
const STICKY_TOP = 65;

/** Približna višina te vrstice — za scroll-spy pas in scroll-mt ciljev. */
const DAY_NAV_HEIGHT = 56;

interface PlannerDayNavProps {
  days: DayPlan[];
  /** TASK 4 / K-11: vrstni red v flex delovni površini. */
  className?: string;
}

export function PlannerDayNav({ days, className }: PlannerDayNavProps) {
  const t = useTranslations("planner");
  const [activeDay, setActiveDay] = useState<number>(days[0]?.day ?? 1);
  const pillRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  // Scroll-spy: dan, katerega kartica prav preide pod glavo + to vrstico,
  // postane aktiven (opazovani pas = zgornjih ~40 % zaslona)
  useEffect(() => {
    const cards = days
      .map((d) => document.getElementById(`day-card-${d.day}`))
      .filter((el): el is HTMLElement => el !== null);
    if (cards.length === 0) return;

    const topOffset = STICKY_TOP + DAY_NAV_HEIGHT;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const day = Number((entry.target as HTMLElement).dataset.day);
            if (Number.isFinite(day)) setActiveDay(day);
          }
        }
      },
      // pas se začne TIK pod lepljivim chrome-om (glava + ta vrstica)
      // in se konča pri 60 % višine zaslona
      { rootMargin: `-${topOffset}px 0px -60% 0px`, threshold: 0 }
    );
    cards.forEach((card) => observer.observe(card));
    return () => observer.disconnect();
  }, [days]);

  // Aktivni tab naj ostane viden v vodoravni vrstici (14-dnevni načrti)
  useEffect(() => {
    const pill = pillRefs.current[activeDay];
    pill?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeDay]);

  function scrollToId(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "start",
    });
  }

  // Enodnevni načrti so kratki — vrstica ne doda vrednosti
  if (days.length < 2) return null;

  return (
    <nav
      aria-label={t("dayNavAriaLabel")}
      className={cn(
        // TASK 4 / K-11: vrstni red v flex delovni površini (mobilno pred dnevi).
        "sticky top-[65px] z-30 border-b border-border/70 bg-background/95 py-2 backdrop-blur supports-[backdrop-filter]:bg-background/85 lg:hidden",
        className
      )}
    >
      <div className="flex items-center gap-2">
        {/* Bližnjici — Prilagodi (VERIFY/ADJUST) in Shrani (konverzija) */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => scrollToId("itinerary-refiner")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.98]"
          >
            <PencilLine className="size-3.5 shrink-0" aria-hidden="true" />
            {t("qaRefine")}
          </button>
          <button
            type="button"
            onClick={() => scrollToId("itinerary-actions")}
            className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border/70 bg-muted/40 px-3 text-xs font-medium text-foreground/90 transition-colors hover:border-primary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 active:scale-[0.98]"
          >
            <Bookmark className="size-3.5 shrink-0" aria-hidden="true" />
            {t("qaSave")}
          </button>
        </div>

        {/* Ločilo med bližnjicami in dnevi */}
        <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />

        {/* Dnevi — vodoravno drsenje s snap (skrit scrollbar; odcepljen
            naslednji tab je oznaka drsenja pri dolgih načrtih) */}
        <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {days.map((d) => {
            const isActive = activeDay === d.day;
            return (
              <button
                key={d.day}
                type="button"
                ref={(el) => {
                  pillRefs.current[d.day] = el;
                }}
                onClick={() => scrollToId(`day-card-${d.day}`)}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "inline-flex h-9 min-w-[68px] shrink-0 snap-start items-center justify-center rounded-full px-3.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "border border-border/70 bg-muted/40 text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {t("dayTitle", { day: d.day })}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}

export default PlannerDayNav;
