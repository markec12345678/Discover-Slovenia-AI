"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  Mountain,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  User,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  KeyRound,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  getSavedTripIds,
  removeSavedTripIds,
} from "@/lib/my-trips-storage";

// ============================================================================
// /prijava — prijava in registracija B2C računa popotnika (P1-2b)
// ============================================================================
// Tabs: "Prijava" (signIn("user")) | "Ustvari račun" (POST /api/user/register
// + auto-login). Če je uporabnik že prijavljen (accountType "user"), se namesto
// obrazca prikaže stanje "Prijavljeni ste kot …" s hitrimi povezavami.
// ============================================================================

/* ====================== P2-3: PREVZEM ANONIMNIH POTOVANJ ====================== */

/**
 * Po uspešni B2C prijavi/registraciji: prevzemi anonimno shranjena potovanja
 * (localStorage "dai:my-trips" → POST /api/user/trips/claim). Neblokirajoče —
 * napaka prevzema NE sme preprečiti prijave. Vrne število prevzetih.
 */
async function claimSavedTrips(): Promise<number> {
  try {
    const shareIds = getSavedTripIds();
    if (shareIds.length === 0) return 0;

    let claimed = 0;
    let responded = false;
    try {
      const res = await fetch("/api/user/trips/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shareIds }),
      });
      responded = res.ok || res.status === 400 || res.status === 403;
      if (res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          claimed?: number;
        };
        claimed = typeof data?.claimed === "number" ? data.claimed : 0;
      }
    } finally {
      // Odstrani poslane ID-je SAMO če je strežnik odgovoril — pri omrežni
      // napaki (fetch vrže) ostanejo za retry pri naslednji prijavi.
      if (responded) removeSavedTripIds(shareIds);
    }
    return claimed;
  } catch {
    return 0;
  }
}

export default function PrijavaPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();
  const [tab, setTab] = useState<string>("prijava");

  const isUserSession =
    status === "authenticated" && session?.user?.accountType === "user";

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
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
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Nazaj na spletno stran
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">
            Račun popotnika
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/80 max-w-xl mx-auto">
            Shranjujte načrte potovanj, dostopajte do zgodovine AI konzultacij
            in nadaljujte, kjer ste ostali.
          </p>
        </div>
      </section>

      {/* Auth card */}
      <section className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          {status === "loading" ? (
            <div className="flex items-center justify-center py-16" role="status" aria-label="Nalagam">
              <Loader2
                className="size-8 animate-spin text-muted-foreground"
                aria-hidden="true"
              />
            </div>
          ) : isUserSession ? (
            <AlreadyLoggedInCard />
          ) : (
            <Tabs value={tab} onValueChange={setTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="prijava" className="gap-1.5">
                  <LogIn className="size-3.5" aria-hidden="true" />
                  Prijava
                </TabsTrigger>
                <TabsTrigger value="registracija" className="gap-1.5">
                  <UserPlus className="size-3.5" aria-hidden="true" />
                  Ustvari račun
                </TabsTrigger>
              </TabsList>

              <TabsContent value="prijava" className="mt-4">
                <LoginForm router={router} toast={toast} />
              </TabsContent>

              <TabsContent value="registracija" className="mt-4">
                <RegisterForm
                  router={router}
                  toast={toast}
                  switchToLogin={() => setTab("prijava")}
                />
              </TabsContent>
            </Tabs>
          )}

          <p className="mt-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Vaši podatki so zaščiteni in se uporabljajo izključno za ta portal.
          </p>
        </div>
      </section>
    </main>
  );
}

/* ====================== ŽE PRIJAVLJEN ====================== */

function AlreadyLoggedInCard() {
  const { data: session } = useSession();

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <ShieldCheck className="size-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Prijavljeni ste</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Prijavljeni ste kot <strong>{session?.user?.name ?? session?.user?.email}</strong>.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button asChild size="lg" className="w-full gap-1.5 font-semibold">
          <Link href="/moja-potovanja">
            Moja potovanja
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="w-full gap-1.5"
          onClick={() => void signOut({ callbackUrl: "/" })}
        >
          Odjavi se
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          <Link href="/" className="hover:underline">
            Nazaj na Discover Slovenia AI
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}

