import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Vir podatkov",
  description: "Seznam virov podatkov, ki jih uporablja platforma Discover Slovenia AI.",
  alternates: { canonical: "https://discoverslovenia.ai/vir-podatkov" },
};

export default function DataSourcePage() {
  const sources = [
    { name: "OpenStreetMap", url: "https://www.openstreetmap.org", desc: "POI podatki (točke interesa) — atrakcije, muzeji, restavracije, hoteli, razgledišča, naravne znamenitosti, religiozni objekti. Licenca: ODbL.", type: "POI baza" },
    { name: "Wikipedia / Wikidata", url: "https://www.wikimedia.org", desc: "Opisi destinacij in POI-jev. Licenca: CC BY-SA.", type: "Opisi" },
    { name: "Open-Meteo", url: "https://open-meteo.com", desc: "Vremenski podatki v realnem času. Brezplačni API brez ključa.", type: "Vreme" },
    { name: "z-ai-web-dev-sdk (GLM)", url: "https://z.ai", desc: "AI generiranje itinererjev na podlagi uporabnikovih preferenc.", type: "AI" },
    { name: "Booking.com Affiliate", url: "https://www.booking.com", desc: "Iskanje nastanitev. Affiliate program.", type: "Nastanitev" },
    { name: "DiscoverCars Affiliate", url: "https://www.discovercars.com", desc: "Najem avtomobila. Affiliate program (70% provizija).", type: "Transport" },
    { name: "Viator Affiliate", url: "https://www.viator.com", desc: "Aktivnosti in izkušnje. Affiliate program (8% provizija).", type: "Aktivnosti" },
    { name: "Skyscanner Affiliate", url: "https://www.skyscanner.net", desc: "Iskanje letov. Affiliate program (40% provizija).", type: "Leti" },
    { name: "World Nomads Affiliate", url: "https://www.worldnomads.com", desc: "Potno zavarovanje. Affiliate program.", type: "Zavarovanje" },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-6">Vir podatkov</h1>
        <p className="text-muted-foreground mb-8">
          Platforma Discover Slovenia AI uporablja naslednje vire podatkov za zagotavljanje
          kakovostnih informacij o slovenskih turističnih destinacijah.
        </p>

        <div className="space-y-4">
          {sources.map((s) => (
            <div key={s.name} className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold">{s.name}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{s.desc}</p>
                </div>
                <span className="text-xs bg-muted px-2 py-1 rounded shrink-0">{s.type}</span>
              </div>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-sm text-primary underline mt-2 inline-block">
                {s.url} →
              </a>
            </div>
          ))}
        </div>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">Lokalni ponudniki</h2>
          <p className="text-sm text-muted-foreground">
            Podatki o lokalnih ponudnikih (hoteli, restavracije, aktivnosti, izdelki, izkušnje)
            so prispevani s strani registriranih ponudnikov preko B2B portala. Vsak ponudnik
            je odgovoren za točnost svojih podatkov.
          </p>
        </div>
      </div>
    </div>
  );
}
