import Link from "next/link";
import {
  Sparkles,
  TrendingUp,
  Eye,
  MousePointerClick,
  Phone,
  Calendar,
  Award,
  QrCode,
  BarChart3,
  ArrowRight,
  Check,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = {
  title: "Za ponudnike — Discover Slovenia AI",
  description: "Ko turist vpraša AI, najde vas. Pridružite se prvi AI turistični platformi za Slovenijo.",
  alternates: { canonical: "https://discoverslovenia.ai/za-ponudnike" },
};

export default function ProviderLandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-primary/10 via-background to-background py-20 sm:py-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-xs font-medium">
              <Sparkles className="size-3.5 text-primary" aria-hidden="true" />
              Brezplačno v beta fazi
            </span>
            <h1 className="mt-6 text-4xl font-bold tracking-tight sm:text-5xl">
              Ko turist vpraša AI,
              <br />
              <span className="text-primary">najde vas.</span>
            </h1>
            <p className="mt-5 text-lg text-muted-foreground">
              Discover Slovenia AI je prva AI-poganjana turistična platforma za Slovenijo.
              Turist napiše kaj želi — AI sestavi dan, priporoči vaš lokal in ga pripelje do vas.
              Rezervacijo opravi turist direktno pri vas — brez posrednikov, brez provizij.
            </p>

            {/* Social proof */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">22</div>
                <div className="text-xs text-muted-foreground">destinacij</div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">25</div>
                <div className="text-xs text-muted-foreground">partnerjev</div>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">9</div>
                <div className="text-xs text-muted-foreground">AI funkcij</div>
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
                { icon: Sparkles, step: "1", title: "Turist vpraša", desc: "Napiše kaj želi doživeti v Sloveniji" },
                { icon: Eye, step: "2", title: "AI najde vas", desc: "Ranking engine primerja in priporoči" },
                { icon: MousePointerClick, step: "3", title: "Turist klikne", desc: "Vidi vaš profil, zgodbo, kontakt" },
                { icon: Calendar, step: "4", title: "Kontakt", desc: "Turist vas pokliče ali obišče spletno stran — rezervacija pri vas" },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.step} className="relative">
                    <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="size-6 text-primary" aria-hidden="true" />
                    </div>
                    <span className="absolute right-0 top-0 text-xs font-bold text-muted-foreground/30">
                      {item.step}
                    </span>
                    <h3 className="mt-3 font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                );
              })}
            </div>
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
              { icon: Award, title: "Verified Badge", desc: "Preverjen partner znak zaupanja na profilu" },
              { icon: Sparkles, title: "AI Optimizacija", desc: "AI avtomatsko generira SEO meta, ključne besede in tage" },
              { icon: BarChart3, title: "Analytics", desc: "Ogledi, kliki, AI priporočila, kontakti, ROI" },
              { icon: QrCode, title: "QR Karta", desc: "QR koda za mize, recepcijo, sobe — gost scan-a in vidi vaš profil" },
              { icon: TrendingUp, title: "Quality Coach", desc: "AI svetuje kako izboljšati profil za več AI priporočil" },
              { icon: Star, title: "AI Zgodba", desc: "AI napiše čustveno zgodbo o vašem podjetju" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.title} className="border-primary/15">
                  <CardContent className="p-5">
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-5 text-primary" aria-hidden="true" />
                    </div>
                    <h3 className="font-bold">{item.title}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{item.desc}</p>
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
            <h2 className="mb-3 text-center text-3xl font-bold">
              Brezplačno v beta fazi
            </h2>
            <p className="mb-12 text-center text-muted-foreground">
              Vsi paketi so brezplačni do 30 lokalov. Potem samodejni vklop monetizacije.
            </p>
            <div className="grid gap-6 sm:grid-cols-3">
              {/* Free */}
              <Card className="border-border/60">
                <CardContent className="p-6 text-center">
                  <h3 className="font-bold">Free</h3>
                  <p className="mt-2 text-3xl font-bold">€0</p>
                  <p className="text-xs text-muted-foreground">/mesec</p>
                  <ul className="mt-4 space-y-2 text-left text-sm">
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />1 lokal</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />5 slik</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />Osnovne analytics</li>
                  </ul>
                </CardContent>
              </Card>
              {/* Premium */}
              <Card className="border-primary/30 bg-primary/5">
                <CardContent className="p-6 text-center">
                  <span className="inline-block rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">Priporočeno</span>
                  <h3 className="mt-2 font-bold">Premium</h3>
                  <p className="mt-2 text-3xl font-bold">€149</p>
                  <p className="text-xs text-muted-foreground">/mesec</p>
                  <ul className="mt-4 space-y-2 text-left text-sm">
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />5 lokalov</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />20 slik</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />5% AI boost</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />AI insights</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />Sponzorirano oznako</li>
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
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />20 lokalov</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />50 slik</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />API dostop</li>
                    <li className="flex items-center gap-2"><Check className="size-4 text-emerald-500" />AI insights</li>
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
          <h2 className="text-3xl font-bold">
            Postanite founding partner
          </h2>
          <p className="mt-3 text-muted-foreground">
            Prvih 10 preverjenih partnerjev je brezplačno vključenih v beta fazi.
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
    </div>
  );
}
