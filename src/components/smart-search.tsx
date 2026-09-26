"use client";

import * as React from "react";
import { useState, useCallback, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useLocale } from "next-intl";
import {
  Search,
  Loader2,
  Sparkles,
  MapPin,
  Store,
  Package,
  Compass,
  X,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
// TASK 8 / D8-D (§3.3, P-SEARCH-1): kanonski "Dodaj v mojo pot" na vrsticah
// rezultatov — iskanje z najvišjo namero je bila mrtva ulica (samo skok).
import { AddToTripButton } from "@/components/add-to-trip-button";
import type { MyTripInput } from "@/lib/my-trip";
import { cn } from "@/lib/utils";
import { useRouter } from "@/i18n/navigation";
import {
  searchResultHref,
  type SmartSearchResultRef,
} from "@/lib/search-result-nav";

interface SearchResult {
  destinations: Array<{
    id: string;
    /** Kanonski slug za /destinacija/[slug] (4 od 38 destinacij ima id ≠ slug). */
    slug?: string;
    name: string;
    tagline: string;
    reason: string;
  }>;
  listings: Array<{ id: string; name: string; category: string; reason: string }>;
  products: Array<{ id: string; name: string; category: string; reason: string }>;
  experiences: Array<{ id: string; name: string; category: string; reason: string }>;
  summary: string;
  source: "ai" | "fallback";
}

// I18N-FIX (revizija 1.33.0, 16-d P2): primeri so bili hardkodirani SL —
// zdaj pridejo iz sporočil (planner.smartSearch.examples) po lokalu.

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
  const t = useTranslations("planner.smartSearch");
  const locale = useLocale();
  const isEn = locale === "en";
  const exampleQueries = t.raw("examples") as string[];
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult | null>(null);
  // TASK 4 / K-5 (UX FIX PASS): iskrena stanja iskanja — prej je bila napaka
  // tiho pogoltnjena (catch → setResults(null) → "ni zadetkov", kar je
  // ZAVAJAJOČE: iskanje NI uspelo, ni da ni zadetkov). Zdaj: izrecno
  // sporočilo + elapsed hint (AI lahko traja) + abort ob spremembi vnosa
  // (prej sta se zastareli odgovori lahko prekrivala).
  const [error, setError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const requestIdRef = useRef(0);

  const L = {
    searching: { sl: "Iščem …", en: "Searching …" },
    searchingSlow: {
      sl: "AI razumevanje lahko traja nekaj sekund — po 15 s pade na hitro iskanje.",
      en: "AI understanding can take a few seconds — after 15 s it falls back to fast search.",
    },
    failed: {
      sl: "Iskanje trenutno ni uspelo — poskusi znova.",
      en: "Search failed right now — please try again.",
    },
    seconds: { sl: "s", en: "s" },
  } as const;

  // K-5: števec med nalaganjem (1 Hz, po koncu ponastavitev).
  useEffect(() => {
    if (!loading) {
      setElapsedSeconds(0);
      return;
    }
    const started = Date.now();
    const tick = setInterval(
      () => setElapsedSeconds(Math.floor((Date.now() - started) / 1000)),
      1000
    );
    return () => clearInterval(tick);
  }, [loading]);

  // Debounced search
  useEffect(() => {
    if (!query.trim() || query.trim().length < 3) {
      setResults(null);
      setError(null);
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    setLoading(true);
    setError(null);
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/smart-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: query.trim(), limit: 3 }),
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Napaka pri iskanju");
        const data: SearchResult = await res.json();
        // K-5: sprejmi SAMO odgovor najnovejše zahteve (zastareli odpadejo)
        if (requestIdRef.current === thisRequestId) {
          setResults(data);
        }
      } catch (err) {
        // Preklic ob spremembi vnosa NI napaka uporabniku
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (requestIdRef.current === thisRequestId) {
          setResults(null);
          setError(L.failed[isEn ? "en" : "sl"]);
        }
      } finally {
        if (requestIdRef.current === thisRequestId) {
          setLoading(false);
        }
      }
    }, 600); // 600ms debounce

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, isEn]);

  const handleClose = useCallback(() => {
    onOpenChange(false);
    // Počisti po zaprtju (z zakasnitvijo da uporabnik ne vidi blink)
    setTimeout(() => {
      setQuery("");
      setResults(null);
      setError(null);
    }, 300);
  }, [onOpenChange]);

  // ISSUE #5 T5-B / H1 (fix wave 1): rezultati so bili MRTVI KLIKI —
  // listings/izdelki/doživetja so imeli onClick = samo handleClose(),
  // destinacija pa je klicala onSelectDestination?.(id), ki ni bil nikoli
  // podan (optional chaining = no-op). Zdaj VSAK rezultat navigira po
  // preslikavi iz src/lib/search-result-nav.ts (en vir resnice) in dialog
  // se zapre (handleClose v klicatelju). Tipkovna dostopnost ostaja —
  // rezultati so <button type="button"> (fokus/tab/enter nespremenjeni).
  const navigateResult = useCallback(
    (ref: SmartSearchResultRef) => {
      const href = searchResultHref(ref);
      if (href) router.push(href);
    },
    [router]
  );

  const hasResults = results && (
    results.destinations.length > 0 ||
    results.listings.length > 0 ||
    results.products.length > 0 ||
    results.experiences.length > 0
  );

  return (
    <Dialog open={open} onOpenChange={(v) => v ? onOpenChange(v) : handleClose()}>
      <DialogContent className="max-w-2xl gap-0 p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">{t("title")}</DialogTitle>
        <DialogDescription className="sr-only">{t("description")}</DialogDescription>

        {/* Search bar */}
        <div className="flex items-center gap-2 border-b border-border p-4">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <Search className="size-4 text-primary" aria-hidden="true" />
          </div>
          <Input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("placeholder")}
            autoFocus
            className="flex-1 border-0 bg-transparent px-0 text-base shadow-none focus-visible:ring-0"
            aria-label={t("queryAria")}
          />
          {loading && (
            <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden="true" />
          )}
          {query && !loading && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label={t("clearAria")}
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
                {t("examplesTitle")}
              </p>
              <div className="flex flex-wrap gap-2">
                {exampleQueries.map((example) => (
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

          {query.trim() && !loading && error && (
            <div
              role="alert"
              className="flex items-start gap-2 p-4 text-sm text-amber-700 dark:text-amber-400"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          {query.trim() && !loading && !error && !hasResults && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Search className="mx-auto mb-2 size-8 opacity-40" aria-hidden="true" />
              {t("noResults", { query })}
            </div>
          )}

          {loading && (
            <div className="space-y-3 p-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />
              ))}
              <p
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                {L.searching[isEn ? "en" : "sl"]}
                {elapsedSeconds > 0 && (
                  <span className="tabular-nums">
                    {" "}· {elapsedSeconds} {L.seconds[isEn ? "en" : "sl"]}
                  </span>
                )}
              </p>
              {elapsedSeconds >= 5 && (
                <p className="text-xs text-muted-foreground/80">
                  {L.searchingSlow[isEn ? "en" : "sl"]}
                </p>
              )}
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
                  label={t("destinations")}
                  items={results.destinations.map((d) => ({
                    id: d.id,
                    title: d.name,
                    subtitle: d.tagline,
                    reason: d.reason,
                    onClick: () => {
                      // H1: klik na destinacijo NAVIGIRA v hub — prej no-op.
                      // Prednost ima zunanja ključka (navigation.tsx jo je
                      // priklopil); slug je kanonski segment (id je rezerva —
                      // hub stran razreši oboje).
                      if (onSelectDestination) {
                        onSelectDestination(d.slug ?? d.id);
                      } else {
                        navigateResult({ kind: "destination", id: d.id, slug: d.slug ?? null });
                      }
                      handleClose();
                    },
                    // TASK 8 / D8-D: href je ISTA pot, kamor vrstica navigira
                    // (searchResultHref — en vir resnice). Identiteta: slug
                    // (kanonski) z rezervo id (kot hub stran).
                    tripItem: {
                      kind: "destination",
                      refId: d.slug ?? d.id,
                      title: d.name,
                      subtitle: d.tagline,
                      href: searchResultHref({ kind: "destination", id: d.id, slug: d.slug ?? null }) ?? "/destinacije",
                      source: "smart-search",
                    },
                  }))}
                />
              )}

              {/* Listings — H1: navigacija v imenik lokalov (prej mrtev klik) */}
              {results.listings.length > 0 && (
                <ResultGroup
                  icon={<Store className="size-4 text-primary" aria-hidden="true" />}
                  label={t("listings")}
                  items={results.listings.map((l) => ({
                    id: l.id,
                    title: l.name,
                    subtitle: l.category,
                    reason: l.reason,
                    onClick: () => {
                      navigateResult({ kind: "listing", id: l.id });
                      handleClose();
                    },
                    // TASK 8 / D8-D: ista pot kot vrstica (imenik lokalov —
                    // modal se odpre iz klientnega stanja, globoke povezave ni)
                    tripItem: {
                      kind: "listing",
                      refId: l.id,
                      title: l.name,
                      subtitle: l.category,
                      href: searchResultHref({ kind: "listing", id: l.id }) ?? "/lokali",
                      source: "smart-search",
                    },
                  }))}
                />
              )}

              {/* Products — H1: navigacija na tržnico (prej mrtev klik) */}
              {results.products.length > 0 && (
                <ResultGroup
                  icon={<Package className="size-4 text-primary" aria-hidden="true" />}
                  label={t("products")}
                  items={results.products.map((p) => ({
                    id: p.id,
                    title: p.name,
                    subtitle: p.category,
                    reason: p.reason,
                    onClick: () => {
                      navigateResult({ kind: "product", id: p.id });
                      handleClose();
                    },
                    // TASK 8 / D8-D: ista pot kot vrstica (tržnica)
                    tripItem: {
                      kind: "product",
                      refId: p.id,
                      title: p.name,
                      subtitle: p.category,
                      href: searchResultHref({ kind: "product", id: p.id }) ?? "/trznica",
                      source: "smart-search",
                    },
                  }))}
                />
              )}

              {/* Experiences — H1: navigacija na doživetja (prej mrtev klik) */}
              {results.experiences.length > 0 && (
                <ResultGroup
                  icon={<Compass className="size-4 text-primary" aria-hidden="true" />}
                  label={t("experiences")}
                  items={results.experiences.map((e) => ({
                    id: e.id,
                    title: e.name,
                    subtitle: e.category,
                    reason: e.reason,
                    onClick: () => {
                      navigateResult({ kind: "experience", id: e.id });
                      handleClose();
                    },
                    // TASK 8 / D8-D: ista pot kot vrstica (doživetja)
                    tripItem: {
                      kind: "experience",
                      refId: e.id,
                      title: e.name,
                      subtitle: e.category,
                      href: searchResultHref({ kind: "experience", id: e.id }) ?? "/dozivetja",
                      source: "smart-search",
                    },
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
  /** TASK 8 / D8-D: predmet zbirke "Moja pot" za kanonski dodaj na vrstici. */
  tripItem?: MyTripInput;
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
          // TASK 8 / D8-D: vrstica je zdaj vsebnik <div> z dvema SOSEDOVSKIMA
          // gumboma (navigacija + kanonski dodaj) — NE vgnezdena gumba v
          // gumbu (neveljaven HTML). Gumb sama ustavi propagacijo, soseda
          // pa se klikov sploh ne dotakne.
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-lg border border-transparent p-2.5 transition-colors hover:border-border hover:bg-muted/50"
          >
            <button
              type="button"
              onClick={item.onClick}
              className="flex min-w-0 flex-1 items-start gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  <p className="shrink-0 text-[11px] text-muted-foreground">{item.subtitle}</p>
                </div>
                <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{item.reason}</p>
              </div>
            </button>
            {item.tripItem ? (
              <AddToTripButton
                variant="compact"
                item={item.tripItem}
                className="shrink-0"
              />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
