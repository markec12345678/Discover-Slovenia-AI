"use client";

import * as React from "react";
import {
  Mail,
  User,
  Phone,
  MapPin,
  Home,
  Building2,
  Hash,
  Globe,
  CreditCard,
  CheckCircle2,
  Loader2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ShieldCheck,
  Lock,
  Truck,
  Package,
} from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useCart, formatEUR } from "@/lib/cart-store";

interface CheckoutModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type Step = 1 | 2;
type Status = "form" | "submitting" | "success" | "error";

interface BuyerInfo {
  email: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  postalCode: string;
  country: string;
}

const EMPTY_BUYER: BuyerInfo = {
  email: "",
  name: "",
  phone: "",
  address: "",
  city: "",
  postalCode: "",
  country: "Slovenija",
};

interface CheckoutResponse {
  success?: boolean;
  orderNumber?: string;
  total?: number;
  status?: string;
  error?: string;
}

/**
 * CheckoutModal — 2-korakovni checkout proces.
 *
 * Korak 1: Podatki za dostavo (email, ime, telefon, naslov, mesto, poštna št., država)
 * Korak 2: Pregled naročila + plačilo (demo mode)
 *
 * Po uspešnem plačilu prikaže potrditev z številko naročila.
 */
export function CheckoutModal({ open, onOpenChange }: CheckoutModalProps) {
  const items = useCart((s) => s.items);
  const subtotal = useCart((s) => s.subtotal());
  const shipping = useCart((s) => s.shippingTotal());
  const total = useCart((s) => s.total());
  const clearCart = useCart((s) => s.clearCart);

  const [step, setStep] = React.useState<Step>(1);
  const [status, setStatus] = React.useState<Status>("form");
  const [buyer, setBuyer] = React.useState<BuyerInfo>(EMPTY_BUYER);
  const [errors, setErrors] = React.useState<Partial<Record<keyof BuyerInfo, string>>>({});
  const [errorMessage, setErrorMessage] = React.useState<string>("");
  const [orderNumber, setOrderNumber] = React.useState<string>("");

  // Reset ko se modal odpre
  React.useEffect(() => {
    if (open) {
      setStep(1);
      setStatus("form");
      setErrors({});
      setErrorMessage("");
      setOrderNumber("");
    }
  }, [open]);

  const validateBuyer = (): boolean => {
    const next: Partial<Record<keyof BuyerInfo, string>> = {};
    if (!buyer.email.trim()) next.email = "E-pošta je obvezna";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email))
      next.email = "Neveljaven e-poštni naslov";
    if (!buyer.name.trim()) next.name = "Ime in priimek sta obvezna";
    if (!buyer.phone.trim()) next.phone = "Telefon je obvezen";
    if (!buyer.address.trim()) next.address = "Naslov je obvezen";
    if (!buyer.city.trim()) next.city = "Mesto je obvezno";
    if (!buyer.postalCode.trim()) next.postalCode = "Poštna številka je obvezna";
    if (!buyer.country.trim()) next.country = "Država je obvezna";

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleStep1Submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (validateBuyer()) {
      setStep(2);
    }
  };

  const handlePayment = async () => {
    if (items.length === 0) {
      setErrorMessage("Košarica je prazna.");
      setStatus("error");
      return;
    }

    setStatus("submitting");
    setErrorMessage("");

    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: items.map((i) => ({
            productId: i.productId,
            name: i.name,
            slug: i.slug,
            price: i.price,
            quantity: i.quantity,
            image: i.image,
            sellerName: i.sellerName,
          })),
          buyer: {
            email: buyer.email.trim(),
            name: buyer.name.trim(),
            phone: buyer.phone.trim(),
            address: buyer.address.trim(),
            city: buyer.city.trim(),
            postalCode: buyer.postalCode.trim(),
            country: buyer.country.trim(),
          },
        }),
      });

      const data: CheckoutResponse = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Plačilo ni uspelo. Poskusite znova.");
      }

      setOrderNumber(data.orderNumber ?? "");
      setStatus("success");
      clearCart();
    } catch (err) {
      console.error("[checkout] napaka:", err);
      setErrorMessage(
        err instanceof Error ? err.message : "Neznana napaka pri plačilu."
      );
      setStatus("error");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={status !== "submitting"}
        className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
        aria-describedby="checkout-modal-desc"
      >
        <DialogTitle className="sr-only">
          {status === "success"
            ? "Naročilo uspešno"
            : "Zaključi nakup — podatki in plačilo"}
        </DialogTitle>
        <DialogDescription id="checkout-modal-desc" className="sr-only">
          Dvostopenjski checkout: najprej vnesite podatke za dostavo, nato
          pregledajte naročilo in potrdite plačilo.
        </DialogDescription>

        <div className="scroll-area-custom max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-border/60 bg-muted/30 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">
                  {status === "success"
                    ? "Naročilo potrjeno"
                    : status === "error"
                      ? "Napaka pri plačilu"
                      : step === 1
                        ? "Podatki za dostavo"
                        : "Pregled in plačilo"}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {status === "success"
                    ? "Hvala za nakup!"
                    : status === "error"
                      ? "Plačilo ni uspelo — poskusite znova."
                      : step === 1
                        ? "Korak 1 od 2"
                        : "Korak 2 od 2"}
                </p>
              </div>
              {status === "form" || status === "error" ? (
                <Badge
                  variant="secondary"
                  className="hidden gap-1.5 sm:inline-flex"
                >
                  <Lock className="size-3" aria-hidden="true" />
                  Varna povezava
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Vsebina glede na status */}
          {status === "success" ? (
            <SuccessView
              orderNumber={orderNumber}
              email={buyer.email}
              total={total}
              onClose={handleClose}
            />
          ) : status === "submitting" ? (
            <SubmittingView />
          ) : step === 1 ? (
            <Step1Form
              buyer={buyer}
              setBuyer={setBuyer}
              errors={errors}
              onSubmit={handleStep1Submit}
            />
          ) : (
            <Step2Review
              items={items}
              subtotal={subtotal}
              shipping={shipping}
              total={total}
              buyer={buyer}
              onBack={() => setStep(1)}
              onPay={handlePayment}
              isError={status === "error"}
              errorMessage={errorMessage}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------- Korak 1: Podatki za dostavo ---------------- */

function Step1Form({
  buyer,
  setBuyer,
  errors,
  onSubmit,
}: {
  buyer: BuyerInfo;
  setBuyer: React.Dispatch<React.SetStateAction<BuyerInfo>>;
  errors: Partial<Record<keyof BuyerInfo, string>>;
  onSubmit: (e: React.FormEvent) => void;
}) {
  const update =
    (field: keyof BuyerInfo) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBuyer((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label="E-pošta"
          icon={Mail}
          required
          error={errors.email}
          className="sm:col-span-2"
        >
          <Input
            type="email"
            value={buyer.email}
            onChange={update("email")}
            placeholder="ime@primer.si"
            autoComplete="email"
            required
            aria-invalid={!!errors.email}
          />
        </Field>

        <Field
          label="Ime in priimek"
          icon={User}
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <Input
            value={buyer.name}
            onChange={update("name")}
            placeholder="Janez Novak"
            autoComplete="name"
            required
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field label="Telefon" icon={Phone} required error={errors.phone}>
          <Input
            type="tel"
            value={buyer.phone}
            onChange={update("phone")}
            placeholder="+386 41 234 567"
            autoComplete="tel"
            required
            aria-invalid={!!errors.phone}
          />
        </Field>

        <Field
          label="Poštna številka"
          icon={Hash}
          required
          error={errors.postalCode}
        >
          <Input
            value={buyer.postalCode}
            onChange={update("postalCode")}
            placeholder="1000"
            autoComplete="postal-code"
            required
            aria-invalid={!!errors.postalCode}
          />
        </Field>

        <Field
          label="Naslov"
          icon={Home}
          required
          error={errors.address}
          className="sm:col-span-2"
        >
          <Input
            value={buyer.address}
            onChange={update("address")}
            placeholder="Slovenska cesta 1"
            autoComplete="street-address"
            required
            aria-invalid={!!errors.address}
          />
        </Field>

        <Field label="Mesto" icon={Building2} required error={errors.city}>
          <Input
            value={buyer.city}
            onChange={update("city")}
            placeholder="Ljubljana"
            autoComplete="address-level2"
            required
            aria-invalid={!!errors.city}
          />
        </Field>

        <Field label="Država" icon={Globe} required error={errors.country}>
          <Input
            value={buyer.country}
            onChange={update("country")}
            placeholder="Slovenija"
            autoComplete="country-name"
            required
            aria-invalid={!!errors.country}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
        Vaši podatki se uporabijo izključno za izvedbo dostave. Ne pošiljamo
        marketinških sporočil brez vašega soglasja.
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Nadaljuj na plačilo
        <ArrowRight className="size-4" aria-hidden="true" />
      </Button>
    </form>
  );
}

/* ---------------- Korak 2: Pregled in plačilo ---------------- */

function Step2Review({
  items,
  subtotal,
  shipping,
  total,
  buyer,
  onBack,
  onPay,
  isError,
  errorMessage,
}: {
  items: ReturnType<typeof useCart.getState>["items"];
  subtotal: number;
  shipping: number;
  total: number;
  buyer: BuyerInfo;
  onBack: () => void;
  onPay: () => void;
  isError: boolean;
  errorMessage: string;
}) {
  return (
    <div className="space-y-5 p-5 sm:p-6">
      {/* Napaka */}
      {isError ? (
        <div className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
          <AlertCircle
            className="mt-0.5 size-4 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <div>
            <p className="font-semibold text-destructive">
              Plačilo ni uspelo
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {errorMessage || "Poskusite znova."}
            </p>
          </div>
        </div>
      ) : null}

      {/* Naslov za dostavo */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            Naslov za dostavo
          </h3>
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-primary hover:underline"
          >
            Uredi
          </button>
        </div>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
          <p className="font-semibold">{buyer.name}</p>
          <p className="text-muted-foreground">{buyer.address}</p>
          <p className="text-muted-foreground">
            {buyer.postalCode} {buyer.city}
          </p>
          <p className="text-muted-foreground">{buyer.country}</p>
          <Separator className="my-2" />
          <p className="text-xs text-muted-foreground">
            <Mail className="mb-0.5 mr-1 inline size-3" aria-hidden="true" />
            {buyer.email}
            {buyer.phone ? (
              <>
                <span className="mx-2">·</span>
                <Phone
                  className="mb-0.5 mr-1 inline size-3"
                  aria-hidden="true"
                />
                {buyer.phone}
              </>
            ) : null}
          </p>
        </div>
      </section>

      {/* Pregled izdelkov */}
      <section>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <Package className="size-4 text-primary" aria-hidden="true" />
          Artikli ({items.length})
        </h3>
        <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
          {items.map((item) => (
            <li
              key={item.productId}
              className="flex items-center gap-3 p-3"
            >
              <div className="size-12 shrink-0 overflow-hidden rounded-md bg-muted">
                {item.image ? (
                  <img
                    src={item.image}
                    alt={item.name}
                    loading="lazy"
                    className="size-full object-cover"
                  />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-1 text-sm font-medium">
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.sellerName} · {item.quantity}×
                </p>
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {formatEUR(item.price * item.quantity)}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {/* Povzetek cen */}
      <section className="space-y-1.5 rounded-lg border border-border/60 bg-muted/30 p-3 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Vrednost izdelkov</span>
          <span className="tabular-nums text-foreground">
            {formatEUR(subtotal)}
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden="true" />
            Dostava
          </span>
          <span className="tabular-nums text-foreground">
            {shipping === 0 ? (
              <span className="font-semibold text-primary">Brezplačna</span>
            ) : (
              formatEUR(shipping)
            )}
          </span>
        </div>
        <Separator className="my-1" />
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">Skupaj za plačilo</span>
          <span className="text-xl font-bold tabular-nums text-foreground">
            {formatEUR(total)}
          </span>
        </div>
      </section>

      {/* Demo notice */}
      <div className="flex items-start gap-3 rounded-lg border border-amber-300/60 bg-amber-50 p-3 text-xs dark:border-amber-400/40 dark:bg-amber-950/30">
        <CreditCard
          className="mt-0.5 size-4 shrink-0 text-amber-700 dark:text-amber-400"
          aria-hidden="true"
        />
        <div className="text-amber-900 dark:text-amber-100">
          <p className="font-semibold">Demo način</p>
          <p className="mt-0.5">
            Stranka je v demo načinu — pravo plačilo se NE bo zaračunalo.
            Naročilo se ustvari z datoteko &quot;paid&quot; status za testne
            namene. Ko bomo dodali prave Stripe ključe, se bo vklopilo pravo
            plačevanje.
          </p>
        </div>
      </div>

      {/* CTA gumbi */}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          size="lg"
          onClick={onBack}
          className="gap-1.5 sm:w-auto"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Nazaj
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={onPay}
          className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <CreditCard className="size-4" aria-hidden="true" />
          Potrdi in plačaj {formatEUR(total)}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Submitting ---------------- */

function SubmittingView() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 className="size-8 animate-spin" aria-hidden="true" />
      </span>
      <div>
        <p className="text-lg font-semibold">Obdelava plačila...</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Prosimo počakajte, da potrdimo vaše naročilo.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Success ---------------- */

function SuccessView({
  orderNumber,
  email,
  total,
  onClose,
}: {
  orderNumber: string;
  email: string;
  total: number;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:p-10">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 className="size-9" aria-hidden="true" />
      </span>

      <div>
        <h3 className="text-xl font-bold text-foreground">
          Naročilo uspešno!
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Hvala za nakup slovenskih izdelkov. Potrdilo smo poslali na{" "}
          <span className="font-medium text-foreground">{email}</span>.
        </p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Številka naročila</span>
          <span className="font-mono font-bold text-foreground">
            {orderNumber}
          </span>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Znesek</span>
          <span className="font-bold tabular-nums text-foreground">
            {formatEUR(total)}
          </span>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Status</span>
          <Badge className="bg-primary text-primary-foreground">Plačano</Badge>
        </div>
      </div>

      <p className="max-w-sm text-xs text-muted-foreground">
        Številko naročila shranite za sledenje pošiljke. O vlogi dostave vas
        bomo obvestili po e-pošti.
      </p>

      <Button
        type="button"
        size="lg"
        onClick={onClose}
        className="w-full max-w-sm gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        Zapri
      </Button>
    </div>
  );
}

/* ---------------- Pomožne komponente ---------------- */

function Field({
  label,
  icon: Icon,
  required,
  error,
  className,
  children,
}: {
  label: string;
  icon: typeof Mail;
  required?: boolean;
  error?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 flex items-center gap-1.5 text-sm font-medium">
        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
        {label}
        {required ? <span className="text-destructive">*</span> : null}
      </Label>
      {children}
      {error ? (
        <p className="mt-1 text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

export default CheckoutModal;
