"use client";

// ============================================================================
// TRAVEL SUPPLY MAP — PRODUCT MODAL (F1, 1.49.0)
// ============================================================================
// Univerzalni modal za ProviderProduct (nadomesti PoiModal v map-view —
// Wikipedia/AI obogatitev za OSM produkte je PRENESENA iz poi-modal.tsx,
// dodana pa sta status vira (register) in dodajanje v pot — od TASK 8 / D8-D
// prek kanonskega AddToTripButton "Dodaj v mojo pot" (write-through).
//
// Iskrenost: cena/ocena/razpoložljivost se prikažejo SAMO kadar obstajajo
// (OSM nima cen — prikazan je vir); status LOCAL/AFFILIATE/LIVE/SEARCH
// prihaja iz registra, ne iz komponente.
// ============================================================================

import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import {
  MapPin,
  ExternalLink,
  Phone,
  Globe,
  Clock,
  Loader2,
  AlertCircle,
  Navigation,
  Sparkles,
  Star,
  Euro,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
// TASK 8 / D8-D (§3.3 write-through): kanonski "Dodaj v mojo pot" — en
// gumb, dve resnici (izbira za AI kontekst IN pripadnost h zbirki).
import { AddToTripButton } from "@/components/add-to-trip-button";
import { addMyTripItem, removeMyTripItem } from "@/lib/my-trip";
import { taxonomyOf } from "@/lib/supply/taxonomy";
import { supplyTripItem, supplyTripKind } from "@/lib/supply/my-trip-item";
import { getProvider, statusLabel } from "@/lib/supply/registry";
import { showsUnknownPriceChip } from "@/lib/supply/price-display";
import type { ProviderProduct } from "@/lib/supply/types";
import { addProductToSelection, removeSelectedProduct } from "@/lib/supply/selection";
import { isSafeHttpUrl, safeExternalHref } from "@/lib/external-url";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { useAppStore } from "@/lib/store";
import { cn } from "@/lib/utils";

const L = {
  srDesc: {
    sl: (name: string) =>
      `Podrobnosti produkta ${name} z zemljevida ponudbe: kategorija, vir, opis, kontakt in koordinate.`,
    en: (name: string) =>
      `Details for supply map product ${name}: category, source, description, contact and coordinates.`,
  },
  about: { sl: "O objektu", en: "About" },
  readMore: { sl: "Preberi več na Wikipediji", en: "Read more on Wikipedia" },
  aiTitle: { sl: "Opis", en: "Description" },
  aiGenerating: { sl: "Sestavljam opis…", en: "Building a description…" },
  unavailable: { sl: "Podatki trenutno niso na voljo.", en: "Data is currently unavailable." },
  contact: { sl: "Kontakt in informacije", en: "Contact & information" },
  phone: { sl: "Telefon", en: "Phone" },
  website: { sl: "Spletna stran", en: "Website" },
  hours: { sl: "Odprtje", en: "Opening hours" },
  cuisine: { sl: "Kuhinja", en: "Cuisine" },
  data: { sl: "Podatki:", en: "Data:" },
  descSource: { sl: "· opis:", en: "· description:" },
  price: { sl: "Cena", en: "Price" },
  // ISSUE #4 §6 (val 1): modal izreče resnico tudi, ko cene NI — vir, ki
  // cene ima, je ne poslal za ta produkt (ODPRITI viri brez koncepta cen
  // ostanejo brez sekcije — tišina je tam iskrena).
  priceUnknown: {
    sl: "Cena ni preverjena — vir ne pošilja cene za ta produkt. Preveri pri ponudniku pred nakupom.",
    en: "Price not verified — the source does not send a price for this product. Check with the provider before purchase.",
  },
  perPerson: { sl: "na osebo", en: "per person" },
  perNight: { sl: "na noč", en: "per night" },
  perDay: { sl: "na dan", en: "per day" },
  perVehicle: { sl: "na vozilo", en: "per vehicle" },
  perTransfer: { sl: "na prevoz", en: "per transfer" },
  total: { sl: "skupaj", en: "total" },
  fromPrice: { sl: "od", en: "from" },
  reviews: { sl: "ocen", en: "reviews" },
  availLiveOk: { sl: "Na voljo (živi vir)", en: "Available (live source)" },
  availLiveNo: { sl: "Ni na voljo (živi vir)", en: "Unavailable (live source)" },
  availUnknown: { sl: "Dostopnost neznana", en: "Availability unknown" },
  imageCredit: { sl: "Slika", en: "Image" },
  // TASK 8 / D8-D (issue #8 §52 — NAMERNA sprememba besedila): oznaka gumba
  // "Dodaj v moj načrt" je upokojena — kanonski AddToTripButton prinaša
  // svoje oznake ("Dodaj v mojo pot" / "V moji poti"). Detajlne oznake
  // mehanike (postanek/izbira/duplikat) spodaj ostajajo kot vrstica pod
  // gumbom — nič informacije ni izgubljeno.
  checkOffer: { sl: "Preveri ponudbo", en: "Check offer" },
  checkOfferAcc: {
    sl: "Preveri ponudbo in rezerviraj pri partnerju (odpre externo stran)",
    en: "Check the offer and book with the partner (opens an external site)",
  },
  added: { sl: "Dodano ✓", en: "Added ✓" },
  addedStop: { sl: "Dodano kot postanek ✓", en: "Added as a stop ✓" },
  addedSelection: { sl: "Dodano k izbiri (AI ga bo upošteval)", en: "Added to selection (AI will account for it)" },
  dup: { sl: "Že v načrtu/izbiri", en: "Already in plan/selection" },
  providerNote: { sl: "Stanje ponudbe", en: "Supply status" },
} as const;

interface ProductModalProps {
  product: ProviderProduct | null;
  onClose: () => void;
  /** Zunanji povratni klic ob dodajanju (toast v staršu). */
  onAdded?: (product: ProviderProduct, kind: "stop" | "selection" | "duplicate") => void;
}

interface PoiDetailResponse {
  wikipedia: { extract: string | null; image: string | null; url: string | null };
  source: string;
}

export function ProductModal({ product, onClose, onAdded }: ProductModalProps) {
  const lang = useLocale() === "en" ? "en" : "sl";
  const selectedProducts = useAppStore((s) => s.selectedProducts);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wikiExtract, setWikiExtract] = useState<string | null>(null);
  const [wikiImage, setWikiImage] = useState<string | null>(null);
  const [wikiUrl, setWikiUrl] = useState<string | null>(null);
  const [aiDescription, setAiDescription] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSource, setAiSource] = useState<"deterministic" | "cache">("deterministic");
  const [addedState, setAddedState] = useState<"stop" | "selection" | "duplicate" | null>(null);

  const isSelected =
    product != null &&
    selectedProducts.some(
      (p) => `${p.provider}:${p.providerProductId}` === product.id
    );

  // Reset ob zaprtju/novem produktu.
  useEffect(() => {
    setAddedState(null);
    setWikiExtract(null);
    setWikiImage(null);
    setWikiUrl(null);
    setError(null);
    setAiDescription(null);
    setLoading(false);
    if (!product) return;

    trackPlannerEvent("supply_product_viewed", {
      provider: product.provider,
      type: product.type,
      has_price: product.price != null ? 1 : 0,
      has_geo: product.lat != null ? 1 : 0,
    });

    // Wikipedia/AI obogatitev SAMO za lokalne (OSM) produkte — prenos
    // logike poi-modal.tsx na kanonični model (providerProductId "node-123").
    if (product.provider !== "osm") return;

    let cancelled = false;
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          osmId: String(product.providerProductId.split("-")[1] ?? ""),
          type: product.providerProductId.split("-")[0] ?? "node",
        });
        if (product.wikidata) params.set("wikidata", product.wikidata);
        if (product.wikipedia) params.set("wikipedia", product.wikipedia);

        const res = await fetch(
          `/api/pois/${encodeURIComponent(product.providerProductId)}?${params.toString()}`,
          { cache: "no-store" }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data: PoiDetailResponse = await res.json();
        if (cancelled) return;
        setWikiExtract(data.wikipedia?.extract ?? null);
        setWikiImage(data.wikipedia?.image ?? null);
        setWikiUrl(data.wikipedia?.url ?? null);

        if (!data.wikipedia?.extract) {
          void fetchAiDescription();
        } else {
          setAiDescription(null);
        }
      } catch {
        if (!cancelled) setError(L.unavailable[lang]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const fetchAiDescription = async () => {
      setAiLoading(true);
      try {
        // ISSUE #9 (ZERO-AI): opis je DETERMINISTIČEN — /api/pois/describe
        // ga sestavi iz strukturiranih polj (ime/kategorija/lokacija),
        // 0 AI klicev; source je iskreno "deterministic"/"cache".
        const res = await fetch("/api/pois/describe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: product.providerProductId,
            name: product.title,
            category: product.type,
            subcategory: product.subcategory ?? product.type,
            lat: product.lat,
            lng: product.lng,
            address: product.address,
          }),
        });
        if (!res.ok) throw new Error("napaka");
        const data = await res.json();
        if (cancelled) return;
        setAiDescription(data.description);
        setAiSource(data.source);
      } catch {
        // AI opis je "nice to have"
      } finally {
        if (!cancelled) setAiLoading(false);
      }
    };

    void fetchDetail();
    return () => {
      cancelled = true;
    };
  }, [product, lang]);

  if (!product) {
    return (
      <Dialog open={false} onOpenChange={() => undefined}>
        <DialogContent />
      </Dialog>
    );
  }

  const tax = taxonomyOf(product.type);
  const provider = getProvider(product.provider);
  const status = provider ? statusLabel(provider.status)[lang] : "";
  // AUDIT 42 (42-b/42-e RED): OSM tagi so javno ureljivi — http(s) meja na
  // SLIKI tudi na render plasti (adapter že validira; namerno OBA meji).
  // wikiImage pride iz Wikipedia REST API (zaupanja vreden https gostitelj).
  const safeImage =
    product.image && isSafeHttpUrl(product.image) ? product.image : null;
  const headerImage = safeImage ?? wikiImage ?? null;
  const wikiLink = wikiUrl ?? buildWikiLinkFromTag(product.wikipedia);
  // Click-XSS meja: http(s) ali "#" — rel=noopener NE nevtralizira javascript:
  const sourceHref = safeExternalHref(product.sourceUrl);

  // TASK 43 (naročnik §8): „Preveri ponudbo" → /go/[provider]?product=…
  // bookingUrl KONSTRUIRA naš adapter (nikoli surov provider URL) — toda
  // render plast je NEODVISNA meja: SAMO relativna pot, ki se začne z
  // „/go/", brez sheme/hosta/protokola-relativnih oblik. Vse ostalo →
  // brez gumba (rezervacija ostaja samo prek strežniške /go verige).
  const offerHref =
    product.bookingMode === "affiliate_redirect" &&
    product.bookingUrl &&
    /^\/go\/[a-z]+\?[^\s]*$/i.test(product.bookingUrl) &&
    !/[<>"'`\\]/.test(product.bookingUrl)
      ? product.bookingUrl
      : null;

  const handleAdd = () => {
    const result = addProductToSelection(product, { locale: lang });
    if (!result.added) {
      setAddedState("duplicate");
      onAdded?.(product, "duplicate");
      return;
    }
    const kind: "stop" | "selection" = result.insertedStop ? "stop" : "selection";
    setAddedState(kind);
    onAdded?.(product, kind);
  };

  // TASK 8 / D8-D (§3.3 write-through, D8-A §4.1 varianta 2): KONTROLIRANI
  // kanonski gumb — obstoječa mehanika (addProductToSelection: dedupe/limit/
  // postanek-ali-izbira + onAdded) ostaja IDENTIČNA; ob dodajanju se izdelek
  // hkrati registrira v zbirko "Moja pot", ob odstranitvi pa izbere z
  // removeSelectedProduct IN zbriše iz zbirke (zbirka ≠ razpored — a tu
  // pripadnost zrcali izbiro, ker je to ista enkratna odločitev uporabnika).
  const handleToggleTrip = (next: boolean) => {
    if (next) {
      handleAdd();
      addMyTripItem(supplyTripItem(product, lang, "zemljevid"));
      return;
    }
    removeSelectedProduct(product.provider, product.providerProductId);
    removeMyTripItem(
      supplyTripKind(product.type),
      product.id
    );
    setAddedState(null);
  };

  const priceUnit =
    product.price?.unit === "per_person"
      ? L.perPerson[lang]
      : product.price?.unit === "per_night"
        ? L.perNight[lang]
        : product.price?.unit === "per_day"
          ? L.perDay[lang]
          : product.price?.unit === "per_vehicle"
            ? L.perVehicle[lang]
            : product.price?.unit === "per_transfer"
              ? L.perTransfer[lang]
              : L.total[lang];

  const availabilityBadge =
    product.availability?.status === "live_available"
      ? { text: L.availLiveOk[lang], cls: "border-emerald-600/40 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300" }
      : product.availability?.status === "live_unavailable"
        ? { text: L.availLiveNo[lang], cls: "border-red-600/40 bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300" }
        : product.availability?.status === "unknown"
          ? { text: L.availUnknown[lang], cls: "border-amber-600/40 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300" }
          : null;

  return (
    <Dialog
      open={product !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        showCloseButton
        className="max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
        aria-describedby="supply-product-modal-desc"
      >
        <DialogTitle className="sr-only">{product.title}</DialogTitle>
        <DialogDescription id="supply-product-modal-desc" className="sr-only">
          {L.srDesc[lang](product.title)}
        </DialogDescription>

        <div className="scroll-area-custom max-h-[80vh] overflow-y-auto">
          {/* Header slika */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {headerImage ? (
              <img
                src={headerImage}
                alt={product.title}
                className="size-full object-cover"
                loading="lazy"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            ) : (
              <div
                className="flex size-full items-center justify-center text-6xl"
                style={{ backgroundColor: `${tax.color}1a` }}
                aria-hidden="true"
              >
                <span>{tax.icon}</span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
            {/* AUDIT 42, točka 12 — kredit/pravica slike nad sliko */}
            {headerImage && product.imageCredit ? (
              <span
                className="absolute right-2 top-2 rounded bg-black/55 px-1.5 py-0.5 text-[10px] text-white/90"
                aria-label={`${L.imageCredit[lang]}: ${product.imageCredit}`}
              >
                © {product.imageCredit}
              </span>
            ) : null}
            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <Badge className="text-white" style={{ backgroundColor: tax.color }}>
                  <span aria-hidden="true" className="mr-1">{tax.icon}</span>
                  {tax.label[lang]}
                </Badge>
                {provider ? (
                  <Badge variant="outline" className="border-white/40 bg-black/30 text-white">
                    {status}
                  </Badge>
                ) : null}
                {availabilityBadge ? (
                  <Badge variant="outline" className={cn("border-white/40 bg-black/30", availabilityBadge.cls)}>
                    {availabilityBadge.text}
                  </Badge>
                ) : null}
                {product.rating != null ? (
                  <Badge variant="outline" className="gap-1 border-white/40 bg-black/30 text-white">
                    <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden="true" />
                    {product.rating.toFixed(1)}
                    {product.reviewCount != null ? ` (${product.reviewCount})` : ""}
                  </Badge>
                ) : null}
              </div>
              <h2 className="text-2xl font-bold sm:text-3xl">{product.title}</h2>
              {product.subcategory ? (
                <p className="text-xs capitalize text-white/80">
                  {product.subcategory.replace(/_/g, " ")}
                </p>
              ) : null}
            </div>
          </div>

          <div className="space-y-5 p-5 sm:p-6">
            {/* Naslov */}
            {product.address ? (
              <div className="flex items-start gap-2 text-sm text-foreground/90">
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span>{product.address}</span>
              </div>
            ) : null}

            {/* Cena — SAMO kadar obstaja (iskrenost: OSM nima cen);
                ISSUE #4 §6: kadar je NE poznamo pri viru, ki cene ima,
                modal to IZREČE (prej: tiha odsotnost celot sekcije). */}
            {product.price ? (
              <div className="flex items-center justify-between rounded-lg border border-border bg-background p-3">
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {L.price[lang]}
                  </div>
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    {product.price.fromPrice ? (
                      <span className="text-xs text-muted-foreground">{L.fromPrice[lang]}</span>
                    ) : null}
                    <span className="text-xl font-bold text-foreground">
                      €{product.price.amount}
                    </span>
                    <span className="text-xs text-muted-foreground">{priceUnit}</span>
                  </div>
                  {/* Iskrenost cene (audit 42, točka 9): „od kdaj / od kod“ */}
                  {product.price.note ? (
                    <p className="mt-0.5 text-[10px] text-muted-foreground/80">
                      {product.price.note}
                    </p>
                  ) : null}
                </div>
                <Euro className="size-5 text-muted-foreground" aria-hidden="true" />
              </div>
            ) : showsUnknownPriceChip(product) ? (
              <div
                className="flex items-center justify-between rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950"
                role="note"
              >
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                  {L.priceUnknown[lang]}
                </p>
                <Euro className="size-5 shrink-0 text-amber-700 dark:text-amber-300" aria-hidden="true" />
              </div>
            ) : null}

            {/* Lastni opis iz vira */}
            {product.description ? (
              <p className="text-sm leading-relaxed text-foreground/90">
                {product.description}
              </p>
            ) : null}

            {/* Wikipedia opis (OSM) */}
            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            ) : error ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            ) : wikiExtract ? (
              <section>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{L.about[lang]}</h3>
                <p className="text-sm leading-relaxed text-foreground/90">{wikiExtract}</p>
                {wikiLink ? (
                  <a
                    href={wikiLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:text-primary/80"
                  >
                    {L.readMore[lang]}
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </section>
            ) : null}

            {/* Opis (deterministično — ISSUE #9: sestavljen iz
                strukturiranih polj, 0 AI) */}
            {!loading && !wikiExtract && (aiLoading || aiDescription) ? (
              <section>
                <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-foreground">
                  <MapPin className="size-3.5 text-primary" aria-hidden="true" />
                  {L.aiTitle[lang]}
                </h3>
                {aiLoading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                    {L.aiGenerating[lang]}
                  </div>
                ) : aiDescription ? (
                  <p className="text-sm leading-relaxed text-foreground/90">{aiDescription}</p>
                ) : null}
              </section>
            ) : null}

            {/* Kontakt (lokalni viri) */}
            {product.phone || product.sourceUrl || product.openingHours || product.cuisine ? (
              <section>
                <h3 className="mb-3 text-sm font-semibold text-foreground">{L.contact[lang]}</h3>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {product.phone ? (
                    <ContactItem icon={Phone} label={L.phone[lang]} value={product.phone} href={`tel:${product.phone.replace(/\s+/g, "")}`} />
                  ) : null}
                  {product.sourceUrl && sourceHref !== "#" ? (
                    <ContactItem
                      icon={Globe}
                      label={L.website[lang]}
                      value={prettyUrl(product.sourceUrl)}
                      href={sourceHref}
                      external
                    />
                  ) : null}
                  {product.openingHours ? (
                    <ContactItem icon={Clock} label={L.hours[lang]} value={product.openingHours} />
                  ) : null}
                  {product.cuisine ? (
                    <ContactItem icon={MapPin} label={L.cuisine[lang]} value={product.cuisine} />
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Koordinate */}
            {product.lat != null && product.lng != null ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Navigation className="size-3" aria-hidden="true" />
                <span className="tabular-nums">
                  {product.lat.toFixed(5)}, {product.lng.toFixed(5)}
                </span>
              </div>
            ) : null}

            {/* Akcija: Preveri ponudbo (komercialni produkti — TASK 43) +
                Dodaj v moj načrt */}
            {offerHref ? (
              <a
                href={offerHref}
                rel="sponsored noopener noreferrer"
                referrerPolicy="no-referrer"
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label={L.checkOfferAcc[lang]}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {L.checkOffer[lang]}
              </a>
            ) : null}
            {/* TASK 8 / D8-D (§3.3 write-through): KANONSKI "Dodaj v mojo
                pot" (prej "Dodaj v moj načrt") — kontrolirana izvedba:
                stanje = izbira (isSelected/addedState), klik pa poganja
                handleToggleTrip (izbira + zbirka hkrati). Podroben odziv
                mehanike (postanek/izbira/duplikat) ostaja kot vrstica pod
                gumbom — NIČ informacije ni izgubljeno. */}
            <AddToTripButton
              variant="full"
              className="w-full justify-center"
              added={addedState !== null || isSelected}
              onToggle={handleToggleTrip}
              item={supplyTripItem(product, lang, "zemljevid")}
            />
            {addedState ? (
              <p
                className="-mt-3 text-center text-xs text-muted-foreground"
                aria-live="polite"
              >
                {addedState === "stop"
                  ? L.addedStop[lang]
                  : addedState === "selection"
                    ? L.addedSelection[lang]
                    : L.dup[lang]}
              </p>
            ) : null}

            {/* Atribucija vira */}
            <div className="border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                {L.data[lang]}{" "}
                <a
                  href={
                    product.provider === "osm" && product.lat != null && product.lng != null
                      ? `https://www.openstreetmap.org/?mlat=${product.lat}&mlon=${product.lng}#map=16/${product.lat}/${product.lng}`
                      : sourceHref
                  }
                  target="_blank"
                  rel="noopener noreferrer"
                  referrerPolicy="no-referrer"
                  className="font-medium text-primary hover:text-primary/80"
                >
                  {product.license?.source ?? provider?.labels[lang] ?? product.provider}
                </a>
                {wikiLink ? (
                  <>
                    {" "}
                    {L.descSource[lang]}{" "}
                    <a
                      href={wikiLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-primary hover:text-primary/80"
                    >
                      Wikipedia
                    </a>
                  </>
                ) : null}
                {product.altSources && product.altSources.length > 0 ? (
                  <>
                    {" "}
                    · {product.altSources.join(", ")}
                  </>
                ) : null}
              </p>
              {provider?.accessNote ? (
                <p className="mt-1 text-[11px] text-muted-foreground/80">
                  {provider.accessNote[lang]}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ContactItem({
  icon: Icon,
  label,
  value,
  href,
  external,
}: {
  icon: typeof Phone;
  label: string;
  value: string;
  href?: string;
  external?: boolean;
}) {
  const content = (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-background p-3">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-0.5 break-words text-sm font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
  if (href) {
    return (
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noopener noreferrer" : undefined}
        className="block rounded-lg transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </a>
    );
  }
  return content;
}

function prettyUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function buildWikiLinkFromTag(tag?: string): string | null {
  if (!tag) return null;
  const [lang, title] = tag.split(":", 2);
  if (!lang || !title) return null;
  // AUDIT 42 (42-e F6): ista validacija jezika kot strežnik (2–3 male
  // črke) — sicer bi lahko zlonameren OSM tag zlagal poddomen.
  if (!/^[a-z]{2,3}$/.test(lang)) return null;
  return `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(title)}`;
}

export default ProductModal;
