"use client";

import { SloveniaPass } from "@/components/slovenia-pass";

/**
 * SloveniaPassSection — sekcija z digitalnim potnim listom.
 * Prikaže se pod AI itinererjem za retention/gamifikacijo.
 */
export function SloveniaPassSection() {
  return (
    <section className="py-12 bg-gradient-to-b from-muted/20 to-background sm:py-16">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold sm:text-3xl">
              Zbiraj svoje slovenske doživetja
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Vsak AI načrt prinese točke in značke. Koliko regij lahko obiščeš?
            </p>
          </div>
          <SloveniaPass />
        </div>
      </div>
    </section>
  );
}
