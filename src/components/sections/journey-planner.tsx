"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import {
  CalendarDays,
  Car,
  Clock,
  ExternalLink,
  Fuel,
  Landmark,
  Loader2,
  MapPin,
  Navigation,
  PartyPopper,
  Plane,
  Users,
  Utensils,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { COUNTRIES, DESTINATIONS } from "@/lib/slovenia-data";
import { COUNTRIES_EN } from "@/lib/slovenia-data-en";
import { persistSelection } from "@/lib/supply/selection-persist";
import { recordExternalHandoff } from "@/lib/journey/handoff-record";
import { OpeningHoursStatus } from "@/components/opening-hours-status";
import { useAppStore } from "@/lib/store";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import { describeTotals } from "@/lib/journey/totals";
import { journeyProductsToSelection } from "@/lib/journey/handoff";
import { saveGoTrip } from "@/lib/journey/go-persist";
import { JourneyTrip } from "@/components/journey-trip";
import type {
  JourneyCategoryKey,
  JourneyProduct,
  TravelJourney,
} from "@/lib/journey/types";

// Leaflet je window-odvisen — ENAK vzorec kot map-section/shared-trip
// (dynamic + ssr:false; NIKOLI SSR import leafleta).
const JourneyMap = dynamic(
  () => import("@/components/journey-map").then((m) => m.JourneyMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[280px] w-full items-center justify-center rounded-lg border text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      </div>
    ),
  }
);

// ============================================================================
// JOURNEY PLANNER — OSREDNJI UI POTOVANJA (TASK 58)
// ============================================================================
// Prihod (Brnik, ura) → transfer → nastanitev → dogodki → restavracije →
// bencin → najem: VSE kategorije z ISKRENIMI oznakami (FROM PRICE ≠ končna
// cena; PRICE UNKNOWN ≠ brezplačno; BOOKABLE/EXTERNAL ≠ opravljena rezervacija;
// INFO ONLY brez rezervacije). Izbire → sessionStorage → načrtovalnik
// (obstoječa FIXED integracija — AI izbrane izdelkov NE zamenja tiho).
// ============================================================================

