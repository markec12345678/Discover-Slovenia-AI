"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Megaphone,
  Loader2,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Star,
  Zap,
  Info,
  CreditCard,
  Clock,
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { Listing } from "@/lib/listings-types";

// ============================================================================
// SPONSORSHIP PANEL — B2B promocija lokalov (Premium / Featured)
// ============================================================================
//
// FW2-C: API /api/owner/sponsorship je obstajal, vendar BREZ frontend
// klicalca (0 UI entry). Ta panel zapre to vrzelo v zavihku "Naročnina".
//
// Kontrakt API-ja (route je v TUJI lasti — spreminjamo ga NE):
//   GET  → { sponsorships: SponsorshipItem[] } (createdAt desc)
//   POST { listingId, level } →
//     demo:       { success: true, demo: true,  message, sponsorshipId, redirectUrl: null }
//     produkcija: { success: true, redirectUrl: <Stripe checkout URL>, sponsorshipId }
//     napaka:     { error } (400/401/403/404/500)
//
// CLIENT NE VE, v katerem načinu je strežnik (isStripeDemo je server-only) —
// zato NEVTRALNA rešitev: po POST preverimo `redirectUrl`. Če je URL →
// preusmeritev na Stripe checkout; če ni (demo) → smatramo kot aktivirano.
// Rute NE moremo spraševati po demo flagu (GET ne vrača demo polja).
// ============================================================================

/** Postavka sponzorstva (podmnožica odgovora GET /api/owner/sponsorship). */
interface SponsorshipItem {
  id: string;
  listingId: string;
  level: string;
  amount: number;
  currency: string;
  status: string;
  startsAt: string;
  endsAt: string;
  createdAt: string;
  listing: { name: string; slug: string; partnerStatus?: string } | null;
}

interface SponsorshipPanelProps {
  /** Lastnikovi lokalci (dashboard jih že nalaga — brez dodatnega fetcha). */
  listings: Listing[];
}

/** Paketa sponzorstva (cene/usklajeno s SPONSORSHIP_PRICES na serverju). */
const LEVELS: Array<{
  value: "premium" | "featured";
  label: string;
  price: number;
  boost: string;
  extra: string;
  requirement?: string;
}> = [
  {
    value: "premium",
    label: "Premium",
    price: 149,
    boost: "5 % AI boost",
    extra: "Premium značka ob imenu lokala",
  },
  {
    value: "featured",
    label: "Featured",
    price: 299,
    boost: "5 % AI boost",
    extra: "Featured značka + najvišja izpostavljenost",
    // Strežnik za featured zahteva Quality Score > 90 + admin verifikacijo.
    requirement: "Zahteva kakovost lokalov > 90 in admin verifikacijo",
  },
];

/** Slovenske oznake statusov sponzorstev (model Sponsorship.status). */
const SPONSORSHIP_STATUS_LABELS: Record<string, string> = {
  created: "Čaka plačilo",
  paid: "Plačano",
  active: "Aktivno",
  expiring: "Poteka",
  expired: "Poteklo",
  cancelled: "Preklicano",
  archived: "Arhivirano",
};

