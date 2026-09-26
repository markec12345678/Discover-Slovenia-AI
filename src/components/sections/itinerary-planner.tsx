"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Sparkles,
  Clock,
  Calendar,
  CalendarDays,
  CalendarArrowDown,
  Car,
  RefreshCw,
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
  ArrowRight,
  Star,
  Cloud,
  Loader2,
  Share2,
  Mail,
  Check,
  Copy,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  HelpCircle,
  MessageCircle,
  MoreHorizontal,
  X,
  Volume2,
  FileText,
  Ticket,
  Footprints,
  Undo2,
  Lock,
} from "lucide-react";

import { Button } from "@/components/ui/button";
// TASK 8 / D8-F (issue #8 §5): akcije načrta — preljubčen meni "Več"
// (vse zmožnosti ostanejo, vrstica pa preneha tekmuje z 5 CTAji).
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
// D6-B (Issue #6, M7+): potrditev pred odstranitvijo dneva S postanki —
// destruktiven popravek (uniči N postankov), zato radix AlertDialog.
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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

import { DESTINATIONS, INTERESTS } from "@/lib/slovenia-data";
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
} from "@/lib/chat-add-place";
// TASK 99-b (§18): persistenca zadnjega načrta ima ZDAJ EN sam vir
// (prej dupliciran pisec v plannerju in klepetu — isti ključ, isti meji).
import {
  persistItinerary,
  readLastItinerary,
} from "@/lib/itinerary-persist";
import type { ChatPlace } from "@/lib/geo-intent";
// F1 (Supply Map): odstranjevanje izbranih produktov (čipi nad gumbom)
import { removeSelectedProduct } from "@/lib/supply/selection";
import type { SelectedProviderProduct } from "@/lib/supply/types";
import { persistSelection } from "@/lib/supply/selection-persist";
import { useToast } from "@/hooks/use-toast";
import { trackFunnel } from "@/lib/funnel";
import { optimizeDayOrder } from "@/lib/route-order";
// M7 (Issue #5 / T5-D): ročno prestavljanje + dodajanje/odstranjevanje dneva —
// čiste deterministične operacije (isti invalidacijski kanon kot F16).
// D6-B (Issue #6, M7+): moveStopToDay — prestavitev postanka MED dnevi.
import { reorderStopInItinerary, moveStopToDay } from "@/lib/planner-reorder";
import {
  addDay as addDayToItinerary,
  removeDay as removeDayFromItinerary,
  MAX_PLANNER_DAYS,
} from "@/lib/planner-days";
// TASK 82: ena sama resnica o pogojih številskih polj (dnevi/proračun/
// skupina) — isto čisto logiko poganja inline napaka pod poljem, validate()
// ob oddaji in enotski testi. Pogodba poravnana s /api/itinerary.
import {
  isDaysValid,
  budgetInvalidReason,
  isGroupSizeValid,
  firstInvalidNumericField,
  type NumericFieldName,
} from "@/lib/planner-field-validation";
import {
  trackPlannerEvent,
  markResultRendered,
  markResultEngaged,
  fireAbandonedIfUnengaged,
  trackIngestCompleted,
} from "@/lib/planner-analytics";
// TASK 28 (Tier 1 #1): live-sync indikator povezane pote (polling).
import { useTripVersionPoll } from "@/hooks/use-trip-version-poll";
import { destinationById } from "@/lib/stop-insights";
import { validateItineraryGeo } from "@/lib/geo-validation";
import { StopInsights } from "@/components/stop-insights";
import {
  saveItinerary,
  fetchSharedItinerary,
  updateItinerary,
  getEditToken,
} from "@/lib/itinerary-share";
// ISSUE #4 §22 (val 5): sejni undo sklad nad destruktivnimi prehodi
// (AI refinement / regeneracija) — "refinement ne sme nepreklicno
// prepisati tripa" (citat §22). Čist modul, testiran v __tests__.
import {
  pushUndo,
  popUndo,
  canUndo,
  peekUndo,
  type UndoEntry,
} from "@/lib/itinerary-undo";
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
import { DaySegmentHeader } from "@/components/day-segment-header";
import { segmentBoundaryAt } from "@/lib/day-segments";
import {
  PlannerLegSuggestions,
  type StopSuggestion,
} from "@/components/planner-leg-suggestions";
import { PlannerMealStop } from "@/components/planner-meal-stop";
import { pickMealStop, type MealSuggestion } from "@/lib/meal-stops";
import { PlannerStatusStrip } from "@/components/planner-status-strip";
import { PlannerSummaryBar } from "@/components/planner-summary-bar";
// Issue #3 (UX REDESIGN — AI = CONTROL LAYER + TRUST): kompaktna kontrolna
// vrstica (refinement čipi vidni TAKOJ nad potjo) in iskrena vrstica
// zaupanja (✓ samo, če je plast dejansko preverjena). Oba kličata/branita
// OBSTOJEČE plasti — NI nove logike načrtovanja.
import { PlannerAiControls } from "@/components/planner-ai-controls";
import { PlannerTrustLine } from "@/components/planner-trust-line";
// TASK 4 / K-7 (UX FIX PASS): AI itinerer → Go Mode premostitev — čista
// pretvorba (buildItineraryGoView) + persistenca (saveItineraryGoTrip).
import { buildItineraryGoView } from "@/lib/journey/itinerary-go";
import { saveItineraryGoTrip } from "@/lib/journey/go-persist";
import { buildItineraryAudioScript, planAudioCacheKey } from "@/lib/planner-audio";
import { DESTINATIONS_EN } from "@/lib/slovenia-data-en";
import type { LocationVisit } from "@/lib/types";
// TASK 8 / D8-F (D8-B §5): trak "Iz moje poti" nad obrazcem + prefill
// dogodek (destinacije → PRAZNA formData.preferredDestinations izbira).
import {
  PlannerMyTripStrip,
  MY_TRIP_PREFILL_EVENT,
  type MyTripPrefillDetail,
} from "@/components/planner-my-trip-strip";

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

// TASK 100 (TASK 99 na GitHubu): motor generiranja — "auto" (privzeto,
// nazaj kompatibilno) = AI veriga z deterministično rezervo;
// "deterministic" = načrt BREZ LLM klica (0 žetonov, trenuten, 100 %
// reproducibilno — isti vhod vedno da isti načrt). LabelKey → "planner".
const ENGINE_OPTIONS: {
  value: NonNullable<PlannerInput["engine"]>;
  labelKey: string;
}[] = [
  { value: "auto", labelKey: "engineAuto" },
  { value: "deterministic", labelKey: "engineDeterministic" },
];

// UI sprint (nabor #2 — dodatek raziskave): segment dneva Jutro/Popoldan/
// Večer — logika od TASK 93 živi v src/lib/day-segments.ts (ena resnica za
// podrobni pogled, TripTimeline in SharedTrip); vizual je skupna komponenta
// DaySegmentHeader.

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

// Persistenca zadnjega itinererja: od TASK 99-b ŽIVI V @/lib/itinerary-persist
// (enkraten vir — isti ključ/meji bere in piše tudi AI klepet). Planner samo
// kliče persistItinerary/readLastItinerary; obnovitvena validacija formData
// (isValidPlannerInput) ostaje TUKAJ, ker je PlannerInput-tipizirana.

/** TASK 99 (issue #1 §4): kanonska opomba supply postanka »cena: od …« /
 *  »price: from …« (canonicalPriceNote v supply/itinerary-supply-validation)
 *  označuje FROM_PRICE znesek — znaczka cene ga izpiše s predpono „od“,
 *  ker od-cena NI zagotovljena končna cena. */
