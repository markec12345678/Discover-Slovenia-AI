"use client";

// ============================================================================
// TRAVEL SUPPLY MAP — PROVIDER PANEL (F1, 1.49.0 → ISSUE #12 F12-3)
// ============================================================================
// Registrirani ponudniki z JASNIMI statusi (LIVE/SEARCH/AFFILIATE/LOCAL —
// iz registra, nikoli iz komponente). Affiliate-only ponudniki se
// prikažejo KOT TAKŠNI: kartica z globoko povezavo (destinacija najbližja
// centru karte) — BREZ izmišljenega inventarja, brez lažnih markerjev.
//
// Lokalni viri (OSM/FSQ/STO) so VEDNO ločena skupina od komercialnih.
//
// ISSUE #12 (F12-3, §7): DEMOTION — panel je NAPREDNA površina (hierarhija
// §16 raven 7): sprožilec je SAMO IKONA (vzorec Google Maps „Layers“),
// dostopnost pa ostaja celovita (aria-label + title). Providerji, viri,
// atribucija in statusi OSTAJO dostopni — le niso več primarna navigacija.
// ============================================================================

import { useMemo } from "react";
import { useLocale } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Layers,
  Database,
  ExternalLink,
  Info,
  CircleDot,
} from "lucide-react";
import {
  PROVIDER_REGISTRY,
  localProviders,
  statusLabel,
  type ProviderRegistryEntry,
} from "@/lib/supply/registry";
import type { ProviderProduct } from "@/lib/supply/types";
import { ProductCard } from "./product-card";
import { cn } from "@/lib/utils";

const L = {
  // F12-3 (§7): ikonski sprožilec — isti niz za aria-label + title
  // (dostopnost nespremenjena, vizualna teža zmanjšana).
  triggerAria: { sl: "Ponudba in viri (napredno)", en: "Supply and sources (advanced)" },
  title: { sl: "Zemljevid ponudbe", en: "Supply map" },
  desc: {
    sl: "Lokalna ponudba (odprti podatki) in komercialni partnerji z jasnimi statusi virov.",
    en: "Local supply (open data) and commercial partners with clear source statuses.",
  },
  productsTitle: { sl: "Ponudba v pogledu", en: "Supply in view" },
  productsNone: {
    sl: "Približajte zemljevid ali vklopite kategorije.",
    en: "Zoom in or enable categories.",
  },
  productsLoading: { sl: "Nalagam…", en: "Loading…" },
  productsDegraded: {
    sl: "Nekateri viri trenutno niso dosegljavi — lokalna plast ostaja.",
    en: "Some sources are unreachable right now — the local layer remains.",
  },
  localGroup: { sl: "Lokalni viri (odprti podatki)", en: "Local sources (open data)" },
  commercialGroup: { sl: "Komercialni partnerji", en: "Commercial partners" },
  ownGroup: { sl: "Naša tržnica", en: "Our marketplace" },
  open: { sl: "Odpri pri partnerju", en: "Open at partner" },
  active: { sl: "aktiven sloj", en: "active layer" },
  notActive: { sl: "ni sloja", en: "no layer" },
  statusLegend: {
    sl: "Status pove, KAJ dejansko imamo: živi inventar, objavljene podatke, iskanje, samo povezavo partnerja ali lokalne odprte podatke. Affiliate povezava NI inventar.",
    en: "The status tells what we actually have: live inventory, published data, search, a partner link only, or local open data. An affiliate link is NOT inventory.",
  },
} as const;

interface ProviderPanelProps {
  lang: "sl" | "en";
  /** Produkti trenutnega viewporta (seznam — dostopnostna alternativa). */
  products: ProviderProduct[];
  loading: boolean;
  degraded: string[];
  /** Slug najbližje destinacije centru karte (affiliate dest param). */
  nearestDestSlug: string;
  /** Izbrani produkti (look "v načrtu"). */
  selectedIds: Set<string>;
  onOpenProduct: (p: ProviderProduct) => void;
  onAddProduct: (p: ProviderProduct) => void;
}

function statusBadgeClass(status: ProviderRegistryEntry["status"]): string {
  switch (status) {
    case "local":
      return "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "live":
      return "border-green-600/40 bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300";
    case "static":
      // Objavljeni statični inventar (KiwiTaxi CSV) — ločen od živega API-ja
      // in od „samo povezave“ (iskrenost: cene so realne, a ne živi citat).
      return "border-cyan-600/40 bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-300";
    case "search":
      return "border-teal-600/40 bg-teal-50 text-teal-800 dark:bg-teal-950/30 dark:text-teal-300";
    case "affiliate":
      return "border-amber-600/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300";
    case "planned":
      return "border-muted-foreground/30 bg-muted text-muted-foreground";
  }
}

