import { Navigation } from "@/components/sections/navigation";
import { Footer } from "@/components/sections/footer";
import { ResetGeslaView } from "./reset-gesla-view";

/**
 * /reset-gesla — reset-gesla — nastavitev novega gesla.
 *
 * TASK 8 / D8-E (P-NAV-1, issue #8): enotna lupina — lastni header je
 * odstranjen (logo → Navigation). Klientna vsebina živi v ./reset-gesla-view.tsx;
 * server ovoj izrisuje Navigation (solid) + Footer (Footer je async server
 * komponenta → ne sme se renderati iz "use client" datoteke).
 *
 * Stran ostaja izključno slovenska (NI na EN whitelisti — P4-8).
 */
export default function ResetGeslaPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navigation solid />
      <ResetGeslaView />
      <Footer />
    </div>
  );
}
