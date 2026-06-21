import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { Mail, MapPin, Globe, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Kontakt — I Feel Slovenia",
  description: "Stopite v stik z ekipo I Feel Slovenia. Email, telefon in kontaktne informacije.",
  alternates: { canonical: "https://ifeelslovenia.si/kontakt" },
};

export default function ContactPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-6">Kontakt</h1>
        <p className="text-muted-foreground mb-8">
          Imate vprašanja o platformi, sodelovanju ali tehničnih zadevah? Pišite nam.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="p-5">
              <Mail className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Email</h3>
              <a href="mailto:info@ifeelslovenia.si" className="text-sm text-primary underline">
                info@ifeelslovenia.si
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <MapPin className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Lokacija</h3>
              <p className="text-sm text-muted-foreground">Slovenija 🇸🇮</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Globe className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Jeziki</h3>
              <p className="text-sm text-muted-foreground">Slovenščina, English, Deutsch, Italiano</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <Shield className="size-6 text-primary mb-2" />
              <h3 className="font-semibold mb-1">Tehnična podpora</h3>
              <a href="mailto:podpora@ifeelslovenia.si" className="text-sm text-primary underline">
                podpora@ifeelslovenia.si
              </a>
            </CardContent>
          </Card>
        </div>

        <div className="mt-8 rounded-xl border border-primary/30 bg-primary/5 p-6">
          <h2 className="font-bold mb-2">Za ponudnike</h2>
          <p className="text-sm text-muted-foreground mb-3">
            Želite postati del platforme? Registrirajte se na portalu za ponudnike.
          </p>
          <a href="/owner/prijava" className="text-primary underline text-sm">
            Registracija ponudnika →
          </a>
        </div>
      </div>
    </div>
  );
}
