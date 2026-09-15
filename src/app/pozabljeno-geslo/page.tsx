"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Mountain,
  Loader2,
  CheckCircle2,
  Mail,
  KeyRound,
  ArrowRight,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ============================================================================
// /pozabljeno-geslo — zahteva povezave za ponastavitev gesla (P1-2b)
// ============================================================================
// POST /api/user/forgot-password — VEDNO vrne uspeh (anti-enumeration:
// ne razkriva, ali e-pošta obstaja v bazi).
// ============================================================================

export default function PozabljenoGesloPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [sentMsg, setSentMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Vnesite veljaven e-poštni naslov.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Zahteva ni uspela.");
      }
      setSentMsg(data?.message ?? "Povezava je poslana.");
      setSent(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Poskusite znova.");
    } finally {
      setLoading(false);
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

      {/* max-sm:pb varnostni zamik za iOS home indicator (desktop: env()=0) */}
      <div className="flex-1 flex items-center justify-center px-4 py-12 max-sm:pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
              {sent ? (
                <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
              ) : (
                <KeyRound className="size-6 text-primary" aria-hidden="true" />
              )}
            </div>
            <CardTitle className="text-xl">
              {sent ? "Preverite e-pošto" : "Pozabljeno geslo"}
            </CardTitle>
            {!sent && (
              <p className="text-sm text-muted-foreground mt-1">
                Vnesite e-pošto vašega računa — poslali vam povezavo za
                nastavitev novega gesla.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {sent ? (
              <>
                <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                  <CheckCircle2
                    className="size-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <AlertTitle>Povezava poslana</AlertTitle>
                  <AlertDescription className="text-sm">
                    {sentMsg}
                  </AlertDescription>
                </Alert>
                <Button
                  asChild
                  className="w-full gap-1.5 font-semibold"
                >
                  <Link href="/prijava">
                    Nazaj na prijavo
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden="true" />
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="forgot-email">E-pošta</Label>
                  <div className="relative">
                    <Mail
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <Input
                      id="forgot-email"
                      type="email"
                      autoComplete="email"
                      inputMode="email"
                      className="pl-9"
                      placeholder="ime@primer.si"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      disabled={loading}
                      required
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="w-full gap-1.5 font-semibold"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Mail className="size-4" aria-hidden="true" />
                  )}
                  {loading ? "Pošiljam..." : "Pošlji povezavo za ponastavitev"}
                </Button>
              </form>
            )}

            <p className="text-xs text-center text-muted-foreground">
              Ste ponudnik? Uporabite{" "}
              <Link
                href="/owner/prijava"
                className="hover:underline"
              >
                ponastavitev na ponudniškem portalu
              </Link>
              .{" "}
              <button
                type="button"
                onClick={() => router.push("/prijava")}
                className="hover:underline"
              >
                Nazaj na prijavo
              </button>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
