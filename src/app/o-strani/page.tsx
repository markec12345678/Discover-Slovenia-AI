import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mountain, Sparkles, Globe, Shield, Users } from "lucide-react";

export const metadata: Metadata = {
  title: "O strani",
  description: "Discover Slovenia AI je AI-poganjana turistična platforma za Slovenijo. Spoznajte našo ekipo, misijo in kako platforma deluje.",
  alternates: { canonical: "https://discoverslovenia.ai/o-strani" },
};

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <Badge className="mb-4">O strani</Badge>
        <h1 className="text-4xl font-bold mb-6">O Discover Slovenia AI</h1>

        <div className="prose prose-slate dark:prose-invert max-w-none space-y-6">
          <p className="text-lg text-muted-foreground">
            <strong>Discover Slovenia AI</strong> je AI-poganjana turistična platforma, ki povezuje
            potnike z lokalnimi ponudniki v Sloveniji. Naša misija je olajšati odkrivanje
            slovenskih destinacij — od Blejskega jezera do Pirana — z umetno inteligenco,
            interaktivnim zemljevidom in direktnimi povezavami do lokalnih ponudnikov.
          </p>

          <h2 className="text-2xl font-bold mt-8">Kaj ponujamo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <Card>
              <CardContent className="p-5">
                <Sparkles className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">AI načrtovalec potovanj</h3>
                <p className="text-sm text-muted-foreground">
                  Generira personalizirane itinererje glede na proračun, interese in sezono.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Mountain className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">22 destinacij</h3>
                <p className="text-sm text-muted-foreground">
                  Od Alp do Jadrana — z interaktivnim zemljevidom in tisoči POI.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Users className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">Lokalni ponudniki</h3>
                <p className="text-sm text-muted-foreground">
                  Neposredne povezave do hotelov, restavracij in aktivnosti — brez provizij.
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-5">
                <Globe className="size-6 text-primary mb-2" />
                <h3 className="font-semibold mb-1">4 jeziki</h3>
                <p className="text-sm text-muted-foreground">
                  Slovenščina, angleščina, nemščina in italijanščina za globalne turiste.
                </p>
              </CardContent>
            </Card>
          </div>

          <h2 className="text-2xl font-bold mt-8">Kako delujemo</h2>
          <p>
            Platforma ne pobira provizij od rezervacij. Namesto tega lokalni ponudniki plačujejo
            pavšalno mesečno naročnino za prisotnost na platformi. Uporabniki vedno rezervirajo
            neposredno pri ponudniku — brez posrednikov.
          </p>
          <p>
            AI načrtovalec uporablja <strong>z-ai-web-dev-sdk</strong> za generiranje itinererjev.
            Podatki o točkah interesa (POI) prihajajo iz <strong>OpenStreetMap</strong> in
            <strong> Wikipedie</strong>. Vremenski podatki iz <strong>Open-Meteo</strong>.
          </p>

          <h2 className="text-2xl font-bold mt-8">Kontakt</h2>
          <p>
            Imate vprašanja? Pišite nam na <a href="mailto:info@discoverslovenia.ai" className="text-primary underline">info@discoverslovenia.ai</a>
            ali obiščite <Link href="/kontakt" className="text-primary underline">kontaktno stran</Link>.
          </p>

          <h2 className="text-2xl font-bold mt-8">Podatki</h2>
          <p>
            <strong>Tehnologija:</strong> Next.js 16, TypeScript, Prisma, Tailwind CSS, shadcn/ui<br />
            <strong>AI:</strong> z-ai-web-dev-sdk (GLM)<br />
            <strong>Zemljevid:</strong> Leaflet + OpenStreetMap<br />
            <strong>Baza:</strong> SQLite (Prisma ORM)<br />
            <strong>License:</strong> MIT (odprta koda)<br />
            <strong>Repo:</strong> <a href="https://github.com/markec12345678/i-feel-slovenia" className="text-primary underline">GitHub</a>
          </p>

          <div className="flex gap-3 mt-8">
            <Link href="/politika-zasebnosti" className="text-sm text-muted-foreground underline">Politika zasebnosti</Link>
            <Link href="/pogoji-uporabe" className="text-sm text-muted-foreground underline">Pogoji uporabe</Link>
            <Link href="/vir-podatkov" className="text-sm text-muted-foreground underline">Vir podatkov</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
