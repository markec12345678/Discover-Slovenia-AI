import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { MojaPotovanjaView } from "./moja-potovanja-view";

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
 * Stran ostaja izključno slovenska (NI na EN whitelisti — P4-8).
 */
export default function MojaPotovanjaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <MojaPotovanjaView />
      <Footer />
    </div>
  );
}
