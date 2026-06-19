"use client";

import * as React from "react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Card,
  CardContent,
  CardDescription,
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Search,
  Download,
  Users,
  Star,
  Eye,
  TrendingUp,
  Loader2,
  AlertCircle,
  Check,
  X,
  ShieldCheck,
  Sparkles,
  Crown,
} from "lucide-react";
import {
  CATEGORY_LABELS,
  PLAN_LABELS,
  type ListingCategory,
  type ListingPlan,
} from "@/lib/listings-types";
import { ListingForm, type AdminListing } from "./listing-form";

// === TIP LEAD ===
type LeadStatus = "nov" | "kontaktiran" | "zakljucen";

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
  nov: "bg-amber-100 text-amber-900 border-amber-200 hover:bg-amber-200",
  kontaktiran: "bg-primary/10 text-primary border-primary/30 hover:bg-primary/20",
  zakljucen: "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200",
};

interface AdminDashboardProps {
  adminPassword: string;
  onLogout: () => void;
}

// === GLAVNA KOMPONENTA ===
export function AdminDashboard({
  adminPassword,
  onLogout,
}: AdminDashboardProps) {
  const [tab, setTab] = React.useState("listings");

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 flex h-14 items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground shrink-0">
              <ShieldCheck className="size-4" />
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
            className="shrink-0"
          >
            Odjava
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="listings" className="gap-1.5">
              <Building2 className="size-4" />
              <span className="hidden xs:inline sm:inline">Lokali</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="gap-1.5">
              <Users className="size-4" />
              <span className="hidden xs:inline sm:inline">Leadi</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-1.5">
              <TrendingUp className="size-4" />
              <span className="hidden xs:inline sm:inline">Statistika</span>
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

// === TAB 1: LISTINGS ===
function ListingsTab({ adminPassword }: { adminPassword: string }) {
  const [listings, setListings] = React.useState<AdminListing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminListing | null>(null);
  const [deleteId, setDeleteId] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState(false);

  const fetchListings = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/listings", {
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri pridobivanju lokalov";
        setErrorMsg(msg);
        return;
      }
      const data: unknown = await res.json();
      const list = (
        typeof data === "object" && data !== null && "listings" in data
          ? (data as Record<string, unknown>).listings
          : []) as AdminListing[];
      setListings(list);
    } catch (err) {
      console.error("[admin/listings] fetch:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

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
        l.category.toLowerCase().includes(q)
    );
  }, [listings, search]);

  const handleOpenCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (listing: AdminListing) => {
    setEditing(listing);
    setFormOpen(true);
  };

  const handleSaved = () => {
    fetchListings();
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
        setErrorMsg(msg);
      } else {
        setListings((prev) => prev.filter((l) => l.id !== deleteId));
      }
    } catch (err) {
      console.error("[admin/listings] delete:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
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
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Iskanje po imenu..."
              className="pl-8 sm:w-64"
            />
          </div>
          <Button onClick={handleOpenCreate} className="shrink-0">
            <Plus className="size-4" />
            Nov lokal
          </Button>
        </div>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Nalaganje lokalov...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Building2 className="size-8 mx-auto mb-2 opacity-50" />
              {search ? "Ni najdenih lokalov." : "Ni še lokalov. Dodajte prvega."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
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
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground">
                          /{l.slug}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <Badge variant="secondary">
                          {CATEGORY_LABELS[l.category as ListingCategory] ?? l.category}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-muted-foreground">
                        {l.destinationName ?? "—"}
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={l.plan as ListingPlan} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-1">
                          {l.featured && (
                            <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-900">
                              <Star className="size-3 mr-0.5 fill-amber-500 text-amber-500" />
                              Izpost.
                            </Badge>
                          )}
                          {l.verified && (
                            <Badge variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-900">
                              <Check className="size-3 mr-0.5" />
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
                          <Star className="size-3.5 fill-amber-400 text-amber-400" />
                          <span className="font-medium">{l.rating.toFixed(1)}</span>
                          <span className="text-xs text-muted-foreground">({l.reviewCount})</span>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Eye className="size-3.5" />
                          {l.viewCount}
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
                            <Pencil className="size-4" />
                            <span className="sr-only">Uredi</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteId(l.id)}
                            className="text-destructive hover:text-destructive hover:bg-destructive/10"
                            aria-label={`Izbriši ${l.name}`}
                          >
                            <Trash2 className="size-4" />
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
      <ListingForm
        open={formOpen}
        onOpenChange={setFormOpen}
        listing={editing}
        adminPassword={adminPassword}
        onSaved={handleSaved}
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
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Brisanje...
                </>
              ) : (
                <>
                  <Trash2 className="size-4" />
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

// === TAB 2: LEADS ===
function LeadsTab({ adminPassword }: { adminPassword: string }) {
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);

  const fetchLeads = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/leads", {
        headers: { "x-admin-password": adminPassword },
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
      const data: unknown = await res.json();
      const list = (
        typeof data === "object" && data !== null && "leads" in data
          ? (data as Record<string, unknown>).leads
          : []) as Lead[];
      setLeads(list);
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
      prev.map((l) => (l.id === lead.id ? { ...l, status: next } : l))
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
        // Revert on failure
        setLeads((prev) =>
          prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l))
        );
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri posodabljanju";
        setErrorMsg(msg);
      }
    } catch (err) {
      console.error("[admin/leads] update:", err);
      setLeads((prev) =>
        prev.map((l) => (l.id === lead.id ? { ...l, status: lead.status } : l))
      );
      setErrorMsg("Napaka pri povezavi s strežnikom");
    }
  };

  const handleExportCsv = () => {
    if (leads.length === 0) return;
    const headers = [
      "Datum",
      "Ime",
      "Email",
      "Telefon",
      "Lokal",
      "Tip",
      "Kraj",
      "Paket",
      "Status",
      "Sporočilo",
    ];
    const rows = leads.map((l) => [
      new Date(l.timestamp).toLocaleString("sl-SI"),
      l.name,
      l.email,
      l.phone ?? "",
      l.businessName,
      l.businessType,
      l.location,
      l.plan,
      STATUS_LABELS[l.status],
      (l.message ?? "").replace(/[\r\n]+/g, " "),
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            if (s.includes(";") || s.includes('"') || s.includes("\n")) {
              return `"${s.replace(/"/g, '""')}"`;
            }
            return s;
          })
          .join(";")
      )
      .join("\n");

    // BOM za Excel UTF-8
    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Leadi</h2>
          <p className="text-sm text-muted-foreground">
            Prijave lokalov, zbrane prek obrazca &ldquo;Pridruži se&rdquo;.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={handleExportCsv}
          disabled={leads.length === 0}
          className="shrink-0"
        >
          <Download className="size-4" />
          Izvozi CSV
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Nalaganje leadov...
            </div>
          ) : leads.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Users className="size-8 mx-auto mb-2 opacity-50" />
              Ni še leadov.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="hidden md:table-cell">Datum</TableHead>
                    <TableHead>Ime</TableHead>
                    <TableHead className="hidden sm:table-cell">Kontakt</TableHead>
                    <TableHead className="hidden lg:table-cell">Lokal</TableHead>
                    <TableHead className="hidden xl:table-cell">Tip</TableHead>
                    <TableHead className="hidden lg:table-cell">Kraj</TableHead>
                    <TableHead className="hidden md:table-cell">Paket</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {leads.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground whitespace-nowrap">
                        {new Date(l.timestamp).toLocaleDateString("sl-SI", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{l.name}</div>
                        <div className="text-xs text-muted-foreground md:hidden">
                          {l.businessName}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="text-xs">
                          <div className="text-foreground">{l.email}</div>
                          {l.phone && (
                            <div className="text-muted-foreground">{l.phone}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="text-sm">{l.businessName}</div>
                        <div className="text-xs text-muted-foreground xl:hidden">
                          {l.businessType}
                        </div>
                      </TableCell>
                      <TableCell className="hidden xl:table-cell text-sm">
                        {l.businessType}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {l.location}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <PlanBadge plan={l.plan as ListingPlan} />
                      </TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => handleCycleStatus(l)}
                          className={`inline-flex items-center rounded-md border px-2 py-1 text-xs font-medium transition-colors ${STATUS_STYLES[l.status]}`}
                          title="Klik za naslednji status"
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

      {leads.length > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Skupno: {leads.length} leadov · klik na status za preklop
        </div>
      )}
    </div>
  );
}

// === TAB 3: STATISTIKA ===
function StatsTab({ adminPassword }: { adminPassword: string }) {
  const [listings, setListings] = React.useState<AdminListing[]>([]);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [lRes, leadsRes] = await Promise.all([
          fetch("/api/admin/listings", {
            headers: { "x-admin-password": adminPassword },
          }),
          fetch("/api/admin/leads", {
            headers: { "x-admin-password": adminPassword },
          }),
        ]);
        const lData: unknown = await lRes.json();
        const leadsData: unknown = await leadsRes.json();
        if (cancelled) return;
        const lList = (
          typeof lData === "object" && lData !== null && "listings" in lData
            ? (lData as Record<string, unknown>).listings
            : []) as AdminListing[];
        const leadsList = (
          typeof leadsData === "object" && leadsData !== null && "leads" in leadsData
            ? (leadsData as Record<string, unknown>).leads
            : []) as Lead[];
        setListings(lList);
        setLeads(leadsList);
      } catch (err) {
        console.error("[admin/stats] fetch:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminPassword]);

  // Kategorije — useMemo MORA biti pred morebitnim zgodnjim returnom
  const byCategory = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const l of listings) {
      map.set(l.category, (map.get(l.category) ?? 0) + 1);
    }
    const arr = Array.from(map.entries()).map(([cat, count]) => ({
      cat: cat as ListingCategory,
      label: CATEGORY_LABELS[cat as ListingCategory] ?? cat,
      count,
    }));
    arr.sort((a, b) => b.count - a.count);
    return arr;
  }, [listings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" />
        Nalaganje statistike...
      </div>
    );
  }

  const total = listings.length;
  const premium = listings.filter(
    (l) => l.plan === "premium" || l.plan === "enterprise"
  ).length;
  const totalLeads = leads.length;
  const totalViews = listings.reduce((sum, l) => sum + (l.viewCount ?? 0), 0);

  const top5 = [...listings]
    .sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0))
    .slice(0, 5);

  const maxCat = Math.max(1, ...byCategory.map((c) => c.count));

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Statistika</h2>
        <p className="text-sm text-muted-foreground">
          Pregled ključnih metrik platforme.
        </p>
      </div>

      {/* KPI kartice */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          icon={<Building2 className="size-5" />}
          label="Skupno lokalov"
          value={total}
          color="primary"
        />
        <KpiCard
          icon={<Crown className="size-5" />}
          label="Premium / Enterprise"
          value={premium}
          color="amber"
        />
        <KpiCard
          icon={<Users className="size-5" />}
          label="Skupno leadov"
          value={totalLeads}
          color="accent"
        />
        <KpiCard
          icon={<Eye className="size-5" />}
          label="Skupno ogledov"
          value={totalViews}
          color="emerald"
        />
      </div>

      {/* Top 5 + Kategorije */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="size-4 text-primary" />
              Top 5 lokalov po ogledih
            </CardTitle>
            <CardDescription>
              Najbolj obiskani lokalci na platformi.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {top5.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Ni podatkov.
              </p>
            ) : (
              <ol className="space-y-3">
                {top5.map((l, idx) => (
                  <li key={l.id} className="flex items-center gap-3">
                    <span
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        idx === 0
                          ? "bg-amber-100 text-amber-900"
                          : idx === 1
                          ? "bg-muted-foreground/15 text-foreground"
                          : idx === 2
                          ? "bg-accent/15 text-accent-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.destinationName ?? "—"} ·{" "}
                        {CATEGORY_LABELS[l.category as ListingCategory] ?? l.category}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 text-sm font-semibold tabular-nums">
                      <Eye className="size-3.5 text-muted-foreground" />
                      {l.viewCount}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="size-4 text-primary" />
              Lokali po kategorijah
            </CardTitle>
            <CardDescription>Razporeditev po tipih lokalov.</CardDescription>
          </CardHeader>
          <CardContent>
            {byCategory.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4">
                Ni podatkov.
              </p>
            ) : (
              <div className="space-y-3">
                {byCategory.map((c) => (
                  <div key={c.cat} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.label}</span>
                      <span className="text-muted-foreground tabular-nums">
                        {c.count}
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${(c.count / maxCat) * 100}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// === POMOŽNE ===
function PlanBadge({ plan }: { plan: ListingPlan }) {
  if (plan === "enterprise") {
    return (
      <Badge className="bg-primary text-primary-foreground hover:bg-primary">
        <Crown className="size-3 mr-0.5" />
        {PLAN_LABELS[plan]}
      </Badge>
    );
  }
  if (plan === "premium") {
    return (
      <Badge
        variant="outline"
        className="border-amber-300 bg-amber-50 text-amber-900"
      >
        <Sparkles className="size-3 mr-0.5" />
        {PLAN_LABELS[plan]}
      </Badge>
    );
  }
  return (
    <Badge variant="secondary" className="text-muted-foreground">
      {PLAN_LABELS[plan]}
    </Badge>
  );
}

function KpiCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  color: "primary" | "amber" | "accent" | "emerald";
}) {
  const colorClasses: Record<typeof color, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-900",
    accent: "bg-accent/15 text-accent-foreground",
    emerald: "bg-emerald-100 text-emerald-900",
  };
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs sm:text-sm text-muted-foreground truncate">
              {label}
            </p>
            <p className="text-2xl sm:text-3xl font-bold tabular-nums mt-1">
              {value.toLocaleString("sl-SI")}
            </p>
          </div>
          <div
            className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-md ${colorClasses[color]}`}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
