"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ImagePlus,
  Loader2,
  Plus,
  Send,
  Sparkles,
  Tag,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CATEGORY_LABELS,
  type Listing,
  type ListingCategory,
} from "@/lib/listings-types";
import {
  calculateProfileCompletion,
  canSubmitForReview,
} from "@/lib/profile-completion";

// ============================================================================
// ONBOARDING ČAROVNIK (P2-1) — Booking.com-style vodenje novih ponudnikov
// ============================================================================
// Prikaže se nad seznamom lokalov (zavihek "listings") kadar:
//  - owner ima 0 lokalov → korak 1 ustvari osnutek (POST /api/owner/listings),
//  - owner ima lokal s statusom "draft" IN manjkajočimi OBAVEZNIMI polji
//    (glej src/lib/profile-completion.ts) → ponudi dopolnjevanje osnutka.
// Skritje z gumbom "Pozneje" → localStorage flag
// `dai:onboarding-dismissed:<listingId>` (za 0 lokalov: `...:new`),
// ki se pobriše ob uspešnem zaključku čarovnika.

const DISMISS_PREFIX = "dai:onboarding-dismissed:";

// Začasni opis za POST createSchema (zahteva ≥ 10 znakov) — namerno < 20
// znakov, da profilna popolnost opis šteje kot MANJKAJOČ in čarovnik
// nepopoln osnutek naslednjič ponovno ponudi.
const PLACEHOLDER_DESCRIPTION = "Začasni opis.";

const WIZARD_STEPS = [
  { n: 1, title: "Osnovni podatki" },
  { n: 2, title: "Opisi" },
  { n: 3, title: "Fotografije" },
  { n: 4, title: "Dodatno" },
  { n: 5, title: "Oddaja" },
] as const;

interface WizardForm {
  name: string;
  category: ListingCategory;
  destinationId: string;
  address: string;
  phone: string;
  description: string;
  longDescription: string;
  images: string[];
  website: string;
  openingHours: string;
  priceRange: "€" | "€€" | "€€€";
  specialties: string[];
}

const EMPTY_FORM: WizardForm = {
  name: "",
  category: "restaurant",
  destinationId: "",
  address: "",
  phone: "",
  description: "",
  longDescription: "",
  images: [],
  website: "",
  openingHours: "",
  priceRange: "€",
  specialties: [],
};

interface OnboardingWizardProps {
  listings: Listing[];
  loading?: boolean;
  /** Refresh parent liste lokalov (dashboard: fetchListings) */
  onChanged?: () => void;
}

// Vhod za calculateProfileCompletion / canSubmitForReview — prisma oblika
// pričakuje images/specialties kot JSON niz, dashboard Listing pa kot array
// (datumskih polj ne kopiramo: API vrača ISO nize, prisma tip pa Date).
type CompletionInput = Parameters<typeof calculateProfileCompletion>[0];

function toCompletionInput(l: Listing): CompletionInput {
  return {
    name: l.name,
    description: l.description,
    longDescription: l.longDescription ?? null,
    category: l.category,
    destinationId: l.destinationId ?? null,
    address: l.address,
    phone: l.phone ?? null,
    email: l.email ?? null,
    website: l.website ?? null,
    images: JSON.stringify(l.images ?? []),
    openingHours: l.openingHours ?? null,
    priceRange: l.priceRange,
    specialties: JSON.stringify(l.specialties ?? []),
  };
}

function prefillFrom(l: Listing): WizardForm {
  return {
    name: l.name ?? "",
    category: l.category ?? "other",
    destinationId: l.destinationId ?? "",
    address: l.address ?? "",
    phone: l.phone ?? "",
    // Začasni opis iz 1. koraka čarovnika prikažemo kot prazno polje
    description:
      l.description === PLACEHOLDER_DESCRIPTION ? "" : (l.description ?? ""),
    longDescription: l.longDescription ?? "",
    images: l.images ?? [],
    website: l.website ?? "",
    openingHours: l.openingHours ?? "",
    priceRange: (l.priceRange as WizardForm["priceRange"]) || "€",
    specialties: l.specialties ?? [],
  };
}

