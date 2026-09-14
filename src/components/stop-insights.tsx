import Link from "next/link";
import {
  Calendar,
  ChevronDown,
  Clock,
  Euro,
  HelpCircle,
  Info,
  TriangleAlert,
} from "lucide-react";

import {
  destinationById,
  durationLabelFor,
  weatherSuitabilityOf,
} from "@/lib/stop-insights";
import type { LocationVisit } from "@/lib/types";

// ============================================================================
// STOP INSIGHTS (Faza 4-1 + 4-3) — razlaga in praktični podatki postanka
// ============================================================================
//
// 4-1 "Zakaj je to priporočeno?": prikaže visit.reason — kratko, podatkovno
//     utemeljeno razlago (interesi, tip skupine, razdalja, vreme, sezona),
//     ki jo je sestavil server iz dejstev. Brez marketinških fraz.
//
// 4-3 "Preveri praktične podatke": prikaže SAMO podatke, ki OBSTOJEJO v
//     datasetu destinacij (trajanje, okvirna cena, sezona, vremenska
//     ustreznost, vir + zadnja posodobitev) + opozorilo, da uporabnik
//     pred obiskom preveri urnike in cene. NI generičnega "Verified"
//     značka — dokler ni dejanskega postopka potrjevanja.
//
// Parkiranje/odpiralni časi za destinacije NE obstajajo v datasetu (obstajajo
// samo pri partnerjih/lokalih, kjer se prikazujejo tam) — zato se tu NE
// prikazujejo. Prazno ≠ izmišljeno.
//
// Datum "posodobljeno" sledi DESTINATIONS_DATA_AS_OF iz stop-insights.ts
// (git-zabeležena zadnja sprememba dataseta destinacij).
// ============================================================================

interface StopInsightsProps {
  visit: LocationVisit;
  /** Jezik prikaza ("sl" | "en" — vse ostale treated kot "sl"). */
  locale: string;
}

const SEASON_LABELS: Record<string, { sl: string; en: string }> = {
  spring: { sl: "pomlad", en: "spring" },
  summer: { sl: "poletje", en: "summer" },
  autumn: { sl: "jesen", en: "autumn" },
  winter: { sl: "zima", en: "winter" },
};

const DATA_AS_OF_LABEL = {
  sl: "13. sep. 2026",
  en: "Sep 13, 2026",
};

const L = {
  why: { sl: "Zakaj ta postanek:", en: "Why this stop:" },
  practical: { sl: "Praktični podatki", en: "Practical info" },
  duration: { sl: "Trajanje", en: "Duration" },
  price: { sl: "Okvirna cena", en: "Estimate" },
  season: { sl: "Sezona", en: "Season" },
  weather: { sl: "Vremenska ustreznost", en: "Weather fit" },
  weatherIndoor: {
    sl: "notranja aktivnost — primerna tudi ob dežju",
    en: "indoor — fine in bad weather",
  },
  weatherMixed: {
    sl: "mešano — kraj ponuja tudi notranje vsebine",
    en: "mixed — indoor options available too",
  },
  weatherOutdoor: {
    sl: "zunanja aktivnost — odvisna od vremena",
    en: "outdoor — weather-dependent",
  },
  source: { sl: "Vir", en: "Source" },
  sourceName: { sl: "Uredniški vodnik destinacij", en: "Editorial destination guide" },
  updated: { sl: "posodobljeno", en: "updated" },
  perPerson: { sl: "/ osebo", en: "/ person" },
  warning: {
    sl: "Pred obiskom preveri urnike, cene in dostopnost na uradni strani lokacije.",
    en: "Before visiting, check opening hours, prices and availability on the location's official site.",
  },
  details: { sl: "Podrobnosti o lokaciji", en: "Location details" },
  methodNote: {
    sl: "Razdalje v razlagah so približek — izračun iz koordinat (cestni faktor 1,3), ne navigacijski podatek.",
    en: "Distances in the reasons are estimates computed from coordinates (road factor 1.3) — not navigation data.",
  },
} as const;

function label(key: keyof typeof L, locale: string): string {
  return locale === "en" ? L[key].en : L[key].sl;
}

