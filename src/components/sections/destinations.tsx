"use client";

import { useMemo, useState } from "react";
import { Star, Clock, ArrowRight, Compass, ImageIcon } from "lucide-react";
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
import type { Destination } from "@/lib/types";

const ALL_VALUE = "all";

function regionLabel(value: string): string {
  return REGIONS.find((r) => r.value === value)?.label ?? value;
}

/**
 * DestinationsSection — glavna mreža destinacij s filtri in modalom.
 * "use client" zaradi filtrov (Select) in modala (state).
 * Podatki so uvoženi direktno iz slovenia-data.ts za hitrost (brez API klica).
 */
export function DestinationsSection() {
  const [region, setRegion] = useState<string>(ALL_VALUE);
  const [interest, setInterest] = useState<string>(ALL_VALUE);
  const [selected, setSelected] = useState<Destination | null>(null);

  const filtered = useMemo(() => {
    return DESTINATIONS.filter((d) => {
      const regionOk = region === ALL_VALUE || d.region === region;
      const interestOk =
        interest === ALL_VALUE || d.bestFor.includes(interest);
      return regionOk && interestOk;
    });
  }, [region, interest]);

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
            Raziščite destinacije
          </h2>
          <p className="mt-3 text-base text-muted-foreground">
            12 najlepših kotičkov Slovenije
          </p>
        </div>

        {/* Filter vrstica */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-center">
          <FilterSelect
            value={region}
            onChange={setRegion}
            placeholder="Vse regije"
            ariaLabel="Filtriraj po regiji"
            options={REGIONS.map((r) => ({ value: r.value, label: r.label }))}
          />
          <FilterSelect
            value={interest}
            onChange={setInterest}
            placeholder="Vsi interesi"
            ariaLabel="Filtriraj po interesu"
            options={INTERESTS.map((i) => ({
              value: i.value,
              label: `${i.icon} ${i.label}`,
            }))}
          />
        </div>

        {/* Grid mreža */}
        {filtered.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((d) => (
              <DestinationCard
                key={d.id}
                destination={d}
                onOpen={() => setSelected(d)}
              />
            ))}
          </div>
        )}
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
      <SelectTrigger
        aria-label={ariaLabel}
        className="w-full sm:w-56"
      >
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
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={`Odpri podrobnosti za ${destination.name}`}
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
          alt={`${destination.name} — ${destination.tagline}`}
          loading="lazy"
          className="size-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {/* Badge regije (top-left) */}
        <Badge className="absolute left-3 top-3 bg-primary text-primary-foreground shadow-sm">
          {regionLabel(destination.region)}
        </Badge>
        {/* Featured badge (top-right) */}
        {destination.featured ? (
          <Badge className="absolute right-3 top-3 bg-amber-400 text-amber-950 shadow-sm">
            ★ Priporočeno
          </Badge>
        ) : null}
      </div>

      {/* Body */}
      <CardContent className="flex flex-col gap-3 p-4">
        <div>
          <h3 className="text-lg font-semibold leading-tight">
            {destination.name}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
            {destination.tagline}
          </p>
        </div>

        {/* Rating */}
        <div className="flex items-center gap-1.5">
          <Star
            className="size-4 fill-amber-400 text-amber-400"
            aria-hidden="true"
          />
          <span className="text-sm font-medium tabular-nums">
            {destination.rating.toFixed(1)}
          </span>
          <span className="text-xs text-muted-foreground">/ 5</span>
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

        {/* Highlight chipi */}
        <div className="flex flex-wrap gap-1.5">
          {destination.highlights.slice(0, 3).map((h) => (
            <span
              key={h}
              className="rounded-md bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
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
          Več informacij
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="mt-10 flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-muted">
        <Compass className="size-6 text-muted-foreground" aria-hidden="true" />
      </span>
      <p className="text-base font-medium">Ni destinacij za izbrane filtre.</p>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <ImageIcon className="size-3.5" aria-hidden="true" />
        Poskusite spremeniti regijo ali interes.
      </p>
    </div>
  );
}

export default DestinationsSection;
