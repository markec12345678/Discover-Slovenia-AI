import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Star, Clock, ArrowRight, ExternalLink, Ticket, BedDouble } from "lucide-react";

export async function generateStaticParams() {
  return DESTINATIONS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  if (!dest) return { title: "Destinacija ni najdena" };
  return {
    title: `Kaj početi v ${dest.name} — Vodnik ${dest.name} | I Feel Slovenia`,
    description: `Odkrijte najboljše aktivnosti, atrakcije in izkušnje v ${dest.name}, ${dest.tagline}. Vodnik z ${dest.highlights.length} glavnimi znamenitosti, lokalnimi ponudniki in AI-priporočili.`,
    keywords: [dest.name, "kaj početi", "aktivnosti", "znamenitosti", "Slovenija", dest.region, ...dest.highlights],
    openGraph: {
      title: `Kaj početi v ${dest.name} — I Feel Slovenia`,
      description: `${dest.highlights.length} znamenitosti, lokalne restavracije, aktivnosti in izkušnje v ${dest.name}.`,
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: "sl_SI",
    },
    alternates: { canonical: `https://ifeelslovenia.si/destinacija/${dest.slug}/things-to-do` },
  };
}

export default async function ThingsToDoPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const dest = getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  if (!dest) notFound();

  // Pridobi povezane lokale, izkušnje in izdelke iz baze
  const [listings, experiences, products] = await Promise.all([
    db.listing.findMany({ where: { destinationId: dest.id }, take: 6, orderBy: { featured: "desc" } }),
    db.experience.findMany({ where: { destinationId: dest.id }, take: 6, orderBy: { featured: "desc" } }),
    db.product.findMany({ where: { destinationId: dest.id }, take: 4, orderBy: { featured: "desc" } }),
  ]);

  const totalActivities = listings.length + experiences.length;

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "TouristDestination",
    name: dest.name,
    description: dest.description,
    image: dest.image,
    geo: { "@type": "GeoCoordinates", latitude: dest.coords.lat, longitude: dest.coords.lng },
    aggregateRating: { "@type": "AggregateRating", ratingValue: dest.rating, reviewCount: 100 },
    address: { "@type": "PostalAddress", addressCountry: "SI", addressRegion: dest.region },
  };

  return (
    <div className="min-h-screen bg-background">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Hero */}
      <div className="relative h-[400px] w-full overflow-hidden">
        <img src={dest.image} alt={dest.name} className="size-full object-cover" />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">{dest.region}</Badge>
          <h1 className="text-4xl sm:text-5xl font-bold text-white drop-shadow-lg">
            Kaj početi v {dest.name}
          </h1>
          <p className="mt-3 max-w-2xl text-white/90 text-lg">{dest.tagline}</p>
          <p className="mt-2 text-white/70 text-sm">
            {dest.highlights.length} znamenitosti · {totalActivities} aktivnosti · Ocena {dest.rating}★
          </p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Opis */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-4">O {dest.name}</h2>
          <p className="text-muted-foreground leading-relaxed">{dest.description}</p>
        </section>

        {/* Glavne znamenitosti */}
        <section className="mb-12">
          <h2 className="text-2xl font-bold mb-6">Glavne znamenitosti</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {dest.highlights.map((h) => (
              <Card key={h}>
                <CardContent className="flex items-center gap-3 p-4">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Star className="size-5 text-primary" />
                  </div>
                  <span className="font-medium">{h}</span>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Aktivnosti / Izkušnje */}
        {experiences.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Aktivnosti in izkušnje v {dest.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {experiences.map((exp) => (
                <Card key={exp.id} className="overflow-hidden">
                  <img
                    src={JSON.parse(exp.images)[0] || ""}
                    alt={exp.name}
                    className="aspect-video w-full object-cover"
                  />
                  <CardContent className="p-4">
                    <Badge variant="secondary" className="mb-2">{exp.category}</Badge>
                    <h3 className="font-semibold mb-1">{exp.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-3">{exp.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-primary">od {exp.pricePerPerson}€</span>
                      {exp.providerWebsite ? (
                        <Button asChild size="sm" variant="outline">
                          <a href={exp.providerWebsite} target="_blank" rel="noopener noreferrer sponsored">
                            <ExternalLink className="size-3.5" /> Pri ponudniku
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Lokalci (hoteli, restavracije) */}
        {listings.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Lokalci v {dest.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {listings.map((l) => (
                <Card key={l.id} className={l.plan === "premium" ? "border-primary" : ""}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <Badge variant="secondary">{l.category}</Badge>
                      {l.featured && <Badge className="bg-amber-400 text-amber-950">★ Priporočeno</Badge>}
                    </div>
                    <h3 className="font-semibold mb-1">{l.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2 mb-2">{l.description}</p>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="flex items-center gap-1">
                        <Star className="size-3.5 fill-amber-400 text-amber-400" />
                        {l.rating.toFixed(1)}
                      </span>
                      <span className="flex items-center gap-1 text-muted-foreground">
                        <MapPin className="size-3.5" /> {dest.name}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Lokalni izdelki */}
        {products.length > 0 && (
          <section className="mb-12">
            <h2 className="text-2xl font-bold mb-6">Lokalni izdelki iz {dest.name}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {products.map((p) => (
                <Card key={p.id}>
                  <CardContent className="p-4">
                    <h3 className="font-medium text-sm mb-1">{p.name}</h3>
                    <p className="text-xs text-muted-foreground line-clamp-1 mb-2">{p.description}</p>
                    <span className="font-bold text-primary">{p.price}€</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* CTA: AI itinerer */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">Načrtujte potovanje v {dest.name}</h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            Naš AI vam lahko sestavi popoln itinerer za {dest.name} in okolico — prilagojen vašemu proračunu, interesom in sezoni.
          </p>
          <Button asChild size="lg">
            <Link href="/#nacrtuj">
              <Ticket className="size-4 mr-2" />
              AI načrtovalec potovanj
              <ArrowRight className="size-4 ml-2" />
            </Link>
          </Button>
        </section>

        {/* Ostale destinacije */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-6">Raziščite tudi</h2>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id).slice(0, 8).map((d) => (
              <Button key={d.id} asChild variant="outline" size="sm">
                <Link href={`/destinacija/${d.slug}/things-to-do`}>{d.name}</Link>
              </Button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
