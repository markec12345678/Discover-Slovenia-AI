"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Star,
  MapPin,
  Clock,
  Calendar,
  ShoppingBag,
  Filter,
  X,
  Leaf,
  HandHeart,
  Truck,
  Globe,
  Baby,
  Accessibility,
  Compass,
  Sparkles,
  Store,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
// TASK 8 / F3-B (D8-A P-STATE-2): družina stanj — LoadingState (hardcoded
// „Nalagam izdelke/izkušnje..." zamenjan z L-pattern SL/EN), EmptyState
// (lokalni klon poenoten) in ErrorState (lokalna črtkasta škatla →
// destructive Alert slovnica). Product/ExperienceSkeleton mreži ostanejo
// (dobro hoteno obnašanje — NE regresiramo zlatih standardov).
import { LoadingState } from "@/components/states/loading-state";
import { EmptyState } from "@/components/states/empty-state";
import { ErrorState } from "@/components/states/error-state";
import { useLocale } from "next-intl";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { useCart } from "@/lib/cart-store";
import { trackFunnel } from "@/lib/funnel";
import { useToast } from "@/hooks/use-toast";

import {
  PRODUCT_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_ICONS,
  formatPrice,
  formatDuration,
  type Product,
  type ProductCategory,
  type Experience,
  type ExperienceCategory,
} from "@/lib/marketplace-types";
import { ProductModal } from "@/components/sections/product-modal";
import { ExperienceModal } from "@/components/sections/experience-modal";
import { WishlistHeartButton } from "@/components/wishlist-sheet";
import {
  WISHLIST_OPEN_EVENT,
  WISHLIST_PENDING_KEY,
  type WishlistOpenDetail,
} from "@/lib/wishlist-storage";


const ALL_VALUE = "all";

// F4-E §38 iskrena meja — NAMERNO IZVEN L slovarja: to je EN-only vrstica
// (SL uporabnik je nikoli ne vidi — SL jezik kataloga je zanj samoumeven),
// zato v paritetnem SL/EN slovarju nima kaj iskati. Katalog je PODATEK
// ponudnikov (DB brez EN stolpcev) — okvir, cene in rezervacija so EN,
// opisi ostanejo SL. Ista resnica-slovnica kot NO_LIVE_DATA.
const DATA_LANGUAGE_NOTE_EN =
  "Offer names and descriptions come from local providers in Slovenian — prices, filters and booking work in English.";

