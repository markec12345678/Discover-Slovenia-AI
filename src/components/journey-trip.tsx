"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { CloudSun, Printer, ShieldCheck, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildMyTrip } from "@/lib/journey/trip-view";
import type { TripEntry, MyTripView } from "@/lib/journey/trip-view";
import {
  parseTripWeatherResponse,
  tripWeatherAnchor,
  tripWeatherDates,
  tripWeatherRange,
  TRIP_WEATHER_LABELS,
  type TripWeatherDay,
} from "@/lib/journey/trip-weather";
import type { TravelJourney } from "@/lib/journey/types";

// ============================================================================
// JOURNEY TRIP — "MY TRIP" POGLED (TASK 58 §20) + POTRDITVENI DOKUMENT (§21)
// ============================================================================
// Ena časovnica potovanja: dan prihoda (vpis uporabnika + trajanje transferja
// IZ vira), dogodki na SVOJIH realnih datumih, zunanje kartice najema.
// Vsaka postavka nosi REALNI status (ZUNANJA REZERVACIJA / SAMO INFORMACIJA —
// NIKOLI "potrjeno" brez providerjevega odgovora). Časi se pokažejo SAMO tam,
// kjer so realni (timeNote pove zakaj jih ni).
//
// TASK 66 — VREME PO DNEVIH: vsak dan Z realnim datumom dobi čip z živo
// dnevno napovedjo Open-Meteo (tempMax + pogoj + padavine), zasidrano na
// GEO DESTINACIJE (MY TRIP je načrt, ne navigacija — živo vreme pri
// uporabniku/naslednjem postanku pokriva Go Mode). ISKRENOST: dan brez
// datuma/brez objavljene napovedi → BREZ čipa; izpad vira → opomba, ne
// napaka; čipi so print:hidden (natisnjeni dokument ostane dejstva o
// rezervacijah, ne vreme).
//
// Potrditveni dokument (§21): natisljiv — Trip/Traveler/Provider/Booking ID/
// Date/Time/Location/Duration/Price/Currency/Status/Provider link/Cancellation.
// Booking ID je "—" (zunanja rezervacija) DOKLER provider dejansko ne vrne
// svojega — številke NE izdelujemo.
// ============================================================================

const L = {
  title: { sl: "MOJA POT", en: "MY TRIP" },
  perDay: { sl: "Dan 1 · prihod", en: "Day 1 · arrival" },
  external: { sl: "Zunanja rezervacija", en: "External booking" },
  confirmTitle: {
    sl: "Potrditveni dokument",
    en: "Confirmation document",
  },
  print: { sl: "Natisni potrditev", en: "Print confirmation" },
  shareHint: {
    sl: "Za deljeno povezavo poti nadaljuj v načrtovalnik in shrani pot.",
    en: "For a shareable trip link, continue in the planner and save the trip.",
  },
  doc: {
    trip: { sl: "Potovanje", en: "Trip" },
    traveler: { sl: "Popotnik", en: "Traveler" },
    travelers: { sl: "Popotniki", en: "Travelers" },
    provider: { sl: "Ponudnik", en: "Provider" },
    productId: { sl: "ID produkta", en: "Product ID" },
    bookingId: { sl: "Št. rezervacije", en: "Booking ID" },
    date: { sl: "Datum", en: "Date" },
    time: { sl: "Čas", en: "Time" },
    location: { sl: "Lokacija", en: "Location" },
    duration: { sl: "Trajanje", en: "Duration" },
    price: { sl: "Cena", en: "Price" },
    currency: { sl: "Valuta", en: "Currency" },
    status: { sl: "Status", en: "Status" },
    providerLink: { sl: "Povezava ponudnika", en: "Provider link" },
    cancellation: { sl: "Preklic", en: "Cancellation" },
    externalBooking: { sl: "Zunanja rezervacija", en: "External booking" },
    min: { sl: "min", en: "min" },
    from: { sl: "od", en: "from" },
    per: { sl: "", en: "" },
    generated: { sl: "Zgenerirano", en: "Generated" },
    notSelected: {
      sl: "Izberi izdelke v kategorijah — tukaj se zgradi tvoja pot.",
      en: "Select products in the categories — your trip builds here.",
    },
  },
};

