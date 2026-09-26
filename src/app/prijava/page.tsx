import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { PrijavaView } from "./prijava-view";

/**
 * /prijava — prijava in registracija B2C računa popotnika (P1-2b).
 *
 * TASK 8 / D8-E (P-NAV-1, issue #8): enotna lupina — stran je prej imela
 * lasten header (logo + "← Nazaj na spletno stran", obe povezavi na "/"
 * → pokriva logotip v Navigation). Klientna vsebina živi v
 * ./prijava-view.tsx; server ovoj izrisuje Navigation (solid) + Footer
 * (Footer je async server komponenta → ne sme se renderati iz
 * "use client" datoteke).
 *
 * Stran ostaja izključno slovenska (NI na EN whitelisti — P4-8).
 */
export default function PrijavaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <PrijavaView />
      <Footer />
    </div>
  );
}
