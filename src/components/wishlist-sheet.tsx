"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { Heart, Trash2, MapPin, Compass, ShoppingBag } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
// TASK 8 / F3-B (D8-A P-STATE-2 + §13 „wishlist weak, no link"): prazno
// stanje priljubljenih dobi družinsko EmptyState z NASLEDNJIM DEJANJEM
// (CTA v tržnico) — prej samo besedilo brez povezave.
import { EmptyState } from "@/components/states/empty-state";
// TASK 8 / D8-D (§3.3): MOST priljubljene → "Moja pot" (D8-A §9.7 —
// wishlist prej ni imel nobene poti v načrt).
import { AddToTripButton } from "@/components/add-to-trip-button";
import type { MyTripInput } from "@/lib/my-trip";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/marketplace-types";
// TASK 8 / F4-A: localePrefix — CTA praznega stanja dobi /en prefix ročno
// (družinska EmptyState riše href prek next/link, ne i18n Link — vrednost
// zato pripnemo tukaj, da EN uporabnik ne izgubi jezika ob kliku).
import { localePrefix } from "@/i18n/routing";
import {
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  subscribeWishlist,
  openFromWishlist,
  type WishlistEntry,
  type WishlistInput,
} from "@/lib/wishlist-storage";

/**
 * Wishlist UI (FW2-B): srček + stranski panel "Priljubljene".
 *
 * Kartica modala in navigacija nima skupnega starša s seznamom → stanje je
 * v localStorage (lib/wishlist-storage), komponente pa se sinhronizirajo
 * prek subscribeWishlist dogodkov (ista zavihek + cross-tab).
 */

/**
 * Notranji hook: seznam priljubljenih, odporen na hydration mismatch
 * (SSR → prazno; prvi klientski render → prazno; šele effect prebere
 * localStorage — isti vzorec kot useCart v navigaciji). Odjave/prijave tečejo
 * prek subscribeWishlist dogodkov (ista zavihek + cross-tab).
 */
function useWishlist(): { entries: WishlistEntry[]; ids: Set<string> } {
  const [entries, setEntries] = useState<WishlistEntry[]>([]);

  useEffect(() => {
    const sync = () => setEntries(getWishlist());
    sync(); // začetno branje — samo na klientu (SSR effectov ni)
    return subscribeWishlist(sync);
  }, []);

  const ids = useMemo(() => new Set(entries.map((e) => e.id)), [entries]);
  return { entries, ids };
}

/**
 * WishlistHeartButton — srček za shranjevanje izkušnje/izdelka.
 *
 * Uporaba: prekrivna na sliki kartice/modala. onClick ustavi propagacijo,
 * da ne sproži starševskih klikov (odpiranje modala / lightbox).
 * Polnjeno stanje = terakota poudarek (slovenske strešnice), ne primary
 * zelena — srček naj ne tekuje s primarnimi CTA gumbi.
 */
export function WishlistHeartButton({
  entry,
  variant = "card",
  className,
}: {
  entry: WishlistInput;
  /** "card" — slika na kartici tržnice; "modal" — hero slika v modalu (levo od X). */
  variant?: "card" | "modal";
  className?: string;
}) {
  const { ids } = useWishlist();
  const saved = ids.has(entry.id);
  // TASK 8 / F4-A: jezik za L-pattern aria/naslov srčka (SL privzeto) —
  // srček delijo kartice tržnice IN modali (isti dvojezični vir).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  const toggle = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (saved) {
      removeFromWishlist(entry.id);
    } else {
      addToWishlist(entry);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={saved}
      aria-label={
        saved
          ? `${WL.heartRemoveVerb[lang]} ${entry.name} ${WL.heartRemoveSuffix[lang]}`
          : `${WL.heartSaveVerb[lang]} ${entry.name} ${WL.heartSaveSuffix[lang]}`
      }
      title={saved ? WL.heartRemoveTitle[lang] : WL.heartSaveTitle[lang]}
      className={cn(
        // z-[2] nad prosojnim "klik za galerijo" ulovačem v modalih
        "z-[2] flex size-11 items-center justify-center rounded-full bg-background/85 text-foreground shadow-sm backdrop-blur-sm transition-all hover:scale-105 hover:bg-background focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none active:scale-95",
        variant === "card" && "absolute right-3 top-3",
        variant === "modal" && "absolute right-16 top-4",
        className
      )}
    >
      <Heart
        className={cn(
          "size-5 transition-colors",
          saved
            ? "fill-orange-600 text-orange-600 dark:fill-orange-400 dark:text-orange-400"
            : "text-foreground/75"
        )}
        aria-hidden="true"
      />
    </button>
  );
}

