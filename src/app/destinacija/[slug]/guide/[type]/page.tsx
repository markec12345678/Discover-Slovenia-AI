import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { DESTINATIONS, getDestinationById } from "@/lib/slovenia-data";
import {
  GUIDE_TYPES,
  GUIDE_TYPE_META,
  type GuideType,
} from "@/lib/sitemap-urls";
import { db } from "@/lib/db";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Heart,
  Users,
  Wallet,
  CalendarDays,
  MapPin,
  Star,
  ArrowRight,
  Sparkles,
  Ticket,
  ExternalLink,
  BedDouble,
  UtensilsCrossed,
  Mountain,
  Clock,
} from "lucide-react";
import { faqJsonLd, breadcrumbJsonLd, hreflangForPath } from "@/components/seo";
import { PageViewTracker } from "@/components/page-view-tracker";

// 4 tipi vodnikov s podatki o ceni, trajanju in kategorijah aktivnosti
const GUIDE_DETAILS: Record<
  GuideType,
  {
    icon: typeof Heart;
    durationLabel: string;
    priceRange: string;
    bestFor: string;
    /** Priporočene kategorije Listing/Experience za pridobivanje iz baze */
    listingCategories: string[];
    experienceCategories: string[];
  }
> = {
  "romanticni-pobeg": {
    icon: Heart,
    durationLabel: "2 dni / 1 noč",
    priceRange: "180–350 € / par",
    bestFor: "Pari · Mladoporočenca · Obletnice",
    listingCategories: ["hotel", "restaurant", "bar"],
    experienceCategories: ["tasting", "wellness", "cultural"],
  },
  druzinski: {
    icon: Users,
    durationLabel: "2–3 dni",
    priceRange: "120–260 € / družina",
    bestFor: "Družine z otroki · Večgeneracijski izleti",
    listingCategories: ["hotel", "restaurant", "activity"],
    experienceCategories: ["outdoor", "workshop", "cultural"],
  },
  budget: {
    icon: Wallet,
    durationLabel: "1–2 dni",
    priceRange: "30–80 € / osebo",
    bestFor: "Študentje · Backpackerji · Proračunski popotniki",
    listingCategories: ["restaurant", "activity", "transport"],
    experienceCategories: ["outdoor", "cultural", "workshop"],
  },
  vikend: {
    icon: CalendarDays,
    durationLabel: "Vikend (petek–nedelja)",
    priceRange: "150–280 € / osebo",
    bestFor: "Delavci · Prijatelji · Hitri pobeg",
    listingCategories: ["hotel", "restaurant", "activity", "bar"],
    experienceCategories: ["tour", "tasting", "outdoor", "cultural"],
  },
};

// Generiraj naslov za vsako kombinacijo
function buildTitle(destName: string, type: GuideType): string {
  switch (type) {
    case "romanticni-pobeg":
      return `Romantični pobeg v ${destName}`;
    case "druzinski":
      return `Družinski izlet v ${destName}`;
    case "budget":
      return `${destName} z omejenim proračunom`;
    case "vikend":
      return `Vikend v ${destName}`;
  }
}

// Uvodni opis, prilagojen tipu vodnika
function buildIntro(
  destName: string,
  type: GuideType,
  destTagline: string,
): string {
  switch (type) {
    case "romanticni-pobeg":
      return `${destName} — ${destTagline.toLowerCase()}. Ta vodnik je zasnovan za pare, ki iščejo zasebne trenutke: romantične sprehode ob jezeru ali morju, večerje ob svečkah, zasebne degustacije in nastanitve z razgledom. Vsi predlogi so ročno izbrani za nepozaben pobeg za dva.`;
    case "druzinski":
      return `Načrtujete družinski izlet v ${destName}? Ta vodnik združuje varne pohodne poti, interaktivne izkušnje za otroke, družinski prijazne restavracije z otroškimi meniji in nastanitve z družinskimi sobami. ${destName} je odlična izbira za nepozabne družinske spomine.`;
    case "budget":
      return `${destName} je mogoče obiskati tudi z majhnim proračunom. Ta vodnik predstavlja brezplačne atrakcije, lokalne trge, poceni prenočišča in javni transport. Predlogi so preverjeni za popotnike, ki želijo maksimalno izkušnjo z minimalnim stroškom.`;
    case "vikend":
      return `Popoln vikend pobeg v ${destName} — petek zvečer do nedelje popoldan. Uravnotežen program z glavnimi znamenitostmi, lokalno kulinarike in časom za sprostitev. ${destName} je dovolj blizu za kratek pobeg, dovolj bogat za poln vikend.`;
  }
}