// Začni pri prvem koraku z manjkajočimi obveznimi podatki (kjer je uporabnik ostal)
function initialStepFor(target: Listing | null): number {
  if (!target) return 1;
  const missingRequired = new Set(
    canSubmitForReview(toCompletionInput(target)).missingRequired.map(
      (f) => f.key
    )
  );
  if (
    missingRequired.has("name") ||
    missingRequired.has("category") ||
    missingRequired.has("destinationId") ||
    missingRequired.has("address") ||
    missingRequired.has("phone")
  ) {
    return 1;
  }
  if (
    missingRequired.has("description") ||
    missingRequired.has("longDescription")
  ) {
    return 2;
  }
  if (missingRequired.has("images")) return 3;
  return 5; // vsa obvezna polja so že na voljo → samo še oddaja
}

// Validacija pred naslednjim korakom (samo obvezna polja)
function validateStep(step: number, form: WizardForm): string | null {
  switch (step) {
    case 1:
      if (form.name.trim().length < 2)
        return "Vnesite ime lokalca (vsaj 2 znaka).";
      if (!form.category) return "Izberite kategorijo.";
      if (!form.destinationId) return "Izberite destinacijo.";
      if (form.address.trim().length < 3)
        return "Vnesite naslov lokalca (vsaj 3 znaki).";
      if (!form.phone.trim()) return "Vnesite telefonsko številko.";
      return null;
    case 2:
      if (form.description.trim().length < 20)
        return "Kratek opis mora imeti vsaj 20 znakov.";
      if (form.longDescription.trim().length < 100)
        return "Dolgi opis mora imeti vsaj 100 znakov.";
      return null;
    case 3:
      if (form.images.length < 3)
        return "Dodajte vsaj 3 fotografije (URL-ji slik).";
      return null;
    default:
      return null;
  }
}

// Partial PUT payload za posamezen korak (updateSchema dovoljuje opcija)
function buildStepPayload(
  step: number,
  form: WizardForm
): Record<string, unknown> {
  switch (step) {
    case 1:
      return {
        name: form.name.trim(),
        category: form.category,
        destinationId: form.destinationId || null,
        address: form.address.trim(),
        phone: form.phone.trim() || null,
      };
    case 2:
      return {
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || null,
      };
    case 3:
      return { images: form.images };
    case 4:
      return {
        website: form.website.trim() || null,
        openingHours: form.openingHours.trim() || null,
        priceRange: form.priceRange,
        specialties: form.specialties,
      };
    default:
      return {};
  }
}

