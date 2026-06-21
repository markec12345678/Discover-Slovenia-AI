import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { hreflangForPath } from "@/components/seo";
import { Calendar, Sun, Leaf, Snowflake, Cloud, ArrowRight, Sparkles, MapPin } from "lucide-react";

const SEASONS = [
  { slug: "pomlad", label: "Pomlad", months: " marec–maj", icon: Leaf, temp: "10-20°C", desc: "Cvetenje, zmerno vreme, manj turistov" },
  { slug: "poletje", label: "Poletje", months: " junij–avgust", icon: Sun, temp: "20-30°C", desc: "Toplo, idealno za vodo in pohode" },
  { slug: "jesen", label: "Jesen", months: " september–november", icon: Cloud, temp: "10-20°C", desc: "Barve lista, vino, manj gneče" },
  { slug: "zima", label: "Zima", months: " december–februar", icon: Snowflake, temp: "0-5°C", desc: "Smučanje, praznični sejmi, wellness" },
];

const SEASON_MAP: Record<string, string> = {
  pomlad: "spring", poletje: "summer", jesen: "autumn", zima: "winter",
};

const FAQ_TEMPLATES = (destName: string, seasonLabel: string, temp: string) => [
  { q: `Kdaj je najboljši čas za obisk ${destName}?`, a: `${seasonLabel} je odličen čas za obisk ${destName}. Temperature so ${temp}, kar je idealno za raziskovanje. Pomlad in jesen ponujata manj turistov in nižje cene.` },
  { q: `Kakšno je vreme v ${destName} ${seasonLabel.toLowerCase()}?`, a: `V ${seasonLabel.toLowerCase()} so temperature v ${destName} običajno ${temp}. Priporočamo slojevito oblačenje.` },
  { q: `Katere aktivnosti so na voljo v ${destName} ${seasonLabel.toLowerCase()}?`, a: `${seasonLabel} v ${destName} ponuja različne aktivnosti — od pohodništva do kulinarike. Preverite naš seznam stvari za početi v ${destName}.` },
  { q: `Ali potrebujem rezervacijo za obisk ${destName}?`, a: `Priporočamo rezervacijo nastanitve vsaj 2 tedna vnaprej, še posebej v sezoni. Uporabite naš AI načrtovalec za optimizacijo itinererja.` },
];

