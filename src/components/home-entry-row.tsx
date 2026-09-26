import { Building2, CalendarDays, Sparkles, Trees, Utensils } from "lucide-react";
import { getLocale } from "next-intl/server";

import { Link } from "@/i18n/navigation";

/**
 * HomeEntryRow — vstopna vrstica odkrivanja (TASK 8 / D8-F, issue #7).
 *
 * D8-B §7 (hierarhija domače strani): pod herojem in "Nadaljuj svojo pot"
 * stoji VSTOPNA VRSTICA petih vizualnih žetonov — Narava · Hrana · Mesta ·
 * Doživetja · Dogodki. Uporabnik, ki (še) ne ve, kaj bi vnesel v AI vnos,
 * dobi enoten, Premium vstop v obstoječe razdelke (brez slik — čisti ikonski
 * žetoni, ki tekmujejo z HeroQuickInput intent čipi, ne z uredniškimi
 * karticami).
 *
 * Strežniška komponenta (nič stanja): povezave vodijo na OBSTOJEČE strani
 * (/destinacije, /lokali, /dozivetja, /dogodki) — nič novih poti, nič
 * izmišljenih parametrov (issue §51: SEO pogodbe ostajajo).
 *
 * Mobilno: vodoravno drsenje s snap (44px+ tarče); sm+ : flex wrap.
 */

const CHIPS = [
  { key: "nature", href: "/destinacije", Icon: Trees },
  { key: "food", href: "/lokali", Icon: Utensils },
  { key: "cities", href: "/destinacije", Icon: Building2 },
  { key: "experiences", href: "/dozivetja", Icon: Sparkles },
  { key: "events", href: "/dogodki", Icon: CalendarDays },
] as const;

type ChipKey = (typeof CHIPS)[number]["key"];

const L = {
  sl: {
    title: "Razišči po temah",
    chips: {
      nature: "Narava",
      food: "Hrana",
      cities: "Mesta",
      experiences: "Doživetja",
      events: "Dogodki",
    } as Record<ChipKey, string>,
    aria: {
      nature: "Narava — odpri destinacije",
      food: "Hrana — odpri lokale",
      cities: "Mesta — odpri destinacije",
      experiences: "Doživetja — odpri doživetja",
      events: "Dogodki — odpri koledar dogodkov",
    } as Record<ChipKey, string>,
  },
  en: {
    title: "Explore by theme",
    chips: {
      nature: "Nature",
      food: "Food",
      cities: "Cities",
      experiences: "Experiences",
      events: "Events",
    } as Record<ChipKey, string>,
    aria: {
      nature: "Nature — open destinations",
      food: "Food — open venues",
      cities: "Cities — open destinations",
      experiences: "Experiences — open experiences",
      events: "Events — open the events calendar",
    } as Record<ChipKey, string>,
  },
} as const;

export async function HomeEntryRow() {
  const locale = await getLocale();
  const s = locale === "en" ? L.en : L.sl;

  return (
    <section aria-labelledby="home-entry-row-title" className="py-6 sm:py-8">
      <h2 id="home-entry-row-title" className="sr-only">
        {s.title}
      </h2>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* Mobilno: vodoravno drsenje s snap (žetoni se ne stiskajo);
            sm+ : navadni flex wrap. -mx-4/px-4 omogoča celoširinsko drsenje
            na mobilnem, ostaja poravnano z ostalo vsebino. */}
        <nav
          aria-label={s.title}
          className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:justify-center sm:overflow-visible sm:px-0 sm:pb-0"
        >
          {CHIPS.map(({ key, href, Icon }) => (
            <Link
              key={key}
              href={href}
              aria-label={s.aria[key]}
              className="group flex min-h-11 shrink-0 snap-start items-center gap-2.5 rounded-xl border border-border/70 bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:translate-y-0"
            >
              <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary/15">
                <Icon className="size-4" aria-hidden="true" />
              </span>
              {s.chips[key]}
            </Link>
          ))}
        </nav>
      </div>
    </section>
  );
}

export default HomeEntryRow;
