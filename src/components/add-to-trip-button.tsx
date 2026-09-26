"use client";

import { Check, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";

import { ToastAction } from "@/components/ui/toast";
import { useToast } from "@/hooks/use-toast";
import { useMyTrip } from "@/hooks/use-my-trip";
import { addMyTripItem, removeMyTripItem, type MyTripInput } from "@/lib/my-trip";
import { cn } from "@/lib/utils";

/**
 * AddToTripButton — KANONSKI gumb "Dodaj v mojo pot" (TASK 8 / D8-B §3.2).
 *
 * Ena primitiva za vse površine odkrivanja (destinacije, POI, lokali,
 * dogodki, doživetja, izdelki, vodiči, iskanje …) — rešuje D8-A P-CTA-1
 * (7 nezdružljivih izvedb). Slovnica stanj (issue §40):
 *   Shrani (srček, terakota) ≠ V moji poti (ta gumb, mehka smaragdna) ≠
 *   Načrtovano (načrtovalnik) ≠ Rezervirano (booking).
 *
 * Dva načina uporabe:
 *  1. NEKONTROLIRAN (privzeto): gumb sam bere/zapiše zbirko `dai:my-trip-items`
 *     (useMyTrip) — klik doda (toast "Dodano v mojo pot" + Odpri pot) ali
 *     odstrani (toast + razveljavitev).
 *  2. KONTROLIRAN (`added` + `onToggle`): za write-through površine (zemljevid:
 *     izbira za AI kontekst IN pripadnost hkrati) — površina upravlja mehaniko,
 *     gumb zagotavlja enoten videz/besednjak/dostopnost.
 *
 * Dostopnost: aria-pressed (preklop), 44px+ dotik v vseh treh velikostih,
 * polni naslov v aria-label za ikonsko izvedbo, viden focus ring.
 */

const L = {
  sl: {
    add: "Dodaj v mojo pot",
    added: "V moji poti",
    toastAdded: "Dodano v mojo pot",
    toastRemoved: "Odstranjeno iz moje poti",
    undo: "Dodaj nazaj",
    openTrip: "Odpri pot",
    capNotice: "Zbirka je polna — najstarejša ideja je zamenjana.",
    addAria: (title: string) => `Dodaj ${title} v mojo pot`,
    removeAria: (title: string) => `${title} je v tvoji poti — klikni za odstranitev`,
  },
  en: {
    add: "Add to my trip",
    added: "In my trip",
    toastAdded: "Added to my trip",
    toastRemoved: "Removed from my trip",
    undo: "Add back",
    openTrip: "Open trip",
    capNotice: "Your trip collection is full — the oldest idea was replaced.",
    addAria: (title: string) => `Add ${title} to my trip`,
    removeAria: (title: string) => `${title} is in your trip — click to remove`,
  },
} as const;

type Lang = keyof typeof L;

export type AddToTripVariant = "full" | "compact" | "icon";

const VARIANT_CLASSES: Record<AddToTripVariant, string> = {
  // full: kartice/modali/podrobnosti — primarna akcija
  full: "min-h-11 gap-2 px-4 py-2 text-sm font-medium",
  // compact: vrstice iskanja/klepeta/panelov
  compact: "min-h-11 gap-1.5 px-3 py-1.5 text-sm font-medium",
  // icon: gosti gosti/vrstice z omejenim prostorom (celoten aria-label)
  icon: "size-11 justify-center p-0",
};

const STATE_CLASSES = {
  // Prostor za dodajanje — primarna obrisa (smaragdna jedro produkta)
  idle: "border-primary/40 text-primary hover:bg-primary/10 active:bg-primary/15",
  // V moji poti — mehka smaragdna (enaka slovnica kot dogodki v načrtovalniku)
  added:
    "border-emerald-500/50 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400",
} as const;

export function AddToTripButton({
  item,
  variant = "full",
  added,
  onToggle,
  className,
}: {
  item: MyTripInput;
  /** "full" (kartica/modal) | "compact" (vrstica) | "icon" (samo ikona). */
  variant?: AddToTripVariant;
  /** KONTROLIRAN način: stanje podaja površina (write-through). */
  added?: boolean;
  /** KONTROLIRAN način: površina sama odloči, kaj se zgodi ob kliku. */
  onToggle?: (nextAdded: boolean, item: MyTripInput) => void;
  className?: string;
}) {
  const locale = useLocale();
  const s = locale === "en" ? L.en : L.sl;
  const { isIn, add, remove } = useMyTrip();
  const { toast } = useToast();
  const router = useRouter();

  const controlled = typeof added === "boolean";
  const inTrip = controlled ? (added as boolean) : isIn(item.kind, item.refId);
  const showCompactLabel = variant === "compact" || variant === "full";

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const next = !inTrip;
    if (onToggle) {
      onToggle(next, item);
      return;
    }
    if (next) {
      const result = add(item);
      if (result.added) {
        toast({
          title: s.toastAdded,
          description: item.title,
          action: (
            <ToastAction
              altText={s.openTrip}
              onClick={() => router.push("/moja-potovanja#moja-pot")}
            >
              {s.openTrip}
            </ToastAction>
          ),
        });
        if (result.evictedTitle) {
          // FIFO kapaciteta — iskreno obvestilo, brez tihe izgube
          toast({ title: s.capNotice, description: result.evictedTitle });
        }
      }
    } else {
      remove(item.kind, item.refId);
      toast({
        title: s.toastRemoved,
        description: item.title,
        action: (
          <ToastAction
            altText={s.undo}
            onClick={() => {
              addMyTripItem(item);
            }}
          >
            {s.undo}
          </ToastAction>
        ),
      });
    }
  };

  const label =
    variant === "icon"
      ? inTrip
        ? s.removeAria(item.title)
        : s.addAria(item.title)
      : undefined; // besedilni varianti imata vidno besedilo

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={inTrip}
      aria-label={label}
      title={variant === "icon" ? (inTrip ? s.added : s.add) : undefined}
      className={cn(
        "inline-flex select-none items-center rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        VARIANT_CLASSES[variant],
        inTrip ? STATE_CLASSES.added : STATE_CLASSES.idle,
        className
      )}
    >
      {inTrip ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Plus className="size-4" aria-hidden="true" />
      )}
      {showCompactLabel && <span>{inTrip ? s.added : s.add}</span>}
      {variant === "icon" && (
        <span className="sr-only">{inTrip ? s.removeAria(item.title) : s.addAria(item.title)}</span>
      )}
    </button>
  );
}