/* ====================== LOGIN FORM ====================== */

interface LoginFormProps {
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>["toast"];
}

function LoginForm({ router, toast }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg("Vnesite e-pošto in geslo.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setErrorMsg("Vnesite veljaven e-poštni naslov.");
      return;
    }

    setLoading(true);
    try {
      const res = await signIn("user", {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        const msg = "Napačen e-poštni naslov ali geslo.";
        setErrorMsg(msg);
        toast({
          variant: "destructive",
          title: "Prijava ni uspela",
          description: msg,
        });
        return;
      }
      toast({
        title: "Dobrodošli nazaj!",
        description: "Uspešno ste prijavljeni.",
      });
      // P2-3: prevzem anonimno shranjenih potovanj (neblokirajoče)
      const claimed = await claimSavedTrips();
      if (claimed > 0) {
        toast({
          title: "Potovanja prevzeta v račun",
          description: `${claimed} ${
            claimed === 1 ? "potovanje, ki ste ga ustvarili pred prijavo, smo povezali" : "potovanj, ki ste jih ustvarili pred prijavo, smo povezali"
          } z vašim računom.`,
        });
      }
      router.push("/moja-potovanja");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Napaka pri prijavi.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <LogIn className="size-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Prijava</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Vnesite svoje podatke za dostop do &bdquo;Moja potovanja&ldquo;.
        </p>
      </CardHeader>
      <CardContent>
        {errorMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Napaka</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="login-email">E-pošta</Label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="login-email"
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

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="login-password">Geslo</Label>
            </div>
            <div className="relative">
              <Lock
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="login-password"
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                className="pl-9 pr-9"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                required
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

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
                Prijavljam...
              </>
            ) : (
              <>
                <LogIn className="size-4 mr-2" aria-hidden="true" />
                Prijavi se
              </>
            )}
          </Button>

          <Link
            href="/pozabljeno-geslo"
            className="block w-full text-center text-sm text-primary hover:underline focus:outline-none focus-visible:underline min-h-[44px] flex items-center justify-center"
          >
            Pozabljeno geslo?
          </Link>
        </form>
      </CardContent>

      {/* Namig za ponudnike */}
      <div className="px-6 pb-6">
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
          <Building2 className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <p>
            Ste ponudnik?{" "}
            <Link
              href="/owner/prijava"
              className="text-primary hover:underline font-medium"
            >
              Prijavite se na ponudniškem portalu
            </Link>
            .
          </p>
        </div>
      </div>
    </Card>
  );
}

/* ====================== REGISTER FORM ====================== */

interface RegisterFormProps {
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>["toast"];
  switchToLogin: () => void;
}

interface RegisterData {
  name: string;
  email: string;
  password: string;
  passwordConfirm: string;
  gdprConsent: boolean;
}

const EMPTY_REGISTER: RegisterData = {
  name: "",
  email: "",
  password: "",
  passwordConfirm: "",
  gdprConsent: false,
};

