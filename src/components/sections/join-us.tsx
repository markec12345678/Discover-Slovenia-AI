"use client";

import { useState, useRef, type FormEvent } from "react";
import {
  Check,
  Star,
  ArrowRight,
  Users,
  TrendingUp,
  Mail,
  Phone,
  Building2,
  MapPin,
  MessageSquare,
  ShieldCheck,
  Loader2,
  Sparkles,
  PartyPopper,
  AlertCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  PRICING_PLANS,
  BUSINESS_TYPES,
  type PricingPlan,
} from "@/lib/pricing";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface FormData {
  name: string;
  email: string;
  phone: string;
  businessName: string;
  businessType: string;
  location: string;
  plan: string;
  message: string;
  gdprConsent: boolean;
}

const EMPTY_FORM: FormData = {
  name: "",
  email: "",
  phone: "",
  businessName: "",
  businessType: "",
  location: "",
  plan: "",
  message: "",
  gdprConsent: false,
};

const HERO_STATS = [
  {
    icon: Users,
    value: "12.000+",
    label: "obiskovalcev/mes",
  },
  {
    icon: Star,
    value: "5.2★",
    label: "povprečna ocena",
  },
  {
    icon: TrendingUp,
    value: "32%",
    label: "konverzija v kontakt",
  },
] as const;

