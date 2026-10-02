// ============================================================================
// ISSUE #24 — Sklop 6 (1.168.0): TISKANA PLATNICA POTI (»travel book lite«)
// ----------------------------------------------------------------------------
// Polarstepsov Travel Book je plačljivi fizični izdelek (DO NOT COPY —
// monetizacija); naša poštena različica je BREZPLAČNA tiskana platnica na
// vrhu PDF izvoza deljene poti (/pot/[shareId] → Natisni → Shrani kot PDF).
//
// Design po analizi UIUX-BENCHMARK-2026-10-02 §P3:
//   - IZKLJUČNO podatki (ime, datumi, statistika) — nič izmišljenih vsebin;
//   - strežniški RSC (brez klientne direktive) — izriše se SAMO ob tiskanju
//     (hidden print:block), na zaslonu ne zavzame prostora;
//   - fail-closed: manjkajoči podatek → ploščica/vrstica se izpusti
//     (nikoli „0 min" ali „€0" za neznane vrednosti);
//   - črno-bela tiskana paleta (.pot-page print predpisi) velja avtomatsko.
// ============================================================================

import {
  formatDrivingMinutes,
  type PrintCoverStats,
} from "@/lib/print-book";
// formatDateRangeSI z ENIM datumom vrne genitivno obliko (»2. oktobra 2026«)
// — isti SL kanon kot datumska obsega poti (trip-dates).
import { formatDateRangeSI, parseISODateLocal } from "@/lib/trip-dates";

/** EN obseg: »10–12 October 2026« / »28 September – 2 October 2026« /
 *  »10 October 2026« (en-GB dolga oblika; parity strukture s SL kanonom). */
function formatRangeEn(start: string, end: string | null): string {
  const fmt = (iso: string, withYear: boolean) => {
    const dt = new Date(`${iso}T00:00:00Z`);
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      ...(withYear ? { year: "numeric" } : {}),
      timeZone: "UTC",
    }).format(dt);
  };
  if (!end || end === start) return fmt(start, true);
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  if (sy === ey && sm === em) {
    const day = Number(end.slice(8, 10));
    const month = new Intl.DateTimeFormat("en-GB", {
      month: "long",
      timeZone: "UTC",
    }).format(new Date(`${end}T00:00:00Z`));
    return `${Number(start.slice(8, 10))}–${day} ${month} ${sy}`;
  }
  if (sy === ey) return `${fmt(start, false)} – ${fmt(end, true)}`;
  return `${fmt(start, true)} – ${fmt(end, true)}`;
}

/** Obseg poti po jeziku: SL → genitivni kanon trip-dates; EN → en-GB. */
function formatTripRange(
  tripDates: { start: string; end: string | null } | null,
  lang: PrintCoverLang
): string | null {
  if (!tripDates) return null;
  if (lang === "sl") {
    return formatDateRangeSI(tripDates.start, tripDates.end ?? undefined);
  }
  return formatRangeEn(tripDates.start, tripDates.end);
}

/** Jezik platnice — isti kanon kot SharedTripScreen (getLocale → sl|en). */
export type PrintCoverLang = "sl" | "en";

const L = {
  sl: {
    wordmark: "Discover Slovenia AI",
    daysLabel: "dni",
    daysOne: "dan",
    stopsLabel: "postankov",
    stopsOne: "postanek",
    drivingLabel: "vožnje",
    ticketsLabel: "ocene vstopnin",
    trackedLabel: (n: number) =>
      n === 1 ? "zabeležen strošek" : n < 5 ? "zabeleženi stroški" : "zabeleženih stroškov",
    createdLabel: "Načrt ustvarjen",
    // Iskrena oznaka vira — ISTO besedilo kot hero glava (shared-trip.tsx)
    // in strežniški PDF izvoz (trip-itinerary-pdf.ts STRINGS) — usklajen
    // izvozni kanal (P11 provenanca).
    sourceAi: "AI načrt",
    sourceDeterministic: "Načrt brez AI (deterministični motor)",
    sourceFallback: "Rezervni načrt",
  },
  en: {
    wordmark: "Discover Slovenia AI",
    daysLabel: "days",
    daysOne: "day",
    stopsLabel: "stops",
    stopsOne: "stop",
    drivingLabel: "driving",
    ticketsLabel: "est. tickets",
    trackedLabel: (n: number) => (n === 1 ? "tracked expense" : "tracked expenses"),
    createdLabel: "Plan created",
    sourceAi: "AI plan",
    sourceDeterministic: "Itinerary without AI (deterministic engine)",
    sourceFallback: "Fallback plan",
  },
} as const;

interface PrintCoverProps {
  /** Ime poti (že razrešeno z nadomestnim imenom s strani ekrana). */
  name: string;
  /** Jezik izpisa ({sl,en} — L-vzorec površine /pot). */
  lang: PrintCoverLang;
  /** Statistika iz čistega delivca computePrintCoverStats. */
  stats: PrintCoverStats;
  /** ISO datum ustvarjanja načrta (neobvezno — vrstica se izpusti, če
   *  datum ni razumljiv). */
  createdAt?: string;
}

/** Defenzivno formatiran datum ustvarjanja — SL genitiv (»2. oktobra
 *  2026«, isti kanon kot obsega poti — formatDateRangeSI z enim datumom),
 *  EN dolga oblika (»2 October 2026«) — null ob neveljavnem ISO (vrstica
 *  se čisto izpusti). */
