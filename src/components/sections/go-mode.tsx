"use client";

// ============================================================================
// TASK 64 — GO MODE „NA POTI": NOW & NEXT UI (1.64.0)
// ============================================================================
// Sopotnik MED POTOVANJEM (telefon v žepu): velika ura, NASLEDNJA postanka,
// razdalja/smer do nje (GPS, premica — iskrena), ostale postanke dneva,
// opravljanje z enim klikom, povzetek kasnejših dni. Podatki: /potovanje →
// „Zaženi Na poti" persistira načrt na NAPRAVI (dai:go-trip) — ta stran je
// 100 % client-side (0 API klicev, deluje tudi brez signala za ogled načrta).
//
// Hidracija: vse iz localStorage/ure/GPS se rendera TEKOM mounta (mounted
// gate) — SSR in klient se strinjata (skeleton), ni mismatch-a.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CloudSun,
  Compass,
  ExternalLink,
  LocateFixed,
  Loader2,
  MapPin,
  Navigation as NavigationIcon,
  Phone,
  RotateCcw,
  Route as RouteIcon,
  Trash2,
  Wand2,
} from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buildMyTrip } from "@/lib/journey/trip-view";
import { recordExternalHandoff } from "@/lib/journey/handoff-record";
import { heuristicLeg } from "@/lib/road-routing";
import { OpeningHoursStatus } from "@/components/opening-hours-status";
import {
  buildGoView,
  GO_LABELS,
  type GoEntryCard,
} from "@/lib/journey/go-view";
import { useGeolocation, type GeoStatus } from "@/lib/journey/use-geolocation";
import {
  clearGoTrip,
  loadGoProgress,
  loadGoTrip,
  saveGoProgress,
  type GoTripRecord,
} from "@/lib/journey/go-persist";
import {
  goWeatherTarget,
  observedTimeLabel,
  parseGoWeatherResponse,
  GO_WEATHER_LABELS,
  type GoWeather,
} from "@/lib/journey/go-weather";
import {
  GO_NAV_LABELS,
  goNavLinks,
  isCoarsePointer,
} from "@/lib/journey/go-nav";

// ---------------------------------------------------------------------------
// Oznake (L vzorec — enak kanon kot journey-planner/journey-trip)
// ---------------------------------------------------------------------------

