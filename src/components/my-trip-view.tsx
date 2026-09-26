"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import {
  BookOpen,
  CalendarDays,
  Compass,
  ExternalLink,
  FileUp,
  Heart,
  Mountain,
  MapPin,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  Wand2,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useMyTrip } from "@/hooks/use-my-trip";
// TASK 8 / F3-D (issue #8, audit §4): most "Priljubljene" → načrt — ISTI
// prefill dogodek kot trak načrtovalnika (identiteta destinacij T1) + javni
// wishlist hook (isti vir resnice kot srček/list) + čista preslikava vnosa.
import { useWishlist } from "@/hooks/use-wishlist";
import { MY_TRIP_PREFILL_EVENT, type MyTripPrefillDetail } from "@/components/planner-my-trip-strip";
import {
  groupWishlistByDestination,
  wishlistTripItemOf,
} from "@/lib/wishlist-trip-bridge";
import {
  addMyTripItem,
  clearMyTripItems,
  setMyTripHandoff,
  type MyTripItem,
  type MyTripKind,
} from "@/lib/my-trip";
import { cn } from "@/lib/utils";

/**
 * MyTripView — pogled zbirke "Moja pot" (TASK 8 / D8-B §4) na /moja-potovanja.
 *
 * ADD sloj (zbirka referenc) — NI razporejevalnik: razporejanje ostane v
 * /nacrtuj ("Nadaljuj načrtovanje" handoff), rezervacije v booking stanju.
 * Prikazuje se SAMO, ko zbirka ni prazna (prazen seznam = brez hrupa;
 * obstoječe prazne razrede strani pokrijejo napredek).
 *
 * Gost in prijavljeni uporabnik vidita isto zbirko (localStorage, brez PII).
 */

const L = {
  sl: {
    title: "Moja pot",
    subtitle: (count: number) =>
      count === 1
        ? "1 ideja, ki jo lahko spremeniš v potovanje"
        : `${count} idej, ki jih lahko spremeniš v potovanje`,
    continue: "Nadaljuj načrtovanje",
    clear: "Počisti",
    open: "Odpri",
    remove: (title: string) => `Odstrani ${title} iz moje poti`,
    cleared: "Zbirka izpraznjena",
    undo: "Obnovi",
    // TASK 8 / F3-D: trak "Iz priljubljenih" — most wishlist → zbirka/načrt
    // (ista meja kot PlannerMyTripStrip: zbirka ≠ razporejevalnik, NO
    // silent AI — načrt sestavi uporabnik v načrtovalniku).
    wishlist: {
      title: "Iz priljubljenih",
      use: "Uporabi v načrtu",
      useAria: "Prenesi priljubljene v zbirko Moja pot in predlagaj destinacije načrtovalniku",
      appliedTitle: "Uporabljeno v načrtu",
      appliedNote: (n: number) =>
        n === 1
          ? "1 priljubljena je v zbirki „Moja pot“ — nadaljuj načrtovanje."
          : `${n} priljubljenih je v zbirki „Moja pot“ — nadaljuj načrtovanje.`,
      appliedDestinations: (names: string) => `Predlagane destinacije: ${names}.`,
      planAction: "Načrtuj",
      note: "Všeč ≠ v poti: predmeti so dodani v zbirko, razporejanje pa ostane v načrtovalniku (brez tihega AI).",
      openMarket: "Odpri v tržnici",
    },
    groups: {
      destination: "Destinacije",
      poi: "Znamenitosti",
      listing: "Lokali",
      event: "Dogodki",
      experience: "Doživetja",
      product: "Izdelki",
      guide: "Vodiči",
      community: "Skupnost",
      import: "Uvoženo",
      ai: "AI predlogi",
    } as Record<MyTripKind, string>,
  },
  en: {
    title: "My trip",
    subtitle: (count: number) =>
      count === 1 ? "1 idea to turn into a trip" : `${count} ideas to turn into a trip`,
    continue: "Continue planning",
    clear: "Clear",
    open: "Open",
    remove: (title: string) => `Remove ${title} from my trip`,
    cleared: "Collection cleared",
    undo: "Restore",
    // TASK 8 / F3-D: wishlist bridge strip labels (collection layer only).
    wishlist: {
      title: "From favourites",
      use: "Use in my plan",
      useAria: "Transfer your favourites into the My trip collection and suggest destinations to the planner",
      appliedTitle: "Applied to your plan",
      appliedNote: (n: number) =>
        n === 1
          ? "1 favourite is in your “My trip” collection — continue planning."
          : `${n} favourites are in your “My trip” collection — continue planning.`,
      appliedDestinations: (names: string) => `Suggested destinations: ${names}.`,
      planAction: "Plan",
      note: "Liked ≠ in the plan: items are added to the collection, scheduling stays in the planner (no silent AI).",
      openMarket: "Open in marketplace",
    },
    groups: {
      destination: "Destinations",
      poi: "Places",
      listing: "Venues",
      event: "Events",
      experience: "Experiences",
      product: "Products",
      guide: "Guides",
      community: "Community",
      import: "Imported",
      ai: "AI picks",
    } as Record<MyTripKind, string>,
  },
};

