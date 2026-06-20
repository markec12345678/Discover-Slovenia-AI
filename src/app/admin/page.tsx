"use client";

import * as React from "react";
import {
  Building2,
  Lock,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Users,
  TrendingUp,
  Eye,
  Star,
  Crown,
  Check,
  Mail,
  Phone,
  MapPin,
  Calendar,
  LogOut,
  Sparkles,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { BetaBanner } from "@/components/beta-banner";
import { useToast } from "@/hooks/use-toast";
import { DESTINATIONS } from "@/lib/slovenia-data";
import {
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  PLAN_LABELS,
  type Listing,
  type ListingCategory,
  type ListingPlan,
} from "@/lib/listings-types";

// ============================================================================
// KONSTANTE
// ============================================================================

const STORAGE_KEY = "admin_token";

const CATEGORIES: { value: ListingCategory; label: string }[] = [
  { value: "hotel", label: "Hotel" },
  { value: "restaurant", label: "Restavracija" },
  { value: "bar", label: "Bar" },
  { value: "activity", label: "Aktivnost" },
  { value: "shop", label: "Trgovina" },
  { value: "transport", label: "Transport" },
  { value: "other", label: "Drugo" },
];

const PLANS: { value: ListingPlan; label: string }[] = [
  { value: "free", label: "Osnovni (free)" },
  { value: "premium", label: "Premium" },
  { value: "enterprise", label: "Enterprise" },
];

const PRICE_RANGES = ["€", "€€", "€€€"] as const;
type PriceRange = (typeof PRICE_RANGES)[number];

type LeadStatus = "nov" | "kontaktiran" | "zakljucen";

const STATUS_LABELS: Record<LeadStatus, string> = {
  nov: "Nov",
  kontaktiran: "Kontaktiran",
  zakljucen: "Zaključen",
};

const STATUS_NEXT: Record<LeadStatus, LeadStatus> = {
  nov: "kontaktiran",
  kontaktiran: "zakljucen",
  zakljucen: "nov",
};

const STATUS_STYLES: Record<LeadStatus, string> = {
  nov: "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800",
  kontaktiran:
    "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  zakljucen:
    "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800",
};

interface Lead {
  id: string;
  timestamp: string;
  name: string;
  email: string;
  phone?: string;
  businessName: string;
  businessType: string;
  location: string;
  plan: string;
  message?: string;
  gdprConsent: boolean;
  status: LeadStatus;
}

interface LeadsSummary {
  count: number;
  latest: string | null;
}

interface AdminListingForm {
  name: string;
  category: ListingCategory;
  destinationId: string;
  description: string;
  longDescription: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  plan: ListingPlan;
  featured: boolean;
  verified: boolean;
  priceRange: PriceRange;
  openingHours: string;
  ownerEmail: string;
}

const EMPTY_FORM: AdminListingForm = {
  name: "",
  category: "restaurant",
  destinationId: "",
  description: "",
  longDescription: "",
  address: "",
  phone: "",
  email: "",
  website: "",
  plan: "free",
  featured: false,
  verified: false,
  priceRange: "€",
  openingHours: "",
  ownerEmail: "",
};

// ============================================================================
// GLAVNA KOMPONENTA
// ============================================================================

export default function AdminPage() {
  const [mounted, setMounted] = React.useState(false);
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    setMounted(true);
    try {
      const t = window.localStorage.getItem(STORAGE_KEY);
      setToken(t);
    } catch {
      setToken(null);
    }
  }, []);

  const handleLogout = () => {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setToken(null);
  };

  // SSR-safe placeholder (prepreči hydration mismatch)
  if (!mounted) {
    return (
      <div className="min-h-screen bg-muted/30 flex items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-muted/30 flex flex-col">
        <BetaBanner />
        <LoginForm
          onLogin={(t) => {
            try {
              window.localStorage.setItem(STORAGE_KEY, t);
            } catch {
              /* ignore */
            }
            setToken(t);
          }}
        />
      </div>
    );
  }

  return <AdminDashboard adminPassword={token} onLogout={handleLogout} />;
}

