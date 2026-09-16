"use client";

// ERROR BOUNDARY za /pot/[shareId] (revizija 1.33.0, 16-c P2).
//
// Zakaj: deljena povezava SSR izriše SHRANJENI itinerer. Od 1.33.0 save
// route sanitizira vsak nov vnos (shape guard v src/lib/itinerary-sanitize.ts),
// a ZGODOVINSKE vrstice, shranjene pred sanitizacijo, lahko še vsebujejo
// tipe, ki React ne more izrisati (npr. `notes: {}` → "Objects are not valid
// as a React child"). Brez te meje je vsak odjemal take povezave videl
// generični Next.js 500; zdaj dobi prijazno, jezikovno pravilno stran z
// izhodom — povezava je pokvarjena, ne cela aplikacija.
//
// (Segmentna error.tsx — global-error.tsx NE obstaja namerno: napake v
// root layoutu naj ostanejo vidne v razvoju.)

import { useEffect } from "react";
import Link from "next/link";

export default function PotError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Console za diagnostiko (digest povezuje s server logi)
    console.error("[pot] napaka pri izrisu deljene povezave:", error);
  }, [error]);

  const isEn =
    typeof window !== "undefined" && window.location.pathname.startsWith("/en");

  return (
    <main
      role="main"
      className="flex min-h-[70vh] flex-col items-center justify-center gap-6 bg-background px-4 py-16 text-center"
    >
      <div className="max-w-md space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">
          {isEn ? "This shared trip cannot be displayed" : "Te deljene poti ni mogoče prikazati"}
        </h1>
        <p className="text-muted-foreground">
          {isEn
            ? "The link points to a trip that is corrupted or was saved in an older format. Ask the sender to regenerate and share it again."
            : "Povezava vodi do potovanja, ki je poškodovano ali shranjeno v starejšem zapisu. Prosi pošiljatelja, naj načrt znova ustvari in deli."}
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={reset}
            className="rounded-md border border-border bg-background px-4 py-2 text-sm font-medium transition-colors hover:bg-muted"
          >
            {isEn ? "Try again" : "Poskusi znova"}
          </button>
          <Link
            href="/nacrtuj"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {isEn ? "Plan a new trip" : "Načrtuj novo pot"}
          </Link>
        </div>
      </div>
    </main>
  );
}