// 3–4 FAQ vprašanja, prilagojena tipu
function buildFaqs(
  destName: string,
  type: GuideType,
  priceRange: string,
): { q: string; a: string }[] {
  const base: { q: string; a: string }[] = [];
  switch (type) {
    case "romanticni-pobeg":
      base.push(
        {
          q: `Kaj naredi ${destName} poseben za romantični pobeg?`,
          a: `${destName} ponuja edinstveno kombinacijo narave, kulturnih znamenitosti in kulinarike. Romantični pobeg v ${destName} je popoln za obletnice, valentine ali zaroke — naglasak je na zasebnosti, razgledih in lokalnih okusih.`,
        },
        {
          q: `Koliko stane romantični pobeg v ${destName}?`,
          a: `Cena romantičnega pobega v ${destName} se običajno giblje med ${priceRange}, vključno z nastanitvo z razgledom, večerjo za dva in eno izkušnjo (npr. degustacija ali vožnja).`,
        },
        {
          q: `Kdaj je najboljši čas za romantični obisk ${destName}?`,
          a: `Pomlad (april–junij) in zgodnja jesen (september–oktober) ponujata najbolj romantično vzdušje v ${destName} — prijetne temperature, manj turistov in čudovite barve narave.`,
        },
        {
          q: `Katere nastanitve v ${destName} so najbolj romantične?`,
          a: `Za romantični pobeg priporočamo boutique hotele in nastanitve z razgledom. Preverite naše sezname lokalov v ${destName} — vsi imajo ročno izbrane ponudnike.`,
        },
      );
      break;
    case "druzinski":
      base.push(
        {
          q: `Ali je ${destName} primeren za obisk z otroki?`,
          a: `Da — ${destName} je odlična družinska destinacija z varnimi pohodnimi potmi, otroško prijaznimi restavracijami in interaktivnimi izkušnjami. Večina atrakcij je dostopnih tudi z otroškimi vozički.`,
        },
        {
          q: `Koliko stane družinski izlet v ${destName}?`,
          a: `Družinski izlet v ${destName} (2 odrasla + 2 otroka) stane običajno ${priceRange}, vključno z družinsko sobo, obroki in vstopnicami za atrakcije. Otroci do 6 let pogosto vstopajo brezplačno.`,
        },
        {
          q: `Katere aktivnosti v ${destName} so primerne za otroke?`,
          a: `${destName} ponuja različne družinske aktivnosti — od lažjih pohodov, kolesarjenja, muzejev z interaktivnimi razstavami do delavnic in degustacij. Naša AI-priporočila upoštevajo starost otrok.`,
        },
        {
          q: `Kdaj je najboljši čas za družinski obisk ${destName}?`,
          a: `Šolske počitnice (poletje, oktober, februar) so idealne za družinski obisk ${destName}. Poleti so odprte vse zunanje atrakcije, pozimi pa so na voljo smučanje in zimski festivali.`,
        },
      );
      break;
    case "budget":
      base.push(
        {
          q: `Koliko stane obisk ${destName} z omejenim proračunom?`,
          a: `Z omejenim proračunom lahko ${destName} obiščete za ${priceRange}, vključno z nastanitvo v hostelih ali zasebnih sobah, lokalno hrano na tržnicah in brezplačnimi aktivnostmi.`,
        },
        {
          q: `Katere brezplačne aktivnosti so na voljo v ${destName}?`,
          a: `${destName} ponuja številne brezplačne aktivnosti — sprehode po starem mestu, obisk cerkva, pohodne poti v okolici in javne plaže. Vstopnice za muzeje imajo pogosto popuste za študente.`,
        },
        {
          q: `Kako prihraniti pri prevozu do ${destName}?`,
          a: `Za ugoden prevoz do ${destName} priporočamo vlak ali avtobus (iskanje preko FlixBus ali slovenskih železnic). V ${destName} lahko uporabite javni mestni transport ali kolo (veliko destinacij ima sisteme izposoje).`,
        },
        {
          q: `Ali najdem poceni nastanitev v ${destName}?`,
          a: `Da — v ${destName} so na voljo hostli, zasebne sobe preko Airbnb in družinski penzioni. Cene so nižje izven sezone (november–marec, razen praznikov).`,
        },
      );
      break;
    case "vikend":
      base.push(
        {
          q: `Kaj početi v ${destName} med vikendom?`,
          a: `Vikend v ${destName} omogoča raziskovanje glavnih znamenitosti, lokalne kulinarike in vsaj ene izkušnje. Petek zvečer je idealen za prihod in sprehod, sobota za glavne atrakcije, nedelja za sprostitev.`,
        },
        {
          q: `Koliko stane vikend v ${destName}?`,
          a: `Vikend v ${destName} (2 nočitvi, 3 obroki na dan, atrakcije) stane približno ${priceRange}. Prihranite lahko z early-bird rezervacijami in lokalnimi tržnicami.`,
        },
        {
          q: `Kdaj je najboljši čas za vikend pobeg v ${destName}?`,
          a: `${destName} je odličen za vikend pobeg skozi vse leto. Pomlad in jesen ponujata najboljše vreme za raziskovanje, poleti je več dogodkov, pozimi pa manj turistov in nižje cene.`,
        },
        {
          q: `Kako priti do ${destName} za vikend?`,
          a: `${destName} je dostopen z avtomobilom, vlakom ali avtobusom. Priporočamo rezervacijo prevoza vsaj teden dni vnaprej, še posebej za petek popoldan.`,
        },
      );
      break;
  }
  base.push({
    q: `Ali lahko AI sestavi itinerer za ${destName}?`,
    a: `Da — naš AI načrtovalec lahko sestavi popolnoma prilagojen itinerer za ${destName}, ki upošteva vaše interese, proračun in čas. Preizkusite ga na strani Načrtuj.`,
  });
  return base;
}