const L = {
  form: {
    title: { sl: "Sestavi celotno potovanje", en: "Build your complete journey" },
    subtitle: {
      sl: "Prihod → prevoz → nastanitev → znamenitosti → dogodki → restavracije → bencin → najem avta — na enem mestu, z resničnimi ponudniki.",
      en: "Arrival → transfer → stay → things to do → events → restaurants → petrol → car rental — in one place, with real providers.",
    },
    origin: { sl: "Izhodišče (npr. Brnik)", en: "Origin (e.g. Brnik)" },
    destination: { sl: "Destinacija", en: "Destination" },
    date: { sl: "Datum prihoda", en: "Arrival date" },
    time: { sl: "Ura prihoda", en: "Arrival time" },
    travelers: { sl: "Potniki", en: "Travelers" },
    plan: { sl: "Načrtuj potovanje", en: "Plan the journey" },
    planning: { sl: "Iskanje po virih …", en: "Searching sources …" },
    cats: { sl: "Kategorije", en: "Categories" },
  },
  cat: {
    transfer: { sl: "Transfer", en: "Transfer" },
    accommodation: { sl: "Nastanitev", en: "Stay" },
    attractions: { sl: "Znamenitosti", en: "Things to do" },
    events: { sl: "Dogodki", en: "Events" },
    restaurants: { sl: "Restavracije", en: "Restaurants" },
    petrol: { sl: "Bencinske postaje", en: "Petrol stations" },
    rental: { sl: "Najem avta", en: "Car rental" },
  },
  badge: {
    fromPrice: { sl: "OD CENA", en: "FROM PRICE" },
    priceUnknown: { sl: "CENA NEZNANA", en: "PRICE UNKNOWN" },
    livePrice: { sl: "CENA VIRA", en: "SOURCE PRICE" },
    availabilityUnknown: { sl: "RAZPOLOŽLJIVOST NEZNANA", en: "AVAILABILITY UNKNOWN" },
    // TASK 99 (issue #1 §5): LIVE stanja se prikažejo PO NJIHOVI barvi —
    // „live_available" NI „unknown" (prej so se vsa ne-not_supported stanja
    // izrisala kot neznana — latentna napačna oznaka).
    availabilityLive: { sl: "LIVE · NA VOLJO", en: "LIVE · AVAILABLE" },
    availabilityUnavailable: {
      sl: "LIVE · NI NA VOLJO",
      en: "LIVE · UNAVAILABLE",
    },
    bookableExternal: { sl: "REZERVACIJA PRI PONUDNIKU", en: "BOOKABLE · EXTERNAL" },
    infoOnly: { sl: "SAMO INFORMACIJA", en: "INFO ONLY" },
    affiliateOnly: { sl: "SAMO POVEZAVA PARTNERJA", en: "AFFILIATE ONLY" },
    selected: { sl: "Izbrano", en: "Selected" },
    select: { sl: "Dodaj v načrt", en: "Add to plan" },
  },
  totals: {
    title: { sl: "Skupna cena potovanja", en: "Journey total" },
    confirmed: { sl: "Potrjeno", en: "Confirmed" },
    known: { sl: "Znane cene", en: "Known" },
    estimated: { sl: "Ocena (od-cene)", en: "Estimate (from-prices)" },
    unknown: { sl: "Neznane cene", en: "Unknown prices" },
  },
  handoff: {
    button: { sl: "Nadaljuj v načrtovalnik", en: "Continue in the planner" },
    hint: {
      sl: "Izbrani izdelki se prenesjo kot TVOJA izbira (AI jih ne zamenja tiho).",
      en: "Selected products carry over as YOUR choice (AI will not silently replace them).",
    },
    none: { sl: "Izberi vsaj en izdelek", en: "Select at least one product" },
  },
  go: {
    button: { sl: "Zaženi Na poti (Go Mode)", en: "Start On-the-road (Go Mode)" },
    hint: {
      sl: "Načrt se shrani na tej napravi — med potovanjem vidiš, kaj je naslednje, razdaljo do postanka (GPS) in opravljene postanke.",
      en: "The plan is saved on this device — while traveling you see what's next, distance to the stop (GPS) and completed stops.",
    },
  },
  origin: { sl: "Izhodišče", en: "Origin" },
  destination: { sl: "Destinacija", en: "Destination" },
  earliest: {
    sl: (t: string, via: string) =>
      `Najzgodnejši možni prihod v ${via}: ${t} (ura prihoda + trajanje transferja iz podatkov vira).`,
    en: (t: string, via: string) =>
      `Earliest possible arrival in ${via}: ${t} (arrival time + transfer duration from source data).`,
  },
  vehicle: { sl: "Razredi vozil (objavljene cene)", en: "Vehicle classes (published prices)" },
  duration: { sl: "trajanje", en: "duration" },
  min: { sl: "min", en: "min" },
  km: { sl: "km", en: "km" },
  bookAt: { sl: "Rezerviraj pri ponudniku", en: "Book at the provider" },
  openSource: { sl: "Odpri vir", en: "Open source" },
  hours: { sl: "Odpiralni časi", en: "Opening hours" },
  perTransfer: { sl: "prevoz", en: "transfer" },
  status: { sl: "Status vira", en: "Source status" },
  eventsNote: {
    sl: "Dogodki so informacijski — nakup vstopnic ni podprt.",
    en: "Events are informational — ticket purchase is not supported.",
  },
};

const CATEGORY_ICONS: Record<JourneyCategoryKey, React.ReactNode> = {
  transfer: <Car className="h-4 w-4" />,
  accommodation: <MapPin className="h-4 w-4" />,
  attractions: <Landmark className="h-4 w-4" />,
  events: <PartyPopper className="h-4 w-4" />,
  restaurants: <Utensils className="h-4 w-4" />,
  petrol: <Fuel className="h-4 w-4" />,
  rental: <Car className="h-4 w-4" />,
};

const ALL_CATS: JourneyCategoryKey[] = [
  "transfer",
  "accommodation",
  "attractions",
  "events",
  "restaurants",
  "petrol",
  "rental",
];

