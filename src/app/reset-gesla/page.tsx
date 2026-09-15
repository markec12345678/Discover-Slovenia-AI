"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  Mountain,
  Loader2,
  CheckCircle2,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  KeyRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ============================================================================
// /reset-gesla?token=... — nastavitev novega gesla B2C računa (P1-2b)
// ============================================================================
// Javna stran (povezava iz e-pošte). Prebere žeton iz URL-ja, uporabnik
// vpiše novo geslo → POST /api/user/reset-password.
// ============================================================================

export default function ResetGeslaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token"));
  }, []);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    if (password.length < 8) {
      setErrorMsg("Geslo mora imeti vsaj 8 znakov.");
      return;
    }
    if (password !== confirm) {
      setErrorMsg("Gesli se ne ujemata.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error ?? "Ponastavitev ni uspela.");
      }
      setSuccessMsg(data?.message ?? "Geslo je spremenjeno.");
      setDone(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Poskusite znova.");
    } finally {
      setLoading(false);
    }
  };

  const noToken = token === null ? false : token === "";

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
              {done ? (
                <CheckCircle2 className="size-6 text-primary" aria-hidden="true" />
              ) : (
                <KeyRound className="size-6 text-primary" aria-hidden="true" />
              )}
            </div>
            <CardTitle className="text-xl">
              {done ? "Geslo spremenjeno" : "Novo geslo"}
            </CardTitle>
            {!done && (
              <p className="text-sm text-muted-foreground mt-1">
                Nastavite novo geslo za vaš račun popotnika.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {done ? (
              <>
                <Alert className="border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800">
                  <CheckCircle2
                    className="size-4 text-emerald-600"
                    aria-hidden="true"
                  />
                  <AlertTitle>Uspeh</AlertTitle>
                  <AlertDescription className="text-sm">
                    {successMsg}
                  </AlertDescription>
                </Alert>
                <Button asChild size="lg" className="w-full gap-1.5 font-semibold">
                  <Link href="/prijava">
                    Prijavi se
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                </Button>
              </>
            ) : noToken ? (
              <Alert variant="destructive">
                <AlertTitle>Manjka žeton</AlertTitle>
                <AlertDescription className="text-sm">
                  Povezava je neveljavna. Zahtevajte novo prek prijave —
                  &bdquo;Pozabljeno geslo?&ldquo;.
                </AlertDescription>
              </Alert>
            ) : token === null ? (
              <div className="flex items-center justify-center py-8">
                <Loader2
                  className="size-6 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {errorMsg && (
                  <Alert variant="destructive">
                    <AlertDescription>{errorMsg}</AlertDescription>
                  </Alert>
                )}

                <div className="space-y-2">
                  <Label htmlFor="new-password">Novo geslo</Label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <Input
                      id="new-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="pl-9 pr-9"
                      placeholder="Vsaj 8 znakov"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={loading}
                      required
                      minLength={8}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={showPassword ? "Skrij geslo" : "Prikaži geslo"}
                      tabIndex={-1}
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" aria-hidden="true" />
                      ) : (
                        <Eye className="size-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirm-password">Ponovi geslo</Label>
                  <div className="relative">
                    <Lock
                      className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                      aria-hidden="true"
                    />
                    <Input
                      id="confirm-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      className="pl-9"
                      placeholder="Ponovite novo geslo"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
                      disabled={loading}
                      required
                      minLength={8}
                    />
                  </div>
                </div>

                <Button
                  type="submit"
                  size="lg"
                  disabled={loading}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-1.5"
                >
                  {loading ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <KeyRound className="size-4" aria-hidden="true" />
                  )}
                  {loading ? "Nastavljam..." : "Nastavi novo geslo"}
                </Button>
              </form>
            )}

            <p className="text-xs text-center text-muted-foreground">
              Povezava velja 1 uro in je enkratna.{" "}
              <Link href="/prijava" className="hover:underline">
                Nazaj na prijavo
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
