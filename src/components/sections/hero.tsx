import Image from "next/image";
import { ChevronDown, ShieldCheck } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HeroQuickInput } from "@/components/hero-quick-input";

/**
 * Hero sekcija — "WOW ob prvem obisku"
 *
 * Turist v 10 sekundah reče: "To mi dejansko pomaga bolj kot Google."
 *
 * P4-5 vizualni vrhunec (raziskava: hero ima 3 sekunde):
 * - Ken Burns počasni zoom (kinematografska živost, reduced-motion varno)
 * - Tri-plastni kinematografski overlay (globals.css .hero-overlay)
 * - Vrh zajamčen pod navigacijo (-mt-16) → prozorna nav nad fotografijo
 *   (pattern GYG/Airbnb — navigacija "lebdi" nad herojem)
 * - Scroll cue s mehakim utripanjem (dolžina strani ~20 sekcij)
 */
export async function Hero() {
  const t = await getTranslations("hero");
  return (
    <section
      id="vrh"
      className="relative -mt-16 flex min-h-[92vh] w-full items-center justify-center overflow-hidden pt-16"
      aria-label={t("sectionAriaLabel")}
    >
      {/* Background slika — Bled ob sončnem zahodu, Ken Burns zoom */}
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        <Image
          src="/content/hero-main.jpg"
          alt={t("imageAlt")}
          fill
          priority
          sizes="100vw"
          className="hero-kenburns object-cover"
        />
      </div>

      {/* Kinematografski overlay */}
      <div className="hero-overlay absolute inset-0" aria-hidden="true" />

      {/* Vsebina */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-24 pt-20 text-center sm:px-6 lg:px-8">
        {/* Badge — PREMIUM-VIZ: en signal manj (brez Sparkles ikone),
            zastavica + besedilo sta dovolj */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white shadow-sm backdrop-blur-md sm:text-sm">
            <span aria-hidden="true">🇸🇮</span>
            <span>{t("badge")}</span>
          </span>
        </div>

        {/* H1 — naravni jezik */}
        <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-3 text-balance text-4xl font-bold leading-[1.08] tracking-tight text-white drop-shadow-[0_4px_24px_rgba(0,0,0,0.45)] duration-700 sm:text-5xl lg:text-6xl">
          {t("title")}
        </h1>

        {/* Podnaslov */}
        <p className="mt-4 max-w-xl animate-in fade-in slide-in-from-bottom-4 text-balance text-base text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] duration-700 delay-75 sm:text-lg">
          {t("subtitle")}
        </p>

        {/* WOW: Natural language input */}
        <div className="mt-8 w-full animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150">
          <HeroQuickInput />
        </div>

        {/* OPCIJA-2 (duša): mikro-vrstica zaupanja pod vnosom — iskrena
            social proof namesto vanity metrik. Tri stvari, ki jih lahko
            obiskovalec PREVERI (brez računa, preverjeni km/cene, datum
            posodobitve) + topel ločilni pikčasti ritem. */}
        <p className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-white/85 drop-shadow-[0_1px_8px_rgba(0,0,0,0.5)] sm:text-sm">
          <ShieldCheck className="size-3.5 text-amber-300" aria-hidden="true" />
          <span>{t("trustNoAccount")}</span>
          <span aria-hidden="true" className="text-amber-300/80">·</span>
          <span>{t("trustVerified")}</span>
          <span aria-hidden="true" className="text-amber-300/80">·</span>
          <span>{t("trustUpdated")}</span>
        </p>
      </div>

      {/* Scroll cue — namig na 20+ sekcij vsebine pod herojem */}
      <a
        href="#stats"
        className="hero-scroll-cue absolute bottom-6 left-1/2 z-10 -translate-x-1/2 flex-col items-center gap-1 text-white/70 transition-colors hover:text-white hidden sm:flex"
        aria-label={t("scrollCueAriaLabel")}
      >
        <span className="text-[10px] font-medium uppercase tracking-[0.2em]">
          {t("scrollCue")}
        </span>
        <ChevronDown className="size-5" aria-hidden="true" />
      </a>
    </section>
  );
}

export default Hero;
