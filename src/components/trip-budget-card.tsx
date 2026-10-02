"use client";

// ============================================================================
// TRIP BUDGET CARD — ISSUE #4 §14 (val 3): proračun poti na /pot/[shareId]
// ============================================================================
// Pet vedric resnice (lib/trip-budget.ts — ISTA plast kot agregator):
//   · NAČRT (ocena): znane kanonske cene + koliko postankov ima "od" ceno
//     (spodnja meja) + koliko jih cene NIMA (nikoli €0);
//   · REZERVIRANO (denar): uporabniško potrjene rezervacije + zabeležene
//     zaveze (TripExpense kind=booked);
//   · PLAČANO (denar): zabeležena plačila (TripExpense kind=paid);
//   · NA OSEBO: samo če je groupSize znan (formData) in samo za DENAR;
//   · STATUS proračuna: within/exceeded/uncertain (iz budgetValidation —
//     save-path fix val 3 ga od zdaj prinese tudi na /pot).
//
// ISKRENOST (§14: "ne računaj total cost, če cena ni dejansko znana"):
//   · neznanih cen NE seštevamo — štejejo se kot števec;
//   · ocene (planned) in denar (booked/paid) NIKOLI nista seštevana skupaj
//     (planned pokriva postanke, ki so delno isti predmet rezervacij);
//   · vsak znesek ima IZVOR (ocena načrta / uporabniška trditev).
//
// Površina je SL-only (enako kot ostale /pot komponente).
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Wallet,
  Receipt,
  CircleCheck,
  CircleAlert,
  Info,
  Loader2,
  Plus,
  Trash2,
  Banknote,
  CalendarClock,
} from "lucide-react";
import { getVoterId } from "@/lib/client-identity";
import { useToast } from "@/hooks/use-toast";

interface BudgetSummary {
  currency: string;
  planned: {
    knownTotal: number;
    stopsTotal: number;
    fromPriceCount: number;
    unknownCostStops: number;
    status: string | null;
    budget: number | null;
  };
  booked: { amount: number; count: number };
  paid: { amount: number; count: number };
  groupSize: number | null;
  perPerson: { booked: number; paid: number } | null;
}

interface ExpenseRow {
  id: string;
  dayIndex: number | null;
  label: string;
  amountEur: number;
  kind: string;
  authorName: string | null;
  createdAt: string;
  isAuthor: boolean;
}

