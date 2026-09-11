"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  Mountain,
  Loader2,
  LogOut,
  Mail,
  Send,
  Map,
  CalendarDays,
  Eye,
  MessageSquareText,
  CheckCircle2,
  Clock,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Plus,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// /moja-potovanja — osebni prostor prijavljenega popotnika (P1-2b)
// ============================================================================
// - Header z pozdravom + odjava
// - Verifikacijski banner (amber), če e-pošta ni potrjena + ponovno pošiljanje
// - "Shranjena potovanja": kartice itinererjev (ime, dnevi, datum, ogledi)
// - "Moje AI konzultacije": SAMO s potrjeno e-pošto (zasebni dostavni kanal)
// ============================================================================

// === Odgovor GET /api/user/trips ===
interface TripItem {
  shareId: string;
  name: string | null;
  createdAt: string;
  views: number;
  dayCount: number;
}

interface ConsultationItem {
  token: string;
  status: string;
  createdAt: string;
  questionPreview: string;
  deliveredAt: string | null;
}

interface TripsResponse {
  trips: TripItem[];
  consultations: ConsultationItem[];
  emailVerified: boolean;
  user: { name: string | null; email: string };
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("sl-SI", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export default function MojaPotovanjaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  const [data, setData] = useState<TripsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const isUserSession =
    status === "authenticated" && session?.user?.accountType === "user";

  // Preusmeritev neprijavljenih / napačnih sej na prijavo
  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/prijava");
    } else if (
      status === "authenticated" &&
      session?.user?.accountType !== "user"
    ) {
      // B2B seja nima kaj iskati tukaj — nazaj na domačo stran
      router.replace("/");
    }
  }, [status, session, router]);

  // Nalaganje podatkov (samo za B2C sejo)
  useEffect(() => {
    if (!isUserSession) return;
    let cancelled = false;

    fetch("/api/user/trips", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) {
          const d = await r.json().catch(() => ({}));
          throw new Error(d?.error ?? "Nalaganje ni uspelo.");
        }
        return r.json() as Promise<TripsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : "Nalaganje ni uspelo."
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isUserSession]);

  // Ponovno pošiljanje verifikacijske povezave
  const resendVerification = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/user/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d?.error ?? "Pošiljanje ni uspelo.");
      toast({
        title: "Povezava poslana",
        description:
          d?.message ??
          "Preverite vaš e-poštni predal (tudi mapo neželena pošta).",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setResending(false);
    }
  };

  // Spinner med preusmeritvijo / nalaganjem seje
  if (status === "loading" || status === "unauthenticated" || !isUserSession) {
    return (
      <main
        className="min-h-screen bg-muted/30 flex items-center justify-center"
        aria-busy="true"
      >
        <div className="flex flex-col items-center gap-3">
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-sm text-muted-foreground">Nalagam...</p>
        </div>
      </main>
    );
  }

  const userName = session?.user?.name ?? data?.user.name ?? data?.user.email;
  const emailVerified = data?.emailVerified ?? false;

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between gap-3">
          <Link
            href="/"
            className="flex items-center gap-2 text-primary font-bold text-lg"
          >
            <Mountain className="size-5" aria-hidden="true" />
            Discover Slovenia AI
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/prijava"
              className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block"
            >
              Račun
            </Link>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 h-10"
              onClick={() => void signOut({ callbackUrl: "/" })}
            >
              <LogOut className="size-4" aria-hidden="true" />
              Odjavi se
            </Button>
          </div>
        </div>
      </header>

      {/* Vsebina */}
      <section className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Moja potovanja
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pozdravljeni, <strong>{userName}</strong>!
        </p>

        {/* Verifikacijski banner */}
        {data && !emailVerified && (
          <Alert className="mt-6 border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
            <Mail className="size-4 text-amber-600" aria-hidden="true" />
            <AlertTitle>Potrdite svojo e-pošto</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">
                Potrdite svojo e-pošto, da vidite zgodovino konzultacij — na{" "}
                <strong>{data.user.email}</strong> ste prejeli povezavo.
              </span>
              <Button
                size="sm"
                onClick={resendVerification}
                disabled={resending}
                className="gap-1.5 shrink-0"
              >
                {resending ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Send className="size-3.5" aria-hidden="true" />
                )}
                Pošlji povezavo znova
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Napaka nalaganja */}
        {loadError && (
          <Alert variant="destructive" className="mt-6">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Napaka</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {/* Skeleton nalaganja */}
        {!data && !loadError && (
          <div className="mt-6 space-y-3" aria-busy="true" aria-label="Nalagam potovanja">
            <div className="h-24 rounded-xl border border-border bg-background animate-pulse" />
            <div className="h-24 rounded-xl border border-border bg-background animate-pulse" />
          </div>
        )}

        {data && (
          <div className="mt-8 space-y-10">
            {/* === SHRANJENA POTOVANJA === */}
            <section aria-labelledby="shr-potovanja">
              <div className="flex items-center justify-between gap-3">
                <h2
                  id="shr-potovanja"
                  className="flex items-center gap-2 text-lg font-semibold"
                >
                  <Map className="size-5 text-primary" aria-hidden="true" />
                  Shranjena potovanja
                </h2>
                <Badge variant="secondary">
                  {data.trips.length}
                  {data.trips.length === 1 ? " načrt" : data.trips.length < 5 ? " načrti" : " načrtov"}
                </Badge>
              </div>

              {data.trips.length === 0 ? (
                <EmptyState
                  icon={<Map className="size-8 text-primary" aria-hidden="true" />}
                  title="Nimate še shranjenih potovanj"
                  description="Načrtujte potovanje z AI načrtovalcem in ga shranite — pojavi se tukaj."
                  ctaHref="/#načrtuj"
                  ctaLabel="Načrtuj potovanje"
                />
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.trips.map((trip) => (
                    <li key={trip.shareId}>
                      <Card className="h-full transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base line-clamp-1">
                            {trip.name ?? `Potovanje ${formatDate(trip.createdAt)}`}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" aria-hidden="true" />
                              {trip.dayCount}
                              {trip.dayCount === 1
                                ? " dan"
                                : trip.dayCount < 5
                                ? " dnevi"
                                : " dni"}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Eye className="size-3.5" aria-hidden="true" />
                              {trip.views}
                              {trip.views === 1 ? " ogled" : trip.views < 5 ? " ogledi" : " ogledov"}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-3 pt-0">
                          <span className="text-xs text-muted-foreground">
                            Shranjeno {formatDate(trip.createdAt)}
                          </span>
                          <Button asChild size="sm" className="gap-1.5 shrink-0">
                            <Link href={`/pot/${trip.shareId}`}>
                              Odpri
                              <ArrowRight className="size-3.5" aria-hidden="true" />
                            </Link>
                          </Button>
                        </CardContent>
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* === MOJE AI KONZULTACIJE (samo potrjena e-pošta) === */}
            {emailVerified && (
              <section aria-labelledby="moje-konzultacije">
                <div className="flex items-center justify-between gap-3">
                  <h2
                    id="moje-konzultacije"
                    className="flex items-center gap-2 text-lg font-semibold"
                  >
                    <MessageSquareText className="size-5 text-primary" aria-hidden="true" />
                    Moje AI konzultacije
                  </h2>
                  <Badge variant="secondary">
                    {data.consultations.length}
                    {data.consultations.length === 1
                      ? " konzultacija"
                      : data.consultations.length < 5
                      ? " konzultacije"
                      : " konzultacij"}
                  </Badge>
                </div>

                {data.consultations.length === 0 ? (
                  <EmptyState
                    icon={
                      <Sparkles className="size-8 text-primary" aria-hidden="true" />
                    }
                    title="Niste še oddali konzultacije"
                    description="Poiščite brezplačen nasvet lokalca — vpišite vprašanje in AI ekspert vam bo odgovoril po e-pošti."
                    ctaHref="/#vprasi-lokalca"
                    ctaLabel="Brezplačna konzultacija"
                  />
                ) : (
                  <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                    {data.consultations.map((c) => (
                      <li key={c.token}>
                        <Card className="h-full transition-shadow hover:shadow-md">
                          <CardHeader className="pb-2">
                            <div className="flex items-center justify-between gap-2">
                              {c.status === "delivered" ? (
                                <Badge className="gap-1 border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400 dark:border-emerald-800">
                                  <CheckCircle2 className="size-3" aria-hidden="true" />
                                  Odgovorjen
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
                                  <Clock className="size-3" aria-hidden="true" />
                                  V pripravi
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(c.createdAt)}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="pt-0">
                            <p className="text-sm text-muted-foreground line-clamp-2">
                              {c.questionPreview}
                              {(c.questionPreview ?? "").length >= 140 ? "…" : ""}
                            </p>
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <span className="text-xs text-muted-foreground">
                                {c.status === "delivered" && c.deliveredAt
                                  ? `Odgovorjen ${formatDate(c.deliveredAt)}`
                                  : "Odgovor prispe na vašo e-pošto"}
                              </span>
                              <Button asChild size="sm" className="gap-1.5 shrink-0">
                                <Link href={`/konzultacija/${c.token}`}>
                                  Odpri
                                  <ArrowRight className="size-3.5" aria-hidden="true" />
                                </Link>
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )}
          </div>
        )}
      </section>

      {/* Noga strani (lepa zaključitev kratke vsebine) */}
      <footer className="mt-auto border-t border-border bg-background">
        <div className="mx-auto max-w-5xl px-4 py-4 max-sm:pb-[calc(1rem+env(safe-area-inset-bottom,0px))] flex items-center justify-between text-xs text-muted-foreground">
          <span>Discover Slovenia AI — vaš osebni potovalni pomočnik</span>
          <Link href="/#načrtuj" className="hover:text-primary transition-colors inline-flex items-center gap-1">
            <Plus className="size-3.5" aria-hidden="true" />
            Nov načrt
          </Link>
        </div>
      </footer>
    </main>
  );
}

/* ====================== PRAZNO STANJE ====================== */

function EmptyState({
  icon,
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <div className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-8 text-center">
      <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-full bg-primary/10">
        {icon}
      </div>
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
        {description}
      </p>
      <Button asChild className="mt-4 gap-1.5 font-semibold">
        <Link href={ctaHref}>
          {ctaLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