/**
 * WishlistSheet — sprožilec v navigaciji (srček + števčna značka) in
 * stranski panel s shranjenimi vnosi. `scrolled` prilagodi barvo ikone
 * nad hero fotografijo (isti vzorec kot košarica).
 */

// TASK 8 / F3-B: CTA praznega stanja v L-pattern (SL/EN — predpriprava
// na F3-E; isti vzorec kot L v AddToTripButton).
// TASK 8 / F4-A (issue #8 Phase 4 — EN razširitev): WL razširjen na VSE
// besedje lista in srčka (naslov, števci, aria oznake, vrstične značke,
// noga) — SL vrednosti ostajajo dobesedno enake.
const WL = {
  exploreCta: { sl: "Razišči tržnico", en: "Explore the marketplace" },
  emptyTitle: { sl: "Ni še nič shranjenega.", en: "Nothing saved yet." },
  emptyDescription: {
    sl: "Klikni srček na izkušnji ali izdelku.",
    en: "Tap the heart on an experience or product.",
  },
  title: { sl: "Priljubljene", en: "Favorites" },
  openTrigger: { sl: "Odpri priljubljene", en: "Open favorites" },
  countNone: { sl: "Nič shranjenega", en: "Nothing saved" },
  countOne: { sl: "1 shranjeno", en: "1 saved" },
  countFew: { sl: "shranjeni", en: "saved" },
  countMany: { sl: "shranjenih", en: "saved" },
  listAria: { sl: "Seznam priljubljenih", en: "Favorites list" },
  localNote: {
    sl: "Shranjeno lokalno v tvojem brskalniku — brez računa.",
    en: "Saved locally in your browser — no account needed.",
  },
  typeExperience: { sl: "Izkušnja", en: "Experience" },
  typeProduct: { sl: "Izdelek", en: "Product" },
  heartSaveVerb: { sl: "Shrani", en: "Save" },
  heartSaveSuffix: { sl: "v priljubljene", en: "to favorites" },
  heartSaveTitle: { sl: "Shrani v priljubljene", en: "Save to favorites" },
  heartRemoveVerb: { sl: "Odstrani", en: "Remove" },
  heartRemoveSuffix: { sl: "iz priljubljenih", en: "from favorites" },
  heartRemoveTitle: {
    sl: "Odstrani iz priljubljenih",
    en: "Remove from favorites",
  },
} as const;