// Vsebinski razdelki (3 predlagane aktivnosti) glede na tip vodnika
function buildHighlights(
  destName: string,
  type: GuideType,
  destHighlights: string[],
): { title: string; description: string; icon: typeof Heart }[] {
  const top3 = destHighlights.slice(0, 3);
  const fallback = (i: number) =>
    destHighlights[i % destHighlights.length] ?? "Lokalna izkušnja";

  switch (type) {
    case "romanticni-pobeg":
      return [
        {
          title: `Romantični sprehod ob ${top3[0] ?? fallback(0)}`,
          description: `Začnite dan z umirjenim sprehodom ob ${top3[0]?.toLowerCase() ?? "naravnih lepotah"} v ${destName}. Jutranja svetloba in manj turistov ustvarjata idealno vzdušje za par.`,
          icon: Heart,
        },
        {
          title: `Zasebna izkušnja: ${top3[1] ?? fallback(1)}`,
          description: `Popoldne si vzemite čas za zasebno izkušnjo v ${destName} — degustacija, vožnja z ladjico ali lokalna delavnica. Naša priporočila so preverjena za pare.`,
          icon: Sparkles,
        },
        {
          title: `Večerja ob svečkah v ${destName}`,
          description: `Zaključite dan z romantično večerjo v eni izmed izbranih restavracij v ${destName}. Lokalni kuharji ponujajo sezonske menije z vino slovenskih vinogradov.`,
          icon: UtensilsCrossed,
        },
      ];
    case "druzinski":
      return [
        {
          title: `Družinski obisk: ${top3[0] ?? fallback(0)}`,
          description: `${top3[0] ?? "Glavna atrakcija"} v ${destName} je otrokom prijazna — interaktivne razstave, varne poti in pogosto delavnice za najmlajše.`,
          icon: Mountain,
        },
        {
          title: `Sprostitev ob ${top3[1] ?? fallback(1)}`,
          description: `${top3[1] ?? "Druga atrakcija"} ponuja prostor za piknik in sprostitev. Otroci se lahko igrajo, odrasli uživajo v naravi ${destName}.`,
          icon: Users,
        },
        {
          title: `Družinska večerja v ${destName}`,
          description: `Izberite restavracijo z otroškim menijem v ${destName}. Lokalne pice, testenine in tradicionalne slovenske jedi so priljubljene pri vseh starostih.`,
          icon: UtensilsCrossed,
        },
      ];
    case "budget":
      return [
        {
          title: `Brezplačni obisk: ${top3[0] ?? fallback(0)}`,
          description: `${top3[0] ?? "Glavna atrakcija"} v ${destName} je brezplačna za ogled od zunaj. Sprehod ob njej ponuja čudovite foto motive in kulturno izkušnjo.`,
          icon: MapPin,
        },
        {
          title: `Piknik ob ${top3[1] ?? fallback(1)}`,
          description: `Kupite lokalne siri, kruh in sadje na tržnici v ${destName} in si organizirajte piknik. Prihranek pri obroku omogoča več za izkušnje.`,
          icon: Wallet,
        },
        {
          title: `Pohod do ${top3[2] ?? fallback(2)}`,
          description: `${top3[2] ?? "Okolica"} je brezplačna za raziskovanje peš ali s kolesom. V ${destName} so označene pohodne poti primerne za vse ravni.`,
          icon: Mountain,
        },
      ];
    case "vikend":
      return [
        {
          title: `Petek: prihod in sprehod po ${destName}`,
          description: `Po prihodu v ${destName} se namestite in si vzemite čas za sproščen sprehod po starem mestu. Uživajte v lokalni kavi in načrtujte naslednja dva dneva.`,
          icon: CalendarDays,
        },
        {
          title: `Sobota: ${top3[0] ?? fallback(0)} in okolica`,
          description: `Glavni dan namenite glavnim znamenitostim — ${top3[0]?.toLowerCase() ?? "atrakcije"}, lokalni muzej in kosilo v tradicionalni restavraciji v ${destName}.`,
          icon: Star,
        },
        {
          title: `Nedelja: ${top3[1] ?? fallback(1)} in odhod`,
          description: `Zadnji dan izkoristite za ${top3[1]?.toLowerCase() ?? "sprostitev"} in nakup lokalnih spominov. Pred odhodom še ena lokalna kavica v ${destName}.`,
          icon: Clock,
        },
      ];
  }
}

