"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  Clock,
  MapPin,
  Navigation,
  Phone,
  Bookmark,
  Euro,
  Cloud,
  Sparkles,
  UtensilsCrossed,
  Mountain,
  Camera,
  ShoppingBag,
  Coffee,
  Calendar,
  Check,
  Loader2,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";
import { DayAudioButton } from "@/components/itinerary-audio";
import { DaySegmentHeader } from "@/components/day-segment-header";
import { PlannerStopLeg } from "@/components/planner-stop-leg";
import { segmentBoundaryAt } from "@/lib/day-segments";
import {
  ItineraryWeatherNotes,
  WeatherChip,
  useItineraryForecast,
} from "@/components/itinerary-weather";
import { useAppStore } from "@/lib/store";
import { saveItinerary } from "@/lib/itinerary-share";
import { addSavedTrip, deriveSavedTripName } from "@/lib/my-trips-storage";
import { trackPlannerEvent, plannerSessionId } from "@/lib/planner-analytics";
import { recordExternalHandoff } from "@/lib/journey/handoff-record";
import { dayCostSummary, totalUnknownCostStops } from "@/lib/cost-truth";
import { dayISOForDayNumber } from "@/lib/trip-dates";
import { formatDayLabel } from "@/lib/itinerary-weather";
import { narrationStopsFromDay } from "@/lib/itinerary-audio";
import { cn } from "@/lib/utils";
import type { DayPlan, Itinerary, LocationVisit, PlannerInput } from "@/lib/types";

// ============================================================================
// AI TRIP TIMELINE — vizualni dan z timeline layout
// ============================================================================
//
// WOW: Ne seznam — vizualni dan!
// JUTRO    09:00 ☕ Lokalna kavarna
//          11:00 🥾 Naravna pot
// POPOLDAN 13:30 🍽️ Kosilo (⭐ Verified Partner)
//          15:00 🍯 Lokalni proizvajalec
//
// TASK 93: glave segmentov dneva (Jutro/Popoldan/Večer) + POŠTENE etape med
// postanki — prej je časovnica kazala IZMIŠLJENI "~30 min" za vsak neznan
// par (12 hardcoded parov + privzetek). Zdaj PlannerStopLeg črpa iz istega
// vira kot značke ~km dni (OSRM legs / hevristika geo-validacije), neznani
// ID-ji → BREZ povezovalnika (brez lažnih številk).
// ============================================================================

