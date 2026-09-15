"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Building2,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ============================================================================
// /owner/preverba-emaila?token=... — potrditev e-pošte (P0-4)
// ============================================================================
// Javna stran (povezava iz e-pošte). Prebere žeton iz URL-ja in potrdi
// e-poštni naslov prek POST /api/owner/verify-email { action: "confirm" }.
// ============================================================================

type VerifyResult = { ok: boolean; message: string };

export default function PreverbaEmailaPage() {
  // null = poteka; sicer rezultat potrditve (vsi setState klici potekajo
  // prek .then() — nikoli sinhrono v telesu efekta)
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    const confirm: Promise<VerifyResult> = token
      ? fetch("/api/owner/verify-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", token }),
        }).then(async (r) => {
          const data = await r.json().catch(() => ({}));
          if (!r.ok) {
            return {
              ok: false,
              message: data?.error ?? "Potrditev ni uspela. Poskusite znova.",
            };
          }
          return {
            ok: true,
            message: data?.message ?? "E-poštni naslov je potrjen.",
          };
        })
      : Promise.resolve({
          ok: false,
          message:
            "Povezava ne vsebuje žetona za potrditev. Uporabite povezavo iz e-pošte.",
        });

    confirm
      .then((res) => setResult(res))
      .catch(() =>
        setResult({
          ok: false,
          message: "Napaka povezave. Poskusite znova.",
        })
      );
  }, []);

  const loading = result === null;
  const success = result?.ok === true;

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-bold text-lg"
          >
            <Building2 className="size-5" aria-hidden="true" />
            Discover Slovenia AI
          </Link>
          <Link
            href="/owner/prijava"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Prijava ponudnikov
          </Link>
        </div>
      </header>

      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              {loading ? (
                <Loader2
                  className="size-6 animate-spin text-primary"
                  aria-hidden="true"
                />
              ) : success ? (
                <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
              ) : (
                <XCircle className="size-6 text-destructive" aria-hidden="true" />
              )}
            </div>
            <CardTitle className="text-xl">
              {loading
                ? "Potrjujem e-pošto..."
                : success
                ? "E-pošta potrjena!"
                : "Potrditev ni uspela"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <p className="text-sm text-muted-foreground text-center">
                Trenutek — preverjamo vašo povezavo.
              </p>
            )}

            {!loading && result && (
              <Alert
                variant={success ? "default" : "destructive"}
                className={
                  success
                    ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800"
                    : undefined
                }
              >
                {success ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <XCircle className="size-4" aria-hidden="true" />
                )}
                <AlertTitle>{success ? "Vse je v redu" : "Težava"}</AlertTitle>
                <AlertDescription className="text-sm">
                  {result.message}
                </AlertDescription>
              </Alert>
            )}

            {!loading && !success && (
              <p className="text-xs text-muted-foreground text-center">
                Prijavite se v portal — tam lahko zahtevate novo povezavo za
                potrditev.
              </p>
            )}

            <Button asChild className="w-full gap-1.5 font-semibold">
              <Link href="/owner/prijava">
                Na prijavo
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>

            <p className="text-xs text-center text-muted-foreground">
              <Link href="/" className="hover:underline">
                Nazaj na Discover Slovenia AI
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