export function JoinUs() {
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(EMPTY_FORM);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const scrollToForm = (plan?: PricingPlan["id"]) => {
    if (plan && plan !== "free") {
      // free plan maps to "Osnovni" name; ensure select shows the plan's name
      const target = PRICING_PLANS.find((p) => p.id === plan);
      if (target) {
        setForm((prev) => ({ ...prev, plan: target.name }));
      }
    } else if (plan === "free") {
      const target = PRICING_PLANS.find((p) => p.id === "free");
      if (target) {
        setForm((prev) => ({ ...prev, plan: target.name }));
      }
    }
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    // client-side validation
    if (!form.name.trim()) {
      setErrorMsg("Ime in priimek sta obvezna.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      setErrorMsg("Vnesite veljaven e-poštni naslov.");
      return;
    }
    if (!form.businessName.trim()) {
      setErrorMsg("Ime lokala/panožbe je obvezno.");
      return;
    }
    if (!form.businessType) {
      setErrorMsg("Izberite tip lokala.");
      return;
    }
    if (!form.location.trim()) {
      setErrorMsg("Kraj je obvezen.");
      return;
    }
    if (!form.plan) {
      setErrorMsg("Izberite želen paket.");
      return;
    }
    if (!form.gdprConsent) {
      setErrorMsg("GDPR privolitev je obvezna.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        const message = data?.error ?? "Napaka pri pošiljanju prijave.";
        setErrorMsg(message);
        toast({
          variant: "destructive",
          title: "Napaka",
          description: `Napaka: ${message}`,
        });
        return;
      }
      toast({
        title: "Prijava poslana!",
        description: "Kontaktirali vas bomo v 24 urah.",
      });
      setSubmitted(true);
      setForm(EMPTY_FORM);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Neznana napaka pri pošiljanju.";
      setErrorMsg(message);
      toast({
        variant: "destructive",
        title: "Napaka",
        description: `Napaka: ${message}`,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setSubmitted(false);
    setErrorMsg(null);
    setForm(EMPTY_FORM);
  };

  return (
    <section id="pridruzi-se" className="scroll-mt-20 bg-background">
      {/* ====================== DELE 1 — HERO ====================== */}
      <div className="bg-primary text-primary-foreground">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <div className="flex flex-col items-center text-center gap-6">
            <Badge
              variant="secondary"
              className="bg-primary-foreground/15 text-primary-foreground border-primary-foreground/25 backdrop-blur-sm"
            >
              <Building2 className="size-3.5 mr-1.5" />
              Za lokale, hotele, restavracije
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl lg:text-5xl">
              Pridruži se 50+ slovenskim lokalom
            </h2>
            <p className="max-w-2xl text-base text-primary-foreground/80 sm:text-lg">
              AI vsak mesec priporoča vaš lokal tisočem potnikom. Bodite med
              njimi.
            </p>

            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4 mt-2">
              {HERO_STATS.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-primary-foreground/10 border border-primary-foreground/20 backdrop-blur-sm p-4 flex flex-col items-center gap-1"
                >
                  <stat.icon className="size-5 mb-1 opacity-90" />
                  <span className="text-xl font-bold tabular-nums sm:text-2xl">
                    {stat.value}
                  </span>
                  <span className="text-xs text-primary-foreground/70">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>

            <Button
              size="lg"
              onClick={() => scrollToForm()}
              className="mt-2 bg-primary-foreground text-primary hover:bg-primary-foreground/90 font-semibold"
            >
              Začni zdaj
              <ArrowRight className="size-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>

      {/* ====================== DELE 2 — PAKETI ====================== */}
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-14">
          <Badge variant="outline" className="mb-3">
            Cenovni paketi
          </Badge>
          <h3 className="text-2xl font-bold sm:text-3xl lg:text-4xl">
            Izberite paket, ki vam ustreza
          </h3>
          <p className="mt-3 text-muted-foreground">
            Brez skritih stroškov. Kadarkoli prekličete. Letno plačilo prihrani
            2 meseca.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch">
          {PRICING_PLANS.map((plan) => (
            <PricingCard
              key={plan.id}
              plan={plan}
              onSelect={() => scrollToForm(plan.id)}
            />
          ))}
        </div>
      </div>

      {/* ====================== DELE 3 — FORMA ====================== */}
      <div className="bg-muted/30 border-y border-border">
        <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-20 lg:py-24">
          <div ref={formRef} className="scroll-mt-24">
            {submitted ? (
              <Card className="border-primary/40">
                <CardContent className="pt-8 pb-8 px-6 text-center flex flex-col items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-full bg-primary/10">
                    <PartyPopper className="size-7 text-primary" />
                  </div>
                  <h3 className="text-2xl font-bold">Hvala!</h3>
                  <p className="text-muted-foreground max-w-md">
                    Vaša prijava je uspešno prejeta. Kontaktirali vas bomo v 24
                    urah.
                  </p>
                  <Button
                    variant="outline"
                    onClick={handleReset}
                    className="mt-2"
                  >
                    Pošlji še eno prijavo
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2 flex size-12 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="size-6 text-primary" />
                  </div>
                  <CardTitle className="text-2xl sm:text-3xl">
                    Prijavi svoj lokal
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-1">
                    Izpolni spodnji obrazec in kontaktirali te bomo v 24 urah.
                  </p>
                </CardHeader>
                <CardContent>
                  {errorMsg && (
                    <Alert variant="destructive" className="mb-6">
                      <AlertCircle className="size-4" />
                      <AlertTitle>Napaka</AlertTitle>
                      <AlertDescription>{errorMsg}</AlertDescription>
                    </Alert>
                  )}

                  <form onSubmit={handleSubmit} className="space-y-5">
                    {/* Ime in priimek */}
                    <div className="space-y-2">
                      <Label htmlFor="name">
                        Ime in priimek <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="name"
                        autoComplete="name"
                        placeholder="Janez Novak"
                        value={form.name}
                        onChange={(e) => update("name", e.target.value)}
                        disabled={loading}
                        required
                      />
                    </div>

                    {/* Email + Telefon */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="email">
                          E-pošta <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            id="email"
                            type="email"
                            inputMode="email"
                            autoComplete="email"
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
                        <Label htmlFor="phone">Telefon</Label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            id="phone"
                            type="tel"
                            inputMode="tel"
                            autoComplete="tel"
                            className="pl-9"
                            placeholder="+386 31 234 567"
                            value={form.phone}
                            onChange={(e) => update("phone", e.target.value)}
                            disabled={loading}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Ime lokala */}
                    <div className="space-y-2">
                      <Label htmlFor="businessName">
                        Ime lokala/panožbe{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                      <div className="relative">
                        <Building2 className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <Input
                          id="businessName"
                          className="pl-9"
                          placeholder="Hotel Bled, Restavracija Pri Makcu, ..."
                          value={form.businessName}
                          onChange={(e) =>
                            update("businessName", e.target.value)
                          }
                          disabled={loading}
                          required
                        />
                      </div>
                    </div>

                    {/* Tip lokala + Kraj */}
                    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="businessType">
                          Tip lokala <span className="text-destructive">*</span>
                        </Label>
                        <Select
                          value={form.businessType}
                          onValueChange={(v) => update("businessType", v)}
                          disabled={loading}
                        >
                          <SelectTrigger id="businessType" className="w-full">
                            <SelectValue placeholder="Izberite tip" />
                          </SelectTrigger>
                          <SelectContent>
                            {BUSINESS_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="location">
                          Kraj <span className="text-destructive">*</span>
                        </Label>
                        <div className="relative">
                          <MapPin className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                          <Input
                            id="location"
                            className="pl-9"
                            placeholder="Bled, Ljubljana, Piran..."
                            value={form.location}
                            onChange={(e) => update("location", e.target.value)}
                            disabled={loading}
                            required
                          />
                        </div>
                      </div>
                    </div>

                    {/* Želen paket */}
                    <div className="space-y-2">
                      <Label htmlFor="plan">
                        Želen paket <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={form.plan}
                        onValueChange={(v) => update("plan", v)}
                        disabled={loading}
                      >
                        <SelectTrigger id="plan" className="w-full">
                          <SelectValue placeholder="Izberite paket" />
                        </SelectTrigger>
                        <SelectContent>
                          {PRICING_PLANS.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              {p.name}
                              {p.monthlyPrice > 0
                                ? ` — €${p.monthlyPrice}/mes`
                                : " — brezplačno"}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Sporočilo */}
                    <div className="space-y-2">
                      <Label htmlFor="message">Sporočilo (neobvezno)</Label>
                      <div className="relative">
                        <MessageSquare className="absolute left-3 top-3 size-4 text-muted-foreground pointer-events-none" />
                        <Textarea
                          id="message"
                          rows={4}
                          className="pl-9 resize-y"
                          placeholder="Povejte nam več o svojem lokalu, kaj bi radi poudarili, posebne želje..."
                          value={form.message}
                          onChange={(e) => update("message", e.target.value)}
                          disabled={loading}
                        />
                      </div>
                    </div>

                    {/* GDPR */}
                    <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4">
                      <Checkbox
                        id="gdpr"
                        checked={form.gdprConsent}
                        onCheckedChange={(v) =>
                          update("gdprConsent", v === true)
                        }
                        disabled={loading}
                        className="mt-0.5"
                      />
                      <Label
                        htmlFor="gdpr"
                        className="text-sm leading-relaxed font-normal cursor-pointer"
                      >
                        Strinjam se s predelavo mojih podatkov za namen
                        kontakta.{" "}
                        <span className="text-destructive">*</span>
                      </Label>
                    </div>

                    {/* Submit */}
                    <Button
                      type="submit"
                      size="lg"
                      disabled={loading}
                      className="w-full bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    >
                      {loading ? (
                        <>
                          <Loader2 className="size-4 mr-2 animate-spin" />
                          Pošiljam...
                        </>
                      ) : (
                        <>
                          <Sparkles className="size-4 mr-2" />
                          Pošlji prijavo
                        </>
                      )}
                    </Button>

                    <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
                      <ShieldCheck className="size-3.5" />
                      Vaši podatki so varni in se uporabljajo izključno za
                      kontakt.
                    </p>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface PricingCardProps {
  plan: PricingPlan;
  onSelect: () => void;
}

function PricingCard({ plan, onSelect }: PricingCardProps) {
  const isHighlighted = plan.highlighted;

  return (
    <div
      className={cn(
        "relative flex",
        isHighlighted && "md:-mt-2 md:mb-2"
      )}
    >
      <Card
        className={cn(
          "w-full flex flex-col",
          isHighlighted
            ? "border-primary border-2 shadow-lg ring-1 ring-primary/20 md:scale-105 z-10"
            : "border-border"
        )}
      >
        {isHighlighted && plan.badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 shadow-md border-0 font-semibold">
              <Star className="size-3 mr-1 fill-amber-950" />
              {plan.badge}
            </Badge>
          </div>
        )}

        <CardHeader className={cn(isHighlighted && "pt-7")}>
          <div className="flex items-baseline justify-between">
            <CardTitle className="text-xl">{plan.name}</CardTitle>
            {plan.monthlyPrice === 0 ? (
              <span className="text-2xl font-bold text-muted-foreground">
                Brezplačno
              </span>
            ) : null}
          </div>

          <div className="mt-1">
            {plan.monthlyPrice > 0 ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-4xl font-bold tabular-nums">
                    €{plan.monthlyPrice}
                  </span>
                  <span className="text-sm text-muted-foreground">/mes</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  ali €{plan.yearlyPrice}/leto (2 meseca brezplačno)
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                za vedno brezplačno
              </p>
            )}
          </div>

          <p className="text-sm text-muted-foreground mt-2">{plan.tagline}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-6 flex-1">
          <ul className="space-y-2.5 flex-1">
            {plan.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-sm">
                <Check
                  className={cn(
                    "size-4 mt-0.5 shrink-0",
                    isHighlighted ? "text-primary" : "text-primary"
                  )}
                />
                <span className="leading-relaxed">{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            onClick={onSelect}
            disabled={false}
            variant={isHighlighted ? "default" : "outline"}
            className={cn(
              "w-full font-semibold",
              isHighlighted
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "hover:bg-accent hover:text-accent-foreground"
            )}
          >
            {plan.cta}
            <ArrowRight className="size-4 ml-1" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default JoinUs;
