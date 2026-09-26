"use client";

import * as React from "react";
import { useLocale } from "next-intl";
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
import { trackFunnel } from "@/lib/funnel";
// FW2-C: lokalna zgodovina naročil — "Moja naročila" na /moja-potovanja
// prebere številke (lib FW2-B, ključ "dai:my-orders") in e-pošto za potrditev
// lastništva pri javnem lookup API-ju (zahteva ?email= ujemanje s kupčevo).
import { addOrderNumber } from "@/lib/my-orders-storage";
import { rememberCheckoutEmail } from "@/components/my-orders-section";

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

// TASK 8 / F4-B (issue #8 Faza 4 — EN razširitev booking sklada): L-pattern
// slovar (SL+EN) za VES UI chrome checkouta — obrazec, validacije, pregled,
// plačilo, potrditev. RESNICA (§38): "Skupaj za plačilo" ↔ "Total due",
// "Plačano" ↔ "Paid", demo način ostaje izrecno pošten v OBEH jezikih.
// ZERO-LOSS: samo nizi, nobena logika/vedenje/API/shramba se ne spreminja
// (privzeta država "Slovenija" ostaja — je PODATEK, ki se pošlje v naročilo;
// preveden je samo placeholder).
const L = {
  dialog: {
    titleSuccess: { sl: "Naročilo uspešno", en: "Order successful" },
    title: {
      sl: "Zaključi nakup — podatki in plačilo",
      en: "Checkout — details and payment",
    },
    desc: {
      sl: "Dvostopenjski checkout: najprej vnesite podatke za dostavo, nato pregledajte naročilo in potrdite plačilo.",
      en: "Two-step checkout: enter your delivery details first, then review the order and confirm payment.",
    },
  },
  header: {
    success: { sl: "Naročilo potrjeno", en: "Order confirmed" },
    error: { sl: "Napaka pri plačilu", en: "Payment error" },
    step1: { sl: "Podatki za dostavo", en: "Delivery details" },
    step2: { sl: "Pregled in plačilo", en: "Review and payment" },
    subSuccess: { sl: "Hvala za nakup!", en: "Thank you for your purchase!" },
    subError: {
      sl: "Plačilo ni uspelo — poskusite znova.",
      en: "Payment failed — please try again.",
    },
    stepOf: {
      sl: (n: number) => `Korak ${n} od 2`,
      en: (n: number) => `Step ${n} of 2`,
    },
    secure: { sl: "Varna povezava", en: "Secure connection" },
  },
  errors: {
    emailRequired: { sl: "E-pošta je obvezna", en: "Email is required" },
    emailInvalid: {
      sl: "Neveljaven e-poštni naslov",
      en: "Invalid email address",
    },
    nameRequired: {
      sl: "Ime in priimek sta obvezna",
      en: "Full name is required",
    },
    phoneRequired: { sl: "Telefon je obvezen", en: "Phone is required" },
    addressRequired: { sl: "Naslov je obvezen", en: "Address is required" },
    cityRequired: { sl: "Mesto je obvezno", en: "City is required" },
    postalRequired: {
      sl: "Poštna številka je obvezna",
      en: "Postal code is required",
    },
    countryRequired: { sl: "Država je obvezna", en: "Country is required" },
    emptyCart: { sl: "Košarica je prazna.", en: "Your cart is empty." },
    payFailed: {
      sl: "Plačilo ni uspelo. Poskusite znova.",
      en: "Payment failed. Please try again.",
    },
    unknown: {
      sl: "Neznana napaka pri plačilu.",
      en: "Unknown payment error.",
    },
  },
  step1: {
    email: { sl: "E-pošta", en: "Email" },
    name: { sl: "Ime in priimek", en: "Full name" },
    phone: { sl: "Telefon", en: "Phone" },
    postalCode: { sl: "Poštna številka", en: "Postal code" },
    address: { sl: "Naslov", en: "Address" },
    city: { sl: "Mesto", en: "City" },
    country: { sl: "Država", en: "Country" },
    phEmail: { sl: "ime@primer.si", en: "you@example.com" },
    phName: { sl: "Janez Novak", en: "John Smith" },
    phPhone: { sl: "+386 41 234 567", en: "+386 41 234 567" },
    phPostal: { sl: "1000", en: "1000" },
    phAddress: { sl: "Slovenska cesta 1", en: "Slovenska cesta 1" },
    phCity: { sl: "Ljubljana", en: "Ljubljana" },
    phCountry: { sl: "Slovenija", en: "Slovenia" },
    privacy: {
      sl: "Vaši podatki se uporabijo izključno za izvedbo dostave. Ne pošiljamo marketinških sporočil brez vašega soglasja.",
      en: "Your details are used only to complete the delivery. We send no marketing messages without your consent.",
    },
    continue: { sl: "Nadaljuj na plačilo", en: "Continue to payment" },
  },
  step2: {
    errorTitle: { sl: "Plačilo ni uspelo", en: "Payment failed" },
    errorFallback: { sl: "Poskusite znova.", en: "Please try again." },
    addressTitle: { sl: "Naslov za dostavo", en: "Delivery address" },
    edit: { sl: "Uredi", en: "Edit" },
    itemsTitle: {
      sl: (n: number) => `Artikli (${n})`,
      en: (n: number) => `Items (${n})`,
    },
    subtotal: { sl: "Vrednost izdelkov", en: "Subtotal" },
    shipping: { sl: "Dostava", en: "Shipping" },
    free: { sl: "Brezplačna", en: "Free" },
    totalDue: { sl: "Skupaj za plačilo", en: "Total due" },
    demoTitle: { sl: "Demo način", en: "Demo mode" },
    demoBody: {
      sl: "Stranka je v demo načinu — pravo plačilo se NE bo zaračunalo. Naročilo se ustvari z datoteko \"paid\" status za testne namene. Ko bomo dodali prave Stripe ključe, se bo vklopilo pravo plačevanje.",
      en: "This store is in demo mode — no real payment will be charged. The order is created with a \"paid\" status for testing. When we add real Stripe keys, real payments will switch on.",
    },
    back: { sl: "Nazaj", en: "Back" },
    pay: {
      sl: (price: string) => `Potrdi in plačaj ${price}`,
      en: (price: string) => `Confirm and pay ${price}`,
    },
  },
  submitting: {
    title: { sl: "Obdelava plačila...", en: "Processing payment..." },
    note: {
      sl: "Prosimo počakajte, da potrdimo vaše naročilo.",
      en: "Please wait while we confirm your order.",
    },
  },
  success: {
    title: { sl: "Naročilo uspešno!", en: "Order successful!" },
    thanksPre: {
      sl: "Hvala za nakup slovenskih izdelkov. Potrdilo smo poslali na ",
      en: "Thank you for buying Slovenian products. We sent the receipt to ",
    },
    thanksPost: { sl: ".", en: "." },
    orderNumber: { sl: "Številka naročila", en: "Order number" },
    amount: { sl: "Znesek", en: "Amount" },
    status: { sl: "Status", en: "Status" },
    paid: { sl: "Plačano", en: "Paid" },
    tracking: {
      sl: "Številko naročila shranite za sledenje pošiljke. O vlogi dostave vas bomo obvestili po e-pošti.",
      en: "Keep your order number to track the shipment. We'll notify you about the delivery by email.",
    },
    close: { sl: "Zapri", en: "Close" },
  },
};

