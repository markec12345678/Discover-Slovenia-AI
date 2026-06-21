import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hreflangForPath } from "@/components/seo";
import { Calendar, Clock, Users, ArrowRight, Sparkles } from "lucide-react";

const DURATIONS = [
  { slug: "1-dan", label: "1 dan", days: 1, desc: "Hitri obisk" },
  { slug: "vikend", label: "Vikend (2 dni)", days: 2, desc: "Popoln vikend pobeg" },
  { slug: "3-dnevi", label: "3 dni", days: 3, desc: "Poglobljen obisk" },
  { slug: "5-dnevi", label: "5 dni", days: 5, desc: "Celovito doživetje" },
  { slug: "7-dnevi", label: "7 dni", days: 7, desc: "Teden raziskovanja" },
];

const TRAVELER_TYPES = [
  { slug: "pari", label: "Za pare", desc: "Romantični pobeg" },
  { slug: "druzina", label: "Družinsko", desc: "Zabava za vse starosti" },
  { slug: "solo", label: "Solo potnik", desc: "Samostojno raziskovanje" },
  { slug: "avanturist", label: "Avanturist", desc: "Adrenalin in narava" },
];

export async function generateStaticParams() {
  const params: { slug: string; duration: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const dur of DURATIONS) {
      params.push({ slug: dest.slug, duration: dur.slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; duration: string }>;
}): Promise<Metadata> {
  const { slug, duration } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const dur = DURATIONS.find((d) => d.slug === duration);
  if (!dest || !dur) return { title: "Itinerer ni najden" };
  return {
    title: `${dur.label} itinerer za ${dest.name} — ${dur.desc} | I Feel Slovenia`,
    description: `Popoln ${dur.label.toLowerCase()} itinerer za ${dest.name}, ${dest.tagline}. ${dur.desc} — AI-priporočene aktivnosti, nastanitve in restavracije za ${dur.days}-dnevni obisk.`,
    keywords: [dest.name, "itinerer", dur.label, "potovanje", "Slovenija", "načrt", dest.region],
    openGraph: {
      title: `${dur.label} itinerer za ${dest.name}`,
      description: `AI-priporočeni ${dur.label} itinerer z aktivnostmi, nastanitvami in restavracijami.`,
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: "sl_SI",
    },
    alternates: { canonical: `https://ifeelslovenia.si/destinacija/${dest.slug}/itinerary/${dur.slug}`, languages: hreflangForPath(`/destinacija/${dest.slug}/itinerary/${dur.slug}`) },
  };
}

export default async function ItineraryPage({
  params,
}: {
  params: Promise<{ slug: string; duration: string }>;
}) {
  const { slug, duration } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const dur = DURATIONS.find((d) => d.slug === duration);
  if (!dest || !dur) notFound();

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: `${dur.label} itinerer za ${dest.name}`,
    description: `${dur.desc} — ${dest.description}`,
    touristDestination: { "@type": "TouristDestination", name: dest.name },
    image: dest.image,
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <div className="relative h-[350px] w-full overflow-hidden">
        <img src={dest.image} alt={dest.name} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">{dur.label}</Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
            {dur.label} itinerer za {dest.name}
          </h1>
          <p className="mt-2 text-white/90">{dur.desc} — {dest.tagline}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">Pregled potovanja</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Calendar className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dur.days}</div>
                  <div className="text-sm text-muted-foreground">{dur.days === 1 ? "dan" : "dni"}</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Users className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dest.costPerPerson * dur.days}€</div>
                  <div className="text-sm text-muted-foreground">ocena / osebo</div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex items-center gap-3 p-4">
                <Sparkles className="size-8 text-primary" />
                <div>
                  <div className="text-2xl font-bold">{dest.rating}★</div>
                  <div className="text-sm text-muted-foreground">ocena destinacije</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">Predlagani dnevni razpored</h2>
          <div className="space-y-4">
            {Array.from({ length: dur.days }).map((_, dayIdx) => (
              <Card key={dayIdx}>
                <CardContent className="p-5">
                  <div className="flex items-start gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold">
                      {dayIdx + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">Dan {dayIdx + 1}</h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {dayIdx === 0 ? `Prihod in raziskovanje ${dest.name}` : dayIdx === dur.days - 1 ? `Zadnji dan in odhod` : `Celodnevno raziskovanje`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {dest.highlights.slice(dayIdx * 2, (dayIdx + 1) * 2).map((h) => (
                          <Badge key={h} variant="secondary">{h}</Badge>
                        ))}
                      </div>
                      <div className="mt-3 flex items-center gap-4 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><Clock className="size-3.5" /> 4-6 ur</span>
                        <span className="flex items-center gap-1"><Users className="size-3.5" /> {dest.costPerPerson}€/osebo</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">Itinerarji po tipu popotnika</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {TRAVELER_TYPES.map((tt) => (
              <Card key={tt.slug} className="hover:border-primary/40 transition-colors">
                <CardContent className="p-5">
                  <h3 className="font-semibold mb-1">{tt.label}</h3>
                  <p className="text-sm text-muted-foreground mb-3">{tt.desc}</p>
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/#nacrtuj`}>
                      Generiraj itinerer <ArrowRight className="size-3.5 ml-1" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">Ostale destinacije</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id).slice(0, 10).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/itinerary/${dur.slug}`}>{d.name}</Link>
              </Button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-3">Želite personaliziran itinerer?</h2>
          <p className="text-muted-foreground mb-5">
            Naš AI upošteva vaš proračun, interese in sezono za popoln načrt.
          </p>
          <Button asChild size="lg">
            <Link href="/#nacrtuj">
              <Sparkles className="size-4 mr-2" />
              Generiraj AI itinerer
            </Link>
          </Button>
        </section>
      </div>
    </div>
  );
}