// ISSUE #24 Sklop 1 (1.164.0): L-vzorec {sl,en} — prej SL-only
const L = {
  sl: {
    /** Stanja proračuna (budgetValidation) — iskrene oznake. */
    statusLabels: {
      within: "Znotraj proračuna",
      exceeded: "Čez proračun",
      uncertain: "Ni mogoče dokazati",
    } as Record<string, string>,
    /** Znesek v EUR — celo število, ločilo tisočic sl-SI. */
    eur: (n: number) => `${Math.round(n).toLocaleString("sl-SI")} €`,
    errorStatus: (status: number) => `Napaka ${status}`,
    loadErrorCatch: "Proračun trenutno ni dosegljiv.",
    toastIncompleteTitle: "Dopolni strošek",
    toastIncompleteDesc: "Oznaka in znesek (večji od 0) sta obvezna.",
    toastNotSavedTitle: "Strošek ni shranjen",
    toastNotSavedNetworkDesc: "Omrežje ali strežnik trenutno ni dosegljiv.",
    toastSavedTitle: "Strošek zabeležen",
    cardTitle: "Proračun poti",
    groupPersonWord: (n: number | null) => (n === 1 ? "oseba" : "oseb"),
    planEstimateTitle: "Načrt (ocena)",
    planEstimateNote: "Ocena iz cen postankov v načrtu",
    fromPriceNote: (n: number) =>
      ` · ${n} ${n === 1 ? "cena je" : "cen je"} „od" (spodnja meja)`,
    unknownCostNote: (n: number) =>
      ` · ${n} ${n === 1 ? "postanek brez" : "postankov brez"} znane cene (NE seštevamo)`,
    goalWord: "cilj",
    reservedTitle: "Rezervirano",
    bookedCountNote: (n: number) =>
      `${n} ${n === 1 ? "zapis" : "zapisov"} · uporabniško potrjeno`,
    bookedEmpty: "Še nič rezerviranega z zneskom",
    paidTitle: "Plačano",
    paidCountNote: (n: number) =>
      `${n} ${n === 1 ? "zapis" : "zapisov"} · uporabniško zabeleženo`,
    paidEmpty: "Še nič zabeleženega plačila",
    perPersonNote: (n: number | null, booked: string, paid: string) =>
      `Na osebo (${n ?? ""}): rezervirano ${booked} · plačano ${paid}. Ocena načrta NI deljena na osebo (pokriva postanke, ki so delno isti predmet rezervacij).`,
    badgePaid: "plačano",
    badgeBooked: "rezervirano",
    dayPrefix: (dayIndex: number) => `Dan ${dayIndex + 1} · `,
    deleteExpenseAria: "Izbriši strošek",
    expenseLabel: "Strošek",
    expensePlaceholder: "npr. rafting na Soči",
    amountLabel: "Znesek (EUR)",
    amountPlaceholder: "npr. 45",
    kindLabel: "Vrsta",
    kindBookedOption: "Rezervirano (zaveza)",
    kindPaidOption: "Plačano",
    /** Vodilni presledek je izvirno stanje (byte-identičen SL izpis). */
    dayOptionalLabel: " Dan (opcijsko)",
    dayNoneOption: "Brez dneva",
    dayOption: (n: number) => `Dan ${n}`,
    amountClaimNote:
      "Znesek je tvoja trditev (ne providerjeva potrditev) — izpisano kot uporabniško zabeleženo.",
    submitButton: "Zabeleži",
    cancelButton: "Prekliči",
    addExpenseButton: "Zabeleži strošek",
  },
  en: {
    statusLabels: {
      within: "Within budget",
      exceeded: "Over budget",
      uncertain: "Cannot be verified",
    } as Record<string, string>,
    eur: (n: number) => `${Math.round(n).toLocaleString("en-GB")} €`,
    errorStatus: (status: number) => `Error ${status}`,
    loadErrorCatch: "The budget is currently unavailable.",
    toastIncompleteTitle: "Complete the expense",
    toastIncompleteDesc: "Label and amount (greater than 0) are required.",
    toastNotSavedTitle: "Expense not saved",
    toastNotSavedNetworkDesc: "Network or server is currently unreachable.",
    toastSavedTitle: "Expense logged",
    cardTitle: "Trip budget",
    groupPersonWord: (n: number | null) => (n === 1 ? "person" : "people"),
    planEstimateTitle: "Plan (estimate)",
    planEstimateNote: "Estimate from stop prices in the plan",
    fromPriceNote: (n: number) =>
      ` · ${n} ${n === 1 ? "price is" : "prices are"} "from" (lower bound)`,
    unknownCostNote: (n: number) =>
      ` · ${n} ${n === 1 ? "stop without" : "stops without"} a known price (NOT summed)`,
    goalWord: "target",
    reservedTitle: "Reserved",
    bookedCountNote: (n: number) =>
      `${n} ${n === 1 ? "record" : "records"} · user-confirmed`,
    bookedEmpty: "Nothing reserved with an amount yet",
    paidTitle: "Paid",
    paidCountNote: (n: number) =>
      `${n} ${n === 1 ? "record" : "records"} · user-recorded`,
    paidEmpty: "No payments logged yet",
    perPersonNote: (n: number | null, booked: string, paid: string) =>
      `Per person (${n ?? ""}): reserved ${booked} · paid ${paid}. The plan estimate is NOT divided per person (it covers stops that partly overlap with reservations).`,
    badgePaid: "paid",
    badgeBooked: "reserved",
    dayPrefix: (dayIndex: number) => `Day ${dayIndex + 1} · `,
    deleteExpenseAria: "Delete expense",
    expenseLabel: "Expense",
    expensePlaceholder: "e.g. rafting on the Soča",
    amountLabel: "Amount (EUR)",
    amountPlaceholder: "e.g. 45",
    kindLabel: "Type",
    kindBookedOption: "Reserved (commitment)",
    kindPaidOption: "Paid",
    dayOptionalLabel: "Day (optional)",
    dayNoneOption: "No day",
    dayOption: (n: number) => `Day ${n}`,
    amountClaimNote:
      "The amount is your own claim (not a provider confirmation) — shown as user-recorded.",
    submitButton: "Log",
    cancelButton: "Cancel",
    addExpenseButton: "Log an expense",
  },
} as const;