/**
 * CheckoutModal — 2-korakovni checkout proces.
 *
 * Korak 1: Podatki za dostavo (email, ime, telefon, naslov, mesto, poštna št., država)
 * Korak 2: Pregled naročila + plačilo (demo mode)
 *
 * Po uspešnem plačilu prikaže potrditev z številko naročila.
 */
export function CheckoutModal({ open, onOpenChange }: CheckoutModalProps) {
  // F4-B: jezik UI chroma (L-pattern, isti vzorec kot journey-planner).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
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
  // Znesek PLAČANEGA naročila — zajetih pred clearCart() (sicer bi se
  // reaktivni total izpraznjene košarice izpisal kot 0,00 €).
  const [paidTotal, setPaidTotal] = React.useState<number>(0);

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
    if (!buyer.email.trim()) next.email = L.errors.emailRequired[lang];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(buyer.email))
      next.email = L.errors.emailInvalid[lang];
    if (!buyer.name.trim()) next.name = L.errors.nameRequired[lang];
    if (!buyer.phone.trim()) next.phone = L.errors.phoneRequired[lang];
    if (!buyer.address.trim()) next.address = L.errors.addressRequired[lang];
    if (!buyer.city.trim()) next.city = L.errors.cityRequired[lang];
    if (!buyer.postalCode.trim()) next.postalCode = L.errors.postalRequired[lang];
    if (!buyer.country.trim()) next.country = L.errors.countryRequired[lang];

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
      setErrorMessage(L.errors.emptyCart[lang]);
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
        throw new Error(data.error || L.errors.payFailed[lang]);
      }

      setOrderNumber(data.orderNumber ?? "");
      setPaidTotal(typeof data.total === "number" ? data.total : total);
      setStatus("success");
      clearCart();
      trackFunnel("checkout_completed");

      // FW2-C: številko uspešnega naročila zapišemo v lokalno zgodovino
      // (defenzivno — poln/zasebni localStorage mirno preskoči). E-pošto si
      // zapomnimo kot predlog za prikaz zgodovine na /moja-potovanja.
      if (data.orderNumber) {
        addOrderNumber(data.orderNumber);
        rememberCheckoutEmail(buyer.email);
      }
    } catch (err) {
      console.error("[checkout] napaka:", err);
      setErrorMessage(
        err instanceof Error ? err.message : L.errors.unknown[lang]
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
            ? L.dialog.titleSuccess[lang]
            : L.dialog.title[lang]}
        </DialogTitle>
        <DialogDescription id="checkout-modal-desc" className="sr-only">
          {L.dialog.desc[lang]}
        </DialogDescription>

        <div className="scroll-area-custom max-h-[90vh] overflow-y-auto">
          {/* Header */}
          <div className="border-b border-border/60 bg-muted/30 p-5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-xl font-bold">
                  {status === "success"
                    ? L.header.success[lang]
                    : status === "error"
                      ? L.header.error[lang]
                      : step === 1
                        ? L.header.step1[lang]
                        : L.header.step2[lang]}
                </h2>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {status === "success"
                    ? L.header.subSuccess[lang]
                    : status === "error"
                      ? L.header.subError[lang]
                      : step === 1
                        ? L.header.stepOf[lang](1)
                        : L.header.stepOf[lang](2)}
                </p>
              </div>
              {status === "form" || status === "error" ? (
                <Badge
                  variant="secondary"
                  className="hidden gap-1.5 sm:inline-flex"
                >
                  <Lock className="size-3" aria-hidden="true" />
                  {L.header.secure[lang]}
                </Badge>
              ) : null}
            </div>
          </div>

          {/* Vsebina glede na status */}
          {status === "success" ? (
            <SuccessView
              orderNumber={orderNumber}
              email={buyer.email}
              total={paidTotal}
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
  // F4-B: jezik UI chroma obrazca (isti L slovar kot modal zgoraj)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const update =
    (field: keyof BuyerInfo) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setBuyer((prev) => ({ ...prev, [field]: e.target.value }));
    };

  return (
    <form onSubmit={onSubmit} className="space-y-4 p-5 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field
          label={L.step1.email[lang]}
          icon={Mail}
          required
          error={errors.email}
          className="sm:col-span-2"
        >
          <Input
            type="email"
            value={buyer.email}
            onChange={update("email")}
            placeholder={L.step1.phEmail[lang]}
            autoComplete="email"
            required
            aria-invalid={!!errors.email}
          />
        </Field>

        <Field
          label={L.step1.name[lang]}
          icon={User}
          required
          error={errors.name}
          className="sm:col-span-2"
        >
          <Input
            value={buyer.name}
            onChange={update("name")}
            placeholder={L.step1.phName[lang]}
            autoComplete="name"
            required
            aria-invalid={!!errors.name}
          />
        </Field>

        <Field label={L.step1.phone[lang]} icon={Phone} required error={errors.phone}>
          <Input
            type="tel"
            value={buyer.phone}
            onChange={update("phone")}
            placeholder={L.step1.phPhone[lang]}
            autoComplete="tel"
            required
            aria-invalid={!!errors.phone}
          />
        </Field>

        <Field
          label={L.step1.postalCode[lang]}
          icon={Hash}
          required
          error={errors.postalCode}
        >
          <Input
            value={buyer.postalCode}
            onChange={update("postalCode")}
            placeholder={L.step1.phPostal[lang]}
            autoComplete="postal-code"
            required
            aria-invalid={!!errors.postalCode}
          />
        </Field>

        <Field
          label={L.step1.address[lang]}
          icon={Home}
          required
          error={errors.address}
          className="sm:col-span-2"
        >
          <Input
            value={buyer.address}
            onChange={update("address")}
            placeholder={L.step1.phAddress[lang]}
            autoComplete="street-address"
            required
            aria-invalid={!!errors.address}
          />
        </Field>

        <Field label={L.step1.city[lang]} icon={Building2} required error={errors.city}>
          <Input
            value={buyer.city}
            onChange={update("city")}
            placeholder={L.step1.phCity[lang]}
            autoComplete="address-level2"
            required
            aria-invalid={!!errors.city}
          />
        </Field>

        <Field label={L.step1.country[lang]} icon={Globe} required error={errors.country}>
          <Input
            value={buyer.country}
            onChange={update("country")}
            placeholder={L.step1.phCountry[lang]}
            autoComplete="country-name"
            required
            aria-invalid={!!errors.country}
          />
        </Field>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
        <ShieldCheck className="size-4 shrink-0 text-primary" aria-hidden="true" />
        {L.step1.privacy[lang]}
      </div>

      <Button
        type="submit"
        size="lg"
        className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {L.step1.continue[lang]}
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
  // F4-B: jezik UI chroma pregleda (isti L slovar kot modal zgoraj)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
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
              {L.step2.errorTitle[lang]}
            </p>
            <p className="mt-0.5 text-muted-foreground">
              {errorMessage || L.step2.errorFallback[lang]}
            </p>
          </div>
        </div>
      ) : null}

      {/* Naslov za dostavo */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin className="size-4 text-primary" aria-hidden="true" />
            {L.step2.addressTitle[lang]}
          </h3>
          <button
            type="button"
            onClick={onBack}
            className="text-xs font-medium text-primary hover:underline"
          >
            {L.step2.edit[lang]}
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
          {L.step2.itemsTitle[lang](items.length)}
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
          <span>{L.step2.subtotal[lang]}</span>
          <span className="tabular-nums text-foreground">
            {formatEUR(subtotal)}
          </span>
        </div>
        <div className="flex justify-between text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Truck className="size-3.5" aria-hidden="true" />
            {L.step2.shipping[lang]}
          </span>
          <span className="tabular-nums text-foreground">
            {shipping === 0 ? (
              <span className="font-semibold text-primary">{L.step2.free[lang]}</span>
            ) : (
              formatEUR(shipping)
            )}
          </span>
        </div>
        <Separator className="my-1" />
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold">{L.step2.totalDue[lang]}</span>
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
          <p className="font-semibold">{L.step2.demoTitle[lang]}</p>
          <p className="mt-0.5">
            {L.step2.demoBody[lang]}
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
          {L.step2.back[lang]}
        </Button>
        <Button
          type="button"
          size="lg"
          onClick={onPay}
          className="flex-1 gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <CreditCard className="size-4" aria-hidden="true" />
          {L.step2.pay[lang](formatEUR(total))}
        </Button>
      </div>
    </div>
  );
}