function priceBadge(p: JourneyProduct, lang: "sl" | "en") {
  const t = lang === "en" ? L.badge : { ...L.badge };
  if (!p.price) {
    return <Badge variant="outline">{t.priceUnknown[lang]}</Badge>;
  }
  if (p.price.fromPrice) {
    return (
      <Badge className="bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-100">
        {t.fromPrice[lang]} · od €{p.price.amount}
      </Badge>
    );
  }
  return (
    <Badge className="bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-100">
      {t.livePrice[lang]} · €{p.price.amount}
    </Badge>
  );
}

function bookingBadge(p: JourneyProduct, lang: "sl" | "en") {
  if (p.booking.flow === "external_affiliate") {
    return (
      <Badge className="bg-violet-100 text-violet-900 border-violet-300 hover:bg-violet-100">
        {L.badge.bookableExternal[lang]}
      </Badge>
    );
  }
  return <Badge variant="secondary">{L.badge.infoOnly[lang]}</Badge>;
}

export function JourneyPlanner() {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const router = useRouter();

  const [origin, setOrigin] = useState("Brnik");
  const [destination, setDestination] = useState("maribor");
  const [startDate, setStartDate] = useState("");
  const [arrivalTime, setArrivalTime] = useState("14:00");
  const [travelers, setTravelers] = useState(2);
  const [cats, setCats] = useState<JourneyCategoryKey[]>(ALL_CATS);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [journey, setJourney] = useState<TravelJourney | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // §21: tiskalniški pogovor pokaže SAMO potrditveni dokument (MY TRIP).
  const [printMode, setPrintMode] = useState(false);

  const toggleCat = (c: JourneyCategoryKey) =>
    setCats((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );

  const plan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/journey/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin,
          destination,
          ...(startDate ? { startDate } : {}),
          arrivalTime,
          travelers,
          categories: cats,
          lang,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Napaka");
        setJourney(null);
        return;
      }
      setJourney(data.journey as TravelJourney);
      setSelected(new Set());
    } catch {
      setError(lang === "en" ? "Network error" : "Omrežna napaka");
    } finally {
      setLoading(false);
    }
  }, [origin, destination, startDate, arrivalTime, travelers, cats, lang]);

  const allProducts = useMemo(() => {
    if (!journey) return [];
    const out: JourneyProduct[] = [];
    for (const key of ALL_CATS) {
      out.push(...journey.categories[key]?.products ?? []);
    }
    return out;
  }, [journey]);

  const selectedProducts = useMemo(
    () => allProducts.filter((p) => selected.has(p.id)),
    [allProducts, selected]
  );

  /**
   * Izbira potovanja → obstoječa izbira načrtovalnika (FIXED semantika).
   * Preslikava živi v lib/journey/handoff.ts (provider-agnostic §24 —
   * oznake virov IZ registra, dedupe, dogodki izpuščeni).
   */
  const handoff = useCallback(() => {
    const items = journeyProductsToSelection(selectedProducts, lang);
    // KANONSKI vzorec iz načrtovalnika (itinerary-planner:3054): pomnilniška
    // trgovina IN sessionStorage — če je bil store inicializiran že na
    // /potovanje (npr. klepet), ostane usklajen tudi v pomnilniku.
    useAppStore.getState().setSelectedProducts(items);
    persistSelection(items);
    router.push(lang === "en" ? "/en/nacrtuj" : "/nacrtuj");
  }, [selectedProducts, router, lang]);

  /**
   * TASK 64 — GO MODE aktivacija: persistira journey + izbire na napravo
   * (dai:go-trip) in odpre /na-poti (Now&Next sopotnik). NI strežniški klic —
   * isti kanonski journey, ki ga vidi MY TRIP.
   */
  const startGoMode = useCallback(() => {
    if (!journey) return;
    saveGoTrip(journey, [...selected]);
    router.push(lang === "en" ? "/en/na-poti" : "/na-poti");
  }, [journey, selected, router, lang]);

  /**
   * §21: natisni potrditveni dokument — začasno skrij ostale dele strani
   * (print:hidden razredi spodaj), sproži window.print(), povrni po dogodku.
   */
  const printConfirmation = useCallback(() => {
    setPrintMode(true);
    // Počakaj razred na DOM, nato odpri tiskalniški pogovor.
    requestAnimationFrame(() => {
      window.print();
      const done = () => setPrintMode(false);
      window.addEventListener("afterprint", done, { once: true });
      // Varnostna kopija za brskalnike brez afterprint dogodka.
      setTimeout(done, 1500);
    });
  }, []);

  const toggleProduct = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const mapProducts = useMemo(
    () =>
      allProducts.map((p) => ({
        ...p,
        mapStatus: selected.has(p.id) ? ("selected" as const) : p.mapStatus,
      })),
    [allProducts, selected]
  );

  const t = (o: { sl: string; en: string }) => o[lang];

  return (
    <div className="space-y-6">
      {/* === VHODNI OBRAZEC === */}
      <div className={printMode ? "print:hidden" : ""}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Plane className="h-5 w-5" /> {t(L.form.title)}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t(L.form.subtitle)}</p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1">
              <label htmlFor="j-origin" className="text-sm font-medium">
                {t(L.form.origin)}
              </label>
              <Input
                id="j-origin"
                value={origin}
                onChange={(e) => setOrigin(e.target.value)}
                placeholder="Brnik / Ljubljana Airport / Maribor"
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="j-dest" className="text-sm font-medium">
                {t(L.form.destination)}
              </label>
              <select
                id="j-dest"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {COUNTRIES.map((c) => {
                  const group = DESTINATIONS.filter(
                    (d) => d.country === c.value
                  );
                  if (group.length === 0) return null;
                  const groupLabel =
                    lang === "en"
                      ? (COUNTRIES_EN[c.value] ?? c.label)
                      : c.label;
                  return (
                    <optgroup key={c.value} label={groupLabel}>
                      {group.map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name} · {d.budget} · ★ {d.rating.toFixed(1)}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label htmlFor="j-date" className="flex items-center gap-1 text-sm font-medium">
                  <CalendarDays className="h-3.5 w-3.5" /> {t(L.form.date)}
                </label>
                <Input
                  id="j-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="j-time" className="flex items-center gap-1 text-sm font-medium">
                  <Clock className="h-3.5 w-3.5" /> {t(L.form.time)}
                </label>
                <Input
                  id="j-time"
                  type="time"
                  value={arrivalTime}
                  onChange={(e) => setArrivalTime(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="j-pax" className="flex items-center gap-1 text-sm font-medium">
                  <Users className="h-3.5 w-3.5" /> {t(L.form.travelers)}
                </label>
                <Input
                  id="j-pax"
                  type="number"
                  min={1}
                  max={20}
                  value={travelers}
                  onChange={(e) => setTravelers(Number(e.target.value) || 2)}
                />
              </div>
            </div>
          </div>

          <fieldset className="space-y-1">
            <legend className="text-sm font-medium">{t(L.form.cats)}</legend>
            <div className="flex flex-wrap gap-2">
              {ALL_CATS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  aria-pressed={cats.includes(c)}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors ${
                    cats.includes(c)
                      ? "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200"
                      : "border-input bg-background text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {CATEGORY_ICONS[c]}
                  {t(L.cat[c])}
                </button>
              ))}
            </div>
          </fieldset>

          <Button onClick={plan} disabled={loading} className="w-full sm:w-auto">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t(L.form.planning)}
              </>
            ) : (
              t(L.form.plan)
            )}
          </Button>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </CardContent>
      </Card>
      </div>

      {/* === REZULTATI === */}
      {journey && (
        <div className="space-y-6">
          {/* Povzetek: kraji + najzgodnejši prihod */}
          <div className={printMode ? "print:hidden" : ""}>
          <Card>
            <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4 text-sm">
              <span className="font-medium">
                ✈ {t(L.origin)}: {journey.origin.label}
                {journey.origin.lat != null && (
                  <span className="ml-1 text-muted-foreground">
                    ({journey.origin.lat.toFixed(3)}, {journey.origin.lng?.toFixed(3)})
                  </span>
                )}
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="font-medium">
                🎯 {t(L.destination)}: {journey.destination.label}
              </span>
              <span className="text-muted-foreground">
                <Users className="mr-1 inline h-3.5 w-3.5" />
                {journey.travelers}
              </span>
              {journey.earliestArrivalAtDestination && (
                <span className="text-muted-foreground">
                  {L.earliest[lang](
                    journey.earliestArrivalAtDestination.time,
                    journey.earliestArrivalAtDestination.via
                  )}
                </span>
              )}
            </CardContent>
          </Card>
          </div>

          {/* Zemljevid potovanja (statusi pinov §13) */}
          <div className={printMode ? "print:hidden" : ""}>
            <JourneyMap
              products={mapProducts}
              origin={journey.origin}
              destination={journey.destination}
              lang={lang}
            />
          </div>

          {/* §20 MY TRIP — ena časovnica potovanja + §21 potrditveni dokument */}
          <JourneyTrip
            journey={journey}
            selectedIds={selected}
            onPrint={printConfirmation}
          />

          {/* Kategorije */}
          <div className={printMode ? "print:hidden" : ""}>
          {ALL_CATS.filter((c) => cats.includes(c)).map((catKey) => {
            const cat = journey.categories[catKey];
            if (!cat) return null;
            return (
              <section key={catKey} aria-label={t(L.cat[catKey])} className="space-y-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  {CATEGORY_ICONS[catKey]} {t(L.cat[catKey])}
                  <span className="text-sm font-normal text-muted-foreground">
                    {cat.products.length > 0
                      ? `${cat.products.length}`
                      : cat.providers.length > 0
                        ? cat.providers.length
                        : "0"}
                  </span>
                </h3>

                {cat.note && (
                  <p className="text-sm text-muted-foreground">{t(cat.note)}</p>
                )}

                {/* Affiliate kartice (najem — NE inventar) */}
                {cat.providers.map((prov) => (
                  <Card key={prov.provider}>
                    <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="space-y-1">
                        <p className="font-medium">{t(prov.label)}</p>
                        <div className="flex flex-wrap gap-1.5">
                          <Badge variant="outline">{L.badge.affiliateOnly[lang]}</Badge>
                          <Badge variant="secondary">{t(prov.booking.label)}</Badge>
                        </div>
                        {prov.note && (
                          <p className="text-xs text-muted-foreground">{t(prov.note)}</p>
                        )}
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <a href={prov.url} target="_blank" rel="noopener noreferrer">
                          {t(L.bookAt)} <ExternalLink className="ml-1 h-3.5 w-3.5" />
                        </a>
                      </Button>
                    </CardContent>
                  </Card>
                ))}

                {/* Kanonski produkti */}
                {cat.products.map((p) => {
                  const isSelected = selected.has(p.id);
                  return (
                    <Card
                      key={p.id}
                      className={isSelected ? "border-emerald-500 ring-1 ring-emerald-500" : ""}
                    >
                      <CardContent className="space-y-2 p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0 space-y-1">
                            <p className="font-medium leading-snug">{p.title}</p>
                            <div className="flex flex-wrap gap-1.5">
                              {priceBadge(p, lang)}
                              {p.availability &&
                                p.availability.status ===
                                  "live_available" && (
                                  <Badge className="border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-100">
                                    {L.badge.availabilityLive[lang]}
                                  </Badge>
                                )}
                              {p.availability &&
                                p.availability.status ===
                                  "live_unavailable" && (
                                  <Badge className="border-red-300 bg-red-100 text-red-900 hover:bg-red-100">
                                    {L.badge.availabilityUnavailable[lang]}
                                  </Badge>
                                )}
                              {p.availability &&
                                p.availability.status === "unknown" && (
                                  <Badge variant="outline">
                                    {L.badge.availabilityUnknown[lang]}
                                  </Badge>
                                )}
                              {bookingBadge(p, lang)}
                              {p.durationMin != null && (
                                <Badge variant="outline">
                                  ~{p.durationMin} {L.min[lang]}
                                </Badge>
                              )}
                              {p.distanceKm != null && (
                                <Badge variant="outline">
                                  {p.distanceKm} {L.km[lang]}
                                </Badge>
                              )}
                            </div>
                          </div>
                          {p.provider !== "events" && (
                            <Button
                              variant={isSelected ? "default" : "outline"}
                              size="sm"
                              onClick={() => toggleProduct(p.id)}
                              aria-pressed={isSelected}
                            >
                              {isSelected ? L.badge.selected[lang] : t(L.badge.select)}
                            </Button>
                          )}
                        </div>

                        {/* Razredi vozil (KT transfer — realni podatki vira) */}
                        {p.vehicleOptions && p.vehicleOptions.length > 0 && (
                          <div className="space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">
                              {t(L.vehicle)}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {p.vehicleOptions.map((v) => (
                                <span
                                  key={v.transferId}
                                  className="rounded-md border bg-muted/50 px-2 py-1 text-xs"
                                >
                                  {v.name} · ≤{v.pax}👤 · od €{v.eur}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Dogodek: datum */}
                        {p.eventDate && (
                          <p className="text-sm text-muted-foreground">
                            <CalendarDays className="mr-1 inline h-3.5 w-3.5" />
                            {p.eventDate.start}
                            {p.eventDate.end ? ` → ${p.eventDate.end}` : ""}
                            {p.address ? ` · ${p.address}` : ""}
                          </p>
                        )}

                        <div className="flex flex-wrap items-center gap-3 text-sm">
                          {p.bookingUrl && (
                            <a
                              href={p.bookingUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              // 1.88.1 (FA-3 GAP): kartični CTA je prej odšel
                              // k ponudniku BREZ zapisa EXTERNAL (samo MOJA POT
                              // povezava ga je zapisala) — lifecycle evidence
                              // zdaj pošten na VSEH površinah izdelka.
                              onClick={() =>
                                recordExternalHandoff(
                                  p.provider,
                                  p.providerProductId
                                )
                              }
                              className="inline-flex items-center gap-1 font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
                            >
                              {t(L.bookAt)} <ExternalLink className="h-3.5 w-3.5" />
                            </a>
                          )}
                          {p.sourceUrl && (
                            <a
                              href={p.sourceUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
                            >
                              {t(L.openSource)} <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                          {/* ISSUE #4 §9: status ur ob trenutku + surov
                              niz vira (prej: samo surov niz). */}
                          {p.openingHours && (
                            <span className="text-xs text-muted-foreground">
                              <span className="mr-1">{t(L.hours)}:</span>
                              <OpeningHoursStatus
                                raw={p.openingHours}
                                lang={lang}
                                className="text-xs"
                              />
                            </span>
                          )}
                        </div>

                        {p.note && (
                          <p className="text-xs text-muted-foreground">{t(p.note)}</p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </section>
            );
          })}
          </div>

          {/* === SKUPNA CENA (semantika §16) === */}
          <div className={printMode ? "print:hidden" : ""}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t(L.totals.title)}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-semibold">
                    €{journey.totals.confirmedTotal.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(L.totals.confirmed)}</p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-xl font-semibold">
                    €{journey.totals.knownTotal.toFixed(0)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t(L.totals.known)}</p>
                </div>
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:bg-amber-950">
                  <p className="text-xl font-semibold text-amber-900 dark:text-amber-200">
                    od €{journey.totals.estimatedTotal.toFixed(0)}
                  </p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    {t(L.totals.estimated)}
                  </p>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {describeTotals(journey.totals, lang)}
              </p>
            </CardContent>
          </Card>
          </div>

          {/* === PRENOS V NAČRTOVALNIK (FIXED) + GO MODE (TASK 64) === */}
          <div className={printMode ? "print:hidden" : ""}>
          <div className="space-y-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handoff}
                disabled={selectedProducts.length === 0}
                className="h-11 w-full sm:w-auto sm:flex-1"
              >
                {t(L.handoff.button)} ({selectedProducts.length})
              </Button>
              <Button
                onClick={startGoMode}
                disabled={selectedProducts.length === 0}
                variant="outline"
                className="h-11 w-full border-emerald-600/50 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-500/40 dark:text-emerald-300 dark:hover:bg-emerald-950 sm:w-auto sm:flex-1"
              >
                <Navigation className="mr-2 h-4 w-4" /> {t(L.go.button)}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {selectedProducts.length === 0
                ? t(L.handoff.none)
                : t(L.handoff.hint)}
            </p>
            {journey && selectedProducts.length > 0 && (
              <p className="text-xs text-muted-foreground">{t(L.go.hint)}</p>
            )}
          </div>
          </div>
        </div>
      )}
    </div>
  );
}
