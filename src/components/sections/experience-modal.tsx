"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import {
  Star,
  MapPin,
  Clock,
  Users,
  Phone,
  Mail,
  Globe,
  ExternalLink,
  CheckCircle2,
  Eye,
  Calendar,
  Baby,
  Accessibility,
  Sparkles,
  Compass,
  Languages,
  Lightbulb,
  Loader2,
  AlertCircle,
  User,
  Send,
  RotateCcw,
  Info,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { trackFunnel } from "@/lib/funnel";
import {
  EXPERIENCE_CATEGORY_LABELS,
  EXPERIENCE_CATEGORY_ICONS,
  LANGUAGE_LABELS,
  formatPrice,
  formatDuration,
  type Experience,
} from "@/lib/marketplace-types";

interface ExperienceModalProps {
  experience: Experience | null;
  onClose: () => void;
  /** Opcijsko: zamenja trenutno izkušnjo (uporablja "Morda vam je všeč"). */
  onSelect?: (experience: Experience) => void;
}

interface RecommendationsResponse {
  experiences: Experience[];
  total: number;
  source?: "ai" | "fallback" | "cache";
}

/* =============================================================
 * Rezervacijski flow (POST /api/bookings)
 * ============================================================= */

type BookingPhase = "idle" | "form" | "sending" | "success";

