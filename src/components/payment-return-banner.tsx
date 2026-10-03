"use client";

// ============================================================================
// PAYMENT RETURN BANNER — ISSUE #20 §4 FAZA 2 (1.158.0)
// ============================================================================
// Uporabniška potrditev za POVRATEK s Stripe Checkout (produkcijski
// lastno-tržnični plačilni tok). Strežniška uspešna/preklicna URL-ja:
//
//   /trznica?placilo=uspeh&narocilo=IF-…      (naročilo izdelkov)
//   /trznica?placilo=preklicano
//   /dozivetja?placilo=uspeh&rezervacija=IF-EXP-…   (rezervacija izkušnje)
//   /dozivetja?placilo=preklicano
//
// Demo tok tega bannra NIKOLI ne pokaže (potrditev je takoj v modalu —
// banner se izriše SAMO ob parametru `placilo`).
//
// Tehnično: useSearchParams zahteva Suspense ovojnico ob predizrisu
// (Next.js); zato je komponenta razcepljena na notranjost + tanek ovoj.
// ============================================================================

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLocale } from "next-intl";
import { CheckCircle2, XCircle } from "lucide-react";

const L = {
  successTitle: { sl: "Plačilo uspešno", en: "Payment successful" },
  successBody: {
    sl: "Hvala! Plačilo je bilo sprejeto, potrditev po e-pošti je na poti. Stanje naročila oz. rezervacije lahko vedno preverite v Moja potovanja.",
    en: "Thank you! Your payment has been accepted and a confirmation e-mail is on its way. You can always check the status of your order or booking under My trips.",
  },
  successNumber: { sl: "Številka", en: "Number" },
  successLink: { sl: "Moja potovanja", en: "My trips" },
  cancelledTitle: { sl: "Plačilo preklicano", en: "Payment cancelled" },
  cancelledBody: {
    sl: "Plačilo ni bilo opravljeno — naročilo oz. rezervacija je razveljavljena in morebitna rezervacija zaloge/mesta je sproščena. Poskusi znova, kdaj koli želiš.",
    en: "No payment was made — the order or booking has been voided and any reserved stock/capacity has been released. Feel free to try again whenever you like.",
  },
} as const;

function PaymentReturnBannerInner() {
  const params = useSearchParams();
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  const outcome = params.get("placilo");
  const orderNumber = params.get("narocilo");
  const bookingNumber = params.get("rezervacija");

  if (outcome !== "uspeh" && outcome !== "preklicano") return null;

  if (outcome === "uspeh") {
    const refNumber = orderNumber ?? bookingNumber ?? null;
    return (
      <div
        role="status"
        aria-live="polite"
        className="mx-auto w-full max-w-4xl px-4 pt-6"
      >
        <div className="flex items-start gap-3 rounded-lg border border-emerald-600/30 bg-emerald-500/10 p-4 text-left sm:items-center sm:p-5">
          <CheckCircle2
            className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600 sm:mt-0"
            aria-hidden="true"
          />
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">
              {L.successTitle[lang]}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {L.successBody[lang]}
            </p>
            {refNumber ? (
              <p className="mt-1 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">
                  {L.successNumber[lang]}:
                </span>{" "}
                <span className="font-mono">{refNumber}</span>
              </p>
            ) : null}
          </div>
          <Link
            href="/moja-potovanja"
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground underline-offset-4 transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            {L.successLink[lang]}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div role="status" aria-live="polite" className="mx-auto w-full max-w-4xl px-4 pt-6">
      <div className="flex items-start gap-3 rounded-lg border border-border bg-muted/40 p-4 text-left sm:items-center sm:p-5">
        <XCircle
          className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground sm:mt-0"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">
            {L.cancelledTitle[lang]}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {L.cancelledBody[lang]}
          </p>
        </div>
      </div>
    </div>
  );
}

/** Suspense ovoj — useSearchParams pri predizrisu zahteva mejo (Next.js). */
export function PaymentReturnBanner() {
  return (
    <Suspense fallback={null}>
      <PaymentReturnBannerInner />
    </Suspense>
  );
}
