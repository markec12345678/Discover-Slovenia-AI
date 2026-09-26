"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  Banknote,
  CheckCircle2,
  FileSpreadsheet,
  Landmark,
  Loader2,
  Percent,
  Receipt,
  Wallet,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// ============================================================================
// PAYOUT LEDGER PANEL — zavihek "Izplačila" lastniškega dashboarda (TASK 34)
// ============================================================================
// Površina je SL-only inline (enako kot experience-availability-dialog.tsx in
// ostale lastniške forme — owner portal je slovenski) → NI useTranslations in
// NI messages/*.json (brez task71 paritetne obveznosti). Jedro logike je na
// strežniku: /api/owner/payouts + src/lib/payout-ledger.ts.

interface PayoutEntryRow {
  id: string;
  bookingNumber: string;
  experienceName: string;
  bookingDate: string;
  groupSize: number;
  source: string | null;
  grossAmount: number;
  rate: number;
  commissionAmount: number;
  netAmount: number;
  periodStart: string;
  periodEnd: string;
  status: string;
}

interface PayoutSettlementRow {
  id: string;
  settlementNumber: string;
  periodStart: string;
  periodEnd: string;
  entryCount: number;
  grossTotal: number;
  commissionTotal: number;
  netTotal: number;
  status: string;
  settledAt: string | null;
  createdAt: string;
}

interface PayoutsData {
  rate: number;
  isPremium: boolean;
  currentMonth: {
    monthLabel: string;
    entryCount: number;
    gross: number;
    commission: number;
    net: number;
  };
  lastMonth: {
    monthLabel: string;
    entryCount: number;
    gross: number;
    commission: number;
    net: number;
    settlementExists: boolean;
  };
  openPendingCount: number;
  // Odprte postavke iz obdobij STAREJŠIH od poravnavanega meseca (sweep) —
  // tekoči mesec NE (pripada naslednji poravnavi). Vira: GET /api/owner/payouts.
  olderOpenCount: number;
  settlements: PayoutSettlementRow[];
  pendingEntries: PayoutEntryRow[];
}

const fmtEur = (v: number) => `${v.toLocaleString("sl-SI")} €`;

const fmtPeriod = (startIso: string, endIso: string) => {
  const fmt = new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
    // Ledger meje so definirane po Europe/Ljubljana (revizija #8) — tudi pri
    // lastniku, ki brska iz drugega pasu, izpišemo pravi dan.
    timeZone: "Europe/Ljubljana",
  });
  const start = new Date(startIso);
  // periodEnd je ekskluzivna meja — zadnji dan obdobja je end − 1 ms
  const lastDay = new Date(new Date(endIso).getTime() - 1);
  return `${fmt.format(start)} – ${fmt.format(lastDay)}`;
};

const fmtDay = (iso: string) =>
  new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Ljubljana",
  }).format(new Date(iso));