interface BookingFormValues {
  date: string;
  groupSize: string;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

type BookingFieldErrors = Partial<
  Record<"date" | "groupSize" | "name" | "email" | "phone", string>
>;

interface BookingSuccessData {
  bookingNumber: string;
  total: number;
  currency: string;
  bookingDate: string;
  meetingPoint: string | null;
  providerName: string;
  providerEmail: string;
  status: string;
}

interface BookingResponse {
  success?: boolean;
  error?: string;
  bookingNumber?: string;
  total?: number;
  status?: string;
  bookingDate?: string;
  currency?: string;
  meetingPoint?: string | null;
  providerName?: string;
  providerEmail?: string;
}

/** Lokalni datum kot "YYYY-MM-DD" (brez UTC zamika). */
function toLocalDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** "YYYY-MM-DD" → lokalni Date ob polnoči (null, če neveljaven). */
function parseLocalDate(s: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** ISO datum iz strežnika → slovenski dolgi zapis (brez UTC zamika dneva). */
function formatBookingDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  const d = m
    ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    : new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * ExperienceModal — podrobnosti izkušnje iz tržnice.
 * Prikazuje sliko, opis, trajanje, skupino, jezike, kontakt ponudnika in CTA.
 * Primarni CTA "Rezerviraj termin" odpre rezervacijski obrazec, ki pošlje
 * PRAVO rezervacijo prek POST /api/bookings (demo mode → takoj potrjena).
 * "Pri ponudniku" je sekundarna povezava na ponudnikovo spletno stran.
 * Na dnu je "Morda vam je všeč" z 4 podobnimi izkušnjami.
 */
export function ExperienceModal({
  experience,
  onClose,
  onSelect,
}: ExperienceModalProps) {
  const [activeImage, setActiveImage] = useState(0);
  // Faza rezervacije (za skritje X gumba med pošiljanjem — kot checkout-modal)
  const [bookingPhase, setBookingPhase] = useState<BookingPhase>("idle");

  // Reset aktivne slike in rezervacije, ko se spremeni izkušnja
  // (render-phase check, brez effect-a)
  const prevExpId = useRef<string | undefined>(undefined);
  if (prevExpId.current !== experience?.id) {
    prevExpId.current = experience?.id;
    if (activeImage !== 0) {
      setActiveImage(0);
    }
    if (bookingPhase !== "idle") {
      setBookingPhase("idle");
    }
  }

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Priporočila — pridobi ko se experience spremeni.
  const [recommendations, setRecommendations] = useState<Experience[]>([]);
  const [recLoading, setRecLoading] = useState(false);
  const [recError, setRecError] = useState<boolean>(false);
  const [recSource, setRecSource] = useState<"ai" | "fallback" | "cache">("ai");

  const fetchRecommendations = useCallback(async (experienceId: string) => {
    setRecLoading(true);
    setRecError(false);
    try {
      const res = await fetch(
        `/api/recommendations/experiences?experienceId=${encodeURIComponent(
          experienceId
        )}&limit=4`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error("Napaka pri priporočilih");
      const data: RecommendationsResponse = await res.json();
      setRecommendations(data.experiences ?? []);
      setRecSource(data.source ?? "fallback");
    } catch {
      setRecError(true);
      setRecommendations([]);
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    if (experience?.id) {
      fetchRecommendations(experience.id);
    } else {
      setRecommendations([]);
      setRecError(false);
    }
  }, [experience?.id, fetchRecommendations, experience]);

  if (!experience) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const image =
    experience.images[activeImage] ?? experience.images[0];

  // Pretvori jezikovne kode v slovenska imena
  const languagesDisplay = experience.languages
    .map((l) => LANGUAGE_LABELS[l] ?? l.toUpperCase())
    .join(", ");

  return (
    <Dialog open={experience !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={bookingPhase !== "sending"}
        className="max-h-[90vh] max-w-3xl gap-0 overflow-hidden p-0 sm:max-w-3xl"
        aria-describedby="experience-modal-desc"
      >
        <DialogTitle className="sr-only">{experience.name}</DialogTitle>
        <DialogDescription id="experience-modal-desc" className="sr-only">
          Podrobnosti izkušnje {experience.name}: opis, cena, trajanje, skupina,
          kontakt ponudnika in možnost rezervacije.
        </DialogDescription>

        <div className="scroll-area-custom max-h-[88vh] overflow-y-auto">
          {/* Velika slika */}
          <div className="relative aspect-video w-full overflow-hidden bg-muted">
            {image ? (
              <img
                src={image}
                alt={`${experience.name} — slika ${activeImage + 1}`}
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex size-full items-center justify-center text-5xl">
                <span aria-hidden="true">
                  {EXPERIENCE_CATEGORY_ICONS[experience.category]}
                </span>
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

            {/* Badge kategorije */}
            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground shadow-sm">
              <span aria-hidden="true">
                {EXPERIENCE_CATEGORY_ICONS[experience.category]}
              </span>
              {EXPERIENCE_CATEGORY_LABELS[experience.category]}
            </Badge>

            {/* Featured badge */}
            {experience.featured ? (
              <Badge className="absolute right-4 top-4 bg-amber-400 text-amber-950 shadow-sm">
                <Sparkles className="size-3" aria-hidden="true" />
                Izpostavljeno
              </Badge>
            ) : null}

            {/* Trajanje badge */}
            <Badge className="absolute bottom-4 right-4 bg-background/90 text-foreground backdrop-blur-sm">
              <Clock className="size-3" aria-hidden="true" />
              {formatDuration(experience.durationHours)}
            </Badge>

            {/* Ime + lokacija */}
            <div className="absolute bottom-0 left-0 p-5 text-white">
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-bold sm:text-3xl">
                  {experience.name}
                </h2>
                {experience.verified ? (
                  <CheckCircle2
                    className="size-5 text-primary"
                    aria-label="Overjena izkušnja"
                  />
                ) : null}
              </div>
              {experience.destinationName ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {experience.destinationName}
                </p>
              ) : null}
            </div>
          </div>

          {/* Thumbnail strip (če več slik) */}
          {experience.images.length > 1 ? (
            <div className="flex gap-2 overflow-x-auto border-b border-border/60 bg-muted/30 p-3">
              {experience.images.map((img, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveImage(idx)}
                  aria-label={`Prikaži sliko ${idx + 1}`}
                  aria-pressed={idx === activeImage}
                  className={`relative size-16 shrink-0 overflow-hidden rounded-md border-2 transition-all ${
                    idx === activeImage
                      ? "border-primary ring-2 ring-primary/30"
                      : "border-transparent opacity-70 hover:opacity-100"
                  }`}
                >
                  <img
                    src={img}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                </button>
              ))}
            </div>
          ) : null}

          {/* Vsebina */}
          <div className="space-y-6 p-5 sm:p-6">
            {/* Rating + cena */}
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-1.5">
                <Star
                  className="size-4 fill-amber-400 text-amber-400"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold tabular-nums">
                  {experience.rating.toFixed(1)}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({experience.reviewCount} mnenj)
                </span>
              </div>

              <div className="text-right">
                <div className="text-xs text-muted-foreground">od</div>
                <div className="text-2xl font-bold text-foreground">
                  {formatPrice(
                    experience.pricePerPerson,
                    experience.currency
                  )}
                </div>
                <div className="text-xs text-muted-foreground">/ osebo</div>
              </div>
            </div>

            {/* Kratek opis */}
            <p className="text-sm leading-relaxed text-foreground/90">
              {experience.description}
            </p>

            {/* Long description */}
            {experience.longDescription ? (
              <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                <p className="text-sm leading-relaxed text-foreground/80">
                  {experience.longDescription}
                </p>
              </div>
            ) : null}

            {/* Grid 2x2 info */}
            <div className="grid grid-cols-2 gap-3">
              <InfoItem
                icon={Clock}
                label="Trajanje"
                value={formatDuration(experience.durationHours)}
              />
              <InfoItem
                icon={Users}
                label="Skupina"
                value={`${experience.minGroupSize}–${experience.maxGroupSize} oseb`}
              />
              <InfoItem
                icon={Languages}
                label="Jeziki"
                value={languagesDisplay || "—"}
              />
              <InfoItem
                icon={MapPin}
                label="Lokacija"
                value={experience.destinationName ?? "—"}
              />
            </div>

            {/* Meeting point */}
            {experience.meetingPoint ? (
              <section>
                <h3 className="flex items-center gap-2 text-sm font-semibold">
                  <Compass className="size-4 text-primary" aria-hidden="true" />
                  Točka srečanja
                </h3>
                <div className="mt-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                  <p className="flex items-start gap-2 text-sm text-foreground/80">
                    <MapPin
                      className="mt-0.5 size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                    <span>{experience.meetingPoint}</span>
                  </p>
                  {experience.address ? (
                    <p className="mt-2 pl-6 text-xs text-muted-foreground">
                      {experience.address}
                    </p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {/* Atributi */}
            <section>
              <h3 className="text-sm font-semibold">Atributi</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {experience.familyFriendly ? (
                  <Badge className="bg-primary text-primary-foreground">
                    <Baby className="size-3" aria-hidden="true" />
                    Družinsko prijazno
                  </Badge>
                ) : null}
                {experience.accessibility ? (
                  <Badge variant="secondary">
                    <Accessibility
                      className="size-3"
                      aria-hidden="true"
                    />
                    Dostopno za invalide
                  </Badge>
                ) : null}
                {experience.featured ? (
                  <Badge className="bg-amber-400 text-amber-950">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Izpostavljeno
                  </Badge>
                ) : null}
              </div>
            </section>

            {/* Kontakt ponudnika */}
            <section>
              <h3 className="flex items-center gap-2 text-sm font-semibold">
                <Users className="size-4 text-primary" aria-hidden="true" />
                Ponudnik
              </h3>
              <div className="mt-3 space-y-2">
                <p className="text-sm font-medium">{experience.providerName}</p>
                <div className="flex flex-wrap gap-2">
                  {experience.providerPhone ? (
                    <a
                      href={`tel:${experience.providerPhone.replace(/\s/g, "")}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Phone className="size-4 text-primary" aria-hidden="true" />
                      {experience.providerPhone}
                    </a>
                  ) : null}
                  {experience.providerEmail ? (
                    <a
                      href={`mailto:${experience.providerEmail}`}
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Mail className="size-4 text-primary" aria-hidden="true" />
                      {experience.providerEmail}
                    </a>
                  ) : null}
                  {experience.providerWebsite ? (
                    <a
                      href={experience.providerWebsite}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-background px-3 py-2 text-sm transition-colors hover:bg-accent hover:text-accent-foreground"
                    >
                      <Globe className="size-4 text-primary" aria-hidden="true" />
                      Spletna stran
                      <ExternalLink className="size-3" aria-hidden="true" />
                    </a>
                  ) : null}
                </div>
              </div>
            </section>

            {/* Statistika */}
            <section className="grid grid-cols-2 gap-3">
              <StatCard
                icon={Eye}
                label="Ogledov"
                value={experience.viewCount.toLocaleString("sl-SI")}
              />
              <StatCard
                icon={Calendar}
                label="Rezervacij"
                value={experience.bookingCount.toLocaleString("sl-SI")}
              />
            </section>

            {/* Rezervacija — PRAVA rezervacija prek POST /api/bookings
                (demo mode ustvari potrjeno rezervacijo) + sekundarna
                povezava do ponudnikove spletne strani */}
            <BookingSection
              key={experience.id}
              experience={experience}
              onPhaseChange={setBookingPhase}
            />

            {/* Morda vam je všeč — AI priporočila */}
            <RecommendationsSection
              loading={recLoading}
              error={recError}
              items={recommendations}
              currentId={experience.id}
              onSelect={onSelect}
              source={recSource}
            />

            {/* Source note */}
            <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
              <Compass className="size-3" aria-hidden="true" />
              Vir: Lokalni ponudnik
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Pomožne komponente */

function InfoItem({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof MapPin;
  label: string;
  value: string;
}) {
  return (
    <Card className="gap-0 py-3">
      <CardContent className="px-3">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          <span className="text-[11px] uppercase tracking-wide">{label}</span>
        </div>
        <div className="mt-1 text-sm font-semibold text-foreground">{value}</div>
      </CardContent>
    </Card>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Eye;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border/60 bg-muted/30 p-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="text-sm font-semibold tabular-nums">{value}</div>
      </div>
    </div>
  );
}

/* =============================================================
 * BookingSection — rezervacijski flow znotraj modala
 * =============================================================
 *
 * idle:    primarni CTA "Rezerviraj termin" + sekundarni "Pri ponudniku"
 * form:    obrazec (datum, št. oseb, ime, e-pošta, telefon, opombe)
 * sending: obrazec zaklenjen, gumb kaže Loader2
 * success: potrjevalni pogled (številka, cena, datum, srečanje, ponudnik)
 *
 * Ceno in kontakt ponudnika določi strežnik iz baze — client poslani
 * `provider` podatki so le fallback. Client validacija zrcali strežnik.
 */
function BookingSection({
  experience,
  onPhaseChange,
}: {
  experience: Experience;
  onPhaseChange?: (phase: BookingPhase) => void;
}) {
  const idPrefix = useId();

  // Mejne vrednosti skupine — spoštuj min/maxGroupSize izkušnje,
  // zamiljene smešne vrednosti (0, >100, min > max)
  const minGroup = Math.max(1, Math.min(experience.minGroupSize || 1, 100));
  const maxGroup = Math.max(
    minGroup,
    Math.min(experience.maxGroupSize || 100, 100)
  );
  const defaultGroupSize = Math.min(Math.max(2, minGroup), maxGroup);

  // Datum — input dovoljuje od jutri naprej, validacija >= danes
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = toLocalDateStr(tomorrow);

  const [phase, setPhaseState] = useState<BookingPhase>("idle");
  const [errors, setErrors] = useState<BookingFieldErrors>({});
  const [apiError, setApiError] = useState<string | null>(null);
  const [success, setSuccess] = useState<BookingSuccessData | null>(null);
  const [form, setForm] = useState<BookingFormValues>({
    date: "",
    groupSize: String(defaultGroupSize),
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  const setPhase = (p: BookingPhase) => {
    setPhaseState(p);
    onPhaseChange?.(p);
  };

  // === Client validacija (zrcala strežniško) ===
  const validate = (): BookingFieldErrors => {
    const next: BookingFieldErrors = {};

    if (!form.date.trim()) {
      next.date = "Izberite datum rezervacije.";
    } else {
      const parsed = parseLocalDate(form.date);
      if (!parsed) {
        next.date = "Neveljaven datum rezervacije.";
      } else if (parsed < today) {
        next.date = "Datum rezervacije mora biti danes ali pozneje.";
      }
    }

    const gs = Number(form.groupSize.trim());
    if (
      !form.groupSize.trim() ||
      !Number.isInteger(gs) ||
      gs < 1 ||
      gs > 100
    ) {
      next.groupSize = "Vnesite veljavno število oseb.";
    } else if (gs < minGroup || gs > maxGroup) {
      next.groupSize = `Med ${minGroup} in ${maxGroup} oseb.`;
    }

    if (form.name.trim().length < 2) {
      next.name = "Vnesite ime in priimek (vsaj 2 znaka).";
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Vnesite veljaven e-poštni naslov.";
    }

    if (form.phone.trim().length < 5) {
      next.phone = "Vnesite telefonsko številko (vsaj 5 znakov).";
    }

    return next;
  };

  // === Submit → POST /api/bookings ===
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (phase === "sending") return;

    setApiError(null);
    const next = validate();
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setPhase("sending");
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience.id,
          groupSize: Number(form.groupSize.trim()),
          bookingDate: form.date,
          guest: {
            name: form.name.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            notes: form.notes.trim(),
          },
          // Fallback za strežnik — ceno/kontakt prebere iz baze
          provider: {
            name: experience.providerName,
            email: experience.providerEmail ?? undefined,
            meetingPoint: experience.meetingPoint ?? undefined,
          },
        }),
      });

      const data = (await res.json().catch(() => null)) as BookingResponse | null;
      if (!res.ok || !data?.success) {
        throw new Error(data?.error || "Rezervacija ni uspela — poskusite znova.");
      }

      const gs = Number(form.groupSize.trim());
      setSuccess({
        bookingNumber: data.bookingNumber ?? "—",
        total:
          typeof data.total === "number"
            ? data.total
            : Math.round(experience.pricePerPerson * gs * 100) / 100,
        currency: data.currency ?? experience.currency,
        bookingDate: data.bookingDate ?? form.date,
        meetingPoint: data.meetingPoint ?? null,
        providerName: data.providerName ?? experience.providerName,
        providerEmail: data.providerEmail ?? experience.providerEmail ?? "",
        status: data.status ?? "confirmed",
      });
      setPhase("success");
      trackFunnel("experience_booked");
    } catch (err) {
      setApiError(
        err instanceof Error
          ? err.message
          : "Rezervacija ni uspela — poskusite znova."
      );
      setPhase("form");
    }
  };

  // === "Nova rezervacija" — reset obrazca ===
  const handleReset = () => {
    setForm({
      date: "",
      groupSize: String(defaultGroupSize),
      name: "",
      email: "",
      phone: "",
      notes: "",
    });
    setErrors({});
    setApiError(null);
    setSuccess(null);
    setPhase("form");
  };

  // === Stepper za število oseb ===
  const stepGroupSize = (delta: number) => {
    const current = Number.parseInt(form.groupSize, 10);
    const base = Number.isNaN(current) ? defaultGroupSize : current;
    const next = Math.min(maxGroup, Math.max(minGroup, base + delta));
    setForm((prev) => ({ ...prev, groupSize: String(next) }));
  };

  const currentGs = Number.parseInt(form.groupSize, 10);
  const canDecrease = !Number.isNaN(currentGs) && currentGs > minGroup;
  const canIncrease = !Number.isNaN(currentGs) && currentGs < maxGroup;

  // Živi prikaz skupne cene
  const totalPreview = Number.isNaN(currentGs)
    ? null
    : Math.round(experience.pricePerPerson * currentGs * 100) / 100;

  const update =
    (field: keyof BookingFormValues) =>
    (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  /* --- IDLE: primarni CTA + sekundarna povezava --- */
  if (phase === "idle") {
    return (
      <section aria-label="Rezervacija izkušnje" className="space-y-2">
        <Button
          type="button"
          size="lg"
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={() => {
            setApiError(null);
            setPhase("form");
          }}
        >
          <Calendar className="size-4" aria-hidden="true" />
          Rezerviraj termin
        </Button>
        {experience.providerWebsite ? (
          <Button type="button" asChild size="lg" variant="outline" className="w-full gap-2">
            <a
              href={experience.providerWebsite}
              target="_blank"
              rel="noopener noreferrer sponsored"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Pri ponudniku
            </a>
          </Button>
        ) : (
          <Button type="button" size="lg" variant="outline" className="w-full gap-2" disabled>
            <Globe className="size-4" aria-hidden="true" />
            Ponudnik nima spletne strani
          </Button>
        )}
      </section>
    );
  }

  /* --- SUCCESS: potrjevalni pogled (slog SuccessView iz checkout-modala) --- */
  if (phase === "success" && success) {
    return (
      <section
        aria-label="Rezervacija potrjena"
        role="status"
        className="flex flex-col items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-5 text-center sm:p-6"
      >
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-9" aria-hidden="true" />
        </span>

        <div>
          <h3 className="text-xl font-bold text-foreground">
            Rezervacija potrjena!
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Številko rezervacije shranite — vam bo v pomoč pri komunikaciji s
            ponudnikom.
          </p>
        </div>

        <div className="w-full rounded-lg border border-border/60 bg-background p-4 text-left">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Številka rezervacije</span>
            <span className="font-mono font-bold text-foreground">
              {success.bookingNumber}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Skupaj</span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPrice(success.total, success.currency)}
            </span>
          </div>
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Datum</span>
            <span className="font-medium text-foreground">
              {formatBookingDate(success.bookingDate)}
            </span>
          </div>
          {success.meetingPoint ? (
            <>
              <Separator className="my-3" />
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">Srečanje</span>
                <span className="text-right font-medium text-foreground">
                  {success.meetingPoint}
                </span>
              </div>
            </>
          ) : null}
          {success.providerName ? (
            <>
              <Separator className="my-3" />
              <div className="flex items-start justify-between gap-3 text-sm">
                <span className="shrink-0 text-muted-foreground">Ponudnik</span>
                <span className="min-w-0 text-right">
                  <span className="block font-medium text-foreground">
                    {success.providerName}
                  </span>
                  {success.providerEmail ? (
                    <a
                      href={`mailto:${success.providerEmail}`}
                      className="text-xs text-primary hover:underline"
                    >
                      {success.providerEmail}
                    </a>
                  ) : null}
                </span>
              </div>
            </>
          ) : null}
          <Separator className="my-3" />
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Status</span>
            <Badge className="bg-primary text-primary-foreground">
              {success.status === "confirmed" ? "Potrjena" : success.status}
            </Badge>
          </div>
        </div>

        <Button
          type="button"
          size="lg"
          onClick={handleReset}
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Nova rezervacija
        </Button>
      </section>
    );
  }

  /* --- FORM / SENDING: obrazec (med pošiljanjem zaklenjen) --- */
  const sending = phase === "sending";

  return (
    <section
      aria-label="Rezervacija izkušnje"
      className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5"
    >
      {/* Vrh: izkušnja + preklic */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <Calendar className="size-4 text-primary" aria-hidden="true" />
            Podatki za rezervacijo
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {experience.name} ·{" "}
            {formatPrice(experience.pricePerPerson, experience.currency)} /
            osebo
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPhase("idle")}
          disabled={sending}
          className="shrink-0 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          Prekliči
        </button>
      </div>

      {/* Napaka iz API-ja — obrazec ostane izpolnjen */}
      {apiError ? (
        <div
          role="alert"
          className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{apiError}</span>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} noValidate className="mt-4 space-y-4">
        {/* Datum + število oseb */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label
              htmlFor={`${idPrefix}-date`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Calendar className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Datum
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-date`}
              type="date"
              value={form.date}
              min={tomorrowStr}
              disabled={sending}
              required
              aria-invalid={!!errors.date}
              aria-describedby={
                errors.date ? `${idPrefix}-date-error` : undefined
              }
              onChange={update("date")}
            />
            {errors.date ? (
              <p
                id={`${idPrefix}-date-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.date}
              </p>
            ) : null}
          </div>

          <div>
            <Label
              htmlFor={`${idPrefix}-group`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Users className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Število oseb
              <span className="text-destructive">*</span>
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Zmanjšaj število oseb"
                disabled={sending || !canDecrease}
                onClick={() => stepGroupSize(-1)}
              >
                <span aria-hidden="true">−</span>
              </Button>
              <Input
                id={`${idPrefix}-group`}
                type="number"
                inputMode="numeric"
                className="w-20 text-center tabular-nums"
                min={minGroup}
                max={maxGroup}
                step={1}
                value={form.groupSize}
                disabled={sending}
                required
                aria-invalid={!!errors.groupSize}
                aria-describedby={
                  errors.groupSize
                    ? `${idPrefix}-group-error`
                    : `${idPrefix}-group-hint`
                }
                onChange={update("groupSize")}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-9 shrink-0"
                aria-label="Povečaj število oseb"
                disabled={sending || !canIncrease}
                onClick={() => stepGroupSize(1)}
              >
                <span aria-hidden="true">+</span>
              </Button>
              <span
                id={`${idPrefix}-group-hint`}
                className="text-xs text-muted-foreground"
              >
                {minGroup}–{maxGroup} oseb
              </span>
            </div>
            {errors.groupSize ? (
              <p
                id={`${idPrefix}-group-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.groupSize}
              </p>
            ) : null}
          </div>
        </div>

        {/* Ime + telefon */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <Label
              htmlFor={`${idPrefix}-name`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <User className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Ime in priimek
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-name`}
              type="text"
              autoComplete="name"
              placeholder="Janez Novak"
              value={form.name}
              disabled={sending}
              required
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? `${idPrefix}-name-error` : undefined}
              onChange={update("name")}
            />
            {errors.name ? (
              <p
                id={`${idPrefix}-name-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.name}
              </p>
            ) : null}
          </div>

          <div>
            <Label
              htmlFor={`${idPrefix}-phone`}
              className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
            >
              <Phone className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Telefon
              <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`${idPrefix}-phone`}
              type="tel"
              autoComplete="tel"
              placeholder="+386 41 234 567"
              value={form.phone}
              disabled={sending}
              required
              aria-invalid={!!errors.phone}
              aria-describedby={
                errors.phone ? `${idPrefix}-phone-error` : undefined
              }
              onChange={update("phone")}
            />
            {errors.phone ? (
              <p
                id={`${idPrefix}-phone-error`}
                className="mt-1 text-xs text-destructive"
              >
                {errors.phone}
              </p>
            ) : null}
          </div>
        </div>

        {/* E-pošta */}
        <div>
          <Label
            htmlFor={`${idPrefix}-email`}
            className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
          >
            <Mail className="size-3.5 text-muted-foreground" aria-hidden="true" />
            E-pošta
            <span className="text-destructive">*</span>
          </Label>
          <Input
            id={`${idPrefix}-email`}
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ime@primer.si"
            value={form.email}
            disabled={sending}
            required
            aria-invalid={!!errors.email}
            aria-describedby={errors.email ? `${idPrefix}-email-error` : undefined}
            onChange={update("email")}
          />
          {errors.email ? (
            <p
              id={`${idPrefix}-email-error`}
              className="mt-1 text-xs text-destructive"
            >
              {errors.email}
            </p>
          ) : null}
        </div>

        {/* Opombe (opcijsko) */}
        <div>
          <Label
            htmlFor={`${idPrefix}-notes`}
            className="mb-1.5 flex items-center gap-1.5 text-sm font-medium"
          >
            Opombe (opcijsko)
          </Label>
          <Textarea
            id={`${idPrefix}-notes`}
            rows={3}
            placeholder="Alergije, želje glede termina, jezik vodenja …"
            value={form.notes}
            disabled={sending}
            onChange={update("notes")}
          />
        </div>

        {/* Živi prikaz skupne cene */}
        {totalPreview !== null ? (
          <div
            className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background px-3 py-2.5 text-sm"
            aria-live="polite"
          >
            <span className="text-muted-foreground">
              {currentGs} {currentGs === 1 ? "oseba" : "oseb"} ×{" "}
              {formatPrice(experience.pricePerPerson, experience.currency)}
            </span>
            <span className="font-bold tabular-nums text-foreground">
              {formatPrice(totalPreview, experience.currency)}
            </span>
          </div>
        ) : null}

        <Button
          type="submit"
          size="lg"
          disabled={sending}
          className="w-full gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          {sending ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Rezerviram…
            </>
          ) : (
            <>
              <Send className="size-4" aria-hidden="true" />
              Potrdi rezervacijo
            </>
          )}
        </Button>

        {/* Screen-reader status med pošiljanjem */}
        <p className="sr-only" role="status" aria-live="polite">
          {sending ? "Rezervacija se pošilja, prosimo počakajte." : ""}
        </p>

        {/* Demo opomba (iskrena — kot v checkout modalu) + zasebnost */}
        <div className="flex items-start gap-2 rounded-lg border border-amber-300/60 bg-amber-50 p-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-400/40 dark:bg-amber-950/30 dark:text-amber-100">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            Demo način: rezervacija se takoj potrdi, plačila se ne zaračuna.
            Ko dodamo prave Stripe ključe, se bo vklopilo spletno plačilo.
          </span>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">
          Podatke uporabimo izključno za izvedbo rezervacije.
        </p>
      </form>
    </section>
  );
}

/**
 * RecommendationsSection — "Morda vam je všeč".
 * Prikazuje do 4 AI-priporočene podobne izkušnje (GLM izbere iz 10 kandidatov).
 * Klik na kartico zamenja trenutno izkušnjo v modalu (preko onSelect).
 * `source` prikaže transparenten badge (AI / fallback / cache).
 */
function RecommendationsSection({
  loading,
  error,
  items,
  currentId,
  onSelect,
  source,
}: {
  loading: boolean;
  error: boolean;
  items: Experience[];
  currentId: string;
  onSelect?: (experience: Experience) => void;
  source?: "ai" | "fallback" | "cache";
}) {
  const visible = items.filter((e) => e.id !== currentId).slice(0, 4);
  const isAI = source === "ai" || source === "cache";
  const sourceLabel = isAI ? "AI" : "Podobni";

  if (loading) {
    return (
      <section aria-label="Morda vam je všeč">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Lightbulb className="size-4 text-primary" aria-hidden="true" />
          Morda vam je všeč
          <Badge variant="secondary" className="ml-auto gap-1 text-[10px]">
            <Sparkles className="size-2.5" aria-hidden="true" />
            AI
          </Badge>
        </h3>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="overflow-hidden rounded-lg border border-border/60"
            >
              <Skeleton className="aspect-square w-full" />
              <div className="space-y-1.5 p-2">
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (error || visible.length === 0) return null;

  return (
    <section aria-label="Morda vam je všeč">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-primary" aria-hidden="true" />
        Morda vam je všeč
        <Badge
          variant={isAI ? "default" : "secondary"}
          className="ml-auto gap-1 text-[10px]"
          title={isAI ? "AI (GLM) je izbral ta priporočila" : "Podobne izkušnje (fallback)"}
        >
          {isAI ? <Sparkles className="size-2.5" aria-hidden="true" /> : null}
          {sourceLabel}
        </Badge>
      </h3>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visible.map((e) => {
          const img = e.images[0];
          return (
            <button
              key={e.id}
              type="button"
              onClick={() => onSelect?.(e)}
              className="group flex flex-col overflow-hidden rounded-lg border border-border/60 bg-background text-left transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              aria-label={`Odpri ${e.name}`}
            >
              <div className="relative aspect-square w-full overflow-hidden bg-muted">
                {img ? (
                  <img
                    src={img}
                    alt={e.name}
                    className="size-full object-cover transition-transform group-hover:scale-105"
                    loading="lazy"
                  />
                ) : (
                  <div className="flex size-full items-center justify-center text-3xl">
                    <span aria-hidden="true">
                      {EXPERIENCE_CATEGORY_ICONS[e.category]}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-1 flex-col gap-1 p-2">
                <h4 className="line-clamp-1 text-xs font-semibold">
                  {e.name}
                </h4>
                <div className="mt-auto flex items-center justify-between gap-1">
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    <Star
                      className="size-3 fill-amber-400 text-amber-400"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">{e.rating.toFixed(1)}</span>
                  </span>
                  <span className="text-xs font-bold text-foreground">
                    {formatPrice(e.pricePerPerson, e.currency)}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export default ExperienceModal;
