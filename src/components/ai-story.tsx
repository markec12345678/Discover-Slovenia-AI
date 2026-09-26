"use client";

import { useState } from "react";
import {
  BookOpen,
  Sparkles,
  MapPin,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

// ============================================================================
// ZGODBA LOKALCA — DETERMINISTIČNI graditelj iz strukturiranih polj
// ============================================================================
//
// Turizem = zgodbe.
//
// 🍯 Med iz Bele krajine
//
// "Ta družina že 80 let izdeluje med
//  iz okoliških gozdov..."
//
// [Obišči] [Kupi] [Dodaj v plan]
//
// Issue #9 ZERO-AI: zgodba se zgradi LOKALNO iz istih propsov (ime, opis,
// podrobnosti, specialitete) — 0 omrežja, 0 strežniške AI. Nekdanja javna
// neroute /api/ai-story (sprožila se je ob vsakem odprtju modala) je
// ODSTRANJENA.
// ============================================================================

interface AIStoryProps {
  listingId?: string;
  name: string;
  category: string;
  destinationName?: string;
  description?: string;
  longDescription?: string;
  specialties?: string[];
  className?: string;
}

interface Story {
  title: string;
  story: string;
  highlights: string[];
}

/** Lokalni (deterministični) graditelj zgodbe — izključno iz realnih polj. */
function buildStoryLocal(props: AIStoryProps): Story {
  return {
    title: props.name,
    story:
      props.longDescription ||
      props.description ||
      "Lokalni ponudnik z avtentično slovensko izkušnjo.",
    highlights: props.specialties?.slice(0, 3) || [],
  };
}

export function AIStory({
  name,
  category,
  destinationName,
  description,
  longDescription,
  specialties,
  className,
}: AIStoryProps) {
  const t = useTranslations("story");
  // i18n z dvojno varovalko: dokler ključ ni v messages/*.json, velja SL literal
  const badgeLabel = t.has("badge") ? t("badge") : "Naša zgodba";

  // Samodejni izračun ob renderju — hipen (čisto lokalno, brez omrežja);
  // čisti izračun iz propsov, zato se pri spremembi lokalca sam posodobi.
  const story = buildStoryLocal({
    name,
    category,
    destinationName,
    description,
    longDescription,
    specialties,
  });
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className={cn("border-primary/15 bg-gradient-to-br from-primary/5 to-transparent", className)}>
      <CardContent className="p-4">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-primary/10">
            <BookOpen className="size-4 text-primary" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold leading-tight">{story.title}</h4>
            {destinationName && (
              <p className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                <MapPin className="size-2.5" aria-hidden="true" />
                {destinationName}
              </p>
            )}
          </div>
          <Badge variant="secondary" className="text-[9px] gap-0.5 shrink-0">
            <Sparkles className="size-2" aria-hidden="true" />
            {badgeLabel}
          </Badge>
        </div>

        {/* Zgodba */}
        <p className="text-sm text-foreground/80 leading-relaxed italic">
          "{story.story}"
        </p>

        {/* Highlights */}
        {story.highlights.length > 0 && expanded && (
          <div className="mt-3 space-y-1.5">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
              Zanimivosti
            </p>
            {story.highlights.map((h, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <span className="text-primary mt-0.5" aria-hidden="true">•</span>
                <span className="text-muted-foreground">{h}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expand/collapse */}
        {story.highlights.length > 0 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="mt-2 text-xs text-primary hover:text-primary/80 font-medium"
          >
            {expanded ? "Skrij zanimivosti" : "Pokaži zanimivosti"}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
