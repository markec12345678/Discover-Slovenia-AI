"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { localePrefix } from "@/i18n/routing";
import {
  Sparkles,
  Leaf,
  Heart,
  Users,
  UtensilsCrossed,
  Zap,
  Trees,
  Loader2,
  Mountain,
  Sprout,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// ============================================================================
// HERO QUICK INPUT — "Kaj želiš doživeti v Sloveniji?"
// ============================================================================
//
// WOW moment: Turist napiše eno poved → AI sestavi popoln dan.
// FW3 (AI-first hierarhija): intent chipi po predlogu uporabnika —
// 6 konkretnih želja (miren vikend, romantika, družina, hrana & vino,
// avantura, brez gužve). Submit ne scrolla več na sekcijo na homepageu,
// ampak navigira na /načrtuj (AI planner ima tam svojo celo stran), kamor
// se vprašanje prenese prek sessionStorage.
// ============================================================================

// FW4.3: chipi so dvojni — label (gumb) + query (AI oseba­lizacijski vnos,
// ki se pošlje v /nacrtuj). Oba sta v sporočilih (heroChips namespace),
// da se celoten vnos prevede (label SAMO ne bi zadostoval — uporabnik
// bi videl EN gumb, planner pa dobil SL poizvedbo).
// Issue #3 (UX REDESIGN): +2 primera iz naročila ("Narava in hrana",
// "Morje + gore") — primarna izkušnja je ENO dominantno vprašanje +
// nekaj primerov; obstoječih 6 čipov NE odstranjamo (ZERO FEATURE LOSS).
const QUICK_ACTIONS = [
  { icon: Leaf, labelKey: "calmWeekend", queryKey: "calmWeekendQuery" },
  { icon: Sprout, labelKey: "natureFood", queryKey: "natureFoodQuery" },
  { icon: Mountain, labelKey: "seaMountains", queryKey: "seaMountainsQuery" },
  { icon: Heart, labelKey: "romantic", queryKey: "romanticQuery" },
  { icon: Users, labelKey: "family", queryKey: "familyQuery" },
  { icon: UtensilsCrossed, labelKey: "foodWine", queryKey: "foodWineQuery" },
  { icon: Zap, labelKey: "adventure", queryKey: "adventureQuery" },
  { icon: Trees, labelKey: "noCrowds", queryKey: "noCrowdsQuery" },
] as const;

export function HeroQuickInput() {
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("hero");
  const tChips = useTranslations("heroChips");
  const tTrust = useTranslations("heroTrust");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  // FW3: vprašanje se prenese na /načrtuj prek sessionStorage —
  // planner ga ob mountu samodejno prevzame in zgenerira itinerer.
  // FW4.3-2: ohrani locale (EN uporabnik ostane na /en/nacrtuj).
  const handleSubmit = useCallback((query?: string) => {
    const text = query || input;
    if (!text.trim() || loading) return;

    setLoading(true);
    sessionStorage.setItem("heroQuery", text);
    router.push(`${localePrefix(locale)}/nacrtuj`);
  }, [input, loading, locale, router]);

  return (
    <div className="w-full max-w-2xl mx-auto">
      {/* Glavni input — plavajoča steklena kartica s fokusnim žarom */}
      <div className="relative">
        <div
          className="group flex flex-col sm:flex-row gap-2 p-2 rounded-2xl bg-background/95 backdrop-blur-md border border-white/25 transition-all duration-300 focus-within:border-white/50 focus-within:shadow-[0_0_0_4px_rgba(255,255,255,0.12),0_20px_50px_-12px_rgba(0,0,0,0.5)]"
          style={{ boxShadow: "0 20px 50px -12px rgba(0,0,0,0.45)" }}
        >
          <div className="flex items-center gap-2 flex-1 px-3">
            <Sparkles className="size-5 text-primary shrink-0 transition-transform duration-300 group-focus-within:scale-110 group-focus-within:rotate-12" aria-hidden="true" />
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
              placeholder={t("placeholder")}
              className="w-full bg-transparent py-3 text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
              aria-label={t("inputAriaLabel")}
            />
          </div>
          <Button
            onClick={() => handleSubmit()}
            disabled={loading || !input.trim()}
            className="rounded-xl shrink-0 gap-1.5 shadow-md transition-all hover:shadow-lg hover:brightness-110"
            size="lg"
          >
            {loading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles className="size-4" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">{loading ? t("ctaLoading") : t("cta")}</span>
            <span className="sm:hidden">{loading ? t("ctaLoadingMobile") : t("ctaMobile")}</span>
          </Button>
        </div>
      </div>

      {/* TASK 71 (raziskava TASK 68 P6): mikrocopy nad čipi — čipi so
          DEJANSKO 1-klik izkušnja (klik → samodejni submit → /nacrtuj
          prevzame query in zgenerira načrt); besedilo to izreče
          (Wanderlogov "1 klik" vzorec znižuje zaznano kompleksnost).
          id + aria-labelledby čipe označi kot imenovano skupino. */}
      <p
        id="hero-quick-chips-label"
        className="mt-5 text-center text-xs font-medium text-white/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-sm"
      >
        {t("chipsHint")}
      </p>

      {/* Intent chipi — 8 želje (FW3 predlog + Issue #3 primera); py-2.5 = ~46px tap tarča (2026 standard) */}
      <div
        role="group"
        aria-labelledby="hero-quick-chips-label"
        className="mt-3 flex flex-wrap justify-center gap-2.5"
      >
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.labelKey}
              type="button"
              onClick={() => {
                const query = tChips(action.queryKey);
                setInput(query);
                handleSubmit(query);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/30 bg-white/10 backdrop-blur-sm px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/20 hover:border-white/50 hover:scale-105 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {tChips(action.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Issue #3 (START ANYWHERE secondary): "Imaš že vire?" — povezava /
          slika / PDF / Google pins uvoz živi na /nacrtuj (zavihki v bloku
          Start Anywhere). Tu je SEKUNDARNA vrstica, da je dominantno vprašanje
          ŠE VEDNO en sam AI vnos (HIDE ≠ DELETE — zmožnost ostane, vidnost
          kontekstualna). Sidro #start-kjerkoli na načrtovalniku. */}
      <p className="mt-4 text-center text-xs text-white/70 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-[13px]">
        <a
          href={`${localePrefix(locale)}/nacrtuj#start-kjerkoli`}
          className="underline decoration-white/40 underline-offset-4 transition-colors hover:text-white hover:decoration-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50 rounded-sm"
        >
          {t("startAnywhere")}
        </a>
      </p>

      {/* Trust indicators — raziskava P4-5: subtilni trust signali dvigujejo konverzijo
          PREMIUM-VIZ: pike poenotene v enoten bel ton (prej 4 barvne —
          sky/vijolična izven palete) */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs font-medium text-white/75">
        <span className="flex items-center gap-1.5">
          <span className="soft-pulse size-2 rounded-full bg-white/80" aria-hidden="true" />
          {tTrust("free")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/70" aria-hidden="true" />
          {tTrust("destinations")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/70" aria-hidden="true" />
          {tTrust("aiSlovenian")}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-white/70" aria-hidden="true" />
          {tTrust("verifiedPartners")}
        </span>
      </div>
    </div>
  );
}

export default HeroQuickInput;
