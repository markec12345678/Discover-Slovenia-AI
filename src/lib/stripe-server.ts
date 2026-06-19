// Strežniški Stripe helper — skupna logika za demo detekcijo in Stripe instanco.
// "use server" ni potreben — to je pure modul.

// Preveri ali je Stripe v demo načinu (placeholder ključi ali manjkajoči)
export function isStripeDemo(): boolean {
  const key = process.env.STRIPE_SECRET_KEY;
  return !key || key.includes("demo_placeholder");
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
