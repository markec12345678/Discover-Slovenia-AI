"use client";

import { useState, useEffect } from "react";
import { useTripProfile, WelcomeBackBanner } from "@/components/trip-profile";

/**
 * WelcomeBackWrapper — client-side wrapper za WelcomeBack banner.
 * Prikaže se vračajočim uporabnikom nad hero sekcijo.
 */
export function WelcomeBackWrapper() {
  const { profile, loaded } = useTripProfile();
  const [dismissed, setDismissed] = useState(false);

  if (!loaded || dismissed) return null;

  return <WelcomeBackBanner profile={profile} onDismiss={() => setDismissed(true)} />;
}
