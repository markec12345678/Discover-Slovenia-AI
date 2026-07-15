"use client";

import { useState, useEffect } from "react";
import {
  TrendingUp,
  Check,
  AlertCircle,
  Lightbulb,
  ArrowUp,
  Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// AI QUALITY COACH — actionable suggestions za providerje
// ============================================================================
//
// "Vaš profil: Quality Score 78
// Za +10 točk: dodajte 3 fotografije, prevedite opis, dodajte odpiralni čas
// Potencial: +35% več AI prikazov"
// ============================================================================

interface Suggestion {
  id: string;
  icon: "images" | "description" | "hours" | "translation" | "tags" | "phone" | "website";
  title: string;
  description: string;
  points: number;
  impact: string;
  done: boolean;
}

interface QualityCoachProps {
  listingId: string;
}

const SUGGESTION_ICONS = {
  images: "📷",
  description: "📝",
  hours: "🕐",
  translation: "🌍",
  tags: "🏷️",
  phone: "📞",
  website: "🔗",
};

export function QualityCoach({ listingId }: QualityCoachProps) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{
    qualityScore: number;
    suggestions: Suggestion[];
    potentialScore: number;
    potentialIncrease: string;
  } | null>(null);

  useEffect(() => {
    async function fetchCoach() {
      try {
        const res = await fetch(`/api/owner/quality-score?listingId=${listingId}`);
        if (!res.ok) return;
        const result = await res.json();

        // Generiraj suggestions glede na manjkajoča polja
        const suggestions: Suggestion[] = [];

        if (result.details?.imageCount < 3) {
          suggestions.push({
            id: "images",
            icon: "images",
            title: "Dodajte fotografije",
            description: `Imate ${result.details?.imageCount || 0} slik. Dodajte še ${3 - (result.details?.imageCount || 0)} za višji score.`,
            points: 10,
            impact: "+15% AI prikazov",
            done: false,
          });
        }

        if (result.details?.descriptionLength < 100) {
          suggestions.push({
            id: "description",
            icon: "description",
            title: "Razširite opis",
            description: "Kratek opis naj bo vsaj 100 znakov za boljšo AI razumljivost.",
            points: 5,
            impact: "+8% AI ujemanje",
            done: false,
          });
        }

        if (result.details?.longDescriptionLength < 200) {
          suggestions.push({
            id: "longDescription",
            icon: "description",
            title: "Dodajte dolgi opis",
            description: "Podroben opis (min 200 znakov) izboljša AI kontekst.",
            points: 7,
            impact: "+10% AI ujemanje",
            done: false,
          });
        }

        if (result.details?.tagCount < 3) {
          suggestions.push({
            id: "tags",
            icon: "tags",
            title: "Dodajte AI oznake",
            description: "Uporabite AI auto-tagging za dodajanje ustreznih ključnih besed.",
            points: 7,
            impact: "+12% AI prikazov",
            done: false,
          });
        }

        if (!result.details?.isVerified) {
          suggestions.push({
            id: "verified",
            icon: "tags",
            title: "Počakajte na admin verifikacijo",
            description: "Admin verificirani lokalci dobijo +10 točk k Quality Score.",
            points: 10,
            impact: "+10 Quality Score",
            done: false,
          });
        }

        if (result.details?.daysSinceUpdate > 30) {
          suggestions.push({
            id: "refresh",
            icon: "hours",
            title: "Osvežite podatke",
            description: `Zadnja posodobitev pred ${result.details?.daysSinceUpdate} dnevi. Osvežite za +5 točk.`,
            points: 5,
            impact: "+5 Quality Score",
            done: false,
          });
        }

        const potentialScore = result.total + suggestions.reduce((s, sug) => s + sug.points, 0);
        const increasePercent = result.total > 0
          ? Math.round(((potentialScore - result.total) / result.total) * 100)
          : 0;

        setData({
          qualityScore: result.total,
          suggestions,
          potentialScore: Math.min(potentialScore, 100),
          potentialIncrease: `+${increasePercent}%`,
        });
      } catch {
        // Tiho ignoriraj
      } finally {
        setLoading(false);
      }
    }

    fetchCoach();
  }, [listingId]);

  if (loading) {
    return (
      <Card className="border-primary/20">
        <CardContent className="flex items-center gap-3 p-4">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          <span className="text-sm text-muted-foreground">AI analizira vaš profil...</span>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.suggestions.length === 0) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40">
        <CardContent className="flex items-center gap-3 p-4">
          <Check className="size-5 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              Odličen profil! Quality Score: {data?.qualityScore}/100
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-500">
              Vaš profil je optimiziran. AI ga aktivno priporoča.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Lightbulb className="size-4 text-primary" aria-hidden="true" />
            AI Quality Coach
          </span>
          <Badge variant="secondary" className="gap-1">
            <TrendingUp className="size-3" aria-hidden="true" />
            Q: {data.qualityScore}/100
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Potential */}
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Potencial</p>
              <p className="text-lg font-bold text-primary">
                {data.potentialScore}/100
                <span className="text-sm font-normal text-primary/70 ml-1">
                  ({data.potentialIncrease})
                </span>
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <ArrowUp className="size-3" aria-hidden="true" />
              +{data.potentialScore - data.qualityScore} točk
            </div>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${data.qualityScore}%` }}
            />
          </div>
          <div className="mt-1.5 h-2 rounded-full bg-muted/50 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/30 transition-all"
              style={{ width: `${data.potentialScore}%` }}
            />
          </div>
        </div>

        {/* Suggestions */}
        <div className="space-y-2">
          {data.suggestions.map((sug) => (
            <div
              key={sug.id}
              className="flex items-start gap-3 rounded-lg border border-border/60 bg-background p-3"
            >
              <span className="text-lg shrink-0" aria-hidden="true">
                {SUGGESTION_ICONS[sug.icon]}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{sug.title}</h4>
                  <Badge variant="outline" className="text-[10px] shrink-0">
                    +{sug.points}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">{sug.description}</p>
                <p className="mt-1 text-xs text-emerald-600 dark:text-emerald-400">
                  {sug.impact}
                </p>
              </div>
            </div>
          ))}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          💡 Višji Quality Score = več AI priporočil = več obiskovalcev
        </p>
      </CardContent>
    </Card>
  );
}