export function ProviderPanel({
  lang,
  products,
  loading,
  degraded,
  nearestDestSlug,
  selectedIds,
  onOpenProduct,
  onAddProduct,
}: ProviderPanelProps) {
  const locale = useLocale();
  void locale; // (lang pride od starša — stabilnejše za memo)

  const locals = useMemo(() => localProviders(), []);
  const commercials = useMemo(
    () => PROVIDER_REGISTRY.filter((p) => p.group === "commercial"),
    []
  );
  const own = useMemo(() => PROVIDER_REGISTRY.filter((p) => p.group === "own"), []);

  const grouped = useMemo(() => {
    const map = new Map<string, ProviderProduct[]>();
    for (const p of products) {
      const arr = map.get(p.type) ?? [];
      arr.push(p);
      map.set(p.type, arr);
    }
    return map;
  }, [products]);

  return (
    <Sheet>
      <SheetTrigger asChild>
        {/* F12-3 (§7): SAMO IKONA (demotion iz primarne navigacije — vzorec
            Google Maps „Layers“ gumba). aria-label + title ohranjata
            dostopnost; velikost icon = enakovreden dotikalni cilj. */}
        <Button
          type="button"
          size="icon"
          variant="secondary"
          className="shadow-md"
          aria-label={L.triggerAria[lang]}
          title={L.triggerAria[lang]}
        >
          <Layers className="size-4" aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="scroll-area-custom w-full overflow-y-auto sm:max-w-md"
      >
        <SheetTitle className="flex items-center gap-2 text-base">
          <Layers className="size-4 text-primary" aria-hidden="true" />
          {L.title[lang]}
        </SheetTitle>
        <SheetDescription className="text-xs">{L.desc[lang]}</SheetDescription>

        <div className="mt-4 space-y-6">
          {/* Produkte v viewportu (dostopnostni seznam) */}
          <section aria-labelledby="supply-products-title">
            <h3
              id="supply-products-title"
              className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
            >
              <CircleDot className="size-3.5 text-primary" aria-hidden="true" />
              {L.productsTitle[lang]}
              <Badge variant="secondary" className="ml-1 text-[10px]">
                {products.length}
              </Badge>
            </h3>
            {degraded.length > 0 ? (
              <p className="mb-2 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2 text-[11px] text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden="true" />
                {L.productsDegraded[lang]}
              </p>
            ) : null}
            {loading ? (
              <p className="text-xs text-muted-foreground">{L.productsLoading[lang]}</p>
            ) : products.length === 0 ? (
              <p className="text-xs text-muted-foreground">{L.productsNone[lang]}</p>
            ) : (
              <div className="space-y-2">
                {products.slice(0, 60).map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    lang={lang}
                    selected={selectedIds.has(p.id)}
                    onOpen={onOpenProduct}
                    onAdd={onAddProduct}
                  />
                ))}
              </div>
            )}
          </section>

          {/* Lokalni viri */}
          <section aria-labelledby="supply-local-title">
            <h3
              id="supply-local-title"
              className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
            >
              <Database className="size-3.5 text-emerald-600" aria-hidden="true" />
              {L.localGroup[lang]}
            </h3>
            <div className="space-y-1.5">
              {locals.map((p) => (
                <ProviderRow key={p.slug} entry={p} lang={lang} />
              ))}
            </div>
          </section>

          {/* Lastna tržnica */}
          {own.map((p) => (
            <section key={p.slug} aria-labelledby="supply-own-title">
              <h3
                id="supply-own-title"
                className="mb-2 flex items-center gap-1.5 text-sm font-semibold"
              >
                <Database className="size-3.5 text-teal-600" aria-hidden="true" />
                {L.ownGroup[lang]}
              </h3>
              <ProviderRow entry={p} lang={lang} />
            </section>
          ))}

          {/* Komercialni partnerji */}
          <section aria-labelledby="supply-commercial-title">
            <h3
              id="supply-commercial-title"
              className="mb-1 flex items-center gap-1.5 text-sm font-semibold"
            >
              <ExternalLink className="size-3.5 text-amber-600" aria-hidden="true" />
              {L.commercialGroup[lang]}
            </h3>
            <p className="mb-2 text-[11px] leading-relaxed text-muted-foreground">
              {L.statusLegend[lang]}
            </p>
            <div className="space-y-1.5">
              {commercials.map((p) => (
                <ProviderRow
                  key={p.slug}
                  entry={p}
                  lang={lang}
                  affiliateHref={
                    p.goRoute
                      ? `/go/${p.goRoute}?dest=${encodeURIComponent(nearestDestSlug || "slovenija")}`
                      : undefined
                  }
                />
              ))}
            </div>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ProviderRow({
  entry,
  lang,
  affiliateHref,
}: {
  entry: ProviderRegistryEntry;
  lang: "sl" | "en";
  affiliateHref?: string;
}) {
  const status = statusLabel(entry.status)[lang];
  const label = entry.labels[lang];
  const note = entry.accessNote?.[lang];

  const inner = (
    <div
      className={cn(
        "flex items-start justify-between gap-2 rounded-lg border border-border bg-background p-2.5",
        affiliateHref && "transition-colors hover:bg-accent/40"
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <Badge
            variant="outline"
            className={cn("px-1.5 py-0 text-[10px]", statusBadgeClass(entry.status))}
          >
            {status}
          </Badge>
          {entry.active ? (
            <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
              {L.active[lang]}
            </Badge>
          ) : entry.group === "local" ? (
            <span className="text-[10px] text-muted-foreground">{L.notActive[lang]}</span>
          ) : null}
        </div>
        {note ? (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">{note}</p>
        ) : null}
      </div>
      {affiliateHref ? (
        <ExternalLink
          className="mt-1 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );

  if (affiliateHref) {
    return (
      <a
        href={affiliateHref}
        rel="sponsored noopener noreferrer"
        className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        aria-label={`${label} — ${L.open[lang]}`}
      >
        {inner}
      </a>
    );
  }
  return inner;
}

export default ProviderPanel;