export function OnboardingWizard({
  listings,
  loading = false,
  onChanged,
}: OnboardingWizardProps) {
  const { toast } = useToast();

  const [mounted, setMounted] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [initializedFor, setInitializedFor] = useState<string | null>(null);
  const [form, setForm] = useState<WizardForm>(EMPTY_FORM);
  const [imageInput, setImageInput] = useState("");
  const [specialtyInput, setSpecialtyInput] = useState("");

  // --- Zaznavanje osnutka, ki ga čarovnik lahko dopolni ---
  // (draft + manjkajoča OBAVEZNA polja; pending/published/rejected z
  // izpolnjenimi obveznimi polji ne sprožijo čarovnika)
  const draftListing = useMemo(
    () =>
      listings.find(
        (l) =>
          l.status === "draft" &&
          !canSubmitForReview(toCompletionInput(l)).canSubmit
      ),
    [listings]
  );

  const isCreateMode = listings.length === 0;
  const active = isCreateMode || draftListing !== undefined;
  const dismissKey = isCreateMode ? "new" : (draftListing?.id ?? null);
  const listingId = draftListing?.id ?? createdId;

  // SSR/hidration varnost — odločitev o prikazu je odvisna od localStorage
  useEffect(() => {
    setMounted(true);
  }, []);

  // Preberi dismissal flag ob spremembi tarče (new ↔ listingId)
  useEffect(() => {
    if (!mounted || !dismissKey) return;
    try {
      setDismissed(
        localStorage.getItem(DISMISS_PREFIX + dismissKey) !== null
      );
    } catch {
      setDismissed(false);
    }
  }, [mounted, dismissKey]);

  // Nastavi formo ob PRVEM prikazu čarovnika za dano tarčo
  // (poznejše osvežitve seznama NE smejo pobrisati uporabnikovega vnosa)
  useEffect(() => {
    if (!mounted || !active) return;
    const key = isCreateMode ? "new" : draftListing!.id;
    if (initializedFor === key) return;
    setInitializedFor(key);
    setForm(draftListing ? prefillFrom(draftListing) : { ...EMPTY_FORM });
    setStep(initialStepFor(draftListing ?? null));
    setImageInput("");
    setSpecialtyInput("");
  }, [mounted, active, isCreateMode, draftListing, initializedFor]);

  // Živa popolnost profila iz stanja forme (email dedujemo iz osnutka)
  const completion = useMemo(
    () =>
      calculateProfileCompletion({
        name: form.name,
        description: form.description,
        longDescription: form.longDescription,
        category: form.category,
        destinationId: form.destinationId || null,
        address: form.address,
        phone: form.phone || null,
        email: draftListing?.email ?? null,
        website: form.website || null,
        images: JSON.stringify(form.images),
        openingHours: form.openingHours || null,
        priceRange: form.priceRange,
        specialties: JSON.stringify(form.specialties),
      }),
    [form, draftListing]
  );

  const update = <K extends keyof WizardForm>(
    key: K,
    value: WizardForm[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  // --- Fotografije (vzor iz listing-form) ---
  const handleAddImage = () => {
    const url = imageInput.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast({
        variant: "destructive",
        title: "Neveljaven URL slike",
        description: "Slika mora biti veljaven URL (http:// ali https://).",
      });
      return;
    }
    if (form.images.includes(url)) {
      toast({
        variant: "destructive",
        title: "Slika je že dodana",
        description: "Ta slika je že na seznamu.",
      });
      return;
    }
    update("images", [...form.images, url]);
    setImageInput("");
  };

  const handleRemoveImage = (url: string) => {
    update(
      "images",
      form.images.filter((i) => i !== url)
    );
  };

  // --- Specialnosti (vzor iz listing-form) ---
  const handleAddSpecialty = () => {
    const s = specialtyInput.trim();
    if (!s) return;
    if (form.specialties.includes(s)) {
      toast({
        variant: "destructive",
        title: "Specialiteta je že dodana",
        description: "Ta specialiteta je že na seznamu.",
      });
      return;
    }
    update("specialties", [...form.specialties, s].slice(0, 10));
    setSpecialtyInput("");
  };

  const handleRemoveSpecialty = (s: string) => {
    update(
      "specialties",
      form.specialties.filter((x) => x !== s)
    );
  };

  // --- Naslednji korak: validacija → shranjevanje (POST/PUT) ---
  const handleNext = async () => {
    const validationError = validateStep(step, form);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Manjkajoči podatki",
        description: validationError,
      });
      return;
    }

    setSaving(true);
    try {
      if (step === 1 && !listingId) {
        // Ustvari osnutek z minimalnimi podatki (createSchema: opis ≥ 10 znakov)
        const res = await fetch("/api/owner/listings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            category: form.category,
            destinationId: form.destinationId || null,
            description: PLACEHOLDER_DESCRIPTION,
            longDescription: null,
            address: form.address.trim(),
            phone: form.phone.trim() || null,
            images: [],
            priceRange: "€",
            specialties: [],
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Ustvarjanje osnutka ni uspelo.");
        }
        setCreatedId(data.listing?.id ?? null);
        toast({
          title: "Osnutek ustvarjen!",
          description: "Nadaljujte z opisi in fotografijami.",
        });
      } else if (listingId && step < 5) {
        // Partial update — vsak korak shrani svoja polja
        const res = await fetch(`/api/owner/listings/${listingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(buildStepPayload(step, form)),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data?.error ?? "Shranjevanje ni uspelo.");
        }
      }
      setStep((s) => Math.min(s + 1, 5));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka pri shranjevanju",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setSaving(false);
    }
  };

  // Korak 4 je opcijsko — preskoči BREZ shranjevanja
  const handleSkip = () => {
    setStep((s) => Math.min(s + 1, 5));
  };

  const handleBack = () => {
    setStep((s) => Math.max(1, s - 1));
  };

  // --- Oddaja v pregled (draft → pending) ---
  const handleSubmitForReview = async () => {
    if (!listingId) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/owner/listings/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const missing = Array.isArray(data?.missingRequired)
          ? data.missingRequired.join(", ")
          : "";
        throw new Error(
          data?.error
            ? `${data.error}${missing ? `: ${missing}` : ""}`
            : "Oddaja ni uspela."
        );
      }
      // Čarovnik je uspešno zaključen → pobriši dismissal flag
      try {
        if (dismissKey) localStorage.removeItem(DISMISS_PREFIX + dismissKey);
      } catch {
        /* ignore */
      }
      setSubmitted(true);
      // Osveži parent seznam (status → pending)
      onChanged?.();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Oddaja ni uspela",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // --- Skritje čarovnika ("Pozneje") ---
  const handleDismiss = () => {
    try {
      if (dismissKey) localStorage.setItem(DISMISS_PREFIX + dismissKey, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
    // Če je bil osnutek že ustvarjen v 1. koraku, ga osveži v seznamu
    if (listingId) onChanged?.();
  };

  // ---- RENDER ----

  // Uspešno oddan — success state ostane viden tudi med refreshom liste
  if (submitted) {
    return (
      <Card
        className="border-primary/40 bg-primary/5"
        role="status"
        aria-label="Lokal oddan v pregled"
      >
        <CardContent className="flex flex-col items-center justify-center gap-4 py-10 text-center">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-7" aria-hidden="true" />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-lg font-bold">
              Čestitamo! Lokal je oddan v pregled
            </h3>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              Admin ga bo pregledal v 24–48 urah. Po odobritvi ga bodo
              obiskovalci odkrili na portalu.
            </p>
          </div>
          <Button
            onClick={() => setSubmitted(false)}
            className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
          >
            Zaključi
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Med nalaganjem / pred hidration odločitev ni mogoča
  if (loading || !mounted) return null;
  if (!active || dismissed || !dismissKey) return null;

  const stepDone = (n: number) => n < step;

  return (
    <Card
      className="border-primary/30 shadow-sm"
      role="region"
      aria-label="Onboarding čarovnik za ponudnike"
    >
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base sm:text-lg leading-tight">
                {isCreateMode
                  ? "Ustvarite svoj prvi lokal"
                  : `Dopolnite osnutek: ${draftListing?.name}`}
              </CardTitle>
              <CardDescription className="mt-1 text-xs sm:text-sm">
                {isCreateMode
                  ? "V petih kratkih korakih do oddaje v pregled — tako vas bodo obiskovalci odkrili."
                  : "Nekaj obveznih podatkov še manjka, da lahko lokal oddate v pregled."}
              </CardDescription>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDismiss}
            disabled={saving || submitting}
            className="text-muted-foreground shrink-0 hover:text-foreground"
          >
            Pozneje
          </Button>
        </div>

        {/* Živa popolnost profila */}
        <div className="space-y-1.5 pt-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Popolnost profila</span>
            <span className="font-semibold text-primary">
              {completion.percentage}&nbsp;%
            </span>
          </div>
          <Progress
            value={completion.percentage}
            className="h-2"
            aria-label={`Popolnost profila: ${completion.percentage} odstotkov`}
          />
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Horizontalni step indikator — na mobilnem samo številke */}
        <nav aria-label="Koraki čarovnika">
          <ol className="flex items-start gap-1 sm:gap-2">
            {WIZARD_STEPS.map((s) => (
              <li
                key={s.n}
                aria-label={`Korak ${s.n} od 5: ${s.title}`}
                aria-current={s.n === step ? "step" : undefined}
                className="flex flex-1 flex-col items-center gap-1.5"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors",
                    stepDone(s.n)
                      ? "border-primary bg-primary text-primary-foreground"
                      : s.n === step
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-muted/50 text-muted-foreground"
                  )}
                >
                  {stepDone(s.n) ? (
                    <Check className="size-4" aria-hidden="true" />
                  ) : (
                    s.n
                  )}
                </span>
                <span
                  className={cn(
                    "hidden text-center text-[11px] leading-tight sm:block sm:text-xs",
                    s.n === step
                      ? "font-semibold text-foreground"
                      : "text-muted-foreground"
                  )}
                >
                  {s.title}
                </span>
              </li>
            ))}
          </ol>
        </nav>

        {/* ============ KORAK 1: Osnovni podatki ============ */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ob-name">
                  Ime lokalca <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ob-name"
                  placeholder="Restavracija Pri Makcu"
                  value={form.name}
                  onChange={(e) => update("name", e.target.value)}
                  disabled={saving}
                  autoComplete="organization"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-category">
                  Kategorija <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.category}
                  onValueChange={(v) =>
                    update("category", v as ListingCategory)
                  }
                  disabled={saving}
                >
                  <SelectTrigger id="ob-category" className="w-full">
                    <SelectValue placeholder="Izberite kategorijo" />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(CATEGORY_LABELS) as ListingCategory[]).map(
                      (cat) => (
                        <SelectItem key={cat} value={cat}>
                          {CATEGORY_LABELS[cat]}
                        </SelectItem>
                      )
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ob-destination">
                  Destinacija <span className="text-destructive">*</span>
                </Label>
                <Select
                  value={form.destinationId || undefined}
                  onValueChange={(v) => update("destinationId", v)}
                  disabled={saving}
                >
                  <SelectTrigger id="ob-destination" className="w-full">
                    <SelectValue placeholder="Izberite destinacijo" />
                  </SelectTrigger>
                  <SelectContent>
                    {DESTINATIONS.map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-phone">
                  Telefon <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ob-phone"
                  type="tel"
                  placeholder="+386 4 123 4567"
                  value={form.phone}
                  onChange={(e) => update("phone", e.target.value)}
                  disabled={saving}
                  autoComplete="tel"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-address">
                Naslov <span className="text-destructive">*</span>
              </Label>
              <Input
                id="ob-address"
                placeholder="Cankarjeva cesta 5, 4260 Bled"
                value={form.address}
                onChange={(e) => update("address", e.target.value)}
                disabled={saving}
                autoComplete="street-address"
              />
            </div>
          </div>
        )}

        {/* ============ KORAK 2: Opisi (števci znakov) ============ */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="ob-description">
                Kratek opis <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ob-description"
                rows={3}
                placeholder="En stavek, ki opisuje vaš lokal..."
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                disabled={saving}
                className="resize-y"
              />
              <p
                className={cn(
                  "text-xs",
                  form.description.trim().length >= 20
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {form.description.trim().length} znakov (vsaj 20)
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-long-description">
                Dolgi opis <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ob-long-description"
                rows={6}
                placeholder="Podroben opis — kaj ponujate, zakaj vas obiskati, kaj vas naredi posebnega..."
                value={form.longDescription}
                onChange={(e) => update("longDescription", e.target.value)}
                disabled={saving}
                className="resize-y"
              />
              <p
                className={cn(
                  "text-xs",
                  form.longDescription.trim().length >= 100
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {form.longDescription.trim().length} znakov (vsaj 100)
              </p>
            </div>
          </div>
        )}

        {/* ============ KORAK 3: Fotografije ============ */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="ob-image">
                Fotografije (URL-ji){" "}
                <span className="text-destructive">*</span>
              </Label>
              <div className="flex gap-2">
                <Input
                  id="ob-image"
                  placeholder="https://example.com/slika.jpg"
                  value={imageInput}
                  onChange={(e) => setImageInput(e.target.value)}
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddImage();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddImage}
                  disabled={saving || !imageInput.trim()}
                  className="shrink-0"
                >
                  <ImagePlus className="size-4" aria-hidden="true" />
                  <span className="sr-only">Dodaj fotografijo</span>
                </Button>
              </div>
              <p
                className={cn(
                  "text-xs",
                  form.images.length >= 3
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                {form.images.length} od 3 potrebnih fotografij
              </p>
            </div>
            {form.images.length > 0 && (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {form.images.map((url) => (
                  <div
                    key={url}
                    className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted"
                  >
                    <img
                      src={url}
                      alt="Fotografija lokalca"
                      className="size-full object-cover"
                      loading="lazy"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.opacity = "0.3";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(url)}
                      className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                      aria-label="Odstrani fotografijo"
                      disabled={saving}
                    >
                      <Trash2 className="size-3" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Kvalitetne fotografije povečajo zanimanje obiskovalcev — prva
              fotografija bo naslovna.
            </p>
          </div>
        )}

        {/* ============ KORAK 4: Dodatno (opcijsko) ============ */}
        {step === 4 && (
          <div className="space-y-4">
            <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs text-foreground/80">
              Ta korak je opcijsko — podatke lahko dodate tudi kasneje ali
              kliknete «Preskoči».
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ob-website">Spletna stran</Label>
                <Input
                  id="ob-website"
                  type="url"
                  placeholder="https://www.lokal.si"
                  value={form.website}
                  onChange={(e) => update("website", e.target.value)}
                  disabled={saving}
                  autoComplete="url"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ob-hours">Odpiralni čas</Label>
                <Input
                  id="ob-hours"
                  placeholder="Pon–Pet: 9–22, Sob: 10–23"
                  value={form.openingHours}
                  onChange={(e) => update("openingHours", e.target.value)}
                  disabled={saving}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ob-price">Cenovni razred</Label>
              <Select
                value={form.priceRange}
                onValueChange={(v) =>
                  update("priceRange", v as WizardForm["priceRange"])
                }
                disabled={saving}
              >
                <SelectTrigger id="ob-price" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="€">€ — ugodno</SelectItem>
                  <SelectItem value="€€">€€ — srednje</SelectItem>
                  <SelectItem value="€€€">€€€ — višje</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Tag className="size-3.5" aria-hidden="true" />
                Specialitete
              </Label>
              <div className="flex gap-2">
                <Input
                  placeholder="npr. domača kulinartika, vegan meni..."
                  value={specialtyInput}
                  onChange={(e) => setSpecialtyInput(e.target.value)}
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddSpecialty();
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleAddSpecialty}
                  disabled={saving || !specialtyInput.trim()}
                  className="shrink-0"
                >
                  <Plus className="size-4" aria-hidden="true" />
                  <span className="sr-only">Dodaj specialiteto</span>
                </Button>
              </div>
              {form.specialties.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {form.specialties.map((s) => (
                    <Badge
                      key={s}
                      variant="secondary"
                      className="gap-1 pr-1.5"
                    >
                      {s}
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecialty(s)}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20"
                        aria-label={`Odstrani ${s}`}
                        disabled={saving}
                      >
                        <Trash2 className="size-3" aria-hidden="true" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ============ KORAK 5: Oddaja ============ */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="space-y-3 rounded-lg border bg-muted/30 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  Popolnost profila
                </span>
                <span className="text-sm font-bold text-primary">
                  {completion.percentage}&nbsp;%
                </span>
              </div>
              <Progress
                value={completion.percentage}
                aria-label={`Popolnost profila: ${completion.percentage} odstotkov`}
              />
              <p className="text-xs text-muted-foreground">
                Izpolnjenih je {completion.filledCount} od{" "}
                {completion.totalCount} polj — vsa obvezna polja so pripravljena
                za oddajo.
              </p>
              {completion.missing.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground">
                    Neobvezna polja, ki jih lahko dopolnite kasneje:
                  </p>
                  <ul className="list-inside list-disc text-xs text-muted-foreground">
                    {completion.missing.map((f) => (
                      <li key={f.key}>{f.label}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              S klikom na «Oddaj v pregled» pošljete lokal{" "}
              <strong className="text-foreground">{form.name}</strong> naši
              administraciji. Status pregleda spremljate v seznamu lokalov.
            </p>
          </div>
        )}
      </CardContent>

      <CardFooter className="flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-between">
        <div className="flex w-full gap-2 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            onClick={handleBack}
            disabled={saving || submitting || step === 1}
            className="w-full sm:w-auto"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Nazaj
          </Button>
          {step === 4 && (
            <Button
              type="button"
              variant="ghost"
              onClick={handleSkip}
              disabled={saving || submitting}
              className="w-full text-muted-foreground sm:w-auto"
            >
              Preskoči
            </Button>
          )}
        </div>
        <div className="flex w-full gap-2 sm:w-auto sm:justify-end">
          {step < 5 ? (
            <Button
              type="button"
              onClick={handleNext}
              disabled={saving || submitting}
              className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {saving ? (
                <>
                  <Loader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Shranjujem...
                </>
              ) : (
                <>
                  Nadaljuj
                  <ArrowRight className="size-4" aria-hidden="true" />
                </>
              )}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={handleSubmitForReview}
              disabled={saving || submitting}
              className="w-full bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
            >
              {submitting ? (
                <>
                  <Loader2
                    className="size-4 animate-spin"
                    aria-hidden="true"
                  />
                  Oddajam...
                </>
              ) : (
                <>
                  <Send className="size-4" aria-hidden="true" />
                  Oddaj v pregled
                </>
              )}
            </Button>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
