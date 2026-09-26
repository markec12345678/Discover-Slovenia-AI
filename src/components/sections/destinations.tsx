"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Star,
  Clock,
  ArrowRight,
  Compass,
  Filter,
  SlidersHorizontal,
  ChevronDown,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
// TASK 8 / F3-B (D8-A P-STATE-2): prazno stanje filtrov nosi družinska
// EmptyState (lokalni klon poenoten — isto besedilo prek homeDest i18n).
import { EmptyState } from "@/components/states/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DestinationModal } from "@/components/sections/destination-modal";
import {
  DESTINATIONS,
  REGIONS,
  INTERESTS,
  COUNTRIES,
  COUNTRY_OF_REGION,
} from "@/lib/slovenia-data";
import {
  getEnDestination,
  REGIONS_EN,
  INTERESTS_EN,
  COUNTRIES_EN,
} from "@/lib/slovenia-data-en";
import {
  DESTINATIONS_SORT_OPTIONS,
  sortDestinations,
  type DestinationsSort,
} from "@/lib/destinations-sort";
import { Link } from "@/i18n/navigation";
import type { Destination, DestinationType, Budget } from "@/lib/types";

const ALL_VALUE = "all";

/** TASK 69 (P2): ključi label za sortni segment ( homeDest namespace). */
const SORT_LABEL_KEYS: Record<DestinationsSort, string> = {
  recommended: "sortRecommended",
  rating: "sortRating",
  price: "sortPrice",
};

// Možnosti za filter tipa destinacije (labelKey → ključi v "homeDest" namespace)
const TYPE_OPTIONS: { value: DestinationType; labelKey: string }[] = [
  { value: "lake", labelKey: "typeLake" },
  { value: "city", labelKey: "typeCity" },
  { value: "mountain", labelKey: "typeMountain" },
  { value: "cave", labelKey: "typeCave" },
  { value: "coast", labelKey: "typeCoast" },
  { value: "river", labelKey: "typeRiver" },
  { value: "spa", labelKey: "typeSpa" },
  { value: "gorge", labelKey: "typeGorge" },
  { value: "castle", labelKey: "typeCastle" },
];

// Možnosti za filter cene (labelKey → ključi v "homeDest" namespace)
const BUDGET_OPTIONS: { value: Budget; labelKey: string }[] = [
  { value: "€", labelKey: "budgetLow" },
  { value: "€€", labelKey: "budgetMid" },
  { value: "€€€", labelKey: "budgetHigh" },
];

// Možnosti za filter ocene (minimalna ocena; labelKey → "homeDest")
const RATING_OPTIONS: { value: string; labelKey: string }[] = [
  { value: "4.5", labelKey: "rating45" },
  { value: "4.7", labelKey: "rating47" },
  { value: "4.9", labelKey: "rating49" },
];

/**
 * FW4.3-2: regija po locale — na EN preslikana prek REGIONS_EN
 * (identifikatorji ostanejo slovenski, prikaz je angleški).
 */
function regionLabel(value: string, locale: string): string {
  if (locale === "en") {
    return (
      REGIONS_EN[value] ??
      REGIONS.find((r) => r.value === value)?.label ??
      value
    );
  }
  return REGIONS.find((r) => r.value === value)?.label ?? value;
}

/**
 * FW4.3-2: EN overlay za destinacijo — tekstovna polja (tagline,
 * description, highlights, activities, duration) zamenjana z angleškimi
 * viri iz slovenia-data-en.ts; id/slug/name/slike/cene ostanejo izvirni.
 * Vrne isti objekt, če overlay manjka.
 */
function withEnOverlay(d: Destination): Destination {
  const en = getEnDestination(d.id);
  return en ? { ...d, ...en } : d;
}

