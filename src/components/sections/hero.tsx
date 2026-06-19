import Link from "next/link";
import Image from "next/image";
import { Users, Trees, Waves, Sparkles, ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { Button } from "@/components/ui/button";

/**
 * Hero sekcija — server component.
 * Full-height uvod z Blejskim jezerom v ozadju, dark overlay in CTA gumbi.
 * Animiran fade-in preko tw-animate-css (deluje tudi v RSC).
 *
 * Tekst (title, subtitle, CTA, badge) je lokaliziran preko next-intl
 * `getTranslations("hero")`.
 */
export async function Hero() {
  const t = await getTranslations("hero");

  return (
    <section
      id="vrh"
      className="relative flex min-h-[90vh] w-full items-center justify-center overflow-hidden"
      aria-label="Predstavitev platforme I Feel Slovenia"
    >
      {/* Background slika — Bled */}
      <Image
        src="https://sfile.chatglm.cn/images-ppt/65ea408c89ea.jpg"
        alt="Blejsko jezero z otokom in gradom v ozadju"
        fill
        priority
        sizes="100vw"
        className="object-cover"
      />

      {/* Dark overlay (linearni gradient iz globals.css) */}
      <div className="hero-overlay absolute inset-0" aria-hidden="true" />

      {/* Vsebina */}
      <div className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 py-24 text-center sm:px-6 lg:px-8">
        {/* Badge */}
        <div className="animate-in fade-in slide-in-from-bottom-2 duration-700">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-4 py-1.5 text-xs font-medium text-white backdrop-blur-md sm:text-sm">
            <Sparkles className="size-3.5 text-accent-foreground/90" aria-hidden="true" />
            <span aria-hidden="true">🇸🇮</span>
            <span>{t("badge")}</span>
          </span>
        </div>

        {/* H1 */}
        <h1 className="mt-6 animate-in fade-in slide-in-from-bottom-3 text-5xl font-bold tracking-tight text-white drop-shadow-lg duration-700 sm:text-6xl lg:text-7xl">
          {t("title")}
        </h1>

        {/* Podnaslov */}
        <p className="mt-5 max-w-2xl animate-in fade-in slide-in-from-bottom-4 text-base text-white/90 drop-shadow-sm duration-700 delay-75 sm:text-lg lg:text-xl">
          {t("subtitle")}
        </p>

        {/* CTA gumbi */}
        <div className="mt-9 flex w-full animate-in fade-in slide-in-from-bottom-5 flex-col items-center gap-3 duration-700 delay-150 sm:w-auto sm:flex-row">
          <Button
            asChild
            size="lg"
            className="w-full bg-background text-foreground shadow-lg hover:bg-background/90 sm:w-auto"
          >
            <Link href="#načrtuj">
              {t("ctaPrimary")}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full border-white/40 bg-transparent text-white backdrop-blur-sm hover:bg-white/10 hover:text-white sm:w-auto"
          >
            <Link href="#destinacije">{t("ctaSecondary")}</Link>
          </Button>
        </div>

        {/* Mini-stat karte */}
        <div className="mt-14 grid w-full max-w-3xl animate-in fade-in slide-in-from-bottom-6 grid-cols-1 gap-3 duration-700 delay-300 sm:grid-cols-3">
          <StatCard
            icon={<Users className="size-5" aria-hidden="true" />}
            value="2,4 mio"
            label="obiskovalcev na leto"
          />
          <StatCard
            icon={<Trees className="size-5" aria-hidden="true" />}
            value="60%"
            label="ozemlja pokrivajo gozdovi"
          />
          <StatCard
            icon={<Waves className="size-5" aria-hidden="true" />}
            value="47 km"
            label="slovenske obale"
          />
        </div>
      </div>
    </section>
  );
}

/**
 * Translucentna statistična kartica za hero sekcijo.
 */
function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: string;
  label: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-left backdrop-blur-md">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/15 text-white">
        {icon}
      </span>
      <span className="flex flex-col leading-tight">
        <span className="text-xl font-bold text-white">{value}</span>
        <span className="text-xs font-medium text-white/80">{label}</span>
      </span>
    </div>
  );
}

export default Hero;