/* ---------------- Submitting ---------------- */

function SubmittingView() {
  // F4-B: jezik UI chroma (isti L slovar)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-10 text-center">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Loader2 className="size-8 animate-spin" aria-hidden="true" />
      </span>
      <div>
        <p className="text-lg font-semibold">{L.submitting.title[lang]}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {L.submitting.note[lang]}
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
  // F4-B: jezik UI chroma potrditve (isti L slovar)
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-6 text-center sm:p-10">
      <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
        <CheckCircle2 className="size-9" aria-hidden="true" />
      </span>

      <div>
        <h3 className="text-xl font-bold text-foreground">
          {L.success.title[lang]}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {L.success.thanksPre[lang]}
          <span className="font-medium text-foreground">{email}</span>
          {L.success.thanksPost[lang]}
        </p>
      </div>

      <div className="w-full max-w-sm rounded-lg border border-border/60 bg-muted/30 p-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{L.success.orderNumber[lang]}</span>
          <span className="font-mono font-bold text-foreground">
            {orderNumber}
          </span>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{L.success.amount[lang]}</span>
          <span className="font-bold tabular-nums text-foreground">
            {formatEUR(total)}
          </span>
        </div>
        <Separator className="my-3" />
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{L.success.status[lang]}</span>
          <Badge className="bg-primary text-primary-foreground">{L.success.paid[lang]}</Badge>
        </div>
      </div>

      <p className="max-w-sm text-xs text-muted-foreground">
        {L.success.tracking[lang]}
      </p>

      <Button
        type="button"
        size="lg"
        onClick={onClose}
        className="w-full max-w-sm gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {L.success.close[lang]}
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
