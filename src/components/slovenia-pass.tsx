"use client";

import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Star,
  TrendingUp,
  Lock,
  Sparkles,
  Trophy,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  PASS_BADGES,
  PASS_STORAGE_KEY,
  loadPass,
  recordDestinationViewed,
  recordItineraryGenerated,
  recordListingViewed,
  type ItineraryGeneratedDetail,
  type SloveniaPassData,
} from "@/lib/pass-logic";

// ============================================================================
// SLOVENIA PASS — digitalni potni list z gamifikacijo
// ============================================================================
//
// 🇸🇮 Moj Slovenia Pass
//
// Obiskano: 3 regije · Točke: 420 · Značke: 🌿 Nature · 🍷 Food Lover
//
// Logika (točke/regije/značke) živi v src/lib/pass-logic.ts:
//   - "itineraryGenerated" → +50 točk + regije + števci kategorij
//   - "destinationViewed"  → +10 točk + obisk regije
//   - "listingViewed"      → +5 točk + števec lokalov
// Stanje se persistira v localStorage "discoverslovenia_pass".
// ============================================================================

const REGIONS = [
  { id: "gorenjska", name: "Gorenjska", emoji: "🏔️" },
  { id: "primorska", name: "Primorska", emoji: "🌊" },
  { id: "osrednja", name: "Osrednja Slovenija", emoji: "🏛️" },
  { id: "kras", name: "Kras", emoji: "🪨" },
  { id: "stajerska", name: "Štajerska", emoji: "🍇" },
  { id: "koroska", name: "Koroška", emoji: "🌲" },
  { id: "prekmurje", name: "Prekmurje", emoji: "🌾" },
  { id: "dolenjska", name: "Dolenjska", emoji: "🍷" },
  { id: "bela-krajina", name: "Bela krajina", emoji: "🍯" },
];

const EMPTY_PASS: SloveniaPassData = {
  visitedRegions: [],
  points: 0,
  badges: [],
  natureVisits: 0,
  foodVisits: 0,
  activityVisits: 0,
  viewedListingIds: [],
  awardedDestinationIds: [],
  lastItineraryKey: null,
};

