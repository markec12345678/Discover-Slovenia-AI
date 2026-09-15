"use client";

import { useState } from "react";
import { Calculator, Info, TrendingDown, TrendingUp } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

// Naročninski model — zrcali strežniške konstante:
//   - src/lib/commissions.ts: COMMISSION_RATE = 0.12 (12 %) in velja SAMO za
//     rezervacije z Booking.source = "consultation" (AI kanal);
//   - src/lib/pricing.ts: Premium 149 €/mes, 0 % provizije.
// NE importiramo teh modulov direktno, ker commissions.ts vleče Prisma
// klient v client bundle — konstante so stabilne in dokumentirane.
const FREE_COMMISSION_PCT = 0.12;
const PREMIUM_MONTHLY_EUR = 149;
/** 149 / 0,12 ≈ 1.242 €/mes — nad tem prihodkom je Premium cenejši. */
const BREAK_EVEN_EUR = Math.round(PREMIUM_MONTHLY_EUR / FREE_COMMISSION_PCT);
const MAX_REVENUE_EUR = 5000;
const STEP_EUR = 50;
const DEFAULT_PREFILL_EUR = 500;

/** Uskladi vrednost v veljaven korak drsnika (0–5.000, korak 50). */
function clampToStep(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  const stepped = Math.round(value / STEP_EUR) * STEP_EUR;
  return Math.min(MAX_REVENUE_EUR, stepped);
}

const fmtEur = (n: number) => `${Math.round(n).toLocaleString("sl-SI")} €`;

interface SubscriptionCalculatorProps {
  /**
   * Predlog prihodka na mesec (npr. aiChannel.revenueFromConsultations
   * iz /api/owner/analytics). Če ni podan, se začne na 500 €.
   */
  prefillEur?: number;
  /** Ali predlog prihaja iz realne statistike ownerja (prikaže opombo). */
  prefillFromStats?: boolean;
  /** Ob vsaki spremembi vrednosti (za tracking — debounce naredi klicatelj). */
  onInteract?: () => void;
}

/**
 * SubscriptionCalculator — interaktiven prelomni kalkulator naročnine.
 *
 * Pošteno primerja:
 *   - Free: 12 % provizije, plača se SAMO iz AI-konzultacijskih rezervacij;
 *   - Premium: fiksno 149 €/mes, 0 % provizije.
 *
 * Pri nizkih prihodkih OTKRITO pove, da je Free cenejši (brez potiskanja);
 * prelomna točka (~1.242 €/mes) je vizualno označena na drsniku.
 */