function RegisterForm({ router, toast, switchToLogin }: RegisterFormProps) {
  const [form, setForm] = useState<RegisterData>(EMPTY_REGISTER);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const update = <K extends keyof RegisterData>(
    key: K,
    value: RegisterData[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    // Client-side validacija (server ponovno validira — ne zaupamo klientu)
    if (!form.name.trim() || form.name.trim().length < 2) {
      setErrorMsg("Ime mora imeti vsaj 2 znaka.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErrorMsg("Vnesite veljaven e-poštni naslov.");
      return;
    }
    if (form.password.length < 8) {
      setErrorMsg("Geslo mora imeti vsaj 8 znakov.");
      return;
    }
    if (form.password !== form.passwordConfirm) {
      setErrorMsg("Gesli se ne ujemata.");
      return;
    }
    if (!form.gdprConsent) {
      setErrorMsg("Soglasje s pogoji uporabe je obvezno.");
      return;
    }

    setLoading(true);
    try {
      // 1. Registracija (server: zod + rate limit + bcrypt + žeton)
      const res = await fetch("/api/user/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data?.error ?? "Napaka pri registraciji.";
        setErrorMsg(msg);
        toast({
          variant: "destructive",
          title: "Registracija ni uspela",
          description: msg,
        });
        return;
      }

      // 2. Samodejna prijava B2C providerja "user"
      const signRes = await signIn("user", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (!signRes || signRes.error) {
        // Registracija je uspela, prijava ni — na prijavo z sporočilom
        toast({
          title: "Račun ustvarjen!",
          description: "Prijavite se z novimi podatki.",
        });
        switchToLogin();
        return;
      }

      toast({
        title: "Dobrodošli!",
        description: "Vaš račun je ustvarjen. Potrdite še svojo e-pošto.",
      });
      // P2-3: prevzem anonimno shranjenih potovanj (neblokirajoče)
      const claimed = await claimSavedTrips();
      if (claimed > 0) {
        toast({
          title: "Potovanja prevzeta v račun",
          description: `${claimed} ${
            claimed === 1 ? "potovanje, ki ste ga ustvarili pred prijavo, smo povezali" : "potovanj, ki ste jih ustvarili pred prijavo, smo povezali"
          } z vašim računom.`,
        });
      }
      router.push("/moja-potovanja");
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Napaka pri registraciji.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="text-center">
        <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
          <UserPlus className="size-6 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-xl">Ustvari račun</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Brezplačno — shranjujte potovanja in AI konzultacije.
        </p>
      </CardHeader>
      <CardContent>
        {errorMsg && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="size-4" aria-hidden="true" />
            <AlertTitle>Napaka</AlertTitle>
            <AlertDescription>{errorMsg}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="reg-name">
              Ime <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <User
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="reg-name"
                autoComplete="name"
                className="pl-9"
                placeholder="Ana Novak"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
                minLength={2}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-email">
              E-pošta <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Mail
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="reg-email"
                type="email"
                autoComplete="email"
                inputMode="email"
                className="pl-9"
                placeholder="ime@primer.si"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reg-password">
                Geslo <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="reg-password"
                  type="password"
                  autoComplete="new-password"
                  className="pl-9"
                  placeholder="vsaj 8 znakov"
                  value={form.password}
                  onChange={(e) => update("password", e.target.value)}
                  disabled={loading}
                  required
                  minLength={8}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password-confirm">
                Ponovi geslo <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Lock
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="reg-password-confirm"
                  type="password"
                  autoComplete="new-password"
                  className="pl-9"
                  placeholder="ponovi geslo"
                  value={form.passwordConfirm}
                  onChange={(e) => update("passwordConfirm", e.target.value)}
                  disabled={loading}
                  required
                  minLength={8}
                />
              </div>
            </div>
          </div>

          <div
            className={cn(
              "flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-3"
            )}
          >
            <Checkbox
              id="reg-gdpr"
              checked={form.gdprConsent}
              onCheckedChange={(v) => update("gdprConsent", v === true)}
              disabled={loading}
              className="mt-0.5"
            />
            <Label
              htmlFor="reg-gdpr"
              className="text-xs leading-relaxed font-normal cursor-pointer"
            >
              Soglašam s{" "}
              <Link
                href="/pogoji-uporabe"
                className="text-primary hover:underline"
                target="_blank"
              >
                pogoji uporabe
              </Link>{" "}
              in{" "}
              <Link
                href="/politika-zasebnosti"
                className="text-primary hover:underline"
                target="_blank"
              >
                politiko zasebnosti
              </Link>
              . <span className="text-destructive">*</span>
            </Label>
          </div>

          <Button
            type="submit"
            size="lg"
            disabled={loading}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
                Ustvarjam račun...
              </>
            ) : (
              <>
                <UserPlus className="size-4 mr-2" aria-hidden="true" />
                Ustvari račun
                <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <KeyRound className="size-3.5" aria-hidden="true" />
            Po registraciji vam pošljemo povezavo za potrditev e-pošte.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
