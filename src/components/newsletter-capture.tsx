"use client";

import { useState } from "react";
import { Mail, Loader2, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trackFunnel } from "@/lib/funnel";

export function NewsletterCapture({ variant = "inline" }: { variant?: "inline" | "compact" }) {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast.error("Vnesite veljaven email");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/newsletter/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.success) {
        setDone(true);
        trackFunnel("newsletter_signup");
        toast.success("Brezplačni vodnik je na poti!");
      } else {
        toast.error(data.error || "Napaka pri prijavi");
      }
    } catch {
      toast.error("Napaka pri prijavi");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20 p-4">
        <Check className="size-5 text-emerald-600 shrink-0" />
        <p className="text-sm text-emerald-700 dark:text-emerald-400">
          Hvala! Preverite vaš email za brezplačni vodnik.
        </p>
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <form onSubmit={handleSubmit} className="flex gap-2 max-w-md">
        <Input
          type="email"
          placeholder="vas@email.si"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={loading}
          className="flex-1"
          aria-label="Email za brezplačni vodnik"
        />
        <Button type="submit" disabled={loading} size="sm">
          {loading ? <Loader2 className="size-4 animate-spin" /> : "Pošlji"}
        </Button>
      </form>
    );
  }

  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center">
      <div className="flex justify-center mb-3">
        <div className="flex size-12 items-center justify-center rounded-lg bg-primary/10">
          <Sparkles className="size-6 text-primary" />
        </div>
      </div>
      <h3 className="text-lg font-bold mb-2">Brezplačni vodnik: 7 dni v Sloveniji</h3>
      <p className="text-sm text-muted-foreground mb-4">
        Prijavite se in prejmite AI-generiran 7-dnevni itinerer + nasvete za potovanje.
      </p>
      <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="vas@email.si"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
            className="pl-9"
            aria-label="Email"
          />
        </div>
        <Button type="submit" disabled={loading} className="shrink-0">
          {loading ? (
            <><Loader2 className="size-4 animate-spin mr-1" /> Pošiljam...</>
          ) : (
            "Brezplačni vodnik"
          )}
        </Button>
      </form>
      <p className="text-xs text-muted-foreground mt-3">
        Brezplačno. Brez spama. Kadarkoli odjavite.
      </p>
    </div>
  );
}