export function StopInsights({ visit, locale }: StopInsightsProps) {
  const lang = locale === "en" ? "en" : "sl";
  const dest = destinationById(visit.destination_id);

  const duration = dest ? durationLabelFor(dest.id, lang) : null;
  const price = dest?.costPerPerson;
  const seasons = dest?.bestSeason ?? [];
  const suitability = dest ? weatherSuitabilityOf(dest.type) : null;

  // Praktični podatki se prikažejo, če obstoja KATERIKOLI zapis o destinaciji
  if (!visit.reason && !dest) return null;

  return (
    <div className="mt-2.5 space-y-2">
      {/* FAZA 4-1 — Zakaj je to priporočeno? (dejstva, ne marketing) */}
      {visit.reason && (
        <div className="space-y-1">
          <p className="flex items-start gap-1.5 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs leading-relaxed text-muted-foreground">
            <HelpCircle
              className="mt-0.5 size-3.5 shrink-0 text-primary/70"
              aria-hidden="true"
            />
            <span>
              <span className="font-medium text-foreground/80">
                {label("why", locale)}
              </span>{" "}
              {visit.reason}
            </span>
          </p>
          {/* P1-1 (recenzija): če razlaga navaja razdaljo, je metoda izračuna
              eksplicitno povedana — približek iz koordinat, ne navigacija. */}
          {/\bkm\b/i.test(visit.reason) && (
            <p className="pl-9 text-[10px] leading-relaxed text-muted-foreground/80">
              {label("methodNote", locale)}
            </p>
          )}
        </div>
      )}

      {/* FAZA 4-3 — Praktični podatki: SAMO obstoječi (zložljivo, mobilno prijazno) */}
      {dest && (
        <details className="group text-xs">
          <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1 rounded-md px-1 py-0.5 font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 [&::-webkit-details-marker]:hidden">
            <ChevronDown
              className="size-3.5 transition-transform group-open:rotate-180"
              aria-hidden="true"
            />
            <Info className="size-3.5" aria-hidden="true" />
            {label("practical", locale)}
          </summary>

          <dl className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1.5 rounded-md border border-border/60 bg-card/40 p-2.5 text-muted-foreground sm:grid-cols-2">
            {duration && (
              <div className="flex items-start gap-1.5">
                <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("duration", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("duration", locale)}:
                    </span>{" "}
                    {duration}
                  </dd>
                </div>
              </div>
            )}

            {typeof price === "number" && price > 0 && (
              <div className="flex items-start gap-1.5">
                <Euro className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("price", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("price", locale)}:
                    </span>{" "}
                    €{price}
                    {label("perPerson", locale)}
                  </dd>
                </div>
              </div>
            )}

            {seasons.length > 0 && (
              <div className="flex items-start gap-1.5">
                <Calendar className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("season", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("season", locale)}:
                    </span>{" "}
                    {seasons
                      .map((s) => SEASON_LABELS[s]?.[lang] ?? s)
                      .join(", ")}
                  </dd>
                </div>
              </div>
            )}

            {suitability && (
              <div className="flex items-start gap-1.5">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <div>
                  <dt className="sr-only">{label("weather", locale)}</dt>
                  <dd>
                    <span className="font-medium text-foreground/80">
                      {label("weather", locale)}:
                    </span>{" "}
                    {suitability === "indoor"
                      ? label("weatherIndoor", locale)
                      : suitability === "mixed"
                      ? label("weatherMixed", locale)
                      : label("weatherOutdoor", locale)}
                  </dd>
                </div>
              </div>
            )}

            <div className="flex items-start gap-1.5 sm:col-span-2">
              <div>
                <dt className="sr-only">{label("source", locale)}</dt>
                <dd>
                  <span className="font-medium text-foreground/80">
                    {label("source", locale)}:
                  </span>{" "}
                  {label("sourceName", locale)} · {label("updated", locale)}{" "}
                  {DATA_AS_OF_LABEL[lang]}
                </dd>
              </div>
            </div>
          </dl>

          {/* Opozorilo + povezava na podrobnosti destinacije */}
          <p className="mt-1.5 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground/90">
            <TriangleAlert
              className="mt-0.5 size-3 shrink-0 text-amber-600/80"
              aria-hidden="true"
            />
            <span>
              {label("warning", locale)}{" "}
              <Link
                href={`/destinacija/${dest.slug}`}
                className="font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              >
                {label("details", locale)} →
              </Link>
            </span>
          </p>
        </details>
      )}
    </div>
  );
}
