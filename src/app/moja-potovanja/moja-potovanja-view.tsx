"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
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
  Sparkles,
  ArrowRight,
  HardDrive,
  CloudUpload,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
// TASK 8 / F3-B (D8-A P-STATE-2): družina stanj — LoadingState (2× pulse
// bloka + hardcoded aria oznaki sta zamenjana), ErrorState
// (destructive Alert) in EmptyState (lokalni klon poenoten, ISTO besedilo
// in akcije). Oznake nalaganja so L-pattern SL/EN (predpogoj F3-E).
import { LoadingState } from "@/components/states/loading-state";
import { ErrorState } from "@/components/states/error-state";
import { EmptyState } from "@/components/states/empty-state";
import { useToast } from "@/hooks/use-toast";
// FW2-C: lokalna zgodovina naročil/rezervacij (localStorage številke + javni
// lookup API-ji) — neodvisna od /api/user/trips, zato render tudi med nalaganjem.
import { MyOrdersSection } from "@/components/my-orders-section";
// TASK 4 / K-6 (UX FIX PASS): gostov pogled — LOKALNA potovanja (dai:my-trips)
// namesto login zida v zlati poti.
import { getSavedTrips, type TrackedTrip } from "@/lib/my-trips-storage";
// TASK 8 / D8-B §4: zbirka "Moja pot" (ADD sloj) — kanonski pogled nad
// dai:my-trip-items, skupen gostu in prijavljenemu uporabniku.
import { MyTripView } from "@/components/my-trip-view";
// TASK 8 / F2-A: pull sinhronizacija zbirke ob obisku (prijavljeni uporabnik)
import { syncMyTripToServer } from "@/lib/my-trip-sync";

// ============================================================================
// /moja-potovanja — KLIENTNI pogled (TASK 8 / D8-E): vsebina strani brez
// lastnega headerja/noge — lupino (Navigation solid + Footer) izrisuje
// server ovoj page.tsx (Footer je async server komponenta). Račun akcije
// (Prijavi se / Račun / Odjavi se) so preložene v account vrstico znotraj
// vsebine (zero-loss).
// ============================================================================
// - Gost: lokalna potovanja (dai:my-trips) + ponudba računa
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

