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
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  const [loadingListings, setLoadingListings] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Listing | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Beta status (client-side fetch)
  const [betaStatus, setBetaStatus] = useState<BetaStatus | null>(null);

  // Redirect na prijavo če ni prijavljen
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/owner/prijava");
    }
  }, [status, router]);

  // Fetch beta status
  useEffect(() => {
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then((d: BetaStatus) => setBetaStatus(d))
      .catch(() => {});
  }, []);

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
        <Tabs defaultValue="listings" className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-5 mb-6 gap-1">
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
            <StatisticsTab listings={listings} loading={loadingListings} />
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

function ListingCard({
  listing,
  onEdit,
  onDelete,
}: {
  listing: Listing;
  onEdit: () => void;
  onDelete: () => void;
}) {
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
        <div className="absolute right-2 top-2 flex gap-1">
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

function StatisticsTab({
  listings,
  loading,
}: {
  listings: Listing[];
  loading: boolean;
}) {
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

  if (listings.length === 0) {
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

  const totalViews = listings.reduce((sum, l) => sum + l.viewCount, 0);
  const totalClicks = listings.reduce((sum, l) => sum + l.clickCount, 0);
  const conversion =
    totalViews > 0 ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0";

  // Top lokal po views
  const topByViews = [...listings].sort(
    (a, b) => b.viewCount - a.viewCount
  )[0];

  // Top 5 lokalov po klikih
  const topByClicks = [...listings]
    .sort((a, b) => b.clickCount - a.clickCount)
    .slice(0, 5);

  const maxClicks = Math.max(...topByClicks.map((l) => l.clickCount), 1);

  return (
    <div className="space-y-6">
      {/* KPI kartice */}
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <KpiCard
          icon={Eye}
          label="Skupni ogledi"
          value={totalViews.toLocaleString("sl-SI")}
          color="primary"
        />
        <KpiCard
          icon={MousePointerClick}
          label="Skupni kliki"
          value={totalClicks.toLocaleString("sl-SI")}
          color="primary"
        />
        <KpiCard
          icon={TrendingUp}
          label="Konverzija"
          value={`${conversion}%`}
          color="amber"
        />
        <KpiCard
          icon={Building}
          label="Število lokalov"
          value={String(listings.length)}
          color="primary"
        />
      </div>

      {/* Top lokal */}
      {topByViews && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Star
                className="size-4 fill-amber-400 text-amber-400"
                aria-hidden="true"
              />
              Top lokal po ogledih
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                  <span aria-hidden="true">
                    {CATEGORY_ICONS[topByViews.category]}
                  </span>
                </div>
                <div className="min-w-0">
                  <p className="font-semibold truncate">{topByViews.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {CATEGORY_LABELS[topByViews.category]}
                    {topByViews.destinationName
                      ? ` · ${topByViews.destinationName}`
                      : ""}
                  </p>
                </div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-lg font-bold tabular-nums">
                  {topByViews.viewCount.toLocaleString("sl-SI")}
                </div>
                <div className="text-xs text-muted-foreground">ogledov</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Top 5 po klikih — simple bar chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MousePointerClick className="size-4 text-primary" aria-hidden="true" />
            Kliki po lokalah (top {topByClicks.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {topByClicks.map((l, idx) => {
            const widthPct = maxClicks > 0 ? (l.clickCount / maxClicks) * 100 : 0;
            return (
              <div key={l.id} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      #{idx + 1}
                    </span>
                    <span className="truncate">{l.name}</span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0">
                    {l.clickCount.toLocaleString("sl-SI")}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${widthPct}%` }}
                    role="progressbar"
                    aria-valuenow={l.clickCount}
                    aria-valuemin={0}
                    aria-valuemax={maxClicks}
                  />
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Opomba o zgodovinski statistiki */}
      <Alert>
        <AlertCircle className="size-4" aria-hidden="true" />
        <AlertTitle>Podrobna časovna statistika</AlertTitle>
        <AlertDescription>
          Prikazujemo skupne števce. Podrobna časovna statistika (po dnevih
          zadnjih 30 dni) bo na voljo s paketoma Premium in Enterprise.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
  color: "primary" | "amber";
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
                : "bg-primary/10 text-primary"
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
          </span>
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-2 text-2xl font-bold tabular-nums">{value}</div>
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
