"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
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
  Gauge,
  Users,
  UsersRound,
  MapPin,
  MapPinned,
  LocateFixed,
  Link2,
  ImagePlus,
  FileUp,
  Waypoints,
  AlertCircle,
  Star,
  Cloud,
  Loader2,
  Share2,
  Mail,
  Check,
  Copy,
  ChevronDown,
  CloudSun,
  HelpCircle,
  MessageCircle,
  Moon,
  Sun,
  X,
  Volume2,
  FileText,
  Ticket,
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
import { Textarea } from "@/components/ui/textarea";
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
import { PACES, type Pace } from "@/lib/pace-types";
import { formatEventDate } from "@/lib/events-data";
import {
  dayISOForDayNumber,
  formatDateRangeSI,
  formatDayLabelSI,
  isValidStartDate,
  parseISODateLocal,
} from "@/lib/trip-dates";
// TASK 77 (1.73.4): povratna informacija generiranja — števec/faze/timeout
// (čista logika v lib, tu samo React vezava + AbortController)
import {
  GENERATION_TIMEOUT_SECONDS,
  ABORT_REASON_CANCEL,
  ABORT_REASON_TIMEOUT,
  formatGenerationElapsed,
  generationStageFor,
  isCancelledAbort,
} from "@/lib/generation-stages";
import type {
  PlannerInput,
  Itinerary,
  ItineraryEvent,
  DayPlan,
  Season,
} from "@/lib/types";
import { useAppStore } from "@/lib/store";
// 1.42 (GEO → NAČRT): dodajanje kraja iz AI klepeta — CustomEvent listener
// + consume odloženih krajev (sessionStorage) + skupna logika vstavljanja
// 1.43: simetričen EN KLIK za odstranitev (gumb na kartici postanka)
import {
  CHAT_ADD_PLACE_EVENT,
  addChatPlaceToItinerary,
  removeChatPlaceFromItinerary,
  readStashedChatPlaces,
  isValidChatPlace,
  LAST_ITINERARY_KEY,
} from "@/lib/chat-add-place";
import type { ChatPlace } from "@/lib/geo-intent";
// F1 (Supply Map): odstranjevanje izbranih produktov (čipi nad gumbom)
import { removeSelectedProduct } from "@/lib/supply/selection";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import { persistSelection } from "@/lib/supply/selection-persist";
import { useToast } from "@/hooks/use-toast";
import { trackFunnel } from "@/lib/funnel";
import { optimizeDayOrder } from "@/lib/route-order";
import {
  trackPlannerEvent,
  markResultRendered,
  markResultEngaged,
  fireAbandonedIfUnengaged,
} from "@/lib/planner-analytics";
import { destinationById } from "@/lib/stop-insights";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { StopInsights } from "@/components/stop-insights";
import { saveItinerary, fetchSharedItinerary } from "@/lib/itinerary-share";
import { addSavedTrip, deriveSavedTripName } from "@/lib/my-trips-storage";
import { cn } from "@/lib/utils";
import { BookingPanel, type BookingData } from "@/components/sections/booking-panel";
import { ItineraryRefiner } from "@/components/sections/itinerary-refiner";
import { PlanCopilot } from "@/components/plan-copilot";
import { PlannerDayNav } from "@/components/planner-day-nav";
import { ItineraryEventsSection } from "@/components/itinerary-events";
import { SmartPackingSection } from "@/components/packing-smart";
import { SocialShare } from "@/components/social-share";
import { TripTimeline } from "@/components/trip-timeline";
import { buildItineraryICS, icsFileName } from "@/lib/ics-export";
import type { IngestMatch } from "@/lib/url-ingest";
import { PlannerStopLeg } from "@/components/planner-stop-leg";
import {
  PlannerLegSuggestions,
  type StopSuggestion,
} from "@/components/planner-leg-suggestions";
import { PlannerMealStop } from "@/components/planner-meal-stop";
import { pickMealStop, type MealSuggestion } from "@/lib/meal-stops";
import { PlannerStatusStrip } from "@/components/planner-status-strip";
import { PlannerSummaryBar } from "@/components/planner-summary-bar";
import { buildItineraryAudioScript } from "@/lib/planner-audio";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import type { LocationVisit } from "@/lib/types";

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

// F15 (backlog #3): tempo potovanja — gostota načrta (labelKey → "planner")
const PACE_OPTIONS: { value: Pace; labelKey: string }[] = [
  { value: "slow", labelKey: "paceSlow" },
  { value: "balanced", labelKey: "paceBalanced" },
  { value: "fast", labelKey: "paceFast" },
];

// UI sprint (nabor #2 — dodatek raziskave): segment dneva Jutro/Popoldan/
// Večer iz obstoječega time_slot polja. "HH:MM-…" → košarica po začetni uri;
// besedilni sloti po ključnih besedah; neznano → null (brez segmentacije —
// nazaj kompatibilno s starimi načrti). NE spreminja podatkovne plasti.
type DaySegment = "morning" | "afternoon" | "evening";

const SEGMENT_LABEL_KEYS: Record<DaySegment, string> = {
  morning: "segMorning",
  afternoon: "segAfternoon",
  evening: "segEvening",
};

const SEGMENT_ICONS: Record<DaySegment, typeof Sun> = {
  morning: Sun,
  afternoon: CloudSun,
  evening: Moon,
};

function segmentOfSlot(slot: string): DaySegment | null {
  if (!slot) return null;
  const hourMatch = slot.match(/^(\d{1,2}):(\d{2})/);
  if (hourMatch) {
    const hour = parseInt(hourMatch[1], 10);
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    return "evening";
  }
  const lower = slot.toLowerCase();
  if (/(jutr|zjutraj|morning)/.test(lower)) return "morning";
  if (/(popoldan|afternoon)/.test(lower)) return "afternoon";
  if (/(večer|vecer|zvečer|zvecer|evening|night)/.test(lower)) return "evening";
  return null;
}

/**
 * Backlog #5: enakomerna prerazporeditev časovnih okvirjev dneva čez
 * 9:00–19:00 (korak 30 min) po vstavitvi/odstranitvi postanka — čista
 * funkcija, isti HH:MM format kot fallback generator (segmenti
 * Jutro/Popoldan/Večer ostanejo berljivi). En sam postanek ohrani svoj
 * okvir (ni česa prerazporejati).
 */
function spreadDaySlots(locations: LocationVisit[]): LocationVisit[] {
  const n = locations.length;
  if (n <= 1) return locations;
  const startH = 9;
  const spanH = 10; // 9:00 → 19:00
  const per =
    n === 2 ? 5 : Math.max(1.5, Math.round((spanH / n) * 2) / 2); // korak 30 min
  const fmt = (h: number) => {
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
  };
  return locations.map((loc, i) => {
    const s = startH + i * per;
    return {
      ...loc,
      time_slot: `${fmt(s)}-${fmt(s + per)}`,
      duration: Math.max(1, Math.round(per)),
    };
  });
}

// Persistenca zadnjega itinererja (localStorage) + deljeni načrti (URL ?odpri=)
// KLJUČ je uvožen iz src/lib/chat-add-place.ts (enkraten vir — isti ključ
// bere/piseta klepet in planner).
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
      (PARTY_TYPES as readonly string[]).includes(p.partyType)) &&
    (p.pace === undefined || (PACES as readonly string[]).includes(p.pace))
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
  const dayMatch = lowerQuery.match(/(\d+)\s*(?:dan|dnev|dni|days?)/);
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

  // F15 (backlog #3): tempo iz naravnega jezika — forumi: "plannerji ne
  // vprašajo, če bi raje manj mest počasneje". Zadetek pošljemo v formo.
  let pace: PlannerInput["pace"];
  if (lowerQuery.includes("počasi") || lowerQuery.includes("počasnej") || lowerQuery.includes("mirn") || /\b(?:slow|relaxed|chill)\b/.test(lowerQuery)) pace = "slow";
  else if (lowerQuery.includes("hitr") || lowerQuery.includes("intenziv") || /\b(?:fast|intensive)\b|see a lot|čim več/.test(lowerQuery)) pace = "fast";

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
    ...(pace ? { pace } : {}),
  };
}

/**
 * AI Itinerary Planner — jedrna funkcija platforme Discover Slovenia AI.
 * Uporabnik izpolni obrazec (dnevi, proračun, skupina, sezona, interesi),
 * AI pa sestavi personalno dogodkovno povzetek potovanja po Sloveniji.
 */
// UX-CMP #1 (Mindtrip primerjava, 17. 9. 2026): statični demo predogled
// za PRAZNO stanje načrtovalnika — prej je desna polovica kazala samo
// ikono in »itinerer se bo prikazal tukaj« (VLM: »suggests the app is
// broken«). Zdaj prvi ogled pokaže POLN izdelek (Mindtripov vzorec):
// mini dan Bled → Vintgar → Bohinj iz uredniškega dataseta (prave slike,
// cene, razdalje) + gumb, ki ta primer dejansko generira.
const DEMO_PREVIEW_STOPS = [
  { id: "bled", time: "09:00–12:00", hours: 3 },
  { id: "vintgar", time: "13:00–15:00", hours: 2 },
  { id: "bohinj", time: "16:00–19:00", hours: 3 },
] as const;

/** Etapne oznake med postanki (približki iz KNOWN_DISTANCES logike). */
const DEMO_PREVIEW_LEGS = ["10 min · 4 km", "25 min · 17 km"] as const;