// ============================================================================
// LOGIN FORMA
// ============================================================================

function LoginForm({ onLogin }: { onLogin: (token: string) => void }) {
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) {
      setErrorMsg("Vnesite geslo");
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        onLogin(password);
      } else {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napačno geslo";
        setErrorMsg(msg);
        setLoading(false);
      }
    } catch (err) {
      console.error("[admin login] napaka:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ShieldCheck className="size-6" aria-hidden="true" />
          </div>
          <div>
            <CardTitle className="text-xl">Admin prijava</CardTitle>
            <CardDescription className="mt-1">
              Vnesite admin geslo za dostop do nadzorne plošče.
            </CardDescription>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-3">
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
                <span>{errorMsg}</span>
              </div>
            )}
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Admin geslo</Label>
              <div className="relative">
                <Lock
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
                  aria-hidden="true"
                />
                <Input
                  id="admin-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="pl-8"
                  autoFocus
                  autoComplete="current-password"
                />
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button
              type="submit"
              disabled={loading}
              className="w-full"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Prijava...
                </>
              ) : (
                "Prijava"
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-1">
              Za povratek na platformo{" "}
              <a
                href="/"
                className="text-primary underline underline-offset-2 hover:text-primary/80"
              >
                kliknite tukaj
              </a>
              .
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

// ============================================================================
// ADMIN DASHBOARD (3 TABI)
// ============================================================================

function AdminDashboard({
  adminPassword,
  onLogout,
}: {
  adminPassword: string;
  onLogout: () => void;
}) {
  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      <BetaBanner />

      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
              <ShieldCheck className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">
                Admin plošča
              </h1>
              <p className="text-xs text-muted-foreground hidden sm:block">
                I Feel Slovenia — upravljanje lokalov
              </p>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={onLogout}
            className="shrink-0 gap-1.5"
          >
            <LogOut className="size-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Odjava</span>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 flex-1">
        <Tabs defaultValue="listings" className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="listings" className="gap-1.5">
              <Building2 className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Lokali</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Leadi</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <TrendingUp className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Statistika</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="listings" className="mt-6">
            <ListingsTab adminPassword={adminPassword} />
          </TabsContent>

          <TabsContent value="leads" className="mt-6">
            <LeadsTab adminPassword={adminPassword} />
          </TabsContent>

          <TabsContent value="stats" className="mt-6">
            <StatsTab adminPassword={adminPassword} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// ============================================================================
// TAB 1: LOKALI
// ============================================================================

function ListingsTab({ adminPassword }: { adminPassword: string }) {
  const { toast } = useToast();
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Listing | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchListings = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Pridobi vse lokale iz /api/listings (max 100)
      const res = await fetch("/api/listings?limit=100", { cache: "no-store" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setListings((data?.listings as Listing[]) ?? []);
    } catch (err) {
      console.error("[admin/listings] fetch:", err);
      setErrorMsg("Napaka pri pridobivanju lokalov.");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchListings();
  }, [fetchListings]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return listings;
    const q = search.toLowerCase();
    return listings.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        (l.destinationName ?? "").toLowerCase().includes(q) ||
        l.category.toLowerCase().includes(q) ||
        (l.address ?? "").toLowerCase().includes(q),
    );
  }, [listings, search]);

  const handleOpenCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (listing: Listing) => {
    setEditing(listing);
    setFormOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/listings/${deleteId}`, {
        method: "DELETE",
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri brisanju";
        toast({
          variant: "destructive",
          title: "Napaka",
          description: msg,
        });
      } else {
        setListings((prev) => prev.filter((l) => l.id !== deleteId));
        toast({
          title: "Izbrisano",
          description: "Lokal je bil uspešno izbrisan.",
        });
      }
    } catch (err) {
      console.error("[admin/listings] delete:", err);
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Napaka pri povezavi s strežnikom.",
      });
    } finally {
      setDeleting(false);
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Lokali</h2>
          <p className="text-sm text-muted-foreground">
            Upravljajte vse lokale na platformi.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Iskanje po imenu, kraju..."
              className="pl-8 sm:w-64"
              aria-label="Iskanje lokalov"
            />
          </div>
          <Button onClick={handleOpenCreate} className="shrink-0 gap-1.5">
            <Plus className="size-4" aria-hidden="true" />
            Nov lokal
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Nalaganje lokalov...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Building2 className="size-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
              {search ? "Ni najdenih lokalov." : "Ni še lokalov. Dodajte prvega."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Ime</TableHead>
                    <TableHead className="hidden md:table-cell">Kategorija</TableHead>
                    <TableHead className="hidden lg:table-cell">Destinacija</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead className="hidden sm:table-cell">Status</TableHead>
                    <TableHead className="hidden md:table-cell">Ocena</TableHead>
                    <TableHead className="hidden lg:table-cell">Ogledi</TableHead>
                    <TableHead className="text-right">Akcije</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>
                        <div className="font-medium flex items-center gap-1.5">
                          <span aria-hidden="true">
                            {CATEGORY_ICONS[l.category]}
                          </span>
                          {l.name}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          /{l.slug}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[l.category] ?? l.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {l.destinationName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={l.plan} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          {l.featured && (
                            <Badge
                              variant="outline"
                              className="border-amber-300 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-800"
                            >
                              <Star
                                className="size-3 mr-0.5 fill-amber-500 text-amber-500"
                                aria-hidden="true"
                              />
                              Izpost.
                            </Badge>
                          )}
                          {l.verified && (
                            <Badge
                              variant="outline"
                              className="border-emerald-300 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800"
                            >
                              <Check className="size-3 mr-0.5" aria-hidden="true" />
                              Overjeno
                            </Badge>
                          )}
                          {!l.featured && !l.verified && (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex items-center gap-1 text-sm">
                          <Star
                            className="size-3.5 fill-amber-400 text-amber-400"
                            aria-hidden="true"
                          />
                          <span className="font-medium">
                            {l.rating.toFixed(1)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({l.reviewCount})
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Eye className="size-3.5" aria-hidden="true" />
                          {l.viewCount.toLocaleString("sl-SI")}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleOpenEdit(l)}
                            aria-label={`Uredi ${l.name}`}
                          >
                            <Pencil className="size-4" aria-hidden="true" />
                            <span className="sr-only">Uredi</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteId(l.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Izbriši ${l.name}`}
                          >
                            <Trash2 className="size-4" aria-hidden="true" />
                            <span className="sr-only">Izbriši</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-right">
        Skupno: {filtered.length} od {listings.length} lokalov
      </div>

      {/* Create/Edit Dialog */}
      <ListingFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        listing={editing}
        adminPassword={adminPassword}
        onSaved={fetchListings}
      />

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteId}
        onOpenChange={(o) => !o && setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Izbriši lokal?</AlertDialogTitle>
            <AlertDialogDescription>
              Ta akcija je trajna. Lokal in vsi njegovi podatki bodo odstranjeni s platforme.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Prekliči</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 gap-1.5"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                  Brisanje...
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
    </div>
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
// LISTING FORM DIALOG (admin)
// ============================================================================

function ListingFormDialog({
  open,
  onOpenChange,
  listing,
  adminPassword,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: Listing | null;
  adminPassword: string;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<AdminListingForm>(EMPTY_FORM);
  const [loading, setLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const isEdit = listing !== null;

  React.useEffect(() => {
    if (open) {
      if (listing) {
        setForm({
          name: listing.name,
          category: listing.category,
          destinationId: listing.destinationId ?? "",
          description: listing.description,
          longDescription: listing.longDescription ?? "",
          address: listing.address,
          phone: listing.phone ?? "",
          email: listing.email ?? "",
          website: listing.website ?? "",
          plan: listing.plan,
          featured: listing.featured,
          verified: listing.verified,
          priceRange: (listing.priceRange as PriceRange) || "€",
          openingHours: listing.openingHours ?? "",
          ownerEmail: "",
        });
      } else {
        setForm(EMPTY_FORM);
      }
      setErrorMsg(null);
    }
  }, [open, listing]);

  const update = <K extends keyof AdminListingForm>(
    key: K,
    value: AdminListingForm[K],
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (form.name.trim().length < 2) {
      setErrorMsg("Ime lokala je obvezno.");
      return;
    }
    if (form.description.trim().length < 10) {
      setErrorMsg("Kratki opis mora imeti vsaj 10 znakov.");
      return;
    }
    if (form.address.trim().length < 3) {
      setErrorMsg("Naslov je obvezen.");
      return;
    }

    setLoading(true);
    try {
      const dest = DESTINATIONS.find((d) => d.id === form.destinationId);
      const payload = {
        name: form.name.trim(),
        category: form.category,
        destinationId: form.destinationId || null,
        destinationName: dest?.name ?? null,
        description: form.description.trim(),
        longDescription: form.longDescription.trim() || null,
        address: form.address.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        website: form.website.trim() || null,
        plan: form.plan,
        featured: form.featured,
        verified: form.verified,
        priceRange: form.priceRange,
        openingHours: form.openingHours.trim() || null,
        ownerEmail: form.ownerEmail.trim() || null,
      };

      const url = isEdit
        ? `/api/admin/listings/${listing!.id}`
        : "/api/admin/listings";
      const method = isEdit ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data?.error ?? "Napaka pri shranjevanju.";
        setErrorMsg(msg);
        toast({
          variant: "destructive",
          title: "Napaka",
          description: msg,
        });
        return;
      }

      toast({
        title: isEdit ? "Lokal posodobljen!" : "Lokal ustvarjen!",
        description: isEdit
          ? "Spremembe so shranjene."
          : "Nov lokal je dodan na platformo.",
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Napaka pri shranjevanju.";
      setErrorMsg(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Uredi lokal" : "Nov lokal"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Posodobite podatke lokala."
              : "Izpolnite podatke o novem lokalu."}
          </DialogDescription>
        </DialogHeader>

        {errorMsg && (
          <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Ime + Kategorija */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-name">
                Ime lokala <span className="text-destructive">*</span>
              </Label>
              <Input
                id="af-name"
                placeholder="Restavracija Pri Makcu"
                value={form.name}
                onChange={(e) => update("name", e.target.value)}
                disabled={loading}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-category">
                Kategorija <span className="text-destructive">*</span>
              </Label>
              <Select
                value={form.category}
                onValueChange={(v) => update("category", v as ListingCategory)}
                disabled={loading}
              >
                <SelectTrigger id="af-category" className="w-full">
                  <SelectValue placeholder="Izberite kategorijo" />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Destinacija + Paket */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-destination">Destinacija</Label>
              <Select
                value={form.destinationId || "none"}
                onValueChange={(v) =>
                  update("destinationId", v === "none" ? "" : v)
                }
                disabled={loading}
              >
                <SelectTrigger id="af-destination" className="w-full">
                  <SelectValue placeholder="Brez destinacije" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Brez destinacije</SelectItem>
                  {DESTINATIONS.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-plan">Paket</Label>
              <Select
                value={form.plan}
                onValueChange={(v) => update("plan", v as ListingPlan)}
                disabled={loading}
              >
                <SelectTrigger id="af-plan" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLANS.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Kratek opis */}
          <div className="space-y-2">
            <Label htmlFor="af-description">
              Kratki opis <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="af-description"
              rows={3}
              placeholder="En stavek, ki opisuje lokal..."
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              disabled={loading}
              required
              minLength={10}
            />
            <p className="text-xs text-muted-foreground">
              {form.description.length} znakov (vsaj 10)
            </p>
          </div>

          {/* Dolgi opis */}
          <div className="space-y-2">
            <Label htmlFor="af-longDescription">Dolgi opis</Label>
            <Textarea
              id="af-longDescription"
              rows={4}
              placeholder="Podroben opis..."
              value={form.longDescription}
              onChange={(e) => update("longDescription", e.target.value)}
              disabled={loading}
              className="resize-y"
            />
          </div>

          {/* Naslov */}
          <div className="space-y-2">
            <Label htmlFor="af-address">
              Naslov <span className="text-destructive">*</span>
            </Label>
            <Input
              id="af-address"
              placeholder="Cankarjeva cesta 5, 4260 Bled"
              value={form.address}
              onChange={(e) => update("address", e.target.value)}
              disabled={loading}
              required
            />
          </div>

          {/* Kontakt: Telefon + Email */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-phone">Telefon</Label>
              <Input
                id="af-phone"
                type="tel"
                placeholder="+386 4 123 4567"
                value={form.phone}
                onChange={(e) => update("phone", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-email">E-pošta</Label>
              <Input
                id="af-email"
                type="email"
                placeholder="info@lokal.si"
                value={form.email}
                onChange={(e) => update("email", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Website + Odpiralni čas */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-website">Spletna stran</Label>
              <Input
                id="af-website"
                type="url"
                placeholder="https://www.lokal.si"
                value={form.website}
                onChange={(e) => update("website", e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-hours">Odpiralni čas</Label>
              <Input
                id="af-hours"
                placeholder="Pon–Pet: 9–22, Sob: 10–23"
                value={form.openingHours}
                onChange={(e) => update("openingHours", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Cena + Lastnik email */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="af-priceRange">Cenovni razred</Label>
              <Select
                value={form.priceRange}
                onValueChange={(v) => update("priceRange", v as PriceRange)}
                disabled={loading}
              >
                <SelectTrigger id="af-priceRange" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRICE_RANGES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="af-ownerEmail">Email lastnika (neobvezno)</Label>
              <Input
                id="af-ownerEmail"
                type="email"
                placeholder="lastnik@poslovodja.si"
                value={form.ownerEmail}
                onChange={(e) => update("ownerEmail", e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {/* Status stikala */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 rounded-lg border border-border bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="af-featured" className="cursor-pointer">
                  Izpostavljen (featured)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Prikaže se prednostno na seznamu.
                </p>
              </div>
              <Switch
                id="af-featured"
                checked={form.featured}
                onCheckedChange={(v) => update("featured", v)}
                disabled={loading}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label htmlFor="af-verified" className="cursor-pointer">
                  Overjen (verified)
                </Label>
                <p className="text-xs text-muted-foreground">
                  Prikaže se znak za overjeno.
                </p>
              </div>
              <Switch
                id="af-verified"
                checked={form.verified}
                onCheckedChange={(v) => update("verified", v)}
                disabled={loading}
              />
            </div>
          </div>

          <DialogFooter className="gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Prekliči
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="font-semibold"
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
                  Shranjujem...
                </>
              ) : (
                <>
                  {isEdit ? "Shrani spremembe" : "Ustvari lokal"}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================================
// TAB 2: LEADI
// ============================================================================

function LeadsTab({ adminPassword }: { adminPassword: string }) {
  const { toast } = useToast();
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [summary, setSummary] = React.useState<LeadsSummary>({
    count: 0,
    latest: null,
  });
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<"all" | LeadStatus>(
    "all",
  );

  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Pridobi summary iz /api/leads (count + latest)
      try {
        const sumRes = await fetch("/api/leads", { cache: "no-store" });
        if (sumRes.ok) {
          const sumData = await sumRes.json();
          setSummary({
            count: Number(sumData?.count ?? 0),
            latest: sumData?.latest ?? null,
          });
        }
      } catch {
        /* non-critical */
      }

      // Pridobi vse leade iz /api/admin/leads
      const res = await fetch("/api/admin/leads", {
        headers: { "x-admin-password": adminPassword },
        cache: "no-store",
      });
      if (!res.ok) {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri pridobivanju leadov";
        setErrorMsg(msg);
        return;
      }
      const data = await res.json();
      setLeads((data?.leads as Lead[]) ?? []);
    } catch (err) {
      console.error("[admin/leads] fetch:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

  React.useEffect(() => {
    fetchLeads();
  }, [fetchLeads]);

  const handleCycleStatus = async (lead: Lead) => {
    const next = STATUS_NEXT[lead.status];
    // Optimistic update
    setLeads((prev) =>
      prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l)),
    );
    try {
      const res = await fetch("/api/admin/leads", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ id: lead.id, status: next }),
      });
      if (!res.ok) {
        // Revert
        setLeads((prev) =>
          prev.map((l) =>
            l.id === lead.id ? { ...l, status: lead.status } : l,
          ),
        );
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri posodabljanju";
        toast({
          variant: "destructive",
          title: "Napaka",
          description: msg,
        });
      } else {
        toast({
          title: "Status posodobljen",
          description: `Lead &laquo;${lead.businessName}&raquo; → ${STATUS_LABELS[next]}.`,
        });
      }
    } catch (err) {
      console.error("[admin/leads] update:", err);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l)),
      );
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Napaka pri povezavi s strežnikom.",
      });
    }
  };

  const filtered = React.useMemo(() => {
    let list = leads;
    if (statusFilter !== "all") {
      list = list.filter((l) => l.status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q) ||
          l.businessName.toLowerCase().includes(q) ||
          l.location.toLowerCase().includes(q),
      );
    }
    return list;
  }, [leads, search, statusFilter]);

  // Števci po statusu
  const statusCounts = React.useMemo(() => {
    const c: Record<LeadStatus, number> = {
      nov: 0,
      kontaktiran: 0,
      zakljucen: 0,
    };
    leads.forEach((l) => {
      c[l.status] = (c[l.status] ?? 0) + 1;
    });
    return c;
  }, [leads]);

  return (
    <div className="space-y-4">
      {/* Header + summary kartice */}
      <div className="flex flex-col gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Leadi</h2>
          <p className="text-sm text-muted-foreground">
            Upravljajte povpraševanja s spletne strani.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <SummaryCard
            label="Skupno"
            value={summary.count}
            icon={<Users className="size-4" aria-hidden="true" />}
          />
          <SummaryCard
            label="Novi"
            value={statusCounts.nov}
            icon={<Sparkles className="size-4" aria-hidden="true" />}
            tone="amber"
          />
          <SummaryCard
            label="Kontaktirani"
            value={statusCounts.kontaktiran}
            icon={<Mail className="size-4" aria-hidden="true" />}
            tone="primary"
          />
          <SummaryCard
            label="Zaključeni"
            value={statusCounts.zakljucen}
            icon={<Check className="size-4" aria-hidden="true" />}
            tone="emerald"
          />
        </div>

        {summary.latest && (
          <p className="text-xs text-muted-foreground">
            Zadnji lead:{" "}
            <span className="font-medium text-foreground">
              {new Date(summary.latest).toLocaleString("sl-SI")}
            </span>
          </p>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none"
            aria-hidden="true"
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Iskanje po imenu, emailu, lokalu..."
            className="pl-8"
            aria-label="Iskanje leadov"
          />
        </div>
        <Select
          value={statusFilter}
          onValueChange={(v) => setStatusFilter(v as "all" | LeadStatus)}
        >
          <SelectTrigger className="sm:w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Vsi statusi</SelectItem>
            <SelectItem value="nov">Novi</SelectItem>
            <SelectItem value="kontaktiran">Kontaktirani</SelectItem>
            <SelectItem value="zakljucen">Zaključeni</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Nalaganje leadov...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="size-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
              {leads.length === 0
                ? "Ni še leadov."
                : "Ni najdenih leadov za izbrane filtre."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Datum</TableHead>
                    <TableHead>Podjetje</TableHead>
                    <TableHead className="hidden md:table-cell">Kontakt</TableHead>
                    <TableHead className="hidden lg:table-cell">Kraj</TableHead>
                    <TableHead className="hidden sm:table-cell">Paket</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Calendar className="size-3" aria-hidden="true" />
                          {new Date(l.timestamp).toLocaleDateString("sl-SI")}
                        </div>
                        <div className="text-[10px] text-muted-foreground/70">
                          {new Date(l.timestamp).toLocaleTimeString("sl-SI", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{l.businessName}</div>
                        <div className="text-xs text-muted-foreground">
                          {l.name} · {l.businessType}
                        </div>
                        {l.message && (
                          <div className="text-xs text-muted-foreground/80 mt-1 line-clamp-2 max-w-xs">
                            &ldquo;{l.message}&rdquo;
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs">
                        <div className="flex items-center gap-1 text-foreground">
                          <Mail className="size-3 text-muted-foreground" aria-hidden="true" />
                          {l.email}
                        </div>
                        {l.phone && (
                          <div className="flex items-center gap-1 text-muted-foreground mt-0.5">
                            <Phone className="size-3" aria-hidden="true" />
                            {l.phone}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <MapPin className="size-3" aria-hidden="true" />
                          {l.location}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <Badge variant="outline" className="capitalize">
                          {l.plan}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => handleCycleStatus(l)}
                          className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${STATUS_STYLES[l.status]}`}
                          title="Klikni za spremembo statusa"
                        >
                          {STATUS_LABELS[l.status]}
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground text-right">
        Prikazano: {filtered.length} od {leads.length} leadov
      </div>
    </div>
  );
}

// ============================================================================
// SUMMARY CARD
// ============================================================================

function SummaryCard({
  label,
  value,
  icon,
  tone = "default",
}: {
  label: string;
  value: number;
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
      <CardContent className="p-4 flex items-center gap-3">
        <div
          className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${toneClass}`}
        >
          {icon}
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-bold tabular-nums leading-tight">
            {value.toLocaleString("sl-SI")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

// ============================================================================
// TAB 3: STATISTIKA
// ============================================================================

function StatsTab({ adminPassword }: { adminPassword: string }) {
  const [listings, setListings] = React.useState<Listing[]>([]);
  const [leadsCount, setLeadsCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setErrorMsg(null);
      try {
        const [listingsRes, leadsRes, adminLeadsRes] = await Promise.all([
          fetch("/api/listings?limit=100", { cache: "no-store" }),
          fetch("/api/leads", { cache: "no-store" }),
          fetch("/api/admin/leads", {
            headers: { "x-admin-password": adminPassword },
            cache: "no-store",
          }),
        ]);

        if (cancelled) return;

        if (!listingsRes.ok) throw new Error("listings");
        const listingsData = await listingsRes.json();
        const list = (listingsData?.listings as Listing[]) ?? [];
        setListings(list);

        // Leads count: prefer admin (full), fallback na /api/leads
        if (adminLeadsRes.ok) {
          const d = await adminLeadsRes.json();
          setLeadsCount(Number(d?.total ?? d?.leads?.length ?? 0));
        } else if (leadsRes.ok) {
          const d = await leadsRes.json();
          setLeadsCount(Number(d?.count ?? 0));
        }
      } catch (err) {
        console.error("[admin/stats] fetch:", err);
        setErrorMsg("Napaka pri pridobivanju statistike.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  // KPI izračuni
  const totalListings = listings.length;
  const premiumCount = listings.filter((l) => l.plan === "premium").length;
  const enterpriseCount = listings.filter((l) => l.plan === "enterprise").length;
  const totalViews = listings.reduce((s, l) => s + (l.viewCount ?? 0), 0);
  const totalClicks = listings.reduce((s, l) => s + (l.clickCount ?? 0), 0);
  const totalReviews = listings.reduce((s, l) => s + (l.reviewCount ?? 0), 0);

  // Top 5 po ogledih
  const top5 = React.useMemo(
    () =>
      [...listings]
        .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
        .slice(0, 5),
    [listings],
  );

  // Števci po kategorijah (za bar chart)
  const categoryStats = React.useMemo(() => {
    const map = new Map<ListingCategory, number>();
    listings.forEach((l) => {
      map.set(l.category, (map.get(l.category) ?? 0) + 1);
    });
    return (Object.keys(CATEGORY_LABELS) as ListingCategory[])
      .map((cat) => ({
        category: cat,
        label: CATEGORY_LABELS[cat],
        icon: CATEGORY_ICONS[cat],
        count: map.get(cat) ?? 0,
      }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [listings]);

  const maxCategoryCount = Math.max(1, ...categoryStats.map((c) => c.count));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Loader2 className="size-5 animate-spin mr-2" aria-hidden="true" />
        Nalaganje statistike...
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
        <AlertCircle className="size-4 shrink-0 mt-0.5" aria-hidden="true" />
        <span>{errorMsg}</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Statistika</h2>
        <p className="text-sm text-muted-foreground">
          Pregled ključnih metrik platforme.
        </p>
      </div>

      {/* KPI kartice */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          label="Skupno lokalov"
          value={totalListings}
          icon={<Building2 className="size-4" aria-hidden="true" />}
        />
        <KpiCard
          label="Premium"
          value={premiumCount}
          icon={<Star className="size-4" aria-hidden="true" />}
          tone="amber"
        />
        <KpiCard
          label="Enterprise"
          value={enterpriseCount}
          icon={<Crown className="size-4" aria-hidden="true" />}
          tone="primary"
        />
        <KpiCard
          label="Leadi"
          value={leadsCount}
          icon={<Users className="size-4" aria-hidden="true" />}
          tone="emerald"
        />
      </div>

      {/* Sekundarne metrike */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Eye className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Skupno ogledov</p>
              <p className="text-2xl font-bold tabular-nums">
                {totalViews.toLocaleString("sl-SI")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <TrendingUp className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Skupno klikov</p>
              <p className="text-2xl font-bold tabular-nums">
                {totalClicks.toLocaleString("sl-SI")}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Star className="size-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Skupno recenzij</p>
              <p className="text-2xl font-bold tabular-nums">
                {totalReviews.toLocaleString("sl-SI")}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Top 5 + bar chart po kategorijah */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Top 5 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="size-4 text-primary" aria-hidden="true" />
              Top 5 lokalov (po ogledih)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Ni podatkov.
              </p>
            ) : (
              top5.map((l, i) => (
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
                      <span aria-hidden="true">{CATEGORY_ICONS[l.category]}</span>
                      {l.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.destinationName ?? "—"}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                      <Eye className="size-3.5 text-muted-foreground" aria-hidden="true" />
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

        {/* Bar chart po kategorijah */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="size-4 text-primary" aria-hidden="true" />
              Lokali po kategorijah
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoryStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Ni podatkov.
              </p>
            ) : (
              categoryStats.map((c) => (
                <div key={c.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5">
                      <span aria-hidden="true">{c.icon}</span>
                      <span className="font-medium">{c.label}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {c.count}
                    </span>
                  </div>
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{
                        width: `${(c.count / maxCategoryCount) * 100}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
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
  value: number;
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
            {value.toLocaleString("sl-SI")}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
