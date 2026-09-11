import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  BadgeCheck,
  Bot,
  Database,
  Lock,
  MessageCircle,
  RotateCcw,
  Sparkles,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { db } from "@/lib/db";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { safeParseConsultPartners } from "@/lib/consultation-engine";
import { ConsultationPartnerCards } from "@/components/consultation-partner-cards";
import { ConsultationRefSetter } from "@/components/consultation-ref-setter";

// ============================================================================
// JAVNA (zasebna-povezava) STRAN KONZULTACIJE: /konzultacija/[token]
// ============================================================================
// RSC — bere Consultation direktno iz baze (SSR na vsak zahtevek). Token
// (24 znakov naključja) je edini ključ do vsebine: vprašanje vsebuje
// osebne podatke (datumi, proračun, druščina), zato NE SME biti indeksirano
// (noindex) in se ne sme pojavljati v seznamih.
//
// Monetizacijska zanka: na dnu so CTA-ji na things-to-do destinacije in
// rezervacije izkušenj (izkušnje = #1 prihodkovni kanal platforme).
// ============================================================================

export const dynamic = "force-dynamic";

/** Veljaven žeton (male črke/številke, 16–32 znakov). */
const TOKEN_RE = /^[a-z0-9]{16,32}$/;

interface PageProps {
  params: Promise<{ token: string }>;
}

async function getConsultation(token: string) {
  if (!TOKEN_RE.test(token)) return null;

  return db.consultation.findUnique({
    where: { accessToken: token },
    select: {
      id: true,
      question: true,
      destinationName: true,
      travelDates: true,
      partyDescription: true,
      budget: true,
      interests: true,
      answer: true,
      answerSource: true,
      recommendedPartners: true,
      status: true,
      deliveredAt: true,
    },
  });
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params;
  const consultation = await getConsultation(token);
  if (!consultation) return { title: "Konzultacija ni najdena" };
  return {
    title: "Tvoja osebna konzultacija | Discover Slovenia AI",
    description: "Osebni načrt lokalca za tvoje potovanje po Sloveniji.",
    // OSEBNA vsebina — NE indexirati (vprašanje vsebuje zasebne podatke)
    robots: { index: false, follow: false },
  };
}

// Kind/URL logika in vizualne kartice partnerjev živijo v
// <ConsultationPartnerCards> (RSC — obogati partnerje iz DB ob vsakem renderju).

