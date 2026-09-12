"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  Star,
  Clock,
  ArrowRight,
  Compass,
  ImageIcon,
  Filter,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
} from "@/lib/slovenia-data";
import type { Destination, DestinationType, Budget } from "@/lib/types";

const ALL_VALUE = "all";

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

function regionLabel(value: string): string {
  return REGIONS.find((r) => r.value === value)?.label ?? value;
}

/**
 * DestinationsSection — glavna mreža destinacij s 5 filtri in modalom.
 * "use client" zaradi filtrov (Select) in modala (state).
 * Podatki so uvoženi direktno iz slovenia-data.ts za hitrost (brez API klica).
 *
 * FW3: prop `featured` (homepage) prikaže samo 6 priljubljenih destinacij
 * brez filtrov + CTA "Razišči vseh 22" → /destinacije — progresivno
 * razkrivanje namesto vizualnega overloada (velik produkt ≠ velika homepage).
 */
export function DestinationsSection({
  featured = false,
}: {
  featured?: boolean;
}) {
  const t = useTranslations("homeDest");
  const [region, setRegion] = useState<string>(ALL_VALUE);
  const [interest, setInterest] = useState<string>(ALL_VALUE);
  const [type, setType] = useState<string>(ALL_VALUE);
  const [budget, setBudget] = useState<string>(ALL_VALUE);
  const [rating, setRating] = useState<string>(ALL_VALUE);
  const [selected, setSelected] = useState<Destination | null>(null);

  const filtered = useMemo(() => {
    const minRating = rating === ALL_VALUE ? 0 : Number(rating);
    return DESTINATIONS.filter((d) => {
      const regionOk = region === ALL_VALUE || d.region === region;
      const interestOk =
        interest === ALL_VALUE || d.bestFor.includes(interest);
      const typeOk = type === ALL_VALUE || d.type === type;
      const budgetOk = budget === ALL_VALUE || d.budget === budget;
      const ratingOk = d.rating >= minRating;
      return regionOk && interestOk && typeOk && budgetOk && ratingOk;
    });
  }, [region, interest, type, budget, rating]);

  const hasActiveFilters =
    region !== ALL_VALUE ||
    interest !== ALL_VALUE ||
    type !== ALL_VALUE ||
    budget !== ALL_VALUE ||
    rating !== ALL_VALUE;

  const clearFilters = () => {
    setRegion(ALL_VALUE);
    setInterest(ALL_VALUE);
    setType(ALL_VALUE);
    setBudget(ALL_VALUE);
    setRating(ALL_VALUE);
  };

  // FW3: featured način — samo izbranih 6 (featured: true v slovenia-data)
  const featuredList = useMemo(
    () => DESTINATIONS.filter((d) => d.featured),
    []
  );
  const list = featured ? featuredList : filtered;

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

          {/* 1. vrstica: regija, interes, tip (2-col na mobilnem, da filtri ne zorijo v 5-stopenjski stack) */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <FilterSelect
              value={region}
              onChange={setRegion}
              placeholder={t("regionPlaceholder")}
              ariaLabel={t("regionAriaLabel")}
              options={REGIONS.map((r) => ({ value: r.value, label: r.label }))}
            />
            <FilterSelect
              value={interest}
              onChange={setInterest}
              placeholder={t("interestPlaceholder")}
              ariaLabel={t("interestAriaLabel")}
              options={INTERESTS.map((i) => ({
                value: i.value,
                label: `${i.icon} ${i.label}`,
              }))}
            />
            <FilterSelect
              value={type}
              onChange={setType}
              placeholder={t("typePlaceholder")}
              ariaLabel={t("typeAriaLabel")}
              options={TYPE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey) }))}
            />
          </div>

          {/* 2. vrstica: cena, ocena */}
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-2">
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
        </div>

        {/* Števec rezultatov */}
        <p className="mt-5 text-sm text-muted-foreground">
          {t("showing", { count: filtered.length, total: DESTINATIONS.length })}
        </p>
          </>
        ) : null}

        {/* Grid mreža */}
        {list.length === 0 ? (
          <EmptyState onClear={clearFilters} canClear={hasActiveFilters} />
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:gap-6 lg:grid-cols-3">
            {list.map((d) => (
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
        destination={selected}
        onClose={() => setSelected(null)}
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
          {regionLabel(destination.region)}
        </Badge>
        {/* Featured badge (top-right) */}
        {destination.featured ? (
          <Badge className="absolute right-3 top-3 bg-amber-400 text-[10px] text-amber-950 shadow-sm sm:text-xs">
            {t("featuredBadge")}
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="text-base font-semibold leading-tight sm:text-lg">
            {destination.name}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground line-clamp-2 sm:text-sm">
            {destination.tagline}
          </p>
        </div>

        {/* Rating — uredniška ocena (P4-9: jasna oznaka, ne uporabniška) */}
        <div className="flex items-center gap-1.5">
          <Star
            className="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-xs font-medium tabular-nums sm:text-sm">
            {destination.rating.toFixed(1)}
          </span>
          {/* Oznaka skrčena na ozkih zaslonih (~175px kartica); ocena (številka) ostane vidna */}
          <span className="hidden text-xs text-muted-foreground sm:inline">{t("ratingLabel")}</span>
        </div>

        {/* Budget + duration */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="secondary" className="font-medium">
            {destination.budget}
          </Badge>
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Clock className="size-3" aria-hidden="true" />
            {destination.duration}
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

function EmptyState({
  onClear,
  canClear,
}: {
  onClear: () => void;
  canClear: boolean;
}) {
  const t = useTranslations("homeDest");
  return (
    <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Compass className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">{t("emptyTitle")}</p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ImageIcon className="size-3.5" aria-hidden="true" />
        {t("emptyHint")}
      </p>
      {canClear ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          className="mt-2 gap-1.5"
        >
          <X className="size-3.5" aria-hidden="true" />
          {t("clearFilters")}
        </Button>
      ) : null}
    </div>
  );
}

export default DestinationsSection;