/** Imena za EN prikaz (SL imena pridejo iz DESTINATIONS dataseta). */
const DEMO_PREVIEW_NAMES_EN: Record<string, string> = {
  bled: "Bled",
  vintgar: "Vintgar Gorge",
  bohinj: "Lake Bohinj",
};

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
  // TASK 77: DEJANSKI pretečeni čas generiranja (1 Hz) +AbortController —
  // prej je uporabnik ob obešeni zahtevi ostal ujet v skeletu brez izhoda.
  const [generationElapsed, setGenerationElapsed] = useState(0);
  const generationAbortRef = useRef<AbortController | null>(null);

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

  // Backlog #5: VSI destinacijski ID-ji trenutnega načrta — predlogi
  // "Postanki na poti" jih izpustijo (ne predlagamo že načrtovanega) in se
  // po Dodaj takoj skrijejo iz razširjene sezname.
  const usedDestinationIds = useMemo(
    () =>
      new Set(
        (itinerary?.days ?? []).flatMap((d) =>
          d.locations.map((l) => l.destination_id)
        )
      ),
    [itinerary]
  );

  // Backlog #6 "Kosilo na dolgi etapi": največ EN svetovalni predlog na dan —
  // čista funkcija nad time_slot postankov + OSRM nogami (stari načrti →
  // hevristika, isti vir kot povezovalniki). Sprožilec: najdaljša etapa
  // ≥ 75 min ali skupna vožnja dneva ≥ 120 min (glej meal-stops.ts).
  const mealByDay = useMemo(() => {
    const map = new Map<number, MealSuggestion>();
    for (const day of itinerary?.days ?? []) {
      const s = pickMealStop(day, itinerary?.legs);
      if (s) map.set(day.day, s);
    }
    return map;
  }, [itinerary]);

  // D2 (nabor #2): zvočni povzetek — skript se sestavi ČISTO iz podatkov
  // načrta (ista čista funkcija na clientu; km iz geo-validacije, enak vir
  // kot značke ~km dni). Null, če načrta ni. Ključ razveljavi stari zvok ob
  // spremembi načrta/locale/skupine.
  const audioScript = useMemo(
    () =>
      itinerary
        ? buildItineraryAudioScript({
            itinerary,
            dayKm,
            groupSize: formData.groupSize,
            locale: locale === "en" ? "en" : "sl",
          })
        : null,
    [itinerary, dayKm, formData.groupSize, locale]
  );
  const audioKey = useMemo(
    () =>
      audioScript ? `${locale}:${formData.groupSize}:${audioScript.chars}` : null,
    [audioScript, locale, formData.groupSize]
  );

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
  const [ingestMode, setIngestMode] = useState<
    "link" | "image" | "pdf" | "pins"
  >("link");
  const [ingestImage, setIngestImage] = useState<string | null>(null); // data URL
  const [ingestImageName, setIngestImageName] = useState<string>("");
  const [ingestImageDragging, setIngestImageDragging] = useState(false);
  const [ingestIsVlm, setIngestIsVlm] = useState(false); // metoda zadnjega zadetka
  const [ingestVia, setIngestVia] = useState<"gemini" | "z-ai-sdk" | null>(
    null
  ); // F10: kateri vision provider je bral sliko (poštenost)
  const ingestImageInputRef = useRef<HTMLInputElement | null>(null);

  // === F14 "Uvozi shranjene točke": Google Maps pins ( Mindtrip "Google
  // Pins") — prilepi Takeout JSON / KML / besedilni seznam; ujemanje po imenu
  // ali po koordinatah ( ≤ 25 km) je deterministično ( 0 AI žetonov). ===
  const [ingestPins, setIngestPins] = useState("");
  const [ingestPinsName, setIngestPinsName] = useState<string | null>(null);
  const [ingestPinsMeta, setIngestPinsMeta] = useState<{
    format: "geojson" | "kml" | "text";
    total: number;
    unmatched: number;
  } | null>(null);
  const ingestPinsInputRef = useRef<HTMLInputElement | null>(null);

  // === D3 (nabor #2, Mindtrip "Start Anywhere" s PDF): pobršurani vodnik /
  // izvožen itinerar / potrdilo — besedilna plast (unpdf, 0 AI) → ISTO
  // deterministično ujemanje kot pri povezavah in slikah. ===
  const [ingestPdf, setIngestPdf] = useState<string | null>(null); // data URL
  const [ingestPdfName, setIngestPdfName] = useState<string>("");
  const [ingestPdfDragging, setIngestPdfDragging] = useState(false);
  const ingestPdfInputRef = useRef<HTMLInputElement | null>(null);

  // === D2 (nabor #2, Mindtrip audio): "Poslušaj svoj načrt" — zvočni
  // povzetek (TTS). Skript sestavimo deterministično iz podatkov načrta
  // (0 AI); zvok generira /api/itinerary/tts ob kliku (ne predhodno). ===
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);
  // Ključ (dolžina skripta + skupina) — sprememba načrta razveljavi stari zvok
  const [audioUrlKey, setAudioUrlKey] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

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

  // === UI sprint (smer naborov #1+#2): NL vrstica kot primarni vnos, obrazec
  // se po generiranju zloži (Uredi ga znova odpre), zavihka pogovorne
  // površine ob zemljevidu (spremeni/vprašaj) in zložena skupina "Več" ===
  const [nlQuery, setNlQuery] = useState("");
  const [formExpanded, setFormExpanded] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [chatTab, setChatTab] = useState<"refine" | "ask">("refine");
  const [moreOpen, setMoreOpen] = useState(false);

  // Sinhroniziraj z globalnim store-om (za MapSection + TripTimeline "Shrani")
  const setStoreItinerary = useAppStore((s) => s.setItinerary);
  const setPlannerForm = useAppStore((s) => s.setPlannerForm);
  // F1 (Supply Map): izbrani produkti z zemljevida ponudbe (sessionStorage
  // persistenca prek selection-persist — preživi osvežitev strani).
  const selectedProducts = useAppStore((s) => s.selectedProducts);
  const setSelectedProducts = useAppStore((s) => s.setSelectedProducts);
  // AUDIT 42 (42-d YELLOW #6): store se hidrira iz sessionStorage ŠELE na
  // klientu (SSR = []) — čipi bi sprožili React hydration mismatch. Rešitev:
  // čipi se izrišejo šele po mountu (ista plat kot ostale client-only plasti).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
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

  // === 1.42 (GEO → NAČRT): klepet → planner. AI klepet (plavajoči widget,
  // montiran tudi tukaj) pošlje CustomEvent s krajem; planner ga PREVZAME
  // (preventDefault) SAMO kadar ima že itinerer — sicer klepet gre po svoji
  // poti (stash + "Ni še načrta"). Listener se veže na sveže dependencyje,
  // ker potrebuje trenutni itinerary/formData/shareUrl. ===
  useEffect(() => {
    const handleChatAddPlace = (e: Event) => {
      const place = (e as CustomEvent<ChatPlace>).detail;
      if (!isValidChatPlace(place)) return;
      if (!itinerary) return; // nimamo načrta — ne prevzamemo (klepet stasha)
      e.preventDefault(); // "jaz prevzamem" — dispatchEvent vrne false

      const result = addChatPlaceToItinerary(itinerary, place, {
        locale,
        groupSize: formData?.groupSize,
      });
      if (!result.ok) {
        toast({
          title: t("chatPlaceDuplicateTitle"),
          description: place.name,
        });
        return;
      }

      setItinerary(result.itinerary);
      persistItineraryLocally(result.itinerary, formData);
      markResultEngaged();
      // Strukturna sprememba — zastarel deljeni link se umakne (vzorec F16)
      if (shareUrl) {
        setShareUrl(null);
        setCopied(false);
      }
      trackPlannerEvent("chat_place_added", {
        provenance: place.provenance,
        category: place.category,
        day: result.day,
        locale,
      });
      toast({
        title: t("chatPlaceAddedTitle"),
        description: t("chatPlaceAddedDesc", {
          name: place.name,
          day: result.day,
        }),
      });
    };

    window.addEventListener(CHAT_ADD_PLACE_EVENT, handleChatAddPlace);
    return () =>
      window.removeEventListener(CHAT_ADD_PLACE_EVENT, handleChatAddPlace);
  }, [itinerary, formData, shareUrl, locale]);

  // === 1.42 (GEO → NAČRT): consume odloženih krajev. Uporabnik je na kateri
  // koli strani kliknil "+", načrta še ni bilo → kraj je čakal v
  // sessionStorage (vzorec heroQuery). Takoj ko itinerer obstaja (obnova iz
  // localStorage ALI prva generacija), kraje dodamo in javimo z enim toastom.
  // Branje POČISTI ključ → efek se sam-ohrani ob vsaki spremembi itinererja. ===
  useEffect(() => {
    if (!itinerary) return;
    const stashed = readStashedChatPlaces();
    if (stashed.length === 0) return;

    let current = itinerary;
    const addedNames: string[] = [];
    let addedCount = 0;
    for (const place of stashed) {
      const result = addChatPlaceToItinerary(current, place, {
        locale,
        groupSize: formData?.groupSize,
      });
      if (result.ok) {
        current = result.itinerary;
        addedNames.push(place.name);
        addedCount++;
        trackPlannerEvent("chat_place_added", {
          provenance: place.provenance,
          category: place.category,
          day: result.day,
          stashed: 1,
          locale,
        });
      }
    }
    if (addedCount === 0) return;

    setItinerary(current);
    persistItineraryLocally(current, formData);
    markResultEngaged();
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    toast({
      title: t("chatStashTitle"),
      description: t("chatStashDesc", {
        names: addedNames.join(", "),
        count: addedCount,
      }),
    });
    // Samo-ohranjen efekt: readStashedChatPlaces POČISTI ključ, zato
    // ponovni zagoni (setItinerary → nov itinerer) niso nevarni
  }, [itinerary]);

  // === 1.43 (GEO → NAČRT): odstranitev postanka, dodanega iz klepeta —
  // EN KLIK na kartici postanka. Simetrija z 1.42: dodajanje "+" je bil en
  // klik, odstranjevanje pa je doslej zahtevalo AI "Spremeni načrt". Velja
  // SAMO za klepet postanke (category === "chat", eksplicitna uporabnikova
  // intencija) — AI generirani postanki ostanejo pod refinerjem. ===
  function removeChatStop(loc: LocationVisit) {
    if (!itinerary) return;
    const result = removeChatPlaceFromItinerary(itinerary, loc.destination_id);
    if (!result.ok) return;
    setItinerary(result.itinerary);
    persistItineraryLocally(result.itinerary, formData);
    markResultEngaged();
    // Strukturna sprememba — zastarel deljeni link se umakne (vzorec F16)
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("chat_place_removed", {
      // OSM sintetični ID-ji imajo predpono "osm-" — ostali so T1 destinacije
      provenance: loc.destination_id.startsWith("osm-") ? "osm" : "t1",
      day: result.day,
      locale,
    });
    toast({
      title: t("chatStopRemovedTitle"),
      description: result.name,
    });
  }

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

  // F15 (backlog #3): tempo potovanja (opcijsko) — toggle: klik na izbrano
  // ga počisti (nazaj na privzeti umerjen ritem, kot pri partyType)
  function togglePace(value: Pace) {
    fireStartedOnce();
    setFormData((prev) => ({
      ...prev,
      pace: prev.pace === value ? undefined : value,
    }));
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

  // F16 (backlog #4): optimalno zaporedje postankov dneva — 2-opt/izčrpna
  // preureditev, deterministično (0 AI). Pošteno: km so hevristična ocena
  // (ista formula kot geo-validacija brez OSRM), prikazano z "~".
  // Po preureditvi kvaliteta/geo-validacija/osrm-geometrija odpadejo (bile
  // so vezane na staro zaporedje) → kartice jih preračunajo na mestu
  // uporabe (hevristika, razkrito) — enaka pot kot stari obnovljeni načrti.
  function applyOptimalOrder(day: DayPlan) {
    if (!itinerary) return;
    const res = optimizeDayOrder(day.locations);
    if (!res) return;
    if (res.savedKm < 5) {
      // Dan je (skoraj) optimalen — sporočimo, ne spreminjamo ničesar
      toast({
        title: t("optimizeAlreadyTitle"),
        description: t("optimizeAlreadyDesc"),
      });
      return;
    }
    const nextDays = itinerary.days.map((d) =>
      d.day === day.day
        ? {
            ...d,
            locations: res.locations,
            // OSRM geometrija je vezana na STARO zaporedje — pošteno jo
            // umaknemo (zemljevid izriše premice, kot pri starih načrtih)
            routeGeometry: undefined,
          }
        : d
    );
    const next: Itinerary = {
      ...itinerary,
      days: nextDays,
      // P0.2/FW4.1: strukturne metrike so bile izračunane (na strežniku,
      // z OSRM nogami) za STARO zaporedje — umaknemo jih, da se kartice
      // preračunajo na mestu uporabe za NOVO (metoda: hevristika, razkrito)
      quality: undefined,
      geoValidation: undefined,
    };
    setItinerary(next);
    persistItineraryLocally(next, formData);
    markResultEngaged();
    // P0.2 (recenzija): strukturna sprememba — zastareli deljeni link se
    // umakne (enak vzorec kot pri refine / dodajanju dogodka)
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("day_optimized", {
      day: day.day,
      stops: day.locations.length,
      saved_km: res.savedKm,
      before_km: res.beforeKm,
      after_km: res.afterKm,
      locale,
    });
    toast({
      title: t("optimizeToastTitle"),
      description: t("optimizeToastDesc", { km: res.savedKm }),
    });
  }

  // Backlog #5 (1.24.0): "Postanki na poti" — vstavitev predlaganega
  // postanka NA DANO MESTO (za postankom, ob katerem je bil predlog) in na
  // DAN DAN. DETERMINISTIČNO na clientu (0 AI, 0 omrežja) po VZORCU F16:
  // strukturne metrike (quality/geoValidation/routeGeometry) so vezane na
  // staro sestavo → jih pošteno umaknemo in pustimo preračunati na mestu
  // uporabe (hevristika, razkrito). Nov obisk nosi ceno iz dataseta
  // (costPerPerson × skupina) in tagline; časovni okvirji dneva se
  // prerazporedijo čez 9:00–19:00 (enakomerno, korak 30 min).
  function applySuggestedStop(
    day: DayPlan,
    afterId: string,
    suggestion: StopSuggestion
  ) {
    if (!itinerary) return;
    const dest = destinationById(suggestion.id);
    // Neznan ID (izven dataseta) — pošteno ne ugibamo (P0.3 vzorec)
    if (!dest) {
      toast({
        title: t("legSugError"),
        description: suggestion.name,
      });
      return;
    }
    const dayIdx = itinerary.days.findIndex((d) => d.day === day.day);
    if (dayIdx === -1) return;

    const groupSize = formData?.groupSize || 2;
    const isEn = locale === "en";
    const tagline = isEn
      ? DESTINATIONS_EN[dest.id]?.tagline ?? dest.tagline
      : dest.tagline;
    const visit: LocationVisit = {
      destination_id: dest.id,
      destination_name: dest.name,
      time_slot: "",
      duration: 0,
      estimated_cost: dest.costPerPerson * groupSize,
      notes: tagline,
    };

    const locations = [...itinerary.days[dayIdx].locations];
    const insertAt = Math.min(
      locations.length,
      Math.max(
        0,
        locations.findIndex((l) => l.destination_id === afterId) + 1
      )
    );
    locations.splice(insertAt, 0, visit);
    const respread = spreadDaySlots(locations);

    const nextDays = itinerary.days.map((d, i) =>
      i === dayIdx
        ? {
            ...d,
            locations: respread,
            // OSRM geometrija/noge so vezane na STARO sestavo — pošteno
            // umaknjeno (zemljevid/povezovalniki padejo na oceno, kot pri
            // starih načrtih)
            routeGeometry: undefined,
          }
        : d
    );
    const next: Itinerary = {
      ...itinerary,
      days: nextDays,
      // Ista poštenost kot F16: strežniško izračunane metrike so zastarele
      quality: undefined,
      geoValidation: undefined,
      // nove pare povezovalnikov nimajo OSRM nog → odstranimo indeks,
      // da vsak povezovalnik pade na odkrito hevristiko (ne mešamo virov)
      legs: undefined,
    };
    setItinerary(next);
    persistItineraryLocally(next, formData);
    markResultEngaged();
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("leg_suggestion_added", {
      day: day.day,
      destination_id: dest.id,
      detour_km: suggestion.detourKm,
      detour_min: suggestion.detourMin,
      source: suggestion.source,
      locale,
    });
    toast({
      title: t("legSugAddedTitle"),
      description: t("legSugAddedDesc", {
        name: dest.name,
        day: day.day,
      }),
    });
  }

  // UI sprint (točka B smeri): naravnojezikovni vnos kot PRIMARNA pot —
  // ISTA čista funkcija kot hero/kviz (parseQueryToPlannerInput) in isto
  // generiranje kot obrazec. Brez nove logike, brez drugega AI sistema.
  function handleNlSubmit() {
    const query = nlQuery.trim();
    if (!query || loading) return;
    const smartInput = parseQueryToPlannerInput(query);
    setFormData(smartInput);
    void generateItinerary(smartInput);
  }

  async function generateItinerary(input: PlannerInput) {
    fireStartedOnce();
    trackPlannerEvent("planner_submitted", {
      days: input.days,
      interests: input.interests.length,
      season: input.season,
      partyType: input.partyType ?? "none",
      pace: input.pace ?? "none",
      has_start_date: Boolean(input.startDate),
      // TASK 80: prvo generiranje ali regeneracija (obstoječi načrt v
      // spominu) — ločujemo vrtince prvega skoka in ponovnih poskusov
      regeneration: Boolean(itinerary),
      locale,
    });
    setLoading(true);
    setError(null);

    // TASK 77: preklic + odmor predolge zahteve. Prej je obešena zahtevka
    // (polh strežnik / izguba omrežja) uporabnika ujela v skeletu — edini
    // izhod je bila osvežitev strani, ki bi IZGUBILA obrazec. Sedaj:
    //   - Prekliči gumb → abort(CANCEL) → tiho vrnemov prejšnje stanje
    //   - 90 s brez odgovora → abort(TIMEOUT) → jasna ločena napaka
    // Števec (1 Hz) živi v state — ga bere statusna vrstica skeleta.
    const controller = new AbortController();
    // Varovalka: morebitna (teoretična) starejša zahtevka v letu se prekliče
    // TIHO (razlog CANCEL — ne želimo lažne napake v njeni catch veji).
    generationAbortRef.current?.abort(ABORT_REASON_CANCEL);
    generationAbortRef.current = controller;
    const generationStartedAt = Date.now();
    setGenerationElapsed(0);
    const tickId = setInterval(() => {
      setGenerationElapsed(
        Math.floor((Date.now() - generationStartedAt) / 1000)
      );
    }, 1000);
    const timeoutId = setTimeout(() => {
      controller.abort(ABORT_REASON_TIMEOUT);
    }, GENERATION_TIMEOUT_SECONDS * 1000);
    try {
      // F1 (Supply Map): izbrani produkti z zemljevida ponudbe — AI prejme
      // STRUKTURIRAN objekt (FIXED/PREFERRED/SUGGESTED); strežnik sanitizira.
      const selectedProducts = useAppStore.getState().selectedProducts;
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          ...input,
          language: locale === "en" ? "en" : "sl",
          ...(selectedProducts.length > 0
            ? { selectedProviderProducts: selectedProducts }
            : {}),
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
      // UI sprint (točka B): obrazec se po uspešni generaciji zloži v
      // povzetek parametrov — delovna površina načrta prevzame zaslon
      setFormExpanded(false);

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

      // D2: nov načrt → stari zvok ni več veljaven (ključ se spremeni;
      // objektni URL počisti efekt ob spremembi audioUrl)
      setAudioUrl(null);
      setAudioUrlKey(null);
      setAudioError(null);

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

      // UX-CMP #2 (Mindtrip primerjava): uspešni toast ob generiranju je
      // ODSTRANJEN — pojavil se je TIK ob izrisu delovne površine in je
      // (fiksno, spodaj desno) prekrival sveže generirane dneve kartic.
      // Povratna informacija je že v samem rezultatu: načrt zamenja skelet,
      // statusni trak se animira, obnovitveni chip pa ostaja za deljene
      // načrte (kjer je obveščanje res potrebno). Napake še vedno javljajo
      // toasti (variant="destructive") — te uporabnik MORA videti.
    } catch (err) {
      // TASK 77: uporabnikov preklic je NAMERNA izbira — brez napake, brez
      // toasta; stanje (prazen uvod / obstoječi načrt) se vrne samo od sebe,
      // ker loading pade v finally.
      if (isCancelledAbort(controller.signal)) {
        trackPlannerEvent("planner_cancelled", {
          elapsed: Math.floor((Date.now() - generationStartedAt) / 1000),
        });
        return;
      }
      if (controller.signal.aborted) {
        // Odmor (90 s) — ločena, jasnejša napaka od generične omrežne;
        // uporabnik ve, da je bila zahtevka prekinjena na naši strani.
        trackPlannerEvent("planner_error", {
          stage: "timeout",
          elapsed: Math.floor((Date.now() - generationStartedAt) / 1000),
        });
        setError(t("errorTimeout"));
        return;
      }
      trackPlannerEvent("planner_error", { stage: "network_or_parse" });
      const msg =
        err instanceof Error ? err.message : t("errorGeneratingFallback");
      setError(msg);
    } finally {
      clearTimeout(timeoutId);
      clearInterval(tickId);
      if (generationAbortRef.current === controller) {
        generationAbortRef.current = null;
      }
      setLoading(false);
      setGenerationElapsed(0);
    }
  }

  // TASK 77: en klik za tiho izhod iz generiranja (gumb v statusni vrstici
  // skeleta). NE dotika loading/error — to sta rezervirano za finally blok
  // generateItinerary (enotna pot čiščenja, tudi ob timeoutu).
  function handleCancelGeneration() {
    generationAbortRef.current?.abort(ABORT_REASON_CANCEL);
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
        throw new Error(t("emailSendFailed")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
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
        throw new Error(t("ingestError")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
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
        throw new Error(t("ingestImageError")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
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

  // === F14 "Uvozi shranjene točke" — File → besedilo ( validacija vrste/
  // velikosti na clientu; strežnik vseeno ponovno validira dolžino).
  // Sprejmemo .json ( Takeout), .kml/.xml in .txt — vse se bere kot tekst.
  function acceptIngestPinsFile(file: File | null): boolean {
    if (!file) return false;
    const name = file.name || "";
    const okExt = /\.(json|kml|xml|txt)$/i.test(name);
    if (!okExt) {
      setIngestError(
        "Nepodprta datoteka. Sprejmem .json (Google izvoz), .kml ali .txt."
      );
      return false;
    }
    if (file.size > 2 * 1024 * 1024) {
      setIngestError("Datoteka je prevelika (največ ~2 MB).");
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setIngestPins(reader.result);
        setIngestPinsName(file.name || "datoteka");
        setIngestError(null);
        setIngestMatches(null);
        setIngestPinsMeta(null);
      }
    };
    reader.onerror = () => setIngestError(t("ingestPinsError"));
    reader.readAsText(file);
    return true;
  }

  // === F14: prepoznaj destinacije iz shranjenih točk — POST
  // /api/itinerary/ingest-pins. 0 AI žetonov: ujemanje po imenu ( isti vzorci
  // kot pri povezavah) ali po koordinatah ( najbližja destinacija ≤ 25 km).
  // Ne prepoznane točke so javno prikazane ( pinsUnmatched) — poštenost.
  async function handleIngestPinsSubmit() {
    const trimmed = ingestPins.trim();
    if (!trimmed || ingestLoading) return;

    setIngestLoading(true);
    setIngestError(null);
    setIngestMatches(null);
    setIngestPinsMeta(null);
    setIngestIsVlm(false);
    trackPlannerEvent("ingest_pins_attempted", { locale });
    try {
      const res = await fetch("/api/itinerary/ingest-pins", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pinsText: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            format?: "geojson" | "kml" | "text";
            pinsTotal?: number;
            pinsUnmatched?: number;
            matches?: {
              id: string;
              name: string;
              slug: string;
              pinCount: number;
            }[];
            suggestion?: {
              interests?: string[];
              days?: number;
              preferredDestinations?: string[];
            };
            error?: string;
          }
        | null;

      if (!res.ok || !data?.matches?.length) {
        throw new Error(t("ingestPinsError")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
      }

      // Enak prikaz kot pri povezavah ( zvezdica ×N = št. točk) + meta vrstica
      setIngestMatches(
        data.matches.map((m) => ({
          id: m.id,
          name: m.name,
          slug: m.slug,
          count: m.pinCount,
        }))
      );
      setIngestSourceTitle(
        ingestPinsName ? t("ingestPinsSourceFile", { name: ingestPinsName }) : t("ingestPinsSourcePaste")
      );
      setIngestPinsMeta({
        format: data.format ?? "text",
        total: data.pinsTotal ?? 0,
        unmatched: data.pinsUnmatched ?? 0,
      });
      trackPlannerEvent("ingest_pins_success", {
        matches: data.matches.length,
        pins: data.pinsTotal ?? 0,
        format: data.format ?? "text",
        locale,
      });

      // Izpolni obrazec iz predloga ( enak vzorec kot pri povezavah/slikah)
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
      setIngestPins("");
      setIngestPinsName(null);
      toast({
        title: t("ingestPinsSuccessToast"),
        description: t("ingestPinsSuccessToastDesc", {
          names: data.matches
            .slice(0, 3)
            .map((m) => m.name)
            .join(", "),
        }),
      });
      // Samodejna generacija — od točk do načrta v enem koraku
      await generateItinerary(nextInput);
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : t("ingestPinsError")
      );
    } finally {
      setIngestLoading(false);
    }
  }

  // === D3 "Začni s PDF-jem" — File → data URL ( validacija vrste/velikosti
  // na clientu; strežnik vseeno ponovno validira magijo %PDF-). Ista
  // ovratija kot pri slikah: napaka se izpiše prek ingestError. ===
  function acceptIngestPdf(file: File | null): boolean {
    if (!file) return false;
    const isPdf =
      file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
    if (!isPdf) {
      setIngestError(
        "Nepodprta datoteka. Sprejmem samo PDF ( pobršurani vodik, izvožen itinerar …)."
      );
      return false;
    }
    if (file.size > 6 * 1024 * 1024) {
      setIngestError("PDF je prevelik (največ ~6 MB).");
      return false;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setIngestPdf(reader.result);
        setIngestPdfName(file.name || "PDF");
        setIngestError(null);
        setIngestMatches(null);
      }
    };
    reader.onerror = () => setIngestError(t("ingestPdfError"));
    reader.readAsDataURL(file);
    return true;
  }

  // === D3: prepoznaj destinacije v PDF-ju — POST /api/itinerary/ingest-pdf.
  // Strežnik: unpdf izvleče besedilno plast ( 0 AI), nato SESTAVNI
  // deterministični matcher poveže z našimi destinacijami (ista funkcija
  // kot pri povezavah/slikah/točkah). Skeniran PDF → poštena napaka z
  // nasvetom (zavihek Slika). ===
  async function handleIngestPdfSubmit() {
    if (!ingestPdf || ingestLoading) return;

    setIngestLoading(true);
    setIngestError(null);
    setIngestMatches(null);
    setIngestIsVlm(false);
    setIngestVia(null);
    trackPlannerEvent("ingest_pdf_attempted", { locale });
    try {
      const res = await fetch("/api/itinerary/ingest-pdf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pdf: ingestPdf }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            matches?: IngestMatch[];
            suggestion?: {
              interests?: string[];
              days?: number;
              preferredDestinations?: string[];
            };
            method?: "pdf";
            pages?: number;
            pdfChars?: number;
            error?: string;
          }
        | null;

      if (!res.ok || !data?.matches?.length) {
        throw new Error(t("ingestPdfError")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
      }

      setIngestMatches(data.matches);
      setIngestSourceTitle(
        ingestPdfName
          ? t("ingestPdfSourceFile", {
              name: ingestPdfName,
              pages: data.pages ?? 0,
            })
          : t("ingestPdfSource")
      );
      trackPlannerEvent("ingest_pdf_success", {
        matches: data.matches.length,
        pages: data.pages ?? 0,
        days: data.suggestion?.days ?? 3,
        locale,
      });

      // Izpolni obrazec iz predloga ( enak vzorec kot pri ostalih virih)
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
      setIngestPdf(null);
      setIngestPdfName("");
      toast({
        title: t("ingestPdfSuccessToast"),
        description: t("ingestPdfSuccessToastDesc", {
          names: data.matches
            .slice(0, 3)
            .map((m) => m.name)
            .join(", "),
        }),
      });
      // Samodejna generacija — od PDF-ja do načrta v enem koraku
      await generateItinerary(nextInput);
    } catch (err) {
      setIngestError(
        err instanceof Error ? err.message : t("ingestPdfError")
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
      a.download = icsFileName(itinerary, locale === "en" ? "en" : "sl");
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

  // === D2 "Poslušaj svoj načrt": POST /api/itinerary/tts → WAV blob →
  // predvajalnik pod akcijsko vrstico. Skript pride IZ CLIENTA (deterministično
  // sestavljen — 0 AI na poti do zvoka); TTS ga samo izgovori. Stari zvok se
  // razveljavi, ko se načrt spremeni (audioKey). ===
  async function handleListenClick() {
    if (!audioScript || audioLoading) return;
    // že imamo svež zvok → preklopi predvajanje (istogumbna UX)
    if (audioUrl && audioUrlKey === audioKey && audioRef.current) {
      const el = audioRef.current;
      if (el.paused) void el.play().catch(() => undefined);
      else el.pause();
      return;
    }

    setAudioLoading(true);
    setAudioError(null);
    trackPlannerEvent("itinerary_audio_requested", {
      locale,
      chars: audioScript.chars,
      days: itinerary?.days.length ?? 0,
    });
    try {
      const res = await fetch("/api/itinerary/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: audioScript.text,
          locale: locale === "en" ? "en" : "sl",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(t("listenError")); // I18N-FIX (1.33.0): strežniški SL detail v konzolo, klient vidi t()
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error(t("listenError"));
      // počisti starega (sprememba načrta → nov objekt URL)
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      setAudioUrlKey(audioKey);
      trackPlannerEvent("itinerary_audio_ready", {
        locale,
        bytes: blob.size,
        chunks: res.headers.get("X-Audio-Chunks") ?? "",
      });
      // samodejno predvajanje ob prvi pripravi (naslednji render postavi src)
      requestAnimationFrame(() => {
        audioRef.current?.play().catch(() => undefined);
      });
    } catch (err) {
      trackPlannerEvent("itinerary_audio_failed", { locale });
      setAudioError(
        err instanceof Error ? err.message : t("listenError")
      );
    } finally {
      setAudioLoading(false);
    }
  }

  // Čiščenje objektnih URL-jev (pomnilnik). NAMENOMO NE čistimo ob vsakem
  // remontu komponente ( React effect cleanup) — v razvoju Fast Refresh
  // remonta isto komponento in bi preklical PRAV GENERIRAN zvok ( opaženo
  // v E2E: media error 4 po rebuildu). Čistimo OB MENJAVI ( handler zgoraj
  // prekliče starega pred novim) in ob pravem koncu strani ( pagehide).
  // Enkratna puščica ob client-side navigaciji z načrtovalca je neškodljiva
  // ( brskalnik jo sprosti ob uničenju dokumenta).
  useEffect(() => {
    const onHide = () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
    };
  }, [audioUrl]);

  // UI sprint: stanja nalaganja/napake/prazno kot spremenljivke — uporabljena
  // na obeh mestih (uvodni prostor brez načrta + urejanje z obstoječim načrtom)
  //
  // TASK 77: skelet ni več NEM. Statusna vrstica (role="status" +
  // aria-live="polite") sporoča bralnikom zaslonov DEJANSKI pretečeni čas
  // (1 Hz) in fazo po značilnem vrstnem redu strežnika (supply → compose →
  // verify — glej src/lib/generation-stages.ts za iskrenostne meje) + gumb
  // Prekliči (AbortController). Same skelete so čisto dekorativne
  // (aria-hidden) — obvestilo nosi vrstica.
  const generationStageKey = generationStageFor(generationElapsed).key;
  // TASK 80: statusna vrstica generiranja IZVLEČENA iz skeleta — prvič (brez
  // načrta) stoji nad skeleti, ob REGENERACIJI pa nad ZAMEGLENIM obstoječim
  // načrtom (ta ne izgine v skeletih — uporabnik obdrži konteksto).
  const generationStatusBar = (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3 shadow-sm">
      <div className="flex min-w-0 items-center gap-3">
        <Loader2
          className="size-5 shrink-0 animate-spin text-primary"
          aria-hidden
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {t(`generatingStage.${generationStageKey}`)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("generatingElapsed", {
              time: formatGenerationElapsed(generationElapsed),
            })}{" "}
            · {t("generatingHint")}
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleCancelGeneration}
        className="shrink-0"
      >
        <X className="size-3.5" aria-hidden />
        {tCommon("cancel")}
      </Button>
    </div>
  );

  const loadingSkeleton = (
    <div className="space-y-4" role="status" aria-live="polite">
      {generationStatusBar}
      <div aria-hidden="true">
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
    </div>
  );

  const errorAlert = (
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
  );

  const emptyCard = (
    <Card className="h-full border-dashed">
      <CardContent className="flex min-h-[400px] flex-col gap-5 py-10">
        <div className="space-y-1 text-center">
          <p className="text-lg font-semibold">{t("emptyTitle")}</p>
          <p className="text-sm text-muted-foreground">{t("emptyHint")}</p>
        </div>

        {/* UX-CMP #1: statičen demo predogled dneva (dekorativen, ne
            interaktiven — klikabilen je samo CTA spodaj; slike/cene so iz
            uredniškega dataseta, nič izmišljenega) */}
        <div
          className="relative rounded-xl border border-border/70 bg-card p-4 shadow-sm"
          aria-hidden="true"
        >
          <span className="absolute -top-2.5 left-3 rounded-full border border-border bg-background px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            {t("emptyDemoChip")}
          </span>
          <div className="mb-3 flex items-center gap-2.5">
            <span className="flex size-9 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              1
            </span>
            <span className="text-sm font-semibold">
              {t("emptyDemoDayLabel")}
            </span>
          </div>
          <div>
            {DEMO_PREVIEW_STOPS.map((stop, i) => {
              const dest = destinationById(stop.id);
              const name =
                locale === "en"
                  ? DEMO_PREVIEW_NAMES_EN[stop.id]
                  : dest?.name ?? stop.id;
              return (
                <div key={stop.id}>
                  {i > 0 && (
                    <div className="flex items-center gap-1.5 py-1 pl-6 text-[11px] text-muted-foreground">
                      <Waypoints className="size-3 shrink-0" aria-hidden />
                      {DEMO_PREVIEW_LEGS[i - 1]}
                    </div>
                  )}
                  <div className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/60 p-2">
                    <div className="relative size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                      {dest?.image && (
                        <Image
                          src={dest.image}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="text-xs text-muted-foreground">
                        {stop.time} · {stop.hours}h
                      </p>
                    </div>
                    {typeof dest?.costPerPerson === "number" && (
                      <span className="shrink-0 text-xs font-semibold text-muted-foreground">
                        €{dest.costPerPerson}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          {t("emptyDemoCaption")}
        </p>

        <Button
          className="mt-auto w-full"
          size="lg"
          onClick={() => {
            // Isti vstop kot demo scenariji / hero: NL poizvedba →
            // parseQueryToPlannerInput → generateItinerary (1 dan, narava).
            const input = parseQueryToPlannerInput(t("emptyDemoQuery"));
            setFormData(input);
            generateItinerary(input);
          }}
        >
          <Sparkles className="size-4" aria-hidden />
          {t("emptyDemoCta")}
        </Button>
      </CardContent>
    </Card>
  );

  return (
    <section
      id="načrtuj"
      className="scroll-mt-24 bg-gradient-to-b from-muted/40 to-background py-16 sm:py-20 lg:py-24"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        {/* UI sprint (smer naborov #1+#2): obrazec (NL-first) je viden PRED
            generiranjem oz. v načinu urejanja; po uspešni generaciji se zloži
            v PlannerSummaryBar, delovna površina načrta pa prevzame cel
            zaslon (Trip header → Zemljevid+Pogovor → Stanje → Dnevi → Več). */}
        {(!itinerary || formExpanded) && (
          <div
            className={cn(
              // grid-cols-1 = minmax(0,1fr) — eksplicitna sled prepreči
              // intrinsično (min-content) širjenje auto sledi na mobilnem
              "grid grid-cols-1 gap-6",
              formExpanded
                ? "mx-auto w-full max-w-3xl"
                : "lg:grid-cols-2 lg:gap-8"
            )}
          >
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
                {/* UI sprint (točka B smeri): NARAVNI JEZIK kot primarni vnos
                    (»Start chatting« model, potrjen z naborom #2) — ista čista
                    funkcija kot hero (parseQueryToPlannerInput); obrazec spodaj
                    ostaja za podrobnejše nastavitve. NI nov klebet — le vnos. */}
                <div className="space-y-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <label
                    htmlFor="planner-nl"
                    className="flex items-center gap-1.5 text-xs font-medium text-primary"
                  >
                    <Sparkles className="size-3.5 shrink-0" aria-hidden />
                    {t("nlLabel")}
                  </label>
                  <div className="flex gap-2">
                    <Input
                      id="planner-nl"
                      type="text"
                      autoComplete="off"
                      placeholder={t("nlPlaceholder")}
                      value={nlQuery}
                      onChange={(e) => {
                        fireStartedOnce();
                        setNlQuery(e.target.value);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleNlSubmit();
                        }
                      }}
                      disabled={loading}
                      aria-describedby="planner-nl-hint"
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      disabled={loading || !nlQuery.trim()}
                      onClick={handleNlSubmit}
                      className="gap-1.5"
                      aria-label={t("nlAriaLabel")}
                    >
                      {loading ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden />
                      ) : (
                        <Sparkles className="size-4" aria-hidden />
                      )}
                      <span className="hidden sm:inline">
                        {t("nlSubmit")}
                      </span>
                    </Button>
                  </div>
                  <p
                    id="planner-nl-hint"
                    className="text-[11px] leading-relaxed text-muted-foreground"
                  >
                    {t("nlHint")}
                  </p>
                </div>

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
                          {
                            id: "pdf",
                            label: t("ingestTabPdf"),
                            icon: FileText,
                          },
                          {
                            id: "pins",
                            label: t("ingestTabPins"),
                            icon: MapPinned,
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
                    ) : ingestMode === "pdf" ? (
                      <>
                        {/* D3 (nabor #2, Mindtrip "Start Anywhere" s PDF):
                            pobršurani vodik / izvožen itinerar — besedilna
                            plast ( 0 AI) → isto deterministično ujemanje. */}
                        <label
                          htmlFor="ingest-pdf-input"
                          className="flex items-center gap-1.5 text-xs font-medium text-primary"
                        >
                          <FileText className="size-3.5 shrink-0" aria-hidden />
                          {t("ingestPdfLabel")}
                        </label>
                        <input
                          ref={ingestPdfInputRef}
                          id="ingest-pdf-input"
                          type="file"
                          accept="application/pdf,.pdf"
                          className="sr-only"
                          tabIndex={-1}
                          onChange={(e) => {
                            fireStartedOnce();
                            acceptIngestPdf(e.target.files?.[0] ?? null);
                            // Ponastavi, da lahko ista datoteka znova izbere
                            e.target.value = "";
                          }}
                        />
                        {ingestPdf ? (
                          <div className="flex items-center gap-3 rounded-md border border-primary/25 bg-background p-2">
                            <div className="flex size-14 shrink-0 items-center justify-center rounded bg-primary/10">
                              <FileText className="size-6 text-primary" aria-hidden />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-xs font-medium">
                                {ingestPdfName}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {t("ingestPdfMethod")}
                              </p>
                            </div>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={ingestLoading}
                              onClick={() => void handleIngestPdfSubmit()}
                              className="gap-1.5"
                              aria-label={t("ingestPdfButtonAria")}
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
                                {t("ingestPdfButton")}
                              </span>
                            </Button>
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              disabled={ingestLoading}
                              onClick={() => {
                                setIngestPdf(null);
                                setIngestPdfName("");
                                setIngestMatches(null);
                              }}
                              aria-label={t("ingestPdfRemove")}
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
                              ingestPdfInputRef.current?.click()
                            }
                            onKeyDown={(e) => {
                              if (
                                e.key === "Enter" ||
                                e.key === " "
                              ) {
                                e.preventDefault();
                                ingestPdfInputRef.current?.click();
                              }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIngestPdfDragging(true);
                            }}
                            onDragLeave={() => setIngestPdfDragging(false)}
                            onDrop={(e) => {
                              e.preventDefault();
                              setIngestPdfDragging(false);
                              fireStartedOnce();
                              acceptIngestPdf(
                                e.dataTransfer.files?.[0] ?? null
                              );
                            }}
                            aria-describedby="ingest-pdf-hint"
                            className={cn(
                              "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed p-4 text-center transition-colors",
                              ingestPdfDragging
                                ? "border-primary bg-primary/10"
                                : "border-primary/30 hover:border-primary/60 hover:bg-primary/5"
                            )}
                          >
                            <FileText
                              className="size-5 text-primary"
                              aria-hidden
                            />
                            <span className="text-xs font-medium text-primary">
                              {t("ingestPdfBrowse")}
                            </span>
                            <span className="text-[11px] text-muted-foreground">
                              {t("ingestPdfDrop")}
                            </span>
                          </div>
                        )}
                        <p
                          id="ingest-pdf-hint"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {t("ingestPdfHint")}{" "}
                          <span className="whitespace-nowrap">
                            {t("ingestPdfScanned")}
                          </span>
                        </p>
                      </>
                    ) : ingestMode === "pins" ? (
                      <>
                        {/* F14: shranjene točke Google Zemljevidov ( Mindtrip
                            "Google Pins") — Takeout JSON / KML / besedilni
                            seznam; 0 AI žetonov, ujemanje po imenu/koordinatah */}
                        <label
                          htmlFor="ingest-pins"
                          className="flex items-center gap-1.5 text-xs font-medium text-primary"
                        >
                          <MapPinned className="size-3.5 shrink-0" aria-hidden />
                          {t("ingestPinsLabel")}
                        </label>
                        <input
                          ref={ingestPinsInputRef}
                          id="ingest-pins-file"
                          type="file"
                          accept=".json,.kml,.xml,.txt,application/json,text/plain"
                          className="sr-only"
                          tabIndex={-1}
                          onChange={(e) => {
                            fireStartedOnce();
                            acceptIngestPinsFile(e.target.files?.[0] ?? null);
                            // Ponastavi, da lahko ista datoteka znova izbere
                            e.target.value = "";
                          }}
                        />
                        <Textarea
                          id="ingest-pins"
                          value={ingestPins}
                          onChange={(e) => {
                            fireStartedOnce();
                            setIngestPins(e.target.value);
                            setIngestPinsName(null);
                          }}
                          placeholder={t("ingestPinsPlaceholder")}
                          disabled={ingestLoading}
                          rows={4}
                          className="min-h-[80px] resize-y text-xs"
                          aria-describedby="ingest-pins-hint"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={ingestLoading}
                            onClick={() =>
                              ingestPinsInputRef.current?.click()
                            }
                            className="gap-1.5"
                            aria-label={t("ingestPinsFileAria")}
                          >
                            <FileUp className="size-4" aria-hidden />
                            <span className="hidden sm:inline">
                              {t("ingestPinsFile")}
                            </span>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={ingestLoading || !ingestPins.trim()}
                            onClick={() => void handleIngestPinsSubmit()}
                            className="gap-1.5"
                            aria-label={t("ingestPinsButtonAria")}
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
                              {t("ingestPinsButton")}
                            </span>
                          </Button>
                          {ingestPinsName && (
                            <span className="inline-flex min-w-0 items-center gap-1 truncate rounded-full border border-primary/30 bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
                              <FileUp
                                className="size-3 shrink-0"
                                aria-hidden
                              />
                              <span className="truncate">
                                {ingestPinsName}
                              </span>
                            </span>
                          )}
                        </div>
                        <p
                          id="ingest-pins-hint"
                          className="text-[11px] leading-relaxed text-muted-foreground"
                        >
                          {t("ingestPinsHint")}
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
                      {/* F14: poštena meta vrstica — koliko točk je bilo
                          prepoznanih, koliko izven našega nabora ( nič
                          skrivanja) */}
                      {ingestPinsMeta && (
                        <p className="text-[11px] leading-relaxed text-muted-foreground">
                          {t("ingestPinsMeta", {
                            total: ingestPinsMeta.total,
                            unmatched: ingestPinsMeta.unmatched,
                            format: t(
                              ingestPinsMeta.format === "geojson"
                                ? "ingestPinsFormatGeojson"
                                : ingestPinsMeta.format === "kml"
                                  ? "ingestPinsFormatKml"
                                  : "ingestPinsFormatText"
                            ),
                          })}
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

                {/* UI sprint (točka B): OSNOVNE ŠTEVILKE poti — najmanjši
                    napon za ročno pot (dnevi, proračun, skupina); sezona,
                    datum, tip skupine, tempo in interesi so zloženi v
                    "Podrobne nastavitve" — vsi kontrolniki ostanejo. */}
                <div className="grid gap-4 sm:grid-cols-3">
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
                </div>

                {/* UI sprint (točka B smeri): NAPREDNI parametri — zloženi,
                    a vsi prisotni (en klik). NL vrstica zgoraj pokriva
                    glavno pot; obrazec ne sme biti vprašalnik. */}
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen((v) => !v)}
                    aria-expanded={advancedOpen}
                    className="flex w-full items-center justify-between gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {t("advancedToggle")}
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 transition-transform",
                        advancedOpen && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                  {advancedOpen && (
                    <div className="space-y-4">
                      <div className="grid gap-4 sm:grid-cols-2">
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

                  {/* F15 (backlog #3): tempo potovanja — gostota načrta.
                      Odgovor na pritožbo s forumov: plannerji ne vprašajo,
                      če bi uporabnik raje manj mest počasneje. Opcijsko:
                      brez izbire = umerjen ritem (dosedanja logika). */}
                  <div className="space-y-2">
                    <Label>
                      <Gauge className="size-4" aria-hidden />
                      {t("paceLabel")}
                      <span className="font-normal text-muted-foreground">
                        {t("paceOptional")}
                      </span>
                    </Label>
                    <div
                      role="group"
                      aria-label={t("paceLabel")}
                      className="flex flex-wrap gap-1.5"
                    >
                      {PACE_OPTIONS.map((option) => {
                        const selected = formData.pace === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => togglePace(option.value)}
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
                    <p className="text-xs text-muted-foreground">
                      {t("paceHint")}
                    </p>
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
                    </div>
                  )}
                </div>
              </CardContent>
              <CardFooter className="flex-col items-stretch gap-2">
                {/* F1 (Supply Map): izbrani produkti z zemljevida — AI jih
                    prejme strukturirano; tu so vidni kot odstranljivi čipi.
                    AUDIT 42: izris šele po mountu (hidracija) + krogotek
                    FIXED/PREFERRED/SUGGESTED (koncept je zdaj DEJANSKO
                    uporabniku dostopen, ne le dokumentiran). */}
                {mounted && selectedProducts.length > 0 ? (
                  <div className="rounded-lg border border-border bg-muted/40 p-2.5">
                    <p className="text-[11px] font-semibold text-foreground">
                      {t("supplySelectedTitle", { count: selectedProducts.length })}
                    </p>
                    <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
                      {t("supplySelectedHint")}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {selectedProducts.map((p) => {
                        const key = `${p.provider}:${p.providerProductId}`;
                        const nextState =
                          p.selectionState === "fixed"
                            ? "preferred"
                            : p.selectionState === "preferred"
                              ? "suggested"
                              : "fixed";
                        const cycleSelection = () => {
                          const next: SelectedProviderProduct[] = selectedProducts.map((x) =>
                            x.provider === p.provider &&
                            x.providerProductId === p.providerProductId
                              ? { ...x, selectionState: nextState }
                              : x
                          );
                          setSelectedProducts(next);
                          persistSelection(next);
                        };
                        return (
                          <span
                            key={key}
                            className="inline-flex max-w-full items-center gap-1 rounded-full border border-primary/30 bg-primary/5 py-0.5 pl-2 pr-1 text-[11px] font-medium text-foreground"
                            title={`${p.title} · ${p.source}`}
                          >
                            <span className="truncate">{p.title}</span>
                            <button
                              type="button"
                              onClick={cycleSelection}
                              aria-label={`${t("supplySelectedStateAria", { name: p.title })}: ${p.selectionState}`}
                              title={t("supplySelectedStateTitle")}
                              className="shrink-0 rounded-full bg-primary/10 px-1 text-[9px] uppercase text-primary transition-colors hover:bg-primary/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              {p.selectionState}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSelectedProduct(p.provider, p.providerProductId)}
                              aria-label={t("supplySelectedRemoveAria", { name: p.title })}
                              className="shrink-0 rounded-full p-0.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <X className="size-3" aria-hidden />
                            </button>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
                {/* UI sprint: izhod iz urejanja BREZ regeneriranja — načrt
                    ostane, obrazec se zloži nazaj v povzetek parametrov */}
                {formExpanded && itinerary && (
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    onClick={() => {
                      setFormExpanded(false);
                      // TASK 80: zapiranje obrazca = »obdrži stari načrt« —
                      // napaka (neuspešne) regeneracije se tiho umakne;
                      // načrt v delovni površini ostane viden. Prej je tu
                      // nastalo mrtvo stanje: napaka brez obrazca je načrt
                      // skrila BREZ možnosti prikaza.
                      setError(null);
                    }}
                    aria-label={t("summaryCloseAria")}
                  >
                    <X className="size-4" aria-hidden />
                    {t("summaryClose")}
                  </Button>
                )}
              </CardFooter>
            </form>
          </Card>

          {/* UI sprint: uvodni prostor (prazno / nalaganje / napaka) — viden
              samo, dokler načrta (še) ni; po generiranju ga zamenja delovna
              površina načrta čez celo širino. */}
          {!itinerary && (
            <div className="lg:min-h-[600px]">
              {loading ? loadingSkeleton : error ? errorAlert : emptyCard}
            </div>
          )}
          </div>
        )}

        {/* TASK 80: REGENERACIJA z obstoječim načrtom — statusna vrstica
            (faza + števec + Prekliči) stoji nad ZAMEGLENIM načrtom, ki NE
            izgine v skeletih (uporabnik obdrži konteksto; skeleti so lažna
            obetanja, ko že imaš načrt). Vidna neodvisno od formExpanded —
            gumb Prekliči (TASK 77) mora ostati dosegljiv tudi, če uporabnik
            med generiranjem zloži obrazec. */}
        {itinerary && loading && (
          <div
            className={cn("space-y-4", formExpanded && "mt-6")}
            role="status"
            aria-live="polite"
          >
            {generationStatusBar}
          </div>
        )}

        {/* TASK 80: napaka regeneracije se pokaže pod obrazcem, OBSTOJEČI
            načrt pa ostane VIDEN v delovni površini (prej se je skril —
            neuspešna regeneracija ti ne vzame starega načrta s pogleda). */}
        {formExpanded && itinerary && !loading && error && (
          <div className="mt-6 space-y-4">{errorAlert}</div>
        )}

        {/* === DELOVNA POVRŠINA (uspeh) — UI sprint: rezultat je GLAVNI
            prostor (Trip header → Zemljevid+Pogovor → Stanje → Dnevi → Več),
            ne desni stolpec ob obrazcu. Vsa logika nespremenjena.
            TASK 80: površina je izrisana KADARKOLI načrt obstaja — med
            regeneracijo je ZAMEGLJENA (opacity + pointer-events-none +
            inert: stara različica se ne more klikati/fokusirati), ob napaki
            regeneracije pa ostane polno uporabna (stari načrt je še vedno
            tvoj). === */}
        {itinerary && (
          <div
            className={cn(
              "space-y-5 transition-opacity duration-300",
              formExpanded && "mt-8",
              loading && "pointer-events-none select-none opacity-60",
            )}
            aria-busy={loading || undefined}
            inert={loading || undefined}
          >
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

                {/* UI sprint (točka B smeri): obrazec zložen v POVZETEK
                    parametrov — "Uredi" ga znova odpre nad delovno površino. */}
                <PlannerSummaryBar
                  formData={formData}
                  onEdit={() => {
                    setFormExpanded(true);
                    requestAnimationFrame(() => {
                      document
                        .getElementById("načrtuj")
                        ?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        });
                    });
                  }}
                />

                {/* UI sprint (točki A+F smeri, potrditev nabora #2): ZEMLJEVID
                    + POGOVOR v eni delovni površini ("activity cards, notes
                    and map in one workspace"). Pogovor je PRITRJEN poti:
                    zavihek "Spremeni načrt" (ItineraryRefiner — mutacije) in
                    "Vprašaj" (PlanCopilot — dejstva, deterministično prvi).
                    NE drug klebet sistem — obstoječi komponenti, nespremenjeni.
                    P0-4: sidro mobilne bližnjice "Prilagodi" ostaja na isti
                    lokaciji (id="itinerary-refiner"). */}
                <div
                  className={cn(
                    "grid gap-4",
                    routeByDay.length > 0 && "lg:grid-cols-[1.6fr_1fr]"
                  )}
                >
                  <div className="min-w-0">
                    {/* F5.1 (primerjalna analiza MindTrip): ZEMLJEVID POTI NA
                        STRANI NAČRTOVALCA — oštevilčeni markerji po dnevih z
                        barvami, interaktivna legenda dni ( vklop/izklop) in
                        dvosmerna sinhronizacija s karticami postankov. */}
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
                  </div>

                  <div
                    id="itinerary-refiner"
                    className="min-w-0 scroll-mt-[130px] space-y-3 lg:scroll-mt-24"
                  >
                    <div className="rounded-lg border bg-card/60 p-3">
                      <p className="flex items-center gap-1.5 text-sm font-semibold">
                        <MessageCircle
                          className="size-4 shrink-0 text-primary"
                          aria-hidden
                        />
                        {t("railPrompt")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {t("railExamples")}
                      </p>
                      <div
                        role="tablist"
                        aria-label={t("railPrompt")}
                        className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-muted p-1"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={chatTab === "refine"}
                          onClick={() => setChatTab("refine")}
                          className={cn(
                            "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            chatTab === "refine"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <Waypoints
                            className="size-3.5 shrink-0"
                            aria-hidden
                          />
                          {t("railTabRefine")}
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={chatTab === "ask"}
                          onClick={() => setChatTab("ask")}
                          className={cn(
                            "inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            chatTab === "ask"
                              ? "bg-primary text-primary-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <HelpCircle
                            className="size-3.5 shrink-0"
                            aria-hidden
                          />
                          {t("railTabAsk")}
                        </button>
                      </div>
                    </div>
                    {chatTab === "refine" ? (
                      /* F9 "Pogovor z načrtom": ukazi za SPREMEMBE — refiner.
                          vprašanje ≠ ukaz, obe plasti sta jasno ločeni. */
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
                    ) : (
                      /* F9: vprašanja o načrtu — PlanCopilot (odgovarja
                          NAJPREJ deterministično, AI le sfrazi list dejstev) */
                      <PlanCopilot itinerary={itinerary} formData={formData} />
                    )}
                  </div>
                </div>

                {/* UI sprint (točki A/C smeri): KOMPAKTNO stanje poti — km,
                    čas vožnje, strošek in izvedljivost v štirih ploščicah;
                    kartice kakovosti/proračuna/geo-validacije so zložene pod
                    gumbom "Podrobnosti izračunov" (isti izračuni kot prej,
                    korak dlje od prvega zaslona). */}
                {geoValidation && (
                  <PlannerStatusStrip
                    itinerary={itinerary}
                    input={formData}
                    geoValidation={geoValidation}
                    bookingOfferCount={
                      bookingData
                        ? Object.values(bookingData).reduce(
                            (sum, o) =>
                              sum +
                              o.listings.length +
                              o.experiences.length +
                              o.products.length,
                            0
                          )
                        : 0
                    }
                  />
                )}

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

                    // OPCIJA-3: število rezervabilnih ponudb tega dneva
                    // (listings + izkušnje + izdelki prek vseh postankov) —
                    // poganja gumb "Rezerviraj" v glavi dneva.
                    const dayOffers = day.locations.reduce(
                      (sum, l) =>
                        sum +
                        (bookingData?.[l.destination_id]?.listings.length ?? 0) +
                        (bookingData?.[l.destination_id]?.experiences.length ?? 0) +
                        (bookingData?.[l.destination_id]?.products.length ?? 0),
                      0
                    );

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
                          {/* Varovalka obnove: stari/pokvarjeni načrti brez
                              weather polja (localStorage) ne sesujejo rendera —
                              enak vzorec kot trip-timeline/shared-trip. */}
                          {day.weather && (
                            <Badge variant="secondary" className="gap-1.5">
                              <Cloud className="size-3.5" aria-hidden />
                              {day.weather.condition} · {day.weather.temp}°C
                            </Badge>
                          )}
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
                          {/* OPCIJA-3 (transakcijska globina): rezervacija v
                              GLAVI dneva — en klik od tukaj do booking
                              panela tega dne (prej: samo dolg scroll čez vse
                              postanke). Prikaže se SAMO kadar dan ima ponudbe. */}
                          {dayOffers > 0 && (
                            <button
                              type="button"
                              onClick={() => {
                                trackPlannerEvent("booking_cta_clicked", {
                                  placement: "day_header",
                                  day: day.day,
                                  offers: dayOffers,
                                });
                                document
                                  .getElementById(`booking-panel-${day.day}`)
                                  ?.scrollIntoView({
                                    behavior: "smooth",
                                    block: "start",
                                  });
                              }}
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={t("bookingCtaDayAria", {
                                day: day.day,
                                count: dayOffers,
                              })}
                            >
                              <Ticket className="size-3.5" aria-hidden />
                              {t("bookingCtaDay")}
                              <span className="rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-bold tabular-nums">
                                {dayOffers}
                              </span>
                            </button>
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
                          // UI sprint (točka D smeri): premik med postanki in
                          // segment dneva — izračun nad obstoječimi poli
                          const prev = idx > 0 ? day.locations[idx - 1] : null;
                          const seg = segmentOfSlot(loc.time_slot);
                          const prevSeg = prev
                            ? segmentOfSlot(prev.time_slot)
                            : null;
                          // UI sprint (nabor #2): glava segmenta se pokaže ob
                          // prehodu (Jutro → Popoldan → Večer) ali na prvem
                          // postanku dneva; neznani sloti → brez glave
                          const showSegHeader =
                            seg !== null && (prev === null || seg !== prevSeg);
                          const SegIcon = seg ? SEGMENT_ICONS[seg] : null;
                          // UI sprint (točka C): lokalna sličica destinacije —
                          // SAMO obstoječi /content viri (brez novih odvisnosti)
                          const dest = destinationById(loc.destination_id);
                          // Backlog #6: predlog kosila tega dne (en na dan),
                          // vezan na konkretno etapo (fromId→toId)
                          const meal = mealByDay.get(day.day) ?? null;
                          const mealHere =
                            meal !== null &&
                            prev !== null &&
                            meal.fromId === prev.destination_id &&
                            meal.toId === loc.destination_id;
                          return (
                            <React.Fragment key={`${loc.destination_id}-${idx}`}>
                              {/* Točka D: povezovalnik med zaporednima postankoma
                                  (🚗 ~X km · ~Y min — isti vir kot značka dneva) */}
                              {prev && (
                                <PlannerStopLeg
                                  from={prev}
                                  to={loc}
                                  legs={itinerary.legs}
                                />
                              )}
                              {/* Backlog #6: svetovalni predlog kosila — SAMO na
                                  etapi, ki jo je izbrala čista logika (največ
                                  ena na dan; ne mutira načrta, zato ni odvisna
                                  od urejanja/postavljanja slotov) */}
                              {prev && mealHere && meal && (
                                <PlannerMealStop suggestion={meal} />
                              )}
                              {/* Backlog #5: predlogi postankov na tej etapi
                                  (zložen žeton → lazy nalaganje, +X km
                                  izven rute iz OSRM plasti; Dodaj je
                                  determinističen, F16 vzorec) */}
                              {prev && (
                                <PlannerLegSuggestions
                                  day={day.day}
                                  from={prev}
                                  to={loc}
                                  usedIds={usedDestinationIds}
                                  onAdd={(s) =>
                                    applySuggestedStop(
                                      day,
                                      prev.destination_id,
                                      s
                                    )
                                  }
                                />
                              )}
                              {showSegHeader && seg && SegIcon && (
                                <div className="flex items-center gap-2 py-1">
                                  <span
                                    className="h-px flex-1 border-t border-border/70"
                                    aria-hidden
                                  />
                                  <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                    <SegIcon className="size-3.5" aria-hidden />
                                    {t(SEGMENT_LABEL_KEYS[seg])}
                                  </span>
                                  <span
                                    className="h-px flex-1 border-t border-border/70"
                                    aria-hidden
                                  />
                                </div>
                              )}
                              <div
                                id={`stop-row-${day.day}-${idx}`}
                                className="rounded-lg border bg-card/50 p-4 transition-shadow"
                              >
                                <div className="flex items-start gap-3">
                                  {dest?.image && (
                                    <div className="relative size-16 shrink-0 overflow-hidden rounded-md sm:size-20">
                                      <Image
                                        src={dest.image}
                                        alt=""
                                        fill
                                        sizes="(max-width: 640px) 64px, 80px"
                                        className="object-cover"
                                      />
                                    </div>
                                  )}
                                  <div className="min-w-0 flex-1">
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
                                      {/* flex-wrap: na mobilnem se značke
                                          (trajanje + cena + iz klepeta +
                                          vstopnice + fokus) prestavijo v
                                          novo vrstico namesto preliva */}
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className="gap-1">
                                          <Clock className="size-3" aria-hidden />
                                          {loc.duration}h
                                        </Badge>
                                        {/* TASK 50 (§10/§11): estimated_cost je
                                            lahko NaN/null — postanek, katerega
                                            cene strežnik NI mogel verificirati
                                            (vir nepriključen). Značilka cene se
                                            skrije (unknown ≠ 0 = "brezplačno"),
                                            opomba postanka pove, kaj preveriti. */}
                                        {typeof loc.estimated_cost === "number" &&
                                          loc.estimated_cost > 0 && (
                                          <Badge className="bg-accent text-accent-foreground">
                                            €{loc.estimated_cost}
                                          </Badge>
                                        )}
                                        {/* 1.42 (GEO → NAČRT) + F1 (Supply
                                            Map): postanek, dodan iz AI
                                            klepeta ALI z zemljevida ponudbe
                                            — kontekst, od kod je nepričakovani
                                            večerni postanek. 1.43/F1: poleg
                                            značke EN KLIK za odstranitev. */}
                                        {(loc.category === "chat" || loc.category === "supply") && (
                                          <>
                                            <Badge
                                              variant="outline"
                                              className="gap-1 border-primary/40 bg-primary/5 text-primary"
                                              title={
                                                loc.category === "supply"
                                                  ? t("supplyStopBadgeTitle")
                                                  : t("chatStopBadgeTitle")
                                              }
                                            >
                                              {loc.category === "supply" ? (
                                                <MapPin className="size-3" aria-hidden />
                                              ) : (
                                                <MessageCircle className="size-3" aria-hidden />
                                              )}
                                              {loc.category === "supply"
                                                ? t("supplyStopBadge")
                                                : t("chatStopBadge")}
                                            </Badge>
                                            <button
                                              type="button"
                                              onClick={() => removeChatStop(loc)}
                                              className="inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:border-destructive/40 hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                              aria-label={t(
                                                "chatStopRemoveAria",
                                                { name: loc.destination_name }
                                              )}
                                              title={t("chatStopRemoveTitle")}
                                            >
                                              <X className="size-3" aria-hidden />
                                              {t("chatStopRemove")}
                                            </button>
                                          </>
                                        )}
                                        {/* OPCIJA-3 (transakcijska globina):
                                            KONKRETNO DEJANJE na postanku —
                                            kadar ima destinacija tega postanka
                                            rezervabilne ponudnike/izkušnje,
                                            čip pokaže eno-bližnico do booking
                                            panela dneva (Mindtripova "Book"
                                            kartica, po našem modelu: lokalni
                                            ponudniki + affiliate, iskreno). */}
                                        {(bookingData?.[loc.destination_id]
                                          ?.experiences.length ?? 0) +
                                          (bookingData?.[loc.destination_id]
                                            ?.listings.length ?? 0) >
                                          0 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              trackPlannerEvent(
                                                "booking_cta_clicked",
                                                {
                                                  placement: "stop_card",
                                                  day: day.day,
                                                  destination:
                                                    loc.destination_name,
                                                }
                                              );
                                              document
                                                .getElementById(
                                                  `booking-panel-${day.day}`
                                                )
                                                ?.scrollIntoView({
                                                  behavior: "smooth",
                                                  block: "start",
                                                });
                                            }}
                                            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary transition-colors hover:border-primary/50 hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                                            aria-label={t(
                                              "bookingCtaStopAria",
                                              { name: loc.destination_name }
                                            )}
                                            title={t("bookingCtaStopTitle")}
                                          >
                                            <Ticket
                                              className="size-3"
                                              aria-hidden
                                            />
                                            {t("bookingCtaStop")}
                                          </button>
                                        )}
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
                                  </div>
                                </div>
                                {/* FAZA 4-1 + 4-3: "Zakaj je to priporočeno?" + */}
                                {/* praktični podatki (samo obstoječi) */}
                                <StopInsights visit={loc} locale={locale} />
                              </div>
                            </React.Fragment>
                          );
                        })}

                        {/* F16 (backlog #4): OPTIMALNO ZAPOREDJE — gumb se
                            pokaže SAMO kadar deterministični izračun obeta
                            smiseln prihranek (≥ 5 km ocene); po preureditvi
                            je dan optimalen → gumb izgine sam (pošteno). */}
                        {(() => {
                          const opt =
                            day.locations.length >= 3
                              ? optimizeDayOrder(day.locations)
                              : null;
                          if (
                            !opt ||
                            opt.savedKm < 5 ||
                            opt.savedKm / Math.max(opt.beforeKm, 1) < 0.05
                          ) {
                            return null;
                          }
                          return (
                            <button
                              type="button"
                              onClick={() => applyOptimalOrder(day)}
                              className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                              aria-label={t("optimizeOrderAria", {
                                day: day.day,
                                km: opt.savedKm,
                              })}
                            >
                              {/* UI sprint (točka E smeri): prihranek kot
                                  kontekstna priložnost ("✨ Našel sem krajšo
                                  pot — prihraniš približno X km") — prag in
                                  izračun F16 nespremenjena (≥ 5 km / ≥ 5 %). */}
                              <Sparkles
                                className="size-4 shrink-0 text-primary"
                                aria-hidden
                              />
                              {t("optimizeContextual")}
                              <span className="text-xs font-normal text-primary">
                                · {t("optimizeContextualSaving", { km: opt.savedKm })}
                              </span>
                            </button>
                          );
                        })()}

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
                      {/* D2 (nabor #2, Mindtrip audio): zvočni povzetek načrta.
                          Skript se sestavi deterministično ( 0 AI) iz
                          podatkov načrta; TTS ga izgovori na strežniku. */}
                      {audioScript && (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void handleListenClick()}
                          disabled={audioLoading || loading}
                          className="gap-1.5"
                          aria-label={t("listenButtonAria")}
                          aria-expanded={Boolean(
                            audioUrl && audioUrlKey === audioKey
                          )}
                        >
                          {audioLoading ? (
                            <Loader2
                              className="size-4 animate-spin"
                              aria-hidden
                            />
                          ) : (
                            <Volume2 className="size-4" aria-hidden />
                          )}
                          {audioLoading
                            ? t("listenGenerating")
                            : t("listenButton")}
                        </Button>
                      )}
                    </div>

                    {/* D2: zvočni predvajalnik + poštena opomba ( računalniški
                        glas, povzetek po dnevih — ne branje celotnih kartic) */}
                    {audioError && (
                      <p role="alert" className="text-sm text-destructive">
                        {audioError}
                      </p>
                    )}
                    {audioUrl && audioUrlKey === audioKey && (
                      <div className="space-y-1.5 animate-in fade-in slide-in-from-bottom-1 duration-300">
                        <audio
                          ref={audioRef}
                          controls
                          preload="none"
                          src={audioUrl}
                          className="h-10 w-full max-w-md"
                        />
                        <p className="text-xs text-muted-foreground">
                          {t("listenHint")}
                        </p>
                      </div>
                    )}

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

                {/* UI sprint (točki A/5 smeri): "VEČ O TVOJI POTI" — napredne
                    podrobnosti na korak dlje (priporočila, nasveti, dogodki,
                    pakirni seznam, časovni pregled); primarna delovna površina
                    ostane čista. Vsebina razdelkov je nespremenjena. */}
                <Card>
                  <button
                    type="button"
                    onClick={() => setMoreOpen((v) => !v)}
                    aria-expanded={moreOpen}
                    className="flex w-full items-center gap-3 rounded-xl p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-6"
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Sparkles className="size-4 text-primary" aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-lg font-semibold">
                        {t("moreTitle")}
                      </span>
                      <span className="block text-sm text-muted-foreground">
                        {t("moreDesc")}
                      </span>
                    </span>
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-muted-foreground transition-transform",
                        moreOpen && "rotate-180"
                      )}
                      aria-hidden
                    />
                  </button>
                  {moreOpen && (
                    <CardContent className="space-y-4">
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
                {/* 1.29.0 (revizija #13): EN locale → prevedena sekcija (EVENTS_EN) */}
                <ItineraryEventsSection
                  events={itinerary.events}
                  lang={locale === "en" ? "en" : "sl"}
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
                    </CardContent>
                  )}
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
    </section>
  );
}

export default ItineraryPlanner;