const FROM_PRICE_NOTE_RE = /\b(cena|price):\s*(od|from)\s/i;

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
  // TASK 4 / K-7: navigacija na /na-poti ob zagonu Go Mode
  const router = useRouter();
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
  // TASK 82: inline validacija številskih polj — "touched" se nastavi ob
  // bluru ali neuspešni oddaji (NIKOČ med tipkanjem prvih števk), napaka
  // pod poljem se prikaže samo za dotaknjeno neveljavno polje.
  const [touched, setTouched] = useState<Record<NumericFieldName, boolean>>({
    days: false,
    budget: false,
    groupSize: false,
  });
  const daysInputRef = useRef<HTMLInputElement>(null);
  const budgetInputRef = useRef<HTMLInputElement>(null);
  const groupSizeInputRef = useRef<HTMLInputElement>(null);
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
  // načrta (ista čista funkcija na clientu, samo za prikaz razpoložljivosti
  // in analitiko; STREŽNIK si ga ob klicu zgradi SAM iz strukturiranih
  // podatkov — TASK 92). Null, če načrta ni.
  //
  // TASK 92: ključ razveljavitve je ZGOŠČENA VSEBINA (planAudioCacheKey,
  // djb2) — prej `${locale}:${groupSize}:${chars}` je dva RAZLIČNA načrta z
  // enako dolžino skripta izenačil in klient bi tiho predvajal STARI zvok.
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
      itinerary
        ? planAudioCacheKey({
            itinerary,
            dayKm,
            groupSize: formData.groupSize,
            locale: locale === "en" ? "en" : "sl",
          })
        : null,
    [itinerary, dayKm, formData.groupSize, locale]
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

  // M7 (Issue #5 / T5-D): ROČNO prestavljanje postankov — stanje vlečenja
  // (HTML5 DnD za miš; dotik + tipkovnica + bralniki pokrijeta puščici
  // ↑/↓, ki kličeta ISTO deterministično operacijo). Samo znotraj dneva.
  const [dragging, setDragging] = useState<{
    day: number;
    idx: number;
  } | null>(null);
  const [dragOver, setDragOver] = useState<{
    day: number;
    idx: number;
  } | null>(null);

  // D6-B (Issue #6, M7+): dan, ki ČAKA na potrditev odstranitve. Nastane
  // SAMO pri kliku „Odstrani dan" na dnevu S postanki (destruktiven popravek
  // — uniči vse njegove postanke); prazen dan (nič ne izgubi) se odstrani
  // takoj brez dialoga. Radix AlertDialog je krmilovan prek tega stanja.
  const [removeDayPending, setRemoveDayPending] = useState<DayPlan | null>(
    null
  );

  // === Shrani & deli ===
  const [saving, setSaving] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [shareError, setShareError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // ISSUE #4 §2 (val 2): shareId različice načrta, KI JE NA STREŽNIKU in
  // se UJEMA s trenutno vsebino (shranjeno TO sejo ali odprto prek ?odpri=).
  // Identiteta objekta je varovalka: karkoli spremeni načrt (refine,
  // regeneracija, dodajanje kraja) → povezava UGAJA SAMO (stara povezava
  // ne velja več — ne lažemo, da je to isti trip).
  const [linkedTrip, setLinkedTrip] = useState<{
    itinerary: Itinerary;
    shareId: string;
    // ISSUE #4 §22 (val 5): strežniška contentVersion povezane pote —
    // baza za CAS ob posodabljanju NA MESU (namesto nove povezave).
    // null = neznana (odprta tuja pot) → nikoli ne PATCHamo.
    contentVersion: number | null;
  } | null>(null);
  const activeShareId =
    linkedTrip && linkedTrip.itinerary === itinerary ? linkedTrip.shareId : null;

  // TASK 28 (Tier 1 #1): LIVE-SYNC — polling strežniške verzije POVEZANE
  // pote (viden zavihek, 20 s, /api/trip/[shareId]/version). Znana verzija
  // (contentVersion ≠ null) je baza primerjave — odprta TUJA pot (null)
  // se NE poll'a (iskreno: brez baze ne trdimo zastarelosti). Klientove
  // lastne shranitve sproti posodabljajo linkedTrip.contentVersion →
  // nikoli ne oglámo svojega PATCH-a kot „posodobljeno drugje".
  const {
    stale: planUpdateStale,
    serverVersion: planUpdateServerVersion,
    dismiss: dismissPlanUpdate,
  } = useTripVersionPoll({
    shareId: linkedTrip ? linkedTrip.shareId : null,
    knownVersion: linkedTrip?.contentVersion ?? null,
    enabled: linkedTrip !== null && linkedTrip.contentVersion !== null,
  });

  // nalaganje strežniške različice ima SVOJ indikator (ločeno od saving,
  // ki pomeni „shranjujem na strežnik")
  const [planUpdateBusy, setPlanUpdateBusy] = useState(false);

  // TASK 28: dogodek SAMO ob prehodu false→true (ne ob vsaki nadaljnji
  // spremembi strežniške verzije med prikazanim bannerjem).
  const planUpdateWasStale = useRef(false);
  useEffect(() => {
    if (planUpdateStale && !planUpdateWasStale.current) {
      trackPlannerEvent("plan_update_detected", {
        locale,
        server_version: planUpdateServerVersion ?? -1,
      });
    }
    planUpdateWasStale.current = planUpdateStale;
  }, [planUpdateStale, planUpdateServerVersion, locale]);

  // TASK 28 (Tier 1 #1): naloži strežniško (novejšo) različico povezane
  // pote. DESTRUKTIVEN prehod → prejšnja vsebina gre na undo sklad (isti
  // §22 kanon kot regeneracija/refine). Po nalasu linkedTrip.contentVersion
  // dohiti strežnik (CAS baza znova veljavna — naslednja shranitev je
  // POSODOBITEV na mestu, ne nova povezava).
  async function handleLoadServerVersion() {
    if (!linkedTrip || planUpdateBusy) return;
    setPlanUpdateBusy(true);
    try {
      const data = await fetchSharedItinerary(linkedTrip.shareId);
      // §22: prejšnjo vsebino na undo sklad PRED zamenjavo (reverzibilno).
      if (itinerary) {
        applyItinerary(data.itinerary, t("undoLabelPlanUpdate"));
      } else {
        setItinerary(data.itinerary);
      }
      setLinkedTrip({
        itinerary: data.itinerary,
        shareId: linkedTrip.shareId,
        contentVersion: data.contentVersion,
      });
      // Vsebina == strežnik → povezana deljena povezana SPET velja (F16).
      setShareUrl(`${window.location.origin}/pot/${linkedTrip.shareId}`);
      dismissPlanUpdate();
      trackPlannerEvent("plan_update_loaded", {
        locale,
        server_version: data.contentVersion ?? -1,
      });
      toast({
        title: t("planUpdatedLoadedToast"),
        description: t("planUpdatedLoadedToastDesc", {
          version: data.contentVersion ?? "—",
        }),
      });
    } catch {
      trackPlannerEvent("plan_update_load_failed", { locale });
      toast({
        title: t("planUpdatedLoadErrorToast"),
        description: t("planUpdatedLoadErrorToastDesc"),
        variant: "destructive",
      });
    } finally {
      setPlanUpdateBusy(false);
    }
  }

  // ISSUE #4 §22 (val 5): SEJNI UNDO SKLAD — vsak destruktivni prehod
  // (AI refinement, regeneracija) potisne PREJŠNJO vsebino; "Razveljavi"
  // jo vrne. Omejen na 10 (UNDO_STACK_LIMIT v čistem modulu).
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);

  // §22: enoten applier za DESTRUKTIVNE prehode — prejšnja vsebina gre na
  // undo sklad PRED zamenjavo (vsa tri mesta: regeneracija + oba refinerja
  // uporabljata TA helper; adicijski mikro-ukrepi (chat +/- kraj) ostanejo
  // na golem setItinerary — niso "nepreklicen prepis" v smislu §22, ker so
  // enojni reverzibilni koraki, ki jih pokriva strežniška revizija po
  // shranitvi).
  const applyItinerary = useCallback(
    (next: Itinerary, undoLabel: string) => {
      setUndoStack((s) =>
        itinerary
          ? pushUndo(s, { itinerary, label: undoLabel, at: Date.now() })
          : s
      );
      setItinerary(next);
    },
    [itinerary]
  );

  // §22: razveljavi zadnji destruktivni prehod (LIFO). Vsebina se vrne,
  // sklad se skrajša; lokalna persistenca + umik zastarele povezave po
  // istem kanonu kot refine (P0.2).
  const handleUndo = useCallback(() => {
    const popped = popUndo(undoStack);
    if (!popped) return;
    setUndoStack(popped.remaining);
    setItinerary(popped.entry.itinerary);
    persistItinerary(popped.entry.itinerary, formData);
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("itinerary_undo", {
      label: popped.entry.label,
      locale,
    });
  }, [undoStack, formData, shareUrl, locale]);
  // TASK 4 / K-15: DVIGNJENO stanje razklopa "Podrobnosti izračunov" —
  // sproži ga tudi klik na postavko trust vrstice (isti `open` kot
  // PlannerStatusStrip; prej skrito za zložkom + scrollom).
  const [calcDetailsOpen, setCalcDetailsOpen] = useState(false);

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
          // ISSUE #4 §2: odprta deljena različica JE strežniška različica —
          // Go Mode premostitev veže nanjo (dokler se vsebina ne spremeni).
          // §22: odprta deljena pot — contentVersion neznan (ne bomo
          // PATCHali na mestu; morebitna shranitev naredi novo povezavo).
          setLinkedTrip({ itinerary: data.itinerary, shareId, contentVersion: null });
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

    // 1.6) Issue #3 (Start Anywhere secondary): sidro #start-kjerkoli iz
    // heroja. Če uporabnik že ima obnovljen načrt, je obrazec zložen —
    // sidra na skritem elementu ne delujejo. Zato ob prihodu s hash-em
    // obrazec RAZŠIRIMO (zmožnost ostane dostopna — HIDE ≠ DELETE) in
    // se pomaknemo do bloka uvoza virov (povezava/slika/PDF/točke).
    const startHash = window.location.hash;
    if (startHash === "#start-kjerkoli" || startHash === "#start-anywhere") {
      setFormExpanded(true);
      setTimeout(() => {
        document
          .getElementById("start-kjerkoli")
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 200);
    }

    // 2) Obnovi zadnji načrt iz localStorage (samo če store še ni poln)
    // TASK 99-b: branje je v knjižnici (enkraten vir, defenzivno — smeti →
    // null); validacija formData ostane plannerjeva (PlannerInput tip).
    try {
      if (!useAppStore.getState().itinerary) {
        const parsed = readLastItinerary();
        if (parsed) {
          setItinerary(parsed.itinerary);
          if (isValidPlannerInput(parsed.formData)) {
            setFormData(parsed.formData);
          }
          setRestoredVisible(true);
        }
      }
    } catch {
      // Pokvarjen zapis — ignoriraj
    }
  }, []);

  // === TASK 8 / F3-C (issue #8 §25, audit §3 rec 1 — "Start Anywhere
  // measured lift"): skok na blok uvoza virov (#start-kjerkoli) kot ENA
  // logika za vse vhode: tiha povezava v zglavlju obrazca (spodaj), gumb v
  // zloženem PlannerSummaryBar in hashchange spodaj. Obrazec (če je zložen
  // v povzetek parametrov) najprej RAZŠIRIMO — sidro na skritem elementu
  // ne deluje (HIDE ≠ DELETE; isti vzorec kot mount razširitev 1.6). ===
  const handleStartAnywhereJump = useCallback(() => {
    setFormExpanded(true);
    setTimeout(() => {
      document
        .getElementById("start-kjerkoli")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
  }, []);

  // F3-C: istostranske hash povezave (/nacrtuj#start-kjerkoli iz NOGE —
  // planStartAnywhere, mobilnega lista "Več" in USP vrstice strani) NE
  // sprožijo mount efekta zgoraj (Next istostranska navigacija) — zato
  // poslušamo hashchange in razširimo + pomaknemo enako kot ob prihodu
  // s heroja.
  useEffect(() => {
    const handleStartAnywhereHash = () => {
      const hash = window.location.hash;
      if (hash === "#start-kjerkoli" || hash === "#start-anywhere") {
        handleStartAnywhereJump();
      }
    };
    window.addEventListener("hashchange", handleStartAnywhereHash);
    return () =>
      window.removeEventListener("hashchange", handleStartAnywhereHash);
  }, [handleStartAnywhereJump]);

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

  // === TASK 8 / D8-F (D8-B §5): "Iz moje poti" prefill — trak nad obrazcem
  // pošlje destinacije iz zbirke (CustomEvent, isti vzorec kot heroQuery /
  // CHAT_ADD_PLACE listenerji). Zapolnimo SAMO PRAZNO izbiro destinacij
  // (formData.preferredDestinations — isti mehanizem kot url-ingest);
  // uporabnikove obstoječe izbire NIKOLI ne prepišemo. NO generiranje —
  // uporabnik sam klikne gumb za načrt (no silent AI regeneration). ===
  useEffect(() => {
    const handleMyTripPrefill = (e: Event) => {
      const detail = (e as CustomEvent<MyTripPrefillDetail>).detail;
      const ids = Array.isArray(detail?.destinations)
        ? detail.destinations.filter((id) =>
            DESTINATIONS.some((d) => d.id === id)
          )
        : [];
      if (ids.length === 0) return;
      // Dejanska imena za vidne čipe "Prepoznano" + toast (preverljivost)
      const names = ids
        .map((id) => DESTINATIONS.find((d) => d.id === id)?.name)
        .filter((n): n is string => typeof n === "string");

      const existing = formData?.preferredDestinations;
      if (existing && existing.length > 0) {
        // Uporabnikova izbira (npr. iz uvoza povezave) ima prednost —
        // iskreno javimo, da ničesar nismo prepisali.
        toast({
          title: t("myTripPrefillKept"),
          description: existing.join(", "),
        });
        return;
      }
      // Vidni povratek = isti prikaz kot url-ingest (čipi "Prepoznano"
      // pod vnosom) — prenos ni tiho.
      setIngestMatches(
        ids.slice(0, 8).map((id) => {
          const d = DESTINATIONS.find((x) => x.id === id);
          return { id, name: d?.name ?? id, slug: d?.slug ?? id, count: 1 };
        })
      );
      setIngestSourceTitle(t("myTripPrefillSource"));
      toast({
        title: t("myTripPrefillApplied"),
        description: names.join(", "),
      });
      setFormData((prev) =>
        prev.preferredDestinations && prev.preferredDestinations.length > 0
          ? prev // varovalka: medtem je uporabnik izbral svoje — ne prepišemo
          : { ...prev, preferredDestinations: Array.from(new Set(ids)).slice(0, 8) }
      );
    };

    window.addEventListener(MY_TRIP_PREFILL_EVENT, handleMyTripPrefill as EventListener);
    return () =>
      window.removeEventListener(MY_TRIP_PREFILL_EVENT, handleMyTripPrefill as EventListener);
    // Svež formData (isti vzorec kot CHAT_ADD_PLACE listener zgoraj) —
    // prefill spoštuje TRENUTNO uporabnikovo izbiro.
  }, [formData]);

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
      persistItinerary(result.itinerary, formData);
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
    persistItinerary(current, formData);
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
    persistItinerary(result.itinerary, formData);
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

  // TASK 100: motor generiranja — izbira MED dvema stanjema ("auto" je
  // vedno izbrano, ko uporabnik ni dotaknil stikala — nazaj kompatibilno:
  // stari odjemalci polja sploh ne pošljejo). Brez de-toggle: motor je
  // OBVEZNA odločitev z jasnim privzetkom, ne filtrirna želja.
  function toggleEngine(value: NonNullable<PlannerInput["engine"]>) {
    fireStartedOnce();
    setFormData((prev) =>
      prev.engine === value ? prev : { ...prev, engine: value }
    );
  }

  // TASK 82: inline sporočila pod številskimi polji — izpeljana iz ISTIH
  // čistih funkcij kot validate() (enoobrazje: kar je rdeče pod poljem, je
  // tudi razlog zavrnjene oddaje). Prikaz samo po "touched".
  const daysFieldError = touched.days && !isDaysValid(formData.days)
    ? t("validationDays")
    : null;
  const budgetReason = touched.budget
    ? budgetInvalidReason(formData.budget)
    : null;
  const budgetFieldError = budgetReason
    ? budgetReason === "too_large"
      ? t("validationBudgetMax")
      : t("validationBudget")
    : null;
  const groupSizeFieldError =
    touched.groupSize && !isGroupSizeValid(formData.groupSize)
      ? t("validationGroupSize")
      : null;

  /** Strukturiran izid validacije — field omogoča fokus na prvo
   * neveljavno polje + analytiko (planner_validation_failed). */
  type ValidationResult = {
    field: NumericFieldName | "interests" | "startDate";
    message: string;
  };

  function validate(input: PlannerInput): ValidationResult | null {
    if (!isDaysValid(input.days)) {
      return { field: "days", message: t("validationDays") };
    }
    const bReason = budgetInvalidReason(input.budget);
    if (bReason === "too_large") {
      return { field: "budget", message: t("validationBudgetMax") };
    }
    if (bReason) {
      return { field: "budget", message: t("validationBudget") };
    }
    if (!isGroupSizeValid(input.groupSize)) {
      return { field: "groupSize", message: t("validationGroupSize") };
    }
    if (input.interests.length === 0) {
      return { field: "interests", message: t("validationInterests") };
    }
    // FW4.2: datum odhoda (opcijsko) — izbirnik datumov večinoma poskrbi
    // za veljavnost; to je varnostna mreža (pretekli datum / ročni vnos)
    if (input.startDate && !isValidStartDate(input.startDate)) {
      return { field: "startDate", message: t("validationStartDate") };
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
    persistItinerary(next, formData);
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
    persistItinerary(next, formData);
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

  // M7 (Issue #5 / T5-D): ROČNO prestavljanje postanka v dnevu (drag/drop +
  // puščici ↑/↓). DETERMINISTIČNO na klientu (0 AI, 0 omrežja): termini so
  // permutacija položajev (kanon route-order.ts), invalidacija ista kot
  // applyOptimalOrder (routeGeometry dneva + quality/geoValidation/legs).
  // §21: intentLocked POTUJE s postankom — ročna namernost je izrecna
  // (samo samodejni optimizatorji zamrznejo zaklenjene postanke).
  function applyStopReorder(day: DayPlan, fromIdx: number, toIdx: number) {
    if (!itinerary) return;
    const next = reorderStopInItinerary(itinerary, day.day, fromIdx, toIdx);
    if (next === itinerary) return; // no-op (isti indeks / varovalka)
    setItinerary(next);
    persistItinerary(next, formData);
    markResultEngaged();
    // Strukturna sprememba — zastareli deljeni link se umakne (kanon F16):
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("stop_reordered", {
      day: day.day,
      from: fromIdx + 1,
      to: toIdx + 1,
      locale,
    });
    toast({ title: t("stopReorderedToastTitle") });
  }

  // M7 (Issue #5 / T5-D): dodaj PRAZEN dan (0 AI; varovalka max 14 — isti
  // limit kot obrazec + API). formData.days sinhroniziramo, da regeneracija
  // in refine (strežnik kapira na current.days.length) ostanejo usklajeni.
  function handleAddDay() {
    if (!itinerary) return;
    const next = addDayToItinerary(itinerary);
    if (next === itinerary) {
      toast({
        title: t("addDayMaxTitle"),
        description: t("addDayMaxDesc", { max: MAX_PLANNER_DAYS }),
      });
      return;
    }
    setFormData((p) => ({ ...p, days: next.days.length }));
    setItinerary(next);
    persistItinerary(next, formData);
    markResultEngaged();
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("day_added", {
      days: next.days.length,
      locale,
    });
    toast({
      title: t("dayAddedToastTitle"),
      description: t("dayAddedToastDesc", { day: next.days.length }),
    });
  }

  // M7 (Issue #5 / T5-D): odstrani dan + RENUMERIRAJ preostale (1..N — id-ji
  // UI, dayISO, PlannerDayNav so vezani na zaporedno št.). Varovalka: vsaj
  // 1 dan. crowdNotices se zamaknejo/počistijo (vezani na strukturo dni).
  // D6-B (Issue #6, M7+): dan S postanki je DESTRUKTIVEN (uniči jih iz
  // načrta) — najprej POTRDITEV prek AlertDialog (removeDayPending); PRAZEN
  // dan (nič ne izgubi) gre takoj skozi, brez dialoga.
  function handleRemoveDay(day: DayPlan) {
    if (!itinerary) return;
    if ((day.locations?.length ?? 0) > 0) {
      setRemoveDayPending(day);
      return;
    }
    applyRemoveDay(day);
  }

  // D6-B: dejanski odstranitveni prehod (klic iz handleRemoveDay za prazen
  // dan ali iz potrditvenega AlertDialoga po „Odstrani dan").
  function applyRemoveDay(day: DayPlan) {
    if (!itinerary) return;
    const next = removeDayFromItinerary(itinerary, day.day);
    if (next === itinerary) {
      toast({ title: t("removeDayMinTitle") });
      return;
    }
    setFormData((p) => ({ ...p, days: next.days.length }));
    setItinerary(next);
    persistItinerary(next, formData);
    markResultEngaged();
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("day_removed", {
      removed_day: day.day,
      days: next.days.length,
      locale,
    });
    toast({
      title: t("dayRemovedToastTitle"),
      description: t("dayRemovedToastDesc", { day: day.day }),
    });
  }

  // D6-B (Issue #6, M7+): prestavi postanek v PREJŠNJI/NASLEDNJI dan (0 AI,
  // 0 omrežja — čista operacija moveStopToDay iz planner-reorder). Postanek
  // se PRIPNE na konec ciljnega dneva z VSEMI polji (intentLocked potuje z
  // njim — §21); termini se ne prerazporejajo, zato toast izrecno opomni,
  // da preveri zaporedje in čase. Meje (dan 1 / zadnji dan) pokrijejo
  // onemogočena gumba + no-op varovalka funkcije.
  function handleMoveStopToDay(
    day: DayPlan,
    idx: number,
    targetDayNumber: number
  ) {
    if (!itinerary) return;
    const next = moveStopToDay(itinerary, day.day, idx, targetDayNumber);
    if (next === itinerary) return; // no-op (meja / varovalka)
    setItinerary(next);
    persistItinerary(next, formData);
    markResultEngaged();
    // Strukturna sprememba — zastareli deljeni link se umakne (kanon F16):
    if (shareUrl) {
      setShareUrl(null);
      setCopied(false);
    }
    trackPlannerEvent("stop_moved_to_day", {
      from_day: day.day,
      to_day: targetDayNumber,
      locale,
    });
    toast({
      title: t("stopMovedToDayToastTitle"),
      description: t("stopMovedToDayToastDesc", { day: targetDayNumber }),
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
    persistItinerary(next, formData);
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
      // TASK 100: kateri motor je ZADEL načrt (auto = AI z rezervo,
      // deterministic = brez LLM) — merimo povpraševanje po načrtu brez AI.
      engine: input.engine ?? "auto",
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

      // ISSUE #4 §22 (val 5): regeneracija je DESTRUKTIVEN prehod — prejšnji
      // načrt gre na sejni undo sklad ("Razveljavi" ga vrne; brez tega je
      // regeneracija nad obstoječim načrtom nepreklicna do konca seje).
      applyItinerary(data, t("undoLabelRegenerate"));
      // UI sprint (točka B): obrazec se po uspešni generaciji zloži v
      // povzetek parametrov — delovna površina načrta prevzame zaslon
      setFormExpanded(false);

      // TASK 4 / K-11 (UX FIX PASS): SCROLL NA DELOVNO POVRŠINO po generaciji.
      // Živi dokaz revizije: naslov delovne površine je pri y≈700+ (AI
      // kontrolna vrstica šele y≈999 pri 900 px viewportu) — uporabnik je
      // po 41–76 s čakanja ostal gledat ZGIB obrazca, ne pa načrta. Zdaj:
      // rAF (po renderju novega stanja) + gladek scroll na vrh načrta.
      requestAnimationFrame(() => {
        document
          .getElementById("plan-workspace")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });

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
      persistItinerary(data, input);

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

  // ========================================================================
  // TASK 4 / K-7 (UX FIX PASS): „Zaženi Na poti“ — AI itinerer → Go Mode.
  // Čista pretvorba (postanki/dnevi/termini/geo že obstajajo) + persistenca
  // na napravo (dai:go-trip v2) + preusmeritev na /na-poti. Prej: GO člen
  // DISCOVER→PLAN→BOOK→GO je bil LOČEN otok (deljena stran 0 povezav na
  // /na-poti; uporabnik bi moral potovanje zgraditi znova na /potovanje).
  // ========================================================================
  function handleStartGoMode() {
    if (!itinerary) return;
    const view = buildItineraryGoView(itinerary, {
      lang: locale === "en" ? "en" : "sl",
      name: deriveSavedTripName(itinerary),
    });
    const saved = saveItineraryGoTrip(view, { shareId: activeShareId });
    trackPlannerEvent("go_mode_started", {
      via: "planner_action_row",
      days: itinerary.days.length,
      persisted: saved,
    });
    if (saved) {
      router.push("/na-poti");
    } else {
      // Poln/zasebni localStorage — iskren toast (načrt NE more na napravo)
      toast({
        title:
          locale === "en"
            ? "Cannot store the plan on this device"
            : "Načrta ni bilo mogoče shraniti na to napravo",
        description:
          locale === "en"
            ? "Browser storage is full or blocked (private mode) — On-the-road needs the plan on the device."
            : "Shramba brskalnika je polna ali blokirana (zasebni način) — Na poti potrebuje načrt na napravi.",
        variant: "destructive",
      });
    }
  }

  // === Shrani & deli ===
  // ISSUE #4 §22 (val 5): če je povezana pot NAŠA (editToken v brskalniku +
  // znana contentVersion), jo POSODOBIMO NA MESU (PATCH s CAS) — stara
  // vsebina gre v strežniško revizijo (undo na strežniku) in deljena
  // povezava ostane ISTA (prijatelji vidijo svežo različico). Sicer (prvi
  // shranitev / tuja pot / 409 konflikt) klasična pot: POST → NOVA povezava.
  async function handleSaveShare() {
    if (!itinerary || saving) return;
    setSaving(true);
    setShareError(null);
    try {
      // §22: posodobitev na mestu — samo ko JE povezana pot, je NAŠA
      // (editToken) in poznamo njeno contentVersion (CAS baza).
      const linked =
        linkedTrip && linkedTrip.itinerary === itinerary ? linkedTrip : null;
      if (
        linked &&
        linked.contentVersion !== null &&
        getEditToken(linked.shareId)
      ) {
        try {
          const upd = await updateItinerary(
            linked.shareId,
            itinerary,
            linked.contentVersion
          );
          setLinkedTrip({
            itinerary,
            shareId: linked.shareId,
            contentVersion: upd.contentVersion,
          });
          setShareUrl(`${window.location.origin}/pot/${linked.shareId}`);
          trackFunnel("itinerary_saved");
          markResultEngaged();
          trackPlannerEvent("itinerary_saved", {
            days: itinerary.days.length,
            source: itinerary.source,
            locale,
            // §22: shranjeno kot POSODOBITEV obstoječe pote (ne nova povezava)
            inPlace: 1,
            revisionSaved: upd.revisionSaved ? 1 : 0,
          });
          toast({
            title: t("savedUpdatedToast"),
            description: t("savedUpdatedToastDesc", {
              version: upd.contentVersion,
            }),
          });
          return;
        } catch (e) {
          // 409 (sočasno urejanje) / napaka → iskren padec v klasično pot:
          // NOVA povezava (spodaj) + toast pove, da je nastala nova.
          trackPlannerEvent("save_inplace_fallback", { locale });
          console.warn(
            "[planner] §22 posodobitev na mestu ni uspela — nova povezava:",
            e
          );
        }
      }

      const result = await saveItinerary(itinerary, formData);
      const absoluteUrl = `${window.location.origin}${result.url}`;
      setShareUrl(absoluteUrl);
      // ISSUE #4 §2: pravkar shranjena različica == strežniška različica.
      // §22: nova pote ima contentVersion 0 (postgres default).
      setLinkedTrip({
        itinerary,
        shareId: result.shareId,
        contentVersion: 0,
      });
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
      setError(vErr.message);
      // TASK 82: vsa številska polja so zdaj "touched" → inline napake se
      // pokažejo pod polji (ne samo toast), fokus gre na prvo neveljavno
      // številsko polje — tipkovnica/bralnik zaslona pride do njega takoj.
      const firstField = firstInvalidNumericField(formData);
      if (firstField) {
        setTouched({ days: true, budget: true, groupSize: true });
        const ref =
          firstField === "days"
            ? daysInputRef
            : firstField === "budget"
              ? budgetInputRef
              : groupSizeInputRef;
        ref.current?.focus();
      }
      // Merjenje trenja obrazca: katero polje najpogosteje zavrača oddajo.
      trackPlannerEvent("planner_validation_failed", {
        field: vErr.field,
      });
      toast({
        title: t("validationToastTitle"),
        description: vErr.message,
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
      // F3-C (audit §3 rec 6): atribucija vnosa po načinu — enotni
      // ingest_completed dogodek z mode propom (+ števec seje).
      trackIngestCompleted("link");

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
      // F3-C (audit §3 rec 6): atribucija vnosa po načinu (slika/VLM).
      trackIngestCompleted("image");

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
      // F3-C (audit §3 rec 6): atribucija vnosa po načinu (Google pins).
      trackIngestCompleted("pins");

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
      // F3-C (audit §3 rec 6): atribucija vnosa po načinu (PDF).
      trackIngestCompleted("pdf");

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
  // predvajalnik pod akcijsko vrstico. TASK 92: klient pošlje STRUKTURIRANE
  // podatke načrta (itinerary/dayKm/groupSize/locale) — skript si STREŽNIK
  // zgradi SAM (ista čista funkcija; API ni več splošni text-to-speech).
  // Stari zvok se razveljavi, ko se načrt spremeni (audioKey = zgoščena
  // vsebina). ===
  async function handleListenClick() {
    if (!audioScript || !itinerary || audioLoading) return;
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
      days: itinerary.days.length,
    });
    try {
      const res = await fetch("/api/itinerary/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itinerary,
          dayKm,
          groupSize: formData.groupSize,
          locale: locale === "en" ? "en" : "sl",
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        // I18N-FIX (1.33.0): strežniški SL detail v konzolo (dijagnostika),
        // klient vidi t() — lokalizirano, ne surove napake.
        if (data?.error) console.error("[itinerary/tts]", data.error);
        throw new Error(t("listenError"));
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
        // TASK 92: strežniški predpomnilnik (hit = 0 novih TTS klicev)
        cache: res.headers.get("X-TTS-Cache") ?? "",
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
              {/* TASK 8 / F3-C (issue #8 §25, audit §3 rec 1): VEDNO vidna
                  tiha pot do uvoza virov v zglavlju obrazca — uvozni blok
                  (#start-kjerkoli) je sicer en expand-klik stran, a z
                  obnovljenim načrtom je obrazec zložen v PlannerSummaryBar.
                  Utišan text-xs — SEKUNDARNO od AI vprašanja (uvoz NE sme
                  postati glavna akcija; HIDE ≠ DELETE). Klic = isti vzorec
                  kot mount razširitev hash-a (handleStartAnywhereJump). */}
              <button
                type="button"
                onClick={handleStartAnywhereJump}
                aria-label={t("startSourcesAria")}
                className="inline-flex min-h-[36px] w-fit items-center gap-1.5 rounded-sm text-xs font-medium text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Link2 className="size-3.5 shrink-0" aria-hidden />
                {t("startSourcesLink")}
                <span aria-hidden="true" className="text-muted-foreground/70">
                  →
                </span>
              </button>
            </CardHeader>
            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-5">
                {/* TASK 8 / D8-F (D8-B §5): "Iz moje poti" — trak zbirke nad
                    obrazcem (nad NL vnosom in blokom destinacij/uvoda virov).
                    Viden SAMO, ko zbirka ni prazna (tiho za nove uporabnike);
                    utišana kartica ne tekmuje z gumbom za generiranje. */}
                <PlannerMyTripStrip />
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
                    onKeyDown na vhodu.
                    Issue #3: id="start-kjerkoli" — sidro sekundarne povezave
                    iz heroja ("Imaš že svoje vire?"). */}
                <div
                  id="start-kjerkoli"
                  className="scroll-mt-[130px] rounded-lg border border-primary/20 bg-primary/5 p-3"
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
                      /* TASK 82: 0/NaN (izpraznjeno polje) se prikaže kot
                         prazno — ne kot "0" (prej vidna številka, ki je
                         nikoli ni želel videti) */
                      value={formData.days || ""}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          days: Number(e.target.value),
                        }));
                      }}
                      /* TASK 82: touched ob bluru — napaka se ne prikaže
                         med tipkanjem, ampak šele, ko polje zapusti */
                      onBlur={() =>
                        setTouched((p) => ({ ...p, days: true }))
                      }
                      aria-invalid={daysFieldError ? true : undefined}
                      aria-describedby={
                        daysFieldError ? "days-field-error" : undefined
                      }
                      ref={daysInputRef}
                      required
                    />
                    {daysFieldError && (
                      <p
                        id="days-field-error"
                        role="alert"
                        className="flex items-center gap-1.5 text-xs font-medium text-destructive"
                      >
                        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                        {daysFieldError}
                      </p>
                    )}
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
                      value={formData.budget || ""}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          budget: Number(e.target.value),
                        }));
                      }}
                      onBlur={() =>
                        setTouched((p) => ({ ...p, budget: true }))
                      }
                      aria-invalid={budgetFieldError ? true : undefined}
                      aria-describedby={
                        budgetFieldError ? "budget-field-error" : undefined
                      }
                      ref={budgetInputRef}
                      required
                    />
                    {budgetFieldError && (
                      <p
                        id="budget-field-error"
                        role="alert"
                        className="flex items-center gap-1.5 text-xs font-medium text-destructive"
                      >
                        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                        {budgetFieldError}
                      </p>
                    )}
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
                      value={formData.groupSize || ""}
                      onChange={(e) => {
                        fireStartedOnce();
                        setFormData((p) => ({
                          ...p,
                          groupSize: Number(e.target.value),
                        }));
                      }}
                      onBlur={() =>
                        setTouched((p) => ({ ...p, groupSize: true }))
                      }
                      aria-invalid={groupSizeFieldError ? true : undefined}
                      aria-describedby={
                        groupSizeFieldError ? "groupSize-field-error" : undefined
                      }
                      ref={groupSizeInputRef}
                      required
                    />
                    {groupSizeFieldError && (
                      <p
                        id="groupSize-field-error"
                        role="alert"
                        className="flex items-center gap-1.5 text-xs font-medium text-destructive"
                      >
                        <AlertCircle className="size-3.5 shrink-0" aria-hidden />
                        {groupSizeFieldError}
                      </p>
                    )}
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

                  {/* TASK 100 (TASK 99 na GitHubu): motor generiranja —
                      odgovor na zahtevo po načrtu BREZ AI modela.
                      "auto" (privzeto) = AI veriga z deterministično rezervo;
                      "deterministic" = čist motor: 0 žetonov, trenuten,
                      100 % reproducibilno. ISTA validacijska/obogatitvena
                      veriga (supply, vreme, OSRM, geo-validacija) kot AI pot. */}
                  <div className="space-y-2">
                    <Label>
                      <Sparkles className="size-4" aria-hidden />
                      {t("engineLabel")}
                    </Label>
                    <div
                      role="group"
                      aria-label={t("engineLabel")}
                      className="flex flex-wrap gap-1.5"
                    >
                      {ENGINE_OPTIONS.map((option) => {
                        const selected =
                          (formData.engine ?? "auto") === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => toggleEngine(option.value)}
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
                      {t("engineHint")}
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
                {/* TASK 8 / F3-A (§43 NO PARALLEL APP — druga smer mostu):
                    /potovanje je korak ponudnikov/logistike ISTEGA
                    načrtovalnika (prevozi, nastanitev, realne cene), ne
                    tekmujoč drugi načrtovalnik. Tiha, vedno vidna povezava
                    navzdol/nanaprej — izbire se od tam prenesejo sem
                    (handoff FIXED). Ni odvisna od trenutne izbire. */}
                <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-snug text-muted-foreground">
                  <span>{t("supplyCompanionLine")}</span>
                  <Link
                    href={locale === "en" ? "/en/potovanje" : "/potovanje"}
                    className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                  >
                    {t("supplyCompanionLink")}
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
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
            id="plan-workspace"
            className={cn(
              // TASK 4 / K-11: flex + order — MOBILNI vrstni red naslov →
              // dnevi → zemljevid → kontrole (revizija: uporabnik je videl
              // "Kaj naj spremenim na tvoji poti?" PREJDEN kot samo pot);
              // desktop (lg+) obdrži Issue #3 vrstni red (kontrole nad potjo).
              // space-y-5 dela tudi v flex-col (margins na DOM otrocih).
              "flex flex-col space-y-5 transition-opacity duration-300",
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
                    className="order-1 flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm text-primary animate-in fade-in slide-in-from-top-1 duration-300"
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

                {/* ISSUE #4 §22 (val 5): UNDO čip — razveljavi zadnji
                    destruktivni prehod (AI refinement / regeneracija).
                    Viden SAMO ko sklad NI prazen (canUndo vrata); gumb
                    vrne prejšnjo vsebino, X počisti celoten sklad
                    (iskreno: po čiščenju te seje ni več nazaj). */}
                {canUndo(undoStack) && (
                  <div
                    role="status"
                    className="order-1 flex items-center gap-2 rounded-full border border-violet-500/30 bg-violet-500/5 px-4 py-2 text-sm text-violet-700 dark:text-violet-300 animate-in fade-in slide-in-from-top-1 duration-300"
                  >
                    <Undo2 className="size-4 shrink-0" aria-hidden />
                    <span className="flex-1 font-medium">
                      {t("undoChip", {
                        count: undoStack.length,
                        label: peekUndo(undoStack)?.label ?? "",
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={handleUndo}
                      className="rounded-full px-2 py-0.5 font-semibold underline-offset-2 hover:bg-violet-500/10 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {t("undoChipAction")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setUndoStack([])}
                      className="rounded-full p-1 hover:bg-violet-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={t("undoChipDismiss")}
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                {/* Header */}
                <div className="order-2 flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold">
                    {t("resultTitle", { days: itinerary.days.length })}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        itinerary.source === "ai"
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : itinerary.source === "deterministic"
                          ? "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400"
                          : "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
                      )}
                    >
                      {itinerary.source === "ai"
                        ? t("badgeAI")
                        : itinerary.source === "deterministic"
                        ? t("badgeDeterministic")
                        : t("badgeSample")}
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

                {/* Issue #3 §3 (AI = CONTROL LAYER): kontrolna vrstica nad
                    potjo — čipi prilagoditve (manj vožnje, ceneje, več narave
                    …) + prosti ukaz so vidni TAKOJ, ne šele v zavihku raila.
                    KLICATA ISTI /api/itinerary/refine kot rail (enaka
                    obremenitev); polna izkušnja (zgodovina, PlanCopilot)
                    ostane v desnem stolpcu — HIDE ≠ DELETE. */}
                <PlannerAiControls
                  // K-11: mobilno ZA zemljevidom/dnevi (uporabnik najprej vidi
                  // POT, šele nato kontrole); desktop ostane nad potjo (lg:order-3).
                  className="order-8 lg:order-3"
                  itinerary={itinerary}
                  formData={formData}
                  onRefined={(newItinerary) => {
                    // §22 (val 5): AI refinement je DESTRUKTIVEN prehod —
                    // prejšnja vsebina gre na sejni undo sklad.
                    applyItinerary(newItinerary, t("undoLabelRefine"));
                    // Isti kanon kot rail refiner: lokalna persistenca +
                    // zastareli share link se umakne (P0.2)
                    persistItinerary(newItinerary, formData);
                    setShareUrl(null);
                    setCopied(false);
                  }}
                />

                {/* Issue #3 §4 (TRUST): zbitek preverb — ✓ Pot preverjena ·
                    ✓ Razdalje izračunane · ✓ Vreme preverjeno · ✓ Odprto ob
                    tvojem času. ISKRENO: ✓ samo, če je plast dejansko
                    izvedena in čista; ⚠ s številom sicer; manjkajoča plast
                    se ne izriše (nikoli lažni ✓). */}
                <PlannerTrustLine
                  // K-11: trust ZA naslovom tudi na mobilnem (iskrene oznake
                  // držijo kontekst naslova); desktop vrstni red nespremenjen.
                  className="order-3 lg:order-4"
                  itinerary={itinerary}
                  geoValidation={geoValidation}
                  // TASK 4 / K-15: klik na postavko razklopi Podrobnosti
                  // izračunov (dvignjeno stanje + scroll na razklopljeno
                  // sekcijo — prej skrito za zložkom in scrollom).
                  onOpenDetails={() => {
                    setCalcDetailsOpen(true);
                    requestAnimationFrame(() => {
                      // dva rAF: prvi renderira razklopljeno vsebino, drugi
                      // gladi scroll nanjo (kanon PlannerSummaryBar).
                      requestAnimationFrame(() => {
                        document
                          .getElementById("planner-calc-details")
                          ?.scrollIntoView({
                            behavior: "smooth",
                            block: "start",
                          });
                      });
                    });
                  }}
                />

                {/* UI sprint (točka B smeri): obrazec zložen v POVZETEK
                    parametrov — "Uredi" ga znova odpre nad delovno površino. */}
                <PlannerSummaryBar
                  className="order-4 lg:order-5"
                  formData={formData}
                  // F3-C (issue #8 §25): tiha pot do uvoza virov vidna TUDI
                  // v zloženem povzetku (zglavlje obrazca je takrat skrito).
                  onStartAnywhere={handleStartAnywhereJump}
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
                    // K-11: mobilno ZA dnevi (naslov → dnevi → zemljevid →
                    // kontrole); desktop lg:order-6 (zemljevid pred statusom).
                    "order-7 grid gap-4 lg:order-6",
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
                          vprašanje ≠ ukaz, obe plasti sta jasno ločeni.
                          TASK 4 / K-9: hitri akcije v railu SKRITE — primarna
                          vrstica jih že ima (vidne oznake obsega, K-8); rail
                          obdrži prosti ukaz + zgodovino (HIDE ≠ DELETE). */
                      <ItineraryRefiner
                        hideQuickActions
                        itinerary={itinerary}
                        formData={formData}
                        onRefined={(newItinerary) => {
                          // §22 (val 5): AI refinement je DESTRUKTIVEN prehod —
                          // prejšnja vsebina gre na sejni undo sklad.
                          applyItinerary(newItinerary, t("undoLabelRefine"));
                          // Refiniran načrt se shrani lokalno (deljiva povezava ostane ista
                          // dokler uporabnik znova klikne "Shrani in deli")
                          persistItinerary(newItinerary, formData);
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
                    className="order-9 lg:order-7"
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
                    // TASK 4 / K-15: nadzorovani razklop (dvignjeno stanje —
                    // sproža ga tudi trust vrstica zgoraj).
                    open={calcDetailsOpen}
                    onOpenChange={setCalcDetailsOpen}
                  />
                )}

                {/* P0-4: mobilna/tabletna navigacija po dnevih potovanja — lepljiva
                    vrstica pod glavo (scroll-spy tabi + bližnjici Prilagodi/Shrani).
                    Na desktopu (lg+) skrita — dvostolpčni pogled je dovolj pregleden.
                    K-11: mobilno Neposredno pred dnevi (order-5), desktop lg:order-8. */}
                <PlannerDayNav
                  className="order-5 lg:order-8"
                  days={itinerary.days}
                />

                {/* Day plans — K-11: mobilno PREJDEN zemljevidom in kontroli
                    (order-6); desktop za zemljevidom (lg:order-9). */}
                <div className="order-6 space-y-4 lg:order-9">
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
                          {/* M7 (Issue #5 / T5-D): odstrani TA dan (0 AI;
                              preostali se preštevilčijo). Skrito, ko je dan
                              edini (varovalka minimalnega obsega). */}
                          {itinerary.days.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDay(day)}
                              className="shrink-0 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              aria-label={t("removeDayAria", {
                                day: day.day,
                              })}
                              title={t("removeDayTitle")}
                            >
                              <Trash2 className="size-4" aria-hidden />
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
                          // Točka D smeri: premik med postanki — izračun nad
                          // obstoječimi poli; segment dneva (TASK 93) iz
                          // skupne lib (ena resnica za vse površine)
                          const prev = idx > 0 ? day.locations[idx - 1] : null;
                          // Glava segmenta se pokaže ob prehodu (Jutro →
                          // Popoldan → Večer) ali na prvem postanku dneva;
                          // neznani sloti → brez glave
                          const { segment: seg, showHeader: showSegHeader } =
                            segmentBoundaryAt(day.locations, idx);
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
                              {showSegHeader && seg && (
                                <DaySegmentHeader
                                  segment={seg}
                                  lang={locale === "en" ? "en" : "sl"}
                                />
                              )}
                              <div
                                id={`stop-row-${day.day}-${idx}`}
                                className={cn(
                                  "rounded-lg border bg-card/50 p-4 transition-shadow",
                                  // M7: vizualni odziv cilja spusta (samo
                                  // znotraj istega dneva, ne na sam izvor):
                                  dragging &&
                                    dragOver?.day === day.day &&
                                    dragOver.idx === idx &&
                                    !(dragging.day === day.day && dragging.idx === idx) &&
                                    "ring-2 ring-primary/50 border-primary/40"
                                )}
                                // M7 (Issue #5 / T5-D): HTML5 vlečenje (miš);
                                // dotik/tipkovnica/bralniki imajo puščici ↑/↓.
                                draggable={day.locations.length > 1}
                                onDragStart={(e) => {
                                  setDragging({ day: day.day, idx });
                                  e.dataTransfer.effectAllowed = "move";
                                  // Firefox zahteva podatke za pričetek vleka:
                                  e.dataTransfer.setData(
                                    "text/plain",
                                    `${day.day}:${idx}`
                                  );
                                }}
                                onDragOver={(e) => {
                                  if (dragging?.day !== day.day) return;
                                  e.preventDefault();
                                  e.dataTransfer.dropEffect = "move";
                                  setDragOver({ day: day.day, idx });
                                }}
                                onDrop={(e) => {
                                  e.preventDefault();
                                  if (
                                    dragging &&
                                    dragging.day === day.day &&
                                    dragging.idx !== idx
                                  ) {
                                    applyStopReorder(day, dragging.idx, idx);
                                  }
                                  setDragging(null);
                                  setDragOver(null);
                                }}
                                onDragEnd={() => {
                                  setDragging(null);
                                  setDragOver(null);
                                }}
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
                                        draggable={false}
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
                                        {/* M7 (Issue #5 / T5-D): ROČNO
                                            prestavljanje — puščici ↑/↓
                                            (tipkovnica + dotik + bralniki) +
                                            ročaj (vizualna oznaka vleka).
                                            ISTA deterministična operacija
                                            kot drag/drop. */}
                                        {day.locations.length > 1 && (
                                          <span className="inline-flex items-center gap-0.5">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                applyStopReorder(day, idx, idx - 1)
                                              }
                                              disabled={idx === 0}
                                              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                                              aria-label={t("moveStopUpAria", {
                                                name: loc.destination_name,
                                              })}
                                              title={t("moveStopUpTitle")}
                                            >
                                              <ChevronUp
                                                className="size-4"
                                                aria-hidden
                                              />
                                            </button>
                                            <button
                                              type="button"
                                              onClick={() =>
                                                applyStopReorder(day, idx, idx + 1)
                                              }
                                              disabled={
                                                idx === day.locations.length - 1
                                              }
                                              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
                                              aria-label={t("moveStopDownAria", {
                                                name: loc.destination_name,
                                              })}
                                              title={t("moveStopDownTitle")}
                                            >
                                              <ChevronDown
                                                className="size-4"
                                                aria-hidden
                                              />
                                            </button>
                                            <span
                                              className="hidden cursor-grab select-none rounded-full p-1.5 text-muted-foreground/60 md:inline-flex"
                                              title={t("dragHandleTitle")}
                                              aria-hidden
                                            >
                                              <GripVertical
                                                className="size-4"
                                              />
                                            </span>
                                          </span>
                                        )}
                                        {/* D6-B (Issue #6, M7+): prestavi
                                            postanek v PREJŠNJI/NASLEDNJI dan
                                            (0 AI, 0 omrežja — čista operacija
                                            moveStopToDay). Postanek se prine
                                            na KONEC ciljnega dneva z vsemi
                                            polji (intentLocked potuje z njim
                                            — §21). Gumba sta vidna SAMO, ko
                                            ima načrt več kot en dan; na
                                            mejah (dan 1 / zadnji dan) sta
                                            pošteno onemogočena. */}
                                        {itinerary.days.length > 1 && (
                                          <span className="inline-flex items-center gap-0.5">
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                                              disabled={day.day === 1}
                                              onClick={() =>
                                                handleMoveStopToDay(
                                                  day,
                                                  idx,
                                                  day.day - 1
                                                )
                                              }
                                              aria-label={t("moveStopToPrevDayAria", {
                                                name: loc.destination_name,
                                              })}
                                              title={t("moveStopToPrevDayAria", {
                                                name: loc.destination_name,
                                              })}
                                            >
                                              <ChevronLeft
                                                className="size-4"
                                                aria-hidden
                                              />
                                            </Button>
                                            <Button
                                              type="button"
                                              variant="ghost"
                                              size="sm"
                                              className="h-7 w-7 rounded-full p-0 text-muted-foreground hover:text-primary disabled:pointer-events-none disabled:opacity-30"
                                              disabled={
                                                day.day ===
                                                itinerary.days.length
                                              }
                                              onClick={() =>
                                                handleMoveStopToDay(
                                                  day,
                                                  idx,
                                                  day.day + 1
                                                )
                                              }
                                              aria-label={t("moveStopToNextDayAria", {
                                                name: loc.destination_name,
                                              })}
                                              title={t("moveStopToNextDayAria", {
                                                name: loc.destination_name,
                                              })}
                                            >
                                              <ChevronRight
                                                className="size-4"
                                                aria-hidden
                                              />
                                            </Button>
                                          </span>
                                        )}
                                        <Badge variant="outline" className="gap-1">
                                          <Clock className="size-3" aria-hidden />
                                          {loc.duration}h
                                        </Badge>
                                        {/* TASK 50 (§10/§11): estimated_cost je
                                            lahko NaN/null — postanek, katerega
                                            cene strežnik NI mogel verificirati
                                            (vir nepriključen). Značilka cene se
                                            skrije (unknown ≠ 0 = "brezplačno"),
                                            opomba postanka pove, kaj preveriti.
                                            TASK 99 (issue #1 §4): če kanonska
                                            opomba postanka pravi „cena: od …" /
                                            „price: from …" (supply validacija),
                                            je ta znesek FROM_PRICE — znaczka
                                            izpiše „od €X“ (spodnja meja), ne
                                            gol €X, kot da bi bila zagotovljena
                                            končna cena. */}
                                        {typeof loc.estimated_cost === "number" &&
                                          loc.estimated_cost > 0 && (
                                          <Badge className="bg-accent text-accent-foreground">
                                            {FROM_PRICE_NOTE_RE.test(loc.notes ?? "")
                                              ? `od €${loc.estimated_cost}`
                                              : `€${loc.estimated_cost}`}
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
                                              // TASK 4 / K-14 (UX FIX PASS):
                                              // gumb nosi napis "Vstopnice" →
                                              // odpreti mora zavihek AKTIVNOSTI
                                              // (Tiqets/izkušnje), ne privzete
                                              // nastanitve. Prej je plošča po
                                              // scrollu vedno pokazala
                                              // Booking.com (živi dokaz:
                                              // Bohinj → Nastanitev).
                                              document.dispatchEvent(
                                                new CustomEvent(
                                                  "dsa:booking-tab",
                                                  {
                                                    detail: {
                                                      panelId: `booking-panel-${day.day}`,
                                                      tab: "activities",
                                                    },
                                                  }
                                                )
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
                          // ISSUE #4 §21 (VAL 6): dan z NAMERNIMI postanki
                          // (intentLocked — FIXED izbire/uporabnikovo dodani)
                          // pod gumbom POŠTENO pove, da ti ostanejo na mestu
                          // (optimizeDayOrder jih zamrzne — route-order.ts v2).
                          const lockedCount = day.locations.filter(
                            (l) => l.intentLocked === true
                          ).length;
                          return (
                            <div className="space-y-1.5">
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
                              {lockedCount > 0 && (
                                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                                  <Lock
                                    className="size-3 shrink-0"
                                    aria-hidden
                                  />
                                  {t("optimizeLockedHint")}
                                </p>
                              )}
                            </div>
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
                        {/* TASK 97: tripDays = dolžina celega načrta → /go/insurance?days=… */}
                        <BookingPanel
                          dayPlan={day}
                          bookingData={bookingData}
                          tripDays={itinerary.days.length}
                          id={`booking-panel-${day.day}`}
                        />
                      </CardContent>
                    </Card>
                    );
                  })}

                  {/* M7 (Issue #5 / T5-D): dodaj PRAZEN dan na konec (0 AI,
                      deterministično; max 14 — isti limit kot obrazec, gumb
                      se pošteno onesposobi na meji). formData.days se
                      sinhronizira v handlerju. */}
                  <button
                    type="button"
                    onClick={handleAddDay}
                    disabled={itinerary.days.length >= MAX_PLANNER_DAYS}
                    className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 text-sm font-semibold text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
                    aria-label={t("addDayAria")}
                    title={t("addDayAria")}
                  >
                    <Plus className="size-4" aria-hidden />
                    {t("addDay")}
                  </button>
                </div>


                {/* === AKCIJSKA VRSTICA: shrani/deli + e-pošta === */}
                {/* id="itinerary-actions" — cilj mobilne bližnjice "Shrani" (P0-4) */}
                <Card id="itinerary-actions" className="order-10 scroll-mt-[130px] lg:scroll-mt-24">
                  <CardContent className="space-y-4 p-4">
                    {/* === TASK 28 (Tier 1 #1): LIVE-SYNC BANNER — strežnik
                        poroča NOVEJŠO različico povezane pote. ČISTA povezava
                        (brez lokalnih sprememb) → gumb „Naloži“; umazana
                        (linkedTrip.itinerary ≠ itinerary) → iskren opozorilo
                        brez gumba (naloga bi izbrisala nehranjene spremembe —
                        najprej shrani kot novo povezavo). === */}
                    {planUpdateStale && linkedTrip && (
                      <div
                        role="status"
                        aria-live="polite"
                        className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
                      >
                        <div className="flex items-start gap-3">
                          <RefreshCw className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                          <div className="min-w-0 flex-1 space-y-2">
                            <p className="text-sm font-semibold">
                              {t("planUpdatedBannerTitle")}
                            </p>
                            <p className="text-sm">
                              {t("planUpdatedBannerDesc", {
                                version: planUpdateServerVersion ?? "—",
                              })}
                            </p>
                            {activeShareId === null && (
                              <p className="text-sm font-medium">
                                {t("planUpdatedLocalEdits")}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2 pt-1">
                              {activeShareId !== null && (
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={handleLoadServerVersion}
                                  disabled={planUpdateBusy}
                                  className="gap-1.5 border-amber-400 bg-white text-amber-900 hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900 dark:text-amber-100 dark:hover:bg-amber-800"
                                >
                                  {planUpdateBusy ? (
                                    <Loader2 className="size-4 animate-spin" aria-hidden />
                                  ) : (
                                    <RefreshCw className="size-4" aria-hidden />
                                  )}
                                  {planUpdateBusy
                                    ? t("planUpdatedLoading")
                                    : t("planUpdatedLoadButton")}
                                </Button>
                              )}
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                onClick={dismissPlanUpdate}
                                className="text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-300 dark:hover:bg-amber-900/60"
                              >
                                {t("planUpdatedDismiss")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    {/* TASK 8 / D8-F (issue #8 §5, D8-B §5): razbremenitev
                        akcijske vrstice — PRIMARNI "Shrani in deli" +
                        sekundarni "Zaženi Na poti" + meni "Več" (E-pošta,
                        .ics, Poslušaj). ČISTA RE-PREZENTACIJA: vsi handlerji
                        in aria-labels so IDENTIČNI prejšnjim gumbom (zero
                        loss, issue §42). */}
                    <div className="flex flex-wrap items-center gap-2">
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
                      {/* TASK 4 / K-7 (UX FIX PASS): „Zaženi Na poti“ — GO člen
                          DISCOVER→PLAN→BOOK→GO NEPRETRGANO iz načrtovalnika.
                          Itinerer se pretvori (čista funkcija) in shrani NA
                          NAPRAVO (dai:go-trip v2) — Na poti deluje tudi brez
                          signala. Prej ta most NI obstajal. */}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleStartGoMode}
                        disabled={loading}
                        className="gap-1.5 border-emerald-300 text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950"
                        aria-label={t("goModeButtonAria")}
                      >
                        <Footprints className="size-4" aria-hidden />
                        {t("goModeButton")}
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={loading}
                            className="gap-1.5"
                          >
                            <MoreHorizontal className="size-4" aria-hidden />
                            {t("moreActions")}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="min-w-[240px]">
                          {/* E-pošta — ista zanka setEmailOpen kot prejšnji
                              gumb (obrazec se odpre spodaj) */}
                          <DropdownMenuItem
                            onSelect={() => {
                              setEmailOpen((v) => !v);
                              setEmailError(null);
                            }}
                            aria-expanded={emailOpen}
                            aria-label={t("emailButtonAriaLabel")}
                            className="gap-2"
                          >
                            <Mail className="size-4" aria-hidden />
                            {t("emailMenu")}
                          </DropdownMenuItem>
                          {/* F5.2: načrt v koledar (.ics) — Apple Koledar /
                              Google Calendar / Outlook, brez strežniškega klica */}
                          <DropdownMenuItem
                            onSelect={handleIcsDownload}
                            aria-label={t("icsButtonAria")}
                            className="gap-2"
                          >
                            <CalendarArrowDown className="size-4" aria-hidden />
                            {t("icsMenu")}
                          </DropdownMenuItem>
                          {/* D2 (nabor #2, Mindtrip audio): zvočni povzetek
                              načrta. Skript se sestavi deterministično (0 AI)
                              iz podatkov načrta; TTS ga izgovori na strežniku.
                              Pogoj enak prej: samo ko audioScript obstaja. */}
                          {audioScript && (
                            <DropdownMenuItem
                              onSelect={() => void handleListenClick()}
                              disabled={audioLoading || loading}
                              aria-label={t("listenButtonAria")}
                              aria-expanded={Boolean(
                                audioUrl && audioUrlKey === audioKey
                              )}
                              className="gap-2"
                            >
                              {audioLoading ? (
                                <Loader2 className="size-4 animate-spin" aria-hidden />
                              ) : (
                                <Volume2 className="size-4" aria-hidden />
                              )}
                              {audioLoading ? t("listenGenerating") : t("listenButton")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
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
                    ostane čista. Vsebina razdelkov je nespremenjena.
                    K-11: order-11 v flex delovni površini. */}
                <Card className="order-11">
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
                  className="order-12"
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
                <SmartPackingSection
                  className="order-13"
                  itinerary={itinerary}
                  input={formData}
                />

                {/* WOW: AI Trip Timeline — vizualni dan (TASK 88: datum odhoda
                    poganja ŽIVO dnevno napoved — čip na glavi dneva) */}
                <TripTimeline
                  className="order-14"
                  days={itinerary.days}
                  totalBudget={itinerary.total_budget}
                  tripStartDate={itinerary.tripStartDate}
                  legs={itinerary.legs}
                />
                    </CardContent>
                  )}
                </Card>

                {/* WOW: Social Sharing — deli svoj AI plan */}
                <div className="order-15 flex items-center justify-center gap-3 py-2">
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

        {/* D6-B (Issue #6, M7+): POTRDITEV pred odstranitvijo dneva S
            postanki (destruktiven popravek — opozorilo o N postankih, ki
            bodo izbrisani iz načrta). Krmiljano prek removeDayPending
            (handleRemoveDay); prazni dnevi se odstranijo takoj, brez tega
            dialoga. Portal — postavitev v drevesu ni vidna v DOM-u. */}
        <AlertDialog
          open={removeDayPending !== null}
          onOpenChange={(open) => {
            if (!open) setRemoveDayPending(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {t("removeDayConfirmTitle", {
                  day: removeDayPending?.day ?? 0,
                })}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {t("removeDayConfirmDesc", {
                  count: removeDayPending?.locations.length ?? 0,
                })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setRemoveDayPending(null)}>
                {t("removeDayConfirmCancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  const day = removeDayPending;
                  setRemoveDayPending(null);
                  if (day) applyRemoveDay(day);
                }}
                className="bg-destructive text-white hover:bg-destructive/90"
              >
                {t("removeDayConfirmAction")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  );
}

export default ItineraryPlanner;
