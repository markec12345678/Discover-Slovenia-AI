"use client";

import { useEffect, useMemo } from "react";
import { useLocale } from "next-intl";
import {
  BookOpen,
  CalendarDays,
  Compass,
  ExternalLink,
  FileUp,
  MapPin,
  Mountain,
  ShoppingBag,
  Sparkles,
  Trash2,
  Users,
  Utensils,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useMyTrip } from "@/hooks/use-my-trip";
import {
  addMyTripItem,
  clearMyTripItems,
  consumeMyTripHandoff,
  type MyTripItem,
  type MyTripKind,
} from "@/lib/my-trip";
import { useAppStore } from "@/lib/store";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { MAX_SELECTED_PRODUCTS } from "@/lib/supply/sanitize";
import { getProvider } from "@/lib/supply/registry";
import { persistSelection } from "@/lib/supply/selection-persist";
import type { SelectedProviderProduct } from "@/lib/supply/types";

/**
 * PlannerMyTripStrip — trak "Iz moje poti" v načrtovalniku (TASK 8 / D8-F,
 * D8-B §5; issue #8).
 *
 * Zbirka "Moja pot" (ADD sloj) vstopi v načrtovalnik kot TIH trak nad
 * obrazcem — viden SAMO, ko zbirka ni prazna. POŠTEN prenos (brez tihe
 * AI regeneracije):
 *
 *  1. DESTINACIJE → CustomEvent `dai:my-trip-prefill` (payload: ID-ji
 *     destinacij). Posluša ga itinerary-planner ob obstoječi heroQuery
 *    .consume logiki in zapolni formData.preferredDestinations SAMO, če so
 *     PRAZNI (uporabnikova izbira iz uvoza povezave NIKOLI ne prepiše) —
 *     IMA mehanizem, ki ga že uporablja url-ingest (vidni čipi "Prepoznano").
 *     Zakaj CustomEvent in ne sessionStorage: trak in načrtovalnik sta na
 *     ISTI strani (/nacrtuj) — dogodek je reaktiven na klik "Uporabi v
 *     načrtu" (sessionStorage bi deloval le ob remountu) in zrcali obstoječi
 *     vzorec heroQuery/CHAT_ADD_PLACE listenerjev v plannerju (nižje
 *     tveganje kot dotik hydracijske logike ob mountu).
 *  2. IZDELKI/DOŽIVETJA → obstoječa izbira ponudbe (KANONSKI handoff iz
 *     journey-plannerja: useAppStore.setSelectedProducts + persistSelection
 *     → sessionStorage `dai:supply-selection`). Plannerjev čip strip se
 *     naroči na isti store → osvežitev je reaktivna, brez dodatnega
 *     dogodka. FIXED semantika (AI izbire ne zamenja tiho).
 *  3. DOGODKI → kontekst čipi z "Odpri" + iskrena opomba. MyTripItem NOSI
 *     samo naslov/povezavo (zbirka ≠ razporejevalnik, D8-B §2); ItineraryEvent
 *     zahteva datum/lokacijo/kategorijo/ceno — izmišljanje teh polj bi bilo
 *     LAŽNO razporejanje. Razporejanje dogodkov ostaja v obstoječi mehaniki
 *     (itinerary.events + toggleAddedEvent po generiranju).
 *  4. POI/LOKALI/VODIČI/… → kontekst čipi (vidni, tiho prisotni).
 *
 * Po "Uporabi v načrtu" zbirka OSTANE (odstranjevanje samo prek ✕ /
 * "Počisti") + toast "Uporabljeno v načrtu". Vizualno: utišana kartica —
 * NE tekmuje s primarnim gumbom za generiranje.
 */

/** Dogodek prefill destinacij (trak → načrtovalnik, isti vzorec kot heroQuery). */
export const MY_TRIP_PREFILL_EVENT = "dai:my-trip-prefill";

/** Payload dogodka — ID-ji destinacij (T1 dataset; server jih tako čisti). */
export interface MyTripPrefillDetail {
  destinations: string[];
}

