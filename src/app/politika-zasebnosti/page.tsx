import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Politika zasebnosti — I Feel Slovenia",
  description: "Politika zasebnosti platforme I Feel Slovenia. Kako ravnamo z osebnimi podatki.",
  alternates: { canonical: "https://ifeelslovenia.si/politika-zasebnosti" },
};

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Politika zasebnosti</h1>
        <div className="prose prose-slate dark:prose-invert max-w-none space-y-4 text-sm">
          <p><strong>Zadnja posodobitev:</strong> 2025</p>

          <h2 className="text-xl font-bold">1. Splošno</h2>
          <p>
            I Feel Slovenia ("platforma") spoštuje vašo zasebnost. Ta politika opisuje, katere
            podatke zbiramo, kako jih uporabljamo in katere pravice imate.
          </p>

          <h2 className="text-xl font-bold">2. Podatki obiskovalcev</h2>
          <p>
            <strong>Ne zbiramo osebnih podatkov obiskovalcev</strong> brez izrecne privolitve.
            Spremljamo samo anonimne analitične podatke (ogledi strani, kliki) za izboljšanje
            platforme.
          </p>

          <h2 className="text-xl font-bold">3. Newsletter</h2>
          <p>
            Če se prijavite na newsletter, shranimo vaš email naslov. Uporabimo ga izključno
            za pošiljanje turističnih vodnikov in nasvetov. Kadarkoli se lahko odjavite.
          </p>

          <h2 className="text-xl font-bold">4. Ponudniki (B2B)</h2>
          <p>
            Registrirani ponudniki zagotovijo: ime, email, ime podjetja in geslo. Gesla so
            shranjena z bcrypt hashing (12 rounds). Poslovni podatki (naslov, telefon, spletna
            stran) so javno prikazani na platformi.
          </p>

          <h2 className="text-xl font-bold">5. Leadi (JoinUs forma)</h2>
          <p>
            Ko izpolnite obrazec "Pridruži se", shranimo: ime, email, telefon, ime podjetja,
            tip, kraj in želen paket. Te podatke uporabimo izključno za kontaktiranje v zvezi
            z vašo prijavo.
          </p>

          <h2 className="text-xl font-bold">6. Piškotki</h2>
          <p>
            Platforma uporablja nujno potrebne piškotke za delovanje (avtentikacija, jezikovne
            nastavitve). Ne uporabljamo marketinških ali sledilnih piškotkov.
          </p>

          <h2 className="text-xl font-bold">7. Plačila (Stripe)</h2>
          <p>
            Plačila se obdelujejo preko Stripe. Mi ne shranjujemo podatkov o kreditnih karticah.
            Stripe je PCI-DSS certificiran.
          </p>

          <h2 className="text-xl font-bold">8. Vaše pravice</h2>
          <p>
            V skladu z GDPR imate pravico do: vpogleda, popravka, izbrisa in prenosa svojih
            podatkov. Za uveljavljanje pravic pišite na <a href="mailto:privacy@ifeelslovenia.si" className="underline">privacy@ifeelslovenia.si</a>.
          </p>

          <h2 className="text-xl font-bold">9. Kontakt</h2>
          <p>
            Za vprašanja o zasebnosti: <a href="mailto:privacy@ifeelslovenia.si" className="underline">privacy@ifeelslovenia.si</a>
          </p>
        </div>
      </div>
    </div>
  );
}
