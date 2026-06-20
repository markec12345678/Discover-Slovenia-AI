import { Card, CardContent } from "@/components/ui/card";
import {
  Mountain,
  Waves,
  Castle,
  Trees,
  UtensilsCrossed,
  Compass,
} from "lucide-react";

const experiences = [
  {
    icon: Mountain,
    title: "Pohodništvo",
    description: "Triglav, Mangart, Storžič — od lahnih sprehodov do zahtevnih vzponov.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Waves,
    title: "Vodne avanture",
    description: "Rafting na Soči, kajak na Kolpi, smučanje na vodi v Portorožu.",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: Castle,
    title: "Zgodovina & kultura",
    description: "Srednjeveški gradovi, Predjama, Ljubljanski grad, muzeji Soške fronte.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Trees,
    title: "Narava & parki",
    description: "Triglavski narodni park, Cerkniško jezero, slovenski gozdovi.",
    color: "bg-accent text-accent-foreground",
  },
  {
    icon: UtensilsCrossed,
    title: "Kulinariika",
    description: "Od kremšnite do štrukljev, od Teranov do rebule — 24 gastronomskih regij.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Compass,
    title: "Skrite dragulje",
    description: "Vintgarska soteska, soline Sečovlje, Logarska dolina — izven utirjenih poti.",
    color: "bg-accent text-accent-foreground",
  },
];

export function ExperiencesSection() {
  return (
    <section id="izkušnje" className="py-20">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight">
            Neskončne možnosti doživetij
          </h2>
          <p className="mt-4 text-muted-foreground max-w-2xl mx-auto">
            Slovenija ponuja vse od alpskih vrhov do jadranske obale — na površini
            manjši od Walesa.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {experiences.map((exp) => {
            const Icon = exp.icon;
            return (
              <Card
                key={exp.title}
                className="border-border/60 hover:border-primary/40 transition-colors"
              >
                <CardContent className="p-6">
                  <div
                    className={`size-12 rounded-lg flex items-center justify-center mb-4 ${exp.color}`}
                  >
                    <Icon className="size-6" />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">{exp.title}</h3>
                  <p className="text-sm text-muted-foreground">{exp.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
