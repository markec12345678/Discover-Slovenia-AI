import Link from "next/link";
import {
  Sparkles,
  Eye,
  MousePointerClick,
  Phone,
  Calendar,
  Award,
  BarChart3,
  ArrowRight,
  Check,
  Star,
  MessageCircle,
  Crown,
  Percent,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navigation } from "@/components/sections/navigation";
import { JoinUs } from "@/components/sections/join-us";
import { PitchDeckSection } from "@/components/sections/pitch-deck";
import { Reveal } from "@/components/reveal";
import { db } from "@/lib/db";
import { BETA_THRESHOLD } from "@/lib/beta";

export const metadata = {
  // FW3: samo deli strani — template v layoutu doda "| Discover Slovenia AI"
  // (prej je naslov podvojeval pripono: "… | Discover Slovenia AI | Discover
  // Slovenia AI").
  title: "Za ponudnike",
  description:
    "Ko turist vpraša AI, najde vas. Pridružite se med prvimi AI turističnimi platformami za Slovenijo.",
  alternates: { canonical: "https://discoverslovenia.ai/za-ponudnike" },
};

export default async function ProviderLandingPage() {
  // Iskrena številka: dejansko število lokalov na platformi (ne tržna številka).
  let listingCount = 0;
  try {
    listingCount = await db.listing.count();
  } catch {
    listingCount = 0;
  }

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <main className="flex-grow">
        {/* Hero */}
        <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background py-20 sm:py-28">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
                <Sparkles
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                Brezplačno v beta fazi
              </span>
              <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
                Ko turist vpraša AI,
                <br />
                <span className="text-primary">najde vas.</span>
              </h1>
              <p className="mt-5 text-lg text-muted-foreground">
                Discover Slovenia AI je med prvimi AI-poganjanimi turističnimi
                platformami za Slovenijo. Turist napiše kaj želi — AI sestavi
                dan, priporoči vaš lokal in ga pripelje do vas. Rezervacijo
                opravi turist direktno pri vas. Kot pri Booking.com: turisti ne
                plačujejo nič — vi plačate le 12&nbsp;% provizijo, kadar vam
                rezervacijo prinese AI konzultacija (Premium: 0&nbsp;%).
              </p>

              {/* Dejstva (ne tržne številke) */}
              <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">22</div>
                  <div className="text-xs text-muted-foreground">
                    destinacij
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    {listingCount}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    lokalov na platformi
                  </div>
                </div>
                <div className="h-8 w-px bg-border" />
                <div className="text-center">
                  <div className="text-3xl font-bold text-primary">
                    0&nbsp;%
                  </div>
                  <div className="text-xs text-muted-foreground">
                    provizije na direktnih rezervacijah
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="gap-1.5">
                  <Link href="/owner/prijava">
                    <Sparkles className="size-4" aria-hidden="true" />
                    Brezplačna registracija
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button asChild variant="outline" size="lg">
                  <Link href="#kako-deluje">Kako deluje?</Link>
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* Kako deluje */}
        <section id="kako-deluje" className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="mb-12 text-center text-3xl font-bold">
              Kako AI prinese goste
            </h2>
            <div className="mx-auto max-w-4xl">
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  {
                    icon: Sparkles,
                    step: "1",
                    title: "Turist vpraša",
                    desc: "Napiše kaj želi doživeti v Sloveniji",
                  },
                  {
                    icon: Eye,
                    step: "2",
                    title: "AI najde vas",
                    desc: "Ranking engine primerja in priporoči",
                  },
                  {
                    icon: MousePointerClick,
                    step: "3",
                    title: "Turist klikne",
                    desc: "Vidi vaš profil, zgodbo, kontakt",
                  },
                  {
                    icon: Calendar,
                    step: "4",
                    title: "Kontakt",
                    desc: "Turist vas pokliče ali obišče spletno stran — rezervacija pri vas",
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div key={item.step} className="relative">
                      <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                        <Icon
                          className="size-6 text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <span className="absolute right-0 top-0 text-xs font-bold text-muted-foreground/30">
                        {item.step}
                      </span>
                      <h3 className="mt-3 font-bold">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* Model — kot Booking.com (Faza 3d: ponudniki plačajo, turisti ne) */}
        <section id="model" className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
                <MessageCircle
                  className="size-3.5 text-primary"
                  aria-hidden="true"
                />
                Model kot Booking.com
              </span>
              <h2 className="mt-6 text-3xl font-bold">
                Turisti ne plačujejo nič. Platformo financirajo ponudniki.
              </h2>
              <p className="mt-4 text-muted-foreground">
                Brezplačne AI konzultacije pritegnejo več turistov — ti pa
                rezervirajo neposredno pri vas. Vi plačate le, če vam AI prinese
                gosta: 12&nbsp;% provizije na rezervaciji iz AI konzultacije —
                ali 0&nbsp;% s Premium naročnino (149&nbsp;€/mes), ki vključuje
                tudi 5-odstotni boost. Turist plača polno ceno samo vam; skritih
                stroškov ni.
              </p>
            </div>
            <div className="mx-auto mt-12 grid max-w-4xl gap-6 sm:grid-cols-3">
              {[
                {
                  icon: MessageCircle,
                  title: "1 · Turist vpraša brezplačno",
                  desc: "Osebna AI konzultacija, načrt potovanja in iskanje so vedno brezplačni — zato turistov, ki sprašujejo, sčasoma vedno več.",
                },
                {
                  icon: MousePointerClick,
                  title: "2 · AI priporoči vas",
                  desc: "Konzultacija citira vaš lokal in izkušnjo. Rezervacija poteka direktno pri vas — atributirana vam v analitiko; provizija se obračuna le, kadar je rezervacija plod AI konzultacije.",
                },
                {
                  icon: Crown,
                  title: "3 · Vi izberete prioriteto",
                  desc: "Premium partnerji (149 €/mes) dobijo 5-odstotni rangirni boost, Premium znak, vidnejše mesto v konzultacijah in 0 % provizije.",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="border-primary/15">
                    <CardContent className="p-5">
                      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon
                          className="size-5 text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <h3 className="font-bold">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Kaj dobite */}
        <section className="bg-muted/30 py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="mb-12 text-center text-3xl font-bold">
              Kaj dobite kot partner
            </h2>
            <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[
                {
                  icon: Award,
                  title: "Verified Badge",
                  desc: 'Znak "Preverjen partner" — podelijo ga naši uredniki po pregledu',
                },
                {
                  icon: Sparkles,
                  title: "AI Optimizacija",
                  desc: "AI avtomatsko generira SEO meta, ključne besede in tage",
                },
                {
                  icon: BarChart3,
                  title: "Analytics",
                  desc: "Ogledi, kliki, AI priporočila, kontakti, ROI",
                },
                {
                  icon: Phone,
                  title: "Povpraševanja gostov",
                  desc: "Obrazec za povpraševanje na vašem profilu — vsako vidite v statistiki",
                },
                {
                  icon: Receipt,
                  title: "Atribucija rezervacij",
                  desc: "Rezervacije iz AI konzultacij se zapišejo vam kot izvor vrednosti",
                },
                {
                  icon: Star,
                  title: "AI Zgodba",
                  desc: "AI napiše čustveno zgodbo o vašem podjetju",
                },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.title} className="border-primary/15">
                    <CardContent className="p-5">
                      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon
                          className="size-5 text-primary"
                          aria-hidden="true"
                        />
                      </div>
                      <h3 className="font-bold">{item.title}</h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {item.desc}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Paketi */}
        <section className="py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8">
            <div className="mx-auto max-w-3xl">
              <h2 className="mb-3 text-center text-3xl font-bold">Paketi</h2>
              <p className="mb-4 text-center text-muted-foreground">
                Registracija in osnovni paket sta brezplačna — turisti nikoli ne
                plačujejo. Prihodek prihaja iz provizij na AI-prinesenih
                rezervacijah (12&nbsp;%) in premium naročnin (Premium = 0&nbsp;%
                provizije).
              </p>
              <p className="mb-10 text-center text-sm font-medium text-primary">
                Med beta obdobjem so vsi paketi brezplačni — monetizacija se
                vklopi pri {BETA_THRESHOLD} aktivnih lokalih.
              </p>
              <div className="grid gap-6 sm:grid-cols-3">
                {/* Free */}
                <Card className="border-border/60">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold">Free</h3>
                    <p className="mt-2 text-3xl font-bold">€0</p>
                    <p className="text-xs text-muted-foreground">/mesec</p>
                    <ul className="mt-4 space-y-2 text-left text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Osnovni profil lokala
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Prikaz v AI konzultacijah
                      </li>
                      <li className="flex items-center gap-2">
                        <Percent
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        12 % provizija na rezervacije iz AI konzultacij
                      </li>
                      <li className="flex items-center gap-2">
                        <Receipt
                          className="size-4 text-primary"
                          aria-hidden="true"
                        />
                        Mesečni račun (PDF) po e-pošti
                      </li>
                    </ul>
                  </CardContent>
                </Card>
                {/* Premium */}
                <Card className="border-primary/30 bg-primary/5">
                  <CardContent className="p-6 text-center">
                    <span className="inline-block rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                      Priporočeno
                    </span>
                    <h3 className="mt-2 font-bold">Premium</h3>
                    <p className="mt-2 text-3xl font-bold">€149</p>
                    <p className="text-xs text-muted-foreground">/mesec</p>
                    <ul className="mt-4 space-y-2 text-left text-sm">
                      <li className="flex items-center gap-2 font-semibold">
                        <Check className="size-4 text-emerald-500" />0 %
                        provizija — vključeno
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Brez mesečnih provizijskih računov
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />5 %
                        rangirni boost
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Premium znak
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Citiranje v AI konzultacijah
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Atribucija rezervacij iz konzultacij
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        AI insights
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Sponzorirana oznaka
                      </li>
                    </ul>
                  </CardContent>
                </Card>
                {/* Enterprise */}
                <Card className="border-border/60">
                  <CardContent className="p-6 text-center">
                    <h3 className="font-bold">Enterprise</h3>
                    <p className="mt-2 text-3xl font-bold">€499</p>
                    <p className="text-xs text-muted-foreground">/mesec</p>
                    <ul className="mt-4 space-y-2 text-left text-sm">
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Vse iz Premium
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />0 %
                        provizija
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Več lokalov na enem računu
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Atribucija rezervacij iz konzultacij
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        AI insights
                      </li>
                      <li className="flex items-center gap-2">
                        <Check className="size-4 text-emerald-500" />
                        Namenska podpora
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="bg-primary/5 py-16 sm:py-20">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold">Postanite founding partner</h2>
            <p className="mt-3 text-muted-foreground">
              Med beta obdobjem je platforma brezplačna — prvih {BETA_THRESHOLD}{" "}
              lokalov gradi temelje in obdrži ugodnosti.
            </p>
            <Button asChild size="lg" className="mt-8 gap-1.5">
              <Link href="/owner/prijava">
                <Sparkles className="size-4" aria-hidden="true" />
                Začni zdaj — brezplačno
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </section>

        {/*
        FW3: B2B lijak z homepagea — prijavnica (id="pridruzi-se", nanjo
        kažejo povezave v nogi) in pitch deck (notranja povezava #pridruzi-se
        deluje, ker je JoinUs na isti strani).
      */}
        <JoinUs />
        <Reveal>
          <PitchDeckSection />
        </Reveal>
      </main>
    </div>
  );
}
