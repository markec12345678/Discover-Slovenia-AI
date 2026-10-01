"use client";

// ============================================================================
// ISSUE #23 — FIRST-RUN CARD: dobrodošlica + nameni + »Ne vem — pokaži mi«
// ============================================================================
// Issue §6: nov uporabnik mora v nekaj sekundah razumeti (1) kaj je
// Discover, (2) kaj lahko naredi, (3) smiselen prvi korak. NI modal, NI
// tutorial — inline kontekstualna kartica na mestu welcome banerja (prvi
// obisk prikaže TO kartico, vračajoči uporabnik welcome baner — nikoli
// oba, §33 konflikt CTA).
//
// »Ne vem — pokaži mi« (§18) NI dokumentarni tutorial: vklopi vodeno pot
// (dai:guided-tour) — GuidanceStrip od tod naprej vodi skozi korake
// verige ODKRIJ → NAČRTUJ → REZERVIRAJ → NA POTI, dokler ne doseže
// zagona poti (first_run_completed).
//
// Trajno stanje: dsa_first_run_seen (enkrat za vselej — §19 returning
// user NIKOLI ne dobi first-run kartice znova).
// ============================================================================

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Compass, HelpCircle, MapPin, Map as MapIcon, Route, Sparkles, X } from "lucide-react";

import { Link } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { openChatWithQuestion } from "@/lib/chat-ask";
import { markFirstRunSeen, setGuidedTour } from "@/lib/guidance/guidance-snapshot";
import { trackPlannerEvent } from "@/lib/planner-analytics";
import { useGuidance } from "@/hooks/use-guidance";

type Intent = "plan" | "discover" | "find" | "help" | "dont_know";

export function GuidanceFirstRunCard() {
  const t = useTranslations("guidance");
  const { showFirstRun } = useGuidance("home");
  const [hidden, setHidden] = useState(false);

  // Prikaži SAMO prvemu obisku, ki še ni izbral namena (§19 — vračajoči
  // uporabnik dobi stanje-vedno nadaljevanje v welcome banerju).
  if (!showFirstRun || hidden) return null;

  const choose = (intent: Intent) => {
    markFirstRunSeen();
    setHidden(true);
    trackPlannerEvent("intent_selected", { intent });
    trackPlannerEvent("first_run_started", { intent });
    if (intent === "dont_know") {
      // VODENA POT: trak prevzame vodenje do zagona poti (§18).
      setGuidedTour(true);
    }
  };

  const dismiss = () => {
    markFirstRunSeen();
    setHidden(true);
    trackPlannerEvent("guidance_dismissed", { state: "NEW_USER", surface: "home" });
  };

  return (
    <Card
      className="border-primary/40"
      role="status"
      aria-live="polite"
      data-testid="guidance-first-run"
    >
      <CardContent className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
              <Sparkles className="size-4" aria-hidden="true" />
              {t("welcome.title")}
            </p>
            <p className="text-sm leading-relaxed text-muted-foreground">{t("welcome.lead")}</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-11 w-11 shrink-0"
            aria-label={t("a11y.dismiss")}
            onClick={dismiss}
          >
            <X className="size-4" aria-hidden="true" />
          </Button>
        </div>

        <p className="text-sm font-semibold">{t("welcome.question")}</p>

        {/* Namenski gumbi — vsak ≥ 44 px, ikona + besedilo (§26/§29) */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <Button asChild variant="outline" className="h-11 justify-start" onClick={() => choose("plan")}>
            <Link href="/nacrtuj">
              <Route className="size-4 shrink-0" aria-hidden="true" />
              {t("welcome.intentPlan")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-start" onClick={() => choose("discover")}>
            <Link href="/destinacije">
              <Compass className="size-4 shrink-0" aria-hidden="true" />
              {t("welcome.intentDiscover")}
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-start" onClick={() => choose("find")}>
            <Link href="/zemljevid">
              <MapIcon className="size-4 shrink-0" aria-hidden="true" />
              {t("welcome.intentFind")}
            </Link>
          </Button>
          <Button
            variant="outline"
            className="h-11 justify-start"
            onClick={() => {
              choose("help");
              // Pred-izpolnjeno vprašanje — NE pošlje samodejno (W9 kanon).
              openChatWithQuestion(t("welcome.helpQuestion"));
            }}
          >
            <HelpCircle className="size-4 shrink-0" aria-hidden="true" />
            {t("welcome.intentHelp")}
          </Button>
          {/* Varna možnost (§6) — polnopravna vodena pot (§18) */}
          <Button
            asChild
            className="h-11 justify-start"
            onClick={() => {
              choose("dont_know");
            }}
          >
            <Link href="/destinacije">
              <MapPin className="size-4 shrink-0" aria-hidden="true" />
              {t("welcome.intentDontKnow")}
            </Link>
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 px-2 text-xs"
            onClick={() => {
              markFirstRunSeen();
              setHidden(true);
              trackPlannerEvent("guidance_dismissed", { state: "NEW_USER", surface: "home" });
            }}
          >
            {t("welcome.dismiss")}
          </Button>
        </p>
      </CardContent>
    </Card>
  );
}
