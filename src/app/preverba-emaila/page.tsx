"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Mountain,
  Loader2,
  CheckCircle2,
  XCircle,
  ArrowRight,
  Send,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// /preverba-emaila?token=... — potrditev e-pošte B2C računa (P1-2b)
// ============================================================================
// Javna stran (povezava iz e-pošte). Prebere žeton iz URL-ja in takoj
// potrdi e-pošto prek POST /api/user/verify-email { action: "confirm" }.
// Napaka: gumb "Zahtevaj novo povezavo" (samo prijavljeni B2C — sicer
// povezava na prijavo).
// ============================================================================

type VerifyResult = { ok: boolean; message: string };

export default function PreverbaEmailaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  // null = poteka; sicer rezultat potrditve
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    const confirm: Promise<VerifyResult> = token
      ? fetch("/api/user/verify-email", {
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
  const isUserSession =
    status === "authenticated" && session?.user?.accountType === "user";

  // Zahteva nove povezave (samo prijavljen B2C — POST request)
  const requestNewLink = async () => {
    setRequesting(true);
    try {
      const res = await fetch("/api/user/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Pošiljanje ni uspelo.");
      toast({
        title: "Povezava poslana",
        description:
          data?.message ??
          "Preverite vaš e-poštni predal (tudi mapo neželena pošta).",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setRequesting(false);
    }
  };

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      <header className="bg-background border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-bold text-lg"
          >
            <Mountain className="size-5" aria-hidden="true" />
            Discover Slovenia AI
          </Link>
          <Link
            href="/prijava"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Prijava
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
                ? "E-poštni naslov je potrjen!"
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

            {success ? (
              <div className="space-y-3">
                <Button asChild size="lg" className="w-full gap-1.5 font-semibold">
                  <Link href="/moja-potovanja">
                    Moja potovanja
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="w-full font-semibold"
                >
                  <Link href="/">Na domačo stran</Link>
                </Button>
              </div>
            ) : (
              !loading && (
                <div className="space-y-3">
                  {isUserSession ? (
                    <Button
                      size="lg"
                      onClick={requestNewLink}
                      disabled={requesting}
                      className="w-full gap-1.5 font-semibold"
                    >
                      {requesting ? (
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <Send className="size-4" aria-hidden="true" />
                      )}
                      Zahtevaj novo povezavo
                    </Button>
                  ) : (
                    <Button
                      asChild
                      size="lg"
                      className="w-full gap-1.5 font-semibold"
                    >
                      <Link href="/prijava">
                        Na prijavo
                        <ArrowRight className="size-4" aria-hidden="true" />
                      </Link>
                    </Button>
                  )}
                  <p className="text-xs text-muted-foreground text-center">
                    Prijavite se — v &bdquo;Moja potovanja&ldquo; lahko zahtevate
                    novo povezavo za potrditev.{" "}
                    <button
                      type="button"
                      onClick={() => router.push("/")}
                      className="hover:underline"
                    >
                      Nazaj na domačo stran
                    </button>
                  </p>
                </div>
              )
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