// TASK 8 / F3-B: oznake nalaganja v L-pattern (SL/EN — D8-A §13 „Nalagam…"
// uhodi so trdi predpogoj za F3-E EN razširitev). Števec je v F4-A prav
// tako dvojezičen (spodaj L.counter).
// TASK 8 / F4-A (issue #8 Phase 4 — EN razširitev SL-only površin):
// SLOVESNOST ODPRTA — celotno jedro tržnice (razvrščanje, filtri, števci,
// napake, toasti, prazna stanja, kartice, CTA gumbi) je zdaj dvojezično po
// istem L vzorcu kot journey-planner / go-mode (zlati standard). SL vrednosti
// ostajajo DOBESEDNO enake (ničelna izguba); EN plat je iskren prevod —
// §38 resnica cen/ponudbe se ohrani („od ~X €" → „from ~X €", neznano
// ostane neznano). Modali (4-b) imajo svoje slovarje v svojih datotekah.
const L = {
  loadingProducts: { sl: "Nalagam izdelke …", en: "Loading products …" },
  loadingExperiences: { sl: "Nalagam izkušnje …", en: "Loading experiences …" },
  header: {
    badge: { sl: "Tržnica", en: "Marketplace" },
    title: { sl: "Tržnica Slovenije", en: "Slovenia's marketplace" },
    subtitle: {
      sl: "Lokalni izdelki in izkušnje — direktno od kmetov, vinogradnikov in vodnikov",
      en: "Local products and experiences — straight from farmers, winemakers and guides",
    },
  },
  tabs: {
    products: { sl: "Izdelki", en: "Products" },
    experiences: { sl: "Izkušnje", en: "Experiences" },
  },
  filters: {
    title: { sl: "Filtri", en: "Filters" },
    clear: { sl: "Počisti filtre", en: "Clear filters" },
    allCategories: { sl: "Vse kategorije", en: "All categories" },
    sortBy: { sl: "Razvrsti po", en: "Sort by" },
    filterProductsAria: {
      sl: "Filtriraj izdelke po kategoriji",
      en: "Filter products by category",
    },
    sortProductsAria: { sl: "Razvrsti izdelke", en: "Sort products" },
    filterExperiencesAria: {
      sl: "Filtriraj izkušnje po kategoriji",
      en: "Filter experiences by category",
    },
    sortExperiencesAria: { sl: "Razvrsti izkušnje", en: "Sort experiences" },
  },
  sort: {
    featured: { sl: "Izpostavljeni", en: "Featured" },
    priceAsc: { sl: "Cena naraščajoče", en: "Price: low to high" },
    priceDesc: { sl: "Cena padajoče", en: "Price: high to low" },
    rating: { sl: "Najvišja ocena", en: "Top rated" },
  },
  counter: {
    showing: { sl: "Prikazujem", en: "Showing" },
    productOne: { sl: "izdelek", en: "product" },
    productsFew: { sl: "izdelke", en: "products" },
    productsMany: { sl: "izdelkov", en: "products" },
    experienceOne: { sl: "izkušnjo", en: "experience" },
    experiencesFew: { sl: "izkušnje", en: "experiences" },
    experiencesMany: { sl: "izkušenj", en: "experiences" },
  },
  error: {
    productsThrow: {
      sl: "Napaka pri pridobivanju izdelkov",
      en: "Error fetching products",
    },
    experiencesThrow: {
      sl: "Napaka pri pridobivanju izkušenj",
      en: "Error fetching experiences",
    },
    products: {
      sl: "Ne morem naložiti izdelkov. Poskusite kasneje.",
      en: "Couldn't load products. Please try again later.",
    },
    experiences: {
      sl: "Ne morem naložiti izkušenj. Poskusite kasneje.",
      en: "Couldn't load experiences. Please try again later.",
    },
  },
  toast: {
    gone: { sl: "Ni več na voljo", en: "No longer available" },
    experienceRemoved: {
      sl: "Ta izkušnja je bila umaknjena s tržnice.",
      en: "This experience has been removed from the marketplace.",
    },
    productRemoved: {
      sl: "Ta izdelek je bil umaknjen s tržnice.",
      en: "This product has been removed from the marketplace.",
    },
  },
  empty: {
    noResults: { sl: "Ni najdenih rezultatov.", en: "No results found." },
    noLive: {
      sl: "Ni še živih ponudb (NO_LIVE_DATA).",
      en: "No live offers yet (NO_LIVE_DATA).",
    },
    filtersHint: {
      sl: "Poskusite spremeniti filtre ali jih počistiti.",
      en: "Try changing the filters or clearing them.",
    },
    noLiveProducts: {
      sl: "Tržnica nima še objavljenih izdelkov partnerjev. Ko jih bodo dodali, se bodo pojavili tukaj — prazna tržnica ni napaka, je iskreno stanje ponudbe.",
      en: "No partner products have been published on the marketplace yet. As soon as they add them, they will appear here — an empty marketplace is not an error, it is the honest state of the offer.",
    },
    noLiveExperiences: {
      sl: "Tržnica nima še objavljenih izkušenj partnerjev. Ko jih bodo dodali, se bodo pojavili tukaj — prazna tržnica ni napaka, je iskreno stanje ponudbe.",
      en: "No partner experiences have been published on the marketplace yet. As soon as they add them, they will appear here — an empty marketplace is not an error, it is the honest state of the offer.",
    },
    clearProducts: {
      sl: "Počisti filtre (izdelkov)",
      en: "Clear filters (products)",
    },
    clearExperiences: {
      sl: "Počisti filtre (izkušenj)",
      en: "Clear filters (experiences)",
    },
  },
  join: {
    text: {
      sl: "Želite prodajati svoje izdelke ali izkušnje? Pridruži se tržnici.",
      en: "Want to sell your products or experiences? Join the marketplace.",
    },
    cta: { sl: "Pridruži se", en: "Join" },
  },
  card: {
    outOfStock: { sl: "Ni na zalogi", en: "Out of stock" },
    soldOutSuffix: {
      sl: "je trenutno razprodan.",
      en: "is currently sold out.",
    },
    addedToCart: { sl: "Dodano v košarico", en: "Added to cart" },
  },
  badge: {
    organic: { sl: "Ekološko", en: "Organic" },
    handmade: { sl: "Ročno", en: "Handmade" },
    vegan: { sl: "Vegansko", en: "Vegan" },
    featured: { sl: "Izpostavljeno", en: "Featured" },
    freeShipping: { sl: "Brezplačna dostava", en: "Free shipping" },
    euShipping: { sl: "Dostava EU", en: "EU shipping" },
    familyFriendly: { sl: "Družinsko", en: "Family-friendly" },
    accessible: { sl: "Dostopno", en: "Accessible" },
  },
  cta: {
    addToCart: { sl: "V košarico", en: "Add to cart" },
    soldOut: { sl: "Razprodano", en: "Sold out" },
    details: { sl: "Podrobnosti", en: "Details" },
    book: { sl: "Rezerviraj", en: "Book" },
    atProvider: { sl: "Pri ponudniku", en: "Provider's site" },
    noProviderSite: {
      sl: "Ponudnik nima spletne strani",
      en: "The provider has no website",
    },
  },
  price: {
    from: { sl: "od", en: "from" },
    perPerson: { sl: "/ osebo", en: "/ person" },
  },
} as const;

// TASK 8 / F4-A: dvojezične oznake kategorij — LOKALNE preslikave (L
// vzorec). SL vrednosti so identične PRODUCT/EXPERIENCE_CATEGORY_LABELS iz
// skupnega vira (marketplace-types.ts), EN plat je dodana tu, ker je skupni
// vir SOUPOREABLJEN z modali (agent 4-b dela vzporedno). Konsolidacija obeh
// plat v skupni vir je naloga main agenta po združitvi vala.
const PRODUCT_CATEGORY_LABELS_L: Record<
  ProductCategory,
  { sl: string; en: string }
