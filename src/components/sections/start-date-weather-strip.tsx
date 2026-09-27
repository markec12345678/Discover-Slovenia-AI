"use client";

// ============================================================================
// P0-3 (Issue #13 / G7 — UX BENCHMARK 2026): „Najboljši dnevi" v datumskem
// polju načrtovalnika — odločitveni pomočnik PRED generacijo (Kayak/Hopper
// date-picker vzorec).
// ============================================================================
// NAMEN: uporabnik, ki izbere datum odhoda, do tedaj ni videl NOBENEGA
// vremenskega konteksta — vreme se je prikazalo šele na generiranih dnevih
// (prepozno za odločitev). Ta mini pas pod datumskim poljem pokaže ŽIVO
// dnevno napoved okoli izbire + čip z najboljšim dnevom za začetek.
//
// ISKRENOST (isti kanon kot trip-weather §TASK 66 / stop-insights):
//  · vir = obstoječi /api/weather?start=..&end=.. (Open-Meteo, 15-min
//    strežniški cache, brez ključa) — NI mock;
//  · sidro = geometrijsko središče Slovenije (Slivna pri Litiji,
//    46.148 N 14.807 E) — pošteno označeno „osrednja Slovenija", KER
//    destinacija pred generacijo še ni znana (izhaja iz NL želje);
//  · napoved sega ~16 dni — izbor dlje od tega dobi iskreno sporočilo
//    „napoved še ni na voljo" (ne izmišljujemo vremena);
//  · dnevi dlje od 7 dni naprej so označeni ≈ (negotovost napovedi);
//  · napaka/čas umika fetcha → pas SE NE IzRISE (datumsko polje ostane
//    popolnoma funkcionalno — ZERO LOSS varovalo);
//  · najboljši dan = čista hevristika (najmanj padavin, nato topleje) —
//    razložena v title/aria, nikoli prikazana kot „obljuba".
//
// VAROVALO ZERO LOSS: obstoječa vremenska kartica dneva (po generaciji) se
// NE spreminja — to je SAMO pomočnik pred izbiro. Klik na dnevni čip
// nastavi datum (neposredna odločitvena podpora); ročni vnos ostane.
//
// Čisto stanje: datumsko okno + fetch + render v eni komponenti; 0 db,
// 0 localStorage; AbortController po vsaki spremembi.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  FORECAST_HORIZON_OFFSET_DAYS,
  todayISOSI,
} from "@/lib/weather-utils";

/** Sidro napovedi pred generacijo: geometrijsko središče Slovenije
 *  (Slivna pri Litiji). Destinacija iz želje je znana šele po generaciji
 *  — ne izmišljujemo "destinacijskega" vremena. */
const SLOVENIA_CENTER = { lat: 46.148, lng: 14.807 };

/** Koliko dni okoli izbire prikažemo (izbor v sredini ±3). */
const WINDOW_AROUND = 3;

interface ForecastDay {
  date: string;
  condition: string;
  icon: string;
  tempMax: number;
  precipitationProbabilityMax: number | null;
}

/** ISO (YYYY-MM-DD) ± dni — čisto datumsko računanje, brez časovnih pasov
 *  (dnevi so koledarski; todayISOSI že poravna "danes" na Ljubljano). */
function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000
  );
}