const L = {
  now: { sl: "Zdaj", en: "Now" },
  gps: {
    start: { sl: "Vklopi GPS", en: "Turn on GPS" },
    stop: { sl: "Izklopi GPS", en: "Turn off GPS" },
    status: {
      idle: { sl: "GPS je izklopljen.", en: "GPS is off." },
      requesting: { sl: "Nastavljam fiksacijo …", en: "Fixing position …" },
      active: { sl: "GPS aktiven", en: "GPS active" },
      denied: {
        sl: "Dovoljenje za lokacijo je zavrnjeno — omogoči ga v nastavitvah brskalnika.",
        en: "Location permission denied — enable it in the browser settings.",
      },
      unavailable: {
        sl: "Ta naprava ali brskalnik ne podpira Geolocation API.",
        en: "This device or browser does not support the Geolocation API.",
      },
      error: { sl: "GPS napaka", en: "GPS error" },
    } as Record<GeoStatus, { sl: string; en: string }>,
    accuracy: {
      sl: (m: number) => `natančnost ±${Math.round(m)} m`,
      en: (m: number) => `accuracy ±${Math.round(m)} m`,
    },
  },
  next: { sl: "Naslednje", en: "Next" },
  today: { sl: "Danes načrtovano", en: "Planned today" },
  done: { sl: "Opravljeno", en: "Completed" },
  complete: { sl: "Opravi", en: "Done" },
  restore: { sl: "Obnovi", en: "Restore" },
  laterDays: { sl: "Naslednji dnevi", en: "Coming days" },
  stops: { sl: "postankov", en: "stops" },
  inAir: { sl: "v zraku", en: "as the crow flies" },
  toward: { sl: "proti", en: "toward" },
  hours: { sl: "Odpiralni časi", en: "Opening hours" },
  call: { sl: "Pokliči", en: "Call" },
  bookAt: { sl: "Rezerviraj pri ponudniku", en: "Book at the provider" },
  openSource: { sl: "Odpri vir", en: "Open source" },
  planLink: { sl: "Nazaj na potovanje", en: "Back to the journey" },
  end: { sl: "Zaključi Na poti", en: "End On-the-road" },
  endConfirm: {
    title: { sl: "Zaključim Na poti?", en: "End On-the-road?" },
    desc: {
      sl: "Načrt in opravljene postanke pobrišem s te naprave. Na /potovanje ga lahko kadar koli sestaviš znova.",
      en: "I will delete the plan and completed stops from this device. You can rebuild it anytime at /potovanje.",
    },
    cancel: { sl: "Prekliči", en: "Cancel" },
    action: { sl: "Zaključi", en: "End" },
  },
  empty: {
    title: { sl: "Ni aktivnega potovanja", en: "No active journey" },
    desc: {
      sl: "Sestavi potovanje na strani Potovanje (prihod, destinacija, postanke po 4 državah), izberi kar te zanima in pritisni „Zaženi Na poti“.",
      en: "Build a journey on the Journey page (arrival, destination, stops across 4 countries), pick what interests you and press “Start On-the-road”.",
    },
    // TASK 4 / K-7: drugi izhod za uporabnike AI NAČRTA — prej je empty
    // state vodil SAMO v /potovanje (drugi koncept), AI načrt ni imel mostu.
    descAi: {
      sl: "Imaš AI načrt? Gumb „Zaženi Na poti“ na načrtovalniku (ali deljeni povezavi) ga naloži sem — deluje tudi brez signala.",
      en: "Have an AI plan? The “Start On-the-road” button on the planner (or a shared link) loads it here — it works offline too.",
    },
    cta: { sl: "Sestavi potovanje", en: "Build a journey" },
    ctaAi: { sl: "Načrtuj z AI", en: "Plan with AI" },
  },
  duration: { sl: "trajanje", en: "duration" },
  min: { sl: "min", en: "min" },
  offline: {
    sl: "Načrt je shranjen na tej napravi — deluje tudi brez signala.",
    en: "The plan is stored on this device — it works offline too.",
  },
  // === ISSUE #4 §8 (val 2): real-time kontekst — pošteni žetoni ===
  driveFromPrev: {
    sl: "vožnja od prejšnjega postanka",
    en: "drive from the previous stop",
  },
  legSource: {
    osrm: { sl: "vir: OSRM (realne ceste)", en: "source: OSRM (real roads)" },
    heuristic: { sl: "ocena (hevristika)", en: "estimate (heuristic)" },
  },
  eta: {
    label: { sl: "Predviden prihod", en: "Estimated arrival" },
    hint: {
      sl: "ocena iz premočne razdalje ×1,3 pri 55 km/h — ni podatka o prometu",
      en: "estimate from straight-line ×1.3 at 55 km/h — no traffic data",
    },
    unknown: {
      sl: "Predviden prihod: neznano — brez GPS ali vozne razdalje",
      en: "Estimated arrival: unknown — no GPS or drive distance",
    },
  },
  delay: {
    sl: "Zamude in promet v realnem času: NEZNANO — nimamo vira (niti lažnega prometa).",
    en: "Real-time delays and traffic: UNKNOWN — we have no source (and no fake traffic either).",
  },
  dayRoute: {
    sl: (n: number, km: number, min: number, method: string) =>
      `Pot dneva: ${n} postankov · skupaj ~${km} km · ~${min} min (${method})`,
    en: (n: number, km: number, min: number, method: string) =>
      `Day's route: ${n} stops · ~${km} km total · ~${min} min (${method})`,
  },
  hoursMissing: {
    sl: "vir ne objavlja ur — preveri pri postanku",
    en: "not published by the source — check on arrival",
  },
  savedTrip: {
    link: { sl: "Odpri shranjeno pot", en: "Open the saved trip" },
    note: {
      sl: "Ta načrt je povezan s shranjeno potjo (/pot/…).",
      en: "This plan is linked to a saved trip (/pot/…).",
    },
  },
} as const;

