"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  Bot,
  Check,
  CreditCard,
  Database,
  ExternalLink,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  Sparkles,
  Star,
  Users,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DESTINATIONS } from "@/lib/slovenia-data";
import { trackFunnel } from "@/lib/funnel";
import {
  CONSULTATION_BUDGETS,
  CONSULTATION_DATES_MAX,
  CONSULTATION_INTERESTS,
  CONSULTATION_INTERESTS_MAX,
  CONSULTATION_NAME_MAX,
  CONSULTATION_PACKAGES,
  CONSULTATION_PARTY_MAX,
  CONSULTATION_QUESTION_MAX,
  CONSULTATION_QUESTION_MIN,
  formatEur,
  type ConsultationPackage,
} from "@/lib/consultations";

// ============================================================================
// CONSULTATION DIALOG — čarovnik za plačljivo osebno konzultacijo (Faza 3b-2)
// ============================================================================
// Koraki: forma (podrobnosti potovanja + globje vprašanje) → [plačilo
// paketa, ČE kreditov ni] → generiranje (AI) → rezultat z zasebno povezavo.
//
// Iskrenost (princip platforme):
//  - demo plačilo je VIDNO označeno (v produkciji Stripe; nič se ne zaračuna),
//  - odgovor nosi badge Grounded AI / izključno iz baze,
//  - EU transparentnost: ★ = premium partner (prednost pri enakovrednih).
//
// Krediti so vezani na E-POŠTO — ista e-pošta v drugem brskalniku vidi
// svoje kredite (GET ?email= ob vsaki spremembi e-pošte v formi).
// ============================================================================

const ALL_VALUE = "all";

/** Partner, citiran v odgovoru (isti format kot ask-local). */
interface RecommendedPartner {
  name: string;
  kind: string;
  category: string | null;
  destinationName: string | null;
  plan: string | null;
}

interface ConsultationResult {
  id: string;
  accessToken: string;
  question: string;
  destinationName: string | null;
  answer: string;
  answerSource: string;
  recommendedPartners: RecommendedPartner[] | null;
  deliveredAt: string;
}

interface SubmitResponse {
  success?: boolean;
  consultation?: ConsultationResult;
  creditsRemaining?: number;
  error?: string;
  code?: string;
}

interface OrderResponse {
  success?: boolean;
  credits?: number;
  error?: string;
}

export type ConsultationDialogStep = "form" | "pay" | "generating" | "result";

interface ConsultationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Destinacija iz konteksta (npr. iz opravljenega brezplačnega vprašanja). */
  prefillDestination?: string | null;
  /** Besedilo iz konteksta (npr. brezplačno vprašanje, ki ga razširimo v globje). */
  prefillQuestion?: string | null;
}

const KIND_LABEL: Record<string, string> = {
  lokal: "Lokal",
  izkušnja: "Izkušnja",
  izdelek: "Izdelek",
  dogodek: "Dogodek",
};

function partnerUrl(partner: RecommendedPartner): string {
  if (partner.destinationName) {
    const dest = DESTINATIONS.find((d) => d.name === partner.destinationName);
    if (dest) return `/destinacija/${dest.slug}/things-to-do`;
  }
  return "/";
}

function isPremium(partner: RecommendedPartner): boolean {
  return partner.plan === "premium" || partner.plan === "enterprise";
}

