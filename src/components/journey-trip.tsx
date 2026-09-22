"use client";

import { useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import { AlertTriangle, CloudSun, Printer, ShieldCheck, ExternalLink } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buildMyTrip } from "@/lib/journey/trip-view";
import type { TripEntry, MyTripView } from "@/lib/journey/trip-view";
import { computeJourneyTotals, describeTotals } from "@/lib/journey/totals";
import {
  SUPPLY_HEALTH_LABELS,
  supplyHealthView,
} from "@/lib/journey/supply-health";
import {
  parseTripWeatherResponse,
  tripWeatherAnchor,
  tripWeatherDates,
  tripWeatherRange,
  TRIP_WEATHER_LABELS,
  type TripWeatherDay,
} from "@/lib/journey/trip-weather";
import { WeatherChip } from "@/components/itinerary-weather";
import { DayAudioButton } from "@/components/itinerary-audio";
import {
  narrationStopsFromTripEntries,
  speechTripDateLabel,
} from "@/lib/itinerary-audio";
import { plannerSessionId } from "@/lib/planner-analytics";
import {
  CONFIRMATION_STATUS_LABELS,
  isProviderConfirmed,
} from "@/lib/journey/booking";
import type {
  ConfirmationStatus,
  TravelJourney,
} from "@/lib/journey/types";

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
//
// TASK 74 — ZDRAVJE VIROV: journey.supplyHealth (§22 izolacija odpovedi +
// §30 observability) se na ravni CELEGA potovanja pokaže kot amber pas nad
// časovnico — KATERI viri so odpovedali (imena iz registra), fail-closed
// razlaga („nič izmišljenega") in pomiritev („ostalo potovanje deluje").
// PRAZNA množica = vsi viri odgovorili = TIŠINA (ne slave-ujemo odsotnosti
// težav — isti kanon kot vreme). print:hidden: potrditveni dokument so
// dejstva o rezervacijah, ne zdravje virov.
//
// TASK 91 — ZVOČNI POVZETEK DNEVA (1.81.0): gumb »Poslušaj« v glavi vsakega
// dneva MY TRIP (zadnja površina brez zvoka — vzorec TASK 89, ista čista
// lib: narrationStopsFromTripEntries preslika TripEntry[] v ime [+ realni
// termin]; datum brez leta za govor — speechTripDateLabel). Popotnik na
// potovanju posluša svoj dan (telefon v žepu), tisk dokumenta ostane čist.
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
    // TASK 72 — skupna cena dokumenta (§16: od-cene = ocena, znane = točne)
    total: { sl: "Skupaj", en: "Total" },
    totalEstimated: { sl: "ocena (vsota „od“ cen)", en: "estimate (sum of „from“ prices)" },
    totalKnown: { sl: "točne cene", en: "exact prices" },
    // TASK 99 — prekrivka JourneyBooking (realni zapisi iz DB)
    confirmedApi: {
      sl: "Potrjene rezervacije prek API-ja ponudnikov:",
      en: "Bookings confirmed via provider APIs:",
    },
    handoffRecorded: {
      sl: "Zabeležene preusmeritve k ponudniku (rezervacija živi tam):",
      en: "Recorded handoffs to the provider (the booking lives there):",
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
  // TASK 99 — razširjene barve po DEJANSKEM statusu (prekrivka iz
  // JourneyBooking): provider-potrjeno = smaragdno, odpoved/napaka =
  // rdeče, čakalna stanja = rumeno, EXTERNAL ostane vijolično (pri ponudniku).
  const confirmed = isProviderConfirmed(e.status as ConfirmationStatus);
  const variant =
    e.status === "EXTERNAL"
      ? "bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-100"
      : confirmed
        ? "bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-100"
        : e.status === "FAILED" || e.status === "CANCELLED"
          ? "bg-red-100 text-red-900 border-red-300 hover:bg-red-100"
          : e.status === "INFO"
            ? "bg-slate-100 text-slate-700 border-slate-300 hover:bg-slate-100"
            : "bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100";
  return (
    // TASK 72 — whitespace-normal: na ozki mobilni kartici se dolgi status
    // ( „Zunanja rezervacija — pri ponudniku") prelomi v 2 vrstici namesto
    // da štrli čez rob kartice ( prej 17 px preliva na 375 px).
    <Badge className={`${variant} whitespace-normal text-center leading-tight`}>
      {e.statusLabel[lang]}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// TASK 66 — VREMESKI ČIP DNEVA: od TASK 88 deli komponento z itinerarjem
// ( TripTimeline + SharedTrip) — izvožen WeatherChip v
// @/components/itinerary-weather (ista vizija, isti kanon iskrenosti).
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// TASK 74 — ZDRAVJE VIROV (§22/§30 na ravni CELEGA potovanja)
// ---------------------------------------------------------------------------

/** Amber pas nad časovnico: KATERI viri so odpovedali ob generiranju,
 *  fail-closed razlaga (nič izmišljenega) + pomiritev §22 (ostalo dela).
 *  SAMO ob dejanski odpovedi — zdravo stanje = tišina (isti kanon kot
 *  vreme). print:hidden — zdravje virov ni dejstvo o rezervacijah,
 *  potrditveni dokument ostane čist. */
function SupplyHealthNote({
  journey,
  lang,
}: {
  journey: TravelJourney;
  lang: "sl" | "en";
}) {
  const view = useMemo(
    () => supplyHealthView(journey.supplyHealth?.degradedProviders, lang),
    [journey.supplyHealth, lang]
  );
  if (!view) return null;
  return (
    <div
      role="note"
      aria-label={SUPPLY_HEALTH_LABELS.title[lang]}
      className="flex items-start gap-2.5 rounded-lg border border-amber-300/60 bg-amber-500/10 p-3 text-amber-800 dark:border-amber-700/60 dark:text-amber-300 print:hidden"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        <p className="text-sm font-semibold">{SUPPLY_HEALTH_LABELS.title[lang]}</p>
        <p className="text-xs leading-relaxed text-amber-800/90 dark:text-amber-300/90">
          {SUPPLY_HEALTH_LABELS.body[lang](view.listText)}
        </p>
      </div>
    </div>
  );
}

function EntryRow({
  e,
  lang,
  onHandoff,
}: {
  e: TripEntry;
  lang: "sl" | "en";
  /** TASK 99 — zapis checkout handoffa (EXTERNAL) ob kliku na ponudnika. */
  onHandoff?: (e: TripEntry) => void;
}) {
  return (
    // TASK 72 — flex-wrap: na ozki mobilni kartici se status badge prelomi
    // v novo vrstico ( namesto 17 px preliva čez rob kartice).
    <div className="flex flex-wrap items-start gap-x-3 gap-y-1 py-2">
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
      {/* TASK 99 (issue #1 §2): checkout handoff na ČASOVNICI — postavka z
          bookingUrl (npr. KT transfer) dobi gumb pri ponudniku; klik iskreno
          zapiše EXTERNAL lifecycle vrstico (potrditev živi pri ponudniku). */}
      {e.bookingUrl && e.status === "EXTERNAL" && (
        <Button asChild variant="outline" size="sm" className="h-7 w-7 min-w-0 px-0">
          <a
            href={e.bookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={onHandoff ? () => onHandoff(e) : undefined}
            aria-label={`${L.doc.providerLink[lang]}: ${e.title}`}
            title={L.doc.providerLink[lang]}
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </Button>
      )}
    </div>
  );
}

function DocRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex gap-2 text-xs">
      <span className="w-32 shrink-0 text-muted-foreground">{label}</span>
      {/* TASK 72 — break-all: dolgi URL-ji ponudnikov ( /go/transfers?…)
          se na mobilnem prelomijo, namesto da širijo kartico čez zaslon. */}
      <span className="min-w-0 flex-1 break-all font-medium">{value ?? "—"}</span>
    </div>
  );
}

/** TASK 72 — ena postavka dokumenta (izvlečena iz ConfirmationDoc, da se
 *  isto vrstico izrise po dneh in v zunanjih karticah brez duplikacije). */
function DocEntry({ e, lang }: { e: TripEntry; lang: "sl" | "en" }) {
  return (
    <div className="space-y-1 py-2">
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
  );
}

function ConfirmationDoc({
  trip,
  lang,
  travelers,
  confirmedCount = 0,
  handoffCount = 0,
}: {
  trip: MyTripView;
  lang: "sl" | "en";
  travelers: number;
  /** TASK 99 — ŠTETJE iz DEJANSKIH JourneyBooking vrstic (ne hardcoded 0). */
  confirmedCount?: number;
  /** TASK 99 — zabeležene EXTERNAL preusmeritve (iskren signal). */
  handoffCount?: number;
}) {
  const entries = trip.days.flatMap((d) => d.entries).concat(trip.externalCards);

  // TASK 72 — SKUPNA CENA DOKUMENTA (§16): isti kanon kot načrtovalnik
  // (computeJourneyTotals strukturno sprejme TripEntry): od-cene → ocena
  // ( spodnja meja), točne cene → znano, brez cene → šteto, NIKOLI kot 0.
  // Sešteva SAMO vrstice NAD sabo ( lastne postavke dokumenta, ne vse
  // ponudbe potovanja). describeTotals pošteno razloži, kaj številka je.
  const totals = computeJourneyTotals(entries);
  const totalParts: string[] = [];
  if (totals.estimatedTotal > 0) {
    totalParts.push(`${L.doc.from[lang]} €${totals.estimatedTotal}`);
  }
  if (totals.knownTotal > 0) {
    totalParts.push(`€${totals.knownTotal} (${L.doc.totalKnown[lang]})`);
  }
  const totalExplain = describeTotals(totals, lang);
  const showTotal = totalParts.length > 0 || totalExplain.length > 0;

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <p className="text-sm font-semibold">{L.confirmTitle[lang]}</p>
        {/* TASK 99 — opomba se izpisuje iz DEJANSKEGA stanja vrstic: 0 →
            iskrena „ni še“ razlaga; >0 → štetje potrjenih + zabeleženih
            preusmeritev. NIKOLI generično „uspešno“. */}
        <p className="text-xs text-muted-foreground">
          {confirmedCount > 0
            ? `${L.doc.confirmedApi[lang]} ${confirmedCount}`
            : trip.confirmation.note[lang]}
        </p>
        {handoffCount > 0 && (
          <p className="text-xs text-muted-foreground">
            {L.doc.handoffRecorded[lang]} {handoffCount}
          </p>
        )}
      </div>
      <div className="space-y-2 text-xs text-muted-foreground">
        <DocRow label={L.doc.trip[lang]} value={trip.title[lang]} />
        <DocRow label={L.doc.travelers[lang]} value={String(travelers)} />
      </div>

      {/* TASK 72 — postavke grupirane po dneh (ista časovnica kot zgoraj):
          dan kot majhna glava skupine, zunanje kartice v lastni skupini.
          Čista re-razvrstitev obstoječih vrstic (ni novih podatkov). */}
      <div className="divide-y">
        {trip.days.map((day, i) => (
          <div key={`doc-day-${day.date ?? i}`} className="space-y-1 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {day.dateLabel[lang]}
            </p>
            {day.entries.map((e) => (
              <DocEntry key={`doc-${e.key}`} e={e} lang={lang} />
            ))}
          </div>
        ))}
        {trip.externalCards.length > 0 && (
          <div key="doc-external" className="space-y-1 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {L.external[lang]}
            </p>
            {trip.externalCards.map((e) => (
              <DocEntry key={`doc-${e.key}`} e={e} lang={lang} />
            ))}
          </div>
        )}
      </div>

      {/* TASK 72 — skupna cena + poštena razlaga §16 (natisnjeno tudi) */}
      {showTotal && (
        <div className="space-y-1 border-t pt-3">
          {totalParts.length > 0 && (
            <p className="text-sm font-semibold">
              {L.doc.total[lang]}: {totalParts.join(" · ")}
              {totals.estimatedTotal > 0 ? ` — ${L.doc.totalEstimated[lang]}` : ""}
            </p>
          )}
          {totalExplain && (
            <p className="text-xs text-muted-foreground">{totalExplain}</p>
          )}
        </div>
      )}

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
  // TASK 99 (issue #1 §2) — PREKRIVKA REALNIH JourneyBooking VRSTIC.
  // Do 1.85.0 je bil confirmedCount HARDCODED 0 („danes 0 zapisov“) in
  // bookingId vedno null — arhitektura brez bralca. Zdaj: efekterne
  // vrstice (shareId NULL, obseg seje dsa_planner_sid) se prinesejo z
  // GET /api/journey/bookings?products=… in prekrijejo status/bookingId
  // POSTAVKAM, ki imajo DEJANSKI zapis. Danes lahko nastanejo SAMO
  // EXTERNAL zapisi (klik na handoff povezavo) — CONFIRMED/PAID/MODIFIED
  // lahko pridete IZKLJUČNO iz providerjevega odgovora (0 poverilnic →
  // štetje ostane 0 — iskrenost ostaja zakon).
  // ---------------------------------------------------------------------
  const [bookingRows, setBookingRows] = useState<
    { key: string; status: string; providerBookingId: string | null }[]
  >([]);
  const overlayProducts = useMemo(() => {
    const entries = trip.days
      .flatMap((d) => d.entries)
      .concat(trip.externalCards);
    const keys = entries
      .filter(
        (e) =>
          e.provider != null &&
          e.providerProductId != null &&
          e.status === "EXTERNAL"
      )
      .map((e) => `${e.provider}:${e.providerProductId}`);
    return Array.from(new Set(keys)).slice(0, 20);
  }, [trip]);
  const overlayQuery =
    overlayProducts.length > 0 ? overlayProducts.join(",") : null;

  useEffect(() => {
    if (!overlayQuery) {
      setBookingRows([]);
      return;
    }
    let active = true;
    const sid = plannerSessionId();
    (async () => {
      try {
        const res = await fetch(
          `/api/journey/bookings?products=${encodeURIComponent(overlayQuery)}&sessionKey=${encodeURIComponent(sid)}`
        );
        if (!res.ok) return;
        const data = (await res.json()) as {
          bookings?: {
            provider: string;
            providerProductId: string;
            status: string;
            providerBookingId?: string | null;
          }[];
        };
        if (active && Array.isArray(data.bookings)) {
          setBookingRows(
            data.bookings.map((b) => ({
              key: `${b.provider}:${b.providerProductId}`,
              status: b.status,
              providerBookingId: b.providerBookingId ?? null,
            }))
          );
        }
      } catch {
        // Neblokirajoče — prekrivka je izboljšava, ne obveza (brez nje
        // vidimo enako iskreno „0 potrjenih“).
      }
    })();
    return () => {
      active = false;
    };
  }, [overlayQuery]);

  const rowByKey = useMemo(
    () => new Map(bookingRows.map((r) => [r.key, r] as const)),
    [bookingRows]
  );

  /** Postavke z DEJANSKIM zapisom dobijo njegov status/oznako/ID —
   *  vsi ostali ostanejo točno takšni, kot jih je zgradil buildMyTrip. */
  const effectiveTrip = useMemo(() => {
    if (bookingRows.length === 0) return trip;
    const augment = (e: TripEntry): TripEntry => {
      if (e.provider == null || e.providerProductId == null) return e;
      const row = rowByKey.get(`${e.provider}:${e.providerProductId}`);
      if (!row) return e;
      const label =
        CONFIRMATION_STATUS_LABELS[row.status as ConfirmationStatus];
      return {
        ...e,
        ...(label ? { statusLabel: label } : {}),
        status: row.status as TripEntry["status"],
        ...(row.providerBookingId ? { bookingId: row.providerBookingId } : {}),
      };
    };
    return {
      ...trip,
      days: trip.days.map((d) => ({ ...d, entries: d.entries.map(augment) })),
      externalCards: trip.externalCards.map(augment),
    };
  }, [trip, rowByKey, bookingRows]);

  const confirmedCount = useMemo(
    () => bookingRows.filter((r) => isProviderConfirmed(r.status as ConfirmationStatus)).length,
    [bookingRows]
  );
  const handoffCount = useMemo(
    () => bookingRows.filter((r) => r.status === "EXTERNAL").length,
    [bookingRows]
  );

  /** TASK 99 — ISKREN zapis checkout handoffa (EXTERNAL): ob kliku na
   *  povezavo ponudnika zabeležimo, da je uporabnik ODŠEL tja. To NI
   *  rezervacija (potrditev živi pri ponudniku) — fire-and-forget, ne
   *  blokira navigacije, idempotentno na strežniku. Optimistična vrstica
   *  se prikaže TAKOJ (števec preusmeritev); ob odpovedi POST se povrne
   *  nazaj (iskrenost: ne kažemo zapisa, ki ga ni). */
  const recordHandoff = (e: TripEntry) => {
    if (e.provider == null || e.providerProductId == null) return;
    const key = `${e.provider}:${e.providerProductId}`;
    try {
      const body = JSON.stringify({
        provider: e.provider,
        providerProductId: e.providerProductId,
        status: "EXTERNAL",
        sessionKey: plannerSessionId(),
      });
      // Optimistično: števec preusmeritev se pomakne takoj (uporabnik že
      // odhaja na ponudnikovo stran); strežnik je idempotenten, ponovni
      // klik ne podvaja.
      setBookingRows((rows) =>
        rows.some((r) => r.key === key)
          ? rows
          : [...rows, { key, status: "EXTERNAL", providerBookingId: null }]
      );
      fetch("/api/journey/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      })
        .then((res) => {
          if (!res.ok) {
            // Odpoved (npr. 429) — optimistično stanje PONIČIMO
            setBookingRows((rows) => rows.filter((r) => r.key !== key));
          }
        })
        .catch(() => {
          setBookingRows((rows) => rows.filter((r) => r.key !== key));
        });
    } catch {
      // Zasebni način/blokiran fetch — tiho (handoff ni odvisen od nas)
    }
  };

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

        {/* TASK 74 — zdravje virov: samo ob odpovedi (zdravo = tišina) */}
        <SupplyHealthNote journey={journey} lang={lang} />

        {/* Časovnica po dneh (časi SAMO realni — §20) + TASK 66 vremenski čipi
            + TASK 91 zvočni povzetek dneva (surface=mytrip) + TASK 99 prekrivka
            DEJANSKIH booking statusov (effectiveTrip) */}
        {effectiveTrip.days.map((day, i) => {
          const dayWeather =
            forecastCurrent && day.date ? byDate.get(day.date) : undefined;
          // TASK 91 — datum za GOVOR brez leta (»25. september« — planner
          // pariteta); dan brez datuma → null (ne beremo meta-opombe).
          const audioDateLabel = day.date
            ? speechTripDateLabel(day.dateLabel[lang])
            : null;
          return (
          <div key={`${day.date ?? i}`} className="space-y-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {day.dateLabel[lang]}
              </p>
              {dayWeather && <WeatherChip w={dayWeather} lang={lang} />}
              <DayAudioButton
                dayNumber={i + 1}
                dateLabel={audioDateLabel}
                stops={narrationStopsFromTripEntries(day.entries)}
                lang={lang}
                surface="mytrip"
                className="ml-auto shrink-0 self-center"
              />
            </div>
            <div className="divide-y rounded-lg border">
              {day.entries.map((e) => (
                <EntryRow key={e.key} e={e} lang={lang} onHandoff={recordHandoff} />
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

        {/* Zunanje kartice (najem — affiliate ≠ inventar) — TASK 99: klik
            na povezavo ISKRENO zabeleži checkout handoff (EXTERNAL) */}
        {effectiveTrip.externalCards.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {L.external[lang]}
            </p>
            <div className="divide-y rounded-lg border">
              {effectiveTrip.externalCards.map((e) => (
                <div key={e.key} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
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
                      <a
                        href={e.bookingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={
                          e.provider && e.providerProductId
                            ? () => recordHandoff(e)
                            : undefined
                        }
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Potrditveni dokument (§21) — TASK 99: štetje iz DEJANSKIH vrstic */}
        {hasItems && (
          <ConfirmationDoc
            trip={effectiveTrip}
            lang={lang}
            travelers={journey.travelers}
            confirmedCount={confirmedCount}
            handoffCount={handoffCount}
          />
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