function formatCreatedAt(iso: string | undefined, lang: PrintCoverLang): string | null {
  if (typeof iso !== "string" || iso.length < 8) return null;
  if (lang === "sl") {
    // createdAt je CEL ISO datetime (npr. 2026-10-02T20:57:11.029Z) —
    // trip-dates kanon sprejema SAMO YYYY-MM-DD, zato vzamemo datumski
    // del (prvih 10 znakov). Uspešno parsan → genitivna oblika kanona;
    // ob nerazumljivem vhodu raje izpustimo vrstico (ne izpišemo surovega).
    const datePart = iso.slice(0, 10);
    if (parseISODateLocal(datePart) === null) return null;
    return formatDateRangeSI(datePart);
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(dt);
  } catch {
    // zavržena/okrnjena ICU — surova številčna oblika ostane berljiva
    return `${dt.getDate()} ${dt.getMonth() + 1} ${dt.getFullYear()}`;
  }
}

/** Slovenščina — ISTI kanon kot strežniški PDF izvoz (trip-itinerary-pdf.ts
 *  STRINGS): 1 dan / 2 dneva / 3+ dni (usklajen izvozni kanal). */
function daysWordSl(n: number): string {
  if (n === 1) return "dan";
  if (n === 2) return "dneva";
  return "dni";
}

/** Slovenščina — ISTI kanon kot strežniški PDF izvoz: 1 postanek /
 *  2–4 postanki / 5+ postankov. */
function stopsWordSl(n: number): string {
  if (n === 1) return "postanek";
  if (n < 5) return "postanki";
  return "postankov";
}

/**
 * Tiskana platnica — izrise se IZKLJUČNO v PDF izhodu (hidden na zaslonu,
 * print:block pri tiskanju; aria-hidden — nevidna vsebina ni v bralnikih).
 */
export function PrintCover({ name, lang, stats, createdAt }: PrintCoverProps) {
  const t = L[lang];
  const created = formatCreatedAt(createdAt, lang);
  const driving = stats.drivingMinutes
    ? formatDrivingMinutes(stats.drivingMinutes)
    : "";
  // Obseg poti po jeziku (SL genitivni kanon / EN en-GB) — ISO par iz
  // čistega delivca je JEZIK-NEODVISEN (formatiranje živi tu).
  const tripRange = formatTripRange(stats.tripDates, lang);
  // Iskrena oznaka vira (hero glavo v printu nadomesti platnica — vir
  // proveniance živi tu; neznana vrednost → brez vrstice).
  const sourceLabel = stats.source
    ? stats.source === "ai"
      ? t.sourceAi
      : stats.source === "deterministic"
        ? t.sourceDeterministic
        : t.sourceFallback
    : "";

  // Ploščice statistike — SAMO za dejansko prisotne podatke (fail-closed).
  const tiles: { value: string; label: string }[] = [
    {
      value: String(stats.days),
      label: lang === "sl" ? daysWordSl(stats.days) : stats.days === 1 ? t.daysOne : t.daysLabel,
    },
    {
      value: String(stats.stops),
      label: lang === "sl" ? stopsWordSl(stats.stops) : stats.stops === 1 ? t.stopsOne : t.stopsLabel,
    },
  ];
  if (driving) {
    // ~ = oznaka ocene: hevristika je približek (isti kanon kot povezovalnik
    // plannerja »~X km · ~Y min« in noge strežniškega PDF izvoza)
    tiles.push({ value: `~${driving}`, label: t.drivingLabel });
  }
  if (stats.estimatedCostEur !== null) {
    tiles.push({
      value: `≈ €${stats.estimatedCostEur.toLocaleString("sl-SI", { maximumFractionDigits: 0 })}`,
      label: t.ticketsLabel,
    });
  }
  if (stats.expensesEur !== null) {
    tiles.push({
      value: `€${stats.expensesEur.toLocaleString("sl-SI", { maximumFractionDigits: 0 })}`,
      label: t.trackedLabel(stats.expensesCount),
    });
  }

  return (
    <section
      className="mb-8 hidden border-b border-border pb-6 print:block"
      aria-hidden="true"
      data-testid="print-cover"
    >
      {/* Znamka — majhna, razmaknjena (tiskana paleta jo prisili v črno) */}
      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
        {t.wordmark}
      </p>

      {/* Ime poti — naslov platnice */}
      <h2 className="mt-2 text-3xl font-bold leading-tight text-foreground">
        {name}
      </h2>

      {/* Vir načrta — iskrena provenanca (hero glava se v printu skrije) */}
      {sourceLabel && (
        <p className="mt-1 text-xs font-medium text-muted-foreground">
          {sourceLabel}
        </p>
      )}

      {/* Datuma: obsega poti (če je znana) + datum ustvarjanja */}
      {(tripRange || created) && (
        <p className="mt-1.5 text-sm text-muted-foreground">
          {tripRange}
          {tripRange && created ? " · " : ""}
          {created ? `${t.createdLabel} ${created}` : ""}
        </p>
      )}

      {/* Statistika — črte iz podatkov, brez izmišljenih vrednosti */}
      <dl className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
        {tiles.map((tile) => (
          <div key={tile.label} className="flex flex-col">
            <dt className="sr-only">{tile.label}</dt>
            <dd className="text-xl font-bold tabular-nums">{tile.value}</dd>
            <dd className="text-xs text-muted-foreground">{tile.label}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
