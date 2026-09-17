// Strežniški Stripe helper — skupna logika za demo detekcijo in Stripe instanco.
// "use server" ni potreben — to je pure modul.

/**
 * Ali je konfiguriran PRAVI Stripe ključ (prisoten in ni placeholder)?
 */
export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !!key && !key.includes("demo_placeholder");
}

/**
 * Ali so demo plačilni tokovi dovoljeni?
 *
 * FAIL-CLOSED (revizija 1.36.0, 19-e P2 19e-1 + MF-4): prej je bilo demo
 * zaznavanje čisto odvisno od ODSOTNOSTI ključa — v produkciji z pomotoma
 * unset STRIPE_SECRET_KEY bi vsi plačilni tokovi tiho prešli v demo vejo
 * (brezplačne nadgradnje plana, naročila/rezervacije kot "paid",
 * aktivacije sponzorstev, mark_paid self-marking). Zdaj demo v produkciji
 * zahteva IZRECNI pristanek: DSA_DEMO_PAYMENTS=1. Brez ključa in brez
 * zastavice v produkciji isStripeDemo() vrne false — klici potem odpovejo
 * z jasno 503/501 napako namesto tihega fake plačila.
 */
export function isStripeDemo(): boolean {
  if (isStripeConfigured()) return false;
  if (process.env.NODE_ENV === "production") {
    return process.env.DSA_DEMO_PAYMENTS === "1";
  }
  return true;
}

// Mesečni prihodek po paketu (EUR)
export const PLAN_MONTHLY_PRICE: Record<string, number> = {
  free: 0,
  premium: 149,
  enterprise: 499,
};

// Izračunaj mesečni prihodek (MRR) za enega ownerja glede na paket
export function monthlyRevenueForPlan(plan: string | null | undefined): number {
  if (!plan) return 0;
  return PLAN_MONTHLY_PRICE[plan] ?? 0;
}

// Formatiraj EUR znesek v slovenskem formatu (1490,00 €)
export function formatEur(amount: number): string {
  return new Intl.NumberFormat("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}