export function SloveniaPass() {
  const [pass, setPass] = useState<SloveniaPassData>(EMPTY_PASS);
  const [hydrated, setHydrated] = useState(false);

  // Preberi stanje iz localStorage + osveži ob vsaki spremembi ("passUpdated")
  useEffect(() => {
    const sync = () => {
      setPass(loadPass());
      setHydrated(true);
    };
    sync();
    window.addEventListener("passUpdated", sync);
    return () => window.removeEventListener("passUpdated", sync);
  }, []);

  // === Listenerji na dogodke po strani (gamifikacija) ===
  useEffect(() => {
    const onItineraryGenerated = (e: Event) => {
      const detail = (e as CustomEvent<ItineraryGeneratedDetail>).detail;
      if (detail) recordItineraryGenerated(detail);
    };
    const onDestinationViewed = (e: Event) => {
      const detail = (e as CustomEvent<{ destinationId: string }>).detail;
      if (detail?.destinationId) recordDestinationViewed(detail.destinationId);
    };
    const onListingViewed = (e: Event) => {
      const detail = (e as CustomEvent<{ listingId: string }>).detail;
      if (detail?.listingId) recordListingViewed(detail.listingId);
    };

    window.addEventListener("itineraryGenerated", onItineraryGenerated as EventListener);
    window.addEventListener("destinationViewed", onDestinationViewed as EventListener);
    window.addEventListener("listingViewed", onListingViewed as EventListener);
    return () => {
      window.removeEventListener("itineraryGenerated", onItineraryGenerated as EventListener);
      window.removeEventListener("destinationViewed", onDestinationViewed as EventListener);
      window.removeEventListener("listingViewed", onListingViewed as EventListener);
    };
  }, []);

  // Update badges based on progress (regije + števci)
  const updatedBadges = PASS_BADGES.map((b) => {
    let unlocked = pass.badges.includes(b.id);
    if (b.id === "explorer" && pass.visitedRegions.length >= 3) unlocked = true;
    if (b.id === "master" && pass.visitedRegions.length >= 9) unlocked = true;
    if (b.id === "nature" && pass.natureVisits >= 5) unlocked = true;
    if (b.id === "foodie" && pass.foodVisits >= 3) unlocked = true;
    if (b.id === "adventure" && pass.activityVisits >= 3) unlocked = true;
    if (b.id === "local" && pass.viewedListingIds.length >= 5) unlocked = true;
    return { ...b, unlocked };
  });

  const unlockedCount = updatedBadges.filter((b) => b.unlocked).length;
  const nextRegion = REGIONS.find((r) => !pass.visitedRegions.includes(r.id));

  if (!hydrated) return null;

  return (
    <>
      <Card className="overflow-hidden border-primary/20">
        {/* Header z gradient */}
        <div className="bg-gradient-to-br from-primary to-primary/70 p-5 text-primary-foreground">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">🇸🇮</span>
                <h3 className="text-lg font-bold">Moj Slovenia Pass</h3>
              </div>
              <p className="text-xs text-primary-foreground/80 mt-0.5">
                Digitalni potni list
              </p>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold" aria-live="polite">{pass.points}</div>
              <div className="text-[10px] text-primary-foreground/80">točk</div>
            </div>
          </div>
        </div>

        <CardContent className="p-4 space-y-4">
          {/* Regije */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Obiskane regije
              </h4>
              <Badge variant="secondary" className="text-[10px]">
                {pass.visitedRegions.length}/9
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {REGIONS.map((region) => {
                const visited = pass.visitedRegions.includes(region.id);
                return (
                  <div
                    key={region.id}
                    className={cn(
                      "flex flex-col items-center gap-0.5 rounded-lg border p-2 text-center transition-all",
                      visited
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/40 bg-muted/20 opacity-50"
                    )}
                  >
                    <span className="text-lg" aria-hidden="true">{region.emoji}</span>
                    <span className="text-[10px] font-medium leading-tight">{region.name}</span>
                    {visited && (
                      <Star className="size-2.5 fill-primary text-primary" aria-hidden="true" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Naslednji cilj */}
          {nextRegion && (
            <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5 flex items-center gap-2">
              <MapPin className="size-4 text-primary shrink-0" aria-hidden="true" />
              <div className="flex-1">
                <p className="text-[10px] font-medium text-muted-foreground">Naslednji cilj</p>
                <p className="text-sm font-semibold">{nextRegion.emoji} {nextRegion.name}</p>
              </div>
              <Badge variant="outline" className="text-[10px] gap-0.5">
                <TrendingUp className="size-2.5" aria-hidden="true" />
                +50 točk
              </Badge>
            </div>
          )}

          {/* Značke */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Značke
              </h4>
              <Badge variant="secondary" className="text-[10px]">
                {unlockedCount}/{PASS_BADGES.length}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {updatedBadges.map((badge) => (
                <div
                  key={badge.id}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border p-2 text-center transition-all",
                    badge.unlocked
                      ? "border-amber-300/50 bg-amber-50 dark:bg-amber-950/20"
                      : "border-border/40 bg-muted/20 opacity-50"
                  )}
                >
                  <div className="relative">
                    <span className="text-xl" aria-hidden="true">{badge.emoji}</span>
                    {!badge.unlocked && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Lock className="size-3 text-muted-foreground" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] font-medium leading-tight">{badge.name}</span>
                  <span className="text-[9px] text-muted-foreground leading-tight">{badge.description}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          {pass.visitedRegions.length === 0 && (
            <div className="rounded-lg bg-gradient-to-r from-primary/5 to-transparent border border-primary/20 p-3 text-center">
              <Sparkles className="mx-auto size-5 text-primary mb-1" aria-hidden="true" />
              <p className="text-xs font-medium">
                Začni svoje potovanje — ustvari AI plan in pridobivaj točke!
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Lahki gamifikacijski toast (fixed spodaj desno, 3s) */}
      <PassToast />
    </>
  );
}

// ============================================================================
// PASS TOAST — lahko obvestilo o točkah/značkah (fixed bottom-right, 3s)
// ============================================================================

interface ToastEntry {
  id: number;
  message: string;
}

let passToastId = 0;

function PassToast() {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);
  const timersRef = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    const onPassToast = (e: Event) => {
      const message = (e as CustomEvent<{ message?: string }>).detail?.message;
      if (!message) return;
      const id = ++passToastId;
      setToasts((prev) => [...prev.slice(-2), { id, message }]);
      const timer = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        timersRef.current.delete(id);
      }, 3000);
      timersRef.current.set(id, timer);
    };

    window.addEventListener("passToast", onPassToast as EventListener);
    return () => {
      window.removeEventListener("passToast", onPassToast as EventListener);
      timersRef.current.forEach((timer) => clearTimeout(timer));
      timersRef.current.clear();
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-[110] flex w-[calc(100vw-2rem)] max-w-xs flex-col gap-2"
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto flex items-center gap-2.5 rounded-xl border border-primary/30 bg-background/95 p-3 shadow-lg backdrop-blur animate-in fade-in slide-in-from-bottom-2 duration-300"
        >
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Trophy className="size-4" aria-hidden="true" />
          </span>
          <p className="text-sm font-medium leading-tight">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}

// Ključ localStorage izvožimo za morebitne prihodnje konzumente (admin/debug)
export { PASS_STORAGE_KEY };
