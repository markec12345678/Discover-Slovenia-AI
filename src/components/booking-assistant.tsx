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
  PartyPopper,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { PartnerBadge, type PartnerStatus } from "@/components/partner-badge";

// ============================================================================
// AI BOOKING ASSISTANT — konverzacijska rezervacija
// ============================================================================
//
// "AI ne samo svetuje, ampak uredi."
//
// Uporabnik: "Rezerviraj kosilo za 4 osebe jutri ob 13:00"
// AI: Gostilna Bela Krajina — 13:00 ✅ — [Potrdi rezervacijo]
// ============================================================================

interface BookingAssistantProps {
  listingName: string;
  listingId: string;
  partnerStatus?: PartnerStatus;
  matchScore?: number;
  className?: string;
  trigger?: "button" | "inline";
}

type BookingStep = "idle" | "form" | "confirming" | "confirmed";

interface BookingData {
  date: string;
  time: string;
  partySize: number;
  name: string;
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
  const [booking, setBooking] = useState<BookingData>({
    date: "",
    time: "",
    partySize: 2,
    name: "",
    phone: "",
    notes: "",
  });

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  const handleStart = useCallback(() => {
    setBooking((prev) => ({ ...prev, date: tomorrowStr }));
    setStep("form");
  }, [tomorrowStr]);

  const handleConfirm = useCallback(async () => {
    setStep("confirming");
    // Simulate booking (v produkciji: pošlji na /api/bookings)
    await new Promise((r) => setTimeout(r, 2000));

    // Track booking event
    try {
      await fetch("/api/listings/" + listingId + "/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "lead", source: "booking_assistant" }),
      });
    } catch {}

    setStep("confirmed");
  }, [listingId]);

  const canConfirm = booking.date && booking.time && booking.name && booking.phone;

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
          Rezerviraj z AI
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
        Rezerviraj z AI
      </Button>
    );
  }

  // === FORM / CONFIRMING / CONFIRMED: Modal overlay ===
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
      <Card className="w-full max-w-md animate-in zoom-in-95 slide-in-from-bottom-4 duration-300">
        <CardContent className="p-6">
          {/* Close */}
          {step !== "confirmed" && (
            <button
              type="button"
              onClick={() => setStep("idle")}
              className="absolute right-4 top-4 rounded-full p-1.5 text-muted-foreground hover:bg-muted"
              aria-label="Zapri"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          )}

          {/* === CONFIRMED === */}
          {step === "confirmed" && (
            <div className="text-center space-y-4">
              <div className="flex justify-center">
                <div className="flex size-16 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950/30">
                  <PartyPopper className="size-8 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
                </div>
              </div>
              <div>
                <h3 className="text-lg font-bold">Rezervacija potrjena!</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {listingName} je obveščen o tvojem povpraševanju. Kontaktiraj ga direktno za potrditev.
                </p>
              </div>
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
              <p className="text-xs text-muted-foreground">
                Ponudnik te bo kontaktiral za potrditev. Za spremembe pokliči direktno.
              </p>
              <Button
                className="w-full"
                onClick={() => setStep("idle")}
              >
                <Check className="size-4 mr-1" aria-hidden="true" />
                Zaključi
              </Button>
            </div>
          )}

          {/* === CONFIRMING === */}
          {step === "confirming" && (
            <div className="text-center space-y-4 py-8">
              <Loader2 className="mx-auto size-10 animate-spin text-primary" aria-hidden="true" />
              <div>
                <h3 className="text-lg font-bold">AI potrjuje rezervacijo...</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Kontakiram {listingName}
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
                    onClick={() => setBooking({ ...booking, partySize: Math.max(1, booking.partySize - 1) })}
                  >
                    −
                  </Button>
                  <span className="text-lg font-bold w-8 text-center">{booking.partySize}</span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="size-8"
                    onClick={() => setBooking({ ...booking, partySize: Math.min(20, booking.partySize + 1) })}
                  >
                    +
                  </Button>
                </div>
              </div>

              {/* Name + Phone */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Ime</label>
                  <Input
                    type="text"
                    placeholder="Janez Novak"
                    value={booking.name}
                    onChange={(e) => setBooking({ ...booking, name: e.target.value })}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Telefon</label>
                  <Input
                    type="tel"
                    placeholder="+386 30 123 456"
                    value={booking.phone}
                    onChange={(e) => setBooking({ ...booking, phone: e.target.value })}
                    className="text-sm"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Posebne želje (opcijsko)
                </label>
                <Input
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
                <Check className="size-4" aria-hidden="true" />
                Potrdi rezervacijo
              </Button>

              <p className="text-center text-[10px] text-muted-foreground">
                AI te poveže z ponudnikom. Rezervacijo opraviš direktno pri njem — brez posrednikov, brez provizij.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
