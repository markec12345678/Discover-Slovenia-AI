"use client";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  Building2,
  Building,
  LogOut,
  Plus,
  Pencil,
  Trash2,
  Eye,
  MousePointerClick,
  Star,
  Crown,
  Check,
  CheckCircle2,
  TrendingUp,
  Loader2,
  AlertCircle,
  MapPin,
  ShieldCheck,
  Sparkles,
  Rocket,
  Gift,
  Package,
  Ticket,
  Users,
  Target,
  Mail,
  Phone,
  ExternalLink,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { BetaBanner } from "@/components/beta-banner";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  type Listing,
  type ListingPlan,
} from "@/lib/listings-types";

// ============================================================================
// KONSTANTE — omejitve lokalov glede na paket in beta status
// ============================================================================

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

interface BetaStatus {
  isActive: boolean;
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string;
}

interface LeadsSummary {
  count: number;
  latest: string | null;
}

// ============================================================================
// GLAVNA KOMPONENTA
// ============================================================================

export default function OwnerDashboardPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session, status } = useSession();

  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loadingListings, setLoadingListings] = React.useState(true);
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Listing | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const [betaStatus, setBetaStatus] = React.useState<BetaStatus | null>(null);
  const [leadsSummary, setLeadsSummary] = React.useState<LeadsSummary | null>(
    null,
  );

  // Redirect na prijavo če ni prijavljen
  React.useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/owner/prijava");
    }
  }, [status, router]);

  // Fetch beta status + leads summary
  React.useEffect(() => {
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then((d: BetaStatus) => setBetaStatus(d))
      .catch(() => {});
    fetch("/api/leads")
      .then((r) => r.json())
      .then((d: LeadsSummary) =>
        setLeadsSummary({
          count: Number(d?.count ?? 0),
          latest: d?.latest ?? null,
        }),
      )
      .catch(() => {});
  }, []);

  const fetchListings = React.useCallback(async () => {
    setLoadingListings(true);
    try {
      const res = await fetch("/api/owner/listings", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setListings((data?.listings as Listing[]) ?? []);
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

  React.useEffect(() => {
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
        description: `Vaš paket (${PLAN_LABELS[plan]}) omogoča največ ${planLimitLabel} ${
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
              <span>Izdelki</span>
            </TabsTrigger>
            <TabsTrigger value="experiences" className="gap-1.5 text-xs sm:text-sm">
              <Ticket className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Izkušnje</span>
              <span className="sm:hidden">Izkuš.</span>
            </TabsTrigger>
            <TabsTrigger value="narocnina" className="gap-1.5 text-xs sm:text-sm">
              <Crown className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Naročnina</span>
              <span className="sm:hidden">Naroč.</span>
            </TabsTrigger>
            <TabsTrigger value="statistika" className="gap-1.5 text-xs sm:text-sm">
              <TrendingUp className="size-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Statistika</span>
              <span className="sm:hidden">Stat.</span>
            </TabsTrigger>
          </TabsList>

          {/* TAB 1: Moji lokalci */}
          <TabsContent value="listings" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold sm:text-xl">Moji lokalci</h2>
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
                    Beta:{" "}
                    {plan === "free"
                      ? "3 lokalci brezplačno"
                      : plan === "premium"
                      ? "8 lokalcev brezplačno"
                      : "neomejeno brezplačno"}
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

            {/* Plan limit info */}
            <div className="rounded-lg border border-border bg-card p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  Izrabljeno v paketu
                </span>
                <span className="font-medium tabular-nums">
                  {listingsCount} / {planLimitLabel}
                </span>
              </div>
              <Progress
                value={
                  planLimit === Infinity
                    ? 100
                    : Math.min(100, (listingsCount / planLimit) * 100)
                }
                className="h-2"
              />
              {!canAddMore && (
                <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                  <Crown className="size-3.5" aria-hidden="true" />
                  Dosežen limit paketa. Nadgradite na višji paket v zavihku
                  &laquo;Naročnina&raquo;.
                </p>
              )}
            </div>

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

          {/* TAB 2: Izdelki (placeholder) */}
          <TabsContent value="products" className="space-y-4">
            <EmptyPlaceholder
              icon={<Package className="size-8" aria-hidden="true" />}
              title="Nimate izdelkov"
              description="Modul za izdelke je v pripravi. Kmalu boste lahko dodajali izdelke iz svojega lokala — lokalne dobrote, obrti, unikatne izdelke."
            />
          </TabsContent>

          {/* TAB 3: Izkušnje (placeholder) */}
          <TabsContent value="experiences" className="space-y-4">
            <EmptyPlaceholder
              icon={<Ticket className="size-8" aria-hidden="true" />}
              title="Nimate izkušenj"
              description="Modul za izkušnje je v pripravi. Kmalu boste lahko dodajali turistične izkušnje — degustacije, delavnice, vodene oglede in podobno."
            />
          </TabsContent>

          {/* TAB 4: Naročnina */}
          <TabsContent value="narocnina" className="space-y-6">
            <SubscriptionTab
              plan={plan}
              isBetaActive={isBetaActive}
              listingsCount={listingsCount}
              betaStatus={betaStatus}
            />
          </TabsContent>

          {/* TAB 5: Statistika */}
          <TabsContent value="statistika" className="space-y-6">
            <StatisticsTab
              listings={listings}
              loading={loadingListings}
              leadsSummary={leadsSummary}
              plan={plan}
            />
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

// ============================================================================
// PLAN BADGE
// ============================================================================

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

// ============================================================================
// EMPTY STATE (lokalci)
// ============================================================================

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

// ============================================================================
// EMPTY PLACEHOLDER (Izdelki / Izkušnje)
// ============================================================================

function EmptyPlaceholder({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed border-2 border-border bg-background">
      <CardContent className="flex flex-col items-center justify-center py-12 sm:py-16 text-center gap-4">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {icon}
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold">{title}</h3>
          <p className="text-sm text-muted-foreground max-w-md">{description}</p>
        </div>
        <Badge variant="outline" className="gap-1.5">
          <Sparkles className="size-3" aria-hidden="true" />
          V pripravi
        </Badge>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// LISTING CARD
// ============================================================================

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
            <span aria-hidden="true">{CATEGORY_ICONS[listing.category]}</span>
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
            className="text-destructive hover:text-destructive hover:bg-destructive/10 gap-1.5"
            aria-label={`Izbriši ${listing.name}`}
          >
            <Trash2 className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Izbriši</span>
          </Button>
        </div>
      </div>
    </Card>
  );
}

// ============================================================================
// TAB 4: NAROČNINA
// ============================================================================

const PLAN_FEATURES: Record<ListingPlan, string[]> = {
  free: [
    "1 lokal (3 med beta)",
    "Osnovni prikaz na seznamu",
    "Kontakt podatki",
    "Osnovna statistika",
  ],
  premium: [
    "5 lokalov (8 med beta)",
    "Izpostavljen prikaz",
    "Več slik in specialnosti",
    "Podrobna statistika",
    "Prednostna podpora",
  ],
  enterprise: [
    "Neomejeno lokalov",
    "Vse funkcije Premium",
    "API dostop",
    "Namenski account manager",
    "Prioritetna uvrstitev",
  ],
};

const PLAN_PRICES: Record<ListingPlan, string> = {
  free: "0 €",
  premium: "49 €",
  enterprise: "149 €",
};

function SubscriptionTab({
  plan,
  isBetaActive,
  listingsCount,
  betaStatus,
}: {
  plan: ListingPlan;
  isBetaActive: boolean;
  listingsCount: number;
  betaStatus: BetaStatus | null;
}) {
  const { toast } = useToast();

  const handleUpgrade = (targetPlan: ListingPlan) => {
    if (targetPlan === plan) {
      toast({
        title: "Že aktivno",
        description: `Vaš trenutni paket je ${PLAN_LABELS[plan]}.`,
      });
      return;
    }
    toast({
      title: "Nadgradnja (demo)",
      description: `Nadgradnja na paket ${PLAN_LABELS[targetPlan]} bo na voljo po koncu beta obdobja. Med beta je vaš paket že brezplačen.`,
    });
  };

  return (
    <div className="space-y-6">
      {/* Trenutni paket */}
      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Crown className="size-5 text-primary" aria-hidden="true" />
            Trenutni paket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <PlanBadge plan={plan} />
                <span className="text-2xl font-bold">{PLAN_LABELS[plan]}</span>
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {isBetaActive
                  ? "Brezplačno med beta obdobjem."
                  : `${PLAN_PRICES[plan]} / mesec`}
              </p>
            </div>
            <div className="text-sm text-muted-foreground">
              <p>
                Aktivnih lokalov:{" "}
                <span className="font-semibold text-foreground">
                  {listingsCount}
                </span>
              </p>
              {isBetaActive && betaStatus && (
                <p className="mt-0.5 flex items-center gap-1">
                  <Sparkles className="size-3 text-amber-500" aria-hidden="true" />
                  Beta: še {betaStatus.remainingToMonetization} lokalov do
                  monetizacije
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Paketi za nadgradnjo */}
      <div>
        <h3 className="text-lg font-bold mb-3">Paketi</h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {(["free", "premium", "enterprise"] as ListingPlan[]).map((p) => {
            const isCurrent = p === plan;
            const isUpgrade = p !== "free" && p !== plan;
            return (
              <Card
                key={p}
                className={cn(
                  "flex flex-col",
                  isCurrent && "border-primary ring-2 ring-primary/20",
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {p === "free" && (
                        <Building className="size-4" aria-hidden="true" />
                      )}
                      {p === "premium" && (
                        <Star className="size-4 text-amber-500" aria-hidden="true" />
                      )}
                      {p === "enterprise" && (
                        <Crown className="size-4 text-primary" aria-hidden="true" />
                      )}
                      {PLAN_LABELS[p]}
                    </CardTitle>
                    {isCurrent && (
                      <Badge className="bg-primary text-primary-foreground border-0">
                        Trenutni
                      </Badge>
                    )}
                  </div>
                  <div className="mt-2">
                    <span className="text-2xl font-bold">
                      {PLAN_PRICES[p]}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {" "}
                      / mesec
                    </span>
                    {isBetaActive && p !== "free" && (
                      <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                        Brezplačno med beta
                      </p>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 flex flex-col gap-3">
                  <ul className="space-y-1.5 flex-1">
                    {PLAN_FEATURES[p].map((feat) => (
                      <li
                        key={feat}
                        className="flex items-start gap-2 text-sm"
                      >
                        <Check
                          className="size-4 mt-0.5 shrink-0 text-primary"
                          aria-hidden="true"
                        />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={() => handleUpgrade(p)}
                    disabled={isCurrent}
                    variant={isUpgrade ? "default" : "outline"}
                    className="w-full gap-1.5 font-semibold"
                  >
                    {isCurrent ? (
                      <>
                        <Check className="size-4" aria-hidden="true" />
                        Aktivno
                      </>
                    ) : isUpgrade ? (
                      <>
                        <Crown className="size-4" aria-hidden="true" />
                        Nadgradi
                      </>
                    ) : (
                      "Osnovni paket"
                    )}
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Beta info */}
      {isBetaActive && (
        <Alert className="border-amber-400/50 bg-amber-50 dark:bg-amber-950/20">
          <Gift className="size-4 text-amber-600" aria-hidden="true" />
          <AlertTitle>Beta obdobje — brezplačno za vse</AlertTitle>
          <AlertDescription>
            Med beta obdobjem so vsi paketi brezplačni. Monetizacija se
            samodejno aktivira, ko platforma doseže 30 aktivnih lokalov.
            Nadgradnje bodo na voljo po koncu beta obdobja.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

// ============================================================================
// TAB 5: STATISTIKA
// ============================================================================

function StatisticsTab({
  listings,
  loading,
  leadsSummary,
  plan,
}: {
  listings: Listing[];
  loading: boolean;
  leadsSummary: LeadsSummary | null;
  plan: string;
}) {
  // Top lokalci po ogledih
  const top3 = React.useMemo(
    () =>
      [...listings]
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        .slice(0, 3),
    [listings],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
        Nalaganje statistike...
      </div>
    );
  }

  const totalViews = listings.reduce((s, l) => s + (l.viewCount ?? 0), 0);
  const totalClicks = listings.reduce((s, l) => s + (l.clickCount ?? 0), 0);
  const leadsCount = leadsSummary?.count ?? 0;
  const conversionRate =
    totalViews > 0 ? (leadsCount / totalViews) * 100 : 0;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Statistika</h2>
        <p className="text-sm text-muted-foreground">
          Pregled uspešnosti vaših lokalov.
        </p>
      </div>

      {/* KPI kartice */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Ogledi"
          value={totalViews.toLocaleString("sl-SI")}
          icon={<Eye className="size-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Kliki"
          value={totalClicks.toLocaleString("sl-SI")}
          icon={<MousePointerClick className="size-4" aria-hidden="true" />}
          tone="primary"
        />
        <KpiCard
          label="Leadi"
          value={leadsCount.toLocaleString("sl-SI")}
          icon={<Users className="size-4" aria-hidden="true" />}
          tone="emerald"
        />
        <KpiCard
          label="Konverzija"
          value={`${conversionRate.toFixed(1)} %`}
          icon={<Target className="size-4" aria-hidden="true" />}
          tone="amber"
        />
      </div>

      {/* Pomožne info kartice */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top lokalci */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              Najboljši lokalci (po ogledih)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top3.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Dodajte lokal za prikaz statistike.
              </p>
            ) : (
              top3.map((l, i) => (
                <div
                  key={l.id}
                  className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-2.5"
                >
                  <div
                    className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold"
                    aria-hidden="true"
                  >
                    {i + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate flex items-center gap-1.5">
                      <span aria-hidden="true">
                        {CATEGORY_ICONS[l.category]}
                      </span>
                      {l.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.destinationName ?? "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                      <Eye
                        className="size-3.5 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {l.viewCount.toLocaleString("sl-SI")}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {l.clickCount.toLocaleString("sl-SI")} klikov
                    </div>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Zadnji lead */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="size-4 text-primary" aria-hidden="true" />
              Aktivnost leadov
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between rounded-md border border-border/60 bg-muted/30 p-3">
              <div>
                <p className="text-xs text-muted-foreground">
                  Skupno prejetih leadov
                </p>
                <p className="text-2xl font-bold tabular-nums">
                  {leadsCount.toLocaleString("sl-SI")}
                </p>
              </div>
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Users className="size-5" aria-hidden="true" />
              </div>
            </div>
            {leadsSummary?.latest && (
              <div className="text-xs text-muted-foreground">
                Zadnji lead:{" "}
                <span className="font-medium text-foreground">
                  {new Date(leadsSummary.latest).toLocaleString("sl-SI")}
                </span>
              </div>
            )}
            <Alert>
              <Target className="size-4" aria-hidden="true" />
              <AlertTitle>Konverzijski razmerje</AlertTitle>
              <AlertDescription>
                {conversionRate > 0
                  ? `${conversionRate.toFixed(1)} % obiskovalcev je oddalo povpraševanje.`
                  : "Dodajte lokal in privabite obiskovalce za prve leade."}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* AI Priporočila + ROI Dashboard */}
      <AIDashboard ownerPlan={plan} />

      {/* Kontakt za pomoč */}
      <Card className="border-dashed">
        <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Phone className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">Potrebujete pomoč?</p>
              <p className="text-xs text-muted-foreground">
                Naša ekipa vam pomaga izkoristiti polni potencial portala.
              </p>
            </div>
          </div>
          <Button variant="outline" asChild className="gap-1.5 shrink-0">
            <a href="mailto:podpora@ifeelslovenia.si">
              <ExternalLink className="size-4" aria-hidden="true" />
              Kontaktirajte nas
            </a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

// ============================================================================
// AI DASHBOARD — AI priporočila + ROI
// ============================================================================

function AIDashboard({ ownerPlan }: { ownerPlan: string }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/owner/analytics")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 flex items-center justify-center gap-3">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Nalagam AI statistiko…</span>
        </CardContent>
      </Card>
    );
  }

  if (!data || !data.summary) {
    return (
      <Card className="border-dashed">
        <CardContent className="p-6 text-center text-sm text-muted-foreground">
          Statistika AI priporočil bo na voljo po prvem generiranem itinererju.
        </CardContent>
      </Card>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-4">
      {/* Naslov */}
      <div className="flex items-center gap-2">
        <Sparkles className="size-5 text-primary" />
        <h3 className="text-lg font-bold">AI priporočila in ROI</h3>
      </div>

      {/* AI priporočila kartice */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="AI priporočila (30d)"
          value={s.aiRecommendations30d.toLocaleString("sl-SI")}
          icon={<Sparkles className="size-4" />}
          tone="primary"
        />
        <KpiCard
          label="Lead-i (30d)"
          value={s.leads30d.toLocaleString("sl-SI")}
          icon={<Users className="size-4" />}
          tone="emerald"
        />
        <KpiCard
          label="Est. prihodek"
          value={`${s.estimatedRevenue.toLocaleString("sl-SI")} €`}
          icon={<TrendingUp className="size-4" />}
          tone="amber"
        />
        <KpiCard
          label="ROI"
          value={`${s.roi > 0 ? "+" : ""}${s.roi}%`}
          icon={<Target className="size-4" />}
          tone={s.roiStatus === "positive" ? "emerald" : "default"}
        />
      </div>

      {/* ROI banner */}
      <Card className={s.roiStatus === "positive" ? "border-emerald-500/40 bg-emerald-50 dark:bg-emerald-950/20" : "border-amber-500/40 bg-amber-50 dark:bg-amber-950/20"}>
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className={`flex size-12 items-center justify-center rounded-lg ${s.roiStatus === "positive" ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600"}`}>
              {s.roiStatus === "positive" ? <CheckCircle2 className="size-6" /> : <AlertCircle className="size-6" />}
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-base">
                {s.roiStatus === "positive"
                  ? `ROI pozitiven! +${s.roi}%`
                  : "ROI še negativen — potrebno več aktivnosti"}
              </h4>
              <p className="text-sm text-muted-foreground mt-1">
                Vaših <strong>{s.monthlyCost}€</strong> naročnine = <strong>{s.estimatedRevenue}€</strong> prihodkov
                ({s.leads30d} leadov × {s.avgLeadValue}€ povprečna rezervacija)
              </p>
              {s.aiRecommendations30d > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Konverzija: {s.conversionRate}% (leadov / AI priporočil)
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Zadnjih 7 dni */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Ogledi (7d)</p>
            <p className="text-xl font-bold">{s.impressions7d}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">AI priporočila (7d)</p>
            <p className="text-xl font-bold">{s.aiRecommendations7d}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Lead-i (7d)</p>
            <p className="text-xl font-bold">{s.leads7d}</p>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 lokalov po AI priporočilih */}
      {data.topListings && data.topListings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              Top 5 lokalov (po AI priporočilih)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.topListings.map((l: TopListing, i: number) => (
              <div key={l.id} className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/30 p-2.5">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold">
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{l.name}</div>
                  <div className="text-xs text-muted-foreground">{l.destination || "—"}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-semibold">{l.aiRecs} AI</div>
                  <div className="text-[10px] text-muted-foreground">{l.views} ogledov</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Tipi za analytics
interface AnalyticsData {
  summary: {
    totalListings: number;
    plan: string;
    monthlyCost: number;
    impressions30d: number;
    clicks30d: number;
    aiRecommendations30d: number;
    leads30d: number;
    impressions7d: number;
    clicks7d: number;
    aiRecommendations7d: number;
    leads7d: number;
    conversionRate: number;
    estimatedRevenue: number;
    roi: number;
    roiStatus: string;
    avgLeadValue: number;
  };
  topListings: TopListing[];
  allListings: TopListing[];
}

interface TopListing {
  id: string;
  name: string;
  slug: string;
  category: string;
  views: number;
  clicks: number;
  aiRecs: number;
  leads: number;
  featured?: boolean;
  rating?: number;
  destination?: string | null;
}

// ============================================================================
// KPI CARD
// ============================================================================

function KpiCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "default" | "amber" | "primary" | "emerald";
}) {
  const toneClass = {
    default: "bg-muted/40 text-foreground",
    amber: "bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
    primary: "bg-primary/10 text-primary",
    emerald:
      "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  }[tone];

  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-2">
        <div
          className={`flex size-8 items-center justify-center rounded-md ${toneClass}`}
        >
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-2xl font-bold tabular-nums leading-tight">
            {value}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
