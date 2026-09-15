"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useState, useEffect, useRef, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import {
  Sparkles,
  Clock,
  Calendar,
  CalendarDays,
  CalendarArrowDown,
  Car,
  Euro,
  Users,
  UsersRound,
  MapPin,
  LocateFixed,
  Link2,
  ImagePlus,
  AlertCircle,
  Star,
  Cloud,
  Loader2,
  Share2,
  Mail,
  Check,
  Copy,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";

import { INTERESTS } from "@/lib/slovenia-data";
import { PARTY_TYPES, type PartyType } from "@/lib/party-types";
import { formatEventDate } from "@/lib/events-data";
import {
  dayISOForDayNumber,
  formatDateRangeSI,
  formatDayLabelSI,
  isValidStartDate,
  parseISODateLocal,
} from "@/lib/trip-dates";
import type {
  PlannerInput,
  Itinerary,
  ItineraryEvent,
  Season,
} from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { trackFunnel } from "@/lib/funnel";
import {
  trackPlannerEvent,
  markResultRendered,
  markResultEngaged,
  fireAbandonedIfUnengaged,
} from "@/lib/planner-analytics";
import { destinationById } from "@/lib/stop-insights";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { GeoValidationPanel } from "@/components/geo-validation-panel";
import { StopInsights } from "@/components/stop-insights";
import { saveItinerary, fetchSharedItinerary } from "@/lib/itinerary-share";
import { addSavedTrip, deriveSavedTripName } from "@/lib/my-trips-storage";
import { cn } from "@/lib/utils";
import { BookingPanel, type BookingData } from "@/components/sections/booking-panel";
import { ItineraryRefiner } from "@/components/sections/itinerary-refiner";
import { PlanCopilot } from "@/components/plan-copilot";
import { PlannerDayNav } from "@/components/planner-day-nav";
import { ItineraryQualityCard } from "@/components/itinerary-quality-card";
import { ItineraryEventsSection } from "@/components/itinerary-events";
import { SmartPackingSection } from "@/components/packing-smart";
import { BudgetPanel } from "@/components/budget-panel";
import { SocialShare } from "@/components/social-share";
import { TripTimeline } from "@/components/trip-timeline";
import { BookingAssistant } from "@/components/booking-assistant";
import { buildItineraryICS, icsFileName } from "@/lib/ics-export";
import type { IngestMatch } from "@/lib/url-ingest";

// F5.1: zemljevid poti na strani načrtovalnika — Leaflet je client-only
// ( dostopa do window), zato dinamičen uvoz brez SSR ( isti vzorec kot
// map-view prek map-section).
const TripMapPanel = dynamic(
  () => import("@/components/trip-map-panel").then((m) => m.TripMapPanel),
  { ssr: false }
);

// Sezone (labelKey → ključi v "planner" namespace)
const SEASONS: { value: Season; labelKey: string }[] = [
  { value: "spring", labelKey: "seasonSpring" },
  { value: "summer", labelKey: "seasonSummer" },
  { value: "autumn", labelKey: "seasonAutumn" },
  { value: "winter", labelKey: "seasonWinter" },
];

// WEATHER-CONTEXT: tip potne skupine (labelKey → ključi v "planner" namespace)
const PARTY_OPTIONS: { value: PartyType; labelKey: string }[] = [
  { value: "couple", labelKey: "partyCouple" },
  { value: "family", labelKey: "partyFamily" },
  { value: "friends", labelKey: "partyFriends" },
  { value: "solo", labelKey: "partySolo" },
];

// Persistenca zadnjega itinererja (localStorage) + deljeni načrti (URL ?odpri=)
const LAST_ITINERARY_KEY = "discoverslovenia_last_itinerary";
const MAX_PERSIST_CHARS = 250 * 1024; // 250 KB

interface PersistedItinerary {
  itinerary: Itinerary;
  formData?: PlannerInput;
  savedAt?: string;
}

function persistItineraryLocally(it: Itinerary, input: PlannerInput) {
  try {
    const payload: PersistedItinerary = {
      itinerary: it,
      formData: input,
      savedAt: new Date().toISOString(),
    };
    const serialized = JSON.stringify(payload);
    if (serialized.length < MAX_PERSIST_CHARS) {
      localStorage.setItem(LAST_ITINERARY_KEY, serialized);
    }
  } catch {
    // Poln/zasebni localStorage — mirno preskoči
  }
}

function isValidPlannerInput(v: unknown): v is PlannerInput {
  if (!v || typeof v !== "object") return false;
  const p = v as Partial<PlannerInput>;
  return (
    typeof p.budget === "number" &&
    p.budget > 0 &&
    typeof p.days === "number" &&
    p.days >= 1 &&
    p.days <= 14 &&
    Array.isArray(p.interests) &&
    p.interests.length > 0 &&
    p.interests.every((i) => typeof i === "string") &&
    typeof p.season === "string" &&
    ["spring", "summer", "autumn", "winter"].includes(p.season) &&
    typeof p.groupSize === "number" &&
    p.groupSize >= 1 &&
    (p.partyType === undefined ||
      (PARTY_TYPES as readonly string[]).includes(p.partyType))
  );
}

/**
 * FW3: Pametni defaults iz naravnega jezika (hero input / kviz / demo
 * scenariji). Uporablja ga tako event listener (ista stran) kot mount
 * consume iz sessionStorage (prihod z heroja homepagea na /načrtuj).
 *
 * TAG-ALIGN (P1, recenzija Faze 4): interesi se zdaj potiskajo v
 * KANONIČNIH vrednostih INTERESTS ("hrana", ne "kulinarika") — pred
 * popravkom žeton "Hrana & vino" ni bil izbran (chip se ni prižgal) in
 * fallback ocenjevalnik na API strani je vrednost tiho ignoriral
 * (bestFor destinacij vsebuje "hrana"). Dodana je tudi pokritost
 * angleških ključnih besed (EN je poln locale; hero sprejema EN vnose).
 */
function parseQueryToPlannerInput(query: string): PlannerInput {
  const lowerQuery = query.toLowerCase();
  const newInterests: string[] = [];

  if (
    lowerQuery.includes("narav") || lowerQuery.includes("pohod") || lowerQuery.includes("gor") ||
    lowerQuery.includes("nature") || lowerQuery.includes("hik") || lowerQuery.includes("mountain")
  ) newInterests.push("narava");
  if (
    lowerQuery.includes("hran") || lowerQuery.includes("jest") || lowerQuery.includes("kosil") || lowerQuery.includes("večerj") ||
    lowerQuery.includes("food") || lowerQuery.includes("dinner") || lowerQuery.includes("lunch") || lowerQuery.includes("restaurant") || /\b(?:eat|eating)\b/.test(lowerQuery)
  ) newInterests.push("hrana");
  if (lowerQuery.includes("vin") || lowerQuery.includes("pij") || lowerQuery.includes("wine")) newInterests.push("hrana");
  if (
    lowerQuery.includes("avantur") || lowerQuery.includes("raft") || lowerQuery.includes("adrenalin") ||
    lowerQuery.includes("adventure")
  ) newInterests.push("avantura");
  if (lowerQuery.includes("otrok") || lowerQuery.includes("družin") || lowerQuery.includes("family") || /\bkids?\b/.test(lowerQuery)) newInterests.push("družina");
  if (lowerQuery.includes("romanti")) newInterests.push("romantika");
  if (
    lowerQuery.includes("kultur") || lowerQuery.includes("zgodovin") || lowerQuery.includes("mest") ||
    lowerQuery.includes("culture") || lowerQuery.includes("history") || lowerQuery.includes("city")
  ) newInterests.push("kultura");
  if (lowerQuery.includes("wellness") || lowerQuery.includes("spa") || lowerQuery.includes("zdravil")) newInterests.push("wellness");

  // Določi število dni iz query-ja (SL + EN)
  let days = 3;
  const hourMatch = lowerQuery.match(/(\d+)\s*(?:ur|hours?)/);
  const dayMatch = lowerQuery.match(/(\d+)\s*(?:dan|dnev|days?)/);
  if (hourMatch) days = 1;
  else if (dayMatch) days = parseInt(dayMatch[1], 10);

  // Določi group size (SL + EN)
  let groupSize = 2;
  const groupMatch = lowerQuery.match(/(\d+)\s*(?:oseb|odrasl|ljud|people|persons?|adults?)/);
  if (groupMatch) groupSize = parseInt(groupMatch[1], 10);
  if (lowerQuery.includes("družin") || lowerQuery.includes("otrok") || lowerQuery.includes("family") || /\bkids?\b/.test(lowerQuery)) groupSize = 4;
  if (lowerQuery.includes("sam") || /\b(?:solo|alone|myself)\b/.test(lowerQuery)) groupSize = 1;

  // WEATHER-CONTEXT: tip potne skupine iz naravnega jezika (hero/kviz/demo)
  let partyType: PlannerInput["partyType"];
  if (lowerQuery.includes("družin") || lowerQuery.includes("otrok") || lowerQuery.includes("family") || /\bkids?\b/.test(lowerQuery)) partyType = "family";
  else if (lowerQuery.includes("partner") || lowerQuery.includes("romanti") || lowerQuery.includes("zakonc") || /\b(?:couple|wife|husband)\b/.test(lowerQuery)) partyType = "couple";
  else if (lowerQuery.includes("prijatel") || /\bfriends?\b/.test(lowerQuery)) partyType = "friends";
  else if (/\bsam[oi]?\b|\bsolo\b|\balone\b|\bmyself\b/.test(lowerQuery)) partyType = "solo";

  // Sezona iz query-ja (npr. kviz CTA: "... poleti, s partnerjem ...") — SL + EN
  let season: Season = "summer";
  if (lowerQuery.includes("pomlad") || lowerQuery.includes("spring")) season = "spring";
  else if (lowerQuery.includes("polet") || lowerQuery.includes("juni") || lowerQuery.includes("julij") || lowerQuery.includes("avgust") || lowerQuery.includes("summer") || /\bjune\b|\bjuly\b|\baugust\b/.test(lowerQuery)) season = "summer";
  else if (lowerQuery.includes("jesen") || lowerQuery.includes("autumn") || /\bfall\b/.test(lowerQuery)) season = "autumn";
  else if (lowerQuery.includes("zim") || lowerQuery.includes("smuč") || lowerQuery.includes("winter") || /\bski/.test(lowerQuery)) season = "winter";

  return {
    budget: 500,
    days,
    // TAG-ALIGN: dedupe (npr. "hrana in vino" sproži dva pogoja za isti interes)
    interests: newInterests.length > 0 ? Array.from(new Set(newInterests)) : ["narava", "kultura"],
    season,
    groupSize,
    ...(partyType ? { partyType } : {}),
  };
}

