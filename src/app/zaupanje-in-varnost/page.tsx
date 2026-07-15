import { ShieldCheck, BadgeCheck, Sparkles, Eye, Lock, FileCheck, Users, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = {
  title: "Zaupanje in varnost — Discover Slovenia AI",
  description: "Kako preverjamo partnerje, kako deluje AI ranking in kako varujemo vaše podatke.",
  alternates: { canonical: "https://discoverslovenia.ai/zaupanje-in-varnost" },
};

export default function TrustSafetyPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="bg-gradient-to-br from-primary/10 via-background to-background py-16 sm:py-20">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mb-4 flex justify-center">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/10">
                <ShieldCheck className="size-7 text-primary" aria-hidden="true" />
              </div>
            </div>
            <h1 className="text-3xl font-bold sm:text-4xl">
              Zaupanje in varnost
            </h1>
            <p className="mt-4 text-muted-foreground">
              Kako preverjamo partnerje, kako deluje AI ranking in kako varujemo vaše podatke.
            </p>
          </div>
        </div>
      </section>

      {/* Partner verification */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">Kako preverjamo partnerje</h2>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <BadgeCheck className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">Admin odobritev</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vsak lokal mora biti ročno odobren s strani naše ekipe preden je objavljen.
                      Preverjamo: pravilnost kontaktov, ustreznost kategorije, kakovost slik in opisa.
                      Nepotrjeni lokalci niso vidni uporabnikom in AI jih ne more priporočati.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Sparkles className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">Partner Quality Score (0-100)</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vsak lokal ima avtomatsko izračunan Quality Score iz 7 signalov:
                      popolnost profila (30%), kakovost fotografij (15%), kakovost opisa (15%),
                      AI tagi (10%), admin verifikacija (10%), ocene (10%), svežina podatkov (10%).
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Badge variant="secondary" className="gap-1">
                        <BadgeCheck className="size-3" /> Verified (Q&gt;40)
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        👑 Premium (plačnik)
                      </Badge>
                      <Badge variant="secondary" className="gap-1">
                        ⭐ Featured (Q&gt;90 + Premium + Verified)
                      </Badge>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-primary/15">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Eye className="size-5 text-primary" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="font-bold">VLM preverba slik</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Vse slike na platformi so preverjene z Vision Language Modelom (VLM).
                      Preverjamo: ujemanje z imenom lokalca, odsotnost vodnih žigov,
                      kakovost in ustreznost vsebine.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* AI Ranking transparency */}
      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">Kako deluje AI ranking</h2>
            <p className="text-muted-foreground">
              AI priporočila temeljijo na 5 dimenzijah z jasnimi utežmi. Plačilo ne more kupiti prvega mesta.
            </p>

            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { label: "Relevance", weight: "60%", desc: "Ujemanje z uporabnikovim iskanjem (destinacija, interesi, kategorija)" },
                { label: "Quality Score", weight: "15%", desc: "Kakovost profila lokalca (0-100)" },
                { label: "Rating", weight: "10%", desc: "Ocene uporabnikov (0-5 zvezdic)" },
                { label: "Distance", weight: "10%", desc: "Geografska bližina drugim lokacijam v itinererju" },
                { label: "Premium Boost", weight: "5%", desc: "Maksimalno 5% boost za plačane partnerje — ne more preseči relevantnosti" },
              ].map((item) => (
                <Card key={item.label} className="border-border/60">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-sm">{item.label}</span>
                      <Badge variant="default" className="text-xs">{item.weight}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
                    Pravilo: AI nikoli ne priporoča slabega lokalca samo zato, ker plača
                  </p>
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-500">
                    Lokalci z ratingom pod 3.5 ne dobijo premium boost-a.
                    Relevance (60%) vedno dominira nad Premium (5%).
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Transparency labels */}
      <section className="py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">Transparentnost priporočil</h2>
            <p className="text-muted-foreground">
              Vsako AI priporočilo je jasno označeno. Uporabnik ve kaj je oglas in kaj organsko.
            </p>

            <div className="space-y-3">
              {[
                { badge: "⭐ Featured", desc: "Preverjen partner z visoko kakovostjo profila in Premium članstvom. Quality Score > 90.", color: "bg-amber-100 text-amber-800" },
                { badge: "👑 Premium", desc: "Partner podpira razvoj platforme in ima razširjen profil. Boost max 5%.", color: "bg-violet-100 text-violet-800" },
                { badge: "✓ Preverjen", desc: "Podatke je preverila ekipa Discover Slovenia AI.", color: "bg-emerald-100 text-emerald-800" },
                { badge: "🔗 Partnerska povezava", desc: "Affiliate link — Discover Slovenia AI lahko prejme provizijo. Vedno jasno označeno.", color: "bg-blue-100 text-blue-800" },
                { badge: "(brez oznake)", desc: "Organsko priporočilo — brezplačen lokal, AI ga je priporočil glede na relevantnost.", color: "bg-muted text-muted-foreground" },
              ].map((item) => (
                <div key={item.badge} className="flex items-start gap-3 rounded-lg border border-border/60 p-3">
                  <Badge className={`shrink-0 ${item.color}`}>{item.badge}</Badge>
                  <p className="text-sm text-muted-foreground">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Data protection */}
      <section className="bg-muted/30 py-12">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl space-y-6">
            <h2 className="text-2xl font-bold">Varstvo podatkov</h2>

            <div className="grid gap-3 sm:grid-cols-2">
              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <Lock className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">GDPR skladnost</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Politika zasebnosti, piškotki, pravica do pozabe. DPA za premium partnerje.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <FileCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">Brezplačno za uporabnike</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Uporabnik nikoli ne plača za AI funkcije. Monetizacija samo prek ponudnikov.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <Users className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">Brez posrednikov</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      AI poveže turista z ponudnikom. Rezervacijo opravi turist direktno pri ponudniku.
                    </p>
                  </div>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardContent className="p-4 flex items-start gap-3">
                  <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
                  <div>
                    <h3 className="text-sm font-bold">Audit log</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Vse admin akcije (odobritev, zavrnitev, sponzorstvo) so zabeležene in sledljive.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