export async function generateStaticParams() {
  const params: { slug: string; season: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const season of SEASONS) {
      params.push({ slug: dest.slug, season: season.slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}): Promise<Metadata> {
  const { slug, season } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const s = SEASONS.find((x) => x.slug === season);
  if (!dest || !s) return { title: "Stran ni najdena" };
  return {
    title: `Najboljši čas za obisk ${dest.name} — ${s.label} | I Feel Slovenia`,
    description: `Kdaj obiskati ${dest.name}? ${s.label} (${s.months}): ${s.desc}. Temperature ${s.temp}. Nasveti, aktivnosti in ${s.label.toLowerCase()} itinerer za ${dest.name}.`,
    keywords: [dest.name, "najboljši čas", s.label, "kdaj obiskati", "vreme", "Slovenija", dest.region],
    openGraph: {
      title: `Najboljši čas za obisk ${dest.name} — ${s.label}`,
      description: `${s.desc}. Temperature ${s.temp}. Vodič za ${dest.name} ${s.label.toLowerCase()}.`,
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: "sl_SI",
    },
    alternates: { canonical: `https://ifeelslovenia.si/destinacija/${dest.slug}/best-time-to-visit/${s.slug}`, languages: hreflangForPath(`/destinacija/${dest.slug}/best-time-to-visit/${s.slug}`) },
  };
}

export default async function BestTimeToVisitPage({
  params,
}: {
  params: Promise<{ slug: string; season: string }>;
}) {
  const { slug, season } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const s = SEASONS.find((x) => x.slug === season);
  if (!dest || !s) notFound();

  const seasonKey = SEASON_MAP[season] || "summer";
  const isBestSeason = dest.bestSeason.includes(seasonKey as any);
  const Icon = s.icon;
  const faqs = FAQ_TEMPLATES(dest.name, s.label, s.temp);

  // JSON-LD: FAQPage + BreadcrumbList
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Domov", item: "https://ifeelslovenia.si/" },
      { "@type": "ListItem", position: 2, name: dest.name, item: `https://ifeelslovenia.si/destinacija/${dest.slug}/things-to-do` },
      { "@type": "ListItem", position: 3, name: `Najboljši čas — ${s.label}` },
    ],
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-4xl px-4 pt-6">
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/" className="hover:text-foreground">Domov</Link>
          <span>/</span>
          <Link href={`/destinacija/${dest.slug}/things-to-do`} className="hover:text-foreground">{dest.name}</Link>
          <span>/</span>
          <span className="text-foreground">Najboljši čas — {s.label}</span>
        </nav>
      </div>

      {/* Hero */}
      <div className="relative h-[300px] w-full overflow-hidden mt-4">
        <img src={dest.image} alt={`${dest.name} ${s.label}`} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className={`mb-3 ${isBestSeason ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"}`}>
            {isBestSeason ? "✓ Najboljša sezona" : `${s.label}`}
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-bold text-white drop-shadow-lg">
            Najboljši čas za obisk {dest.name}
          </h1>
          <p className="mt-2 text-white/90 text-lg">{s.label} · {s.months} · {s.temp}</p>
        </div>
      </div>

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Pregled sezone */}
        <section className="mb-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
              <Icon className="size-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{dest.name} v {s.label.toLowerCase()}</h2>
              <p className="text-sm text-muted-foreground">{s.desc}</p>
            </div>
          </div>

          {isBestSeason ? (
            <Card className="border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Sparkles className="size-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">
                    {s.label} je idealna sezona za {dest.name}!
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {dest.name} je v tej sezoni na vrhuncu — {dest.tagline.toLowerCase()}.
                  </p>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-amber-500/40 bg-amber-50 dark:bg-amber-950/20">
              <CardContent className="p-4 flex items-start gap-3">
                <Calendar className="size-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-700 dark:text-amber-400">
                    {s.label} ni glavna sezona za {dest.name}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Vendar je to lahko prednost — manj turistov, nižje cene in drugačen doživljaj.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </section>

        {/* Ostale sezone */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Vse sezone za {dest.name}</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SEASONS.map((other) => {
              const OtherIcon = other.icon;
              const otherBest = dest.bestSeason.includes(SEASON_MAP[other.slug] as any);
              const isActive = other.slug === s.slug;
              return (
                <Link key={other.slug} href={`/destinacija/${dest.slug}/best-time-to-visit/${other.slug}`}>
                  <Card className={`cursor-pointer transition-all hover:shadow-md ${isActive ? "border-primary" : ""}`}>
                    <CardContent className="p-4 text-center">
                      <OtherIcon className={`size-6 mx-auto mb-2 ${otherBest ? "text-emerald-500" : "text-muted-foreground"}`} />
                      <p className="font-medium text-sm">{other.label}</p>
                      <p className="text-xs text-muted-foreground">{other.temp}</p>
                      {otherBest && <Badge className="mt-1 text-[10px] bg-emerald-500 text-white">★ Najboljša</Badge>}
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-xl font-bold mb-4">Pogosta vprašanja</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 flex items-start gap-2">
                    <span className="text-primary font-bold">Q:</span>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary font-bold">A:</span>
                    {faq.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-xl font-bold mb-3">Načrtujte {s.label.toLowerCase()} potovanje v {dest.name}</h2>
          <p className="text-muted-foreground mb-5">
            AI upošteva sezono, vreme in vaše interese za popoln načrt.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/#nacrtuj">
                <Sparkles className="size-4 mr-2" />
                AI itinerer
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                Kaj početi v {dest.name}
                <ArrowRight className="size-4 ml-2" />
              </Link>
            </Button>
          </div>
        </section>

        {/* Related destinations */}
        <section className="mt-12">
          <h2 className="text-xl font-bold mb-4">Raziščite tudi</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id && d.bestSeason.includes(seasonKey as any)).slice(0, 8).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/best-time-to-visit/${s.slug}`}>
                  <MapPin className="size-3.5 mr-1" />
                  {d.name}
                </Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
