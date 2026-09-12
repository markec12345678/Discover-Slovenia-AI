import { Card, CardContent } from "@/components/ui/card";
import { getTranslations } from "next-intl/server";
import {
  Mountain,
  Waves,
  Castle,
  Trees,
  UtensilsCrossed,
  Compass,
} from "lucide-react";
import { SectionHeader } from "@/components/section-header";
import { Reveal } from "@/components/reveal";

const experiences = [
  {
    icon: Mountain,
    titleKey: "hikingTitle",
    descriptionKey: "hikingDesc",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Waves,
    titleKey: "waterTitle",
    descriptionKey: "waterDesc",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: Castle,
    titleKey: "historyTitle",
    descriptionKey: "historyDesc",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Trees,
    titleKey: "natureTitle",
    descriptionKey: "natureDesc",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: UtensilsCrossed,
    titleKey: "foodTitle",
    descriptionKey: "foodDesc",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Compass,
    titleKey: "gemsTitle",
    descriptionKey: "gemsDesc",
    color: "bg-accent text-accent-foreground",
  },
];

export async function ExperiencesSection() {
  const t = await getTranslations("homeExp");

  return (
    <section id="izkušnje" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          subtitle={t("subtitle")}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiences.map((exp, i) => {
            const Icon = exp.icon;
            return (
              <Reveal key={t(exp.titleKey)} delay={i * 90} y={28}>
                <Card className="group h-full border-border/60 transition-all duration-300 hover:-translate-y-1 hover:border-primary/40 hover:shadow-lg">
                  <CardContent className="p-6">
                    <div
                      className={`size-12 rounded-lg flex items-center justify-center mb-4 transition-transform duration-300 group-hover:scale-110 ${exp.color}`}
                    >
                      <Icon className="size-6" />
                    </div>
                    <h3 className="text-lg font-semibold mb-2">{t(exp.titleKey)}</h3>
                    <p className="text-sm text-muted-foreground">{t(exp.descriptionKey)}</p>
                  </CardContent>
                </Card>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