export function WishlistSheet({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  const { entries } = useWishlist();
  const count = entries.length;
  // TASK 8 / F3-B: jezik za L-pattern CTA praznega stanja (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  // Klik na vnos: zapri panel → sproži dogodek, na katerega MarketplaceSection
  // preklopi tab, scrolla na #trznica in odpre pripadajoči modal.
  const handleOpenItem = (item: WishlistEntry) => {
    setOpen(false);
    openFromWishlist({ type: item.type, id: item.id, slug: item.slug });
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            count > 0
              ? `${WL.openTrigger[lang]} (${count} ${WL.countMany[lang]})`
              : WL.openTrigger[lang]
          }
          className={cn(
            "relative",
            scrolled
              ? "text-foreground"
              : "text-white hover:bg-white/10 hover:text-white"
          )}
        >
          <Heart className="size-5" aria-hidden="true" />
          {count > 0 ? (
            <span
              className={cn(
                "absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none",
                scrolled
                  ? "bg-primary text-primary-foreground"
                  : "bg-white text-primary shadow-sm"
              )}
              aria-hidden="true"
            >
              {count > 99 ? "99+" : count}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>

      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
      >
        {/* Header */}
        <SheetHeader className="flex flex-row items-center justify-between gap-2 border-b border-border/60 p-4">
          <div className="flex items-center gap-2">
            <span className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground shadow-sm">
              <Heart className="size-4" aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <SheetTitle className="text-base font-bold">
                {WL.title[lang]}
              </SheetTitle>
              <SheetDescription className="text-xs">
                {count === 0
                  ? WL.countNone[lang]
                  : count === 1
                    ? WL.countOne[lang]
                    : count < 5
                      ? `${count} ${WL.countFew[lang]}`
                      : `${count} ${WL.countMany[lang]}`}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Body */}
        {count === 0 ? (
          /* TASK 8 / F3-B (D8-A §13): prazno stanje priljubljenih dobi
              naslednje dejanje — CTA v tržnico (družinska EmptyState,
              ≥44px dotik). Klik hkrati ZAPRE panel, da ne ostane odprt nad
              novo stranjo. Prej: samo besedilo „Klikni srček …" brez
              povezave (šibko prazno stanje D8-A §13). */
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">
            <EmptyState
              icon={Heart}
              title={WL.emptyTitle[lang]}
              description={WL.emptyDescription[lang]}
              action={{
                label: WL.exploreCta[lang],
                // TASK 8 / F4-A: href dobi locale prefix (EN → /en/tržnica) —
                // EmptyState družina riše gumb prek next/link, zato vrednost
                // pripnemo tu (enak učinek kot i18n Link iz @/i18n/navigation).
                href: `${localePrefix(locale)}/trznica`,
                onClick: () => setOpen(false),
              }}
            />
          </div>
        ) : (
          <div className="scroll-area-custom flex-1 overflow-y-auto px-4 py-3">
            <ul className="flex flex-col gap-3" aria-label={WL.listAria[lang]}>
              {entries.map((item) => (
                <WishlistRow
                  key={item.id}
                  item={item}
                  onOpen={() => handleOpenItem(item)}
                  onRemove={() => removeFromWishlist(item.id)}
                />
              ))}
            </ul>
          </div>
        )}

        {/* Footer — iskrena opomba o zasebnosti (vse je lokalno) */}
        <div className="border-t border-border/60 px-4 py-3">
          <p className="text-center text-xs text-muted-foreground">
            {WL.localNote[lang]}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * TASK 8 / D8-D: preslikava wishlist vnosa → predmet zbirke "Moja pot".
 * Identiteta: kind (izkušnja/izdelek) + ID zapisa — enaka kot srček, zato
 * dedup deluje med tržnico in zbirko. href je ISKREN fallback /trznica
 * (openFromWishlist odpre modal prek dogodka — globke povezave ni).
 */
function wishlistTripItem(entry: WishlistEntry): MyTripInput {
  const subtitle = [
    entry.destination ?? undefined,
    entry.price !== null ? formatPrice(entry.price) : undefined,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    kind: entry.type,
    refId: entry.id,
    title: entry.name,
    subtitle: subtitle || undefined,
    href: "/trznica",
    image: entry.image ?? undefined,
    source: "priljubljene",
  };
}

/** Ena vrstica seznamu: slika, ime, destinacija, cena, odstrani. */
function WishlistRow({
  item,
  onOpen,
  onRemove,
}: {
  item: WishlistEntry;
  onOpen: () => void;
  onRemove: () => void;
}) {
  // TASK 8 / F4-A: jezik za L-pattern besedje vrstice (SL privzeto). Aria
  // predlogi sta dvojezični objekt na mestu (template literal z imenom).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const openAria = {
    sl: `Odpri ${item.name} v tržnici`,
    en: `Open ${item.name} in the marketplace`,
  };
  const removeAria = {
    sl: `Odstrani ${item.name} iz priljubljenih`,
    en: `Remove ${item.name} from favorites`,
  };

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border/60 bg-background p-2.5">
      {/* Glavni del vrstice = gumb: klik odpre vnos v tržnici */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={openAria[lang]}
        className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left transition-colors hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
      >
        <span className="relative flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
          {item.image ? (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              className="size-full object-cover"
            />
          ) : item.type === "experience" ? (
            <Compass className="size-6 text-muted-foreground" aria-hidden="true" />
          ) : (
            <ShoppingBag className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <Badge variant="secondary" className="shrink-0 gap-1 text-[10px]">
              {item.type === "experience" ? (
                <Compass className="size-2.5" aria-hidden="true" />
              ) : (
                <ShoppingBag className="size-2.5" aria-hidden="true" />
              )}
              {item.type === "experience"
                ? WL.typeExperience[lang]
                : WL.typeProduct[lang]}
            </Badge>
          </span>
          <span className="mt-1 block truncate text-sm font-semibold text-foreground">
            {item.name}
          </span>
          {item.destination ? (
            <span className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">{item.destination}</span>
            </span>
          ) : null}
          <span className="mt-0.5 block text-xs font-medium tabular-nums text-foreground/80">
            {item.price !== null ? formatPrice(item.price) : "—"}
          </span>
        </span>
      </button>
      {/* TASK 8 / D8-D: kompaktstni kanonski dodaj na ≥sm (z besedilom) in
          ikonski na mobilnem (poln aria-label) — isti predmet, isti stanji:
          oba gumba sta nekontrolirana in se sinhronizirata prek zbirke
          (dai:my-trip-changed). "Odpri v tržnici" (glavni gumb) ostaja. */}
      <AddToTripButton
        variant="compact"
        className="hidden sm:inline-flex"
        item={wishlistTripItem(item)}
      />
      <AddToTripButton
        variant="icon"
        className="sm:hidden"
        item={wishlistTripItem(item)}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        aria-label={removeAria[lang]}
        className="size-11 shrink-0 text-muted-foreground transition-colors hover:text-destructive"
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