// generateStaticParams: 22 destinacij × 4 tipi = 88 kombinacij
export async function generateStaticParams() {
  const params: { slug: string; type: string }[] = [];
  for (const dest of DESTINATIONS) {
    for (const type of GUIDE_TYPES) {
      params.push({ slug: dest.slug, type });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; type: string }>;
}): Promise<Metadata> {
  const { slug, type } = await params;
  const dest =
    getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const t = GUIDE_TYPES.find((x) => x === type) as GuideType | undefined;
  if (!dest || !t) return { title: "Vodnik ni najden" };

  const meta = GUIDE_TYPE_META[t];
  const title = buildTitle(dest.name, t);
  const intro = buildIntro(dest.name, t, dest.tagline);

  return {
    title: `${title} — Vodnik ${meta.label.toLowerCase()}`,
    description: `${intro.slice(0, 155)}...`,
    keywords: [
      dest.name,
      meta.label,
      "vodnik",
      "potovanje",
      "Slovenija",
      t === "romanticni-pobeg" ? "romantika" : "",
      t === "druzinski" ? "družina" : "",
      t === "budget" ? "cenovno ugodno" : "",
      t === "vikend" ? "vikend pobeg" : "",
      dest.region,
    ].filter(Boolean),
    openGraph: {
      title: `${title} — Discover Slovenia AI`,
      description: `${meta.description} Vodnik za ${dest.name}.`,
      images: [{ url: dest.image, width: 1200, height: 800 }],
      type: "website",
      locale: "sl_SI",
    },
    alternates: {
      canonical: `https://discoverslovenia.ai/destinacija/${dest.slug}/guide/${t}`, languages: hreflangForPath(`/destinacija/${dest.slug}/guide/${t}`),
    },
  };
}

