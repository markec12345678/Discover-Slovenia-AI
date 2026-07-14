import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  Target,
  Users,
  Zap,
  BarChart3,
  Globe,
  CheckCircle2,
  ArrowRight,
  Rocket,
  Gift,
  CreditCard,
  LogOut,
  ShieldCheck,
  Clock,
  Check,
} from "lucide-react";
import { BETA_INFO } from "@/lib/beta";

const benefits = [
  {
    icon: Target,
    title: "Dosežite prave potnike",
    description:
      "AI našim uporabnikom priporoča vaš lokal v itinererjih. Ne naključnih oglasov — ampak kontekstualno priporočilo ko potnik išče vaš tip storitve.",
    stat: "32% konverzija v kontakt",
  },
  {
    icon: Users,
    title: "12.000+ obiskovalcev mesečno",
    description:
      "Naša platforma privablja potnike ki načrtujejo potovanje v Slovenijo. Vi ste le en klik stran od njih.",
    stat: "+18% rast mesečno",
  },
  {
    icon: Zap,
    title: "AI distribucijski kanal",
    description:
      "Premium in Enterprise stranke samodejno vključene v AI-generirane itinererje. Brez dodatnega truda — AI naredi promocijo za vas.",
    stat: "5.2★ povprečna ocena",
  },
  {
    icon: BarChart3,
    title: "Polna transparenca",
    description:
      "Sledite klikom, ogledom in konverzijam v realnem času. Več kakršnega oglasa — realna statistika.",
    stat: "Real-time dashboard",
  },
];

const process = [
  {
    step: "1",
    title: "Prijavite se",
    description: "Izpolnite kratek obrazec. Brez obveznosti.",
  },
  {
    step: "2",
    title: "Dodajte svoj lokal",
    description: "Slike, opis, kontakt. 5 minut dela.",
  },
  {
    step: "3",
    title: "AI prevzame promocijo",
    description: "Naš AI vas vključi v itinererje in priporočila.",
  },
  {
    step: "4",
    title: "Prejemajte stranke",
    description: "Potniki kličejo na vašo spletno stran. Vi raste.",
  },
];

const testimonials = [
  {
    quote: "Po 2 mesecih na platformi smo povečali rezervacije za 27%. AI res priporoča naš hotel!",
    author: "Ana K.",
    role: "Lastnica, Boutique hotel Bled",
    rating: 5,
  },
  {
    quote: "Končno platforma ki razume slovenski turizem. Premium se hitro povrne.",
    author: "Marko P.",
    role: "Manager, Restavracija Ljubljana",
    rating: 5,
  },
  {
    quote: "AI nas vključuje v itinererje potnikov ki iščejo rafting. Konverzija je neverjetna.",
    author: "Tina R.",
    role: "Soča Rafting",
    rating: 5,
  },
];

// Beta ugodnosti v final CTA
const BETA_CTA_BENEFITS = [
  {
    icon: Gift,
    text: "Brezplačni Premium paket (vrednost €149/mes)",
  },
  {
    icon: CreditCard,
    text: "Brez kreditne kartice",
  },
  {
    icon: LogOut,
    text: "Lahko odidete kadar",
  },
  {
    icon: Clock,
    text: "30 dni garancija po prekinitvi beta-ja",
  },
];