const L = {
  sl: {
    title: "Iz moje poti",
    use: "Uporabi v načrtu",
    clear: "Počisti",
    open: "Odpri",
    cleared: "Zbirka izpraznjena",
    undo: "Obnovi",
    removed: "Odstranjeno iz moje poti",
    addBack: "Dodaj nazaj",
    eventsNote: "Dogodki se dodajo v načrt po generiranju.",
    appliedTitle: "Uporabljeno v načrtu",
    appliedProducts: (n: number) =>
      n === 1
        ? "1 izdelek ali doživetje je v izbiri načrta"
        : `${n} izdelki/doživetja so v izbiri načrta`,
    appliedContext: "Zbirka ostaja kot kontekst — dogodki se dodajo po generiranju.",
    cappedNotice: "Dosežena meja izbire (20) — ostalo ostaja v zbirki.",
    removeAria: (title: string) => `Odstrani ${title} iz moje poti`,
    useAria: "Prenesi destinacije in izdelke iz moje poti v načrt",
  },
  en: {
    title: "From my trip",
    use: "Use in my plan",
    clear: "Clear",
    open: "Open",
    cleared: "Collection cleared",
    undo: "Restore",
    removed: "Removed from my trip",
    addBack: "Add back",
    eventsNote: "Events are added to the plan after generation.",
    appliedTitle: "Applied to your plan",
    appliedProducts: (n: number) =>
      n === 1
        ? "1 product or experience is in your plan selection"
        : `${n} products/experiences are in your plan selection`,
    appliedContext: "The collection stays as context — events are added after generation.",
    cappedNotice: "Selection limit (20) reached — the rest stays in your collection.",
    removeAria: (title: string) => `Remove ${title} from my trip`,
    useAria: "Transfer destinations and products from my trip into the plan",
  },
} as const;

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

/**
 * ID destinacije iz predmeta zbirke. refId je lahko ID ali slug (površine
 * dodajanja uporabljajo oboje), zalogi pa sledi tudi globoka povezava
 * /destinacija/[slug]. Neznan ID se izpušča — strežnik ga tako ali tako
 * očisti (ista sanitizacija kot preferredDestinations v /api/itinerary).
 */
