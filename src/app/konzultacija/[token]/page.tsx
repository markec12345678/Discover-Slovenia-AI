import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
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
import { DESTINATIONS, REGIONS } from "@/lib/slovenia-data";
import { safeParseConsultPartners } from "@/lib/consultation-engine";
import { ConsultationPartnerCards } from "@/components/consultation-partner-cards";
import { ConsultationRefSetter } from "@/components/consultation-ref-setter";
// TASK 8 / F2-D (§3.3, D8-A §9.9 mrtvi konec): kanonski "Dodaj v mojo pot"
// za priporočeno destinacijo — client otok (deluje čisto na localStorage,
// žetona NE razkrije), stran ostaja strežniška RSC.
import { ConsultationDestinationAdd } from "@/components/consultation-destination-add";
// TASK 8 / D8-E (P-NAV-1): enotna lupina — Navigation solid + Footer
// (prej lastni header + mini-footer). Linka mini-noge (/vir-podatkov,
// /politika-zasebnosti) sta v standardnem Footerju (stolpec Pravno).
import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";

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
    title: "Tvoja osebna konzultacija",
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

  // Issue #9 ZERO-AI: novi odgovori so answerSource="deterministic"
  // (motor = ocenjena izbira nad bazo, 0 AI). Zgodovinske vrstice "ai"/
  // "fallback" ostanejo pošteno označene (takrat so bile res take).
  const isFallback = c.answerSource === "fallback";
  const isAi = c.answerSource === "ai";

  // Nove oznake: i18n ključi v imenskem prostoru "consultation" (glej
  // docs/audit/issue9-report-b.md — vrednosti SL/EN za sporočilne datoteke);
  // t.has() varovalka prepreči surove ključe, dokler JSON ni popolnjen.
  const t = await getTranslations("consultation");
  const badgeDeterministic = t.has("badgeDeterministic")
    ? t("badgeDeterministic")
    : "Izključno iz baze platforme";
  const speakerLabel = t.has("speaker") ? t("speaker") : "Lokalec";
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

  const dest = c.destinationName
    ? DESTINATIONS.find((d) => d.name === c.destinationName)
    : undefined;
  const destSlug = dest?.slug ?? null;
  // Regija priporočene destinacije (javni podatek — kontekst vrstice v
  // "Moja pot"); null, če se ime ne ujema s seznamom destinacij.
  const destRegionLabel = dest
    ? (REGIONS.find((r) => r.value === dest.region)?.label ?? null)
    : null;

  return (
    <div className="min-h-screen flex flex-col bg-muted/30">
      {/* TASK 8 / D8-E (P-NAV-1): enotna lupina (Navigation + Footer). */}
      <Navigation solid />

      <main className="mx-auto w-full flex-grow max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        {/* Kontekst (prej lastni header chrome — zdaj vsebina, zero-loss):
            nazaj na obrazec vprašanja + indikator zasebne povezave. */}
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/#vprasi-lokalca"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-foreground transition hover:text-primary"
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Nazaj na vprašanje
          </Link>
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Zasebna povezava
          </span>
        </div>
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
              {!isFallback && !isAi ? (
                /* Novi deterministični odgovori — poštena oznaka vira */
                <Badge
                  variant="outline"
                  className="border-emerald-300/60 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300"
                >
                  <Database className="size-3" aria-hidden="true" />
                  {badgeDeterministic}
                </Badge>
              ) : isFallback ? (
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
                <span className="text-sm font-semibold">
                  {/* Zgodovinski "ai" odgovori so bili res AI — oznaka ostane
                      poštena; novi (deterministic/fallback) nosijo osebnost
                      lokalca brez trditve o AI. */}
                  {isAi ? "AI lokalnež" : speakerLabel}
                </span>
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
            <div className="group relative rounded-xl border border-border/70 bg-background p-4 transition hover:border-primary/40 hover:shadow-sm">
              {/* TASK 8 / F2-D: overlay povezava — celotna kartica ostane
                  klikljiva, kanonski dodaj pa NI gumb znotraj <a> (veljaven
                  HTML, isti vzorec kot /vodici kartice). */}
              <Link
                href={`/destinacija/${destSlug}/things-to-do`}
                className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="sr-only">Raziskuj {c.destinationName}</span>
              </Link>
              <p className="relative z-10 flex items-center gap-2 text-sm font-semibold">
                <MapPin className="size-4 text-primary" aria-hidden="true" />
                Raziskuj {c.destinationName}
              </p>
              <p className="relative z-10 mt-1 text-xs text-muted-foreground">
                Lokali, izkušnje in dogodki, ki jih lokal priporoča — z
                ocenami in cenami.
              </p>
              {/* TASK 8 / F2-D (§3.3): kanonski "Dodaj v mojo pot" — prej
                  slepa ulica (samo skok na things-to-do). Čisto client-side
                  na localStorage; zasebna vsebina konzultacije se ne razkrije. */}
              <ConsultationDestinationAdd
                slug={destSlug}
                name={c.destinationName ?? destSlug}
                subtitle={destRegionLabel ?? undefined}
                image={dest?.image}
                className="relative z-10 mt-3 w-full justify-center"
              />
            </div>
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

      {/* TASK 8 / D8-E: standardna noga lupine (linka prejšnje mini-noge
          sta v njenem stolpcu Pravno). */}
      <Footer />
    </div>
  );
}