> = {
  food: { sl: "Hrana", en: "Food" },
  wine: { sl: "Vino", en: "Wine" },
  honey: { sl: "Med", en: "Honey" },
  oil: { sl: "Olje", en: "Oil" },
  craft: { sl: "Obrt", en: "Craft" },
  souvenir: { sl: "Suvenir", en: "Souvenir" },
  other: { sl: "Drugo", en: "Other" },
};

const EXPERIENCE_CATEGORY_LABELS_L: Record<
  ExperienceCategory,
  { sl: string; en: string }
> = {
  tour: { sl: "Voden ogled", en: "Guided tour" },
  workshop: { sl: "Delavnica", en: "Workshop" },
  tasting: { sl: "Degustacija", en: "Tasting" },
  outdoor: { sl: "Narava", en: "Outdoors" },
  cultural: { sl: "Kultura", en: "Culture" },
  adventure: { sl: "Avantura", en: "Adventure" },
  wellness: { sl: "Wellness", en: "Wellness" },
};

// Možnosti za filter kategorije izdelkov (F4-A: oznaka se razreši po
// jeziku ob klicu — emoji ikona ostaja jezikovno nevtralna)
const productCategoryOptions = (lang: "sl" | "en") =>
  (Object.keys(PRODUCT_CATEGORY_LABELS_L) as ProductCategory[]).map((c) => ({
    value: c,
    label: `${PRODUCT_CATEGORY_ICONS[c]} ${PRODUCT_CATEGORY_LABELS_L[c][lang]}`,
  }));

// Možnosti za filter kategorije izkušenj (isti vzorec)
const experienceCategoryOptions = (lang: "sl" | "en") =>
  (Object.keys(EXPERIENCE_CATEGORY_LABELS_L) as ExperienceCategory[]).map(
    (c) => ({
      value: c,
      label: `${EXPERIENCE_CATEGORY_ICONS[c]} ${EXPERIENCE_CATEGORY_LABELS_L[c][lang]}`,
    })
  );

// Možnosti za sortiranje izdelkov (F4-A: oznaka je {sl, en} list L slovarja;
// VREDNOSTI razvrščanja ostajajo nespremenjene — čista i18n, nič logike)
const PRODUCT_SORT_OPTIONS: {
  value: string;
  label: { sl: string; en: string };
}[] = [
  { value: "featured", label: L.sort.featured },
  { value: "price-asc", label: L.sort.priceAsc },
  { value: "price-desc", label: L.sort.priceDesc },
  { value: "rating", label: L.sort.rating },
];

// Možnosti za sortiranje izkušenj (identične oznake kot izdelki)
const EXPERIENCE_SORT_OPTIONS: {
  value: string;
  label: { sl: string; en: string };
}[] = [
  { value: "featured", label: L.sort.featured },
  { value: "price-asc", label: L.sort.priceAsc },
  { value: "price-desc", label: L.sort.priceDesc },
  { value: "rating", label: L.sort.rating },
];

// TASK 8 / F4-A: trajanje v jeziku uporabnika — skupni formatDuration
// (marketplace-types.ts, souporabljen z modali) izpisuje slovenski „dni";
// EN plat je lokalna dokler main agent ne konsolidira vira. Delegiramo na
// skupno funkcijo (en vir numerike) in prevedemo LE enoto.
const formatDurationL = (hours: number, lang: "sl" | "en"): string => {
  const base = formatDuration(hours);
  return lang === "en" ? base.replace("dni", "days") : base;
};

type ProductsResponse = {
  products: Product[];
  total: number;
};

type ExperiencesResponse = {
  experiences: Experience[];
  total: number;
};

type Tab = "products" | "experiences";

/**
 * MarketplaceSection — tržnica slovenskih izdelkov in izkušenj.
 * Tabs med izdelki in izkušnjami, filtri kategorije in sortiranja.
 * Kartice odprejo detail modal (ProductModal / ExperienceModal).
 * FW3: prop `defaultTab` (/dozivetja) pripne zavihek izkušenj.
 */