function localeTime(d: Date, lang: "sl" | "en"): string {
  return d.toLocaleTimeString(lang === "sl" ? "sl-SI" : "en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------------------------------------------------------------------------
// Kartice
// ---------------------------------------------------------------------------

function DistanceChip({ card, lang }: { card: GoEntryCard; lang: "sl" | "en" }) {
  if (card.distanceKm == null || !card.bearingLabel) return null;
  return (
    <Badge className="gap-1 border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <MapPin className="h-3 w-3" />
      {card.distanceKm} km {L.toward[lang]} {card.bearingLabel[lang]} ·{" "}
      {L.inAir[lang]}
    </Badge>
  );
}

/**
 * ISSUE #4 §8 (val 2): VOŽNJA od prejšnjega postanka (po načrtu) — km/min
 * iz OSRM ali hevristike, vir razkrit. Brez noge (prvi postanek dneva /
 * manjkajoči par) se žeton NE prikaže (ne izmišljujemo).
 */
function LegChip({
  card,
  lang,
}: {
  card: GoEntryCard;
  lang: "sl" | "en";
}) {
  const leg = card.entry.legFromPrev;
  if (!leg) return null;
  return (
    <Badge
      className="gap-1 border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-50 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200"
      title={L.driveFromPrev[lang]}
    >
      <RouteIcon className="h-3 w-3" aria-hidden="true" />
      ~{leg.km} km · ~{leg.min} {L.min[lang]} ·{" "}
      {t2(leg.source === "osrm" ? L.legSource.osrm : L.legSource.heuristic, lang)}
    </Badge>
  );
}

/** Dvojezična pomožna (krajšanje za žetone). */
function t2(o: { sl: string; en: string }, lang: "sl" | "en") {
  return o[lang];
}

function EntryLinks({
  card,
  lang,
}: {
  card: GoEntryCard;
  lang: "sl" | "en";
}) {
  const e = card.entry;
  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      {e.bookingUrl && (
        <a
          href={e.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          // 1.88.1 (FA-3 GAP): enak zapis EXTERNAL handoffa kot MOJA POT
          // povezava (prej Go Mode kliki niso pustili lifecycle sledi).
          onClick={() =>
            recordExternalHandoff(e.provider, e.providerProductId)
          }
          className="inline-flex items-center gap-1 font-medium text-violet-700 underline-offset-4 hover:underline dark:text-violet-400"
        >
          {L.bookAt[lang]} <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}
      {e.sourceUrl && (
        <a
          href={e.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
        >
          {L.openSource[lang]} <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {e.phone && (
        <a
          href={`tel:${e.phone.replace(/\s+/g, "")}`}
          className="inline-flex items-center gap-1 text-muted-foreground underline-offset-4 hover:underline"
        >
          <Phone className="h-3.5 w-3.5" /> {L.call[lang]}: {e.phone}
        </a>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TASK 67 — NAVIGACIJSKI HANDOFF (zunanja aplikacija)
// ---------------------------------------------------------------------------

/**
 * Gumb „Navigiraj": ODPRE zunanjo navigacijo do postanka.
 *  - href = Google Maps URL (vedno veljaven https link — SSR/hidracijsko
 *    varen, deluje povsod);
 *  - na mobilnem (pointer: coarse) klik prestrežemo in odpremo geo: URI →
    SISTEMSKI izbirnik navigacijskih aplikacij (Google Maps, Waze, Organic,
    Apple Maps … — uporabnik izbere svojo);
 *  - postanek BREZ geo → gumba NI (iskrena odsotnost — kot razdalja);
 *  - platforma NI lastna navigacija (AGENTS.md §13) — label to izrecno pove.
 */
function NavButton({
  card,
  lang,
  variant = "hero",
  origin,
}: {
  card: GoEntryCard;
  lang: "sl" | "en";
  variant?: "hero" | "icon";
  /** ISSUE #4 §8: živi GPS — prenese se v web URL (external app dobi
   * dejansko izhodišče; brez njega uporabi svojo lokacijo). */
  origin?: { lat: number; lng: number } | null;
}) {
  const links = goNavLinks(card.entry, origin ?? null);
  if (links == null) return null; // brez geo → handoff preprosto NI

  const onNav = (e: React.MouseEvent<HTMLAnchorElement>) => {
    // Mobilni: geo: URI odpre izbirnik aplikacij (precej nad web URL — brez
    // privzganja Google Maps). Prestrežemo SAMO ob kliku (0 hidracijskih
    // posledic). Desktop/pad: privzeti <a> odpre Google Maps.
    if (isCoarsePointer()) {
      e.preventDefault();
      window.location.href = links.geo;
    }
  };

  const externalHint = GO_NAV_LABELS.external[lang];
  const aria = GO_NAV_LABELS.navigateAria[lang](card.entry.title);

  if (variant === "icon") {
    return (
      <Button asChild variant="outline" className="h-11 w-11 shrink-0">
        <a
          href={links.web}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onNav}
          title={externalHint}
          aria-label={aria}
        >
          <NavigationIcon className="h-4 w-4" />
        </a>
      </Button>
    );
  }

  return (
    <Button
      asChild
      variant="outline"
      className="h-12 flex-1 border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
    >
      <a
        href={links.web}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onNav}
        title={externalHint}
        aria-label={aria}
      >
        <NavigationIcon className="mr-2 h-4 w-4" /> {GO_NAV_LABELS.navigate[lang]}
      </a>
    </Button>
  );
}

// ---------------------------------------------------------------------------
// GLAVNA KOMPONENTA
// ---------------------------------------------------------------------------

export function GoMode() {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = (o: { sl: string; en: string }) => o[lang];

  // Hidracijska varnost: localStorage + živa ura se naložita TEKOM mounta —
  // setState v callbacku makro-naloge (NE sinhrono v telesu efekta — pravilo
  // react-hooks/set-state-in-effect), SSR in prvi klientni render sta skeleton.
  const [record, setRecord] = useState<GoTripRecord | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [now, setNow] = useState<Date | null>(null);
  const [showDone, setShowDone] = useState(false);
  const geo = useGeolocation();

  useEffect(() => {
    const hydrate = setTimeout(() => {
      setRecord(loadGoTrip());
      setDone(loadGoProgress());
      setNow(new Date());
    }, 0);
    // Živa ura: osvežitev vsakih 30 s (setState v interval-callbacku —
    // zunanji dogodek, ne sinhroni render kaskada).
    const clock = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      clearTimeout(hydrate);
      clearInterval(clock);
    };
  }, []);

  const trip = useMemo(
    () =>
      record
        ? // TASK 4 / K-7: v2 = AI itinerer (MyTripView shranjen SESTAVLJEN —
          // 0 transformacij ob branju); v1 = /potovanje TravelJourney
          // (kanonična pot, nespremenjena).
          record.version === 1
          ? buildMyTrip(record.journey, new Set(record.selectedIds))
          : record.view
        : null,
    [record]
  );
  const view = useMemo(
    () => (trip && now ? buildGoView(trip, now, geo.position, done) : null),
    [trip, now, geo.position, done]
  );

  // ----------------------------------------------------------------------
  // TASK 65 — VREME PRI NASLEDNJI POSTANKI (živi Open-Meteo prek
  // /api/weather, 10-min cache na strežniku). Cilj je GEO naslednjega
  // postanka — postanek brez geo → vreme preprosto NI (iskrena odsotnost,
  // isti kanon kot DistanceChip). Pogled se gradi vsakih 30 s (živa ura) —
  // zato so effect-depi PRIMITIVI (lat/lng), da se fetch sproži SAMO ob
  // spremembi postanka (ne ob vsakem tiku ure).
  // ----------------------------------------------------------------------
  const weatherTarget = useMemo(
    () => (view ? goWeatherTarget(view) : null),
    [view]
  );
  const wLat = weatherTarget?.lat ?? null;
  const wLng = weatherTarget?.lng ?? null;
  const [weather, setWeather] = useState<GoWeather | null>(null);
  const [weatherFailed, setWeatherFailed] = useState(false);
  /** Za kateri cilj je trenutni odgovor veljalen (drugo = zastarel → skeleton). */
  const [weatherFor, setWeatherFor] = useState<{
    lat: number | null;
    lng: number | null;
  }>({ lat: null, lng: null });
  const [weatherTick, setWeatherTick] = useState(0);

  // Osvežitev vsakih 10 min — usklajeno s 600 s strežniškim cachejem
  // (setState v interval-callbacku — zunanji dogodek).
  useEffect(() => {
    const refresh = setInterval(() => setWeatherTick((t) => t + 1), 600_000);
    return () => clearInterval(refresh);
  }, []);

  useEffect(() => {
    if (wLat == null || wLng == null) return; // brez geo → NI vremena
    let active = true;
    const controller = new AbortController();
    (async () => {
      try {
        const res = await fetch(
          `/api/weather?lat=${wLat}&lng=${wLng}&lang=${lang}&daily=1`,
          { signal: controller.signal }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const parsed = parseGoWeatherResponse(await res.json());
        if (!active) return;
        if (parsed) {
          setWeather(parsed);
          setWeatherFailed(false);
        } else {
          setWeather(null);
          setWeatherFailed(true);
        }
        setWeatherFor({ lat: wLat, lng: wLng });
      } catch {
        // Prekinitev (nov cilj) NE šteje kot napaka — active je takrat false.
        if (!active) return;
        setWeather(null);
        setWeatherFailed(true);
        setWeatherFor({ lat: wLat, lng: wLng });
      }
    })();
    return () => {
      active = false;
      controller.abort();
    };
  }, [wLat, wLng, lang, weatherTick]);

  /** skeleton, dokler odgovor ne pokriva aktualnega cilja (zastarel = loading). */
  const weatherLoading =
    wLat != null &&
    (weatherFor.lat !== wLat || weatherFor.lng !== wLng);

  // ----------------------------------------------------------------------
  // ISSUE #4 §8 (val 2): ETA DO NASLEDNJEGA POSTANKA — SAMO ko imamo GPS +
  // geo postanka (hevristika premica ×1,3 pri 55 km/h — pošteno labelirana,
  // ker prometa nimamo). Brez pogojev → izrecno NEZNANO (ne tiho).
  // ----------------------------------------------------------------------
  const etaInfo = useMemo(() => {
    if (!view?.next || !now) return null;
    const n = view.next.entry;
    if (
      geo.position &&
      typeof n.lat === "number" &&
      typeof n.lng === "number"
    ) {
      const leg = heuristicLeg(
        { lat: geo.position.lat, lng: geo.position.lng },
        { lat: n.lat, lng: n.lng }
      );
      const arrival = new Date(now.getTime() + leg.min * 60_000);
      return {
        unknown: false as const,
        hhmm: localeTime(arrival, lang),
        min: leg.min,
        km: leg.km,
      };
    }
    return { unknown: true as const };
  }, [view, now, geo.position, lang]);

  const toggleDone = useCallback((key: string) => {
    setDone((prev) => {
      const next = { ...prev };
      if (next[key]) delete next[key];
      else next[key] = new Date().toISOString();
      saveGoProgress(next);
      return next;
    });
  }, []);

  const endGoMode = useCallback(() => {
    clearGoTrip();
    setRecord(null);
    setDone({});
  }, []);

  // --- Skeleton (SSR == prvi klientni render; ura še ni hydratana) ---
  if (!now) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  // --- Prazen stanje: ni shranjenega načrta (ali zaključen Go Mode) ---
  // TASK 4 / K-7: DVA izhoda — potovanje iz /potovanje (kanonična pot) ALI
  // AI načrt (nacrtuj → „Zaženi Na poti“; revizija: uporabnik AI načrta ni
  // vedel, da Go Mode obstaja zanj — empty state je vodil SAMO v /potovanje).
  if (!record || !view) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Compass className="h-10 w-10 text-muted-foreground" />
          <h2 className="text-xl font-semibold">{t(L.empty.title)}</h2>
          <p className="max-w-md text-sm text-muted-foreground">
            {t(L.empty.desc)}
          </p>
          <p className="max-w-md text-xs text-muted-foreground">
            {t(L.empty.descAi)}
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="h-12">
              <Link href="/potovanje">
                <NavigationIcon className="mr-2 h-4 w-4" />
                {t(L.empty.cta)}
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="h-12">
              <Link href="/nacrtuj">
                <Wand2 className="mr-2 h-4 w-4" />
                {t(L.empty.ctaAi)}
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusLabel = L.gps.status[geo.status];

  return (
    <div className="space-y-4">
      {/* === GLAVA: naslov + živa ura + aktivni dan === */}
      <Card className="border-emerald-600/40 dark:border-emerald-500/30">
        <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-6">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {t(view.title)}
            </p>
            <p className="text-lg font-semibold leading-tight">
              {t(view.activeDayLabel)}
            </p>
            {view.activeDayNote && (
              <p className="text-xs text-muted-foreground">
                {t(view.activeDayNote)}
              </p>
            )}
          </div>
          <div className="text-right" role="status" aria-live="off">
            <p className="text-xs text-muted-foreground">
              {t(L.now)} ·{" "}
              {now.toLocaleDateString(lang === "sl" ? "sl-SI" : "en-GB", {
                weekday: "short",
                day: "numeric",
                month: "short",
              })}
            </p>
            <p className="text-4xl font-bold tabular-nums tracking-tight">
              {localeTime(now, lang)}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* === GPS NADZOR === */}
      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 space-y-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {geo.status === "requesting" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed
                  className={`h-4 w-4 ${
                    geo.status === "active" ? "text-emerald-600" : "text-muted-foreground"
                  }`}
                />
              )}
              {t(statusLabel)}
              {geo.status === "active" && geo.position?.accuracyM != null && (
                <span className="text-xs font-normal text-muted-foreground">
                  {L.gps.accuracy[lang](geo.position.accuracyM)}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">
              {geo.position
                ? t(GO_LABELS.positionHint)
                : t(GO_LABELS.noPosition)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {geo.status === "idle" || geo.status === "denied" || geo.status === "unavailable" || geo.status === "error" ? (
              <Button
                onClick={geo.start}
                variant="outline"
                className="h-11"
                aria-label={t(L.gps.start)}
              >
                <LocateFixed className="mr-2 h-4 w-4" /> {t(L.gps.start)}
              </Button>
            ) : (
              <Button onClick={geo.stop} variant="outline" className="h-11">
                {t(L.gps.stop)}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* === NASLEDNJE (hero kartica) === */}
      {view.next ? (
        <Card className="border-emerald-500 ring-1 ring-emerald-500/50">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                ▸ {t(L.next)}
              </p>
              {view.next.countdownMin != null && (
                <Badge className="border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                  {GO_LABELS.countdown[lang](view.next.countdownMin)}
                </Badge>
              )}
            </div>

            <div className="flex items-start gap-3">
              <span aria-hidden className="text-4xl leading-none">
                {view.next.entry.icon}
              </span>
              <div className="min-w-0 space-y-1">
                <h2 className="text-2xl font-bold leading-tight">
                  {view.next.entry.title}
                </h2>
                {view.next.entry.time?.start && (
                  <p className="text-sm text-muted-foreground">
                    {view.next.entry.time.start}
                    {view.next.entry.time.end
                      ? `–${view.next.entry.time.end}`
                      : ""}
                  </p>
                )}
                {view.next.entry.timeNote && !view.next.entry.time && (
                  <p className="text-xs italic text-muted-foreground">
                    {t(view.next.entry.timeNote)}
                  </p>
                )}
                {view.next.entry.location && (
                  <p className="text-sm text-muted-foreground">
                    <MapPin className="mr-1 inline h-3.5 w-3.5" />
                    {view.next.entry.location}
                  </p>
                )}

                {/* === ISSUE #4 §8 (val 2): PREDVIDEN PRIHOD (ETA) ===
                    SAMO iz realnih vhodov (GPS + geo postanka); sicer
                    izrecno NEZNANO — nikoli izmišljen promet. */}
                {etaInfo && (
                  <div className="rounded-lg border bg-muted/30 px-3 py-2">
                    {etaInfo.unknown ? (
                      <p className="text-xs text-muted-foreground">
                        {t(L.eta.unknown)}
                      </p>
                    ) : (
                      <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t(L.eta.label)}
                        </span>
                        <span className="font-semibold tabular-nums">
                          ~{etaInfo.hhmm}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          (~{etaInfo.km} km · ~{etaInfo.min} {L.min[lang]} ·{" "}
                          {t(L.eta.hint)})
                        </span>
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* === TASK 65: VREME PRI NASLEDNJI POSTANKI ===
                Živi Open-Meteo (prek /api/weather, brez ključa). ISKRENOST:
                postanek brez geo → trak SE NE PRIKAŽE (kot razdalja); napaka
                vira/brez signala → iskrena opomba (načrt dela naprej); vir in
                čas meritve sta izrecno navedena. */}
            {wLat != null && wLng != null && (
              <div
                className="rounded-lg border bg-muted/30 px-3 py-2"
                aria-label={t(GO_WEATHER_LABELS.title)}
              >
                <p className="mb-1 flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                  <CloudSun className="h-3 w-3" aria-hidden="true" />
                  {t(GO_WEATHER_LABELS.title)}
                </p>
                {weatherLoading ? (
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-7 rounded-full" />
                    <Skeleton className="h-4 w-44" />
                  </div>
                ) : weatherFailed || !weather ? (
                  <p className="text-xs text-muted-foreground">
                    {t(GO_WEATHER_LABELS.unavailable)}
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <span
                      className="text-xl leading-none"
                      role="img"
                      aria-label={weather.condition}
                    >
                      {weather.icon}
                    </span>
                    <span className="font-semibold tabular-nums">
                      {weather.temp} °C
                    </span>
                    <span className="capitalize text-muted-foreground">
                      {weather.condition}
                    </span>
                    {weather.today && (
                      <span className="text-muted-foreground">
                        {GO_WEATHER_LABELS.today[lang](weather.today)}
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-muted-foreground">
                      {weather.observedAt &&
                        observedTimeLabel(weather.observedAt) &&
                        `${GO_WEATHER_LABELS.observed[lang](
                          observedTimeLabel(weather.observedAt) as string
                        )} · `}
                      {t(GO_WEATHER_LABELS.source)}
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-1.5">
              <DistanceChip card={view.next} lang={lang} />
              {/* ISSUE #4 §8: vožnja od prejšnjega postanka (OSRM/ocena). */}
              <LegChip card={view.next} lang={lang} />
              <Badge variant="secondary">{t(view.next.entry.statusLabel)}</Badge>
              {view.next.entry.durationMin != null && (
                <Badge variant="outline">
                  {L.duration[lang]} ~{view.next.entry.durationMin} {L.min[lang]}
                </Badge>
              )}
            </div>

            {/* ISSUE #4 §9: status ur ob TRENUTKU (OPEN/CLOSED/UNKNOWN)
                + surov niz vira (nič ne izgubimo). §8: vir brez ur →
                izrecno URA NEZNANA (ne tiha odsotnost). */}
            <div className="text-xs text-muted-foreground">
              <span className="mr-1">{t(L.hours)}:</span>
              <OpeningHoursStatus
                raw={view.next.entry.openingHours}
                lang={lang}
                missingLabel={L.hoursMissing}
                className="text-xs"
              />
            </div>

            {/* === ISSUE #4 §8: ZAMUDE/PROMET — pošteno NEZNANO (nikoli
                lažni „open now / traffic“) === */}
            <p
              className="flex items-center gap-1.5 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground"
              role="note"
            >
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(L.delay)}
            </p>

            <EntryLinks card={view.next} lang={lang} />

            {/* TASK 67: navigacijski handoff + opravljanje — navigacija je
                prva akcija ob postanku, opravi druga (mobilno: skupaj full-width) */}
            <div className="flex flex-col gap-2 sm:flex-row">
              <NavButton
                card={view.next}
                lang={lang}
                origin={geo.position}
              />
              <Button
                onClick={() => toggleDone(view.next!.entry.key)}
                size="lg"
                className="h-12 flex-1 text-base"
              >
                <span className="truncate">✓ {t(L.complete)}: {view.next.entry.title}</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">
            {t(GO_LABELS.noEntryLeft)}
          </CardContent>
        </Card>
      )}

      {/* === ISSUE #4 §8 (val 2): POT DNEVA (vsota nog — OSRM/ocena) ===
          Samo kjer načrt nosi noge; delne ocene so pošteno razkrite
          (legsKnown/legsTotal). */}
      {view.activeDayRoute && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
          <RouteIcon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="font-medium">
            {L.dayRoute[lang](
              view.activeDayRoute.legsKnown + 1,
              view.activeDayRoute.km,
              view.activeDayRoute.min,
              t2(
                view.activeDayRoute.method === "osrm"
                  ? L.legSource.osrm
                  : view.activeDayRoute.method === "heuristic"
                    ? L.legSource.heuristic
                    : { sl: "mešano", en: "mixed" },
                lang
              )
            )}
          </span>
          {view.activeDayRoute.legsKnown < view.activeDayRoute.legsTotal && (
            <span className="text-xs text-muted-foreground">
              ({view.activeDayRoute.legsKnown}/{view.activeDayRoute.legsTotal}{" "}
              {L.stops[lang]})
            </span>
          )}
        </p>
      )}

      {/* === ISKRENOST: dan brez realnih ur === */}
      {!view.dayHasRealTime && (view.next || view.remaining.length > 0) && (
        <p className="px-1 text-xs text-muted-foreground">
          {t(GO_LABELS.noTimesToday)}
        </p>
      )}

      {/* === OSTALE POSTANKE DNEVA === */}
      {view.remaining.length > 0 && (
        <section aria-label={t(L.today)} className="space-y-3">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            {t(L.today)}
            <span className="text-sm font-normal text-muted-foreground">
              {view.remaining.length}
            </span>
          </h3>
          <div className="space-y-3">
            {view.remaining.map((card) => (
              <Card key={card.entry.key}>
                <CardContent className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1">
                    <p className="flex items-center gap-2 font-medium leading-snug">
                      <span aria-hidden>{card.entry.icon}</span>
                      {card.entry.title}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {card.countdownMin != null && (
                        <Badge variant="outline">
                          {GO_LABELS.countdown[lang](card.countdownMin)}
                        </Badge>
                      )}
                      {card.entry.time?.start && !card.countdownMin && (
                        <Badge variant="outline">{card.entry.time.start}</Badge>
                      )}
                      <DistanceChip card={card} lang={lang} />
                      <Badge variant="secondary">
                        {t(card.entry.statusLabel)}
                      </Badge>
                    </div>
                    {card.entry.timeNote && !card.entry.time && (
                      <p className="text-xs italic text-muted-foreground">
                        {t(card.entry.timeNote)}
                      </p>
                    )}
                    {/* ISSUE #4 §9: ure + status tudi na preostalih
                        postankih dneva (prej: samo naslednja kartica).
                        §8: vir brez ur → izrecno URA NEZNANA. */}
                    <OpeningHoursStatus
                      raw={card.entry.openingHours}
                      lang={lang}
                      missingLabel={L.hoursMissing}
                      showRaw={false}
                      className="text-[11px]"
                    />
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <NavButton
                      card={card}
                      lang={lang}
                      variant="icon"
                      origin={geo.position}
                    />
                    <Button
                      variant="outline"
                      onClick={() => toggleDone(card.entry.key)}
                      className="h-11 shrink-0"
                      aria-label={`${t(L.complete)}: ${card.entry.title}`}
                    >
                      ✓
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* === OPRABLJENE POSTANKE (zbirko) === */}
      {view.done.length > 0 && (
        <section aria-label={t(L.done)} className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            aria-expanded={showDone}
            className="flex w-full items-center justify-between rounded-lg border bg-muted/40 px-4 py-3 text-sm font-medium hover:bg-muted/60"
          >
            <span>
              ✓ {t(L.done)} ({view.done.length})
            </span>
            {showDone ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </button>
          {showDone && (
            <div className="space-y-2">
              {view.done.map((card) => (
                <Card key={card.entry.key} className="opacity-75">
                  <CardContent className="flex items-center justify-between gap-3 p-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <span aria-hidden>{card.entry.icon}</span>
                        <s className="decoration-muted-foreground/60">
                          {card.entry.title}
                        </s>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {GO_LABELS.doneAt[lang](card.doneAt)}
                      </p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleDone(card.entry.key)}
                      className="h-11 shrink-0"
                      aria-label={`${t(L.restore)}: ${card.entry.title}`}
                    >
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>
      )}

      {/* === NASLEDNJI DNEVI === */}
      {view.laterDays.length > 0 && (
        <section aria-label={t(L.laterDays)} className="space-y-2">
          <h3 className="text-base font-semibold">{t(L.laterDays)}</h3>
          <Card>
            <CardContent className="divide-y p-0">
              {view.laterDays.map((d, i) => (
                <div
                  key={`${t(d.dateLabel)}-${i}`}
                  className="flex items-center justify-between px-4 py-3 text-sm"
                >
                  <span className="text-muted-foreground">{t(d.dateLabel)}</span>
                  <span className="font-medium">
                    {d.count} {L.stops[lang]}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      )}

      {/* === NAPREJ / KONEC === */}
      {/* ISSUE #4 §2 (val 2): v2 zapis s shareId → nazaj na SHRANJENO pot
          (/pot/{shareId} — strežniški objekt), ne na prazen načrtovalnik. */}
      <div className="flex flex-col gap-2 pt-2 sm:flex-row">
        <Button asChild variant="outline" className="h-11 sm:flex-1">
          {/* TASK 4 / K-7: nazaj na IZVORNI načrt — /nacrtuj za AI itinererje
              (v2), /potovanje za kanonična potovanja (v1). */}
          <Link
            href={
              record.version === 2
                ? record.shareId
                  ? `/pot/${record.shareId}`
                  : "/nacrtuj"
                : "/potovanje"
            }
          >
            {record.version === 2
              ? lang === "sl"
                ? "Nazaj na načrt"
                : "Back to the plan"
              : t(L.planLink)}
          </Link>
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              className="h-11 border-red-300 text-red-700 hover:bg-red-50 hover:text-red-800 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950 sm:flex-1"
            >
              <Trash2 className="mr-2 h-4 w-4" /> {t(L.end)}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t(L.endConfirm.title)}</AlertDialogTitle>
              <AlertDialogDescription>
                {/* TASK 4 / K-7: iskren vir obnovitve glede na vrsto zapisa */}
                {record.version === 2
                  ? lang === "sl"
                    ? "Načrt in opravljene postanke pobrišem s te naprave. AI načrt lahko kadar koli znova odpreš na načrtovalniku ali prek deljene povezave."
                    : "I will delete the plan and completed stops from this device. You can reopen the AI plan anytime on the planner or via its shared link."
                  : t(L.endConfirm.desc)}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-11">
                {t(L.endConfirm.cancel)}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={endGoMode}
                className="h-11 bg-red-600 hover:bg-red-700"
              >
                {t(L.endConfirm.action)}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="px-1 pb-2 text-center text-xs text-muted-foreground">
        {t(L.offline)}
        {/* ISSUE #4 §2: veza na shranjeno pot (strežniški objekt) — povezava
            je navaden URL (offline-varna: pokaže se ob kliku, ko je signal). */}
        {record.version === 2 && record.shareId && (
          <>
            {" · "}
            <Link
              href={`/pot/${record.shareId}`}
              className="font-medium underline underline-offset-2"
            >
              {t(L.savedTrip.link)}
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
