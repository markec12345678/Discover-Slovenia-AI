"use client";

import * as React from "react";
import { useState, useCallback, useEffect } from "react";
import {
  Search,
  Loader2,
  Sparkles,
  MapPin,
  Store,
  Package,
  Compass,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface SearchResult {
  destinations: Array<{ id: string; name: string; tagline: string; reason: string }>;
  listings: Array<{ id: string; name: string; category: string; reason: string }>;
  products: Array<{ id: string; name: string; category: string; reason: string }>;
  experiences: Array<{ id: string; name: string; category: string; reason: string }>;
  summary: string;
  source: "ai" | "fallback";
}

const EXAMPLE_QUERIES = [
  "miren vikend ob reki",
  "kam z otroki če dežuje",
  "romantična večerja blizu Bleda",
  "avantura v gorah",
  "lokalna vina in sir",
  "družinski izlet na obalo",
];

interface SmartSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectDestination?: (destId: string) => void;
}

/**
 * SmartSearch — naravno-jezikovno iskanje po platformi.
 *
 * Uporabnik napiše naravno (npr. "miren vikend ob reki") in AI razume
 * namen ter vrne matching destinacije, lokale, izdelke in izkušnje.
 *
 * Rezultati so grupirani po kategoriji z AI-jevo razlago "zakaj".
 */
export function SmartSearch({ open, onOpenChange, onSelectDestination }: SmartSearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setResults(null);
      return;
    }

    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/smart-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), limit: 3 }),
        });
        if (!res.ok) throw new Error("Napaka pri iskanju");
        const data: SearchResult = await res.json();
        setResults(data);
      } catch {
        setResults(null);
      } finally {
        setLoading(false);
      }
    }, 600); // 600ms debounce

    return () => clearTimeout(timer);
  }, [query]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Počisti po zaprtju (z zakasnitvijo da uporabnik ne vidi blink)
    setTimeout(() => {
      setQuery("");
      setResults(null);
    }, 300);
  }, [onOpenChange]);

  const hasResults = results && (
    results.destinations.length > 0 ||
    results.listings.length > 0 ||
    results.products.length > 0 ||
    results.experiences.length > 0
  );

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(v) : handleClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">AI iskanje</DialogTitle>
        <DialogDescription className="sr-only">
          Naravno-jezikovno iskanje po destinacijah, lokalcih, izdelkih in izkušnjah
        </DialogDescription>

        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border p-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Search className="size-4 text-primary" aria-hidden="true" />
          </div>
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Opiši kar iščeš... npr. 'miren vikend ob reki'"
            autoFocus
            className="flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            aria-label="Iskalni niz"
          />
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Počisti iskanje"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}
        </div>

        {/* Results / Examples */}
        <div className="max-h-[60vh] overflow-y-auto">
          {!query.trim() && (
            <div className="p-4">
              <p className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Primera vprašanj
              </p>
              <div className="flex flex-wrap gap-2">
                {EXAMPLE_QUERIES.map((example) => (
                  <button
                    key={example}
                    type="button"
                    onClick={() => setQuery(example)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                  >
                    <Sparkles className="size-3 text-primary" aria-hidden="true" />
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {query.trim() && !loading && !hasResults && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 size-8 opacity-40" aria-hidden="true" />
              Ni najdenih rezultatov za "{query}"
            </div>
          )}

          {loading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
            </div>
          )}

          {results && hasResults && (
            <div className="space-y-4 p-4">
              {/* AI summary */}
              {results.summary && (
                <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
                  <p className="text-sm text-foreground">{results.summary}</p>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "ml-auto shrink-0 text-[9px]",
                      results.source === "fallback"
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                    )}
                  >
                    {results.source === "fallback" ? "fallback" : "AI"}
                  </Badge>
                </div>
              )}

              {/* Destinations */}
              {results.destinations.length > 0 && (
                <ResultGroup
                  icon={<MapPin className="size-4 text-primary" aria-hidden="true" />}
                  label="Destinacije"
                  items={results.destinations.map((d) => ({
                    id: d.id,
                    title: d.name,
                    subtitle: d.tagline,
                    reason: d.reason,
                    onClick: () => {
                      onSelectDestination?.(d.id);
                      handleClose();
                    },
                  }))}
                />
              )}

              {/* Listings */}
              {results.listings.length > 0 && (
                <ResultGroup
                  icon={<Store className="size-4 text-primary" aria-hidden="true" />}
                  label="Lokalci"
                  items={results.listings.map((l) => ({
                    id: l.id,
                    title: l.name,
                    subtitle: l.category,
                    reason: l.reason,
                    onClick: () => handleClose(),
                  }))}
                />
              )}

              {/* Products */}
              {results.products.length > 0 && (
                <ResultGroup
                  icon={<Package className="size-4 text-primary" aria-hidden="true" />}
                  label="Izdelki"
                  items={results.products.map((p) => ({
                    id: p.id,
                    title: p.name,
                    subtitle: p.category,
                    reason: p.reason,
                    onClick: () => handleClose(),
                  }))}
                />
              )}

              {/* Experiences */}
              {results.experiences.length > 0 && (
                <ResultGroup
                  icon={<Compass className="size-4 text-primary" aria-hidden="true" />}
                  label="Izkušnje"
                  items={results.experiences.map((e) => ({
                    id: e.id,
                    title: e.name,
                    subtitle: e.category,
                    reason: e.reason,
                    onClick: () => handleClose(),
                  }))}
                />
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ResultItem {
  id: string;
  title: string;
  subtitle: string;
  reason: string;
  onClick: () => void;
}

function ResultGroup({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: ResultItem[];
}) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </h3>
      <div className="space-y-1">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={item.onClick}
            className="flex w-full items-start gap-3 rounded-lg border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-muted/50"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-2">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="shrink-0 text-[11px] text-muted-foreground">{item.subtitle}</p>
              </div>
              <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.reason}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