/** Kratek ime dneva v jeziku uporabnika (sob / Sat). */
function weekdayShort(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "sl-SI", {
    weekday: "short",
    timeZone: "UTC",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export function StartDateWeatherStrip({
  startDate,
  days,
  onSelectDate,
}: {
  /** Izbrani datum odhoda (YYYY-MM-DD) iz obrazca načrtovalnika. */
  startDate: string | undefined;
  /** Število dni potovanja ( za čipa „najboljši dan" — obseg iskanja). */
  days: number;
  /** Nastavi nov datum (klik na dnevni čip). Neobvezno. */
  onSelectDate?: (iso: string) => void;
}) {
  const t = useTranslations("planner");
  const locale = useLocale();
  const lang = locale === "en" ? "en" : "sl";

  const [forecastState, setForecastState] = useState<{
    key: string;
    forecast: ForecastDay[];
  } | null>(null);

  // Okno napovedi: izbor v sredini (±3), poravnano na realni horizont
  // (danes … danes+15). Prazno/nič okno → iskrena odsotnost.
  const window = useMemo(() => {
    if (!startDate) return null;
    const today = todayISOSI();
    if (startDate < today) return null; // pretekli datum — validacija skrivi
    const horizon = shiftISO(today, FORECAST_HORIZON_OFFSET_DAYS);
    if (startDate > horizon) return { empty: true as const };
    let start = shiftISO(startDate, -WINDOW_AROUND);
    if (start < today) start = today;
    let end = shiftISO(startDate, WINDOW_AROUND);
    if (end > horizon) end = horizon;
    // Če je okno odrezano na robu horizonta, raztegni do 7 dni naprej.
    if (daysBetween(start, end) < 6) {
      const wider = shiftISO(start, 6);
      if (wider <= horizon) end = wider;
    }
    if (start > end) return { empty: true as const };
    return { start, end };
  }, [startDate]);

  // Ključ trenutnega okna — IZVEDENO ujemanje (stari podatki se ne pokažejo
  // pod novim datumom; setState živi SAMO v async .then — brez kaskad).
  const windowKey =
    window && !("empty" in window) ? `${window.start}:${window.end}:${lang}` : null;
  const forecast =
    forecastState && forecastState.key === windowKey ? forecastState.forecast : null;

  useEffect(() => {
    if (!windowKey) return;
    const ctrl = new AbortController();
    const [start, end] = windowKey.split(":");
    const params = new URLSearchParams({
      lat: String(SLOVENIA_CENTER.lat),
      lng: String(SLOVENIA_CENTER.lng),
      start,
      end,
      lang,
    });
    fetch(`/api/weather?${params}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("http"))))
      .then((data: { forecast?: ForecastDay[] }) => {
        if (ctrl.signal.aborted) return;
        // Fail-closed: sprejmi SAMO dobro oblikovan neprazen seznam.
        const list = Array.isArray(data?.forecast) ? data.forecast : null;
        if (list && list.length > 0) setForecastState({ key: windowKey, forecast: list });
      })
      .catch(() => {
        // Iskrena odsotnost (napaka/abort) — datumsko polje ostane
        // popolnoma funkcionalno (ZERO LOSS varovalo).
      });
    return () => ctrl.abort();
  }, [windowKey, lang]);

  const today = useMemo(() => todayISOSI(), []);

  if (!startDate || !window || "empty" in window || !forecast) {
    // Izbor dlje od horizonta → iskreno sporočilo (vreme NI na voljo).
    if (window && "empty" in window && startDate) {
      return (
        <p
          className="flex items-center gap-1.5 text-xs text-muted-foreground"
          data-testid="weather-strip-unavailable"
        >
          <span aria-hidden>🗓️</span>
          {t("weatherStripUnavailable")}
        </p>
      );
    }
    return null;
  }

  const byDate = new Map(forecast.map((d) => [d.date, d]));
  const uncertainAfter = shiftISO(today, 7);

  // Najboljši dan za začetek: SAMO dnevi potovanja z napovedjo
  // (startDate … startDate+days-1, poravnano na okno). Čista hevristika:
  // 1. manj padavin, 2. topleje; izenačenje → prejšnji dan. Nikoli
  // prikazan, če je najboljši že izbrani dan.
  const tripDays: string[] = [];
  for (
    let d = startDate;
    d <= window.end && daysBetween(startDate, d) < Math.max(1, days);
    d = shiftISO(d, 1)
  ) {
    if (byDate.has(d)) tripDays.push(d);
  }
  let bestDay: string | null = null;
  if (tripDays.length > 1) {
    bestDay = tripDays.reduce((best, d) => {
      const a = byDate.get(best)!;
      const b = byDate.get(d)!;
      const pa = a.precipitationProbabilityMax ?? 100;
      const pb = b.precipitationProbabilityMax ?? 100;
      if (pb < pa - 5) return d; // jasno manj padavin (prag 5 % točk)
      if (Math.abs(pb - pa) <= 5 && b.tempMax > a.tempMax + 1) return d;
      return best;
    });
    if (bestDay === startDate) bestDay = null;
  }

  const hasUncertain = forecast.some((d) => d.date > uncertainAfter);

  return (
    <div
      className="min-w-0 rounded-lg border bg-muted/40 p-3"
      data-testid="weather-strip"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <span className="text-xs font-medium">
          {t("weatherStripLabel")}{" "}
          <span className="font-normal text-muted-foreground">
            · {t("weatherStripRegion")}
          </span>
        </span>
        <span className="text-[11px] text-muted-foreground">Open-Meteo</span>
      </div>

      {/* Dnevni čipi — klik nastavi datum (odločitvena podpora Kayak). */}
      <div
        className="mt-2 flex min-w-0 gap-1.5 overflow-x-auto"
        role="group"
        aria-label={t("weatherStripLabel")}
      >
        {forecast.map((d) => {
          const selected = d.date === startDate;
          const uncertain = d.date > uncertainAfter;
          const wd = weekdayShort(d.date, lang);
          const label = t("weatherStripDayAria", {
            day: wd,
            date: d.date,
            condition: d.condition,
            temp: d.tempMax,
          });
          const Chip = onSelectDate ? "button" : "div";
          return (
            <Chip
              key={d.date}
              {...(onSelectDate
                ? { type: "button" as const, onClick: () => onSelectDate(d.date), "aria-label": label, title: label }
                : {})}
              className={cn(
                "flex min-w-[3.4rem] flex-col items-center gap-0.5 rounded-md border px-2 py-1.5 text-center transition-colors",
                onSelectDate && "cursor-pointer hover:border-primary/60",
                selected
                  ? "border-primary/70 bg-primary/10 ring-1 ring-primary/40"
                  : "border-border bg-card"
              )}
            >
              <span className="text-[11px] font-medium leading-none">{wd}</span>
              <span aria-hidden className="text-base leading-tight">
                {d.icon}
              </span>
              <span className="text-[11px] tabular-nums leading-none">
                {uncertain ? "≈" : ""}
                {d.tempMax.toLocaleString(lang === "en" ? "en-GB" : "sl-SI")}
                °
              </span>
            </Chip>
          );
        })}
      </div>

      {/* Najboljši dan za začetek (hevristika — razložena v title). */}
      {bestDay && (
        <p
          className="mt-2 flex items-center gap-1.5 text-xs"
          data-testid="weather-strip-best"
          title={t("weatherStripBestTitle")}
        >
          <span aria-hidden>🎯</span>
          <span className="font-medium">
            {t("weatherStripBest", {
              day: weekdayShort(bestDay, lang),
            })}
          </span>
          <span className="text-muted-foreground">
            {byDate.get(bestDay)?.icon}{" "}
            {byDate.get(bestDay)?.tempMax.toLocaleString(
              lang === "en" ? "en-GB" : "sl-SI"
            )}
            °
          </span>
        </p>
      )}

      {hasUncertain && (
        <p className="mt-1.5 text-[11px] text-muted-foreground">
          ≈ {t("weatherStripUncertainNote")}
        </p>
      )}
    </div>
  );
}
