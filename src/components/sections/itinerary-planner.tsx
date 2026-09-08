"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import {
  Sparkles,
  Clock,
  Calendar,
  Euro,
  Users,
  MapPin,
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
import type { PlannerInput, Itinerary, Season } from "@/lib/types";
import { useAppStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import { trackFunnel } from "@/lib/funnel";
import { saveItinerary, fetchSharedItinerary } from "@/lib/itinerary-share";
import { cn } from "@/lib/utils";
import { BookingPanel, type BookingData } from "@/components/sections/booking-panel";
import { ItineraryRefiner } from "@/components/sections/itinerary-refiner";
import { SocialShare } from "@/components/social-share";
import { TripTimeline } from "@/components/trip-timeline";
import { BookingAssistant } from "@/components/booking-assistant";

const SEASONS: { value: Season; label: string }[] = [
  { value: "spring", label: "Pomlad" },
  { value: "summer", label: "Poletje" },
  { value: "autumn", label: "Jesen" },
  { value: "winter", label: "Zima" },
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
    p.groupSize >= 1
  );
}

/**
 * AI Itinerary Planner — jedrna funkcija platforme Discover Slovenia AI.
 * Uporabnik izpolni obrazec (dnevi, proračun, skupina, sezona, interesi),
 * AI pa sestavi personalno dogodkovno povzetek potovanja po Sloveniji.
 */
