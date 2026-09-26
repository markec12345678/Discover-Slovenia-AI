"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import dynamic from "next/dynamic";
import {
  CalendarDays,
  Car,
  Clock,
  Compass,
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
// TASK 8 / D8-D (§3.3 write-through): kanonski "Dodaj v mojo pot" na izbirah
import { AddToTripButton } from "@/components/add-to-trip-button";
import { addMyTripItem, removeMyTripItem } from "@/lib/my-trip";
import { supplyTripItem, supplyTripKind } from "@/lib/supply/my-trip-item";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
// TASK 8 / F3-B (D8-A P-STATE-2): družina stanj — skeleti kategorij med
// prvim iskanjem + ErrorState namesto golega rdečega besedila.
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/states/error-state";
import { LoadingState } from "@/components/states/loading-state";
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
// TASK 8 / F3-A (§43 NO PARALLEL APP — en načrtovalnik, ena zbirka):
// uskladitev ogledala izbir s kolekcijo + predlogi destinacij "Iz moje poti".
import { reconcileSelectionFromCollection } from "@/lib/journey/selection-mirror";
import { isInMyTrip } from "@/lib/my-trip";
import { useMyTrip } from "@/hooks/use-my-trip";
import { destinationIdOf } from "@/components/planner-my-trip-strip";
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
    // TASK 8 / F3-A (§43): /potovanje ni „drugi načrtovalnik" — to je korak
    // ponudnikov/logistike ISTEGA načrtovalniškega sistema. Ena vidna
    // resnica: izbire zrcali zbirka „Moja pot“ (dostopna povsod), v AI načrt
    // pa jih preneseš z enim klikom (handoff spodaj).
    note: {
      sl: "Del enega načrtovalnika: izbire se shranijo v zbirko „Moja pot“ (vidna na vseh straneh) in se z enim klikom prenesejo v AI načrt.",
      en: "Part of the one planner: picks land in your “My trip” collection (visible on every page) and carry into the AI plan in one click.",
    },
    fromMyTrip: { sl: "Iz moje poti:", en: "From my trip:" },
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
    // TASK 8 / D8-D (issue #8 §52 — NAMERNA sprememba besedila): oznaki
    // badge-toggle "Dodaj v načrt" / "Izbrano" sta upokojeni — zamenjal ju
    // je kanonski AddToTripButton ("Dodaj v mojo pot" / "V moji poti");
    // mehanika toggleProduct ostaja nespremenjena.
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
  // TASK 8 / F3-A: živi pogled na zbirko "Moja pot" (isti hook kot
  // PlannerMyTripStrip / MyTripView — subscription na dai:my-trip-changed
  // + cross-tab storage dogodke).
  const { items: myTripItems } = useMyTrip();

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

  // TASK 8 / F3-A — DRIFT A/B popravek (issue #8 §40/§43; 38-a §1f):
  // zbirka "Moja pot" je resnica OGLEDALA izbir za produkte aktualnega
  // potovanja. Dogodki (provider "events") ostajajo session-only (iz
  // zbirke so namenoma izključeni — D8-D). Po novem iskanju se izbire
  // STRUCTURNO rehidrirajo (re-search iste relacije obdrži izbire),
  // odstranitev iz zbirke (npr. drug zavihek /moja-potovanja) pa jih
  // pošteno odstrani tudi tu. Reconcile vrne isto referenco, če ni
  // spremembe (React bailout — brez ploske zanke re-renderjev).
  useEffect(() => {
    setSelected((prev) =>
      journey
        ? new Set(
            reconcileSelectionFromCollection(prev, allProducts, isInMyTrip)
          )
        : prev
    );
  }, [journey, allProducts, myTripItems]);

  // TASK 8 / F3-A: destinacije iz zbirke kot TIHI predlogi nad obrazcem —
  // klik na čip nastavi destinacijo (VIDNO dejanje; brez tihega prepisovanja
  // uporabnikove izbire — isto načelo kot PlannerMyTripStrip prefill).
  const myTripDestinations = useMemo(() => {
    const out: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    for (const item of myTripItems) {
      if (item.kind !== "destination") continue;
      const id = destinationIdOf(item);
      if (!id || seen.has(id)) continue;
      const d = DESTINATIONS.find((x) => x.id === id);
      if (!d) continue;
      seen.add(id);
      out.push({ id: d.id, name: d.name });
    }
    return out;
  }, [myTripItems]);

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
          {/* TASK 8 / F3-A (§43): tiha vrstica odnosa — en načrtovalnik,
              dva koraka (ponudniki tukaj, AI načrt tam). */}
          <p className="text-xs leading-snug text-muted-foreground">
            <Compass className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
            {t(L.form.note)}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* TASK 8 / F3-A: predlogi destinacij "Iz moje poti" — viden SAMO,
              ko zbirka nosi razlovljive destinacije. Klik = nastavi izbiro
              (aria-pressed — trenutna destinacija je poudarjena). */}
          {myTripDestinations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="inline-flex shrink-0 items-center gap-1 font-medium text-muted-foreground">
                <Compass className="size-3.5 text-primary" aria-hidden="true" />
                {t(L.form.fromMyTrip)}
              </span>
              {myTripDestinations.map((d) => {
                const active = destination === d.id;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => setDestination(d.id)}
                    aria-pressed={active}
                    className={`inline-flex min-h-[36px] items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      active
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {d.name}
                  </button>
                );
              })}
            </div>
          )}
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
            /* TASK 8 / F3-B: enotna error slovnica (destructive Alert +
                ponovitev = re-run plan()) — prej golo rdeče besedilo brez
                naslova in brez poti naprej (D8-A P-STATE-2). */
            <ErrorState message={error} onRetry={() => void plan()} className="mt-4" />
          )}
        </CardContent>
      </Card>
      </div>

      {/* === SKELETI KATEGORIJ MED PRVIM ISKANJEM (TASK 8 / F3-B) ===
          D8-A P-STATE-2 / 38-a §2d #3: rezultati so se prej pojavili v ENEM
          zamahu (nenadna zamenjava za praznim prostorom). Zdaj: statusna
          vrstica (role="status" aria-live="polite" — nosi obvestilo) + 2
          dekorativni skelet kartici na VIDO kategorijo (aria-hidden), dokler
          prvi rezultat ne prispe. Ponovno iskanje Z obstoječim potovanjem
          ohrani stare rezultate (konteksto, isto načelo kot načrtovalnik). */}
      {loading && !journey && (
        <div className="space-y-6" aria-busy="true">
          <LoadingState variant="block" label={t(L.form.planning)} />
          <div aria-hidden="true" className="space-y-6">
            {ALL_CATS.filter((c) => cats.includes(c)).map((catKey) => (
              <section key={catKey} className="space-y-3">
                <div className="flex items-center gap-2">
                  <Skeleton className="size-6 rounded-md" />
                  <Skeleton className="h-6 w-40" />
                </div>
                {Array.from({ length: 2 }).map((_, i) => (
                  <Card key={i}>
                    <CardContent className="space-y-3 p-4">
                      <Skeleton className="h-5 w-2/3" />
                      <Skeleton className="h-4 w-1/2" />
                      <Skeleton className="h-4 w-1/3" />
                    </CardContent>
                  </Card>
                ))}
              </section>
            ))}
          </div>
        </div>
      )}

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
                            /* TASK 8 / D8-D (§3.3 write-through, D8-A §4.1
                                varianta 4): prej "Dodaj v načrt" badge-toggle.
                                Mehanika izbire (toggleProduct → handoff/Go
                                Mode) ostaja IDENTIČNA; ob VKLJUČITVI se
                                produkt hkrati registrira v zbirko "Moja pot"
                                (ADD sloj), ob izključitvi pa iz nje pobriše
                                (zbirka zrcali izbiro — isto dejanje
                                uporabnika). */
                            <AddToTripButton
                              variant="compact"
                              added={isSelected}
                              onToggle={(next) => {
                                toggleProduct(p.id);
                                if (next) {
                                  addMyTripItem(
                                    supplyTripItem(p, lang, "potovanje", "/potovanje")
                                  );
                                } else {
                                  removeMyTripItem(supplyTripKind(p.type), p.id);
                                }
                              }}
                              item={supplyTripItem(p, lang, "potovanje", "/potovanje")}
                            />
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
