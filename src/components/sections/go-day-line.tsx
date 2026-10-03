"use client";

// ============================================================================
// TASK 102 — GO MODE: SHEMA DNEVA + ZEMLJEVID DNEVA (predstavitvena, 1.160.0)
// ============================================================================
// Celoten dan na en pogled — vizualni odgovor na najmočnejšo prednost
// vodilčih (Wanderlog: pregled poti na zemljevidu), a ISKRENO in BREZ
// OMREŽJA:
//
//  - SHEMA (SVG črta po vrstnem redu načrta): opravljeni ✓ / preskočeni
//    (prikazni zamik) / trenutni cilj (krogec + razdalja, če je GPS para
//    znana) / prihodnji. SHAMATSKA — vrstni red, ne geografija (to POMO).
//  - ZEMLJEVID DNEVA: izrecno ZUNANNA povezava (Maps URL API) celotnega
//    dneva kot poti z vmesnimi točkami — enak handoff kanon kot NAVIGIRAJ
//    (go-nav.ts). Brez para veljavnih koordinat povezave NI (fail-closed).
//
// Hidracijsko varno: ČISTO predstavitvena komponenta — vsi vhodi so props
// (že hidriran GoView), 0 lokalnega stanja, 0 učinkov (SSR/CSR enako).
// ============================================================================

import { ExternalLink, Map as MapIcon } from "lucide-react";

import {
  DAY_LINE_LABELS,
  DAY_MAP_LABELS,
  DAY_MAP_MAX_STOPS,
  buildDayMapUrl,
  type GoDayLineItem,
} from "@/lib/journey/day-line";
// ISSUE #24 Sklop 8 (1.170.0): 6-jezični izpis (faza 2).
import { GL, GFn, type GoLang, type GoStrings } from "@/lib/journey/go-lang";

/** Vrstni red postankov dneva (+ geo v elementih) + živi GPS (opcijsko). */
export interface GoDayLineProps {
  line: GoDayLineItem[];
  /** Živi GPS (izhodišče poti v zemljevidu) — opcijsko, iskreno. */
  origin?: { lat: number; lng: number } | null;
  lang: GoLang;
}

/** Barvno-znakovni slovar stanj (iskreni prikaz, ne okras). */
const STATE_STYLE: Record<
  GoDayLineItem["state"],
  { dot: string; icon: string; label: string; line: string }
> = {
  done: {
    dot: "border-emerald-600 bg-emerald-600 text-white",
    icon: "text-emerald-600",
    label: "text-emerald-700",
    line: "bg-emerald-400",
  },
  skipped: {
    dot: "border-muted-foreground/30 bg-muted text-muted-foreground/50",
    icon: "text-muted-foreground/40",
    label: "text-muted-foreground/50 line-through",
    line: "bg-muted-foreground/20",
  },
  current: {
    dot: "border-primary bg-primary text-primary-foreground ring-4 ring-primary/20",
    icon: "text-primary",
    label: "text-primary font-medium",
    line: "bg-primary/30",
  },
  arrived: {
    dot: "border-emerald-600 bg-emerald-500 text-white ring-4 ring-emerald-500/20",
    icon: "text-emerald-600",
    label: "text-emerald-700 font-medium",
    line: "bg-emerald-400",
  },
  upcoming: {
    dot: "border-muted-foreground/40 bg-background text-muted-foreground",
    icon: "text-muted-foreground/70",
    label: "text-muted-foreground",
    line: "bg-muted-foreground/20",
  },
};

const t = (o: GoStrings, lang: GoLang) => GL(lang, o);

/**
 * Shema dneva + gumb za zunanji zemljevid. Prazna linija → NE rendra
 * (iskrena odsotnost, kanon GoMode). Horizontalno scroll za dolge dneve.
 */