/**
 * AI Itinerary Planner — jedrna funkcija platforme Discover Slovenia AI.
 * Uporabnik izpolni obrazec (dnevi, proračun, skupina, sezona, interesi),
 * AI pa sestavi personalno dogodkovno povzetek potovanja po Sloveniji.
 */
export function ItineraryPlanner() {
  const { toast } = useToast();
  const t = useTranslations("planner");
  const tCommon = useTranslations("common");
  // FW4.3: locale določa jezik AI itinererja ("en" → angleški izpis;
  // API sprejme language polje, default "sl")
  const locale = useLocale();

  const [formData, setFormData] = useState<PlannerInput>({
    budget: 500,
    days: 3,
    interests: ["narava", "kultura"],
    season: "summer",
    groupSize: 2,
  });
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [bookingData, setBookingData] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // P0.2 GEO-VALIDACIJA: izvedljivost poti za prikaz (panel + dnevne značke).
  // Shranjeno polje (API/refine) ali preračun na mestu uporabe za stare
  // shranjene načrte — ISTA čista funkcija kot na strežniku.
  const geoValidation = useMemo(
    () =>
      itinerary
        ? (itinerary.geoValidation ??
          validateItineraryGeo(itinerary, locale === "en" ? "en" : "sl"))
        : null,
    [itinerary, locale]
  );

  // F5.1: kilometri po dnevih ( iz geo-validacije) za legendo zemljevida —
  // enak vir resnice kot značke ~km na karticah dni.
  const dayKm = useMemo(() => {
    const map: Record<number, number> = {};
    for (const d of geoValidation?.days ?? []) {
      if (typeof d.day === "number" && typeof d.km === "number") {
        map[d.day] = d.km;
      }
    }
    return map;
  }, [geoValidation]);

  // FAZA 4 (pilotna analitika): planner_started — prva interakcija z obrazcem
  // (katerikoli vnos ali oddaja) se zabeleži le enkrat na življenjsko dobo
  // komponente. Ref (ne state) — brez ponovnega renderiranja.
  const startedFiredRef = useRef(false);
  function fireStartedOnce() {
    if (startedFiredRef.current) return;
    startedFiredRef.current = true;
    trackPlannerEvent("planner_started", { locale });
  }

  // FAZA 4 (pilotna analitika, P1-3 preimenovano): result_session_ended_without_action
  // — PROXY signal: rezultat je bil prikazan, sledeni dogodek (prilagoditev /
  // shranjevanje) pa ni bil zaznan v merjenem oknu (pagehide / unmount po
  // ≥ 45 s od prikaza). NE pomeni nezadovoljstvo. keepalive fetch preživi
  // zapiranje zavihka; eid na strežniku prepreči dvojni zapis.
  useEffect(() => {
    if (!itinerary) return;
    const onHide = () => fireAbandonedIfUnengaged();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      fireAbandonedIfUnengaged();
    };
  }, [itinerary]);

  // FW4.2: minimalni datum za datumski vhod (danes) — nastavljen ob mountu,
  // da se izogne hidratacijskemu nesoglasju (server/client datum)
  const [todayISO, setTodayISO] = useState("");
  useEffect(() => {
    const now = new Date();
    setTodayISO(
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`
    );
  }, []);

  // === F5.4 "Začni s povezavo": prilepi YouTube/blog → prepoznaj destinacije ===
  const [ingestUrl, setIngestUrl] = useState("");
  const [ingestLoading, setIngestLoading] = useState(false);
  const [ingestError, setIngestError] = useState<string | null>(null);
  const [ingestMatches, setIngestMatches] = useState<IngestMatch[] | null>(null);
  const [ingestSourceTitle, setIngestSourceTitle] = useState<string | null>(null);

  // === F8 "Začni s sliko": nalaganje/prilepljanje fotografije → VLM prebere
  // imena, ujemanje z destinacijami je deterministično (ista funkcija kot
  // pri povezavah — glej /api/itinerary/ingest-image). ===
  const [ingestMode, setIngestMode] = useState<"link" | "image">("link");
  const [ingestImage, setIngestImage] = useState<string | null>(null); // data URL
  const [ingestImageName, setIngestImageName] = useState<string>("");
  const [ingestImageDragging, setIngestImageDragging] = useState(false);
  const [ingestIsVlm, setIngestIsVlm] = useState(false); // metoda zadnjega zadetka
  const [ingestVia, setIngestVia] = useState<"gemini" | "z-ai-sdk" | null>(
    null
  ); // F10: kateri vision provider je bral sliko (poštenost)
  const ingestImageInputRef = useRef<HTMLInputElement | null>(null);

  // F5.1: programatski fokus zemljevida ( gumb na kartici postanka)
  const [mapFocus, setMapFocus] = useState<{
    day: number;
    indexInDay: number;
    nonce: number;
  } | null>(null);

  // === Shrani & deli ===
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // === Pošlji na e-pošto ===
  const [emailOpen, setEmailOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [emailSending, setEmailSending] = useState(false);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  // === Obnovljeni načrt (localStorage) ===
  const [restoredVisible, setRestoredVisible] = useState(false);

  // Sinhroniziraj z globalnim store-om (za MapSection + TripTimeline "Shrani")
  const setStoreItinerary = useAppStore((s) => s.setItinerary);
  const setPlannerForm = useAppStore((s) => s.setPlannerForm);
  // F5.1: izpeljana pot po dnevih ( barve/koordinate) za TripMapPanel —
  // isti izvor kot raziskovalni zemljevid na /zemljevid
  const routeByDay = useAppStore((s) => s.routeByDay);
  useEffect(() => {
    setStoreItinerary(itinerary);
  }, [itinerary, setStoreItinerary]);
  useEffect(() => {
    setPlannerForm(formData);
  }, [formData, setPlannerForm]);

  // === Mount (enkrat): hidratacija deljenega načrta (?odpri=) ali zadnjega načrta ===
  useEffect(() => {
    // 1) URL parameter "odpri" — deljen itinerer ima prednost
    const params = new URLSearchParams(window.location.search);
    const shareId = params.get("odpri");
    if (shareId) {
      // Počisti parameter takoj (history.replaceState) — deljenje je enkratna
      // akcija; ostali query parametri (če so) ostanejo nespremenjeni.
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete("odpri");
        window.history.replaceState(
          null,
          "",
          url.pathname + (url.search ? url.search : "") + url.hash
        );
      } catch {
        // replaceState ni kritičen
      }

      fetchSharedItinerary(shareId)
        .then((data) => {
          setItinerary(data.itinerary);
          setRestoredVisible(false);
          toast({
            title: t("sharedOpenedToast"),
            description: data.name
              ? t("sharedOpenedWithName", { name: data.name })
              : t("sharedOpenedNoName"),
          });
          setTimeout(() => {
            document.getElementById("načrtuj")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        })
        .catch(() => {
          toast({
            title: tCommon("error"),
            description: t("sharedOpenError"),
            variant: "destructive",
          });
        });
      return;
    }

    // 1.5) FW3: heroQuery iz sessionStorage — uporabnik je vnesel željo v
    // heroju na homepageu in bil navigiran na /načrtuj. Svež namen ima
    // prednost pred obnovo zadnjega načrta iz localStorage.
    const pendingQuery = sessionStorage.getItem("heroQuery");
    if (pendingQuery) {
      sessionStorage.removeItem("heroQuery");
      const smartInput = parseQueryToPlannerInput(pendingQuery);
      setFormData(smartInput);
      generateItinerary(smartInput);
      return;
    }

    // 2) Obnovi zadnji načrt iz localStorage (samo če store še ni poln)
    try {
      if (!useAppStore.getState().itinerary) {
        const stored = localStorage.getItem(LAST_ITINERARY_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as PersistedItinerary | null;
          if (parsed?.itinerary && Array.isArray(parsed.itinerary.days) && parsed.itinerary.days.length > 0) {
            setItinerary(parsed.itinerary);
            if (isValidPlannerInput(parsed.formData)) {
              setFormData(parsed.formData);
            }
            setRestoredVisible(true);
          }
        }
      }
    } catch {
      // Pokvarjen zapis — ignoriraj
    }
  }, []);

  // === WOW: Poslušaj heroQuery event (ista stran — npr. kviz ali demo
  // scenariji). Prihod s homepagea se obravnava ob mountu prek
  // sessionStorage (zgornji efekt). ===
  useEffect(() => {
    const handleHeroQuery = (e: Event) => {
      const query = (e as CustomEvent<string>).detail;
      if (!query) return;

      const smartInput = parseQueryToPlannerInput(query);
      setFormData(smartInput);
      generateItinerary(smartInput);
    };

    window.addEventListener("heroQuery", handleHeroQuery as EventListener);
    return () => window.removeEventListener("heroQuery", handleHeroQuery as EventListener);
  }, []);

  // Pridobi booking opcije (listings, experiences, products) za vse
  // destinacije v itinererju — potegne lokalne ponudnike iz baze.
  useEffect(() => {
    if (!itinerary) {
      setBookingData(null);
      return;
    }
    const destinationIds = Array.from(
      new Set(
        itinerary.days.flatMap((d) =>
          d.locations.map((l) => l.destination_id)
        )
      )
    );
    if (destinationIds.length === 0) {
      setBookingData(null);
      return;
    }
    let cancelled = false;
    fetch("/api/itinerary/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationIds }),
    })
      .then((r) => {
        if (!r.ok) throw new Error("Napaka pri pridobivanju booking opcij");
        return r.json() as Promise<BookingData>;
      })
      .then((data) => {
        if (!cancelled) setBookingData(data);
      })
      .catch(() => {
        if (!cancelled) setBookingData(null);
      });
    return () => {
      cancelled = true;
    };
  }, [itinerary]);

  function toggleInterest(value: string) {
    fireStartedOnce();
    setFormData((prev) => {
      const isSelected = prev.interests.includes(value);
      return {
        ...prev,
        interests: isSelected
          ? prev.interests.filter((i) => i !== value)
          : [...prev.interests, value],
      };
    });
  }

  // WEATHER-CONTEXT: tip potne skupine (opcijsko) — "Sam" sinhronizira
  // tudi številko skupine (1 oseba); ostale izbire številke ne spreminjajo
  function togglePartyType(value: PartyType) {
    fireStartedOnce();
    setFormData((prev) => {
      const next: PlannerInput = {
        ...prev,
        partyType: prev.partyType === value ? undefined : value,
      };
      if (next.partyType === "solo") next.groupSize = 1;
      return next;
    });
  }

  function validate(input: PlannerInput): string | null {
    if (!Number.isFinite(input.days) || input.days < 1 || input.days > 14) {
      return t("validationDays");
    }
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      return t("validationBudget");
    }
    if (!Number.isFinite(input.groupSize) || input.groupSize < 1 || input.groupSize > 20) {
      return t("validationGroupSize");
    }
    if (input.interests.length === 0) {
      return t("validationInterests");
    }
    // FW4.2: datum odhoda (opcijsko) — izbirnik datumov večinoma poskrbi
    // za veljavnost; to je varnostna mreža (pretekli datum / ročni vnos)
    if (input.startDate && !isValidStartDate(input.startDate)) {
      return t("validationStartDate");
    }
    return null;
  }

  // FW4.2: "Dodaj v mojo pot" — dogodek iz events sekcije pripni na pot.
  // Persistenca: itinerary.addedEvents potuje z načrtom (localStorage,
  // deljena povezava, e-pošta) — brez dodatnih tokov.
  function toggleAddedEvent(ev: ItineraryEvent) {
    if (!itinerary) return;
    const currentAdded = itinerary.addedEvents ?? [];
    const has = currentAdded.some((a) => a.id === ev.id);
    const next: Itinerary = {
      ...itinerary,
      addedEvents: has
        ? currentAdded.filter((a) => a.id !== ev.id)
        : [...currentAdded, ev],
    };
    setItinerary(next);
    persistItineraryLocally(next, formData);
    // P0.2 (recenzija): dodani/odstranjeni dogodek spremeni načrt — zastareli
    // deljeni link se umakne (enak vzorec kot pri refine)
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    if (!has) {
      toast({
        title: t("addedToTripToast"),
        description: ev.name,
      });
    }
  }

  async function generateItinerary(input: PlannerInput) {
    fireStartedOnce();
    trackPlannerEvent("planner_submitted", {
      days: input.days,
      interests: input.interests.length,
      season: input.season,
      partyType: input.partyType ?? "none",
      has_start_date: Boolean(input.startDate),
      locale,
    });
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...input,
          language: locale === "en" ? "en" : "sl",
        }),
      });
      if (!res.ok) {
        trackPlannerEvent("planner_error", { status: res.status, stage: "response" });
        throw new Error(t("errorGenerating"));
      }
      const data: Itinerary = await res.json();

      // Pilotna analitika: prazen rezultat (defenzivno — API vrne 200)
      const totalStops = data.days?.reduce(
        (n, d) => n + (d.locations?.length ?? 0),
        0
      ) ?? 0;
      if (totalStops === 0) {
        trackPlannerEvent("empty_result", { days: data.days?.length ?? 0 });
      }

      // Pilotna analitika: neveljavne lokacije (ID-ji zunaj dataseta)
      for (const day of data.days ?? []) {
        for (const loc of day.locations ?? []) {
          if (!destinationById(loc.destination_id)) {
            trackPlannerEvent("invalid_location", {
              day: day.day,
              destination_id: loc.destination_id,
            });
          }
        }
      }

      // P0.2 GEO-VALIDACIJA (analitika): nerealistični dnevi zdaj iz ISTE
      // validacijske plasti kot prikaz — ne več samo prag "> 250 km", ampak
      // rule + km + source za vsak ERROR (ni realno izvedljivo). Warn raven
      // (naporno, a mogoče) NE šteje kot unrealistic_day.
      const geoForAnalytics =
        data.geoValidation ??
        validateItineraryGeo(data, locale === "en" ? "en" : "sl");
      for (const issue of geoForAnalytics.issues) {
        if (issue.level === "error") {
          trackPlannerEvent("unrealistic_day", {
            day: issue.day,
            rule: issue.rule,
            km:
              geoForAnalytics.days.find((d) => d.day === issue.day)?.km ?? 0,
            source: data.source,
          });
        }
      }

      setItinerary(data);

      // Pilotna analitika: rezultat prikazan + začetek merjenja opustitve
      trackPlannerEvent("planner_result_rendered", {
        days: data.days?.length ?? 0,
        stops: totalStops,
        source: data.source,
        locale,
      });
      markResultRendered({
        days: data.days?.length ?? 0,
        source: data.source,
      });

      // Ponastavi stanje shranjevanja/deljenja — nov načrt, nove povezave
      setShareUrl(null);
      setShareError(null);
      setCopied(false);
      setEmailOpen(false);
      setEmailSentTo(null);
      setEmailError(null);
      setRestoredVisible(false);

      // Funnel tracking + gamifikacijski dogodek (Slovenia Pass posluša)
      trackFunnel("itinerary_generate");
      const destinationIds = Array.from(
        new Set(data.days.flatMap((d) => d.locations.map((l) => l.destination_id)))
      );
      window.dispatchEvent(
        new CustomEvent("itineraryGenerated", {
          detail: {
            destinationIds,
            locations: data.days.flatMap((d) => d.locations),
          },
        })
      );

      // Persistenca — zadnji načrt preživi osvežitev strani
      persistItineraryLocally(data, input);

      toast({
        title: t("generatedToast"),
        description:
          data.source === "ai"
            ? t("generatedToastDescAI")
            : t("generatedToastDescSample"),
      });
    } catch (err) {
      trackPlannerEvent("planner_error", { stage: "network_or_parse" });
      const msg =
        err instanceof Error ? err.message : t("errorGeneratingFallback");
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // === Shrani & deli: POST /api/itinerary/save → deljiva povezava ===
  async function handleSaveShare() {
    if (!itinerary || saving) return;
    setSaving(true);
    setShareError(null);
    try {
      const result = await saveItinerary(itinerary, formData);
      const absoluteUrl = `${window.location.origin}${result.url}`;
      setShareUrl(absoluteUrl);
      // P2-3: sledi anonimno shranjen načrt za prevzem ob prijavi (localStorage)
      addSavedTrip(result.shareId, deriveSavedTripName(itinerary));
      trackFunnel("itinerary_saved");
      // FAZA 4 (pilotna analitika): shranjen načrt = navezava na rezultat
      // (prekine merjenje opustitve) + ločen dogodek z metadatami
      markResultEngaged();
      trackPlannerEvent("itinerary_saved", {
        days: itinerary.days.length,
        source: itinerary.source,
        locale,
      });
      toast({
        title: t("savedToast"),
        description: t("savedToastDesc"),
      });
    } catch {
      trackPlannerEvent("save_failed", { locale });
      setShareError(t("saveErrorInline"));
      toast({
        title: t("saveErrorToastTitle"),
        description: t("saveErrorToastDesc"),
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  }

  // Kopiranje deljive povezave (s fallbackom za starejše brskalnike)
  async function copyShareLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      try {
        const el = document.createElement("textarea");
        el.value = shareUrl;
        el.setAttribute("readonly", "");
        el.style.position = "fixed";
        el.style.opacity = "0";
        document.body.appendChild(el);
        el.select();
        document.execCommand("copy");
        document.body.removeChild(el);
      } catch {
        // Brez clipboard dostopa — URL ostane vidit v inputu
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // === Pošlji na e-pošto: POST /api/email-itinerary ===
  async function handleEmailSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!itinerary || emailSending) return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailError(tCommon("invalidEmail"));
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch("/api/email-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, itinerary, formData }),
      });
      const data = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || t("emailSendFailed"));
      }
      setEmailSentTo(trimmed);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : t("emailSendFailed"));
    } finally {
      setEmailSending(false);
    }
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const vErr = validate(formData);
    if (vErr) {
      setError(vErr);
      toast({
        title: t("validationToastTitle"),
        description: vErr,
        variant: "destructive",
      });
      return;
    }
    await generateItinerary(formData);
  }

  // === F5.4 "Začni s povezavo" — prepoznaj destinacije na prilepljenem viru ===
  // Deterministično (strežnik brez AI): zadetki se pokažejo PRED generiranjem,
  // nato se izpolnijo dnevi/interesi + zaželene destinacije in SAMODEJNO
  // generira ( en klik od povezave do načrta).
  // NE React.FormEvent handler — kliče se tudi iz onClick/onKeyDown gumba.
  async function handleIngestSubmit() {
    const trimmed = ingestUrl.trim();
    if (!trimmed || ingestLoading) return;

    setIngestLoading(true);
    setIngestError(null);
    setIngestMatches(null);
    setIngestIsVlm(false);
    trackPlannerEvent("ingest_url_attempted", {
      host: (() => {
        try {
          return new URL(trimmed).hostname.slice(0, 60);
        } catch {
          return "invalid";
        }
      })(),
      locale,
    });
    try {
      const res = await fetch("/api/itinerary/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            matches?: IngestMatch[];
            suggestion?: {
              interests?: string[];
              days?: number;
              preferredDestinations?: string[];
            };
            pageTitle?: string | null;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.matches?.length) {
        throw new Error(data?.error || t("ingestError"));
      }

      setIngestMatches(data.matches);
      setIngestSourceTitle(data.pageTitle ?? null);
      trackPlannerEvent("ingest_url_success", {
        matches: data.matches.length,
        days: data.suggestion?.days ?? 3,
        locale,
      });

      // Izpolni obrazec iz predloga ( ohrani budget/skupino/sezono uporabnika;
      // interesi in dnevi pridejo iz vira — uporabnik jih lahko poprej spremeni)
      const nextInput: PlannerInput = {
        ...formData,
        days: data.suggestion?.days ?? formData.days,
        interests:
          data.suggestion?.interests && data.suggestion.interests.length > 0
            ? data.suggestion.interests
            : formData.interests,
        preferredDestinations: data.suggestion?.preferredDestinations,
      };
      setFormData(nextInput);
      setIngestUrl("");
      toast({
        title: t("ingestSuccessToast"),
        description: t("ingestSuccessToastDesc", {
          names: data.matches
            .slice(0, 3)
            .map((m) => m.name)
            .join(", "),
        }),
      });
      // Samodejna generacija — od povezave do načrta v enem koraku
      await generateItinerary(nextInput);
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : t("ingestError")
      );
    } finally {
      setIngestLoading(false);
    }
  }

  // === F8 "Začni s sliko" — File → data URL (validacija vrste/velikosti na
  // clientu; strežnik vseeno ponovno validira). Vrača null ob napaki (napaka
  // se izpiše prek ingestError, ne prek throw — enak prikaz kot pri povezavah).
  function acceptIngestImage(file: File | null): boolean {
    if (!file) return false;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setIngestError(
        file.type
          ? `Nepodprta vrsta: ${file.type}. Sprejmem JPEG, PNG ali WebP.`
          : "Neprepoznana vrsta slike. Sprejmem JPEG, PNG ali WebP."
      );
      return false;
    }
    if (file.size > 4.5 * 1024 * 1024) {
      setIngestError("Slika je prevelika (največ ~4,5 MB).");
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setIngestImage(reader.result);
        setIngestImageName(file.name || "slika");
        setIngestError(null);
        setIngestMatches(null);
      }
    };
    reader.onerror = () => setIngestError(t("ingestImageError"));
    reader.readAsDataURL(file);
    return true;
  }

  // Prilepljanje slike (paste) na celotnem vnosnem okviru — uporabnik kopira
  // screenshot in ga prilepi direktno, brez iskanja datoteke.
  function handleIngestPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    if (ingestMode !== "image") return;
    const item = [...(e.clipboardData?.items ?? [])].find((it) =>
      it.type.startsWith("image/")
    );
    if (item) {
      const file = item.getAsFile();
      if (file && acceptIngestImage(file)) e.preventDefault();
    }
  }

  // === F8: prepoznaj destinacije na sliki — POST /api/itinerary/ingest-image.
  // Strežnik: VLM prebere imena ( strogi ekstraktor), nato SESTAVNI
  // deterministični matcher poveže z našimi 22 destinacijami (ista funkcija
  // kot pri povezavah). Metoda je razkrita (method: "vlm").
  async function handleIngestImageSubmit() {
    if (!ingestImage || ingestLoading) return;

    setIngestLoading(true);
    setIngestError(null);
    setIngestMatches(null);
    setIngestIsVlm(false);
    setIngestVia(null);
    trackPlannerEvent("ingest_image_attempted", { locale });
    try {
      const res = await fetch("/api/itinerary/ingest-image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ image: ingestImage }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            matches?: IngestMatch[];
            suggestion?: {
              interests?: string[];
              days?: number;
              preferredDestinations?: string[];
            };
            method?: "vlm";
            via?: "gemini" | "z-ai-sdk";
            vlmChars?: number;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.matches?.length) {
        throw new Error(data?.error || t("ingestImageError"));
      }

      setIngestMatches(data.matches);
      setIngestSourceTitle(null); // vir je uporabnikova slika (ni naslova)
      setIngestIsVlm(data.method === "vlm");
      setIngestVia(data.via ?? null);
      trackPlannerEvent("ingest_image_success", {
        matches: data.matches.length,
        days: data.suggestion?.days ?? 3,
        locale,
      });

      const nextInput: PlannerInput = {
        ...formData,
        days: data.suggestion?.days ?? formData.days,
        interests:
          data.suggestion?.interests && data.suggestion.interests.length > 0
            ? data.suggestion.interests
            : formData.interests,
        preferredDestinations: data.suggestion?.preferredDestinations,
      };
      setFormData(nextInput);
      toast({
        title: t("ingestImageSuccessToast"),
        description: t("ingestImageSuccessToastDesc", {
          names: data.matches
            .slice(0, 3)
            .map((m) => m.name)
            .join(", "),
        }),
      });
      await generateItinerary(nextInput);
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : t("ingestImageError")
      );
    } finally {
      setIngestLoading(false);
    }
  }

  // === F5.2: ICS izvoz — načrt v koledar ( Apple/Google/Outlook) ===
  function handleIcsDownload() {
    if (!itinerary) return;
    const ics = buildItineraryICS(itinerary, {
      lang: locale === "en" ? "en" : "sl",
      url: shareUrl ?? undefined,
    });
    if (!ics) {
      toast({
        title: t("icsEmptyToastTitle"),
        description: t("icsEmptyToastDesc"),
        variant: "destructive",
      });
      return;
    }
    try {
      const blob = new Blob([ics], {
        type: "text/calendar;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = icsFileName(itinerary);
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      trackPlannerEvent("ics_download", {
        days: itinerary.days.length,
        has_dates: Boolean(itinerary.tripStartDate),
        locale,
      });
      toast({
        title: t("icsToastTitle"),
        description: itinerary.tripStartDate
          ? t("icsToastDesc")
          : t("icsToastDescNoDates"),
      });
    } catch {
      toast({
        title: tCommon("error"),
        description: t("icsError"),
        variant: "destructive",
      });
    }
  }

  return (
    <section
      id="načrtuj"
      className="scroll-mt-24 bg-gradient-to-b from-muted/40 to-background py-16 sm:py-20 lg:py-24"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* grid-cols-1 = minmax(0,1fr) — eksplicitna sled prepreči intrinsično
            (min-content) širjenje auto sledi na mobilnem; FW4.2 pasovi
            dogodkov s truncate sicer sprožijo horizontalni overflow */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {/* === LEVO — obrazec === */}
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-6 text-primary" aria-hidden />
                <CardTitle className="text-2xl sm:text-3xl">
                  {t("title")}
                </CardTitle>
              </div>
              <CardDescription className="text-base">
                {t("description")}
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-5">
                {/* F5.4 "Začni s povezavo" + F8 "Začni s sliko" — MindTrip
                    "Start Anywhere" po slovensko: prilepi YouTube/TikTok/blog
                    povezavo (deterministično) ALI naloži/prilepi fotografijo
                    (AI prebere imena, ujemanje spet deterministično) — strežnik
                    prepozna destinacije in izpolni obrazec.
                    POZOR: NI <form> — HTML ne dovoljuje ugnezdenih formov
                    ( zunanji planner form), zato Enter obravnavamo prek
                    onKeyDown na vhodu. */}
                <div
                  className="rounded-lg border border-primary/20 bg-primary/5 p-3"
                  onPaste={handleIngestPaste}
                >
                  <div className="space-y-2">
                    {/* Zavihek vira: Povezava | Slika (F8) */}
                    <div
                      role="tablist"
                      aria-label={t("ingestLabel")}
                      className="flex items-center gap-1"
                    >
                      {(
                        [
                          { id: "link", label: t("ingestTabLink"), icon: Link2 },
                          {
                            id: "image",
                            label: t("ingestTabImage"),
                            icon: ImagePlus,
                          },
                        ] as const
                      ).map(({ id, label, icon: Icon }) => (
                        <button
                          key={id}
                          type="button"
                          role="tab"
                          aria-selected={ingestMode === id}
                          onClick={() => {
                            setIngestMode(id);
                            setIngestError(null);
                          }}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            ingestMode === id
                              ? "bg-primary text-primary-foreground"
                              : "text-primary hover:bg-primary/10"
                          )}
                        >
                          <Icon className="size-3.5 shrink-0" aria-hidden />
                          {label}
                        </button>
                      ))}
                    </div>

                    {ingestMode === "link" ? (
                      <>
                        <label
                          htmlFor="ingest-url"
                          className="flex items-center gap-1.5 text-xs font-medium text-primary"
                        >
                          <Link2 className="size-3.5 shrink-0" aria-hidden />
                          {t("ingestLabel")}
                        </label>
                        <div className="flex gap-2">
                          <Input
                            id="ingest-url"
                            type="url"
                            inputMode="url"
                            autoComplete="off"
                            placeholder={t("ingestPlaceholder")}
                            value={ingestUrl}
                            onChange={(e) => {
                              fireStartedOnce();
                              setIngestUrl(e.target.value);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void handleIngestSubmit();
                              }
                            }}
                            disabled={ingestLoading}
                            aria-describedby="ingest-hint"
                            className="flex-1"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={ingestLoading || !ingestUrl.trim()}
                            onClick={() => void handleIngestSubmit()}
                            className="gap-1.5"
                            aria-label={t("ingestButtonAria")}
                          >
                            {ingestLoading ? (
                              <Loader2
                                className="size-4 animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <LocateFixed className="size-4" aria-hidden />
                            )}
                            <span className="hidden sm:inline">
                              {t("ingestButton")}
                            </span>
                          </Button>
                        </div>
                        <p
                          id="ingest-hint"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {t("ingestHint")}
                        </p>
                      </>
                    ) : (
                      <>
                        <label
                          htmlFor="ingest-image-input"
                          className="flex items-center gap-1.5 text-xs font-medium text-primary"
                        >
                          <ImagePlus className="size-3.5 shrink-0" aria-hidden />
                          {t("ingestImageLabel")}
                        </label>
                        <input
                          ref={ingestImageInputRef}
                          id="ingest-image-input"
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="sr-only"
                          tabIndex={-1}
                          onChange={(e) => {
                            fireStartedOnce();
                            acceptIngestImage(e.target.files?.[0] ?? null);
                            // Ponastavi, da lahko ista datoteka znova izbere
                            e.target.value = "";
                          }}
                        />
                        {ingestImage ? (
                          <div className="flex items-center gap-3 rounded-md border border-primary/25 bg-background p-2">
                            {/* next/image ni potreben — lokalni data URL
                                predogled, ki se NE persistira */}
                            <img
                              src={ingestImage}
                              alt={ingestImageName || "predogled slike"}
                              className="size-14 shrink-0 rounded object-cover"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">
                                {ingestImageName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t("ingestImageMethod")}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={ingestLoading}
                              onClick={() => void handleIngestImageSubmit()}
                              className="gap-1.5"
                              aria-label={t("ingestImageButtonAria")}
                            >
                              {ingestLoading ? (
                                <Loader2
                                  className="size-4 animate-spin"
                                  aria-hidden
                                />
                              ) : (
                                <LocateFixed className="size-4" aria-hidden />
                              )}
                              <span className="hidden sm:inline">
                                {t("ingestImageButton")}
                              </span>
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={ingestLoading}
                              onClick={() => {
                                setIngestImage(null);
                                setIngestImageName("");
                                setIngestMatches(null);
                                setIngestIsVlm(false);
                                setIngestVia(null);
                              }}
                              aria-label={t("ingestImageRemove")}
                              className="size-7 shrink-0"
                            >
                              <X className="size-4" aria-hidden />
                            </Button>
                          </div>
                        ) : (
                          <div
                            role="button"
                            tabIndex={0}
                            onClick={() =>
                              ingestImageInputRef.current?.click()
                            }
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" ||
                                e.key === " "
                              ) {
                                e.preventDefault();
                                ingestImageInputRef.current?.click();
                              }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIngestImageDragging(true);
                            }}
                            onDragLeave={() => setIngestImageDragging(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIngestImageDragging(false);
                              fireStartedOnce();
                              acceptIngestImage(
                                e.dataTransfer.files?.[0] ?? null
                              );
                            }}
                            aria-describedby="ingest-image-hint"
                            className={cn(
                              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center transition-colors",
                              ingestImageDragging
                                ? "border-primary bg-primary/10"
                                : "border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                            )}
                          >
                            <ImagePlus
                              className="size-5 text-primary"
                              aria-hidden
                            />
                            <span className="text-xs font-medium text-primary">
                              {t("ingestImageBrowse")}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {t("ingestImageDrop")}
                            </span>
                          </div>
                        )}
                        <p
                          id="ingest-image-hint"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {t("ingestImageHint")}{" "}
                          <span className="whitespace-nowrap">
                            {t("ingestImagePaste")}
                          </span>
                        </p>
                      </>
                    )}
                    {ingestError && (
                      <p role="alert" className="text-xs text-destructive">
                        {ingestError}
                      </p>
                    )}
                  </div>
                  {/* Zadetki — vidni PRED generiranjem ( preverljivost) */}
                  {ingestMatches && ingestMatches.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-primary/15 pt-2">
                      {ingestSourceTitle && (
                        <p className="truncate text-[11px] text-muted-foreground">
                          {t("ingestSource", { title: ingestSourceTitle })}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          {t("ingestDetected")}
                        </span>
                        {ingestMatches.slice(0, 8).map((m) => (
                          <Link
                            key={m.id}
                            href={`/destinacija/${m.slug}`}
                            className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-background px-2 py-0.5 text-xs text-foreground transition-colors hover:border-primary/60 hover:bg-primary/10"
                          >
                            {m.name}
                            <span className="text-muted-foreground">
                              ×{m.count}
                            </span>
                          </Link>
                        ))}
                        {ingestIsVlm && (
                          <span className="rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                            {ingestVia
                              ? t("ingestImageMethodVia", { provider: ingestVia })
                              : t("ingestImageMethod")}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="days" className="flex items-center gap-2">
                      <Calendar className="size-4" aria-hidden />
                      {t("daysLabel")}
                    </Label>
                    <Input
                      id="days"
                      name="days"
                      type="number"
                      min={1}
                      max={14}
                      value={formData.days}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          days: Number(e.target.value),
                        }));
                      }}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget" className="flex items-center gap-2">
                      <Euro className="size-4" aria-hidden />
                      {t("budgetLabel")}
                    </Label>
                    <Input
                      id="budget"
                      name="budget"
                      type="number"
                      min={50}
                      max={5000}
                      step={50}
                      value={formData.budget}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          budget: Number(e.target.value),
                        }));
                      }}
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="groupSize" className="flex items-center gap-2">
                      <Users className="size-4" aria-hidden />
                      {t("groupSizeLabel")}
                    </Label>
                    <Input
                      id="groupSize"
                      name="groupSize"
                      type="number"
                      min={1}
                      max={20}
                      value={formData.groupSize}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          groupSize: Number(e.target.value),
                        }));
                      }}
                      required
                    />
                  </div>

                  {/* WEATHER-CONTEXT: tip potne skupine — oblikuje ritem in
                      izbor načrta (opcijsno); "Sam" sinhronizira številko */}
                  <div className="space-y-2">
                    <Label>
                      <UsersRound className="size-4" aria-hidden />
                      {t("partyTypeLabel")}
                      <span className="font-normal text-muted-foreground">
                        {t("partyTypeOptional")}
                      </span>
                    </Label>
                    <div
                      role="group"
                      aria-label={t("partyTypeLabel")}
                      className="flex flex-wrap gap-1.5"
                    >
                      {PARTY_OPTIONS.map((option) => {
                        const selected = formData.partyType === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => togglePartyType(option.value)}
                            aria-pressed={selected}
                            className={cn(
                              "inline-flex items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                              "min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                              selected
                                ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                                : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                            )}
                          >
                            {t(option.labelKey)}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="season" className="flex items-center gap-2">
                      <Cloud className="size-4" aria-hidden />
                      {t("seasonLabel")}
                    </Label>
                    <Select
                      value={formData.season}
                      onValueChange={(v: Season) => {
                        fireStartedOnce();
                        setFormData((p) => ({ ...p, season: v }));
                      }}
                    >
                      <SelectTrigger id="season" className="w-full">
                        <SelectValue placeholder={t("seasonPlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        {SEASONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {t(s.labelKey)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* FW4.2: datum odhoda — poganja datumski ujem dogodkov
                      ("med tvojim obiskom") in prikaz datumov na dnevih */}
                  <div className="space-y-2">
                    <Label
                      htmlFor="startDate"
                      className="flex items-center gap-2"
                    >
                      <Calendar className="size-4" aria-hidden />
                      {t("startDateLabel")}
                      <span className="font-normal text-muted-foreground">
                        {t("startDateOptional")}
                      </span>
                    </Label>
                    <Input
                      id="startDate"
                      name="startDate"
                      type="date"
                      min={todayISO || undefined}
                      value={formData.startDate ?? ""}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          startDate: e.target.value || undefined,
                        }));
                      }}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("startDateHint")}
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>{t("interestsLabel")}</Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERESTS.map((interest) => {
                      const selected = formData.interests.includes(interest.value);
                      return (
                        <button
                          key={interest.value}
                          type="button"
                          onClick={() => toggleInterest(interest.value)}
                          aria-pressed={selected}
                          className={cn(
                            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all",
                            "min-h-[36px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                            selected
                              ? "border-primary bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                              : "border-border bg-muted text-muted-foreground hover:bg-muted/70"
                          )}
                        >
                          <span aria-hidden>{interest.icon}</span>
                          {interest.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch">
                <Button
                  type="submit"
                  className="w-full bg-primary"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {t("generating")}
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden />
                      {t("submit")}
                    </>
                  )}
                </Button>
              </CardFooter>
            </form>
          </Card>

          {/* === DESNO — rezultat === */}
          <div className="lg:min-h-[600px]">
            {/* Empty state */}
            {!loading && !error && !itinerary && (
              <Card className="h-full border-dashed">
                <CardContent className="flex min-h-[400px] flex-col items-center justify-center gap-4 py-16 text-center">
                  <div className="rounded-full bg-primary/10 p-6">
                    <Sparkles className="size-10 text-primary" aria-hidden />
                  </div>
                  <div className="space-y-1">
                    <p className="text-lg font-semibold">
                      {t("emptyTitle")}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t("emptyHint")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Loading skeletons */}
            {loading && (
              <div className="space-y-4">
                <Skeleton className="h-10 w-2/3" />
                {Array.from({ length: 3 }).map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-6 w-32" />
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Skeleton className="h-16 w-full" />
                      <Skeleton className="h-16 w-full" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}

            {/* Error state */}
            {!loading && error && (
              <Alert variant="destructive">
                <AlertCircle className="size-4" aria-hidden />
                <AlertTitle>{tCommon("error")}</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateItinerary(formData)}
                  >
                    <AlertCircle className="size-3.5" aria-hidden />
                    {tCommon("retry")}
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Success state */}
            {!loading && !error && itinerary && (
              <div className="space-y-5">
                {/* Obnovljeni načrt chip */}
                {restoredVisible && (
                  <div
                    role="status"
                    className="flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary animate-in fade-in slide-in-from-top-1 duration-300"
                  >
                    <Sparkles className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 font-medium">{t("restoredChip")}</span>
                    <button
                      type="button"
                      onClick={() => setRestoredVisible(false)}
                      className="rounded-full p-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("restoredChipDismiss")}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold">
                    {t("resultTitle", { days: itinerary.days.length })}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        itinerary.source === "ai"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {itinerary.source === "ai" ? t("badgeAI") : t("badgeSample")}
                    </Badge>
                    <Badge className="bg-primary text-primary-foreground">
                      {t("totalBadge", { total: itinerary.total_budget })}
                    </Badge>
                    {itinerary.tripStartDate && (
                      <Badge
                        variant="outline"
                        className="gap-1.5 font-normal"
                        title={t("tripRangeTitle")}
                      >
                        <Calendar className="size-3.5" aria-hidden />
                        {formatDateRangeSI(
                          itinerary.tripStartDate,
                          itinerary.tripEndDate
                        )}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* FW4.1: strukturne metrike poti + utemeljitev — nad dnevni timeline */}
                <ItineraryQualityCard itinerary={itinerary} input={formData} />

                {/* F6.2: proračun načrta + razdelitev na osebo + osebni cilj —
                    stroški iz DEJANSKEGA načrta (atrakcije + vožnja F5.3),
                    odkrito povedano, česa ocena NE vključuje */}
                <BudgetPanel itinerary={itinerary} input={formData} />

                {/* P0.2 GEO-VALIDACIJA: poštena preverba izvedljivosti — opozorila
                    po dnevih (km, obseg, urnik) z pozivom k prilagoditvi */}
                <GeoValidationPanel itinerary={itinerary} />

                {/* F5.1 (primerjalna analiza MindTrip): ZEMLJEVID POTI NA
                    STRANI NAČRTOVALCA — oštevilčeni markerji po dnevih z barvami,
                    interaktivna legenda dni ( vklop/izklop) in dvosmerna
                    sinhronizacija s karticami postankov. Prej je zemljevid živel
                    le na /zemljevid in /pot/[shareId]. */}
                {routeByDay.length > 0 && (
                  <TripMapPanel
                    routeByDay={routeByDay}
                    dayKm={dayKm}
                    focusRequest={mapFocus}
                    onStopSelect={(day, indexInDay) => {
                      // Klik markerja → scroll na kartico postanka + highlight
                      const el = document.getElementById(
                        `stop-row-${day}-${indexInDay}`
                      );
                      if (el) {
                        el.scrollIntoView({
                          behavior: "smooth",
                          block: "center",
                        });
                        el.classList.add("ring-2", "ring-primary/60");
                        setTimeout(() => {
                          el.classList.remove("ring-2", "ring-primary/60");
                        }, 1800);
                      }
                    }}
                  />
                )}

                {/* F9 "Pogovor z načrtom" (MindTrip chat-first pariteta, naša
                    pot): vprašanja o načrtu odgovarja NAJPREJ deterministično
                    (iste čiste funkcije kot prikaz), AI pa LE sfrazi list
                    dejstev. Ukazi za SPREMEMBE ostanejo v refinerju spodaj —
                    vprašanje ≠ ukaz, obe plasti sta jasno ločeni. */}
                <PlanCopilot itinerary={itinerary} formData={formData} />

                {/* Multi-turn AI refiner — uporabnik naravnojezično spreminja itinerer */}
                {/* P0-4: sidro za mobilno bližnjico "Prilagodi" (PlannerDayNav) */}
                <div id="itinerary-refiner" className="scroll-mt-[130px] lg:scroll-mt-24">
                <ItineraryRefiner
                  itinerary={itinerary}
                  formData={formData}
                  onRefined={(newItinerary) => {
                    setItinerary(newItinerary);
                    // Refiniran načrt se shrani lokalno (deljiva povezava ostane ista
                    // dokler uporabnik znova klikne "Shrani in deli")
                    persistItineraryLocally(newItinerary, formData);
                    // P0.2 (recenzija): deljiva povezava kaže na STARO različico —
                    // javna /pot/[shareId] mora biti identična urejeni različici, zato
                    // se ob vsaki spremembi načrta zastareli link umakne (uporabnik
                    // znova klikne "Shrani in deli" za svež, sinhroniziran link).
                    setShareUrl(null);
                    setCopied(false);
                  }}
                />
                </div>

                {/* P0-4: mobilna/tabletna navigacija po dnevih potovanja — lepljiva
                    vrstica pod glavo (scroll-spy tabi + bližnjici Prilagodi/Shrani).
                    Na desktopu (lg+) skrita — dvostolpčni pogled je dovolj pregleden. */}
                <PlannerDayNav days={itinerary.days} />

                {/* Day plans */}
                <div className="space-y-4">
                  {itinerary.days.map((day) => {
                    // FW4.2: ISO datum tega dneva (samo če je znan datum odhoda)
                    const dayISO = itinerary.tripStartDate
                      ? dayISOForDayNumber(itinerary.tripStartDate, day.day)
                      : null;
                    const dayMs = dayISO ? parseISODateLocal(dayISO) : null;

                    // FW4.2: dodani dogodki, ki padejo NA TA DAN (iz
                    // itinerary.addedEvents; večdnevni dogodek pokrije vsak dan,
                    // ki ga prekriva)
                    const addedForDay = (itinerary.addedEvents ?? []).filter(
                      (ev) => {
                        if (dayMs === null) return false;
                        const evStart = parseISODateLocal(ev.date);
                        if (evStart === null) return false;
                        const evEnd =
                          parseISODateLocal(ev.endDate) ?? evStart;
                        return evStart <= dayMs && evEnd >= dayMs;
                      }
                    );

                    // P0.2 GEO-VALIDACIJA: stanje tega dne (za značko v glavi dneva)
                    const dayGeo = geoValidation?.days.find(
                      (d) => d.day === day.day
                    );
                    const dayIssues = geoValidation?.issues.filter(
                      (i) => i.day === day.day
                    );
                    const dayHasError = dayIssues?.some((i) => i.level === "error");
                    const dayHasWarn =
                      !dayHasError && (dayIssues?.length ?? 0) > 0;

                    return (
                    <Card
                      key={day.day}
                      id={`day-card-${day.day}`}
                      data-day={day.day}
                      className="scroll-mt-[130px] lg:scroll-mt-24"
                    >
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Calendar className="size-5 text-primary" aria-hidden />
                            {t("dayTitle", { day: day.day })}
                            {dayISO && (
                              <span className="text-sm font-normal text-muted-foreground">
                                · {formatDayLabelSI(dayISO)}
                              </span>
                            )}
                          </CardTitle>
                          <Badge variant="secondary" className="gap-1.5">
                            <Cloud className="size-3.5" aria-hidden />
                            {day.weather.condition} · {day.weather.temp}°C
                          </Badge>
                          {/* P0.2 GEO-VALIDACIJA: dnevna značka izvedljivosti —
                              ~km + raven (rdeča = ni realno izvedljivo,
                              jantbar = napak dan); brez značke = v redu.
                              F5.5: pri km=0 ( npr. en sam postanek) se značka
                              pokaže, če dan nosi opozorilo ( zaprtje atrakcije
                              na ta datum) — samo "!", brez zavajajočega "~0 km". */}
                          {dayGeo &&
                            (dayGeo.km > 0 || dayHasError || dayHasWarn) && (
                              <Badge
                                variant="outline"
                                className={cn(
                                  "gap-1.5 font-normal",
                                  dayHasError
                                    ? "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400"
                                    : dayHasWarn
                                      ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                                      : "text-muted-foreground"
                                )}
                                title={t("geoValidation.title")}
                              >
                                {dayGeo.km > 0 && (
                                  <>
                                    <Car className="size-3.5" aria-hidden />
                                    ~{dayGeo.km} km
                                  </>
                                )}
                                {dayGeo.km > 0
                                  ? dayHasError
                                    ? " · !"
                                    : dayHasWarn
                                      ? " · ⚠"
                                      : ""
                                  : dayHasError
                                    ? "!"
                                    : dayHasWarn
                                      ? "⚠"
                                      : ""}
                              </Badge>
                            )}
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {/* CROWD-ALTERNATIVES: poštena opomba o gneči +
                            mirnejše alternative izračunane iz resničnih
                            podatkov (razdalja/sezona/interesi) — povezave
                            vodijo na podstrani destinacij */}
                        {(itinerary.crowdNotices ?? [])
                          .filter((n) => n.day === day.day)
                          .map((notice) => (
                            <div
                              key={`${notice.day}-${notice.destination_id}`}
                              className="rounded-lg border border-border/70 bg-muted/40 p-3"
                            >
                              <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
                                <UsersRound
                                  className="mt-0.5 size-4 shrink-0 text-muted-foreground/70"
                                  aria-hidden
                                />
                                <span>{notice.reason}</span>
                              </p>
                              {notice.alternatives.length > 0 && (
                                <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                                    {t("crowdAlternativesLabel")}
                                  </span>
                                  {notice.alternatives.map((alt) => (
                                    <Link
                                      key={alt.destination_id}
                                      href={`/destinacija/${alt.slug}`}
                                      className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                      {alt.destination_name}
                                      <span className="text-muted-foreground/70">
                                        · {alt.distanceKm} km
                                      </span>
                                    </Link>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        {day.locations.map((loc, idx) => {
                          return (
                            <div
                              key={`${loc.destination_id}-${idx}`}
                              id={`stop-row-${day.day}-${idx}`}
                              className="rounded-lg border bg-card/50 p-4 transition-shadow"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="space-y-0.5">
                                  <div className="text-sm font-semibold text-primary">
                                    {loc.time_slot}
                                  </div>
                                  <p className="flex items-center gap-1.5 text-lg font-semibold">
                                    <MapPin
                                      className="size-4 text-muted-foreground"
                                      aria-hidden
                                    />
                                    {loc.destination_name}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="gap-1">
                                    <Clock className="size-3" aria-hidden />
                                    {loc.duration}h
                                  </Badge>
                                  <Badge className="bg-accent text-accent-foreground">
                                    €{loc.estimated_cost}
                                  </Badge>
                                  {/* F5.1: dvosmerna sinhronizacija — gumb na
                                      kartici postanka premakne zemljevid poti
                                      na ta postanek ( MindTrip workspace feel) */}
                                  {routeByDay.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setMapFocus({
                                          day: day.day,
                                          indexInDay: idx,
                                          nonce: Date.now(),
                                        })
                                      }
                                      className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                      aria-label={t("mapFocusAria", {
                                        name: loc.destination_name,
                                      })}
                                      title={t("mapFocusTitle")}
                                    >
                                      <LocateFixed
                                        className="size-4"
                                        aria-hidden
                                      />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {loc.notes && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {loc.notes}
                                </p>
                              )}
                              {/* FAZA 4-1 + 4-3: "Zakaj je to priporočeno?" + */}
                              {/* praktični podatki (samo obstoječi) */}
                              <StopInsights visit={loc} locale={locale} />
                            </div>
                          );
                        })}

                        {/* FW4.2: dodani dogodki tega dneva ("Dodaj v mojo pot") */}
                        {addedForDay.length > 0 && (
                          <div className="space-y-2">
                            {addedForDay.map((ev) => (
                              <div
                                key={ev.id}
                                className="flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3"
                              >
                                <CalendarDays
                                  className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400"
                                  aria-hidden
                                />
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold">
                                    {ev.name}
                                  </p>
                                  <p className="text-xs text-muted-foreground">
                                    {ev.location} ·{" "}
                                    {formatEventDate(ev.date, ev.endDate)}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => toggleAddedEvent(ev)}
                                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={t("removeEventAriaLabel", { name: ev.name })}
                                >
                                  <X className="size-4" aria-hidden />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Booking panel za ta dan — nastanitev, aktivnosti, hrana, transport */}
                        {/* id="booking-panel-{dan}" — nanj kaže gumb "Rezerviraj" v TripTimeline */}
                        <BookingPanel
                          dayPlan={day}
                          bookingData={bookingData}
                          id={`booking-panel-${day.day}`}
                        />
                      </CardContent>
                    </Card>
                    );
                  })}
                </div>

                {/* FW4.2: "Moji dogodki" — dodani dogodki, ki ne padejo na
                    konkreten dan (brez datuma odhoda ali izven dni potovanja) */}
                {(() => {
                  const mappedIds = new Set(
                    itinerary.days.flatMap((day) => {
                      const dayISO = itinerary.tripStartDate
                        ? dayISOForDayNumber(itinerary.tripStartDate, day.day)
                        : null;
                      const dayMs = dayISO ? parseISODateLocal(dayISO) : null;
                      if (dayMs === null) return [] as string[];
                      return (itinerary.addedEvents ?? [])
                        .filter((ev) => {
                          const evStart = parseISODateLocal(ev.date);
                          if (evStart === null) return false;
                          const evEnd =
                            parseISODateLocal(ev.endDate) ?? evStart;
                          return evStart <= dayMs && evEnd >= dayMs;
                        })
                        .map((ev) => ev.id);
                    })
                  );
                  const unmapped = (itinerary.addedEvents ?? []).filter(
                    (ev) => !mappedIds.has(ev.id)
                  );
                  if (unmapped.length === 0) return null;
                  return (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <CalendarDays className="size-5 text-primary" aria-hidden />
                          {t("myEventsTitle")}
                        </CardTitle>
                        <CardDescription>
                          {itinerary.tripStartDate
                            ? t("myEventsDescOutside")
                            : t("myEventsDescNoDate")}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {unmapped.map((ev) => (
                          <div
                            key={ev.id}
                            className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/50 p-3"
                          >
                            <CalendarDays
                              className="size-4 shrink-0 text-primary"
                              aria-hidden
                            />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold">
                                {ev.name}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {ev.location} ·{" "}
                                {formatEventDate(ev.date, ev.endDate)}
                              </p>
                            </div>
                            <button
                              type="button"
                              onClick={() => toggleAddedEvent(ev)}
                              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("removeEventAriaLabel", { name: ev.name })}
                            >
                              <X className="size-4" aria-hidden />
                            </button>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                })()}

                {/* Recommendations */}
                {itinerary.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Star className="size-5 text-primary" aria-hidden />
                        {t("recommendationsTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {itinerary.recommendations.map((r, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-primary" aria-hidden>
                              •
                            </span>
                            <span>{r}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Tips */}
                {itinerary.tips.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Sparkles className="size-5 text-primary" aria-hidden />
                        {t("tipsTitle")}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="space-y-2">
                        {itinerary.tips.map((t, i) => (
                          <li key={i} className="flex gap-2 text-sm">
                            <span className="text-primary" aria-hidden>
                              •
                            </span>
                            <span>{t}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}

                {/* Kaj se dogaja med tvojim obiskom — lokalni dogodki (max 6) */}
                {/* Sekcija se sama skrije, če events ni prisoten/prazen */}
                {/* FW4.2: dogodki z okvirjem potovanja + "Dodaj v mojo pot" */}
                <ItineraryEventsSection
                  events={itinerary.events}
                  tripStartDate={itinerary.tripStartDate}
                  tripEndDate={itinerary.tripEndDate}
                  addedEventIds={(itinerary.addedEvents ?? []).map(
                    (ev) => ev.id
                  )}
                  onToggleEvent={toggleAddedEvent}
                />

                {/* F6.1: pameten pakirni seznam — iz dnevne napovedi + dejanskih
                    postankov (razlogi, metoda razkrita, persist odkljukov) */}
                <SmartPackingSection itinerary={itinerary} input={formData} />

                {/* WOW: AI Trip Timeline — vizualni dan */}
                <TripTimeline days={itinerary.days} totalBudget={itinerary.total_budget} />

                {/* === AKCIJSKA VRSTICA: shrani/deli + e-pošta === */}
                {/* id="itinerary-actions" — cilj mobilne bližnjice "Shrani" (P0-4) */}
                <Card id="itinerary-actions" className="scroll-mt-[130px] lg:scroll-mt-24">
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleSaveShare}
                        disabled={saving || loading}
                        className="gap-1.5"
                        aria-label={t("saveShareAriaLabel")}
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Share2 className="size-4" aria-hidden />
                        )}
                        {saving ? t("saving") : t("saveShare")}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEmailOpen((v) => !v);
                          setEmailError(null);
                        }}
                        className="gap-1.5"
                        aria-expanded={emailOpen}
                        aria-label={t("emailButtonAriaLabel")}
                      >
                        <Mail className="size-4" aria-hidden />
                        {t("emailButton")}
                      </Button>
                      {/* F5.2: načrt v koledar (.ics) — Apple Koledar /
                          Google Calendar / Outlook, brez strežniškega klica */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleIcsDownload}
                        className="gap-1.5"
                        aria-label={t("icsButtonAria")}
                      >
                        <CalendarArrowDown className="size-4" aria-hidden />
                        {t("icsButton")}
                      </Button>
                    </div>

                    {shareError && (
                      <p role="alert" className="text-sm text-destructive">
                        {shareError}
                      </p>
                    )}

                    {/* Deljiva povezava */}
                    {shareUrl && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <div className="flex items-center gap-2">
                          <Input
                            readOnly
                            value={shareUrl}
                            aria-label={t("shareLinkAriaLabel")}
                            className="flex-1 font-mono text-xs"
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={copyShareLink}
                            className="gap-1.5"
                            aria-label={t("copyAriaLabel")}
                          >
                            {copied ? (
                              <Check className="size-4 text-emerald-600" aria-hidden />
                            ) : (
                              <Copy className="size-4" aria-hidden />
                            )}
                            {copied ? t("copied") : t("copy")}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("shareHint")}
                        </p>
                      </div>
                    )}

                    {/* E-poštna forma */}
                    {emailOpen && !emailSentTo && (
                      <form
                        onSubmit={handleEmailSubmit}
                        className="flex flex-col gap-2 sm:flex-row animate-in fade-in slide-in-from-bottom-1 duration-300"
                        noValidate
                      >
                        <Input
                          type="email"
                          inputMode="email"
                          autoComplete="email"
                          placeholder={tCommon("emailPlaceholder")}
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          aria-label="E-poštni naslov za pošiljanje itinererja"
                          className="flex-1"
                          required
                        />
                        <Button
                          type="submit"
                          disabled={emailSending || !email.trim()}
                          className="gap-1.5"
                          aria-label={t("emailSendAriaLabel")}
                        >
                          {emailSending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Mail className="size-4" aria-hidden />
                          )}
                          {emailSending ? t("emailSending") : t("emailSend")}
                        </Button>
                      </form>
                    )}

                    {emailError && (
                      <p role="alert" className="text-sm text-destructive">
                        {emailError}
                      </p>
                    )}

                    {emailSentTo && (
                      <p
                        role="status"
                        className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-400 animate-in fade-in duration-300"
                      >
                        <Check className="size-4 shrink-0" aria-hidden />
                        {t("emailSent", { email: emailSentTo })}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* WOW: Social Sharing — deli svoj AI plan */}
                <div className="flex items-center justify-center gap-3 py-2">
                  <SocialShare
                    title={t("socialShareTitle")}
                    destinations={Array.from(new Set(itinerary.days.flatMap((d) => d.locations.map((l) => l.destination_name))))}
                    description={t("socialShareDescription", {
                      days: itinerary.days.length,
                      total: itinerary.total_budget,
                    })}
                    variant="inline"
                    url={shareUrl ?? undefined}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

export default ItineraryPlanner;
