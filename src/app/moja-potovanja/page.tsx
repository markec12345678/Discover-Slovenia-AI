import type { Metadata } from "next";
import { getLocale } from "next-intl/server";

import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { MojaPotovanjaView } from "./moja-potovanja-view";
import { hreflangForPath } from "@/components/seo";
import { currentBaseUrl } from "@/lib/host";

/**
 * /moja-potovanja — osebni prostor popotnika (gost + prijavljeni, P1-2b).
 *
 * TASK 8 / D8-E (P-NAV-1, issue #8): enotna lupina — ta stran je prej
 * gradila LASTEN header (logo + odjava) in mini-nogo. Zdaj server ovoj
 * izrisuje Navigation (solid — brez fotografskega heroja) + standardni
 * Footer, klientna vsebina pa živi v ./moja-potovanja-view.tsx
 * (Footer je async server komponenta → se ne sme renderati iz
 * "use client" datoteke; zato je stran razcepljena na ovoj + pogled).
 *
 * Akcije prejšnjega headerja so ZERO-LOSS preložene v vsebino:
 * - gost: gumb "Prijavi se" (account vrstica pod naslovom)
 * - uporabnik: "Odjavi se" + "Račun" (account vrstica), e-pošta/ime
 *   ostajata v pozdravu in verifikacijskem bannerju
 * - mini-noga: "Nov načrt" → /nacrtuj (Navigation CTA + Footer + tab bar)
 *
 * TASK 8 / F4-C (issue #8 — faza 4 "EN razširitev"): klientni pogled
 * (moja-potovanja-view) je zdaj popolnoma dvojezičen (L-pattern, isti
 * vzorec kot /potovanje), ta strežniški ovoj pa nosi generateMetadata z
 * SL/EN naslovom in opisom. URL ostaja slovenski: /en/moja-potovanja še
 * vedno pokriva proxy 308 (P4-8 — nikoli mešanja jezikov), dokler pot ne
 * dodajo na EN whitelist (lastnik: src/i18n/routing.ts — izven obsega
 * te naloge; hreflangForPath bo EN alternat izdal samodejno takrat).
 */

const PATH = "/moja-potovanja";

// F4-C: meta nizi L-pattern (SL privzet; EN kadar locale zahteva).
const L = {
  metaTitle: {
    sl: "Moja potovanja — načrti, zbirka Moja pot in konzultacije",
    en: "My trips — plans, the My trip collection and consultations",
  },
  metaDescription: {
    sl: "Tvoja shranjena potovanja, zbirka Moja pot in AI konzultacije na enem mestu. Načrti gostujejo lokalno; z računom se sinhronizirajo na vse naprave.",
    en: "Your saved trips, the My trip collection and AI consultations in one place. Plans live on your device and sync to every device with an account.",
  },
} as const;

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

export default function MojaPotovanjaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <MojaPotovanjaView />
      <Footer />
    </div>
  );
}
