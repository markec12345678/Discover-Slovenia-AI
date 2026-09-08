"use client";

import { useEffect, useState } from "react";
import { useTripProfile, WelcomeBackBanner } from "@/components/trip-profile";

const VISIT_COUNTED_KEY = "visit_counted";
const BANNER_DISMISSED_KEY = "welcome_banner_dismissed";

/**
 * WelcomeBackWrapper — client-side wrapper za WelcomeBack banner.
 * Prikaže se vračajočim uporabnikom (2+ obiski) nad hero sekcijo.
 *
 * - visitCount se poveča enkrat na browser sejo (sessionStorage guard)
 * - dismissal se pomni v sessionStorage (banner se ne vrača ob reloadu v isti seji)
 * - banner se prikaže šele po hidrataciji (SSR vedno rendera prazno)
 */
export function WelcomeBackWrapper() {
  const { profile, loaded, updateProfile } = useTripProfile();
  const [dismissed, setDismissed] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // Ob mountu: hidratacija, preštej obisk (1x/sejo), preberi dismissal
  useEffect(() => {
    const initFromSession = () => {
      setHydrated(true);

      try {
        if (sessionStorage.getItem(BANNER_DISMISSED_KEY) === "1") {
          setDismissed(true);
        }
      } catch {
        // sessionStorage nedostopen — banner deluje brez persistence
      }

      try {
        if (sessionStorage.getItem(VISIT_COUNTED_KEY)) return;
        sessionStorage.setItem(VISIT_COUNTED_KEY, "1");
      } catch {
        // kljub nedostopnemu sessionStorage preštej obisk
      }
      updateProfile({
        visitCount: (profile.visitCount ?? 0) + 1,
        lastVisit: new Date().toISOString(),
      });
    };

    initFromSession();
    // Namerno samo ob mountu (updateProfile je stabilen, profile je začetna vrednost)
  }, []);

  if (!loaded || dismissed || !hydrated) return null;

  return (
    <WelcomeBackBanner
      profile={profile}
      onDismiss={() => {
        setDismissed(true);
        try {
          sessionStorage.setItem(BANNER_DISMISSED_KEY, "1");
        } catch {}
      }}
    />
  );
}
