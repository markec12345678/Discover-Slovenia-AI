"use client";

import { useState } from "react";
import {
  Award,
  MapPin,
  Star,
  TrendingUp,
  Lock,
  Sparkles,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// SLOVENIA PASS — digitalni potni list z gamifikacijo
// ============================================================================
//
// 🇸🇮 Moj Slovenia Pass
//
// Obiskano: 3 regije
// Točke: 420
// Značke: 🌿 Nature Explorer · 🍷 Local Food Lover
//
// Naslednji cilj: Kras
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

interface Badge_ {
  id: string;
  name: string;
  emoji: string;
  description: string;
  unlocked: boolean;
}

const BADGES: Badge_[] = [
  { id: "explorer", name: "Explorer", emoji: "🗺️", description: "Obiskal 3+ regije", unlocked: false },
  { id: "nature", name: "Nature Lover", emoji: "🌿", description: "Obiskal 5+ naravnih destinacij", unlocked: false },
  { id: "foodie", name: "Food Lover", emoji: "🍷", description: "Obiskal 3+ restavracije", unlocked: false },
  { id: "adventure", name: "Adventurer", emoji: "🧗", description: " Opravil 3+ aktivnosti", unlocked: false },
  { id: "local", name: "Local Hero", emoji: "⭐", description: "Kupil 5+ lokalnih izdelkov", unlocked: false },
  { id: "master", name: "Slovenia Master", emoji: "👑", description: "Obiskal vseh 9 regij", unlocked: false },
];

const STORAGE_KEY = "discoverslovenia_pass";

interface PassData {
  visitedRegions: string[];
  points: number;
  badges: string[];
}

export function SloveniaPass({ visitedDestinations = [] }: { visitedDestinations?: string[] }) {
  const [pass, setPass] = useState<PassData>(() => {
    if (typeof window === "undefined") return { visitedRegions: [], points: 0, badges: [] };
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    return { visitedRegions: [], points: 0, badges: [] };
  });
  const loaded = true;

  // Update badges based on progress
  const updatedBadges = BADGES.map((b) => {
    let unlocked = pass.badges.includes(b.id);
    if (b.id === "explorer" && pass.visitedRegions.length >= 3) unlocked = true;
    if (b.id === "master" && pass.visitedRegions.length >= 9) unlocked = true;
    return { ...b, unlocked };
  });

  const unlockedCount = updatedBadges.filter((b) => b.unlocked).length;
  const nextRegion = REGIONS.find((r) => !pass.visitedRegions.includes(r.id));

  if (!loaded) return null;

  return (
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
            <div className="text-2xl font-bold">{pass.points}</div>
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
              {unlockedCount}/{BADGES.length}
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
  );
}
