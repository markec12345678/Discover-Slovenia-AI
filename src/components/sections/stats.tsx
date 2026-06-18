import { Users, Map, Calendar, TrendingUp } from "lucide-react";

const stats = [
  { icon: Map, value: "12", label: "Vrhunskih destinacij" },
  { icon: Users, value: "2,4 mio", label: "Obiskovalcev letno" },
  { icon: Calendar, value: "4 sezone", label: "Aktivnosti vse leto" },
  { icon: TrendingUp, value: "60%", label: "Slovenije pod gozdom" },
];

export function StatsSection() {
  return (
    <section className="py-16 bg-primary text-primary-foreground">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="text-center">
                <div className="size-10 mx-auto rounded-full bg-primary-foreground/10 flex items-center justify-center mb-3">
                  <Icon className="size-5" />
                </div>
                <div className="text-3xl sm:text-4xl font-bold mb-1">
                  {stat.value}
                </div>
                <div className="text-sm text-primary-foreground/80">
                  {stat.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
