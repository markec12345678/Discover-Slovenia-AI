import Image from "next/image";
import { getTranslations } from "next-intl/server";
import { ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Reveal } from "@/components/reveal";
import { SectionHeader } from "@/components/section-header";

/**
 * ExperiencesSection — kategorije doživetij (P1 PREMIUM-VIZ).
 *
 * Prej: SaaS vzorec "ikona + naslov + opis" v 3-stolpčni mreži (nič
 * fotografije). Zdaj: fotografske uredniške kartice — naslov se skliva
 * na dnu fotografije (funkcionalni scrim za berljivost), opis v telesu
 * kartice. Slovenija je vizualni hero, ne ikone.
 *
 * Funkcionalnost: klik vodi na obstoječo stran /dozivetja (isti ključi
 * prevodov homeExp.*, samo dodan imageAlt ključ na jezik).
 */
const experiences = [
  {
    titleKey: "hikingTitle",
    descriptionKey: "hikingDesc",
    altKey: "hikingAlt",
    image: "/content/triglav-vzpon-vodic.jpg",
  },
  {
    titleKey: "waterTitle",
    descriptionKey: "waterDesc",
    altKey: "waterAlt",
    image: "/content/slapovi-slovenije.jpg",
  },
  {
    titleKey: "historyTitle",
    descriptionKey: "historyDesc",
    altKey: "historyAlt",
    image: "/content/ptuj.jpg",
  },
  {
    titleKey: "natureTitle",
    descriptionKey: "natureDesc",
    altKey: "natureAlt",
    image: "/content/bohinj.jpg",
  },
  {
    titleKey: "foodTitle",
    descriptionKey: "foodDesc",
    altKey: "foodAlt",
    image: "/content/slovenska-kulinarika-7-jedi.jpg",
  },
  {
    titleKey: "gemsTitle",
    descriptionKey: "gemsDesc",
    altKey: "gemsAlt",
    image: "/content/vintgarska-soteska.jpg",
  },
] as const;

export async function ExperiencesSection() {
  const t = await getTranslations("homeExp");

  return (
    <section id="izkušnje" className="scroll-mt-20 py-16 sm:py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((exp, i) => (
            <Reveal key={t(exp.titleKey)} delay={i * 90} y={28}>
              <Link
                href="/dozivetja"
                className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border/60 bg-card transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                {/* Fotografija z naslovom na dnu (funkcionalni scrim) */}
                <div className="relative aspect-[4/3] w-full overflow-hidden bg-muted">
                  <Image
                    src={exp.image}
                    alt={t(exp.altKey)}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/15 to-transparent"
                    aria-hidden="true"
                  />
                  <h3 className="absolute inset-x-0 bottom-0 p-4 text-lg font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.4)] sm:text-xl">
                    {t(exp.titleKey)}
                  </h3>
                </div>

                {/* Opis — zakaj vredno obiska */}
                <p className="flex flex-1 items-center gap-2 p-4 text-sm leading-relaxed text-muted-foreground">
                  {t(exp.descriptionKey)}
                  <ArrowRight
                    className="ml-auto size-4 shrink-0 text-primary/60 transition-all duration-300 group-hover:translate-x-1 group-hover:text-primary"
                    aria-hidden="true"
                  />
                </p>
              </Link>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

export default ExperiencesSection;