export function GoDayLine({ line, origin, lang }: GoDayLineProps) {
  if (line.length === 0) return null;

  const validStops = line.filter(
    (s) =>
      typeof s.lat === "number" &&
      typeof s.lng === "number" &&
      Number.isFinite(s.lat) &&
      Number.isFinite(s.lng)
  );
  const mapUrl = buildDayMapUrl(validStops, origin ?? null);
  const capped = validStops.length > DAY_MAP_MAX_STOPS;

  return (
    <section
      aria-label={t(DAY_LINE_LABELS.title, lang)}
      className="rounded-lg border bg-muted/20 px-3 py-2.5"
    >
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <MapIcon className="h-3 w-3" aria-hidden="true" />
        {t(DAY_LINE_LABELS.title, lang)}
      </p>

      {/* Shema — horizontalni scroll (mobile-first), enak tip marginalije
          kot daySwitcher. role=list/istitem za bralnike + sr-only stanja. */}
      <div className="overflow-x-auto pb-1">
        <ol className="flex min-w-max items-start gap-0" role="list">
          {line.map((item, i) => {
            const style = STATE_STYLE[item.state];
            const isLast = i === line.length - 1;
            return (
              <li
                key={item.key}
                className="flex items-start"
                role="listitem"
                aria-current={
                  item.state === "current" || item.state === "arrived"
                    ? "step"
                    : undefined
                }
              >
                {/* ISSUE #24 Sklop 9 (1.172.1) — `relative`: sr-only stanja so
                    position:absolute; brez pozicioniranega prednika je njihov
                    containing block STRAN (ne vsebina scroll zabojnika) → pri
                    4+ postankih (npr. po nearby vstavku) so razširili
                    documentElement.scrollWidth čez zaslon (merjeno 462 > 390).
                    Z `relative` na stolpcu postanka jih vsebuje scroll. */}
                <div className="relative flex w-24 flex-col items-center gap-1 px-1 text-center sm:w-28">
                  <div
                    className={`flex size-8 items-center justify-center rounded-full border text-sm ${style.dot}`}
                    aria-hidden="true"
                  >
                    {item.state === "done" || item.state === "arrived" ? (
                      <span className="text-xs font-bold">✓</span>
                    ) : (
                      <span className="text-sm leading-none">{item.icon}</span>
                    )}
                  </div>
                  <p className={`line-clamp-2 text-[11px] leading-tight ${style.label}`}>
                    {item.title}
                  </p>
                  {item.timeStart && (
                    <p className="text-[10px] tabular-nums text-muted-foreground">
                      {item.timeStart}
                    </p>
                  )}
                  {item.distanceM != null && (
                    <p className="text-[10px] font-medium tabular-nums text-primary">
                      {item.distanceM} m
                    </p>
                  )}
                  <span className="sr-only">
                    {t(DAY_LINE_LABELS.state[item.state], lang)}
                  </span>
                </div>
                {!isLast && (
                  <div
                    className={`mt-4 h-0.5 w-8 shrink-0 sm:w-10 ${style.line}`}
                    aria-hidden="true"
                  />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      <p className="mt-1.5 text-[10px] italic text-muted-foreground">
        {t(DAY_LINE_LABELS.schematicHint, lang)}
      </p>

      {/* Zemljevid dneva — IZRECNO zunanji handoff (cel dan kot pot). */}
      {mapUrl ? (
        <div className="mt-2">
          <a
            href={mapUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-md border px-3 py-2 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            title={t(DAY_MAP_LABELS.external, lang)}
          >
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            {GFn(lang, DAY_MAP_LABELS.open)(validStops.length)}
          </a>
          {capped && (
            <p className="mt-1 text-[10px] text-muted-foreground">
              {GFn(lang, DAY_MAP_LABELS.cappedHint)(DAY_MAP_MAX_STOPS)}
            </p>
          )}
        </div>
      ) : (
        validStops.length > 0 && (
          <p className="mt-2 text-[10px] text-muted-foreground">
            {t(DAY_MAP_LABELS.unavailable, lang)}
          </p>
        )
      )}
    </section>
  );
}
