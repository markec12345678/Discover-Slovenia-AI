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
import { Label } from "@/components/ui/label";
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
  Rocket,
  Gift,
  Zap,
  CreditCard,
  DollarSign,
  Calendar,
  Banknote,
  TrendingDown,
  MessageCircle,
  ClipboardCheck,
  CircleCheck,
  Clock,
  Globe,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  User,
  XCircle,
  BadgeCheck,
} from "lucide-react";
import {
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  PLAN_LABELS,
  type ListingCategory,
  type ListingPlan,
} from "@/lib/listings-types";
// P3c-9: oznake kategorij izdelkov/izkušenj za kartice čakalne vrste
import {
  PRODUCT_CATEGORY_LABELS,
  PRODUCT_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  type ProductCategory,
  type ExperienceCategory,
} from "@/lib/marketplace-types";
import { ListingForm, type AdminListing } from "./listing-form";
import { BetaBanner } from "@/components/beta-banner";
import { Progress } from "@/components/ui/progress";
import { BETA_INFO } from "@/lib/beta";
import { InsightsPanel } from "@/components/insights-panel";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

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

// === TIP ČAKAJOCIH LOKALOV (zavihek Pregled) ===
interface PendingOwner {
  email: string | null;
  name: string | null;
  businessName: string | null;
}

interface PendingListing {
  // P3c-9: vrsta vsebine v čakalni vrsti — lokalci nimajo type polja
  // v starejših odgovorih, zato optional z default "listing"
  type?: "listing" | "product" | "experience";
  id: string;
  name: string;
  slug: string;
  category: string;
  destinationName: string | null;
  // Polja, ki jih izdelki/izkušnje nimajo → optional (varna izpustitev)
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description: string;
  images: string[];
  submittedAt: string | null;
  submittedAgo: number | null;
  ownerId: string | null;
  owner: PendingOwner | null;
}

// P3c-9: oznake vrste vsebine (badge na kartici + samostalniki za sporočila)
type PendingItemType = NonNullable<PendingListing["type"]>;

const TYPE_LABELS: Record<PendingItemType, string> = {
  listing: "Lokal",
  product: "Izdelek",
  experience: "Izkušnja",
};

// Tožilnik za opise v dialogu/toastih ("zavrni izkušnjo", "popravi izdelek")
const TYPE_NOUN_ACC: Record<PendingItemType, string> = {
  listing: "lokal",
  product: "izdelek",
  experience: "izkušnjo",
};

function itemType(item: PendingListing): PendingItemType {
  return item.type ?? "listing";
}

// P3c-9: kategorija čez vse tri tipe vsebin (lokal + izdelek + izkušnja)
function categoryLabel(category: string): string {
  return (
    CATEGORY_LABELS[category as ListingCategory] ??
    PRODUCT_CATEGORY_LABELS[category as ProductCategory] ??
    EXPERIENCE_CATEGORY_LABELS[category as ExperienceCategory] ??
    category
  );
}

function categoryIcon(category: string): string {
  return (
    CATEGORY_ICONS[category as ListingCategory] ??
    PRODUCT_CATEGORY_ICONS[category as ProductCategory] ??
    EXPERIENCE_CATEGORY_ICONS[category as ExperienceCategory] ??
    "📍"
  );
}

// Fallback seznam razlogov (enak seznamu v /api/admin/reject/[id])
const REJECTION_REASON_FALLBACK: string[] = [
  "Manjkajo fotografije",
  "Nepopoln opis",
  "Napačna kategorija",
  "Podvojeni vnos",
  "Ni povezano s turizmom",
  "Napačni kontakt podatki",
  "Neprimerna vsebina",
  "Drugo",
];

// Slovenska oblika enote časa (ednina / dvojina / množina)
function slTimeUnit(n: number, one: string, two: string, many: string): string {
  if (n === 1) return one;
  if (n % 100 === 2) return two;
  return many;
}