export function SubscriptionCalculator({
  prefillEur,
  prefillFromStats = false,
  onInteract,
}: SubscriptionCalculatorProps) {
  const [revenue, setRevenue] = useState<number>(() =>
    clampToStep(prefillEur ?? DEFAULT_PREFILL_EUR)
  );
  // Ali je uporabnik že vzel drsnik v roke (potem predloga ne prepišemo).
  const [userTouched, setUserTouched] = useState(false);

  // Predlog lahko pride kasneje (async statistike) — uskladi vrednost z
  // vzorcem "adjust state during render" (react.dev, brez efekta) in SAMO
  // dokler uporabnik še ni vzel drsnika v roke (brez skakanja pod prsti).
  const [lastPrefill, setLastPrefill] = useState<number | undefined>(
    prefillEur
  );
  if (prefillEur !== lastPrefill) {
    setLastPrefill(prefillEur);
    if (!userTouched && typeof prefillEur === "number") {
      setRevenue(clampToStep(prefillEur));
    }
  }

  const handleSliderChange = (value: number[]) => {
    setUserTouched(true);
    setRevenue(value[0] ?? DEFAULT_PREFILL_EUR);
    onInteract?.();
  };

  // === Živi izračun ===
  const freeCommission = revenue * FREE_COMMISSION_PCT;
  const savings = freeCommission - PREMIUM_MONTHLY_EUR; // prihranek z Premium
  const premiumWins = savings > 0;
  const breakEvenPct = (BREAK_EVEN_EUR / MAX_REVENUE_EUR) * 100;

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <div className="flex items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"
            aria-hidden="true"
          >
            <Calculator className="size-5" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-lg">
              Prelomni kalkulator: Free ali Premium?
            </CardTitle>
            <CardDescription>
              Premaknite drsnik na vaše mesečne prihodke prek AI kanala —
              spodaj se takoj vidi, kateri paket je za vas cenejši.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* === VHOD: drsnik + številčni prikaz === */}
        <div>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-x-3 gap-y-1">
            <span className="text-sm font-medium">
              Prihodki na mesec prek AI kanala (€)
            </span>
            <output
              className="text-2xl font-bold tabular-nums text-primary"
              aria-live="off"
            >
              {fmtEur(revenue)}
            </output>
          </div>

          <div className="relative py-2">
            <Slider
              value={[revenue]}
              onValueChange={handleSliderChange}
              min={0}
              max={MAX_REVENUE_EUR}
              step={STEP_EUR}
              aria-label="Prihodki na mesec prek AI kanala, v evrih"
              aria-valuetext={`${fmtEur(revenue)} na mesec`}
            />
            {/* Prelomna točka — vizualna markacija na drsniku (~24,8 %) */}
            <div
              className="pointer-events-none absolute inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground/60"
              style={{ left: `${breakEvenPct}%` }}
              aria-hidden="true"
            />
          </div>
          <div className="flex justify-between text-xs tabular-nums text-muted-foreground">
            <span>0 €</span>
            <span>5.000 €</span>
          </div>
          <div className="relative h-4" aria-hidden="true">
            <span
              className="pointer-events-none absolute top-0 whitespace-nowrap text-[10px] font-medium text-primary/90"
              style={{ left: `${breakEvenPct}%` }}
            >
              ↑ prelom {fmtEur(BREAK_EVEN_EUR)}/mes
            </span>
          </div>
          {prefillFromStats && (
            <p className="mt-2 text-xs text-muted-foreground">
              Vrednost je predlagana iz vaše statistike (rezervacije prek AI
              konzultacij) — po potrebi jo prilagodite z drsnikom.
            </p>
          )}
        </div>

        {/* === PRIMERJAVA: dva stolpca === */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* FREE */}
          <div
            className={cn(
              "space-y-3 rounded-xl border p-4",
              !premiumWins
                ? "border-2 border-primary bg-primary/5"
                : "border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold">Free</h4>
              {!premiumWins && (
                <Badge className="border-0 bg-primary text-primary-foreground">
                  Cenejši za vas
                </Badge>
              )}
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {fmtEur(freeCommission)}
                <span className="text-sm font-normal text-muted-foreground">
                  /mes
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                provizija, plača se ob prihodku
              </p>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>12 % provizije na rezervacije iz AI konzultacij</li>
              <li>0 € fiksno — brez naročnine</li>
            </ul>
          </div>

          {/* PREMIUM */}
          <div
            className={cn(
              "space-y-3 rounded-xl border p-4",
              premiumWins
                ? "border-2 border-primary bg-primary/5"
                : "border-border"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <h4 className="font-bold">Premium</h4>
              {premiumWins && (
                <Badge className="border-0 bg-primary text-primary-foreground">
                  Cenejši za vas
                </Badge>
              )}
            </div>
            <div>
              <div className="text-2xl font-bold tabular-nums">
                {fmtEur(PREMIUM_MONTHLY_EUR)}
                <span className="text-sm font-normal text-muted-foreground">
                  /mes
                </span>
              </div>
              <p className="text-xs text-muted-foreground">fiksno, neodvisno od prihodka</p>
            </div>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>0 % provizije — tudi na AI-konzultacijskih rezervacijah</li>
              <li>Za 149 €/mes višji paket z vsemi ugodnostmi</li>
            </ul>
          </div>
        </div>

        {/* === PRIHRANEK === */}
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium",
            premiumWins
              ? "bg-primary/10 text-primary"
              : "bg-destructive/10 text-destructive"
          )}
        >
          {premiumWins ? (
            <>
              <TrendingUp className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Prihranek z Premium: <strong>+{fmtEur(savings)}/mes</strong>
              </span>
            </>
          ) : (
            <>
              <TrendingDown className="size-4 shrink-0" aria-hidden="true" />
              <span>
                Premium bi vas stal{" "}
                <strong>{fmtEur(Math.abs(savings))}/mes</strong> več kot Free
              </span>
            </>
          )}
        </div>

        {/* === PRIPOROČILO (živi povzetek) === */}
        <p className="text-sm leading-relaxed" aria-live="polite">
          <strong>
            Pri vaših {fmtEur(revenue)}/mes se Premium{" "}
            {premiumWins ? "izplača" : "še ne izplača"}
          </strong>{" "}
          — prelomna točka je {fmtEur(BREAK_EVEN_EUR)}/mes.
          {!premiumWins && (
            <>
              {" "}
              Pri teh prihodkih vam iskreno priporočamo, da ostanete na{" "}
              <strong>Free</strong> paketu.
            </>
          )}
        </p>

        {/* === POŠTENOST === */}
        <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <p>
            Provizija 12 % se obračuna izključno iz rezervacij, ki jih prinese
            AI kanal (brezplačne konzultacije popotnikom) — prihodki iz
            neposrednih rezervacij in lastnih kanalov ostanejo 100 % vaši, na
            obeh paketih. Kalkulator je informativen in ne zavezuje.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
