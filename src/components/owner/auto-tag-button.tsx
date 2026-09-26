"use client";

import { useState } from "react";
import { Sparkles, Loader2, Check, X, Wand2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

interface AutoTagResult {
  category: string;
  attributes: Record<string, boolean>;
  tags: string[];
  confidence: "high" | "medium" | "low";
  source: "deterministic";
}

interface AutoTagButtonProps {
  type: "listing" | "product" | "experience";
  name: string;
  description: string;
  destinationName?: string;
  onApply: (result: AutoTagResult) => void;
  disabled?: boolean;
}

/**
 * AutoTagButton — DETERMINISTIČNI predlagalnik kategorije in atributov
 * (Issue #9 ZERO-AI: slovar taksonomije SL+EN, vir "deterministic").
 *
 * Lastnik vnese opis, klikne "Predlagaj tage", slovar taksonomije pa predlaga:
 * - kategorijo
 * - atribute (organic, familyFriendly, itd.)
 * - proste tagi
 *
 * Lastnik lahko predloge aplikira z enim klikom ali ignorira
 * (human-in-the-loop flow nespremenjen).
 *
 * Nove oznake: i18n ključi v imenskem prostoru "ownerPanel" (glej
 * docs/audit/issue9-report-b.md — vrednosti SL/EN za sporočilne datoteke);
 * t.has() pasti preprečijo surove ključe, dokler JSON ni popolnjen.
 */
export function AutoTagButton({
  type,
  name,
  description,
  destinationName,
  onApply,
  disabled,
}: AutoTagButtonProps) {
  const { toast } = useToast();
  const t = useTranslations("ownerPanel");
  // i18n z dvojno varovalko: dokler ključ ni v messages/*.json, velja SL literal
  const tagSourceBadge = t.has("tagSourceDictionary")
    ? t("tagSourceDictionary")
    : "Slovar taksonomije";
  const buttonLabel = t.has("autoTagButton") ? t("autoTagButton") : "Predlagaj tage";
  const buttonLoading = t.has("autoTagButtonLoading")
    ? t("autoTagButtonLoading")
    : "Predlaga …";
  const suggestionTitle = t.has("autoTagSuggestionTitle")
    ? t("autoTagSuggestionTitle")
    : "Predlog";
  const toastReadyTitle = t.has("autoTagToastReady")
    ? t("autoTagToastReady")
    : "Predlog pripravljen! ✨";
  const toastFailTitle = t.has("autoTagToastFail")
    ? t("autoTagToastFail")
    : "Predlog ni uspel";
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AutoTagResult | null>(null);
  const [showResult, setShowResult] = useState(false);

  const canSuggest = name.trim().length > 0 && description.trim().length >= 10;

  async function suggest() {
    if (!canSuggest) {
      toast({
        title: "Manjkajo podatki",
        description: "Vnesite ime in opis (vsaj 10 znakov).",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setShowResult(true);
    try {
      const res = await fetch("/api/owner/auto-tag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          description: description.trim(),
          destinationName,
        }),
      });

      if (!res.ok) throw new Error("Napaka pri predlogu");

      const data: AutoTagResult = await res.json();
      setResult(data);

      toast({
        title: toastReadyTitle,
        description: `Kategorija: ${data.category} · ${Object.values(data.attributes).filter(Boolean).length} atributov · ${data.tags.length} tagov`,
      });
    } catch {
      toast({
        title: toastFailTitle,
        description: "Poskusite znova ali nastavite ročno.",
        variant: "destructive",
      });
      setShowResult(false);
    } finally {
      setLoading(false);
    }
  }

  function apply() {
    if (result) {
      onApply(result);
      toast({
        title: "Predlogi aplicirani! ✓",
        description: "Preverite in po potrebi popravite.",
      });
      setShowResult(false);
      setResult(null);
    }
  }

  function dismiss() {
    setShowResult(false);
    setResult(null);
  }

  const activeAttributes = result
    ? Object.entries(result.attributes).filter(([, v]) => v)
    : [];

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={suggest}
        disabled={disabled || loading || !canSuggest}
        className="gap-1.5"
      >
        {loading ? (
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
        ) : (
          <Wand2 className="size-3.5 text-primary" aria-hidden="true" />
        )}
        {loading ? buttonLoading : buttonLabel}
      </Button>

      {showResult && result && (
        <Card className="border-primary/30 bg-primary/5 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold">{suggestionTitle}</span>
            {/* Vir: deterministični slovar taksonomije (Issue #9) — vedno poštena oznaka */}
            <Badge
              variant="secondary"
              className="ml-auto bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
            >
              {tagSourceBadge}
            </Badge>
            <Badge variant="outline" className="text-[9px]">
              {result.confidence === "high" ? "Visoka" : result.confidence === "medium" ? "Srednja" : "Nizka"} zaupanja
            </Badge>
          </div>

          <div className="space-y-2 text-sm">
            {/* Kategorija */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Kategorija:</span>
              <Badge variant="default">{result.category}</Badge>
            </div>

            {/* Atributi */}
            {activeAttributes.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">Atributi:</span>
                {activeAttributes.map(([attr]) => (
                  <Badge key={attr} variant="secondary" className="text-[10px]">
                    {attr}
                  </Badge>
                ))}
              </div>
            )}

            {/* Tags */}
            {result.tags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-xs text-muted-foreground">Tagi:</span>
                {result.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-[10px]">
                    {tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Akcije */}
          <div className="mt-3 flex gap-2">
            <Button
              type="button"
              size="sm"
              onClick={apply}
              className="gap-1.5"
            >
              <Check className="size-3.5" aria-hidden="true" />
              Aplikiraj predloge
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={dismiss}
              className="gap-1.5"
            >
              <X className="size-3.5" aria-hidden="true" />
              Zavrzi
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
