"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import {
  Building2,
  LogIn,
  UserPlus,
  Mail,
  Lock,
  Phone,
  User,
  Loader2,
  AlertCircle,
  ShieldCheck,
  ArrowRight,
  Eye,
  EyeOff,
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

export default function OwnerPrijavaPage() {
  const router = useRouter();
  const { toast } = useToast();

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b border-border">
        <div className="mx-auto max-w-5xl px-4 py-4 flex items-center justify-between">
          <a
            href="/"
            className="flex items-center gap-2 text-primary font-bold text-lg"
          >
            <Building2 className="size-5" aria-hidden="true" />
            Discover Slovenia AI
          </a>
          <a
            href="/"
            className="text-sm text-muted-foreground hover:text-primary transition-colors"
          >
            ← Nazaj na spletno stran
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:py-14 text-center">
          <h1 className="text-2xl font-bold sm:text-3xl lg:text-4xl">
            Portal za lastnike lokalov
          </h1>
          <p className="mt-2 text-sm text-primary-foreground/80 max-w-xl mx-auto">
            Upravljajte svoje lokale, spremljajte statistiko in povečajte
            vidnost med tisoči obiskovalcev.
          </p>
        </div>
      </section>

      {/* Auth card */}
      <section className="flex-1 flex items-start sm:items-center justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-md">
          <Tabs defaultValue="prijava" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="prijava" className="gap-1.5">
                <LogIn className="size-3.5" aria-hidden="true" />
                Prijava
              </TabsTrigger>
              <TabsTrigger value="registracija" className="gap-1.5">
                <UserPlus className="size-3.5" aria-hidden="true" />
                Registracija
              </TabsTrigger>
            </TabsList>

            <TabsContent value="prijava" className="mt-4">
              <LoginForm router={router} toast={toast} />
            </TabsContent>

            <TabsContent value="registracija" className="mt-4">
              <RegisterForm router={router} toast={toast} />
            </TabsContent>
          </Tabs>

          <p className="mt-6 text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Vaši podatki so zaščiteni in se uporabljajo izključno za portal.
          </p>
        </div>
      </section>
    </main>
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
      const res = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!res || res.error) {
        const msg = "Napačna e-pošta ali geslo. Poskusite znova.";
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
      router.push("/owner/dashboard");
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
        <CardTitle className="text-xl">Prijava v portal</CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          Vnesite svoje podatke za dostop do portala.
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
            <Label htmlFor="login-password">Geslo</Label>
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
                Prijava
              </>
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/* ====================== REGISTER FORM ====================== */

interface RegisterFormProps {
  router: ReturnType<typeof useRouter>;
  toast: ReturnType<typeof useToast>["toast"];
}

interface RegisterData {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  password: string;
  passwordConfirm: string;
  gdprConsent: boolean;
}

const EMPTY_REGISTER: RegisterData = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  password: "",
  passwordConfirm: "",
  gdprConsent: false,
};

function RegisterForm({ router, toast }: RegisterFormProps) {
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

    // Client-side validacija
    if (!form.name.trim() || form.name.trim().length < 2) {
      setErrorMsg("Ime in priimek mora imeti vsaj 2 znaka.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErrorMsg("Vnesite veljaven e-poštni naslov.");
      return;
    }
    if (!form.businessName.trim() || form.businessName.trim().length < 2) {
      setErrorMsg("Ime podjetja je obvezno.");
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
      setErrorMsg("GDPR privolitev je obvezna.");
      return;
    }

    setLoading(true);
    try {
      // 1. Registracija
      const res = await fetch("/api/owner/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          businessName: form.businessName,
          password: form.password,
          gdprConsent: form.gdprConsent,
        }),
      });
      const data = await res.json();
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

      // 2. Auto-login
      const signRes = await signIn("credentials", {
        email: form.email,
        password: form.password,
        redirect: false,
      });
      if (!signRes || signRes.error) {
        // Registracija je uspela, prijava ni — pošlji na prijavo
        toast({
          title: "Račun ustvarjen!",
          description: "Prijavite se z novimi podatki.",
        });
        router.push("/owner/prijava");
        return;
      }

      toast({
        title: "Dobrodošli!",
        description: "Vaš račun je ustvarjen.",
      });
      router.push("/owner/dashboard");
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
          Brezplačno za začetek. Kadarkoli nadgradite na Premium.
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
              Ime in priimek <span className="text-destructive">*</span>
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
                placeholder="Janez Novak"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reg-business">
              Ime podjetja / lokala{" "}
              <span className="text-destructive">*</span>
            </Label>
            <div className="relative">
              <Building2
                className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                aria-hidden="true"
              />
              <Input
                id="reg-business"
                className="pl-9"
                placeholder="Hotel Bled d.o.o."
                value={form.businessName}
                onChange={(e) => update("businessName", e.target.value)}
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            <div className="space-y-2">
              <Label htmlFor="reg-phone">Telefon</Label>
              <div className="relative">
                <Phone
                  className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="reg-phone"
                  type="tel"
                  autoComplete="tel"
                  inputMode="tel"
                  className="pl-9"
                  placeholder="+386 31 234 567"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  disabled={loading}
                />
              </div>
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
              Strinjam se s predelavo mojih podatkov za namen uporabe portala
              za lastnike lokalov in sprejemam pogoje poslovanja.{" "}
              <span className="text-destructive">*</span>
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
                <Loader2
                  className="size-4 mr-2 animate-spin"
                  aria-hidden="true"
                />
                Ustvarjam račun...
              </>
            ) : (
              <>
                <UserPlus className="size-4 mr-2" aria-hidden="true" />
                Registriraj se
                <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </>
            )}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Z registracijo dobite brezplačen Osnovni paket (1 lokal).
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
