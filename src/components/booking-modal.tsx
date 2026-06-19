"use client";

import { useEffect, useRef, useState } from "react";
import { sl } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  Mail,
  Phone,
  Check,
  CheckCircle2,
  Loader2,
  CreditCard,
  MapPin,
  ArrowRight,
  ArrowLeft,
  User,
  StickyNote,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXPERIENCE_CATEGORY_ICONS,
  EXPERIENCE_CATEGORY_LABELS,
  formatPrice,
  formatDuration,
  type Experience,
} from "@/lib/marketplace-types";

interface BookingModalProps {
  experience: Experience | null;
  onClose: () => void;
}

type Step = 1 | 2 | "success";

interface BookingSuccess {
  bookingNumber: string;
  total: number;
  status: string;
  bookingDate: string;
  currency?: string;
  meetingPoint?: string | null;
  providerName?: string;
  providerEmail?: string;
}

interface BookingApiResponse {
  success: boolean;
  bookingNumber?: string;
  total?: number;
  status?: string;
  bookingDate?: string;
  currency?: string;
  meetingPoint?: string | null;
  providerName?: string;
  providerEmail?: string;
  error?: string;
}

// Slovensko formatiranje datuma
function formatDateSI(date: Date): string {
  return date.toLocaleDateString("sl-SI", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Današnji datum (očiščen ure)
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

// Datum + N dni
function datePlusDays(days: number): Date {
  const d = todayStart();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * BookingModal — 2-koračni rezervacijski modal za izkušnje.
 * Korak 1: izbira datuma in števila oseb + pregled cene.
 * Korak 2: kontaktne informacije + GDPR privolitev.
 * Success: potrditev rezervacije s številko in podrobnostmi.
 */
export function BookingModal({ experience, onClose }: BookingModalProps) {
  const [step, setStep] = useState<Step>(1);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [groupSize, setGroupSize] = useState<number>(1);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [gdprConsent, setGdprConsent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingSuccess | null>(null);

  // Reset stanja ko se modal odpre (experience gre null → non-null)
  const prevOpenRef = useRef(false);
  useEffect(() => {
    const isOpen = experience !== null;
    if (isOpen && !prevOpenRef.current) {
      setStep(1);
      setSelectedDate(undefined);
      setGroupSize(experience?.minGroupSize ?? 1);
      setGuestName("");
      setGuestEmail("");
      setGuestPhone("");
      setNotes("");
      setGdprConsent(false);
      setLoading(false);
      setError(null);
      setBooking(null);
    }
    prevOpenRef.current = isOpen;
  }, [experience]);

  const handleOpenChange = (open: boolean) => {
    if (!open) onClose();
  };

  // Skupna cena (client-side preview — server je source of truth)
  const pricePerPerson = experience?.pricePerPerson ?? 0;
  const currency = experience?.currency ?? "EUR";
  const total = Math.round(pricePerPerson * groupSize * 100) / 100;

  // Validacija korak 1
  const step1Valid = !!selectedDate;

  // Validacija korak 2
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail.trim());
  const step2Valid =
    guestName.trim().length >= 2 &&
    emailValid &&
    guestPhone.trim().length >= 5 &&
    gdprConsent;

  // Možne velikosti skupine
  const groupOptions: number[] = experience
    ? Array.from(
        { length: Math.max(1, experience.maxGroupSize - experience.minGroupSize + 1) },
        (_, i) => experience.minGroupSize + i
      )
    : [];

  // Potrdi in plačaj → POST na /api/bookings
  const handleSubmit = async () => {
    if (!experience || !selectedDate) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          experienceId: experience.id,
          experienceName: experience.name,
          pricePerPerson: experience.pricePerPerson,
          groupSize,
          bookingDate: selectedDate.toISOString(),
          guest: {
            name: guestName.trim(),
            email: guestEmail.trim(),
            phone: guestPhone.trim(),
            notes: notes.trim(),
          },
          provider: {
            name: experience.providerName,
            email: experience.providerEmail ?? "",
            meetingPoint: experience.meetingPoint ?? "",
          },
        }),
      });

      const data: BookingApiResponse = await res.json();

      if (!res.ok || !data.success) {
        setError(data.error ?? "Napaka pri rezervaciji. Poskusite znova.");
        return;
      }

      setBooking({
        bookingNumber: data.bookingNumber ?? "",
        total: data.total ?? total,
        status: data.status ?? "confirmed",
        bookingDate: data.bookingDate ?? selectedDate.toISOString(),
        currency: data.currency ?? currency,
        meetingPoint: data.meetingPoint ?? experience.meetingPoint ?? null,
        providerName: data.providerName ?? experience.providerName,
        providerEmail: data.providerEmail ?? experience.providerEmail ?? "",
      });
      setStep("success");
    } catch (err) {
      console.error("[booking] napaka:", err);
      setError("Omrežna napaka. Preverite povezavo in poskusite znova.");
    } finally {
      setLoading(false);
    }
  };

  if (!experience) {
    return (
      <Dialog open={false} onOpenChange={handleOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  return (
    <Dialog open={experience !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton
        className="max-h-[92vh] max-w-2xl gap-0 overflow-hidden p-0 sm:max-w-2xl"
        aria-describedby="booking-modal-desc"
      >
        <DialogTitle className="sr-only">
          Rezervacija izkušnje: {experience.name}
        </DialogTitle>
        <DialogDescription id="booking-modal-desc" className="sr-only">
          Dvokoračni postopek rezervacije: izberite datum in število oseb, nato
          vnesite kontaktne podatke za potrditev rezervacije.
        </DialogDescription>

        <div className="scroll-area-custom max-h-[90vh] overflow-y-auto">
          {/* Header s sliko */}
          <div className="relative aspect-[16/9] w-full overflow-hidden bg-muted">
            {experience.images[0] ? (
              <img
                src={experience.images[0]}
                alt={experience.name}
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
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />

            <Badge className="absolute left-4 top-4 bg-primary text-primary-foreground shadow-sm">
              <span aria-hidden="true">
                {EXPERIENCE_CATEGORY_ICONS[experience.category]}
              </span>
              {EXPERIENCE_CATEGORY_LABELS[experience.category]}
            </Badge>

            <div className="absolute bottom-0 left-0 right-0 p-5 text-white">
              <h2 className="text-xl font-bold leading-tight sm:text-2xl">
                {experience.name}
              </h2>
              {experience.destinationName ? (
                <p className="mt-1 flex items-center gap-1.5 text-sm text-white/90">
                  <MapPin className="size-3.5" aria-hidden="true" />
                  {experience.destinationName}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                <span className="flex items-center gap-1.5">
                  <Clock className="size-3.5" aria-hidden="true" />
                  {formatDuration(experience.durationHours)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="size-3.5" aria-hidden="true" />
                  {experience.minGroupSize}–{experience.maxGroupSize} oseb
                </span>
                <span className="flex items-baseline gap-1 font-semibold">
                  od
                  <span className="text-base">
                    {formatPrice(experience.pricePerPerson, experience.currency)}
                  </span>
                  / osebo
                </span>
              </div>
            </div>
          </div>

          {/* Vsebina po korakih */}
          <div className="p-5 sm:p-6">
            {/* Indikator koraka */}
            {step !== "success" ? (
              <div className="mb-5 flex items-center justify-center gap-2 text-xs">
                <StepBadge active={step === 1} number={1} label="Datum & skupina" />
                <span className="h-px w-6 bg-border" aria-hidden="true" />
                <StepBadge active={step === 2} number={2} label="Kontaktni podatki" />
              </div>
            ) : null}

            {/* === KORAK 1: Datum in skupina === */}
            {step === 1 ? (
              <div className="space-y-5">
                <p className="text-sm leading-relaxed text-foreground/90">
                  {experience.description}
                </p>

                <Separator />

                {/* Datum */}
                <div className="space-y-2">
                  <Label htmlFor="booking-date" className="flex items-center gap-1.5 text-sm font-medium">
                    <CalendarIcon className="size-4 text-primary" aria-hidden="true" />
                    Izberite datum
                  </Label>
                  <div className="flex justify-center rounded-lg border border-border/60 bg-muted/30 p-2">
                    <Calendar
                      id="booking-date"
                      mode="single"
                      locale={sl}
                      selected={selectedDate}
                      onSelect={setSelectedDate}
                      disabled={{ before: todayStart(), after: datePlusDays(90) }}
                      initialFocus
                      className="mx-auto"
                      aria-label="Izberite datum rezervacije"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Na voljo so datumi v naslednjih 90 dneh. Predhodni datumi niso
                    na voljo.
                  </p>
                </div>

                <Separator />

                {/* Število oseb */}
                <div className="space-y-2">
                  <Label htmlFor="booking-group" className="flex items-center gap-1.5 text-sm font-medium">
                    <Users className="size-4 text-primary" aria-hidden="true" />
                    Število oseb
                  </Label>
                  {groupOptions.length > 1 ? (
                    <Select
                      value={String(groupSize)}
                      onValueChange={(v) => setGroupSize(Number(v))}
                    >
                      <SelectTrigger id="booking-group" className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {groupOptions.map((n) => (
                          <SelectItem key={n} value={String(n)}>
                            {n} {n === 1 ? "oseba" : n < 5 ? "osebe" : "oseb"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      id="booking-group"
                      type="number"
                      value={groupSize}
                      min={experience.minGroupSize}
                      max={experience.maxGroupSize}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        if (Number.isFinite(v)) {
                          const clamped = Math.min(
                            Math.max(v, experience.minGroupSize),
                            experience.maxGroupSize
                          );
                          setGroupSize(clamped);
                        }
                      }}
                    />
                  )}
                  <p className="text-xs text-muted-foreground">
                    Minimalno {experience.minGroupSize}, maksimalno{" "}
                    {experience.maxGroupSize} oseb.
                  </p>
                </div>

                <Separator />

                {/* Pregled cene */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatPrice(pricePerPerson, currency)} × {groupSize}{" "}
                      {groupSize === 1 ? "oseba" : groupSize < 5 ? "osebe" : "oseb"}
                    </span>
                    <span className="font-medium tabular-nums">
                      {formatPrice(total, currency)}
                    </span>
                  </div>
                  <Separator className="my-3" />
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">Skupaj</span>
                    <span className="text-xl font-bold text-primary tabular-nums">
                      {formatPrice(total, currency)}
                    </span>
                  </div>
                </div>

                {/* CTA */}
                <Button
                  type="button"
                  size="lg"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={!step1Valid}
                  onClick={() => setStep(2)}
                >
                  Nadaljuj
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            ) : null}

            {/* === KORAK 2: Kontaktni podatki === */}
            {step === 2 ? (
              <div className="space-y-5">
                {/* Pregled rezervacije */}
                <div className="rounded-lg border border-border/60 bg-muted/30 p-4">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    <CheckCircle2 className="size-4 text-primary" aria-hidden="true" />
                    Pregled rezervacije
                  </h3>
                  <dl className="mt-3 space-y-1.5 text-sm">
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Izkušnja</dt>
                      <dd className="text-right font-medium">{experience.name}</dd>
                    </div>
                    {selectedDate ? (
                      <div className="flex justify-between gap-3">
                        <dt className="text-muted-foreground">Datum</dt>
                        <dd className="text-right font-medium capitalize">
                          {formatDateSI(selectedDate)}
                        </dd>
                      </div>
                    ) : null}
                    <div className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">Število oseb</dt>
                      <dd className="text-right font-medium">
                        {groupSize} {groupSize === 1 ? "oseba" : groupSize < 5 ? "osebe" : "oseb"}
                      </dd>
                    </div>
                    <Separator className="my-2" />
                    <div className="flex justify-between gap-3">
                      <dt className="font-semibold">Skupaj</dt>
                      <dd className="text-right text-base font-bold text-primary tabular-nums">
                        {formatPrice(total, currency)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {/* Kontaktne informacije */}
                <div className="space-y-4">
                  <h3 className="text-sm font-semibold">Kontaktne informacije</h3>

                  <div className="space-y-2">
                    <Label htmlFor="guest-name" className="flex items-center gap-1.5 text-sm font-medium">
                      <User className="size-4 text-primary" aria-hidden="true" />
                      Ime in priimek
                      <span className="text-destructive" aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="guest-name"
                      type="text"
                      autoComplete="name"
                      required
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="Janez Novak"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="guest-email" className="flex items-center gap-1.5 text-sm font-medium">
                        <Mail className="size-4 text-primary" aria-hidden="true" />
                        Email
                        <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Input
                        id="guest-email"
                        type="email"
                        autoComplete="email"
                        required
                        value={guestEmail}
                        onChange={(e) => setGuestEmail(e.target.value)}
                        placeholder="janez@primer.si"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="guest-phone" className="flex items-center gap-1.5 text-sm font-medium">
                        <Phone className="size-4 text-primary" aria-hidden="true" />
                        Telefon
                        <span className="text-destructive" aria-hidden="true">*</span>
                      </Label>
                      <Input
                        id="guest-phone"
                        type="tel"
                        autoComplete="tel"
                        required
                        value={guestPhone}
                        onChange={(e) => setGuestPhone(e.target.value)}
                        placeholder="+386 31 234 567"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="guest-notes" className="flex items-center gap-1.5 text-sm font-medium">
                      <StickyNote className="size-4 text-primary" aria-hidden="true" />
                      Posebne želje (neobvezno)
                    </Label>
                    <Textarea
                      id="guest-notes"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Alergije, prehranske potrebe, posebna prilagoditev..."
                      className="min-h-20"
                    />
                  </div>
                </div>

                {/* GDPR privolitev */}
                <label
                  htmlFor="gdpr-consent"
                  className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 p-3 transition-colors hover:bg-accent/40"
                >
                  <Checkbox
                    id="gdpr-consent"
                    checked={gdprConsent}
                    onCheckedChange={(v) => setGdprConsent(v === true)}
                    className="mt-0.5"
                  />
                  <span className="text-xs leading-relaxed text-muted-foreground">
                    Strinjam se s pogoji rezervacije in obdelavo osebnih podatkov
                    za namen izvedbe rezervacije. Podatki bodo posredovani ponudniku
                    izkušnje.
                  </span>
                </label>

                {/* Napaka */}
                {error ? (
                  <Alert variant="destructive">
                    <AlertCircle className="size-4" aria-hidden="true" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ) : null}

                {/* CTA */}
                <div className="flex flex-col gap-2 sm:flex-row-reverse">
                  <Button
                    type="button"
                    size="lg"
                    className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={!step2Valid || loading}
                    onClick={() => void handleSubmit()}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        Obdelava rezervacije...
                      </>
                    ) : (
                      <>
                        <CreditCard className="size-4" aria-hidden="true" />
                        Potrdi in plačaj · {formatPrice(total, currency)}
                      </>
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="lg"
                    disabled={loading}
                    onClick={() => setStep(1)}
                  >
                    <ArrowLeft className="size-4" aria-hidden="true" />
                    Nazaj
                  </Button>
                </div>
              </div>
            ) : null}

            {/* === SUCCESS === */}
            {step === "success" && booking ? (
              <SuccessView
                booking={booking}
                experience={experience}
                onClose={onClose}
              />
            ) : null}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* Pomožne komponente */

function StepBadge({
  active,
  number,
  label,
}: {
  active: boolean;
  number: number;
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={`flex size-6 items-center justify-center rounded-full text-xs font-bold transition-colors ${
          active
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground"
        }`}
        aria-hidden="true"
      >
        {number}
      </span>
      <span
        className={`text-xs font-medium ${
          active ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

function SuccessView({
  booking,
  experience,
  onClose,
}: {
  booking: BookingSuccess;
  experience: Experience;
  onClose: () => void;
}) {
  const date = new Date(booking.bookingDate);
  const currency = booking.currency ?? experience.currency;

  return (
    <div className="space-y-5 text-center">
      <div className="flex flex-col items-center gap-3 py-2">
        <span className="flex size-16 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-9" aria-hidden="true" />
        </span>
        <h3 className="text-xl font-bold text-foreground">
          Rezervacija uspešna!
        </h3>
        <p className="text-sm text-muted-foreground">
          Vaša rezervacija je potrjena. Potrditveni email je poslan na vaš
          naslov.
        </p>
      </div>

      {/* Številka rezervacije */}
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">
          Številka rezervacije
        </p>
        <p className="mt-1 font-mono text-xl font-bold tracking-tight text-primary">
          {booking.bookingNumber}
        </p>
      </div>

      {/* Podrobnosti */}
      <div className="space-y-2 rounded-lg border border-border/60 bg-muted/30 p-4 text-left">
        <DetailRow
          icon={<MapPin className="size-4 text-primary" />}
          label="Izkušnja"
          value={experience.name}
        />
        <DetailRow
          icon={<CalendarIcon className="size-4 text-primary" />}
          label="Datum"
          value={formatDateSI(date)}
        />
        <DetailRow
          icon={<Clock className="size-4 text-primary" />}
          label="Ura"
          value="Po dogovoru s ponudnikom"
        />
        {booking.meetingPoint ? (
          <DetailRow
            icon={<MapPin className="size-4 text-primary" />}
            label="Točka srečanja"
            value={booking.meetingPoint}
          />
        ) : null}
        <DetailRow
          icon={<Users className="size-4 text-primary" />}
          label="Skupaj"
          value={`${formatPrice(booking.total, currency)} (${booking.status === "confirmed" ? "potrjeno" : booking.status})`}
        />
      </div>

      {/* Kontakt ponudnika */}
      {booking.providerEmail ? (
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Mail className="size-3.5" aria-hidden="true" />
          <span>
            Ponudnik: <span className="font-medium text-foreground">{booking.providerName}</span>
          </span>
        </div>
      ) : null}

      <div className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
        <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
        <span>Varne rezervacije · I Feel Slovenia</span>
      </div>

      <Button
        type="button"
        size="lg"
        className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
        onClick={onClose}
      >
        <Check className="size-4" aria-hidden="true" />
        Zapri
      </Button>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-2.5 text-sm">
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        <div className="font-medium text-foreground">{value}</div>
      </div>
    </div>
  );
}

export default BookingModal;
