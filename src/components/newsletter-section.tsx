"use client";

import { useState } from "react";
import { Mail, Send, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { trackFunnel } from "@/lib/funnel";

// ============================================================================
// NEWSLETTER — "Prejmi skrite bisere Slovenije" (retention kanal)
// ============================================================================
//
// POST /api/newsletter/subscribe { email } → { success, message }
// Napake: 400/500 { error }. Funnel: newsletter_signup.
// ============================================================================

type NewsletterState = "idle" | "sending" | "success" | "already" | "error";

export function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<NewsletterState>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setState("error");
      setMessage("Vpiši veljaven e-poštni naslov.");
      return;
    }

    setState("sending");
    setMessage(null);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Prijava ni uspela — poskusi znova.");
      }

      trackFunnel("newsletter_signup");
      if (data.message?.includes("Že prijavljen")) {
        setState("already");
        setMessage("Že prijavljen!");
      } else {
        setState("success");
        setMessage("Prijavljen! Preveri svoj poštni predal.");
      }
      setEmail("");
    } catch (err) {
      setState("error");
      setMessage(err instanceof Error ? err.message : "Prijava ni uspela — poskusi znova.");
    }
  }

  return (
    <section className="bg-gradient-to-b from-background to-muted/30 py-16 sm:py-20" aria-labelledby="newsletter-title">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-6 sm:p-8">
              <div className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="size-6 text-primary" aria-hidden="true" />
                </div>
                <h2 id="newsletter-title" className="text-2xl font-bold sm:text-3xl">
                  Prejmi skrite bisere Slovenije 📬
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  Enkrat tedensko: lokali, dogodki in nasveti, ki jih ne najdeš v vodnikih
                </p>
              </div>

              {state === "success" || state === "already" ? (
                <div
                  role="status"
                  className="mx-auto mt-6 flex max-w-md items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-medium text-emerald-700 dark:text-emerald-400 animate-in fade-in duration-300"
                >
                  <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
                  {message}
                </div>
              ) : (
                <form onSubmit={handleSubmit} noValidate className="mx-auto mt-6 flex max-w-md flex-col gap-2 sm:flex-row">
                  <label htmlFor="newsletter-email" className="sr-only">
                    E-poštni naslov za prijavo na novice
                  </label>
                  <Input
                    id="newsletter-email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="tvoj@email.si"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (state === "error") {
                        setState("idle");
                        setMessage(null);
                      }
                    }}
                    aria-invalid={state === "error"}
                    aria-describedby={state === "error" && message ? "newsletter-error" : undefined}
                    className={cn("flex-1", state === "error" && "border-destructive")}
                    required
                  />
                  <Button
                    type="submit"
                    disabled={state === "sending"}
                    className="gap-1.5 bg-primary"
                    aria-label="Prijavi me na tedenske novice"
                  >
                    {state === "sending" ? (
                      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <Send className="size-4" aria-hidden="true" />
                    )}
                    {state === "sending" ? "Prijavljam..." : "Prijavi me"}
                  </Button>
                </form>
              )}

              {state === "error" && message && (
                <p id="newsletter-error" role="alert" className="mt-3 flex items-center justify-center gap-1.5 text-sm text-destructive">
                  <AlertCircle className="size-4" aria-hidden="true" />
                  {message}
                </p>
              )}

              <p className="mt-4 text-center text-xs text-muted-foreground">
                Brez neželene pošte — odjava z enim klikom. 🌿
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}

export default NewsletterSection;
