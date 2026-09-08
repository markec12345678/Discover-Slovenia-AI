"use client";

import { useState, useCallback } from "react";
import {
  Calendar,
  Users,
  Clock,
  Check,
  Loader2,
  Sparkles,
  Phone,
  X,
  Mail,
  Send,
  RotateCcw,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";

// ============================================================================
// AI BOOKING ASSISTANT — povpraševanje ponudniku (nič več simulacija!)
// ============================================================================
//
// Uporabnik izpolni povpraševanje → POST /api/listing-inquiry
// → ponudnik prejme e-pošto, uporabnik prejme potrditev + referenco.
//
// "AI ne samo svetuje, ampak uredi."
// ============================================================================

interface BookingAssistantProps {
  listingName: string;
  listingId: string;
  partnerStatus?: PartnerStatus;
  matchScore?: number;
  className?: string;
  trigger?: "button" | "inline";
}

type BookingStep = "idle" | "form" | "sending" | "success";

interface BookingData {
  date: string;
  time: string;
  partySize: number;
  name: string;
  email: string;
  phone: string;
  notes: string;
}

const TIME_SLOTS = ["11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "14:00", "18:00", "18:30", "19:00", "19:30", "20:00"];

export function BookingAssistant({
  listingName,
  listingId,
  partnerStatus,
  matchScore = 0,
  className,
  trigger = "button",
}: BookingAssistantProps) {
  const [step, setStep] = useState<BookingStep>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reference, setReference] = useState<string | null>(null);
  const [booking, setBooking] = useState<BookingData>({
    date: "",
    time: "",
    partySize: 2,
    name: "",
    email: "",
    phone: "",
    notes: "",
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const handleStart = useCallback(() => {
    setErrorMessage(null);
    setReference(null);
    setBooking((prev) => ({ ...prev, date: prev.date || tomorrowStr }));
    setStep("form");
  }, [tomorrowStr]);

  const handleConfirm = useCallback(async () => {
    if (step === "sending") return;
    setStep("sending");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/listing-inquiry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId,
          name: booking.name,
          email: booking.email,
          phone: booking.phone,
          date: booking.date || undefined,
          time: booking.time || undefined,
          groupSize: booking.partySize,
          notes: booking.notes || undefined,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        success?: boolean;
        reference?: string;
        error?: string;
      } | null;

      if (!res.ok || !data?.success) {
        // Napaka — obrazec ostane izpolnjen, uporabnik lahko popravil
        throw new Error(data?.error || "Pošiljanje povpraševanja ni uspelo — poskusi znova.");
      }

      setReference(data.reference ?? null);
      setStep("success");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Pošiljanje povpraševanja ni uspelo — poskusi znova."
      );
      setStep("form");
    }
  }, [step, listingId, booking]);

  const handleReset = useCallback(() => {
    // "Novo povpraševanje" — počisti obrazec in začni znova
    setBooking({
      date: tomorrowStr,
      time: "",
      partySize: 2,
      name: "",
      email: "",
      phone: "",
      notes: "",
    });
    setErrorMessage(null);
    setReference(null);
    setStep("form");
  }, [tomorrowStr]);

  const canConfirm =
    booking.date && booking.time && booking.name.trim() && booking.email.trim() && booking.phone.trim();

  // === IDLE: Trigger button ===
  if (step === "idle") {
    if (trigger === "inline") {
      return (
        <button
          type="button"
          onClick={handleStart}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 hover:shadow-md",
            className
          )}
        >
          <Sparkles className="size-3.5" aria-hidden="true" />
          Pošlji povpraševanje
        </button>
      );
    }

    return (
      <Button
        onClick={handleStart}
        className={cn("gap-1.5", className)}
        size="sm"
      >
        <Sparkles className="size-3.5" aria-hidden="true" />
        Pošlji povpraševanje
      </Button>
    );
  }

  // === FORM / SENDING / SUCCESS: Modal overlay ===
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <CardContent className="p-6">
          {/* Close */}
          {step !== "success" && step !== "sending" && (
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Zapri"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}

          {/* === SUCCESS === */}
          {step === "success" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30">
                  <Check className="size-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold">Povpraševanje poslano ponudniku!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Potrditev smo ti poslali na e-poštno. Ponudnik te bo kontaktiral v 24 h.
                </p>
              </div>

              {reference && (
                <div className="rounded-xl bg-muted/50 p-3">
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    Referenčna številka
                  </p>
                  <p className="font-mono text-sm font-bold text-primary">{reference}</p>
                </div>
              )}

              <div className="rounded-xl bg-muted/50 p-4 text-left space-y-2">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-primary" aria-hidden="true" />
                  <span>{new Date(booking.date).toLocaleDateString("sl-SI", { weekday: "long", day: "numeric", month: "long" })}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-primary" aria-hidden="true" />
                  <span>{booking.time}</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Users className="size-4 text-primary" aria-hidden="true" />
                  <span>{booking.partySize} oseb</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="size-4 text-primary" aria-hidden="true" />
                  <span>{booking.phone}</span>
                </div>
              </div>

              <Button
                className="w-full"
                onClick={handleReset}
              >
                <RotateCcw className="size-4 mr-1" aria-hidden="true" />
                Novo povpraševanje
              </Button>
              <button
                type="button"
                onClick={() => setStep("idle")}
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                Zapri
              </button>
            </div>
          )}

          {/* === SENDING === */}
          {step === "sending" && (
            <div className="text-center space-y-4 py-8" role="status" aria-live="polite">
              <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-lg font-bold">Pošiljam povpraševanje…</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Tvoje povpraševanje posredujemo ponudniku {listingName}
                </p>
              </div>
            </div>
          )}

          {/* === FORM === */}
          {step === "form" && (
            <div className="space-y-4">
              {/* Header */}
              <div className="flex items-center gap-2">
                <div className="flex size-10 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="size-5 text-primary" aria-hidden="true" />
                </div>
                <div>
                  <h3 className="text-base font-bold">AI Booking Assistant</h3>
                  <p className="text-xs text-muted-foreground">{listingName}</p>
                </div>
                {partnerStatus && partnerStatus !== "standard" && (
                  <PartnerBadge status={partnerStatus} size="sm" className="ml-auto" />
                )}
              </div>

              {/* Match score */}
              {matchScore > 0 && (
                <div className="flex items-center gap-1.5 rounded-lg bg-primary/5 border border-primary/20 px-3 py-1.5">
                  <Sparkles className="size-3 text-primary" aria-hidden="true" />
                  <span className="text-xs font-bold text-primary">{matchScore}% AI MATCH</span>
                </div>
              )}

              {/* Napaka — obrazec ostane izpolnjen */}
              {errorMessage && (
                <div
                  role="alert"
                  className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                >
                  {errorMessage}
                </div>
              )}

              {/* Date */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Calendar className="inline size-3 mr-1" aria-hidden="true" />
                  Datum
                </label>
                <Input
                  type="date"
                  value={booking.date}
                  min={tomorrowStr}
                  onChange={(e) => setBooking({ ...booking, date: e.target.value })}
                  className="text-sm"
                />
              </div>

              {/* Time slots */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Clock className="inline size-3 mr-1" aria-hidden="true" />
                  Čas
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {TIME_SLOTS.map((slot) => (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setBooking({ ...booking, time: slot })}
                      aria-pressed={booking.time === slot}
                      className={cn(
                        "rounded-lg border py-2 text-xs font-medium transition-all",
                        booking.time === slot
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border/60 hover:border-primary/30"
                      )}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>

              {/* Party size */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Users className="inline size-3 mr-1" aria-hidden="true" />
                  Število oseb
                </label>
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Zmanjšaj število oseb"
                    onClick={() => setBooking({ ...booking, partySize: Math.max(1, booking.partySize - 1) })}
                  >
                    −
                  </Button>
                  <span className="text-lg font-bold w-8 text-center" aria-live="polite">{booking.partySize}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    aria-label="Povečaj število oseb"
                    onClick={() => setBooking({ ...booking, partySize: Math.min(20, booking.partySize + 1) })}
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Name + Phone */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label htmlFor="booking-name" className="text-xs font-medium text-muted-foreground mb-1.5 block">Ime</label>
                  <Input
                    id="booking-name"
                    type="text"
                    autoComplete="name"
                    placeholder="Janez Novak"
                    value={booking.name}
                    onChange={(e) => setBooking({ ...booking, name: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label htmlFor="booking-phone" className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefon</label>
                  <Input
                    id="booking-phone"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+386 30 123 456"
                    value={booking.phone}
                    onChange={(e) => setBooking({ ...booking, phone: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Email */}
              <div>
                <label htmlFor="booking-email" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  <Mail className="inline size-3 mr-1" aria-hidden="true" />
                  E-pošta (za potrditev)
                </label>
                <Input
                  id="booking-email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="tvoj@email.si"
                  value={booking.email}
                  onChange={(e) => setBooking({ ...booking, email: e.target.value })}
                  className="text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label htmlFor="booking-notes" className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Posebne želje (opcijsko)
                </label>
                <Input
                  id="booking-notes"
                  type="text"
                  placeholder="Alergije, otroški stol, otrok rojstni dan..."
                  value={booking.notes}
                  onChange={(e) => setBooking({ ...booking, notes: e.target.value })}
                  className="text-sm"
                />
              </div>

              {/* Confirm */}
              <Button
                className="w-full gap-1.5"
                disabled={!canConfirm}
                onClick={handleConfirm}
              >
                <Send className="size-4" aria-hidden="true" />
                Pošlji povpraševanje
              </Button>

              <p className="text-center text-[10px] text-muted-foreground">
                Povpraševanje posredujemo ponudniku, ki te bo kontaktiral za potrditev — brez posrednikov, brez provizij.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