export function MojaPotovanjaView() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  const [data, setData] = useState<TripsResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  // TASK 4 / K-6: gostova LOKALNA potovanja (hidrirajo se TEKOM mounta —
  // localStorage je klient-only, da ni hydration mismatcha).
  const [localTrips, setLocalTrips] = useState<TrackedTrip[] | null>(null);

  const isUserSession =
    status === "authenticated" && session?.user?.accountType === "user";

  // TASK 4 / K-6 (UX FIX PASS): NEPREUSMERJENI gost — prej je klik
  // "Moja potovanja" gosta vrgel na /prijava BREZ sporočila, da je pravkar
  // shranjen načrt DEJANSKO še dostopen (deljiva povezava + localStorage).
  // Prelom zlate poti točno pri MY TRIP (živi dokaz revizije, korak 10).
  // Zdaj: gost vidi SVOJA lokalna potovanja + iskreno ponudbo računa.
  // B2B seja še vedno nima kaj iskati tukaj — nazaj na domačo stran.
  useEffect(() => {
    if (
      status === "authenticated" &&
      session?.user?.accountType !== "user"
    ) {
      router.replace("/");
    }
  }, [status, session, router]);

  // K-6: hidratacija lokalnih potovanj (samo gost — prijavljeni uporablja
  // strežniški seznam iz /api/user/trips + claim plast pri prijavi).
  useEffect(() => {
    if (isUserSession) return;
    const hydrate = setTimeout(() => setLocalTrips(getSavedTrips()), 0);
    return () => clearTimeout(hydrate);
  }, [isUserSession]);

  // Nalaganje podatkov (samo za B2C sejo)
  useEffect(() => {
    if (!isUserSession) return;
    let cancelled = false;

    // TASK 8 / F2-A: pull sinhronizacija zbirke "Moja pot" — prinese
    // predmete z drugih naprav (union-merge v localStorage; MyTripView se
    // osveži prek dogodka dai:my-trip-changed). Neblokirajoče + fail-open.
    void syncMyTripToServer();

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

  // Spinner SAMO med nalaganjem seje (gost ne čaka več na preusmeritev —
  // TASK 4 / K-6: takoj dobi svoj pogled). TASK 8 / F3-B: LoadingState
  // (block) — oznaka je L-pattern SL/EN (družinski privzetek).
  if (status === "loading" || (status === "authenticated" && !isUserSession)) {
    return (
      <main
        className="flex-1 flex items-center justify-center py-24"
        aria-busy="true"
      >
        <LoadingState variant="block" />
      </main>
    );

  }

  // TASK 4 / K-6: GOSTOV POGLED — lokalna potovanja te naprave + iskrena
  // ponudba računa (sinhronizacija). Ni login zida: načrti so DEJANSKO
  // dostopni (deljive povezave so javne; localStorage nosi seznam).
  if (!isUserSession) {
    const trips = localTrips ?? [];
    return (
      <main className="flex-1 flex flex-col bg-muted/30">
        <section className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
          <h1 className="text-2xl font-bold sm:text-3xl">Moja potovanja</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Tvoji shranjeni načrti na <strong>tej napravi</strong> — brez računa.
          </p>

          {/* TASK 8 / D8-E: account vrstica — gumb "Prijavi se" preložen iz
              odstranjenega lastnega headerja (logotip → Navigation). */}
          <div className="mt-3">
            <Button asChild size="sm" className="gap-1.5 h-10">
              <Link href="/prijava">Prijavi se</Link>
            </Button>
          </div>

          {/* Iskrena razlaga lokalnega shranjevanja + ponudba sinhronizacije */}
          <Alert className="mt-6 border-primary/30 bg-primary/5">
            <CloudUpload className="size-4 text-primary" aria-hidden="true" />
            <AlertTitle>Načrti so shranjeni na tej napravi</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">
                Deljive povezave so javne in delujejo povsod. Z računom pa se
                načrti ob prijavi samodejeno prenesejo v tvoj profil — videti
                jih boš na vsaki napravi.
              </span>
              <Button asChild size="sm" className="gap-1.5 shrink-0">
                <Link href="/prijava">
                  Ustvari račun
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              </Button>
            </AlertDescription>
          </Alert>

          {/* TASK 8 / D8-B: zbirka "Moja pot" — odkrivanje → dodaj → nadaljuj */}
          <MyTripView className="mt-8" />

          {/* Lokalna potovanja (iste kartice kot prijavljeni) */}
          <section aria-labelledby="lokalna-potovanja" className="mt-8">
            <div className="flex items-center justify-between gap-3">
              <h2
                id="lokalna-potovanja"
                className="flex items-center gap-2 text-lg font-semibold"
              >
                <HardDrive className="size-5 text-primary" aria-hidden="true" />
                Shranjena potovanja
              </h2>
              <Badge variant="secondary">
                {trips.length}
                {trips.length === 1 ? " načrt" : trips.length < 5 ? " načrti" : " načrtov"}
              </Badge>
            </div>

            {localTrips === null ? (
              /* TASK 8 / F3-B: skeleton vrstice družine (status nosi vrstica,
                  skeleti so dekorativni) — prej pulse bloki s hardcoded
                  slovensko aria oznako. */
              <LoadingState variant="block" rows={2} className="mt-4 items-stretch" />
            ) : trips.length === 0 ? (
              <EmptyState
                icon={Map}
                title="Nimaš še shranjenih potovanj"
                description="Načrtuj potovanje z AI načrtovalcem in ga shrani — pojavi se tukaj (na tej napravi)."
                action={{ label: "Načrtuj potovanje", href: "/nacrtuj" }}
                className="mt-4"
              />
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {trips.map((trip) => (
                  <li key={trip.shareId}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base line-clamp-1">
                          {trip.name ?? `Potovanje ${formatDate(trip.savedAt)}`}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <HardDrive className="size-3.5" aria-hidden="true" />
                            na tej napravi
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-3 pt-0">
                        <span className="text-xs text-muted-foreground">
                          Shranjeno {formatDate(trip.savedAt)}
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
        </section>
      </main>
    );
  }

  const userName = session?.user?.name ?? data?.user.name ?? data?.user.email;
  const emailVerified = data?.emailVerified ?? false;

  return (
    <main className="flex-1 flex flex-col bg-muted/30">
      {/* Vsebina */}
      <section className="flex-1 mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
        <h1 className="text-2xl font-bold sm:text-3xl">
          Moja potovanja
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pozdravljeni, <strong>{userName}</strong>!
        </p>

        {/* TASK 8 / D8-E: account vrstica — "Odjavi se" + "Račun" preložena
            iz odstranjenega lastnega headerja (logotip → Navigation; e-pošta
            ostaja v pozdravu + verifikacijskem bannerju). Zero-loss. */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 h-10"
            onClick={() => void signOut({ callbackUrl: "/" })}
          >
            <LogOut className="size-4" aria-hidden="true" />
            Odjavi se
          </Button>
          <Link
            href="/prijava"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Račun
          </Link>
        </div>

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

        {/* Napaka nalaganja — TASK 8 / F3-B: ErrorState (destructive) z
            istim naslovom „Napaka" in istim sporočilom (brez ponovitve —
            enako vedenje kot prej, samo enotna slovnica). */}
        {loadError && (
          <ErrorState message={loadError} title="Napaka" className="mt-6" />
        )}

        {/* Skeleton nalaganja — TASK 8 / F3-B: LoadingState (rows=2),
            prej pulse bloka s hardcoded slovensko aria oznako. */}
        {!data && !loadError && (
          <LoadingState variant="block" rows={2} className="mt-6 items-stretch" />
        )}

        {/* TASK 8 / D8-B: zbirka "Moja pot" — odkrivanje → dodaj → nadaljuj */}
        <MyTripView className="mt-8" />

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
                  icon={Map}
                  title="Nimate še shranjenih potovanj"
                  description="Načrtujte potovanje z AI načrtovalcem in ga shranite — pojavi se tukaj."
                  action={{ label: "Načrtuj potovanje", href: "/nacrtuj" }}
                  className="mt-4"
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
                    icon={Sparkles}
                    title="Niste še oddali konzultacije"
                    description="Poiščite brezplačen nasvet lokalca — vpišite vprašanje in AI ekspert vam bo odgovoril po e-pošti."
                    action={{ label: "Brezplačna konzultacija", href: "/#vprasi-lokalca" }}
                    className="mt-4"
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
        {/* === MOJA NAROČILA IN REZERVACIJE (FW2-C — lokalna zgodovina) === */}
        <div className="mt-10">
          <MyOrdersSection defaultEmail={session?.user?.email ?? ""} />
        </div>
      </section>
    </main>
  );
}

/* ====================== PRAZNO STANJE ======================
 * TASK 8 / F3-B: lokalni klon EmptyState je ODSTRANJEN — površina
 * uporablja družinsko komponento @/components/states/empty-state
 * (isto besedilo, iste akcije, enotna črtkasta slovnica + CTA ≥44px). */