/** Statusi, pod katerimi lokal ŠE NE more dobiti novega sponzorstva. */
const BLOCKING_STATUSES = new Set(["active", "paid", "created"]);

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("sl-SI", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function SponsorshipPanel({ listings }: SponsorshipPanelProps) {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sponsorships, setSponsorships] = useState<SponsorshipItem[]>([]);

  // Nakup: izbira lokalca + paketa
  const [selectedListingId, setSelectedListingId] = useState<string>("");
  const [selectedLevel, setSelectedLevel] = useState<"premium" | "featured">(
    "premium"
  );
  const [submitting, setSubmitting] = useState(false);

  // --- Nalaganje seznamas sponzorstev -------------------------------------
  const loadSponsorships = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/owner/sponsorship", { cache: "no-store" });
      const data = (await res.json().catch(() => null)) as {
        sponsorships?: SponsorshipItem[];
        error?: string;
      } | null;
      if (!res.ok || !data) {
        throw new Error(data?.error ?? "Nalaganje sponzorstev ni uspelo.");
      }
      setSponsorships(Array.isArray(data.sponsorships) ? data.sponsorships : []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : "Nalaganje sponzorstev ni uspelo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSponsorships();
  }, [loadSponsorships]);

  // --- Izpeljani podatki ----------------------------------------------------
  // Objavljeni lokalci (API zahteva status "published" pred aktivacijo).
  const publishedListings = useMemo(
    () => listings.filter((l) => l.status === "published"),
    [listings]
  );

  // Lokalci z blokiranim statusom sponzorstva (server vrne 400 "že ima").
  const blockedListingIds = useMemo(
    () =>
      new Set(
        sponsorships
          .filter((s) => BLOCKING_STATUSES.has(s.status))
          .map((s) => s.listingId)
      ),
    [sponsorships]
  );

  const selectedListing = publishedListings.find(
    (l) => l.id === selectedListingId
  );
  const selectedLevelDef = LEVELS.find((l) => l.value === selectedLevel)!;

  // --- Nakup: POST ----------------------------------------------------------
  const handlePurchase = async () => {
    if (!selectedListingId || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch("/api/owner/sponsorship", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: selectedListingId,
          level: selectedLevel,
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        demo?: boolean;
        message?: string;
        redirectUrl?: string | null;
        sponsorshipId?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        throw new Error(data?.error ?? "Aktivacija sponzorstva ni uspela.");
      }

      // Produkcija: Stripe checkout URL → preusmeritev (demo ga ne vrne).
      if (typeof data.redirectUrl === "string" && data.redirectUrl) {
        window.location.href = data.redirectUrl;
        return;
      }

      // Demo (redirectUrl === null): sponzorstvo je AKTIVNO takoj.
      toast({
        title: data.demo ? "Sponzorstvo aktivirano (demo)" : "Sponzorstvo aktivirano",
        description:
          data.message ??
          `${selectedListing?.name ?? "Lokal"} — paket ${selectedLevelDef.label}.`,
      });
      setSelectedListingId("");
      await loadSponsorships();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <section aria-labelledby="sponzoriranje-heading" className="space-y-3">
      <div>
        <h2
          id="sponzoriranje-heading"
          className="flex items-center gap-2 text-xl font-bold tracking-tight"
        >
          <Megaphone className="size-5 text-primary" aria-hidden="true" />
          Sponzoriranje
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Promovirajte svoj lokal — sponzorirani lokalci dobijo{" "}
          <strong>5-odstotni boost</strong> v AI priporočilih in vidno značko.
        </p>
      </div>

      {/* === AKTIVNA SPONZORSTVA === */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Moja sponzorstva</CardTitle>
              <CardDescription>
                Zgodovina in stanje vseh sponzorstev vaših lokalov.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 shrink-0"
              onClick={() => void loadSponsorships()}
              disabled={loading || submitting}
              aria-label="Osveži seznam sponzorstev"
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
                aria-hidden="true"
              />
              Osveži
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            // Skeleton — enak vzorec kot ostale owner kartice
            <div className="space-y-2" aria-busy="true" aria-label="Nalagam sponzorstva">
              <Skeleton className="h-16 w-full rounded-lg" />
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>
          ) : loadError ? (
            <div className="flex flex-col items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-destructive">
                <AlertCircle className="size-4 shrink-0" aria-hidden="true" />
                {loadError}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => void loadSponsorships()}
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Poskusi znova
              </Button>
            </div>
          ) : sponsorships.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
              Nimate še sponzorstev — izberite lokal spodaj in povečajte njegovo
              vidnost v AI priporočilih.
            </p>
          ) : (
            <ul className="space-y-2">
              {sponsorships.map((s) => (
                <SponsorshipRow key={s.id} item={s} />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* === NAKUP: PROMOVIRAJ SVOJ LOKAL === */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Promoviraj svoj lokal</CardTitle>
          <CardDescription>
            Izberite objavljeni lokal in paket promocije za en mesec.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Izbira lokalca — samo OBJAVLJENI (strežniška zahteva) */}
          <div className="space-y-1.5">
            <label
              htmlFor="sponsorship-listing"
              className="text-sm font-medium"
            >
              Lokal
            </label>
            {publishedListings.length === 0 ? (
              <p className="flex items-start gap-2 rounded-lg border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                Sponzorstvo je možno samo za <strong>objavljene</strong> lokale
                — najprej objavite lokal v zavihku &laquo;Moji lokalci&raquo;.
              </p>
            ) : (
              <Select
                value={selectedListingId}
                onValueChange={setSelectedListingId}
                disabled={submitting}
              >
                <SelectTrigger
                  id="sponsorship-listing"
                  className="w-full"
                  aria-label="Izberi lokal za promocijo"
                >
                  <SelectValue placeholder="Izberi lokal …" />
                </SelectTrigger>
                <SelectContent>
                  {publishedListings.map((l) => (
                    <SelectItem
                      key={l.id}
                      value={l.id}
                      disabled={blockedListingIds.has(l.id)}
                    >
                      {l.name}
                      {blockedListingIds.has(l.id) ? " (že sponzoriran)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Izbira paketa — dve kartici */}
          <fieldset className="space-y-1.5" disabled={submitting}>
            <legend className="text-sm font-medium">Paket promocije</legend>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {LEVELS.map((level) => {
                const isSelected = selectedLevel === level.value;
                return (
                  <button
                    key={level.value}
                    type="button"
                    onClick={() => setSelectedLevel(level.value)}
                    aria-pressed={isSelected}
                    className={cn(
                      "rounded-xl border-2 p-4 text-left transition-colors",
                      isSelected
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-semibold">
                        {level.value === "featured" ? (
                          <Star
                            className="size-4 fill-primary text-primary"
                            aria-hidden="true"
                          />
                        ) : (
                          <Zap
                            className="size-4 text-primary"
                            aria-hidden="true"
                          />
                        )}
                        {level.label}
                      </span>
                      <span className="text-lg font-bold tabular-nums">
                        {level.price}&nbsp;€<span className="text-xs font-normal text-muted-foreground">/mes</span>
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm text-muted-foreground">
                      {level.boost} + {level.extra}
                    </p>
                    {level.requirement ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {level.requirement}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* CTA + poštena nevtralna opomba (deluje za demo IN produkcijo) */}
          <div className="space-y-2">
            <Button
              className="w-full gap-2 bg-primary font-semibold text-primary-foreground hover:bg-primary/90 sm:w-auto"
              onClick={() => void handlePurchase()}
              disabled={!selectedListingId || submitting || publishedListings.length === 0}
            >
              {submitting ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <CreditCard className="size-4" aria-hidden="true" />
              )}
              {submitting
                ? "Obdelava …"
                : `Aktiviraj ${selectedLevelDef.label} — ${selectedLevelDef.price} €/mes`}
            </Button>
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Po potrditvi vas preusmerimo na varno plačilo (Stripe); v demo
              okolju se sponzorstvo aktivira neposredno. Featured paket zahteva
              kakovost lokalov nad 90.
            </p>
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

/* ---------------- Vrstica sponzorstva ---------------- */

function SponsorshipRow({ item }: { item: SponsorshipItem }) {
  const isFeatured = item.level === "featured";
  const isActive = item.status === "active" || item.status === "expiring";
  const isBlocking = BLOCKING_STATUSES.has(item.status);

  // Poteka v 7 dneh → ambra opozorilo (kodeks časovnih opozoril v tej kodi).
  const daysLeft = Math.ceil(
    (new Date(item.endsAt).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
  );
  const expiringSoon =
    (item.status === "active" || item.status === "expiring") &&
    Number.isFinite(daysLeft) &&
    daysLeft <= 7;

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-medium">
            {item.listing?.name ?? "Brez imena"}
          </p>
          {/* Level značka: Featured = primarna (zelena), Premium = ambra —
              usklajeno z barvno_kodo paketov v naročninski kartici. */}
          {isFeatured ? (
            <Badge className="gap-1 bg-primary text-primary-foreground hover:bg-primary">
              <Star className="size-3 fill-primary-foreground" aria-hidden="true" />
              Featured
            </Badge>
          ) : (
            <Badge className="gap-1 border-amber-300/60 bg-amber-50 text-amber-800 hover:bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300">
              <Zap className="size-3" aria-hidden="true" />
              Premium
            </Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDate(item.startsAt)} – {formatDate(item.endsAt)} ·{" "}
          {item.amount} €/mes
        </p>
        {/* Featured ima strežniški prag — opomnik uporabniku ob vsakem
            Featured sponzorstvu (5 % AI boost + Q > 90 zahtevo). */}
        {isFeatured && (
          <p className="mt-0.5 text-xs text-muted-foreground">
            Featured: 5 % AI boost + najvišja izpostavljenost (zahteva
            kakovost &gt; 90)
          </p>
        )}
        {expiringSoon && (
          <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700 dark:text-amber-400">
            <Clock className="size-3" aria-hidden="true" />
            {daysLeft >= 0
              ? `Poteka čez ${daysLeft} ${daysLeft === 1 ? "dan" : daysLeft < 5 ? "dneva" : "dni"}`
              : "Že poteklo"}
          </p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isActive && (
          <Badge variant="outline" className="gap-1 text-emerald-700 dark:text-emerald-400">
            <Sparkles className="size-3" aria-hidden="true" />
            +5 % AI boost
          </Badge>
        )}
        <Badge
          variant={isBlocking ? "default" : "secondary"}
          className={cn(
            "gap-1",
            expiringSoon &&
              "border-amber-400/60 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-300"
          )}
        >
          {SPONSORSHIP_STATUS_LABELS[item.status] ?? item.status}
        </Badge>
      </div>
    </li>
  );
}

export default SponsorshipPanel;
