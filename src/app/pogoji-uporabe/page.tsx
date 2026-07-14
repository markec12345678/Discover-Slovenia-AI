import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Pogoji uporabe",
  description: "Pogoji uporabe platforme Discover Slovenia AI.",
  alternates: { canonical: "https://discoverslovenia.ai/pogoji-uporabe" },
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Pogoji uporabe</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-4 text-sm">
          <p><strong>Zadnja posodobitev:</strong> 2025</p>

          <h2 className="text-xl font-bold">1. Sprejem pogojev</h2>
          <p>Z uporabo platforme Discover Slovenia AI sprejemate te pogoje uporabe.</p>

          <h2 className="text-xl font-bold">2. Storitev</h2>
          <p>
            Platforma ponuja informacije o slovenskih turističnih destinacijah, AI načrtovanje
            potovanj in povezave do lokalnih ponudnikov. Platforma ne posreduje rezervacij —
            uporabniki rezervirajo neposredno pri ponudnikih.
          </p>

          <h2 className="text-xl font-bold">3. AI itinererji</h2>
          <p>
            AI-generirani itinererji so informativne narave. Platforma ne prevzema odgovornosti
            za točnost cen, razpoložljivost ali kakovost storitev tretjih oseb.
          </p>

          <h2 className="text-xl font-bold">4. Affiliate povezave</h2>
          <p>
            Platforma vsebuje affiliate povezave (Booking.com, DiscoverCars, Viator, Skyscanner,
            WorldNomads). Pri rezervacijah preko teh povezav lahko prejmemo provizijo, za vas
            brez dodatnih stroškov.
          </p>

          <h2 className="text-xl font-bold">5. Ponudniki (B2B)</h2>
          <p>
            Registrirani ponudniki so odgovorni za točnost svojih podatkov. Pavšalna naročnina
            (Premium €149/mes, Enterprise €499/mes) se obračuna mesečno. Odjava je možna
            kadarkoli s 30-dnevnim odpovednim rokom.
          </p>

          <h2 className="text-xl font-bold">6. Beta obdobje</h2>
          <p>
            Med beta obdobjem (do 30 aktivnih lokalov) so vsi paketi brezplačni. Po vklopu
            monetizacije imajo beta uporabniki 6 mesecev brezplačnega dostopa.
          </p>

          <h2 className="text-xl font-bold">7. Intelektualna lastnina</h2>
          <p>
            Vsebina platforme je zaščitena z MIT licenco. Slike destinacij so pridobljene iz
            odprtih virov (Unsplash, OpenStreetMap). Spletna koda je odprtokodna na GitHubu.
          </p>

          <h2 className="text-xl font-bold">8. Omejitev odgovornosti</h2>
          <p>
            Platforma ne prevzema odgovornosti za škodo, ki bi izhajala iz uporabe informacij
            ali povezav do tretjih oseb.
          </p>

          <h2 className="text-xl font-bold">9. Spremembe pogojev</h2>
          <p>
            Pogoji se lahko posodobijo. O pomembnih spremembah bomo obvestili registrirane
            uporabnike po emailu.
          </p>

          <h2 className="text-xl font-bold">10. Kontakt</h2>
          <p>
            Vprašanja: <a href="mailto:info@discoverslovenia.ai" className="underline">info@discoverslovenia.ai</a>
          </p>
        </div>
      </div>
    </div>
  );
}
