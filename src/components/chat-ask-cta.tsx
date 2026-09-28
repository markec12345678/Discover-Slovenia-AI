"use client";

import { MessageCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { openChatWithQuestion } from "@/lib/chat-ask";
import { trackPlannerEvent } from "@/lib/planner-analytics";

// ============================================================================
// W9 (Issue #15, 1.130.0): KONTEKSTUALNI CTA "VSEBINA → KLEPET"
// ============================================================================
// Trip Planner AIjev najmočnejši akvizicijski vzorec, preveden v naš kanon:
// pas/gumb v vsebini destinacijskih strani odpre AI klepet s PRED-IZPOLNJENIM
// vprašanjem. Vprašanje je VIDNO TU (pas ga izpiše) in VIDNO v klepetu
// (vnosno polje) — uporabnik ga lahko uredi/izbriše in SAM odloči, kdaj ga
// pošlje. Nobenega samodejnega pošiljanja (ZERO FEATURE LOSS varovalo).
//
// Strežniška stran poda OBA niza (label + question) prevedena v jeziku
// strani (getTranslations "chatAsk") — ta komponenta je jezikovno slepa.
//
// VARIANTI:
//  - "band"  (privzeto): širok pas pod hero-jem / v razdelku — ikona +
//             oznaka + izpisano vprašanje + puščica (transparentnost: točno
//             to vprašanje se bo izpolnilo).
//  - "inline": kompaktne tipka v kartici (guide persona) — ikona + oznaka;
//             vprašanje se izpolni v klepetu.
//
// W4 (Issue #15, 1.134.0): nov površinski vrednosti "hero-seasonal" (sezonski
// pas domače strani) + neobvezen prop `season` — isti dogodek
// chat_ask_cta_clicked (že v strežniški whitelisti, NIČ novih imen), z
// dodatnim propom za segmentacijo po sezoni (KPI W4: sezonski CTA klik).
// Površina "hero" (destinacijske strani) ostaja nespremenjena.
// ============================================================================

export type ChatAskSurface =
  | "hero"
  | "hero-seasonal"
  | "guide"
  | "best-time"
  | "things-to-do"
  | "itinerary";

export function ChatAskCta({
  question,
  label,
  variant = "band",
  surface,
  season,
  className,
}: {
  /** Pred-izpolnjeno vprašanje (jezik strani, strežniško sestavljeno). */
  question: string;
  /** Oznaka CTA (npr. "Vprašaj AI o Bled"). */
  label: string;
  /** "band" = širok pas z izpisanim vprašanjem; "inline" = kompaktne tipka. */
  variant?: "band" | "inline";
  /** Telemetrija: kje v lijaku se je klik zgodil. */
  surface: ChatAskSurface;
  /** W4: sezona sezonskega pasu (hero-seasonal) — samo telemetrija,
   *  ne vpliva na obnašanje. */
  season?: string;
  className?: string;
}) {
  const q = question.trim().slice(0, 500);

  function handleClick() {
    trackPlannerEvent("chat_ask_cta_clicked", {
      surface,
      question_len: q.length,
      ...(season ? { season } : {}),
    });
    openChatWithQuestion(q);
  }

  if (variant === "inline") {
    return (
      <button
        type="button"
        onClick={handleClick}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary transition-colors hover:border-primary/50 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          className
        )}
        aria-label={`${label}: ${q}`}
      >
        <MessageCircle className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{label}</span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group flex w-full items-center gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 text-left transition-colors hover:border-primary/45 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:gap-4 sm:p-5",
        className
      )}
      aria-label={`${label}: ${q}`}
    >
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary/15 sm:size-11"
      >
        <MessageCircle className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-foreground">
          {label}
        </span>
        <span className="mt-0.5 block truncate text-sm text-muted-foreground">
          {q}
        </span>
      </span>
      <ArrowRight
        className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary sm:size-5"
        aria-hidden="true"
      />
    </button>
  );
}
