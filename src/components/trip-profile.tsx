"use client";

import { useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { Sparkles, X } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "@/i18n/navigation";
import { useGuidance } from "@/hooks/use-guidance";
import { trackPlannerEvent } from "@/lib/planner-analytics";

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

/** Prebere zadnje persistirano stanje profila (morda je pisala druga instanca hooka). */
function readStoredProfile(): TripProfile {
  if (typeof window === "undefined") return DEFAULT_PROFILE;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return { ...DEFAULT_PROFILE, ...JSON.parse(stored) as TripProfile };
    }
  } catch {}
  return DEFAULT_PROFILE;
}

/** Persistira profil (best-effort). */
function persistProfile(profile: TripProfile) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // Ignore (private mode / poln localStorage)
  }
}

// Hook za uporabo profile
export function useTripProfile() {
  const [profile, setProfile] = useState<TripProfile>(() => readStoredProfile());
  const loaded = true; // Always loaded — lazy initializer reads from localStorage

  const save = useCallback((newProfile: TripProfile) => {
    setProfile(newProfile);
    persistProfile(newProfile);
  }, []);

  const updateProfile = useCallback((updates: Partial<TripProfile>) => {
    setProfile(() => {
      // Združi z NAJNOVEJŠIM persistiranim stanjem — več instanc hooka
      // (npr. kviz + welcome-back wrapper) lahko piše v isti ključ.
      const updated = { ...readStoredProfile(), ...updates };
      persistProfile(updated);
      return updated;
    });
  }, []);

  const addVisitedDestination = useCallback((destId: string) => {
    setProfile(() => {
      const base = readStoredProfile();
      if (base.visitedDestinations.includes(destId)) return base;
      // ISSUE #23 (1.163.0): POPRAVEK dvojne semantike — visitCount šteje
      // SEJE (edini lastnik: WelcomeBackWrapper, 1×/sejo). Dodajanje
      // destinacije NI nov obisk (prej je napihnilo števec → banner
      // „dobrodošel nazaj" brez vračanja uporabnika).
      const updated = {
        ...base,
        visitedDestinations: [...base.visitedDestinations, destId],
      };
      persistProfile(updated);
      return updated;
    });
  }, []);

  const completeOnboarding = useCallback((data: Partial<TripProfile>) => {
    setProfile(() => {
      const base = readStoredProfile();
      // ISSUE #23: tudi tu NE štejemo obiska (seje šteje wrapper).
      const updated = {
        ...base,
        ...data,
        onboardingCompleted: true,
      };
      persistProfile(updated);
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
// WELCOME BACK BANNER — za vračajoče uporabnike
// ============================================================================

interface WelcomeBackProps {
  profile: TripProfile;
  onDismiss: () => void;
}

export function WelcomeBackBanner({ profile, onDismiss }: WelcomeBackProps) {
  // FW4.3-2: besedila bannerja prek fragmentov welcomeBack.{sl,en}
  const t = useTranslations("welcomeBack");
  // ISSUE #23 (1.163.0) §19: STANJE-VEDNO nadaljevanje — banner ni več
  // samo pasiven povzetek profila; iz determinističnega jedra izpelje
  // dejanski naslednji korak (aktivna pot → NADALJUJ; zbirka → NAČRTUJ;
  // sicer obstoječi povzetek/kviz CTA — zero feature loss).
  const { guidance } = useGuidance("home");

  // Prikaz že od 2. obiska (ne glede na zaključen onboarding — kviz ga zdaj zaključi)
  if (profile.visitCount < 2) return null;

  const interestLabels: Record<string, string> = {
    narava: t("interests.narava"),
    // TAG-ALIGN: novi kanonični ID + preslikava starega "kulinarika"
    // (profili, shranjeni pred 1.7.2) — isti prikaz.
    hrana: t("interests.hrana"),
    kulinarika: t("interests.hrana"),
    avantura: t("interests.avantura"),
    kultura: t("interests.kultura"),
  };

  const groupLabels: Record<string, string> = {
    solo: t("groups.solo"),
    par: t("groups.par"),
    druzina: t("groups.druzina"),
    prijatelji: t("groups.prijatelji"),
  };

  const topInterests = profile.interests
    .slice(0, 3)
    .map((i) => interestLabels[i] || i)
    .join(", ");

  const knowsSomething =
    topInterests.length > 0 ||
    Boolean(profile.groupType) ||
    profile.visitedDestinations.length > 0;

  // ISSUE #23 §19 — kontekstualno nadaljevanje (stanje iz jedra, ne ugiban):
  const goState = guidance?.state ?? null;
  const isOnTrip =
    goState === "TRIP_STARTED" ||
    goState === "COMPLETED" ||
    (goState !== null &&
      ["NAVIGATING", "ARRIVED", "FREE_TIME", "NEEDS_ATTENTION", "BLOCKED", "RECOVERY"].includes(goState));
  const isBuilding = goState === "TRIP_BUILDING";

  return (
    <div className="mx-auto max-w-3xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-500">
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold">
              {isOnTrip ? t("continueTrip") : isBuilding ? t("continueTitle") : t("title")}
            </p>
            <p className="text-xs text-muted-foreground">
              {isOnTrip && guidance?.facts.nextStopTitle ? (
                <>
                  {t("nextStop", { next: guidance.facts.nextStopTitle })}{" "}
                  <Link
                    href="/na-poti"
                    className="font-medium text-primary hover:underline"
                    onClick={() =>
                      trackPlannerEvent("guidance_action_clicked", {
                        state: goState ?? "TRIP_STARTED",
                        surface: "home",
                        action: "go_mode",
                      })
                    }
                  >
                    {t("ctaGo")}
                  </Link>
                </>
              ) : isOnTrip ? (
                <>
                  {t("continueTripDesc")}{" "}
                  <Link href="/na-poti" className="font-medium text-primary hover:underline">
                    {t("ctaGo")}
                  </Link>
                </>
              ) : isBuilding ? (
                <>
                  {t("continueTripCount", { count: guidance?.facts.myTripCount ?? 0 })}{" "}
                  <Link
                    href="/nacrtuj"
                    className="font-medium text-primary hover:underline"
                    onClick={() =>
                      trackPlannerEvent("guidance_action_clicked", {
                        state: "TRIP_BUILDING",
                        surface: "home",
                        action: "plan",
                      })
                    }
                  >
                    {t("ctaPlan")}
                  </Link>
                </>
              ) : knowsSomething ? (
                <>
                  {t("knowsLabel")} {topInterests}
                  {profile.groupType && ` · ${groupLabels[profile.groupType] || profile.groupType}`}
                  {profile.visitedDestinations.length > 0 &&
                    ` · ${t("visitedCount", { count: profile.visitedDestinations.length })}`}
                </>
              ) : (
                // next-intl v4 uradni vzorec: tag v sporočilu
                // (<quizLink>…</quizLink>) + chunk handler.
                // ISSUE #23: POPRAVEK sidra — kviz živi na /nacrtuj#kviz;
                // prejšnji "#kviz" je padel na legacy preusmeritev BREZ
                // sidra (uporabnik pristane na vrhu nacrtuj, ne pri kvizu).
                t.rich("quizCta", {
                  quizLink: (chunks) => (
                    <Link
                      href="/nacrtuj#kviz"
                      className="font-medium text-primary hover:underline"
                    >
                      {chunks}
                    </Link>
                  ),
                })
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-full p-1.5 text-muted-foreground hover:bg-muted shrink-0"
            aria-label={t("close")}
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