interface TripTimelineProps {
  days: DayPlan[];
  totalBudget?: number;
  /** TASK 88: ISO datum odhoda — pogoj za ŽIVO dnevno napoved (čip).
   *  Brez njega dnevi niso datirani in vreme ostane statični posnetek. */
  tripStartDate?: string;
  /** TASK 93: OSRM noge iz načrta (isti vir kot podrobni pogled) —
   *  pošteni povezovalniki med karticami; brez njih hevristika. */
  legs?: Itinerary["legs"];
  /** TASK 4 / K-11: vrstni red v flex delovni površini načrtovalnika. */
  className?: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

// ============================================================================
// ISSUE #4 §3 (val 1): JOURNEYBOOKING PREKRIVKA ZA ŽETONE POSTANKOV
// ============================================================================
// Način B (isti vir kot journey-trip.tsx): efemerne vrstice trenutne seje
// (sessionKey = dsa_planner_sid) za postanke AI načrta, ki nosijo KONKRETEN
// izdelek (booking_provider + booking_product_id). Vrne preslikavo
// "provider:productId" → status. Zavesa: če pride do napake, žetoni
// ostanejo na poštenem privzetku „Brez rezervacije“ (nima smo izmišljevali).
// Provider-potrjeni statusi (CONFIRMED/PAID/MODIFIED) se prikažejo kot
// smaragdno — nikoli jih NE postavimo sami (zapis jih naredi le provider
// kanal z žetonom, fail-closed).
// ============================================================================

type BookingRow = {
  provider: string;
  providerProductId: string;
  status: string;
};

function useJourneyBookingStates(
  bookable: { provider: string; productId: string }[]
): Map<string, string> {
  const [states, setStates] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (bookable.length === 0) return;
    // Strežnik omejuje na 20 parov — vzamemo prvih 20 (isti vzorec
    // journey-trip.tsx prekrivke).
    const products = bookable
      .slice(0, 20)
      .map((b) => `${b.provider}:${b.productId}`)
      .join(",");
    const params = new URLSearchParams({
      products,
      sessionKey: plannerSessionId(),
    });
    let cancelled = false;
    fetch(`/api/journey/bookings?${params.toString()}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { bookings?: BookingRow[] } | null) => {
        if (cancelled || !data?.bookings) return;
        const map = new Map<string, string>();
        for (const row of data.bookings) {
          map.set(`${row.provider}:${row.providerProductId}`, row.status);
        }
        setStates(map);
      })
      .catch(() => {
        // Iskreni privzeti žetoni ostanejo — prekrivka ni kritična pot.
      });
    return () => {
      cancelled = true;
    };
    // bookable se izračuna z useMemo v komponenti (stabilna identiteta).
  }, [bookable]);

  return states;
}

/** Fallback formData, če store nima shranjenega vnosa obrazca. */
function fallbackForm(it: NonNullable<ReturnType<typeof useAppStore.getState>["itinerary"]>): PlannerInput {
  return {
    budget: it.total_budget,
    days: it.days.length,
    interests: [],
    season: "summer",
    groupSize: 2,
  };
}

/** Kopiranje v odložišče s fallbackom za starejše brskalnike. */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      return true;
    } catch {
      return false;
    }
  }
}

// Kategorija → ikona + barva
const CATEGORY_STYLES: Record<string, { icon: typeof Coffee; color: string; bg: string }> = {
  restaurant: { icon: UtensilsCrossed, color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-100 dark:bg-orange-950/30" },
  hotel: { icon: Calendar, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-950/30" },
  activity: { icon: Mountain, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-950/30" },
  shop: { icon: ShoppingBag, color: "text-violet-600 dark:text-violet-400", bg: "bg-violet-100 dark:bg-violet-950/30" },
  bar: { icon: Coffee, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-950/30" },
  default: { icon: MapPin, color: "text-primary", bg: "bg-primary/10" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_STYLES[category] || CATEGORY_STYLES.default;
}

// Določi ikono glede na ime destinacije/opis
function inferCategory(visit: LocationVisit): string {
  const text = `${visit.destination_name} ${visit.notes || ""}`.toLowerCase();
  if (text.includes("restavrac") || text.includes("gostiln") || text.includes("kosilo") || text.includes("večerja") || text.includes("hrana")) return "restaurant";
  if (text.includes("hotel") || text.includes("prenoč")) return "hotel";
  if (text.includes("pohod") || text.includes("narava") || text.includes("gora") || text.includes("smuč")) return "activity";
  if (text.includes("kup") || text.includes("trgovin") || text.includes("prodaj")) return "shop";
  if (text.includes("kava") || text.includes("bar") || text.includes("pijača")) return "bar";
  return "default";
}

export function TripTimeline({ days, totalBudget, tripStartDate, legs, className }: TripTimelineProps) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // I18N-FIX (revizija 1.33.0, 16-d P2): komponenta je viden del rezultatov
  // načrtovalnika — prej 100 % hardkodirana SL tudi na /en/nacrtuj.
  const t = useTranslations("planner.timeline");
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  // TASK 88 — ŽIVO vreme po dnevih (Open-Meteo prek /api/weather način B,
  // sidro = prvi geo-postanek dneva, dedupe po regiji). Statični posnetek
  // day.weather ostane FALLBACK, ko živa napoved ni na voljo.
  const { chipFor, unavailable, notPublished, hasWindow } =
    useItineraryForecast(days, tripStartDate, lang);

  // ISSUE #4 §3: postanki s KONKRETENIM izdelkom (booking_url + provider +
  // productId) — za prekrivko JourneyBooking stanj (življenjski cikel na
  // mestu uporabe, ne le na MOJA POT / GO Mode).
  const bookableStops = useMemo(
    () =>
      days
        .flatMap((d) => d?.locations ?? [])
        .filter(
          (v): v is LocationVisit & {
            booking_provider: string;
            booking_product_id: string;
            booking_url: string;
          } =>
            !!v.booking_url &&
            !!v.booking_provider &&
            !!v.booking_product_id
        )
        .map((v) => ({
          provider: v.booking_provider,
          productId: v.booking_product_id,
        })),
    [days]
  );
  const bookingStates = useJourneyBookingStates(bookableStops);
  // Optimistični EXTERNAL po kliku (strežnik je idempotenten; prekrivka ob
  // ponovnem mountu prinese isto resnico — isti vzorec kot journey-trip).
  const [localExternal, setLocalExternal] = useState<Set<string>>(new Set());

  // ISSUE #4 §6: skupno št. postankov z neznano ceno (glava načrta).
  const unknownTotal = useMemo(() => totalUnknownCostStops(days), [days]);

  // Shrani itinerer in kopiraj deljivo povezavo (uporabi store + helper)
  const handleSaveItinerary = useCallback(async () => {
    if (saveState === "saving") return;
    const { itinerary, plannerForm } = useAppStore.getState();
    if (!itinerary) return;

    setSaveState("saving");
    try {
      const result = await saveItinerary(
        itinerary,
        plannerForm ?? fallbackForm(itinerary)
      );
      const shareUrl = `${window.location.origin}${result.url}`;
      // P2-3: sledi anonimno shranjen načrt za prevzem ob prijavi (localStorage)
      addSavedTrip(result.shareId, deriveSavedTripName(itinerary));
      await copyToClipboard(shareUrl);
      setSaveState("saved");
      setTimeout(() => setSaveState("idle"), 4000);
    } catch (err) {
      console.error("[trip-timeline] shranjevanje ni uspelo:", err);
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 4000);
    }
  }, [saveState]);

  // "Rezerviraj" → pošlji uporabnika na booking panel tega dne
  const handleGoToBooking = useCallback((day: number) => {
    const target =
      document.getElementById(`booking-panel-${day}`) ??
      document.getElementById("načrtuj");
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  if (!days || days.length === 0) return null;

  return (
    <div className={cn("space-y-8", className)}>
      {/* Skupni povzetek */}
      {totalBudget !== undefined && (
        <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl bg-primary/5 border border-primary/20 p-4">
          <div className="flex items-center gap-2">
            <Calendar className="size-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">{t("daysPlan", { count: days.length })}</span>
          </div>
          <div className="h-6 w-px bg-border" />
          <div className="flex items-center gap-2">
            <Euro className="size-5 text-primary" aria-hidden="true" />
            <span className="font-semibold">~€{totalBudget}</span>
            {/* ISSUE #4 §6: ~€ ocena je kvalificirana, kadar so cene
                postankov neznane (prej: NaN se je tiho štel kot €0). */}
            {unknownTotal > 0 && (
              <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
                · {t("budgetUnknownNote", { count: unknownTotal })}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Timeline za vsak dan */}
      {days.map((day) => {
        // ISSUE #4 §6: dnevni strošek s PLAŠČEM NEZNANEGA — NaN (cena ni
        // preverjena) se NE šteje kot €0 (prej: `|| 0` je neznanje tiho
        // pretvoril v „brezplačno"). Čista funkcija = ena resnica (testirana).
        const cost = dayCostSummary(day.locations);
        // TASK 88: realni datum dneva (ob znanem odhodu) + živa napoved
        const dayISO = tripStartDate
          ? dayISOForDayNumber(tripStartDate, day.day)
          : null;
        const liveWeather = chipFor(day.day);
        // TASK 89: postanki dneva za zvočni povzetek (ista preslikava kot
        // SharedTrip — ena resnica v lib).
        const audioStops = narrationStopsFromDay(day.locations);
        const audioDateLabel = dayISO ? formatDayLabel(dayISO, lang) : null;
        return (
        <div key={day.day} className="relative">
          {/* Dan header */}
          <div className="mb-4 flex items-center gap-3">
            <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-lg shadow-md">
              {day.day}
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-bold">
                {t("dayLabel", { day: day.day })}
                {dayISO && (
                  <span className="ml-2 text-sm font-normal text-muted-foreground">
                    {formatDayLabel(dayISO, lang)}
                  </span>
                )}
              </h3>
              {/* TASK 88: ŽIVI čip premošča statični posnetek; brez njega
                  ostane prikaz obdobja generiranja (danes že zastarel). */}
              {liveWeather ? (
                <WeatherChip w={liveWeather} lang={lang} />
              ) : (
                day.weather && (
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Cloud className="size-3.5" aria-hidden="true" />
                    {day.weather.condition} · {day.weather.temp}°C
                  </div>
                )
              )}
            </div>
            {/* TASK 89: zvočni povzetek dneva (TTS, brez ključa) — desno
                v glavi dneva; fail-closed brez uporabnih postankov. */}
            <DayAudioButton
              dayNumber={day.day}
              dateLabel={audioDateLabel}
              stops={audioStops}
              lang={lang}
              surface="planner"
              className="ml-auto shrink-0 self-center"
            />
          </div>

          {/* Vertikalna črta */}
          <div className="absolute left-6 top-16 bottom-0 w-0.5 bg-border" aria-hidden="true" />

          {/* Lokacije */}
          <div className="ml-16 space-y-4">
            {day.locations.map((visit, idx) => {
              const category = inferCategory(visit);
              const style = getCategoryStyle(category);
              const Icon = style.icon;
              // TASK 93: prejšnji postanek za POŠTENO etapo (isti vir kot
              // podrobni pogled) + meja segmenta dneva (Jutro/Popoldan/Večer)
              const prev = idx > 0 ? day.locations[idx - 1] : null;
              const { segment, showHeader } = segmentBoundaryAt(
                day.locations,
                idx
              );

              // ISSUE #4 §3: rezervacijska resnica TEGA postanka. Status
              // pride iz JourneyBooking prekrivke (ali optimističnega
              // EXTERNAL po kliku) — NIKOLI ga ne postavimo sami.
              const bookingKey =
                visit.booking_provider && visit.booking_product_id
                  ? `${visit.booking_provider}:${visit.booking_product_id}`
                  : null;
              const bookingStatus = bookingKey
                ? (bookingStates.get(bookingKey) ??
                  (localExternal.has(bookingKey) ? "EXTERNAL" : undefined))
                : undefined;
              const bookingConfirmed =
                bookingStatus === "CONFIRMED" ||
                bookingStatus === "PAID" ||
                bookingStatus === "MODIFIED";
              // ISSUE #4 §6: cena je KONČNA (tudi pošteno 0 odprtega vira)
              // ali NEZNANA (NaN sentinel supply validacije).
              const costKnown =
                typeof visit.estimated_cost === "number" &&
                Number.isFinite(visit.estimated_cost);

              return (
                <div key={`${visit.destination_id}-${idx}`}>
                  {/* Etapa od prejšnjega postanka (🚗 ~X km · ~Y min) —
                      IZVEN relativnega ovoja, da pikica časovnice ostane
                      poravnana s kartico (isti vrstni red kot podrobni
                      pogled: etapa → glava segmenta → kartica) */}
                  {prev && <PlannerStopLeg from={prev} to={visit} legs={legs} />}
                  {/* TASK 93: glava segmenta — ob prehodu ali prvem postanku */}
                  {showHeader && segment && (
                    <DaySegmentHeader segment={segment} lang={lang} />
                  )}
                  <div
                    className="relative animate-in fade-in slide-in-from-left-2 duration-300"
                    style={{ animationDelay: `${idx * 100}ms` }}
                  >
                  {/* Timeline dot */}
                  <div
                    className={cn(
                      "absolute -left-12 top-4 flex size-8 items-center justify-center rounded-full border-4 border-background",
                      style.bg
                    )}
                  >
                    <Icon className={cn("size-4", style.color)} aria-hidden="true" />
                  </div>

                  {/* Kartica */}
                  <Card className="overflow-hidden border-border/60 transition-all hover:border-primary/30 hover:shadow-md">
                    {/* Cinematic photo (Mindtrip inspiracija) */}
                    <div className="relative h-32 sm:h-40 overflow-hidden bg-muted">
                      <div className={cn("absolute inset-0 bg-gradient-to-br opacity-80", style.bg)} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Icon className={cn("size-12 opacity-20", style.color)} aria-hidden="true" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                        <div className="flex items-center gap-1.5 text-xs font-medium text-white">
                          <Clock className="size-3" aria-hidden="true" />
                          {visit.time_slot}
                          <span className="text-white/60">·</span>
                          <span>{visit.duration}h</span>
                        </div>
                      </div>
                    </div>

                    <CardContent className="p-4">
                      {/* Vrsta 1: Ime */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Ime */}
                          <h4 className="text-base font-semibold leading-tight">
                            {visit.destination_name}
                          </h4>

                          {/* Opis/beleške */}
                          {visit.notes && (
                            <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                              {visit.notes}
                            </p>
                          )}

                          {/* Badge + cena + rezervacijska resnica (§3/§6) */}
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {costKnown && visit.estimated_cost > 0 && (
                              <Badge variant="secondary" className="text-[10px] gap-0.5">
                                <Euro className="size-2.5" aria-hidden="true" />
                                {visit.estimated_cost}
                              </Badge>
                            )}
                            {/* ISSUE #4 §6: postanek z neznano ceno to IZREČE
                                (prej: tiho štet kot €0 v dnevni vsoti). */}
                            {!costKnown && (
                              <Badge
                                variant="outline"
                                className="border-amber-300 bg-amber-50 text-[10px] gap-0.5 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200"
                                title={visit.notes || undefined}
                              >
                                <Euro className="size-2.5" aria-hidden="true" />
                                {t("priceUnverified")}
                              </Badge>
                            )}
                            {/* ISSUE #4 §3: življenjski cikel rezervacije —
                                ISTA semantika kot GO Mode / MOJA POT,
                                sedaj na mestu načrtovanja. */}
                            {visit.booking_url && bookingKey && (
                              bookingConfirmed ? (
                                <Badge className="bg-emerald-100 text-[10px] gap-0.5 border-emerald-300 text-emerald-900 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                                  <Check className="size-2.5" aria-hidden="true" />
                                  {t("bookingConfirmed")}
                                </Badge>
                              ) : bookingStatus === "EXTERNAL" ? (
                                <Badge className="bg-violet-100 text-[10px] gap-0.5 border-violet-300 text-violet-900 hover:bg-violet-100 dark:border-violet-800 dark:bg-violet-950 dark:text-violet-200">
                                  <ExternalLink className="size-2.5" aria-hidden="true" />
                                  {t("bookingExternal")}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-[10px] gap-0.5 text-muted-foreground">
                                  <Bookmark className="size-2.5" aria-hidden="true" />
                                  {t("bookingNone")}
                                </Badge>
                              )
                            )}
                          </div>
                        </div>

                        {/* Partner badge (desno) */}
                        {visit.recommendationType && visit.recommendationType !== "organic" && (
                          <PartnerBadge
                            status={visit.recommendationType === "sponsored" ? "premium" : "verified"}
                            size="sm"
                          />
                        )}
                      </div>

                      {/* Akcijski gumbi */}
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        {/* ISSUE #4 §3: KONKRETEN izdelek → direktna pot k
                            ponudniku (+ zapis EXTERNAL handoffa — isti
                            zapisovalni kanon kot journey/GO površine) +
                            optimistični vijolični žeton po kliku. */}
                        {visit.booking_url && bookingKey && !bookingConfirmed && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 gap-1 text-xs text-violet-700 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-400"
                            onClick={() => {
                              recordExternalHandoff(
                                visit.booking_provider,
                                visit.booking_product_id
                              );
                              setLocalExternal(
                                (prev) => new Set(prev).add(bookingKey)
                              );
                              trackPlannerEvent("booking_cta_clicked", {
                                via: "timeline_stop",
                                provider: visit.booking_provider,
                              });
                              window.open(
                                visit.booking_url,
                                "_blank",
                                "noopener,noreferrer"
                              );
                            }}
                            aria-label={t("bookAtProviderAria", {
                              name: visit.destination_name,
                            })}
                          >
                            <ExternalLink className="size-3" aria-hidden="true" />
                            {t("bookAtProvider")}
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => {
                            // FAZA 4 (pilotna analitika): uporabnik je odprl
                            // zemljevid za postanek svoje poti
                            trackPlannerEvent("map_opened", {
                              via: "timeline_navigation",
                              destination: visit.destination_name,
                            });
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visit.destination_name + " Slovenia")}`,
                              "_blank"
                            );
                          }}
                          aria-label={t("navigateAria", { name: visit.destination_name })}
                        >
                          <Navigation className="size-3" aria-hidden="true" />
                          {t("navigate")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={cn(
                            "h-7 gap-1 text-xs",
                            saveState === "saved" && "text-emerald-600 dark:text-emerald-400",
                            saveState === "error" && "text-destructive"
                          )}
                          disabled={saveState === "saving"}
                          onClick={handleSaveItinerary}
                          aria-label={t("saveAria")}
                        >
                          {saveState === "saving" ? (
                            <Loader2 className="size-3 animate-spin" aria-hidden="true" />
                          ) : saveState === "saved" ? (
                            <Check className="size-3" aria-hidden="true" />
                          ) : (
                            <Bookmark className="size-3" aria-hidden="true" />
                          )}
                          {saveState === "saving"
                            ? t("saving")
                            : saveState === "saved"
                              ? t("saved")
                              : saveState === "error"
                                ? t("saveError")
                                : t("save")}
                        </Button>
                        {visit.affiliateType && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs ml-auto text-primary hover:text-primary/80"
                            onClick={() => handleGoToBooking(day.day)}
                            aria-label={t("bookAria", { name: visit.destination_name })}
                          >
                            <Sparkles className="size-3" aria-hidden="true" />
                            {t("book")}
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Day budget summary (Wanderlog inspiracija) — ISSUE #4 §6:
              neznane cene so VIDNE, ne tiho pretvorjene v €0. */}
          {(cost.known > 0 || cost.unknownCount > 0) && (
            <div className="mt-4 flex flex-wrap items-center justify-end gap-2 text-xs text-muted-foreground">
              <span>{t("dayTotal", { day: day.day })}</span>
              <Badge variant="secondary" className="gap-0.5">
                <Euro className="size-2.5" aria-hidden="true" />
                {cost.known}
              </Badge>
              {cost.unknownCount > 0 && (
                <span className="text-amber-700 dark:text-amber-400">
                  {t("unknownCostCount", { count: cost.unknownCount })}
                </span>
              )}
            </div>
          )}
        </div>
        );
      })}

      {/* TASK 88 — iskrene opombe o živem vremenu (časovnica dela naprej) */}
      {hasWindow && (
        <div className="ml-16">
          <ItineraryWeatherNotes
            unavailable={unavailable}
            notPublished={notPublished}
            lang={lang}
          />
        </div>
      )}

      {/* AI nasvet na dnu (lokaliziran) */}
      {days[0]?.locations && days[0].locations.length > 0 && (
        <div className="ml-16 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold">{t("aiTipTitle")}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {days.length === 1 ? t("tipOneDay") : t("tipMultiDay")}
          </p>
        </div>
      )}
    </div>
  );
}
