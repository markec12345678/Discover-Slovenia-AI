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

import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useMyTrip } from "@/hooks/use-my-trip";
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
  const s = locale === "en" ? L.en : L.sl;
  const { items, count, remove } = useMyTrip();
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

  if (count === 0) return null;

  const handleContinue = () => {
    setMyTripHandoff();
    router.push("/nacrtuj");
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