function priceText(e: TripEntry, lang: "sl" | "en"): string | null {
  if (!e.price) return null;
  const unit = e.price.unit.replace("per_", "");
  const prefix = e.price.fromPrice ? `${L.doc.from[lang]} ` : "";
  return `${prefix}€${e.price.amount} / ${unit}`;
}

function statusBadge(e: TripEntry, lang: "sl" | "en") {
  const variant =
    e.status === "EXTERNAL"
      ? "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-100"
      : "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-100";
  return (
    <Badge className={variant}>{e.statusLabel[lang]}</Badge>
  );
}

// ---------------------------------------------------------------------------
// TASK 66 — VREMESKI ČIP DNEVA (načrt: pogoj + do X °C + padavine)
// ---------------------------------------------------------------------------

function WeatherChip({
  w,
  lang,
}: {
  w: TripWeatherDay;
  lang: "sl" | "en";
}) {
  const dayText = TRIP_WEATHER_LABELS.day[lang](w);
  return (
    <span
      className="inline-flex max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 rounded-full border bg-muted/30 px-2.5 py-0.5 text-xs text-muted-foreground print:hidden"
      title={TRIP_WEATHER_LABELS.source[lang]}
      aria-label={`${w.condition}, ${dayText}`}
    >
      <span role="img" aria-hidden="true" className="leading-none">
        {w.icon}
      </span>
      <span className="capitalize">{w.condition}</span>
      <span className="font-medium tabular-nums text-foreground">{dayText}</span>
    </span>
  );
}

function EntryRow({ e, lang }: { e: TripEntry; lang: "sl" | "en" }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <div className="w-16 shrink-0 text-right text-sm font-medium tabular-nums text-muted-foreground">
        {e.time ? (
          <>
            {e.time.start}
            {e.time.end ? <span className="block text-xs">{e.time.end}</span> : null}
          </>
        ) : (
          <span className="text-xs text-muted-foreground/60">–:–</span>
        )}
      </div>
      <div className="text-lg leading-none">{e.icon}</div>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm font-medium leading-snug">{e.title}</p>
        <p className="text-xs text-muted-foreground">
          {e.providerLabel[lang]}
          {e.durationMin != null ? ` · ${e.durationMin} ${L.doc.min[lang]}` : ""}
          {e.price ? ` · ${priceText(e, lang)}` : ""}
        </p>
        {e.timeNote && (
          <p className="text-xs italic text-muted-foreground/80">
            {e.timeNote[lang]}
          </p>
        )}
      </div>
      {statusBadge(e, lang)}
    </div>
  );
}

function DocRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 flex-1 font-medium">{value ?? "—"}</span>
    </div>
  );
}