export function TripBudgetCard({
  shareId,
  dayCount,
}: {
  shareId: string;
  dayCount: number;
}) {
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";
  const t = L[lang];
  const { toast } = useToast();
  const [budget, setBudget] = useState<BudgetSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Obrazec stroška
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<"booked" | "paid">("booked");
  const [dayIndex, setDayIndex] = useState("none");

  const load = useCallback(async (cid: string) => {
    try {
      const [aggRes, expRes] = await Promise.all([
        fetch(`/api/trip/${encodeURIComponent(shareId)}`, { cache: "no-store" }),
        fetch(
          `/api/trip/${encodeURIComponent(shareId)}/expenses?clientId=${encodeURIComponent(cid)}`,
          { cache: "no-store" }
        ),
      ]);
      if (aggRes.ok) {
        const data = (await aggRes.json()) as { budget?: BudgetSummary };
        setBudget(data.budget ?? null);
        setLoadError(null);
      } else if (aggRes.status !== 404) {
        setLoadError(t.errorStatus(aggRes.status));
      }
      if (expRes.ok) {
        const data = (await expRes.json()) as { expenses?: ExpenseRow[] };
        setExpenses(data.expenses ?? []);
      }
    } catch {
      setLoadError(t.loadErrorCatch);
    }
  }, [shareId, t]);

  useEffect(() => {
    const cid = getVoterId();
    if (cid) {
      setClientId(cid);
      void load(cid);
    }
  }, [load]);

  const addExpense = useCallback(async () => {
    const amt = Number(amount.replace(",", "."));
    if (!label.trim() || !Number.isFinite(amt) || amt <= 0) {
      toast({
        title: t.toastIncompleteTitle,
        description: t.toastIncompleteDesc,
      });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/trip/${encodeURIComponent(shareId)}/expenses`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            amountEur: amt,
            kind,
            ...(dayIndex !== "none" ? { dayIndex: Number(dayIndex) } : {}),
            clientId,
          }),
        }
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        toast({
          title: t.toastNotSavedTitle,
          description: data?.error ?? t.errorStatus(res.status),
        });
        return;
      }
      setLabel("");
      setAmount("");
      setFormOpen(false);
      await load(clientId);
      toast({ title: t.toastSavedTitle });
    } catch {
      toast({
        title: t.toastNotSavedTitle,
        description: t.toastNotSavedNetworkDesc,
      });
    } finally {
      setBusy(false);
    }
  }, [amount, clientId, dayIndex, kind, label, load, shareId, t, toast]);

  const removeExpense = useCallback(
    async (id: string) => {
      setBusy(true);
      try {
        const res = await fetch(
          `/api/trip/${encodeURIComponent(shareId)}/expenses`,
          {
            method: "DELETE",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expenseId: id, clientId }),
          }
        );
        if (res.ok) {
          await load(clientId);
        }
      } catch {
        // tiho — gumb ostane
      } finally {
        setBusy(false);
      }
    },
    [clientId, load, shareId]
  );

  const visibleExpenses = useMemo(() => expenses.slice(-8).reverse(), [expenses]);

  if (loadError) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-4 text-sm text-destructive">
          {loadError}
        </CardContent>
      </Card>
    );
  }

  const p = budget?.planned;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Wallet className="size-5 text-primary" aria-hidden />
          {t.cardTitle}
          {budget?.groupSize != null ? (
            <Badge variant="secondary" className="ml-1 font-normal">
              {budget.groupSize}{" "}
              {t.groupPersonWord(budget.groupSize)}
            </Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* ── NAČRT (ocena) ─────────────────────────────────────────── */}
        {p ? (
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <CalendarClock className="size-4 text-muted-foreground" aria-hidden />
                {t.planEstimateTitle}
              </span>
              <span className="text-sm font-semibold">
                ~{t.eur(p.stopsTotal)}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {t.planEstimateNote}
              {p.fromPriceCount > 0 ? t.fromPriceNote(p.fromPriceCount) : ""}
              {p.unknownCostStops > 0
                ? t.unknownCostNote(p.unknownCostStops)
                : ""}
              .
            </p>
            {p.status && p.budget != null ? (
              <div className="mt-2 flex items-center gap-1.5">
                {p.status === "within" ? (
                  <CircleCheck className="size-4 text-emerald-600" aria-hidden />
                ) : (
                  <CircleAlert className="size-4 text-amber-600" aria-hidden />
                )}
                <span className="text-xs font-medium">
                  {t.statusLabels[p.status] ?? p.status} ({t.goalWord}{" "}
                  {t.eur(p.budget)})
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── DENAR: rezervirano + plačano ──────────────────────────── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Receipt className="size-4 text-violet-600" aria-hidden />
                {t.reservedTitle}
              </span>
              <span className="text-sm font-semibold">
                {budget ? t.eur(budget.booked.amount) : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {budget && budget.booked.count > 0
                ? t.bookedCountNote(budget.booked.count)
                : t.bookedEmpty}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Banknote className="size-4 text-emerald-600" aria-hidden />
                {t.paidTitle}
              </span>
              <span className="text-sm font-semibold">
                {budget ? t.eur(budget.paid.amount) : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {budget && budget.paid.count > 0
                ? t.paidCountNote(budget.paid.count)
                : t.paidEmpty}
            </p>
          </div>
        </div>

        {/* ── NA OSEBO (samo DENAR, samo ob znani skupini) ──────────── */}
        {budget?.perPerson ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {t.perPersonNote(
              budget.groupSize,
              t.eur(budget.perPerson.booked),
              t.eur(budget.perPerson.paid)
            )}
          </p>
        ) : null}

        {/* ── Seznam stroškov + obrazec ─────────────────────────────── */}
        <div className="space-y-2">
          {visibleExpenses.length > 0 ? (
            <ul className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {visibleExpenses.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-2 rounded-md border/60 bg-muted/20 px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1 truncate">
                    {e.kind === "paid" ? (
                      <Badge
                        variant="outline"
                        className="mr-1.5 border-emerald-600/40 text-emerald-700"
                      >
                        {t.badgePaid}
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="mr-1.5 border-violet-600/40 text-violet-700"
                      >
                        {t.badgeBooked}
                      </Badge>
                    )}
                    {e.dayIndex != null ? t.dayPrefix(e.dayIndex) : ""}
                    {e.label}
                  </span>
                  <span className="shrink-0 font-medium">{t.eur(e.amountEur)}</span>
                  {e.isAuthor ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void removeExpense(e.id)}
                      disabled={busy}
                      aria-label={t.deleteExpenseAria}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {formOpen ? (
            <div className="space-y-2.5 rounded-lg border p-3">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="expense-label">{t.expenseLabel}</Label>
                  <Input
                    id="expense-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder={t.expensePlaceholder}
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">{t.amountLabel}</Label>
                  <Input
                    id="expense-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder={t.amountPlaceholder}
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{t.kindLabel}</Label>
                  <Select
                    value={kind}
                    onValueChange={(v) => setKind(v as "booked" | "paid")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booked">
                        {t.kindBookedOption}
                      </SelectItem>
                      <SelectItem value="paid">{t.kindPaidOption}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dayCount > 0 ? (
                  <div className="space-y-1.5">
                    <Label>{t.dayOptionalLabel}</Label>
                    <Select
                      value={dayIndex}
                      onValueChange={(v) => setDayIndex(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">{t.dayNoneOption}</SelectItem>
                        {Array.from({ length: Math.min(dayCount, 30) }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {t.dayOption(i + 1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t.amountClaimNote}
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void addExpense()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  {t.submitButton}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFormOpen(false)}
                  disabled={busy}
                >
                  {t.cancelButton}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setFormOpen(true)}
              className="gap-1.5"
            >
              <Plus className="size-4" aria-hidden />
              {t.addExpenseButton}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
