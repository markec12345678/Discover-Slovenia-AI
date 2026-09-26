"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
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
// TASK 8 / F4-C (issue #8 — faza 4 "EN razširitev"): CELoten chrome strani
// je L-pattern dvojezičen (isti vzorec kot journey-planner / states družina
// / my-trip-view). SL ostaja privzeti jezik površine; EN pokrije naslove,
// account vrstico, gostov pogled, verifikacijski banner, kartice, števce,
// toaste in prazna stanja. Datotečni nizi (imena potovanj, vprašanja
// konzultacij, sporočila API-jev) prihajajo iz podatkov in ostanejo takšni,
// kot so jih zapisali uporabniki/strežnik.
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

// F4-C: jezikovno zavesten format datuma (SL izhod nespremenjen — "sl-SI";
// EN dobi "en-GB" danev-mesec-leto, ista zgradba kot prej).
function formatDate(iso: string, lang: "sl" | "en"): string {
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "sl-SI", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

// TASK 8 / F4-C: L-pattern slovar celotnega chroma strani (SL privzet).
// Funkcijski listi pokrijejo slovensko množinsko logiko (1 načrt /
// 2–4 načrti / 5+ načrtov — ISTA pogojna kot prej, nič se ne spremeni)
// in angleško (1 plan / n plans).
const L = {
  title: { sl: "Moja potovanja", en: "My trips" },
  open: { sl: "Odpri", en: "Open" },
  errorTitle: { sl: "Napaka", en: "Error" },
  errors: {
    loadFailed: { sl: "Nalaganje ni uspelo.", en: "Loading failed." },
    sendFailed: { sl: "Pošiljanje ni uspelo.", en: "Sending failed." },
  },
  toast: {
    linkSent: { sl: "Povezava poslana", en: "Link sent" },
    checkInbox: {
      sl: "Preverite vaš e-poštni predal (tudi mapo neželena pošta).",
      en: "Check your inbox (including the spam folder).",
    },
    tryAgain: { sl: "Poskusite znova.", en: "Please try again." },
  },
  guest: {
    subtitleA: { sl: "Tvoji shranjeni načrti na", en: "Your saved plans live on" },
    subtitleStrong: { sl: "tej napravi", en: "this device" },
    subtitleB: { sl: "— brez računa.", en: "— no account needed." },
    signIn: { sl: "Prijavi se", en: "Sign in" },
    alertTitle: {
      sl: "Načrti so shranjeni na tej napravi",
      en: "Your plans are stored on this device",
    },
    alertText: {
      sl: "Deljive povezave so javne in delujejo povsod. Z računom pa se načrti ob prijavi samodejno prenesejo v tvoj profil — videti jih boš na vsaki napravi.",
      en: "Share links are public and work everywhere. With an account your plans sync into your profile at sign-in — you'll see them on every device.",
    },
    createAccount: { sl: "Ustvari račun", en: "Create an account" },
    onThisDevice: { sl: "na tej napravi", en: "on this device" },
  },
  user: {
    greeting: { sl: "Pozdravljeni,", en: "Welcome," },
    signOut: { sl: "Odjavi se", en: "Sign out" },
    account: { sl: "Račun", en: "Account" },
  },
  verify: {
    title: { sl: "Potrdite svojo e-pošto", en: "Confirm your email" },
    textA: {
      sl: "Potrdite svojo e-pošto, da vidite zgodovino konzultacij — na",
      en: "Confirm your email to see your consultation history — we've sent a link to",
    },
    textB: { sl: " ste prejeli povezavo.", en: "." },
    resend: { sl: "Pošlji povezavo znova", en: "Send the link again" },
  },
  trips: {
    heading: { sl: "Shranjena potovanja", en: "Saved trips" },
    count: {
      sl: (n: number) =>
        n === 1 ? `${n} načrt` : n < 5 ? `${n} načrti` : `${n} načrtov`,
      en: (n: number) => (n === 1 ? `${n} plan` : `${n} plans`),
    },
    days: {
      sl: (n: number) =>
        n === 1 ? `${n} dan` : n < 5 ? `${n} dnevi` : `${n} dni`,
      en: (n: number) => (n === 1 ? `${n} day` : `${n} days`),
    },
    views: {
      sl: (n: number) =>
        n === 1 ? `${n} ogled` : n < 5 ? `${n} ogledi` : `${n} ogledov`,
      en: (n: number) => (n === 1 ? `${n} view` : `${n} views`),
    },
    fallbackName: {
      sl: (d: string) => `Potovanje ${d}`,
      en: (d: string) => `Trip from ${d}`,
    },
    saved: {
      sl: (d: string) => `Shranjeno ${d}`,
      en: (d: string) => `Saved ${d}`,
    },
    emptyAction: { sl: "Načrtuj potovanje", en: "Plan a trip" },
    emptyGuestTitle: {
      sl: "Nimaš še shranjenih potovanj",
      en: "No saved trips yet",
    },
    emptyGuestDesc: {
      sl: "Načrtuj potovanje z AI načrtovalcem in ga shrani — pojavi se tukaj (na tej napravi).",
      en: "Plan a trip with the AI planner and save it — it shows up here (on this device).",
    },
    emptyTitle: {
      sl: "Nimate še shranjenih potovanj",
      en: "No saved trips yet",
    },
    emptyDesc: {
      sl: "Načrtujte potovanje z AI načrtovalcem in ga shranite — pojavi se tukaj.",
      en: "Plan a trip with the AI planner and save it — it shows up here.",
    },
  },
  consult: {
    heading: { sl: "Moje AI konzultacije", en: "My AI consultations" },
    count: {
      sl: (n: number) =>
        n === 1
          ? `${n} konzultacija`
          : n < 5
          ? `${n} konzultacije`
          : `${n} konzultacij`,
      en: (n: number) => (n === 1 ? `${n} consultation` : `${n} consultations`),
    },
    answered: { sl: "Odgovorjen", en: "Answered" },
    pending: { sl: "V pripravi", en: "In progress" },
    answeredOn: {
      sl: (d: string) => `Odgovorjen ${d}`,
      en: (d: string) => `Answered ${d}`,
    },
    answerByEmail: {
      sl: "Odgovor prispe na vašo e-pošto",
      en: "The answer will arrive by email",
    },
    emptyTitle: {
      sl: "Niste še oddali konzultacije",
      en: "No consultations yet",
    },
    emptyDesc: {
      sl: "Poiščite brezplačen nasvet lokalca — vpišite vprašanje in AI ekspert vam bo odgovoril po e-pošti.",
      en: "Get free local advice — ask a question and the AI expert will answer by email.",
    },
    emptyAction: { sl: "Brezplačna konzultacija", en: "Free consultation" },
  },
} as const;

export function MojaPotovanjaView() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  // F4-C: jezik chroma (SL privzet — EN le, kadar locale zahteva; P4-8).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

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
          throw new Error(d?.error ?? L.errors.loadFailed[lang]);
        }
        return r.json() as Promise<TripsResponse>;
      })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) {
          setLoadError(
            e instanceof Error ? e.message : L.errors.loadFailed[lang]
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isUserSession, lang]);

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
      if (!res.ok) throw new Error(d?.error ?? L.errors.sendFailed[lang]);
      toast({
        title: L.toast.linkSent[lang],
        description:
          d?.message ??
          L.toast.checkInbox[lang],
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: L.errorTitle[lang],
        description: err instanceof Error ? err.message : L.toast.tryAgain[lang],
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
          <h1 className="text-2xl font-bold sm:text-3xl">{L.title[lang]}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {L.guest.subtitleA[lang]}{" "}
            <strong>{L.guest.subtitleStrong[lang]}</strong>{" "}
            {L.guest.subtitleB[lang]}
          </p>

          {/* TASK 8 / D8-E: account vrstica — gumb "Prijavi se" preložen iz
              odstranjenega lastnega headerja (logotip → Navigation). */}
          <div className="mt-3">
            <Button asChild size="sm" className="gap-1.5 h-10">
              <Link href="/prijava">{L.guest.signIn[lang]}</Link>
            </Button>
          </div>

          {/* Iskrena razlaga lokalnega shranjevanja + ponudba sinhronizacije */}
          <Alert className="mt-6 border-primary/30 bg-primary/5">
            <CloudUpload className="size-4 text-primary" aria-hidden="true" />
            <AlertTitle>{L.guest.alertTitle[lang]}</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">
                {L.guest.alertText[lang]}
              </span>
              <Button asChild size="sm" className="gap-1.5 shrink-0">
                <Link href="/prijava">
                  {L.guest.createAccount[lang]}
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
                {L.trips.heading[lang]}
              </h2>
              <Badge variant="secondary">
                {L.trips.count[lang](trips.length)}
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
                title={L.trips.emptyGuestTitle[lang]}
                description={L.trips.emptyGuestDesc[lang]}
                action={{ label: L.trips.emptyAction[lang], href: "/nacrtuj" }}
                className="mt-4"
              />
            ) : (
              <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {trips.map((trip) => (
                  <li key={trip.shareId}>
                    <Card className="h-full transition-shadow hover:shadow-md">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-base line-clamp-1">
                          {trip.name ??
                            L.trips.fallbackName[lang](
                              formatDate(trip.savedAt, lang)
                            )}
                        </CardTitle>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1">
                            <HardDrive className="size-3.5" aria-hidden="true" />
                            {L.guest.onThisDevice[lang]}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="flex items-center justify-between gap-3 pt-0">
                        <span className="text-xs text-muted-foreground">
                          {L.trips.saved[lang](formatDate(trip.savedAt, lang))}
                        </span>
                        <Button asChild size="sm" className="gap-1.5 shrink-0">
                          <Link href={`/pot/${trip.shareId}`}>
                            {L.open[lang]}
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
          {L.title[lang]}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {L.user.greeting[lang]} <strong>{userName}</strong>!
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
            {L.user.signOut[lang]}
          </Button>
          <Link
            href="/prijava"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {L.user.account[lang]}
          </Link>
        </div>

        {/* Verifikacijski banner */}
        {data && !emailVerified && (
          <Alert className="mt-6 border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
            <Mail className="size-4 text-amber-600" aria-hidden="true" />
            <AlertTitle>{L.verify.title[lang]}</AlertTitle>
            <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <span className="text-sm">
                {L.verify.textA[lang]}{" "}
                <strong>{data.user.email}</strong>
                {L.verify.textB[lang]}
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
                {L.verify.resend[lang]}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Napaka nalaganja — TASK 8 / F3-B: ErrorState (destructive) z
            istim naslovom „Napaka" in istim sporočilom (brez ponovitve —
            enako vedenje kot prej, samo enotna slovnica). */}
        {loadError && (
          <ErrorState message={loadError} title={L.errorTitle[lang]} className="mt-6" />
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
                  {L.trips.heading[lang]}
                </h2>
                <Badge variant="secondary">
                  {L.trips.count[lang](data.trips.length)}
                </Badge>
              </div>

              {data.trips.length === 0 ? (
                <EmptyState
                  icon={Map}
                  title={L.trips.emptyTitle[lang]}
                  description={L.trips.emptyDesc[lang]}
                  action={{ label: L.trips.emptyAction[lang], href: "/nacrtuj" }}
                  className="mt-4"
                />
              ) : (
                <ul className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {data.trips.map((trip) => (
                    <li key={trip.shareId}>
                      <Card className="h-full transition-shadow hover:shadow-md">
                        <CardHeader className="pb-2">
                          <CardTitle className="text-base line-clamp-1">
                            {trip.name ??
                              L.trips.fallbackName[lang](
                                formatDate(trip.createdAt, lang)
                              )}
                          </CardTitle>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1">
                              <CalendarDays className="size-3.5" aria-hidden="true" />
                              {L.trips.days[lang](trip.dayCount)}
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <Eye className="size-3.5" aria-hidden="true" />
                              {L.trips.views[lang](trip.views)}
                            </span>
                          </div>
                        </CardHeader>
                        <CardContent className="flex items-center justify-between gap-3 pt-0">
                          <span className="text-xs text-muted-foreground">
                            {L.trips.saved[lang](formatDate(trip.createdAt, lang))}
                          </span>
                          <Button asChild size="sm" className="gap-1.5 shrink-0">
                            <Link href={`/pot/${trip.shareId}`}>
                              {L.open[lang]}
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
                    {L.consult.heading[lang]}
                  </h2>
                  <Badge variant="secondary">
                    {L.consult.count[lang](data.consultations.length)}
                  </Badge>
                </div>

                {data.consultations.length === 0 ? (
                  <EmptyState
                    icon={Sparkles}
                    title={L.consult.emptyTitle[lang]}
                    description={L.consult.emptyDesc[lang]}
                    action={{ label: L.consult.emptyAction[lang], href: "/#vprasi-lokalca" }}
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
                                  {L.consult.answered[lang]}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="gap-1 text-amber-700 dark:text-amber-400">
                                  <Clock className="size-3" aria-hidden="true" />
                                  {L.consult.pending[lang]}
                                </Badge>
                              )}
                              <span className="text-xs text-muted-foreground">
                                {formatDate(c.createdAt, lang)}
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
                                  ? L.consult.answeredOn[lang](
                                      formatDate(c.deliveredAt, lang)
                                    )
                                  : L.consult.answerByEmail[lang]}
                              </span>
                              <Button asChild size="sm" className="gap-1.5 shrink-0">
                                <Link href={`/konzultacija/${c.token}`}>
                                  {L.open[lang]}
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
 * (isto besedilo, iste akcije, enotna črtkasta slovnika + CTA ≥44px). */
