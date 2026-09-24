"use client";

// ============================================================================
// ODPIRALNI ČASI — STATUS ŽETON OPEN/CLOSED/UNKNOWN (Issue #4 §9, val 1)
// ============================================================================
// Skupni žeton za VSE površine, ki danes kažejo SUROV niz ur (Go Mode
// naslednja kartica + seznam, journey-planner kartice). Nič ne izgubimo:
// surov niz vira ostane viden, žeton doda le POŠTENO resnico "zdaj".
//
// HIDRACIJSKA VARNOST (kanonski React vzorec): "zdaj" je odvisno od ure
// izvedbe — branjem prek useSyncExternalStore strežniški izris vrne null
// (ni žetona), klient pa svoj snapshot → ni hydration mismatch in ni
// setState v efektu. Snapshot je referenčno stabilen (cache po nizu +
// 10-minutni košček — statusi ur so minutno-zrnati, 10 min svežina je
// poštena tudi za dolgo odprto GO površino).
// ============================================================================

import { useSyncExternalStore } from "react";
import { DoorClosed, DoorOpen, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  openingStatusNow,
  type OpeningStatusResult,
} from "@/lib/opening-hours";

const L = {
  chip: {
    open: { sl: "ZDAJ ODPRTO", en: "OPEN NOW" },
    closed: { sl: "ZDAJ ZAPRTO", en: "CLOSED NOW" },
    unknown: { sl: "URA NEZNANA", en: "HOURS UNKNOWN" },
  },
} as const;

const CHIP_CLASS: Record<string, string> = {
  OPEN: "border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  CLOSED:
    "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-50 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  UNKNOWN: "text-muted-foreground",
};

const CHIP_ICON = {
  OPEN: DoorOpen,
  CLOSED: DoorClosed,
  UNKNOWN: HelpCircle,
} as const;

// ── Snapshot cache (referenčna stabilnost + 10-minutna svežina) ────────────

const SNAPSHOT_FRESH_MS = 10 * 60 * 1000;
const snapshotCache = new Map<string, { at: number; result: OpeningStatusResult }>();

/** Prazna naročnina — vrednost je "izračun ob branju" (ne zunanji vir). */
const emptySubscribe = () => () => {};

function clientSnapshot(raw: string): OpeningStatusResult {
  const bucket = Math.floor(Date.now() / SNAPSHOT_FRESH_MS);
  const key = `${bucket}:${raw}`;
  const cached = snapshotCache.get(key);
  if (cached) return cached.result;
  let result: OpeningStatusResult;
  try {
    result = openingStatusNow(raw);
  } catch {
    result = { status: "UNKNOWN", detail: { sl: "ura trenutno ni znana", en: "hours currently unknown" } };
  }
  if (snapshotCache.size > 256) snapshotCache.clear();
  snapshotCache.set(key, { at: bucket, result });
  return result;
}

export interface OpeningHoursStatusProps {
  /** Surov niz odpiralnih ur vira (OSM opening_hours / Listing.openingHours). */
  raw: string | null | undefined;
  lang: "sl" | "en";
  /** Ali izrisati tudi surov niz (privzeto da — zero feature loss). */
  showRaw?: boolean;
  className?: string;
}

export function OpeningHoursStatus({
  raw,
  lang,
  showRaw = true,
  className,
}: OpeningHoursStatusProps) {
  // Strežnik: null (brez žetona — identičen izris za hidracijo);
  // klient: status ob trenutni stenski uri v Sloveniji.
  const status = useSyncExternalStore(
    emptySubscribe,
    () => (raw ? clientSnapshot(raw) : null),
    () => null
  );

  if (!raw) return null;
  const Icon = status ? CHIP_ICON[status.status] : HelpCircle;

  return (
    <span
      className={cn(
        "inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {status ? (
        <>
          <Badge
            variant="outline"
            className={cn(
              "gap-1 px-1.5 py-0 text-[10px] font-semibold",
              CHIP_CLASS[status.status]
            )}
          >
            <Icon className="size-3" aria-hidden="true" />
            {
              L.chip[
                status.status.toLowerCase() as "open" | "closed" | "unknown"
              ][lang]
            }
          </Badge>
          <span className="whitespace-nowrap">{status.detail[lang]}</span>
        </>
      ) : null}
      {showRaw ? (
        <span className="truncate" title={raw}>
          {raw}
        </span>
      ) : null}
    </span>
  );
}