export default async function ConsultationPage({ params }: PageProps) {
  const { token } = await params;
  const c = await getConsultation(token);

  if (!c || c.status !== "delivered" || !c.answer) notFound();

  const isFallback = c.answerSource === "fallback";
  const partners = safeParseConsultPartners(c.recommendedPartners) ?? [];
  let interests: string[] = [];
  try {
    const parsed = JSON.parse(c.interests ?? "[]");
    if (Array.isArray(parsed)) interests = parsed.filter((i) => typeof i === "string");
  } catch {
    interests = [];
  }

  // Kontekst potovanja (podatki, ki jih je kupec podal)
  const contextBits = [
    c.travelDates,
    c.partyDescription,
    c.budget,
    ...(c.destinationName ? [c.destinationName] : []),
  ].filter((x): x is string => Boolean(x));

  const destSlug = c.destinationName
    ? DESTINATIONS.find((d) => d.name === c.destinationName)?.slug
    : null;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Glava */}
      <header className="border-b border-border/70 bg-background">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6">
          <Link
            href="/#vprasi-lokalca"
            className="flex items-center gap-2 text-sm font-semibold text-foreground transition hover:text-primary"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Discover Slovenia AI
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Zasebna povezava
          </span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Atribucija: obisk te strani označi sejo — naslednja rezervacija
            se šteje kot izhodajoča iz konzultacije (Booking.source) */}
        <ConsultationRefSetter />

        {/* Zasebnost opomba */}
        <div className="mb-6 flex items-start gap-2 rounded-lg border border-border/70 bg-background px-3 py-2.5 text-xs text-muted-foreground">
          <BadgeCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" aria-hidden="true" />
          <p>
            Ta odgovor je dostopen samo prek te povezave — vidiš ga samo ti.
            Shrani si URL, da se lahko vrneš kadarkoli.
          </p>
        </div>

        <Card className="gap-0 border-primary/30 py-0 shadow-md">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                <MessageCircle className="size-3" aria-hidden="true" />
                Osebna konzultacija
              </Badge>
              {isFallback ? (
                <Badge
                  variant="outline"
                  className="border-amber-300/60 text-amber-800 dark:border-amber-700/60 dark:text-amber-300"
                >
                  <Database className="size-3" aria-hidden="true" />
                  Brez povezave z AI — izključno iz baze
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-emerald-300/60 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300"
                >
                  <Sparkles className="size-3" aria-hidden="true" />
                  Grounded AI
                </Badge>
              )}
            </div>

            {/* Vprašanje + kontekst */}
            <div className="mt-4 rounded-lg bg-muted/50 p-3 sm:p-4">
              <p className="text-sm font-semibold leading-relaxed">„{c.question}“</p>
              {contextBits.length > 0 ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {contextBits.join(" • ")}
                  {interests.length > 0 ? ` • ${interests.join(", ")}` : ""}
                </p>
              ) : null}
            </div>

            {/* Odgovor */}
            <div className="mt-4 flex items-start gap-3">
              <span
                aria-hidden="true"
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Bot className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold">AI lokalnež</span>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {c.answer}
                </p>

                {/* Priporočeni partnerji — vizualne kartice (mindtrip-style):
                    obogateni iz DB (slika, ocena, cena, CTA), z besedilnim
                    fallbackom za partnerje brez ujemanja */}
                {partners.length > 0 ? (
                  <div className="mt-4">
                    <ConsultationPartnerCards partners={partners} />
                  </div>
                ) : null}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Nadaljevanje potovanja — monetizacijski CTA */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          {destSlug ? (
            <Link
              href={`/destinacija/${destSlug}/things-to-do`}
              className="group rounded-xl border border-border/70 bg-background p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                Raziskuj {c.destinationName}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Lokali, izkušnje in dogodki, ki jih lokal priporoča — z
                ocenami in cenami.
              </p>
            </Link>
          ) : (
            <Link
              href="/"
              className="group rounded-xl border border-border/70 bg-background p-4 transition hover:border-primary/40 hover:shadow-sm"
            >
              <p className="flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                Destinacije po Sloveniji
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Od Bleda do Pirana — s stvarnimi predstavitvami partnerjev.
              </p>
            </Link>
          )}
          <Link
            href="/#vprasi-lokalca"
            className="group rounded-xl border border-border/70 bg-background p-4 transition hover:border-primary/40 hover:shadow-sm"
          >
            <p className="flex items-center gap-2 text-sm font-semibold">
              <MessageCircle className="size-4 text-primary" aria-hidden="true" />
              Še eno vprašanje?
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Brezplačno vprašanje je na voljo vsak dan; konzultacije na
              tvoji e-pošti pa ne potečejo.
            </p>
          </Link>
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Dostavljeno{" "}
          {c.deliveredAt
            ? new Intl.DateTimeFormat("sl-SI", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(c.deliveredAt)
            : ""}
          {" • "}Odgovor je informativne narave — cene in razpoložljivost
          preveri pri partnerjih.
        </p>
      </main>

      <footer className="mt-auto border-t border-border/70 bg-background">
        <div className="mx-auto max-w-3xl px-4 py-4 text-center text-xs text-muted-foreground sm:px-6">
          <Link href="/vir-podatkov" className="hover:text-foreground hover:underline">
            Viri podatkov
          </Link>
          {" • "}
          <Link href="/politika-zasebnosti" className="hover:text-foreground hover:underline">
            Zasebnost
          </Link>
        </div>
      </footer>
    </div>
  );
}
