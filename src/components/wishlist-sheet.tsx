"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Heart,
  Trash2,
  MapPin,
  Compass,
  ShoppingBag,
  Landmark,
  Mountain,
  Utensils,
  Flower2,
  Package,
  Route,
} from "lucide-react";

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
// W3 (Issue #15): dodajanje razdelka v zbirko + handoff zastavica (isti
// kanon kot ToastAction "Načrtuj" v my-trip-view).
import { addMyTripItem, setMyTripHandoff } from "@/lib/my-trip";
// W3: isti prefill dogodek kot trak načrtovalnika in most v my-trip-view
// (neškodljiv, če poslušalca ni — slovar enot, ne dve kopiji).
import {
  MY_TRIP_PREFILL_EVENT,
  type MyTripPrefillDetail,
} from "@/components/planner-my-trip-strip";
// W3 (Issue #15): razdelki po temi in destinaciji (kolekcije "someday").
import {
  groupWishlistByTheme,
  groupWishlistEntriesByDestination,
  WISHLIST_THEME_LABELS,
  WISHLIST_OTHER_LABEL,
  type WishlistLang,
  type WishlistTheme,
} from "@/lib/wishlist-collections";
// W3: telemetrija uporabe zbirk (isti kanon kot planner dogodki).
import { trackPlannerEvent } from "@/lib/planner-analytics";
// W3: povratna obvestila mostu v "Moja pot" (družinski Toaster v layoutu).
import { useToast } from "@/hooks/use-toast";
// W3: locale-zavedajoča navigacija (it/de/de nacrtuj pote ostanejo v jeziku).
import { useRouter } from "@/i18n/navigation";
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
 *
 * W3 (Issue #15, val V1): "KOLEKCIJE PRILJUBLJENIH" — list dobi razdelke
 * po destinaciji in po temi (Mindtripov vzorec "someday collections", po
 * našem kanonu). Varovala:
 *   - ploščen seznam ostane kot pogled "Vse" (privzeto ob vsakem odpiranju);
 *   - dodajanje prek obstoječega srčka se NE spremeni (kategorija se zapiše
 *     ob shranjevanju — dodatno polje);
 *   - most v načrt = OBSTOJEČI kanon (addMyTripItem + setMyTripHandoff +
 *     dai:my-trip-prefill) — NO silent AI, NO razporejanje;
 *   - share kolekcije teče prek obstoječega share kanona poti (zbirka ≠
 *     razporejevalnik — izmišljanje datumov/ur bi bilo lažno razporejanje).
 */

/** Pogled lista: ploščen (privzeto) / razdelki po destinaciji / po temi. */
type WishlistView = "all" | "destination" | "theme";

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
  // W3: 4-jezično (it/de površine destination strani imajo isto navigacijo).
  const locale = useLocale();
  const lang = pickWishlistLang(locale);

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

/** W3: izbor jezika WL slovarja — 4 javni jeziki, neznani → SL (default). */
function pickWishlistLang(locale: string): WishlistLang {
  return locale === "en" || locale === "it" || locale === "de" ? locale : "sl";
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
// W3 (Issue #15): WL razširjen na 4 javne jezike (SL primarna resnica,
// EN referenčni par, IT/DE po kanonu mtNotice — odkrit strojni prevod) —
// list je dosegljiv iz navigacije na VSEH poteh, vključno z it/de.
// Nove ključe W3: preklop pogledov, razdelki, gumb "Načrtuj", povratna
// obvestila mostu v "Moja pot".
const WL = {
  exploreCta: { sl: "Razišči tržnico", en: "Explore the marketplace", it: "Esplora il mercato", de: "Marktplatz entdecken" },
  emptyTitle: { sl: "Ni še nič shranjenega.", en: "Nothing saved yet.", it: "Ancora nulla di salvato.", de: "Noch nichts gespeichert." },
  emptyDescription: {
    sl: "Klikni srček na izkušnji ali izdelku.",
    en: "Tap the heart on an experience or product.",
    it: "Tocca il cuore su un'esperienza o un prodotto.",
    de: "Tippe auf das Herz bei einem Erlebnis oder Produkt.",
  },
  title: { sl: "Priljubljene", en: "Favorites", it: "Preferiti", de: "Favoriten" },
  openTrigger: { sl: "Odpri priljubljene", en: "Open favorites", it: "Apri i preferiti", de: "Favoriten öffnen" },
  countNone: { sl: "Nič shranjenega", en: "Nothing saved", it: "Niente di salvato", de: "Nichts gespeichert" },
  countOne: { sl: "1 shranjeno", en: "1 saved", it: "1 salvato", de: "1 gespeichert" },
  countFew: { sl: "shranjeni", en: "saved", it: "salvati", de: "gespeichert" },
  countMany: { sl: "shranjenih", en: "saved", it: "salvati", de: "gespeichert" },
  listAria: { sl: "Seznam priljubljenih", en: "Favorites list", it: "Elenco dei preferiti", de: "Favoritenliste" },
  localNote: {
    sl: "Shranjeno lokalno v tvojem brskalniku — brez računa.",
    en: "Saved locally in your browser — no account needed.",
    it: "Salvato localmente nel tuo browser — senza account.",
    de: "Lokal in deinem Browser gespeichert — ohne Konto.",
  },
  typeExperience: { sl: "Izkušnja", en: "Experience", it: "Esperienza", de: "Erlebnis" },
  typeProduct: { sl: "Izdelek", en: "Product", it: "Prodotto", de: "Produkt" },
  heartSaveVerb: { sl: "Shrani", en: "Save", it: "Salva", de: "Speichern" },
  heartSaveSuffix: { sl: "v priljubljene", en: "to favorites", it: "nei preferiti", de: "zu den Favoriten" },
  heartSaveTitle: { sl: "Shrani v priljubljene", en: "Save to favorites", it: "Salva nei preferiti", de: "Zu Favoriten speichern" },
  heartRemoveVerb: { sl: "Odstrani", en: "Remove", it: "Rimuovi", de: "Entfernen" },
  heartRemoveSuffix: { sl: "iz priljubljenih", en: "from favorites", it: "dai preferiti", de: "aus den Favoriten" },
  heartRemoveTitle: {
    sl: "Odstrani iz priljubljenih",
    en: "Remove from favorites",
    it: "Rimuovi dai preferiti",
    de: "Aus Favoriten entfernen",
  },
  // W3: preklop pogledov (ploščen seznam ostaja kot "Vse" — varovalo)
  viewAll: { sl: "Vse", en: "All", it: "Tutto", de: "Alle" },
  viewDestination: { sl: "Destinacije", en: "Destinations", it: "Destinazioni", de: "Reiseziele" },
  viewTheme: { sl: "Teme", en: "Themes", it: "Temi", de: "Themen" },
  viewsAria: {
    sl: "Način prikaza priljubljenih",
    en: "Favorites display mode",
    it: "Modalità di visualizzazione dei preferiti",
    de: "Anzeigemodus der Favoriten",
  },
  // W3: razdelki + most v načrt (isti handoff kanon kot my-trip-view)
  planSection: { sl: "Načrtuj", en: "Plan", it: "Pianifica", de: "Planen" },
  plannedTitle: {
    sl: "Dodano v »Moja pot«",
    en: "Added to “My trip”",
    it: "Aggiunto a “Il mio viaggio”",
    de: "Zu „Meine Reise“ hinzugefügt",
  },
  plannedNote: {
    sl: "Vnosi razdelka so v zbirki — nadaljuj na načrtovanje.",
    en: "The section items are in the collection — continue planning.",
    it: "Gli elementi della sezione sono nella raccolta — continua la pianificazione.",
    de: "Die Einträge der Sammlung sind gespeichert — plane weiter.",
  },
} as const;

/** W3: ikone tem (semenske teme intent čipov) + razdelki destinacij. */
const THEME_ICON: Record<WishlistTheme, typeof Utensils> = {
  hrana: Utensils,
  kultura: Landmark,
  aktivnosti: Mountain,
  mir: Flower2,
  drugo: Package,
};

export function WishlistSheet({ scrolled }: { scrolled: boolean }) {
  const [open, setOpen] = useState(false);
  // W3: pogled razdelkov — privzeto "Vse" (varovalo: ploščen seznam ostane;
  // ob vsakem odpiranju lista se pogled resetira na "Vse").
  const [view, setView] = useState<WishlistView>("all");
  const { entries } = useWishlist();
  const count = entries.length;
  // TASK 8 / F3-B: jezik za L-pattern CTA praznega stanja (SL privzeto).
  const locale = useLocale();
  const lang = pickWishlistLang(locale);
  const router = useRouter();
  // W3: povratna obvestila mostu v "Moja pot" (družinski Toaster v layoutu).
  const { toast } = useToast();

  // W3: razdelki (memo — čiste funkcije iz lib/wishlist-collections).
  const destinationSections = useMemo(
    () => groupWishlistEntriesByDestination(entries, WISHLIST_OTHER_LABEL[lang]),
    [entries, lang]
  );
  const themeSections = useMemo(() => groupWishlistByTheme(entries), [entries]);

  // Klik na vnos: zapri panel → sproži dogodek, na katerega MarketplaceSection
  // preklopi tab, scrolla na #trznica in odpre pripadajoči modal.
  const handleOpenItem = (item: WishlistEntry) => {
    setOpen(false);
    openFromWishlist({ type: item.type, id: item.id, slug: item.slug });
  };

  // W3: preklop pogleda + telemetrija uporabe zbirk (samo za ne-"Vse",
  // ker je "Vse" obstoječa izkušnja brez dogodka).
  const handleView = (next: WishlistView) => {
    setView(next);
    if (next !== "all") {
      trackPlannerEvent("wishlist_collection_used", {
        view: next,
        groups:
          next === "destination" ? destinationSections.length : themeSections.length,
        items: count,
      });
    }
  };

  // W3: gumb "Načrtuj" na razdelku — OBSTOJEČI handoff kanon (enak kot
  // ToastAction "Načrtuj" v my-trip-view): (1) vsak vnos razdelka → zbirka
  // "Moja pot" prek wishlistTripItem (IDENTITETA kind:refId — dedup čez
  // površine); (2) razrešena destinacija → dai:my-trip-prefill dogodek
  // (neškodljiv brez poslušalca; poslušalca na /nacrtujTakoj prefilla);
  // (3) setMyTripHandoff + navigacija — trak "Iz moje poti" prevzame ob
  // mountu, uporabnik klikne "Uporabi v načrtu" SAM (NO silent AI).
  const handlePlanSection = (
    sectionEntries: WishlistEntry[],
    meta: { view: "destination" | "theme"; destinationId?: string }
  ) => {
    for (const entry of sectionEntries) {
      addMyTripItem(wishlistTripItem(entry));
    }
    if (meta.destinationId) {
      window.dispatchEvent(
        new CustomEvent<MyTripPrefillDetail>(MY_TRIP_PREFILL_EVENT, {
          detail: { destinations: [meta.destinationId] },
        })
      );
    }
    setMyTripHandoff();
    trackPlannerEvent("wishlist_collection_planned", {
      view: meta.view,
      items: sectionEntries.length,
      has_destination: meta.destinationId ? 1 : 0,
    });
    // Iskreno povratno obvestilo: vnosi so pristali v ZBIRKI (razpored
    // ostane uporabnikov — trak "Iz moje poti" na /nacrtuj prevzame ob
    // mountu, "Uporabi v načrtu" klikne uporabnik sam).
    toast({
      title: WL.plannedTitle[lang],
      description: WL.plannedNote[lang],
    });
    setOpen(false);
    router.push("/nacrtuj");
  };

  return (
    <Sheet
      open={open}
      // W3: reset pogleda na "Vse" ob vsakem odpiranju (varovalo specifikacije:
      // ploščen seznam ostaja privzeta izkušnja, razdelki so izbira) — v
      // onOpenChange (VSI odpiralni potoki: sprožilec, programski, ESC),
      // ne v efektu (react-hooks/set-state-in-effect disciplina).
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setView("all");
      }}
    >
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
          <>
            {/* W3: preklop pogledov — SAMO od 2 vnosov (1 vnos nima kaj
                razdelkovati); ploščen seznam ostaja kot "Vse" (privzeto). */}
            {count >= 2 ? (
              <div
                role="tablist"
                aria-label={WL.viewsAria[lang]}
                className="border-b border-border/60 px-4 py-2"
              >
                <div className="flex gap-1 rounded-lg bg-muted p-1">
                  {(
                    [
                      ["all", WL.viewAll[lang]],
                      ["destination", WL.viewDestination[lang]],
                      ["theme", WL.viewTheme[lang]],
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      key={value}
                      type="button"
                      role="tab"
                      aria-selected={view === value}
                      onClick={() => handleView(value)}
                      className={cn(
                        "min-h-11 flex-1 truncate rounded-md px-2 text-xs font-semibold transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none",
                        view === value
                          ? "bg-background text-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="scroll-area-custom flex-1 overflow-y-auto px-4 py-3">
              {view === "all" ? (
                /* PLOŠČEN SEZNAM (varovalo W3: nedotaknjena izkušnja) */
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
              ) : view === "destination" ? (
                /* W3: RAZDELKI PO DESTINACIJI — isto resolucijsko pravilo
                    kot most v my-trip-view (razrešeno → kanonično ime +
                    "Načrtuj"; nerazrešeno besedilo ostane iskreno vidno). */
                <div className="flex flex-col gap-5">
                  {destinationSections.map((section) => (
                    <WishlistSection
                      key={
                        section.destinationId ??
                        `raw:${section.destinationName.toLowerCase()}`
                      }
                      icon={MapPin}
                      title={section.destinationName}
                      entries={section.entries}
                      lang={lang}
                      onOpen={handleOpenItem}
                      onPlan={() =>
                        handlePlanSection(section.entries, {
                          view: "destination",
                          destinationId: section.destinationId,
                        })
                      }
                    />
                  ))}
                </div>
              ) : (
                /* W3: RAZDELKI PO TEMI — semenske teme intent čipov;
                    vnosi brez kategorije (starejši) → iskreno "Drugo". */
                <div className="flex flex-col gap-5">
                  {themeSections.map((section) => (
                    <WishlistSection
                      key={section.theme}
                      icon={THEME_ICON[section.theme]}
                      title={WISHLIST_THEME_LABELS[section.theme][lang]}
                      entries={section.entries}
                      lang={lang}
                      onOpen={handleOpenItem}
                      onPlan={() =>
                        handlePlanSection(section.entries, { view: "theme" })
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </>
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
 * (openFromWishlist odpre modal prek dogodka — globoke povezave ni).
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

/**
 * W3: en razdelek zbirke — glava (ikona + ime + števec + gumb "Načrtuj")
 * in vrstice (ista WishlistRow kot ploščen seznam — ZERO FEATURE LOSS:
 * odpiranje, odstranjevanje in "V pot" delujejo identično).
 */
function WishlistSection({
  icon: Icon,
  title,
  entries,
  lang,
  onOpen,
  onPlan,
}: {
  icon: typeof MapPin;
  title: string;
  entries: WishlistEntry[];
  lang: WishlistLang;
  onOpen: (item: WishlistEntry) => void;
  onPlan: () => void;
}) {
  const planAria = `${WL.planSection[lang]} — ${title} (${entries.length})`;
  return (
    <section aria-label={`${title} (${entries.length})`}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-foreground">
          <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate">{title}</span>
          <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-primary">
            {entries.length}
          </span>
        </h3>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onPlan}
          aria-label={planAria}
          className="h-9 shrink-0 gap-1.5 rounded-full px-3 text-xs font-semibold"
        >
          <Route className="size-3.5" aria-hidden="true" />
          {WL.planSection[lang]}
        </Button>
      </div>
      <ul className="flex flex-col gap-3">
        {entries.map((item) => (
          <WishlistRow
            key={item.id}
            item={item}
            onOpen={() => onOpen(item)}
            onRemove={() => removeFromWishlist(item.id)}
          />
        ))}
      </ul>
    </section>
  );
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
  // predlogi so večjezični objekt na mestu (template literal z imenom).
  // W3: 4-jezično (isti kanon kot WL).
  const locale = useLocale();
  const lang = pickWishlistLang(locale);
  const openAria = {
    sl: `Odpri ${item.name} v tržnici`,
    en: `Open ${item.name} in the marketplace`,
    it: `Apri ${item.name} nel mercato`,
    de: `${item.name} im Marktplatz öffnen`,
  };
  const removeAria = {
    sl: `Odstrani ${item.name} iz priljubljenih`,
    en: `Remove ${item.name} from favorites`,
    it: `Rimuovi ${item.name} dai preferiti`,
    de: `${item.name} aus den Favoriten entfernen`,
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
