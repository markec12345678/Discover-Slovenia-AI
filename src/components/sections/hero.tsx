import Image from "next/image";
import { Sparkles } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { HeroQuickInput } from "@/components/hero-quick-input";

/**
 * Hero sekcija — "WOW ob prvem obisku"
 *
 * Turist v 10 sekundah reče: "To mi dejansko pomaga bolj kot Google."
 *
 * Natural language input + quick action buttons + AI analyzing animation
 */
export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section
      id="vrh"
      className="relative flex min-h-[90vh] w-full items-center justify-center overflow-hidden"
      aria-label="Predstavitev platforme Discover Slovenia AI"
    >
      {/* Background slika — Bled ob sončnem zahodu */}
      <Image
        src="https://sfile.chatglm.cn/images-ppt/6e61d0d8dc53.jpg"
        alt="Blejsko jezero z otokom, cerkvijo in gradom ob sončnem zahodu"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Dark overlay */}
      <div className="hero-overlay absolute inset-0" aria-hidden="true" />

      {/* Vsebina */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-20 text-center sm:px-6 lg:px-8">
        {/* Badge */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md sm:text-sm">
            <Sparkles className="size-3.5 text-accent-foreground/90" aria-hidden="true" />
            <span aria-hidden="true">🇸🇮</span>
            <span>AI Concierge za Slovenijo</span>
          </span>
        </div>

        {/* H1 — naravni jezik */}
        <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-3 text-4xl font-bold tracking-tight text-white drop-shadow-lg duration-700 sm:text-5xl lg:text-6xl">
          Kaj želiš doživeti v Sloveniji?
        </h1>

        {/* Podnaslov */}
        <p className="mt-4 max-w-xl animate-in fade-in slide-in-from-bottom-4 text-base text-white/90 drop-shadow-sm duration-700 delay-75 sm:text-lg">
          Povej AI kaj iščeš — v slovenščini ali angleščini.
          AI sestavi popoln dan z lokalnimi partnerji.
        </p>

        {/* WOW: Natural language input */}
        <div className="mt-8 w-full animate-in fade-in slide-in-from-bottom-5 duration-700 delay-150">
          <HeroQuickInput />
        </div>
      </div>
    </section>
  );
}

export default Hero;