export function ConsultationDialog({
  open,
  onOpenChange,
  prefillDestination,
  prefillQuestion,
}: ConsultationDialogProps) {
  const uid = useId();

  // Čarovnik
  const [step, setStep] = useState<ConsultationDialogStep>("form");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Forma
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState<string>(
    prefillDestination ?? ALL_VALUE
  );
  const [travelDates, setTravelDates] = useState("");
  const [partyDescription, setPartyDescription] = useState("");
  const [budget, setBudget] = useState<string>("none");
  const [interests, setInterests] = useState<string[]>([]);
  const [question, setQuestion] = useState("");

  // Krediti za trenutno e-pošto (honest prikaz v formi)
  const [knownCredits, setKnownCredits] = useState<number | null>(null);

  // Rezultat
  const [result, setResult] = useState<ConsultationResult | null>(null);
  const [creditsLeft, setCreditsLeft] = useState<number | null>(null);

  // Izbrani paket (plačilni korak)
  const [packageKey, setPackageKey] = useState<ConsultationPackage["key"]>(
    "single"
  );

  // Prefill ob vsakem odprtju (iz konteksta: destinacija + vprašanje)
  useEffect(() => {
    if (open) {
      setStep("form");
      setError(null);
      setResult(null);
      setCreditsLeft(null);
      setBusy(false);
      if (prefillDestination) setDestination(prefillDestination);
      if (prefillQuestion) setQuestion(prefillQuestion);
    }
  }, [open, prefillDestination, prefillQuestion]);

  // Preveri kredite, ko uporabnik vpisuje e-pošto (debounce 600 ms)
  useEffect(() => {
    const trimmed = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) {
      setKnownCredits(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/consultations?email=${encodeURIComponent(trimmed)}`,
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data: { credits?: number } = await res.json();
        setKnownCredits(data.credits ?? 0);
      } catch {
        // tiho — prikaz kreditov je "nice to have"
      }
    }, 600);
    return () => clearTimeout(t);
  }, [email]);

  const toggleInterest = (value: string) => {
    setInterests((prev) =>
      prev.includes(value)
        ? prev.filter((i) => i !== value)
        : prev.length >= CONSULTATION_INTERESTS_MAX
          ? prev
          : [...prev, value]
    );
  };

  /** Client validacija — zrcali strežnik. */
  const validateForm = (): string | null => {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())) {
      return "Vpiši veljaven e-poštni naslov — nanj je vezan paket konzultacij.";
    }
    const q = question.trim();
    if (q.length < CONSULTATION_QUESTION_MIN) {
      return `Vprašanje naj ima vsaj ${CONSULTATION_QUESTION_MIN} znakov — globja vprašanja dajo globje odgovore.`;
    }
    return null;
  };

  /** Pošlji konzultacijo; 402 → plačilni korak, uspeh → rezultat. */
  const submitConsultation = async () => {
    setBusy(true);
    setError(null);
    trackFunnel("consultation_submit");
    try {
      const res = await fetch("/api/consultations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          question: question.trim(),
          ...(destination !== ALL_VALUE ? { destinationName: destination } : {}),
          ...(travelDates.trim() ? { travelDates: travelDates.trim() } : {}),
          ...(partyDescription.trim()
            ? { partyDescription: partyDescription.trim() }
            : {}),
          ...(budget !== "none" ? { budget } : {}),
          interests,
        }),
      });
      const data: SubmitResponse = await res.json().catch(() => ({}));

      if (res.status === 402 || data.code === "no_credit") {
        // Ni kreditov → plačilni korak (demo checkout)
        setStep("pay");
        return;
      }
      if (!res.ok || !data.success || !data.consultation) {
        setError(data.error ?? "Konzultacije ni bilo mogoče poslati");
        setStep("form");
        return;
      }

      setResult(data.consultation);
      setCreditsLeft(data.creditsRemaining ?? 0);
      trackFunnel("consultation_delivered");
      setStep("result");
    } catch {
      setError("Povezava je prekinjena — poskusi znova");
      setStep("form");
    } finally {
      setBusy(false);
    }
  };

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const localError = validateForm();
    if (localError) {
      setError(localError);
      return;
    }
    setError(null);
    setStep("generating");
    await submitConsultation();
  };

  /** Demo plačilo izbranega paketa → samodejno nadaljuj v generiranje. */
  const handlePay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/consultations/order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          ...(name.trim() ? { name: name.trim() } : {}),
          packageKey,
        }),
      });
      const data: OrderResponse = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        setError(data.error ?? "Nakupa ni bilo mogoče zaključiti");
        return;
      }
      setKnownCredits(data.credits ?? null);
      // Plačilo uspešno → takoj oddaj konzultacijo (kredit je zagotovljen)
      setStep("generating");
      await submitConsultation();
    } catch {
      setError("Povezava je prekinjena — poskusi znova");
    } finally {
      setBusy(false);
    }
  };

  const handleResetToForm = () => {
    setStep("form");
    setResult(null);
    setError(null);
    setQuestion("");
    setTravelDates("");
    setPartyDescription("");
    setInterests([]);
    setBudget("none");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] gap-0 overflow-y-auto scroll-area-custom p-0 sm:max-w-2xl">
        {/* Glava */}
        <DialogHeader className="border-b border-border/70 px-4 pt-5 pb-4 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            <MessageCircle className="size-5 text-primary" aria-hidden="true" />
            Osebna konzultacija z lokalcem
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            {step === "form" || step === "generating"
              ? "Globok, oseben načrt za tvoje potovanje — datumi, proračun in druščina upoštevani."
              : step === "pay"
                ? "Izberi paket in takoj pridobi odgovor."
                : "Tvoj osebni načrt je pripravljen."}
          </DialogDescription>
        </DialogHeader>

        <div className="px-4 py-4 sm:px-6 sm:py-5">
          {/* === KORAK: FORMA === */}
          {step === "form" ? (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {/* E-pošta + ime */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-email`}>
                    E-pošta <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id={`${uid}-email`}
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                    placeholder="npr. ana@example.com"
                    required
                    aria-describedby={`${uid}-email-hint`}
                  />
                  <p
                    id={`${uid}-email-hint`}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground"
                  >
                    <Mail className="size-3 shrink-0" aria-hidden="true" />
                    Nanj so vezani kupljeni konzultacije.
                    {knownCredits != null && knownCredits > 0 ? (
                      <span className="ml-1 font-medium text-emerald-700 dark:text-emerald-400">
                        Na voljo: {knownCredits}
                        {knownCredits === 1 ? " konzultacija" : " konzultacije"}
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-name`}>Tvoje ime (neobvezno)</Label>
                  <Input
                    id={`${uid}-name`}
                    type="text"
                    autoComplete="name"
                    maxLength={CONSULTATION_NAME_MAX}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    disabled={busy}
                    placeholder="npr. Ana"
                  />
                </div>
              </div>

              {/* Destinacija + datumi */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-dest`}>Destinacija (neobvezno)</Label>
                  <Select
                    value={destination}
                    onValueChange={setDestination}
                    disabled={busy}
                  >
                    <SelectTrigger id={`${uid}-dest`} className="w-full">
                      <SelectValue placeholder="Vsa Slovenija" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>Vsa Slovenija</SelectItem>
                      {DESTINATIONS.map((d) => (
                        <SelectItem key={d.id} value={d.name}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-dates`}>Datumi (neobvezno)</Label>
                  <Input
                    id={`${uid}-dates`}
                    type="text"
                    maxLength={CONSULTATION_DATES_MAX}
                    value={travelDates}
                    onChange={(e) => setTravelDates(e.target.value)}
                    disabled={busy}
                    placeholder="npr. 12.–19. julij 2026"
                  />
                </div>
              </div>

              {/* Druščina + proračun */}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-party`}>Kdo potuje? (neobvezno)</Label>
                  <Input
                    id={`${uid}-party`}
                    type="text"
                    maxLength={CONSULTATION_PARTY_MAX}
                    value={partyDescription}
                    onChange={(e) => setPartyDescription(e.target.value)}
                    disabled={busy}
                    placeholder="npr. 2 odrasla + otroka (4 in 7)"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor={`${uid}-budget`}>
                    Proračun skupaj (neobvezno)
                  </Label>
                  <Select
                    value={budget}
                    onValueChange={setBudget}
                    disabled={busy}
                  >
                    <SelectTrigger id={`${uid}-budget`} className="w-full">
                      <SelectValue placeholder="Brez omejitve" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Brez omejitve</SelectItem>
                      {CONSULTATION_BUDGETS.map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Interesi */}
              <div className="space-y-1.5">
                <Label>Zanimanja (neobvezno, do {CONSULTATION_INTERESTS_MAX})</Label>
                <div className="flex flex-wrap gap-2">
                  {CONSULTATION_INTERESTS.map((i) => {
                    const active = interests.includes(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => toggleInterest(i)}
                        aria-pressed={active}
                        disabled={busy}
                        className={`min-h-9 rounded-full border px-3 py-1 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                          active
                            ? "border-emerald-600/60 bg-emerald-100 text-emerald-900 dark:border-emerald-500/50 dark:bg-emerald-900/40 dark:text-emerald-200"
                            : "border-border/70 bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
                        }`}
                      >
                        {i}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Globje vprašanje */}
              <div className="space-y-1.5">
                <Label htmlFor={`${uid}-question`}>
                  Tvoje vprašanje <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id={`${uid}-question`}
                  rows={5}
                  maxLength={CONSULTATION_QUESTION_MAX}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  disabled={busy}
                  placeholder="npr. Z družino 5 dni na Bledu julija — dva dni kolesarsko in enega za deževni dan; proračun okoli 600 €. Kam hodimo jesti, kaj rezervirati vnaprej in kje parkirati brez vrste?"
                  aria-describedby={`${uid}-question-hint`}
                />
                <p
                  id={`${uid}-question-hint`}
                  className="text-[11px] text-muted-foreground"
                >
                  {CONSULTATION_QUESTION_MIN}–{CONSULTATION_QUESTION_MAX} znakov
                  ({question.trim().length}) — več podrobnosti, globji osebni načrt.
                </p>
              </div>

              {/* Napaka */}
              {error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <Button
                  type="submit"
                  disabled={busy}
                  className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Sparkles className="size-4" aria-hidden="true" />
                  )}
                  {knownCredits != null && knownCredits > 0
                    ? "Pridobi odgovor (1 konzultacija)"
                    : "Nadaljuj — 9,90 €"}
                </Button>
                <p className="text-xs text-muted-foreground sm:ml-2">
                  Odgovor pripravi AI lokalnež izključno iz baze realnih
                  destinacij in partnerjev.
                </p>
              </div>
            </form>
          ) : null}

          {/* === KORAK: GENERIRANJE === */}
          {step === "generating" ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center" aria-live="polite">
              <Loader2 className="size-8 animate-spin text-primary" aria-hidden="true" />
              <p className="text-base font-semibold">
                Lokal pripravlja tvoj osebni načrt …
              </p>
              <p className="max-w-sm text-sm text-muted-foreground">
                Grounded AI prebira bazo destinacij, lokalov, izkušenj in
                dogodkov ter jih prilagaja tvojim datumom, proračunu in
                druščini. Običajno 10–30 sekund.
              </p>
            </div>
          ) : null}

          {/* === KORAK: PLAČILO === */}
          {step === "pay" ? (
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/40 dark:text-amber-200">
                <p className="flex items-start gap-2">
                  <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>
                    <strong>Demo način plačila:</strong> zaračunavanje še ni
                    aktivirano — naročilo in konzultacija se zapišejo povsem
                    realno, denar pa se ne dviga. V produkciji poteka plačilo
                    varno prek Stripe.
                  </span>
                </p>
              </div>

              <div className="space-y-3">
                {CONSULTATION_PACKAGES.map((p) => {
                  const selected = packageKey === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPackageKey(p.key)}
                      aria-pressed={selected}
                      className={`block w-full rounded-xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                        selected
                          ? "border-emerald-600/60 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-950/30"
                          : "border-border/70 hover:border-border"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`flex size-5 items-center justify-center rounded-full border ${
                              selected
                                ? "border-emerald-600 bg-emerald-600 text-white"
                                : "border-border"
                            }`}
                            aria-hidden="true"
                          >
                            {selected ? <Check className="size-3.5" /> : null}
                          </span>
                          <span className="text-sm font-semibold">{p.name}</span>
                        </div>
                        <span className="text-lg font-bold">{formatEur(p.priceEur)}</span>
                      </div>
                      <p className="mt-1.5 pl-8 text-xs text-muted-foreground">
                        {p.description}
                      </p>
                    </button>
                  );
                })}
              </div>

              {error ? (
                <p
                  role="alert"
                  className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  {error}
                </p>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep("form")}
                  disabled={busy}
                  className="min-h-11 gap-2"
                >
                  <ArrowLeft className="size-4" aria-hidden="true" />
                  Nazaj na vprašanje
                </Button>
                <Button
                  type="button"
                  onClick={handlePay}
                  disabled={busy}
                  className="min-h-11 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <CreditCard className="size-4" aria-hidden="true" />
                  )}
                  {busy
                    ? "Obdelava …"
                    : `Plačaj ${formatEur(
                        CONSULTATION_PACKAGES.find((p) => p.key === packageKey)
                          ?.priceEur ?? 0
                      )} (demo) in pridobi odgovor`}
                </Button>
              </div>
            </div>
          ) : null}

          {/* === KORAK: REZULTAT === */}
          {step === "result" && result ? (
            <ConsultationResultView
              result={result}
              creditsLeft={creditsLeft}
              onReset={handleResetToForm}
            />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// REZULTAT — osebni načrt z zasebno povezavo
// ============================================================================

function ConsultationResultView({
  result,
  creditsLeft,
  onReset,
}: {
  result: ConsultationResult;
  creditsLeft: number | null;
  onReset: () => void;
}) {
  const isFallback = result.answerSource === "fallback";
  const partners = result.recommendedPartners ?? [];

  return (
    <div className="space-y-4">
      {/* Vprašanje (kontekst) */}
      <div className="rounded-lg bg-muted/50 p-3 sm:p-4">
        <p className="text-sm font-semibold leading-relaxed">
          „{result.question}“
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {result.destinationName ?? "Vsa Slovenija"}
        </p>
      </div>

      {/* Odgovor */}
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
        >
          <Bot className="size-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold">AI lokalnež</span>
            {isFallback ? (
              <Badge
                variant="outline"
                className="border-amber-300/60 text-amber-800 dark:border-amber-700/60 dark:text-amber-300"
              >
                <Database className="size-3" aria-hidden="true" />
                Brez povezave z AI — izključno iz baze
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="border-emerald-300/60 text-emerald-800 dark:border-emerald-700/60 dark:text-emerald-300"
              >
                <Sparkles className="size-3" aria-hidden="true" />
                Grounded AI
              </Badge>
            )}
          </div>
          <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground/90">
            {result.answer}
          </p>

          {/* Priporočeni partnerji — klikabilni čipi */}
          {partners.length > 0 ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Priporočeni partnerji
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {partners.map((p) => {
                  const premium = isPremium(p);
                  return (
                    <Link
                      key={`${result.id}-chip-${p.name}`}
                      href={partnerUrl(p)}
                      title={premium ? "Premium partner" : undefined}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${p.name} — ${KIND_LABEL[p.kind] ?? p.kind}${premium ? " (premium partner)" : ""}`}
                    >
                      {premium ? (
                        <Star
                          className="size-3.5 fill-emerald-500 text-emerald-500"
                          aria-hidden="true"
                        />
                      ) : null}
                      <span>{p.name}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                        {KIND_LABEL[p.kind] ?? p.kind}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="mt-2.5 text-xs text-muted-foreground">
                Oznaka ★ označuje premium partnerje — med enakovrednimi
                možnostmi imajo rahlo prednost. Vsa priporočila so realni,
                ocenjeni lokali in izkušnje iz naše baze.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      {/* Zasebna povezava + stanje kreditov */}
      <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5 font-medium text-foreground/80">
          <BadgeCheck className="size-3.5 text-emerald-600" aria-hidden="true" />
          Zasebna povezava — odgovor vidiš samo ti
        </p>
        <p className="mt-1">
          Shrani si povezavo <span className="font-mono text-[11px]">/konzultacija/{result.accessToken}</span>{" "}
          — do odgovora se vrneš kadarkoli.
          {creditsLeft != null && creditsLeft > 0
            ? ` Preostale konzultacije na tvoji e-pošti: ${creditsLeft}.`
            : null}
        </p>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="button" variant="outline" asChild className="min-h-11 gap-2">
          <Link href={`/konzultacija/${result.accessToken}`} target="_blank" rel="noopener">
            <ExternalLink className="size-4" aria-hidden="true" />
            Odpri zasebno povezavo
          </Link>
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onReset}
          className="min-h-11 gap-2"
        >
          <Users className="size-4" aria-hidden="true" />
          Novo vprašanje
        </Button>
      </div>
    </div>
  );
}

export default ConsultationDialog;