/**
 * DestinationsSection — glavna mreža destinacij s 5 filtri in modalom.
 * "use client" zaradi filtrov (Select) in modala (state).
 * Podatki so uvoženi direktno iz slovenia-data.ts za hitrost (brez API klica).
 *
 * FW3: prop `featured` (homepage) prikaže samo 6 priljubljenih destinacij
 * brez filtrov + CTA "Razišči vseh 22" → /destinacije — progresivno
 * razkrivanje namesto vizualnega overloada (velik produkt ≠ velika homepage).
 *
 * FW4.3-2: kadar je aktiven locale "en", se za prikaz uporabi EN overlay
 * (getEnDestination) + REGIONS_EN/INTERESTS_EN za labele filtrov.
 */
export function DestinationsSection({
  featured = false,
}: {
  featured?: boolean;
}) {
  const t = useTranslations("homeDest");
  const locale = useLocale();
  const isEn = locale === "en";
  const [country, setCountry] = useState<string>(ALL_VALUE);
  const [region, setRegion] = useState<string>(ALL_VALUE);
  const [interest, setInterest] = useState<string>(ALL_VALUE);
  const [type, setType] = useState<string>(ALL_VALUE);
  const [budget, setBudget] = useState<string>(ALL_VALUE);
  const [rating, setRating] = useState<string>(ALL_VALUE);
  // TASK 69 (P2): razvrščanje — "recommended" privzeto (uredniški vrstni
  // red = dosedanja slika, torej brez reverzije obstoječega obnašanja).
  const [sort, setSort] = useState<DestinationsSort>("recommended");
  // TASK 69 (P1): napredni filtri (tip/cena/ocena) privzeto skriti —
  // progresivno razkrivanje (vzorec „More filters" pri GetYourGuide).
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selected, setSelected] = useState<Destination | null>(null);

  const filtered = useMemo(() => {
    const minRating = rating === ALL_VALUE ? 0 : Number(rating);
    return DESTINATIONS.filter((d) => {
      // TASK 62: primarna os — država (SI/HR/ME/AL); regija je sekundarna.
      const countryOk = country === ALL_VALUE || d.country === country;
      const regionOk = region === ALL_VALUE || d.region === region;
      const interestOk =
        interest === ALL_VALUE || d.bestFor.includes(interest);
      const typeOk = type === ALL_VALUE || d.type === type;
      const budgetOk = budget === ALL_VALUE || d.budget === budget;
      const ratingOk = d.rating >= minRating;
      return countryOk && regionOk && interestOk && typeOk && budgetOk && ratingOk;
    });
  }, [country, region, interest, type, budget, rating]);

  const hasActiveFilters =
    country !== ALL_VALUE ||
    region !== ALL_VALUE ||
    interest !== ALL_VALUE ||
    type !== ALL_VALUE ||
    budget !== ALL_VALUE ||
    rating !== ALL_VALUE;

  const clearFilters = () => {
    setCountry(ALL_VALUE);
    setRegion(ALL_VALUE);
    setInterest(ALL_VALUE);
    setType(ALL_VALUE);
    setBudget(ALL_VALUE);
    setRating(ALL_VALUE);
    // TASK 69 (P2): sort je RAZVRŠČANJE (način prikaza), ne filter — ob
    // čiščenju filtrov ostane izbira uporabnika ( vzorec GetYourGuide/TripAdvisor).
  };

  // TASK 69 (P1): število aktivnih naprednih filtrov — badge na gumbu
  // „Več filtrov", da je skrito stanje vidno ( feedback brez razkritja).
  const advancedCount =
    [type, budget, rating].filter((v) => v !== ALL_VALUE).length;

  // FW3: featured način — samo izbranih 6 (featured: true v slovenia-data)
  const featuredList = useMemo(
    () => DESTINATIONS.filter((d) => d.featured),
    []
  );
  // TASK 69 (P2): v polnem načinu se po filtriranju uveljavi razvrščanje;
  // featured način ostane kuriran ( brez spremembe obstoječega obnašanja).
  const list = useMemo(
    () => (featured ? featuredList : sortDestinations(filtered, sort)),
    [featured, featuredList, filtered, sort]
  );

  // FW4.3-2: na EN prikazujemo overlay (tagline/highlights/duration …);
  // id/slug/name/slike/cene ostanejo iz slovenskega vira resnice.
  const displayList = useMemo(
    () => (isEn ? list.map(withEnOverlay) : list),
    [list, isEn]
  );

  // FW4.3-2: modal prejme EN overlay destinacijo (description/activities
  // se uporabita znotraj modala); identifikatorji ostanejo izvirni.
  const selectedDisplay = useMemo(
    () => (isEn && selected ? withEnOverlay(selected) : selected),
    [selected, isEn]
  );

  return (
    <section
      id="destinacije"
      className="scroll-mt-20 bg-background py-16 sm:py-20"
      aria-labelledby="destinacije-title"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="destinacije-title"
            className="text-3xl font-bold tracking-tight sm:text-4xl"
          >
            {featured ? t("titleFeatured") : t("titleAll")}
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            {featured
              ? t("subtitleFeatured")
              : t("subtitleAll")}
          </p>
        </div>

        {/* FW3: filtri + števec samo v polnem načinu (/destinacije) */}
        {!featured ? (
          <>
        {/* Filter plošča */}
        <div className="mt-8 rounded-xl border border-border/60 bg-muted/20 p-4 sm:p-5">
          {/* Glava filtra */}
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-medium text-foreground">
              <Filter className="size-4 text-primary" aria-hidden="true" />
              {t("filters")}
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
                {t("clearFilters")}
              </Button>
            ) : null}
          </div>

          {/* TASK 69 (P1): 1. vrstica — SAMO država + regija.
              Interes se je preselil v čipe ( 1 klik namesto dropdown),
              tip/cena/ocena pa v zložljivo „Več filtrov" — na mobilnem
              uporabnik vidi kartice po eni vrstici kontrol, ne treh. */}
          <div className="grid grid-cols-2 gap-3">
            <FilterSelect
              value={country}
              onChange={(v) => {
                setCountry(v);
                // Koherentnost: regija iz DRUJE države ne sme ostati aktivna
                // (sicer prazna mreža brez razlage) — pošten reset na „vse".
                if (
                  v !== ALL_VALUE &&
                  region !== ALL_VALUE &&
                  COUNTRY_OF_REGION[region] !== v
                ) {
                  setRegion(ALL_VALUE);
                }
              }}
              placeholder={t("countryPlaceholder")}
              ariaLabel={t("countryAriaLabel")}
              options={COUNTRIES.map((c) => ({
                value: c.value,
                label: isEn ? (COUNTRIES_EN[c.value] ?? c.label) : c.label,
              }))}
            />
            <FilterSelect
              value={region}
              onChange={setRegion}
              placeholder={t("regionPlaceholder")}
              ariaLabel={t("regionAriaLabel")}
              options={REGIONS.filter(
                // TASK 62: regije IZBRANE države (ali vse, če ni izbire)
                (r) =>
                  country === ALL_VALUE || COUNTRY_OF_REGION[r.value] === country
              ).map((r) => ({
                value: r.value,
                label: isEn ? (REGIONS_EN[r.value] ?? r.label) : r.label,
              }))}
            />
          </div>

          {/* TASK 69 (P1): 2. vrstica — interes kot čipi z vodoravnim
              drsenjem ( vzorec kategorij GetYourGuide). Radiogroup
              semantika: aria-checked na gumbu, enako kot sortni segment. */}
          <div
            role="radiogroup"
            aria-label={t("interestsAriaLabel")}
            className="mt-3 flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            <InterestChip
              value={ALL_VALUE}
              active={interest === ALL_VALUE}
              label={t("interestAll")}
              onChange={() => setInterest(ALL_VALUE)}
            />
            {INTERESTS.map((i) => (
              <InterestChip
                key={i.value}
                value={i.value}
                active={interest === i.value}
                icon={i.icon}
                label={isEn ? (INTERESTS_EN[i.value] ?? i.label) : i.label}
                onChange={() => setInterest(i.value)}
              />
            ))}
          </div>

          {/* TASK 69 (P1): napredni filtri (tip/cena/ocena — TASK 62) —
              privzeto skriti; badge pokaže število aktivnih, tudi skritih. */}
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showAdvanced}
              aria-controls="dest-advanced-filters"
              onClick={() => setShowAdvanced((v) => !v)}
              className="h-9 gap-1.5"
            >
              <SlidersHorizontal className="size-3.5" aria-hidden="true" />
              {advancedCount > 0
                ? t("moreFiltersWithCount", { count: advancedCount })
                : t("moreFilters")}
              <ChevronDown
                className={`size-3.5 transition-transform ${
                  showAdvanced ? "rotate-180" : ""
                }`}
                aria-hidden="true"
              />
            </Button>
            {showAdvanced ? (
              <div
                id="dest-advanced-filters"
                className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3"
              >
                <FilterSelect
                  value={type}
                  onChange={setType}
                  placeholder={t("typePlaceholder")}
                  ariaLabel={t("typeAriaLabel")}
                  options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
                />
                <FilterSelect
                  value={budget}
                  onChange={setBudget}
                  placeholder={t("budgetPlaceholder")}
                  ariaLabel={t("budgetAriaLabel")}
                  options={BUDGET_OPTIONS.map((b) => ({ value: b.value, label: t(b.labelKey) }))}
                />
                <FilterSelect
                  value={rating}
                  onChange={setRating}
                  placeholder={t("ratingPlaceholder")}
                  ariaLabel={t("ratingAriaLabel")}
                  options={RATING_OPTIONS.map((r) => ({ value: r.value, label: t(r.labelKey) }))}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* TASK 69 (P2): števec + sortni segment v isti vrstici.
            Sort je radiogroup gumb — tipkovniško dostopen, brez Selecta. */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {t("showing", { count: filtered.length, total: DESTINATIONS.length })}
          </p>
          <div
            role="radiogroup"
            aria-label={t("sortLabel")}
            className="flex rounded-lg border border-border/60 bg-muted/20 p-0.5"
          >
            {DESTINATIONS_SORT_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={sort === option}
                onClick={() => setSort(option)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors sm:text-sm ${
                  sort === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t(SORT_LABEL_KEYS[option])}
              </button>
            ))}
          </div>
        </div>
          </>
        ) : null}

        {/* Grid mreža */}
        {list.length === 0 ? (
          /* TASK 8 / F3-B: družinska EmptyState — isto besedilo (i18n
              ključi homeDest) + ista akcija „Počisti filtre". */
          <EmptyState
            icon={Compass}
            title={t("emptyTitle")}
            description={t("emptyHint")}
            action={
              hasActiveFilters
                ? { label: t("clearFilters"), onClick: clearFilters, icon: X }
                : undefined
            }
            className="mt-6 py-16"
          />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {displayList.map((d) => (
              <DestinationCard
                key={d.id}
                destination={d}
                onOpen={() => setSelected(d)}
              />
            ))}
          </div>
        )}

        {/* FW3: featured način — CTA na celoten katalog destinacij */}
        {featured ? (
          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg" className="gap-1.5">
              <Link href="/destinacije">
                {t("viewAll")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </div>

      {/* Modal */}
      <DestinationModal
        destination={selectedDisplay}
        onClose={() => setSelected(null)}
      />
    </section>
  );
}

interface FilterOption {
  value: string;
  label: string;
}

/**
 * TASK 69 (P1): čip za izbiro interesa — 1 klik namesto dropdown
 * ( prikaz + izklop v isti interakciji). Radiogroup semantika:
 * v vedno točno ena izbira ( vključno „Vsi").
 */
function InterestChip({
  value,
  active,
  label,
  icon,
  onChange,
}: {
  value: string;
  active: boolean;
  label: string;
  icon?: string;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      data-filter-value={value}
      onClick={onChange}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border/60 bg-background text-muted-foreground hover:border-foreground/40 hover:text-foreground"
      }`}
    >
      {icon ? (
        <span aria-hidden="true" className="text-sm">
          {icon}
        </span>
      ) : null}
      {label}
    </button>
  );
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  ariaLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
  options: FilterOption[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={ariaLabel} className="w-full">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{placeholder}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function DestinationCard({
  destination,
  onOpen,
}: {
  destination: Destination;
  onOpen: () => void;
}) {
  const t = useTranslations("homeDest");
  const locale = useLocale();
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={t("cardAriaLabel", { name: destination.name })}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className="group gap-0 overflow-hidden py-0 transition-all hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 cursor-pointer"
    >
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {/* Slika destinacije */}
        <img
          src={destination.image}
          alt={t("imageAlt", {
            name: destination.name,
            tagline: destination.tagline,
          })}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Badge regije (top-left) — na ozki sliki (~175px) skrčena in odrezana, da se ne prekriva z featured */}
        <Badge className="absolute left-3 top-3 max-w-[45%] truncate bg-primary text-[10px] text-primary-foreground shadow-sm sm:text-xs">
          {regionLabel(destination.region, locale)}
        </Badge>
        {/* Featured badge (top-right) */}
        {destination.featured ? (
          <Badge className="absolute right-3 top-3 bg-amber-400 text-[10px] text-amber-950 shadow-sm sm:text-xs">
            {t("featuredBadge")}
          </Badge>
        ) : null}
      </div>

      {/* Body — OPCIJA-2 (gostota): en compact metapodatkovni pas
          (★ ocena · budget · trajanje · cena) namesto dveh ločenih vrstic —
          Mindtripovo zgoščeno "sličica + metapodatki + status" v ozki
          kartici, brez uredniškega nereda. TASK 71 (raziskava TASK 68 P4):
          cena ≈ €X na kartici (GYG vzorec "from €X") — primerjava brez
          odpiranja modala; realni podatek costPerPerson (10–80 €), ≈ simbol
          sporoča oceno, ne garantirano ceno (iskrenost). */}
      <CardContent className="flex flex-col gap-2 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight sm:text-lg">
            {destination.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 sm:text-sm">
            {destination.tagline}
          </p>
        </div>

        {/* Compact pas: ocena + budget + trajanje + cena v eni vrstici */}
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
          <span className="inline-flex items-center gap-1">
            <Star
              className="size-3.5 fill-amber-400 text-amber-400"
              aria-hidden="true"
            />
            <span className="font-semibold tabular-nums">
              {destination.rating.toFixed(1)}
            </span>
            {/* ISSUE #4 §18 (VAL 7): VIDEN kvalifikator — ocena je
                UREDNIŠKA (ne uporabniške recenzije). Prej je oznaka
                živela samo v sr-only (bralniki) + map popupu; vidiči
                uporabniki so videli golem ★ 4.8. */}
            <span className="text-[10px] font-normal text-muted-foreground">
              {t("editorialShort")}
            </span>
            <span className="sr-only">{t("ratingLabel")}</span>
          </span>
          <span aria-hidden="true" className="text-border">·</span>
          <Badge
            variant="secondary"
            className="h-5 px-1.5 font-medium text-[11px]"
          >
            {destination.budget}
          </Badge>
          <span aria-hidden="true" className="text-border">·</span>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" aria-hidden="true" />
            {destination.duration}
          </span>
          <span aria-hidden="true" className="text-border">·</span>
          <span className="inline-flex items-center gap-1 font-medium tabular-nums">
            {t("cardPrice", { price: destination.costPerPerson })}
            <span className="sr-only">{t("cardPriceSr")}</span>
          </span>
        </div>

        {/* Highlight chipi — na mobilnem največ 2, da ne zapolnijo ozke kartice */}
        <div className="flex flex-wrap gap-1.5">
          {destination.highlights.slice(0, 3).map((h, i) => (
            <span
              key={h}
              className={`rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground${
                i === 2 ? " hidden sm:inline-block" : ""
              }`}
            >
              {h}
            </span>
          ))}
        </div>

        {/* CTA */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 justify-between self-start text-primary hover:bg-primary/10 hover:text-primary"
          onClick={(e) => {
            e.stopPropagation();
            onOpen();
          }}
        >
          {t("moreInfo")}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

/* TASK 8 / F3-B: lokalni klon EmptyState je ODSTRANJEN — površina
 * uporablja družinsko komponento @/components/states/empty-state
 * (isto besedilo prek i18n ključev homeDest, ista akcija). */

export default DestinationsSection;
