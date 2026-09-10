"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Building2,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Eye,
  MousePointerClick,
  Star,
  Crown,
  Check,
  TrendingUp,
  Loader2,
  AlertCircle,
  Building,
  MapPin,
  Sparkles,
  MessageCircle,
  CalendarCheck,
  ArrowRight,
  ShieldCheck,
  CalendarClock,
  Rocket,
  Gift,
  Zap,
  Package,
  Ticket,
  Euro,
  Clock,
  Users,
  Languages,
  CreditCard,
  Calendar,
  DollarSign,
  ExternalLink,
  Ban,
  Mail,
  Send,
  Activity,
  Target,
  Percent,
  Receipt,
  Banknote,
  FileText,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ListingFormDialog } from "@/components/owner/listing-form";
import { ProductFormDialog } from "@/components/owner/product-form";
import { ExperienceFormDialog } from "@/components/owner/experience-form";
import { BetaBanner } from "@/components/beta-banner";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  STATUS_LABELS,
  type Listing,
  type ListingPlan,
} from "@/lib/listings-types";
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  LANGUAGE_LABELS,
  formatPrice,
  formatDuration,
  type Product,
  type Experience,
  type MarketplacePlan,
} from "@/lib/marketplace-types";
import { PRICING_PLANS, type PricingPlan } from "@/lib/pricing";
import { BETA_INFO } from "@/lib/beta";
import { InsightsPanel } from "@/components/insights-panel";

// Omejitve števila lokalov glede na paket in beta status
const PLAN_LIMITS_NORMAL: Record<ListingPlan, number> = {
  free: 1,
  premium: 5,
  enterprise: Infinity,
};

const PLAN_LIMITS_BETA: Record<ListingPlan, number> = {
  free: 3,
  premium: 8,
  enterprise: Infinity,
};

// Omejitve števila izdelkov glede na paket in beta status
const PRODUCT_PLAN_LIMITS_NORMAL: Record<MarketplacePlan, number> = {
  free: 1,
  premium: 5,
  enterprise: Infinity,
};

const PRODUCT_PLAN_LIMITS_BETA: Record<MarketplacePlan, number> = {
  free: 3,
  premium: 10,
  enterprise: Infinity,
};

// Omejitve števila izkušenj glede na paket in beta status
const EXPERIENCE_PLAN_LIMITS_NORMAL: Record<MarketplacePlan, number> = {
  free: 1,
  premium: 5,
  enterprise: Infinity,
};

const EXPERIENCE_PLAN_LIMITS_BETA: Record<MarketplacePlan, number> = {
  free: 3,
  premium: 10,
  enterprise: Infinity,
};