export function PayoutLedgerPanel() {
  const { toast } = useToast();
  const [data, setData] = useState<PayoutsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/payouts", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d: PayoutsData = await res.json();
      setData(d);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti knjige izplačil.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const handleGenerate = async () => {
    setIssuing(true);
    try {
      const res = await fetch("/api/owner/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate" }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Izdaja ni mogoča",
          description: d.error || "Poskusite kasneje.",
        });
        return;
      }
      toast({
        title: "Poravnava izdana",
        description: `${d.settlement.settlementNumber} — ${d.settlement.entryCount} postavk, neto ${fmtEur(d.settlement.netTotal)}.`,
      });
      await load();
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Izdaja poravnave ni uspela.",
      });
    } finally {
      setIssuing(false);
    }
  };

  const handleSettle = async (settlementId: string) => {
    setSettlingId(settlementId);
    try {
      const res = await fetch("/api/owner/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "settle", settlementId }),
      });
      const d = await res.json();
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Napaka",
          description: d.error || "Poskusite kasneje.",
        });
        return;
      }
      toast({
        title: "Poravnava potrjena",
        description: `${d.settlement.settlementNumber} — evidenca usklajena (${d.entriesSettled} postavk).`,
      });
      await load();
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Potrditev poravnave ni uspela.",
      });
    } finally {
      setSettlingId(null);
      setConfirmId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (!data) return null;

  // Zrcali strežniški pogoj issuePayoutSettlement („vse odprto do vključno
  // prejšnjega meseca"): postavke TEKOČEGA meseca izdaje NE upravičijo
  // (sicer bi gumb obljubljal izdajo, ki bi jo strežnik zavrnil z 400).
  const canGenerate =
    (data.lastMonth.entryCount > 0 || data.olderOpenCount > 0) &&
    !data.lastMonth.settlementExists;

  const confirmSettlement = data.settlements.find(
    (s) => s.id === confirmId
  );

  return (
    <div className="space-y-6">
      {/* Glava + model */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wallet className="size-4 text-primary" aria-hidden="true" />
            Izplačila — knjiga prihodkov po rezervacijah
          </CardTitle>
          <CardDescription>
            Turist vam plača polno ceno neposredno. Ta knjiga združuje vse
            plačane rezervacije: bruto (kar ste prejeli), provizijo platforme
            (samo za rezervacije iz AI kanala) in vašo neto pozicijo.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Landmark className="size-5" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-semibold">
                Vaša provizijska stopnja: {Math.round(data.rate * 100)} %
              </p>
              <p className="text-muted-foreground mt-0.5">
                Poravnava je <strong>knjigovodska potrditev</strong> stanja
                evidence — platforma ne izvaja prenosov denarja (brez Stripe
                Connect). Obveznost provizije se obračuna ločeno prek
                provizijskih računov (zavihek Provizije).
              </p>
            </div>
          </div>

          {/* Tekoči mesec — predogled */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Tekoči mesec · {data.currentMonth.monthLabel}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Banknote className="size-3.5" aria-hidden="true" />
                  Bruto (plačane rezervacije)
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {fmtEur(data.currentMonth.gross)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {data.currentMonth.entryCount.toLocaleString("sl-SI")}{" "}
                  {data.currentMonth.entryCount === 1
                    ? "postavka"
                    : "postavk"}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Percent className="size-3.5" aria-hidden="true" />
                  Provizija platforme
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {fmtEur(data.currentMonth.commission)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  samo rezervacije iz AI kanala
                </div>
              </div>
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <ArrowDownToLine className="size-3.5" aria-hidden="true" />
                  Neto pozicija
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmtEur(data.currentMonth.net)}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  bruto − provizija
                </div>
              </div>
            </div>
            {data.currentMonth.entryCount === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                V {data.currentMonth.monthLabel} še ni plačanih rezervacij —
                postavka nastane šele, ko je rezervacija dejansko plačana.
              </p>
            )}
          </div>

          {/* Izdaja poravnave za prejšnji mesec */}
          <div className="rounded-lg border border-border/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-primary" aria-hidden="true" />
                  Poravnava za {data.lastMonth.monthLabel}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.lastMonth.entryCount > 0 ? (
                    <>
                      {data.lastMonth.entryCount}{" "}
                      {data.lastMonth.entryCount === 1
                        ? "postavka"
                        : "postavk"}{" "}
                      · bruto {fmtEur(data.lastMonth.gross)} · neto{" "}
                      <span className="font-semibold text-foreground">
                        {fmtEur(data.lastMonth.net)}
                      </span>
                    </>
                  ) : (
                    <>Ni odprtih postavk za to obdobje.</>
                  )}
                </p>
                {/* Sweep: odprte postavke IZKLJUČNO iz obdobij pred poravnavanim
                    mesecem (olderOpenCount) — tekoči mesec namenoma NE gre v
                    to izdajo. Ob že izdani poravnavi jih zajame naslednja. */}
                {data.olderOpenCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.olderOpenCount}{" "}
                    {data.olderOpenCount === 1
                      ? "odprta postavka"
                      : "odprtih postavk"}{" "}
                    iz obdobij pred {data.lastMonth.monthLabel}{" "}
                    {data.lastMonth.settlementExists
                      ? "— zajela jih bo naslednja izdaja."
                      : "— zajela jih bo ta izdaja."}
                  </p>
                )}
                {data.lastMonth.settlementExists && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Poravnava za to obdobje je že izdana — viden v seznamu spodaj.
                  </p>
                )}
              </div>
              <Button
                onClick={handleGenerate}
                disabled={!canGenerate || issuing}
                className="gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {issuing ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="size-4" aria-hidden="true" />
                )}
                Izdi poročilo o poravnavi
              </Button>
            </div>
          </div>

          {/* Zgodovina poravnav */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Izdane poravnave
            </div>
            {data.settlements.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Še ni izdanih poravnav. Prva poravnava se izda za zaključeno
                mesečno obdobje z vsaj eno plačano rezervacijo.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {data.settlements.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-border/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-semibold">
                          {s.settlementNumber}
                        </span>
                        <Badge
                          className={
                            s.status === "settled"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/60"
                              : "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border-amber-200 dark:border-amber-800/60"
                          }
                          variant="outline"
                        >
                          {s.status === "settled" ? "Potrjena" : "Odprta"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtPeriod(s.periodStart, s.periodEnd)} ·{" "}
                        {s.entryCount}{" "}
                        {s.entryCount === 1 ? "postavka" : "postavk"} · bruto{" "}
                        {fmtEur(s.grossTotal)} · provizija{" "}
                        {fmtEur(s.commissionTotal)} · neto{" "}
                        <span className="font-semibold text-foreground">
                          {fmtEur(s.netTotal)}
                        </span>
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button asChild variant="outline" size="sm">
                        <a
                          href={`/api/owner/payouts/report.csv?settlementId=${s.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="gap-1.5"
                        >
                          <FileSpreadsheet
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          Prenesi CSV
                        </a>
                      </Button>
                      {s.status === "pending" && (
                        <Button
                          size="sm"
                          onClick={() => setConfirmId(s.id)}
                          disabled={settlingId === s.id}
                          className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                        >
                          {settlingId === s.id ? (
                            <Loader2
                              className="size-3.5 animate-spin"
                              aria-hidden="true"
                            />
                          ) : (
                            <CheckCircle2
                              className="size-3.5"
                              aria-hidden="true"
                            />
                          )}
                          Potrdi poravnavo
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Odprte postavke */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Odprte postavke ({data.openPendingCount.toLocaleString("sl-SI")})
            </div>
            {data.pendingEntries.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Ni odprtih postavk — vse plačane rezervacije so že usklajene v
                poravnavah.
              </div>
            ) : (
              <div className="rounded-lg border border-border/60 divide-y divide-border/60 max-h-96 overflow-y-auto">
                {data.pendingEntries.map((e) => (
                  <div
                    key={e.id}
                    className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-muted-foreground">
                          {e.bookingNumber}
                        </span>
                        <Badge variant="secondary" className="text-[11px]">
                          {e.source === "consultation"
                            ? "AI kanal"
                            : "Direktno"}
                        </Badge>
                      </div>
                      <p className="text-sm font-medium truncate mt-0.5">
                        {e.experienceName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {fmtDay(e.bookingDate)} · {e.groupSize}{" "}
                        {e.groupSize === 1 ? "oseba" : "oseb"}
                      </p>
                    </div>
                    <div className="text-sm text-right shrink-0">
                      <span className="tabular-nums font-semibold">
                        {fmtEur(e.netAmount)}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {" "}
                        neto
                      </span>
                      <span className="text-muted-foreground text-xs block">
                        bruto {fmtEur(e.grossAmount)}
                        {e.commissionAmount > 0
                          ? ` · provizija ${fmtEur(e.commissionAmount)}`
                          : ""}
                      </span>
                    </div>
                  </div>
                ))}
                {data.openPendingCount > data.pendingEntries.length && (
                  <div className="p-3 text-center text-xs text-muted-foreground">
                    … in še{" "}
                    {data.openPendingCount - data.pendingEntries.length} starejših
                    odprtih postavk.
                  </div>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Potrditev poravnave — knjigovodska uskladitev */}
      <AlertDialog
        open={confirmId !== null}
        onOpenChange={(open) => !open && setConfirmId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Potrdim poravnavo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmSettlement
                ? `S potrditvijo ${confirmSettlement.settlementNumber} izjavljaš, da je evidenca usklajena (${confirmSettlement.entryCount} ${confirmSettlement.entryCount === 1 ? "postavka" : "postavk"}, neto ${fmtEur(confirmSettlement.netTotal)}). To je knjigovodska potrditev — prenosov denarja platforma ne izvaja.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Prekliči</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmId && handleSettle(confirmId)}
            >
              Potrdi uskladitev
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
