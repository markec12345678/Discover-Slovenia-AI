"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale } from "next-intl";
import {
  ShoppingBag,
  CalendarCheck,
  Mail,
  Loader2,
  Search,
  RefreshCw,
  Trash2,
  Package,
  Info,
  AlertCircle,
  Users,
  Ban,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
// FW2-B lib — defensiven localStorage dostop do številk (ključi
// "dai:my-orders" / "dai:my-bookings", array nizov, najnovejše najprej).
// 99-b: writeList (odstrani/izprazni) + oba ključa prihajata IZ LIB-a
// (nekdaj duplicirani tukaj z lastnim LIST_CAP).
import {
  getOrderNumbers,
  getBookingNumbers,
  writeList,
  ORDERS_KEY,
  BOOKINGS_KEY,
} from "@/lib/my-orders-storage";

// TASK 8 / F3-B: aria oznake nalaganja v L-pattern (SL/EN — D8-A §13
// „Nalagam…" uhodi so trdi predpogoj za F3-E EN razširitev).
const L = {
  loadingOrders: { sl: "Nalagam naročila", en: "Loading orders" },
  loadingBookings: { sl: "Nalagam rezervacije", en: "Loading reservations" },
} as const;

// ============================================================================
// MOJA NAROČILA IN REZERVACIJE — lokalna zgodovina za popotnika (FW2-C)
// ============================================================================
//
// Problem: gostje (pogosto neprijavljeni) opravijo nakup/rezervacijo in
// številko vidijo le enkrat v potrditvi modala. Brez te sekcije ni nobene
// zgodovine naročil.
//
// Vir podatkov: localStorage številke (dai:my-orders / dai:my-bookings —
// zapisuje checkout-modal / experience-modal prek FW2-B lib). Podatke o
// posameznem naročilu/rezervaciji pridobimo iz JAVNIH GET API-jev:
//   GET /api/orders/[orderNumber]?email=…    → { order }   (404, če email
//   GET /api/bookings/[bookingNumber]?email=… → { booking }  se ne ujema)
//
// E-POŠTA: obema API-jeva zahtevata ?email=, ki se mora ujemati s kupčevo/
// gostovo (PII zaščita). Številke same so nesignificiran identifikator, zato
// od uporabnika zahtevamo potrditev e-pošte (isti, kot jo je navedel ob
// nakupu). Zadnjo uporabljeno e-pošto si lokalno zapomnimo (ključ spodaj)
// — vsebina je PII, a ostaja ZAUPNIJ doma: lastnikovega brskalnika.
//
// INVARIANTA (hitrost): lookup API-ja sta rate-limited na 20/10 min na IP —
// zato naolistamo največ 20 ZADNJIH številk na seznam (starejše bi v prvem
// valu vseeno padle v 429).
// ============================================================================

/** Lokalni ključ za zadnjo e-pošto (lastnina FW2-C, NI del FW2-B lib kontrakta). */
const MY_EMAIL_KEY = "dai:my-email";

/** Lookup API-ja dovolita 20 zahtev / 10 min — toliko jih tudi naložimo. */
const FETCH_CAP = 20;

// Seznama številk (ORDERS_KEY/BOOKINGS_KEY) in pisanje celih seznamov
// (writeList) prihajata iz FW2-B lib — 99-b: enkraten vir, brez lokalne
// replikacije kap/ključev.

// --- Odgovori API-jev (podmnožice, ki jih prikažemo) ----------------------

interface OrderData {
  orderNumber: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  items?: unknown[];
}

interface BookingData {
  bookingNumber: string;
  experienceName: string;
  bookingDate: string;
  status: string;
  total: number;
  currency: string;
  groupSize: number;
  /** TASK 99 (§10) — gostov zahtevek preklica (customer state). */
  customerStatus?: string;
}

/** Vrstica seznama: ok | missing (404) | failed (omrežje/429) | needsEmail. */
type EntryStatus = "ok" | "missing" | "failed" | "needsEmail";

interface ListEntry<T> {
  number: string;
  status: EntryStatus;
  data?: T;
}

// --- Slovenske oznake statusov ---------------------------------------------

const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: "V obdelavi",
  paid: "Plačano",
  shipped: "Poslano",
  delivered: "Dostavljeno",
  cancelled: "Preklicano",
  refunded: "Refundirano",
};

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Na čakanju",
  confirmed: "Potrjena",
  cancelled: "Preklicana",
  completed: "Zaključena",
};

