"use client";

import { useState, useCallback } from "react";
import { Sparkles, Heart, Mountain, UtensilsCrossed, Users, Clock, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// AI MEMORY / TRIP PROFILE — osebni asistent ki si zapomni preference
// ============================================================================
//
// Prvi obisk:
// "Rad imaš: ✓ naravo ✓ lokalno hrano ✓ mirne lokacije"
//
// Naslednji obisk:
// "Dobrodošel nazaj! Tokrat predlagam Koroško."
//
// Shranjuje v localStorage (brez računa potrebno).
// ============================================================================

export interface TripProfile {
  interests: string[];
  preferredSeason: string | null;
  budgetRange: string | null;
  groupType: string | null;
  visitedDestinations: string[];
  lastVisit: string | null;
  visitCount: number;
  onboardingCompleted: boolean;
  travelStyle?: string | null; // foodie | adventurer | budget | luxury | culture | nature
}

const DEFAULT_PROFILE: TripProfile = {
  interests: [],
  preferredSeason: null,
  budgetRange: null,
  groupType: null,
  visitedDestinations: [],
  lastVisit: null,
  visitCount: 0,
  onboardingCompleted: false,
  travelStyle: null,
};

const STORAGE_KEY = "discoverslovenia_profile";

// Hook za uporabo profile
export function useTripProfile() {
  const [profile, setProfile] = useState<TripProfile>(() => {
    if (typeof window === "undefined") return DEFAULT_PROFILE;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_PROFILE, ...JSON.parse(stored) as TripProfile };
      }
    } catch {}
    return DEFAULT_PROFILE;
  });
  const loaded = true; // Always loaded — lazy initializer reads from localStorage

  const save = useCallback((newProfile: TripProfile) => {
    setProfile(newProfile);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newProfile));
    } catch {
      // Ignore
    }
  }, []);

  const updateProfile = useCallback((updates: Partial<TripProfile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...updates };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const addVisitedDestination = useCallback((destId: string) => {
    setProfile((prev) => {
      if (prev.visitedDestinations.includes(destId)) return prev;
      const updated = {
        ...prev,
        visitedDestinations: [...prev.visitedDestinations, destId],
        visitCount: prev.visitCount + 1,
        lastVisit: new Date().toISOString(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback((data: Partial<TripProfile>) => {
    setProfile((prev) => {
      const updated = {
        ...prev,
        ...data,
        onboardingCompleted: true,
        visitCount: prev.visitCount + 1,
        lastVisit: new Date().toISOString(),
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, []);

  const resetProfile = useCallback(() => {
    setProfile(DEFAULT_PROFILE);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  return {
    profile,
    loaded,
    save,
    updateProfile,
    addVisitedDestination,
    completeOnboarding,
    resetProfile,
  };
}

// ============================================================================
// ONBOARDING MODAL — prvi obisk, zbiranje preferenc
// ============================================================================

const INTEREST_OPTIONS = [
  { id: "narava", label: "Narava", icon: Mountain },
  { id: "kulinarika", label: "Lokalna hrana", icon: UtensilsCrossed },
  { id: "avantura", label: "Avantura", icon: Sparkles },
  { id: "kultura", label: "Kultura", icon: Heart },
];

const GROUP_OPTIONS = [
  { id: "solo", label: "Sam/a" },
  { id: "par", label: "Par" },
  { id: "druzina", label: "Družina" },
  { id: "prijatelji", label: "Prijatelji" },
];

const BUDGET_OPTIONS = [
  { id: "low", label: "Budžetno (<€50/dan)" },
  { id: "mid", label: "Udobje (€50-150/dan)" },
  { id: "lux", label: "Luksuz (€150+/dan)" },
];

// Travel style matching (Layla.ai inspiracija)
const TRAVEL_STYLES = [
  { id: "foodie", label: "Foodie", emoji: "🍷", desc: "Lokalna hrana in vino" },
  { id: "adventurer", label: "Adventurer", emoji: "🧗", desc: "Aktivnosti in adrenalin" },
  { id: "nature", label: "Nature Lover", emoji: "🌿", desc: "Mir in narava" },
  { id: "culture", label: "Culture Seeker", emoji: "🏛️", desc: "Zgodovina in kultura" },
  { id: "budget", label: "Budget Traveler", emoji: "💸", desc: "Ceneje in pametneje" },
  { id: "luxury", label: "Luxury", emoji: "👑", desc: "Vrhunsko in ekskluzivno" },
];

interface OnboardingModalProps {
  open: boolean;
  onComplete: (profile: Partial<TripProfile>) => void;
  onClose: () => void;
}

export function TripProfileOnboarding({ open, onComplete, onClose }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [interests, setInterests] = useState<string[]>([]);
  const [groupType, setGroupType] = useState<string | null>(null);
  const [budgetRange, setBudgetRange] = useState<string | null>(null);
  const [travelStyle, setTravelStyle] = useState<string | null>(null);

  if (!open) return null;

  const toggleInterest = (id: string) => {
    setInterests((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleComplete = () => {
    onComplete({ interests, groupType, budgetRange, travelStyle });
    setStep(0);
    setInterests([]);
    setGroupType(null);
    setBudgetRange(null);
    setTravelStyle(null);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <Card className="w-full max-w-md mx-4 animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <CardContent className="p-6">
          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
            aria-label="Zapri"
          >
            <X className="size-4" aria-hidden="true" />
          </button>

          {/* Progress dots */}
          <div className="mb-6 flex justify-center gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === step ? "w-8 bg-primary" : i < step ? "w-2 bg-primary/50" : "w-2 bg-muted"
                )}
              />
            ))}
          </div>

          {/* Step 0: Interests */}
          {step === 0 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="size-6 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-lg font-bold">Kaj ti je všeč?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI bo uporabil to za boljša priporočila
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {INTEREST_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const selected = interests.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => toggleInterest(opt.id)}
                      className={cn(
                        "flex flex-col items-center gap-2 rounded-xl border-2 p-4 transition-all",
                        selected
                          ? "border-primary bg-primary/5 scale-105"
                          : "border-border/60 hover:border-primary/30"
                      )}
                    >
                      <Icon className={cn("size-6", selected ? "text-primary" : "text-muted-foreground")} aria-hidden="true" />
                      <span className="text-sm font-medium">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
              <Button
                className="w-full"
                disabled={interests.length === 0}
                onClick={() => setStep(1)}
              >
                Naprej
              </Button>
            </div>
          )}

          {/* Step 1: Group type */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Users className="size-6 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-lg font-bold">S kom potuješ?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI bo prilagodil aktivnosti
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {GROUP_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setGroupType(opt.id)}
                    className={cn(
                      "rounded-xl border-2 p-4 text-sm font-medium transition-all",
                      groupType === opt.id
                        ? "border-primary bg-primary/5 scale-105"
                        : "border-border/60 hover:border-primary/30"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(0)}>
                  Nazaj
                </Button>
                <Button
                  className="flex-1"
                  disabled={!groupType}
                  onClick={() => setStep(2)}
                >
                  Naprej
                </Button>
              </div>
            </div>
          )}

          {/* Step 2: Travel style (Layla.ai inspiracija) */}
          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Sparkles className="size-6 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-lg font-bold">Kakšen popotnik si?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI bo izbral ustrezne ponudnike
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {TRAVEL_STYLES.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setTravelStyle(opt.id)}
                    className={cn(
                      "flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition-all",
                      travelStyle === opt.id
                        ? "border-primary bg-primary/5 scale-105"
                        : "border-border/60 hover:border-primary/30"
                    )}
                  >
                    <span className="text-2xl" aria-hidden="true">{opt.emoji}</span>
                    <span className="text-sm font-medium">{opt.label}</span>
                    <span className="text-[10px] text-muted-foreground text-center">{opt.desc}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
                  Nazaj
                </Button>
                <Button
                  className="flex-1"
                  disabled={!travelStyle}
                  onClick={() => setStep(3)}
                >
                  Naprej
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Budget */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center">
                <div className="mb-2 flex justify-center">
                  <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Clock className="size-6 text-primary" aria-hidden="true" />
                  </div>
                </div>
                <h3 className="text-lg font-bold">Kakšen je tvoj proračun?</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  AI bo izbral ustrezne ponudnike
                </p>
              </div>
              <div className="space-y-2">
                {BUDGET_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setBudgetRange(opt.id)}
                    className={cn(
                      "w-full rounded-xl border-2 p-4 text-sm font-medium transition-all text-left",
                      budgetRange === opt.id
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/30"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep(2)}>
                  Nazaj
                </Button>
                <Button
                  className="flex-1"
                  disabled={!budgetRange}
                  onClick={handleComplete}
                >
                  <Sparkles className="size-4 mr-1" aria-hidden="true" />
                  Začni
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// WELCOME BACK BANNER — za vračajoče uporabnike
// ============================================================================

interface WelcomeBackProps {
  profile: TripProfile;
  onDismiss: () => void;
}

export function WelcomeBackBanner({ profile, onDismiss }: WelcomeBackProps) {
  if (!profile.onboardingCompleted || profile.visitCount < 2) return null;

  const interestLabels: Record<string, string> = {
    narava: "narava",
    kulinarika: "lokalna hrana",
    avantura: "avantura",
    kultura: "kultura",
  };

  const groupLabels: Record<string, string> = {
    solo: "sam/a",
    par: "par",
    druzina: "družina",
    prijatelji: "prijatelji",
  };

  const topInterests = profile.interests
    .slice(0, 3)
    .map((i) => interestLabels[i] || i)
    .join(", ");

  return (
    <div className="mx-auto max-w-3xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-500">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">
              Dobrodošel nazaj! 👋
            </p>
            <p className="text-xs text-muted-foreground">
              AI že ve: {topInterests}
              {profile.groupType && ` · ${groupLabels[profile.groupType] || profile.groupType}`}
              {profile.visitedDestinations.length > 0 && ` · ${profile.visitedDestinations.length} obiskanih destinacij`}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted shrink-0"
            aria-label="Zapri"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
