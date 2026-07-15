"use client";

import { useState, useEffect } from "react";
import {
  BookOpen,
  Sparkles,
  Loader2,
  MapPin,
  ExternalLink,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateCompletion } from "@/lib/ai-client";
import { cn } from "@/lib/utils";

// ============================================================================
// AI STORY GENERATOR — čustvene zgodbe o lokalcih
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

export function AIStory({
  name,
  category,
  destinationName,
  description,
  longDescription,
  specialties,
  className,
}: AIStoryProps) {
  const [story, setStory] = useState<Story | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  async function generateStory() {
    setLoading(true);
    try {
      const context = [
        `Ime: ${name}`,
        `Kategorija: ${category}`,
        destinationName ? `Lokacija: ${destinationName}` : "",
        description ? `Opis: ${description}` : "",
        longDescription ? `Podrobnosti: ${longDescription.substring(0, 200)}` : "",
        specialties?.length ? `Specialitete: ${specialties.join(", ")}` : "",
      ].filter(Boolean).join("\n");

      const prompt = `Si Slovenian Storyteller — pripovedovalez zgodovin slovenskih lokalcev. Napiši kratko, čustveno zgodbo o tem lokalcu.

VRNI SAMO JSON:
{
  "title": "zgodben naslov (npr. 'Med iz gozdov Bele krajine')",
  "story": "zgodba v 2-3 stavkih (čustvena, osebna, ne marketinška)",
  "highlights": ["zanimivost 1", "zanimivost 2", "zanimivost 3"]
}

Kontekst:
${context}

Pravila:
- Zgodba naj bo v slovenščini
- Naj bo čustvena in osebna (ne marketinška)
- Omeni tradicijo, lokalno kulturo ali naravo
- 2-3 stavki (ne več)`;

      const result = await generateCompletion(
        [
          { role: "system", content: "Si slovenski pripovedovalec. Pišeš čustvene, avtentične zgodbe o lokalnih ponudnikih. Vedno odgovoriš z JSON." },
          { role: "user", content: prompt },
        ],
        { temperature: 0.8, jsonMode: true, feature: "tag" }
      );

      if (result?.content) {
        const jsonMatch = result.content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          setStory({
            title: String(parsed.title || "").substring(0, 80),
            story: String(parsed.story || "").substring(0, 300),
            highlights: Array.isArray(parsed.highlights)
              ? parsed.highlights.slice(0, 3).map((h: unknown) => String(h).substring(0, 100))
              : [],
          });
        }
      }
    } catch {
      // Fallback zgodba
      setStory({
        title: `${name}`,
        story: longDescription || description || "Lokalni ponudnik z avtentično slovensko izkušnjo.",
        highlights: specialties?.slice(0, 3) || [],
      });
    } finally {
      setLoading(false);
    }
  }

  // Auto-generiraj ob mount
  useEffect(() => {
    generateStory();
  }, [name]);

  if (loading) {
    return (
      <Card className={cn("border-primary/15", className)}>
        <CardContent className="flex items-center gap-2 p-3">
          <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
          <span className="text-xs text-muted-foreground">AI pripoveduje zgodbo...</span>
        </CardContent>
      </Card>
    );
  }

  if (!story) return null;

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
            AI Story
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