interface BetaStatus {
  isActive: boolean;
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string;
}

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  const [listings, setListings] = useState<Listing[]>([]);
  const [activeTab, setActiveTab] = useState("listings");
  const [loadingListings, setLoadingListings] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  // P0-1: oddaja v pregled (draft → pending)
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  // Beta status (client-side fetch)
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);

  // Redirect na prijavo če ni prijavljen
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/owner/prijava");
    }
  }, [status, router]);

  // P1: B2C seja (račun popotnika) nima kaj iskati na ponudniškem portalu —
  // vse owner API rute sicer vračajo 401, tukaj pa uporabnika vljudno
  // preusmerimo na njegov portal (Moja potovanja)
  useEffect(() => {
    if (status === "authenticated" && session?.user) {
      const accountType = (session.user as { accountType?: string }).accountType;
      if (accountType === "user") {
        router.replace("/moja-potovanja");
      }
    }
  }, [status, session, router]);

  // Fetch beta status
  useEffect(() => {
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then((d: BetaStatus) => setBetaStatus(d))
      .catch(() => {});
  }, []);

  // Faza 5: povratek s Stripe Checkout (success/cancel redirect).
  // Prebere ?commission=..., pokaže toast, preklopi na zavihek Provizije
  // in počisti URL (history.replaceState — brez ponovnega renderanja).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const commission = params.get("commission");
    if (!commission) return;

    if (commission === "success") {
      setActiveTab("provizije");
      toast({
        title: "Plačilo uspešno",
        description:
          "Račun je poravnan — potrdilo po e-pošti je na poti, status se osveži samodejno.",
      });
    } else if (commission === "cancelled") {
      toast({
        title: "Plačilo preklicano",
        description: "Račun ostaja odprt — lahko poskusite kasneje ali plačate prek SEPA.",
      });
    }

    params.delete("commission");
    const qs = params.toString();
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}${qs ? `?${qs}` : ""}`
    );
  }, [toast]);

  const fetchListings = useCallback(async () => {
    setLoadingListings(true);
    try {
      const res = await fetch("/api/owner/listings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setListings(data.listings || []);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti lokalov.",
      });
    } finally {
      setLoadingListings(false);
    }
  }, [toast]);

  useEffect(() => {
    if (status === "authenticated") {
      fetchListings();
    }
  }, [status, fetchListings]);

  const plan = (session?.user?.plan as ListingPlan) || "free";
  const isBetaActive = betaStatus?.isActive ?? true;
  const planLimits = isBetaActive ? PLAN_LIMITS_BETA : PLAN_LIMITS_NORMAL;
  const planLimit = planLimits[plan];
  const planLimitLabel =
    planLimit === Infinity ? "neomejeno" : String(planLimit);
  const listingsCount = listings.length;
  const canAddMore =
    planLimit === Infinity ? true : listingsCount < planLimit;

  const handleAdd = () => {
    if (!canAddMore) {
      toast({
        variant: "destructive",
        title: "Dosežen limit",
        description: `Vaš paket (${plan}) omogoča največ ${planLimitLabel} ${
          planLimit === 1 ? "lokal" : "lokalov"
        }. Nadgradite naročnino.`,
      });
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (listing: Listing) => {
    setEditing(listing);
    setFormOpen(true);
  };

  // P0-1: oddaj lokal v pregled (draft/rejected → pending)
  const handleSubmitForReview = async (listingId: string) => {
    setSubmittingId(listingId);
    try {
      const res = await fetch("/api/owner/listings/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Manjkajoča obvezna polja izpišemo podrobno
        const missing = Array.isArray(data?.missingRequired)
          ? data.missingRequired.join(", ")
          : "";
        throw new Error(
          data?.error
            ? `${data.error}${missing ? `: ${missing}` : ""}`
            : "Oddaja ni uspela."
        );
      }
      toast({
        title: "Oddano v pregled",
        description:
          data?.message ??
          "Admin bo lokal pregledal v 24–48 urah. Po odobritvi ga bo AI lahko priporočal obiskovalcem.",
      });
      // Takoj posodobi status lokalno (brez utripanja celotnega seznama)
      setListings((prev) =>
        prev.map((l) =>
          l.id === listingId
            ? { ...l, status: "pending", rejectionReason: null }
            : l
        )
      );
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Oddaja ni uspela",
        description:
          err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner/listings/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Brisanje ni uspelo.");
      }
      toast({
        title: "Izbrisano",
        description: "Lokal je bil uspešno izbrisan.",
      });
      setListings((prev) => prev.filter((l) => l.id !== deleteId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Brisanje ni uspelo.",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  // Loading state
  if (status === "loading") {
    return (
      <main className="min-h-screen flex items-center justify-center bg-muted/30">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-8 animate-spin" aria-hidden="true" />
          <p className="text-sm">Nalagam portal...</p>
        </div>
      </main>
    );
  }

  // Unauthenticated — redirect se sproži v useEffect
  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  return (
    <main className="min-h-screen bg-muted/30 flex flex-col">
      {/* Beta banner na vrhu */}
      <BetaBanner />

      {/* Header */}
      <header className="bg-background border-b border-border sticky top-0 z-30">
        <div className="mx-auto max-w-6xl px-4 py-3 sm:py-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Building2 className="size-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold sm:text-lg leading-tight">
                Moj portal
              </h1>
              <p className="text-xs text-muted-foreground truncate">
                {session.user.businessName || session.user.name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <PlanBadge plan={plan} />
            <Button
              variant="outline"
              size="sm"
              onClick={() => signOut({ callbackUrl: "/owner/prijava" })}
              className="gap-1.5"
            >
              <LogOut className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Odjava</span>
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <div className="mx-auto max-w-6xl w-full px-4 py-6 sm:py-8 flex-1">
        {/* P0-4: opomnik za potrditev e-pošte */}
        <EmailVerificationBanner />

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 sm:grid-cols-7 mb-6 gap-1">
            <TabsTrigger value="listings" className="gap-1.5 text-xs sm:text-sm">
              <Building className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Moji lokalci</span>
              <span className="sm:hidden">Lokalci</span>
            </TabsTrigger>
            <TabsTrigger value="products" className="gap-1.5 text-xs sm:text-sm">
              <Package className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Izdelki</span>
              <span className="sm:hidden">Izdelki</span>
            </TabsTrigger>
            <TabsTrigger value="experiences" className="gap-1.5 text-xs sm:text-sm">
              <Ticket className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Izkušnje</span>
              <span className="sm:hidden">Izkušnje</span>
            </TabsTrigger>
            {/* P0-3: Booking manager za ponudnike */}
            <TabsTrigger value="rezervacije" className="gap-1.5 text-xs sm:text-sm">
              <CalendarCheck className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Rezervacije</span>
              <span className="sm:hidden">Rezerv.</span>
            </TabsTrigger>
            <TabsTrigger value="narocnina" className="gap-1.5 text-xs sm:text-sm">
              <Crown className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Naročnina</span>
              <span className="sm:hidden">Naroč.</span>
            </TabsTrigger>
            <TabsTrigger value="statistika" className="gap-1.5 text-xs sm:text-sm">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Statistika</span>
              <span className="sm:hidden">Statistika</span>
            </TabsTrigger>
            <TabsTrigger value="provizije" className="gap-1.5 text-xs sm:text-sm">
              <Percent className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Provizije</span>
              <span className="sm:hidden">Prov.</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Moji lokalci */}
          <TabsContent value="listings" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold sm:text-xl">
                  Moji lokalci
                </h2>
                <p className="text-sm text-muted-foreground">
                  {listingsCount} od {planLimitLabel} lokalov · paket{" "}
                  {PLAN_LABELS[plan]}
                </p>
              </div>
              <Button
                onClick={handleAdd}
                disabled={!canAddMore}
                className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
              >
                <Plus className="size-4" aria-hidden="true" />
                Dodaj lokal
              </Button>
            </div>

            {/* Beta info badge v listings tab */}
            {isBetaActive && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                  <Rocket className="size-5" aria-hidden="true" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                    Beta: {plan === "free" ? "3 lokalci brezplačno" : plan === "premium" ? "8 lokalcev brezplačno" : "neomejeno brezplačno"}
                    {plan === "free" && " (običajno 1)"}
                    {plan === "premium" && " (običajno 5)"}
                  </p>
                  <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
                    Med beta obdobjem so vsi paketi brezplačni. Vaš paket{" "}
                    {PLAN_LABELS[plan]} vam omogoča {planLimitLabel} lokalov.
                  </p>
                </div>
              </div>
            )}

            {!canAddMore && (
              <Alert className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
                <Crown className="size-4 text-amber-600" aria-hidden="true" />
                <AlertTitle>Dosežen limit paketa</AlertTitle>
                <AlertDescription>
                  Vaš paket ({PLAN_LABELS[plan]}) omogoča največ{" "}
                  {planLimitLabel}{" "}
                  {planLimit === 1 ? "lokal" : "lokalov"}. Za več lokalov
                  nadgradite na višji paket v zavihku &laquo;Naročnina&raquo;.
                </AlertDescription>
              </Alert>
            )}

            {loadingListings ? (
              <div className="flex items-center justify-center py-16">
                <Loader2
                  className="size-8 animate-spin text-muted-foreground"
                  aria-hidden="true"
                />
              </div>
            ) : listings.length === 0 ? (
              <EmptyState onAdd={handleAdd} canAdd={canAddMore} />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {listings.map((listing) => (
                  <ListingCard
                    key={listing.id}
                    listing={listing}
                    onEdit={() => handleEdit(listing)}
                    onDelete={() => setDeleteId(listing.id)}
                    onSubmit={() => handleSubmitForReview(listing.id)}
                    submitting={submittingId === listing.id}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* TAB 2: Izdelki */}
          <TabsContent value="products" className="space-y-4">
            <ProductsTab plan={plan} isBetaActive={isBetaActive} />
          </TabsContent>

          {/* TAB 3: Izkušnje */}
          <TabsContent value="experiences" className="space-y-4">
            <ExperiencesTab plan={plan} isBetaActive={isBetaActive} />
          </TabsContent>

          {/* TAB 3b: Rezervacije (P0-3 — Booking manager za ponudnike) */}
          <TabsContent value="rezervacije" className="space-y-4">
            <BookingsTab />
          </TabsContent>

          {/* TAB 4: Naročnina */}
          <TabsContent value="narocnina" className="space-y-6">
            <SubscriptionTab
              plan={plan}
              session={session}
              betaStatus={betaStatus}
              onUpgraded={fetchListings}
            />
          </TabsContent>

          {/* TAB 5: Statistika */}
          <TabsContent value="statistika" className="space-y-6">
            <StatisticsTab
              listings={listings}
              loading={loadingListings}
              onUpgrade={() => setActiveTab("narocnina")}
            />
          </TabsContent>

          {/* TAB 6: Provizije (Faza 4a — Booking-style) */}
          <TabsContent value="provizije" className="space-y-4">
            <CommissionsTab onUpgrade={() => setActiveTab("narocnina")} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Listing form dialog */}
      <ListingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        listing={editing}
        onSaved={fetchListings}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Izbriši lokal?</AlertDialogTitle>
            <AlertDialogDescription>
              To dejanje je nepovratno. Lokal bo trajno odstranjen iz portala
              in ne bo več prikazan obiskovalcem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Prekliči</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Brišem...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Izbriši
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

/* ====================== PLAN BADGE ====================== */

function PlanBadge({ plan }: { plan: ListingPlan }) {
  if (plan === "premium") {
    return (
      <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-0 gap-1">
        <Star className="size-3 fill-amber-950" aria-hidden="true" />
        <span className="hidden sm:inline">{PLAN_LABELS[plan]}</span>
      </Badge>
    );
  }
  if (plan === "enterprise") {
    return (
      <Badge className="bg-primary text-primary-foreground hover:bg-primary border-0 gap-1">
        <Crown className="size-3" aria-hidden="true" />
        <span className="hidden sm:inline">{PLAN_LABELS[plan]}</span>
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="gap-1">
      <span className="hidden sm:inline">{PLAN_LABELS[plan]}</span>
      <span className="sm:hidden">Free</span>
    </Badge>
  );
}

/* ====================== EMPTY STATE ====================== */

function EmptyState({
  onAdd,
  canAdd,
}: {
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <Card className="border-dashed border-2 border-border bg-background">
      <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Building className="size-8 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Nimate še lokalov</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Dodajte svoj prvi lokal in začnite privabljati obiskovalce skozi
            naš portal.
          </p>
        </div>
        <Button
          onClick={onAdd}
          disabled={!canAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj svoj prvi lokal
        </Button>
      </CardContent>
    </Card>
  );
}

/* ====================== LISTING CARD ====================== */

// P0-1: barvne oznake statusov moderacijske zanke (brez modre/indigo)
const STATUS_BADGE_CLASSES: Record<string, string> = {
  draft: "bg-muted text-muted-foreground border-border",
  pending: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  approved: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  published: "bg-primary text-primary-foreground border-transparent",
  rejected: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
  expired: "bg-muted text-muted-foreground border-border",
  archived: "bg-muted text-muted-foreground border-border",
  deleted: "bg-muted text-muted-foreground border-border",
};

// P0-1: ikone statusov
const STATUS_ICONS: Record<string, typeof Pencil> = {
  draft: Pencil,
  pending: Clock,
  approved: Check,
  published: ShieldCheck,
  rejected: AlertCircle,
};

function ListingCard({
  listing,
  onEdit,
  onDelete,
  onSubmit,
  submitting,
}: {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
  onSubmit: () => void;
  submitting: boolean;
}) {
  const status = listing.status ?? "published";
  const StatusIcon = STATUS_ICONS[status] ?? ShieldCheck;
  const canSubmit = status === "draft" || status === "rejected";

  return (
    <Card className="overflow-hidden flex flex-col gap-0 py-0">
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {listing.images.length > 0 ? (
          <img
            src={listing.images[0]}
            alt={listing.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-4xl">
            <span aria-hidden="true">
              {CATEGORY_ICONS[listing.category]}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground shadow-sm text-xs">
          <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
          {CATEGORY_LABELS[listing.category]}
        </Badge>
        <div className="absolute right-2 top-2 flex flex-col items-end gap-1">
          {/* P0-1: status moderacijske zanke */}
          <Badge
            className={cn(
              "border text-xs shadow-sm backdrop-blur-sm",
              STATUS_BADGE_CLASSES[status] ?? STATUS_BADGE_CLASSES.published
            )}
            aria-label={`Status: ${STATUS_LABELS[status] ?? status}`}
          >
            <StatusIcon className="size-3" aria-hidden="true" />
            {STATUS_LABELS[status] ?? status}
          </Badge>
          {listing.featured && (
            <Badge className="bg-amber-400 text-amber-950 border-0 text-xs">
              <Star className="size-3 fill-amber-950" aria-hidden="true" />
              Izpost.
            </Badge>
          )}
          {listing.verified && (
            <Badge className="bg-primary text-primary-foreground border-0 text-xs">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Overjen
            </Badge>
          )}
        </div>
      </div>

      {/* Vsebina */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-bold leading-tight line-clamp-1">
            {listing.name}
          </h3>
          {listing.destinationName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {listing.destinationName}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {listing.description}
        </p>

        {/* P0-1: razlog zavrnitve */}
        {status === "rejected" && listing.rejectionReason && (
          <div
            className="rounded-md border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-2.5 py-2"
            role="status"
          >
            <p className="text-[11px] font-semibold text-red-800 dark:text-red-200 flex items-center gap-1">
              <AlertCircle className="size-3.5 shrink-0" aria-hidden="true" />
              Zavrnjeno: {listing.rejectionReason}
            </p>
            <p className="text-[11px] text-red-700/80 dark:text-red-300/80 mt-0.5">
              Popravite lokal in ga ponovno oddajte v pregled.
            </p>
          </div>
        )}

        {/* P0-1: namig za osnutek */}
        {status === "draft" && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1">
            <Clock className="size-3.5 shrink-0 mt-0.5" aria-hidden="true" />
            <span>
              Osnutek še ni viden obiskovalcem. Izpolnite profil in ga oddajte
              v pregled.
            </span>
          </p>
        )}

        {/* Statistika */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Eye className="size-3" aria-hidden="true" />
              Ogledi
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {listing.viewCount.toLocaleString("sl-SI")}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <MousePointerClick className="size-3" aria-hidden="true" />
              Kliki
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {listing.clickCount.toLocaleString("sl-SI")}
            </div>
          </div>
        </div>

        {/* Akcije */}
        <div className="flex flex-col gap-2 pt-1">
          {/* P0-1: oddaja v pregled (draft/rejected) */}
          {canSubmit && (
            <Button
              onClick={onSubmit}
              disabled={submitting}
              size="sm"
              className="gap-1.5 font-semibold w-full"
              aria-label={`Oddaj ${listing.name} v pregled`}
            >
              {submitting ? (
                <>
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  Oddajam...
                </>
              ) : (
                <>
                  <Send className="size-3.5" aria-hidden="true" />
                  {status === "rejected"
                    ? "Ponovno oddaj v pregled"
                    : "Oddaj v pregled"}
                </>
              )}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onEdit}
              className="flex-1 gap-1.5"
            >
              <Pencil className="size-3.5" aria-hidden="true" />
              Uredi
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onDelete}
              className="text-destructive hover:text-destructive hover:bg-destructive/5"
              aria-label="Izbriši"
            >
              <Trash2 className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ====================== EMAIL VERIFICATION BANNER (P0-4) ====================== */

function EmailVerificationBanner() {
  const { toast } = useToast();
  const [state, setState] = useState<
    "loading" | "verified" | "unverified" | "error"
  >("loading");
  const [resending, setResending] = useState(false);
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/owner/verify-email", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        setEmail(d.email ?? null);
        setState(d.emailVerified ? "verified" : "unverified");
      })
      .catch(() => setState("error"));
  }, []);

  const resend = async () => {
    setResending(true);
    try {
      const res = await fetch("/api/owner/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Pošiljanje ni uspelo.");
      toast({
        title: "Povezava poslana",
        description:
          data?.message ?? "Preverite vaš e-poštni predal (tudi mapo neželena pošta).",
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setResending(false);
    }
  };

  if (state !== "unverified") return null;

  return (
    <Alert className="mb-6 border-amber-300/60 bg-amber-50 dark:bg-amber-950/20">
      <Mail className="size-4 text-amber-600" aria-hidden="true" />
      <AlertTitle>Potrdite svojo e-pošto</AlertTitle>
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <span className="text-sm">
          Na naslov <strong>{email ?? "vaš e-poštni naslov"}</strong> boste prejeli
          provizijske račune in obvestila o rezervacijah — potrdite ga, da je vse
          varno.
        </span>
        <Button
          size="sm"
          onClick={resend}
          disabled={resending}
          className="gap-1.5 shrink-0"
        >
          {resending ? (
            <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="size-3.5" aria-hidden="true" />
          )}
          Pošlji povezavo
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/* ====================== BOOKINGS TAB (P0-3) ====================== */

interface OwnerBooking {
  id: string;
  bookingNumber: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  experienceName: string;
  bookingDate: string;
  groupSize: number;
  pricePerPerson: number;
  total: number;
  currency: string;
  status: string;
  notes: string | null;
  meetingPoint: string | null;
  source: string | null;
  createdAt: string;
  confirmedAt: string | null;
}

interface BookingsStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  upcomingRevenue: number;
  fromConsultation: number;
}

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Na čakanju",
  confirmed: "Potrjena",
  completed: "Zaključena",
  cancelled: "Preklicana",
};

const BOOKING_STATUS_BADGES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
  confirmed: "bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
  completed: "bg-primary text-primary-foreground border-transparent",
  cancelled: "bg-red-100 text-red-900 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
};

function formatBookingDate(dateStr: string): string {
  return new Intl.DateTimeFormat("sl-SI", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(dateStr));
}

function BookingsTab() {
  const { toast } = useToast();
  const [bookings, setBookings] = useState<OwnerBooking[]>([]);
  const [stats, setStats] = useState<BookingsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>("all");
  const [actionId, setActionId] = useState<string | null>(null); // bookingNumber v obdelavi
  const [cancelTarget, setCancelTarget] = useState<OwnerBooking | null>(null);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/bookings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setBookings(data.bookings || []);
      setStats(data.stats || null);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti rezervacij.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const runAction = async (
    bookingNumber: string,
    action: "confirm" | "cancel" | "complete"
  ) => {
    setActionId(bookingNumber);
    try {
      const res = await fetch("/api/owner/bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingNumber, action }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Akcija ni uspela.");
      toast({ title: "Uspeh", description: data?.message ?? "Status posodobljen." });
      await fetchBookings();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: err instanceof Error ? err.message : "Poskusite znova.",
      });
    } finally {
      setActionId(null);
      setCancelTarget(null);
    }
  };

  const filtered =
    filter === "all" ? bookings : bookings.filter((b) => b.status === filter);

  const now = new Date();
  const isPast = (b: OwnerBooking) => new Date(b.bookingDate) < now;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold sm:text-xl">Rezervacije</h2>
        <p className="text-sm text-muted-foreground">
          Upravljajte rezervacije vaših izkušenj — kot v Booking extranetu.
        </p>
      </div>

      {/* KPI vrstica */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="size-4" aria-hidden="true" />
              Na čakanju
            </div>
            <div className="text-2xl font-bold tabular-nums">{stats.pending}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarCheck className="size-4" aria-hidden="true" />
              Potrjene
            </div>
            <div className="text-2xl font-bold tabular-nums">{stats.confirmed}</div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Banknote className="size-4" aria-hidden="true" />
              Prihodnji prihodek
            </div>
            <div className="text-2xl font-bold tabular-nums text-primary">
              {formatPrice(stats.upcomingRevenue)}
            </div>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-4" aria-hidden="true" />
              Iz AI kanala
            </div>
            <div className="text-2xl font-bold tabular-nums">
              {stats.fromConsultation}
            </div>
            <p className="text-[10px] text-muted-foreground">
              rezervacij iz brezplačne konzultacije
            </p>
          </Card>
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter po statusu">
        {[
          { key: "all", label: `Vse (${stats?.total ?? 0})` },
          { key: "pending", label: `Na čakanju (${stats?.pending ?? 0})` },
          { key: "confirmed", label: `Potrjene (${stats?.confirmed ?? 0})` },
          { key: "completed", label: `Zaključene (${stats?.completed ?? 0})` },
          { key: "cancelled", label: `Preklicane (${stats?.cancelled ?? 0})` },
        ].map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={
              "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors min-h-[36px] " +
              (filter === f.key
                ? "bg-primary text-primary-foreground border-transparent"
                : "bg-background text-muted-foreground hover:bg-muted border-border")
            }
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Seznam */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="size-8 animate-spin text-muted-foreground" aria-hidden="true" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarCheck
            className="size-10 mx-auto text-muted-foreground/50"
            aria-hidden="true"
          />
          <p className="mt-3 font-semibold">Ni rezervacij v tej kategoriji</p>
          <p className="text-sm text-muted-foreground mt-1">
            Ko bo obiskovalec rezerviral vašo izkušnjo, se bo pojavila tukaj.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <Card key={b.id} className="p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-start gap-4">
                {/* Glavni podatki */}
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={cn(
                        "border text-xs",
                        BOOKING_STATUS_BADGES[b.status] ?? ""
                      )}
                    >
                      {BOOKING_STATUS_LABELS[b.status] ?? b.status}
                    </Badge>
                    <span className="font-mono text-xs text-muted-foreground">
                      {b.bookingNumber}
                    </span>
                    {b.source === "consultation" && (
                      <Badge className="bg-primary/10 text-primary border-primary/30 text-xs gap-1">
                        <Sparkles className="size-3" aria-hidden="true" />
                        AI kanal
                      </Badge>
                    )}
                    {isPast(b) && b.status === "confirmed" && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <CalendarClock className="size-3" aria-hidden="true" />
                        Pretekla
                      </Badge>
                    )}
                  </div>

                  <div>
                    <h3 className="font-bold leading-tight">{b.experienceName}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                      <Calendar className="size-3.5 shrink-0" aria-hidden="true" />
                      {formatBookingDate(b.bookingDate)}
                    </p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-1.5 text-xs">
                    <div>
                      <span className="text-muted-foreground">Gost:</span>{" "}
                      <span className="font-medium">{b.guestName}</span>
                    </div>
                    <div className="truncate">
                      <span className="text-muted-foreground">E-pošta:</span>{" "}
                      <span className="font-medium">{b.guestEmail}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Oseb:</span>{" "}
                      <span className="font-medium">{b.groupSize}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Skupaj:</span>{" "}
                      <span className="font-semibold text-primary">
                        {formatPrice(b.total)}
                      </span>
                    </div>
                  </div>

                  {b.notes && (
                    <p className="text-xs text-muted-foreground bg-muted/50 rounded-md px-2.5 py-1.5">
                      <strong className="text-foreground">Opomba gosta:</strong>{" "}
                      {b.notes}
                    </p>
                  )}
                </div>

                {/* Akcije */}
                <div className="flex sm:flex-col gap-2 sm:min-w-[170px]">
                  {b.status === "pending" && (
                    <Button
                      size="sm"
                      onClick={() => runAction(b.bookingNumber, "confirm")}
                      disabled={actionId === b.bookingNumber}
                      className="gap-1.5 font-semibold flex-1"
                    >
                      {actionId === b.bookingNumber ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      Potrdi
                    </Button>
                  )}
                  {b.status === "confirmed" && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => runAction(b.bookingNumber, "complete")}
                      disabled={actionId === b.bookingNumber}
                      className="gap-1.5 flex-1"
                    >
                      {actionId === b.bookingNumber ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="size-3.5" aria-hidden="true" />
                      )}
                      Zaključi
                    </Button>
                  )}
                  {(b.status === "pending" || b.status === "confirmed") && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCancelTarget(b)}
                      disabled={actionId === b.bookingNumber}
                      className="text-destructive hover:text-destructive hover:bg-destructive/5 gap-1.5 flex-1"
                    >
                      <Ban className="size-3.5" aria-hidden="true" />
                      Prekliči
                    </Button>
                  )}
                  {(b.status === "cancelled" || b.status === "completed") && (
                    <p className="text-xs text-muted-foreground sm:text-right sm:pt-2">
                      {b.status === "completed" ? "Zaključeno" : "Preklicano"} —{" "}
                      {new Intl.DateTimeFormat("sl-SI", {
                        day: "numeric",
                        month: "short",
                      }).format(new Date(b.createdAt))}
                    </p>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Preklic — potrditveni dialog */}
      <AlertDialog
        open={cancelTarget !== null}
        onOpenChange={(open) => !open && setCancelTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prekliči rezervacijo?</AlertDialogTitle>
            <AlertDialogDescription>
              Rezervacija{" "}
              <strong>{cancelTarget?.bookingNumber}</strong> (
              {cancelTarget?.experienceName}) bo preklicana, gost{" "}
              {cancelTarget?.guestName} pa bo prejel obvestilo po e-pošti.
              Dejanje je nepovratno.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionId !== null}>
              Ne, obdrži
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (cancelTarget) {
                  void runAction(cancelTarget.bookingNumber, "cancel");
                }
              }}
              disabled={actionId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {actionId !== null ? (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <Ban className="size-4" aria-hidden="true" />
              )}
              Prekliči rezervacijo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

/* ====================== SUBSCRIPTION TAB ====================== */

interface SubscriptionTabProps {
  plan: ListingPlan;
  session: ReturnType<typeof useSession>["data"];
  betaStatus: BetaStatus | null;
  onUpgraded: () => void;
}

function SubscriptionTab({
  plan,
  session,
  betaStatus,
  onUpgraded,
}: SubscriptionTabProps) {
  const { toast } = useToast();
  const subscriptionStatus =
    (session?.user?.subscriptionStatus as string) || "none";
  const isActive = subscriptionStatus === "active";
  const isBetaActive = betaStatus?.isActive ?? true;

  // Detajli naročnine iz API-ja (renewal date, daysUntilRenewal, canCancel, ...)
  const [subDetails, setSubDetails] = useState<{
    plan: string;
    subscriptionStatus: string;
    subscriptionEndsAt: string | null;
    daysUntilRenewal: number | null;
    canCancel: boolean;
    monthlyRevenue: number;
    demoMode: boolean;
  } | null>(null);
  const [loadingSub, setLoadingSub] = useState(true);

  // Portal + cancel states
  const [portalLoading, setPortalLoading] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  const fetchSubscription = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/subscription", { cache: "no-store" });
      if (!res.ok) return;
      const data: unknown = await res.json();
      if (
        typeof data === "object" &&
        data !== null &&
        "subscription" in data
      ) {
        setSubDetails(
          (data as Record<string, unknown>).subscription as typeof subDetails
        );
      }
    } catch {
      // tiho ignoriramo — fallback na session podatke
    } finally {
      setLoadingSub(false);
    }
  }, []);

  useEffect(() => {
    fetchSubscription();
  }, [fetchSubscription, plan, subscriptionStatus]);

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data
            ? String((data as Record<string, unknown>).error)
            : "Napaka pri odpiranju portala.";
        throw new Error(msg);
      }
      // Demo mode — prikaži message
      if (
        typeof data === "object" &&
        data !== null &&
        "demo" in data &&
        (data as Record<string, unknown>).demo === true
      ) {
        const msg =
          typeof (data as Record<string, unknown>).message === "string"
            ? ((data as Record<string, unknown>).message as string)
            : "Demo mode — portal ni na voljo.";
        toast({
          title: "Demo način",
          description: msg,
        });
        return;
      }
      // Production — redirect
      if (
        typeof data === "object" &&
        data !== null &&
        "url" in data &&
        typeof (data as Record<string, unknown>).url === "string"
      ) {
        window.location.href = (data as Record<string, unknown>).url as string;
        return;
      }
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Napaka pri portal-u.",
      });
    } finally {
      setPortalLoading(false);
    }
  };

  const handleCancelConfirm = async () => {
    setCancelLoading(true);
    try {
      const res = await fetch("/api/owner/subscription", { method: "POST" });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" &&
          data !== null &&
          "error" in data
            ? String((data as Record<string, unknown>).error)
            : "Napaka pri preklicu.";
        throw new Error(msg);
      }
      toast({
        title: "Naročnina preklicana",
        description:
          typeof data === "object" &&
          data !== null &&
          "message" in data &&
          typeof (data as Record<string, unknown>).message === "string"
            ? ((data as Record<string, unknown>).message as string)
            : "Vaša naročnina je bila preklicana.",
      });
      setCancelOpen(false);
      // Osveži podatke in session
      fetchSubscription();
      onUpgraded();
      // Reload da se session refresh-a
      window.location.reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Preklic ni uspel.",
      });
    } finally {
      setCancelLoading(false);
    }
  };

  // Helper za prikaz datuma obnovitve
  const renewalDate = subDetails?.subscriptionEndsAt
    ? new Date(subDetails.subscriptionEndsAt)
    : null;
  const daysLeft = subDetails?.daysUntilRenewal ?? null;
  const canCancel = subDetails?.canCancel ?? false;
  const demoMode = subDetails?.demoMode ?? true;

  return (
    <div className="space-y-6">
      {/* Beta banner na vrh */}
      {isBetaActive && (
        <Card className="border-amber-400/60 bg-amber-50 dark:bg-amber-950/20">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-start gap-4">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                <Rocket className="size-6" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
                    BETA: Vaš paket je BREZPLAČEN
                  </h3>
                  <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-0 gap-1 shrink-0">
                    <Zap className="size-3 fill-amber-950" aria-hidden="true" />
                    BETA
                  </Badge>
                </div>
                <p className="text-sm text-amber-800 dark:text-amber-300/90 mb-3">
                  Vsi paketi so brezplačni dokler ne dosežemo {BETA_INFO.threshold}{" "}
                  aktivnih lokalov na platformi. Pridružite se in izkoristite
                  ugodnosti.
                </p>

                {/* Števec do monetizacije */}
                <BetaCounterInline betaStatus={betaStatus} />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trenutni paket */}
      <Card
        className={cn(
          "border-2",
          plan === "free"
            ? "border-border"
            : plan === "premium"
            ? "border-amber-400"
            : "border-primary"
        )}
      >
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {plan === "premium" ? (
                  <Star
                    className="size-5 fill-amber-400 text-amber-400"
                    aria-hidden="true"
                  />
                ) : plan === "enterprise" ? (
                  <Crown className="size-5 text-primary" aria-hidden="true" />
                ) : (
                  <Building className="size-5 text-muted-foreground" aria-hidden="true" />
                )}
                <CardTitle className="text-xl">
                  Trenutni paket: {PLAN_LABELS[plan]}
                </CardTitle>
              </div>
              <p className="text-sm text-muted-foreground">
                {isBetaActive ? (
                  <>
                    <span className="font-medium text-primary">
                      BREZPLAČNO med beta.
                    </span>{" "}
                    {plan === "free"
                      ? "Beta limit: 3 lokalci (običajno 1)."
                      : plan === "premium"
                      ? "Beta limit: 8 lokalcev (običajno 5)."
                      : "Neomejeni lokalci."}
                  </>
                ) : plan === "free" ? (
                  "Brezplačni paket z 1 lokalom."
                ) : plan === "premium" ? (
                  "Premium paket z do 5 lokali in izpostavljenostjo."
                ) : (
                  "Enterprise paket z neomejenimi lokali in dodatnimi funkcijami."
                )}
              </p>
            </div>
            <PlanBadge plan={plan} />
          </div>
        </CardHeader>
        {plan !== "free" && (
          <CardContent className="pt-0 space-y-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge
                variant={isActive ? "default" : "secondary"}
                className="gap-1"
              >
                <ShieldCheck className="size-3" aria-hidden="true" />
                {subscriptionStatus === "active"
                  ? "Aktivna"
                  : subscriptionStatus === "canceled"
                  ? "Preklicana"
                  : subscriptionStatus === "past_due"
                  ? "Zapadlo plačilo"
                  : "Brez naročnine"}
              </Badge>
              {isBetaActive && (
                <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-0 gap-1">
                  <Gift className="size-3" aria-hidden="true" />
                  Brezplačno med beta
                </Badge>
              )}
              {demoMode && (
                <Badge variant="outline" className="gap-1 text-muted-foreground">
                  <AlertCircle className="size-3" aria-hidden="true" />
                  Demo način
                </Badge>
              )}
            </div>

            {/* Mesečni znesek + datum obnovitve */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <DollarSign className="size-3" aria-hidden="true" />
                  Mesečni znesek
                </div>
                <div className="text-lg font-bold tabular-nums mt-0.5">
                  {isBetaActive ? (
                    <span className="text-primary">€0 (BETA)</span>
                  ) : subDetails?.monthlyRevenue ? (
                    `€${subDetails.monthlyRevenue}/mes`
                  ) : plan === "premium" ? (
                    "€149/mes"
                  ) : (
                    "€499/mes"
                  )}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 px-3 py-2.5">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <Calendar className="size-3" aria-hidden="true" />
                  Datum obnovitve
                </div>
                <div className="text-lg font-bold tabular-nums mt-0.5">
                  {loadingSub ? (
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  ) : renewalDate ? (
                    renewalDate.toLocaleDateString("sl-SI", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })
                  ) : (
                    <span className="text-muted-foreground text-sm font-normal">
                      —
                    </span>
                  )}
                </div>
                {daysLeft !== null && (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    čez {daysLeft}{" "}
                    {daysLeft === 1
                      ? "dan"
                      : daysLeft < 5
                      ? "dneva"
                      : "dni"}
                  </div>
                )}
              </div>
            </div>

            {/* Action gumbi */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                className="gap-1.5 flex-1"
                onClick={handlePortal}
                disabled={portalLoading}
              >
                {portalLoading ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ExternalLink className="size-4" aria-hidden="true" />
                )}
                Upravljaj naročnino
                <span className="text-xs text-muted-foreground ml-1 hidden sm:inline">
                  (Stripe portal)
                </span>
              </Button>
              <Button
                variant="outline"
                className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/5 border-destructive/30"
                onClick={() => setCancelOpen(true)}
                disabled={!canCancel || isBetaActive}
                title={
                  isBetaActive
                    ? "Med beta obdobjem naročnine ni mogoče preklicati (je brezplačna)."
                    : !canCancel
                    ? "Naročnina ni aktivna — preklic ni mogoč."
                    : "Prekliči naročnino"
                }
              >
                <Ban className="size-4" aria-hidden="true" />
                Prekliči naročnino
              </Button>
            </div>

            {isBetaActive && (
              <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                <Gift className="size-3.5 shrink-0 mt-0.5 text-amber-600" />
                Med beta obdobjem je vaš paket brezplačen — preklic ni potreben.
                Po koncu beta obdobja se naročnina samodejno aktivira prek Stripe.
              </p>
            )}
          </CardContent>
        )}

        {/* Cancel confirmation dialog */}
        <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <Ban className="size-5 text-destructive" aria-hidden="true" />
                Prekliči naročnino?
              </AlertDialogTitle>
              <AlertDialogDescription>
                S preklicem naročnine boste izgubili ugodnosti vašega paketa
                ({PLAN_LABELS[plan]}). Do konca plačanega obdobja boste obdržali
                dostop, nato pa se paket povrne na <strong>Free</strong> (1 lokal).
                To dejanje je nepovratno.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={cancelLoading}>
                Obdrži naročnino
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={handleCancelConfirm}
                disabled={cancelLoading}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
              >
                {cancelLoading ? (
                  <>
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                    Preklicujem...
                  </>
                ) : (
                  <>
                    <Ban className="size-4" aria-hidden="true" />
                    Da, prekliči
                  </>
                )}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </Card>

      {/* Nadgradnja gumbi — če free v beta-ju */}
      {isBetaActive && plan === "free" && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Gift className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-bold">Nadgradi brezplačno</h3>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Med beta obdobjem lahko brezplačno nadgradite na Premium ali
                  Enterprise paket. Brez kreditne kartice.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Pricing cards */}
      <div>
        <h3 className="text-lg font-bold mb-1">
          {isBetaActive ? "Nadgradi paket (zdaj BREZPLAČNO)" : "Nadgradi paket"}
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Izberite paket, ki ustreza vašemu poslovanju.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-stretch">
          {PRICING_PLANS.map((p) => (
            <SubscriptionCard
              key={p.id}
              plan={p}
              current={p.id === plan}
              isBetaActive={isBetaActive}
              onUpgraded={onUpgraded}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

/* Beta števec inline v naročnini */
function BetaCounterInline({ betaStatus }: { betaStatus: BetaStatus | null }) {
  if (!betaStatus) {
    return (
      <div className="flex items-center gap-2 text-xs text-amber-700/80 dark:text-amber-300/70">
        <Loader2 className="size-3 animate-spin" aria-hidden="true" />
        Nalagam...
      </div>
    );
  }

  const pct = Math.min(
    100,
    (betaStatus.listingCount / BETA_INFO.threshold) * 100
  );

  return (
    <div className="rounded-lg bg-amber-100/70 dark:bg-amber-900/30 p-3">
      <div className="flex items-center justify-between gap-2 mb-2 text-xs">
        <span className="font-semibold text-amber-900 dark:text-amber-200">
          Trenutno {betaStatus.listingCount} / {BETA_INFO.threshold} lokalov na platformi
        </span>
        <span className="text-amber-700 dark:text-amber-300 tabular-nums shrink-0">
          Še {betaStatus.remainingToMonetization}
        </span>
      </div>
      <Progress
        value={pct}
        className="h-2 bg-amber-200/60 dark:bg-amber-900/50"
      />
      <p className="mt-2 text-xs text-amber-700/80 dark:text-amber-300/70">
        {betaStatus.message}
      </p>
    </div>
  );
}

function SubscriptionCard({
  plan,
  current,
  isBetaActive,
  onUpgraded,
}: {
  plan: PricingPlan;
  current: boolean;
  isBetaActive: boolean;
  onUpgraded: () => void;
}) {
  const isHighlighted = plan.highlighted;
  const { toast } = useToast();
  const [upgrading, setUpgrading] = useState(false);

  const handleUpgrade = async () => {
    if (current) return;
    if (plan.id === "free") {
      toast({
        title: "Ni mogoče",
        description: "Na free paket ne morete nadgraditi.",
      });
      return;
    }

    setUpgrading(true);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: plan.id }),
      });
      const data: unknown = await res.json();
      if (!res.ok) {
        const msg =
          typeof data === "object" && data !== null && "error" in data
            ? String((data as Record<string, unknown>).error)
            : "Napaka pri nadgradnji.";
        throw new Error(msg);
      }
      toast({
        title: "Nadgrajeni!",
        description: `Vaš paket je zdaj ${plan.name} ${
          isBetaActive ? "(BREZPLAČNO med beta)" : ""
        }.`,
      });
      // Osveži listings in session
      onUpgraded();
      // Reload page da se session refresh-a
      window.location.reload();
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Napaka pri nadgradnji.",
      });
    } finally {
      setUpgrading(false);
    }
  };

  const hasOriginalPrice =
    plan.betaFree === true &&
    typeof plan.originalPrice === "number" &&
    plan.originalPrice > 0;

  return (
    <div className={cn("relative flex", isHighlighted && "md:-mt-2 md:mb-2")}>
      <Card
        className={cn(
          "w-full flex flex-col",
          isHighlighted
            ? "border-primary border-2 shadow-lg ring-1 ring-primary/20 md:scale-[1.02] z-10"
            : "border-border",
          current && "ring-2 ring-primary/40"
        )}
      >
        {isHighlighted && plan.badge && (
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20">
            <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 shadow-md border-0 font-semibold">
              <Rocket className="size-3 mr-1" />
              {plan.badge}
            </Badge>
          </div>
        )}
        {current && (
          <div className="absolute -top-3 right-3 z-20">
            <Badge className="bg-primary text-primary-foreground hover:bg-primary border-0 shadow-md">
              <Check className="size-3 mr-1" aria-hidden="true" />
              Trenutni
            </Badge>
          </div>
        )}

        <CardHeader className={cn(isHighlighted && "pt-7")}>
          <CardTitle className="text-lg">{plan.name}</CardTitle>
          <div className="mt-1">
            {hasOriginalPrice ? (
              <div className="space-y-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="text-base text-muted-foreground line-through tabular-nums"
                    aria-label={`Originalna cena ${plan.originalPrice} evrov na mesec`}
                  >
                    €{plan.originalPrice}/mes
                  </span>
                  <span className="text-sm font-semibold text-primary">
                    Brezplačno med beta
                  </span>
                </div>
              </div>
            ) : plan.monthlyPrice > 0 ? (
              <div className="flex items-baseline gap-1">
                <span className="text-3xl font-bold tabular-nums">
                  €{plan.monthlyPrice}
                </span>
                <span className="text-sm text-muted-foreground">/mes</span>
              </div>
            ) : (
              <span className="text-2xl font-bold text-muted-foreground">
                Brezplačno
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">{plan.tagline}</p>
        </CardHeader>

        <CardContent className="flex flex-col gap-4 flex-1">
          <ul className="space-y-2 flex-1">
            {plan.features.map((feature, idx) => (
              <li key={idx} className="flex items-start gap-2 text-xs">
                <Check
                  className="size-3.5 mt-0.5 shrink-0 text-primary"
                  aria-hidden="true"
                />
                <span className="leading-relaxed">{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            onClick={handleUpgrade}
            disabled={current || upgrading}
            variant={isHighlighted ? "default" : "outline"}
            className={cn(
              "w-full font-semibold",
              isHighlighted
                ? "bg-primary text-primary-foreground hover:bg-primary/90"
                : "hover:bg-accent hover:text-accent-foreground",
              current && "opacity-60 cursor-not-allowed"
            )}
          >
            {current ? (
              <>
                <Check className="size-4 mr-1" aria-hidden="true" />
                Trenutni paket
              </>
            ) : upgrading ? (
              <>
                <Loader2 className="size-4 mr-1 animate-spin" aria-hidden="true" />
                Nadgrajujem...
              </>
            ) : plan.id === "free" ? (
              plan.cta
            ) : isBetaActive ? (
              <>
                <Gift className="size-4 mr-1" aria-hidden="true" />
                Nadgradi (zdaj BREZPLAČNO)
                <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </>
            ) : (
              <>
                <Sparkles className="size-4 mr-1" aria-hidden="true" />
                {plan.cta}
                <ArrowRight className="size-4 ml-1" aria-hidden="true" />
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

/* ====================== STATISTICS TAB ====================== */

interface AnalyticsData {
  kpi: {
    totalViews: number;
    totalClicks: number;
    totalLeads: number;
    totalAiRecommendations: number;
    conversionRate: number;
    listingsCount: number;
    productsCount: number;
    experiencesCount: number;
  };
  topListings: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    clickCount: number;
    aiRecommendations: number;
    type: "listing";
  }>;
  topProducts: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    saleCount: number;
    type: "product";
  }>;
  topExperiences: Array<{
    id: string;
    name: string;
    category: string;
    destinationName: string | null;
    viewCount: number;
    bookingCount: number;
    type: "experience";
  }>;
  trend: {
    days: number;
    dailyViews: number;
    dailyClicks: number;
    dailyLeads: number;
    series: Array<{ day: number; views: number; clicks: number }>;
  };
  roi: {
    plan: string;
    monthlyPrice: number;
    leadsDelivered: number;
    estimatedValue: number;
    isPositive: boolean;
    label: string;
    message: string;
  };
  aiChannel: {
    citationsFromConsultations: number;
    bookingsFromConsultations: number;
    revenueFromConsultations: number;
    topConsultationExperiences: Array<{
      name: string;
      bookings: number;
      revenue: number;
    }>;
  };
}

function StatisticsTab({
  listings,
  loading,
  onUpgrade,
}: {
  listings: Listing[];
  loading: boolean;
  onUpgrade: () => void;
}) {
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loadingAnalytics, setLoadingAnalytics] = useState(true);

  // Fetch analytics iz API-ja
  useEffect(() => {
    let active = true;
    fetch("/api/owner/analytics", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error("napaka");
        return r.json();
      })
      .then((d: AnalyticsData) => {
        if (active) setAnalytics(d);
      })
      .catch(() => {
        // Tiha napaka — fallback na lokalne podatke
      })
      .finally(() => {
        if (active) setLoadingAnalytics(false);
      });
    return () => {
      active = false;
    };
  }, [listings.length]);

  if (loading || loadingAnalytics) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2
          className="size-8 animate-spin text-muted-foreground"
          aria-hidden="true"
        />
      </div>
    );
  }

  if (listings.length === 0 && (!analytics || analytics.kpi.totalViews === 0)) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-12 text-center">
          <TrendingUp
            className="size-10 mx-auto text-muted-foreground mb-3"
            aria-hidden="true"
          />
          <h3 className="font-bold">Ni podatkov za prikaz</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Dodajte vsaj en lokal za prikaz statistike.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!analytics) {
    // Fallback na osnovno statistiko iz listings
    const totalViews = listings.reduce((sum, l) => sum + l.viewCount, 0);
    const totalClicks = listings.reduce((sum, l) => sum + l.clickCount, 0);
    const conversion =
      totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0";
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          <KpiCard icon={Eye} label="Skupni ogledi" value={totalViews.toLocaleString("sl-SI")} color="primary" />
          <KpiCard icon={MousePointerClick} label="Skupni kliki" value={totalClicks.toLocaleString("sl-SI")} color="primary" />
          <KpiCard icon={TrendingUp} label="Konverzija" value={`${conversion}%`} color="amber" />
          <KpiCard icon={Building} label="Število lokalov" value={String(listings.length)} color="primary" />
        </div>
        <Alert>
          <AlertCircle className="size-4" aria-hidden="true" />
          <AlertTitle>Podrobna analitika trenutno ni na voljo</AlertTitle>
          <AlertDescription>
            Prikazujemo osnovne števce. Poskusite kasneje za polno analitiko z
            ROI izračunom in trendi.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const { kpi, topListings, topProducts, topExperiences, trend, roi, aiChannel } = analytics;
  const maxSeriesViews = Math.max(...trend.series.map((s) => s.views), 1);

  return (
    <div className="space-y-6">
      {/* AI vpogledi — analiza statistike z AI */}
      <InsightsPanel type="owner" />

      {/* ROI banner (top) */}
      <div
        className={cn(
          "rounded-xl border p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3",
          roi.isPositive
            ? "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40"
            : "border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40"
        )}
      >
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-lg",
            roi.isPositive
              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
              : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
          )}
        >
          <Target className="size-6" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-base sm:text-lg">{roi.label}</h3>
            <Badge
              className={cn(
                "border-0",
                roi.isPositive
                  ? "bg-emerald-500 text-white"
                  : "bg-amber-500 text-white"
              )}
            >
              {roi.plan === "free" ? "Free paket" : `${roi.monthlyPrice} €/mes`}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">{roi.message}</p>
        </div>
      </div>

      {/* KPI kartice (5 → ena vrstica na desktopu) */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5">
        <KpiCard
          icon={Eye}
          label="Skupni ogledi"
          value={kpi.totalViews.toLocaleString("sl-SI")}
          color="primary"
        />
        <KpiCard
          icon={MousePointerClick}
          label="Kliki"
          value={kpi.totalClicks.toLocaleString("sl-SI")}
          color="primary"
        />
        <KpiCard
          icon={Mail}
          label="Lead-i"
          value={kpi.totalLeads.toLocaleString("sl-SI")}
          color="amber"
        />
        <KpiCard
          icon={TrendingUp}
          label="Konverzija"
          value={`${kpi.conversionRate.toLocaleString("sl-SI", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`}
          color="primary"
        />
        {/* B2B vrednost: kolikokrat je AI lokalnež priporočil lokal
            obiskovalcem v odgovorih "Vprašaj lokalca" (Faza: AI flywheel) */}
        <KpiCard
          icon={Sparkles}
          label="AI priporočila"
          value={kpi.totalAiRecommendations.toLocaleString("sl-SI")}
          color="emerald"
          hint="Kolikokrat vas je AI lokalnež priporočil obiskovalcem v odgovorih."
        />
      </div>

      {/* Faza 3d: AI kanal — vrednost brezplačnih konzultacij za ponudnika
          (model "ponudniki plačajo" — kot Booking.com) */}
      <Card className="border-emerald-200/60 bg-emerald-50/50 dark:border-emerald-800/40 dark:bg-emerald-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle
              className="size-4 text-emerald-600"
              aria-hidden="true"
            />
            AI konzultacije — kanal, ki prinaša goste
          </CardTitle>
          <CardDescription>
            Turisti ne plačujejo nič (kot pri Booking.com), zato jih vpraša
            več. Vsaka konzultacija citira lokalne ponudnike — tu vidite
            točno to, kar vam je kanal prinesel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Sparkles
                  className="size-3.5 text-emerald-600"
                  aria-hidden="true"
                />
                Citati v konzultacijah
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {aiChannel.citationsFromConsultations.toLocaleString("sl-SI")}×
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                kolikokrat vas je AI navedel v osebnih načrtih
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <CalendarCheck
                  className="size-3.5 text-emerald-600"
                  aria-hidden="true"
                />
                Rezervacije iz konzultacij
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {aiChannel.bookingsFromConsultations.toLocaleString("sl-SI")}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                rezervacije, pripisane vašim izkušnjam
              </div>
            </div>
            <div className="rounded-lg border border-border/60 bg-background/70 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Euro className="size-3.5 text-emerald-600" aria-hidden="true" />
                Vrednost rezervacij
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {aiChannel.revenueFromConsultations.toLocaleString("sl-SI")} €
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                skupna vrednost atribuiranih rezervacij
              </div>
            </div>
          </div>

          {aiChannel.topConsultationExperiences.length > 0 && (
            <div className="rounded-lg border border-border/60 p-4">
              <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                Najuspešnejše izkušnje v tem kanalu
              </div>
              <ul className="space-y-1.5 text-sm">
                {aiChannel.topConsultationExperiences.map((e) => (
                  <li
                    key={e.name}
                    className="flex items-center justify-between gap-3"
                  >
                    <span className="truncate font-medium">{e.name}</span>
                    <span className="text-muted-foreground tabular-nums shrink-0">
                      {e.bookings}× · {e.revenue.toLocaleString("sl-SI")} €
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-200/60 bg-amber-50/50 dark:border-amber-800/40 dark:bg-amber-950/20 p-4">
            <div className="flex-1 min-w-0 text-sm">
              <p className="font-medium">Želite prioriteto v AI konzultacijah?</p>
              <p className="text-muted-foreground mt-0.5">
                Premium partnerji dobijo 5-odstotni rangirni boost, Premium
                znak in 0&nbsp;% provizije na rezervacijah iz AI konzultacij.
              </p>
            </div>
            <Button onClick={onUpgrade} className="gap-1.5 shrink-0">
              <Crown className="size-4" aria-hidden="true" />
              Nadgradite na Premium
            </Button>
          </div>

          {aiChannel.citationsFromConsultations === 0 &&
            aiChannel.bookingsFromConsultations === 0 && (
              <p className="text-xs text-muted-foreground">
                Še ni citatov ali rezervacij iz konzultacij — kanal je nov.
                Popolnejši profil pomeni pogostejše citiranje.
              </p>
            )}
        </CardContent>
      </Card>

      {/* Vrednost naročnine / ROI sekcija */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="size-4 text-amber-500" aria-hidden="true" />
            Vrednost naročnine
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Plačilo */}
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <DollarSign className="size-3.5" aria-hidden="true" />
                Plačujete
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums">
                {roi.monthlyPrice.toLocaleString("sl-SI")} €
              </div>
              <div className="text-xs text-muted-foreground">/ mesec</div>
            </div>

            {/* Vrednost dobavljena */}
            <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Gift className="size-3.5" aria-hidden="true" />
                Dobili ste
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  roi.estimatedValue >= roi.monthlyPrice && roi.monthlyPrice > 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : ""
                )}
              >
                {roi.estimatedValue.toLocaleString("sl-SI")} €
              </div>
              <div className="text-xs text-muted-foreground">
                {roi.leadsDelivered} lead-ov × 50 €
              </div>
            </div>

            {/* Razlika */}
            <div
              className={cn(
                "rounded-lg border p-4",
                roi.isPositive
                  ? "border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40"
                  : "border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800/40"
              )}
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <Activity className="size-3.5" aria-hidden="true" />
                Bilanca
              </div>
              <div
                className={cn(
                  "mt-1 text-2xl font-bold tabular-nums",
                  roi.isPositive
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-amber-700 dark:text-amber-400"
                )}
              >
                {roi.monthlyPrice === 0
                  ? `+${roi.estimatedValue.toLocaleString("sl-SI")} €`
                  : `${(roi.estimatedValue - roi.monthlyPrice >= 0 ? "+" : "")}${(roi.estimatedValue - roi.monthlyPrice).toLocaleString("sl-SI")} €`}
              </div>
              <div className="text-xs text-muted-foreground">
                {roi.isPositive ? "Čisti dobiček" : "Še ne pokrito"}
              </div>
            </div>
          </div>

          {/* Progress bar primerjave */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Odmera vrednosti vs. cena paketa</span>
              <span className="tabular-nums">
                {roi.monthlyPrice > 0
                  ? `${Math.min(100, Math.round((roi.estimatedValue / roi.monthlyPrice) * 100))}%`
                  : "∞"}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  roi.isPositive ? "bg-emerald-500" : "bg-amber-500"
                )}
                style={{
                  width: roi.monthlyPrice > 0
                    ? `${Math.min(100, (roi.estimatedValue / roi.monthlyPrice) * 100)}%`
                    : "100%",
                }}
                role="progressbar"
                aria-valuenow={Math.min(100, roi.estimatedValue)}
                aria-valuemin={0}
                aria-valuemax={Math.max(roi.monthlyPrice, 1)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Top 5 oglasov po ogledih (listings) */}
      {topListings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star className="size-4 fill-amber-400 text-amber-400" aria-hidden="true" />
              Top {topListings.length} lokalov po ogledih
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topListings.map((l, idx) => {
              const maxV = Math.max(...topListings.map((x) => x.viewCount), 1);
              const widthPct = (l.viewCount / maxV) * 100;
              return (
                <div key={l.id} className="space-y-1">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="truncate">{l.name}</span>
                      {l.destinationName && (
                        <span className="hidden sm:inline text-xs text-muted-foreground shrink-0">
                          · {l.destinationName}
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2.5 shrink-0">
                      {/* AI priporočila — kolikokrat ga je AI lokalnež citiral
                          v odgovorih (Sparkles = isti vizualni jezik kot KPI) */}
                      {l.aiRecommendations > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400"
                          title="Kolikokrat vas je AI lokalnež priporočil v odgovorih"
                        >
                          <Sparkles
                            className="size-3.5"
                            aria-hidden="true"
                          />
                          <span className="sr-only">AI priporočil: </span>
                          <span className="font-semibold tabular-nums">
                            {l.aiRecommendations.toLocaleString("sl-SI")}
                          </span>
                        </span>
                      ) : null}
                      <span className="font-semibold tabular-nums">
                        {l.viewCount.toLocaleString("sl-SI")}
                      </span>
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${widthPct}%` }}
                      role="progressbar"
                      aria-valuenow={l.viewCount}
                      aria-valuemin={0}
                      aria-valuemax={maxV}
                    />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Top izdelki + izkušnje (2 koloni na desktopu) */}
      {(topProducts.length > 0 || topExperiences.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {topProducts.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Package className="size-4 text-primary" aria-hidden="true" />
                  Top izdelki
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topProducts.slice(0, 5).map((p, idx) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="truncate">{p.name}</span>
                    </span>
                    <span className="font-semibold tabular-nums shrink-0 text-xs">
                      {p.viewCount.toLocaleString("sl-SI")} ogledov
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {topExperiences.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Ticket className="size-4 text-primary" aria-hidden="true" />
                  Top izkušnje
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {topExperiences.slice(0, 5).map((e, idx) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-2 text-sm py-1.5 border-b border-border/40 last:border-0"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="truncate">{e.name}</span>
                    </span>
                    <span className="font-semibold tabular-nums shrink-0 text-xs">
                      {e.viewCount.toLocaleString("sl-SI")} ogledov
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Trend zadnjih 30 dni — simple bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="size-4 text-primary" aria-hidden="true" />
            Trend zadnjih {trend.days} dni
            <Badge variant="secondary" className="ml-1 text-[10px]">demo</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-0.5 h-32 sm:h-40 w-full" aria-label="Trend ogledov po dnevih">
            {trend.series.map((s) => {
              const h = maxSeriesViews > 0 ? (s.views / maxSeriesViews) * 100 : 0;
              return (
                <div
                  key={s.day}
                  className="flex-1 rounded-t-sm bg-primary/70 hover:bg-primary transition-all"
                  style={{ height: `${Math.max(2, h)}%` }}
                  title={`Dan ${s.day}: ${s.views} ogledov, ${s.clicks} klikov`}
                />
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>
              Povprečno {trend.dailyViews.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} ogledov / dan
            </span>
            <span>
              {trend.dailyClicks.toLocaleString("sl-SI", { maximumFractionDigits: 1 })} klikov / dan ·{" "}
              {trend.dailyLeads.toLocaleString("sl-SI", { maximumFractionDigits: 2 })} lead-ov / dan
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Opomba o trendu */}
      <Alert>
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertTitle>Poenostavljen prikaz trenda</AlertTitle>
        <AlertDescription>
          Dnevni prikaz je trenutno povprečje skupnih števcev (demo). Podrobna
          časovna statistika z dnevno granulacijo bo na voljo s paketoma
          Premium in Enterprise.
        </AlertDescription>
      </Alert>
    </div>
  );
}

// ============================================================================
// TAB 6: PROVIZIJE — Booking-style obračun (Faza 4a)
// ============================================================================
interface CommissionInvoiceRow {
  id: string;
  invoiceNumber: string;
  periodStart: string;
  periodEnd: string;
  bookingCount: number;
  commissionBase: number;
  rate: number;
  amount: number;
  status: string;
  issuedAt: string;
  paidAt: string | null;
}

interface CommissionsData {
  rate: number;
  isPremium: boolean;
  commissionRateStandard: number;
  /** Faza 5: true, kadar je Stripe konfiguriran (gumb "Plačaj s kartico"). */
  stripeEnabled: boolean;
  currentMonth: {
    monthLabel: string;
    bookingCount: number;
    commissionBase: number;
    estimatedAmount: number;
  };
  lastMonth: {
    monthLabel: string;
    bookingCount: number;
    commissionBase: number;
    amount: number;
    invoiceExists: boolean;
  };
  invoices: CommissionInvoiceRow[];
}

const fmtEur = (v: number) => `${v.toLocaleString("sl-SI")} €`;

const fmtPeriod = (startIso: string, endIso: string) => {
  const fmt = new Intl.DateTimeFormat("sl-SI", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const start = new Date(startIso);
  // periodEnd je ekskluzivna meja — zadnji dan obdobja je end − 1 ms
  const lastDay = new Date(new Date(endIso).getTime() - 1);
  return `${fmt.format(start)} – ${fmt.format(lastDay)}`;
};

function CommissionsTab({ onUpgrade }: { onUpgrade: () => void }) {
  const { toast } = useToast();
  const [data, setData] = useState<CommissionsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [issuing, setIssuing] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [checkoutId, setCheckoutId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/owner/commissions", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const d: CommissionsData = await res.json();
      setData(d);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti provizij.",
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
      const res = await fetch("/api/owner/commissions", {
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
        title: "Račun izdan",
        description: `${d.invoice.invoiceNumber} — ${fmtEur(d.invoice.amount)} za plačilo.`,
      });
      await load();
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Izdaja računa ni uspela.",
      });
    } finally {
      setIssuing(false);
    }
  };

  // Faza 5: kartično plačilo prek Stripe Checkout (samo, kadar Stripe ni v
  // demo načinu — sicer API vrne 503 z razlago). Redirect na Stripe URL.
  const handleCheckout = async (invoiceId: string) => {
    setCheckoutId(invoiceId);
    try {
      const res = await fetch("/api/owner/commissions/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId }),
      });
      const d = await res.json();
      if (!res.ok || !d.url) {
        toast({
          variant: "destructive",
          title: "Kartično plačilo ni na voljo",
          description: d.error || "Poskusite kasneje.",
        });
        return;
      }
      window.location.href = d.url as string;
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Povezave na plačilni sistem ni bilo mogoče vzpostaviti.",
      });
    } finally {
      setCheckoutId(null);
    }
  };

  const handleMarkPaid = async (invoiceId: string) => {
    setMarkingId(invoiceId);
    try {
      const res = await fetch("/api/owner/commissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_paid", invoiceId }),
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
        title: "Račun je plačan",
        description: `${d.invoice.invoiceNumber} — hvala!`,
      });
      await load();
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Označitev plačila ni uspela.",
      });
    } finally {
      setMarkingId(null);
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

  const ratePercent = Math.round(data.rate * 100);
  const canGenerate =
    !data.isPremium &&
    data.lastMonth.bookingCount > 0 &&
    !data.lastMonth.invoiceExists;

  return (
    <div className="space-y-6">
      {/* Glava + politika */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Percent className="size-4 text-primary" aria-hidden="true" />
            Provizije — model kot pri Booking.com
          </CardTitle>
          <CardDescription>
            Turist plača polno ceno neposredno vam. Vi obračunate provizijo
            le za rezervacije, ki jih prinese AI kanal (brezplačna konzultacija).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {data.isPremium ? (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                <Crown className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold text-emerald-900 dark:text-emerald-200">
                  Vaša provizijska stopnja: 0 %
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Provizija je vključena v vašo Premium naročnino — računov
                  ni treba izdajati.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-border/60 bg-muted/40 p-4">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Percent className="size-5" aria-hidden="true" />
              </div>
              <div className="flex-1 min-w-0 text-sm">
                <p className="font-semibold">
                  Vaša provizijska stopnja: {ratePercent} %
                </p>
                <p className="text-muted-foreground mt-0.5">
                  Provizija se obračuna le na rezervacijah, ki jih prinese AI
                  konzultacija ({data.lastMonth.bookingCount > 0 || data.currentMonth.bookingCount > 0
                    ? "vidne spodaj"
                    : "še ni atribuiranih rezervacij"}
                  ). Premium (149&nbsp;€/mes) = 0&nbsp;% provizije in 5-odstotni boost.
                </p>
              </div>
              <Button
                onClick={onUpgrade}
                className="gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Crown className="size-4" aria-hidden="true" />
                Nadgradite na Premium
              </Button>
            </div>
          )}

          {/* Tekoči mesec — predogled */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Tekoči mesec · {data.currentMonth.monthLabel}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <CalendarCheck className="size-3.5" aria-hidden="true" />
                  Rezervacije iz AI kanala
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {data.currentMonth.bookingCount.toLocaleString("sl-SI")}
                </div>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Banknote className="size-3.5" aria-hidden="true" />
                  Osnova za provizijo
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums">
                  {fmtEur(data.currentMonth.commissionBase)}
                </div>
              </div>
              <div className="rounded-lg border border-emerald-300/60 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800/40 p-4">
                <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                  <Percent className="size-3.5" aria-hidden="true" />
                  Predvidena provizija ({ratePercent} %)
                </div>
                <div className="mt-1 text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-300">
                  {fmtEur(data.currentMonth.estimatedAmount)}
                </div>
              </div>
            </div>
            {data.currentMonth.bookingCount === 0 && (
              <p className="text-xs text-muted-foreground mt-2">
                V {data.currentMonth.monthLabel} še ni rezervacij, ki bi jih
                prinesla AI konzultacija — provizija nastane le ob dejanski
                rezervaciji.
              </p>
            )}
          </div>

          {/* Izdaja računa za prejšnji mesec */}
          <div className="rounded-lg border border-border/60 p-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold flex items-center gap-2">
                  <Receipt className="size-4 text-primary" aria-hidden="true" />
                  Račun za {data.lastMonth.monthLabel}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {data.lastMonth.bookingCount > 0 ? (
                    <>
                      {data.lastMonth.bookingCount}{" "}
                      {data.lastMonth.bookingCount === 1
                        ? "rezervacija"
                        : "rezervacije"}{" "}
                      · osnova {fmtEur(data.lastMonth.commissionBase)} ·
                      provizija{" "}
                      <span className="font-semibold text-foreground">
                        {fmtEur(data.lastMonth.amount)}
                      </span>
                    </>
                  ) : (
                    <>Ni rezervacij iz AI konzultacij v tem obdobju.</>
                  )}
                </p>
                {data.lastMonth.invoiceExists && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Račun za to obdobje je že izdan — viden v seznamu spodaj.
                  </p>
                )}
              </div>
              {!data.isPremium && (
                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate || issuing}
                  className="gap-1.5 shrink-0 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {issuing ? (
                    <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Receipt className="size-4" aria-hidden="true" />
                  )}
                  Izdi račun
                </Button>
              )}
            </div>
          </div>

          {/* Zgodovina računov */}
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
              Izdani računi
            </div>
            {data.invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                Še ni izdanih provizijskih računov. Prvi račun se izda za
                zaključeno mesečno obdobje z vsaj eno rezervacijo iz AI
                konzultacije.
              </div>
            ) : (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {data.invoices.map((inv) => (
                  <div
                    key={inv.id}
                    className="rounded-lg border border-border/60 p-4 flex flex-col sm:flex-row sm:items-center gap-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold">
                          {inv.invoiceNumber}
                        </span>
                        <Badge
                          className={cn(
                            "border-0",
                            inv.status === "paid"
                              ? "bg-emerald-500 text-white"
                              : "bg-amber-500 text-white"
                          )}
                        >
                          {inv.status === "paid" ? "Plačano" : "Za plačilo"}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {fmtPeriod(inv.periodStart, inv.periodEnd)} ·{" "}
                        {inv.bookingCount}{" "}
                        {inv.bookingCount === 1
                          ? "rezervacija"
                          : "rezervacij"}{" "}
                        · osnova {fmtEur(inv.commissionBase)} ·{" "}
                        {Math.round(inv.rate * 100)} %
                      </p>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3 shrink-0">
                      <div className="text-right">
                        <div className="text-lg font-bold tabular-nums">
                          {fmtEur(inv.amount)}
                        </div>
                      </div>
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        title="Odpri PDF računa (novo zavihek)"
                      >
                        <a
                          href={`/api/owner/commissions/invoice-pdf?id=${inv.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <FileText className="size-3.5" aria-hidden="true" />
                          PDF
                        </a>
                      </Button>
                      {inv.status === "issued" && (
                        <>
                          {data.stripeEnabled && (
                            <Button
                              size="sm"
                              variant="default"
                              onClick={() => handleCheckout(inv.id)}
                              disabled={checkoutId === inv.id}
                              className="gap-1.5"
                              title="Enkratno plačilo prek Stripe Checkout"
                            >
                              {checkoutId === inv.id ? (
                                <Loader2
                                  className="size-3.5 animate-spin"
                                  aria-hidden="true"
                                />
                              ) : (
                                <CreditCard className="size-3.5" aria-hidden="true" />
                              )}
                              Plačaj s kartico
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleMarkPaid(inv.id)}
                            disabled={markingId === inv.id}
                            className="gap-1.5"
                            title={
                              data.stripeEnabled
                                ? "Ročno označi kot plačano (npr. po SEPA nakazilu)"
                                : "Demo obračun — po SEPA nakazilu na PDF računu označi račun kot plačan"
                            }
                          >
                            {markingId === inv.id ? (
                              <Loader2
                                className="size-3.5 animate-spin"
                                aria-hidden="true"
                              />
                            ) : (
                              <Check className="size-3.5" aria-hidden="true" />
                            )}
                            Označi kot plačano
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground mt-3">
              Zneski se izračunajo strežno iz atribuiranih rezervacij
              (vir: AI konzultacije). Stopnja se zapiše ob izdaji računa. Vsak
              račun lahko prenesete ali natisnete kot PDF.
              {data.stripeEnabled
                ? " Izdan račun lahko poravnate tudi s kartico (Stripe)."
                : " Kartično plačanje se omogoči, ko so konfigurirani Stripe ključi (sicer SEPA nakazilo)."}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
  hint,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  color: "primary" | "amber" | "emerald";
  /** Opcijski podnapis (razlaga števca — npr. AI priporočila). */
  hint?: string;
}) {
  return (
    <Card className="py-0">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground">
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              color === "amber"
                ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                : color === "emerald"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-primary/10 text-primary"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
        {hint ? (
          <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

/* ====================== PRODUCTS TAB ====================== */

function ProductsTab({
  plan,
  isBetaActive,
}: {
  plan: ListingPlan;
  isBetaActive: boolean;
}) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/products", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setProducts(data.products || []);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti izdelkov.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  const limits = isBetaActive
    ? PRODUCT_PLAN_LIMITS_BETA
    : PRODUCT_PLAN_LIMITS_NORMAL;
  const planLimit = limits[plan as MarketplacePlan] ?? 1;
  const planLimitLabel =
    planLimit === Infinity ? "neomejeno" : String(planLimit);
  const count = products.length;
  const canAddMore = planLimit === Infinity ? true : count < planLimit;

  const handleAdd = () => {
    if (!canAddMore) {
      toast({
        variant: "destructive",
        title: "Dosežen limit",
        description: `Vaš paket (${
          PLAN_LABELS[plan as ListingPlan]
        }) omogoča največ ${planLimitLabel} izdelkov. Nadgradite naročnino.`,
      });
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (product: Product) => {
    setEditing(product);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner/products/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Brisanje ni uspelo.");
      }
      toast({
        title: "Izbrisano",
        description: "Izdelek je bil uspešno izbrisan.",
      });
      setProducts((prev) => prev.filter((p) => p.id !== deleteId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Brisanje ni uspelo.",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">Izdelki v tržnici</h2>
          <p className="text-sm text-muted-foreground">
            {count} od {planLimitLabel} izdelkov · paket{" "}
            {PLAN_LABELS[plan as ListingPlan]}
          </p>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!canAddMore}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj izdelek
        </Button>
      </div>

      {isBetaActive && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Rocket className="size-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Beta: {plan === "free" ? "3 izdelki brezplačno" : plan === "premium" ? "10 izdelkov brezplačno" : "neomejeno brezplačno"}
              {plan === "free" && " (običajno 1)"}
              {plan === "premium" && " (običajno 5)"}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              Med beta obdobjem so vsi paketi brezplačni. Vaš paket{" "}
              {PLAN_LABELS[plan as ListingPlan]} vam omogoča {planLimitLabel}{" "}
              izdelkov.
            </p>
          </div>
        </div>
      )}

      {!canAddMore && (
        <Alert className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
          <Crown className="size-4 text-amber-600" aria-hidden="true" />
          <AlertTitle>Dosežen limit paketa</AlertTitle>
          <AlertDescription>
            Vaš paket ({PLAN_LABELS[plan as ListingPlan]}) omogoča največ{" "}
            {planLimitLabel}{" "}
            {planLimit === 1 ? "izdelek" : planLimit < 5 ? "izdelka" : "izdelkov"}
            . Za več izdelkov nadgradite na višji paket v zavihku
            &laquo;Naročnina&raquo;.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      ) : products.length === 0 ? (
        <ProductsEmptyState onAdd={handleAdd} canAdd={canAddMore} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => handleEdit(product)}
              onDelete={() => setDeleteId(product.id)}
            />
          ))}
        </div>
      )}

      <ProductFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        product={editing}
        onSaved={fetchProducts}
      />

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Izbriši izdelek?</AlertDialogTitle>
            <AlertDialogDescription>
              To dejanje je nepovratno. Izdelek bo trajno odstranjen iz tržnice
              in ne bo več prikazan obiskovalcem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Prekliči</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Brišem...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Izbriši
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ProductsEmptyState({
  onAdd,
  canAdd,
}: {
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <Card className="border-dashed border-2 border-border bg-background">
      <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Package className="size-8 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Nimate izdelkov</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Dodajte svoj prvi izdelek v tržnico in začnite prodajati slovenske
            dobrote obiskovalcem.
          </p>
        </div>
        <Button
          onClick={onAdd}
          disabled={!canAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj svoj prvi izdelek
        </Button>
      </CardContent>
    </Card>
  );
}

function ProductCard({
  product,
  onEdit,
  onDelete,
}: {
  product: Product;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className="overflow-hidden flex flex-col gap-0 py-0">
      {/* Slika */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted">
        {product.images.length > 0 ? (
          <img
            src={product.images[0]}
            alt={product.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-4xl">
            <span aria-hidden="true">
              {PRODUCT_CATEGORY_ICONS[product.category]}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground shadow-sm text-xs">
          <span aria-hidden="true">
            {PRODUCT_CATEGORY_ICONS[product.category]}
          </span>
          {PRODUCT_CATEGORY_LABELS[product.category]}
        </Badge>
        <div className="absolute right-2 top-2 flex gap-1">
          {product.featured && (
            <Badge className="bg-amber-400 text-amber-950 border-0 text-xs">
              <Star className="size-3 fill-amber-950" aria-hidden="true" />
              Izpost.
            </Badge>
          )}
          {product.verified && (
            <Badge className="bg-primary text-primary-foreground border-0 text-xs">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Overjen
            </Badge>
          )}
        </div>
      </div>

      {/* Vsebina */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-bold leading-tight line-clamp-1">
            {product.name}
          </h3>
          {product.destinationName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {product.destinationName}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {product.description}
        </p>

        {/* Atributi */}
        {(product.organic ||
          product.handmade ||
          product.vegan ||
          product.local) && (
          <div className="flex flex-wrap gap-1">
            {product.organic && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                Ekološko
              </Badge>
            )}
            {product.handmade && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                Ročno
              </Badge>
            )}
            {product.local && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                Lokalno
              </Badge>
            )}
            {product.vegan && (
              <Badge variant="secondary" className="text-[10px] gap-0.5">
                Vegansko
              </Badge>
            )}
          </div>
        )}

        {/* Cena + zaloga */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Euro className="size-3" aria-hidden="true" />
              Cena
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {formatPrice(product.price, product.currency)}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Package className="size-3" aria-hidden="true" />
              Zaloga
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {product.stock.toLocaleString("sl-SI")}
            </div>
          </div>
        </div>

        {/* Akcije */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="flex-1 gap-1.5"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Uredi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/5"
            aria-label="Izbriši"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ====================== EXPERIENCES TAB ====================== */

function ExperiencesTab({
  plan,
  isBetaActive,
}: {
  plan: ListingPlan;
  isBetaActive: boolean;
}) {
  const { toast } = useToast();
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Experience | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchExperiences = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/owner/experiences", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setExperiences(data.experiences || []);
    } catch {
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče naložiti izkušenj.",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchExperiences();
  }, [fetchExperiences]);

  const limits = isBetaActive
    ? EXPERIENCE_PLAN_LIMITS_BETA
    : EXPERIENCE_PLAN_LIMITS_NORMAL;
  const planLimit = limits[plan as MarketplacePlan] ?? 1;
  const planLimitLabel =
    planLimit === Infinity ? "neomejeno" : String(planLimit);
  const count = experiences.length;
  const canAddMore = planLimit === Infinity ? true : count < planLimit;

  const handleAdd = () => {
    if (!canAddMore) {
      toast({
        variant: "destructive",
        title: "Dosežen limit",
        description: `Vaš paket (${
          PLAN_LABELS[plan as ListingPlan]
        }) omogoča največ ${planLimitLabel} izkušenj. Nadgradite naročnino.`,
      });
      return;
    }
    setEditing(null);
    setFormOpen(true);
  };

  const handleEdit = (experience: Experience) => {
    setEditing(experience);
    setFormOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/owner/experiences/${deleteId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Brisanje ni uspelo.");
      }
      toast({
        title: "Izbrisano",
        description: "Izkušnja je bila uspešno izbrisana.",
      });
      setExperiences((prev) => prev.filter((e) => e.id !== deleteId));
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Napaka",
        description:
          err instanceof Error ? err.message : "Brisanje ni uspelo.",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold sm:text-xl">Izkušnje v tržnici</h2>
          <p className="text-sm text-muted-foreground">
            {count} od {planLimitLabel} izkušenj · paket{" "}
            {PLAN_LABELS[plan as ListingPlan]}
          </p>
        </div>
        <Button
          onClick={handleAdd}
          disabled={!canAddMore}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj izkušnjo
        </Button>
      </div>

      {isBetaActive && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
            <Rocket className="size-5" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
              Beta: {plan === "free" ? "3 izkušnje brezplačno" : plan === "premium" ? "10 izkušenj brezplačno" : "neomejeno brezplačno"}
              {plan === "free" && " (običajno 1)"}
              {plan === "premium" && " (običajno 5)"}
            </p>
            <p className="text-xs text-amber-700/80 dark:text-amber-300/70 mt-0.5">
              Med beta obdobjem so vsi paketi brezplačni. Vaš paket{" "}
              {PLAN_LABELS[plan as ListingPlan]} vam omogoča {planLimitLabel}{" "}
              izkušenj.
            </p>
          </div>
        </div>
      )}

      {!canAddMore && (
        <Alert className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
          <Crown className="size-4 text-amber-600" aria-hidden="true" />
          <AlertTitle>Dosežen limit paketa</AlertTitle>
          <AlertDescription>
            Vaš paket ({PLAN_LABELS[plan as ListingPlan]}) omogoča največ{" "}
            {planLimitLabel}{" "}
            {planLimit === 1 ? "izkušnjo" : planLimit < 5 ? "izkušnji" : "izkušenj"}
            . Za več izkušenj nadgradite na višji paket v zavihku
            &laquo;Naročnina&raquo;.
          </AlertDescription>
        </Alert>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2
            className="size-8 animate-spin text-muted-foreground"
            aria-hidden="true"
          />
        </div>
      ) : experiences.length === 0 ? (
        <ExperiencesEmptyState onAdd={handleAdd} canAdd={canAddMore} />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {experiences.map((experience) => (
            <ExperienceCard
              key={experience.id}
              experience={experience}
              onEdit={() => handleEdit(experience)}
              onDelete={() => setDeleteId(experience.id)}
            />
          ))}
        </div>
      )}

      <ExperienceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        experience={editing}
        onSaved={fetchExperiences}
      />

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={(open) => !open && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Izbriši izkušnjo?</AlertDialogTitle>
            <AlertDialogDescription>
              To dejanje je nepovratno. Izkušnja bo trajno odstranjena iz
              tržnice in ne bo več prikazana obiskovalcem.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Prekliči</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Brišem...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" aria-hidden="true" />
                  Izbriši
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ExperiencesEmptyState({
  onAdd,
  canAdd,
}: {
  onAdd: () => void;
  canAdd: boolean;
}) {
  return (
    <Card className="border-dashed border-2 border-border bg-background">
      <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Ticket className="size-8 text-primary" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">Nimate izkušenj</h3>
          <p className="text-sm text-muted-foreground max-w-sm">
            Dodajte svojo prvo izkušnjo v tržnico in začnite ponujati
            nepozabne dogodke obiskovalcem.
          </p>
        </div>
        <Button
          onClick={onAdd}
          disabled={!canAdd}
          className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 font-semibold"
        >
          <Plus className="size-4" aria-hidden="true" />
          Dodaj svojo prvo izkušnjo
        </Button>
      </CardContent>
    </Card>
  );
}

function ExperienceCard({
  experience,
  onEdit,
  onDelete,
}: {
  experience: Experience;
  onEdit: () => void;
  onDelete: () => void;
}) {
  // Prikaži prve 3 jezike kot slovenska imena (ostanek kot +N)
  const langs = (experience.languages ?? []).slice(0, 3).map(
    (code) => LANGUAGE_LABELS[code] ?? code
  );
  const extraLangs = Math.max(0, (experience.languages ?? []).length - 3);

  return (
    <Card className="overflow-hidden flex flex-col gap-0 py-0">
      {/* Slika */}
      <div className="relative aspect-video w-full overflow-hidden bg-muted">
        {experience.images.length > 0 ? (
          <img
            src={experience.images[0]}
            alt={experience.name}
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-4xl">
            <span aria-hidden="true">
              {EXPERIENCE_CATEGORY_ICONS[experience.category]}
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
        <Badge className="absolute left-2 top-2 bg-primary text-primary-foreground shadow-sm text-xs">
          <span aria-hidden="true">
            {EXPERIENCE_CATEGORY_ICONS[experience.category]}
          </span>
          {EXPERIENCE_CATEGORY_LABELS[experience.category]}
        </Badge>
        <div className="absolute right-2 top-2 flex gap-1">
          {experience.featured && (
            <Badge className="bg-amber-400 text-amber-950 border-0 text-xs">
              <Star className="size-3 fill-amber-950" aria-hidden="true" />
              Izpost.
            </Badge>
          )}
          {experience.verified && (
            <Badge className="bg-primary text-primary-foreground border-0 text-xs">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Overjen
            </Badge>
          )}
        </div>
      </div>

      {/* Vsebina */}
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="space-y-1">
          <h3 className="font-bold leading-tight line-clamp-1">
            {experience.name}
          </h3>
          {experience.destinationName && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {experience.destinationName}
            </p>
          )}
        </div>

        <p className="text-xs text-muted-foreground line-clamp-2">
          {experience.description}
        </p>

        {/* Trajanje + skupina */}
        <div className="grid grid-cols-2 gap-2 mt-auto">
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Clock className="size-3" aria-hidden="true" />
              Trajanje
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {formatDuration(experience.durationHours)}
            </div>
          </div>
          <div className="rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
              <Users className="size-3" aria-hidden="true" />
              Skupina
            </div>
            <div className="text-sm font-semibold tabular-nums">
              {experience.minGroupSize === experience.maxGroupSize
                ? `${experience.minGroupSize}`
                : `${experience.minGroupSize}–${experience.maxGroupSize}`}
            </div>
          </div>
        </div>

        {/* Jeziki */}
        {langs.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
            <Languages className="size-3" aria-hidden="true" />
            <span className="truncate">
              {langs.join(", ")}
              {extraLangs > 0 && ` +${extraLangs}`}
            </span>
          </div>
        )}

        {/* Cena na osebo */}
        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
            Cena na osebo
          </div>
          <div className="text-base font-bold tabular-nums text-primary">
            {formatPrice(experience.pricePerPerson, experience.currency)}
          </div>
        </div>

        {/* Akcije */}
        <div className="flex gap-2 pt-1">
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
            className="flex-1 gap-1.5"
          >
            <Pencil className="size-3.5" aria-hidden="true" />
            Uredi
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="text-destructive hover:text-destructive hover:bg-destructive/5"
            aria-label="Izbriši"
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