const KIND_ICON: Record<MyTripKind, LucideIcon> = {
  destination: Mountain,
  poi: MapPin,
  listing: Utensils,
  event: CalendarDays,
  experience: Sparkles,
  product: ShoppingBag,
  guide: BookOpen,
  community: Users,
  import: FileUp,
  ai: Wand2,
};

/** Vrstni red skupin v pogledu (destinacije prve — največja odločitev). */
const GROUP_ORDER: MyTripKind[] = [
  "destination",
  "poi",
  "listing",
  "event",
  "experience",
  "product",
  "guide",
  "community",
  "import",
  "ai",
];

export function MyTripView({ className }: { className?: string }) {
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "sl";
  const s = lang === "en" ? L.en : L.sl;
  const { items, count, remove } = useMyTrip();
  // F3-D: "Priljubljene" — isti vir resnice kot srček v navigaciji
  // (localStorage + dogodki; hydration-varen hook, isti vzorec kot useMyTrip).
  const { entries: wishlistEntries } = useWishlist();
  const { toast } = useToast();
  const router = useRouter();

  const groups = useMemo(() => {
    const byKind = new Map<MyTripKind, MyTripItem[]>();
    for (const item of items) {
      const list = byKind.get(item.kind) ?? [];
      list.push(item);
      byKind.set(item.kind, list);
    }
    return GROUP_ORDER.filter((kind) => byKind.has(kind)).map((kind) => ({
      kind,
      items: byKind.get(kind) as MyTripItem[],
    }));
  }, [items]);

  // F3-D: skupine destinacij iz "Priljubljenih" (razrešitev prostega
  // besedila proti T1 datasetu; nerazrešljivo ostane iskreno vidno brez
  // ID-ja). Drugo/Other glede na jezik klicatelja.
  const wishlistGroups = useMemo(
    () =>
      groupWishlistByDestination(
        wishlistEntries,
        lang === "en" ? "Other" : "Drugo"
      ),
    [wishlistEntries, lang]
  );

  if (count === 0) return null;

  const handleContinue = () => {
    setMyTripHandoff();
    router.push("/nacrtuj");
  };

  // TASK 8 / F3-D: most "Priljubljene" → zbirka + načrt (PLAST ZBIRKE — NO
  // silent AI, NO razporejanje):
  //  (a) RAZREŠENE destinacije → ISTI `dai:my-trip-prefill` CustomEvent kot
  //      trak načrtovalnika (posluša ga itinerary-planner; če poslušalca ni
  //      — smo na /moja-potovanja — je dogodek neškodljiv, pot pa pokrije
  //      ToastAction "Načrtuj" s stabilnim handoff vzorcem spodaj);
  //  (b) vsak vnos → zbirka "Moja pot" prek wishlistTripItemOf (IDENTITETA
  //      kind:refId enaka ročnemu dodajanju iz lista → dedup čez površine);
  //  (c) iskren toast: predmeti so pristali v ZBIRKI, razpored ostaja
  //      uporabnikov (ToastAction nadaljuje načrtovanje — obstoječi tok).
  const handleUseWishlist = () => {
    const resolved = wishlistGroups
      .map((g) => g.destinationId)
      .filter((id): id is string => typeof id === "string");
    if (resolved.length > 0) {
      window.dispatchEvent(
        new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT, {
          detail: { destinations: resolved },
        })
      );
    }
    for (const entry of wishlistEntries) {
      addMyTripItem(wishlistTripItemOf(entry));
    }
    const destNames = wishlistGroups
      .filter((g) => g.destinationId)
      .map((g) => g.destinationName)
      .slice(0, 4)
      .join(", ");
    toast({
      title: s.wishlist.appliedTitle,
      description: [
        s.wishlist.appliedNote(wishlistEntries.length),
        destNames ? s.wishlist.appliedDestinations(destNames) : null,
      ]
        .filter(Boolean)
        .join(" "),
      action: (
        <ToastAction altText={s.wishlist.planAction} onClick={handleContinue}>
          {s.wishlist.planAction}
        </ToastAction>
      ),
    });
  };

  const handleClear = () => {
    const snapshot = items;
    clearMyTripItems();
    toast({
      title: s.cleared,
      action: (
        <ToastAction
          altText={s.undo}
          onClick={() => {
            // Obnovi v izvirnem vrstnem redu (najstarejši prvi nazaj na vrh)
            [...snapshot].reverse().forEach((item) => {
              const { addedAt: _addedAt, ...input } = item;
              addMyTripItem(input);
            });
          }}
        >
          {s.undo}
        </ToastAction>
      ),
    });
  };

  return (
    <section
      id="moja-pot"
      aria-labelledby="moja-pot-title"
      className={cn("rounded-2xl border bg-card p-4 sm:p-6 shadow-sm", className)}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2
            id="moja-pot-title"
            className="flex items-center gap-2 text-xl font-bold tracking-tight"
          >
            <Compass className="size-5 text-primary" aria-hidden="true" />
            {s.title}
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-sm font-semibold text-primary">
              {count}
            </span>
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{s.subtitle(count)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {s.clear}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            {s.continue}
          </button>
        </div>
      </div>

      {/* TASK 8 / F3-D (audit §4 "wishlist→trip auto-bridge"): trak
          "Iz priljubljenih" — utišana kartica (ista vizualna slovnica kot
          PlannerMyTripStrip: rounded-lg border bg-muted/40 p-3, majhen
          uppercase naslov z ikono + števcem). Viden SAMO, ko imajo
          "Priljubljene" vnose. Čipi z destinacijami + števci ("Bled ×3");
          NERAZREŠLJIVO besedilo ostane iskreno vidno BREZ prispevka k
          prefillu (čip vodi na /trznica). PLAST ZBIRKE: brez AI, brez
          razporejanja. */}
      {wishlistEntries.length > 0 && (
        <div className="mt-4 rounded-lg border border-border/70 bg-muted/40 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <Heart
                className="size-3.5 text-orange-600 dark:text-orange-400"
                aria-hidden="true"
              />
              {s.wishlist.title}
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
                {wishlistEntries.length}
              </span>
            </h3>
            <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {wishlistGroups.map((group) =>
                group.destinationId ? (
                  <span
                    key={`wl-${group.destinationId}`}
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background py-0.5 pl-2 pr-2 text-[11px] font-medium text-foreground"
                    title={group.destinationName}
                  >
                    <MapPin
                      className="size-3 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <span className="max-w-[9rem] truncate">
                      {group.destinationName}
                    </span>
                    <span className="font-semibold text-muted-foreground">
                      ×{group.count}
                    </span>
                  </span>
                ) : (
                  // Iskren fallback: nerazrešljivo/brez destinacije — čip
                  // BREZ prefill prispevka, povezava na /trznica (wishlist
                  // tam živi; modal odpre obstoječi openFromWishlist tok).
                  <Link
                    key={`wl-raw-${group.destinationName}`}
                    href="/trznica"
                    className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background py-0.5 pl-2 pr-2 text-[11px] font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title={s.wishlist.openMarket}
                  >
                    <ExternalLink
                      className="size-3 shrink-0"
                      aria-hidden="true"
                    />
                    <span className="max-w-[9rem] truncate">
                      {group.destinationName}
                    </span>
                    <span className="font-semibold text-muted-foreground">
                      ×{group.count}
                    </span>
                  </Link>
                )
              )}
            </div>
            <div className="flex shrink-0 items-center">
              <button
                type="button"
                onClick={handleUseWishlist}
                aria-label={s.wishlist.useAria}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
              >
                <Compass className="size-3.5" aria-hidden="true" />
                {s.wishlist.use}
              </button>
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
            <Heart className="size-3 shrink-0" aria-hidden="true" />
            {s.wishlist.note}
          </p>
        </div>
      )}

      <div className="mt-4 space-y-5">
        {groups.map(({ kind, items: groupItems }) => {
          const Icon = KIND_ICON[kind];
          return (
            <div key={kind}>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                <Icon className="size-4" aria-hidden="true" />
                {s.groups[kind]}
                <span className="font-normal normal-case">({groupItems.length})</span>
              </h3>
              <ul className="mt-2 divide-y divide-border rounded-xl border bg-background">
                {groupItems.map((item) => (
                  <li
                    key={`${item.kind}:${item.refId}`}
                    className="flex items-center gap-3 p-3"
                  >
                    {item.image ? (
                      <img
                        src={item.image}
                        alt=""
                        className="size-12 shrink-0 rounded-lg object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{item.title}</p>
                      {item.subtitle ? (
                        <p className="truncate text-sm text-muted-foreground">{item.subtitle}</p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <a
                        href={item.href}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                        {s.open}
                      </a>
                      <button
                        type="button"
                        onClick={() => remove(item.kind, item.refId)}
                        aria-label={s.remove(item.title)}
                        className="inline-flex size-11 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Trash2 className="size-4" aria-hidden="true" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