function ConfirmationDoc({
  trip,
  lang,
  travelers,
}: {
  trip: MyTripView;
  lang: "sl" | "en";
  travelers: number;
}) {
  const entries = trip.days.flatMap((d) => d.entries).concat(trip.externalCards);
  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{L.confirmTitle[lang]}</p>
        <p className="text-xs text-muted-foreground">{trip.confirmation.note[lang]}</p>
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <DocRow label={L.doc.trip[lang]} value={trip.title[lang]} />
        <DocRow label={L.doc.travelers[lang]} value={String(travelers)} />
      </div>
      <div className="divide-y">
        {entries.map((e) => (
          <div key={`doc-${e.key}`} className="space-y-1 py-3">
            <p className="text-sm font-medium">
              {e.icon} {e.title}
            </p>
            <div className="space-y-1">
              <DocRow label={L.doc.provider[lang]} value={e.providerLabel[lang]} />
              <DocRow label={L.doc.productId[lang]} value={e.providerProductId ?? null} />
              <DocRow
                label={L.doc.bookingId[lang]}
                value={
                  e.bookingId ??
                  (e.status === "EXTERNAL" ? L.doc.externalBooking[lang] : null)
                }
              />
              <DocRow label={L.doc.date[lang]} value={e.date ?? null} />
              <DocRow
                label={L.doc.time[lang]}
                value={e.time ? `${e.time.start}${e.time.end ? `–${e.time.end}` : ""}` : null}
              />
              <DocRow label={L.doc.location[lang]} value={e.location ?? null} />
              <DocRow
                label={L.doc.duration[lang]}
                value={e.durationMin != null ? `${e.durationMin} ${L.doc.min[lang]}` : null}
              />
              <DocRow label={L.doc.price[lang]} value={priceText(e, lang)} />
              <DocRow label={L.doc.currency[lang]} value={e.price ? "EUR" : null} />
              <DocRow label={L.doc.status[lang]} value={e.statusLabel[lang]} />
              <DocRow
                label={L.doc.providerLink[lang]}
                value={e.bookingUrl ?? e.sourceUrl ?? null}
              />
              <DocRow label={L.doc.cancellation[lang]} value={e.cancellation[lang]} />
            </div>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground">
        {L.doc.generated[lang]}: {trip.generatedAt.slice(0, 16).replace("T", " ")} UTC
      </p>
    </div>
  );
}

export function JourneyTrip({
  journey,
  selectedIds,
  onPrint,
}: {
  journey: TravelJourney;
  selectedIds: ReadonlySet<string>;
  /** Natisni potrditveni dokument (planner skrije ostale dele tiskanja). */
  onPrint: () => void;
}) {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const trip = useMemo(
    () => buildMyTrip(journey, selectedIds),
    [journey, selectedIds]
  );
  const hasItems =
    trip.days.some((d) => d.entries.length > 1) || trip.externalCards.length > 0;

  // ---------------------------------------------------------------------
  // TASK 66 — VREME PO DNEVIH (živi Open-Meteo prek /api/weather način B,
  // 15-min strežniški cache). Sidro = GEO DESTINACIJE; okno = min…max
  // datumov dni (dan prihoda + datumi dogodkov). Brez sidra/brez datumov
  // → vreme preprosto NI (iskrena odsotnost — isti kanon kot Go Mode).
  // Effect-depi so PRIMITIVI (lat/lng/start/end/lang), da se fetch sproži
  // SAMO ob spremembi potovanja (ne ob vsakem renderu izbire).
  // ---------------------------------------------------------------------
  const anchor = useMemo(() => tripWeatherAnchor(journey), [journey]);
  const wDates = useMemo(() => tripWeatherDates(trip), [trip]);
  const range = useMemo(
    () => (wDates ? tripWeatherRange(wDates) : null),
    [wDates]
  );
  const aLat = anchor?.lat ?? null;
  const aLng = anchor?.lng ?? null;
  const rStart = range?.start ?? null;
  const rEnd = range?.end ?? null;

  const [forecast, setForecast] = useState<TripWeatherDay[] | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  /** Za katero okno je trenutni odgovor veljaven (drugo = zastarel → brez čipov). */
  const [weatherFor, setWeatherFor] = useState<string | null>(null);
  const weatherKey =
    aLat != null && aLng != null && rStart != null && rEnd != null
      ? `${aLat},${aLng},${rStart},${rEnd},${lang}`
      : null;

  useEffect(() => {
    if (aLat == null || aLng == null || rStart == null || rEnd == null) return;
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${aLat}&lng=${aLng}&lang=${lang}&start=${rStart}&end=${rEnd}`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseTripWeatherResponse(await res.json());
        if (!active) return;
        if (parsed) {
          setForecast(parsed);
          setWeatherFailed(false);
        } else {
          setForecast(null);
          setWeatherFailed(true);
        }
        setWeatherFor(`${aLat},${aLng},${rStart},${rEnd},${lang}`);
      } catch {
        // Prekinitev (novo okno) NE šteje kot napaka — active je takrat false.
        if (!active) return;
        setForecast(null);
        setWeatherFailed(true);
        setWeatherFor(`${aLat},${aLng},${rStart},${rEnd},${lang}`);
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [aLat, aLng, rStart, rEnd, lang]);

  /** Čipi se pokažejo SAMO iz odgovora, ki pokriva aktualno okno (zastarel = brez). */
  const forecastCurrent = weatherKey != null && weatherKey === weatherFor && !weatherFailed;
  const byDate = useMemo(
    () => new Map((forecast ?? []).map((f) => [f.date, f] as const)),
    [forecast]
  );
  /** Koliko dni je dobilo čip (za iskreno opombo "ni na voljo"). */
  const matchedDays =
    forecastCurrent && wDates
      ? wDates.filter((d) => byDate.has(d)).length
      : 0;

  return (
    <Card id="moja-pot" className="print:border-0 print:shadow-none">
      <CardHeader className="print:hidden">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
          <span>
            {L.title[lang]} — {journey.destination.label.toUpperCase()}
          </span>
          <Button variant="outline" size="sm" onClick={onPrint}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> {L.print[lang]}
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{L.shareHint[lang]}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!hasItems && (
          <p className="text-sm text-muted-foreground">{L.doc.notSelected[lang]}</p>
        )}

        {/* Časovnica po dneh (časi SAMO realni — §20) + TASK 66 vremenski čipi */}
        {trip.days.map((day, i) => {
          const dayWeather =
            forecastCurrent && day.date ? byDate.get(day.date) : undefined;
          return (
          <div key={`${day.date ?? i}`} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day.dateLabel[lang]}
              </p>
              {dayWeather && <WeatherChip w={dayWeather} lang={lang} />}
            </div>
            <div className="divide-y rounded-lg border">
              {day.entries.map((e) => (
                <EntryRow key={e.key} e={e} lang={lang} />
              ))}
            </div>
          </div>
          );
        })}

        {/* TASK 66 — iskrene opombe o vremenu (časovnica dela naprej) */}
        {weatherKey != null && weatherFailed && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
            <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {TRIP_WEATHER_LABELS.unavailable[lang]}
          </p>
        )}
        {forecastCurrent && wDates && wDates.length > 0 && matchedDays === 0 && (
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground print:hidden">
            <CloudSun className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {TRIP_WEATHER_LABELS.notPublished[lang]}
          </p>
        )}

        {/* Zunanje kartice (najem — affiliate ≠ inventar) */}
        {trip.externalCards.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {L.external[lang]}
            </p>
            <div className="divide-y rounded-lg border">
              {trip.externalCards.map((e) => (
                <div key={e.key} className="flex items-center gap-3 py-2">
                  <div className="text-lg leading-none">{e.icon}</div>
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <p className="text-sm font-medium leading-snug">{e.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.providerLabel[lang]}
                    </p>
                  </div>
                  {statusBadge(e, lang)}
                  {e.bookingUrl && (
                    <Button asChild variant="outline" size="sm">
                      <a href={e.bookingUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Potrditveni dokument (§21) */}
        {hasItems && (
          <ConfirmationDoc trip={trip} lang={lang} travelers={journey.travelers} />
        )}

        {/* Iskrenost zavarovanja (nikoli "potrjeno" brez dokaza) */}
        <p className="flex items-start gap-2 text-xs text-muted-foreground print:hidden">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {lang === "en"
            ? "No booking is shown as confirmed unless the provider actually confirmed it. External items are booked and paid at the provider."
            : "Rezervacija ni prikazana kot potrjena, dokler je ponudnik dejansko ne potrdi. Zunanje postavke se rezervirajo in plačajo pri ponudniku."}
        </p>
      </CardContent>
    </Card>
  );
}
