import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { Compass } from "lucide-react";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { Chatbot } from "@/components/chatbot";
import { JourneyPlanner } from "@/components/sections/journey-planner";
import { Badge } from "@/components/ui/badge";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";
import { Link } from "@/i18n/navigation";

// /potovanje — CELOTNO POTOVANJE ČEZ VSE PONUDNIKE (TASK 58).
//
// Ena stran, ena potovalna veriga: prihod (Brnik, ura) → transfer →
// nastanitev → znamenitosti (TASK 63: odprti viri SI+HR+ME+AL) → dogodki →
// restavracije → bencin → najem avta. Vsak produkt
// nosi KANONSKO identiteto (provider/ID/cena-semantika/geo) in ISKRENO
// zmožnost rezervacije (REZERVACIJA PRI PONUDNIKU ≠ opravljena rezervacija;
// OD CENA ≠ končna cena; SAMO INFORMACIJA brez fake checkout-a).
//
// Zgled naročnika: „Pridem v Slovenijo na Brnik 20. septembra ob 14:00.
// Grem v Maribor." → izhodišče Brnik, destinacija Maribor, 20.09, 14:00.

const PATH = "/potovanje";

const L = {
  badge: { sl: "Celotno potovanje", en: "Complete journey" },
  title: {
    sl: "Eno potovanje, vsi ponudniki",
    en: "One journey, every provider",
  },
  subtitle: {
    sl: "Od pristanka na Brniku do zadnjega postanka: prevoz, nastanitev, znamenitosti, dogodki, restavracije, bencin in najem avta — z resničnimi izdelki, resničnimi cenami in iskrenimi možnostmi rezervacije.",
    en: "From touchdown at Brnik to the last stop: transfers, stays, things to do, events, restaurants, petrol and car rental — with real products, real prices and honest booking capabilities.",
  },
  // TASK 8 / F3-A (issue #8 §43 NO PARALLEL APP): tiha vrstica odnosa —
  // /potovanje je korak ponudnikov/logistike ENEGA načrtovalnika (AI načrt
  // živi na /nacrtuj; izbire se prenesejo z enim klikom „Nadaljuj v
  // načrtovalnik"). Prva vsebinska povezava /potovanje → /nacrtuj (do zdaj
  // samo obratno prek handoff gumba).
  flowNote: {
    sl: "To je korak ponudnikov enega načrtovalnika — izbire preneseš v AI načrt na enem klik.",
    en: "This is the providers step of the one planner — carry your picks into the AI plan in one click.",
  },
  flowLink: { sl: "Odpri AI načrtovalnik", en: "Open the AI planner" },
  metaTitle: {
    sl: "Celotno potovanje po Sloveniji — vsi ponudniki na enem mestu",
    en: "Complete Slovenia journey — every provider in one place",
  },
  metaDescription: {
    sl: "Sestavi celotno potovanje: transfer z letališča, nastanitev, dogodki, restavracije, bencinske postaje in najem avta. Resnični ponudniki, iskrene cene in možnosti rezervacije.",
    en: "Build your complete journey: airport transfer, stay, events, restaurants, petrol stations and car rental. Real providers, honest prices and booking capabilities.",
  },
};

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
  const base = await currentBaseUrl();
  return {
    title: L.metaTitle[lang],
    description: L.metaDescription[lang],
    alternates: {
      canonical: `${base}${PATH}`,
      languages: hreflangForPath(PATH, base),
    },
  };
}

export default async function PotovanjePage() {
  const locale = await getLocale();
  const lang = locale === "en" ? "en" : "sl";
  return (
    <>
      <div className="print:hidden">
        <Navigation />
      </div>
      <main id="vsebina" className="min-h-[60vh]">
        <section className="border-b bg-gradient-to-b from-muted/50 to-background py-10 sm:py-14">
          <div className="mx-auto max-w-5xl px-4 sm:px-6">
            <Badge variant="outline" className="mb-3 gap-1.5">
              <Compass className="h-3.5 w-3.5" /> {L.badge[lang]}
            </Badge>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {L.title[lang]}
            </h1>
            <p className="mt-3 max-w-3xl text-muted-foreground">
              {L.subtitle[lang]}
            </p>
            {/* TASK 8 / F3-A: tiha vrstica odnosa + povezava na AI načrtovalec
                (§43 — en načrtovalnik; besedilo ne tekmuje z naslovom). */}
            <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-sm text-muted-foreground">
              {L.flowNote[lang]}
              <Link
                href="/nacrtuj"
                className="inline-flex items-center gap-0.5 font-medium text-primary underline-offset-4 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
              >
                {L.flowLink[lang]}
                <span aria-hidden="true">→</span>
              </Link>
            </p>
          </div>
        </section>

        <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
          <JourneyPlanner />
        </div>
      </main>
      <div className="print:hidden">
        <Footer />
        <Chatbot />
      </div>
    </>
  );
}