export function MarketplaceSection({
  defaultTab = "products",
}: {
  defaultTab?: Tab;
}) {
  // TASK 8 / F3-B: jezik za L-pattern oznake nalaganja (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const [tab, setTab] = useState<Tab>(defaultTab);

  // Filtri izdelki
  const [productCategory, setProductCategory] = useState<string>(ALL_VALUE);
  const [productSort, setProductSort] = useState<string>("featured");

  // Filtri izkušnje
  const [expCategory, setExpCategory] = useState<string>(ALL_VALUE);
  const [expSort, setExpSort] = useState<string>("featured");

  const [products, setProducts] = useState<Product[]>([]);
  const [productsTotal, setProductsTotal] = useState<number>(0);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [experiencesTotal, setExperiencesTotal] = useState<number>(0);
  const [experiencesLoading, setExperiencesLoading] = useState<boolean>(true);
  const [experiencesError, setExperiencesError] = useState<string | null>(null);

  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [selectedExperience, setSelectedExperience] =
    useState<Experience | null>(null);

  const { toast } = useToast();

  // Fetch izdelkov
  const fetchProducts = useCallback(async () => {
    setProductsLoading(true);
    setProductsError(null);
    try {
      const params = new URLSearchParams();
      if (productCategory !== ALL_VALUE)
        params.set("category", productCategory);
      params.set("sort", productSort);
      params.set("limit", "50");

      const res = await fetch(`/api/products?${params.toString()}`, {
        cache: "no-store",
      });
      // TASK 8 / F4-A: vrženo sporočilo se ne izriše (ulovi ga catch spodaj) —
      // vseeno L, da v datoteki ni slovenskih uhodov.
      if (!res.ok) throw new Error(L.error.productsThrow[lang]);
      const data: ProductsResponse = await res.json();
      setProducts(data.products ?? []);
      setProductsTotal(data.total ?? 0);
    } catch (err) {
      console.error("[products] fetch napaka:", err);
      setProductsError(L.error.products[lang]);
      setProducts([]);
      setProductsTotal(0);
    } finally {
      setProductsLoading(false);
    }
  }, [productCategory, productSort, lang]);

  // Fetch izkušenj
  const fetchExperiences = useCallback(async () => {
    setExperiencesLoading(true);
    setExperiencesError(null);
    try {
      const params = new URLSearchParams();
      if (expCategory !== ALL_VALUE) params.set("category", expCategory);
      params.set("sort", expSort);
      params.set("limit", "50");

      const res = await fetch(`/api/experiences?${params.toString()}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(L.error.experiencesThrow[lang]);
      const data: ExperiencesResponse = await res.json();
      setExperiences(data.experiences ?? []);
      setExperiencesTotal(data.total ?? 0);
    } catch (err) {
      console.error("[experiences] fetch napaka:", err);
      setExperiencesError(L.error.experiences[lang]);
      setExperiences([]);
      setExperiencesTotal(0);
    } finally {
      setExperiencesLoading(false);
    }
  }, [expCategory, expSort, lang]);

  useEffect(() => {
    void fetchProducts();
  }, [fetchProducts]);

  useEffect(() => {
    void fetchExperiences();
  }, [fetchExperiences]);

  // FW2-B: odpri vnos iz "Priljubljene" (dogodek sproži WishlistSheet v
  // navigaciji — sorojenec te sekcije, zato custom dogodek namesto dvigovanja
  // stanja). Preklopi ustrezen tab, scrolla na tržnico in odpre modal; če vnos
  // ni v naloženih seznamih (filtri/limit), ga pridobi prek slug javnega API-ja.
  const openWishlistItem = useCallback(
    async (detail: WishlistOpenDetail) => {
      if (detail.type === "experience") {
        setTab("experiences");
        document
          .getElementById("trznica")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        const found = experiences.find((e) => e.id === detail.id);
        if (found) {
          setSelectedExperience(found);
          return;
        }
        if (!detail.slug) {
          toast({
            title: L.toast.gone[lang],
            description: L.toast.experienceRemoved[lang],
          });
          return;
        }
        try {
          const res = await fetch(
            `/api/experiences/${encodeURIComponent(detail.slug)}`,
            { cache: "no-store" }
          );
          const data = (await res.json().catch(() => null)) as {
            experience?: Experience;
          } | null;
          if (data?.experience) {
            setSelectedExperience(data.experience);
          } else {
            toast({
              title: L.toast.gone[lang],
              description: L.toast.experienceRemoved[lang],
            });
          }
        } catch {
          // tiho — zastarel vnos; uporabnik ostane na tržnici
        }
      } else {
        setTab("products");
        document
          .getElementById("trznica")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
        const found = products.find((p) => p.id === detail.id);
        if (found) {
          setSelectedProduct(found);
          return;
        }
        if (!detail.slug) {
          toast({
            title: L.toast.gone[lang],
            description: L.toast.productRemoved[lang],
          });
          return;
        }
        try {
          const res = await fetch(
            `/api/products/${encodeURIComponent(detail.slug)}`,
            { cache: "no-store" }
          );
          const data = (await res.json().catch(() => null)) as {
            product?: Product;
          } | null;
          if (data?.product) {
            setSelectedProduct(data.product);
          } else {
            toast({
              title: L.toast.gone[lang],
              description: L.toast.productRemoved[lang],
            });
          }
        } catch {
          // tiho — zastarel vnos; uporabnik ostane na tržnici
        }
      }
    },
    [experiences, products, toast, lang]
  );

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<WishlistOpenDetail>).detail;
      if (!detail || typeof detail.id !== "string") return;
      void openWishlistItem(detail);
    };
    window.addEventListener(WISHLIST_OPEN_EVENT, handler);
    return () => window.removeEventListener(WISHLIST_OPEN_EVENT, handler);
  }, [openWishlistItem]);

  // FW3: prevzemi namen iz wishlist Sheet-a, če je uporabnik prišel z druge
  // strani (sessionStorage prenos — enak vzorec kot heroQuery → /načrtuj).
  // Ključ se po prevzemu pobriše, zato so ponovni zagoni efekta varni.
  useEffect(() => {
    try {
      const pending = sessionStorage.getItem(WISHLIST_PENDING_KEY);
      if (pending) {
        sessionStorage.removeItem(WISHLIST_PENDING_KEY);
        const detail = JSON.parse(pending) as WishlistOpenDetail;
        if (detail && typeof detail.id === "string") {
          void openWishlistItem(detail);
        }
      }
    } catch {
      // Pokvarjen zapis — ignoriraj
    }
  }, [openWishlistItem]);

  // Počisti filtre glede na aktivni tab
  const clearFilters = () => {
    if (tab === "products") {
      setProductCategory(ALL_VALUE);
      setProductSort("featured");
    } else {
      setExpCategory(ALL_VALUE);
      setExpSort("featured");
    }
  };

  const hasActiveFilters =
    tab === "products"
      ? productCategory !== ALL_VALUE || productSort !== "featured"
      : expCategory !== ALL_VALUE || expSort !== "featured";

  return (
    <section
      id="trznica"
      className="scroll-mt-20 bg-muted/20 py-16 sm:py-20"
      aria-labelledby="trznica-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <Badge
            variant="secondary"
            className="mb-3 gap-1.5 bg-primary/10 text-primary"
          >
            <Store className="size-3.5" aria-hidden="true" />
            {L.header.badge[lang]}
          </Badge>
          <h2
            id="trznica-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {L.header.title[lang]}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {L.header.subtitle[lang]}
          </p>
          {/* F4-E: tiha resnična vrstica — SAMO na EN (SL je ne vidi) */}
          {lang === "en" && (
            <p className="mt-3 text-xs text-muted-foreground/80">
              {DATA_LANGUAGE_NOTE_EN}
            </p>
          )}
        </div>

        {/* Tabs */}
        <div className="mt-8 flex justify-center">
          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as Tab)}
            className="w-full max-w-md"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="products" className="gap-1.5">
                <ShoppingBag className="size-4" aria-hidden="true" />
                {L.tabs.products[lang]}
              </TabsTrigger>
              <TabsTrigger value="experiences" className="gap-1.5">
                <Compass className="size-4" aria-hidden="true" />
                {L.tabs.experiences[lang]}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Filter vrstica */}
        <div className="mx-auto mt-6 max-w-3xl rounded-xl border border-border/60 bg-background p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="size-4 text-primary" aria-hidden="true" />
              {L.filters.title[lang]}
            </div>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8 gap-1.5 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3.5" aria-hidden="true" />
                {L.filters.clear[lang]}
              </Button>
            ) : null}
          </div>

          {/* 2-col filtri na mobilnem — Select vrednosti se okrajšajo (line-clamp-1), pri ~170px ni preliva */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2">
            {tab === "products" ? (
              <>
                <FilterSelect
                  value={productCategory}
                  onChange={setProductCategory}
                  placeholder={L.filters.allCategories[lang]}
                  ariaLabel={L.filters.filterProductsAria[lang]}
                  options={productCategoryOptions(lang)}
                />
                <FilterSelect
                  value={productSort}
                  onChange={setProductSort}
                  placeholder={L.filters.sortBy[lang]}
                  ariaLabel={L.filters.sortProductsAria[lang]}
                  options={PRODUCT_SORT_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label[lang],
                  }))}
                  showAllOption={false}
                />
              </>
            ) : (
              <>
                <FilterSelect
                  value={expCategory}
                  onChange={setExpCategory}
                  placeholder={L.filters.allCategories[lang]}
                  ariaLabel={L.filters.filterExperiencesAria[lang]}
                  options={experienceCategoryOptions(lang)}
                />
                <FilterSelect
                  value={expSort}
                  onChange={setExpSort}
                  placeholder={L.filters.sortBy[lang]}
                  ariaLabel={L.filters.sortExperiencesAria[lang]}
                  options={EXPERIENCE_SORT_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label[lang],
                  }))}
                  showAllOption={false}
                />
              </>
            )}
          </div>
        </div>

        {/* Števec / nalaganje — TASK 8 / F3-B: med nalaganjem družina
            LoadingState (status + aria-live), sicer stevec površine. */}
        {tab === "products" ? (
          productsLoading ? (
            <LoadingState
              variant="inline"
              label={L.loadingProducts[lang]}
              className="mt-5 justify-center"
            />
          ) : (
            <p className="mt-5 text-center text-sm text-muted-foreground">
              {(() => {
                const t = productsTotal;
                // F4-A: slovenska dvojina/ločnik logika ostaja (1 → izdelek,
                // <5 → izdelke, sicer izdelkov); EN ima samo ednino/množino.
                const noun =
                  t === 1
                    ? L.counter.productOne[lang]
                    : t < 5
                      ? L.counter.productsFew[lang]
                      : L.counter.productsMany[lang];
                return (
                  <>
                    {L.counter.showing[lang]}{" "}
                    <span className="font-semibold text-foreground">{t}</span>{" "}
                    {noun}
                  </>
                );
              })()}
            </p>
          )
        ) : experiencesLoading ? (
          <LoadingState
            variant="inline"
            label={L.loadingExperiences[lang]}
            className="mt-5 justify-center"
          />
        ) : (
          <p className="mt-5 text-center text-sm text-muted-foreground">
            {(() => {
              const t = experiencesTotal;
              const noun =
                t === 1
                  ? L.counter.experienceOne[lang]
                  : t < 5
                    ? L.counter.experiencesFew[lang]
                    : L.counter.experiencesMany[lang];
              return (
                <>
                  {L.counter.showing[lang]}{" "}
                  <span className="font-semibold text-foreground">{t}</span>{" "}
                  {noun}
                </>
              );
            })()}
          </p>
        )}

        {/* Grid */}
        {tab === "products" ? (
          productsLoading ? (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <ProductSkeleton key={i} />
              ))}
            </div>
          ) : productsError ? (
            <ErrorState
              message={productsError}
              onRetry={() => void fetchProducts()}
            />
          ) : products.length === 0 ? (
            /* TASK 8 / F3-B: družinska EmptyState — isto besedilo/akcije
                (TASK 99 NO_LIVE_DATA ločitev ostaja), črtkasta slovnica.
                F4-A: besedilo prinaša L slovar (SL/EN). */
            <EmptyState
              icon={Store}
              title={
                hasActiveFilters
                  ? L.empty.noResults[lang]
                  : L.empty.noLive[lang]
              }
              description={
                hasActiveFilters
                  ? L.empty.filtersHint[lang]
                  : L.empty.noLiveProducts[lang]
              }
              action={
                hasActiveFilters
                  ? {
                      label: L.empty.clearProducts[lang],
                      onClick: clearFilters,
                      icon: X,
                    }
                  : undefined
              }
              className="mt-6 py-16"
            />
          ) : (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
              {products.map((p) => (
                <ProductCard
                  key={p.id}
                  product={p}
                  onOpen={() => setSelectedProduct(p)}
                />
              ))}
            </div>
          )
        ) : experiencesLoading ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <ExperienceSkeleton key={i} />
            ))}
          </div>
        ) : experiencesError ? (
          <ErrorState
            message={experiencesError}
            onRetry={() => void fetchExperiences()}
          />
        ) : experiences.length === 0 ? (
          /* TASK 8 / F3-B: družinska EmptyState (izkušnje) — isto
              besedilo/akcije kot prejšnji lokalni klon. F4-A: L slovar. */
          <EmptyState
            icon={Compass}
            title={
              hasActiveFilters
                ? L.empty.noResults[lang]
                : L.empty.noLive[lang]
            }
            description={
              hasActiveFilters
                ? L.empty.filtersHint[lang]
                : L.empty.noLiveExperiences[lang]
            }
            action={
              hasActiveFilters
                ? {
                    label: L.empty.clearExperiences[lang],
                    onClick: clearFilters,
                    icon: X,
                  }
                : undefined
            }
            className="mt-6 py-16"
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {experiences.map((e) => (
              <ExperienceCard
                key={e.id}
                experience={e}
                onOpen={() => setSelectedExperience(e)}
              />
            ))}
          </div>
        )}

        {/* Footer note — monetizacijski CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-2 rounded-xl border border-primary/30 bg-primary/5 p-6 text-center sm:flex-row sm:gap-4">
          <Store className="size-5 text-primary" aria-hidden="true" />
          <p className="text-sm text-foreground/90">{L.join.text[lang]}</p>
          <a
            href="/za-ponudnike#pridruzi-se"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary transition-colors hover:text-primary/80"
          >
            {L.join.cta[lang]}
            <Compass className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>

      {/* Modala */}
      <ProductModal
        product={selectedProduct}
        onClose={() => setSelectedProduct(null)}
        onSelect={setSelectedProduct}
      />
      <ExperienceModal
        experience={selectedExperience}
        onClose={() => setSelectedExperience(null)}
        onSelect={setSelectedExperience}
      />
    </section>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  ariaLabel,
  options,
  showAllOption = true,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  options: FilterOption[];
  showAllOption?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {showAllOption ? (
          <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        ) : null}
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * ProductCard — kartica izdelka za tržnico.
 */
function ProductCard({
  product,
  onOpen,
}: {
  product: Product;
  onOpen: () => void;
}) {
  const addItem = useCart((s) => s.addItem);
  const { toast } = useToast();
  // TASK 8 / F4-A: jezik za L-pattern besedje kartice (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const image = product.images[0];
  const discount = product.compareAtPrice
    ? Math.round(
        ((product.compareAtPrice - product.price) / product.compareAtPrice) *
          100
      )
    : 0;

  const handleAddToCart = () => {
    if (product.stock <= 0) {
      toast({
        title: L.card.outOfStock[lang],
        description: `${product.name} ${L.card.soldOutSuffix[lang]}`,
        variant: "destructive",
      });
      return;
    }
    addItem({
      productId: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      image: product.images[0] ?? "",
      sellerName: product.sellerName,
      shippingFree: product.shippingFree,
      currency: product.currency,
    });
    trackFunnel("add_to_cart");
    toast({
      title: L.card.addedToCart[lang],
      description: product.name,
    });
  };

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-within:shadow-lg",
        product.plan === "premium" && "border-primary"
      )}
    >
      {/* Slika */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={`${product.name} — ${product.description}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl">
            <span aria-hidden="true">
              {PRODUCT_CATEGORY_ICONS[product.category]}
            </span>
          </div>
        )}

        {/* Atributi + izpostavljeno (top-left) — top-right je rezerviran za srček */}
        <div className="absolute left-3 top-3 flex flex-col gap-1.5">
          {product.organic ? (
            <Badge className="bg-primary text-[10px] text-primary-foreground shadow-sm sm:text-xs">
              <Leaf className="size-3" aria-hidden="true" />
              {L.badge.organic[lang]}
            </Badge>
          ) : null}
          {product.handmade ? (
            <Badge className="bg-blue-600 text-[10px] text-white shadow-sm sm:text-xs">
              <HandHeart className="size-3" aria-hidden="true" />
              {L.badge.handmade[lang]}
            </Badge>
          ) : null}
          {product.vegan ? (
            <Badge
              variant="secondary"
              className="hidden text-[10px] shadow-sm sm:inline-flex sm:text-xs"
            >
              <Leaf className="size-3" aria-hidden="true" />
              {L.badge.vegan[lang]}
            </Badge>
          ) : null}
          {product.featured ? (
            <Badge className="bg-amber-400 text-[10px] text-amber-950 shadow-sm sm:text-xs">
              <Sparkles className="size-3" aria-hidden="true" />
              <span className="sr-only sm:hidden">{L.badge.featured[lang]}</span>
              <span className="hidden sm:inline">{L.badge.featured[lang]}</span>
            </Badge>
          ) : null}
        </div>

        {/* Srček — shrani med priljubljene (ne odpre modala) */}
        <WishlistHeartButton
          entry={{
            id: product.id,
            type: "product",
            name: product.name,
            image: product.images[0] ?? null,
            price: product.price,
            destination: product.destinationName ?? null,
            slug: product.slug,
          }}
        />

        {/* Discount badge (bottom-right) */}
        {discount > 0 ? (
          <Badge className="absolute bottom-3 right-3 bg-destructive text-destructive-foreground shadow-sm">
            -{discount}%
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-semibold leading-tight sm:text-lg">
            {product.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 sm:text-sm">
            {product.description}
          </p>
        </div>

        {/* Rating — samo ob pravih mnenjih (P4-9: iskrena komunikacija) */}
        {product.reviewCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Star
              className="size-4 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tabular-nums sm:text-sm">
              {product.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">
              ({product.reviewCount})
            </span>
          </div>
        )}

        {/* Cena */}
        <div className="flex items-baseline gap-2">
          <span className="text-base font-bold text-foreground sm:text-lg">
            {formatPrice(product.price, product.currency)}
          </span>
          {product.compareAtPrice ? (
            <span className="text-xs text-muted-foreground line-through sm:text-sm">
              {formatPrice(product.compareAtPrice, product.currency)}
            </span>
          ) : null}
        </div>

        {/* Seller name + location */}
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
          <MapPin
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="line-clamp-1">
            {product.sellerName}
            {product.destinationName ? ` · ${product.destinationName}` : ""}
          </span>
        </div>

        {/* Shipping badge */}
        <div className="flex flex-wrap gap-1.5">
          {product.shippingFree ? (
            <Badge className="bg-amber-400 text-amber-950">
              <Truck className="size-3" aria-hidden="true" />
              {L.badge.freeShipping[lang]}
            </Badge>
          ) : product.shipsEurope ? (
            <Badge variant="secondary">
              <Globe className="size-3" aria-hidden="true" />
              {L.badge.euShipping[lang]}
            </Badge>
          ) : null}
        </div>

        {/* CTA — na mobilnem se gumba zložita vsak v svojo vrstico (flex-wrap), ≥sm nespremenjeno */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            disabled={product.stock <= 0}
            onClick={handleAddToCart}
          >
            <ShoppingBag className="size-4" aria-hidden="true" />
            {product.stock > 0 ? L.cta.addToCart[lang] : L.cta.soldOut[lang]}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-center sm:flex-none max-sm:flex-1"
            onClick={onOpen}
          >
            {L.cta.details[lang]}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * ExperienceCard — kartica izkušnje za tržnico.
 */
function ExperienceCard({
  experience,
  onOpen,
}: {
  experience: Experience;
  onOpen: () => void;
}) {
  // TASK 8 / F4-A: jezik za L-pattern besedje kartice (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const image = experience.images[0];

  return (
    <Card
      className={cn(
        "group relative gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-within:shadow-lg",
        experience.plan === "premium" && "border-primary"
      )}
    >
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {image ? (
          <img
            src={image}
            alt={`${experience.name} — ${experience.description}`}
            loading="lazy"
            className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = "none";
            }}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-muted text-4xl">
            <span aria-hidden="true">
              {EXPERIENCE_CATEGORY_ICONS[experience.category]}
            </span>
          </div>
        )}

        {/* Kategorija + izpostavljeno (top-left) — top-right je rezerviran za srček */}
        <div className="absolute left-3 top-3 flex max-w-[45%] flex-col items-start gap-1.5 sm:max-w-none">
          <Badge className="max-w-full bg-background/90 text-[10px] text-foreground backdrop-blur-sm sm:text-xs">
            <span aria-hidden="true">
              {EXPERIENCE_CATEGORY_ICONS[experience.category]}
            </span>
            <span className="truncate">{EXPERIENCE_CATEGORY_LABELS_L[experience.category][lang]}</span>
          </Badge>
          {experience.featured ? (
            <Badge className="bg-amber-400 text-[10px] text-amber-950 shadow-sm sm:text-xs">
              <Sparkles className="size-3" aria-hidden="true" />
              <span className="sr-only sm:hidden">{L.badge.featured[lang]}</span>
              <span className="hidden sm:inline">{L.badge.featured[lang]}</span>
            </Badge>
          ) : null}
        </div>

        {/* Srček — shrani med priljubljene (ne odpre modala) */}
        <WishlistHeartButton
          entry={{
            id: experience.id,
            type: "experience",
            name: experience.name,
            image: experience.images[0] ?? null,
            price: experience.pricePerPerson,
            destination: experience.destinationName ?? null,
            slug: experience.slug,
          }}
        />

        {/* Duration badge (bottom-right) */}
        <Badge className="absolute bottom-3 right-3 bg-background/90 text-[10px] text-foreground backdrop-blur-sm sm:text-xs">
          <Clock className="size-3" aria-hidden="true" />
          {formatDurationL(experience.durationHours, lang)}
        </Badge>
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-1 text-sm font-semibold leading-tight sm:text-lg">
            {experience.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 sm:text-sm">
            {experience.description}
          </p>
        </div>

        {/* Rating — samo ob pravih mnenjih (P4-9: iskrena komunikacija) */}
        {experience.reviewCount > 0 && (
          <div className="flex items-center gap-1.5">
            <Star
              className="size-4 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="text-xs font-medium tabular-nums sm:text-sm">
              {experience.rating.toFixed(1)}
            </span>
            <span className="text-[11px] text-muted-foreground sm:text-xs">
              ({experience.reviewCount})
            </span>
          </div>
        )}

        {/* Cena — §38 resnica: „od" je OD-cena na osebo, ne končna cena
            (F4-A: EN plat „from … / person", ista resnica) */}
        <div className="flex items-baseline gap-1">
          <span className="text-[11px] text-muted-foreground sm:text-xs">{L.price.from[lang]}</span>
          <span className="text-base font-bold text-foreground sm:text-lg">
            {formatPrice(experience.pricePerPerson, experience.currency)}
          </span>
          <span className="text-[11px] text-muted-foreground sm:text-xs">{L.price.perPerson[lang]}</span>
        </div>

        {/* Provider name + location */}
        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground sm:text-xs">
          <MapPin
            className="mt-0.5 size-3.5 shrink-0"
            aria-hidden="true"
          />
          <span className="line-clamp-1">
            {experience.providerName}
            {experience.destinationName ? ` · ${experience.destinationName}` : ""}
          </span>
        </div>

        {/* Atributi */}
        {(experience.familyFriendly || experience.accessibility) && (
          <div className="flex flex-wrap gap-1.5">
            {experience.familyFriendly ? (
              <Badge variant="secondary">
                <Baby className="size-3" aria-hidden="true" />
                {L.badge.familyFriendly[lang]}
              </Badge>
            ) : null}
            {experience.accessibility ? (
              <Badge variant="secondary">
                <Accessibility className="size-3" aria-hidden="true" />
                {L.badge.accessible[lang]}
              </Badge>
            ) : null}
          </div>
        )}

        {/* CTA — primarni gumb odpre modal z rezervacijo (zrcali [V košarico][Podrobnosti]); na mobilnem zložena vrstica */}
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="flex-1 justify-center gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={onOpen}
          >
            <Calendar className="size-4" aria-hidden="true" />
            {L.cta.book[lang]}
          </Button>
          {experience.providerWebsite ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              className="justify-center gap-1.5 sm:flex-none max-sm:flex-1"
            >
              <a
                href={experience.providerWebsite}
                target="_blank"
                rel="noopener noreferrer sponsored"
                onClick={(e) => e.stopPropagation()}
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {L.cta.atProvider[lang]}
              </a>
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="justify-center gap-1.5 sm:flex-none max-sm:flex-1"
              disabled
              title={L.cta.noProviderSite[lang]}
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              {L.cta.atProvider[lang]}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function ProductSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-square w-full rounded-none" />
      <CardContent className="space-y-3 p-3 sm:p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

function ExperienceSkeleton() {
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <Skeleton className="aspect-video w-full rounded-none" />
      <CardContent className="space-y-3 p-3 sm:p-4">
        <Skeleton className="h-5 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-5 w-1/3" />
        <div className="flex gap-2">
          <Skeleton className="h-8 flex-1 rounded-md" />
          <Skeleton className="h-8 w-24 rounded-md" />
        </div>
      </CardContent>
    </Card>
  );
}

/* TASK 8 / F3-B: lokalna EmptyState/ErrorState sta ODSTRANJENA —
 * površina uporablja družino @/components/states (isto besedilo,
 * iste akcije; skeleton mreži Product/Experience ostajajo lokalne,
 * ker so dobro hotene). */

export default MarketplaceSection;