export function ItineraryPlanner() {
  const { toast } = useToast();

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
            title: "Deljeni načrt odprt! 🇸🇮",
            description: data.name
              ? `Načrt „${data.name}“ je naložen v načrtovalnik.`
              : "Deljeni načrt je naložen v načrtovalnik.",
          });
          setTimeout(() => {
            document.getElementById("načrtuj")?.scrollIntoView({ behavior: "smooth", block: "start" });
          }, 150);
        })
        .catch(() => {
          toast({
            title: "Napaka",
            description: "Deljenega načrta ni bilo mogoče odpreti.",
            variant: "destructive",
          });
        });
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

  // === WOW: Poslušaj heroQuery event iz Hero Quick Input ===
  useEffect(() => {
    const handleHeroQuery = (e: Event) => {
      const query = (e as CustomEvent<string>).detail;
      if (!query) return;

      // Smart defaults glede na query
      const lowerQuery = query.toLowerCase();
      const newInterests: string[] = [];

      if (lowerQuery.includes("narav") || lowerQuery.includes("pohod") || lowerQuery.includes("gor")) newInterests.push("narava");
      if (lowerQuery.includes("hran") || lowerQuery.includes("jest") || lowerQuery.includes("kosil") || lowerQuery.includes("večerj")) newInterests.push("kulinarika");
      if (lowerQuery.includes("vin") || lowerQuery.includes("pij")) newInterests.push("kulinarika");
      if (lowerQuery.includes("avantur") || lowerQuery.includes("raft") || lowerQuery.includes("adrenalin")) newInterests.push("avantura");
      if (lowerQuery.includes("otrok") || lowerQuery.includes("družin")) newInterests.push("družina");
      if (lowerQuery.includes("romanti")) newInterests.push("romantika");
      if (lowerQuery.includes("kultur") || lowerQuery.includes("zgodovin") || lowerQuery.includes("mest")) newInterests.push("kultura");
      if (lowerQuery.includes("wellness") || lowerQuery.includes("spa") || lowerQuery.includes("zdravil")) newInterests.push("wellness");

      // Določi število dni iz query-ja
      let days = 3;
      const hourMatch = lowerQuery.match(/(\d+)\s*ur/);
      const dayMatch = lowerQuery.match(/(\d+)\s*dan|(\d+)\s*dnev/);
      if (hourMatch) days = 1;
      else if (dayMatch) days = parseInt(dayMatch[1] || dayMatch[2], 10);

      // Določi group size
      let groupSize = 2;
      const groupMatch = lowerQuery.match(/(\d+)\s*oseb|(\d+)\s*odrasl|(\d+)\s*ljud/);
      if (groupMatch) groupSize = parseInt(groupMatch[1] || groupMatch[2] || groupMatch[3], 10);
      if (lowerQuery.includes("družin") || lowerQuery.includes("otrok")) groupSize = 4;
      if (lowerQuery.includes("sam")) groupSize = 1;

      // Sezona iz query-ja (npr. kviz CTA: "... poleti, s partnerjem ...")
      let season: Season = "summer";
      if (lowerQuery.includes("pomlad")) season = "spring";
      else if (lowerQuery.includes("polet") || lowerQuery.includes("juni") || lowerQuery.includes("julij") || lowerQuery.includes("avgust")) season = "summer";
      else if (lowerQuery.includes("jesen")) season = "autumn";
      else if (lowerQuery.includes("zim") || lowerQuery.includes("smuč")) season = "winter";

      const smartInput: PlannerInput = {
        budget: 500,
        days,
        interests: newInterests.length > 0 ? newInterests : ["narava", "kultura"],
        season,
        groupSize,
      };

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

  function validate(input: PlannerInput): string | null {
    if (!Number.isFinite(input.days) || input.days < 1 || input.days > 14) {
      return "Število dni mora biti med 1 in 14.";
    }
    if (!Number.isFinite(input.budget) || input.budget <= 0) {
      return "Proračun mora biti večji od 0 €.";
    }
    if (!Number.isFinite(input.groupSize) || input.groupSize < 1 || input.groupSize > 20) {
      return "Velikost skupine mora biti med 1 in 20.";
    }
    if (input.interests.length === 0) {
      return "Izberite vsaj en interes.";
    }
    return null;
  }

  async function generateItinerary(input: PlannerInput) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) throw new Error("Napaka pri generiranju");
      const data: Itinerary = await res.json();
      setItinerary(data);

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
        title: "Itinerer generiran!",
        description:
          data.source === "ai"
            ? "AI je sestavil vaš popoln načrt potovanja."
            : "Prikazan je pripravljen predlog itinererja.",
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Napaka pri generiranju itinererja";
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
      trackFunnel("itinerary_saved");
      toast({
        title: "Načrt shranjen!",
        description: "Povezavo za deljenje lahko kopiraš spodaj.",
      });
    } catch {
      setShareError("Shranjevanje ni uspelo — poskusi znova");
      toast({
        title: "Napaka pri shranjevanju",
        description: "Shranjevanje ni uspelo — poskusi znova.",
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
      setEmailError("Vpiši veljaven e-poštni naslov.");
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
        throw new Error(data?.error || "Pošiljanje ni uspelo — poskusi znova.");
      }
      setEmailSentTo(trimmed);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : "Pošiljanje ni uspelo — poskusi znova.");
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
        title: "Preverite vnose",
        description: vErr,
        variant: "destructive",
      });
      return;
    }
    await generateItinerary(formData);
  }

  return (
    <section
      id="načrtuj"
      className="scroll-mt-24 bg-gradient-to-b from-muted/40 to-background py-16 sm:py-20 lg:py-24"
    >
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
          {/* === LEVO — obrazec === */}
          <Card className="h-fit">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Sparkles className="size-6 text-primary" aria-hidden />
                <CardTitle className="text-2xl sm:text-3xl">
                  AI načrtovalec potovanj
                </CardTitle>
              </div>
              <CardDescription className="text-base">
                Povej nam želje in AI sestavi popoln itinerer
              </CardDescription>
            </CardHeader>
            <form onSubmit={handleSubmit} noValidate>
              <CardContent className="space-y-5">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="days" className="flex items-center gap-2">
                      <Calendar className="size-4" aria-hidden />
                      Število dni
                    </Label>
                    <Input
                      id="days"
                      name="days"
                      type="number"
                      min={1}
                      max={14}
                      value={formData.days}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          days: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="budget" className="flex items-center gap-2">
                      <Euro className="size-4" aria-hidden />
                      Proračun (€)
                    </Label>
                    <Input
                      id="budget"
                      name="budget"
                      type="number"
                      min={50}
                      max={5000}
                      step={50}
                      value={formData.budget}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          budget: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="groupSize" className="flex items-center gap-2">
                      <Users className="size-4" aria-hidden />
                      Velikost skupine
                    </Label>
                    <Input
                      id="groupSize"
                      name="groupSize"
                      type="number"
                      min={1}
                      max={20}
                      value={formData.groupSize}
                      onChange={(e) =>
                        setFormData((p) => ({
                          ...p,
                          groupSize: Number(e.target.value),
                        }))
                      }
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="season" className="flex items-center gap-2">
                      <Cloud className="size-4" aria-hidden />
                      Sezona
                    </Label>
                    <Select
                      value={formData.season}
                      onValueChange={(v: Season) =>
                        setFormData((p) => ({ ...p, season: v }))
                      }
                    >
                      <SelectTrigger id="season" className="w-full">
                        <SelectValue placeholder="Izberi sezono" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEASONS.map((s) => (
                          <SelectItem key={s.value} value={s.value}>
                            {s.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Interesi</Label>
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
                      AI razmišlja...
                    </>
                  ) : (
                    <>
                      <Sparkles className="size-4" aria-hidden />
                      Generiraj itinerer ✨
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
                      Vaš itinerer se bo prikazal tukaj
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Izpolnite obrazec in kliknite »Generiraj itinerer«.
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
                <AlertTitle>Napaka</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>{error}</p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => generateItinerary(formData)}
                  >
                    <AlertCircle className="size-3.5" aria-hidden />
                    Poskusi znova
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
                    <span className="flex-1 font-medium">Obnovljen tvoj zadnji načrt</span>
                    <button
                      type="button"
                      onClick={() => setRestoredVisible(false)}
                      className="rounded-full p-1 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label="Skrij obvestilo o obnovljenem načrtu"
                    >
                      <X className="size-4" aria-hidden />
                    </button>
                  </div>
                )}

                {/* Header */}
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h3 className="text-2xl font-bold">
                    Vaš {itinerary.days.length}-dnevni itinerer
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
                      {itinerary.source === "ai" ? "AI" : "Predlog"}
                    </Badge>
                    <Badge className="bg-primary text-primary-foreground">
                      Skupaj ~€{itinerary.total_budget}
                    </Badge>
                  </div>
                </div>

                {/* Multi-turn AI refiner — uporabnik naravnojezično spreminja itinerer */}
                <ItineraryRefiner
                  itinerary={itinerary}
                  formData={formData}
                  onRefined={(newItinerary) => {
                    setItinerary(newItinerary);
                    // Refiniran načrt se shrani lokalno (deljiva povezava ostane ista 
                    // dokler uporabnik znova klikne "Shrani in deli")
                    persistItineraryLocally(newItinerary, formData);
                  }}
                />

                {/* Day plans */}
                <div className="space-y-4">
                  {itinerary.days.map((day) => (
                    <Card key={day.day}>
                      <CardHeader>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <Calendar className="size-5 text-primary" aria-hidden />
                            Dan {day.day}
                          </CardTitle>
                          <Badge variant="secondary" className="gap-1.5">
                            <Cloud className="size-3.5" aria-hidden />
                            {day.weather.condition} · {day.weather.temp}°C
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {day.locations.map((loc, idx) => {
                          return (
                            <div
                              key={`${loc.destination_id}-${idx}`}
                              className="rounded-lg border bg-card/50 p-4"
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
                                </div>
                              </div>
                              {loc.notes && (
                                <p className="mt-2 text-sm text-muted-foreground">
                                  {loc.notes}
                                </p>
                              )}
                            </div>
                          );
                        })}

                        {/* Booking panel za ta dan — nastanitev, aktivnosti, hrana, transport */}
                        {/* id="booking-panel-{dan}" — nanj kaže gumb "Rezerviraj" v TripTimeline */}
                        <BookingPanel
                          dayPlan={day}
                          bookingData={bookingData}
                          id={`booking-panel-${day.day}`}
                        />
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Recommendations */}
                {itinerary.recommendations.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Star className="size-5 text-primary" aria-hidden />
                        Priporočila
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
                        Nasveti
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

                {/* WOW: AI Trip Timeline — vizualni dan */}
                <TripTimeline days={itinerary.days} totalBudget={itinerary.total_budget} />

                {/* === AKCIJSKA VRSTICA: shrani/deli + e-pošta === */}
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        onClick={handleSaveShare}
                        disabled={saving || loading}
                        className="gap-1.5"
                        aria-label="Shrani itinerer in ustvari deljivo povezavo"
                      >
                        {saving ? (
                          <Loader2 className="size-4 animate-spin" aria-hidden />
                        ) : (
                          <Share2 className="size-4" aria-hidden />
                        )}
                        {saving ? "Shranjujem..." : "Shrani in deli"}
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
                        aria-label="Pošlji itinerer na e-poštni naslov"
                      >
                        <Mail className="size-4" aria-hidden />
                        Pošlji na e-poštni naslov
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
                            aria-label="Deljiva povezava do itinererja"
                            className="flex-1 font-mono text-xs"
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={copyShareLink}
                            className="gap-1.5"
                            aria-label="Kopiraj deljivo povezavo"
                          >
                            {copied ? (
                              <Check className="size-4 text-emerald-600" aria-hidden />
                            ) : (
                              <Copy className="size-4" aria-hidden />
                            )}
                            {copied ? "Kopirano!" : "Kopiraj"}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Vsak, ki odpre to povezavo, bo videl tvoj načrt — tudi
                          na telefonu.
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
                          placeholder="tvoj@email.si"
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
                          aria-label="Pošlji itinerer na e-pošto"
                        >
                          {emailSending ? (
                            <Loader2 className="size-4 animate-spin" aria-hidden />
                          ) : (
                            <Mail className="size-4" aria-hidden />
                          )}
                          {emailSending ? "Pošiljam..." : "Pošlji"}
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
                        Itinerer poslan na {emailSentTo}!
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* WOW: Social Sharing — deli svoj AI plan */}
                <div className="flex items-center justify-center gap-3 py-2">
                  <SocialShare
                    title="Moj AI načrt potovanja po Sloveniji 🇸🇮"
                    destinations={Array.from(new Set(itinerary.days.flatMap((d) => d.locations.map((l) => l.destination_name))))}
                    description={`${itinerary.days.length}-dnevni AI načrt · €${itinerary.total_budget}`}
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