// Formatiranje "oddano pred X" iz števila minut
function formatSubmittedAgo(minutes: number | null): string {
  if (minutes == null) return "neznano";
  if (minutes < 1) return "pravkar";
  if (minutes < 60) return `pred ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `pred ${hours} ${slTimeUnit(hours, "uro", "urama", "urami")}`;
  }
  const days = Math.floor(minutes / 1440);
  return `pred ${days} ${slTimeUnit(days, "dnem", "dnevoma", "dnevi")}`;
}

// Slovenska množina za število vsebin v pregledu (lokalci + izdelki + izkušnje)
function pendingCountLabel(n: number): string {
  if (n === 1) return "1 vsebina";
  const r = n % 100;
  if (r === 2) return `${n} vsebini`;
  if (r === 3 || r === 4) return `${n} vsebine`;
  return `${n} vsebin`;
}

// Aria opis števca čakajočih vsebin
function pendingCountAria(n: number): string {
  if (n === 1) return "1 vsebina čaka na pregled";
  if (n === 2) return "2 vsebini čakata na pregled";
  const r = n % 100;
  if (r === 3 || r === 4) return `${n} vsebine čakajo na pregled`;
  return `${n} vsebin čaka na pregled`;
}

// Izlušči napako iz API odgovora (vzorec iz ostalih tabov)
async function extractApiError(res: Response, fallback: string): Promise<string> {
  try {
    const d: unknown = await res.json();
    if (typeof d === "object" && d !== null && "error" in d) {
      return String((d as Record<string, unknown>).error);
    }
  } catch {
    /* ignore */
  }
  return fallback;
}

interface AdminDashboardProps {
  adminPassword: string;
  onLogout: () => void;
}

// === GLAVNA KOMPONENTA ===
export function AdminDashboard({
  adminPassword,
  onLogout,
}: AdminDashboardProps) {
  const [tab, setTab] = React.useState("pregled");
  const [pendingCount, setPendingCount] = React.useState<number | null>(null);

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Beta banner na vrhu */}
      <BetaBanner />

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
                Discover Slovenia AI — upravljanje lokalov
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
        {/* Beta status widget na vrhu dashboard-a */}
        <BetaStatusWidget />

        <Tabs value={tab} onValueChange={setTab} className="w-full">
          <TabsList className="grid w-full max-w-3xl grid-cols-5">
            <TabsTrigger value="pregled" className="h-11 gap-1.5">
              <ClipboardCheck className="size-4" />
              <span className="hidden sm:inline">Pregled</span>
              {pendingCount !== null && pendingCount > 0 && (
                <Badge
                  className="ml-0.5 h-5 min-w-5 shrink-0 justify-center rounded-full border-0 bg-amber-400 px-1.5 tabular-nums text-amber-950 hover:bg-amber-400"
                  aria-label={pendingCountAria(pendingCount)}
                >
                  {pendingCount > 99 ? "99+" : pendingCount}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="listings" className="h-11 gap-1.5">
              <Building2 className="size-4" />
              <span className="hidden sm:inline">Lokali</span>
            </TabsTrigger>
            <TabsTrigger value="leads" className="h-11 gap-1.5">
              <Users className="size-4" />
              <span className="hidden sm:inline">Leadi</span>
            </TabsTrigger>
            <TabsTrigger value="narocnine" className="h-11 gap-1.5">
              <CreditCard className="size-4" />
              <span className="hidden sm:inline">Naročnine</span>
            </TabsTrigger>
            <TabsTrigger value="stats" className="h-11 gap-1.5">
              <TrendingUp className="size-4" />
              <span className="hidden sm:inline">Statistika</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="pregled"
            className="mt-6 data-[state=inactive]:hidden"
            forceMount
          >
            <PendingTab
              adminPassword={adminPassword}
              active={tab === "pregled"}
              onCountChange={setPendingCount}
            />
          </TabsContent>

          <TabsContent value="listings" className="mt-6">
            <ListingsTab adminPassword={adminPassword} />
          </TabsContent>
          <TabsContent value="leads" className="mt-6">
            <LeadsTab adminPassword={adminPassword} />
          </TabsContent>
          <TabsContent value="narocnine" className="mt-6">
            <SubscriptionsTab adminPassword={adminPassword} />
          </TabsContent>
          <TabsContent value="stats" className="mt-6">
            <StatsTab adminPassword={adminPassword} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

// === TAB 0: PREGLED — ČAKAJÖCI LOKALI (moderacijska vrsta) ===
function PendingTab({
  adminPassword,
  active,
  onCountChange,
}: {
  adminPassword: string;
  active: boolean;
  onCountChange: (count: number) => void;
}) {
  const { toast } = useToast();
  const [pending, setPending] = React.useState<PendingListing[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [approvingId, setApprovingId] = React.useState<string | null>(null);

  // Zavrnitev — dialog
  const [rejectTarget, setRejectTarget] = React.useState<PendingListing | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");
  const [customReason, setCustomReason] = React.useState("");
  const [rejecting, setRejecting] = React.useState(false);
  const [reasons, setReasons] = React.useState<string[]>(REJECTION_REASON_FALLBACK);

  const fetchPending = React.useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) {
        setLoading(true);
        setErrorMsg(null);
      }
      try {
        const res = await fetch("/api/admin/pending", {
          headers: { "x-admin-password": adminPassword },
        });
        if (!res.ok) {
          setErrorMsg(
            await extractApiError(res, "Napaka pri pridobivanju lokalov v pregledu")
          );
          return;
        }
        const data: unknown = await res.json();
        const list = (
          typeof data === "object" && data !== null && "pending" in data
            ? (data as Record<string, unknown>).pending
            : []) as PendingListing[];
        setPending(list);
        onCountChange(list.length);
      } catch (err) {
        console.error("[admin/pending] fetch:", err);
        setErrorMsg("Napaka pri povezavi s strežnikom");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [adminPassword, onCountChange]
  );

  // Naloži takoj ob mountu (zavihek je vedno montiran prek forceMount)
  React.useEffect(() => {
    fetchPending();
  }, [fetchPending]);

  // Osveži ob vsaki aktivaciji zavihka
  React.useEffect(() => {
    if (active) fetchPending();
  }, [active, fetchPending]);

  // Ob odpiranju dialoga: ponastavi polja in pridobi veljavne razloge s strežnika
  React.useEffect(() => {
    if (!rejectTarget) return;
    setRejectReason("");
    setCustomReason("");
    fetch(`/api/admin/reject/${encodeURIComponent(rejectTarget.id)}`, {
      headers: { "x-admin-password": adminPassword },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const d: unknown = await res.json();
        if (
          typeof d === "object" &&
          d !== null &&
          "reasons" in d &&
          Array.isArray((d as Record<string, unknown>).reasons)
        ) {
          const r = (d as Record<string, unknown>).reasons as string[];
          if (r.length > 0) setReasons(r);
        }
      })
      .catch(() => {
        /* fallback seznam ostane */
      });
  }, [rejectTarget, adminPassword]);

  const removeLocal = (id: string) => {
    setPending((prev) => prev.filter((p) => p.id !== id));
  };

  const handleApprove = async (listing: PendingListing) => {
    const tt = itemType(listing);
    setApprovingId(listing.id);
    try {
      const res = await fetch(
        `/api/admin/approve/${encodeURIComponent(listing.id)}?type=${tt}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": adminPassword,
          },
          body: JSON.stringify({ publishNow: true }),
        }
      );
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Napaka pri odobritvi",
          description: await extractApiError(res, "Vsebine ni bilo mogoče odobriti."),
        });
        return;
      }
      toast({
        title:
          tt === "product"
            ? "Izdelek odobren in objavljen"
            : tt === "experience"
              ? "Izkušnja odobrena in objavljena"
              : "Lokal odobren in objavljen",
        description:
          tt === "listing"
            ? `„${listing.name}" je sedaj objavljen. AI izboljšave in obvestilo lastniku potekata v ozadju.`
            : `„${listing.name}" je sedaj objavljen${tt === "experience" ? "a" : ""} v tržnici. Obvestilo lastniku poteka v ozadju.`,
      });
      removeLocal(listing.id);
      await fetchPending({ silent: true });
    } catch (err) {
      console.error("[admin/approve] fetch:", err);
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče vzpostaviti povezave s strežnikom.",
      });
    } finally {
      setApprovingId(null);
    }
  };

  const handleConfirmReject = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault(); // dialog zapremo sami, po uspešni akciji
    if (!rejectTarget || rejecting) return;
    const isCustom = rejectReason === "Drugo";
    if (!rejectReason || (isCustom && !customReason.trim())) return;

    setRejecting(true);
    try {
      const res = await fetch(
        `/api/admin/reject/${encodeURIComponent(rejectTarget.id)}?type=${itemType(rejectTarget)}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-admin-password": adminPassword,
          },
          body: JSON.stringify({
            reason: rejectReason,
            customReason: isCustom ? customReason.trim() : undefined,
          }),
        }
      );
      if (!res.ok) {
        toast({
          variant: "destructive",
          title: "Napaka pri zavrnitvi",
          description: await extractApiError(res, "Vsebine ni bilo mogoče zavrniti."),
        });
        return;
      }
      toast({
        title:
          rejectTarget.type === "product"
            ? "Izdelek zavrnjen"
            : rejectTarget.type === "experience"
              ? "Izkušnja zavrnjena"
              : "Lokal zavrnjen",
        description: `„${rejectTarget.name}" je zavrnjen. Lastnik je obveščen po e-pošti in lahko vsebino popravi ter ponovno odda.`,
      });
      removeLocal(rejectTarget.id);
      setRejectTarget(null);
      await fetchPending({ silent: true });
    } catch (err) {
      console.error("[admin/reject] fetch:", err);
      toast({
        variant: "destructive",
        title: "Napaka",
        description: "Ni mogoče vzpostaviti povezave s strežnikom.",
      });
    } finally {
      setRejecting(false);
    }
  };

  const rejectDisabled =
    rejecting ||
    !rejectReason ||
    (rejectReason === "Drugo" && !customReason.trim());

  return (
    <div className="space-y-4">
      {/* Glava zavihka */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Vsebina v pregledu</h2>
          <p className="text-sm text-muted-foreground">
            Novi lokalci, izdelki in izkušnje, oddani s strani ponudnikov — odobrite ali zavrnite.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          onClick={() => fetchPending()}
          disabled={loading}
          className="h-11 w-11 shrink-0"
          aria-label="Osveži seznam vsebin v pregledu"
        >
          {loading ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
        </Button>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && pending.length === 0 && !errorMsg ? (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Nalaganje vsebin v pregledu...
          </CardContent>
        </Card>
      ) : !errorMsg && pending.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CircleCheck
              className="size-10 mx-auto mb-3 text-emerald-500"
              aria-hidden="true"
            />
            <p className="text-base font-semibold">Ni vsebin v pregledu</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Vse oddane vsebine (lokalci, izdelki, izkušnje) so obdelane — novi prispevki se bodo prikazali tukaj.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 sm:gap-6">
          {pending.map((l) => {
            const catLabel = categoryLabel(l.category);
            const tt = itemType(l);
            return (
              <Card key={l.id} className="flex flex-col overflow-hidden">
                <div className="relative aspect-video bg-muted">
                  {l.images[0] ? (
                    <img
                      src={l.images[0]}
                      alt={`Fotografija: ${l.name}`}
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div
                      className="flex h-full w-full items-center justify-center text-5xl"
                      role="img"
                      aria-label={catLabel}
                    >
                      {categoryIcon(l.category)}
                    </div>
                  )}
                  <Badge className="absolute right-2 top-2 gap-1 border-border bg-background/90 text-foreground backdrop-blur-sm">
                    <Clock className="size-3" aria-hidden="true" />
                    {formatSubmittedAgo(l.submittedAgo)}
                  </Badge>
                </div>

                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                  <div className="space-y-1.5">
                    <h3 className="font-semibold leading-snug">{l.name}</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {/* P3c-9: vrsta vsebine (Lokal / Izdelek / Izkušnja) */}
                      <Badge variant="secondary" className="gap-1">
                        {TYPE_LABELS[tt]}
                      </Badge>
                      {l.destinationName && (
                        <Badge variant="secondary">{l.destinationName}</Badge>
                      )}
                      <Badge variant="outline">{catLabel}</Badge>
                    </div>
                  </div>

                  {l.description && (
                    <p className="text-sm text-muted-foreground line-clamp-3">
                      {l.description}
                    </p>
                  )}

                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    {l.address && (
                      <div className="flex items-start gap-1.5">
                        <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                        <span className="min-w-0 break-words">{l.address}</span>
                      </div>
                    )}
                    {l.phone && (
                      <div className="flex items-center gap-1.5">
                        <Phone className="size-3.5 shrink-0" aria-hidden="true" />
                        <span>{l.phone}</span>
                      </div>
                    )}
                    {l.email && (
                      <div className="flex items-center gap-1.5">
                        <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                        <a
                          href={`mailto:${l.email}`}
                          className="truncate hover:text-foreground hover:underline"
                        >
                          {l.email}
                        </a>
                      </div>
                    )}
                    {l.website && (
                      <div className="flex items-center gap-1.5">
                        <Globe className="size-3.5 shrink-0" aria-hidden="true" />
                        <a
                          href={l.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="truncate hover:text-foreground hover:underline"
                        >
                          {l.website.replace(/^https?:\/\//, "")}
                        </a>
                      </div>
                    )}
                  </div>

                  {l.owner && (
                    <div className="space-y-1 rounded-md border border-border/60 bg-muted/50 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        <User className="size-3.5 shrink-0" aria-hidden="true" />
                        Lastnik
                      </div>
                      <p className="text-muted-foreground">
                        {[l.owner.name, l.owner.businessName]
                          .filter(Boolean)
                          .join(" · ") || "—"}
                      </p>
                      {l.owner.email && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Mail className="size-3.5 shrink-0" aria-hidden="true" />
                          <a
                            href={`mailto:${l.owner.email}`}
                            className="truncate hover:text-foreground hover:underline"
                          >
                            {l.owner.email}
                          </a>
                        </p>
                      )}
                    </div>
                  )}

                  <div className="mt-auto flex flex-col gap-2 pt-1 sm:flex-row">
                    <Button
                      className="min-h-11 flex-1"
                      onClick={() => handleApprove(l)}
                      disabled={approvingId !== null}
                      aria-label={`Odobri in objavi ${TYPE_NOUN_ACC[tt]} ${l.name}`}
                    >
                      {approvingId === l.id ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          Odobravanje...
                        </>
                      ) : (
                        <>
                          <Check className="size-4" />
                          Odobri in objavi
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      className="min-h-11 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setRejectTarget(l)}
                      disabled={approvingId !== null}
                      aria-label={`Zavrni ${TYPE_NOUN_ACC[tt]} ${l.name}`}
                    >
                      <XCircle className="size-4" />
                      Zavrni
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {!loading && !errorMsg && pending.length > 0 && (
        <div className="text-xs text-muted-foreground text-right">
          Skupaj: {pendingCountLabel(pending.length)} v pregledu
        </div>
      )}

      {/* Dialog za zavrnitev */}
      <AlertDialog
        open={!!rejectTarget}
        onOpenChange={(o) => {
          if (!o && !rejecting) setRejectTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Zavrni{" "}
              {rejectTarget ? TYPE_NOUN_ACC[itemType(rejectTarget)] : "vsebino"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {rejectTarget
                ? `„${rejectTarget.name}" bo ${
                    itemType(rejectTarget) === "experience"
                      ? "označena kot zavrnjena"
                      : "označen kot zavrnjen"
                  }. Lastnik bo prejel razlog po e-pošti in bo ${
                    TYPE_NOUN_ACC[itemType(rejectTarget)]
                  } lahko popravil ter ponovno oddal v pregled.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <Label htmlFor="reject-reason">Razlog za zavrnitev</Label>
              <Select value={rejectReason} onValueChange={setRejectReason}>
                <SelectTrigger
                  id="reject-reason"
                  className="h-11 w-full"
                  aria-label="Razlog za zavrnitev"
                >
                  <SelectValue placeholder="Izberite razlog..." />
                </SelectTrigger>
                <SelectContent>
                  {reasons.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {rejectReason === "Drugo" && (
              <div className="space-y-1.5">
                <Label htmlFor="reject-custom-reason">
                  Pojasnitev{" "}
                  <span className="text-destructive">(obvezno)</span>
                </Label>
                <Textarea
                  id="reject-custom-reason"
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                  placeholder="Opišite, kaj je treba popraviti..."
                  className="min-h-24"
                  rows={3}
                  aria-required="true"
                />
              </div>
            )}
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel disabled={rejecting} className="min-h-11">
              Prekliči
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              disabled={rejectDisabled}
              className="min-h-11 bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {rejecting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Zavračanje...
                </>
              ) : (
                <>
                  <XCircle className="size-4" />
                  Zavrni lokal
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// === TAB 1: LISTINGS ===
function ListingsTab({ adminPassword }: { adminPassword: string }) {
  const { toast } = useToast();
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

  // P4-2b: eksplicitna admin verifikacija (znak "Preverjen partner")
  const [verifyingId, setVerifyingId] = React.useState<string | null>(null);

  const handleToggleVerify = async (listing: AdminListing) => {
    setVerifyingId(listing.id);
    try {
      const res = await fetch(`/api/admin/listings/${listing.id}/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify({ verify: !listing.verified }),
      });
      const d: unknown = await res.json();
      const msg =
        typeof d === "object" && d !== null && "error" in d
          ? String((d as Record<string, unknown>).error)
          : null;
      if (!res.ok) {
        setErrorMsg(msg ?? "Napaka pri verifikaciji");
        return;
      }
      setErrorMsg(null);
      setListings((prev) =>
        prev.map((l) =>
          l.id === listing.id ? { ...l, verified: !listing.verified } : l
        )
      );
      toast({
        title: listing.verified ? "Overitev umaknjena" : "Lokal overjen",
        description: listing.verified
          ? `${listing.name} nima več znaka "Preverjen partner".`
          : `${listing.name} ima zdaj znak "Preverjen partner".`,
      });
    } catch (err) {
      console.error("[admin/listings] verify:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
    } finally {
      setVerifyingId(null);
    }
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
                            onClick={() => void handleToggleVerify(l)}
                            disabled={verifyingId === l.id}
                            title={
                              l.verified
                                ? "Umakni overitev (znak Preverjen partner)"
                                : "Overi lokal (podeli znak Preverjen partner)"
                            }
                            aria-label={
                              l.verified
                                ? `Umakni overitev ${l.name}`
                                : `Overi ${l.name}`
                            }
                            className={
                              l.verified
                                ? "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40"
                                : "text-muted-foreground"
                            }
                          >
                            {verifyingId === l.id ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <BadgeCheck className="size-4" />
                            )}
                            <span className="sr-only">
                              {l.verified ? "Umakni overitev" : "Overi lokal"}
                            </span>
                          </Button>
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

// === TAB 3: NAROČNINE ===
type SubscriptionPlan = "free" | "premium" | "enterprise";
type SubscriptionStatus = "none" | "active" | "canceled" | "past_due";

interface AdminSubscription {
  id: string;
  businessName: string;
  name: string;
  email: string;
  plan: SubscriptionPlan;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: string | null;
  stripeCustomerId: string | null;
  createdAt: string;
  monthlyRevenue: number;
  daysUntilRenewal: number | null;
}

interface SubscriptionKpi {
  totalMrr: number;
  arr: number;
  activeCount: number;
  premiumCount: number;
  enterpriseCount: number;
  premiumMrr: number;
  enterpriseMrr: number;
  canceledCount: number;
  pastDueCount: number;
  noneCount: number;
  freeCount: number;
  totalOwners: number;
  churnRate: number;
}

const STATUS_LABELS_NAROCNINA: Record<SubscriptionStatus, string> = {
  active: "Aktivna",
  past_due: "Zapadlo plačilo",
  canceled: "Preklicana",
  none: "Brez naročnine",
};

function statusBadgeClass(status: SubscriptionStatus): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-900 border-emerald-200 hover:bg-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800";
    case "past_due":
      return "bg-red-100 text-red-900 border-red-200 hover:bg-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800";
    case "canceled":
      return "bg-muted text-muted-foreground border-border hover:bg-muted/80";
    default:
      return "bg-muted/60 text-muted-foreground border-border hover:bg-muted";
  }
}

function formatEur(amount: number): string {
  return new Intl.NumberFormat("sl-SI", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function SubscriptionsTab({ adminPassword }: { adminPassword: string }) {
  const [owners, setOwners] = React.useState<AdminSubscription[]>([]);
  const [kpi, setKpi] = React.useState<SubscriptionKpi | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [planFilter, setPlanFilter] = React.useState<"all" | SubscriptionPlan>(
    "all"
  );
  const [statusFilter, setStatusFilter] = React.useState<
    "all" | SubscriptionStatus
  >("all");

  // Edit dialog state
  const [editOpen, setEditOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AdminSubscription | null>(null);
  const [editPlan, setEditPlan] = React.useState<SubscriptionPlan>("free");
  const [editStatus, setEditStatus] =
    React.useState<SubscriptionStatus>("none");
  const [editEndsAt, setEditEndsAt] = React.useState<string>("");
  const [saving, setSaving] = React.useState(false);

  const fetchSubscriptions = React.useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/subscriptions", {
        headers: { "x-admin-password": adminPassword },
      });
      if (!res.ok) {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri pridobivanju naročnin";
        setErrorMsg(msg);
        return;
      }
      const data: unknown = await res.json();
      const list = (
        typeof data === "object" && data !== null && "owners" in data
          ? (data as Record<string, unknown>).owners
          : []) as AdminSubscription[];
      const k = (
        typeof data === "object" && data !== null && "kpi" in data
          ? (data as Record<string, unknown>).kpi
          : null) as SubscriptionKpi | null;
      setOwners(list);
      setKpi(k);
    } catch (err) {
      console.error("[admin/subscriptions] fetch:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
    } finally {
      setLoading(false);
    }
  }, [adminPassword]);

  React.useEffect(() => {
    fetchSubscriptions();
  }, [fetchSubscriptions]);

  const filtered = React.useMemo(() => {
    return owners.filter((o) => {
      if (planFilter !== "all" && o.plan !== planFilter) return false;
      if (statusFilter !== "all" && o.subscriptionStatus !== statusFilter)
        return false;
      return true;
    });
  }, [owners, planFilter, statusFilter]);

  const handleOpenEdit = (sub: AdminSubscription) => {
    setEditing(sub);
    setEditPlan(sub.plan);
    setEditStatus(sub.subscriptionStatus);
    setEditEndsAt(
      sub.subscriptionEndsAt
        ? new Date(sub.subscriptionEndsAt).toISOString().slice(0, 10)
        : ""
    );
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        plan: editPlan,
        subscriptionStatus: editStatus,
      };
      if (editEndsAt) {
        body.subscriptionEndsAt = new Date(editEndsAt).toISOString();
      } else {
        body.subscriptionEndsAt = null;
      }

      const res = await fetch(`/api/admin/subscriptions/${editing.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "x-admin-password": adminPassword,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d: unknown = await res.json();
        const msg =
          typeof d === "object" && d !== null && "error" in d
            ? String((d as Record<string, unknown>).error)
            : "Napaka pri shranjevanju";
        setErrorMsg(msg);
        return;
      }
      setEditOpen(false);
      setEditing(null);
      fetchSubscriptions();
    } catch (err) {
      console.error("[admin/subscriptions] save:", err);
      setErrorMsg("Napaka pri povezavi s strežnikom");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold tracking-tight">Naročnine</h2>
        <p className="text-sm text-muted-foreground">
          Pregled aktivnih naročnin, mesečnega prihodka (MRR) in churn-a.
        </p>
      </div>

      {errorMsg && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0 mt-0.5" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* KPI kartice */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 sm:p-5">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                  <span className="text-xs">Nalagam...</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : kpi ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <SubsKpiCard
            icon={<Banknote className="size-5" />}
            label="Skupni MRR"
            value={formatEur(kpi.totalMrr)}
            sub={`ARR: ${formatEur(kpi.arr)}/leto`}
            color="primary"
          />
          <SubsKpiCard
            icon={<CreditCard className="size-5" />}
            label="Aktivne naročnine"
            value={String(kpi.activeCount)}
            sub={`Od ${kpi.totalOwners} lastnikov`}
            color="emerald"
          />
          <SubsKpiCard
            icon={<Sparkles className="size-5" />}
            label="Premium"
            value={String(kpi.premiumCount)}
            sub={`${formatEur(kpi.premiumMrr)}/mes · €149/enota`}
            color="amber"
          />
          <SubsKpiCard
            icon={<Crown className="size-5" />}
            label="Enterprise"
            value={String(kpi.enterpriseCount)}
            sub={`${formatEur(kpi.enterpriseMrr)}/mes · €499/enota`}
            color="primary"
          />
        </div>
      ) : null}

      {/* Churn info banner */}
      {kpi && kpi.totalOwners > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="size-3.5" />
              Aktivne
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">
              {kpi.activeCount}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingDown className="size-3.5" />
              Churn rate
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">
              {kpi.churnRate}%
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <AlertCircle className="size-3.5" />
              Zapadla plačila
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">
              {kpi.pastDueCount}
            </div>
          </div>
          <div className="rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <X className="size-3.5" />
              Preklicane
            </div>
            <div className="text-lg font-bold tabular-nums mt-0.5">
              {kpi.canceledCount}
            </div>
          </div>
        </div>
      )}

      {/* Filtri */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Filter paketa</Label>
          <Select
            value={planFilter}
            onValueChange={(v) =>
              setPlanFilter(v as "all" | SubscriptionPlan)
            }
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vsi paketi</SelectItem>
              <SelectItem value="free">Free</SelectItem>
              <SelectItem value="premium">Premium</SelectItem>
              <SelectItem value="enterprise">Enterprise</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Filter statusa</Label>
          <Select
            value={statusFilter}
            onValueChange={(v) =>
              setStatusFilter(v as "all" | SubscriptionStatus)
            }
          >
            <SelectTrigger className="w-full sm:w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Vsi statusi</SelectItem>
              <SelectItem value="active">Aktivna</SelectItem>
              <SelectItem value="past_due">Zapadlo plačilo</SelectItem>
              <SelectItem value="canceled">Preklicana</SelectItem>
              <SelectItem value="none">Brez naročnine</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {(planFilter !== "all" || statusFilter !== "all") && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setPlanFilter("all");
              setStatusFilter("all");
            }}
            className="gap-1.5"
          >
            <X className="size-3.5" />
            Ponastavi
          </Button>
        )}
      </div>

      {/* Tabela */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Nalaganje naročnin...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <CreditCard className="size-8 mx-auto mb-2 opacity-50" />
              {owners.length === 0
                ? "Ni še lastnikov z naročninami."
                : "Ni naročnin, ki ustrezajo filtrom."}
            </div>
          ) : (
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Podjetje</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden lg:table-cell">Obnovitev</TableHead>
                    <TableHead className="text-right">MRR</TableHead>
                    <TableHead className="text-right">Akcije</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((o) => (
                    <TableRow key={o.id}>
                      <TableCell>
                        <div className="font-medium truncate max-w-[200px]">
                          {o.businessName || o.name}
                        </div>
                        <div className="text-xs text-muted-foreground md:hidden truncate max-w-[200px]">
                          {o.email}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                        {o.email}
                      </TableCell>
                      <TableCell>
                        <PlanBadge plan={o.plan} />
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          className={statusBadgeClass(o.subscriptionStatus)}
                        >
                          {STATUS_LABELS_NAROCNINA[o.subscriptionStatus]}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm">
                        {o.subscriptionEndsAt ? (
                          <div className="flex flex-col">
                            <span className="flex items-center gap-1">
                              <Calendar className="size-3 text-muted-foreground" />
                              {new Date(o.subscriptionEndsAt).toLocaleDateString(
                                "sl-SI",
                                {
                                  day: "2-digit",
                                  month: "2-digit",
                                  year: "numeric",
                                }
                              )}
                            </span>
                            {o.daysUntilRenewal !== null && (
                              <span className="text-xs text-muted-foreground mt-0.5">
                                čez {o.daysUntilRenewal}{" "}
                                {o.daysUntilRenewal === 1
                                  ? "dan"
                                  : o.daysUntilRenewal < 5
                                  ? "dneva"
                                  : "dni"}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {o.monthlyRevenue > 0
                          ? formatEur(o.monthlyRevenue)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleOpenEdit(o)}
                          aria-label={`Uredi naročnino za ${o.businessName || o.name}`}
                        >
                          <Pencil className="size-4" />
                          <span className="sr-only">Uredi</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Footer: skupni prihodek */}
      {!loading && kpi && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <DollarSign className="size-5 text-primary" />
            <div>
              <p className="text-sm font-semibold">Skupni letni prihodek (ARR)</p>
              <p className="text-xs text-muted-foreground">
                MRR × 12 = {formatEur(kpi.totalMrr)} × 12
              </p>
            </div>
          </div>
          <div className="text-2xl font-bold tabular-nums text-primary">
            {formatEur(kpi.arr)}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-right">
        {filtered.length} od {owners.length} lastnikov
      </div>

      {/* Edit dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Uredi naročnino</DialogTitle>
            <DialogDescription>
              Admin override za &laquo;{editing?.businessName || editing?.name}&raquo;.
              Spremembe se takoj sinhronizirajo z listings-i.
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="space-y-4 py-2">
              <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1">
                <div>
                  <span className="text-muted-foreground">Email:</span>{" "}
                  <span className="font-medium">{editing.email}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Stripe Customer:</span>{" "}
                  <span className="font-mono">
                    {editing.stripeCustomerId ?? "—"}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-plan">Paket</Label>
                <Select
                  value={editPlan}
                  onValueChange={(v) => setEditPlan(v as SubscriptionPlan)}
                >
                  <SelectTrigger id="edit-plan" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free (€0)</SelectItem>
                    <SelectItem value="premium">Premium (€149/mes)</SelectItem>
                    <SelectItem value="enterprise">
                      Enterprise (€499/mes)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-status">Status naročnine</Label>
                <Select
                  value={editStatus}
                  onValueChange={(v) =>
                    setEditStatus(v as SubscriptionStatus)
                  }
                >
                  <SelectTrigger id="edit-status" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Brez naročnine</SelectItem>
                    <SelectItem value="active">Aktivna</SelectItem>
                    <SelectItem value="past_due">Zapadlo plačilo</SelectItem>
                    <SelectItem value="canceled">Preklicana</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-endsat">
                  Datum obnovitve (prazno = brez)
                </Label>
                <Input
                  id="edit-endsat"
                  type="date"
                  value={editEndsAt}
                  onChange={(e) => setEditEndsAt(e.target.value)}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={saving}
            >
              Prekliči
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={saving}
              className="gap-1.5"
            >
              {saving ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Shranjujem...
                </>
              ) : (
                <>
                  <Check className="size-4" />
                  Shrani
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubsKpiCard({
  icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "primary" | "amber" | "emerald";
}) {
  const colorClasses: Record<typeof color, string> = {
    primary: "bg-primary/10 text-primary",
    amber: "bg-amber-100 text-amber-900",
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
              {value}
            </p>
            {sub && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate">
                {sub}
              </p>
            )}
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

// === TAB 4: STATISTIKA ===
function StatsTab({ adminPassword }: { adminPassword: string }) {
  const [listings, setListings] = React.useState<AdminListing[]>([]);
  const [leads, setLeads] = React.useState<Lead[]>([]);
  // B2C konzultacije (Faza 3c — model „ponudniki plačajo") — iz /api/admin/analytics
  const [consult, setConsult] = React.useState<{
    delivered: number;
    delivered30d: number;
    bookingsFromConsultations: number;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [lRes, leadsRes, analyticsRes] = await Promise.all([
          fetch("/api/admin/listings", {
            headers: { "x-admin-password": adminPassword },
          }),
          fetch("/api/admin/leads", {
            headers: { "x-admin-password": adminPassword },
          }),
          fetch("/api/admin/analytics", {
            headers: { "x-admin-password": adminPassword },
          }).catch(() => null),
        ]);
        const lData: unknown = await lRes.json();
        const leadsData: unknown = await leadsRes.json();
        const analyticsData = analyticsRes ? await analyticsRes.json().catch(() => null) : null;
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
        if (
          typeof analyticsData === "object" &&
          analyticsData !== null &&
          "consultations" in analyticsData
        ) {
          setConsult(
            (analyticsData as Record<string, unknown>).consultations as {
              delivered: number;
              delivered30d: number;
              bookingsFromConsultations: number;
            }
          );
        }
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

      {/* Beta status kartica */}
      <BetaStatusCard />

      {/* AI vpogledi — analiza statistike z AI */}
      <InsightsPanel type="admin" adminPassword={adminPassword} />

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

      {/* B2C konzultacije — brezplačna „Vprašaj lokalca" (Faza 3c —
          model „ponudniki plačajo", kot Booking.com: uporabnik ne plačuje) */}
      {consult ? (
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
            <MessageCircle className="size-4 text-primary" aria-hidden="true" />
            Osebne konzultacije (brezplačne — plačajo ponudniki)
          </h3>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MessageCircle className="size-3.5" />
                Dostavljene (skupaj)
              </div>
              <div className="text-lg font-bold tabular-nums mt-0.5">
                {consult.delivered}
              </div>
              <div className="text-[11px] text-muted-foreground">
                globoke osebne konzultacije
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <TrendingUp className="size-3.5" />
                Zadnjih 30 dni
              </div>
              <div className="text-lg font-bold tabular-nums mt-0.5">
                {consult.delivered30d}
              </div>
              <div className="text-[11px] text-muted-foreground">
                dostav v zadnjem mesecu
              </div>
            </div>
            <div className="rounded-lg border border-emerald-600/40 bg-emerald-600/10 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <CreditCard className="size-3.5" />
                Rezervacije iz konzultacij
              </div>
              <div className="text-lg font-bold tabular-nums mt-0.5">
                {consult.bookingsFromConsultations}
              </div>
              <div className="text-[11px] text-muted-foreground">
                atribuirane (Booking.source)
              </div>
            </div>
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Banknote className="size-3.5" />
                Model prihodka
              </div>
              <div className="text-sm font-bold mt-1">
                B2B — ponudniki
              </div>
              <div className="text-[11px] text-muted-foreground">
                uporabniki ne plačujejo (kot Booking)
              </div>
            </div>
          </div>
        </div>
      ) : null}

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

// === BETA STATUS WIDGET (na vrh dashboard-a) ===
interface BetaStatus {
  isActive: boolean;
  listingCount: number;
  remainingToMonetization: number;
  message: string;
  betaEndDate: string;
}

function useBetaStatus() {
  const [status, setStatus] = React.useState<BetaStatus | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/beta-status")
      .then((r) => r.json())
      .then((d: BetaStatus) => {
        if (!cancelled) {
          setStatus(d);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { status, loading };
}

function BetaStatusWidget() {
  const { status, loading } = useBetaStatus();

  if (loading) {
    return (
      <Card className="mb-6 border-amber-300/50">
        <CardContent className="p-5 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Nalagam beta status...</span>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const pct = Math.min(
    100,
    (status.listingCount / BETA_INFO.threshold) * 100
  );

  if (!status.isActive) {
    return (
      <Card className="mb-6 border-primary/40 bg-primary/5">
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Check className="size-6" aria-hidden="true" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <h3 className="text-base font-bold">Monetizacija aktivna</h3>
                <Badge className="bg-primary text-primary-foreground border-0 gap-1">
                  <ShieldCheck className="size-3" aria-hidden="true" />
                  BETA ZAKLJUČEN
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Dosegli smo {BETA_INFO.threshold} aktivnih lokalov in redni
                cenik je vklopljen. Beta uporabniki obdržijo svoje ugodnosti 6 mesecev.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6 border-amber-400/60 bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/30 dark:to-amber-900/10">
      <CardContent className="p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-start gap-4">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300">
            <Rocket className="size-6" aria-hidden="true" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <h3 className="text-base sm:text-lg font-bold text-amber-900 dark:text-amber-200">
                BETA AKTIVEN
              </h3>
              <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-0 gap-1">
                <Zap className="size-3 fill-amber-950" aria-hidden="true" />
                Vsi paketi BREZPLAČNI
              </Badge>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 mb-3">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                {status.listingCount} / {BETA_INFO.threshold} lokalov do monetizacije
              </p>
              <span className="hidden sm:inline text-amber-700/40">·</span>
              <p className="text-xs text-amber-700/90 dark:text-amber-300/80">
                Še {status.remainingToMonetization} {status.remainingToMonetization === 1 ? "lokal" : status.remainingToMonetization < 5 ? "lokala" : "lokalov"}
              </p>
            </div>

            <Progress
              value={pct}
              className="h-2.5 bg-amber-200/60 dark:bg-amber-900/40"
            />

            <p className="mt-3 text-xs text-amber-800/90 dark:text-amber-300/80 leading-relaxed">
              Ko dosežemo {BETA_INFO.threshold} lokalov, se monetizacija samodejno
              vklopi. Beta uporabniki obdržijo svoje ugodnosti 6 mesecev.
            </p>
          </div>

          <div className="hidden lg:flex flex-col items-center gap-1 shrink-0 rounded-xl bg-amber-200/40 dark:bg-amber-900/30 px-4 py-3 text-center">
            <Gift className="size-6 text-amber-700 dark:text-amber-300" aria-hidden="true" />
            <span className="text-xs font-semibold text-amber-900 dark:text-amber-200">
              Beta konča
            </span>
            <span className="text-xs text-amber-700 dark:text-amber-300">
              {status.betaEndDate}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// === BETA STATUS KOMPAKTNA KARTICA (v Statistika tab) ===
function BetaStatusCard() {
  const { status, loading } = useBetaStatus();

  if (loading) {
    return (
      <Card>
        <CardContent className="p-5 flex items-center gap-3 text-muted-foreground">
          <Loader2 className="size-5 animate-spin" aria-hidden="true" />
          <span className="text-sm">Nalagam beta status...</span>
        </CardContent>
      </Card>
    );
  }

  if (!status) return null;

  const pct = Math.min(
    100,
    (status.listingCount / BETA_INFO.threshold) * 100
  );

  return (
    <Card
      className={
        status.isActive
          ? "border-amber-300/60 bg-amber-50/70 dark:bg-amber-950/20"
          : "border-primary/40 bg-primary/5"
      }
    >
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Rocket
            className={
              status.isActive
                ? "size-4 text-amber-600"
                : "size-4 text-primary"
            }
            aria-hidden="true"
          />
          Beta status platforme
        </CardTitle>
        <CardDescription>
          {status.isActive
            ? "Beta obdobje je aktivno — vsi paketi so brezplačni."
            : "Monetizacija je vklopljena."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-muted-foreground">
            Lokalov na platformi
          </span>
          <span className="text-sm font-bold tabular-nums">
            {status.listingCount} / {BETA_INFO.threshold}
          </span>
        </div>
        <Progress
          value={pct}
          className={
            status.isActive
              ? "h-2 bg-amber-200/60 dark:bg-amber-900/40"
              : "h-2 bg-primary/20"
          }
        />
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">
            {status.isActive
              ? `Še ${status.remainingToMonetization} do monetizacije`
              : "Beta zaključen"}
          </span>
          {status.isActive ? (
            <Badge className="bg-amber-400 text-amber-950 hover:bg-amber-400 border-0 gap-1">
              <Zap className="size-3 fill-amber-950" aria-hidden="true" />
              BETA AKTIVEN
            </Badge>
          ) : (
            <Badge className="bg-primary text-primary-foreground border-0 gap-1">
              <Check className="size-3" aria-hidden="true" />
              MONETIZACIJA
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
          {status.message}
        </p>
      </CardContent>
    </Card>
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