// --- Pomožne funkcije -------------------------------------------------------

function formatMoney(amount: number, currency = "EUR"): string {
  try {
    return new Intl.NumberFormat("sl-SI", {
      style: "currency",
      currency,
      minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("sl-SI", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Preberi lokalno shranjeno e-pošto (defenzivno — pokvarjena/neobstoječa → ""). */
function readStoredEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    const raw = window.localStorage.getItem(MY_EMAIL_KEY);
    if (typeof raw !== "string") return "";
    let value = raw.trim();
    // Koruptna oblika: JSON-quoted niz (npr. '"ime@x.si"') — razveljavi
    // narekovaje pred validacijo, sicer regex %22 pošlje v query string.
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) {
      try {
        const parsed: unknown = JSON.parse(value);
        if (typeof parsed === "string") value = parsed;
      } catch {
        value = value.slice(1, -1);
      }
    }
    value = value.trim().toLowerCase();
    return EMAIL_RE.test(value) ? value : "";
  } catch {
    return "";
  }
}

/**
 * Zapomni si e-pošto ob uspešnem naročilu (kliče checkout-modal).
 * Defenzivno — poln/zasebni localStorage ne sme sesesti checkout toka.
 */
export function rememberCheckoutEmail(email: string): void {
  if (typeof window === "undefined") return;
  try {
    const trimmed = email.trim().toLowerCase();
    if (EMAIL_RE.test(trimmed)) {
      window.localStorage.setItem(MY_EMAIL_KEY, trimmed);
    }
  } catch {
    // Preskoči — prikaz zgodovine je "nice to have", ne kritičen tok
  }
}

// ============================================================================
// KOMPONENTA
// ============================================================================

interface MyOrdersSectionProps {
  /** Predlog e-pošte (prijavna seja) — uporabnik jo lahko popravi. */
  defaultEmail?: string;
}

export function MyOrdersSection({ defaultEmail = "" }: MyOrdersSectionProps) {
  const { toast } = useToast();
  // TASK 8 / F3-B: jezik za L-pattern aria oznake nalaganja (SL privzeto).
  const locale = useLocale();
  const lang: "sl" | "en" = locale === "en" ? "en" : "sl";

  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [orderNumbers, setOrderNumbers] = useState<string[]>([]);
  const [bookingNumbers, setBookingNumbers] = useState<string[]>([]);
  const [orders, setOrders] = useState<ListEntry<OrderData>[]>([]);
  const [bookings, setBookings] = useState<ListEntry<BookingData>[]>([]);

  // --- Nalaganje vseh številk (vzporedno, allSettled) ----------------------
  const loadAll = useCallback(
    async (lookupEmail: string, oNums: string[], bNums: string[]) => {
      setLoading(true);
      try {
        // Vzporedni GET klici — en odpoved ne sesuje ostalih (allSettled).
        const q = `email=${encodeURIComponent(lookupEmail)}`;
        const orderTasks = oNums
          .slice(0, FETCH_CAP)
          .map(async (n): Promise<ListEntry<OrderData>> => {
            try {
              const res = await fetch(
                `/api/orders/${encodeURIComponent(n)}?${q}`,
                { cache: "no-store" }
              );
              if (res.status === 404) return { number: n, status: "missing" };
              const body = (await res.json().catch(() => null)) as {
                order?: OrderData;
              } | null;
              if (!res.ok || !body?.order) {
                return { number: n, status: "failed" };
              }
              return { number: n, status: "ok", data: body.order };
            } catch {
              return { number: n, status: "failed" };
            }
          });

        const bookingTasks = bNums
          .slice(0, FETCH_CAP)
          .map(async (n): Promise<ListEntry<BookingData>> => {
            try {
              const res = await fetch(
                `/api/bookings/${encodeURIComponent(n)}?${q}`,
                { cache: "no-store" }
              );
              if (res.status === 404) return { number: n, status: "missing" };
              const body = (await res.json().catch(() => null)) as {
                booking?: BookingData;
              } | null;
              if (!res.ok || !body?.booking) {
                return { number: n, status: "failed" };
              }
              return { number: n, status: "ok", data: body.booking };
            } catch {
              return { number: n, status: "failed" };
            }
          });

        const [oResults, bResults] = await Promise.all([
          Promise.allSettled(orderTasks),
          Promise.allSettled(bookingTasks),
        ]);

        // allSettled nad že-lovljenimi taski — rejected je teoretičen
        setOrders(
          oResults.map((r, i) =>
            r.status === "fulfilled" ? r.value : { number: oNums[i], status: "failed" }
          )
        );
        setBookings(
          bResults.map((r, i) =>
            r.status === "fulfilled"
              ? r.value
              : { number: bNums[i], status: "failed" }
          )
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // --- Mount: preberi lokalne sezname + e-pošto, samodejni lookup ----------
  useEffect(() => {
    const oNums = getOrderNumbers();
    const bNums = getBookingNumbers();
    setOrderNumbers(oNums);
    setBookingNumbers(bNums);

    const initial = readStoredEmail() || defaultEmail.toLowerCase().trim();
    setEmail(initial);
    if (initial && (oNums.length > 0 || bNums.length > 0)) {
      void loadAll(initial, oNums, bNums);
    } else {
      // Brez e-pošte pokaži le sledene številke (brez podatkov) — uporabnik
      // vpiše e-pošto in pritisne "Prikaži" za prvi lookup.
      setOrders(oNums.map((n) => ({ number: n, status: "needsEmail" })));
      setBookings(bNums.map((n) => ({ number: n, status: "needsEmail" })));
    }
    // Mount-only: defaultEmail je stabilen (komponenta se renderira šele pri
    // avtentificirani seji), seznamov v localStorage pa med življenjsko dobo
    // strani ne spreminjamo izven tega hooka.
  }, []);

  // --- Roki uporabnika -------------------------------------------------------

  /** Potrdi e-pošto in pridobi podatke. */
  const handleLookup = () => {
    const trimmed = email.trim().toLowerCase();
    if (!EMAIL_RE.test(trimmed)) {
      toast({
        variant: "destructive",
        title: "Neveljaven e-poštni naslov",
        description: "Vnesite e-pošto, ki ste jo navedli ob nakupu ali rezervaciji.",
      });
      return;
    }
    // Zapomni si (defenzivno) — naslednji obisk samodejno naloži
    rememberCheckoutEmail(trimmed);
    void loadAll(trimmed, orderNumbers, bookingNumbers);
  };

  /** Odstrani številko iz LOKALNEGA seznama (brez strežniškega klica). */
  const handleRemove = (kind: "orders" | "bookings", number: string) => {
    if (kind === "orders") {
      const next = orderNumbers.filter((n) => n !== number);
      writeList(ORDERS_KEY, next);
      setOrderNumbers(next);
      setOrders((prev) => prev.filter((e) => e.number !== number));
    } else {
      const next = bookingNumbers.filter((n) => n !== number);
      writeList(BOOKINGS_KEY, next);
      setBookingNumbers(next);
      setBookings((prev) => prev.filter((e) => e.number !== number));
    }
  };

  /** Izprazni cel LOKALNI seznam (potrditev v dialogu ni potrebna — dejanje
      briše samo lokalne številke, ne podatkov na strežniku). */
  const handleClear = (kind: "orders" | "bookings") => {
    if (kind === "orders") {
      writeList(ORDERS_KEY, []);
      setOrderNumbers([]);
      setOrders([]);
    } else {
      writeList(BOOKINGS_KEY, []);
      setBookingNumbers([]);
      setBookings([]);
    }
    toast({ title: "Seznam izpraznjen", description: "Lokalna zgodovina je odstranjena s te naprave." });
  };

  const total = orderNumbers.length + bookingNumbers.length;
  const hasDetails =
    orders.some((e) => e.status === "ok") || bookings.some((e) => e.status === "ok");
  // Zunaj FETCH_CAP ležijo starejše številke (lookup limita) — honestna opomba.
  const truncated =
    orderNumbers.length > FETCH_CAP || bookingNumbers.length > FETCH_CAP;

  const anyFailed = useMemo(
    () =>
      orders.some((e) => e.status === "failed") ||
      bookings.some((e) => e.status === "failed"),
    [orders, bookings]
  );

  // =========================================================================
  // RENDER
  // =========================================================================

  return (
    <section aria-labelledby="moja-narocila-heading">
      <div className="flex items-center justify-between gap-3">
        <h2
          id="moja-narocila-heading"
          className="flex items-center gap-2 text-lg font-semibold"
        >
          <ShoppingBag className="size-5 text-primary" aria-hidden="true" />
          Moja naročila in rezervacije
        </h2>
        <Badge variant="secondary">{total}</Badge>
      </div>

      {total === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-border bg-background/60 p-8 text-center text-sm text-muted-foreground">
          Ni še nobenih naročil ali rezervacij.
        </p>
      ) : (
        <>
          {/* E-poštna potrditev (PII zaščita javnih API-jev) */}
          <div className="mt-4 rounded-xl border border-border/60 bg-muted/30 p-4">
            <Label
              htmlFor="my-orders-email"
              className="flex items-center gap-1.5 text-sm font-medium"
            >
              <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
              E-pošta, navedena ob nakupu
            </Label>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <Input
                id="my-orders-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ime@primer.si"
                autoComplete="email"
                className="bg-background"
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleLookup();
                }}
              />
              <Button
                className="gap-1.5 bg-primary font-semibold text-primary-foreground hover:bg-primary/90"
                onClick={handleLookup}
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Search className="size-4" aria-hidden="true" />
                )}
                Prikaži
              </Button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Zaradi varnosti podatkov potrjujemo e-pošto — naročila in
              rezervacije se prikažejo samo, če se naslov ujema z navedenim ob
              nakupu.
            </p>
            {anyFailed && (
              <p role="note" className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Nekaterih podatkov ni bilo mogoče naložiti (omejitev iskanja
                je 20 prikazov na 10 minut) — poskusite znova kasneje.
              </p>
            )}
            {truncated && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                Prikazanih je zadnjih 20 posameznih številk na seznam — starejša
                zgodovina je izven omejitve javnega iskanja.
              </p>
            )}
          </div>

          {/* === NAROČILA === */}
          {orderNumbers.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <Package className="size-4 text-primary" aria-hidden="true" />
                  Naročila
                  <Badge variant="outline" className="font-normal">
                    {orderNumbers.length}
                  </Badge>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleClear("orders")}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Počisti seznam
                </Button>
              </div>

              {loading && !hasDetails ? (
                <div
                  className="mt-3 space-y-2"
                  aria-busy="true"
                  aria-label={L.loadingOrders[lang]}
                >
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : (
                <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {orders.map((entry) => (
                    <li key={entry.number}>
                      <OrderCard
                        entry={entry}
                        onRemove={() => handleRemove("orders", entry.number)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* === REZERVACIJE === */}
          {bookingNumbers.length > 0 && (
            <div className="mt-6">
              <div className="flex items-center justify-between gap-3">
                <h3 className="flex items-center gap-2 text-base font-semibold">
                  <CalendarCheck className="size-4 text-primary" aria-hidden="true" />
                  Rezervacije
                  <Badge variant="outline" className="font-normal">
                    {bookingNumbers.length}
                  </Badge>
                </h3>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleClear("bookings")}
                >
                  <Trash2 className="size-3.5" aria-hidden="true" />
                  Počisti seznam
                </Button>
              </div>

              {loading && !hasDetails ? (
                <div
                  className="mt-3 space-y-2"
                  aria-busy="true"
                  aria-label={L.loadingBookings[lang]}
                >
                  <Skeleton className="h-20 w-full rounded-xl" />
                  <Skeleton className="h-20 w-full rounded-xl" />
                </div>
              ) : (
                <ul className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
                  {bookings.map((entry) => (
                    <li key={entry.number}>
                      <BookingCard
                        entry={entry}
                        email={email.trim().toLowerCase()}
                        onRemove={() => handleRemove("bookings", entry.number)}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Osveži — ponovni lookup z (potencialno drugo) e-pošto */}
          <div className="mt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleLookup}
              disabled={loading}
            >
              <RefreshCw
                className={cn("size-3.5", loading && "animate-spin")}
                aria-hidden="true"
              />
              Osveži
            </Button>
          </div>
        </>
      )}
    </section>
  );
}

/** Besedilo vrstične kartice, kadar podrobnosti niso na voljo. */
function entryNotice(status: EntryStatus, what: string): string {
  switch (status) {
    case "missing":
      return `Ni najden — preverite e-pošto, navedeno ob ${what}.`;
    case "needsEmail":
      return "Vnesite e-pošto zgoraj za prikaz podrobnosti.";
    default:
      return "Ni mogoče naložiti — poskusite znova kasneje.";
  }
}

/* ---------------- Kartica naročila ---------------- */

function OrderCard({
  entry,
  onRemove,
}: {
  entry: ListEntry<OrderData>;
  onRemove: () => void;
}) {
  if (entry.status !== "ok" || !entry.data) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-mono text-sm font-medium text-muted-foreground">
              {entry.number}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-8 px-2 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label={`Odstrani naročilo ${entry.number} s seznama`}
              title="Odstrani s seznama (podatki ostanejo pri ponudniku)"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            {entryNotice(entry.status, "nakupu")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const o = entry.data;
  const label = ORDER_STATUS_LABELS[o.status] ?? o.status;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="font-mono text-sm font-semibold">
            {o.orderNumber}
          </CardTitle>
          <StatusBadge label={label} status={o.status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">
            {formatDate(o.createdAt)}
            {Array.isArray(o.items) && o.items.length > 0
              ? ` · ${o.items.length} ${o.items.length === 1 ? "izdelek" : o.items.length < 5 ? "izdelki" : "izdelkov"}`
              : ""}
          </span>
          <span className="font-bold tabular-nums">
            {formatMoney(o.total, o.currency)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ---------------- Kartica rezervacije ---------------- */

function BookingCard({
  entry,
  email,
  onRemove,
}: {
  entry: ListEntry<BookingData>;
  /** TASK 99 — za zahtevek preklica (lastništvo po e-pošti). */
  email: string;
  onRemove: () => void;
}) {
  // TASK 99 (§10) — gostov zahtevek preklica: lokalno stanje + POST.
  const [cancelMsg, setCancelMsg] = useState<string | null>(null);
  const [cancelErr, setCancelErr] = useState<string | null>(null);
  const [requesting, setRequesting] = useState(false);

  const requestCancellation = async () => {
    if (!entry.data || requesting) return;
    setRequesting(true);
    setCancelErr(null);
    try {
      const res = await fetch(
        `/api/bookings/${encodeURIComponent(entry.number)}/cancel-request`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }
      );
      const data = (await res.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      if (res.ok && data.success) {
        setCancelMsg(data.message ?? "Zahtevek za preklic je zabeležen.");
        // Lokalna posodobitev stanja (brez ponovnega iskanja)
        entry.data.customerStatus = "cancellation_requested";
      } else {
        setCancelErr(data.error ?? "Zahtevek ni uspel — poskusite znova.");
      }
    } catch {
      setCancelErr("Omrežna napaka — poskusite znova.");
    } finally {
      setRequesting(false);
    }
  };

  if (entry.status !== "ok" || !entry.data) {
    return (
      <Card className="border-dashed">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="font-mono text-sm font-medium text-muted-foreground">
              {entry.number}
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 min-w-8 px-2 text-muted-foreground hover:text-destructive"
              onClick={onRemove}
              aria-label={`Odstrani rezervacijo ${entry.number} s seznama`}
              title="Odstrani s seznama (podatki ostanejo pri ponudniku)"
            >
              <Trash2 className="size-4" aria-hidden="true" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-muted-foreground">
            {entryNotice(entry.status, "rezervaciji")}
          </p>
        </CardContent>
      </Card>
    );
  }

  const b = entry.data;
  const label = BOOKING_STATUS_LABELS[b.status] ?? b.status;

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="line-clamp-1 text-sm font-semibold">
            {b.experienceName}
          </CardTitle>
          <StatusBadge label={label} status={b.status} />
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <CalendarCheck className="size-3.5 shrink-0" aria-hidden="true" />
            {formatDate(b.bookingDate)}
            {b.groupSize > 0 && (
              <>
                <span className="mx-0.5" aria-hidden="true">·</span>
                <Users className="size-3.5 shrink-0" aria-hidden="true" />
                {b.groupSize}
              </>
            )}
          </span>
          <span className="font-bold tabular-nums">
            {formatMoney(b.total, b.currency)}
          </span>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {b.bookingNumber}
        </p>
        {/* TASK 99 (§10) — customer state: gostov zahtevek preklica
            (iskreno: zahtevek, NE preklic — izvede ponudnik). */}
        {(b.status === "pending" || b.status === "confirmed") &&
          b.customerStatus === "cancellation_requested" && (
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1.5 text-xs text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              Zahtevek za preklic je zabeležen — ponudnik ga bo obravnaval.
            </p>
          )}
        {(b.status === "pending" || b.status === "confirmed") &&
          b.customerStatus !== "cancellation_requested" && (
            <div className="mt-2">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={requestCancellation}
                disabled={requesting || !email}
                title={
                  email
                    ? "Pošlje zahtevek za preklic ponudniku (preklic potrdi on)"
                    : "Najprej potrdite e-pošto zgoraj"
                }
              >
                {requesting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Ban className="size-3.5" aria-hidden="true" />
                )}
                Zahtevaj preklic
              </Button>
            </div>
          )}
        {cancelMsg && (
          <p role="status" className="mt-2 text-xs text-emerald-700 dark:text-emerald-400">
            {cancelMsg}
          </p>
        )}
        {cancelErr && (
          <p role="alert" className="mt-2 text-xs text-destructive">
            {cancelErr}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Statusna značka ---------------- */

function StatusBadge({ label, status }: { label: string; status: string }) {
  if (status === "paid" || status === "confirmed" || status === "delivered") {
    return (
      <Badge className="gap-1 border-emerald-300/60 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
        {label}
      </Badge>
    );
  }
  if (status === "pending" || status === "shipped") {
    return (
      <Badge
        variant="outline"
        className="gap-1 text-amber-700 dark:text-amber-400"
      >
        {label}
      </Badge>
    );
  }
  if (status === "cancelled" || status === "refunded") {
    return <Badge variant="destructive">{label}</Badge>;
  }
  return <Badge variant="secondary">{label}</Badge>;
}

export default MyOrdersSection;