export default async function GuidePage({
  params,
}: {
  params: Promise<{ slug: string; type: string }>;
}) {
  const { slug, type } = await params;
  const dest =
    getDestinationById(slug) || DESTINATIONS.find((d) => d.slug === slug);
  const t = GUIDE_TYPES.find((x) => x === type) as GuideType | undefined;
  if (!dest || !t) notFound();

  const meta = GUIDE_TYPE_META[t];
  const details = GUIDE_DETAILS[t];
  const Icon = details.icon;
  const title = buildTitle(dest.name, t);
  const intro = buildIntro(dest.name, t, dest.tagline);
  const faqs = buildFaqs(dest.name, t, details.priceRange);
  const highlights = buildHighlights(dest.name, t, dest.highlights);

  // Pridobi povezane lokale in izkušnje iz baze (filtrirano po tipu vodnika)
  const [listings, experiences] = await Promise.all([
    db.listing.findMany({
      where: {
        destinationId: dest.id,
        category: { in: details.listingCategories },
      },
      take: 6,
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
    }),
    db.experience.findMany({
      where: {
        destinationId: dest.id,
        category: { in: details.experienceCategories },
      },
      take: 4,
      orderBy: [{ featured: "desc" }, { rating: "desc" }],
    }),
  ]);

  // JSON-LD: FAQPage + BreadcrumbList + TouristTrip
  const breadcrumbs = breadcrumbJsonLd([
    { name: "Domov", url: "https://discoverslovenia.ai/" },
    {
      name: dest.name,
      url: `https://discoverslovenia.ai/destinacija/${dest.slug}/things-to-do`,
    },
    { name: meta.label },
  ]);

  const touristTrip = {
    "@context": "https://schema.org",
    "@type": "TouristTrip",
    name: title,
    description: intro,
    image: dest.image,
    touristDestination: {
      "@type": "TouristDestination",
      name: dest.name,
      address: {
        "@type": "PostalAddress",
        addressCountry: "SI",
        addressRegion: dest.region,
      },
    },
    offers: {
      "@type": "Offer",
      priceRange: details.priceRange,
      priceCurrency: "EUR",
    },
  };

  const canonicalPath = `/destinacija/${dest.slug}/guide/${t}`;

  return (
    <div className="min-h-screen bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(faqs)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbs) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(touristTrip) }}
      />

      {/* PageView tracking — beleži ogled v PageView tabelo */}
      <PageViewTracker path={canonicalPath} title={title} />

      {/* Breadcrumbs */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <nav
          className="flex items-center gap-2 text-sm text-muted-foreground"
          aria-label="Breadcrumb"
        >
          <Link href="/" className="hover:text-foreground">
            Domov
          </Link>
          <span aria-hidden="true">/</span>
          <Link
            href={`/destinacija/${dest.slug}/things-to-do`}
            className="hover:text-foreground"
          >
            {dest.name}
          </Link>
          <span aria-hidden="true">/</span>
          <span className="text-foreground">{meta.label}</span>
        </nav>
      </div>

      {/* Hero */}
      <div className="relative h-[400px] w-full overflow-hidden mt-4">
        <img
          src={dest.image}
          alt={`${dest.name} — ${meta.label}`}
          className="size-full object-cover"
        />
        <div className="hero-overlay absolute inset-0" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-4">
          <Badge className="mb-3 bg-primary text-primary-foreground">
            <Icon className="size-3.5 mr-1" aria-hidden="true" />
            {meta.label} · {meta.emoji}
          </Badge>
          <h1 className="text-3xl sm:text-5xl font-bold text-white drop-shadow-lg">
            {title}
          </h1>
          <p className="mt-3 max-w-2xl text-white/90 text-base sm:text-lg">
            {dest.tagline}
          </p>
          <div className="mt-4 flex flex-wrap gap-2 justify-center">
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Clock className="size-3 mr-1" aria-hidden="true" />
              {details.durationLabel}
            </Badge>
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Wallet className="size-3 mr-1" aria-hidden="true" />
              {details.priceRange}
            </Badge>
            <Badge
              variant="outline"
              className="bg-white/10 text-white border-white/30 backdrop-blur-sm"
            >
              <Star
                className="size-3 mr-1 fill-amber-400 text-amber-400"
                aria-hidden="true"
              />
              {dest.rating}★
            </Badge>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 lg:px-8">
        {/* Ostali tipi vodnikov (preklopi) */}
        <section className="mb-10">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {GUIDE_TYPES.map((otherType) => {
              const otherMeta = GUIDE_TYPE_META[otherType];
              const OtherIcon = GUIDE_DETAILS[otherType].icon;
              const isActive = otherType === t;
              return (
                <Link
                  key={otherType}
                  href={`/destinacija/${dest.slug}/guide/${otherType}`}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Card
                    className={`cursor-pointer transition-all hover:shadow-md h-full ${
                      isActive
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:border-primary/40"
                    }`}
                  >
                    <CardContent className="p-3 text-center">
                      <OtherIcon
                        className={`size-5 mx-auto mb-1 ${
                          isActive ? "text-primary" : "text-muted-foreground"
                        }`}
                        aria-hidden="true"
                      />
                      <p className="text-xs font-medium">{otherMeta.shortLabel}</p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Uvodni opis */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
            <span aria-hidden="true">{meta.emoji}</span>
            {meta.label} v {dest.name}
          </h2>
          <p className="text-muted-foreground leading-relaxed mb-4">{intro}</p>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4 flex items-start gap-3">
              <Sparkles
                className="size-5 text-primary shrink-0 mt-0.5"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold text-sm">{details.bestFor}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Trajanje: {details.durationLabel} · Cenovni razred:{" "}
                  {details.priceRange}
                </p>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* Poudarjene aktivnosti (3 predlogi) */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">Poudarjene aktivnosti</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {highlights.map((h, i) => {
              const HIcon = h.icon;
              return (
                <Card key={i} className="h-full">
                  <CardContent className="p-5 flex flex-col gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <HIcon className="size-5 text-primary" aria-hidden="true" />
                    </div>
                    <h3 className="font-semibold">{h.title}</h3>
                    <p className="text-sm text-muted-foreground">{h.description}</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </section>

        {/* Povezane izkušnje iz baze */}
        {experiences.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                Izkušnje v {dest.name} za {meta.label.toLowerCase()}
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                  Vse izkušnje
                  <ArrowRight className="size-3.5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {experiences.map((exp) => {
                const firstImage =
                  exp.images && exp.images.trim().startsWith("[")
                    ? (JSON.parse(exp.images)[0] as string | undefined)
                    : undefined;
                return (
                  <Card key={exp.id} className="overflow-hidden flex flex-col">
                    {firstImage && (
                      <img
                        src={firstImage}
                        alt={exp.name}
                        className="aspect-video w-full object-cover"
                      />
                    )}
                    <CardContent className="p-4 flex flex-col gap-2 flex-1">
                      <Badge variant="secondary" className="self-start text-xs">
                        {exp.category}
                      </Badge>
                      <h3 className="font-semibold text-sm line-clamp-2">
                        {exp.name}
                      </h3>
                      <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                        {exp.description}
                      </p>
                      <div className="flex items-center justify-between pt-1">
                        <span className="font-bold text-primary text-sm">
                          od {exp.pricePerPerson}€
                        </span>
                        {exp.providerWebsite && (
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                          >
                            <a
                              href={exp.providerWebsite}
                              target="_blank"
                              rel="noopener noreferrer sponsored"
                            >
                              <ExternalLink
                                className="size-3"
                                aria-hidden="true"
                              />
                            </a>
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        {/* Lokalci (hoteli, restavracije) */}
        {listings.length > 0 && (
          <section className="mb-10">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-2xl font-bold">
                Priporočeni lokalci v {dest.name}
              </h2>
              <Button asChild variant="outline" size="sm">
                <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                  Vsi lokalci
                  <ArrowRight className="size-3.5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {listings.map((l) => (
                <Card
                  key={l.id}
                  className={l.plan === "premium" ? "border-primary" : ""}
                >
                  <CardContent className="p-4 flex flex-col gap-2">
                    <div className="flex items-start justify-between">
                      <Badge variant="secondary" className="text-xs">
                        {l.category === "hotel" && (
                          <BedDouble
                            className="size-3 mr-1"
                            aria-hidden="true"
                          />
                        )}
                        {l.category === "restaurant" && (
                          <UtensilsCrossed
                            className="size-3 mr-1"
                            aria-hidden="true"
                          />
                        )}
                        {l.category}
                      </Badge>
                      {l.featured && (
                        <Badge className="bg-amber-400 text-amber-950 text-xs">
                          <Star
                            className="size-3 mr-0.5 fill-amber-950 text-amber-950"
                            aria-hidden="true"
                          />
                          Priporočeno
                        </Badge>
                      )}
                    </div>
                    <h3 className="font-semibold">{l.name}</h3>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {l.description}
                    </p>
                    <div className="flex items-center gap-3 text-sm pt-1">
                      <span className="flex items-center gap-1">
                        <Star
                          className="size-3.5 fill-amber-400 text-amber-400"
                          aria-hidden="true"
                        />
                        <span className="font-medium">{l.rating.toFixed(1)}</span>
                        <span className="text-xs text-muted-foreground">
                          ({l.reviewCount})
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {l.priceRange}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )}

        {/* Cross-linking — najboljši čas in things-to-do */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-4">Povezani vodniki</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card className="hover:border-primary/40 transition-colors">
              <Link href={`/destinacija/${dest.slug}/things-to-do`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <MapPin className="size-6 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Kaj početi v {dest.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Vseh {dest.highlights.length} znamenitosti in aktivnosti v{" "}
                      {dest.name}.
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardContent>
              </Link>
            </Card>
            <Card className="hover:border-primary/40 transition-colors">
              <Link href={`/destinacija/${dest.slug}/best-time-to-visit/pomlad`}>
                <CardContent className="p-5 flex items-center gap-4">
                  <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
                    <CalendarDays
                      className="size-6 text-primary"
                      aria-hidden="true"
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold">
                      Najboljši čas za obisk {dest.name}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      Vodič po sezonah — pomlad, poletje, jesen, zima.
                    </p>
                  </div>
                  <ArrowRight
                    className="size-4 ml-auto text-muted-foreground"
                    aria-hidden="true"
                  />
                </CardContent>
              </Link>
            </Card>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-10">
          <h2 className="text-2xl font-bold mb-6">Pogosta vprašanja</h2>
          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-2 flex items-start gap-2">
                    <span className="text-primary font-bold" aria-hidden="true">
                      Q:
                    </span>
                    {faq.q}
                  </h3>
                  <p className="text-sm text-muted-foreground flex items-start gap-2">
                    <span className="text-primary font-bold" aria-hidden="true">
                      A:
                    </span>
                    {faq.a}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA za AI itinerer */}
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-8 text-center">
          <h2 className="text-2xl font-bold mb-3">
            Sestavite popoln {meta.label.toLowerCase()} v {dest.name}
          </h2>
          <p className="text-muted-foreground mb-5 max-w-xl mx-auto">
            AI upošteva vaš proračun, interese in čas. {meta.description}
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/#nacrtuj">
                <Ticket className="size-4 mr-2" aria-hidden="true" />
                AI načrtovalec potovanj
                <ArrowRight className="size-4 ml-2" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href={`/destinacija/${dest.slug}/itinerary/vikend`}>
                <CalendarDays className="size-4 mr-2" aria-hidden="true" />
                Pripravljeni itinererji
              </Link>
            </Button>
          </div>
        </section>

        {/* Ostale destinacije — ista tipa vodnika */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold mb-4">{meta.label} tudi drugje</h2>
          <p className="text-sm text-muted-foreground mb-4">
            Raziščite {meta.label.toLowerCase()} v drugih slovenskih destinacijah:
          </p>
          <div className="flex flex-wrap gap-2">
            {DESTINATIONS.filter((d) => d.id !== dest.id)
              .slice(0, 10)
              .map((d) => (
                <Button key={d.id} asChild variant="outline" size="sm">
                  <Link href={`/destinacija/${d.slug}/guide/${t}`}>
                    <MapPin className="size-3.5 mr-1" aria-hidden="true" />
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