function destinationIdOf(item: MyTripItem): string | undefined {
  if (DESTINATIONS.some((d) => d.id === item.refId)) return item.refId;
  const bySlug = DESTINATIONS.find((d) => d.slug === item.refId);
  if (bySlug) return bySlug.id;
  const match = item.href.match(/^\/(?:en\/)?destinacija\/([^/?#]+)/);
  if (match) {
    const slug = decodeURIComponent(match[1]);
    const found = DESTINATIONS.find((d) => d.slug === slug || d.id === slug);
    if (found) return found.id;
  }
  return undefined;
}

/**
 * Izdelek/doživetje → strukturirana izbira (ISTA oblika kot
 * addProductToSelection / journeyProductsToSelection).
 *
 * kind "product"/"experience" sta vrsti lastne tržnice/doživetij po D8-B
 * taksonomiji → provider "own" (register label kot prikazani vir). Tip je
 * kanonski privzetek (doživetje → activity, izdelek → ticket — isto kot
 * own adapter); vsa NEZNANA polja (cena/geo/razpoložljivost) so IZPUŠČENA
 * — nikoli ne izmišljujemo vrednosti. FIXED: uporabnikova izbira.
 */
function toSelectionFromMyTrip(
  item: MyTripItem,
  lang: "sl" | "en"
): SelectedProviderProduct {
  const own = getProvider("own");
  return {
    provider: "own",
    providerProductId: item.refId.slice(0, 80),
    type: item.kind === "experience" ? "activity" : "ticket",
    title: item.title.slice(0, 120),
    locationName: item.subtitle?.slice(0, 80),
    source: own ? own.labels[lang] : "own",
    selectionState: "fixed",
  };
}

export function PlannerMyTripStrip() {
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "sl";
  const s = lang === "en" ? L.en : L.sl;
  const { items, count, remove } = useMyTrip();
  const { toast } = useToast();

  // Handoff zastavica ("Nadaljuj načrtovanje" iz /moja-potovanja) se prevzame
  // ob mountu — trak je že na vrhu obrazca, zato je takoj viden. NO
  // auto-prefill: uporabnik klikne "Uporabi v načrtu" sam (no silent
  // actions). Vidnost = števec zbirke (živa resnica istega localStorage).
  useEffect(() => {
    consumeMyTripHandoff();
  }, []);

  const eventItems = useMemo(
    () => items.filter((i) => i.kind === "event"),
    [items]
  );

  if (count === 0) return null;

  const handleRemove = (item: MyTripItem) => {
    remove(item.kind, item.refId);
    toast({
      title: s.removed,
      description: item.title,
      action: (
        <ToastAction
          altText={s.addBack}
          onClick={() => {
            const { addedAt: _addedAt, ...input } = item;
            addMyTripItem(input);
          }}
        >
          {s.addBack}
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

  const handleUse = () => {
    // 1) Destinacije → načrtovalnik (listener zapolni PRAZNO izbiro)
    const destinations: string[] = [];
    const seenIds = new Set<string>();
    for (const item of items) {
      if (item.kind !== "destination") continue;
      const id = destinationIdOf(item);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        destinations.push(id);
      }
    }
    if (destinations.length > 0) {
      window.dispatchEvent(
        new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT, {
          detail: { destinations },
        })
      );
    }

    // 2) Izdelki/doživetja → obstoječa izbira (store + sessionStorage —
    //    kanonski handoff vzorec; plannerjev čip strip se osveži reaktivno)
    let addedProducts = 0;
    let capped = 0;
    const productItems = items.filter(
      (i) => i.kind === "product" || i.kind === "experience"
    );
    if (productItems.length > 0) {
      const current = useAppStore.getState().selectedProducts;
      const keys = new Set(
        current.map((p) => `${p.provider}:${p.providerProductId}`)
      );
      // Dedupe tudi po naslovu: write-through z zemljevida ponudbe je
      // predmet ŽE vpisal pod pravim ponudnikom — ne podvajaj ga.
      const titles = new Set(current.map((p) => p.title));
      const next = [...current];
      for (const item of productItems) {
        if (next.length >= MAX_SELECTED_PRODUCTS) {
          capped++;
          continue;
        }
        const selection = toSelectionFromMyTrip(item, lang);
        const key = `${selection.provider}:${selection.providerProductId}`;
        if (keys.has(key) || titles.has(selection.title)) continue;
        keys.add(key);
        titles.add(selection.title);
        next.push(selection);
        addedProducts++;
      }
      if (addedProducts > 0) {
        useAppStore.getState().setSelectedProducts(next);
        persistSelection(next);
      }
    }

    // 3) Iskren povzetek (destinacije javi plannerjev listener — on ve,
    //    ali je izbiro dejansko zapolnil ali ohranil uporabnikovo)
    const parts: string[] = [];
    if (addedProducts > 0) parts.push(s.appliedProducts(addedProducts));
    if (eventItems.length > 0) parts.push(s.eventsNote);
    if (parts.length === 0) parts.push(s.appliedContext);
    toast({ title: s.appliedTitle, description: parts.join(" ") });
    if (capped > 0) {
      toast({ title: s.cappedNotice, description: String(capped) });
    }
  };

  return (
    <section
      aria-labelledby="planner-my-trip-title"
      className="rounded-lg border border-border/70 bg-muted/40 p-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3
          id="planner-my-trip-title"
          className="flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          <Compass className="size-3.5 text-primary" aria-hidden="true" />
          {s.title}
          <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[11px] font-semibold text-primary">
            {count}
          </span>
        </h3>

        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {items.map((item) => {
            const Icon = KIND_ICON[item.kind];
            return (
              <span
                key={`${item.kind}:${item.refId}`}
                className="inline-flex max-w-full items-center gap-1 rounded-full border border-border/70 bg-background py-0.5 pl-2 pr-1 text-[11px] font-medium text-foreground"
                title={item.title}
              >
                <Icon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="max-w-[9rem] truncate">{item.title}</span>
                {item.kind === "event" && (
                  <Link
                    href={item.href}
                    className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1 py-0.5 text-[10px] font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <ExternalLink className="size-2.5" aria-hidden="true" />
                    {s.open}
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => handleRemove(item)}
                  aria-label={s.removeAria(item.title)}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="size-3" aria-hidden="true" />
                </button>
              </span>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={handleClear}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            {s.clear}
          </button>
          <button
            type="button"
            onClick={handleUse}
            aria-label={s.useAria}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-3.5 py-1.5 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background active:scale-[0.98]"
          >
            <Compass className="size-3.5" aria-hidden="true" />
            {s.use}
          </button>
        </div>
      </div>

      {eventItems.length > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] leading-snug text-muted-foreground">
          <CalendarDays className="size-3 shrink-0" aria-hidden="true" />
          {s.eventsNote}
        </p>
      )}
    </section>
  );
}

export default PlannerMyTripStrip;
