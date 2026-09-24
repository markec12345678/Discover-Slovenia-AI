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

function eur(n: number): string {
  return `${Math.round(n).toLocaleString("sl-SI")} €`;
}

const STATUS_LABELS: Record<string, string> = {
  within: "Znotraj proračuna",
  exceeded: "Čez proračun",
  uncertain: "Ni mogoče dokazati",
};

export function TripBudgetCard({
  shareId,
  dayCount,
}: {
  shareId: string;
  dayCount: number;
}) {
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
        setLoadError(`Napaka ${aggRes.status}`);
      }
      if (expRes.ok) {
        const data = (await expRes.json()) as { expenses?: ExpenseRow[] };
        setExpenses(data.expenses ?? []);
      }
    } catch {
      setLoadError("Proračun trenutno ni dosegljiv.");
    }
  }, [shareId]);

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
        title: "Dopolni strošek",
        description: "Oznaka in znesek (večji od 0) sta obvezna.",
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
          title: "Strošek ni shranjen",
          description: data?.error ?? `Napaka ${res.status}`,
        });
        return;
      }
      setLabel("");
      setAmount("");
      setFormOpen(false);
      await load(clientId);
      toast({ title: "Strošek zabeležen" });
    } catch {
      toast({
        title: "Strošek ni shranjen",
        description: "Omrežje ali strežnik trenutno ni dosegljiv.",
      });
    } finally {
      setBusy(false);
    }
  }, [amount, clientId, dayIndex, kind, label, load, shareId, toast]);

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
          Proračun poti
          {budget?.groupSize != null ? (
            <Badge variant="secondary" className="ml-1 font-normal">
              {budget.groupSize}{" "}
              {budget.groupSize === 1 ? "oseba" : "oseb"}
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
                Načrt (ocena)
              </span>
              <span className="text-sm font-semibold">
                ~{eur(p.stopsTotal)}
              </span>
            </div>
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              Ocena iz cen postankov v načrtu
              {p.fromPriceCount > 0
                ? ` · ${p.fromPriceCount} ${p.fromPriceCount === 1 ? "cena je" : "cen je"} „od" (spodnja meja)`
                : ""}
              {p.unknownCostStops > 0
                ? ` · ${p.unknownCostStops} ${p.unknownCostStops === 1 ? "postanek brez" : "postankov brez"} znane cene (NE seštevamo)`
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
                  {STATUS_LABELS[p.status] ?? p.status} (cilj {eur(p.budget)})
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
                Rezervirano
              </span>
              <span className="text-sm font-semibold">
                {budget ? eur(budget.booked.amount) : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {budget && budget.booked.count > 0
                ? `${budget.booked.count} ${budget.booked.count === 1 ? "zapis" : "zapisov"} · uporabniško potrjeno`
                : "Še nič rezerviranega z zneskom"}
            </p>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-sm font-medium">
                <Banknote className="size-4 text-emerald-600" aria-hidden />
                Plačano
              </span>
              <span className="text-sm font-semibold">
                {budget ? eur(budget.paid.amount) : "—"}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {budget && budget.paid.count > 0
                ? `${budget.paid.count} ${budget.paid.count === 1 ? "zapis" : "zapisov"} · uporabniško zabeleženo`
                : "Še nič zabeleženega plačila"}
            </p>
          </div>
        </div>

        {/* ── NA OSEBO (samo DENAR, samo ob znani skupini) ──────────── */}
        {budget?.perPerson ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Info className="size-3.5 shrink-0" aria-hidden />
            Na osebo ({budget.groupSize}): rezervirano{" "}
            {eur(budget.perPerson.booked)} · plačano {eur(budget.perPerson.paid)}
            . Ocena načrta NI deljena na osebo (pokriva postanke, ki so delno
            isti predmet rezervacij).
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
                        plačano
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="mr-1.5 border-violet-600/40 text-violet-700"
                      >
                        rezervirano
                      </Badge>
                    )}
                    {e.dayIndex != null ? `Dan ${e.dayIndex + 1} · ` : ""}
                    {e.label}
                  </span>
                  <span className="shrink-0 font-medium">{eur(e.amountEur)}</span>
                  {e.isAuthor ? (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => void removeExpense(e.id)}
                      disabled={busy}
                      aria-label="Izbriši strošek"
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
                  <Label htmlFor="expense-label">Strošek</Label>
                  <Input
                    id="expense-label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    placeholder="npr. rafting na Soči"
                    maxLength={120}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="expense-amount">Znesek (EUR)</Label>
                  <Input
                    id="expense-amount"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    inputMode="decimal"
                    placeholder="npr. 45"
                    maxLength={10}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Vrsta</Label>
                  <Select
                    value={kind}
                    onValueChange={(v) => setKind(v as "booked" | "paid")}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="booked">Rezervirano (zaveza)</SelectItem>
                      <SelectItem value="paid">Plačano</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {dayCount > 0 ? (
                  <div className="space-y-1.5">
                    <Label> Dan (opcijsko)</Label>
                    <Select
                      value={dayIndex}
                      onValueChange={(v) => setDayIndex(v)}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Brez dneva</SelectItem>
                        {Array.from({ length: Math.min(dayCount, 30) }, (_, i) => (
                          <SelectItem key={i} value={String(i)}>
                            Dan {i + 1}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
              </div>
              <p className="text-[11px] leading-snug text-muted-foreground">
                Znesek je tvoja trditev (ne providerjeva potrditev) — izpisano
                kot uporabniško zabeleženo.
              </p>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => void addExpense()} disabled={busy}>
                  {busy ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden />
                  ) : null}
                  Zabeleži
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setFormOpen(false)}
                  disabled={busy}
                >
                  Prekliči
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
              Zabeleži strošek
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
