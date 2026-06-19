"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Loader2, Lock, ShieldCheck, AlertCircle } from "lucide-react";
import { AdminDashboard } from "@/components/admin/admin-dashboard";
import { BetaBanner } from "@/components/beta-banner";

const STORAGE_KEY = "admin_token";

export default function AdminPage() {
  // Hydratation-safe state
  const [mounted, setMounted] = React.useState(false);
  const [password, setPassword] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    try {
      const token = window.localStorage.getItem(STORAGE_KEY);
      setPassword(token);
    } catch {
      setPassword(null);
    }
  }, []);

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setPassword(null);
  };

  // SSR-safe placeholder (prevents hydration mismatch)
  if (!mounted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!password) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <BetaBanner />
        <LoginForm
          onLogin={(token) => {
            try {
              window.localStorage.setItem(STORAGE_KEY, token);
            } catch {
              /* ignore */
            }
            setPassword(token);
          }}
        />
      </div>
    );
  }

  return <AdminDashboard adminPassword={password} onLogout={handleLogout} />;
}

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg("Vnesite geslo");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin(password);
      } else {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napačno geslo";
        setErrorMsg(msg);
        setLoading(false);
      }
    } catch (err) {
      console.error("[admin login] napaka:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" />
          </div>
          <div>
            <CardTitle className="text-xl">Admin prijava</CardTitle>
            <CardDescription className="mt-1">
              Vnesite admin geslo za dostop do nadzorne plošče.
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Admin geslo</Label>
              <div className="relative">
                <Lock className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-8"
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Prijava...
                </>
              ) : (
                "Prijava"
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Za povratek na platformo{" "}
              <a
                href="/"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                kliknite tukaj
              </a>
              .
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