export function PitchDeckSection() {
  return (
    <section
      id="partnerji"
      className="scroll-mt-20 bg-gradient-to-b from-background to-muted/30 py-20"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Hero */}
        <div className="mx-auto mb-16 max-w-3xl text-center">
          {/* Velik beta badge */}
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-amber-400 px-5 py-2 text-amber-950 shadow-md ring-2 ring-amber-300/40">
            <Rocket className="size-5" aria-hidden="true" />
            <span className="text-sm font-bold sm:text-base tracking-wide">
              Brezplačno med beta — brez obveznosti
            </span>
          </div>

          <Badge variant="secondary" className="mb-4">
            <TrendingUp className="mr-1.5 size-3.5" />
            Za hotele, restavracije in aktivnosti
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
            Zakaj se pridružiti <span className="text-primary">Discover Slovenia AI</span>?
          </h2>
          <p className="mt-5 text-lg text-muted-foreground">
            Edina platforma ki AI-poganja priporočila lokalov potnikom v Sloveniji.
            Ne plačujete za oglase — plačate za rezultate.
          </p>
        </div>

        {/* Benefits */}
        <div className="mb-20 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {benefits.map((benefit) => {
            const Icon = benefit.icon;
            return (
              <Card
                key={benefit.title}
                className="border-border/60 hover:border-primary/40 transition-colors"
              >
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="size-12 shrink-0 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold mb-2">
                        {benefit.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-3">
                        {benefit.description}
                      </p>
                      <Badge variant="outline" className="text-primary">
                        {benefit.stat}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Process */}
        <div className="mb-20">
          <div className="mb-10 text-center">
            <h3 className="text-2xl font-bold sm:text-3xl">
              Kako deluje — 4 preprosti koraki
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {process.map((p, idx) => (
              <div key={p.step} className="relative">
                <div className="flex flex-col items-center text-center">
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground text-xl font-bold mb-4">
                    {p.step}
                  </div>
                  <h4 className="text-base font-semibold mb-2">{p.title}</h4>
                  <p className="text-sm text-muted-foreground">{p.description}</p>
                </div>
                {idx < process.length - 1 ? (
                  <ArrowRight
                    className="absolute -right-3 top-7 hidden size-6 text-muted-foreground/40 lg:block"
                    aria-hidden="true"
                  />
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {/* Testimonials */}
        <div className="mb-20">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3">
              <Globe className="mr-1.5 size-3.5" />
              Pričevanja
            </Badge>
            <h3 className="text-2xl font-bold sm:text-3xl">
              Kaj pravijo naši partnerji
            </h3>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.author} className="border-border/60">
                <CardContent className="p-6">
                  <div className="mb-3 flex gap-0.5">
                    {Array.from({ length: t.rating }).map((_, i) => (
                      <span key={i} className="text-amber-400" aria-hidden="true">
                        ★
                      </span>
                    ))}
                  </div>
                  <blockquote className="mb-4 text-sm leading-relaxed">
                    &ldquo;{t.quote}&rdquo;
                  </blockquote>
                  <div>
                    <div className="font-semibold text-sm">{t.author}</div>
                    <div className="text-xs text-muted-foreground">{t.role}</div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Final CTA — z beta ugodnostmi */}
        <Card className="overflow-hidden border-primary/40 ring-1 ring-primary/10">
          <CardContent className="bg-primary/5 p-8 sm:p-12">
            <div className="flex flex-col items-center gap-6 text-center">
              <div className="flex items-center gap-2 rounded-full bg-amber-400 px-4 py-1.5 text-amber-950 shadow-sm">
                <Rocket className="size-4" aria-hidden="true" />
                <span className="text-xs font-bold sm:text-sm tracking-wide">
                  BETA · BREZPLAČNO · BREZ KREDITNE KARTICE
                </span>
              </div>

              <h3 className="text-2xl font-bold sm:text-3xl max-w-2xl">
                Pridruži se BREZPLAČNO med beta — brez kreditne kartice
              </h3>
              <p className="text-muted-foreground max-w-xl">
                Pridružite se {`50+`} slovenskim lokalom ki že uporabljajo našo AI
                platformo za rast posla. Med beta obdobjem so vsi paketi brezplačni —
                izkoristite zdaj.
              </p>

              {/* Beta ugodnosti */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {BETA_CTA_BENEFITS.map((b, idx) => {
                  const Icon = b.icon;
                  return (
                    <div
                      key={idx}
                      className="flex items-center gap-3 rounded-lg border border-primary/20 bg-background/80 px-4 py-3 text-left"
                    >
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <Icon className="size-4" aria-hidden="true" />
                      </div>
                      <span className="text-sm font-medium leading-snug">
                        {b.text}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="size-5 text-primary" aria-hidden="true" />
                <span className="font-medium text-primary">
                  Brez obveznosti · 30 dni garancije · {BETA_INFO.threshold} lokalov do monetizacije
                </span>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-1.5">
                  <a href="#pridruzi-se">
                    <Gift className="size-4" aria-hidden="true" />
                    Pridruži se brezplačno
                    <ArrowRight className="ml-1 size-4" aria-hidden="true" />
                  </a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="/admin">Admin prijava</a>
                </Button>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1">
                  <Check className="size-3 text-primary" aria-hidden="true" />
                  Brez kreditne kartice
                </span>
                <span className="inline-flex items-center gap-1">
                  <ShieldCheck className="size-3 text-primary" aria-hidden="true" />
                  GDPR varni podatki
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="size-3 text-primary" aria-hidden="true" />
                  24-urni odziv
                </span>
              </div>

              <p className="text-xs text-muted-foreground">
                Demo račun za lastnike: /owner/prijava · Admin: /admin
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
